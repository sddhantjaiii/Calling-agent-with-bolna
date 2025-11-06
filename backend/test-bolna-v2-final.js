#!/usr/bin/env node

/**
 * Bolna.ai Agent V2.0 API Test - Using the correct V2 API structure
 * Based on the deprecation message pointing to Agent V2.0 APIs
 */

const { config } = require('dotenv');
const axios = require('axios');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '.env') });

class BolnaV2APITest {
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

  async testV2AgentCreation() {
    console.log('🚀 Testing Agent V2.0 Creation');
    console.log('==============================');
    
    // Simplified V2 agent structure based on common patterns
    const v2AgentData = {
      agent_name: `V2 Test Agent ${Date.now()}`,
      agent_welcome_message: "Hello! I'm a V2 test agent.",
      webhook_url: "https://webhook.site/test-v2",
      tasks: [
        {
          task_type: "conversation",
          tools_config: {
            synthesizer: {
              provider: "polly",
              provider_config: {
                voice: "Matthew",
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
                max_tokens: 150,
                temperature: 0.7
              }
            }
          },
          toolchain: {
            execution: "sequential",
            pipelines: [
              "transcriber",
              "llm", 
              "synthesizer"
            ]
          },
          task_config: {
            hangup_after: 300,
            ambient_sound: false
          }
        }
      ]
    };

    console.log(`📝 Creating V2 agent...`);
    console.log(`🆔 Agent name: "${v2AgentData.agent_name}"`);

    try {
      // Try POST /v2/agent with V2 structure
      const response = await this.client.post('/v2/agent', v2AgentData);
      console.log(`✅ V2 Agent created successfully!`);
      console.log(`🆔 Agent ID: ${response.data.agent_id || response.data.id}`);
      console.log(`📊 Response status: ${response.status}`);
      console.log(`📋 Full response:`);
      console.log(JSON.stringify(response.data, null, 2));
      
      this.createdAgentId = response.data.agent_id || response.data.id;
      return true;
    } catch (error) {
      console.log(`❌ V2 Agent creation failed: ${error.message}`);
      console.log(`📊 Status: ${error.response?.status}`);
      if (error.response?.data) {
        console.log(`📋 Error details:`);
        console.log(JSON.stringify(error.response.data, null, 2));
      }
      return false;
    }
  }

  async testUltraMinimalV2Agent() {
    console.log('\n🎯 Testing Ultra-Minimal V2 Agent');
    console.log('=================================');
    
    // Absolutely minimal structure
    const minimalV2 = {
      agent_name: `Minimal V2 ${Date.now()}`,
      agent_welcome_message: "Hi, minimal test."
    };

    console.log(`📝 Creating ultra-minimal V2 agent...`);

    try {
      const response = await this.client.post('/v2/agent', minimalV2);
      console.log(`✅ Ultra-minimal V2 agent created!`);
      console.log(`📊 Response:`);
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    } catch (error) {
      console.log(`❌ Ultra-minimal creation failed: ${error.message}`);
      if (error.response?.data) {
        console.log(`📊 Error details:`);
        console.log(JSON.stringify(error.response.data, null, 2));
      }
      return false;
    }
  }

  async testAgentListingV2() {
    console.log('\n📋 Testing Agent Listing (Various Methods)');
    console.log('==========================================');
    
    const listEndpoints = [
      { method: 'GET', url: '/v2/agent', desc: 'List V2 agents' },
      { method: 'GET', url: '/v2/agents', desc: 'List V2 agents (plural)' }
    ];

    for (const endpoint of listEndpoints) {
      console.log(`\n🔍 Testing: ${endpoint.method} ${endpoint.url}`);
      try {
        const response = await this.client.get(endpoint.url);
        console.log(`✅ ${endpoint.desc} - Success!`);
        console.log(`📊 Status: ${response.status}`);
        if (Array.isArray(response.data)) {
          console.log(`📋 Found ${response.data.length} agents`);
          if (response.data.length > 0) {
            console.log(`📝 Sample agent: ${JSON.stringify(response.data[0], null, 2)}`);
          }
        } else {
          console.log(`📋 Response: ${JSON.stringify(response.data, null, 2)}`);
        }
        return true;
      } catch (error) {
        console.log(`❌ ${endpoint.desc} failed: ${error.response?.status || 'No status'} - ${error.message}`);
      }
    }
    return false;
  }

  async testAgentRetrievalV2() {
    if (!this.createdAgentId) {
      console.log('\n⚠️  Skipping Agent Retrieval - No agent created');
      return false;
    }

    console.log('\n🔍 Testing Agent Retrieval V2');
    console.log('=============================');
    
    try {
      const response = await this.client.get(`/v2/agent/${this.createdAgentId}`);
      console.log(`✅ Agent retrieved successfully!`);
      console.log(`📊 Status: ${response.status}`);
      console.log(`📋 Agent data:`);
      console.log(JSON.stringify(response.data, null, 2));
      return true;
    } catch (error) {
      console.log(`❌ Agent retrieval failed: ${error.message}`);
      return false;
    }
  }

  async testAgentDeletionV2() {
    if (!this.createdAgentId) {
      console.log('\n⚠️  Skipping Agent Deletion - No agent created');
      return false;
    }

    console.log('\n🗑️  Testing Agent Deletion V2');
    console.log('=============================');
    
    try {
      const response = await this.client.delete(`/v2/agent/${this.createdAgentId}`);
      console.log(`✅ Agent deleted successfully!`);
      console.log(`📊 Status: ${response.status}`);
      
      // Verify deletion
      try {
        await this.client.get(`/v2/agent/${this.createdAgentId}`);
        console.log(`⚠️  Agent still exists after deletion`);
        return false;
      } catch (verifyError) {
        if (verifyError.response?.status === 404) {
          console.log(`✅ Deletion confirmed - agent no longer exists`);
          return true;
        }
      }
    } catch (error) {
      console.log(`❌ Agent deletion failed: ${error.message}`);
      return false;
    }
  }

  async runFullV2Test() {
    console.log('🚀 Bolna.ai Agent V2.0 API Full Test Suite');
    console.log('===========================================');
    console.log(`🔑 API Key: ${this.apiKey?.substring(0, 10)}...`);
    console.log(`🌐 Base URL: ${this.baseUrl}\n`);
    
    let passed = 0;
    let total = 0;

    // Test 1: V2 Agent Creation
    total++;
    if (await this.testV2AgentCreation()) passed++;

    // Test 2: Ultra-minimal agent
    total++;
    if (await this.testUltraMinimalV2Agent()) passed++;

    // Test 3: Agent listing
    total++;
    if (await this.testAgentListingV2()) passed++;

    // Test 4: Agent retrieval
    total++;
    if (await this.testAgentRetrievalV2()) passed++;

    // Test 5: Agent deletion
    total++;
    if (await this.testAgentDeletionV2()) passed++;

    console.log('\n' + '='.repeat(60));
    console.log('🎯 BOLNA.AI V2 API TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${total - passed}`);
    console.log(`📈 Success Rate: ${Math.round((passed / total) * 100)}%`);

    if (passed === total) {
      console.log('\n🎉 ALL V2 TESTS PASSED! Bolna.ai V2 API is working perfectly!');
      console.log('✨ Your agent management system is ready for production!');
    } else {
      console.log(`\n⚠️  ${total - passed} test(s) failed. V2 API needs more investigation.`);
    }

    console.log('='.repeat(60));
    return passed === total;
  }
}

async function main() {
  const tester = new BolnaV2APITest();
  
  try {
    const success = await tester.runFullV2Test();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ V2 Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { BolnaV2APITest };