"""
Tamagotchi Pix Party — sprite extractor v2
더 정밀한 크롭 + flood-fill 배경 제거
"""
from PIL import Image, ImageDraw
import os

OUT = "/Users/danielle/daniel-personal-app/public/sprites"
MALE_SRC   = "/Users/danielle/Downloads/QrM2R36.png"
FEMALE_SRC = "/Users/danielle/Downloads/ZdpeeeE.png"
SANRIO_SRC = "/Users/danielle/Downloads/W2lVas1.jpeg"


# ── 유틸 ─────────────────────────────────────────────────────────────────────

def flood_fill_transparent(img: Image.Image, seed_pixels, tolerance=55) -> Image.Image:
    """
    BFS flood fill from seed_pixels, turn matching-background pixels transparent.
    Works on RGBA image.
    """
    img = img.convert("RGBA")
    w, h = img.size
    pixels = list(img.getdata())
    visited = [False] * (w * h)

    def idx(x, y): return y * w + x

    def color_dist(c1, c2):
        return abs(int(c1[0]) - int(c2[0])) + abs(int(c1[1]) - int(c2[1])) + abs(int(c1[2]) - int(c2[2]))

    queue = []
    for sx, sy in seed_pixels:
        if 0 <= sx < w and 0 <= sy < h:
            queue.append((sx, sy))
            visited[idx(sx, sy)] = True

    result = list(pixels)

    while queue:
        x, y = queue.pop()
        base_color = pixels[idx(x, y)]
        result[idx(x, y)] = (base_color[0], base_color[1], base_color[2], 0)

        for nx, ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
            if 0 <= nx < w and 0 <= ny < h and not visited[idx(nx, ny)]:
                nc = pixels[idx(nx, ny)]
                if nc[3] > 0 and color_dist(nc, base_color) < tolerance:
                    visited[idx(nx, ny)] = True
                    queue.append((nx, ny))

    img.putdata(result)
    return img


def remove_background_from_edges(img: Image.Image, tolerance=55) -> Image.Image:
    """4 모서리 + 변(edges)에서 flood fill로 배경 제거"""
    w, h = img.size
    # 모서리 + 각 변에서 시드 픽셀 추출
    seeds = []
    # 4 모서리
    for sx, sy in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:
        seeds.append((sx, sy))
    # 각 변을 따라 일정 간격
    step = 10
    for x in range(0, w, step):
        seeds.extend([(x, 0), (x, h-1)])
    for y in range(0, h, step):
        seeds.extend([(0, y), (w-1, y)])
    return flood_fill_transparent(img, seeds, tolerance=tolerance)


def crop_and_clean(src: Image.Image, box, name: str, out_dir: str,
                   bg_tolerance=60, pad=12):
    """Crop → remove background from edges → trim → save"""
    region = src.crop(box)
    region = region.convert("RGBA")
    cleaned = remove_background_from_edges(region, tolerance=bg_tolerance)
    bbox = cleaned.getbbox()
    if bbox:
        cleaned = cleaned.crop(bbox)
    # 패딩 추가
    final = Image.new('RGBA', (cleaned.width + pad*2, cleaned.height + pad*2), (0,0,0,0))
    final.paste(cleaned, (pad, pad))
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    final.save(path)
    print(f"  ✓ {name}.png  {final.size}")
    return final


def crop_living(src: Image.Image, box, name: str, out_dir: str):
    """리빙룸은 배경 제거 없이 직접 크롭 저장"""
    region = src.crop(box)
    region = region.convert("RGBA")
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{name}.png")
    region.save(path)
    print(f"  ✓ {name}.png  {region.size}")


# ── MALE image (1884×3888) ────────────────────────────────────────────────────
print("\n=== Extracting MALE characters ===")
male = Image.open(MALE_SRC).convert("RGBA")

# 원형 행: 3컬럼. 라벨 부분(하단 색상박스) 제외하고 크롭
# 컬럼 x 범위 (여백 고려)
c3 = [(105, 620), (720, 1245), (1350, 1870)]
# 베이비 행: 원 내부만 (라벨 제외) y=500-860
baby_y  = (500, 870)
# 틴1 행: y=1000-1370
teen1_y = (1010, 1380)
# 틴2 행: y=1490-1870
teen2_y = (1495, 1880)

baby_names_m  = ["tamabotchi_smart", "tamabotchi_charming", "tamabotchi_creative"]
teen1_names_m = ["puchitomatchi", "fuyofuyotchi", "mokumokutchi"]
teen2_names_m = ["terukerotchi", "mokokotchi", "kurupoyotchi"]

for i, name in enumerate(baby_names_m):
    crop_and_clean(male, (c3[i][0], baby_y[0], c3[i][1], baby_y[1]), name, f"{OUT}/male", bg_tolerance=55)
for i, name in enumerate(teen1_names_m):
    crop_and_clean(male, (c3[i][0], teen1_y[0], c3[i][1], teen1_y[1]), name, f"{OUT}/male", bg_tolerance=55)
for i, name in enumerate(teen2_names_m):
    crop_and_clean(male, (c3[i][0], teen2_y[0], c3[i][1], teen2_y[1]), name, f"{OUT}/male", bg_tolerance=55)

# 성인 밴드: 4컬럼. 왼쪽 알 아이콘(x<200) 및 하단 라벨 제외
# 밴드1(시안) y=2130-2580 → 캐릭터만 y=2140-2520
# 밴드2(핑크) y=2630-3080 → y=2640-3010
# 밴드3(초록) y=3110-3560 → y=3120-3490
c4 = [(240, 700), (700, 1170), (1165, 1640), (1630, 1884)]

a1_y = (2145, 2525)
a2_y = (2645, 3015)
a3_y = (3120, 3490)

adult1_m = ["mametchi", "kuromametchi", "kikitchi", "gozarutchi"]
adult2_m = ["ginjirotchi", "charatchi", "kuchipatchi", "orenetchi"]
adult3_m = ["shimagurutchi", "paintotchi", "wawatchi", "murachakitchi"]

for i, name in enumerate(adult1_m):
    crop_and_clean(male, (c4[i][0], a1_y[0], c4[i][1], a1_y[1]), name, f"{OUT}/male", bg_tolerance=70)
for i, name in enumerate(adult2_m):
    crop_and_clean(male, (c4[i][0], a2_y[0], c4[i][1], a2_y[1]), name, f"{OUT}/male", bg_tolerance=70)
for i, name in enumerate(adult3_m):
    crop_and_clean(male, (c4[i][0], a3_y[0], c4[i][1], a3_y[1]), name, f"{OUT}/male", bg_tolerance=70)


# ── FEMALE image (1860×3888) ──────────────────────────────────────────────────
print("\n=== Extracting FEMALE characters ===")
female = Image.open(FEMALE_SRC).convert("RGBA")

c3f = [(105, 610), (710, 1230), (1335, 1855)]
c4f = [(235, 690), (685, 1155), (1150, 1625), (1615, 1860)]

baby_names_f  = ["tamapatchi_smart", "tamapatchi_charming", "tamapatchi_creative"]
teen1_names_f = ["tantotchi", "chiroritchi", "mimitamatchi"]
teen2_names_f = ["haretchi", "soyofuwatchi", "tororitchi"]
adult1_f = ["himetchi", "mimitchi", "chamametchi", "ninjanyatchi"]
adult2_f = ["lovelitchi", "milktchi", "momotchi", "sebiretchi"]
adult3_f = ["neliatchi", "memetchi", "coffretchi", "violetchi"]

for i, name in enumerate(baby_names_f):
    crop_and_clean(female, (c3f[i][0], baby_y[0], c3f[i][1], baby_y[1]), name, f"{OUT}/female", bg_tolerance=55)
for i, name in enumerate(teen1_names_f):
    crop_and_clean(female, (c3f[i][0], teen1_y[0], c3f[i][1], teen1_y[1]), name, f"{OUT}/female", bg_tolerance=55)
for i, name in enumerate(teen2_names_f):
    crop_and_clean(female, (c3f[i][0], teen2_y[0], c3f[i][1], teen2_y[1]), name, f"{OUT}/female", bg_tolerance=55)
for i, name in enumerate(adult1_f):
    crop_and_clean(female, (c4f[i][0], a1_y[0], c4f[i][1], a1_y[1]), name, f"{OUT}/female", bg_tolerance=70)
for i, name in enumerate(adult2_f):
    crop_and_clean(female, (c4f[i][0], a2_y[0], c4f[i][1], a2_y[1]), name, f"{OUT}/female", bg_tolerance=70)
for i, name in enumerate(adult3_f):
    crop_and_clean(female, (c4f[i][0], a3_y[0], c4f[i][1], a3_y[1]), name, f"{OUT}/female", bg_tolerance=70)


# ── SANRIO catalog (3024×4634) ────────────────────────────────────────────────
print("\n=== Extracting SANRIO characters ===")
sanrio = Image.open(SANRIO_SRC).convert("RGBA")

# 캐릭터 섹션: y≈310-1350 (5좌 + 5우, 2행)
# 좌측 5: x=130-1510  우측 5: x=1510-3020
# 행1: y=310-900  행2: y=900-1350
sanrio_chars = [
    # 행1 좌측
    ("kitty_mametchi",     (130,  310,  560,  900)),
    ("little_pyueru",      (560,  310,  990,  900)),
    ("purin_patchi",       (990,  310, 1510,  900)),
    # 행1 우측
    ("cinnamon_milk",     (1510, 310, 1960,  900)),
    ("melody_pop",        (1960, 310, 2480,  900)),
    ("kuromi_gao",        (2480, 310, 3020,  900)),
    # 행2 좌측
    ("sam_wawatchi",       (130,  900,  680, 1350)),
    ("gudetama_karapa",    (680,  900, 1510, 1350)),
    # 행2 우측
    ("gorogoro_awamoko",  (1510, 900, 2250, 1350)),
    ("badtz_maru_tsuyomi",(2250, 900, 3020, 1350)),
]
for name, box in sanrio_chars:
    crop_and_clean(sanrio, box, name, f"{OUT}/sanrio", bg_tolerance=45)

# ── 리빙룸 ─────────────────────────────────────────────────────────────────
print("\n=== Extracting LIVING ROOMS ===")
# 상단 분석 결과: Livings 섹션은 우측 컬럼, y=2900-4250
# 상단 2개(Kitty+Pudding): y=2960-3600
# 하단 2개(Star+Thunder): y=3670-4220
# 우측 컬럼: x=1530-3020, 중간 x=2275

living_rooms = [
    ("kitty_living",   (1545, 2965, 2275, 3590)),
    ("pudding_living", (2275, 2965, 3010, 3590)),
    ("star_living",    (1545, 3670, 2275, 4220)),
    ("thunder_living", (2275, 3670, 3010, 4220)),
]
for name, box in living_rooms:
    crop_living(sanrio, box, name, f"{OUT}/living")

print(f"\n✅ Done! Sprites saved to {OUT}/")
print(f"   male/    : {len(baby_names_m)+len(teen1_names_m)+len(teen2_names_m)+len(adult1_m)+len(adult2_m)+len(adult3_m)} files")
print(f"   female/  : same")
print(f"   sanrio/  : {len(sanrio_chars)} files")
print(f"   living/  : {len(living_rooms)} files")
