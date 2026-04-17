from PIL import Image
import sys

# Cesty z parametrů
input_path = sys.argv[1]
output_path = sys.argv[2]

try:
    img = Image.open(input_path).convert('RGBA')
    new_data = []

    # Zpracování 
    for r, g, b, a in img.getdata():
        max_val = max(r, g, b)
        min_val = min(r, g, b)
        
        if max_val < 5:
            # Černé pozadí -> úplně pryč
            new_data.append((0, 0, 0, 0))
        elif min_val > 60:
            # Toto je obálka (bílé/šedé pixely)
            # Aby byly čáry PLNO HODNOTNĚ NEONOVÉ, musíme být velmi agresivní vůči šedé!
            if max_val < 240:
                # Jakýkoliv znatelný okraj/čára -> 100% neprůhledná neon modrá
                alpha = 255
            else:
                # Přechody z bílé do hrany agresivně zesílíme
                darkness = 255 - max_val
                alpha = min(255, int(darkness * 20)) # Tlustší a plnější efekt!
                
            new_data.append((0, 243, 255, alpha))
        else:
            # Klasické modré neonové tělo originálního panáčka zanecháme
            if max_val > 0:
                scale = 255.0 / max_val
                new_r = min(255, int(r * scale))
                new_g = min(255, int(g * scale))
                new_b = min(255, int(b * scale))
                new_data.append((new_r, new_g, new_b, max_val))
            else:
                new_data.append((0,0,0,0))

    img.putdata(new_data)
    img.save(output_path, 'PNG')
    print("ÚSPECH! Tvoje nová grafika byla kompletně zpracována a vložena do public složky.")
except Exception as e:
    print(f"Chyba: {e}")
