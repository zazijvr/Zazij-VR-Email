/** @type {import('tailwindcss').Config} */
import twColors from 'tailwindcss/colors';

// Barvy jsou CSS proměnné „R G B“ (kvůli průhlednosti: bg-neon-blue/20). Výchozí hodnota = neonový
// motiv ZažijVR; ostatní motivy (Nastavení → Vzhled) je přepíšou v src/themes.css (scripts/gen-themes.py).
const trip = (hex) => {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`;
};
const token = (name, hex) => `rgb(var(--c-${name}, ${trip(hex)}) / <alpha-value>)`;
const PALETTES = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const palettes = Object.fromEntries(
  PALETTES.map((name) => [
    name,
    Object.fromEntries(Object.entries(twColors[name]).map(([shade, hex]) => [shade, `rgb(var(--tw-${name}-${shade}, ${trip(hex)}) / <alpha-value>)`])),
  ])
);

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Paleta sjednocená s Moje Károu – v kódu používejte tyto názvy místo hex kódů
      colors: {
        ...palettes,
        'white': token('white', '#ffffff'),
        'neon-blue': token('neon-blue', '#00f3ff'),
        'neon-purple': token('neon-purple', '#f72585'),
        'neon-rose': token('neon-rose', '#d9257b'),   // akcent kalendáře (stejný odstín jako čáry v rozích)
        'neon-red': token('neon-red', '#ff3366'),
        'neon-amber': token('neon-amber', '#f59e0b'),
        'navy': token('navy', '#061026'),             // pozadí aplikace
        'navy-deep': token('navy-deep', '#020817'),   // překryvy a nejtmavší plochy
        'navy-card': token('navy-card', '#0a1630'),   // panely a karty
        'navy-light': token('navy-light', '#0d1b38'), // zvýrazněné karty
        'danger': token('danger', '#ef4444'),
        'danger-soft': token('danger-soft', '#fb7185'),
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
