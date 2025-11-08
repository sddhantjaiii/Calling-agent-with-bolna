require('dotenv').config();
const axios = require('axios');

async function testLeadIntelligence() {
  try {
    // You need to replace this with a valid JWT token
    const token = 'YOUR_JWT_TOKEN_HERE';
    
    const response = await axios.get('http://localhost:3000/api/leads/intelligence', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('\n=== LEAD INTELLIGENCE RESPONSE ===');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Focus on the specific phone numbers
    const targetLeads = response.data.data.filter(lead => 
      lead.phone === '+91 8979556941' || lead.phone === '+91 8950311905'
    );
    
    console.log('\n=== TARGET LEADS ===');
    targetLeads.forEach(lead => {
      console.log(`Phone: ${lead.phone}`);
      console.log(`Recent Lead Tag: ${lead.recentLeadTag}`);
      console.log(`Interactions: ${lead.interactions}`);
      console.log(`Last Contact: ${lead.lastContact}`);
      console.log('---');
    });
    
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testLeadIntelligence();
