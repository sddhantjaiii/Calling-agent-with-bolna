// Run migration to add user-specific OpenAI prompt IDs
// Usage: node backend/src/migrations/run-add-user-openai-prompts.js

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function runMigration() {
  console.log('🚀 Adding user-specific OpenAI prompt ID columns...\n');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'add-user-openai-prompts.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the migration
    console.log('📝 Executing migration...\n');
    await pool.query(sql);

    // Verify the changes
    console.log('✅ Migration completed successfully!\n');
    
    console.log('🔍 Verifying columns...\n');
    const checkColumns = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('openai_individual_prompt_id', 'openai_complete_prompt_id')
      ORDER BY column_name
    `);

    console.log('📋 Columns added:');
    checkColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}`);
      console.log(`     Type: ${col.data_type}`);
      console.log(`     Nullable: ${col.is_nullable}`);
      console.log(`     Default: ${col.column_default || 'NULL'}\n`);
    });

    // Check how many users were populated
    const userCount = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(openai_individual_prompt_id) as users_with_individual_prompt,
        COUNT(openai_complete_prompt_id) as users_with_complete_prompt
      FROM users
    `);

    console.log('👥 User statistics:');
    console.log(`   Total users: ${userCount.rows[0].total_users}`);
    console.log(`   With individual prompt: ${userCount.rows[0].users_with_individual_prompt}`);
    console.log(`   With complete prompt: ${userCount.rows[0].users_with_complete_prompt}\n`);

    console.log('🎉 Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update User model interface');
    console.log('2. Update OpenAI extraction service to use user prompts');
    console.log('3. Add API endpoints for user prompt management');
    console.log('4. Add UI in Settings and Admin pages');
    console.log('5. Remove OPENAI_MODEL and OPENAI_TIMEOUT from .env');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
