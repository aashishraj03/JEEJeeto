const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Basic Email Format Validator
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Register Endpoint
router.post('/register', async (req, res) => {
  try {
    const rawName = req.body.fullName || req.body.name;
    const { email, password } = req.body;

    if (!rawName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const fullName = String(rawName).trim();
    const sanitizedEmail = String(email).toLowerCase().trim();

    if (!isValidEmail(sanitizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [sanitizedEmail]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 2,
    });

    // Explicitly enforce role as 'student'
    const result = await db.query(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, full_name, email, role',
      [fullName, sanitizedEmail, passwordHash, 'student']
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, userId: user.id, email: user.email, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.status(201).json({
      message: 'Account created successfully!',
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// Login Endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const sanitizedEmail = String(email).toLowerCase().trim();

    const result = await db.query('SELECT * FROM users WHERE email = $1', [sanitizedEmail]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = result.rows[0];
    const isValid = await argon2.verify(user.password_hash, password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, userId: user.id, email: user.email, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.status(200).json({
      message: 'Login successful!',
      user: {
        id: user.id,
        fullName: user.full_name,
        name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// Logout Endpoint
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.status(200).json({ message: 'Logged out successfully.' });
});

// Auth Status Verification
const checkAuthStatus = async (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(200).json({ authenticated: false, loggedIn: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ authenticated: true, loggedIn: true, user: decoded });
  } catch (err) {
    res.status(200).json({ authenticated: false, loggedIn: false });
  }
};

router.get('/me', checkAuthStatus);
router.get('/status', checkAuthStatus);

module.exports = router;