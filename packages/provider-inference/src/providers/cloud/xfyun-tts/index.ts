import { defineXfyunTtsProvider } from './define'
import { buildXfyunTtsUrl, synthesizeXfyunSpeech } from './engine'

export const providerXfyunTts = defineXfyunTtsProvider()

export { buildXfyunTtsUrl, defineXfyunTtsProvider }
export { synthesizeXfyunSpeech }
