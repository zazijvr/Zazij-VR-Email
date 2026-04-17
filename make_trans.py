import base64

# Simple script to convert white to transparent without external dependencies if possible?
try:
    from PIL import Image
    
    img_path = 'public/vr_inbox.png'
    out_path = 'public/vr_inbox_trans.png'
    
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()
    
    newData = []
    for item in datas:
        # Původní barva je azurová na bílém (255, 255, 255)
        # Různý stupeň bílé chceme převést na průhlednost.
        # r, g, b = item[:3]
        # Jestliže r=255, pak alpha=0
        
        alpha = int(255 - item[0])
        newData.append((0, 243, 255, alpha))
        
    img.putdata(newData)
    img.save(out_path, "PNG")
    print("DONE! Image converted to transparent and saved as public/vr_inbox_trans.png")
except Exception as e:
    print(str(e))
