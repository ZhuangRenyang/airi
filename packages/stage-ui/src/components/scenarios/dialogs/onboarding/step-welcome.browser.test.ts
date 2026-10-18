import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import StepWelcome from './step-welcome.vue'

import { AIRI_FLUX_URL, AIRI_TERMS_URL } from '../../../../constants/public-links'
import { useAuthStore } from '../../../../stores/auth'

afterEach(() => vi.unstubAllEnvs())

/** Creates the production English localization surface used by onboarding stores. */
function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en,
    },
  })
}

/** Renders the welcome step with real Pinia and i18n plugins. */
async function renderWelcomeStep(customProviderSetupEnabled: boolean) {
  return render(StepWelcome, {
    props: {
      customProviderSetupEnabled,
      onNext: vi.fn(),
    },
    global: {
      directives: {
        motion: {},
      },
      plugins: [createPinia(), createTestI18n()],
    },
  })
}

/**
 * @example
 * describe('Steam onboarding provider restrictions', () => {})
 */
describe('steam onboarding provider restrictions', () => {
  /**
   * @example
   * it('shows the local provider setup without a sign-in action', async () => {})
   */
  // NOTICE (fork): sign-in is hard-disabled in this self-hosted fork, so the
  // welcome step always offers the local provider setup and never renders the
  // login action. The upstream Steam restriction pairing no longer applies here.
  it('shows the local provider setup without a sign-in action', async () => {
    await renderWelcomeStep(false)

    expect(document.body.textContent).toContain('Setup with your provider')
    expect(document.body.textContent).not.toContain('Sign in')
  })

  /**
   * @example
   * it('keeps custom provider setup in direct builds', async () => {})
   */
  it('keeps custom provider setup in direct builds', async () => {
    await renderWelcomeStep(true)

    expect(document.body.textContent).toContain('Setup with your provider')
  })
})

// NOTICE (fork): sign-in is hard-disabled in this self-hosted web-only fork; the
// login button is commented out in step-welcome.vue and requestsLogin never fires.
// Removal condition: restore when a sign-in server accepting custom deployment
// origins is available.
describe.skip('desktop onboarding sign-in', () => {
  it('requests login through the auth store', async () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
    const pinia = createPinia()
    const screen = await render(StepWelcome, {
      props: {
        customProviderSetupEnabled: true,
        onNext: vi.fn(),
      },
      global: {
        directives: { motion: {} },
        plugins: [pinia, createTestI18n()],
      },
    })

    await screen.getByRole('button', { name: 'Sign in' }).click()

    await expect.poll(() => useAuthStore(pinia).needsLogin).toBe(true)
  })
})

describe('onboarding public links', () => {
  it('links to public pricing and terms without requiring sign-in', async () => {
    const screen = await renderWelcomeStep(true)

    await expect.element(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', AIRI_FLUX_URL)
    await expect.element(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', AIRI_TERMS_URL)
  })
})
