import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import fr from './locales/fr.json'

const i18n = createI18n({
  legacy: false,
  locale: localStorage.getItem('splitpay_locale') || 'fr',
  fallbackLocale: 'en',
  messages: {
    en,
    fr
  }
})

export default i18n
export const useI18n = () => {
  // Direct proxy helper to match useI18n usage in composition mode
  return {
    t: i18n.global.t,
    locale: i18n.global.locale
  }
}
