/**
 * Baidu Cloud short-speech recognition (REST) client, browser-native.
 *
 * The direct endpoint `POST https://vop.baidu.com/server_api` sends no CORS
 * headers (probed 2026-10-17: the POST itself succeeds but the response lacks
 * `Access-Control-Allow-Origin`), so the request goes through the same-origin
 * rewrite proxy `/proxy/baidu-asr` (vercel.json / edgeone.json →
 * `vop.baidu.com/server_api`), the same pattern as the TTS token proxy.
 *
 * The access token comes from the same OAuth exchange the TTS engine uses
 * (`/proxy/baidu-token`); it works for recognition once the Baidu application
 * has the 语音识别 service enabled in console.bce.baidu.com.
 *
 * Audio must be 16 kHz mono PCM (`format: 'pcm'`); callers decode uploads
 * with `decodeAudioToPcm16kMono` first. `dev_pid` selects the language model:
 * 1537 普通话（中英）、1737 英语、1637 粤语、1837 四川话.
 *
 * NOTICE: Baidu bills short-speech recognition per call after the personal
 * free allowance. Removal condition: when Baidu retires the REST endpoint.
 */

import { fetchBaiduAccessToken } from '../baidu-tts/engine'
import { arrayBufferToBase64 } from '../base64'

export interface BaiduAsrTranscribeOptions {
  /** 16 kHz mono 16-bit PCM bytes, as produced by `decodeAudioToPcm16kMono`. */
  audio: Uint8Array
  apiKey: string
  secretKey: string
  devPid?: number
  signal?: AbortSignal
}

export async function transcribeBaiduSpeech(options: BaiduAsrTranscribeOptions): Promise<string> {
  const accessToken = await fetchBaiduAccessToken(options.apiKey, options.secretKey, options.signal)
  if (!accessToken)
    throw new Error('Baidu ASR is only available in the browser.')

  const body = {
    format: 'pcm',
    rate: 16000,
    channel: 1,
    cuid: 'airi-web-client',
    token: accessToken,
    dev_pid: options.devPid ?? 1537,
    speech: arrayBufferToBase64(options.audio),
    len: options.audio.byteLength,
  }

  const response = await fetch('/proxy/baidu-asr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options.signal,
  })

  const payload = await response.json() as { err_no?: number, err_msg?: string, result?: string[] }

  if (payload.err_no !== 0)
    throw new Error(`百度语音识别失败 (err_no=${payload.err_no ?? 'unknown'}): ${payload.err_msg ?? 'unknown error'}`)

  return (payload.result ?? []).join('').trim()
}
