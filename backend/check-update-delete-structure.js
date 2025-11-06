#!/usr/bin/env node

/**
 * Check Update and Delete Agent Response Structures
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

function createTestAgentData() {
  return {
    agent_config: {
      agent_name: `Test Agent ${Date.now()}`,
      agent_welcome_message: "Hello! I'm a test agent for checking update/delete.",
      agent_type: "other",
      tasks: [{
        task_type: "conversation",
        tools_config: {
          llm_agent: {
            agent_type: "simple_llm_agent",
            agent_flow_type: "streaming",
            llm_config: {
              agent_flow_type: "streaming",
              provider: "openai",
              family: "openai",
              model: "gpt-3.5-turbo",
              max_tokens: 150,
              temperature: 0.1,
              top_p: 0.9,
              request_json: true
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
          incremental_delay: 400,
          number_of_words_for_interruption: 2,
          hangup_after_LLMCall: false,
          backchanneling: false,
          ambient_noise: false,
          call_terminate: 90,
          voicemail: false,
          inbound_limit: -1,
          whitelist_phone_numbers: ["<any>"],
          disallow_unknown_numbers: false
        }
      }]
    },
    agent_prompts: {
      task_1: {
        system_prompt: "You are a helpful test agent."
      }
    }
  };
}

async function checkUpdateAndDeleteStructure() {
  let agentId = null;
  
  try {
    // First create an agent
    console.log('🔧 Creating test agent...');
    const agentData = createTestAgentData();
    const createResponse = await bolnaClient.post('/v2/agent', agentData);
    agentId = createResponse.data.agent_id;
    console.log('✅ Agent created:', agentId);
    
    // Test update
    console.log('\n🔍 Testing PUT /v2/agent/{id} endpoint...');
    try {
      const updateData = {
        agent_config: {
          agent_name: `Updated Test Agent ${Date.now()}`,
          agent_welcome_message: "Hello! I'm an updated test agent.",
          agent_type: "other"
        }
      };
      
      const updateResponse = await bolnaClient.put(`/v2/agent/${agentId}`, updateData);
      console.log('📊 Update Response Status:', updateResponse.status);
      console.log('📦 Update Response Data:', JSON.stringify(updateResponse.data, null, 2));
      console.log('🔑 Update Response Keys:', Object.keys(updateResponse.data));
    } catch (updateError) {
      console.error('❌ Update Error:', updateError.response?.status, JSON.stringify(updateError.response?.data, null, 2) || updateError.message);
    }
    
    // Test delete
    console.log('\n🔍 Testing DELETE /v2/agent/{id} endpoint...');
    try {
      const deleteResponse = await bolnaClient.delete(`/v2/agent/${agentId}`);
      console.log('📊 Delete Response Status:', deleteResponse.status);
      console.log('📦 Delete Response Data:', JSON.stringify(deleteResponse.data, null, 2));
      console.log('🔑 Delete Response Keys:', Object.keys(deleteResponse.data));
    } catch (deleteError) {
      console.error('❌ Delete Error:', deleteError.response?.status, JSON.stringify(deleteError.response?.data, null, 2) || deleteError.message);
    }
    
  } catch (error) {
    console.error('❌ General Error:', error.response?.status, JSON.stringify(error.response?.data, null, 2) || error.message);
  }
}

checkUpdateAndDeleteStructure();