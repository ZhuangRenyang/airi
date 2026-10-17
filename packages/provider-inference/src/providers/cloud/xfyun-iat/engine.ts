/**
 * iFlytek online speech dictation, IAT streaming (WebSocket) client,
 * browser-native.
 *
 * The endpoint `wss://iat-api.xfyun.cn/v2/iat` authenticates with the same
 * HMAC-SHA256 host/date/request-line scheme as the TTS engine, with the host
 * and path swapped. WebSockets have no CORS restriction, so the browser can
 * connect directly.
 *
 * Frame protocol: the first frame carries `common.app_id` plus the
 * `business` options and the first audio chunk (`data.status = 0`); middle
 * frames stream base64 PCM (`status = 1`); a final frame with
 * `data.status = 2` ends the turn. Result frames arrive as text JSON whose
 * `data.result.ws[].cw[].w` fields hold the recognized characters until
 * `data.status === 2`.
 *
 * Audio must be 16 kHz mono 16-bit PCM (`audio/L16;rate=16000`), sent in
 * frames of at most 1280 bytes with ~40 ms spacing.
 *
 * NOTICE: the free personal tier grants a daily call allowance (500/day at
 * the time of writing) and shares the TTS application's AppID/APIKey/
 * APISecret with the 语音听写 service enabled in console.xfyun.cn.
 * Removal condition: when iFlytek ends the free web tier.
 */

import { arrayBufferToBase64 } from '../base64'

const XFYUN_IAT_HOST = 'iat-api.xfyun.cn'
const XFYUN_IAT_PATH = '/v2/iat'
/** iFlytek recommends ≤1280 byte audio frames spaced ~40 ms apart. */
const FRAME_BYTES = 1280
const FRAME_INTERVAL_MS = 40

async function hmacSha256Base64(message: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return arrayBufferToBase64(new Uint8Array(signature))
}

/** Builds the authenticated WebSocket URL for one dictation turn. */
export async function buildXfyunIatUrl(apiKey: string, apiSecret: string) {
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${XFYUN_IAT_HOST}\ndate: ${date}\nGET ${XFYUN_IAT_PATH} HTTP/1.1`
  const signature = await hmacSha256Base64(signatureOrigin, apiSecret)
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = btoa(authorizationOrigin)
  return `wss://${XFYUN_IAT_HOST}${XFYUN_IAT_PATH}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(XFYUN_IAT_HOST)}`
}

export interface XfyunIatTranscribeOptions {
  appId: string
  apiKey: string
  apiSecret: string
  /** 16 kHz mono 16-bit PCM bytes, as produced by `decodeAudioToPcm16kMono`. */
  audio: Uint8Array
  /** `zh_cn` for Chinese, `en_us` for English. */
  language?: 'zh_cn' | 'en_us'
  /** Accent, e.g. `mandarin` for zh_cn. */
  accent?: string
  signal?: AbortSignal
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}

/**
 * Recognizes one audio turn over a single WebSocket connection and resolves
 * the recognized text.
 */
export async function transcribeXfyunIat(options: XfyunIatTranscribeOptions): Promise<string> {
  const url = await buildXfyunIatUrl(options.apiKey, options.apiSecret)
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('讯飞语音听写 WebSocket 连接失败。请检查 AppID / APIKey / APISecret 是否正确，以及是否已开通「语音听写」服务。'))
  })

  let transcript = ''
  const finished = new Promise<string>((resolve, reject) => {
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string')
        return
      try {
        const frame = JSON.parse(event.data) as {
          code?: number
          message?: string
          data?: { status?: number, result?: { ws?: Array<{ cw?: Array<{ w?: string }> }> } }
        }
        if (frame.code !== 0) {
          reject(new Error(`讯飞语音听写失败 (code=${frame.code}): ${frame.message ?? 'unknown'}`))
          return
        }

        const words = frame.data?.result?.ws?.flatMap(segment => segment.cw?.map(char => char.w ?? '') ?? []) ?? []
        transcript += words.join('')

        if (frame.data?.status === 2)
          resolve(transcript)
      }
      catch (error) {
        reject(error instanceof Error ? error : new Error('讯飞返回了无法解析的帧'))
      }
    }
    ws.onclose = () => reject(new Error('讯飞语音听写 WebSocket 在识别完成前关闭'))
  })

  const abortHandler = () => {
    try {
      ws.close()
    }
    catch {}
  }
  options.signal?.addEventListener('abort', abortHandler, { once: true })

  try {
    await opened

    // The first frame carries the session parameters; status 2 marks the end.
    const frames: Array<{ audio: string, status: 0 | 1 | 2 }> = []
    for (let offset = 0; offset < options.audio.byteLength; offset += FRAME_BYTES)
      frames.push({ audio: arrayBufferToBase64(options.audio.subarray(offset, offset + FRAME_BYTES)), status: 1 })
    frames[0]!.status = 0
    frames.push({ audio: '', status: 2 })

    for (const [index, frame] of frames.entries()) {
      ws.send(JSON.stringify({
        ...index === 0
          ? {
              common: { app_id: options.appId },
              business: {
                language: options.language ?? 'zh_cn',
                domain: 'iat',
                accent: options.accent ?? 'mandarin',
                vad_eos: 10000,
                ptt: 1,
              },
            }
          : {},
        data: {
          status: frame.status,
          format: 'audio/L16;rate=16000',
          encoding: 'raw',
          audio: frame.audio,
        },
      }))
      if (index < frames.length - 1)
        await sleep(FRAME_INTERVAL_MS, options.signal)
    }

    return await finished
  }
  finally {
    options.signal?.removeEventListener('abort', abortHandler)
    try {
      ws.close()
    }
    catch {}
  }
}
