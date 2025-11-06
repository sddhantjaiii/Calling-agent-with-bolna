// Quick migration script to add unique constraint
// Run this with: node backend/src/migrations/run-constraint-migration.js

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
  console.log('🔧 Adding unique constraint for complete analysis upsert...\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    console.error('Make sure .env file exists in backend folder');
    process.exit(1);
  }

  console.log('📡 Connecting to database...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Check for existing duplicates
    console.log('📊 Checking for duplicate complete analysis records...');
    const duplicateCheck = await pool.query(`
      SELECT 
        user_id, 
        phone_number, 
        analysis_type, 
        COUNT(*) as count
      FROM lead_analytics
      WHERE analysis_type = 'complete'
      GROUP BY user_id, phone_number, analysis_type
      HAVING COUNT(*) > 1
    `);

    if (duplicateCheck.rows.length > 0) {
      console.log(`⚠️  Found ${duplicateCheck.rows.length} duplicate records. Cleaning up...`);
      
      // 2. Delete duplicates (keep most recent)
      const deleteResult = await pool.query(`
        DELETE FROM lead_analytics
        WHERE id IN (
          SELECT id
          FROM (
            SELECT 
              id,
              ROW_NUMBER() OVER (
                PARTITION BY user_id, phone_number, analysis_type 
                ORDER BY analysis_timestamp DESC
              ) as rn
            FROM lead_analytics
            WHERE analysis_type = 'complete'
          ) sub
          WHERE rn > 1
        )
      `);
      
      console.log(`✅ Deleted ${deleteResult.rowCount} duplicate records\n`);
    } else {
      console.log('✅ No duplicates found\n');
    }

    // 3. Create the unique constraint
    console.log('🔨 Creating unique constraint...');
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_analytics_complete_unique
      ON lead_analytics (user_id, phone_number, analysis_type)
      WHERE analysis_type = 'complete'
    `);
    console.log('✅ Unique constraint created successfully\n');

    // 4. Verify it was created
    console.log('🔍 Verifying constraint...');
    const verifyResult = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'lead_analytics' 
        AND indexname = 'idx_lead_analytics_complete_unique'
    `);

    if (verifyResult.rows.length > 0) {
      console.log('✅ Constraint verified:\n');
      console.log(verifyResult.rows[0].indexdef);
      console.log('\n');
      console.log('🎉 Migration completed successfully!');
      console.log('\n📝 Next steps:');
      console.log('1. Restart your backend server');
      console.log('2. Make a test call');
      console.log('3. Complete analysis should now upsert without errors');
    } else {
      console.log('❌ Warning: Could not verify constraint creation');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
