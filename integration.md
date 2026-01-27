# Plivo Browser SDK (v2) PSTN Calling — Integration Guide (Phase 0 → Real App)

This document explains **what we built**, **what credentials/resources were required**, **how the end‑to‑end call flow was achieved**, and **what went wrong along the way** (and how each issue was fixed).

It is written so you can integrate the same approach into an existing application (frontend + backend) with minimal ambiguity.

---

## 1) Scope (What Phase 0 Proves)

**Goal:** Validate that Plivo Browser SDK v2 can:
- initialize in a browser
- authenticate successfully
- place an outbound PSTN call
- achieve **two-way audio** (WebRTC ↔ Plivo ↔ PSTN)
- hang up cleanly

**Non-goals (Phase 0):** inbound calls to browser, call queues, recording, multi-agent routing, advanced UI, analytics, and production hardening.

---

## 2) High-Level Architecture

### Components
- **Browser (Chrome)**
  - loads Plivo Browser SDK v2
  - requests a short‑lived access token from your backend
  - logs in to Plivo using that token
  - initiates a call

- **Backend (Node.js + Express)**
  - provides `/token` endpoint (server-side token minting)
  - provides `/answer` and `/hangup` endpoints (Plivo XML Application webhooks)

- **Plivo Console resources**
  - **Purchased Plivo number** (PSTN-capable)
  - **XML Application** (Answer URL + Hangup URL)
  - **Endpoint identity** (username) used as token subject (`sub`)

- **Public tunnel for local dev**
  - **ngrok** (or equivalent) so Plivo can reach your local `/answer` and `/hangup`

### Call Flow Summary
We intentionally route the call via your Plivo number so that Plivo always triggers your XML Application.

Sequence:
1. Browser requests `GET /token`
2. Backend uses Plivo REST to generate a Browser SDK v2 **access token**
3. Browser calls `loginWithAccessToken(token)`
4. User enters destination (PSTN number)
5. Browser calls **your Plivo number** and passes the real destination in an extra SIP header `X-PH-Dest`
6. Plivo hits your XML Application Answer URL (`POST /answer`)
7. Backend returns Plivo XML that `<Dial>`s the real destination number
8. PSTN rings → answers → WebRTC media connects
9. On hangup, Plivo calls your Hangup URL (`POST /hangup`)

---

## 3) What We Needed (Plivo + Local Setup)

### Plivo Console Items
You must have:
1. **Auth ID** and **Auth Token** (account credentials)
2. **A purchased Plivo phone number** (e.g., Indian PSTN number)
3. **An XML Application** (Voice → Applications)
   - Primary Answer URL → `https://<public-url>/answer`
   - Hangup URL → `https://<public-url>/hangup`
   - Methods: POST recommended
4. **An Endpoint username** (Voice → Endpoints)
   - We use this as the token `sub` identity

### Local Machine Requirements
- Node.js 18+ (recommended)
- Chrome Desktop (recommended for WebRTC)
- Microphone access allowed
- ngrok installed (for local testing)

---

## 4) Environment Variables (.env)

The backend loads configuration from `.env`.

Template: `.env.example`

Required:
- `PLIVO_AUTH_ID` — Plivo Auth ID
- `PLIVO_AUTH_TOKEN` — Plivo Auth Token
- `PLIVO_APP_ID` — XML Application ID
- `PLIVO_NUMBER` — your purchased Plivo number (digits only)
- `PLIVO_ENDPOINT_USERNAME` — endpoint username for token subject

Optional:
- `TOKEN_TTL_SECONDS` — token expiry seconds (default 3600)
- `PORT` — server port (default 3000)

Security rule:
- **Never** expose `PLIVO_AUTH_TOKEN` to the browser.
- `.env` must not be committed.

---

## 5) How Authentication Was Achieved (Critical)

### What Plivo Browser SDK v2 expects
Plivo Browser SDK v2 supports an **access-token login flow**:
- Frontend calls `loginWithAccessToken(<jwt>)`
- The token must contain specific claims/structure that the SDK validates.

Key point from debugging:
- The SDK v2 expects permissions under **`per.voice.*`** (e.g., `per.voice.outgoing_allow`).
- A common mistake is generating a “legacy-looking” JWT with `grants.*`, which v2 rejects.

### How we generated tokens (working approach)
We use the Plivo Node SDK to call Plivo’s token API:

- Backend endpoint: `GET /token`
- Implementation: `client.token.create(PLIVO_AUTH_ID, { sub, app, nbf, exp, incoming_allow, outgoing_allow })`

This produces a JWT that the Browser SDK accepts.

Why we didn’t “hand-roll” JWTs:
- It’s easy to mismatch required claims (`iss`, `sub`, permissions) and end up with `onLoginFailed`.
- The Plivo token API returns the correct structure for the SDK.

---

## 6) How Outbound PSTN Calling Was Achieved (Critical)

### The core routing decision
Directly calling an arbitrary PSTN number from the browser does not reliably guarantee your XML Application executes (depending on how routing/application association is configured).

**Working strategy:**
- The browser calls **your Plivo number**.
- The XML Application attached to that number triggers the Answer URL.
- Your Answer URL returns XML to dial the *actual* destination.

### Passing the real destination number
We pass the destination number using an extra SIP header:
- Header: `X-PH-Dest: <destination>`

In the frontend:
- If `plivoNumber` is returned by `/token`, we do:
  - `client.call(plivoNumber, { 'X-PH-Dest': destination })`

### Important detail: where `X-PH-Dest` appears
During debugging we learned:
- Plivo forwards extra SIP headers into the **webhook payload body fields** (like `X-PH-Dest`), not necessarily as raw HTTP headers.

Therefore, on the backend, destination extraction is:
- `req.body['X-PH-Dest']` (preferred)
- plus fallbacks for safety

### Answer URL response (Plivo XML)
The Answer handler returns:
- `<Dial callerId="<your-plivo-number>"> <Number><destination></Number> </Dial>`

It also contains a guard to avoid dialing the Plivo number itself (prevents loops).

---

## 7) Endpoints Implemented

### `GET /token`
Purpose:
- Generate a Browser SDK v2 compatible access token.

Returns JSON:
- `token`
- `username` (derived as `${sub}_${iss}`)
- `plivoNumber` for “route via number” calling

### `POST /answer` (also supports GET)
Purpose:
- Plivo XML Application callback: decide what to dial.

Behavior:
- Reads destination from webhook payload field `X-PH-Dest`.
- Returns `<Response><Dial>...</Dial></Response>` XML.

### `POST /hangup` (also supports GET)
Purpose:
- Receives call termination details (useful for logging).

### `GET /debug/calls`
Purpose:
- List recent calls using Plivo REST (useful when debugging “why did it fail?”).

---

## 8) Frontend Requirements (Browser SDK v2)

### Required audio elements
Plivo SDK v2 expects certain `<audio>` tags to exist so it can attach tones and remote audio. We pre-created them in the HTML:
- `plivo_webrtc_remoteview`
- `plivo_ringbacktone`
- `plivo_connect_tone`
- `plivo_ringtone`
- `plivo_silent_tone`

### Autoplay & permission constraints
Modern browsers restrict audio playback unless triggered by a user gesture.

Practical approach:
- `permOnClick: true` so mic permission is tied to user action.
- We attempt to set sink IDs to `default` on a click to reduce noisy SDK warnings.

---

## 9) Errors We Faced (And How We Fixed Them)

This section is intentionally explicit because these are the typical “integration killers”.

### A) Backend crashed on startup
Symptom:
- Node server crash early.

Root cause:
- Express middleware typo (`express.urlenvoded` vs `express.urlencoded`).

Fix:
- Corrected to `express.urlencoded({ extended: true })`.

### B) Browser SDK login failed (“Authentication Error” / `onLoginFailed`)
Symptom:
- Token fetch OK, but SDK emits `onLoginFailed`.

Root cause:
- Token shape didn’t match Browser SDK v2 expectations.
- SDK expects `per.voice.incoming_allow/outgoing_allow`, not legacy `grants.*`.

Fix:
- Switched to using Plivo Token API via Node SDK (`client.token.create(...)`).
- Frontend uses `loginWithAccessToken(token)`.

### C) Outbound call immediately “Busy” and `/answer` was never hit
Symptom:
- Call attempts fail with “Busy” (or similar) and no webhook traffic.

Root cause:
- Call routing wasn’t going through the XML Application.

Fix:
- Route the call **via the Plivo number** so Answer URL always runs.

### D) Self-dial loop (From/To looked identical)
Symptom:
- Calls rang oddly or looped; logs showed destination was the Plivo number.

Root cause:
- We initially tried reading `X-PH-Dest` from HTTP headers. It was `undefined`.
- Destination fallback became `req.body.To` (the Plivo number), dialing itself.

Fix:
- Read `X-PH-Dest` from webhook payload body (`req.body['X-PH-Dest']`).
- Added a guard: refuse to dial the Plivo number itself.

### E) Browser console “errors” even though call works (AbortError, tones)
Symptom:
- Warnings like `AbortError` during tone playback, “No speaker element found”, etc.

Root cause:
- The SDK starts/stops ringback tones rapidly during state transitions.
- Browser autoplay policies and sinkId defaults can generate noisy logs.

Fix / Understanding:
- These were cosmetic; two-way audio still worked.
- We added a best-effort sinkId assignment on user gesture to reduce noise.

---

## 10) How to Run Locally (Current Harness)

1. Install dependencies:
   - `npm install`
2. Configure `.env`:
   - copy `.env.example` → `.env`
3. Start ngrok:
   - `ngrok http 3000`
4. In Plivo Console → Application:
   - Answer URL: `https://<ngrok-host>/answer` (POST)
   - Hangup URL: `https://<ngrok-host>/hangup` (POST)
5. Start server:
   - `npm start`
6. Open browser:
   - `http://localhost:3000`
7. Place a call:
   - Enter a destination number in digits (with country code)

---

## 11) Integrating Into an Existing Application (Recommended Design)

### Backend integration (recommended)
Add the following server responsibilities to your existing backend:

1. **Token endpoint (server-side)**
   - Must run in a trusted environment (never in the browser)
   - Must require your app’s authentication (session/JWT)
   - Should rate-limit per user

2. **Plivo XML webhook endpoints**
   - `/answer` must be publicly reachable
   - `/hangup` must be publicly reachable
   - Validate requests (at minimum: log + correlate; optionally verify source/IP/signature if you have a strategy)

3. **Configuration / Secrets**
   - Store `PLIVO_AUTH_TOKEN` in secrets manager (prod)
   - Environment variables in staging/dev

### Frontend integration (recommended)
Encapsulate SDK usage behind a small wrapper/module:

- `init()`
  - fetch token
  - create `new Plivo({ ... })`
  - attach event listeners
  - login with access token

- `call(destination)`
  - calls Plivo number and attaches `X-PH-Dest`

- `hangup()`

Also ensure:
- mic permission UX and fallback messaging
- audio elements exist before SDK init

### Multi-user considerations
If multiple agents/users can place calls:
- use a distinct `sub` per logged-in user (e.g., `user:<id>`)
- use short token TTL (5–30 minutes) and refresh as needed
- enforce authorization checks on `/token`

---

## 12) Production Hardening Checklist

- Serve frontend over HTTPS (mic access requires secure context except `localhost`).
- Lock down CORS on `/token` (avoid `*` in production).
- Require authentication for `/token`.
- Add rate limiting for `/token` and call actions.
- Add structured logging with correlation IDs (call UUID, user ID).
- Monitor webhook delivery failures (Plivo retries, alerting).
- Decide how you map destination dialing rules (allowlist, formatting, E.164 validation).

---

## 13) Quick Debug Checklist

If calls fail again, check in this order:

1. Browser console:
   - Did `onLogin` fire?
   - Any permission / WebRTC unsupported messages?

2. Backend logs:
   - Do you see `[HTTP] POST /answer` when calling?
   - Is `req.body['X-PH-Dest']` present?

3. ngrok:
   - Is the tunnel running?
   - Do requests show up in ngrok inspector?

4. Plivo Console:
   - Does your XML Application have the correct Answer/Hangup URLs?
   - Is the correct Plivo number associated with that application?
   - Any errors in Voice Logs?

---

## Appendix A — Where Things Live in This Harness

Backend:
- `server.js`
  - `/token` access token generation
  - `/answer` Plivo XML dialing
  - `/hangup` call end logging

Frontend:
- `index.html`
  - includes required SDK audio tags
  - loads `https://cdn.plivo.com/sdk/browser/v2/plivo.min.js`
- `app.js`
  - `loginWithAccessToken`
  - calls via Plivo number + `X-PH-Dest`
  - handles events and UI state

---

## Appendix B — Notes About This Document

This guide describes the approach that was validated on **Jan 27, 2026**, using Plivo Browser SDK v2 behavior observed in this harness.

If Plivo updates their SDK, the most fragile integration points are:
- access token claim expectations
- audio element requirements
- browser autoplay/media policies
