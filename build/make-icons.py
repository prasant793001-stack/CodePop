# Draws the CodePop app icons (run once: python3 build/make-icons.py). Pure PIL, no fonts needed.
from PIL import Image, ImageDraw
import os
S = 1024  # draw big, then downscale for smooth edges
BLUE, BLUE2, INK, YEL, RED, WHITE = (63,169,245), (47,147,224), (20,33,61), (255,210,63), (255,77,77), (255,255,255)

def bolt(scale=1.0, cx=512, cy=512):
    pts = [(560,120),(250,570),(470,570),(400,910),(790,430),(560,430)]
    return [((x-512)*scale+cx, (y-512)*scale+cy) for x,y in pts]

def art(maskable):
    im = Image.new('RGBA', (S,S), (0,0,0,0)); d = ImageDraw.Draw(im)
    bg = Image.new('RGBA', (S,S), BLUE+(255,)); bd = ImageDraw.Draw(bg)
    for gy in range(0,S,128):                              # checker, like the blocky theme
        for gx in range(0,S,128):
            if (gx//128 + gy//128) % 2 == 0: bd.rectangle([gx,gy,gx+127,gy+127], fill=BLUE2+(255,))
    if maskable: im.paste(bg, (0,0))                       # full bleed, the OS crops it
    else:
        m = Image.new('L', (S,S), 0); ImageDraw.Draw(m).rounded_rectangle([0,0,S-1,S-1], radius=220, fill=255); im.paste(bg, (0,0), m)
    k = 0.62 if maskable else 0.86                         # maskable keeps the bolt in the safe zone
    sh = bolt(k, 512+26, 512+26); d.polygon(sh, fill=INK)  # hard shadow
    d.polygon(bolt(k), fill=YEL, outline=INK, width=1)
    d.line(bolt(k)+[bolt(k)[0]], fill=INK, width=int(34*k), joint='curve')
    # little code brackets either side
    w = int(40*k)
    for sx in (1,-1):
        cx = 512 + sx*int(400*k)
        d.line([(cx - sx*int(60*k), 512-int(110*k)), (cx + sx*int(30*k)*0 , 512), (cx - sx*int(60*k), 512+int(110*k))], fill=WHITE, width=w, joint='curve')
    return im

os.makedirs('public/icons', exist_ok=True)
a, m = art(False), art(True)
for n, im in (('icon-512.png', a), ('icon-192.png', a), ('apple-touch-icon.png', None), ('maskable-512.png', m), ('maskable-192.png', m)):
    size = int(n.split('-')[-1].split('.')[0]) if n[0] != 'a' else 180
    src = m if n.startswith('maskable') else a
    if n.startswith('apple'):                              # iOS wants a square, no transparency
        bgc = Image.new('RGBA', (S,S), BLUE+(255,)); bgc.alpha_composite(m); src = bgc
    src.resize((size,size), Image.LANCZOS).convert('RGBA' if not n.startswith('apple') else 'RGB').save('public/icons/'+n, optimize=True)
    print(n, size)
