/**
 * iFlytek super-smart TTS (超拟人语音合成) WebSocket client, browser-native.
 *
 * The endpoint `wss://cbm01.cn-huabei-1.xf-yun.com/v1/private/mcd9m97e6`
 * authenticates with the same HMAC-SHA256 signature over host/date/request-
 * line as the v2 online TTS. WebSockets have no CORS restriction, so the
 * browser can connect directly.
 *
 * Frame protocol differs from the v2 TTS: the request nests parameters under
 * `header / parameter / payload`, and the audio chunks arrive base64-encoded
 * in `payload.audio.audio` (MP3 when `encoding=lame`) until a frame whose
 * `payload.audio.status === 2` ends the turn. Chunks carry a `seq` number and
 * may arrive out of order, so they are re-sorted before concatenation.
 *
 * NOTICE: the trial tier covers a small set of voices (x5_lingxiaoxuan_flow,
 * x4_yuting, ...). Removal condition: when iFlytek ends the trial web tier.
 */

import { arrayBufferToBase64 } from '../base64'

const XFYUN_SUPER_TTS_HOST = 'cbm01.cn-huabei-1.xf-yun.com'
const XFYUN_SUPER_TTS_PATH = '/v1/private/mcd9m97e6'

/** The trial tier throttles connections; a stalled socket must not hang the whole reply. */
const OPEN_TIMEOUT_MS = 10_000
const SYNTHESIS_TIMEOUT_MS = 30_000

/** Races `promise` against a timer that fires with `message` when `ms` elapses first. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (cause) => {
        clearTimeout(timer)
        reject(cause)
      },
    )
  })
}

async function hmacSha256Base64(message: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return arrayBufferToBase64(new Uint8Array(signature))
}

/** Builds the authenticated WebSocket URL for one synthesis turn. */
export async function buildXfyunSuperTtsUrl(apiKey: string, apiSecret: string) {
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${XFYUN_SUPER_TTS_HOST}\ndate: ${date}\nGET ${XFYUN_SUPER_TTS_PATH} HTTP/1.1`
  const signature = await hmacSha256Base64(signatureOrigin, apiSecret)
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = btoa(authorizationOrigin)
  return `wss://${XFYUN_SUPER_TTS_HOST}${XFYUN_SUPER_TTS_PATH}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(XFYUN_SUPER_TTS_HOST)}`
}

export interface XfyunSuperTtsSynthesisOptions {
  appId: string
  /** Voice name, e.g. `x5_lingxiaoxuan_flow`. */
  vcn?: string
  /** Speed 0-100, default 50. */
  speed?: number
  /** Volume 0-100, default 50. */
  volume?: number
  /** Pitch 0-100, default 50. */
  pitch?: number
  signal?: AbortSignal
}

/**
 * Synthesizes `text` over one WebSocket turn and resolves the raw MP3 bytes.
 */
export async function synthesizeXfyunSuperSpeech(
  text: string,
  apiKey: string,
  apiSecret: string,
  options: XfyunSuperTtsSynthesisOptions,
): Promise<ArrayBuffer> {
  const url = await buildXfyunSuperTtsUrl(apiKey, apiSecret)
  const ws = new WebSocket(url)

  const chunks: Array<{ seq: number, bytes: Uint8Array }> = []

  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('讯飞超拟人语音合成 WebSocket 连接失败。请检查 AppID / APIKey / APISecret 是否正确，以及是否已开通超拟人语音合成服务。'))
  })

  const finished = new Promise<void>((resolve, reject) => {
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string')
        return
      try {
        // Unlike the flat v2 TTS frames, this endpoint nests the protocol
        // header: `{ header: { code, message, sid }, payload: { audio } }`.
        const frame = JSON.parse(event.data) as {
          header?: { code?: number, message?: string }
          payload?: { audio?: { audio?: string, seq?: number, status?: number } }
        }
        if (frame.header?.code !== 0) {
          reject(new Error(`讯飞超拟人语音合成失败 (code=${frame.header?.code}): ${frame.header?.message ?? 'unknown'}`))
          return
        }
        const audio = frame.payload?.audio
        if (audio?.audio) {
          const binary = atob(audio.audio)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          chunks.push({ seq: audio.seq ?? chunks.length, bytes })
        }
        if (audio?.status === 2)
          resolve()
      }
      catch (error) {
        reject(error instanceof Error ? error : new Error('讯飞返回了无法解析的帧'))
      }
    }
    ws.onclose = () => reject(new Error('讯飞超拟人语音合成 WebSocket 在合成完成前关闭'))
    ws.onerror = () => reject(new Error('讯飞超拟人语音合成 WebSocket 错误'))
  })

  const abortHandler = () => {
    try {
      ws.close()
    }
    catch {}
    chunks.length = 0
  }
  options.signal?.addEventListener('abort', abortHandler, { once: true })

  // Whichever promise loses its race must not surface an unhandled rejection
  // after the finally closes the socket and the event handlers fire.
  opened.catch(() => {})
  finished.catch(() => {})

  try {
    await withTimeout(opened, OPEN_TIMEOUT_MS, '讯飞超拟人语音合成连接超时：10 秒内未建立 WebSocket 连接，请检查网络后重试。')

    // The request protocol has no `business` layer: parameters nest under
    // `parameter.tts`, and the text payload is base64 (error 10161 otherwise).
    const request = {
      header: { app_id: options.appId, status: 2 },
      parameter: {
        tts: {
          vcn: options.vcn ?? 'x5_lingxiaoxuan_flow',
          speed: options.speed ?? 50,
          volume: options.volume ?? 50,
          pitch: options.pitch ?? 50,
          bgs: 0,
          reg: 0,
          rdn: 0,
          rhy: 0,
          audio: {
            encoding: 'lame',
            sample_rate: 24000,
            channels: 1,
            bit_depth: 16,
            frame_size: 0,
          },
        },
      },
      payload: {
        text: {
          encoding: 'utf8',
          compress: 'raw',
          format: 'plain',
          status: 2,
          seq: 0,
          text: arrayBufferToBase64(new TextEncoder().encode(text)),
        },
      },
    }
    ws.send(JSON.stringify(request))

    await withTimeout(finished, SYNTHESIS_TIMEOUT_MS, '讯飞超拟人语音合成响应超时：30 秒内未收到完整音频，可能是试用额度限流，本句将跳过。')
  }
  finally {
    options.signal?.removeEventListener('abort', abortHandler)
    try {
      ws.close()
    }
    catch {}
  }

  // Chunks may arrive out of order; the protocol documents `seq` reordering.
  chunks.sort((a, b) => a.seq - b.seq)
  const total = chunks.reduce((sum, chunk) => sum + chunk.bytes.length, 0)
  const audio = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    audio.set(chunk.bytes, offset)
    offset += chunk.bytes.length
  }
  return audio.buffer
}
