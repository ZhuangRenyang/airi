/**
 * Microsoft Edge read-aloud TTS protocol client.
 *
 * Talks to the same WebSocket endpoint the Edge browser uses for its read-aloud
 * feature. The endpoint is free, unauthenticated, and speaks Chinese voices of
 * the Neural family, but requires a `Sec-MS-GEC` DRM token: a SHA-256 digest of
 * the current Windows FILETIME (aligned to a five minute boundary) concatenated
 * with the public trusted client token.
 *
 * NOTICE: this is a reverse-engineered protocol owned by Microsoft. It may
 * break when Microsoft rotates the token scheme. Source: the community
 * `edge-tts` Python package documents the same handshake.
 * Removal condition: when the endpoint stops accepting the token scheme.
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const WSS_BASE_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const CHROMIUM_FULL_VERSION = '130.0.2849.68'
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`
/** Seconds between the Windows epoch (1601-01-01) and the Unix epoch (1970-01-01). */
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600
/** One 5 minute boundary expressed in 100 nanosecond FILETIME ticks. */
const TICK_ALIGNMENT = 3_000_000_000

export interface EdgeTtsProsody {
  /** Spoken rate, for example `+0%` or `-20%`. */
  rate?: string
  /** Baseline pitch, for example `+0Hz`. */
  pitch?: string
  /** Volume, for example `+0%`. */
  volume?: string
}

export interface EdgeTtsSynthesisOptions {
  prosody?: EdgeTtsProsody
  signal?: AbortSignal
}

function ticksToSecMsGec(ticks: number, token: string) {
  return `${ticks}${token}`
}

/** Derives the `Sec-MS-GEC` DRM token the endpoint validates against. */
export async function generateSecMsGec(nowMs = Date.now()): Promise<string> {
  const windowsEpochSeconds = Math.floor(nowMs / 1000) + WINDOWS_EPOCH_OFFSET_SECONDS
  let ticks = windowsEpochSeconds * 10_000_000
  ticks -= ticks % TICK_ALIGNMENT

  const payload = ticksToSecMsGec(ticks, TRUSTED_CLIENT_TOKEN)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function escapeXml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

function buildSsml(text: string, voice: string, prosody?: EdgeTtsProsody) {
  const rate = prosody?.rate || '+0%'
  const pitch = prosody?.pitch || '+0Hz'
  const volume = prosody?.volume || '+0%'
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>${escapeXml(text)}</prosody></voice></speak>`
}

function parseAudioFrame(data: ArrayBuffer): Uint8Array | undefined {
  const view = new DataView(data)
  const headerLength = view.getUint16(0)
  const header = new TextDecoder().decode(new Uint8Array(data, 2, headerLength))
  if (!header.includes('Path:audio'))
    return undefined
  return new Uint8Array(data.slice(2 + headerLength))
}

/**
 * Synthesizes `text` with the given Neural voice and resolves the raw MP3
 * bytes. Opens one WebSocket per call; the endpoint closes it after
 * `Path:turn.end`.
 */
export async function synthesizeEdgeSpeech(
  text: string,
  voice: string,
  options?: EdgeTtsSynthesisOptions,
): Promise<ArrayBuffer> {
  const secMsGec = await generateSecMsGec()
  const connectionId = crypto.randomUUID().replaceAll('-', '')
  const url = `${WSS_BASE_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connectionId}`

  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  const audioChunks: Uint8Array[] = []

  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('Edge TTS WebSocket failed to connect'))
  })

  const finished = new Promise<void>((resolve, reject) => {
    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          resolve()
        }
        return
      }

      const audio = parseAudioFrame(event.data as ArrayBuffer)
      if (audio && audio.byteLength > 0)
        audioChunks.push(audio)
    }
    ws.onclose = () => reject(new Error('Edge TTS WebSocket closed before synthesis finished'))
    ws.onerror = () => reject(new Error('Edge TTS WebSocket error during synthesis'))
  })

  const abortHandler = () => {
    try {
      ws.close()
    }
    catch {}
    audioChunks.length = 0
  }
  options?.signal?.addEventListener('abort', abortHandler, { once: true })

  try {
    await opened

    const timestamp = new Date().toString()
    const speechConfigMessage
      = `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'false',
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        })}`
    ws.send(speechConfigMessage)

    const ssmlMessage
      = `X-RequestId:${connectionId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp}\r\nPath:ssml\r\n\r\n${
        buildSsml(text, voice, options?.prosody)}`
    ws.send(ssmlMessage)

    await finished
  }
  finally {
    options?.signal?.removeEventListener('abort', abortHandler)
    try {
      ws.close()
    }
    catch {}
  }

  const total = audioChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const audio = new Uint8Array(total)
  let offset = 0
  for (const chunk of audioChunks) {
    audio.set(chunk, offset)
    offset += chunk.byteLength
  }
  return audio.buffer
}
