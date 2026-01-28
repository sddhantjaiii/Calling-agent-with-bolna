const express = require('express');
const plivo = require('plivo');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Avoid noisy favicon 404s during local testing
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Basic request logging (helps verify Plivo/ngrok callbacks are arriving)
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
});

// ==============================================
// CONFIGURATION - LOADED FROM .env FILE
// ==============================================
const PLIVO_AUTH_ID = process.env.PLIVO_AUTH_ID;
const PLIVO_AUTH_TOKEN = process.env.PLIVO_AUTH_TOKEN;
const PLIVO_APP_ID = process.env.PLIVO_APP_ID;
const YOUR_PLIVO_NUMBER = process.env.PLIVO_NUMBER;
const PLIVO_ENDPOINT_USERNAME = process.env.PLIVO_ENDPOINT_USERNAME;
const TOKEN_TTL_SECONDS = Number(process.env.TOKEN_TTL_SECONDS || 3600);

// Initialize Plivo client
const client = new plivo.Client(PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN);

// ==============================================
// ENDPOINT: Generate JWT Token for Browser SDK
// ==============================================
app.get('/token', async (req, res) => {
    try {
        console.log('[TOKEN] Generating new token...');

        if (!PLIVO_AUTH_ID || !PLIVO_AUTH_TOKEN) {
            return res.status(500).json({
                error: 'Missing Plivo credentials',
                details: 'Set PLIVO_AUTH_ID and PLIVO_AUTH_TOKEN in .env'
            });
        }

        // For Browser SDK v2 access-token flow, generate a token via Plivo's JWT/Token API.
        // This produces a JWT with the expected shape (e.g. per.voice.incoming_allow/outgoing_allow).
        const sub = PLIVO_ENDPOINT_USERNAME || 'browser-sdk-user';
        const now = Math.floor(Date.now() / 1000);
        const exp = now + (Number.isFinite(TOKEN_TTL_SECONDS) ? TOKEN_TTL_SECONDS : 3600);
        const nbf = now - 60;

        const tokenResponse = await client.token.create(PLIVO_AUTH_ID, {
            sub,
            app: PLIVO_APP_ID,
            nbf,
            exp,
            incoming_allow: true,
            outgoing_allow: true
        });

        console.log('[TOKEN] Generated successfully');
        console.log(`[TOKEN] sub: ${sub}`);
        console.log(`[TOKEN] exp: ${new Date(exp * 1000).toISOString()}`);

        res.json({
            token: tokenResponse.token,
            // Browser SDK derives username as `${sub}_${iss}` when using access tokens.
            username: `${sub}_${PLIVO_AUTH_ID}`,
            sub,
            iss: PLIVO_AUTH_ID,
            exp,
            plivoNumber: YOUR_PLIVO_NUMBER
        });
        
    } catch (error) {
        console.error('[TOKEN] Error generating token:', error);
        console.error('[TOKEN] Stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to generate token', 
            details: error.message 
        });
    }
});

// ==============================================
// DEBUG: List recent calls from Plivo REST
// ==============================================
app.get('/debug/calls', async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 10) || 10, 20);
        const calls = await client.calls.list({ limit });
        const sanitized = (calls || []).map((c) => ({
            call_uuid: c.callUuid || c.call_uuid,
            direction: c.direction,
            from: c.from,
            to: c.to,
            status: c.callStatus || c.call_status,
            hangup_cause: c.hangupCause || c.hangup_cause,
            bill_duration: c.billDuration || c.bill_duration,
            answer_time: c.answerTime || c.answer_time,
            end_time: c.endTime || c.end_time
        }));
        res.json({ count: sanitized.length, calls: sanitized });
    } catch (error) {
        console.error('[DEBUG/CALLS] Error:', error);
        res.status(500).json({ error: 'Failed to fetch calls', details: error.message });
    }
});

// ==============================================
// ENDPOINT: Answer URL - Returns XML to dial number
// ==============================================
const answerHandler = (req, res) => {
    try {
        console.log('[ANSWER] Incoming call request');
        console.log('[ANSWER] Query:', req.query);
        console.log('[ANSWER] Body:', req.body);
        console.log('[ANSWER] X-PH-Dest header:', req.headers['x-ph-dest']);
        console.log('[ANSWER] X-PH-Dest body:', req.body?.['X-PH-Dest'] || req.body?.['x-ph-dest']);
        
        // Prefer destination passed from the browser via SIP extra headers.
        // Note: Plivo forwards extra headers into the webhook payload as fields like "X-PH-Dest".
        const destinationNumber =
            req.body?.['X-PH-Dest'] ||
            req.body?.['x-ph-dest'] ||
            req.headers['x-ph-dest'] ||
            req.body.To ||
            req.query.To;
        
        if (!destinationNumber) {
            console.error('[ANSWER] No destination number provided');
            return res.status(400).send('No destination number');
        }
        
        // Guard: avoid self-dial loops if something goes wrong.
        const normalizedDest = String(destinationNumber || '').replace(/\D/g, '');
        const normalizedPlivoNumber = String(YOUR_PLIVO_NUMBER || '').replace(/\D/g, '');
        if (normalizedDest && normalizedPlivoNumber && normalizedDest === normalizedPlivoNumber) {
            console.error('[ANSWER] Refusing to dial Plivo number itself (would loop).');
            return res.status(400).send('Refusing to dial Plivo number itself');
        }

        console.log(`[ANSWER] Dialing to: ${destinationNumber}`);
        
        // Create XML response to dial the number
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="${YOUR_PLIVO_NUMBER}">
        <Number>${destinationNumber}</Number>
    </Dial>
</Response>`;
        
        res.set('Content-Type', 'text/xml');
        res.send(xml);
        
    } catch (error) {
        console.error('[ANSWER] Error:', error);
        res.status(500).send('Server error');
    }
};

// Plivo app can be configured for GET or POST. Support both to avoid silent failures.
app.post('/answer', answerHandler);
app.get('/answer', answerHandler);

// ==============================================
// ENDPOINT: Hangup URL - Receives call end notification
// ==============================================
const hangupHandler = (req, res) => {
    try {
        console.log('[HANGUP] Call ended');
        console.log('[HANGUP] Query:', req.query);
        console.log('[HANGUP] Details:', req.body);
        
        res.status(200).send('OK');
        
    } catch (error) {
        console.error('[HANGUP] Error:', error);
        res.status(500).send('Server error');
    }
};

app.post('/hangup', hangupHandler);
app.get('/hangup', hangupHandler);

// ==============================================
// SERVE STATIC FILES (Frontend)
// ==============================================
app.use(express.static(__dirname));

// ==============================================
// START SERVER
// ==============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 Plivo Minimal Test Server Running');
    console.log('='.repeat(50));
    console.log(`📡 Server URL: http://localhost:${PORT}`);
    console.log(`🔑 Token endpoint: http://localhost:${PORT}/token`);
    console.log(`📞 Answer endpoint: http://localhost:${PORT}/answer`);
    console.log(`📴 Hangup endpoint: http://localhost:${PORT}/hangup`);
    console.log('='.repeat(50));
    console.log('⚠️  IMPORTANT: Configure these URLs in Plivo Application:');
    console.log('   - Primary Answer URL: http://YOUR_PUBLIC_URL/answer');
    console.log('   - Hangup URL: http://YOUR_PUBLIC_URL/hangup');
    console.log('   (Use ngrok or similar for public URL)');
    console.log('='.repeat(50));
    console.log('📖 Open http://localhost:3000 in Chrome to test');
    console.log('='.repeat(50));
});
