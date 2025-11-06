const axios = require('axios');

// Test the voices endpoint directly with Bolna API
async function testBolnaVoices() {
  console.log('\n=== Testing Bolna Voices API ===\n');

  const BOLNA_API_KEY = 'bn-82703f35520043f6bfea9dd0d5596a8b';
  const BOLNA_BASE_URL = 'https://api.bolna.ai';

  try {
    console.log('1. Testing Bolna /me/voices endpoint directly...');
    
    const response = await axios.get(`${BOLNA_BASE_URL}/me/voices`, {
      headers: {
        'Authorization': `Bearer ${BOLNA_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Bolna API Response Status:', response.status);
    console.log('✅ Bolna API Response Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data && Array.isArray(response.data)) {
      console.log(`\n✅ Found ${response.data.length} voices`);
    } else if (response.data && response.data.voices) {
      console.log(`\n✅ Found ${response.data.voices.length} voices`);
    } else {
      console.log('\n⚠️ No voices in response, will use defaults');
    }

  } catch (error) {
    console.error('❌ Bolna API Error:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);
    
    console.log('\n⚠️ When Bolna API fails, default voices should be used:');
    console.log('- Polly voices (Matthew, Joanna, Amy, Brian, Emma, etc.)');
    console.log('- Azure voices (Jenny, Guy)');
    console.log('- OpenAI voices (Alloy, Echo, Fable, Onyx, Nova, Shimmer)');
  }
}

testBolnaVoices();
