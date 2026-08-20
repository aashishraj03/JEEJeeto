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

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};