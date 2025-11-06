const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function testAdminAgentCreation() {
  try {
    console.log('\n=== Testing Admin Agent Creation ===\n');

    // Step 1: Admin login
    console.log('1. Logging in as admin...');
    const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, {
      email: 'admin@sniperthink.com',
      password: 'Admin@123456'
    });

    const adminToken = loginResponse.data.token;
    console.log('✅ Admin logged in successfully');

    // Step 2: Get voices
    console.log('\n2. Fetching voices...');
    try {
      const voicesResponse = await axios.get(`${API_BASE}/api/admin/agents/voices`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });
      console.log('✅ Voices fetched:', voicesResponse.data.data?.length || 0);
      if (voicesResponse.data.data && voicesResponse.data.data.length > 0) {
        console.log('First voice:', voicesResponse.data.data[0]);
      }
    } catch (error) {
      console.error('❌ Failed to fetch voices:', error.response?.data || error.message);
    }

    // Step 3: Create agent
    console.log('\n3. Creating agent...');
    const agentData = {
      name: 'Test Admin Agent',
      description: 'Test agent created from admin panel',
      system_prompt: 'You are a helpful AI assistant.',
      language: 'en',
      type: 'CallAgent',
      voice_id: 'pNInz6obpgDQGcFmaJgB', // Default voice
      llm: {
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 4000
      },
      tts: {
        voice_id: 'pNInz6obpgDQGcFmaJgB',
        model: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.2,
          use_speaker_boost: true
        }
      },
      data_collection: {
        default: {
          type: 'string',
          description: 'Test data collection description'
        }
      }
    };

    console.log('Sending agent data:', JSON.stringify(agentData, null, 2));

    try {
      const createResponse = await axios.post(`${API_BASE}/api/admin/agents`, agentData, {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Agent created successfully:', createResponse.data);
    } catch (error) {
      console.error('❌ Failed to create agent:');
      console.error('Status:', error.response?.status);
      console.error('Error data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Error message:', error.message);
    }

  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testAdminAgentCreation();
