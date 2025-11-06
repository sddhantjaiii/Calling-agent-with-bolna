#!/usr/bin/env node

import dotenv from 'dotenv';
import database from '../config/database';

dotenv.config();

async function markMigrationsAsExecuted() {
  console.log('📝 Marking Bolna migrations as executed...\n');

  try {
    // Mark migrations as executed
    const result = await database.query(`
      INSERT INTO migrations (filename, executed_at)
      VALUES 
        ('005_bolna_migration_phase2_complete.sql', NOW()),
        ('006_complete_elevenlabs_removal.sql', NOW())
      ON CONFLICT (filename) DO NOTHING
      RETURNING filename, executed_at;
    `);

    if (result.rows.length > 0) {
      console.log('✅ Migrations marked as executed:');
      result.rows.forEach((row: any) => {
        console.log(`   - ${row.filename} (${row.executed_at})`);
      });
    } else {
      console.log('ℹ️  Migrations were already marked as executed');
    }
  } catch (error) {
    console.error('❌ Error marking migrations:', error);
    process.exit(1);
  } finally {
    await database.close();
  }
}

markMigrationsAsExecuted();
