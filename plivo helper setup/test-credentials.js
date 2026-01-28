// Test Plivo credentials
require('dotenv').config();
const plivo = require('plivo');

const PLIVO_AUTH_ID = process.env.PLIVO_AUTH_ID;
const PLIVO_AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN;

console.log('Testing Plivo Credentials...');
console.log('Auth ID:', PLIVO_AUTH_ID);
console.log('Auth Token (first 10 chars):', PLIVO_AUTH_TOKEN?.substring(0, 10) + '...');

// Initialize Plivo client
try {
    const client = new plivo.Client(PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN);
    
    // Test by listing endpoints
    client.endpoints.list()
        .then((response) => {
            console.log('\n✅ SUCCESS! Credentials are valid!');
            console.log('Found', response.length, 'endpoint(s)');
            response.forEach(ep => {
                console.log('  - Endpoint:', ep.username, '(Alias:', ep.alias + ')');
            });
        })
        .catch((error) => {
            console.log('\n❌ ERROR! Credentials are INVALID!');
            console.log('Error:', error.message);
            console.log('\n👉 Please verify your Auth ID and Auth Token in Plivo Console');
            console.log('   https://console.plivo.com/dashboard/');
        });
} catch (error) {
    console.log('\n❌ ERROR initializing client!');
    console.log('Error:', error.message);
}
