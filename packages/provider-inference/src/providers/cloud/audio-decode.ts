/**
 * Decodes any browser-supported audio blob (wav, mp3, webm, m4a, ...) into
 * 16 kHz mono 16-bit little-endian PCM bytes.
 *
 * Both the Baidu short-speech REST endpoint and the iFlytek IAT WebSocket
 * accept raw 16k mono PCM only, while recordings and uploads arrive in
 * whatever format the browser produced. `OfflineAudioContext` renders the
 * decoded buffer at the target rate in one pass.
 */

export async function decodeAudioToPcm16kMono(audio: Blob, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const bytes = await audio.arrayBuffer()
  const scope = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }
  const AudioContextCtor = scope.AudioContext ?? scope.webkitAudioContext
  if (!AudioContextCtor)
    throw new Error('Web Audio API is unavailable. Speech recognition needs a browser environment.')

  const decodeContext = new AudioContextCtor()
  let decoded: AudioBuffer
  try {
    decoded = await decodeContext.decodeAudioData(bytes)
  }
  finally {
    void decodeContext.close()
  }

  const targetSampleRate = 16000
  const frameCount = Math.max(1, Math.ceil(decoded.duration * targetSampleRate))
  const offline = new OfflineAudioContext(1, frameCount, targetSampleRate)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()

  const rendered = await offline.startRendering()
  const samples = rendered.getChannelData(0)

  const pcm = new Uint8Array(new ArrayBuffer(samples.length * 2))
  const view = new DataView(pcm.buffer)
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF, true)
  }

  signal?.throwIfAborted()
  return pcm
}
