/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Paleta sjednocená s Moje Károu – v kódu používejte tyto názvy místo hex kódů
      colors: {
        'neon-blue': '#00f3ff',
        'neon-purple': '#f72585',
        'neon-rose': '#d9257b',   // akcent kalendáře (stejný odstín jako čáry v rozích)
        'neon-red': '#ff3366',
        'neon-amber': '#f59e0b',
        'navy': '#061026',        // pozadí aplikace
        'navy-deep': '#020817',   // překryvy a nejtmavší plochy
        'navy-card': '#0a1630',   // panely a karty
        'navy-light': '#0d1b38',  // zvýrazněné karty
        'danger': '#ef4444',
        'danger-soft': '#fb7185',
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
