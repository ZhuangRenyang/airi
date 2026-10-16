import type { ProviderDefinition } from '../../../types'
import type { XfyunTtsSynthesisOptions } from './engine'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../../registry'
import { synthesizeXfyunSpeech } from './engine'

/**
 * iFlytek online TTS. Credentials come from xfyun.cn (console): create a
 * "在线语音合成" service and copy the AppID, APIKey and APISecret. The free
 * web tier covers a small voice set and daily call limits.
 */

const xfyunTtsConfigSchema = z.object({
  appId: z.string(),
  apiKey: z.string(),
  apiSecret: z.string(),
  voiceSettings: z.object({
    vcn: z.string().default('xiaoyan'),
    speed: z.number().min(0).max(100).default(50),
    volume: z.number().min(0).max(100).default(50),
    pitch: z.number().min(0).max(100).default(50),
  }).default({ vcn: 'xiaoyan', speed: 50, volume: 50, pitch: 50 }),
})

export type XfyunTtsConfig = z.input<typeof xfyunTtsConfigSchema>

const xfyunTtsVoices = [
  { label: '讯飞小燕（女声）', vcn: 'xiaoyan' },
  { label: '讯飞九绪（男声）', vcn: 'aisjiuxu' },
].map(voice => ({
  id: voice.vcn,
  name: voice.label,
  provider: 'xfyun-tts',
  languages: [{ code: 'zh', title: 'Chinese' }],
  compatibleModels: ['xfyun-free'],
}))

export function defineXfyunTtsProvider(): ProviderDefinition<XfyunTtsConfig, 'xfyun-tts'> {
  return defineProvider<XfyunTtsConfig, 'xfyun-tts'>({
    createProvider(config) {
      return {
        speech: () => ({
          baseURL: 'wss://tts-api.xfyun.cn/',
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) as { input?: string, voice?: string } : {}
            const input = body.input ?? ''
            if (!body.voice)
              throw new Error('No voice selected. Pick a character in the speech settings.')

            const settings = config.voiceSettings as XfyunTtsSynthesisOptions | undefined
            const mp3 = await synthesizeXfyunSpeech(
              input,
              config.apiKey.trim(),
              config.apiSecret.trim(),
              {
                appId: config.appId.trim(),
                vcn: body.voice || settings?.vcn || 'xiaoyan',
                speed: settings?.speed,
                volume: settings?.volume,
                pitch: settings?.pitch,
                signal: init?.signal ?? undefined,
              },
            )

            return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' }, status: 200 })
          },
          model: 'xfyun-free',
        }),
      }
    },
    createProviderConfig: ({ t }) => xfyunTtsConfigSchema.extend({
      appId: xfyunTtsConfigSchema.shape.appId.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.appId.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.appId.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.appId.placeholder'),
      }),
      apiKey: xfyunTtsConfigSchema.shape.apiKey.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.apiKey.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.apiKey.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.apiKey.placeholder'),
        type: 'password',
      }),
      apiSecret: xfyunTtsConfigSchema.shape.apiSecret.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.apiSecret.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.apiSecret.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-tts.fields.apiSecret.placeholder'),
        type: 'password',
      }),
    }),
    description: 'xfyun.cn',
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'xfyun-tts'}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: 'iFlytek online TTS free web tier',
        id: 'xfyun-free',
        name: '讯飞在线语音合成（免费版）',
        provider: 'xfyun-tts',
      }],
      listVoices: async () => xfyunTtsVoices,
    },
    icon: 'i-lobe-icons:iflytek',
    id: 'xfyun-tts',
    name: '讯飞开放平台（语音合成）',

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'xfyun-tts'}.title`),

    tasks: ['text-to-speech'],

    validationRequiredWhen: config => Boolean(config.appId?.trim() && config.apiKey?.trim() && config.apiSecret?.trim()),

    validators: {
      validateProvider: [
        ({ t }) => ({
          id: 'xfyun-tts:check-credentials',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          validator: async (config) => {
            if (!config.appId?.trim() || !config.apiKey?.trim() || !config.apiSecret?.trim()) {
              const reason = 'AppID、APIKey、APISecret 三项都不能为空。'
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }

            try {
              await synthesizeXfyunSpeech('你好', config.apiKey.trim(), config.apiSecret.trim(), {
                appId: config.appId.trim(),
                vcn: 'xiaoyan',
              })
              return { errors: [], reason: '', reasonKey: '', valid: true }
            }
            catch (error) {
              const reason = `讯飞凭证校验失败：${errorMessageFrom(error) ?? 'unknown error'}`
              return { errors: [{ error }], reason, reasonKey: '', valid: false }
            }
          },
        }),
      ],
    },
  })
}
