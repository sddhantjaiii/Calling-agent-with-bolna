#!/usr/bin/env node

/**
 * Final verification of CREATE AGENT response structure
 * This will definitively confirm the exact response format
 */

require('dotenv').config();
const axios = require('axios');

const BOLNA_API_KEY = process.env.BOLNA_API_KEY;
const BOLNA_BASE_URL = 'https://api.bolna.ai';

const bolnaClient = axios.create({
  baseURL: BOLNA_BASE_URL,
  headers: {
    'Authorization': `Bearer ${BOLNA_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

function createMinimalTestAgent() {
  return {
    agent_config: {
      agent_name: `Final Verification Agent ${Date.now()}`,
      agent_welcome_message: "Hello! This is for final verification.",
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
        system_prompt: "You are a helpful assistant."
      }
    }
  };
}

async function verifyCreateAgentResponse() {
  let createdAgentId = null;
  
  try {
    console.log('🔍 FINAL VERIFICATION: POST /v2/agent response structure');
    console.log('=' .repeat(60));
    
    const agentData = createMinimalTestAgent();
    console.log('📤 Sending create agent request...');
    
    const response = await bolnaClient.post('/v2/agent', agentData);
    
    console.log('\n📊 RESPONSE DETAILS:');
    console.log('Status Code:', response.status);
    console.log('Content-Type:', response.headers['content-type']);
    console.log('\n📦 RESPONSE BODY:');
    console.log(JSON.stringify(response.data, null, 2));
    
    console.log('\n🔑 RESPONSE KEYS:');
    console.log('Keys:', Object.keys(response.data));
    
    console.log('\n📋 FIELD ANALYSIS:');
    Object.entries(response.data).forEach(([key, value]) => {
      console.log(`  ${key}: ${typeof value} = "${value}"`);
    });
    
    // Store for cleanup
    createdAgentId = response.data.agent_id;
    
    console.log('\n✨ CONFIRMED RESPONSE STRUCTURE:');
    console.log('{');
    Object.entries(response.data).forEach(([key, value], index, array) => {
      const comma = index < array.length - 1 ? ',' : '';
      console.log(`  "${key}": "${value}"${comma}`);
    });
    console.log('}');
    
  } catch (error) {
    console.error('❌ Error creating agent:', error.response?.status, error.response?.data || error.message);
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

verifyCreateAgentResponse();