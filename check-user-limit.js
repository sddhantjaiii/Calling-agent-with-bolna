const { Client } = require('pg');
require('dotenv').config({ path: './backend/.env' });

async function checkUserLimit() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    const userId = '789895c8-4bd6-43e9-bfea-a4171ec47197';

    // Check user's concurrent call limit
    console.log('👤 USER CONCURRENT CALL LIMIT:\n');
    const userResult = await client.query(`
      SELECT 
        id, 
        email,
        concurrent_calls_limit,
        credits
      FROM users 
      WHERE id = $1
    `, [userId]);

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const defaultLimit = process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT || 2;
      const effectiveLimit = user.concurrent_calls_limit || defaultLimit;
      
      console.log(`  Email: ${user.email}`);
      console.log(`  DB Limit: ${user.concurrent_calls_limit === null ? 'NULL (using default)' : user.concurrent_calls_limit}`);
      console.log(`  Effective Limit: ${effectiveLimit}`);
      console.log(`  Credits: ${user.credits}`);
    }

    // Check active calls
    console.log('\n📞 ACTIVE CALLS FOR THIS USER:\n');
    const activeResult = await client.query(`
      SELECT 
        id, 
        campaign_id, 
        phone_number, 
        status,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) as seconds_old
      FROM call_queue 
      WHERE user_id = $1 
        AND status = 'processing'
      ORDER BY created_at DESC
    `, [userId]);

    console.log(`  Found ${activeResult.rows.length} active calls`);
    if (activeResult.rows.length > 0) {
      activeResult.rows.forEach(row => {
        const minutes = Math.floor(row.seconds_old / 60);
        console.log(`\n  - ID: ${row.id}`);
        console.log(`    Campaign: ${row.campaign_id || 'direct'}`);
        console.log(`    Phone: ${row.phone_number}`);
        console.log(`    Age: ${minutes}m ${Math.floor(row.seconds_old % 60)}s`);
      });
    }

    // Check queued calls
    console.log('\n📋 QUEUED CALLS FOR THIS USER:\n');
    const queuedResult = await client.query(`
      SELECT COUNT(*) as count
      FROM call_queue 
      WHERE user_id = $1 
        AND status = 'queued'
    `, [userId]);

    console.log(`  Found ${queuedResult.rows[0].count} queued calls`);

    console.log('\n💡 DIAGNOSIS:');
    const activeCount = activeResult.rows.length;
    const defaultLimit = parseInt(process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT || '2');
    const effectiveLimit = userResult.rows[0]?.concurrent_calls_limit || defaultLimit;
    
    if (activeCount >= effectiveLimit) {
      console.log(`  ❌ User has ${activeCount} active calls but limit is ${effectiveLimit}`);
      console.log(`  ⏳ Queued calls will process after active calls complete`);
      console.log(`\n  To fix immediately, either:`);
      console.log(`    1. Increase user limit: UPDATE users SET concurrent_calls_limit = 5 WHERE id = '${userId}';`);
      console.log(`    2. Clean up stuck calls: UPDATE call_queue SET status = 'failed' WHERE user_id = '${userId}' AND status = 'processing';`);
    } else {
      console.log(`  ✅ User has ${activeCount}/${effectiveLimit} active calls`);
      console.log(`  ✅ ${effectiveLimit - activeCount} slots available`);
      console.log(`  🚀 Queued calls should be picked up by queue processor`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkUserLimit();
