const { Pool } = require('pg');
require('dotenv').config();

// Import the compiled Gmail service
const path = require('path');

async function testGmailSend() {
  console.log('📧 Testing Gmail send with new token...\n');
  
  const userId = '789895c8-4bd6-43e9-bfea-a4171ec47197';
  
  // First, let's use the Gmail API directly to test
  const { google } = require('googleapis');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Get user tokens from database
    const result = await pool.query(`
      SELECT google_access_token, google_refresh_token, google_email
      FROM users WHERE id = $1
    `, [userId]);
    
    if (!result.rows[0]) {
      console.error('User not found');
      return;
    }
    
    const user = result.rows[0];
    console.log('📝 Found user:', user.google_email);
    
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET
    );
    
    oauth2Client.setCredentials({
      access_token: user.google_access_token,
      refresh_token: user.google_refresh_token
    });
    
    // Create Gmail API client
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Note: gmail.send scope ONLY allows sending emails, NOT reading profile
    // So we skip the getProfile test and go straight to sending
    console.log('📤 Sending test email (gmail.send scope only allows sending, not reading profile)...');
    
    const toEmail = user.google_email; // Send to self
    const subject = 'Test Email from AI Calling Agent';
    const body = `This is a test email sent via Gmail API at ${new Date().toISOString()}\n\nIf you received this, Gmail integration is working!`;
    
    // Build raw email
    const messageParts = [
      `From: ${user.google_email}`,
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ];
    const rawMessage = Buffer.from(messageParts.join('\r\n'))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage
      }
    });
    
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', response.data.id);
    console.log('   Thread ID:', response.data.threadId);
    console.log('\n📬 Check your inbox at', user.google_email);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await pool.end();
  }
}

testGmailSend();
