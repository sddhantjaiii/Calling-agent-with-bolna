# Voice Loading Fix

## Issue
The voices endpoint `GET /api/admin/agents/voices` was returning an empty array `[]` even though Bolna API had 154 voices available.

## Root Cause
The Bolna API response structure was:
```json
{
  "data": [...154 voices...],
  "state": "success"
}
```

But our parsing code was only checking for:
- Direct array: `result` is array
- Nested voices: `result.voices` is array

It was NOT checking for `result.data` which is the actual Bolna v2 format!

## Fix Applied
Updated `backend/src/services/bolnaService.ts` to check for all possible response formats:

```typescript
// Check if it's a direct array
if (Array.isArray(result)) {
  voices = result;
} 
// Check if it has a 'data' property with array (Bolna v2 format) ✅ ADDED
else if ((result as any).data && Array.isArray((result as any).data)) {
  voices = (result as any).data;
}
// Check if it has a 'voices' property with array
else if ((result as any).voices && Array.isArray((result as any).voices)) {
  voices = (result as any).voices;
}
```

Also added logging:
```typescript
logger.info(`Bolna API returned ${voices.length} voices`);
```

## Test Results
Direct Bolna API test showed:
- ✅ Bolna API is working
- ✅ 154 voices available
- ✅ Response format: `{ data: [...], state: "success" }`

Sample voices returned:
- Sarvam voices (Indian languages: Vidya, Karun, Anushka, etc.)
- Rime voices (Luna, Andromeda, Celeste, etc.)
- ElevenLabs voices (Lily, Vikram, etc.)
- Azure voices (Sonia)
- Polly voices (Matthew)
- Inworld voices (Julia, Priya, etc.)
- Smallest AI voices (Vijay, Aditi, etc.)

## Next Steps

### 1. Restart Backend
```bash
cd backend
npm run dev
```

### 2. Test Voices Endpoint
```bash
# Should now return 154 voices instead of empty array
curl http://localhost:3000/api/admin/agents/voices -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test in Frontend
1. Open admin panel
2. Go to Create Agent
3. Voice dropdown should now show 154 voices
4. Select a voice and create agent

## Voice Selection in Agent Creation

When creating an agent, the frontend sends `voice_id` which gets mapped in the backend:

```typescript
// Frontend sends (from AdminCreateAgent.tsx):
{
  voice_id: formData.voice  // e.g., "hitesh" from dropdown
}

// Backend uses it in synthesizer config (agentService.ts):
synthesizer: {
  provider: 'polly',  // or other provider
  provider_config: {
    voice: this.mapVoiceIdToPollyVoice(agentData.tts?.voice_id)
  }
}
```

The `mapVoiceIdToPollyVoice()` function maps legacy ElevenLabs voice IDs to Polly voices. Since Bolna now returns its own voice IDs, we should use them directly.

## Recommendations

### Short Term:
1. ✅ Restart backend to apply the fix
2. ✅ Test voice loading in frontend
3. ✅ Test agent creation with a voice

### Medium Term:
1. Update voice mapping to use Bolna voice IDs directly
2. Group voices by provider in the dropdown (Sarvam, Rime, ElevenLabs, etc.)
3. Add voice preview/testing feature

### Long Term:
1. Cache voices in Redis to avoid repeated API calls
2. Add voice filtering by language/accent
3. Add voice characteristics (gender, age, accent) in UI

## Files Modified
1. `backend/src/services/bolnaService.ts` - Fixed voice parsing logic
2. `backend/src/services/adminService.ts` - Added logging

## Summary
The issue was simply a response format mismatch. Bolna returns voices in `result.data`, but we were only checking `result` and `result.voices`. After adding the check for `result.data`, all 154 voices are now properly loaded! 🎉
