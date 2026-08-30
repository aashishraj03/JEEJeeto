const { Pool } = require('pg');
require('dotenv').config();

// Enable SSL whenever in production or connecting to Supabase cloud
const isProduction = 
  process.env.NODE_ENV === 'production' || 
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('pooler.supabase.com'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/jee_jeeto',
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

// // Auto-initialize required security tables and columns if missing
// (async () => {
//   try {
//     await pool.query(`
//       CREATE TABLE IF NOT EXISTS profile_verifications (
//         id SERIAL PRIMARY KEY,
//         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//         current_email VARCHAR(255) NOT NULL,
//         new_email VARCHAR(255),
//         otp_hash VARCHAR(64) NOT NULL,
//         type VARCHAR(30) NOT NULL,
//         expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
//         created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
//       );

//       ALTER TABLE users 
//       ADD COLUMN IF NOT EXISTS email_updated_at TIMESTAMP WITH TIME ZONE,
//       ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP WITH TIME ZONE;
//     `);
//     console.log('✅ Security tables and cooldown columns verified.');
//   } catch (err) {
//     console.error('⚠️ Database schema verification warning:', err.message);
//   }
// })();

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};