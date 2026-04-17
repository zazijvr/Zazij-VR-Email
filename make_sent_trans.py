try:
    from PIL import Image
    import os
    
    img_path = '/home/sefin/.gemini/antigravity/brain/d03fcde6-c174-4e4e-9542-97131faaddc0/vr_panacek_outbox_1775949968576.png'
    out_path = '/home/sefin/.gemini/antigravity/scratch/Email & Calendar/email-client/public/vr_sent_trans.png'
    
    img = Image.open(img_path).convert("RGBA")
    datas = img.getdata()
    
    newData = []
    for item in datas:
        # Původní barva je azurová na černém (0, 0, 0)
        # Čím víc zelené a modré (cyan svit), tím víc alpha
        alpha = int(max(item[1], item[2]))
        newData.append((0, 243, 255, alpha))
        
    img.putdata(newData)
    img.save(out_path, "PNG")
    print("DONE! Image converted to transparent and saved as public/vr_sent_trans.png")
except Exception as e:
    print(str(e))
