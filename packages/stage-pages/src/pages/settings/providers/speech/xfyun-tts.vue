<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import {
  Alert,
  ProviderApiKeyInput,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldInput } from '@proj-airi/ui'
import { cloneDeep } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore) as { configs: RemovableRef<Record<string, any>> }
const { t } = useI18n()

const providerId = 'xfyun-tts'
const defaultModel = 'xfyun-free'

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// SpeechProviderSettings owns only the shared apiKey field. Xfyun needs the
// full credential triple, so these computed fields write straight to the
// provider config store, mirroring the volcengine page pattern.
function configField(field: 'appId' | 'apiSecret') {
  return computed({
    get: () => providers.value[providerId]?.[field] ?? '',
    set: (value: string) => {
      if (!providers.value[providerId])
        providers.value[providerId] = {}
      providers.value[providerId][field] = value
    },
  })
}

const appId = configField('appId')
const apiSecret = configField('apiSecret')

const credentialsConfigured = computed(() => {
  const config = providers.value[providerId]
  return !!config?.appId && !!config?.apiKey && !!config?.apiSecret
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
    <template #basic-settings>
      <div class="flex flex-col gap-4">
        <FieldInput
          v-model="appId"
          :label="t('settings.pages.providers.provider.xfyun-tts.fields.appId.label')"
          :description="t('settings.pages.providers.provider.xfyun-tts.fields.appId.description')"
          :placeholder="t('settings.pages.providers.provider.xfyun-tts.fields.appId.placeholder')"
          required
        />
        <ProviderApiKeyInput
          v-model="apiSecret"
          :label="t('settings.pages.providers.provider.xfyun-tts.fields.apiSecret.label')"
          :description="t('settings.pages.providers.provider.xfyun-tts.fields.apiSecret.description')"
          :placeholder="t('settings.pages.providers.provider.xfyun-tts.fields.apiSecret.placeholder')"
        />
      </div>
    </template>
    <template #playground>
      <Alert
        v-if="!credentialsConfigured"
        type="info"
        :label="t('settings.pages.providers.provider.xfyun-tts.registerHint')"
      />
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="credentialsConfigured"
        :default-text="t('settings.pages.providers.provider.xfyun-tts.playground.default-text')"
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
