// Verify and fix the unique constraint for complete analysis
// Run this with: node backend/src/migrations/verify-and-fix-constraint.js

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function verifyAndFix() {
  console.log('🔍 Verifying complete analysis unique constraint...\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Check what exists currently
    console.log('1️⃣ Checking existing indexes and constraints...\n');
    
    const indexCheck = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'lead_analytics'
        AND (indexname LIKE '%complete%' OR indexname LIKE '%unique%')
      ORDER BY indexname
    `);

    console.log('📋 Found indexes:');
    indexCheck.rows.forEach(row => {
      console.log(`   - ${row.indexname}`);
      console.log(`     ${row.indexdef}\n`);
    });

    // 2. Check if the constraint works for ON CONFLICT
    console.log('\n2️⃣ Testing ON CONFLICT clause...\n');
    
    try {
      // This should work if constraint exists
      await pool.query(`
        SELECT 1 
        WHERE EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE tablename = 'lead_analytics'
          AND indexdef LIKE '%UNIQUE%'
          AND indexdef LIKE '%user_id%'
          AND indexdef LIKE '%phone_number%'
          AND indexdef LIKE '%analysis_type%'
        )
      `);
      
      console.log('   ✅ Unique index exists in pg_indexes\n');
    } catch (error) {
      console.log('   ⚠️ Issue checking indexes:', error.message, '\n');
    }

    // 3. Drop and recreate the constraint properly
    console.log('3️⃣ Dropping existing indexes...\n');
    
    // Drop any existing indexes
    try {
      await pool.query(`DROP INDEX IF EXISTS idx_lead_analytics_complete_unique CASCADE`);
      console.log('   ✅ Dropped idx_lead_analytics_complete_unique');
    } catch (error) {
      console.log('   ℹ️  Index may not exist:', error.message);
    }

    try {
      await pool.query(`DROP INDEX IF EXISTS idx_lead_analytics_complete CASCADE`);
      console.log('   ✅ Dropped idx_lead_analytics_complete');
    } catch (error) {
      console.log('   ℹ️  Index may not exist:', error.message);
    }

    // 4. Create the unique index with proper syntax
    console.log('\n4️⃣ Creating UNIQUE index for complete analysis...\n');
    
    await pool.query(`
      CREATE UNIQUE INDEX idx_lead_analytics_complete_unique
      ON lead_analytics (user_id, phone_number, analysis_type)
      WHERE analysis_type = 'complete'
    `);
    
    console.log('   ✅ Created UNIQUE index: idx_lead_analytics_complete_unique\n');

    // 5. Verify it was created correctly
    console.log('5️⃣ Verifying constraint...\n');
    
    const verifyIndex = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'lead_analytics'
        AND indexname = 'idx_lead_analytics_complete_unique'
    `);

    if (verifyIndex.rows.length > 0) {
      console.log('   ✅ Constraint verified:');
      console.log(`   ${verifyIndex.rows[0].indexdef}\n`);
      
      // Check if it's actually UNIQUE
      if (verifyIndex.rows[0].indexdef.includes('UNIQUE')) {
        console.log('   ✅ Index is UNIQUE - ON CONFLICT will work!\n');
      } else {
        console.log('   ❌ WARNING: Index exists but is not UNIQUE!\n');
      }
    } else {
      console.log('   ❌ Index not found after creation!\n');
    }

    // 6. Test the upsert functionality
    console.log('6️⃣ Testing upsert functionality...\n');
    
    // Get a test user and call
    const testUser = await pool.query(`
      SELECT id FROM users LIMIT 1
    `);
    
    const testCall = await pool.query(`
      SELECT id FROM calls WHERE user_id = $1 LIMIT 1
    `, [testUser.rows[0]?.id]);

    if (testUser.rows.length > 0 && testCall.rows.length > 0) {
      const userId = testUser.rows[0].id;
      const callId = testCall.rows[0].id;
      const testPhone = '+91 TEST12345';
      
      console.log(`   Testing with user: ${userId.substring(0, 8)}...`);
      console.log(`   Testing with call: ${callId.substring(0, 8)}...`);
      console.log(`   Testing with phone: ${testPhone}\n`);
      
      // First insert
      try {
        await pool.query(`
          INSERT INTO lead_analytics (
            call_id, user_id, phone_number, analysis_type,
            intent_score, total_score, reasoning, cta_interactions
          ) VALUES ($1, $2, $3, 'complete', 50, 50, '{}', '{}')
        `, [callId, userId, testPhone]);
        
        console.log('   ✅ First insert succeeded\n');
      } catch (error) {
        console.log('   ⚠️ First insert failed (may already exist):', error.message, '\n');
      }
      
      // Upsert (should update)
      try {
        const result = await pool.query(`
          INSERT INTO lead_analytics (
            call_id, user_id, phone_number, analysis_type,
            intent_score, total_score, reasoning, cta_interactions, previous_calls_analyzed
          ) VALUES ($1, $2, $3, 'complete', 60, 60, '{}', '{}', 1)
          ON CONFLICT (user_id, phone_number, analysis_type)
          DO UPDATE SET
            intent_score = EXCLUDED.intent_score,
            total_score = EXCLUDED.total_score,
            previous_calls_analyzed = EXCLUDED.previous_calls_analyzed
          RETURNING id, previous_calls_analyzed, total_score
        `, [callId, userId, testPhone]);
        
        console.log('   ✅ Upsert succeeded!');
        console.log(`   Updated record: score=${result.rows[0].total_score}, previous_calls=${result.rows[0].previous_calls_analyzed}\n`);
      } catch (error) {
        console.log('   ❌ Upsert failed:', error.message, '\n');
        console.log('   This is the error you\'re experiencing!\n');
      }
      
      // Cleanup test data
      await pool.query(`
        DELETE FROM lead_analytics 
        WHERE phone_number = $1
      `, [testPhone]);
      
      console.log('   ✅ Test data cleaned up\n');
    } else {
      console.log('   ⚠️ No test data available, skipping upsert test\n');
    }

    console.log('🎉 Verification and fix completed!\n');
    console.log('📝 Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Make a test call');
    console.log('3. Complete analysis should now upsert successfully');

  } catch (error) {
    console.error('\n❌ Process failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the verification
verifyAndFix()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
