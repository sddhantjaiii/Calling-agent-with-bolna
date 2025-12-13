/**
 * Test Script: Chat Agent Server Token Sync
 * Tests the Google Calendar token synchronization with chat agent server
 */

require('dotenv').config();
const { Pool } = require('pg');
const axios = require('axios');

const userId = '789895c8-4bd6-43e9-bfea-a4171ec47197';
const chatAgentServerUrl = process.env.CHAT_AGENT_SERVER_URL || 'http://localhost:4000';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('\n🔍 Step 1: Checking user in main database...\n');
    
    const userResult = await pool.query(
      `SELECT id, email, name, google_calendar_connected, google_email, 
              google_access_token, google_refresh_token, google_token_expiry 
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      console.log('❌ User not found in database');
      await pool.end();
      return;
    }

    const user = userResult.rows[0];
    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Google Calendar Connected: ${user.google_calendar_connected}`);
    console.log(`   Google Email: ${user.google_email || 'N/A'}`);
    console.log(`   Has Access Token: ${!!user.google_access_token}`);
    console.log(`   Has Refresh Token: ${!!user.google_refresh_token}`);
    console.log(`   Token Expiry: ${user.google_token_expiry || 'N/A'}`);

    if (!user.google_calendar_connected) {
      console.log('\n⚠️  User has not connected Google Calendar yet');
      console.log('   Please connect Google Calendar first via the frontend\n');
      await pool.end();
      return;
    }

    console.log(`\n🔍 Step 2: Testing chat agent server at ${chatAgentServerUrl}...\n`);

    // Test 1: Sync tokens to chat agent server
    console.log('📤 Test 1: POST tokens to chat agent server...');
    try {
      const syncResponse = await axios.post(
        `${chatAgentServerUrl}/api/users/${userId}/google-calendar/connect`,
        {
          access_token: user.google_access_token,
          refresh_token: user.google_refresh_token,
          token_expiry: user.google_token_expiry,
          scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events'
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000
        }
      );

      console.log('✅ Sync successful:');
      console.log(`   Response: ${JSON.stringify(syncResponse.data, null, 2)}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.log('❌ Sync failed:');
        console.log(`   Status: ${error.response?.status}`);
        console.log(`   Message: ${error.message}`);
        console.log(`   Response: ${JSON.stringify(error.response?.data, null, 2)}`);
      } else {
        console.log(`❌ Sync error: ${error.message}`);
      }
    }

    // Test 2: Get token details from chat agent server
    console.log('\n📥 Test 2: GET tokens from chat agent server...');
    try {
      const getResponse = await axios.get(
        `${chatAgentServerUrl}/api/google-tokens/${userId}`,
        { timeout: 10000 }
      );

      console.log('✅ Get successful:');
      console.log(`   Connected: ${getResponse.data.token_info ? 'Yes' : 'No'}`);
      if (getResponse.data.token_info) {
        console.log(`   Token Expiry: ${getResponse.data.token_info.token_expiry}`);
        console.log(`   Is Expired: ${getResponse.data.token_info.is_expired}`);
        console.log(`   Expires In: ${getResponse.data.token_info.expires_in_minutes} minutes`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          console.log('⚠️  No tokens found on chat agent server (not yet synced)');
        } else {
          console.log('❌ Get failed:');
          console.log(`   Status: ${error.response?.status}`);
          console.log(`   Message: ${error.message}`);
        }
      } else {
        console.log(`❌ Get error: ${error.message}`);
      }
    }

    // Test 3: Delete tokens (optional - commented out by default)
    // console.log('\n🗑️  Test 3: DELETE tokens from chat agent server...');
    // try {
    //   const deleteResponse = await axios.delete(
    //     `${chatAgentServerUrl}/api/google-tokens/${userId}`,
    //     { timeout: 10000 }
    //   );
    //   console.log('✅ Delete successful');
    // } catch (error) {
    //   console.log(`❌ Delete error: ${error.message}`);
    // }

    console.log('\n✅ All tests completed!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
