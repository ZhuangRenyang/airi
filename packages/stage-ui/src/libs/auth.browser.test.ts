import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isSigningIn, registerAuthorizationHandler, triggerSignIn } from './auth'
import { consumeFlowState } from './auth-oidc'

// NOTICE: `triggerSignIn` is hard-disabled in this self-hosted web-only fork
// (see ./auth.ts) — it returns immediately and never invokes the registered
// authorization handler, so every assertion below would time out. Re-enable
// when a sign-in server accepting custom deployment origins is available.
describe.skip('isSigningIn', () => {
  beforeEach(() => {
    consumeFlowState()
  })

  afterEach(() => {
    consumeFlowState()
    registerAuthorizationHandler(async () => {})
  })

  it('stays true while the authorization handler is pending', async () => {
    let finish: (() => void) | undefined
    registerAuthorizationHandler(() => new Promise<void>((resolve) => {
      finish = resolve
    }))

    expect(isSigningIn.value).toBe(false)
    const pending = triggerSignIn()
    await expect.poll(() => finish).toBeDefined()
    expect(isSigningIn.value).toBe(true)

    finish?.()
    await pending
    expect(isSigningIn.value).toBe(false)
  })

  it.each([undefined, 'google'] as const)('requests fresh login without repeating a provider handoff (%s)', async (provider) => {
    let requestedUrl = ''
    registerAuthorizationHandler(async ({ authorizationUrl }) => {
      requestedUrl = authorizationUrl
    })
    await triggerSignIn({ provider })
    const url = new URL(requestedUrl)
    expect(url.searchParams.get('prompt')).toBe(provider ? null : 'login')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
  })

  it('resets when the authorization handler fails', async () => {
    registerAuthorizationHandler(async () => {
      throw new Error('authorization failed')
    })

    await expect(triggerSignIn()).rejects.toThrow('authorization failed')
    expect(isSigningIn.value).toBe(false)
  })
})
