#!/usr/bin/env python3
"""Vygeneruje src/themes.css – barvy motivů (Nastavení → Vzhled) jako CSS proměnné „R G B“.

Tailwind (tailwind.config.js) bere barvy z proměnných --c-<token> a --tw-<paleta>-<odstín>
s výchozí hodnotou = původní neonový motiv ZažijVR. Motivy je přepíšou na <html data-theme="…">.
Světlé motivy (Světlý, Sakura) palety otočí (slate-200 ↔ slate-800 …): světlý text na tmavém
pozadí se tak stane tmavým na světlém. Spuštění: python3 scripts/gen-themes.py
"""
import json, math, subprocess, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAL = json.loads(subprocess.check_output(
    ['node', '-e', "const c=require('tailwindcss/colors');const o={};for(const k of ['slate','gray','zinc','neutral','stone','red','orange','amber','yellow','lime','green','emerald','teal','cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose'])o[k]=c[k];console.log(JSON.stringify(o))"],
    cwd=ROOT, stderr=subprocess.DEVNULL))
SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

def trip(h):
    h = h.lstrip('#')
    return f'{int(h[0:2],16)} {int(h[2:4],16)} {int(h[4:6],16)}'

def oklch(L, C, H):
    a, b = C * math.cos(math.radians(H)), C * math.sin(math.radians(H))
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = (4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
           -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
           -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_)
    f = lambda x: 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    return '#' + ''.join(f'{max(0, min(255, round(f(c) * 255))):02x}' for c in rgb)

def inverted(name):
    p = PAL[name]
    return {s: p[SHADES[len(SHADES) - 1 - i]] for i, s in enumerate(SHADES)}

def palette_vars(mapping):
    return ''.join(f'  --tw-{name}-{s}: {trip(v)};\n' for name, scale in mapping.items() for s, v in scale.items())

def tokens(t):
    return ''.join(f'  --c-{k}: {trip(v)};\n' for k, v in t.items())

# Výchozí motiv ZažijVR (neon) – musí odpovídat výchozím hodnotám v tailwind.config.js
DEFAULT = {'navy': '#061026', 'navy-deep': '#020817', 'navy-card': '#0a1630', 'navy-light': '#0d1b38',
           'neon-blue': '#00f3ff', 'neon-purple': '#f72585', 'neon-rose': '#d9257b', 'neon-red': '#ff3366',
           'neon-amber': '#f59e0b', 'danger': '#ef4444', 'danger-soft': '#fb7185', 'white': '#ffffff'}

THEMES = {
    'light': dict(
        navy='#eef2f7', **{'navy-deep': '#e3e9f1', 'navy-card': '#ffffff', 'navy-light': '#ffffff',
        'neon-blue': '#0e7490', 'neon-purple': '#be185d', 'neon-rose': '#be185d', 'neon-red': '#e11d48',
        'neon-amber': '#b45309', 'danger': '#dc2626', 'danger-soft': '#e11d48', 'white': '#0f172a'}),
    'sakura': dict(
        navy='#fdf2f6', **{'navy-deep': '#f8e3ec', 'navy-card': '#ffffff', 'navy-light': '#fff7fa',
        'neon-blue': '#d6336c', 'neon-purple': '#8e5cd9', 'neon-rose': '#c2255c', 'neon-red': '#e03131',
        'neon-amber': '#c2410c', 'danger': '#e03131', 'danger-soft': '#e64980', 'white': '#3a1d33'}),
    'dark': dict(
        navy='#121417', **{'navy-deep': '#0f1113', 'navy-card': '#1a1d22', 'navy-light': '#1d2026',
        'neon-blue': '#8ab4f8', 'neon-purple': '#f48fb1', 'neon-rose': '#f48fb1', 'neon-red': '#f87171',
        'neon-amber': '#fbbf24', 'danger': '#ef4444', 'danger-soft': '#fb7185', 'white': '#f1f3f5'}),
    'xmas': dict(
        navy='#0b1d16', **{'navy-deep': '#08160f', 'navy-card': '#10281e', 'navy-light': '#143126',
        'neon-blue': '#f2c14e', 'neon-purple': '#e63946', 'neon-rose': '#e63946', 'neon-red': '#ff4d5e',
        'neon-amber': '#fbbf24', 'danger': '#ef4444', 'danger-soft': '#fb7185', 'white': '#fff8ee'}),
}

# Světlé schéma: všechny palety otočené
light_pal = {n: inverted(n) for n in PAL}
# Sakura: šedé tóny s nádechem do fialova (jako v Moje Káře)
sakura_L = [12.9, 20.8, 27.9, 37.2, 44.6, 55.4, 70.4, 86.9, 92.9, 96.8, 98.4]
sakura_C = [0.012, 0.028, 0.028, 0.028, 0.028, 0.028, 0.028, 0.028, 0.012, 0.012, 0.012]
sakura_slate = {s: oklch(L / 100, C, 345) for s, L, C in zip(SHADES, sakura_L, sakura_C)}

out = ['/* VYGENEROVÁNO scripts/gen-themes.py – neupravovat ručně */\n', ':root {\n' + tokens(DEFAULT) + '}\n']
out.append(':root[data-scheme="light"] {\n  color-scheme: light;\n' + palette_vars(light_pal) + '}\n')
for name in ['light', 'sakura', 'dark', 'xmas']:
    body = tokens(THEMES[name])
    if name == 'sakura':
        body += palette_vars({'slate': sakura_slate, 'gray': sakura_slate})
    if name == 'dark':
        body += palette_vars({'slate': PAL['neutral'], 'gray': PAL['neutral']})
    if name == 'xmas':
        body += palette_vars({'slate': PAL['stone'], 'gray': PAL['stone']})
    out.append(f':root[data-theme="{name}"] {{\n{body}}}\n')
(ROOT / 'src' / 'themes.css').write_text('\n'.join(out), encoding='utf-8')
print('src/themes.css', sum(len(x) for x in out), 'B')
