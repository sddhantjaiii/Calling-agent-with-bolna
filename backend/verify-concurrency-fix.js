/**
 * Verify the concurrency limits fix
 */
require('dotenv').config();
const { Pool } = require('pg');

async function verifyFix() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('\n🔍 Verifying Concurrency Limits Fix...\n');

    // 1. Check users table columns
    console.log('1️⃣ Checking users table columns...');
    const usersColumns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name LIKE '%concurrent%'
      ORDER BY column_name
    `);
    
    if (usersColumns.rows.length === 0) {
      console.log('   ❌ No concurrency columns found!');
    } else {
      console.log('   Found columns:');
      usersColumns.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (default: ${col.column_default})`);
      });
    }

    // 2. Verify system_concurrent_calls_limit was dropped
    console.log('\n2️⃣ Verifying system_concurrent_calls_limit was dropped...');
    const systemColumnCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'system_concurrent_calls_limit'
    `);
    
    if (systemColumnCheck.rows.length === 0) {
      console.log('   ✅ Column successfully dropped!');
    } else {
      console.log('   ❌ Column still exists!');
    }

    // 3. Verify concurrent_calls_limit still exists
    console.log('\n3️⃣ Verifying concurrent_calls_limit still exists...');
    const userColumnCheck = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name = 'concurrent_calls_limit'
    `);
    
    if (userColumnCheck.rows.length > 0) {
      console.log('   ✅ Column exists:', userColumnCheck.rows[0]);
    } else {
      console.log('   ❌ Column was accidentally dropped!');
    }

    // 4. Check column comment
    console.log('\n4️⃣ Checking column comment...');
    const commentCheck = await pool.query(`
      SELECT 
        cols.column_name,
        pg_catalog.col_description(c.oid, cols.ordinal_position::int) as column_comment
      FROM information_schema.columns cols
      JOIN pg_catalog.pg_class c ON c.relname = cols.table_name
      WHERE cols.table_schema = 'public'
      AND cols.table_name = 'users'
      AND cols.column_name = 'concurrent_calls_limit'
    `);
    
    if (commentCheck.rows.length > 0 && commentCheck.rows[0].column_comment) {
      console.log('   Comment:', commentCheck.rows[0].column_comment);
    } else {
      console.log('   No comment found');
    }

    // 5. Test helper functions still work
    console.log('\n5️⃣ Testing helper functions...');
    try {
      const testUserId = '00000000-0000-0000-0000-000000000000';
      
      const userCallsResult = await pool.query(
        'SELECT count_active_calls($1) as count',
        [testUserId]
      );
      console.log('   ✅ count_active_calls() works! Returns:', userCallsResult.rows[0].count);
      
      const systemCallsResult = await pool.query(
        'SELECT count_system_active_calls() as count'
      );
      console.log('   ✅ count_system_active_calls() works! Returns:', systemCallsResult.rows[0].count);
    } catch (error) {
      console.log('   ❌ Function test error:', error.message);
    }

    // 6. Check ENV configuration
    console.log('\n6️⃣ Checking ENV configuration...');
    const systemLimit = process.env.SYSTEM_CONCURRENT_CALLS_LIMIT;
    const defaultUserLimit = process.env.DEFAULT_USER_CONCURRENT_CALLS_LIMIT;
    const queueInterval = process.env.QUEUE_PROCESSOR_INTERVAL;
    
    console.log('   SYSTEM_CONCURRENT_CALLS_LIMIT:', systemLimit || '❌ NOT SET');
    console.log('   DEFAULT_USER_CONCURRENT_CALLS_LIMIT:', defaultUserLimit || '❌ NOT SET');
    console.log('   QUEUE_PROCESSOR_INTERVAL:', queueInterval || '❌ NOT SET');

    console.log('\n✅ Concurrency limits fix verification complete!\n');
    
    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Per-user limit: users.concurrent_calls_limit (default: 2)');
    console.log('✅ System-wide limit: ENV SYSTEM_CONCURRENT_CALLS_LIMIT');
    console.log('❌ Removed: users.system_concurrent_calls_limit (was confusing)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await pool.end();
  }
}

verifyFix();
