const { Pool } = require('pg');
const { google } = require('googleapis');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function debugGmailToken() {
  const userId = '789895c8-4bd6-43e9-bfea-a4171ec47197';
  
  try {
    // Get the access token from database
    const result = await pool.query(`
      SELECT google_access_token, google_refresh_token, google_email, google_token_expiry
      FROM users WHERE id = $1
    `, [userId]);
    
    const user = result.rows[0];
    console.log('📝 User email:', user.google_email);
    console.log('📝 Token expiry:', user.google_token_expiry);
    console.log('📝 Access token length:', user.google_access_token?.length);
    console.log('📝 Refresh token length:', user.google_refresh_token?.length);
    
    // Check what scopes the token actually has by calling Google's tokeninfo endpoint
    console.log('\n🔍 Checking token scopes via Google tokeninfo API...');
    
    const axios = require('axios');
    try {
      const tokenInfoResponse = await axios.get(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${user.google_access_token}`
      );
      console.log('✅ Token info from Google:');
      console.log('   Scopes:', tokenInfoResponse.data.scope);
      console.log('   Email:', tokenInfoResponse.data.email);
      console.log('   Expires in:', tokenInfoResponse.data.expires_in, 'seconds');
      console.log('   Has gmail.send:', tokenInfoResponse.data.scope?.includes('gmail.send'));
    } catch (tokenError) {
      console.error('❌ Token info error:', tokenError.response?.data || tokenError.message);
    }
    
    // Also try to refresh and get a new token
    console.log('\n🔄 Trying to refresh token to get new access token with correct scopes...');
    
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      refresh_token: user.google_refresh_token
    });
    
    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log('✅ New token obtained:');
    console.log('   Scope:', credentials.scope);
    console.log('   Has gmail.send:', credentials.scope?.includes('gmail.send'));
    
    // Check the NEW token's scopes
    console.log('\n🔍 Checking NEW token scopes...');
    const newTokenInfo = await axios.get(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${credentials.access_token}`
    );
    console.log('   Scopes:', newTokenInfo.data.scope);
    console.log('   Has gmail.send:', newTokenInfo.data.scope?.includes('gmail.send'));
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Details:', error.response.data);
    }
  } finally {
    await pool.end();
  }
}

debugGmailToken();
