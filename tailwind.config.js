/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2E86AB',
        secondary: '#1A5276',
        success: '#27AE60',
        warning: '#F39C12',
        danger: '#E74C3C',
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
