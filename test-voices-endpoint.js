const axios = require('axios');

const API_BASE = 'http://localhost:3000';

async function testVoicesEndpoint() {
  try {
    console.log('\n=== Testing Voices Endpoint ===\n');

    // Try fetching without auth first to see the error
    console.log('1. Testing without authentication...');
    try {
      const response = await axios.get(`${API_BASE}/api/admin/agents/voices`);
      console.log('Response:', response.data);
    } catch (error) {
      console.log('Expected error (no auth):', error.response?.status, error.response?.data?.error?.message);
    }

    // Now test with a token (you need to get a real token first)
    console.log('\n2. To test with authentication, you need to:');
    console.log('   a. Get an admin token by logging in');
    console.log('   b. Add it to the Authorization header');
    console.log('\nExample:');
    console.log('   const response = await axios.get(`${API_BASE}/api/admin/agents/voices`, {');
    console.log('     headers: { Authorization: `Bearer YOUR_TOKEN` }');
    console.log('   });');

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testVoicesEndpoint();
