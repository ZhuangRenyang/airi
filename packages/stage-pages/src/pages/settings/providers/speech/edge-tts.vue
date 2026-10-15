<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'edge-tts'
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerConfigStore = useProviderConfigStore()
const { t } = useI18n()

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
  >
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
