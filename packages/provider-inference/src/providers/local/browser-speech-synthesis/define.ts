import type { ProviderDefinition, VoiceInfo } from '../../../types'

import { z } from 'zod'

import { defineProvider } from '../../registry'
import { listSystemVoices, speakWithSystemVoice } from './engine'

/**
 * The voice catalog mirrors the device's installed TTS voices and is device
 * dependent, so the speech module keeps the single synthetic model id pattern
 * from the VOICEVOX family: the model is fixed, the voices carry the choice.
 */
const SYNTHETIC_MODEL_ID = 'default'

/**
 * `generateSpeech` builds a URL from this before it calls the injected `fetch`.
 * The adapter ignores the URL, so the value only has to parse.
 */
const SENTINEL_BASE_URL = 'https://browser-speech-synthesis.invalid/v1/'

function toVoiceInfo(providerId: string, voice: { lang: string, name: string, voiceURI: string }): VoiceInfo {
  const languageCode = voice.lang.split('-')[0]
  const languageTitles: Record<string, string> = {
    cmn: 'Chinese (Mandarin)',
    de: 'German',
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    ja: 'Japanese',
    ko: 'Korean',
    yue: 'Chinese (Cantonese)',
    zh: 'Chinese',
  }
  return {
    id: voice.voiceURI,
    languages: [{ code: languageCode, title: languageTitles[languageCode] ?? languageCode }],
    name: voice.name,
    provider: providerId,
  }
}

export type BrowserSpeechSynthesisConfig = z.input<ReturnType<typeof createBrowserSpeechSynthesisConfigSchema>>

export function defineBrowserSpeechSynthesisProvider(): ProviderDefinition<BrowserSpeechSynthesisConfig, 'browser-speech-synthesis'> {
  const configSchema = createBrowserSpeechSynthesisConfigSchema()

  return defineProvider<BrowserSpeechSynthesisConfig, 'browser-speech-synthesis'>({
    createProvider(config) {
      return {
        speech: () => ({
          baseURL: SENTINEL_BASE_URL,
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const { input, voice } = readSpeechRequest(init)
            const wav = await speakWithSystemVoice(
              input,
              voice,
              {
                rate: config.speechSettings?.rate,
                signal: init?.signal ?? undefined,
              },
            )

            return new Response(wav, { headers: { 'Content-Type': 'audio/wav' }, status: 200 })
          },
          model: SYNTHETIC_MODEL_ID,
        }),
      }
    },
    createProviderConfig: () => configSchema,
    description: 'Speaks with the voices installed on your device. Free, offline, no API key.',
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'browser-speech-synthesis'}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: '',
        id: SYNTHETIC_MODEL_ID,
        name: 'System voices',
        provider: 'browser-speech-synthesis',
      }],

      listVoices: async () => {
        const voices = await listSystemVoices()
        return voices.map(voice => toVoiceInfo('browser-speech-synthesis', voice))
      },
    },
    icon: 'i-solar:soundwave-bold-duotone',
    id: 'browser-speech-synthesis',
    isAvailableBy: () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    name: 'System Voice (Browser)',

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'browser-speech-synthesis'}.title`),

    // NOTICE: speechSynthesis exists only on the main thread of a real
    // browser. Declaring this keeps the settings UI free of an API key field
    // and keeps validation clickable without any credentials.
    requiresCredentials: false,

    tasks: ['text-to-speech'],

    validationRequiredWhen: () => true,

    validators: {
      validateConfig: [
        ({ t }) => ({
          id: 'browser-speech-synthesis:check-config',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
          validator: async () => {
            return { errors: [], reason: '', reasonKey: '', valid: true }
          },
        }),
      ],
      validateProvider: [
        ({ t }) => ({
          id: 'browser-speech-synthesis:check-availability',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          validator: async () => {
            const voices = await listSystemVoices()
            if (voices.length === 0) {
              const reason = 'No system TTS voices found on this device.\n\nWindows: Settings > Time & Language > Speech > Add voices > Chinese (Simplified, China).\nAndroid: install a TTS engine (e.g. Google Speech Services or iFlytek) and set it as the default.'
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }

            const zhCount = voices.filter(voice => /^(?:zh|cmn|yue)/i.test(voice.lang)).length
            if (zhCount === 0) {
              const reason = `Found ${voices.length} voices but none speaks Chinese.\n\nWindows: Settings > Time & Language > Speech > Add voices > Chinese (Simplified, China), then re-validate. Non-Chinese voices cannot read Chinese text properly.`
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }

            return {
              errors: [],
              reason: '',
              reasonKey: '',
              valid: true,
            }
          },
        }),
      ],
    },
  })
}

function createBrowserSpeechSynthesisConfigSchema() {
  return z.object({
    speechSettings: z.object({
      rate: z.number().min(0.5).max(3).default(1),
    }).default({ rate: 1 }),
  })
}

/**
 * Reads the segment text and the voice id out of the OpenAI-shaped body that
 * `generateSpeech` builds. `requestBody` in `@xsai/shared` passes that object
 * through `objCamelToSnake`; `input` and `voice` are single-word keys and
 * survive unchanged.
 */
function readSpeechRequest(init: RequestInit | undefined): { input: string, voice: string } {
  if (!init?.body || typeof init.body !== 'string')
    throw new Error('Invalid speech request body')

  const body = JSON.parse(init.body) as { input?: string, voice?: string }
  if (!body.voice)
    throw new Error('No voice selected. Pick a character in the speech settings.')

  return { input: body.input ?? '', voice: body.voice }
}
