#!/usr/bin/env node

/**
 * Post-build script to copy migration files to dist/
 * This runs after TypeScript compilation to ensure SQL files are available in production
 */

const fs = require('fs');
const path = require('path');

const srcMigrations = path.join(__dirname, '..', 'src', 'migrations');
const distMigrations = path.join(__dirname, '..', 'dist', 'migrations');

console.log('📦 Post-build: Copying migration files...');
console.log(`   Source: ${srcMigrations}`);
console.log(`   Destination: ${distMigrations}`);

try {
  // Check if source directory exists
  if (!fs.existsSync(srcMigrations)) {
    console.error('❌ Source migrations directory does not exist:', srcMigrations);
    process.exit(1);
  }

  // Copy migrations directory recursively
  fs.cpSync(srcMigrations, distMigrations, { recursive: true });

  // Count copied files
  const files = fs.readdirSync(distMigrations).filter(f => f.endsWith('.sql'));
  console.log(`✅ Copied ${files.length} migration files to dist/migrations`);

} catch (error) {
  console.error('❌ Failed to copy migration files:', error.message);
  process.exit(1);
}
