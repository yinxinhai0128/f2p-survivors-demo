#!/usr/bin/env python3
"""
精灵图背景处理：将AI生成的暗色背景转为透明
- 自动检测边缘背景色
- 将接近背景色的像素转为透明
- 添加微弱的发光边缘（可选）
"""

import os
from pathlib import Path
from PIL import Image
import numpy as np

SPRITES_DIR = Path("D:/f2p-survivors-game/public/assets/sprites")
SPRITES = [
    "player", "enemy", "enemy_fast", "enemy_tank", "enemy_elite",
    "boss_demon", "boss_eye", "boss_reaper",
    "weapon_drone", "weapon_blade", "weapon_molotov", "weapon_missile", "weapon_laser_sat",
    "loot_magnet", "loot_health", "loot_gold"
]

DARK_THRESHOLD = 60  # RGB各通道低于此值的像素被视为"暗色背景"


def process_sprite(name: str, threshold: int = DARK_THRESHOLD):
    """将精灵图的暗色背景转为透明"""
    input_path = SPRITES_DIR / f"{name}.png"
    backup_path = SPRITES_DIR / f"{name}_orig.png"
    output_path = SPRITES_DIR / f"{name}.png"

    if not input_path.exists():
        print(f"  [跳过] {name}.png 不存在")
        return False

    img = Image.open(input_path).convert("RGBA")
    pixels = np.array(img)

    # 检测四角区域的平均背景色
    corners = [
        pixels[0:4, 0:4],           # 左上
        pixels[0:4, -4:],           # 右上
        pixels[-4:, 0:4],           # 左下
        pixels[-4:, -4:],           # 右下
    ]
    bg_colors = [c[:, :, :3].mean(axis=(0, 1)) for c in corners]
    bg_color = np.mean(bg_colors, axis=0)  # 平均背景色

    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    a = pixels[:, :, 3].copy()

    # 计算每个像素与背景色的距离
    dist = np.sqrt((r - bg_color[0])**2 + (g - bg_color[1])**2 + (b - bg_color[2])**2)

    # 接近背景色的像素 → 透明
    bg_mask = dist < 45
    a[bg_mask] = 0

    # 过度区域半透明（抗锯齿效果）
    edge_mask = (dist >= 45) & (dist < 75)
    edge_factor = (dist[edge_mask] - 45) / 30.0
    a[edge_mask] = (a[edge_mask] * edge_factor).astype(np.uint8)

    pixels[:, :, 3] = a

    # 备份原图，保存处理后的图片
    if not backup_path.exists():
        img.save(backup_path, "PNG")

    result = Image.fromarray(pixels, "RGBA")
    result.save(output_path, "PNG", optimize=True)

    transparent_pct = (a == 0).sum() / a.size * 100
    size_kb = output_path.stat().st_size / 1024
    print(f"  [OK] {name}.png → {transparent_pct:.0f}%透明, {size_kb:.1f}KB")
    return True


def main():
    print("精灵图去暗底处理")
    print(f"阈值: RGB各通道 < {DARK_THRESHOLD}, 色差 < 45")
    print()

    ok = 0
    for sprite in SPRITES:
        print(f"  {sprite}...", end=" ")
        if process_sprite(sprite):
            ok += 1

    print()
    print(f"完成: {ok}/{len(SPRITES)} 张处理成功")
    print("原始文件备份为 *_orig.png")


if __name__ == "__main__":
    main()
