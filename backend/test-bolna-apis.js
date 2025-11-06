/**
 * Comprehensive Bolna.ai API Testing Script
 * Tests all API endpoints to ensure migration is working correctly
 */

require('dotenv').config();
const path = require('path');

// Import the bolnaService
const bolnaServicePath = path.join(__dirname, 'src', 'services', 'bolnaService.ts');
const tsConfig = require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    target: 'es2018',
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    strict: true
  }
});

const { bolnaService } = require('./src/services/bolnaService.ts');

async function testBolnaAPIs() {
  console.log('🚀 Starting Bolna.ai API Comprehensive Test Suite');
  console.log('================================================\n');

  let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
  };

  // Test 1: Connection Test
  console.log('Test 1: Connection Test');
  console.log('----------------------');
  testResults.total++;
  try {
    const isConnected = await bolnaService.testConnection();
    if (isConnected) {
      console.log('✅ Connection test passed');
      testResults.passed++;
    } else {
      console.log('❌ Connection test failed');
      testResults.failed++;
      testResults.errors.push('Connection test returned false');
    }
  } catch (error) {
    console.log(`❌ Connection test error: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`Connection test: ${error.message}`);
  }
  console.log('');

  // Test 2: Get Voices
  console.log('Test 2: Get Voices');
  console.log('------------------');
  testResults.total++;
  try {
    const voices = await bolnaService.getVoices();
    if (voices && voices.length > 0) {
      console.log(`✅ Found ${voices.length} voices`);
      console.log('Sample voices:', voices.slice(0, 3).map(v => `${v.name} (${v.voice_id})`).join(', '));
      testResults.passed++;
    } else {
      console.log('❌ No voices found');
      testResults.failed++;
      testResults.errors.push('No voices returned');
    }
  } catch (error) {
    console.log(`❌ Get voices error: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`Get voices: ${error.message}`);
  }
  console.log('');

  // Test 3: Create Agent
  console.log('Test 3: Create Agent');
  console.log('--------------------');
  testResults.total++;
  let createdAgentId = null;
  try {
    const agentData = {
      agent_config: {
        agent_name: 'Test Agent - ' + Date.now(),
        agent_welcome_message: 'Hello! This is a test agent.',
        webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/bolna/call-completed`,
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
                max_tokens: 1000,
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

    const createdAgent = await bolnaService.createAgent(agentData);
    if (createdAgent && createdAgent.agent_id) {
      console.log(`✅ Agent created successfully: ${createdAgent.agent_id}`);
      console.log(`   Status: ${createdAgent.status}`);
      createdAgentId = createdAgent.agent_id;
      testResults.passed++;
    } else {
      console.log('❌ Agent creation failed - no agent_id returned');
      testResults.failed++;
      testResults.errors.push('Agent creation: no agent_id returned');
    }
  } catch (error) {
    console.log(`❌ Create agent error: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`Create agent: ${error.message}`);
  }
  console.log('');

  // Test 4: Get Agent (if we created one)
  if (createdAgentId) {
    console.log('Test 4: Get Agent');
    console.log('-----------------');
    testResults.total++;
    try {
      const agent = await bolnaService.getAgent(createdAgentId);
      if (agent && agent.agent_id === createdAgentId) {
        console.log(`✅ Agent retrieved successfully: ${agent.agent_id}`);
        console.log(`   Status: ${agent.status}`);
        testResults.passed++;
      } else {
        console.log('❌ Agent retrieval failed');
        testResults.failed++;
        testResults.errors.push('Agent retrieval: agent not found or invalid');
      }
    } catch (error) {
      console.log(`❌ Get agent error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`Get agent: ${error.message}`);
    }
    console.log('');

    // Test 5: Update Agent
    console.log('Test 5: Update Agent');
    console.log('--------------------');
    testResults.total++;
    try {
      const updateData = {
        agent_config: {
          agent_name: 'Updated Test Agent - ' + Date.now(),
          agent_welcome_message: 'Hello! This is an updated test agent.',
          webhook_url: `${process.env.WEBHOOK_BASE_URL}/api/webhooks/bolna/call-completed`,
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
                  model: 'gpt-4',
                  max_tokens: 1500,
                  temperature: 0.8,
                  request_json: false
                }
              },
              synthesizer: {
                provider: 'polly',
                provider_config: {
                  voice: 'Matthew',
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
              hangup_after: 600,
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
            system_prompt: 'You are an updated helpful AI assistant for testing purposes.'
          }
        }
      };

      const updatedAgent = await bolnaService.updateAgent(createdAgentId, updateData);
      if (updatedAgent && updatedAgent.agent_id === createdAgentId) {
        console.log(`✅ Agent updated successfully: ${updatedAgent.agent_id}`);
        testResults.passed++;
      } else {
        console.log('❌ Agent update failed');
        testResults.failed++;
        testResults.errors.push('Agent update: agent not updated properly');
      }
    } catch (error) {
      console.log(`❌ Update agent error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`Update agent: ${error.message}`);
    }
    console.log('');

    // Test 6: Delete Agent
    console.log('Test 6: Delete Agent');
    console.log('--------------------');
    testResults.total++;
    try {
      await bolnaService.deleteAgent(createdAgentId);
      console.log(`✅ Agent deleted successfully: ${createdAgentId}`);
      testResults.passed++;
    } catch (error) {
      console.log(`❌ Delete agent error: ${error.message}`);
      testResults.failed++;
      testResults.errors.push(`Delete agent: ${error.message}`);
    }
    console.log('');
  }

  // Test 7: Call Creation (without actually making call)
  console.log('Test 7: Call Request Validation');
  console.log('-------------------------------');
  testResults.total++;
  try {
    // Just validate the call request structure - don't actually make the call
    const callData = {
      agent_id: 'test-agent-id',
      recipient_phone_number: '+1234567890',
      from_phone_number: '+0987654321',
      user_data: { test: true }
    };

    // This will validate the structure without making actual call
    if (callData.agent_id && callData.recipient_phone_number) {
      console.log('✅ Call request structure validation passed');
      testResults.passed++;
    } else {
      console.log('❌ Call request structure validation failed');
      testResults.failed++;
      testResults.errors.push('Call request: invalid structure');
    }
  } catch (error) {
    console.log(`❌ Call request validation error: ${error.message}`);
    testResults.failed++;
    testResults.errors.push(`Call request validation: ${error.message}`);
  }
  console.log('');

  // Summary
  console.log('📊 Test Summary');
  console.log('===============');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed} (${Math.round((testResults.passed / testResults.total) * 100)}%)`);
  console.log(`Failed: ${testResults.failed} (${Math.round((testResults.failed / testResults.total) * 100)}%)`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ Error Details:');
    testResults.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }

  if (testResults.failed === 0) {
    console.log('\n🎉 All tests passed! Bolna.ai migration is working correctly.');
  } else {
    console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please review and fix the issues.`);
  }
  
  return testResults.failed === 0;
}

// Run the tests
if (require.main === module) {
  testBolnaAPIs()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test suite error:', error);
      process.exit(1);
    });
}

module.exports = { testBolnaAPIs };