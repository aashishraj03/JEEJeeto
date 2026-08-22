const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// 1. Strict Startup Security Guard: Never start without a configured secret
if (!process.env.JWT_SECRET) {
  console.error('\x1b[31m%s\x1b[0m', 'CRITICAL SECURITY ERROR: JWT_SECRET must be defined in .env.');
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const testsRoutes = require('./routes/tests');
const paymentRoutes = require('./routes/payment');
const notesRoutes = require('./routes/notes');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Content Security Policy & Security Headers (Configured for Fonts, MathJax & Razorpay)
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://checkout.razorpay.com"
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "data:",
          "https://fonts.gstatic.com",
          "https://cdn.jsdelivr.net"
        ],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://lumberjack.razorpay.com",
          "https://api.razorpay.com"
        ],
        frameSrc: [
          "'self'",
          "https://api.razorpay.com",
          "https://checkout.razorpay.com"
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } // <-- Fixes blank popup/iframe blocking
  })
);

// 3. Strict CORS (No runtime server crashes)
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) 
  : ['http://localhost:5000', 'http://127.0.0.1:5000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false); // Safely deny origin without throwing server exception
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// 4. Strict Rate Limiting (3 requests per 5 minutes per IP on auth routes)
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many login/register attempts. Please wait 5 minutes.' });
  }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// 5. Static Files & Routing
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', testsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/notes', notesRoutes);

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Centralized Error Handler (Prevents leakage of server stack traces)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Run local listener only outside production
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔒 JEE Server running with full security at: http://localhost:${PORT}`);
  });
}

module.exports = app;