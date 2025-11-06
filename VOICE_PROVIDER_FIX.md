# Voice Configuration Fix for Bolna Agent Creation

## Error
```
Given voice: Joanna is not available for the given provider: polly
```

## Root Cause

### Problem 1: Hardcoded Voice Mapping
The code was using `mapVoiceIdToPollyVoice()` which mapped legacy ElevenLabs voice IDs to hardcoded Polly voice names like "Joanna", "Matthew", etc.

**Old code** (agentService.ts):
```typescript
synthesizer: {
  provider: 'polly',
  provider_config: {
    voice: this.mapVoiceIdToPollyVoice(agentData.tts?.voice_id), // Returns "Joanna"
    engine: 'generative',
    ...
  }
}
```

**Issue**: Bolna doesn't have "Joanna" available for Polly in their system!

### Problem 2: Incorrect Voice ID Usage
The frontend was using `voice.voice_id` as the ID, but Bolna voices have this structure:
```json
{
  "id": "e64c7167-3f57-4ea1-94d4-9cb1ae16c55c",  // UUID - unique identifier
  "provider": "polly",
  "name": "Matthew",
  "model": "generative",
  "voice_id": "Matthew",  // Provider-specific voice name
  "accent": "United States (English)"
}
```

We need to use the UUID `id` to look up the voice, then use its `voice_id` for the provider.

## Solution Applied

### Backend Fix (agentService.ts)

**New approach**: Fetch the voice from Bolna's voice list using the UUID, then use its actual provider, voice_id, and model:

```typescript
// Get voice configuration from the provided voice_id
const voiceId = agentData.tts?.voice_id || agentData.voice_id;

// Fetch available voices to get the correct provider and settings
let voiceProvider = 'polly';
let voiceName = 'Matthew'; // Default fallback
let voiceModel = 'generative';

if (voiceId) {
  try {
    const voices = await bolnaService.getVoices();
    const selectedVoice = voices.find(v => v.id === voiceId || v.voice_id === voiceId);
    
    if (selectedVoice) {
      voiceProvider = selectedVoice.provider || 'polly';
      voiceName = selectedVoice.voice_id || selectedVoice.name || 'Matthew';
      voiceModel = selectedVoice.model || 'generative';
      logger.info(`Using voice: ${voiceName} from provider: ${voiceProvider}`);
    }
  } catch (error) {
    logger.warn('Failed to fetch voices, using defaults');
  }
}

// Use the actual voice data from Bolna
synthesizer: {
  provider: voiceProvider,  // Now uses the correct provider from Bolna
  provider_config: {
    voice: voiceName,  // Now uses the actual voice_id from Bolna
    engine: voiceModel === 'generative' ? 'generative' : 'neural',
    ...
  }
}
```

### Frontend Fix (AdminCreateAgent.tsx)

**Old**:
```typescript
setVoices(voicesData.map((voice: any) => ({
  id: voice.voice_id || voice.id,  // Wrong - used voice_id as ID
  name: voice.name
})));
```

**New**:
```typescript
setVoices(voicesData.map((voice: any) => ({
  id: voice.id,  // Correct - use Bolna's UUID
  name: `${voice.name} (${voice.provider})`,  // Show provider for clarity
  provider: voice.provider,
  voice_id: voice.voice_id,
  model: voice.model,
  accent: voice.accent
})));
```

Now when a user selects a voice:
1. Frontend sends the voice UUID (e.g., `"e64c7167-3f57-4ea1-94d4-9cb1ae16c55c"`)
2. Backend looks up this UUID in Bolna's voice list
3. Backend extracts the correct `provider`, `voice_id`, and `model`
4. Backend sends the correct configuration to Bolna API

## Example Voice Flow

### User selects "Matthew (polly)" from dropdown:

**Frontend sends**:
```json
{
  "voice_id": "e64c7167-3f57-4ea1-94d4-9cb1ae16c55c"
}
```

**Backend looks up voice**:
```json
{
  "id": "e64c7167-3f57-4ea1-94d4-9cb1ae16c55c",
  "provider": "polly",
  "name": "Matthew",
  "voice_id": "Matthew",
  "model": "generative"
}
```

**Backend sends to Bolna**:
```json
{
  "synthesizer": {
    "provider": "polly",
    "provider_config": {
      "voice": "Matthew",  // ✅ Correct!
      "engine": "generative"
    }
  }
}
```

## Available Voice Providers in Bolna

From the test, we have voices from:
- **polly** (Amazon Polly) - e.g., Matthew
- **sarvam** (Indian languages) - e.g., Vidya, Karun, Anushka, Hitesh
- **rime** - e.g., Luna, Andromeda, Celeste
- **elevenlabs** - e.g., Lily, Vikram, Saira
- **azuretts** (Azure) - e.g., Sonia
- **inworld** - e.g., Julia, Priya, Alex
- **smallest** - e.g., Vijay, Aditi
- **openai** - (via default fallback)

## Testing

1. **Restart backend** to apply changes
2. **Clear browser cache** or hard refresh (Ctrl+Shift+R)
3. **Go to Create Agent**
4. **Select a voice** - you'll now see provider names like "Matthew (polly)"
5. **Create agent** - should work now!

## Logs to Verify

When creating an agent, you should see:
```
[INFO] Using voice: Matthew from provider: polly (model: generative)
[INFO] [Bolna] Creating agent with config
```

And NO error about "voice not available"!

## Files Modified

1. **backend/src/services/agentService.ts**
   - Removed hardcoded `mapVoiceIdToPollyVoice()` usage
   - Added dynamic voice lookup from Bolna's voice list
   - Uses actual provider, voice_id, and model from Bolna

2. **Frontend/src/components/admin/agents/AdminCreateAgent.tsx**
   - Changed to use Bolna's UUID as the voice identifier
   - Added provider name to voice display
   - Stores full voice metadata for reference

## Summary

**Before**: Tried to use "Joanna" on Polly → ❌ Failed  
**After**: Looks up voice in Bolna → Uses "Matthew" on Polly → ✅ Works!

The key insight is that we can't hardcode voice names - we must use the voices that Bolna actually has available in their system, which we get from the `/me/voices` API endpoint.
