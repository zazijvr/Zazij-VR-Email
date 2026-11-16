/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#061026',
        neonCyan: '#00f3ff',
        neonPink: '#f72585',
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
      }
    },
  },
  plugins: [
    require("tailwindcss-animate")
  ],
}
