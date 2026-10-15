import { defineBrowserSpeechSynthesisProvider } from './define'
import { cancelSystemSpeech, listSystemVoices, speakWithSystemVoice } from './engine'

export const providerBrowserSpeechSynthesis = defineBrowserSpeechSynthesisProvider()

export { cancelSystemSpeech, defineBrowserSpeechSynthesisProvider }
export { listSystemVoices, speakWithSystemVoice }
