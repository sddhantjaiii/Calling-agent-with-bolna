#!/usr/bin/env node

/**
 * Simple Bolna.ai V2 API Test - Using CORRECT API structure from documentation
 * Tests agent creation and listing with the exact format provided
 */

const { config } = require('dotenv');
const axios = require('axios');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '.env') });

class SimpleBolnaV2Test {
  constructor() {
    this.apiKey = process.env.BOLNA_API_KEY;
    this.baseUrl = process.env.BOLNA_BASE_URL || 'https://api.bolna.ai';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    this.createdAgentId = null;
    this.testResults = { passed: 0, failed: 0, total: 0 };
  }

  async runTest(testName, testFn) {
    console.log(`\n🧪 ${testName}`);
    console.log('─'.repeat(50));
    this.testResults.total++;
    
    try {
      await testFn();
      console.log(`✅ ${testName} - PASSED`);
      this.testResults.passed++;
      return true;
    } catch (error) {
      console.log(`❌ ${testName} - FAILED`);
      console.log(`   Error: ${error.message}`);
      if (error.response?.data) {
        console.log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      this.testResults.failed++;
      return false;
    }
  }

  async testAgentCreation() {
    await this.runTest('Agent Creation (Correct V2 Structure)', async () => {
      // Using EXACT structure from your documentation
      const agentData = {
        agent_config: {
          agent_name: `Test Agent ${Date.now()}`,
          agent_welcome_message: "Hello! I'm a test agent created with correct structure.",
          webhook_url: null,
          agent_type: "other",
          tasks: [
            {
              task_type: "conversation",
              tools_config: {
                llm_agent: {
                  agent_type: "simple_llm_agent",
                  agent_flow_type: "streaming",
                  routes: {
                    embedding_model: "snowflake/snowflake-arctic-embed-m",
                    routes: [
                      {
                        route_name: "politics",
                        utterances: ["Who do you think will win the elections?", "Whom would you vote for?"],
                        response: "Hey, thanks but I do not have opinions on politics",
                        score_threshold: 0.9
                      }
                    ]
                  },
                  llm_config: {
                    agent_flow_type: "streaming",
                    provider: "openai",
                    family: "openai",
                    model: "gpt-3.5-turbo",
                    summarization_details: null,
                    extraction_details: null,
                    max_tokens: 150,
                    presence_penalty: 0,
                    frequency_penalty: 0,
                    base_url: "https://api.openai.com/v1",
                    top_p: 0.9,
                    min_p: 0.1,
                    top_k: 0,
                    temperature: 0.1,
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
                },
                api_tools: null
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
                call_cancellation_prompt: null,
                backchanneling: false,
                backchanneling_message_gap: 5,
                backchanneling_start_delay: 5,
                ambient_noise: false,
                ambient_noise_track: "office-ambience",
                call_terminate: 90,
                voicemail: false,
                inbound_limit: -1,
                whitelist_phone_numbers: ["<any>"],
                disallow_unknown_numbers: false
              }
            }
          ],
          ingest_source_config: {
            source_type: "api",
            source_url: "https://example.com/api/data",
            source_auth_token: "abc123",
            source_name: "leads_sheet_june.csv"
          }
        },
        agent_prompts: {
          task_1: {
            system_prompt: "What is the Ultimate Question of Life, the Universe, and Everything?"
          }
        }
      };

      console.log(`   📝 Creating agent: "${agentData.agent_config.agent_name}"`);
      
      const response = await this.client.post('/v2/agent', agentData);
      
      if (!response.data || !response.data.agent_id) {
        throw new Error('Agent creation response missing agent_id');
      }
      
      this.createdAgentId = response.data.agent_id;
      
      console.log(`   ✅ Agent created successfully!`);
      console.log(`   🆔 Agent ID: ${this.createdAgentId}`);
      console.log(`   📊 Status: ${response.data.status}`);
    });
  }

  async testAgentListing() {
    await this.runTest('Agent Listing (Correct V2 Endpoint)', async () => {
      console.log(`   🔍 Fetching agents from /v2/agent/all`);
      
      const response = await this.client.get('/v2/agent/all');
      
      if (response.status !== 200) {
        throw new Error(`Agent listing failed with status: ${response.status}`);
      }
      
      console.log(`   ✅ Agent listing successful!`);
      console.log(`   📊 Found ${response.data.length || 0} agents`);
      
      if (response.data.length > 0) {
        console.log(`   📋 Sample agent: ${response.data[0].agent_name} (${response.data[0].agent_status})`);
      }
    });
  }

  async testAgentRetrieval() {
    if (!this.createdAgentId) {
      console.log('\n⚠️  Skipping Agent Retrieval - No agent created');
      return;
    }

    await this.runTest('Agent Retrieval by ID', async () => {
      console.log(`   🔍 Retrieving agent: ${this.createdAgentId}`);
      
      const response = await this.client.get(`/v2/agent/${this.createdAgentId}`);
      
      if (response.status !== 200) {
        throw new Error(`Agent retrieval failed with status: ${response.status}`);
      }
      
      console.log(`   ✅ Agent retrieved successfully!`);
      console.log(`   📛 Agent Name: ${response.data.agent_name}`);
      console.log(`   📊 Agent Status: ${response.data.agent_status}`);
    });
  }


  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 SIMPLE BOLNA.AI V2 API TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${this.testResults.total}`);
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📈 Success Rate: ${Math.round((this.testResults.passed / this.testResults.total) * 100)}%`);
    
    if (this.testResults.passed === this.testResults.total) {
      console.log('\n🎉 ALL TESTS PASSED! Bolna.ai V2 API is working correctly!');
      console.log('✨ Ready to update our bolnaService.ts with correct structure.');
    } else {
      console.log(`\n⚠️  ${this.testResults.failed} test(s) failed.`);
    }
    
    console.log('='.repeat(60));
  }

  async runAllTests() {
    console.log('🚀 Simple Bolna.ai V2 API Test');
    console.log('==============================');
    console.log(`🔑 API Key: ${this.apiKey?.substring(0, 10)}...`);
    console.log(`🌐 Base URL: ${this.baseUrl}`);
    
    // Test in logical order
    await this.testAgentListing();
    await this.testAgentCreation();
    await this.testAgentRetrieval();
    await this.testAgentDeletion();
    
    this.printSummary();
    
    return this.testResults.passed === this.testResults.total;
  }
}

// Run the test
async function main() {
  const tester = new SimpleBolnaV2Test();
  
  try {
    const success = await tester.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite failed with error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { SimpleBolnaV2Test };