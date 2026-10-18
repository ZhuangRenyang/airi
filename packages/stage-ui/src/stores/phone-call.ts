import type { HearingInputMode } from './modules/hearing'

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useChatSessionStore } from './chat/session-store'
import { useHearingStore } from './modules/hearing'
import { useSettingsAudioDevice } from './settings/audio-device'
import { useSpeechOutputControlStore } from './speech-output-control'
import { useVoiceStore } from './voice'

/** Hearing settings that a call borrows and restores when it ends. */
interface PhoneCallSnapshot {
  inputMode: HearingInputMode
  autoSendEnabled: boolean
  microphoneEnabled: boolean
}

const SNAPSHOT_KEY = 'settings/phone-call/snapshot'
const HEARTBEAT_KEY = 'settings/phone-call/heartbeat'
/** Marks the browser tab that runs the call. sessionStorage keeps it across a reload of the same tab. */
const OWNER_SESSION_KEY = 'settings/phone-call/owner'
/** The calling tab refreshes the heartbeat on this rhythm; staleness means the tab died or closed. */
const HEARTBEAT_INTERVAL_MS = 2000
const HEARTBEAT_STALE_MS = 8000

function readSnapshot(): PhoneCallSnapshot | undefined {
  const raw = localStorage.getItem(SNAPSHOT_KEY)
  if (!raw)
    return undefined
  try {
    const snapshot = JSON.parse(raw) as Partial<PhoneCallSnapshot>
    if (typeof snapshot.inputMode !== 'string' || typeof snapshot.autoSendEnabled !== 'boolean' || typeof snapshot.microphoneEnabled !== 'boolean')
      return undefined
    return { inputMode: snapshot.inputMode as HearingInputMode, autoSendEnabled: snapshot.autoSendEnabled, microphoneEnabled: snapshot.microphoneEnabled }
  }
  catch {
    return undefined
  }
}

/**
 * Runs a phone-call style conversation: the microphone listens continuously, a finished
 * sentence sends itself, and the character speaks the reply, until the user hangs up.
 *
 * A call is a temporary override of Hearing settings, not a new store of its own, so every
 * piece (VAD input, auto send, speech output) keeps its existing behavior. Starting saves a
 * snapshot and switches Hearing to always-on listening with auto send; ending restores it.
 * A reload ends the call in memory, so the first store creation restores a snapshot when no
 * live calling tab holds the heartbeat.
 */
export const usePhoneCallStore = defineStore('phone-call', () => {
  const active = ref(false)
  const startedAt = ref(0)
  /** True while the microphone permission prompt from the start request is pending. */
  const starting = ref(false)
  let heartbeat: ReturnType<typeof setInterval> | undefined

  function applySnapshot(snapshot: PhoneCallSnapshot) {
    const hearing = useHearingStore()
    const devices = useSettingsAudioDevice()
    hearing.inputMode = snapshot.inputMode
    hearing.autoSendEnabled = snapshot.autoSendEnabled
    devices.enabled = snapshot.microphoneEnabled
  }

  function clearRecovery() {
    localStorage.removeItem(SNAPSHOT_KEY)
    localStorage.removeItem(HEARTBEAT_KEY)
    sessionStorage.removeItem(OWNER_SESSION_KEY)
  }

  // Recovery runs once, at store creation. A live call in another tab keeps a fresh
  // heartbeat and owns no session marker here, so that tab's call stays untouched.
  const saved = readSnapshot()
  if (saved) {
    const ownCall = sessionStorage.getItem(OWNER_SESSION_KEY) === '1'
    const heartbeatAt = Number(localStorage.getItem(HEARTBEAT_KEY) ?? 0)
    const callingTabDied = !heartbeatAt || Date.now() - heartbeatAt > HEARTBEAT_STALE_MS
    if (ownCall || callingTabDied) {
      applySnapshot(saved)
      clearRecovery()
    }
  }

  function startHeartbeat() {
    localStorage.setItem(HEARTBEAT_KEY, String(Date.now()))
    heartbeat = setInterval(() => localStorage.setItem(HEARTBEAT_KEY, String(Date.now())), HEARTBEAT_INTERVAL_MS)
  }

  function stopHeartbeat() {
    clearInterval(heartbeat)
    heartbeat = undefined
  }

  /**
   * Turns the conversation into a call. The click that calls this provides the user
   * gesture for the microphone permission prompt.
   */
  async function startCall(): Promise<{ ok: boolean, reason?: 'unconfigured' | 'mic-denied' }> {
    if (active.value || starting.value)
      return { ok: false }

    const hearing = useHearingStore()
    if (!hearing.configured)
      return { ok: false, reason: 'unconfigured' }

    starting.value = true
    try {
      const devices = useSettingsAudioDevice()
      const microphoneEnabled = devices.enabled
      if (!microphoneEnabled) {
        const granted = await devices.askPermission()
        if (!granted)
          return { ok: false, reason: 'mic-denied' }
      }

      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ inputMode: hearing.inputMode, autoSendEnabled: hearing.autoSendEnabled, microphoneEnabled } satisfies PhoneCallSnapshot))
      hearing.inputMode = 'always-on'
      hearing.autoSendEnabled = true
      devices.enabled = true
      sessionStorage.setItem(OWNER_SESSION_KEY, '1')
      startHeartbeat()
      active.value = true
      startedAt.value = Date.now()
      return { ok: true }
    }
    finally {
      starting.value = false
    }
  }

  /** Restores the Hearing settings, stops the running capture, and silences the character. */
  function endCall() {
    if (!active.value)
      return
    active.value = false
    startedAt.value = 0
    stopHeartbeat()

    const snapshot = readSnapshot()
    if (snapshot)
      applySnapshot(snapshot)
    clearRecovery()

    const sessions = useChatSessionStore()
    void useVoiceStore().cancelInput()
    void useSpeechOutputControlStore().requestStopSpeaking(
      sessions.activeSessionId
        ? { reason: 'manual-chat', sessionId: sessions.activeSessionId }
        : { reason: 'manual-all' },
    ).catch(() => {})
  }

  return { active, startedAt, starting, startCall, endCall }
})
