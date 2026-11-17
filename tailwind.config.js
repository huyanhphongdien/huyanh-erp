import { palette } from './src/theme/palette.js'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Màu đọc từ src/theme/palette.js — CÙNG nguồn với antd (antdTheme.ts). Trước 17/11/2026 primary là
      // xanh dương #2E86AB lạc tông cả hệ.
      colors: {
        primary: palette.brand,
        secondary: palette.brandActive,
        success: palette.success,
        warning: palette.warning,
        danger: palette.danger,
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
      },
      minHeight: {
        'touch': '2.75rem', // 44px — Apple/Google minimum touch target
      },
      minWidth: {
        'touch': '2.75rem',
      },
    },
  },
  plugins: [],
}
