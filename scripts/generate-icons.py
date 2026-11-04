#!/usr/bin/env python3
import os
import math
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
PUB = os.path.join(ROOT, "public")

os.makedirs(PUB, exist_ok=True)

MIPMAPS = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

def draw_lottery_ticket(size=512, mode="full"):
    # 4x supersampling for high-fidelity antialiasing
    scale = 4
    W = size * scale
    H = size * scale

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background
    if mode in ("full", "round"):
        # Rich deep red gradient #e52d27 to #8c0000
        for y in range(H):
            ratio = y / H
            r = int(229 * (1 - ratio) + 140 * ratio)
            g = int(45 * (1 - ratio) + 0 * ratio)
            b = int(39 * (1 - ratio) + 0 * ratio)
            draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

        if mode == "round":
            mask = Image.new("L", (W, H), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.ellipse([0, 0, W, H], fill=255)
            img.putalpha(mask)
        elif mode == "full":
            radius = int(W * 0.22)
            mask = Image.new("L", (W, H), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.rounded_rectangle([0, 0, W, H], radius=radius, fill=255)
            img.putalpha(mask)

    # Ticket Layer
    ticket_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(ticket_layer)

    if mode == "foreground":
        tw = int(W * 0.58)
        th = int(H * 0.40)
    else:
        tw = int(W * 0.74)
        th = int(H * 0.52)

    tx0 = (W - tw) // 2
    ty0 = (H - th) // 2
    tx1 = tx0 + tw
    ty1 = ty0 + th

    # White / Ivory ticket background
    corner_r = int(tw * 0.08)
    border_w = max(2, int(3 * scale))
    tdraw.rounded_rectangle([tx0, ty0, tx1, ty1], radius=corner_r, fill=(255, 254, 248, 255), outline=(255, 214, 102, 255), width=border_w)

    # Gold header ribbon
    gold_h = int(th * 0.26)
    tdraw.rectangle([tx0 + border_w, ty0 + border_w, tx1 - border_w, ty0 + gold_h], fill=(212, 136, 6, 255))

    # Divider notch coordinates
    div_x = tx0 + int(tw * 0.64)

    # Circular perforated notches on sides
    notch_r = int(th * 0.14)
    notch_cy1 = ty0 + int(th * 0.45)
    notch_cy2 = ty0 + int(th * 0.75)
    for cy in [notch_cy1, notch_cy2]:
        tdraw.ellipse([tx0 - notch_r, cy - notch_r, tx0 + notch_r, cy + notch_r], fill=(0, 0, 0, 0))
        tdraw.ellipse([tx1 - notch_r, cy - notch_r, tx1 + notch_r, cy + notch_r], fill=(0, 0, 0, 0))

    # Dashed divider line
    dash_h = int(6 * scale)
    curr_y = ty0 + gold_h + int(8 * scale)
    while curr_y < ty1 - int(8 * scale):
        tdraw.line([(div_x, curr_y), (div_x, min(curr_y + dash_h, ty1 - int(8 * scale)))], fill=(212, 136, 6, 220), width=max(1, int(2 * scale)))
        curr_y += dash_h * 2

    # Lucky red badge circle on ticket left
    badge_cx = (tx0 + div_x) // 2
    badge_cy = (ty0 + gold_h + ty1) // 2
    badge_r = int(th * 0.22)
    tdraw.ellipse([badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r], fill=(255, 241, 240, 255), outline=(255, 77, 79, 255), width=max(1, int(2 * scale)))

    # Gold 5-point star inside lucky badge
    star_points = []
    outer_r = int(badge_r * 0.72)
    inner_r = int(badge_r * 0.35)
    for i in range(10):
        angle = -math.pi / 2 + i * (math.pi / 5)
        r = outer_r if i % 2 == 0 else inner_r
        star_points.append((badge_cx + r * math.cos(angle), badge_cy + r * math.sin(angle)))
    tdraw.polygon(star_points, fill=(207, 19, 34, 255))

    # Right stub decorative bars (safe bounds check)
    bar_x0 = div_x + int(8 * scale)
    bar_x1 = max(bar_x0 + 2, tx1 - int(8 * scale))
    bar_y0 = ty0 + gold_h + int(8 * scale)
    bar_h = max(2, int(th * 0.10))
    if bar_x1 > bar_x0:
        tdraw.rectangle([bar_x0, bar_y0, bar_x1, bar_y0 + bar_h], fill=(207, 19, 34, 255))
        tdraw.rectangle([bar_x0, bar_y0 + bar_h + int(4*scale), bar_x1, bar_y0 + bar_h * 2 + int(4*scale)], fill=(212, 136, 6, 255))

    # Merge ticket layer over background
    img.alpha_composite(ticket_layer)

    # Downsample cleanly with Lanczos
    return img.resize((size, size), Image.Resampling.LANCZOS)

print("Generating Android mipmap icons and web favicons...")

# 1. Android Mipmaps
for folder, (l_size, fg_size) in MIPMAPS.items():
    dir_path = os.path.join(RES, folder)
    os.makedirs(dir_path, exist_ok=True)

    # ic_launcher.png
    ic_l = draw_lottery_ticket(l_size, mode="full")
    ic_l.save(os.path.join(dir_path, "ic_launcher.png"), "PNG")

    # ic_launcher_round.png
    ic_r = draw_lottery_ticket(l_size, mode="round")
    ic_r.save(os.path.join(dir_path, "ic_launcher_round.png"), "PNG")

    # ic_launcher_foreground.png
    ic_fg = draw_lottery_ticket(fg_size, mode="foreground")
    ic_fg.save(os.path.join(dir_path, "ic_launcher_foreground.png"), "PNG")
    print(f"  ✓ {folder}: launcher {l_size}x{l_size}, foreground {fg_size}x{fg_size}")

# 2. Web Assets (public/)
icon_512 = draw_lottery_ticket(512, mode="full")
icon_512.save(os.path.join(PUB, "icon.png"), "PNG")

icon_192 = draw_lottery_ticket(192, mode="full")
icon_192.save(os.path.join(PUB, "icon-192.png"), "PNG")

# favicon.ico
fav = draw_lottery_ticket(48, mode="full")
fav.save(os.path.join(PUB, "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print("  ✓ public/icon.png, public/icon-192.png, public/favicon.ico")

print("Done generating all launcher and web icons successfully!")
