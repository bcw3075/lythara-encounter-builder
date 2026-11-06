"""Contact sheet of layouts from tools/test/out/layouts.json: one panel per terrain and mood. python3 tools/test/contact.py
Green = open, olive = difficult, blue = deep water, black = wall, pale = in the party's first view, white = entry. Creature colours by role."""
import json, os
from PIL import Image, ImageDraw
H = os.path.dirname(os.path.abspath(__file__)); data = json.load(open(os.path.join(H, "out/layouts.json")))
S, P, COL = 7, 8, 5; C = {"ambusher": (200, 40, 40), "brute": (230, 120, 20), "ranged": (40, 100, 230), "caster": (160, 40, 200), "guard": (200, 200, 40), "beast": (20, 20, 20)}
w, h = data[0]["cols"] * S, data[0]["rows"] * S; rows = (len(data) + COL - 1) // COL
im = Image.new("RGB", (COL * (w + P) + P, rows * (h + P + 14) + P), (30, 30, 30)); d = ImageDraw.Draw(im)
for n, m in enumerate(data):
    x0, y0 = P + (n % COL) * (w + P), P + 14 + (n // COL) * (h + P + 14); d.text((x0, y0 - 12), f'{m["name"]} / {m["mood"]}', fill=(230, 230, 230))
    for j in range(m["rows"]):
        for i in range(m["cols"]):
            k = j * m["cols"] + i; c = (80, 120, 70)
            if m["cost"][k] == 1: c = (140, 130, 60)
            if m["cost"][k] == 2: c = (40, 80, 150)
            g = m["canopy"][k]; c = tuple(int(v * (1 - .35 * g)) for v in c)
            if m["exposure"][k] > 0: c = tuple(min(255, int(v + 50 * m["exposure"][k])) for v in c)
            if m["blocked"][k]: c = (0, 0, 0)
            d.rectangle([x0 + i * S, y0 + j * S, x0 + (i + 1) * S - 1, y0 + (j + 1) * S - 1], fill=c)
    for i, j in m["entry"]: d.rectangle([x0 + i * S, y0 + j * S, x0 + (i + 1) * S - 1, y0 + (j + 1) * S - 1], fill=(255, 255, 255))
    for p in m["placed"]: d.ellipse([x0 + p["i"] * S, y0 + p["j"] * S, x0 + (p["i"] + p["n"]) * S - 1, y0 + (p["j"] + p["n"]) * S - 1], fill=C[p["role"]], outline=(255, 255, 255))
im.save(os.path.join(H, "out/layouts.png")); print(im.size)
