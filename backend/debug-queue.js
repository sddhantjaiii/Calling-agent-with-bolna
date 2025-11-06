const { Client } = require('pg');
require('dotenv').config();

async function debugQueue() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // 1. Check call_queue table
    console.log('📋 CALL QUEUE STATUS:');
    const queueResult = await client.query(`
      SELECT id, user_id, campaign_id, phone_number, status, priority, 
             created_at, call_id, failure_reason
      FROM call_queue 
      ORDER BY status, priority DESC, created_at ASC 
      LIMIT 20
    `);
    console.log(`Total calls in queue: ${queueResult.rows.length}\n`);
    
    const grouped = {};
    queueResult.rows.forEach(row => {
      if (!grouped[row.status]) grouped[row.status] = [];
      grouped[row.status].push(row);
    });

    Object.keys(grouped).forEach(status => {
      console.log(`\n  Status: ${status.toUpperCase()} (${grouped[status].length} calls)`);
      grouped[status].forEach(row => {
        console.log(`    - ID: ${row.id.substring(0, 8)}..., User: ${row.user_id.substring(0, 8)}..., Priority: ${row.priority}, Phone: ${row.phone_number}`);
        if (row.failure_reason) console.log(`      Failure: ${row.failure_reason}`);
      });
    });

    // 2. Check active_calls table
    console.log('\n\n📞 ACTIVE CALLS TABLE:');
    const activeResult = await client.query(`
      SELECT id, user_id, call_type, started_at
      FROM active_calls
      ORDER BY started_at DESC
      LIMIT 10
    `);
    console.log(`Total active calls: ${activeResult.rows.length}`);
    if (activeResult.rows.length > 0) {
      activeResult.rows.forEach(row => {
        console.log(`  - Call: ${row.id.substring(0, 8)}..., User: ${row.user_id.substring(0, 8)}..., Type: ${row.call_type}`);
      });
    } else {
      console.log('  (No active calls)');
    }

    // 3. Check calls table for in-progress calls
    console.log('\n\n🔄 CALLS TABLE (in-progress):');
    const progressResult = await client.query(`
      SELECT id, user_id, status, created_at
      FROM calls
      WHERE status IN ('initiated', 'ringing', 'in-progress')
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log(`Total calls in progress: ${progressResult.rows.length}`);
    if (progressResult.rows.length > 0) {
      progressResult.rows.forEach(row => {
        console.log(`  - Call: ${row.id.substring(0, 8)}..., User: ${row.user_id.substring(0, 8)}..., Status: ${row.status}`);
      });
    } else {
      console.log('  (No calls in progress)');
    }

    // 4. Check concurrency counts
    console.log('\n\n🔢 CONCURRENCY COUNTS:');
    const concurrencyResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM call_queue WHERE status = 'processing') as queue_processing,
        (SELECT COUNT(*) FROM active_calls) as active_calls_count,
        (SELECT COUNT(*) FROM calls WHERE status IN ('initiated', 'ringing', 'in-progress')) as calls_in_progress_count,
        (SELECT COUNT(DISTINCT user_id) FROM call_queue WHERE status = 'queued') as users_with_queued
    `);
    const counts = concurrencyResult.rows[0];
    console.log(`  Queue processing status: ${counts.queue_processing}`);
    console.log(`  Active calls table: ${counts.active_calls_count}`);
    console.log(`  Calls in progress: ${counts.calls_in_progress_count}`);
    console.log(`  Users with queued calls: ${counts.users_with_queued}`);

    // 5. Check user's concurrent limit
    console.log('\n\n👤 USER CONCURRENCY SETTINGS:');
    const userIds = [...new Set(queueResult.rows.map(r => r.user_id))];
    for (const userId of userIds) {
      const userResult = await client.query(`
        SELECT id, email, concurrent_calls_limit, credits
        FROM users
        WHERE id = $1
      `, [userId]);
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        console.log(`  User: ${user.email || userId.substring(0, 8)}`);
        console.log(`    - Limit: ${user.concurrent_calls_limit || 'NULL (uses default)'}`);
        console.log(`    - Credits: ${user.credits}`);
        
        // Count this user's active calls
        const userActiveResult = await client.query(`
          SELECT COUNT(*) as count FROM call_queue 
          WHERE user_id = $1 AND status = 'processing'
        `, [userId]);
        console.log(`    - Active calls in queue: ${userActiveResult.rows[0].count}`);
      }
    }

    // 6. Check system settings
    console.log('\n\n⚙️  SYSTEM SETTINGS:');
    console.log(`  SYSTEM_CONCURRENT_CALLS_LIMIT: ${process.env.SYSTEM_CONCURRENT_CALLS_LIMIT || '10'}`);
    console.log(`  DEFAULT_USER_CONCURRENT_CALLS_LIMIT: ${process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT || '2'}`);
    console.log(`  ENABLE_IN_MEMORY_SCHEDULER: ${process.env.ENABLE_IN_MEMORY_SCHEDULER || 'true'}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await client.end();
  }
}

debugQueue();
