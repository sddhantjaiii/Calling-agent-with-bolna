import axios from 'axios';
import FormData from 'form-data';

function summarizeAxiosError(err: any): {
  message: string;
  status?: number;
  url?: string;
  dataSnippet?: string;
} {
  const status = err?.response?.status;
  const url = err?.config?.url;
  const rawData = err?.response?.data;

  let dataSnippet: string | undefined;
  try {
    if (typeof rawData === 'string') {
      dataSnippet = rawData.slice(0, 600);
    } else if (rawData && typeof rawData === 'object') {
      dataSnippet = JSON.stringify(rawData).slice(0, 600);
    }
  } catch {
    // ignore
  }

  return {
    message: err?.message || 'Request failed',
    status,
    url,
    dataSnippet,
  };
}

export class OpenAIWhisperService {
  static async transcribeFromUrl(params: {
    audioUrl: string;
    apiKey: string;
    model?: string;
    language?: string;
    prompt?: string;
    timeoutMs?: number;
    maxBytes?: number;
  }): Promise<string> {
    const {
      audioUrl,
      apiKey,
      model = 'whisper-1',
      language,
      prompt,
      timeoutMs = 120_000,
      maxBytes = 50 * 1024 * 1024,
    } = params;

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Download media
    let mediaResp: any;
    try {
      const plivoAuthId = process.env.PLIVO_AUTH_ID;
      const plivoAuthToken = process.env.PLIVO_AUTH_TOKEN;
      const shouldUsePlivoAuth = Boolean(plivoAuthId && plivoAuthToken);

      mediaResp = await axios.get<ArrayBuffer>(audioUrl, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        // Let axios throw on non-2xx so we can provide a better error.
        validateStatus: (s) => s >= 200 && s < 300,
        headers: {
          Accept: 'audio/*,application/octet-stream,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': 'CallingAgent/1.0 (Whisper transcription downloader)',
        },
        ...(shouldUsePlivoAuth
          ? {
              auth: {
                username: plivoAuthId as string,
                password: plivoAuthToken as string,
              },
            }
          : {}),
      });
    } catch (err: any) {
      const summary = summarizeAxiosError(err);
      throw new Error(
        `Recording download failed (status ${summary.status ?? 'unknown'}). URL=${summary.url || audioUrl}. ${summary.dataSnippet ? `Body=${summary.dataSnippet}` : ''}`.trim()
      );
    }

    const buffer = Buffer.from(mediaResp.data as ArrayBuffer);

    const contentTypeHeader = (mediaResp.headers?.['content-type'] ?? mediaResp.headers?.['Content-Type']) as
      | string
      | string[]
      | null
      | undefined;
    const contentType = Array.isArray(contentTypeHeader)
      ? contentTypeHeader[0]
      : (contentTypeHeader || undefined);

    // OpenAI's audio upload limits are smaller than many raw recordings.
    // Keep a conservative default cap, but allow callers to tighten via maxBytes.
    const maxUploadBytes = Math.min(maxBytes, 25 * 1024 * 1024);

    const form = new FormData();
    form.append('model', model);
    form.append('file', buffer, {
      filename: 'recording.mp3',
      contentType: contentType || 'audio/mpeg',
    });

    if (language) form.append('language', language);
    if (prompt) form.append('prompt', prompt);

    let resp: { data: { text: string } };
    try {
      resp = await axios.post<{ text: string }>('https://api.openai.com/v1/audio/transcriptions', form, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...form.getHeaders(),
        },
        timeout: timeoutMs,
        maxContentLength: maxUploadBytes,
        maxBodyLength: maxUploadBytes,
        validateStatus: (s) => s >= 200 && s < 300,
      });
    } catch (err: any) {
      const summary = summarizeAxiosError(err);
      throw new Error(
        `OpenAI transcription failed (status ${summary.status ?? 'unknown'}). ${summary.dataSnippet ? `Body=${summary.dataSnippet}` : summary.message}`
      );
    }

    const text = resp.data?.text;
    if (!text || typeof text !== 'string') {
      throw new Error('Whisper transcription returned empty text');
    }

    return text;
  }
}
