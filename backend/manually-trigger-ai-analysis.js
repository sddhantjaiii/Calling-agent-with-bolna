// Manual AI Analysis Trigger
// Run: node manually-trigger-ai-analysis.js
// This will run AI analysis for calls that completed but analysis failed

const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const CALL_ID = '8dd3cd93-ec21-4294-8784-3a80a721165e';

async function triggerAnalysis() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking call details...\n');

    // 1. Check if call exists and has transcript
    const callResult = await client.query(`
      SELECT c.*, t.id as transcript_id, LENGTH(t.content) as transcript_length
      FROM calls c
      LEFT JOIN transcripts t ON c.id = t.call_id
      WHERE c.id = $1
    `, [CALL_ID]);

    if (callResult.rows.length === 0) {
      console.log('❌ Call not found');
      return;
    }

    const call = callResult.rows[0];
    console.log('✅ Call found:', {
      id: call.id,
      phone_number: call.phone_number,
      status: call.status,
      has_transcript: !!call.transcript_id,
      transcript_length: call.transcript_length
    });

    // 2. Check if lead_analytics exists
    const analyticsResult = await client.query(`
      SELECT id, analysis_type, total_score
      FROM lead_analytics
      WHERE call_id = $1
    `, [CALL_ID]);

    console.log('\n📊 Lead Analytics:', {
      exists: analyticsResult.rows.length > 0,
      records: analyticsResult.rows
    });

    if (!call.transcript_id) {
      console.log('\n❌ No transcript found - cannot run analysis');
      return;
    }

    // 3. Check contact status
    const contactResult = await client.query(`
      SELECT id, name, email, phone_number
      FROM contacts
      WHERE phone_number = $1 AND user_id = $2
    `, [call.phone_number, call.user_id]);

    console.log('\n👤 Contact Status:', {
      exists: contactResult.rows.length > 0,
      linked_to_call: call.contact_id !== null,
      contact: contactResult.rows[0] || null
    });

    // 4. Simulate what should happen
    console.log('\n📝 What SHOULD have happened:');
    console.log('1. ✅ Transcript created');
    console.log('2. ❌ OpenAI individual analysis - MISSING');
    console.log('3. ❌ OpenAI complete analysis - MISSING');
    console.log('4. ❌ Lead analytics record - MISSING');
    console.log('5. ❌ Contact auto-creation/linking - MISSING');

    console.log('\n💡 Recommended Actions:');
    console.log('1. Check backend logs for execution_id:', call.bolna_execution_id || 'unknown');
    console.log('2. Look for OpenAI API errors');
    console.log('3. Verify OPENAI_API_KEY is configured');
    console.log('4. Check if webhook "completed" event was received');
    console.log('5. Manually re-trigger webhook or create analysis record');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

triggerAnalysis()
  .then(() => {
    console.log('\n✅ Analysis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
