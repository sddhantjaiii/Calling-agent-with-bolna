/**
 * Call Service Migration Status Check
 * Validates that the call service has been enhanced for Bolna.ai
 */

const fs = require('fs');
const path = require('path');

function checkCallServiceMigration() {
  console.log('🔍 Call Service Migration Status Check');
  console.log('='.repeat(50));

  try {
    // Check if callService.ts has been updated
    const callServicePath = path.join(__dirname, 'backend', 'src', 'services', 'callService.ts');
    
    if (!fs.existsSync(callServicePath)) {
      console.log('❌ callService.ts not found');
      return;
    }

    const callServiceContent = fs.readFileSync(callServicePath, 'utf8');

    // Check for Bolna.ai integration indicators
    const checks = [
      {
        name: 'BolnaService import',
        pattern: /import.*bolnaService.*from.*bolnaService/,
        required: true
      },
      {
        name: 'CallInitiationRequest interface',
        pattern: /interface CallInitiationRequest/,
        required: true
      },
      {
        name: 'initiateCall method',
        pattern: /static async initiateCall/,
        required: true
      },
      {
        name: 'stopCall method', 
        pattern: /static async stopCall/,
        required: true
      },
      {
        name: 'getCallStatus method',
        pattern: /static async getCallStatus/,
        required: true
      },
      {
        name: 'bolna_conversation_id usage',
        pattern: /bolna_conversation_id/,
        required: true
      },
      {
        name: 'Bolna.ai API integration',
        pattern: /bolnaService\.makeCall/,
        required: true
      }
    ];

    let passedChecks = 0;
    let totalChecks = checks.length;

    console.log('\n📋 Code Analysis Results:');
    
    checks.forEach(check => {
      const found = check.pattern.test(callServiceContent);
      if (found) {
        console.log(`✅ ${check.name}`);
        passedChecks++;
      } else {
        console.log(`${check.required ? '❌' : '⚠️'} ${check.name}`);
      }
    });

    // Check other related files
    console.log('\n📋 Related File Checks:');
    
    // Check if webhookService still has ElevenLabs references
    const webhookServicePath = path.join(__dirname, 'backend', 'src', 'services', 'webhookService.ts');
    if (fs.existsSync(webhookServicePath)) {
      const webhookContent = fs.readFileSync(webhookServicePath, 'utf8');
      const hasElevenLabsRefs = /ElevenLabsWebhookPayload|elevenlabs_conversation_id|payload\.conversation_id/i.test(webhookContent);
      
      if (hasElevenLabsRefs) {
        console.log('❌ webhookService.ts still has ElevenLabs references');
      } else {
        console.log('✅ webhookService.ts migrated to Bolna.ai');
      }
    }

    // Check if frontend still uses ElevenLabs
    const contactListPath = path.join(__dirname, 'Frontend', 'src', 'components', 'contacts', 'ContactList.tsx');
    if (fs.existsSync(contactListPath)) {
      const contactContent = fs.readFileSync(contactListPath, 'utf8');
      const hasElevenLabsAPI = /api\.elevenlabs\.io/i.test(contactContent);
      
      if (hasElevenLabsAPI) {
        console.log('❌ Frontend still uses ElevenLabs API');
      } else {
        console.log('✅ Frontend migrated to Bolna.ai');
      }
    }

    // Summary
    console.log('\n📊 MIGRATION SUMMARY:');
    console.log('='.repeat(50));
    console.log(`Call Service Enhancement: ${passedChecks}/${totalChecks} checks passed`);
    
    if (passedChecks === totalChecks) {
      console.log('🎉 Call Service Migration: COMPLETE');
    } else if (passedChecks > totalChecks * 0.7) {
      console.log('🚧 Call Service Migration: IN PROGRESS');
    } else {
      console.log('❌ Call Service Migration: INCOMPLETE');
    }

    console.log('\n🎯 NEXT STEPS:');
    console.log('1. Complete webhook service migration to Bolna.ai format');
    console.log('2. Update frontend to use new call service methods');
    console.log('3. Test call initiation with live Bolna.ai API');
    console.log('4. Update plan.md and database.md with progress');

  } catch (error) {
    console.error('💥 Error checking migration status:', error.message);
  }
}

// Run the check
checkCallServiceMigration();