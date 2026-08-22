const express = require('express');
const router = express.Router();
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Basic Email Format Validator
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// 10-Digit Mobile Number Validator (Starts with 6, 7, 8, or 9)
const isValidPhone = (phone) => {
  return /^[6-9]\d{9}$/.test(phone);
};

// Strong Password Validator (1 Uppercase, 1 Lowercase, 1 Digit, 1 Special Char, Min 8 Chars)
const isValidPassword = (password) => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/.test(password);
};

// Register Endpoint
router.post('/register', async (req, res) => {
  try {
    const rawName = req.body.fullName || req.body.name;
    const { email, phone, password } = req.body;

    if (!rawName || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields (Name, Email, Phone, Password) are required.' });
    }

    const fullName = String(rawName).trim();
    const sanitizedEmail = String(email).toLowerCase().trim();
    const sanitizedPhone = String(phone).trim();

    // Validate Name (Must contain at least 1 alphabet character)
    if (!/[a-zA-Z]/.test(fullName)) {
      return res.status(400).json({ error: 'Name must contain at least one alphabet letter.' });
    }

    if (!isValidEmail(sanitizedEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    // Validate 10-digit Phone Number
    if (!isValidPhone(sanitizedPhone)) {
      return res.status(400).json({ error: 'Please provide a valid 10-digit mobile number starting with 6, 7, 8, or 9.' });
    }

    // Validate Password Complexity
    if (!isValidPassword(password)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.' 
      });
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

    // Enforce role as 'student' and save phone number
    const result = await db.query(
      'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, phone, role',
      [fullName, sanitizedEmail, sanitizedPhone, passwordHash, 'student']
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, userId: user.id, email: user.email, phone: user.phone, role: user.role, name: user.full_name },
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
        phone: user.phone,
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
      { id: user.id, userId: user.id, email: user.email, phone: user.phone, role: user.role, name: user.full_name },
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
        phone: user.phone,
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