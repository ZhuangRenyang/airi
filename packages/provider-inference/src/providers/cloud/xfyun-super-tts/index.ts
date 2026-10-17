import { defineXfyunSuperTtsProvider } from './define'
import { buildXfyunSuperTtsUrl, synthesizeXfyunSuperSpeech } from './engine'

export const providerXfyunSuperTts = defineXfyunSuperTtsProvider()

export { buildXfyunSuperTtsUrl, defineXfyunSuperTtsProvider }
export { synthesizeXfyunSuperSpeech }
