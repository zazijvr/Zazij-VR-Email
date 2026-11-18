#!/usr/bin/env python3
"""Ikona Android aplikace ZažijVR E-mail – neonová obálka (rodina ikon s Moje Károu).

Vytvoří src-tauri/icons/android/*: adaptivní ikonu (pozadí + popředí + jednobarevná pro tematické
ikony Androidu 13+) a klasické ic_launcher / ic_launcher_round pro starší Androidy.
Spuštění: python3 scripts/gen-android-icon.py   (potřebuje Pillow)
"""
import math, pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'src-tauri' / 'icons' / 'android'
SS = 4                      # převzorkování (hladké hrany)
A = 432 * SS                # adaptivní vrstva 108 dp @ xxxhdpi
CYAN = (0, 243, 255)
PINK = (247, 37, 133)

def background(size):
    """Tmavě modrý kruhový přechod (jako Moje Kára)"""
    img = Image.new('RGB', (size, size))
    px = img.load()
    c = size / 2
    inner, outer = (18, 34, 72), (6, 13, 34)
    for y in range(size):
        for x in range(size):
            d = min(1.0, math.hypot(x - c, y - c) / (size * 0.72))
            px[x, y] = tuple(round(inner[i] + (outer[i] - inner[i]) * d) for i in range(3))
    return img

def envelope_lines(size, color, width, scale=1.0):
    """Obálka (obrys + chlopeň) a tečka nové zprávy na průhledném plátně"""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = size / 2
    w, h = size * 0.54 * scale, size * 0.36 * scale     # v bezpečné zóně adaptivní ikony (66 %)
    x0, y0, x1, y1 = c - w / 2, c - h / 2 + size * 0.02, c + w / 2, c + h / 2 + size * 0.02
    r = size * 0.035
    d.rounded_rectangle((x0, y0, x1, y1), radius=r, outline=color, width=width)
    # chlopeň
    mid = (c, y0 + h * 0.56)
    d.line([(x0 + r * 0.6, y0 + r * 0.6), mid, (x1 - r * 0.6, y0 + r * 0.6)], fill=color, width=width, joint='curve')
    return layer, (x1, y0)

def neon(size, color, width, glow=True):
    lines, corner = envelope_lines(size, color + (255,), width)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if glow:
        g = lines.filter(ImageFilter.GaussianBlur(size * 0.022))
        out = Image.alpha_composite(out, g)
        out = Image.alpha_composite(out, g)
    out = Image.alpha_composite(out, lines)
    # Bílé jádro čar – „rozžhavený“ neon
    core, _ = envelope_lines(size, (210, 255, 255, 255), max(1, width // 3))
    out = Image.alpha_composite(out, core)
    # Tečka nové zprávy (růžová, se září) v pravém horním rohu obálky
    dot = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot)
    cx, cy, rr = corner[0] - size * 0.01, corner[1] + size * 0.005, size * 0.055
    dd.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=PINK + (255,))
    if glow:
        out = Image.alpha_composite(out, dot.filter(ImageFilter.GaussianBlur(size * 0.025)))
    out = Image.alpha_composite(out, dot)
    return out

def down(img, px):
    return img.resize((px, px), Image.LANCZOS)

def main():
    stroke = round(A * 0.03)
    bg = background(432)                                   # přechod stačí v cílové velikosti
    fg = neon(A, CYAN, stroke)
    mono, _ = envelope_lines(A, (255, 255, 255, 255), stroke)  # tematická ikona: jen tvar

    adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    legacy = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for dens, px in adaptive.items():
        d = OUT / f'mipmap-{dens}'
        d.mkdir(parents=True, exist_ok=True)
        down(bg.convert('RGBA'), px).convert('RGB').save(d / 'ic_launcher_background.png')
        down(fg, px).save(d / 'ic_launcher_foreground.png')
        down(mono, px).save(d / 'ic_launcher_monochrome.png')

    # Klasická ikona: pozadí + obálka, zaoblený čtverec s tenkým neonovým okrajem (jako Moje Kára)
    full = Image.alpha_composite(down(bg.convert('RGBA'), A), fg)
    full = full.crop((A * 0.09, A * 0.09, A * 0.91, A * 0.91)).resize((A, A), Image.LANCZOS)
    mask = Image.new('L', (A, A), 0)
    ImageDraw.Draw(mask).rounded_rectangle((A * 0.02, A * 0.02, A * 0.98, A * 0.98), radius=A * 0.2, fill=255)
    square = Image.new('RGBA', (A, A), (0, 0, 0, 0))
    square.paste(full, (0, 0), mask)
    ImageDraw.Draw(square).rounded_rectangle((A * 0.02, A * 0.02, A * 0.98, A * 0.98), radius=A * 0.2, outline=CYAN + (110,), width=round(A * 0.008))
    rmask = Image.new('L', (A, A), 0)
    ImageDraw.Draw(rmask).ellipse((A * 0.02, A * 0.02, A * 0.98, A * 0.98), fill=255)
    round_ = Image.new('RGBA', (A, A), (0, 0, 0, 0))
    round_.paste(full, (0, 0), rmask)
    ImageDraw.Draw(round_).ellipse((A * 0.02, A * 0.02, A * 0.98, A * 0.98), outline=CYAN + (110,), width=round(A * 0.008))
    for dens, px in legacy.items():
        d = OUT / f'mipmap-{dens}'
        down(square, px).save(d / 'ic_launcher.png')
        down(round_, px).save(d / 'ic_launcher_round.png')

    (OUT / 'mipmap-anydpi-v26').mkdir(parents=True, exist_ok=True)
    adaptive_xml = '''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
'''
    (OUT / 'mipmap-anydpi-v26' / 'ic_launcher.xml').write_text(adaptive_xml)
    (OUT / 'mipmap-anydpi-v26' / 'ic_launcher_round.xml').write_text(adaptive_xml)
    # pozadí je teď obrázek – barva jen pro jistotu (tmavá)
    (OUT / 'values').mkdir(exist_ok=True)
    (OUT / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">#0A1634</color>\n</resources>\n')
    print('hotovo:', OUT)

if __name__ == '__main__':
    main()
