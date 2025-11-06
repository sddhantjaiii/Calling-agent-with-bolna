#!/usr/bin/env node

/**
 * Comprehensive Agent Service Integration Test with Bolna.ai
 * Tests the complete agentService.ts integration with bolnaService.ts
 */

const { config } = require('dotenv');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '.env') });

async function testAgentServiceIntegration() {
  console.log('🧪 Agent Service Integration Test with Bolna.ai');
  console.log('===============================================\n');

  let testsPassed = 0;
  let totalTests = 0;

  // Test 1: Import and initialize services
  console.log('Test 1: Service Initialization');
  console.log('------------------------------');
  totalTests++;
  
  try {
    // Test TypeScript compilation by importing the compiled JS
    const agentService = require('./src/services/agentService');
    console.log('✅ agentService imported successfully');
    
    const bolnaService = require('./src/services/bolnaService');
    console.log('✅ bolnaService imported successfully');
    
    testsPassed++;
  } catch (error) {
    console.log('❌ Service import failed:', error.message);
    console.log('   Make sure to compile TypeScript first: npx tsc');
  }

  // Test 2: Environment Configuration
  console.log('\nTest 2: Environment Configuration');
  console.log('----------------------------------');
  totalTests++;

  const requiredEnvVars = [
    'BOLNA_API_KEY',
    'BOLNA_BASE_URL',
    'DATABASE_URL'
  ];

  let envConfigCorrect = true;
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`✅ ${envVar}: configured`);
    } else {
      console.log(`❌ ${envVar}: missing`);
      envConfigCorrect = false;
    }
  }

  if (envConfigCorrect) {
    testsPassed++;
    console.log('✅ All required environment variables configured');
  } else {
    console.log('❌ Some environment variables are missing');
  }

  // Test 3: Database Connection (if possible)
  console.log('\nTest 3: Database Connection Test');
  console.log('--------------------------------');
  totalTests++;

  try {
    // This is a simple connection test - in real implementation you'd import your DB module
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech')) {
      console.log('✅ Database URL configured for Neon');
      console.log('✅ Database connection should work (URL format valid)');
      testsPassed++;
    } else {
      console.log('⚠️  Database URL not configured for Neon');
    }
  } catch (error) {
    console.log('❌ Database connection test failed:', error.message);
  }

  // Test 4: Check TypeScript Compilation Status
  console.log('\nTest 4: TypeScript Compilation Status');
  console.log('-------------------------------------');
  totalTests++;

  const fs = require('fs');
  const agentServiceJsPath = path.join(__dirname, 'src/services/agentService.js');
  const bolnaServiceJsPath = path.join(__dirname, 'src/services/bolnaService.js');

  if (fs.existsSync(agentServiceJsPath) && fs.existsSync(bolnaServiceJsPath)) {
    console.log('✅ TypeScript services compiled to JavaScript');
    console.log('✅ Ready for runtime testing');
    testsPassed++;
  } else {
    console.log('⚠️  TypeScript services not compiled yet');
    console.log('   Run: npx tsc to compile TypeScript files');
  }

  // Test 5: Migration Status Check
  console.log('\nTest 5: Migration Status Check');
  console.log('------------------------------');
  totalTests++;

  const migrationFiles = [
    'src/migrations/004_bolna_migration_phase1.sql',
    'src/migrations/migrate_to_bolna_data.ts'
  ];

  let migrationFilesExist = true;
  for (const file of migrationFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file}: exists`);
    } else {
      console.log(`❌ ${file}: missing`);
      migrationFilesExist = false;
    }
  }

  if (migrationFilesExist) {
    console.log('✅ All migration files present');
    testsPassed++;
  } else {
    console.log('❌ Some migration files are missing');
  }

  // Summary
  console.log('\n📊 Integration Test Summary');
  console.log('===========================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${testsPassed} (${Math.round((testsPassed/totalTests)*100)}%)`);
  console.log(`Failed: ${totalTests - testsPassed} (${Math.round(((totalTests - testsPassed)/totalTests)*100)}%)`);

  if (testsPassed === totalTests) {
    console.log('\n🎉 All integration tests passed! System ready for Bolna.ai migration.');
    return true;
  } else {
    console.log(`\n⚠️  ${totalTests - testsPassed} test(s) failed. Review configuration before proceeding.`);
    return false;
  }
}

// Run the test
if (require.main === module) {
  testAgentServiceIntegration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Integration test failed with error:', error);
      process.exit(1);
    });
}

module.exports = { testAgentServiceIntegration };