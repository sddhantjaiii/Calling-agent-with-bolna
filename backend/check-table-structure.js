const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load environment variables
dotenv.config();

async function checkTableStructure() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Checking calls table structure...');
    
    // Get table columns
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'calls' 
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 Current calls table columns:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    // Check for specific columns
    const columnNames = result.rows.map(row => row.column_name);
    console.log('\n🔍 Checking for conversation ID columns:');
    console.log(`  - elevenlabs_conversation_id: ${columnNames.includes('elevenlabs_conversation_id') ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    console.log(`  - bolna_conversation_id: ${columnNames.includes('bolna_conversation_id') ? '✅ EXISTS' : '❌ NOT FOUND'}`);
    console.log(`  - bolna_execution_id: ${columnNames.includes('bolna_execution_id') ? '✅ EXISTS' : '❌ NOT FOUND'}`);

  } catch (error) {
    console.error('❌ Error checking table structure:', error);
  } finally {
    await pool.end();
  }
}

checkTableStructure().catch(console.error);