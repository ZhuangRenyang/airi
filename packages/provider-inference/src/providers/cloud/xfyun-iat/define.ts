import type { ProviderDefinition } from '../../../types'

import { z } from 'zod'

import { defineProvider } from '../../registry'
import { decodeAudioToPcm16kMono } from '../audio-decode'
import { transcribeXfyunIat } from './engine'

/**
 * iFlytek online speech dictation. Credentials come from xfyun.cn (console):
 * enable the 语音听写 service on the same application used for TTS and reuse
 * its AppID, APIKey and APISecret. The free personal tier grants a daily call
 * allowance.
 */

const xfyunIatConfigSchema = z.object({
  appId: z.string(),
  apiKey: z.string(),
  apiSecret: z.string(),
  language: z.enum(['zh_cn', 'en_us']).default('zh_cn'),
})

export type XfyunIatConfig = z.input<typeof xfyunIatConfigSchema>

export function defineXfyunIatProvider(): ProviderDefinition<XfyunIatConfig, 'xfyun-iat'> {
  return defineProvider<XfyunIatConfig, 'xfyun-iat'>({
    createProvider(config) {
      return {
        transcription: () => ({
          baseURL: 'wss://iat-api.xfyun.cn/',
          model: 'xfyun-iat',
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body instanceof FormData ? init.body : undefined
            const file = body?.get('file')
            if (!(file instanceof Blob))
              throw new Error('No audio file provided for transcription.')

            const pcm = await decodeAudioToPcm16kMono(file, init?.signal ?? undefined)
            const text = await transcribeXfyunIat({
              appId: config.appId.trim(),
              apiKey: config.apiKey.trim(),
              apiSecret: config.apiSecret.trim(),
              audio: pcm,
              language: config.language ?? 'zh_cn',
              signal: init?.signal ?? undefined,
            })

            return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json' }, status: 200 })
          },
        }),
      }
    },
    createProviderConfig: ({ t }) => xfyunIatConfigSchema.extend({
      appId: xfyunIatConfigSchema.shape.appId.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.appId.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.appId.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.appId.placeholder'),
      }),
      apiKey: xfyunIatConfigSchema.shape.apiKey.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.apiKey.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.apiKey.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.apiKey.placeholder'),
        type: 'password',
      }),
      apiSecret: xfyunIatConfigSchema.shape.apiSecret.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.apiSecret.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.apiSecret.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-iat.fields.apiSecret.placeholder'),
        type: 'password',
      }),
    }),
    description: 'xfyun.cn',
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'xfyun-iat'}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: 'iFlytek online speech dictation (free daily allowance)',
        id: 'xfyun-iat',
        name: '讯飞语音听写（流式版）',
        provider: 'xfyun-iat',
      }],
    },
    icon: 'i-lobe-icons:iflytek',
    id: 'xfyun-iat',
    name: '讯飞开放平台（语音听写）',

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'xfyun-iat'}.title`),

    tasks: ['speech-to-text', 'automatic-speech-recognition', 'asr', 'stt'],

    capabilities: {
      transcription: { protocol: 'websocket', generateOutput: true, streamOutput: false, streamInput: false },
    },

    validationRequiredWhen: config => Boolean(config.appId?.trim() && config.apiKey?.trim() && config.apiSecret?.trim()),

    validators: {
      validateProvider: [
        ({ t }) => ({
          id: 'xfyun-iat:check-config',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          validator: async (config) => {
            // Opening one dictation connection consumes the daily free call
            // allowance, so validation only checks that the credentials are
            // complete and syntactically plausible.
            const errors: Array<{ error: unknown }> = []
            if (!config.appId?.trim())
              errors.push({ error: new Error('AppID 不能为空。') })
            if (!config.apiKey?.trim())
              errors.push({ error: new Error('APIKey 不能为空。') })
            if (!config.apiSecret?.trim())
              errors.push({ error: new Error('APISecret 不能为空。') })

            const reason = errors.map(item => (item.error as Error).message).join(', ')
            return { errors, reason, reasonKey: '', valid: errors.length === 0 }
          },
        }),
      ],
    },
  })
}
