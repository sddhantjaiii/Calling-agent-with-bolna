#!/usr/bin/env node

/**
 * Corrected Bolna.ai Agent Test - Using proper agent_config structure
 * Based on API error responses to create agents correctly
 */

const { config } = require('dotenv');
const axios = require('axios');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '.env') });

class CorrectedBolnaTest {
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
  }

  async testVoicesWorking() {
    console.log('🎤 Testing Voice Endpoint (Known Working)');
    console.log('=========================================');
    
    try {
      const response = await this.client.get('/me/voices');
      console.log(`✅ Voice endpoint working! Found ${response.data.length} voices`);
      console.log(`📋 Sample voices:`);
      response.data.slice(0, 3).forEach(voice => {
        console.log(`   • ${voice.name} (${voice.provider}) - ${voice.accent}`);
      });
      return true;
    } catch (error) {
      console.log(`❌ Voice endpoint failed: ${error.message}`);
      return false;
    }
  }

  async testUserInfo() {
    console.log('\n👤 Testing User Info (Known Working)');
    console.log('====================================');
    
    try {
      const response = await this.client.get('/me');
      console.log(`✅ User info retrieved successfully!`);
      console.log(`📧 Email: ${response.data.email}`);
      console.log(`💰 Wallet: $${response.data.wallet}`);
      console.log(`🆔 User ID: ${response.data.id}`);
      return true;
    } catch (error) {
      console.log(`❌ User info failed: ${error.message}`);
      return false;
    }
  }

  async testCorrectedAgentCreation() {
    console.log('\n🤖 Testing Corrected Agent Creation');
    console.log('===================================');
    
    // Based on error message, we need agent_config field
    const correctedAgentData = {
      agent_config: {
        agent_name: `Corrected Test Agent ${Date.now()}`,
        agent_welcome_message: "Hello! I'm a test agent created with the correct structure.",
        webhook_url: "https://webhook.site/test-webhook",
        tasks: [
          {
            task_type: "conversation",
            tools_config: {
              output: {
                provider: "default",
                provider_config: {}
              },
              input: {
                provider: "default", 
                provider_config: {}
              },
              synthesizer: {
                provider: "polly",
                provider_config: {
                  voice: "Joanna",
                  engine: "standard",
                  language: "en-US",
                  speed: 1.0
                }
              },
              transcriber: {
                provider: "deepgram",
                provider_config: {
                  model: "nova-2",
                  language: "en"
                }
              },
              llm: {
                provider: "openai",
                provider_config: {
                  model: "gpt-3.5-turbo",
                  max_tokens: 100,
                  temperature: 0.7
                }
              }
            },
            toolchain: {
              execution: "parallel",
              pipelines: [
                [
                  {
                    tool_name: "transcriber",
                    input: "input",
                    output: "transcript"
                  },
                  {
                    tool_name: "llm", 
                    input: "transcript",
                    output: "response"
                  },
                  {
                    tool_name: "synthesizer",
                    input: "response", 
                    output: "audio"
                  },
                  {
                    tool_name: "output",
                    input: "audio",
                    output: "final_output"
                  }
                ]
              ]
            },
            task_config: {
              hangup_after: 600,
              ambient_sound: false,
              interruption_threshold: 0.5,
              backchanneling: false
            }
          }
        ]
      }
    };

    console.log(`📝 Creating agent with corrected structure...`);
    console.log(`📊 Agent data structure:`);
    console.log(JSON.stringify(correctedAgentData, null, 2));

    try {
      const response = await this.client.post('/agent', correctedAgentData);
      console.log(`✅ Agent created successfully!`);
      console.log(`🆔 Agent ID: ${response.data.agent_id || response.data.id || 'Unknown'}`);
      console.log(`📊 Full response:`);
      console.log(JSON.stringify(response.data, null, 2));
      
      this.createdAgentId = response.data.agent_id || response.data.id;
      return true;
    } catch (error) {
      console.log(`❌ Agent creation failed: ${error.message}`);
      if (error.response?.data) {
        console.log(`📊 Error details:`);
        console.log(JSON.stringify(error.response.data, null, 2));
      }
      return false;
    }
  }

  async testMinimalAgentCreation() {
    console.log('\n🎯 Testing Minimal Agent Creation');
    console.log('=================================');
    
    // Try an even simpler structure
    const minimalAgent = {
      agent_config: {
        agent_name: `Minimal Agent ${Date.now()}`,
        agent_welcome_message: "Hello, minimal test.",
        tasks: []
      }
    };

    console.log(`📝 Creating minimal agent...`);
    
    try {
      const response = await this.client.post('/agent', minimalAgent);
      console.log(`✅ Minimal agent created!`);
      console.log(`📊 Response:`);
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    } catch (error) {
      console.log(`❌ Minimal agent creation failed: ${error.message}`);
      if (error.response?.data) {
        console.log(`📊 Error details:`);
        console.log(JSON.stringify(error.response.data, null, 2));
      }
      return false;
    }
  }

  async runAllTests() {
    console.log('🚀 Corrected Bolna.ai API Test Suite');
    console.log('====================================');
    
    let passed = 0;
    let total = 0;

    // Test 1: Voices (known working)
    total++;
    if (await this.testVoicesWorking()) passed++;

    // Test 2: User info (known working)  
    total++;
    if (await this.testUserInfo()) passed++;

    // Test 3: Corrected agent creation
    total++;
    if (await this.testCorrectedAgentCreation()) passed++;

    // Test 4: Minimal agent creation
    total++;
    if (await this.testMinimalAgentCreation()) passed++;

    console.log('\n' + '='.repeat(50));
    console.log('🎯 CORRECTED TEST RESULTS');
    console.log('='.repeat(50));
    console.log(`📊 Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${total - passed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / total) * 100)}%`);

    if (passed === total) {
      console.log('\n🎉 ALL TESTS PASSED! Agent structure corrected!');
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) still failing. Need more investigation.`);
    }

    return passed === total;
  }
}

async function main() {
  const tester = new CorrectedBolnaTest();
  
  try {
    const success = await tester.runAllTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { CorrectedBolnaTest };