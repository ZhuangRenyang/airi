import { createOpenAI } from '@xsai-ext/providers/create'
import { z } from 'zod'

import { ProviderValidationCheck } from '../../types'
import { createOpenAICompatibleValidators } from '../../validators'
import { defineProvider } from '../registry'

// Pollinations offers an OpenAI-compatible text generation endpoint that works
// without an API key (anonymous tier, rate limited). Optional keys raise the
// rate limits for users who have one.
const pollinationsConfigSchema = z.object({
  apiKey: z
    .string('API Key')
    .optional(),
  baseUrl: z
    .string('Base URL')
    .optional()
    .default('https://text.pollinations.ai/openai'),
})

type PollinationsConfig = z.input<typeof pollinationsConfigSchema>

export const providerPollinations = defineProvider<PollinationsConfig, 'pollinations'>({
  id: 'pollinations',
  order: 1,
  name: 'Pollinations',
  nameLocalize: ({ t }) => t('settings.pages.providers.provider.pollinations.title'),
  description: 'pollinations.ai',
  descriptionLocalize: ({ t }) => t('settings.pages.providers.provider.pollinations.description'),
  tasks: ['chat'],
  icon: 'i-solar:flower-bold',

  createProviderConfig: ({ t }) => pollinationsConfigSchema.extend({
    apiKey: pollinationsConfigSchema.shape.apiKey.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.label'),
      descriptionLocalized: t('settings.pages.providers.provider.pollinations.config.api-key.description'),
      placeholderLocalized: t('settings.pages.providers.provider.pollinations.config.api-key.placeholder'),
      type: 'password',
    }),
    baseUrl: pollinationsConfigSchema.shape.baseUrl.meta({
      labelLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.label'),
      descriptionLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.description'),
      placeholderLocalized: t('settings.pages.providers.catalog.edit.config.common.fields.field.base-url.placeholder'),
    }),
  }),
  createProvider(config) {
    const provider = createOpenAI(config.apiKey ?? '', config.baseUrl)
    return {
      ...provider,
    }
  },

  validationRequiredWhen(config) {
    return !!config.baseUrl?.trim()
  },
  validators: {
    ...createOpenAICompatibleValidators({
      // The models list endpoint lives outside the OpenAI-compatible base URL
      // (https://text.pollinations.ai/models), so ModelList validation would
      // probe the wrong URL. Connectivity + ChatCompletions cover the flow.
      checks: [ProviderValidationCheck.Connectivity, ProviderValidationCheck.ChatCompletions],
    }),
  },
})
