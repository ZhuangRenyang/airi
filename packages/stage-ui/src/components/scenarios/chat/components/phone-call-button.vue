<script setup lang="ts">
import { useNow } from '@vueuse/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { usePhoneCallStore } from '../../../../stores/phone-call'

const props = defineProps<{
  /** Replaces the compact desktop look, e.g. the mobile composer row uses a larger round button. */
  buttonClass?: string | string[]
}>()
const emit = defineEmits<{
  /** A call needs a transcription provider. The host opens its Hearing settings. */
  configure: []
}>()

const { t } = useI18n()
const call = usePhoneCallStore()
const now = useNow({ interval: 500 })

const idleButtonClass = [
  'size-8 flex items-center justify-center rounded-md outline-none',
  'text-neutral-500 transition-colors duration-200 active:bg-primary-100/80 dark:text-neutral-400 dark:active:bg-primary-900/60',
  'hover:bg-primary-100/60 hover:text-primary-600 dark:hover:bg-primary-900/40 dark:hover:text-primary-300 motion-reduce:transition-none',
]

/** The active call grows into a pill, so the host row needs no layout change. */
const activeButtonClass = [
  'h-8 flex shrink-0 items-center gap-1.5 rounded-full pl-2.5 pr-1.5 outline-none',
  'bg-red-500/10 text-red-500 transition-colors duration-200 hover:bg-red-500/20',
  'dark:bg-red-400/10 dark:text-red-400 dark:hover:bg-red-400/20 motion-reduce:transition-none',
]

const elapsed = computed(() => {
  if (!call.startedAt)
    return '0:00'
  const whole = Math.max(0, Math.floor((now.value.getTime() - call.startedAt) / 1000))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
})

const label = computed(() => call.active ? t('stage.chat.phone-call.end') : t('stage.chat.phone-call.start'))

async function toggle() {
  if (call.active) {
    call.endCall()
    return
  }

  const result = await call.startCall()
  if (result.ok)
    return

  if (result.reason === 'unconfigured') {
    toast.error(t('stage.chat.phone-call.unconfigured'))
    emit('configure')
  }
  else if (result.reason === 'mic-denied') {
    toast.error(t('stage.chat.phone-call.mic-denied'))
  }
}
</script>

<template>
  <button
    type="button"
    :class="call.active ? activeButtonClass : (props.buttonClass ?? idleButtonClass)"
    :title="label"
    :aria-label="label"
    @click="toggle"
  >
    <template v-if="call.active">
      <span class="size-2 animate-pulse rounded-full bg-red-500 dark:bg-red-400" />
      <span class="min-w-8 text-center text-xs font-semibold tabular-nums">{{ elapsed }}</span>
      <span class="i-solar:end-call-rounded-bold size-5" />
    </template>
    <span v-else class="i-solar:phone-calling-rounded-bold size-5" />
  </button>
</template>
