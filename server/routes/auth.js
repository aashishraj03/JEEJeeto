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

const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Configure Email Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// 1. Send OTP Endpoint
router.post('/forgot-password/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const sanitizedEmail = String(email).toLowerCase().trim();

    // Check if user exists
    const userCheck = await db.query('SELECT id FROM users WHERE email = $1', [sanitizedEmail]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'No account found with this email.' });
    }

    // Generate secure 6-digit numeric OTP
    const rawOtp = String(crypto.randomInt(100000, 999999));
    
    // Hash OTP before storing for database security
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Clean previous OTPs for this email and insert new one
    await db.query('DELETE FROM password_resets WHERE email = $1', [sanitizedEmail]);
    await db.query(
      'INSERT INTO password_resets (email, otp_hash, expires_at) VALUES ($1, $2, $3)',
      [sanitizedEmail, otpHash, expiresAt]
    );

    // Send Email
    await transporter.sendMail({
      from: `"JEE Jeeto Security" <${process.env.SMTP_USER}>`,
      to: sanitizedEmail,
      subject: 'Your Password Reset OTP - JEE Jeeto',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-bottom: 8px;">Password Reset Request</h2>
          <p style="color: #64748b; font-size: 14px;">Use the following OTP to reset your password. This code is valid for <strong>10 minutes</strong>.</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #f59e0b; background: #0f172a; padding: 10px 24px; border-radius: 6px; display: inline-block;">${rawOtp}</span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 16px;">If you did not request this, please ignore this email.</p>
        </div>
      `,
    });

    res.status(200).json({ success: true, message: 'OTP sent to your email successfully.' });
  } catch (err) {
    console.error('Send OTP Error:', err);
    res.status(500).json({ error: 'Failed to send OTP. Please check server email settings.' });
  }
});

// 2. Verify OTP & Reset Password Endpoint
router.post('/forgot-password/verify-and-reset', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are all required.' });
    }

    const sanitizedEmail = String(email).toLowerCase().trim();
    const sanitizedOtp = String(otp).trim();

    // Validate Password Complexity
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.'
      });
    }

    const incomingHash = crypto.createHash('sha256').update(sanitizedOtp).digest('hex');

    // Check OTP validity
    const otpResult = await db.query(
      'SELECT * FROM password_resets WHERE email = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [sanitizedEmail]
    );

    if (otpResult.rows.length === 0 || otpResult.rows[0].otp_hash !== incomingHash) {
      return res.status(400).json({ error: 'Invalid or expired OTP. Please request a new one.' });
    }

    // Hash new password
    const newPasswordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 2,
    });

    // Update user password and remove used OTP
    await db.query('UPDATE users SET password_hash = $1 WHERE email = $2', [newPasswordHash, sanitizedEmail]);
    await db.query('DELETE FROM password_resets WHERE email = $1', [sanitizedEmail]);

    res.status(200).json({ success: true, message: 'Password has been reset successfully. Please login.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// Update User Profile Name & Mobile
router.put('/me', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Session missing.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  const userId = decoded.id || decoded.userId;
  const rawName = req.body.fullName || req.body.name;
  const { phone } = req.body;

  if (!rawName) {
    return res.status(400).json({ error: 'Full name is required.' });
  }

  const fullName = String(rawName).trim();
  if (!/[a-zA-Z]/.test(fullName)) {
    return res.status(400).json({ error: 'Name must contain at least one alphabet letter.' });
  }

  try {
    let queryText = 'UPDATE users SET full_name = $1 WHERE id = $2 RETURNING id, full_name, email, phone, role';
    let queryParams = [fullName, userId];

    if (phone) {
      const sanitizedPhone = String(phone).trim();
      if (!/^[6-9]\d{9}$/.test(sanitizedPhone)) {
        return res.status(400).json({ error: 'Please provide a valid 10-digit mobile number starting with 6, 7, 8, or 9.' });
      }
      queryText = 'UPDATE users SET full_name = $1, phone = $2 WHERE id = $3 RETURNING id, full_name, email, phone, role';
      queryParams = [fullName, sanitizedPhone, userId];
    }

    const result = await db.query(queryText, queryParams);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const updatedUser = result.rows[0];

    // Re-issue updated JWT cookie
    const newToken = jwt.sign(
      { id: updatedUser.id, userId: updatedUser.id, email: updatedUser.email, phone: updatedUser.phone, role: updatedUser.role, name: updatedUser.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: updatedUser.id,
        fullName: updatedUser.full_name,
        name: updatedUser.full_name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        role: updatedUser.role
      }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error while updating profile.' });
  }
});

// Helper: Check 14-Day Cooldown
const check14DayCooldown = (lastUpdatedDate) => {
  if (!lastUpdatedDate) return { allowed: true, daysRemaining: 0 };
  const cooldownMs = 14 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - new Date(lastUpdatedDate).getTime();
  if (elapsed < cooldownMs) {
    const daysRemaining = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000));
    return { allowed: false, daysRemaining };
  }
  return { allowed: true, daysRemaining: 0 };
};

// 1. Send Security Verification OTP (with 14-Day Cooldown Guard)
router.post('/security/send-otp', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized: Session missing.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  const userId = decoded.id || decoded.userId;
  const { type, newEmail } = req.body; // 'email_change' | 'password_change'

  if (!type || !['email_change', 'password_change'].includes(type)) {
    return res.status(400).json({ error: 'Invalid verification request.' });
  }

  try {
    const userRes = await db.query(
      'SELECT id, email, full_name, email_updated_at, password_updated_at FROM users WHERE id = $1',
      [userId]
    );
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User account not found.' });
    const user = userRes.rows[0];

    // Enforce 14-Day Cooldown Rule
    if (type === 'email_change') {
      const { allowed, daysRemaining } = check14DayCooldown(user.email_updated_at);
      if (!allowed) {
        return res.status(429).json({
          error: `Security Policy: Email address can only be changed once every 14 days. Please try again in ${daysRemaining} day(s).`
        });
      }

      if (!newEmail || !isValidEmail(String(newEmail).trim())) {
        return res.status(400).json({ error: 'Please provide a valid new email address.' });
      }

      const targetEmail = String(newEmail).toLowerCase().trim();
      if (targetEmail === user.email.toLowerCase().trim()) {
        return res.status(400).json({ error: 'New email cannot be identical to your current registered email.' });
      }

      const dupCheck = await db.query('SELECT id FROM users WHERE email = $1', [targetEmail]);
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ error: 'The new email address is already in use by another account.' });
      }
    } else if (type === 'password_change') {
      const { allowed, daysRemaining } = check14DayCooldown(user.password_updated_at);
      if (!allowed) {
        return res.status(429).json({
          error: `Security Policy: Password can only be changed once every 14 days. Please try again in ${daysRemaining} day(s).`
        });
      }
    }

    // Generate & Store Hash of 6-digit OTP
    const rawOtp = String(crypto.randomInt(100000, 999999));
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.query('DELETE FROM profile_verifications WHERE user_id = $1 AND type = $2', [userId, type]);
    await db.query(
      `INSERT INTO profile_verifications (user_id, current_email, new_email, otp_hash, type, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, user.email, type === 'email_change' ? String(newEmail).toLowerCase().trim() : null, otpHash, type, expiresAt]
    );

    const actionText = type === 'email_change' 
      ? `request to update your registered email address to <strong>${newEmail}</strong>` 
      : `request to change your account password`;

    await transporter.sendMail({
      from: `"JEE Jeeto Security" <${process.env.SMTP_USER}>`,
      to: user.email,
      subject: `Security Verification Code - JEE Jeeto`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-bottom: 8px;">Security Verification Code</h2>
          <p style="color: #64748b; font-size: 14px;">We received a ${actionText}.</p>
          <p style="color: #64748b; font-size: 14px;">Use the OTP below to authorize this action. This code is valid for <strong>10 minutes</strong>.</p>
          <div style="text-align: center; margin: 24px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #f59e0b; background: #0f172a; padding: 10px 24px; border-radius: 6px; display: inline-block;">${rawOtp}</span>
          </div>
          <p style="color: #dc2626; font-size: 12px; margin-top: 16px;"><strong>Note:</strong> Once changed, this credential cannot be modified again for 14 days.</p>
        </div>
      `,
    });

    res.json({ success: true, message: `OTP sent to your registered email (${user.email}).` });
  } catch (err) {
    console.error('Security send OTP error:', err);
    res.status(500).json({ error: 'Failed to send security verification email.' });
  }
});

// 2. Confirm Email Change
router.post('/security/change-email', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized: Session missing.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  const userId = decoded.id || decoded.userId;
  const { otp, newEmail } = req.body;

  if (!otp || !newEmail) return res.status(400).json({ error: 'OTP and new email are required.' });

  const targetEmail = String(newEmail).toLowerCase().trim();
  const incomingHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');

  try {
    const recordRes = await db.query(
      `SELECT * FROM profile_verifications 
       WHERE user_id = $1 AND type = 'email_change' AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (recordRes.rows.length === 0 || recordRes.rows[0].otp_hash !== incomingHash || recordRes.rows[0].new_email !== targetEmail) {
      return res.status(400).json({ error: 'Invalid or expired OTP code.' });
    }

    const updated = await db.query(
      `UPDATE users 
       SET email = $1, email_updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, full_name, email, phone, role`,
      [targetEmail, userId]
    );

    await db.query('DELETE FROM profile_verifications WHERE user_id = $1 AND type = $2', [userId, 'email_change']);

    const user = updated.rows[0];
    const newToken = jwt.sign(
      { id: user.id, userId: user.id, email: user.email, phone: user.phone, role: user.role, name: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });

    res.json({ success: true, email: user.email, message: 'Email address updated successfully.' });
  } catch (err) {
    console.error('Change email error:', err);
    res.status(500).json({ error: 'Failed to update email.' });
  }
});

// 3. Confirm Password Change
router.post('/security/change-password', async (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized: Session missing.' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid.' });
  }

  const userId = decoded.id || decoded.userId;
  const { otp, newPassword } = req.body;

  if (!otp || !newPassword) return res.status(400).json({ error: 'OTP and new password are required.' });

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters long and contain uppercase, lowercase, number, and special character.'
    });
  }

  const incomingHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');

  try {
    const recordRes = await db.query(
      `SELECT * FROM profile_verifications 
       WHERE user_id = $1 AND type = 'password_change' AND expires_at > NOW() 
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (recordRes.rows.length === 0 || recordRes.rows[0].otp_hash !== incomingHash) {
      return res.status(400).json({ error: 'Invalid or expired OTP code.' });
    }

    const newPasswordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 2,
    });

    await db.query(
      'UPDATE users SET password_hash = $1, password_updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    );
    await db.query('DELETE FROM profile_verifications WHERE user_id = $1 AND type = $2', [userId, 'password_change']);

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

module.exports = router;