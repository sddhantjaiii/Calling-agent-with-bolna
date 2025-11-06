#!/usr/bin/env node

/**
 * Cleanup Orphaned Active Calls
 * Removes active_calls records that don't have corresponding calls records
 */

const { pool } = require('./backend/src/config/database');

async function cleanupOrphanedActiveCalls() {
  try {
    console.log('🧹 Cleaning up orphaned active_calls records...');
    
    // Find orphaned active_calls (active_calls without corresponding calls records)
    const orphanedResult = await pool.query(`
      SELECT ac.id, ac.user_id, ac.call_type, ac.started_at
      FROM active_calls ac
      LEFT JOIN calls c ON c.id = ac.id
      WHERE c.id IS NULL
    `);
    
    console.log(`Found ${orphanedResult.rows.length} orphaned active_calls records:`);
    orphanedResult.rows.forEach(row => {
      console.log(`  - ID: ${row.id}, User: ${row.user_id}, Type: ${row.call_type}, Started: ${row.started_at}`);
    });
    
    if (orphanedResult.rows.length > 0) {
      // Delete orphaned records
      const deleteResult = await pool.query(`
        DELETE FROM active_calls 
        WHERE id IN (
          SELECT ac.id
          FROM active_calls ac
          LEFT JOIN calls c ON c.id = ac.id
          WHERE c.id IS NULL
        )
        RETURNING id
      `);
      
      console.log(`✅ Deleted ${deleteResult.rows.length} orphaned active_calls records`);
    } else {
      console.log('✅ No orphaned records found');
    }
    
    // Show remaining active calls
    const remainingResult = await pool.query(`
      SELECT ac.*, c.status as call_status
      FROM active_calls ac
      LEFT JOIN calls c ON c.id = ac.id
      ORDER BY ac.started_at
    `);
    
    console.log(`\n📊 Remaining active_calls (${remainingResult.rows.length}):`);
    remainingResult.rows.forEach(row => {
      console.log(`  - ID: ${row.id}, User: ${row.user_id}, Type: ${row.call_type}, Call Status: ${row.call_status || 'N/A'}`);
    });
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  cleanupOrphanedActiveCalls();
}

module.exports = { cleanupOrphanedActiveCalls };