"""
通义万象 API 生成像素风格游戏资产：完整大地图 + 6种可选无人机角色
模型: wan2.6-t2i (同步调用)
像素约束: 589,824 ~ 2,073,600 总像素
"""
import requests
import os
import sys
import json
import time

API_KEY = "sk-b49d84a88a534bc4b7147f14908a5653"
BASE_URL = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "sprites")

HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}",
}

# === 像素风格实验室大地图 (1440*1080 = 1,555,200px) ===
MAP_PROMPT = (
    "pixel art top-down view of a complete sci-fi underground laboratory map, "
    "16-bit retro game style, dark navy blue floor with subtle grid pattern, "
    "multiple interconnected rooms and corridors, "
    "glowing cyan neon tube lights along walls, "
    "containment pods with green liquid in corners, "
    "central large open arena area, "
    "scattered broken equipment and cables, "
    "warning stripe markings on floor in yellow and black, "
    "dark atmospheric shadows, purple ambient glow in corners, "
    "metallic wall panels with rivets, "
    "computer terminals with flickering screens, "
    "ventilation grates on floor, "
    "clean pixel art, crisp edges, no anti-aliasing, "
    "game level map for a survivor-like action game, "
    "dark background, blue and teal color scheme"
)

# === 6种像素风无人机角色 (1024*1024 = 1,048,576px) ===
CHARACTERS = [
    {
        "id": "drone_assault",
        "name": "突击型",
        "desc": "均衡战斗无人机，适合新手",
        "prompt": (
            "pixel art top-down view of a futuristic combat drone, "
            "circular shape, dark gunmetal gray body, bright cyan energy core at center, "
            "four thruster nozzles, blue LED ring around edge, "
            "16-bit retro game sprite, clean silhouette, "
            "isolated on pure black background, "
            "sharp pixel edges, no gradient, limited color palette"
        ),
    },
    {
        "id": "drone_stealth",
        "name": "暗影型",
        "desc": "高速低护甲，灵活机动",
        "prompt": (
            "pixel art top-down view of a stealth reconnaissance drone, "
            "triangular delta shape, matte black body with dark purple highlights, "
            "small dim red sensor eye at center, "
            "twin rear thrusters, sleek angular design, "
            "16-bit retro game sprite, clean silhouette, "
            "isolated on pure black background, "
            "sharp pixel edges, no gradient, limited color palette"
        ),
    },
    {
        "id": "drone_heavy",
        "name": "重装型",
        "desc": "高耐久低速度，近战专精",
        "prompt": (
            "pixel art top-down view of a heavy armored assault drone, "
            "large bulky square shape, dark olive and rust colored thick armor plates, "
            "orange molten energy core visible through armor gaps, "
            "four heavy duty thrusters, reinforced frame with visible bolts, "
            "16-bit retro game sprite, clean silhouette, "
            "isolated on pure black background, "
            "sharp pixel edges, no gradient, limited color palette"
        ),
    },
    {
        "id": "drone_speed",
        "name": "疾风型",
        "desc": "极致速度，玻璃大炮",
        "prompt": (
            "pixel art top-down view of a high-speed interceptor drone, "
            "streamlined teardrop shape, white and neon green highlights, "
            "bright green energy trail effect behind, "
            "twin boost engines, minimal armor lightweight frame, "
            "16-bit retro game sprite, clean silhouette, "
            "isolated on pure black background, "
            "sharp pixel edges, no gradient, limited color palette"
        ),
    },
    {
        "id": "drone_support",
        "name": "支援型",
        "desc": "经验加成，辅助成长",
        "prompt": (
            "pixel art top-down view of a medical support drone, "
            "hexagonal shape, white body with golden yellow cross marking on top, "
            "soft blue healing beam emitter at center, "
            "small stabilizing wings with yellow tips, "
            "16-bit retro game sprite, clean silhouette, "
            "isolated on pure black background, "
            "sharp pixel edges, no gradient, limited color palette"
        ),
    },
    {
        "id": "drone_elite",
        "name": "原型机",
        "desc": "上古科技遗物，全属性优异",
        "prompt": (
            "pixel art top-down view of an ancient alien-tech prototype drone, "
            "asymmetric crystalline shape, dark metallic body with glowing white-gold veins, "
            "floating crystal shards orbiting the main body, "
            "ethereal white energy core pulsing at center, "
            "ornate geometric pattern on hull, "
            "16-bit retro game sprite, clean silhouette, "
            "isolated on pure black background, "
            "sharp pixel edges, no gradient, limited color palette"
        ),
    },
]

TASKS = [
    {"filename": "map_pixel.png", "prompt": MAP_PROMPT, "size": "1440*1080"},
] + [
    {"filename": f"{c['id']}.png", "prompt": c["prompt"], "size": "1024*1024"}
    for c in CHARACTERS
]

CHAR_META = {c["id"]: {"name": c["name"], "desc": c["desc"]} for c in CHARACTERS}


def generate_image(prompt: str, filename: str, size: str) -> bool:
    print(f"\n{'='*60}")
    print(f"生成: {filename} ({size})")
    print(f"提示词: {prompt[:100]}...")

    data = {
        "model": "wan2.6-t2i",
        "input": {
            "messages": [{"role": "user", "content": [{"text": prompt}]}]
        },
        "parameters": {
            "prompt_extend": False,
            "watermark": False,
            "n": 1,
            "negative_prompt": (
                "blurry, distorted, text, watermark, logo, photorealistic, 3D render, "
                "low quality, grainy, ugly, asymmetrical, messy, gradient, smooth"
            ),
            "size": size,
        },
    }

    for attempt in range(3):
        try:
            resp = requests.post(BASE_URL, headers=HEADERS, json=data, timeout=120)
            result = resp.json()
        except Exception as e:
            print(f"  请求失败: {e}")
            if attempt < 2:
                time.sleep(5)
                continue
            return False

        # 限频 → 等待重试
        if "code" in result and result["code"] == "Throttling.RateQuota":
            wait = 10 + attempt * 5
            print(f"  限频，等待{wait}s重试...")
            time.sleep(wait)
            continue

        if "output" not in result:
            print(f"  API错误: {result.get('message', result)}")
            return False

        try:
            image_url = result["output"]["choices"][0]["message"]["content"][0]["image"]
        except (KeyError, IndexError):
            print(f"  解析失败: {json.dumps(result, ensure_ascii=False)[:200]}")
            return False

        print(f"  下载: {image_url[:60]}...")
        try:
            img_resp = requests.get(image_url, timeout=60)
            img_resp.raise_for_status()
        except Exception as e:
            print(f"  下载失败: {e}")
            return False

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        filepath = os.path.join(OUTPUT_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(img_resp.content)

        size_kb = len(img_resp.content) / 1024
        print(f"  OK: {filepath} ({size_kb:.1f}KB)")
        return True

    return False


def main():
    print("通义万象 · 像素风格资产生成")
    print(f"共 {len(TASKS)} 个任务 (1地图 + {len(CHARACTERS)}角色)")

    success = 0
    for i, task in enumerate(TASKS, 1):
        print(f"\n[{i}/{len(TASKS)}]", end="")
        if generate_image(task["prompt"], task["filename"], task["size"]):
            success += 1
        if i < len(TASKS):
            time.sleep(3)  # 避免触发限频

    # 保存角色元数据
    meta_path = os.path.join(OUTPUT_DIR, "characters.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(CHAR_META, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*60}")
    print(f"结果: {success}/{len(TASKS)} 成功")
    print(f"角色元数据: {meta_path}")


if __name__ == "__main__":
    main()
