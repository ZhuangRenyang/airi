import type { ProviderContext } from '../../../types'

import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../../registry'

/**
 * SiliconFlow's text-to-speech endpoint follows the OpenAI create-speech
 * shape (`POST /audio/speech`), so this definition is a specialized
 * `openai-audio-speech` with the SiliconFlow base URL, model roster and
 * CosyVoice2 preset voices prefilled. Registration credits make it the
 * cheapest working Chinese TTS for this fork's audience.
 * Removal condition: when the promotion or the API compatibility ends.
 */

const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1/'

const siliconFlowAudioConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(SILICONFLOW_BASE_URL),
})

type SiliconFlowAudioConfig = z.input<typeof siliconFlowAudioConfigSchema>

function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() || SILICONFLOW_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

function createAudioValidators<TConfig extends SiliconFlowAudioConfig>() {
  return {
    validateConfig: [
      ({ t }: ProviderContext) => ({
        id: 'siliconflow-speech:check-config',
        name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-config.title'),
        validator: async (config: TConfig) => {
          const errors: Array<{ error: unknown }> = []
          const apiKey = config.apiKey?.trim() ?? ''
          const baseUrl = config.baseUrl?.trim() ?? ''

          if (!apiKey)
            errors.push({ error: new Error('API Key is required. Register at cloud.siliconflow.cn for free credits.') })
          if (!baseUrl)
            errors.push({ error: new Error('Base URL is required.') })

          if (baseUrl) {
            try {
              const url = new URL(baseUrl)
              if (!url.host)
                errors.push({ error: new Error('Base URL is not absolute. Try to include a scheme (http:// or https://).') })
            }
            catch {
              errors.push({ error: new Error('Base URL is not absolute. Try to include a scheme (http:// or https://).') })
            }
          }

          return {
            errors,
            reason: errors.map(item => (item.error as Error).message).join(', '),
            reasonKey: '',
            valid: errors.length === 0,
          }
        },
      }),
    ],
  }
}

const siliconFlowSpeechModels = [
  {
    id: 'FunAudioLLM/CosyVoice2-0.5B',
    name: 'CosyVoice2 (0.5B)',
    provider: 'siliconflow-speech',
    description: 'Alibaba open model. Natural Chinese, dialects, and preset voices. Recommended.',
    contextLength: 0,
    deprecated: false,
  },
  // NOTICE: fish-speech-1.5 is deliberately not listed — its preset voices on
  // SiliconFlow differ from the CosyVoice2 set and would leave the voice
  // dropdown empty. Re-add together with a fish-compatible voice roster.
]

// Preset voice ids follow SiliconFlow's `{model}:{name}` convention. Labels
// are user-facing: keep them Chinese, this fork's audience reads Chinese.
const siliconFlowSpeechVoices = [
  { id: 'FunAudioLLM/CosyVoice2-0.5B:anna', label: '安娜（女声）' },
  { id: 'FunAudioLLM/CosyVoice2-0.5B:bella', label: '贝拉（女声·活泼）' },
  { id: 'FunAudioLLM/CosyVoice2-0.5B:claire', label: '克莱尔（女声）' },
  { id: 'FunAudioLLM/CosyVoice2-0.5B:diana', label: '戴安娜（女声）' },
  { id: 'FunAudioLLM/CosyVoice2-0.5B:alex', label: '亚历克斯（男声）' },
  { id: 'FunAudioLLM/CosyVoice2-0.5B:benjamin', label: '本杰明（男声）' },
  { id: 'FunAudioLLM/CosyVoice2-0.5B:charles', label: '查尔斯（男声）' },
  { id: 'FunAudioLLM/CosyVoice2-0.5B:david', label: '大卫（男声）' },
].map(voice => ({
  id: voice.id,
  name: voice.label,
  provider: 'siliconflow-speech',
  languages: [],
  compatibleModels: ['FunAudioLLM/CosyVoice2-0.5B'],
}))

export const providerSiliconFlowSpeech = defineProvider<SiliconFlowAudioConfig, 'siliconflow-speech'>({
  id: 'siliconflow-speech',
  name: 'SiliconFlow',
  nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'siliconflow-speech'}.title`),
  description: 'siliconflow.cn',
  descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'siliconflow-speech'}.description`),
  tasks: ['text-to-speech'],
  icon: 'i-lobe-icons:hibicolor',
  createProviderConfig: ({ t }) => siliconFlowAudioConfigSchema.extend({
    apiKey: siliconFlowAudioConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: siliconFlowAudioConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider: (config: SiliconFlowAudioConfig) => {
    return createOpenAI(config.apiKey.trim(), normalizeBaseUrl(config.baseUrl))
  },
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  validators: createAudioValidators<SiliconFlowAudioConfig>(),
  extraMethods: {
    listModels: async () => siliconFlowSpeechModels,
    voiceCatalogConfig: () => ({}),
    listVoices: async () => siliconFlowSpeechVoices,
  },
})
