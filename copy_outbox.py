import shutil
try:
    src = '/home/sefin/.gemini/antigravity/brain/d03fcde6-c174-4e4e-9542-97131faaddc0/vr_panacek_outbox_1775949968576.png'
    dst = '/home/sefin/.gemini/antigravity/scratch/Email & Calendar/email-client/public/vr_outbox.png'
    shutil.copy(src, dst)
    print("COPIED")
except Exception as e:
    print(e)
