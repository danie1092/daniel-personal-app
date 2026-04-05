"""
Tamagotchi Pix Party — sprite extractor
Crops individual characters from evolution tree charts and living room backgrounds
from Sanrio catalog.
"""
from PIL import Image
import os

OUT = "/Users/danielle/daniel-personal-app/public/sprites"
MALE_SRC = "/Users/danielle/Downloads/QrM2R36.png"
FEMALE_SRC = "/Users/danielle/Downloads/ZdpeeeE.png"
SANRIO_SRC = "/Users/danielle/Downloads/W2lVas1.jpeg"

def remove_bg(img: Image.Image, bg_sample_box, tolerance=60) -> Image.Image:
    """
    Sample background color from bg_sample_box corner, flood-fill remove from edges.
    Returns RGBA image with background made transparent.
    """
    img = img.convert("RGBA")
    # Sample a 5×5 block from the top-left corner of the crop as background ref
    x0, y0, x1, y1 = bg_sample_box
    region = img.crop((x0, y0, min(x0+20, x1), min(y0+20, y1)))
    px = region.getpixel((0, 0))
    bg_r, bg_g, bg_b = px[0], px[1], px[2]

    # Simple: make all pixels close to background color transparent
    data = img.getdata()
    new_data = []
    for r, g, b, a in data:
        diff = abs(r - bg_r) + abs(g - bg_g) + abs(b - bg_b)
        if diff < tolerance:
            new_data.append((r, g, b, 0))
        else:
            new_data.append((r, g, b, a))
    img.putdata(new_data)
    return img


def crop_char(src: Image.Image, box, name: str, out_dir: str,
              remove_background=True, bg_tolerance=55):
    """Crop box from src image, optionally remove background, save PNG."""
    region = src.crop(box)
    if remove_background:
        # use a corner of the crop for bg sampling
        region = remove_bg(region, (0, 0, region.width, region.height), tolerance=bg_tolerance)
    # Trim transparent padding
    if region.mode == 'RGBA':
        bbox = region.getbbox()
        if bbox:
            region = region.crop(bbox)
    # Add small padding
    pad = 8
    padded = Image.new('RGBA', (region.width + pad*2, region.height + pad*2), (0,0,0,0))
    padded.paste(region, (pad, pad))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    padded.save(path)
    print(f"  saved: {path} ({padded.size})")
    return padded


# ── MALE image ──────────────────────────────────────────────────────────────
print("\n=== Extracting MALE characters ===")
male = Image.open(MALE_SRC).convert("RGBA")
mw, mh = male.size  # 1884 × 3888

# 3-column grid for circle rows
# Circles are centered within each cell; crop just the character (not label)
col3 = [(80, 660), (708, 1270), (1330, 1884)]   # x ranges for 3 cols
col4 = [(30, 500), (500, 970), (960, 1430), (1420, 1884)]  # x ranges for 4 cols (adults)

# --- Baby row (Tamabotchi): y ≈ 480–970 ---
baby_y = (480, 970)
baby_names_m = ["tamabotchi_smart", "tamabotchi_charming", "tamabotchi_creative"]
for i, name in enumerate(baby_names_m):
    box = (*col3[i], *baby_y)  # x0,x1,y0,y1 → PIL needs (x0,y0,x1,y1)
    box = (col3[i][0], baby_y[0], col3[i][1], baby_y[1])
    crop_char(male, box, name, f"{OUT}/male", bg_tolerance=50)

# --- Teen row 1 (happiness-based): y ≈ 1000–1470 ---
teen1_y = (1010, 1470)
teen1_names_m = ["puchitomatchi", "fuyofuyotchi", "mokumokutchi"]
for i, name in enumerate(teen1_names_m):
    box = (col3[i][0], teen1_y[0], col3[i][1], teen1_y[1])
    crop_char(male, box, name, f"{OUT}/male", bg_tolerance=50)

# --- Teen row 2 (care-miss-based): y ≈ 1490–1980 ---
teen2_y = (1500, 1980)
teen2_names_m = ["terukerotchi", "mokokotchi", "kurupoyotchi"]
for i, name in enumerate(teen2_names_m):
    box = (col3[i][0], teen2_y[0], col3[i][1], teen2_y[1])
    crop_char(male, box, name, f"{OUT}/male", bg_tolerance=50)

# --- Adult band 1 (cyan): y ≈ 2120–2620 ---
adult1_y = (2130, 2600)
adult1_names = ["mametchi", "kuromametchi", "kikitchi", "gozarutchi"]
for i, name in enumerate(adult1_names):
    box = (col4[i][0], adult1_y[0], col4[i][1], adult1_y[1])
    crop_char(male, box, name, f"{OUT}/male", bg_tolerance=65)

# --- Adult band 2 (pink): y ≈ 2640–3090 ---
adult2_y = (2650, 3090)
adult2_names = ["ginjirotchi", "charatchi", "kuchipatchi", "orenetchi"]
for i, name in enumerate(adult2_names):
    box = (col4[i][0], adult2_y[0], col4[i][1], adult2_y[1])
    crop_char(male, box, name, f"{OUT}/male", bg_tolerance=65)

# --- Adult band 3 (green): y ≈ 3110–3570 ---
adult3_y = (3110, 3570)
adult3_names = ["shimagurutchi", "paintotchi", "wawatchi", "murachakitchi"]
for i, name in enumerate(adult3_names):
    box = (col4[i][0], adult3_y[0], col4[i][1], adult3_y[1])
    crop_char(male, box, name, f"{OUT}/male", bg_tolerance=65)


# ── FEMALE image ─────────────────────────────────────────────────────────────
print("\n=== Extracting FEMALE characters ===")
female = Image.open(FEMALE_SRC).convert("RGBA")
fw, fh = female.size  # 1860 × 3888

col3f = [(80, 650), (700, 1250), (1310, 1860)]
col4f = [(30, 490), (490, 960), (950, 1420), (1400, 1860)]

# --- Baby row ---
baby_names_f = ["tamapatchi_smart", "tamapatchi_charming", "tamapatchi_creative"]
for i, name in enumerate(baby_names_f):
    box = (col3f[i][0], baby_y[0], col3f[i][1], baby_y[1])
    crop_char(female, box, name, f"{OUT}/female", bg_tolerance=50)

# --- Teen row 1 ---
teen1_names_f = ["tantotchi", "chiroritchi", "mimitamatchi"]
for i, name in enumerate(teen1_names_f):
    box = (col3f[i][0], teen1_y[0], col3f[i][1], teen1_y[1])
    crop_char(female, box, name, f"{OUT}/female", bg_tolerance=50)

# --- Teen row 2 ---
teen2_names_f = ["haretchi", "soyofuwatchi", "tororitchi"]
for i, name in enumerate(teen2_names_f):
    box = (col3f[i][0], teen2_y[0], col3f[i][1], teen2_y[1])
    crop_char(female, box, name, f"{OUT}/female", bg_tolerance=50)

# --- Adult band 1 (cyan) ---
adult1_names_f = ["himetchi", "mimitchi", "chamametchi", "ninjanyatchi"]
for i, name in enumerate(adult1_names_f):
    box = (col4f[i][0], adult1_y[0], col4f[i][1], adult1_y[1])
    crop_char(female, box, name, f"{OUT}/female", bg_tolerance=65)

# --- Adult band 2 (pink) ---
adult2_names_f = ["lovelitchi", "milktchi", "momotchi", "sebiretchi"]
for i, name in enumerate(adult2_names_f):
    box = (col4f[i][0], adult2_y[0], col4f[i][1], adult2_y[1])
    crop_char(female, box, name, f"{OUT}/female", bg_tolerance=65)

# --- Adult band 3 (green) ---
adult3_names_f = ["neliatchi", "memetchi", "coffretchi", "violetchi"]
for i, name in enumerate(adult3_names_f):
    box = (col4f[i][0], adult3_y[0], col4f[i][1], adult3_y[1])
    crop_char(female, box, name, f"{OUT}/female", bg_tolerance=65)


# ── SANRIO catalog ────────────────────────────────────────────────────────────
print("\n=== Extracting SANRIO characters & living rooms ===")
sanrio = Image.open(SANRIO_SRC).convert("RGBA")
sw, sh = sanrio.size  # 3024 × 4634

# --- Sanrio characters (top section): rough grid, 5 left + 5 right ---
# Characters appear in 2 rows of 5, across y≈300-1100
sanrio_chars = [
    ("kitty_mametchi",    (160,  300, 680,  950)),
    ("little_pyueru",     (700,  300, 1200, 950)),
    ("purin_patchi",      (1220, 300, 1720, 950)),
    ("cinnamon_milk",     (1740, 300, 2240, 950)),
    ("melody_pop",        (2250, 300, 2750, 950)),
    ("kuromi_gao",        (2760, 300, 3024, 950)),
    ("sam_wawatchi",      (160,  950, 680,  1300)),
    ("gudetama_karapa",   (700,  950, 1200, 1300)),
    ("gorogoro_awamoko",  (1740, 950, 2350, 1400)),
    ("badtz_maru_tsuyomi",(2400, 950, 3024, 1400)),
]
for name, box in sanrio_chars:
    crop_char(sanrio, box, name, f"{OUT}/sanrio", bg_tolerance=40)

# --- Living rooms (bottom-right of catalog) ---
# Livings section: right column, roughly y=2700-4200
# 2×2 grid within that area
living_rooms = [
    ("kitty_living",   (1560, 2820, 2290, 3560)),
    ("pudding_living", (2290, 2820, 3024, 3560)),
    ("star_living",    (1560, 3560, 2290, 4300)),
    ("thunder_living", (2290, 3560, 3024, 4300)),
]
for name, box in living_rooms:
    region = sanrio.crop(box)
    region = region.convert("RGBA")
    out_dir = f"{OUT}/living"
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    region.save(path)
    print(f"  saved: {path} ({region.size})")

print("\nDone! Check /public/sprites/")
