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

// Fetch Questions by Test Key (With Gating)
router.get('/questions/:key', async (req, res) => {
  try {
    const testKey = req.params.key;

    // 1. If it's a free test, return questions immediately
    if (FREE_TEST_KEYS.includes(testKey)) {
      const result = await db.query('SELECT * FROM questions WHERE test_key = $1', [testKey]);
      return res.json(result.rows);
    }

    // 2. For paid tests, verify valid subscription
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

// Add Question (Strict Admin Only)
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

// Delete Question (Strict Admin Only)
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

// Save Exam Attempt (Logged In User)
router.post('/attempts', requireAuth, async (req, res) => {
  try {
    const { testKey, score, correct, wrong, unattempted } = req.body;
    
    await db.query(
      `INSERT INTO attempts (user_id, test_key, score, correct_count, wrong_count, unattempted_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.userId,
        String(testKey).trim(),
        parseInt(score, 10) || 0,
        parseInt(correct, 10) || 0,
        parseInt(wrong, 10) || 0,
        parseInt(unattempted, 10) || 0
      ]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Save attempt error:', err);
    res.status(500).json({ error: 'Failed to save attempt.' });
  }
});

// Get User Test History
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

module.exports = router;