import { defineBaiduTtsProvider } from './define'
import { fetchBaiduAccessToken, synthesizeBaiduSpeech } from './engine'

export const providerBaiduTts = defineBaiduTtsProvider()

export { defineBaiduTtsProvider }
export { fetchBaiduAccessToken, synthesizeBaiduSpeech }
