"""Contact sheet of the stills in a folder: python3 scripts/sheet.py out/stills out/sheet.jpg [columns]"""
import glob, os, sys
from PIL import Image, ImageDraw
folder, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
files = sorted(glob.glob(os.path.join(folder, 'f*.jpeg')))
W, H = 640, 360
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows), 'black')
draw = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(Image.open(f).convert('RGB').resize((W, H)), (x, y))
    draw.text((x + 8, y + 6), os.path.basename(f)[1:5], fill=(255, 80, 70))
sheet.save(out, quality=88)
