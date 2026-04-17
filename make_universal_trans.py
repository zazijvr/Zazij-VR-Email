from PIL import Image
import sys

input_path = sys.argv[1]
output_path = sys.argv[2]

try:
    img = Image.open(input_path).convert('RGBA')
    new_data = []

    for r, g, b, a in img.getdata():
        max_val = max(r, g, b)
        
        if max_val < 8:
            new_data.append((0, 0, 0, 0))
        else:
            # Preserve color ratio but boost intensity map to alpha
            # This makes glowing colors transparent at the edges
            alpha = min(255, int(max_val * 1.5))
            
            # Boost color brightness gently so it stays neon
            if max_val > 0:
                scale = 255.0 / max_val
                # we don't completely clamp to pure max, we just brighten it
                new_r = min(255, int(r * scale * 0.7 + r * 0.3))
                new_g = min(255, int(g * scale * 0.7 + g * 0.3))
                new_b = min(255, int(b * scale * 0.7 + b * 0.3))
                new_data.append((new_r, new_g, new_b, alpha))
            else:
                new_data.append((0,0,0,0))

    img.putdata(new_data)
    img.save(output_path, 'PNG')
    print("ÚSPECH! Tvoje nová grafika byla kompletně zpracována (UNIVERZÁLNÍ barvy) a vložena do public složky.")
except Exception as e:
    print(f"Chyba: {e}")
