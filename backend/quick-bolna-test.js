/**
 * Quick Bolna.ai Connection Test Script
 * Simple JS version to test basic API connectivity
 */

require('dotenv').config();
const axios = require('axios');

async function quickBolnaTest() {
  console.log('🚀 Quick Bolna.ai API Connection Test');
  console.log('=====================================\n');

  const apiKey = process.env.BOLNA_API_KEY;
  const baseUrl = process.env.BOLNA_BASE_URL || 'https://api.bolna.ai';

  if (!apiKey) {
    console.log('❌ BOLNA_API_KEY not found in environment variables');
    return false;
  }

  console.log(`✅ API Key found: ${apiKey.substring(0, 10)}...`);
  console.log(`✅ Base URL: ${baseUrl}\n`);

  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  let testsPassed = 0;
  let totalTests = 0;

  // Test 1: Connection Test (Get Voices)
  console.log('Test 1: Connection Test (Get Voices)');
  console.log('------------------------------------');
  totalTests++;
  try {
    // Try different voice endpoints starting with the correct one
    let response;
    try {
      response = await client.get('/me/voices'); // Try correct endpoint first
    } catch (e) {
      console.log('   /me/voices failed, trying /voice');
      try {
        response = await client.get('/voice');
      } catch (e2) {
        console.log('   /voice failed, trying /voices');
        try {
          response = await client.get('/voices');
        } catch (e3) {
          console.log('   /voices failed, trying /v2/voices');
          response = await client.get('/v2/voices');
        }
      }
    }
    if (response.status === 200 && response.data) {
      console.log(`✅ Connection successful! Status: ${response.status}`);
      if (Array.isArray(response.data) && response.data.length > 0) {
        console.log(`✅ Found ${response.data.length} voices`);
        testsPassed++;
      } else {
        console.log('⚠️  Connected but no voices found');
        testsPassed++; // Still consider connection successful
      }
    } else {
      console.log(`❌ Unexpected response: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
  console.log('');

  // Test 2: Agent List (to see if API structure is correct)
  console.log('Test 2: Agent List Test');
  console.log('-----------------------');
  totalTests++;
  try {
    const response = await client.get('/v2/agent/all');
    if (response.status === 200) {
      console.log(`✅ Agent list endpoint accessible! Status: ${response.status}`);
      const agents = response.data;
      if (Array.isArray(agents)) {
        console.log(`✅ Found ${agents.length} agents`);
      } else {
        console.log('⚠️  Unexpected response format');
      }
      testsPassed++;
    } else {
      console.log(`❌ Unexpected response: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Agent list failed: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
  console.log('');

  // Test 3: Create Test Agent (minimal payload)
  console.log('Test 3: Create Test Agent');
  console.log('-------------------------');
  totalTests++;
  let testAgentId = null;
  try {
    const minimalAgentData = {
      agent_config: {
        agent_name: 'Quick Test Agent - ' + Date.now(),
        agent_welcome_message: 'Hello! This is a quick test.',
        webhook_url: 'https://test.com/webhook',
        tasks: [{
          task_type: 'conversation',
          tools_config: {
            llm_agent: {
              agent_type: 'simple_llm_agent',
              agent_flow_type: 'streaming',
              llm_config: {
                agent_flow_type: 'streaming',
                provider: 'openai',
                family: 'openai',
                model: 'gpt-3.5-turbo',
                max_tokens: 500,
                temperature: 0.7,
                request_json: false
              }
            },
            synthesizer: {
              provider: 'polly',
              provider_config: {
                voice: 'Joanna',
                engine: 'generative',
                sampling_rate: '8000',
                language: 'en-US'
              },
              stream: true,
              buffer_size: 150,
              audio_format: 'wav'
            },
            transcriber: {
              provider: 'deepgram',
              model: 'nova-2',
              language: 'en',
              stream: true,
              sampling_rate: 8000,
              encoding: 'linear16',
              endpointing: 500
            },
            input: {
              provider: 'twilio',
              format: 'wav'
            },
            output: {
              provider: 'twilio',
              format: 'wav'
            }
          },
          toolchain: {
            execution: 'parallel',
            pipelines: [['transcriber', 'llm', 'synthesizer']]
          },
          task_config: {
            hangup_after: 300,
            ambient_sound: 'none',
            ambient_sound_volume: 0.1,
            interruption_backoff_period: 1.0,
            backchanneling: false,
            optimize_latency: true,
            incremental: false,
            normalize_audio: true
          }
        }]
      },
      agent_prompts: {
        task_1: {
          system_prompt: 'You are a helpful AI assistant for testing purposes.'
        }
      }
    };

    const response = await client.post('/v2/agent', minimalAgentData);
    if (response.status === 200 || response.status === 201) {
      console.log(`✅ Agent created successfully! Status: ${response.status}`);
      if (response.data && response.data.agent_id) {
        testAgentId = response.data.agent_id;
        console.log(`✅ Agent ID: ${testAgentId}`);
        testsPassed++;
      } else {
        console.log('⚠️  Agent created but no agent_id returned');
        console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      }
    } else {
      console.log(`❌ Unexpected response: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Agent creation failed: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }
  console.log('');

  // Test 4: Delete Test Agent (if created)
  if (testAgentId) {
    console.log('Test 4: Delete Test Agent');
    console.log('-------------------------');
    totalTests++;
    try {
      const response = await client.delete(`/v2/agent/${testAgentId}`);
      if (response.status === 200 || response.status === 204) {
        console.log(`✅ Agent deleted successfully! Status: ${response.status}`);
        testsPassed++;
      } else {
        console.log(`❌ Unexpected response: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ Agent deletion failed: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }
    console.log('');
  }

  // Summary
  console.log('📊 Quick Test Summary');
  console.log('====================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${testsPassed} (${Math.round((testsPassed / totalTests) * 100)}%)`);
  console.log(`Failed: ${totalTests - testsPassed} (${Math.round(((totalTests - testsPassed) / totalTests) * 100)}%)`);
  
  const success = testsPassed === totalTests;
  if (success) {
    console.log('\n🎉 All quick tests passed! Bolna.ai API is working correctly.');
  } else {
    console.log(`\n⚠️  ${totalTests - testsPassed} test(s) failed. Review configuration and API setup.`);
  }
  
  return success;
}

// Run the quick test
if (require.main === module) {
  quickBolnaTest()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Quick test error:', error);
      process.exit(1);
    });
}

module.exports = { quickBolnaTest };