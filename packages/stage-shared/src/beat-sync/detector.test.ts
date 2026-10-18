// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  getBeatSyncInputByteFrequencyData,
  getBeatSyncState,
  isBeatSyncSupported,
  listenBeatSyncBeatSignal,
  listenBeatSyncStateChange,
  toggleBeatSync,
  updateBeatSyncParameters,
} from './detector'

// Beat Sync runs only in Stage Web. The former capacitor runtime returned
// inactive stubs; after the electron dependency subtree was dropped, every
// other runtime refuses the calls instead of pretending to work.
describe('beat sync outside Stage Web', () => {
  beforeAll(() => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'capacitor')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('reports no support', () => {
    expect(isBeatSyncSupported()).toBe(false)
  })

  it('refuses listeners and configuration synchronously', () => {
    expect(() => listenBeatSyncStateChange(vi.fn())).toThrow('Unknown environment')
    expect(() => listenBeatSyncBeatSignal(vi.fn())).toThrow('Unknown environment')
    expect(() => toggleBeatSync(false)).toThrow('Unknown environment')
    expect(() => toggleBeatSync(true)).toThrow('Unknown environment')
    expect(() => updateBeatSyncParameters({})).toThrow('Unknown environment')
  })

  it('rejects state and frequency reads', async () => {
    await expect(getBeatSyncState()).rejects.toThrow('Unknown environment')
    await expect(getBeatSyncInputByteFrequencyData()).rejects.toThrow('Unknown environment')
  })
})
