import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command }) => ({
  // 构建产物由后端托管在 /botweb 下，资源用绝对路径；dev 服务器保持 /（避免与 /botweb 后端代理冲突）
  base: command === 'build' ? '/botweb/' : '/',
  server: {
    proxy: {
      // 开发环境下将后端（Karin，端口 7777）的页面接口与 WebSocket 代理到 vite
      '/botweb': {
        target: 'http://127.0.0.1:7777',
        changeOrigin: true,
        ws: true
      },
      // 登录/刷新 token 走 karin 官方接口
      '/api/v1': {
        target: 'http://127.0.0.1:7777',
        changeOrigin: true
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
    // 直接产出到后端 lib/webui（core 的 tsdown clean 会先清 lib，故构建顺序必须 core 先、template 后）
    outDir: '../core/lib/webui',
    emptyOutDir: true,
    cssCodeSplit: false,
  }
}))
