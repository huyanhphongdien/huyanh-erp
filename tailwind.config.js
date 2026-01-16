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
    },
  },
  plugins: [],
}