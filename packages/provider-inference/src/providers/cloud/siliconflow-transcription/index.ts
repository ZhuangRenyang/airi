import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { defineProvider } from '../../registry'

/**
 * SiliconFlow speech-to-text. `FunAudioLLM/SenseVoiceSmall` is free on
 * SiliconFlow and the transcription endpoint follows the OpenAI
 * `POST /audio/transcriptions` shape, so it pairs with the SiliconFlow TTS
 * card on the same API key. Registering once unlocks both directions of the
 * voice loop.
 * Removal condition: when SiliconFlow ends the free SenseVoice tier.
 */

const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1/'

const siliconFlowTranscriptionConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().default(SILICONFLOW_BASE_URL),
})

export type SiliconFlowTranscriptionConfig = z.input<typeof siliconFlowTranscriptionConfigSchema>

function normalizeBaseUrl(baseUrl: string | undefined) {
  const value = baseUrl?.trim() || SILICONFLOW_BASE_URL
  return value.endsWith('/') ? value : `${value}/`
}

const siliconFlowTranscriptionModels = [
  {
    id: 'FunAudioLLM/SenseVoiceSmall',
    name: 'SenseVoice (Small)',
    provider: 'siliconflow-transcription',
    description: 'Alibaba open model. Free on SiliconFlow. Fast, accurate Chinese and multilingual transcription.',
    contextLength: 0,
    deprecated: false,
  },
]

export const providerSiliconFlowTranscription = defineProvider<SiliconFlowTranscriptionConfig, 'siliconflow-transcription'>({
  id: 'siliconflow-transcription',
  name: 'SiliconFlow',
  nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'siliconflow-transcription'}.title`),
  description: 'siliconflow.cn',
  descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'siliconflow-transcription'}.description`),
  tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],
  icon: 'i-lobe-icons:hibicolor',
  capabilities: {
    transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
  },
  createProviderConfig: ({ t }) => siliconFlowTranscriptionConfigSchema.extend({
    apiKey: siliconFlowTranscriptionConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: siliconFlowTranscriptionConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider: (config: SiliconFlowTranscriptionConfig) => {
    const provider = createOpenAI(config.apiKey.trim(), normalizeBaseUrl(config.baseUrl))
    const transcription = provider.transcription.bind(provider)
    provider.transcription = (model: string, extraOptions?: Record<string, unknown>) => ({
      ...transcription(model),
      ...extraOptions,
    })
    return provider
  },
  validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.baseUrl?.trim()),
  extraMethods: {
    listModels: async () => siliconFlowTranscriptionModels,
  },
})
