const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../db');
const { requireAuth } = require('../middleware');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const BASE_CHAPTER_PRICE = 20.0;
const STEP_DISCOUNT = 0.20;

// Subject-wise multi-buy tiered calculation (exact match with subscription.html)
function calculateSubjectCost(count) {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.max(0, BASE_CHAPTER_PRICE - (i * STEP_DISCOUNT));
  }
  return total;
}

// 1. Create Dynamic Order
router.post('/create-order', requireAuth, async (req, res) => {
  try {
    const { includeTest, testDays, chapters = [], counts = {} } = req.body;

    // 1. Calculate Test Series Cost
    let testPrice = 0;
    if (includeTest) {
      if (testDays === 30) testPrice = 20;
      else if (testDays === 365) testPrice = 100;
    }

    // 2. Calculate Subject-Wise Notes Cost
    const physicsCount = counts.physics || 0;
    const chemCount = counts.chem || 0;
    const mathCount = counts.math || 0;

    const notesCost =
      calculateSubjectCost(physicsCount) +
      calculateSubjectCost(chemCount) +
      calculateSubjectCost(mathCount);

    const totalINR = Number((testPrice + notesCost).toFixed(2));

    if (totalINR <= 0) {
      return res.status(400).json({ error: 'Please select at least one item to purchase.' });
    }

    // Razorpay amount in paise
    const amountInPaise = Math.round(totalINR * 100);

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${req.userId}_${Date.now()}`,
      notes: {
        userId: String(req.userId),
        includeTest: includeTest ? 'true' : 'false',
        testDays: String(testDays || 0),
        totalChapters: String(physicsCount + chemCount + mathCount)
      }
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planName: `JEE Custom Package (₹${totalINR.toFixed(2)})`
    });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'Failed to create payment order.' });
  }
});

// 2. Cryptographically Verify Signature & Grant Access
router.post('/verify-payment', requireAuth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      includeTest,
      testDays,
      chapters = []
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment signature tokens.' });
    }

    // HMAC SHA256 Verification
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
    }

    // 1. Activate Test Series if included
    if (includeTest && testDays > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Number(testDays));

      await db.query(
        `INSERT INTO subscriptions (user_id, status, plan, started_at, expires_at)
         VALUES ($1, 'active', $2, NOW(), $3)`,
        [req.userId, `${testDays}d_test_pack`, expiresAt]
      );
    }

    // 2. Unlock purchased chapters with 1-Year (365 days) Expiry
    if (Array.isArray(chapters) && chapters.length > 0) {
      const notesExpiry = new Date();
      notesExpiry.setDate(notesExpiry.getDate() + 365); // 1 Year Access

      for (const chapterKey of chapters) {
        if (chapterKey) {
          await db.query(
            `INSERT INTO user_notes_access (user_id, chapter_key, unlocked_at, expires_at)
             VALUES ($1, $2, NOW(), $3)
             ON CONFLICT (user_id, chapter_key) 
             DO UPDATE SET expires_at = EXCLUDED.expires_at`,
            [req.userId, String(chapterKey).trim().toLowerCase(), notesExpiry]
          );
        }
      }
    }

    res.json({
      success: true,
      message: 'Payment verified and access unlocked successfully!'
    });
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ error: 'Server error during payment verification.' });
  }
});

// 3. Subscription Status Check
router.get('/status', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT status, plan, started_at, expires_at 
       FROM subscriptions 
       WHERE user_id = $1 AND expires_at > NOW() 
       ORDER BY expires_at DESC LIMIT 1`,
      [req.userId]
    );

    res.json({
      subscribed: result.rows.length > 0,
      subscription: result.rows[0] || null
    });
  } catch (err) {
    console.error('Status fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch status.' });
  }
});

module.exports = router;