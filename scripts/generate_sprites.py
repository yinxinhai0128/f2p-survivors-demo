#!/usr/bin/env python3
"""
AI Sprite Generator for f2p-survivors-game
主题：AI失控实验室（赛博朋克科幻风格）
使用 阿里云通义万相 (DashScope) 生成游戏精灵图，Pillow 缩放至目标尺寸。

用法:
  1. 开通阿里云百炼: https://bailian.console.aliyun.com
  2. 获取 API Key: 百炼控制台 -> API Key 管理
  3. 设置环境变量: set DASHSCOPE_API_KEY=sk-...
  4. 运行: python scripts/generate_sprites.py
  5. 生成的精灵图在 public/assets/sprites/ 下
  6. manifest.json 同时生成，供游戏代码读取

成本: wanx2.1-t2i-turbo 0.14元/张, 每次生成4张, 16次调用共64张约8.96元
免费额度: 新用户送50张, 超出14张约1.96元
"""

import os
import sys
import json
import time
from io import BytesIO
from pathlib import Path

import requests
from dashscope import ImageSynthesis
from PIL import Image

# --- 配置 ---
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = PROJECT_ROOT / "public" / "assets" / "sprites"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"

# ============================================================
# 精灵图定义 —— 基于AI失控实验室主题
# 统一艺术方向：俯视视角、赛博朋克、霓虹点缀、深色背景
# ============================================================

STYLE_PREFIX = (
    "top-down view 2D game sprite asset, cyberpunk sci-fi style, "
    "dark background with neon glow accents, clean digital illustration, "
    "isolated subject centered in frame, sharp silhouette, "
    "suitable for a mobile action game"
)

SPRITES = [
    # ======== 玩家 ========
    {
        "name": "player",
        "size": 64,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A small hovering combat drone with a glowing cyan-blue visor and circular energy shield. "
            "White and teal mechanical body with subtle circuit patterns. "
            "The drone looks like advanced laboratory security equipment. "
            "The energy shield is a thin bright cyan ring around the drone. "
            "Clean mechanical design, slightly menacing but heroic."
        )
    },
    # ======== 普通敌人：被腐蚀的测试机器人 ========
    {
        "name": "enemy",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A small corrupted robot with a boxy red body and two glowing white eyes. "
            "The robot has jagged damaged edges and sparks coming off its frame. "
            "Red and dark crimson colors, with a malevolent expression from its eyes. "
            "It looks like a laboratory test bot that has been overtaken by rogue AI code. "
            "Simple geometric shape but with detailed damage and corruption marks."
        )
    },
    # ======== 快速敌人：失控数据碎片 ========
    {
        "name": "enemy_fast",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A sharp floating orange crystalline data shard, triangular and aggressive in shape. "
            "Bright orange and amber colors with glowing edges. "
            "The shard looks like a fragment of corrupted data given physical form. "
            "Jagged crystalline structure with digital artifact lines running through it. "
            "It should look fast and dangerous, like broken reality fragments."
        )
    },
    # ======== 坦克敌人：防火墙装甲块 ========
    {
        "name": "enemy_tank",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A heavy armored security drone, blocky and imposing. "
            "Dark red body with gold warning stripe markings and thick metallic plating. "
            "It looks like a walking firewall, bulky and slow but very tough. "
            "Industrial design with reinforced corners and a central red warning light. "
            "More mechanical and solid than the other enemies."
        )
    },
    # ======== 精英敌人：不稳定神经网络 ========
    {
        "name": "enemy_elite",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A floating purple sphere of interconnected neural nodes, pulsing with energy. "
            "Deep purple and violet colors with white neural connection lines between nodes. "
            "It resembles an unstable AI neural cluster, with a bright white core. "
            "Multiple smaller orbs connected by crackling energy tendrils. "
            "Organic yet digital, like a mini brain made of corrupted code."
        )
    },
    # ======== BOSS 1：数字恶魔（腐化主机） ========
    {
        "name": "boss_demon",
        "size": 512,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A massive demonic entity made of corrupted data and red energy. "
            "Dark crimson and black body with two large horns made of jagged code fragments. "
            "Glowing yellow eyes and a fierce mouth with sharp digital teeth. "
            "Spikes protruding from its circular body, surrounded by a faint orange-red aura. "
            "It should look like the mainframe AI has manifested as a digital demon. "
            "Imposing boss creature, much larger and more detailed than regular enemies."
        )
    },
    # ======== BOSS 2：监察巨眼（监控AI） ========
    {
        "name": "boss_eye",
        "size": 512,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A giant floating purple eye surrounded by writhing mechanical tentacles. "
            "The central eye has a deep violet iris and a bright white pupil with digital crosshairs. "
            "Six tentacles extend outward, each tipped with a small camera lens. "
            "Purple and dark blue colors with cable-like veins running through the eye. "
            "It represents the all-seeing surveillance AI of the laboratory. "
            "Creepy and imposing, like a living security camera system."
        )
    },
    # ======== BOSS 3：终结死神（清除协议AI） ========
    {
        "name": "boss_reaper",
        "size": 512,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A dark mechanical skull-like entity with cold glowing cyan-blue eyes. "
            "Bone-white metallic faceplate with exposed dark circuitry underneath. "
            "The skull has mechanical jaw with rows of small metal teeth. "
            "Dark metallic body with sharp angular shoulder plates. "
            "It looks like the laboratory's termination protocol given physical form. "
            "Cold, precise, and deathly — the most feared of the rogue AI constructs."
        )
    },
    # ======== 武器：无人机 ========
    {
        "name": "weapon_drone",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A small companion combat drone, compact and agile. "
            "Cyan and teal colored with two small thruster nozzles at the sides. "
            "It has a small targeting sensor on the front glowing bright blue. "
            "Clean rounded design, looks like a mini version of the player drone. "
            "Friendly but armed, like a loyal support unit."
        )
    },
    # ======== 武器：旋转利刃 ========
    {
        "name": "weapon_blade",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A sharp crescent-shaped energy blade with a bright blue-white cutting edge. "
            "The blade is made of pure cyan energy with a metallic core. "
            "It looks like it spins rapidly around its center point. "
            "Clean futuristic weapon design, glowing and dangerous."
        )
    },
    # ======== 武器：燃烧瓶 ========
    {
        "name": "weapon_molotov",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A glass bottle filled with bright orange glowing liquid, with a rag at the top. "
            "The bottle has a greenish tint and the liquid inside glows like molten fire. "
            "A small flame flickers at the top of the rag. "
            "Makeshift laboratory weapon, repurposed chemical container."
        )
    },
    # ======== 武器：导弹 ========
    {
        "name": "weapon_missile",
        "size": 48,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A small guided missile with a pointed warhead and an orange thruster flame at the back. "
            "Silver-gray metallic body with cyan guidance fins. "
            "The thruster flame is bright orange and yellow. "
            "Compact military-grade projectile, sleek and deadly."
        )
    },
    # ======== 武器：轨道激光卫星 ========
    {
        "name": "weapon_laser_sat",
        "size": 64,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A small orbital weapons satellite with two solar panel wings. "
            "The central body has a glowing cyan laser emitter pointing downward. "
            "Dark metallic body with gold accent rings and a targeting sensor dome. "
            "It hovers in place, ready to fire a powerful beam downward. "
            "Clean aerospace design, like a mini death star."
        )
    },
    # ======== 掉落物：磁铁 ========
    {
        "name": "loot_magnet",
        "size": 32,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A U-shaped horseshoe magnet with one red pole and one blue pole. "
            "Metallic gray body with bright red (north) and bright blue (south) ends. "
            "Small electromagnetic arcs between the two poles. "
            "Simple iconic design, clearly recognizable as a magnet."
        )
    },
    # ======== 掉落物：血瓶 ========
    {
        "name": "loot_health",
        "size": 32,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A small medical glass vial with bright red liquid inside and a cork stopper. "
            "The glass is slightly transparent showing the red healing liquid at two-thirds full. "
            "A subtle glass shine reflection on the side. "
            "Clean medical design, looks like an emergency health stimulant from a lab medkit."
        )
    },
    # ======== 掉落物：金币（计算信用芯片） ========
    {
        "name": "loot_gold",
        "size": 32,
        "prompt": (
            f"{STYLE_PREFIX}. "
            "A golden compute credit chip with circuit board patterns etched on its surface. "
            "Hexagonal shape with gold border and dark center with tiny gold circuit traces. "
            "It glows faintly with golden light. "
            "Looks like valuable data currency used in the laboratory's systems."
        )
    },
]

# 以下保持程序化生成（太小或不值得用AI）:
# - bullet (10px 青色数据脉冲)
# - xp (8px 绿色经验碎片)


def generate_sprite(sprite_def):
    """使用通义万相生成单张精灵图并缩放"""
    name = sprite_def["name"]
    target_size = sprite_def["size"]
    output_path = OUTPUT_DIR / f"{name}.png"

    if output_path.exists():
        print(f"  [跳过] {name}.png 已存在")
        return True

    print(f"  生成中...", end=" ", flush=True)

    try:
        # 调用通义万相文生图 (每次生成4张，只取第1张)
        response = ImageSynthesis.call(
            model="wanx2.1-t2i-turbo",
            prompt=sprite_def["prompt"],
            extra_input={"size": "1024*1024"},
        )

        if response.status_code != 200:
            print(f"[失败] API错误: {response.code}")
            return False

        out = response.output

        # 如果是异步任务，等待完成
        if out.task_status in ("PENDING", "RUNNING"):
            result = ImageSynthesis.wait(response)
            out = result.output

        if out.task_status != "SUCCEEDED":
            print(f"[失败] 任务状态: {out.task_status}")
            return False

        # 取第一张结果
        r = out.results[0]
        image_url = r["url"] if isinstance(r, dict) else r.url

        # 下载图片
        img_response = requests.get(image_url, timeout=30)
        img_response.raise_for_status()
        img = Image.open(BytesIO(img_response.content))

        # 缩放到目标尺寸
        img = img.resize((target_size, target_size), Image.LANCZOS)

        # 保存
        img.save(output_path, "PNG", optimize=True)
        file_size = output_path.stat().st_size
        print(f"[OK] {name}.png ({target_size}x{target_size}, {file_size:,} bytes)")
        return True

    except Exception as e:
        print(f"[失败] {name}: {e}")
        return False


def main():
    api_key = os.environ.get("DASHSCOPE_API_KEY")
    if not api_key:
        print("错误: 未设置 DASHSCOPE_API_KEY 环境变量")
        print()
        print("获取 API Key 步骤:")
        print("  1. 打开 https://bailian.console.aliyun.com")
        print("  2. 开通阿里云百炼服务（免费）")
        print("  3. 进入 API Key 管理，创建 API Key")
        print("  4. 运行: set DASHSCOPE_API_KEY=sk-... && python scripts/generate_sprites.py")
        print()
        print("新用户赠送50张免费额度，足够生成全部精灵图。")
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("AI 失控实验室 — 精灵图生成器 (通义万相)")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"精灵数量: {len(SPRITES)}")
    print(f"预估成本: ~{len(SPRITES) * 0.56:.2f}元 (每次4张x16次, 新用户50张免费额度)")
    print("=" * 60)
    print()

    generated = []
    failed = []

    for i, sprite in enumerate(SPRITES):
        name = sprite["name"]
        size = sprite["size"]
        print(f"[{i+1}/{len(SPRITES)}] {name} ({size}x{size})", end=" ")
        if generate_sprite(sprite):
            generated.append(name)
        else:
            failed.append(name)
        # API 限速保护
        if i < len(SPRITES) - 1:
            time.sleep(1.0)

    # 写入 manifest
    manifest = {"sprites": generated}
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print()
    print("=" * 60)
    print(f"完成! 成功: {len(generated)}/{len(SPRITES)}")
    if failed:
        print(f"失败: {', '.join(failed)}")
        print("重新运行脚本可重试失败的精灵图（已成功的会自动跳过）")
    print(f"清单文件: {MANIFEST_PATH}")
    print("=" * 60)


if __name__ == "__main__":
    main()
