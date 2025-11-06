#!/usr/bin/env node

/**
 * Comprehensive Bolna.ai API Test - Create, Test, and Verify Agent
 * Tests all implemented Bolna.ai functionality including agent creation
 */

const { config } = require('dotenv');
const axios = require('axios');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '.env') });

class BolnaAPITester {
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
    
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0
    };
    
    this.createdAgentId = null;
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

  async testConnection() {
    await this.runTest('API Connection Test', async () => {
      if (!this.apiKey) {
        throw new Error('BOLNA_API_KEY not found in environment variables');
      }
      
      console.log(`   API Key: ${this.apiKey.substring(0, 10)}...`);
      console.log(`   Base URL: ${this.baseUrl}`);
      
      // Test with a simple endpoint
      const response = await this.client.get('/v2/agent');
      
      if (response.status !== 200) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }
      
      console.log(`   ✅ Connection successful (Status: ${response.status})`);
      console.log(`   ✅ Found ${response.data.length || 0} existing agents`);
    });
  }

  async testVoiceEndpoint() {
    await this.runTest('Voice Endpoint Test', async () => {
      const response = await this.client.get('/me/voices');
      
      if (response.status !== 200) {
        throw new Error(`Voice endpoint failed with status: ${response.status}`);
      }
      
      console.log(`   ✅ Voice endpoint accessible (Status: ${response.status})`);
      
      if (Array.isArray(response.data) && response.data.length > 0) {
        console.log(`   ✅ Found ${response.data.length} voices`);
        console.log(`   📋 Sample voice: ${JSON.stringify(response.data[0], null, 4)}`);
      } else {
        console.log(`   ⚠️  No voices found (this might be expected for new accounts)`);
      }
    });
  }

  async testAgentCreation() {
    await this.runTest('Agent Creation Test', async () => {
      const testAgent = {
        agent_name: `Test Agent ${Date.now()}`,
        agent_welcome_message: "Hello! I'm a test agent created to verify the Bolna.ai integration is working correctly.",
        webhook_url: "https://your-webhook-url.com/webhook", // Replace with actual webhook URL if available
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
      };

      console.log(`   📝 Creating agent: "${testAgent.agent_name}"`);
      
      const response = await this.client.post('/v2/agent', testAgent);
      
      if (!response.data || !response.data.agent_id) {
        throw new Error('Agent creation response missing agent_id');
      }
      
      this.createdAgentId = response.data.agent_id;
      
      console.log(`   ✅ Agent created successfully!`);
      console.log(`   🆔 Agent ID: ${this.createdAgentId}`);
      console.log(`   📊 Response: ${JSON.stringify(response.data, null, 4)}`);
    });
  }

  async testAgentRetrieval() {
    if (!this.createdAgentId) {
      console.log('\n⚠️  Skipping Agent Retrieval Test - No agent created');
      return;
    }

    await this.runTest('Agent Retrieval Test', async () => {
      console.log(`   🔍 Retrieving agent: ${this.createdAgentId}`);
      
      const response = await this.client.get(`/v2/agent/${this.createdAgentId}`);
      
      if (response.status !== 200) {
        throw new Error(`Agent retrieval failed with status: ${response.status}`);
      }
      
      if (!response.data || !response.data.agent_id) {
        throw new Error('Agent retrieval response missing agent data');
      }
      
      console.log(`   ✅ Agent retrieved successfully!`);
      console.log(`   🆔 Agent ID: ${response.data.agent_id}`);
      console.log(`   📛 Agent Name: ${response.data.agent_name}`);
      console.log(`   💬 Welcome Message: ${response.data.agent_welcome_message}`);
    });
  }

  async testAgentUpdate() {
    if (!this.createdAgentId) {
      console.log('\n⚠️  Skipping Agent Update Test - No agent created');
      return;
    }

    await this.runTest('Agent Update Test', async () => {
      const updateData = {
        agent_name: `Updated Test Agent ${Date.now()}`,
        agent_welcome_message: "Hello! I'm an updated test agent to verify the update functionality works."
      };

      console.log(`   ✏️  Updating agent: ${this.createdAgentId}`);
      console.log(`   📝 New name: "${updateData.agent_name}"`);
      
      const response = await this.client.put(`/v2/agent/${this.createdAgentId}`, updateData);
      
      if (response.status !== 200) {
        throw new Error(`Agent update failed with status: ${response.status}`);
      }
      
      console.log(`   ✅ Agent updated successfully!`);
      console.log(`   📊 Response: ${JSON.stringify(response.data, null, 4)}`);
    });
  }

  async testAgentDeletion() {
    if (!this.createdAgentId) {
      console.log('\n⚠️  Skipping Agent Deletion Test - No agent created');
      return;
    }

    await this.runTest('Agent Deletion Test', async () => {
      console.log(`   🗑️  Deleting agent: ${this.createdAgentId}`);
      
      const response = await this.client.delete(`/v2/agent/${this.createdAgentId}`);
      
      if (response.status !== 200) {
        throw new Error(`Agent deletion failed with status: ${response.status}`);
      }
      
      console.log(`   ✅ Agent deleted successfully!`);
      
      // Verify deletion by trying to retrieve
      try {
        await this.client.get(`/v2/agent/${this.createdAgentId}`);
        throw new Error('Agent still exists after deletion');
      } catch (error) {
        if (error.response?.status === 404) {
          console.log(`   ✅ Deletion confirmed - agent no longer exists`);
        } else {
          throw error;
        }
      }
      
      this.createdAgentId = null;
    });
  }

  async testAgentListing() {
    await this.runTest('Agent Listing Test', async () => {
      const response = await this.client.get('/v2/agent');
      
      if (response.status !== 200) {
        throw new Error(`Agent listing failed with status: ${response.status}`);
      }
      
      console.log(`   ✅ Agent listing successful!`);
      console.log(`   📊 Found ${response.data.length || 0} agents`);
      
      if (response.data.length > 0) {
        console.log(`   📋 Sample agent: ${JSON.stringify(response.data[0], null, 4)}`);
      }
    });
  }

  printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 COMPREHENSIVE BOLNA.AI API TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${this.testResults.total}`);
    console.log(`✅ Passed: ${this.testResults.passed}`);
    console.log(`❌ Failed: ${this.testResults.failed}`);
    console.log(`📈 Success Rate: ${Math.round((this.testResults.passed / this.testResults.total) * 100)}%`);
    
    if (this.testResults.passed === this.testResults.total) {
      console.log('\n🎉 ALL TESTS PASSED! Bolna.ai integration is working perfectly!');
      console.log('✨ Your agent management system is ready for production use.');
    } else {
      console.log(`\n⚠️  ${this.testResults.failed} test(s) failed. Review the errors above.`);
    }
    
    console.log('='.repeat(60));
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Bolna.ai API Test Suite');
    console.log('='.repeat(60));
    
    // Test in logical order
    await this.testConnection();
    await this.testVoiceEndpoint();
    await this.testAgentListing();
    await this.testAgentCreation();
    await this.testAgentRetrieval();
    await this.testAgentUpdate();
    await this.testAgentDeletion();
    
    this.printSummary();
    
    return this.testResults.passed === this.testResults.total;
  }
}

// Run the comprehensive test
async function main() {
  const tester = new BolnaAPITester();
  
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

module.exports = { BolnaAPITester };