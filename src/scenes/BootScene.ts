import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // 加载进度条
    const w = this.scale.width;
    const h = this.scale.height;

    const logo = this.add.text(w / 2, h / 2 - 60, 'AI 失控实验室', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '28px', color: '#67e8f9'
    }).setOrigin(0.5);

    const sub = this.add.text(w / 2, h / 2 - 20, '正在初始化实验环境...', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '14px', color: '#94a3b8'
    }).setOrigin(0.5);

    const barBg = this.add.rectangle(w / 2, h / 2 + 30, 320, 14, 0x0f1a2e)
      .setStrokeStyle(1, 0x22d3ee, 0.4);
    const bar = this.add.rectangle(w / 2 - 158, h / 2 + 30, 0, 10, 0x22d3ee);

    this.load.on('progress', (v: number) => {
      bar.setSize(316 * v, 10);
      bar.setX(w / 2 - 158 + (316 * v) / 2);
    });

    // 加载精灵图
    const SPRITE_NAMES = [
      'player',
      'boss_demon', 'boss_eye', 'boss_reaper',
      'weapon_drone', 'weapon_blade', 'weapon_molotov', 'weapon_missile', 'weapon_laser_sat',
      'loot_magnet', 'loot_health', 'loot_gold',
      'floor_ai', 'player_ai', 'map_pixel', 'lab-map-pixel',
      'drone_assault', 'drone_stealth', 'drone_heavy',
      'drone_speed', 'drone_support', 'drone_elite'
    ];
    for (const name of SPRITE_NAMES) {
      this.load.image(name, `assets/sprites/${name}.png`);
    }
    // 敌人精灵图
    this.load.image('enemy', 'assets/sprites/enemy1.png');
    this.load.image('enemy_fast', 'assets/sprites/enemy2.png');
    this.load.image('enemy_tank', 'assets/sprites/enemy3.png');
    this.load.image('enemy_elite', 'assets/sprites/enemy4.png');

    this.load.on('complete', () => {
      logo.destroy();
      sub.destroy();
      barBg.destroy();
      bar.destroy();
    });
  }

  create() {
    // 生成始终需要的程序化纹理
    this.generateEssentialTextures();
    this.scene.start('TitleScene');
  }

  private generateEssentialTextures() {
    const g = this.add.graphics();

    // bullet: 青色数据脉冲
    if (!this.textures.exists('bullet')) {
      g.fillStyle(0x67e8f9, 0.9);
      g.fillCircle(5, 5, 4.5);
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(5, 5, 2);
      g.generateTexture('bullet', 10, 10);
      g.clear();
    }

    // xp: 绿色经验碎片
    if (!this.textures.exists('xp')) {
      g.fillStyle(0x4ade80);
      g.fillCircle(4, 4, 3.5);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(4, 4, 1.5);
      g.generateTexture('xp', 8, 8);
      g.clear();
    }

    // particle_glow: 粒子光点
    if (!this.textures.exists('particle_glow')) {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture('particle_glow', 8, 8);
      g.clear();
    }

    g.destroy();
  }
}
