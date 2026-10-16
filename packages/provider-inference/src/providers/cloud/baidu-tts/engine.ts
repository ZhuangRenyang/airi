/**
 * Baidu Cloud short-text TTS (REST) client.
 *
 * Two endpoints are involved:
 * - `POST /proxy/baidu-token` (same-origin, rewritten by vercel.json to
 *   `aip.baidubce.com/oauth/2.0/token`): exchanges API Key + Secret Key for
 *   an `access_token`. The direct cross-origin call lacks CORS headers, so
 *   the token goes through the deployment's own rewrite proxy. Tokens live
 *   for 30 days and are cached in localStorage until shortly before expiry.
 * - `POST https://tsn.baidu.com/text2audio`: synthesizes and responds with
 *   raw MP3 bytes. This endpoint sends `Access-Control-Allow-Origin: *`, so
 *   the browser can call it directly.
 *
 * NOTICE: Baidu's free tier covers the standard voice library (per=0/1/3/4)
 * with a large monthly character allowance for personal accounts. Premium
 * voices (per=5xxx) need a separate purchase and are not listed.
 * Removal condition: when Baidu ends the personal free tier.
 */

const TOKEN_CACHE_KEY = 'baidu-tts-access-token'
const TOKEN_CACHE_EXPIRY_KEY = 'baidu-tts-access-token-expiry'
/** Refresh the token five minutes before its recorded expiry. */
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000
/** Baidu rejects text over 2048 bytes (GBK). The pipeline segments well below. */
const MAX_TEXT_BYTES = 1000

export interface BaiduTtsVoiceSettings {
  /** Speech speed, 0-9, default 5. */
  spd?: number
  /** Pitch, 0-9, default 5. */
  pit?: number
  /** Volume, 0-15, default 5. */
  vol?: number
}

function utf8ByteLength(text: string) {
  return new TextEncoder().encode(text).length
}

/**
 * Fetches a cached or fresh access token through the same-origin proxy.
 * Returns `undefined` when the browser environment is unavailable.
 */
export async function fetchBaiduAccessToken(apiKey: string, secretKey: string, signal?: AbortSignal): Promise<string | undefined> {
  if (typeof window === 'undefined')
    return undefined

  try {
    const cached = window.localStorage.getItem(TOKEN_CACHE_KEY)
    const expiry = Number(window.localStorage.getItem(TOKEN_CACHE_EXPIRY_KEY) ?? '0')
    if (cached && Number.isFinite(expiry) && Date.now() < expiry - TOKEN_EXPIRY_MARGIN_MS)
      return cached
  }
  catch {}

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: apiKey,
    client_secret: secretKey,
  })
  const response = await fetch(`/proxy/baidu-token?${params.toString()}`, { method: 'POST', signal })
  const payload = await response.json() as { access_token?: string, expires_in?: number, error?: string, error_description?: string }

  if (!payload.access_token) {
    const detail = payload.error_description ?? payload.error ?? 'unknown error'
    throw new Error(`Baidu token request failed: ${detail}. Check the API Key and Secret Key.`)
  }

  const expiresInMs = (payload.expires_in ?? 2_592_000) * 1000
  try {
    window.localStorage.setItem(TOKEN_CACHE_KEY, payload.access_token)
    window.localStorage.setItem(TOKEN_CACHE_EXPIRY_KEY, String(Date.now() + expiresInMs))
  }
  catch {}

  return payload.access_token
}

/**
 * Synthesizes `text` and resolves the raw MP3 bytes. Throws a readable error
 * when Baidu answers with its JSON error envelope instead of audio.
 */
export async function synthesizeBaiduSpeech(
  text: string,
  options: {
    accessToken: string
    voice?: number
    settings?: BaiduTtsVoiceSettings
    signal?: AbortSignal
  },
): Promise<ArrayBuffer> {
  if (utf8ByteLength(text) > MAX_TEXT_BYTES)
    throw new Error(`Baidu TTS segment too long (${utf8ByteLength(text)} bytes, max ${MAX_TEXT_BYTES}). The pipeline should split shorter segments.`)

  const body = new URLSearchParams({
    tex: text,
    tok: options.accessToken,
    cuid: 'airi-web-client',
    ctp: '1',
    lan: 'zh',
    spd: String(options.settings?.spd ?? 5),
    pit: String(options.settings?.pit ?? 5),
    vol: String(options.settings?.vol ?? 5),
    per: String(options.voice ?? 0),
    aue: '3',
  })

  const response = await fetch('https://tsn.baidu.com/text2audio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: options.signal,
  })

  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    const payload = await response.json() as { err_no?: number, err_msg?: string }
    throw new Error(`Baidu TTS failed: ${payload.err_msg ?? 'unknown error'} (err_no=${payload.err_no ?? 'unknown'})`)
  }

  if (!response.ok)
    throw new Error(`Baidu TTS HTTP ${response.status}`)

  return response.arrayBuffer()
}
