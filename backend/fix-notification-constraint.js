// Quick fix script to add meeting_booked to notifications constraint
// Run: node fix-notification-constraint.js

const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function fixConstraint() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing notifications constraint...\n');

    // Drop existing constraint
    console.log('1️⃣ Dropping old constraint...');
    await client.query(`
      ALTER TABLE notifications 
      DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
    `);
    console.log('✅ Old constraint dropped\n');

    // Add new constraint with meeting_booked
    console.log('2️⃣ Adding new constraint with meeting_booked...');
    await client.query(`
      ALTER TABLE notifications 
      ADD CONSTRAINT notifications_notification_type_check 
      CHECK (notification_type IN (
        'email_verification',
        'email_verification_reminder',
        'credit_low_15',
        'credit_low_5',
        'credit_exhausted_0',
        'credits_added',
        'campaign_summary',
        'meeting_booked',
        'marketing'
      ));
    `);
    console.log('✅ New constraint added\n');

    // Verify
    console.log('3️⃣ Verifying constraint...');
    const result = await client.query(`
      SELECT constraint_name, check_clause 
      FROM information_schema.check_constraints 
      WHERE constraint_name = 'notifications_notification_type_check';
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Constraint verified:\n');
      console.log(result.rows[0]);
    } else {
      console.log('❌ Constraint not found!');
    }

    console.log('\n🎉 Fix completed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing constraint:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixConstraint()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
