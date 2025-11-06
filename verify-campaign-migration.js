/**
 * Verification script for call campaign migration
 */
require('dotenv').config();
const { Pool } = require('pg');

async function verifyMigration() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('\n🔍 Verifying Call Campaign Migration...\n');

    // 1. Check if tables exist
    console.log('1️⃣ Checking tables...');
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('call_campaigns', 'call_queue')
      ORDER BY tablename
    `);
    console.log('   Tables found:', tablesResult.rows.map(r => r.tablename));
    
    // 2. Check contacts unique constraint
    console.log('\n2️⃣ Checking contacts unique constraint...');
    const contactsConstraint = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'contacts' 
      AND constraint_name = 'contacts_id_user_id_unique'
    `);
    console.log('   Constraint:', contactsConstraint.rows[0] || '❌ NOT FOUND');

    // 3. Check users table new columns
    console.log('\n3️⃣ Checking users table columns...');
    const usersColumns = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('concurrent_calls_limit', 'system_concurrent_calls_limit')
      ORDER BY column_name
    `);
    console.log('   New columns:', usersColumns.rows);

    // 4. Check call_campaigns table structure
    console.log('\n4️⃣ Checking call_campaigns table...');
    const campaignsColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'call_campaigns'
      ORDER BY ordinal_position
    `);
    console.log('   Columns:', campaignsColumns.rows.length);
    campaignsColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
    });

    // 5. Check call_queue table structure
    console.log('\n5️⃣ Checking call_queue table...');
    const queueColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'call_queue'
      ORDER BY ordinal_position
    `);
    console.log('   Columns:', queueColumns.rows.length);
    queueColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
    });

    // 6. Check foreign keys
    console.log('\n6️⃣ Checking foreign keys...');
    const foreignKeys = await pool.query(`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('call_campaigns', 'call_queue')
      ORDER BY tc.table_name, kcu.column_name
    `);
    foreignKeys.rows.forEach(fk => {
      console.log(`   - ${fk.table_name}.${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
    });

    // 7. Check indexes
    console.log('\n7️⃣ Checking indexes...');
    const indexes = await pool.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('call_campaigns', 'call_queue')
      ORDER BY tablename, indexname
    `);
    indexes.rows.forEach(idx => {
      console.log(`   - ${idx.indexname} on ${idx.tablename}`);
    });

    // 8. Check helper functions
    console.log('\n8️⃣ Checking helper functions...');
    const functions = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name IN (
        'get_next_queued_call',
        'count_active_calls',
        'count_system_active_calls'
      )
      ORDER BY routine_name
    `);
    console.log('   Functions:', functions.rows.map(f => f.routine_name));

    // 9. Check triggers
    console.log('\n9️⃣ Checking triggers...');
    const triggers = await pool.query(`
      SELECT
        event_object_table AS table_name,
        trigger_name
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      AND event_object_table IN ('call_campaigns', 'call_queue')
      ORDER BY event_object_table, trigger_name
    `);
    triggers.rows.forEach(t => {
      console.log(`   - ${t.trigger_name} on ${t.table_name}`);
    });

    // 10. Test helper function
    console.log('\n🔟 Testing helper functions...');
    try {
      const testUserId = '00000000-0000-0000-0000-000000000000'; // Dummy UUID
      const activeCallsResult = await pool.query(
        'SELECT count_active_calls($1) as count',
        [testUserId]
      );
      console.log('   count_active_calls() works! Returns:', activeCallsResult.rows[0].count);
      
      const systemActiveCallsResult = await pool.query(
        'SELECT count_system_active_calls() as count'
      );
      console.log('   count_system_active_calls() works! Returns:', systemActiveCallsResult.rows[0].count);
    } catch (error) {
      console.log('   ⚠️ Function test error:', error.message);
    }

    console.log('\n✅ Migration verification complete!\n');

  } catch (error) {
    console.error('❌ Verification failed:', error);
  } finally {
    await pool.end();
  }
}

verifyMigration();
