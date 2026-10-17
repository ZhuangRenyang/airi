/**
 * iFlytek online TTS (WebSocket) client, browser-native.
 *
 * The endpoint `wss://tts-api.xfyun.cn/v2/tts` authenticates with an HMAC-
 * SHA256 signature over the host/date/request-line, built with the platform's
 * API Key and API Secret. WebSockets have no CORS restriction, so the browser
 * can connect directly.
 *
 * Frame protocol: the client sends one JSON frame carrying the full text
 * (base64 UTF-8); the server streams JSON text frames whose `data.audio`
 * field holds base64 MP3 chunks (when `aue=lame, sfl=1`) until a frame with
 * `data.status === 2` ends the turn.
 *
 * NOTICE: the free tier covers a small set of voices (xiaoyan, aisjiuxu, ...).
 * Removal condition: when iFlytek ends the free web tier.
 */

import { arrayBufferToBase64 } from '../base64'

const XFYUN_TTS_HOST = 'tts-api.xfyun.cn'
const XFYUN_TTS_PATH = '/v2/tts'

async function hmacSha256Base64(message: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return arrayBufferToBase64(new Uint8Array(signature))
}

/** Builds the authenticated WebSocket URL for one synthesis turn. */
export async function buildXfyunTtsUrl(apiKey: string, apiSecret: string) {
  const date = new Date().toUTCString()
  const signatureOrigin = `host: ${XFYUN_TTS_HOST}\ndate: ${date}\nGET ${XFYUN_TTS_PATH} HTTP/1.1`
  const signature = await hmacSha256Base64(signatureOrigin, apiSecret)
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`
  const authorization = btoa(authorizationOrigin)
  return `wss://${XFYUN_TTS_HOST}${XFYUN_TTS_PATH}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(XFYUN_TTS_HOST)}`
}

export interface XfyunTtsSynthesisOptions {
  appId: string
  /** Voice name, e.g. `xiaoyan`. */
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
export async function synthesizeXfyunSpeech(
  text: string,
  apiKey: string,
  apiSecret: string,
  options: XfyunTtsSynthesisOptions,
): Promise<ArrayBuffer> {
  const url = await buildXfyunTtsUrl(apiKey, apiSecret)
  const ws = new WebSocket(url)

  const chunks: Uint8Array[] = []

  const opened = new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error('讯飞语音合成 WebSocket 连接失败。请检查 AppID / APIKey / APISecret 是否正确，以及免费额度是否仍然有效。'))
  })

  const finished = new Promise<void>((resolve, reject) => {
    ws.onmessage = (event) => {
      if (typeof event.data !== 'string')
        return
      try {
        const frame = JSON.parse(event.data) as { code?: number, message?: string, data?: { audio?: string, status?: number } }
        if (frame.code !== 0) {
          reject(new Error(`讯飞语音合成失败 (code=${frame.code}): ${frame.message ?? 'unknown'}`))
          return
        }
        const audio = frame.data?.audio
        if (audio) {
          const binary = atob(audio)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          chunks.push(bytes)
        }
        if (frame.data?.status === 2)
          resolve()
      }
      catch (error) {
        reject(error instanceof Error ? error : new Error('讯飞返回了无法解析的帧'))
      }
    }
    ws.onclose = () => reject(new Error('讯飞语音合成 WebSocket 在合成完成前关闭'))
    ws.onerror = () => reject(new Error('讯飞语音合成 WebSocket 错误'))
  })

  const abortHandler = () => {
    try {
      ws.close()
    }
    catch {}
    chunks.length = 0
  }
  options.signal?.addEventListener('abort', abortHandler, { once: true })

  try {
    await opened

    const request = {
      common: { app_id: options.appId },
      business: {
        aue: 'lame',
        sfl: 1,
        vcn: options.vcn ?? 'xiaoyan',
        tte: 'UTF-8',
        speed: options.speed ?? 50,
        volume: options.volume ?? 50,
        pitch: options.pitch ?? 50,
      },
      data: {
        status: 2,
        text: arrayBufferToBase64(new TextEncoder().encode(text)),
      },
    }
    ws.send(JSON.stringify(request))

    await finished
  }
  finally {
    options.signal?.removeEventListener('abort', abortHandler)
    try {
      ws.close()
    }
    catch {}
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const audio = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    audio.set(chunk, offset)
    offset += chunk.length
  }
  return audio.buffer
}
