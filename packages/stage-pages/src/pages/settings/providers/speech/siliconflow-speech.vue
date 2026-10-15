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
import { FieldCombobox } from '@proj-airi/ui'
import { cloneDeep } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)
const { t } = useI18n()

const providerId = 'siliconflow-speech'
const defaultModel = 'FunAudioLLM/CosyVoice2-0.5B'

const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].model = value
  },
})

const providerModels = computed(() => {
  return providersStore.getModelsForProvider(providerId)
})

const availableVoices = computed(() => {
  const allVoices = speechStore.availableVoices[providerId] || []
  const selectedModel = model.value || defaultModel

  return allVoices.filter((voice) => {
    if (!voice.compatibleModels || voice.compatibleModels.length === 0)
      return true
    return voice.compatibleModels.includes(selectedModel)
  })
})

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

onMounted(async () => {
  await providersStore.fetchModelsForProvider(providerId)
  await speechStore.loadVoicesForProvider(providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance<SpeechProvider<string>>(providerId)
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  const providerConfig = providerConfigStore.getProviderConfig(providerId)

  // Clone nested reactive values before the synchronized action sends its
  // arguments over the BroadcastChannel (structuredClone).
  return await speechStore.speech(
    provider,
    model.value || defaultModel,
    input,
    voiceId,
    cloneDeep(providerConfig),
  )
}
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #voice-settings>
      <FieldCombobox
        v-model="model"
        label="Model"
        description="CosyVoice2 is the recommended Chinese voice model on SiliconFlow"
        :options="providerModels.map(m => ({ value: m.id, label: m.name }))"
        :disabled="providerModels.length === 0"
        placeholder="Select a model..."
      />
    </template>

    <template #playground>
      <Alert
        v-if="!apiKeyConfigured"
        type="info"
        :label="t('settings.pages.providers.provider.siliconflow-speech.registerHint')"
      />
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :default-text="t('settings.pages.providers.provider.siliconflow-speech.playground.default-text')"
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
