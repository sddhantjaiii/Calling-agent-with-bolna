#!/usr/bin/env node

/**
 * 🧪 PATCH UPDATE AGENT ENDPOINT TEST
 * 
 * Tests the PATCH /v2/agent/{agent_id} endpoint with partial updates
 * Validates the correct response structure: {"message": "success", "state": "updated"}
 * 
 * Date: September 26, 2025
 * Status: Testing new PATCH endpoint for partial agent updates
 */

require('dotenv').config();
const axios = require('axios');

// 🔐 Configuration
const BOLNA_API_KEY = process.env.BOLNA_API_KEY;
const BOLNA_BASE_URL = 'https://api.bolna.ai';

if (!BOLNA_API_KEY) {
  console.error('❌ BOLNA_API_KEY environment variable is required');
  process.exit(1);
}

// 🌐 HTTP Client Setup
const bolnaClient = axios.create({
  baseURL: BOLNA_BASE_URL,
  headers: {
    'Authorization': `Bearer ${BOLNA_API_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

// 🏗️ Test Data Factory
function createTestAgentData() {
  return {
    agent_config: {
      agent_name: `PATCH Test Agent ${Date.now()}`,
      agent_welcome_message: "Hello! I'm created for PATCH testing.",
      agent_type: "other",
      tasks: [{
        task_type: "conversation",
        tools_config: {
          llm_agent: {
            agent_type: "simple_llm_agent",
            agent_flow_type: "streaming",
            llm_config: {
              provider: "openai",
              family: "openai",
              model: "gpt-3.5-turbo",
              max_tokens: 100,
              temperature: 0.1
            }
          },
          synthesizer: {
            provider: "polly",
            provider_config: {
              voice: "Matthew",
              engine: "generative",
              sampling_rate: "8000",
              language: "en-US"
            },
            stream: true,
            buffer_size: 150,
            audio_format: "wav"
          },
          transcriber: {
            provider: "deepgram",
            model: "nova-2",
            language: "en",
            stream: true,
            sampling_rate: 16000,
            encoding: "linear16",
            endpointing: 100
          },
          input: {
            provider: "twilio",
            format: "wav"
          },
          output: {
            provider: "twilio",
            format: "wav"
          }
        },
        toolchain: {
          execution: "parallel",
          pipelines: [["transcriber", "llm", "synthesizer"]]
        },
        task_config: {
          hangup_after_silence: 10,
          call_terminate: 60
        }
      }]
    },
    agent_prompts: {
      task_1: {
        system_prompt: "You are a helpful assistant for PATCH testing."
      }
    }
  };
}

function createPatchUpdateData() {
  return {
    agent_config: {
      agent_name: "Alfred - Updated via PATCH",
      agent_welcome_message: "How are you doing Bruce? Updated via PATCH!",
      webhook_url: null,
      synthesizer: {
        provider: "polly",
        provider_config: {
          voice: "Matthew",
          engine: "generative",
          sampling_rate: "8000",
          language: "en-US"
        },
        stream: true,
        buffer_size: 150,
        audio_format: "wav"
      },
      ingest_source_config: {
        source_type: "api",
        source_url: "https://example.com/api/data",
        source_auth_token: "abc123",
        source_name: "leads_sheet_june.csv"
      }
    },
    agent_prompts: {
      task_1: {
        system_prompt: "What is the Ultimate Question of Life, the Universe, and Everything? (Updated via PATCH)"
      }
    }
  };
}

async function testPatchUpdateAgent() {
  let createdAgentId = null;
  
  try {
    console.log('🚀 PATCH UPDATE AGENT ENDPOINT TEST');
    console.log('=' .repeat(60));
    
    // Step 1: Create a test agent
    console.log('📤 Step 1: Creating test agent...');
    const agentData = createTestAgentData();
    const createResponse = await bolnaClient.post('/v2/agent', agentData);
    createdAgentId = createResponse.data.agent_id;
    console.log('✅ Agent created:', createdAgentId);
    console.log('   Original name:', agentData.agent_config.agent_name);
    
    // Step 2: Test PATCH update
    console.log('\n🔧 Step 2: Testing PATCH /v2/agent/{id}...');
    const patchData = createPatchUpdateData();
    console.log('📤 Sending PATCH request with partial update...');
    
    const patchResponse = await bolnaClient.patch(`/v2/agent/${createdAgentId}`, patchData);
    
    console.log('\n📊 PATCH RESPONSE DETAILS:');
    console.log('Status Code:', patchResponse.status);
    console.log('Content-Type:', patchResponse.headers['content-type']);
    console.log('\n📦 PATCH RESPONSE BODY:');
    console.log(JSON.stringify(patchResponse.data, null, 2));
    
    console.log('\n🔑 PATCH RESPONSE KEYS:');
    console.log('Keys:', Object.keys(patchResponse.data));
    
    console.log('\n📋 FIELD ANALYSIS:');
    Object.entries(patchResponse.data).forEach(([key, value]) => {
      console.log(`  ${key}: ${typeof value} = "${value}"`);
    });
    
    // Step 3: Verify the update
    console.log('\n🔍 Step 3: Verifying the agent was updated...');
    const getResponse = await bolnaClient.get(`/v2/agent/${createdAgentId}`);
    console.log('✅ Updated agent name:', getResponse.data.agent_name);
    console.log('✅ Updated welcome message:', getResponse.data.agent_welcome_message);
    
    // Validation
    console.log('\n✨ VALIDATION RESULTS:');
    const validations = [];
    
    // Check response structure
    if (patchResponse.data.message === 'success') {
      validations.push('✅ Response message is "success"');
    } else {
      validations.push(`❌ Expected message "success", got "${patchResponse.data.message}"`);
    }
    
    if (patchResponse.data.state === 'updated') {
      validations.push('✅ Response state is "updated"');
    } else {
      validations.push(`❌ Expected state "updated", got "${patchResponse.data.state}"`);
    }
    
    // Check if agent was actually updated
    if (getResponse.data.agent_name === patchData.agent_config.agent_name) {
      validations.push('✅ Agent name was successfully updated');
    } else {
      validations.push('❌ Agent name was not updated correctly');
    }
    
    if (getResponse.data.agent_welcome_message === patchData.agent_config.agent_welcome_message) {
      validations.push('✅ Agent welcome message was successfully updated');
    } else {
      validations.push('❌ Agent welcome message was not updated correctly');
    }
    
    validations.forEach(validation => console.log(validation));
    
    const allPassed = validations.every(v => v.startsWith('✅'));
    
    console.log('\n🎯 FINAL RESULT:');
    if (allPassed) {
      console.log('🎉 ✅ PATCH UPDATE ENDPOINT TEST PASSED!');
      console.log('✨ PATCH /v2/agent/{id} is working correctly with partial updates');
    } else {
      console.log('💥 ❌ PATCH UPDATE ENDPOINT TEST FAILED!');
      console.log('⚠️  Some validations did not pass');
    }
    
  } catch (error) {
    console.error('\n💥 ERROR during PATCH test:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2) || error.message);
    
    if (error.response?.status === 500) {
      console.log('\n⚠️  Note: PATCH endpoint may have the same 500 error issue as PUT');
    }
  } finally {
    // Cleanup
    if (createdAgentId) {
      try {
        console.log('\n🧹 Cleaning up test agent...');
        await bolnaClient.delete(`/v2/agent/${createdAgentId}`);
        console.log('✅ Test agent deleted successfully');
      } catch (cleanupError) {
        console.error('❌ Cleanup failed:', cleanupError.message);
      }
    }
  }
}

// 🚀 Execute Test
if (require.main === module) {
  testPatchUpdateAgent().catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { testPatchUpdateAgent };