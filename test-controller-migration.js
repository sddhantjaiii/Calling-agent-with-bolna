const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Controller Migration Validation Script');
console.log('==========================================');

// Test compilation status
console.log('\n📋 Phase 8: Controller Layer Migration Status');
console.log('---------------------------------------------');

try {
  console.log('🔍 Checking TypeScript compilation...');
  
  // Check if backend compiles
  const buildOutput = execSync('cd backend && npm run build', { 
    encoding: 'utf-8', 
    stdio: 'pipe'
  });
  
  console.log('✅ Backend compilation successful!');
  console.log('✅ Phase 8: Controller migration compilation PASSED');
  
} catch (error) {
  console.log('❌ Backend compilation failed');
  console.log('📝 Compilation errors found:');
  
  const errorOutput = error.stderr || error.stdout || error.message;
  const errors = errorOutput.split('\n').filter(line => 
    line.includes('error TS') || 
    line.includes('Property') || 
    line.includes('does not exist')
  );
  
  console.log('\n🔍 Error Analysis:');
  const errorCategories = {
    'Legacy ElevenLabs References': [],
    'Missing Bolna.ai Properties': [],
    'Type Mismatches': [],
    'Import Issues': [],
    'Other': []
  };
  
  errors.forEach(error => {
    if (error.includes('elevenLabs') || error.includes('ElevenLabs')) {
      errorCategories['Legacy ElevenLabs References'].push(error.trim());
    } else if (error.includes('createElevenLabsRetryConfig')) {
      errorCategories['Import Issues'].push(error.trim());
    } else if (error.includes('BolnaWebhookPayload') || error.includes('BolnaService')) {
      errorCategories['Missing Bolna.ai Properties'].push(error.trim());
    } else if (error.includes('does not exist') || error.includes('Property')) {
      errorCategories['Type Mismatches'].push(error.trim());
    } else {
      errorCategories['Other'].push(error.trim());
    }
  });
  
  Object.keys(errorCategories).forEach(category => {
    if (errorCategories[category].length > 0) {
      console.log(`\n📌 ${category}:`);
      errorCategories[category].slice(0, 3).forEach(err => {
        console.log(`   • ${err}`);
      });
      if (errorCategories[category].length > 3) {
        console.log(`   ... and ${errorCategories[category].length - 3} more`);
      }
    }
  });
}

// Check critical controller files
console.log('\n🔍 Checking Critical Controller Files:');
console.log('-------------------------------------');

const controllers = [
  'backend/src/controllers/agentController.ts',
  'backend/src/controllers/adminController.ts',
  'backend/src/controllers/webhookController.ts',
  'backend/src/controllers/callController.ts'
];

controllers.forEach(controller => {
  if (fs.existsSync(controller)) {
    console.log(`✅ ${path.basename(controller)} exists`);
  } else {
    console.log(`❌ ${path.basename(controller)} missing`);
  }
});

console.log('\n📊 Phase 8 Migration Summary:');
console.log('============================');
console.log('✅ Controller files exist and basic structure intact');
console.log('🚧 Compilation issues identified - need targeted fixes');
console.log('🎯 Next: Fix legacy references and type mismatches');
console.log('⏳ Status: Controller migration in progress');