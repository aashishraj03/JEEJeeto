const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

// 1. Get All Unlocked, Non-Expired Chapters for the Current User
router.get('/my-access', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.json({ allAccess: false, unlockedChapters: [] });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jee_key_2026');
    const userId = decoded.id || decoded.userId;

    // Check for an active all-access notes subscription
    const subRes = await db.query(
      `SELECT * FROM subscriptions 
       WHERE user_id = $1 AND plan = 'all_access_notes' AND expires_at > NOW()`,
      [userId]
    );

    if (subRes.rows.length > 0) {
      return res.json({ allAccess: true, unlockedChapters: [] });
    }

    // Only return chapters where 1-year access is still valid
    const notesRes = await db.query(
      `SELECT chapter_key FROM user_notes_access 
       WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId]
    );

    const unlocked = notesRes.rows.map(r => r.chapter_key.toLowerCase().trim());
    return res.json({ allAccess: false, unlockedChapters: unlocked });
  } catch (err) {
    return res.json({ allAccess: false, unlockedChapters: [] });
  }
});

// 2. Individual Access Check
router.get('/access/:chapterKey', async (req, res) => {
  try {
    const { chapterKey } = req.params;
    const cleanKey = chapterKey.toLowerCase().replace(/^notes-/, '').trim();

    // Chapter 1 is free for everyone
    if (req.query.chapter === '1' || cleanKey.endsWith('-1') || cleanKey.startsWith('1')) {
      return res.json({ hasAccess: true, isFree: true });
    }

    const token = req.cookies?.token;
    if (!token) return res.json({ hasAccess: false, requiresAuth: true });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jee_key_2026');
    } catch {
      return res.json({ hasAccess: false, requiresAuth: true });
    }

    const userId = decoded.id || decoded.userId;

    // Check full notes subscription
    const subRes = await db.query(
      `SELECT * FROM subscriptions 
       WHERE user_id = $1 AND plan = 'all_access_notes' AND expires_at > NOW()`,
      [userId]
    );
    if (subRes.rows.length > 0) return res.json({ hasAccess: true });

    // Check single chapter purchase with valid expiry date
    const noteAccessRes = await db.query(
      `SELECT * FROM user_notes_access 
       WHERE user_id = $1 
         AND (LOWER(chapter_key) = $2 OR LOWER(chapter_key) = $3)
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [userId, chapterKey.toLowerCase().trim(), cleanKey]
    );

    if (noteAccessRes.rows.length > 0) return res.json({ hasAccess: true, isPurchased: true });

    res.json({ hasAccess: false, locked: true });
  } catch (err) {
    console.error('Notes access error:', err);
    res.status(500).json({ error: 'Failed to verify note access.' });
  }
});

module.exports = router;