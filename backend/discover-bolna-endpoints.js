#!/usr/bin/env node

/**
 * Bolna.ai API Endpoint Discovery Test
 * Tests different endpoint patterns to find what's working
 */

const { config } = require('dotenv');
const axios = require('axios');
const path = require('path');

// Load environment variables
config({ path: path.join(__dirname, '.env') });

class BolnaEndpointTester {
  constructor() {
    this.apiKey = process.env.BOLNA_API_KEY;
    this.baseUrl = process.env.BOLNA_BASE_URL || 'https://api.bolna.ai';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
  }

  async testEndpoint(method, endpoint, data = null, description = '') {
    console.log(`\n🔍 Testing: ${method.toUpperCase()} ${endpoint}`);
    if (description) console.log(`   📝 ${description}`);
    
    try {
      let response;
      switch (method.toLowerCase()) {
        case 'get':
          response = await this.client.get(endpoint);
          break;
        case 'post':
          response = await this.client.post(endpoint, data);
          break;
        case 'put':
          response = await this.client.put(endpoint, data);
          break;
        case 'delete':
          response = await this.client.delete(endpoint);
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      
      console.log(`   ✅ Success! Status: ${response.status}`);
      if (response.data) {
        if (Array.isArray(response.data)) {
          console.log(`   📊 Response: Array with ${response.data.length} items`);
          if (response.data.length > 0) {
            console.log(`   📋 Sample: ${JSON.stringify(response.data[0], null, 2)}`);
          }
        } else if (typeof response.data === 'object') {
          console.log(`   📊 Response: ${JSON.stringify(response.data, null, 2)}`);
        } else {
          console.log(`   📊 Response: ${response.data}`);
        }
      }
      return true;
    } catch (error) {
      console.log(`   ❌ Failed: ${error.response?.status || 'No status'} - ${error.message}`);
      if (error.response?.data) {
        console.log(`   📊 Error Response: ${JSON.stringify(error.response.data, null, 2)}`);
      }
      return false;
    }
  }

  async discoverEndpoints() {
    console.log('🚀 Bolna.ai API Endpoint Discovery');
    console.log('=====================================');
    console.log(`🔑 API Key: ${this.apiKey?.substring(0, 10)}...`);
    console.log(`🌐 Base URL: ${this.baseUrl}`);

    const endpoints = [
      // Voice endpoints
      { method: 'get', endpoint: '/me/voices', desc: 'Get user voices' },
      { method: 'get', endpoint: '/voices', desc: 'Get all voices' },
      { method: 'get', endpoint: '/v2/voices', desc: 'Get voices v2' },
      
      // Agent endpoints - different patterns
      { method: 'get', endpoint: '/agents', desc: 'List agents (v1)' },
      { method: 'get', endpoint: '/v2/agents', desc: 'List agents (v2)' },
      { method: 'get', endpoint: '/agent', desc: 'List agents (singular)' },
      { method: 'get', endpoint: '/v2/agent', desc: 'List agents v2 (singular)' },
      
      // User/Account endpoints
      { method: 'get', endpoint: '/me', desc: 'Get user info' },
      { method: 'get', endpoint: '/user', desc: 'Get user details' },
      { method: 'get', endpoint: '/account', desc: 'Get account info' },
      
      // Other common endpoints
      { method: 'get', endpoint: '/health', desc: 'Health check' },
      { method: 'get', endpoint: '/status', desc: 'Status check' },
      { method: 'get', endpoint: '/version', desc: 'API version' },
    ];

    let workingEndpoints = [];
    
    for (const { method, endpoint, desc } of endpoints) {
      const success = await this.testEndpoint(method, endpoint, null, desc);
      if (success) {
        workingEndpoints.push(`${method.toUpperCase()} ${endpoint}`);
      }
      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limiting
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 ENDPOINT DISCOVERY SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Working endpoints: ${workingEndpoints.length}`);
    workingEndpoints.forEach(endpoint => console.log(`   ✅ ${endpoint}`));
    
    if (workingEndpoints.length === 0) {
      console.log('❌ No working endpoints found');
    }

    return workingEndpoints;
  }

  async testAgentCreationVariations() {
    console.log('\n🧪 Testing Agent Creation Variations');
    console.log('=====================================');

    // Minimal agent data
    const minimalAgent = {
      agent_name: "Minimal Test Agent",
      agent_welcome_message: "Hello, this is a test."
    };

    // Simple agent with basic config
    const simpleAgent = {
      agent_name: "Simple Test Agent",
      agent_welcome_message: "Hello, I'm a simple test agent.",
      webhook_url: "https://webhook.site/test"
    };

    const agentEndpoints = [
      '/agent',
      '/v2/agent', 
      '/agents',
      '/v2/agents'
    ];

    for (const endpoint of agentEndpoints) {
      console.log(`\n📝 Testing agent creation on ${endpoint}`);
      await this.testEndpoint('post', endpoint, minimalAgent, 'Minimal agent data');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  const tester = new BolnaEndpointTester();
  
  try {
    const workingEndpoints = await tester.discoverEndpoints();
    await tester.testAgentCreationVariations();
    
    console.log('\n🎯 Discovery complete! Use the working endpoints above.');
  } catch (error) {
    console.error('\n❌ Discovery failed:', error.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { BolnaEndpointTester };