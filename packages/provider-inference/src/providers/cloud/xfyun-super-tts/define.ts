import type { ProviderDefinition } from '../../../types'
import type { XfyunSuperTtsSynthesisOptions } from './engine'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../../registry'
import { synthesizeXfyunSuperSpeech } from './engine'

/**
 * iFlytek super-smart TTS (超拟人语音合成). Credentials come from xfyun.cn
 * (console): open the 超拟人语音合成 service and copy the AppID, APIKey and
 * APISecret. The trial tier covers a small voice set and daily call limits.
 */

const xfyunSuperTtsConfigSchema = z.object({
  appId: z.string(),
  apiKey: z.string(),
  apiSecret: z.string(),
  voiceSettings: z.object({
    vcn: z.string().default('x5_lingxiaoxuan_flow'),
    speed: z.number().min(0).max(100).default(50),
    volume: z.number().min(0).max(100).default(50),
    pitch: z.number().min(0).max(100).default(50),
  }).default({ vcn: 'x5_lingxiaoxuan_flow', speed: 50, volume: 50, pitch: 50 }),
})

export type XfyunSuperTtsConfig = z.input<typeof xfyunSuperTtsConfigSchema>

const xfyunSuperTtsVoices = [
  { label: '凌小璇（女声·默认）', vcn: 'x5_lingxiaoxuan_flow' },
  { label: '玉兔（女声·俏皮）', vcn: 'x4_yuting' },
  { label: '凌飞翼（男声）', vcn: 'x5_lingfeiyi_flow' },
  { label: '凌峰（男声）', vcn: 'x4_lingfeng' },
].map(voice => ({
  id: voice.vcn,
  name: voice.label,
  provider: 'xfyun-super-tts',
  languages: [{ code: 'zh', title: 'Chinese' }],
  compatibleModels: ['xfyun-super-free'],
}))

export function defineXfyunSuperTtsProvider(): ProviderDefinition<XfyunSuperTtsConfig, 'xfyun-super-tts'> {
  return defineProvider<XfyunSuperTtsConfig, 'xfyun-super-tts'>({
    createProvider(config) {
      return {
        speech: () => ({
          baseURL: 'wss://cbm01.cn-huabei-1.xf-yun.com/',
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) as { input?: string, voice?: string } : {}
            const input = body.input ?? ''
            if (!body.voice)
              throw new Error('No voice selected. Pick a character in the speech settings.')

            const settings = config.voiceSettings as XfyunSuperTtsSynthesisOptions | undefined
            const mp3 = await synthesizeXfyunSuperSpeech(
              input,
              config.apiKey.trim(),
              config.apiSecret.trim(),
              {
                appId: config.appId.trim(),
                vcn: body.voice || settings?.vcn || 'x5_lingxiaoxuan_flow',
                speed: settings?.speed,
                volume: settings?.volume,
                pitch: settings?.pitch,
                signal: init?.signal ?? undefined,
              },
            )

            return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' }, status: 200 })
          },
          model: 'xfyun-super-free',
        }),
      }
    },
    createProviderConfig: ({ t }) => xfyunSuperTtsConfigSchema.extend({
      appId: xfyunSuperTtsConfigSchema.shape.appId.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.appId.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.appId.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.appId.placeholder'),
      }),
      apiKey: xfyunSuperTtsConfigSchema.shape.apiKey.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.apiKey.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.apiKey.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.apiKey.placeholder'),
        type: 'password',
      }),
      apiSecret: xfyunSuperTtsConfigSchema.shape.apiSecret.meta({
        labelLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.apiSecret.label'),
        descriptionLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.apiSecret.description'),
        placeholderLocalized: t('settings.pages.providers.provider.xfyun-super-tts.fields.apiSecret.placeholder'),
        type: 'password',
      }),
    }),
    description: 'xfyun.cn',
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'xfyun-super-tts'}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: 'iFlytek super-smart TTS trial tier',
        id: 'xfyun-super-free',
        name: '讯飞超拟人语音合成（试用版）',
        provider: 'xfyun-super-tts',
      }],
      listVoices: async () => xfyunSuperTtsVoices,
    },
    icon: 'i-lobe-icons:iflytek',
    id: 'xfyun-super-tts',
    name: '讯飞开放平台（超拟人语音合成）',

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'xfyun-super-tts'}.title`),

    tasks: ['text-to-speech'],

    validationRequiredWhen: config => Boolean(config.appId?.trim() && config.apiKey?.trim() && config.apiSecret?.trim()),

    validators: {
      validateProvider: [
        ({ t }) => ({
          id: 'xfyun-super-tts:check-credentials',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          validator: async (config) => {
            if (!config.appId?.trim() || !config.apiKey?.trim() || !config.apiSecret?.trim()) {
              const reason = 'AppID、APIKey、APISecret 三项都不能为空。'
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }

            try {
              await synthesizeXfyunSuperSpeech('你好', config.apiKey.trim(), config.apiSecret.trim(), {
                appId: config.appId.trim(),
                vcn: 'x5_lingxiaoxuan_flow',
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
