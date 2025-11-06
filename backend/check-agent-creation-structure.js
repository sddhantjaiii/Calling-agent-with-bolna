#!/usr/bin/env node

/**
 * Quick Agent Creation Response Structure Checker
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
      agent_welcome_message: "Hello! I'm a test agent created by the integration test suite.",
      webhook_url: "https://webhook.site/test-webhook",
      agent_type: "other",
      tasks: [{
        task_type: "conversation",
        tools_config: {
          llm_agent: {
            agent_type: "simple_llm_agent",
            agent_flow_type: "streaming",
            routes: {
              embedding_model: "snowflake/snowflake-arctic-embed-m",
              routes: [{
                route_name: "politics",
                utterances: ["Who do you think will win the elections?"],
                response: "I do not have opinions on politics",
                score_threshold: 0.9
              }]
            },
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
      }],
      ingest_source_config: {
        source_type: "api",
        source_url: "https://example.com/api/data",
        source_auth_token: "token123",
        source_name: "data_source.csv"
      }
    },
    agent_prompts: {
      task_1: {
        system_prompt: "You are a helpful test agent. Respond professionally and concisely."
      }
    }
  };
}

async function checkAgentCreationStructure() {
  try {
    console.log('🔍 Checking POST /v2/agent endpoint structure...');
    
    const agentData = createTestAgentData();
    const response = await bolnaClient.post('/v2/agent', agentData);
    
    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Headers:', response.headers['content-type']);
    console.log('📦 Response Data Type:', typeof response.data);
    console.log('📦 Response Data:', JSON.stringify(response.data, null, 2));
    console.log('🔑 Response Keys:', Object.keys(response.data));
    
    // Try to delete the created agent
    if (response.data.agent_id) {
      console.log('\n🧹 Cleaning up created agent...');
      await bolnaClient.delete(`/v2/agent/${response.data.agent_id}`);
      console.log('✅ Agent deleted successfully');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.status, JSON.stringify(error.response?.data, null, 2) || error.message);
  }
}

checkAgentCreationStructure();