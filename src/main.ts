import { createApp } from 'vue'
import '@/style.css'
import App from '@/App.vue'
import router from '@/router'
import i18n from '@/i18n'
import { registerSW } from 'virtual:pwa-register'

import "flag-icons/css/flag-icons.min.css";

// Register PWA service worker with immediate take-over configuration
registerSW({
  immediate: true,
  onRegisterError(error: any) {
    console.error('[PWA] Service worker registration failed:', error)
  }
})

const app = createApp(App)
app.use(router)
app.use(i18n)
app.mount('#app')

