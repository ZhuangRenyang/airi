/**
 * Browser-native speech synthesis (Web Speech API) adapter.
 *
 * `speechSynthesis` speaks directly through the device's own TTS voices and
 * never exposes audio buffers, so it cannot feed AIRI's normal playback +
 * lip-sync pipeline. The adapter therefore speaks through the device and
 * resolves a short generated silence placeholder so the surrounding pipeline
 * completes normally — the user hears the device voice, the pipeline plays
 * silence. Lip sync does not work on this path by design.
 *
 * NOTICE: voice quality and language coverage depend entirely on the device
 * (Android: Google TTS, Windows: Huihui/Yaoyao, macOS: Ting-Ting).
 * Removal condition: when a cloud TTS reachable from the deployment region
 * becomes available.
 */

/** Waits until `getVoices()` is populated. Chrome populates it async. */
async function waitForVoices(timeoutMs = 2_000): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window))
    return []

  const first = window.speechSynthesis.getVoices()
  if (first.length > 0)
    return first

  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(window.speechSynthesis.getVoices())
    }, timeoutMs)

    function onChange() {
      clearTimeout(timer)
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
      resolve(window.speechSynthesis.getVoices())
    }

    window.speechSynthesis.addEventListener('voiceschanged', onChange)
  })
}

/**
 * Friendly Chinese names for the well-known system voices. Device-reported
 * names are English even for Chinese voices on Windows ("Microsoft Huihui -
 * Chinese (Simplified)"), and users cannot read them. Unknown voices keep
 * their device name.
 */
const CHINESE_VOICE_DISPLAY_NAMES: Array<[RegExp, string]> = [
  [/huihui/i, '微软慧慧（女声）'],
  [/yaoyao/i, '微软瑶瑶（女声）'],
  [/kangkang/i, '微软康康（男声）'],
  [/yunyang/i, '微软云扬（男声·新闻）'],
  [/xiaoxiao/i, '微软晓晓（女声）'],
  [/yunxi/i, '微软云希（男声）'],
  [/tingting|ting-ting/i, '婷婷（女声）'],
  [/meijia/i, '美佳（女声）'],
  [/sinji/i, '善怡（女声·粤语）'],
  [/sin-ji/i, '善怡（女声·粤语）'],
  [/google.*(普通话|mandarin|chinese)/i, '谷歌普通话（女声）'],
  [/google.*粤|google.*cantonese/i, '谷歌粤语（女声）'],
  [/xiaowan/i, '小婉（女声）'],
  [/xiaochen/i, '小陈（女声）'],
  [/yunhao/i, '云皓（男声）'],
]

/**
 * Lists the device's installed Chinese TTS voices only.
 *
 * NOTICE: non-Chinese device voices are filtered out on purpose — Windows
 * voices like Microsoft David cannot read Chinese text and users reported
 * the mixed list as unusable ("English I cannot read"). If the device has
 * no Chinese voice the list comes back empty and the validation probe
 * tells the user to install one.
 * Removal condition: when a language preference control is added.
 */
export async function listSystemVoices(): Promise<Array<{ lang: string, name: string, voiceURI: string }>> {
  const voices = await waitForVoices()
  return voices
    .filter(voice => /^(?:zh|cmn|yue)/i.test(voice.lang))
    .map((voice) => {
      const friendly = CHINESE_VOICE_DISPLAY_NAMES.find(([pattern]) => pattern.test(voice.name))
      return { lang: voice.lang, name: friendly ? friendly[1] : voice.name, voiceURI: voice.voiceURI }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

/** Builds a minimal 16-bit PCM mono WAV of near-silence. */
function generateSilenceWav(durationMs: number, sampleRate = 24_000): ArrayBuffer {
  const samples = Math.max(1, Math.floor(sampleRate * durationMs / 1000))
  const dataSize = samples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)
  // Samples stay zero: near-silence, so pipeline playback is inaudible.

  return buffer
}

function escapeForUtteranceFallback(text: string) {
  return text
}

/**
 * Speaks `text` through the device voice and resolves a silence placeholder
 * after the utterance finishes (or immediately when the signal aborts).
 */
export async function speakWithSystemVoice(
  text: string,
  voiceURI: string,
  options?: { rate?: number, signal?: AbortSignal },
): Promise<ArrayBuffer> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window))
    throw new Error('Speech synthesis is not available in this browser')

  const voices = window.speechSynthesis.getVoices()
  const voice = voices.find(v => v.voiceURI === voiceURI)
    ?? voices.find(v => v.lang.toLowerCase().startsWith('zh'))
    ?? voices[0]

  const utterance = new SpeechSynthesisUtterance(escapeForUtteranceFallback(text))
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  if (options?.rate)
    utterance.rate = Math.min(3, Math.max(0.5, options.rate))

  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const finished = () => {
      cleanup()
      resolve(generateSilenceWav(120))
    }

    const abortHandler = () => {
      window.speechSynthesis.cancel()
      finished()
    }

    const onEnd = () => finished()
    const onError = (event: SpeechSynthesisErrorEvent) => {
      cleanup()
      // An interrupted utterance (cancelled by a newer request) still counts
      // as done: the pipeline only needs the playback to have happened.
      if (event.error === 'interrupted' || event.error === 'canceled')
        resolve(generateSilenceWav(120))
      else
        reject(new Error(`System speech synthesis failed: ${event.error}`))
    }

    function cleanup() {
      utterance.removeEventListener('end', onEnd)
      utterance.removeEventListener('error', onError)
      options?.signal?.removeEventListener('abort', abortHandler)
    }

    utterance.addEventListener('end', onEnd)
    utterance.addEventListener('error', onError as EventListener)
    options?.signal?.addEventListener('abort', abortHandler, { once: true })

    window.speechSynthesis.speak(utterance)
  })
}

/** Cancels every queued utterance. */
export function cancelSystemSpeech() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window)
    window.speechSynthesis.cancel()
}
