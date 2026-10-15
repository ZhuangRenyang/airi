import { defineEdgeTtsProvider } from './define'
import { generateSecMsGec, synthesizeEdgeSpeech } from './engine'

export const providerEdgeTts = defineEdgeTtsProvider()

export { defineEdgeTtsProvider }
export { generateSecMsGec, synthesizeEdgeSpeech }
