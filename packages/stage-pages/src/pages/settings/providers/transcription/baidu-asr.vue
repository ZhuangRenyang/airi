<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  Alert,
  ProviderApiKeyInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  TranscriptionPlayground,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { getDefinedProvider } from '@proj-airi/stage-ui/libs'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { computedAsync } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'baidu-asr'
const defaultModel = 'baidu-asr-standard'
const hearingStore = useHearingStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore) as { configs: RemovableRef<Record<string, any>> }
const { t } = useI18n()

const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].apiKey = value
  },
})

const secretKey = computed({
  get: () => providers.value[providerId]?.secretKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].secretKey = value
  },
})

const credentialsConfigured = computed(() => !!providers.value[providerId]?.apiKey && !!providers.value[providerId]?.secretKey)

const providerMetadata = computedAsync(async () => {
  const definition = getDefinedProvider(providerId)
  if (!definition)
    return undefined
  return {
    localizedName: t('settings.pages.providers.provider.baidu-asr.title'),
    icon: definition.icon,
    iconColor: 'dark',
  }
}, undefined)

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, any>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize transcription provider')

  return await hearingStore.transcription(
    providerId,
    provider,
    defaultModel,
    file,
    'json',
  )
}

const { isValid, isValidating, validationMessage } = useProviderValidation(providerId)
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Baidu ASR'"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => $router.back()"
  >
    <ProviderSettingsContainer class="w-full md:w-[40%] space-y-6">
      <Alert
        v-if="!credentialsConfigured"
        type="info"
        :label="t('settings.pages.providers.provider.baidu-asr.registerHint')"
      />
      <Alert v-if="isValidating > 0" type="loading">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationRunning') }}
        </template>
      </Alert>
      <Alert v-else-if="!isValid && validationMessage" type="error">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationFailed') }}
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-else-if="isValid" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>

      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
      >
        <div class="space-y-4">
          <ProviderApiKeyInput v-model="apiKey" :placeholder="t('settings.pages.providers.catalog.edit.config.common.fields.field.api-key.placeholder')" />
          <ProviderApiKeyInput
            v-model="secretKey"
            :placeholder="t('settings.pages.providers.provider.baidu-asr.fields.secretKey.placeholder')"
            :label="t('settings.pages.providers.provider.baidu-asr.fields.secretKey.label')"
            :description="t('settings.pages.providers.provider.baidu-asr.fields.secretKey.description')"
          />
        </div>
      </ProviderBasicSettings>
    </ProviderSettingsContainer>

    <ProviderSettingsContainer class="w-full md:w-[60%]">
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="credentialsConfigured"
      />
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>
