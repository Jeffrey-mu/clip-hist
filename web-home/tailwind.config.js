/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#3b82f6', // blue-500
        secondary: '#64748b', // slate-500
        accent: '#8b5cf6', // violet-500
      }
    },
  },
  plugins: [],
}
