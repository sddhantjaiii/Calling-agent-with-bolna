/**
 * One-time cleanup script to remove existing completed/failed queue items
 * After this runs, the auto-delete implementation will handle future items
 */

const db = require('./dist/config/database').default;

async function cleanup() {
  try {
    console.log('🧹 Cleaning up completed and failed queue items...\n');

    const result = await db.query(`
      DELETE FROM call_queue 
      WHERE status IN ('completed', 'failed')
      RETURNING id, status, created_at, completed_at
    `);

    console.log(`✅ Deleted ${result.rowCount} queue items:`);
    console.table(result.rows);

    // Verify clean state
    const remaining = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM call_queue 
      GROUP BY status 
      ORDER BY count DESC
    `);

    console.log('\n📊 Remaining queue items:');
    console.table(remaining.rows);

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  } finally {
    process.exit();
  }
}

cleanup();
