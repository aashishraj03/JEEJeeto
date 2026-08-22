const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const { requireAuth, requireAdmin } = require('../middleware');

const FREE_TEST_KEYS = [
  'jee-main-2026-apr-02-shift-2',
  'main-2024-jan-shift1',
  'mock'
];

// 1. Fetch Questions by Test Key (With Gating)
router.get('/questions/:key', async (req, res) => {
  try {
    const testKey = req.params.key;

    // Free test check
    if (FREE_TEST_KEYS.includes(testKey)) {
      const result = await db.query('SELECT * FROM questions WHERE test_key = $1', [testKey]);
      return res.json(result.rows);
    }

    // Paid test check
    const token = req.cookies?.token;
    if (!token) {
      return res.status(403).json({ error: 'LOCKED', message: 'Subscription required for this test.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Session expired or invalid.' });
    }

    const userId = decoded.id || decoded.userId;
    const subCheck = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND expires_at > NOW()',
      [userId]
    );

    if (subCheck.rows.length === 0) {
      return res.status(403).json({ error: 'LOCKED', message: 'Subscription required for this test.' });
    }

    const result = await db.query('SELECT * FROM questions WHERE test_key = $1', [testKey]);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch questions error:', err);
    res.status(500).json({ error: 'Failed to fetch questions.' });
  }
});

// 2. Add Question (Strict Admin Only)
router.post('/questions', requireAdmin, async (req, res) => {
  try {
    const { testKey, subject, text, options, correctIndex, image } = req.body;
    if (!testKey || !subject || !text || !options || options.length !== 4) {
      return res.status(400).json({ error: 'Missing required fields or invalid options length.' });
    }

    const parsedIndex = parseInt(correctIndex, 10);
    if (isNaN(parsedIndex) || parsedIndex < 0 || parsedIndex > 3) {
      return res.status(400).json({ error: 'Invalid correctIndex value.' });
    }

    const result = await db.query(
      `INSERT INTO questions
        (test_key, subject, question_text, option_a, option_b, option_c, option_d, correct_index, image_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [String(testKey).trim(), String(subject).trim(), String(text).trim(), options[0], options[1], options[2], options[3], parsedIndex, image || null]
    );

    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Add question error:', err);
    res.status(500).json({ error: 'Failed to add question.' });
  }
});

// 3. Delete Question (Strict Admin Only)
router.delete('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const questionId = parseInt(req.params.id, 10);
    if (isNaN(questionId)) {
      return res.status(400).json({ error: 'Invalid question ID.' });
    }

    await db.query('DELETE FROM questions WHERE id = $1', [questionId]);
    res.json({ success: true, message: 'Question deleted successfully.' });
  } catch (err) {
    console.error('Delete question error:', err);
    res.status(500).json({ error: 'Failed to delete question.' });
  }
});

// 4. Save Exam Attempt & Detailed Question Telemetry (Single Consolidated Route)
router.post('/attempts', requireAuth, async (req, res) => {
  try {
    const { testKey, score, correct, wrong, unattempted, responses = [] } = req.body;

    // 1. Insert master attempt summary
    const attemptRes = await db.query(
      `INSERT INTO attempts (user_id, test_key, score, correct_count, wrong_count, unattempted_count)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        req.userId,
        String(testKey).trim(),
        parseInt(score, 10) || 0,
        parseInt(correct, 10) || 0,
        parseInt(wrong, 10) || 0,
        parseInt(unattempted, 10) || 0
      ]
    );

    const attemptId = attemptRes.rows[0].id;

    // 2. Insert individual question telemetry
    if (Array.isArray(responses) && responses.length > 0) {
      const insertQuery = `
        INSERT INTO test_responses (
          attempt_id, user_id, test_key, question_num, subject, chapter,
          selected_option, correct_option, is_correct, time_spent_seconds,
          marked_for_review, answer_changed
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;

      for (const r of responses) {
        await db.query(insertQuery, [
          attemptId,
          req.userId,
          String(testKey).trim(),
          r.questionNum,
          r.subject || 'General',
          r.chapter || null,
          r.selectedOption !== undefined ? r.selectedOption : null,
          r.correctOption !== undefined ? r.correctOption : null,
          r.isCorrect || false,
          r.timeSpent || 0,
          r.markedForReview || false,
          r.answerChanged || false
        ]);
      }
    }

    res.status(201).json({ success: true, attemptId });
  } catch (err) {
    console.error('Save attempt error:', err);
    res.status(500).json({ error: 'Failed to save attempt telemetry.' });
  }
});

// 5. Get User Test History
router.get('/attempts', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, test_key, score, correct_count, wrong_count, unattempted_count, attempted_at FROM attempts WHERE user_id = $1 ORDER BY attempted_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch attempts error:', err);
    res.status(500).json({ error: 'Failed to fetch attempts.' });
  }
});

// 6. Get Detailed Analysis for a Specific Attempt
router.get('/attempts/:id/analysis', requireAuth, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.id, 10);
    if (isNaN(attemptId)) {
      return res.status(400).json({ error: 'Invalid attempt ID' });
    }

    // Verify Attempt Ownership
    const attemptRes = await db.query(
      'SELECT id, test_key, score, correct_count, wrong_count, unattempted_count, attempted_at FROM attempts WHERE id = $1 AND user_id = $2',
      [attemptId, req.userId]
    );

    if (attemptRes.rows.length === 0) {
      return res.status(404).json({ error: 'Attempt not found or unauthorized' });
    }

    const attempt = attemptRes.rows[0];

    // Fetch Itemized Telemetry Responses
    const responsesRes = await db.query(
      `SELECT r.question_num, r.subject, r.chapter, r.selected_option, r.correct_option, 
              r.is_correct, r.time_spent_seconds, r.marked_for_review, r.answer_changed
       FROM test_responses r
       WHERE r.attempt_id = $1 AND r.user_id = $2
       ORDER BY r.question_num ASC`,
      [attemptId, req.userId]
    );

    // Safe questions query
    let questionsList = [];
    try {
      const questionsRes = await db.query(
        `SELECT id, test_key, subject, question_text, option_a, option_b, option_c, option_d, correct_index, image_path 
         FROM questions 
         WHERE test_key = $1 
         ORDER BY id ASC`,
        [attempt.test_key]
      );
      questionsList = questionsRes.rows;
    } catch (qErr) {
      console.warn('Could not fetch questions table rows:', qErr.message);
    }

    // Merge responses safely
    const mergedResponses = responsesRes.rows.map((r, idx) => {
      const q = questionsList[idx] || {};
      return {
        ...r,
        question_text: q.question_text || null,
        option_a: q.option_a || null,
        option_b: q.option_b || null,
        option_c: q.option_c || null,
        option_d: q.option_d || null,
        image_path: q.image_path || null,
        explanation: q.explanation || null
      };
    });

    res.json({
      attempt,
      responses: mergedResponses
    });
  } catch (err) {
    console.error('Fetch attempt analysis error:', err);
    res.status(500).json({ error: 'Failed to fetch test analysis details.' });
  }
});

module.exports = router;