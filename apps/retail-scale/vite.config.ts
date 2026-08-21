import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@erp': path.resolve(__dirname, '../../src'),
    },
    // ⚠ QUAN TRỌNG — đừng rút gọn danh sách này.
    // Vite phân giải bare-import theo thư mục CHỨA file import. File nằm ở ../../src
    // (alias @erp) sẽ tìm node_modules ở ROOT repo, KHÔNG phải node_modules của app con,
    // và Vite KHÔNG fallback. Trên Vercel (Root Directory = apps/retail-scale) thì root
    // repo không hề `npm install` ⇒ build gãy "Failed to resolve @supabase/supabase-js".
    // Đưa package vào dedupe ⇒ Vite phân giải từ vite root = app con ⇒ tự đủ.
    // Lợi ích kép: triệt tiêu nguy cơ 2 instance supabase-client/react trong 1 bundle.
    dedupe: [
      'react',
      'react-dom',
      'react-router-dom',
      '@supabase/supabase-js',
      'antd',
      '@ant-design/icons',
      'dayjs',
      'zustand',
    ],
  },
  server: {
    // 5173 = ERP chính, 5174 = app cân xe → app cân mủ lẻ dùng 5175
    port: 5175,
  },
  build: {
    outDir: 'dist',
    // Bundle ~1.7 MB vì antd full (giống app cân xe) — nâng ngưỡng để log build sạch.
    chunkSizeWarningLimit: 2000,
  },
})
