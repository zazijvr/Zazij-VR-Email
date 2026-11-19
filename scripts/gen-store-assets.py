#!/usr/bin/env python3
"""Grafika pro Google Play → store/
  - icon-512.png          ikona aplikace 512 × 512 (celý čtverec, Play si roh zakulatí sám)
  - feature-graphic.png   hlavní grafika 1024 × 500

Neonová obálka je ze stejného kódu jako ikona aplikace (scripts/gen-android-icon.py).
Spuštění: python3 scripts/gen-store-assets.py   (potřebuje Pillow)
"""
import importlib.util, math, pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'store'
CYAN, PINK, PURPLE = (0, 243, 255), (247, 37, 133), (140, 60, 255)
FONT_BLACK = '/usr/share/fonts/noto/NotoSans-Black.ttf'
FONT_BOLD = '/usr/share/fonts/noto/NotoSans-Bold.ttf'

spec = importlib.util.spec_from_file_location('icon', ROOT / 'scripts' / 'gen-android-icon.py')
icon = importlib.util.module_from_spec(spec); spec.loader.exec_module(icon)


def play_icon():
    """Stejná kompozice jako ikona v telefonu (pozadí + obálka), bez masky"""
    A = 1024 * 2
    bg = icon.background(256).resize((A, A), Image.BICUBIC).convert('RGBA')
    fg = icon.neon(A, CYAN, round(A * 0.03))
    full = Image.alpha_composite(bg, fg).crop((A * 0.09, A * 0.09, A * 0.91, A * 0.91))
    return full.resize((512, 512), Image.LANCZOS)


def glow(base, layer, color, radius, strength=1.0):
    g = Image.new('RGBA', base.size, color + (0,))
    g.putalpha(layer.getchannel('A').filter(ImageFilter.GaussianBlur(radius)).point(lambda v: min(255, int(v * strength))))
    base.alpha_composite(g)


def calendar_icon(size, color):
    """Neonový kalendář (list s kroužky a mřížkou dní)"""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    w = max(3, size // 28)
    x0, y0, x1, y1 = size * 0.12, size * 0.2, size * 0.88, size * 0.88
    d.rounded_rectangle((x0, y0, x1, y1), radius=size * 0.08, outline=color + (255,), width=w)
    d.line([(x0, y0 + size * 0.17), (x1, y0 + size * 0.17)], fill=color + (255,), width=w)
    for x in (0.32, 0.68):
        d.line([(size * x, size * 0.12), (size * x, size * 0.27)], fill=color + (255,), width=w)
    for r in range(3):
        for c in range(4):
            cx = x0 + (x1 - x0) * (0.17 + c * 0.22); cy = y0 + size * 0.3 + r * size * 0.13
            col = PINK if (r, c) == (1, 2) else color
            rr = size * 0.035
            d.rounded_rectangle((cx - rr, cy - rr, cx + rr, cy + rr), radius=rr * 0.4, fill=col + (255,))
    return layer


def feature_graphic():
    W, H = 1024, 500
    img = Image.new('RGBA', (W, H)); px = img.load()
    for y in range(H):
        for x in range(W):
            t = min(1.0, math.hypot((x - 250) / 1.1, y - 250) / 640)
            px[x, y] = (round(20 - 15 * t), round(36 - 27 * t), round(78 - 52 * t), 255)

    # Obvodové „spoje“ (jako pozadí aplikace)
    tr = Image.new('RGBA', (W, H), (0, 0, 0, 0)); t = ImageDraw.Draw(tr)
    paths = [
        [(560, 500), (560, 430), (640, 380), (1024, 380)],
        [(700, 500), (700, 455), (760, 420), (1024, 420)],
        [(480, 0), (480, 30), (540, 70), (1024, 70)],
        [(0, 440), (180, 440), (230, 470), (230, 500)],
    ]
    for i, p in enumerate(paths):
        col = (PINK if i == 1 else CYAN) + (110,)
        t.line(p, fill=col, width=2, joint='curve')
        ex, ey = p[1]
        t.ellipse((ex - 5, ey - 5, ex + 5, ey + 5), outline=col, width=2)
    glow(img, tr, CYAN, 4, 0.8); img.alpha_composite(tr)

    # Neonová obálka vlevo, menší kalendář vpravo dole od ní
    S = 560
    env = icon.neon(S * 2, CYAN, round(S * 2 * 0.03)).resize((S, S), Image.LANCZOS)
    img.alpha_composite(env, (-50, -30))
    cal = calendar_icon(170, CYAN)
    calg = Image.new('RGBA', (W, H), (0, 0, 0, 0)); calg.alpha_composite(cal, (300, 290))
    glow(img, calg, CYAN, 8, 1.4); img.alpha_composite(calg)

    # Texty
    d = ImageDraw.Draw(img)
    tx = 500
    title = ImageFont.truetype(FONT_BLACK, 84)
    tl = Image.new('RGBA', (W, H), (0, 0, 0, 0)); td = ImageDraw.Draw(tl)
    td.text((tx, 92), 'E-mail', font=title, fill=(255, 255, 255, 255))
    td.text((tx, 186), '& Kalendář', font=title, fill=(255, 255, 255, 255))
    glow(img, tl, PINK, 18, 0.7); glow(img, tl, CYAN, 7, 1.1); img.alpha_composite(tl)
    d.text((tx + 4, 300), 'Gmail, Seznam i vlastní doména', font=ImageFont.truetype(FONT_BOLD, 30), fill=(200, 236, 255, 255))
    logo = Image.open(ROOT / 'public' / 'cropped-logo-neon-pruhledna-150x50.png').convert('RGBA')
    logo = logo.resize((round(logo.width * 56 / logo.height), 56), Image.LANCZOS)
    lg = Image.new('RGBA', (W, H), (0, 0, 0, 0)); lg.alpha_composite(logo, (tx + 2, 22))
    glow(img, lg, CYAN, 8, 0.7); img.alpha_composite(lg)
    return img.convert('RGB')


def main():
    OUT.mkdir(exist_ok=True)
    play_icon().save(OUT / 'icon-512.png', optimize=True)  # RGBA = 32bitové PNG (Play)
    feature_graphic().save(OUT / 'feature-graphic.png', optimize=True)
    print('hotovo:', OUT)


if __name__ == '__main__':
    main()
