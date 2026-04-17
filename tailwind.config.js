/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0f172a',
        neonCyan: '#00f3ff',
        neonPink: '#f800ff',
      }
    },
  },
  plugins: [],
}
