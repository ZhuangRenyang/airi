import type { ProviderDefinition } from '../../../types'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../../registry'
import { decodeAudioToPcm16kMono } from '../audio-decode'
import { fetchBaiduAccessToken } from '../baidu-tts/engine'
import { transcribeBaiduSpeech } from './engine'

/**
 * Baidu Cloud short-speech recognition. Credentials come from the Baidu AI
 * open platform (console.bce.baidu.com): enable 语音识别 on the same Speech
 * Technology application used for TTS and reuse its API Key + Secret Key.
 */

const baiduAsrConfigSchema = z.object({
  apiKey: z.string(),
  secretKey: z.string(),
  devPid: z.number().default(1537),
})

export type BaiduAsrConfig = z.input<typeof baiduAsrConfigSchema>

export function defineBaiduAsrProvider(): ProviderDefinition<BaiduAsrConfig, 'baidu-asr'> {
  return defineProvider<BaiduAsrConfig, 'baidu-asr'>({
    createProvider(config) {
      return {
        transcription: () => ({
          baseURL: '/proxy/baidu-asr',
          model: 'baidu-asr-standard',
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body instanceof FormData ? init.body : undefined
            const file = body?.get('file')
            if (!(file instanceof Blob))
              throw new Error('No audio file provided for transcription.')

            const pcm = await decodeAudioToPcm16kMono(file, init?.signal ?? undefined)
            const text = await transcribeBaiduSpeech({
              audio: pcm,
              apiKey: config.apiKey.trim(),
              secretKey: config.secretKey.trim(),
              devPid: config.devPid ?? 1537,
              signal: init?.signal ?? undefined,
            })

            return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
          },
        }),
      }
    },
    createProviderConfig: ({ t }) => baiduAsrConfigSchema.extend({
      apiKey: baiduAsrConfigSchema.shape.apiKey.meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
        descriptionLocalized: t('settings.pages.providers.provider.baidu-asr.fields.apiKey.description'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
        type: 'password',
      }),
      secretKey: baiduAsrConfigSchema.shape.secretKey.meta({
        labelLocalized: t('settings.pages.providers.provider.baidu-asr.fields.secretKey.label'),
        descriptionLocalized: t('settings.pages.providers.provider.baidu-asr.fields.secretKey.description'),
        placeholderLocalized: t('settings.pages.providers.provider.baidu-asr.fields.secretKey.placeholder'),
        type: 'password',
      }),
    }),
    description: 'bce.baidu.com',
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'baidu-asr'}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: 'Baidu short-speech recognition (standard Mandarin model)',
        id: 'baidu-asr-standard',
        name: '百度短语音识别（标准版）',
        provider: 'baidu-asr',
      }],
    },
    icon: 'i-lobe-icons:baidu',
    id: 'baidu-asr',
    name: '百度智能云（语音识别）',

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'baidu-asr'}.title`),

    tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],

    capabilities: {
      transcription: { protocol: 'http', generateOutput: true, streamOutput: false, streamInput: false },
    },

    validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.secretKey?.trim()),

    validators: {
      validateProvider: [
        ({ t }) => ({
          id: 'baidu-asr:check-credentials',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          validator: async (config) => {
            if (!config.apiKey?.trim() || !config.secretKey?.trim()) {
              const reason = 'API Key 和 Secret Key 不能为空。'
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }

            try {
              const token = await fetchBaiduAccessToken(config.apiKey.trim(), config.secretKey.trim())
              if (!token) {
                const reason = 'Baidu ASR is only available in the browser.'
                return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
              }
              return { errors: [], reason: '', reasonKey: '', valid: true }
            }
            catch (error) {
              const reason = `百度凭证校验失败：${errorMessageFrom(error) ?? 'unknown error'}`
              return { errors: [{ error }], reason, reasonKey: '', valid: false }
            }
          },
        }),
      ],
    },
  })
}
