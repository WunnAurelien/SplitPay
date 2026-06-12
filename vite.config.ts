import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/SplitPay/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  plugins: [
    vue(),
    vueDevTools(),
    VitePWA({
      devOptions: {
        enabled: true
      },
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SplitPay',
        short_name: 'SplitPay',
        description: 'Split bills and track shared expenses easily.',
        theme_color: '#08090f',
        background_color: '#08090f',
        display: 'standalone',
        start_url: '/SplitPay/',
        scope: '/SplitPay/',
        launch_handler: {
          client_mode: ['navigate-existing', 'auto']
        },
        id: '/SplitPay/?homescreen=1',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-256x256.png',
            sizes: '256x256',
            type: 'image/png'
          },
          {
            src: 'icon-384x384.png',
            sizes: '384x384',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        importScripts: ['/SplitPay/push-listener.js'],
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
})
