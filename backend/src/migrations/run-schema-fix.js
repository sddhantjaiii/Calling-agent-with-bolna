// Node.js script to fix lead_analytics schema
// Run this with: node backend/src/migrations/run-schema-fix.js

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function fixSchema() {
  console.log('🔧 Fixing lead_analytics schema for Bolna + OpenAI...\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('📡 Connecting to database...');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // 1. Remove conflicting UNIQUE constraint on call_id
    console.log('\n1️⃣ Fixing call_id constraint...');
    try {
      await pool.query(`
        ALTER TABLE lead_analytics 
        DROP CONSTRAINT IF EXISTS unique_call_id_lead_analytics
      `);
      console.log('   ✅ Removed global call_id unique constraint');
    } catch (error) {
      console.log('   ⚠️ Constraint may not exist:', error.message);
    }

    // Create partial unique index for individual analysis only
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_call_id_individual_analytics 
      ON lead_analytics (call_id)
      WHERE analysis_type = 'individual'
    `);
    console.log('   ✅ Created partial unique index for individual analysis');

    // 2. Keep demo_book_datetime as TIMESTAMP (no change needed)
    console.log('\n2️⃣ Skipping demo_book_datetime - keeping as TIMESTAMP WITH TIME ZONE');
    console.log('   ℹ️  OpenAI returns ISO 8601 strings, code will handle conversion');

    // 3. Increase smart_notification length
    console.log('\n3️⃣ Increasing smart_notification length...');
    await pool.query(`
      ALTER TABLE lead_analytics 
      ALTER COLUMN smart_notification TYPE TEXT
    `);
    console.log('   ✅ Changed smart_notification to TEXT');

    // 4. Update analysis_source default
    console.log('\n4️⃣ Updating analysis_source...');
    await pool.query(`
      ALTER TABLE lead_analytics 
      ALTER COLUMN analysis_source SET DEFAULT 'bolna'
    `);
    console.log('   ✅ Updated default to "bolna"');

    const updateResult = await pool.query(`
      UPDATE lead_analytics 
      SET analysis_source = 'bolna' 
      WHERE analysis_source = 'elevenlabs' OR analysis_source IS NULL
    `);
    console.log(`   ✅ Updated ${updateResult.rowCount} existing records to "bolna"`);

    // 5. Add composite indexes
    console.log('\n5️⃣ Adding performance indexes...');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_analytics_phone_type_timestamp 
      ON lead_analytics (phone_number, analysis_type, analysis_timestamp DESC)
    `);
    console.log('   ✅ Created phone_type_timestamp index');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_analytics_user_type_timestamp 
      ON lead_analytics (user_id, analysis_type, analysis_timestamp DESC)
    `);
    console.log('   ✅ Created user_type_timestamp index');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_analytics_score_filters 
      ON lead_analytics (user_id, total_score DESC, lead_status_tag)
      WHERE analysis_type = 'complete'
    `);
    console.log('   ✅ Created score_filters index');

    // 6. Verify changes
    console.log('\n6️⃣ Verifying changes...');
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(CASE WHEN analysis_type = 'individual' THEN 1 END) as individual_count,
        COUNT(CASE WHEN analysis_type = 'complete' THEN 1 END) as complete_count,
        COUNT(CASE WHEN analysis_source = 'bolna' THEN 1 END) as bolna_records,
        COUNT(CASE WHEN analysis_source = 'elevenlabs' THEN 1 END) as elevenlabs_records
      FROM lead_analytics
    `);

    const stats = statsResult.rows[0];
    console.log('\n📊 Database Statistics:');
    console.log(`   Total records: ${stats.total_records}`);
    console.log(`   Individual analyses: ${stats.individual_count}`);
    console.log(`   Complete analyses: ${stats.complete_count}`);
    console.log(`   Bolna records: ${stats.bolna_records}`);
    console.log(`   ElevenLabs records: ${stats.elevenlabs_records}`);

    // Show indexes
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'lead_analytics'
      ORDER BY indexname
    `);

    console.log('\n📑 Indexes on lead_analytics:');
    indexResult.rows.forEach(row => {
      console.log(`   - ${row.indexname}`);
    });

    console.log('\n🎉 Schema fixes completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Restart your backend server');
    console.log('2. Make test calls to verify everything works');
    console.log('3. Check that complete analysis upserts correctly');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the migration
fixSchema()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
