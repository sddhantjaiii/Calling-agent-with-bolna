# Bolna.ai API Documentation

## 🌐 Base URL
```
https://api.bolna.ai
```

## 🔐 Authentication
All API requests require Bearer token authentication:
```http
Authorization: Bearer <your_api_key>
Content-Type: application/json
```

## 📋 API Endpoints

### 1. Agent Management

#### 1.1 Create Agent
**Endpoint:** `POST /v2/agent`

**Request Body:**
```json
{
  "agent_config": {
    "agent_name": "Agent Name",
    "agent_welcome_message": "Welcome message",
    "webhook_url": "https://your-webhook-url.com/webhook",
    "agent_type": "other",
    "tasks": [
      {
        "task_type": "conversation",
        "tools_config": {
          "llm_agent": {
            "agent_type": "simple_llm_agent",
            "agent_flow_type": "streaming",
            "routes": {
              "embedding_model": "snowflake/snowflake-arctic-embed-m",
              "routes": [
                {
                  "route_name": "politics",
                  "utterances": ["Who do you think will win the elections?"],
                  "response": "I do not have opinions on politics",
                  "score_threshold": 0.9
                }
              ]
            },
            "llm_config": {
              "agent_flow_type": "streaming",
              "provider": "openai",
              "family": "openai",
              "model": "gpt-3.5-turbo",
              "max_tokens": 150,
              "temperature": 0.1,
              "top_p": 0.9,
              "request_json": true
            }
          },
          "synthesizer": {
            "provider": "polly",
            "provider_config": {
              "voice": "Matthew",
              "engine": "generative",
              "sampling_rate": "8000",
              "language": "en-US"
            },
            "stream": true,
            "buffer_size": 150,
            "audio_format": "wav"
          },
          "transcriber": {
            "provider": "deepgram",
            "model": "nova-2",
            "language": "en",
            "stream": true,
            "sampling_rate": 16000,
            "encoding": "linear16",
            "endpointing": 100
          },
          "input": {
            "provider": "twilio",
            "format": "wav"
          },
          "output": {
            "provider": "twilio",
            "format": "wav"
          }
        },
        "toolchain": {
          "execution": "parallel",
          "pipelines": [["transcriber", "llm", "synthesizer"]]
        },
        "task_config": {
          "hangup_after_silence": 10,
          "incremental_delay": 400,
          "number_of_words_for_interruption": 2,
          "hangup_after_LLMCall": false,
          "backchanneling": false,
          "ambient_noise": false,
          "call_terminate": 90,
          "voicemail": false,
          "inbound_limit": -1,
          "whitelist_phone_numbers": ["<any>"],
          "disallow_unknown_numbers": false
        }
      }
    ],
    "ingest_source_config": {
      "source_type": "api",
      "source_url": "https://example.com/api/data",
      "source_auth_token": "token123",
      "source_name": "data_source.csv"
    }
  },
  "agent_prompts": {
    "task_1": {
      "system_prompt": "Your system prompt here"
    }
  }
}
```

**Response:**
```json
{
  "agent_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "state": "created"
}
```

#### 1.2 List All Agents
**Endpoint:** `GET /v2/agent/all`

**Response:**
```json
[
  {
    "id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
    "agent_name": "Agent Name",
    "agent_type": "other",
    "agent_status": "processed",
    "created_at": "2024-01-23T01:14:37Z",
    "updated_at": "2024-01-29T18:31:22Z",
    "tasks": [...],
    "ingest_source_config": {...},
    "agent_prompts": {...}
  }
]
```

#### 1.3 Get Agent by ID
**Endpoint:** `GET /v2/agent/{agent_id}`

**Response:**
```json
{
  "id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "agent_name": "Agent Name",
  "agent_type": "other",
  "agent_status": "processed",
  "created_at": "2024-01-23T01:14:37Z",
  "updated_at": "2024-01-29T18:31:22Z",
  "tasks": [...],
  "ingest_source_config": {...},
  "agent_prompts": {...}
}
```

#### 1.4 Update Agent (Full Update)
**Endpoint:** `PUT /v2/agent/{agent_id}`

**Description:** Complete replacement of agent configuration with full structure required.

**Request Body:**
```json
{
  "agent_config": {
    "agent_name": "Alfred",
    "agent_welcome_message": "How are you doing Bruce?",
    "webhook_url": null,
    "agent_type": "other",
    "tasks": [
      {
        "task_type": "conversation",
        "tools_config": {
          "llm_agent": {
            "agent_type": "simple_llm_agent",
            "agent_flow_type": "streaming",
            "routes": {
              "embedding_model": "snowflake/snowflake-arctic-embed-m",
              "routes": [
                {
                  "route_name": "politics",
                  "utterances": [
                    "Who do you think will win the elections?",
                    "Whom would you vote for?"
                  ],
                  "response": "Hey, thanks but I do not have opinions on politics",
                  "score_threshold": 0.9
                }
              ]
            },
            "llm_config": {
              "agent_flow_type": "streaming",
              "provider": "openai",
              "family": "openai",
              "model": "gpt-3.5-turbo",
              "max_tokens": 150,
              "temperature": 0.1,
              "top_p": 0.9,
              "request_json": true
            }
          },
          "synthesizer": {
            "provider": "polly",
            "provider_config": {
              "voice": "Matthew",
              "engine": "generative",
              "sampling_rate": "8000",
              "language": "en-US"
            },
            "stream": true,
            "buffer_size": 150,
            "audio_format": "wav"
          },
          "transcriber": {
            "provider": "deepgram",
            "model": "nova-2",
            "language": "en",
            "stream": true,
            "sampling_rate": 16000,
            "encoding": "linear16",
            "endpointing": 100
          },
          "input": {
            "provider": "twilio",
            "format": "wav"
          },
          "output": {
            "provider": "twilio",
            "format": "wav"
          }
        },
        "toolchain": {
          "execution": "parallel",
          "pipelines": [["transcriber", "llm", "synthesizer"]]
        },
        "task_config": {
          "hangup_after_silence": 10,
          "incremental_delay": 400,
          "number_of_words_for_interruption": 2,
          "hangup_after_LLMCall": false,
          "backchanneling": false,
          "ambient_noise": false,
          "call_terminate": 90,
          "voicemail": false,
          "inbound_limit": -1,
          "whitelist_phone_numbers": ["<any>"],
          "disallow_unknown_numbers": false
        }
      }
    ],
    "ingest_source_config": {
      "source_type": "api",
      "source_url": "https://example.com/api/data",
      "source_auth_token": "abc123",
      "source_name": "leads_sheet_june.csv"
    }
  },
  "agent_prompts": {
    "task_1": {
      "system_prompt": "What is the Ultimate Question of Life, the Universe, and Everything?"
    }
  }
}
```

**Response:**
```json
{
  "agent_id": "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  "status": "updated"
}
```

#### 1.5 Update Agent (Partial Update)
**Endpoint:** `PATCH /v2/agent/{agent_id}`

**Description:** Partial update of specific agent properties only. Only the following fields can be updated:
- `agent_name`
- `agent_welcome_message` 
- `webhook_url`
- `synthesizer`
- `agent_prompts`
- `ingest_source_config`

**Request Body:**
```json
{
  "agent_config": {
    "agent_name": "Alfred",
    "agent_welcome_message": "How are you doing Bruce?",
    "webhook_url": null,
    "synthesizer": {
      "provider": "polly",
      "provider_config": {
        "voice": "Matthew",
        "engine": "generative",
        "sampling_rate": "8000",
        "language": "en-US"
      },
      "stream": true,
      "buffer_size": 150,
      "audio_format": "wav"
    },
    "ingest_source_config": {
      "source_type": "api",
      "source_url": "https://example.com/api/data",
      "source_auth_token": "abc123",
      "source_name": "leads_sheet_june.csv"
    }
  },
  "agent_prompts": {
    "task_1": {
      "system_prompt": "What is the Ultimate Question of Life, the Universe, and Everything?"
    }
  }
}
```

**Response:**
```json
{
  "state": "updated",
  "status": "success"
}
```

#### 1.6 Delete Agent
**Endpoint:** `DELETE /v2/agent/{agent_id}`

**Response:**
```json
{
  "message": "success",
  "status": "deleted"
}
```

### 2. Voice Management

#### 2.1 Get All Voices
**Endpoint:** `GET /me/voices`

**Response:**
```json
{
  "data": [
    {
      "id": "e64c7167-3f57-4ea1-94d4-9cb1ae16c55c",
      "voice_id": "Matthew",
      "provider": "polly",
      "name": "Matthew",
      "model": "generative",
      "accent": "United States (English)"
    }
  ],
  "state": "success"
}
```

### 3. User Management

#### 3.1 Get User Info
**Endpoint:** `GET /me`

**Response:**
```json
{
  "message": "success",
  "id": "ea75c302-f53e-453b-a6ff-89a673258607",
  "email": "user@example.com",
  "wallet": 387.527
}
```

## 🏗️ Data Structures

### Agent Configuration
```typescript
interface BolnaAgentConfig {
  agent_name: string;
  agent_welcome_message: string;
  webhook_url?: string;
  agent_type: string;
  tasks: BolnaTask[];
  ingest_source_config?: BolnaIngestConfig;
}

interface BolnaTask {
  task_type: "conversation";
  tools_config: BolnaToolsConfig;
  toolchain: BolnaToolchain;
  task_config: BolnaTaskConfig;
}

interface BolnaToolsConfig {
  llm_agent: BolnaLLMAgent;
  synthesizer: BolnaSynthesizer;
  transcriber: BolnaTranscriber;
  input: BolnaInput;
  output: BolnaOutput;
}

interface BolnaLLMAgent {
  agent_type: "simple_llm_agent";
  agent_flow_type: "streaming";
  routes?: BolnaRoutes;
  llm_config: BolnaLLMConfig;
}

interface BolnaSynthesizer {
  provider: string;
  provider_config: {
    voice: string;
    engine: string;
    sampling_rate: string;
    language: string;
  };
  stream: boolean;
  buffer_size: number;
  audio_format: string;
}

interface BolnaTranscriber {
  provider: string;
  model: string;
  language: string;
  stream: boolean;
  sampling_rate: number;
  encoding: string;
  endpointing: number;
}
```

## 📝 Usage Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'https://api.bolna.ai',
  headers: {
    'Authorization': 'Bearer your_api_key',
    'Content-Type': 'application/json'
  }
});

// Create agent
const agentData = { agent_config: { ... } };
const response = await client.post('/v2/agent', agentData);
console.log('Agent ID:', response.data.agent_id);

// List agents
const agents = await client.get('/v2/agent/all');
console.log('Found agents:', agents.data.length);
```

### TypeScript
```typescript
import axios, { AxiosInstance } from 'axios';

class BolnaService {
  private client: AxiosInstance;

  constructor(apiKey: string) {
    this.client = axios.create({
      baseURL: 'https://api.bolna.ai',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async createAgent(config: BolnaAgentConfig): Promise<{agent_id: string}> {
    const response = await this.client.post('/v2/agent', { agent_config: config });
    return response.data;
  }

  async listAgents(): Promise<BolnaAgent[]> {
    const response = await this.client.get('/v2/agent/all');
    return response.data;
  }
}
```

## 🚨 Error Handling

### Common Error Responses
```json
{
  "detail": [
    {
      "type": "missing",
      "loc": ["body", "agent_config"],
      "msg": "Field required"
    }
  ]
}
```

### HTTP Status Codes
- `200` - Success
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

## 🔄 Migration Notes

### From ElevenLabs to Bolna.ai
1. **Endpoint Changes:**
   - ElevenLabs: `/v1/convai/agents` → Bolna: `/v2/agent/all`
   - ElevenLabs: `POST /v1/convai/agents` → Bolna: `POST /v2/agent`
   - Bolna: `PUT /v2/agent/{id}` → Full agent replacement
   - Bolna: `PATCH /v2/agent/{id}` → Partial agent updates

2. **Structure Changes:**
   - Wrap agent data in `agent_config` object
   - Use `llm_agent` instead of separate `llm` tool
   - Different toolchain pipeline structure
   - More detailed task configuration required
   - Different response formats: PUT uses `status`, PATCH uses `state`

3. **Update Capabilities:**
   - PUT: Complete agent replacement (requires full structure)
   - PATCH: Partial updates (limited to specific fields only)
   - PATCH updatable fields: agent_name, agent_welcome_message, webhook_url, synthesizer, agent_prompts, ingest_source_config

4. **Authentication:**
   - ElevenLabs: `xi-api-key` header → Bolna: `Authorization: Bearer` header

## 📊 Final Testing Summary (Sept 26, 2025)

### ✅ **CONFIRMED WORKING ENDPOINTS:**
- ✅ `POST /v2/agent` - Agent creation **LIVE TESTED** ✅
- ✅ `GET /v2/agent/all` - Agent listing **LIVE TESTED** ✅  
- ✅ `GET /v2/agent/{agent_id}` - Agent retrieval **LIVE TESTED** ✅
- ⚠️ `PUT /v2/agent/{agent_id}` - Agent full updates **API LIMITATION** ⚠️
- 🆕 `PATCH /v2/agent/{agent_id}` - Agent partial updates **READY FOR TESTING** 🆕
- ✅ `DELETE /v2/agent/{agent_id}` - Agent deletion **LIVE TESTED** ✅
- ✅ `GET /me/voices` - Voice listing **LIVE TESTED** ✅

### 📈 **MIGRATION STATUS:**
- **Phase 1**: Environment & Database ✅ **COMPLETE**
- **Phase 2**: Schema & Data Migration ✅ **COMPLETE**  
- **Phase 3**: Agent Management Pipeline ✅ **COMPLETE & VERIFIED**
- **Phase 4**: Call Management & Webhooks 🚧 **READY FOR IMPLEMENTATION**

---

**Last Updated**: September 26, 2025  
**API Version**: Bolna.ai V2  
**Implementation Status**: Agent Management Complete & Live Tested, Call Management Ready for Testing