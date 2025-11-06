require('dotenv').config();
const axios = require('axios');

async function checkAgents() {
  const client = axios.create({
    baseURL: 'https://api.bolna.ai',
    headers: {
      'Authorization': `Bearer ${process.env.BOLNA_API_KEY}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  try {
    const response = await client.get('/v2/agent/all');
    console.log('Existing agents:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('Error:', error.message);
  }
}

checkAgents();