# Plivo Browser SDK Minimal Test - Phase 0

## 📋 Quick Setup Guide

This is a minimal implementation to validate Plivo Browser SDK integration for outbound PSTN calls.

---

## ✅ Prerequisites

- **Node.js** ≥ 18.x installed
- **Chrome** browser (desktop)
- **Active Plivo account** with:
  - Auth ID
  - Auth Token
  - One purchased Indian PSTN number
  - One XML Application (Build My Own)
- **Audio**: Headphones + microphone recommended
- **Network**: Open internet access

---

## 🚀 Setup Steps

### Step 1: Install Dependencies

```bash
cd Testing-plivo
npm install
```

### Step 2: Configure Plivo Credentials

Copy the env template and fill in your credentials:

```bash
copy .env.example .env
```

Then edit `.env`:
- `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`
- `PLIVO_APP_ID` (your XML Application ID)
- `PLIVO_NUMBER` (your purchased Plivo number, digits only)
- `PLIVO_ENDPOINT_USERNAME` (the Endpoint username you created in Plivo console)

### Step 3: Configure Plivo Application (Important!)

For local testing, you need to expose your local server to the internet so Plivo can reach your Answer and Hangup URLs.

#### Option A: Using ngrok (Recommended)

1. Install ngrok: https://ngrok.com/download
2. Run ngrok:
   ```bash
   ngrok http 3000
   ```
3. Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok.io`)

#### Option B: Using localtunnel

```bash
npx localtunnel --port 3000
```

#### Configure Plivo Application:

1. Go to Plivo Console → Voice → Applications
2. Select or create your XML Application
3. Set **Primary Answer URL**: `https://your-ngrok-url.ngrok.io/answer`
4. Set **Hangup URL**: `https://your-ngrok-url.ngrok.io/hangup`
5. Set **Answer Method**: POST
6. Set **Hangup Method**: POST
7. Enable **Public URI**
8. **Save** the application

### Step 4: Start the Server

```bash
npm start
```

You should see:
```
🚀 Plivo Minimal Test Server Running
📡 Server URL: http://localhost:3000
🔑 Token endpoint: http://localhost:3000/token
📞 Answer endpoint: http://localhost:3000/answer
📴 Hangup endpoint: http://localhost:3000/hangup
```

### Step 5: Open Browser

1. Open **Chrome** browser
2. Navigate to: `http://localhost:3000`
3. **Allow microphone permission** when prompted
4. Wait for SDK status to show "Ready ✓"

### Step 6: Make a Test Call

1. Enter destination phone number (e.g., `919876543210`)
2. Click **"Call"** button
3. Wait for ringing and answer
4. **Verify two-way audio**:
   - Speak into your microphone
   - Listen for audio from the called phone
5. Click **"Hang Up"** to end call

---

## 🎯 Acceptance Criteria Checklist

- [ ] SDK initializes without errors
- [ ] Token is fetched from backend successfully
- [ ] Outbound call reaches real phone
- [ ] Two-way audio is confirmed (both directions)
- [ ] Hangup works without page reload
- [ ] Call appears in Plivo console logs
- [ ] No demo infrastructure is used

---

## 🔍 Troubleshooting

### SDK not initializing

- Check browser console for errors
- Verify backend is running (`http://localhost:3000/token` should return JSON)
- Ensure Plivo credentials are correct in `server.js`

### Call not connecting

- Verify Plivo Application Answer URL is publicly accessible
- Check ngrok/localtunnel is running and forwarding to port 3000
- Verify phone number format (should be digits only, with country code)
- Check Plivo account balance
- Review Plivo console logs for errors

### One-way audio

- Check microphone permissions in Chrome
- Ensure NAT/firewall is not blocking WebRTC
- Try using headphones to avoid echo/feedback
- Check browser console for WebRTC errors

### Answer URL not being called

- Verify ngrok/localtunnel URL is correct in Plivo Application
- Check Answer URL uses HTTPS (required by Plivo)
- Verify Answer Method is set to POST
- Check backend server logs for incoming requests

---

## 📁 Project Structure

```
Testing-plivo/
├── package.json          # Node.js dependencies
├── server.js            # Backend (Express + Plivo)
├── index.html           # Frontend UI
├── app.js               # Plivo Browser SDK logic
└── README.md            # This file
```

---

## 🔧 Server Endpoints

### GET /token
Returns JWT token for Browser SDK authentication.

**Response:**
```json
{
  "token": "eyJhbGc...",
  "username": "<sub>_<iss>"
}
```

### POST /answer
Receives call initiation from Plivo and returns XML to dial destination.

**Request Body:**
```
To: 919876543210
From: browser-user-123
```

**Response:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial callerId="YOUR_PLIVO_NUMBER">
        <Number>919876543210</Number>
    </Dial>
</Response>
```

### POST /hangup
Receives call termination notification from Plivo.

**Request Body:**
```
CallUUID: abc123...
Duration: 45
```

---

## 📊 Testing Workflow

1. **Initialize**: SDK fetches token and logs in
2. **Call**: User clicks Call → SDK initiates call → Plivo calls Answer URL
3. **Answer**: Backend returns XML → Plivo dials destination → PSTN call established
4. **Audio**: WebRTC media negotiation → Two-way audio active
5. **Hangup**: User clicks Hang Up → Call terminated → Hangup URL called

---

## ⚠️ Important Notes

- **Never expose Auth Token** to browser (always generate tokens server-side)
- **Use HTTPS** for production (required for microphone access)
- **Phone number format**: Include country code without + (e.g., 919876543210)
- **Plivo Application** must use publicly accessible URLs
- **Browser support**: Chrome desktop recommended
- **Microphone permission** must be granted explicitly

---

## 🐛 Debug Tips

### Browser Console

Check for SDK events:
```javascript
window.plivoDebug.sdk()      // Access SDK instance
window.plivoDebug.call()     // Access current call
window.plivoDebug.makeTestCall('919876543210')  // Programmatic call
```

### Server Logs

Backend logs all events with prefixes:
- `[TOKEN]` - Token generation
- `[ANSWER]` - Answer URL requests
- `[HANGUP]` - Hangup notifications

### Plivo Console

Check Voice → Live Calls and Voice → Logs for:
- Call UUID
- Call status
- Error messages
- Audio quality metrics

---

## ✨ Success Indicators

**SDK Status**: "Ready ✓" (green)
**Call Status**: "Call connected ✓" (green)
**Browser Console**: No errors
**Server Logs**: Answer URL called
**Plivo Console**: Call appears with "completed" status
**Audio Test**: Can hear and be heard clearly

---

## 📝 Phase 0 Complete When:

1. All artifacts exist locally ✓
2. Successful outbound call demonstrated ✓
3. Audio quality acceptable ✓
4. Setup reproducible on another machine ✓
5. No refactoring needed ✓

---

## 🆘 Support

If issues persist after troubleshooting:
1. Check Plivo status: https://status.plivo.com
2. Review Plivo docs: https://www.plivo.com/docs/
3. Check browser compatibility
4. Verify network connectivity
5. Test with different phone number

---

**Phase 0 Testing Framework Ready** 🎉
