require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkCalls() {
  try {
    const result = await pool.query(`
      SELECT 
        id, 
        phone_number, 
        status, 
        call_lifecycle_status, 
        duration_minutes,
        duration_seconds,
        created_at 
      FROM calls 
      WHERE phone_number IN ('+91 8979556941', '+91 8950311905') 
      ORDER BY created_at DESC
    `);
    
    console.log('\n=== CALLS DATA ===');
    console.log(JSON.stringify(result.rows, null, 2));
    
    // Also check if there's lead analytics
    const analyticsResult = await pool.query(`
      SELECT 
        la.call_id,
        la.analysis_type,
        la.lead_status_tag,
        la.total_score,
        c.phone_number,
        c.status as call_status,
        c.call_lifecycle_status
      FROM lead_analytics la
      JOIN calls c ON la.call_id = c.id
      WHERE c.phone_number IN ('+91 8979556941', '+91 8950311905')
      ORDER BY c.created_at DESC
    `);
    
    console.log('\n=== LEAD ANALYTICS ===');
    console.log(JSON.stringify(analyticsResult.rows, null, 2));
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkCalls();
