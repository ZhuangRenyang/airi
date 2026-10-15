<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useProviderValidation } from '@proj-airi/stage-ui/composables/use-provider-validation'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'browser-speech-synthesis'
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { t } = useI18n()

// The device voice roster is device dependent and no other code validates
// this provider, so the page owns its validation state like the VOICEVOX
// family settings do.
const { isValid, isValidating, validationMessage } = useProviderValidation(providerId)

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProvider
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  return await speechStore.speech(
    provider,
    'default',
    input,
    voiceId,
    providerConfigStore.getProviderConfig(providerId),
  )
}

onMounted(async () => {
  await speechStore.loadVoicesForProvider(providerId)
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    default-model="default"
    hide-api-key
  >
    <template #basic-settings>
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
        <template #content>
          <div>{{ t('settings.pages.providers.provider.browser-speech-synthesis.fields.voiceCount', { count: availableVoices.length }) }}</div>
        </template>
      </Alert>
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        :default-text="t('settings.pages.providers.provider.browser-speech-synthesis.playground.default-text')"
      />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>
