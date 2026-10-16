<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { cloneDeep } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)
const { t } = useI18n()

const providerId = 'baidu-tts'
const defaultModel = 'baidu-standard'

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

const apiKeyConfigured = computed(() => {
  const config = providers.value[providerId]
  return !!config?.apiKey && !!config?.secretKey
})

onMounted(async () => {
  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Clone nested reactive values before the synchronized action sends its
  // arguments over the BroadcastChannel (structuredClone).
  return await speechStore.speech(
    provider,
    defaultModel,
    input,
    voiceId,
    cloneDeep(providerStore.getProviderConfig(providerId)),
  )
}
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #playground>
      <Alert
        v-if="!apiKeyConfigured"
        type="info"
        :label="t('settings.pages.providers.provider.baidu-tts.registerHint')"
      />
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :default-text="t('settings.pages.providers.provider.baidu-tts.playground.default-text')"
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
