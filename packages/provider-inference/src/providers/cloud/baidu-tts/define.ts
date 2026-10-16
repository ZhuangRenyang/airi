import type { ProviderDefinition } from '../../../types'
import type { BaiduTtsVoiceSettings } from './engine'

import { errorMessageFrom } from '@moeru/std'
import { z } from 'zod'

import { defineProvider } from '../../registry'
import { fetchBaiduAccessToken, synthesizeBaiduSpeech } from './engine'

/**
 * Baidu Cloud short-text TTS. Credentials come from the Baidu AI open
 * platform (console.bce.baidu.com): create a "语音技术" application and copy
 * its API Key + Secret Key. The personal free tier grants a large monthly
 * character allowance on the standard voice library.
 */

const baiduTtsConfigSchema = z.object({
  apiKey: z.string(),
  secretKey: z.string(),
  voiceSettings: z.object({
    spd: z.number().min(0).max(9).default(5),
    pit: z.number().min(0).max(9).default(5),
    vol: z.number().min(0).max(15).default(5),
  }).default({ spd: 5, pit: 5, vol: 5 }),
})

export type BaiduTtsConfig = z.input<typeof baiduTtsConfigSchema>

const baiduTtsVoices = [
  { label: '度丫丫（女声）', per: 0 },
  { label: '度小宇（男声）', per: 1 },
  { label: '度逍遥（男声）', per: 3 },
  { label: '度丫丫萝莉（童声）', per: 4 },
].map(voice => ({
  id: String(voice.per),
  name: voice.label,
  provider: 'baidu-tts',
  languages: [{ code: 'zh', title: 'Chinese' }],
  compatibleModels: ['baidu-standard'],
}))

export function defineBaiduTtsProvider(): ProviderDefinition<BaiduTtsConfig, 'baidu-tts'> {
  return defineProvider<BaiduTtsConfig, 'baidu-tts'>({
    createProvider(config) {
      return {
        speech: () => ({
          baseURL: 'https://tsn.baidu.com/',
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) as { input?: string, voice?: string } : {}
            const input = body.input ?? ''
            if (!body.voice)
              throw new Error('No voice selected. Pick a character in the speech settings.')

            const accessToken = await fetchBaiduAccessToken(config.apiKey.trim(), config.secretKey.trim(), init?.signal ?? undefined)
            if (!accessToken)
              throw new Error('Baidu TTS is only available in the browser.')

            const mp3 = await synthesizeBaiduSpeech(input, {
              accessToken,
              voice: Number(body.voice) || 0,
              settings: config.voiceSettings as BaiduTtsVoiceSettings | undefined,
              signal: init?.signal ?? undefined,
            })

            return new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' }, status: 200 })
          },
          model: 'baidu-standard',
        }),
      }
    },
    createProviderConfig: ({ t }) => baiduTtsConfigSchema.extend({
      apiKey: baiduTtsConfigSchema.shape.apiKey.meta({
        labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
        descriptionLocalized: t('settings.pages.providers.provider.baidu-tts.fields.apiKey.description'),
        placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
        type: 'password',
      }),
      secretKey: baiduTtsConfigSchema.shape.secretKey.meta({
        labelLocalized: t('settings.pages.providers.provider.baidu-tts.fields.secretKey.label'),
        descriptionLocalized: t('settings.pages.providers.provider.baidu-tts.fields.secretKey.description'),
        placeholderLocalized: t('settings.pages.providers.provider.baidu-tts.fields.secretKey.placeholder'),
        type: 'password',
      }),
    }),
    description: 'bce.baidu.com',
    descriptionLocalize: ({ t }) => t(`settings.pages.providers.provider.${'baidu-tts'}.description`),
    extraMethods: {
      listModels: async () => [{
        contextLength: 0,
        deprecated: false,
        description: 'Standard Chinese voice library (free tier)',
        id: 'baidu-standard',
        name: '百度标准音库',
        provider: 'baidu-tts',
      }],
      listVoices: async () => baiduTtsVoices,
    },
    icon: 'i-lobe-icons:baidu',
    id: 'baidu-tts',
    name: '百度智能云（语音合成）',

    nameLocalize: ({ t }) => t(`settings.pages.providers.provider.${'baidu-tts'}.title`),

    tasks: ['text-to-speech'],

    validationRequiredWhen: config => Boolean(config.apiKey?.trim() && config.secretKey?.trim()),

    validators: {
      validateProvider: [
        ({ t }) => ({
          id: 'baidu-tts:check-credentials',
          name: t('settings.pages.providers.catalog.edit.validators.openai-compatible.check-connectivity.title'),
          validator: async (config) => {
            if (!config.apiKey?.trim() || !config.secretKey?.trim()) {
              const reason = 'API Key 和 Secret Key 不能为空。'
              return { errors: [{ error: new Error(reason) }], reason, reasonKey: '', valid: false }
            }

            try {
              const token = await fetchBaiduAccessToken(config.apiKey.trim(), config.secretKey.trim())
              if (!token) {
                const reason = 'Baidu TTS is only available in the browser.'
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
