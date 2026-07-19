import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    proxy: {
      // 开发环境下将后端（Karin，端口 7777）的页面接口与 WebSocket 代理到 vite
      '/botweb': {
        target: 'http://127.0.0.1:7777',
        changeOrigin: true,
        ws: true
      }
    }
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // 将 @ 映射到 src 目录
    },
  },
  build: {
    target: 'es2022',
    outDir: './dist',
    cssCodeSplit: false,
  }
})
