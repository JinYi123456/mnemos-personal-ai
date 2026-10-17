#!/usr/bin/env python3
"""Generate the three designed cards for the demo film, all from real data:
  title.png     — end card (wordmark + tagline + repo/demo + built-on line)
  s11-mcp.png   — a terminal showing the *actual* MCP stdio handshake + tool list
  s12-bench.png — the *live* retrieval benchmark numbers from README
Run after capture-video.mjs (reads assets/video/_mcp-out.txt / _mcp-err.txt).
"""
import json, os, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VDIR = os.path.join(ROOT, "assets", "video")
W, H = 1920, 1080
BG = (8, 10, 20)
GOLD = (242, 200, 122); BLUE = (185, 196, 232); TEAL = (143, 227, 192)
ROSE = (232, 138, 138); WHITE = (240, 242, 248); DIM = (120, 130, 160)

def font(name, size):
    base = "C:/Windows/Fonts"
    cand = {"sans": ["segoeui.ttf"], "bold": ["segoeui-bold.ttf", "segoeuib.ttf"],
            "light": ["segoeui-light.ttf", "segoeuil.ttf"], "mono": ["consola.ttf", "cour.ttf"]}
    for f in cand.get(name, ["arial.ttf"]):
        p = os.path.join(base, f)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def sky_bg(seed=7, n=90):
    rnd = random.Random(seed)
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    # soft radial nebula
    for _ in range(3):
        cx, cy = rnd.randint(200, W - 200), rnd.randint(150, H - 150)
        r = rnd.randint(360, 620)
        col = rnd.choice([(30, 26, 60), (18, 30, 55), (40, 24, 40)])
        for rr in range(r, 0, -12):
            a = int(28 * (1 - rr / r))
            ov = Image.new("RGB", (W, H), (0, 0, 0))
            ImageDraw.Draw(ov).ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=tuple(int(c * (a / 60)) for c in col))
            img = Image.blend(img, Image.composite(ov, img, ov.convert("L")), 0.5)
        d = ImageDraw.Draw(img)
    pts = []
    for _ in range(n):
        x, y = rnd.randint(0, W), rnd.randint(0, H)
        s = rnd.choice([1, 1, 2, 2, 3])
        c = rnd.choice([GOLD, BLUE, WHITE, (200, 170, 220)])
        d.ellipse([x - s, y - s, x + s, y + s], fill=c)
        if s >= 2: pts.append((x, y))
    for i in range(len(pts) - 1):
        if rnd.random() < 0.18:
            d.line([pts[i], pts[i + 1]], fill=(70, 80, 120), width=1)
    return img

def center_text(d, y, text, fnt, fill, tracking=0):
    if tracking:
        widths = [d.textlength(ch, font=fnt) for ch in text]
        total = sum(widths) + tracking * (len(text) - 1)
        x = (W - total) / 2
        for ch, w in zip(text, widths):
            d.text((x, y), ch, font=fnt, fill=fill); x += w + tracking
    else:
        w = d.textlength(text, font=fnt)
        d.text(((W - w) / 2, y), text, font=fnt, fill=fill)

# ---------- title / end card --------------------------------------------------
def make_title():
    img = sky_bg(seed=11, n=110)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 360, W, 760], fill=(8, 10, 20))  # clean band
    d = ImageDraw.Draw(img)
    center_text(d, 380, "", font("sans", 60), GOLD)
    # a drawn 4-point sparkle (Segoe UI has no ✦ glyph)
    cx, cy, r = W/2, 405, 26
    d.polygon([(cx, cy-r), (cx+r*0.28, cy-r*0.28), (cx+r, cy), (cx+r*0.28, cy+r*0.28),
               (cx, cy+r), (cx-r*0.28, cy+r*0.28), (cx-r, cy), (cx-r*0.28, cy-r*0.28)], fill=GOLD)
    center_text(d, 452, "Mnemos", font("light", 132), WHITE, tracking=4)
    center_text(d, 610, "memory you can see, question, and own", font("light", 44), BLUE)
    d.line([W/2-360, 700, W/2+360, 700], fill=(60, 66, 92), width=1)
    center_text(d, 726, "Built on Nebius Token Factory with NVIDIA Nemotron 3", font("sans", 30), GOLD)
    center_text(d, 792, "github.com/JinYi123456/mnemos-personal-ai    ·    mnemos-personal-ai.onrender.com", font("mono", 26), DIM)
    img.save(os.path.join(VDIR, "title.png"))
    print("title.png")

# ---------- MCP terminal card -------------------------------------------------
def make_mcp():
    out = os.path.join(VDIR, "_mcp-out.txt"); err = os.path.join(VDIR, "_mcp-err.txt")
    tools, server = [], ""
    if os.path.exists(out):
        for l in open(out, encoding="utf-8"):
            try: j = json.loads(l)
            except Exception: continue
            if j.get("result", {}).get("tools"): tools = [t["name"] for t in j["result"]["tools"]]
            if j.get("result", {}).get("serverInfo"): server = j["result"]["serverInfo"]["name"]
    stats = "vault ./vault"
    if os.path.exists(err):
        for l in open(err, encoding="utf-8"):
            if "memories" in l: stats = l.split(":", 1)[1].strip(); break
    img = Image.new("RGB", (W, H), (10, 12, 18)); d = ImageDraw.Draw(img)
    # window chrome
    d.rounded_rectangle([120, 90, W-120, H-90], 18, fill=(14, 17, 26), outline=(46, 52, 74), width=2)
    d.rectangle([120, 90, W-120, 150], fill=(22, 26, 38))
    for i, c in enumerate([(232,138,138),(242,200,122),(143,227,192)]):
        d.ellipse([152+i*30, 108, 172+i*30, 128], fill=c)
    d.text((300, 106), "mnemos — stdio MCP server", font=font("mono", 24), fill=DIM)
    mono = font("mono", 30); x, y = 176, 200; lh = 46
    def line(t, col=WHITE, dy=lh):
        nonlocal y; d.text((x, y), t, font=mono, fill=col); y += dy
    line("$ node src/mcp.js", TEAL)
    line(f"mnemos-mcp: {stats}", DIM)
    line("mnemos-mcp: providers: nebius", DIM)
    line("mnemos-mcp: listening on stdio (newline-delimited JSON-RPC 2.0)", DIM, dy=64)
    line('> {"method":"tools/list","id":2}', BLUE)
    line(f"← server “{server}” exposes {len(tools)} tools:", GOLD)
    for t in tools:
        line(f"    • {t}", WHITE, dy=44)
    img.save(os.path.join(VDIR, "s11-mcp.png")); print("s11-mcp.png")

# ---------- benchmark card ----------------------------------------------------
BENCH = [
    ("arm", "hit@6", "recall@6", "MRR", "answer acc", "cites resolve"),
    ("lexical only", "97.0%", "94.4%", "0.737", "75.8–81.8%", "80.0–88.6%"),
    ("embedding only", "100.0%", "94.4%", "0.909", "78.8–81.8%", "91.7–91.9%"),
    ("hybrid (shipped)", "97.0%", "92.9%", "0.824", "69.7–75.8%", "83.3–86.1%"),
    ("full agent loop", "97.0%", "92.9%", "0.824", "69.7–78.8%", "17.5–35.0%"),
]
def make_bench():
    img = Image.new("RGB", (W, H), (10, 12, 18)); d = ImageDraw.Draw(img)
    d.rounded_rectangle([140, 150, W-140, H-150], 20, fill=(14, 17, 26), outline=(46, 52, 74), width=2)
    center_text(d, 210, "Retrieval, measured", font("light", 70), WHITE)
    center_text(d, 306, "40 questions · LongMemEval-style · two live runs · Nemotron-3-Nano + Qwen3-Embedding", font("sans", 28), BLUE)
    cols = [400, 250, 260, 200, 300, 300]
    xs = [220]; 
    for c in cols: xs.append(xs[-1] + c)
    mono = font("mono", 30); bold = font("bold", 30); sans = font("sans", 30)
    y = 400
    for r, row in enumerate(BENCH):
        col = GOLD if r == 0 else WHITE
        f = bold if r == 0 else (bold if row[0].startswith("hybrid") else mono)
        if r == 0:
            d.line([200, y+52, W-200, y+52], fill=(60, 66, 92), width=1)
        for ci, cell in enumerate(row):
            c = col if ci == 0 else (TEAL if (r == 3 and ci in (1,2,3,4,5)) else col)
            d.text((xs[ci] + (0 if ci == 0 else 20), y), cell, font=(bold if r == 0 or row[0].startswith("hybrid") else mono), fill=(GOLD if r == 0 else (TEAL if row[0].startswith("hybrid") else WHITE)))
        y += 74
    center_text(d, y+30, "ranges are real run-to-run variance — pretending otherwise would be fake precision", font("sans", 26), DIM)
    img.save(os.path.join(VDIR, "s12-bench.png")); print("s12-bench.png")

if __name__ == "__main__":
    make_title(); make_mcp(); make_bench()
