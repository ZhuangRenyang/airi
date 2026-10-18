import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../../types'
import { createOpenAICompatibleValidators } from '../../../validators'
import { defineProvider } from '../../registry'

const agnesAIConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://apihub.agnes-ai.com/v1'),
})

type AgnesAIConfig = z.input<typeof agnesAIConfigSchema>

export const providerAgnesAI = defineProvider<AgnesAIConfig, 'agnes-ai'>({
  id: 'agnes-ai',
  order: 3,
  name: 'Agnes AI',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.agnes-ai.title'),
  description: 'agnes-ai.com - OpenAI-compatible multimodal AI API hub.',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.agnes-ai.description'),
  tasks: ['chat'],
  icon: 'i-lobe-icons:openai',
  iconImage: '/agnes-ai.png',

  createProviderConfig: ({ t }) => agnesAIConfigSchema.extend({
    apiKey: agnesAIConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: agnesAIConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    return createOpenAI(config.apiKey || '', config.baseUrl)
  },

  validationRequiredWhen(config) {
    return !!config.apiKey?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ModelList, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
