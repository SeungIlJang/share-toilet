import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    // 서울시 공중화장실 API 는 http + CORS 미허용이라 개발 서버에서 프록시로 우회한다.
    // 코드에서는 `/seoul-api/...` 로 호출하면 아래 target 으로 전달된다.
    proxy: {
      '/seoul-api': {
        target: 'http://openapi.seoul.go.kr:8088',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/seoul-api/, ''),
      },
    },
  },
  preview: {
    allowedHosts: ['share-toilet.onrender.com', 'localhost']
  }

})
