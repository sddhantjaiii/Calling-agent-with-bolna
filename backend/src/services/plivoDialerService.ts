import * as plivo from 'plivo';

type PlivoDialerConfig = {
  authId: string;
  authToken: string;
  appId: string;
  plivoNumber: string;
  endpointUsername: string;
  tokenTtlSeconds: number;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizePlivoSub(value: string): string {
  // Plivo token API restriction: Allowed characters: Letters, Numbers, - , _
  // See error: "Invalid sub name. Allowed characters: Letters, Numbers, - , _"
  return value.replace(/[^A-Za-z0-9_-]/g, '_');
}

function makePlivoSub(endpointUsername: string, userId: string): string {
  // Plivo token API restriction: `sub` must be <= 50 characters.
  // We keep it stable per user to reduce collisions, but short.
  const endpoint = sanitizePlivoSub(String(endpointUsername || ''));
  const compactUser = sanitizePlivoSub(String(userId || '').replace(/-/g, ''));
  const suffix = compactUser.slice(0, 8) || 'user';

  // Prefer endpoint username + short suffix.
  // Reserve 1 char for '_' plus 8 for suffix => 9 chars.
  const baseMax = 50 - 1 - suffix.length;
  const base = (endpoint || 'agent').slice(0, Math.max(0, baseMax));
  const combined = `${base}_${suffix}`;
  return combined.slice(0, 50);
}

export class PlivoDialerService {
  static getConfig(): PlivoDialerConfig {
    const tokenTtlSecondsRaw = process.env.PLIVO_TOKEN_TTL_SECONDS || '900';
    const tokenTtlSeconds = Number(tokenTtlSecondsRaw);

    return {
      authId: requireEnv('PLIVO_AUTH_ID'),
      authToken: requireEnv('PLIVO_AUTH_TOKEN'),
      appId: requireEnv('PLIVO_APP_ID'),
      plivoNumber: requireEnv('PLIVO_NUMBER'),
      endpointUsername: requireEnv('PLIVO_ENDPOINT_USERNAME'),
      tokenTtlSeconds: Number.isFinite(tokenTtlSeconds) ? tokenTtlSeconds : 900,
    };
  }

  /**
   * Create a Browser SDK v2 access token (server-side).
   * We intentionally create a distinct `sub` per logged-in user while keeping the base endpoint username.
   */
  static async mintAccessToken(userId: string): Promise<{ token: string; sub: string; plivoNumber: string; exp: number }> {
    const cfg = this.getConfig();

    const nowSeconds = Math.floor(Date.now() / 1000);
    const nbf = nowSeconds;
    const exp = nowSeconds + cfg.tokenTtlSeconds;

    // Distinct subject per user to avoid collisions across tenants/users.
    // IMPORTANT: Plivo `sub` must be <= 50 chars and only letters/numbers/-/_.
    const sub = makePlivoSub(cfg.endpointUsername, userId);

    const client = new (plivo as any).Client(cfg.authId, cfg.authToken);

    // Plivo Token API wrapper used by the Browser SDK v2.
    const tokenResponse = await client.token.create(cfg.authId, {
      sub,
      app: cfg.appId,
      nbf,
      exp,
      incoming_allow: false,
      outgoing_allow: true,
    });

    const token = tokenResponse?.token || tokenResponse?.jwt || tokenResponse;
    if (!token || typeof token !== 'string') {
      throw new Error('Failed to mint Plivo access token (unexpected response)');
    }

    return { token, sub, plivoNumber: cfg.plivoNumber, exp };
  }

  static buildAnswerXml(
    toPhoneNumber: string,
    callerId: string,
    options?: {
      recordActionUrl?: string;
      recordFileFormat?: 'wav' | 'mp3';
      maxLengthSeconds?: number;
    }
  ): string {
    const to = xmlEscape(toPhoneNumber);
    const from = xmlEscape(callerId);

    const recordActionUrl = options?.recordActionUrl ? xmlEscape(options.recordActionUrl) : null;
    const recordFileFormat = options?.recordFileFormat ? xmlEscape(options.recordFileFormat) : null;
    const maxLengthSeconds = options?.maxLengthSeconds && Number.isFinite(options.maxLengthSeconds)
      ? Math.max(1, Math.floor(options.maxLengthSeconds))
      : null;

    const recordXml = recordActionUrl
      ? `  <Record action="${recordActionUrl}" startOnDialAnswer="true" redirect="false"${recordFileFormat ? ` fileFormat="${recordFileFormat}"` : ''}${maxLengthSeconds ? ` maxLength="${maxLengthSeconds}"` : ''} />\n`
      : '';

    return `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n${recordXml}  <Dial callerId="${from}">\n    <Number>${to}</Number>\n  </Dial>\n</Response>`;
  }
}
