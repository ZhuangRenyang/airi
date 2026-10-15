import type { ProviderDefinition, VoiceInfo } from '../../../types'
import type { EdgeTtsProsody } from './engine'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../../registry'
import { synthesizeEdgeSpeech } from './engine'

/**
 * How long the reachability probe waits before the endpoint counts as
 * unreachable. A full short synthesis ("你好") usually completes in about a
 * second; the timeout only guards against Microsoft throttling.
 */
const REACHABILITY_TIMEOUT_MS = 8_000

/**
 * The voice catalog is static: the endpoint takes no per-deployment
 * configuration, and the free voice roster is stable. The speech module treats
 * an empty model selection as unconfigured, so the catalogue publishes one
 * entry with a stable id, mirroring the VOICEVOX family.
 */
const SYNTHETIC_MODEL_ID = 'default'

/**
 * `generateSpeech` builds a URL from this before it calls the injected `fetch`.
 * The adapter ignores the URL and speaks WebSocket directly, so the value only
 * has to parse.
 */
const SENTINEL_BASE_URL = 'https://speech.platform.bing.com/'

const edgeTtsProsodySchema = z.object({
  pitch: z.string().default('+0Hz'),
  rate: z.string().default('+0%'),
  volume: z.string().default('+0%'),
})

export type EdgeTtsConfig = z.input<ReturnType<typeof createEdgeTtsConfigSchema>>

/** The Neural voices that matter for this fork, Chinese first. */
const STATIC_VOICES: Array<{ description: string, name: string, voice: string }> = [
  { description: 'Young female, warm and lively', name: '晓晓 / Xiaoxiao (zh-CN)', voice: 'zh-CN-XiaoxiaoNeural' },
  { description: 'Young female, bright', name: '晓伊 / Xiaoyi (zh-CN)', voice: 'zh-CN-XiaoyiNeural' },
  { description: 'Young male, Passion style available', name: '云希 / Yunxi (zh-CN)', voice: 'zh-CN-YunxiNeural' },
  { description: 'Male for narration and sports', name: '云健 / Yunjian (zh-CN)', voice: 'zh-CN-YunjianNeural' },
  { description: 'Young female, Dongbei accent', name: '晓北 / Xiaobei (zh-CN-liaoning)', voice: 'zh-CN-liaoning-XiaobeiNeural' },
  { description: 'Female, Shaanxi accent', name: '晓妮 / Xiaoni (zh-CN-shaanxi)', voice: 'zh-CN-shaanxi-XiaoniNeural' },
  { description: 'Female, warm', name: 'Aria (en-US)', voice: 'en-US-AriaNeural' },
  { description: 'Male, news', name: 'Guy (en-US)', voice: 'en-US-GuyNeural' },
  { description: 'Female, friendly', name: '七海 / Nanami (ja-JP)', voice: 'ja-JP-NanamiNeural' },
]

function toVoiceInfo(providerId: string, entry: { description: string, name: string, voice: string }): VoiceInfo {
  const languageCode = entry.voice.split('-').slice(0, 2).join('-')
  const languageTitles: Record<string, string> = {
    'en-US': 'English (US)',
    'ja-JP': 'Japanese',
    'zh-CN': 'Chinese (Simplified)',
    'zh-CN-liaoning': 'Chinese (Liaoning)',
    'zh-CN-shaanxi': 'Chinese (Shaanxi)',
  }
  return {
    id: entry.voice,
    languages: [{ code: languageCode, title: languageTitles[languageCode] ?? languageCode }],
    name: entry.name,
    provider: providerId,
  }
}

export function defineEdgeTtsProvider(): ProviderDefinition<EdgeTtsConfig, 'edge-tts'> {
  const configSchema = createEdgeTtsConfigSchema()

  return defineProvider<EdgeTtsConfig, 'edge-tts'>({
    createProvider(config) {
      return {
        speech: () => ({
          baseURL: SENTINEL_BASE_URL,
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const { input, voice } = readSpeechRequest(init)
            const mp3 = await synthesizeEdgeSpeech(
              input,
              voice,
              {
                prosody: config.voiceSettings as undefined | EdgeTtsProsody,
                signal: init?.signal ?? undefined,
              },
            )

            return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' }, status: 200 })
          },
          model: SYNTHETIC_MODEL_ID,
        }),
      }
    },
    createProviderConfig: () => configSchema,
    description: 'Free Microsoft Edge read-aloud voices, no API key required. Chinese, English and Japanese.',
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'edge-tts'}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: '',
        id: SYNTHETIC_MODEL_ID,
        name: 'Edge TTS',
        provider: 'edge-tts',
      }],

      listVoices: async () => STATIC_VOICES.map(entry => toVoiceInfo('edge-tts', entry)),
    },
    icon: 'i-lobe-icons:microsoft',
    id: 'edge-tts',
    name: 'Edge TTS (Microsoft)',

    // The endpoint is unauthenticated. Declaring this keeps the generic
    // settings UI from demanding an API key and keeps validation clickable
    // with an empty key field.
    requiresCredentials: false,

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'edge-tts'}.title`),

    tasks: ['text-to-speech'],

    validationRequiredWhen: () => true,

    validators: {
      validateConfig: [
        ({ t }) => ({
          id: 'edge-tts:check-config',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
          validator: async () => {
            return { errors: [], reason: '', reasonKey: '', valid: true }
          },
        }),
      ],
      validateProvider: [
        ({ t }) => ({
          id: 'edge-tts:check-reachability',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          validator: async (config) => {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS)
            try {
              await synthesizeEdgeSpeech('你好', 'zh-CN-XiaoxiaoNeural', {
                prosody: config.voiceSettings as undefined | EdgeTtsProsody,
                signal: controller.signal,
              })
              return { errors: [], reason: '', reasonKey: '', valid: true }
            }
            catch (error) {
              const reason = `Cannot reach the Edge TTS endpoint: ${errorMessageFrom(error) ?? 'Unknown error'}\n\nThe endpoint is operated by Microsoft and may be rate limited. Try again in a moment.`
              return { errors: [{ error }], reason, reasonKey: '', valid: false }
            }
            finally {
              clearTimeout(timeout)
            }
          },
        }),
      ],
    },
  })
}

function createEdgeTtsConfigSchema() {
  return z.object({
    voiceSettings: edgeTtsProsodySchema.default({ pitch: '+0Hz', rate: '+0%', volume: '+0%' }),
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
