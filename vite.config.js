import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GH_PAGES ? '/hybrid-fitness/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      workbox: {
        cleanupOutdatedCaches: true,
        // 양궁 앱과 같은 전략: 화면을 열 때마다 네트워크에서 최신 버전을 먼저 시도하고,
        // 오프라인일 때만 캐시된 화면을 씀 (카카오톡 인앱 브라우저 등의 옛 버전 고착 방지)
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'html-shell', networkTimeoutSeconds: 3, fetchOptions: { cache: 'no-store' } },
          },
        ],
      },
      manifest: {
        name: '하이브리드 체력 프로그램',
        short_name: '하이브리드 체력',
        description: '내 체력을 진단하고 약점을 보완하는 하이브리드 체력 프로그램 설계',
        theme_color: '#145c4c',
        background_color: '#eaf0ed',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
