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
import { cloneDeep } from 'es-toolkit'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'edge-tts'
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { t } = useI18n()

// NOTICE: The Edge endpoint is unauthenticated, and no other code validates
// this provider on its own schedule, so this page owns the validation state
// the same way the VOICEVOX family settings do.
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
    // Clone nested reactive values before the synchronized action sends
    // its arguments over the BroadcastChannel (structuredClone).
    cloneDeep(providerConfigStore.getProviderConfig(providerId)),
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
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="() => {}"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
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
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="true"
        :default-text="t('settings.pages.providers.provider.edge-tts.playground.default-text')"
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
