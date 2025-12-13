const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkToken() {
  try {
    const result = await pool.query(`
      SELECT 
        google_calendar_connected, 
        google_email, 
        google_token_expiry,
        LENGTH(google_refresh_token) as refresh_token_length,
        LEFT(google_refresh_token, 30) as refresh_token_prefix
      FROM users 
      WHERE id = '789895c8-4bd6-43e9-bfea-a4171ec47197'
    `);
    
    console.log('User Google data:', JSON.stringify(result.rows[0], null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkToken();
