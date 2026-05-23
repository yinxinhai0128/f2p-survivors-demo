import Phaser from 'phaser';

type SkillId = 'attackSpeed' | 'bulletCount' | 'damage' | 'moveSpeed' | 'heal' | 'orbit' | 'aura';
type LootType = 'xp' | 'magnet' | 'health' | 'gold';

type SkillOption = {
  id: SkillId;
  title: string;
  description: string;
};

type RuntimeStats = {
  maxHp: number;
  hp: number;
  moveSpeed: number;
  attackInterval: number;
  bulletCount: number;
  bulletDamage: number;
  pickupRadius: number;
};

type EnemyVariant = 'normal' | 'fast' | 'tank' | 'elite' | 'boss';

interface EnemyConfig {
  hpMul: number;
  speedMul: number;
  damageMul: number;
  tex: string;
}

const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 3000;
const GAME_DURATION_MS = 180_000;
const PLAYER_RADIUS = 18;
const ENEMY_SIZE = 30;
const BOSS_SIZE = 64;
const XP_RADIUS = 3;
const LOOT_RADIUS = 10;
const START_ATTACK_INTERVAL = 900;
const MIN_ATTACK_INTERVAL = 200;
const ATTACK_RANGE = 350;
const BOSS_INTERVAL_MS = 55_000;
const VERSION = 'mvp-v2';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private xpOrbs!: Phaser.Physics.Arcade.Group;
  private lootDrops!: Phaser.Physics.Arcade.Group;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  private hud!: {
    hp: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    xp: Phaser.GameObjects.Text;
    time: Phaser.GameObjects.Text;
    stats: Phaser.GameObjects.Text;
    gold: Phaser.GameObjects.Text;
    message: Phaser.GameObjects.Text;
    bossHp: Phaser.GameObjects.Text;
    bossBar: Phaser.GameObjects.Rectangle;
    bossBarBg: Phaser.GameObjects.Rectangle;
  };

  private overlayElements: Phaser.GameObjects.GameObject[] = [];
  private commercialButtons: Phaser.GameObjects.GameObject[] = [];

  private stats!: RuntimeStats;
  private level = 1;
  private xp = 0;
  private xpToNext = 12;
  private elapsedMs = 0;
  private spawnElapsed = 0;
  private bossElapsed = 0;
  private bossAttackElapsed = 0;
  private bossAttackCooldown = 4000;
  private bossCasting = false;
  private bossLaserPhase: 'idle' | 'telegraph' | 'beam' = 'idle';
  private bossLaserAngle = 0;
  private bossLaserObjs: Phaser.GameObjects.GameObject[] = [];
  private bossBullets!: Phaser.Physics.Arcade.Group;
  // Skill evolution flags (level 5 quality change)
  private piercingBullets = false;
  private critChance = 0;
  private critMultiplier = 1;
  private fireTrail = false;
  private fireTrailElapsed = 0;
  private hpRegen = 0;
  private hpRegenElapsed = 0;
  private orbitCount = 1;
  private auraSlow = false;
  private attackElapsed = START_ATTACK_INTERVAL;
  private contactDamageElapsed = 0;
  private orbitElapsed = 0;
  private auraElapsed = 0;
  private kills = 0;
  private shots = 0;
  private gold = 0;
  private orbitLevel = 0;
  private auraLevel = 0;
  private doubleXp = false;
  private reviveUsed = false;
  private choosingSkill = false;
  private gameOver = false;
  private bossActive = false;
  private skillLevels: Record<SkillId, number> = {
    attackSpeed: 0, bulletCount: 0, damage: 0, moveSpeed: 0, heal: 0, orbit: 0, aura: 0
  };

  constructor() {
    super('GameScene');
  }

  create() {
    this.resetRun();
    this.createTextures();
    this.createWorld();
    this.createHud();
    this.createCommercialMock();
    this.updateHud();
  }

  update(_time: number, delta: number) {
    if (this.gameOver || this.choosingSkill) {
      return;
    }

    this.elapsedMs += delta;
    this.spawnElapsed += delta;
    this.bossElapsed += delta;
    if (this.bossActive) this.bossAttackElapsed += delta;
    this.attackElapsed += delta;
    this.contactDamageElapsed += delta;
    this.orbitElapsed += delta;
    this.auraElapsed += delta;

    this.movePlayer();
    this.spawnEnemiesWhenReady();
    this.updateBossSpawn();
    this.updateBossAttack();
    this.updateBossBullets(delta);
    this.updateEnemies();
    this.updateAutoAttack();
    this.updateSpecialWeapons();
    this.updateFireTrail(delta);
    this.updateHpRegen(delta);
    this.updateAuraSlow();
    this.updateXpCollection();
    this.updateLootCollection();
    this.cleanupBullets(delta);
    this.updateHud();

    if (this.elapsedMs >= GAME_DURATION_MS) {
      this.endGame(true);
    }
  }

  private resetRun() {
    this.stats = {
      maxHp: 100, hp: 100, moveSpeed: 220,
      attackInterval: START_ATTACK_INTERVAL, bulletCount: 1,
      bulletDamage: 22, pickupRadius: 38
    };
    this.level = 1;
    this.xp = 0;
    this.xpToNext = 12;
    this.gold = 0;
    this.elapsedMs = 0;
    this.spawnElapsed = 0;
    this.bossElapsed = 0;
    this.bossAttackElapsed = 0;
    this.bossAttackCooldown = 4000;
    this.bossCasting = false;
    this.bossLaserPhase = 'idle';
    this.bossLaserObjs.forEach((o) => o.destroy());
    this.bossLaserObjs = [];
    this.piercingBullets = false;
    this.critChance = 0;
    this.critMultiplier = 1;
    this.fireTrail = false;
    this.fireTrailElapsed = 0;
    this.hpRegen = 0;
    this.hpRegenElapsed = 0;
    this.orbitCount = 1;
    this.auraSlow = false;
    this.attackElapsed = START_ATTACK_INTERVAL;
    this.contactDamageElapsed = 0;
    this.orbitElapsed = 0;
    this.auraElapsed = 0;
    this.kills = 0;
    this.shots = 0;
    this.orbitLevel = 0;
    this.auraLevel = 0;
    this.doubleXp = false;
    this.reviveUsed = false;
    this.choosingSkill = false;
    this.gameOver = false;
    this.bossActive = false;
    this.skillLevels = {
      attackSpeed: 0, bulletCount: 0, damage: 0, moveSpeed: 0, heal: 0, orbit: 0, aura: 0
    };
    this.clearOverlay();
  }

  /* ========== TEXTURES ========== */

  private createTextures() {
    const g = this.add.graphics();

    // Player: blue circle with glow ring + highlight arc
    g.fillStyle(0x1a6b9e);
    g.fillCircle(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS);
    g.fillStyle(0x4fc3f7);
    g.fillCircle(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS - 3);
    g.fillStyle(0xb3e5fc);
    g.fillCircle(PLAYER_RADIUS - 4, PLAYER_RADIUS - 4, 6);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeCircle(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS);
    g.generateTexture('player', PLAYER_RADIUS * 2, PLAYER_RADIUS * 2);
    g.clear();

    // Normal enemy: red square with dark border
    g.fillStyle(0xef5350);
    g.fillRect(0, 0, ENEMY_SIZE, ENEMY_SIZE);
    g.lineStyle(2, 0xb71c1c, 0.95);
    g.strokeRect(1, 1, ENEMY_SIZE - 2, ENEMY_SIZE - 2);
    // eyes
    g.fillStyle(0xffffff);
    g.fillCircle(10, 10, 3);
    g.fillCircle(20, 10, 3);
    g.fillStyle(0x000000);
    g.fillCircle(10, 10, 1.5);
    g.fillCircle(20, 10, 1.5);
    g.generateTexture('enemy', ENEMY_SIZE, ENEMY_SIZE);
    g.clear();

    // Fast enemy: orange upward triangle (arrow shape = speed)
    g.fillStyle(0xff9800);
    g.fillTriangle(15, 2, 2, 28, 28, 28);
    g.lineStyle(2, 0xffcc80, 0.9);
    g.strokeTriangle(15, 2, 2, 28, 28, 28);
    g.fillStyle(0xffffff);
    g.fillCircle(13, 18, 3);
    g.fillCircle(19, 18, 3);
    g.fillStyle(0x000000);
    g.fillCircle(13, 18, 1.5);
    g.fillCircle(19, 18, 1.5);
    g.generateTexture('enemy_fast', ENEMY_SIZE, ENEMY_SIZE);
    g.clear();

    // Tank enemy: dark red larger square with thick gold border
    g.fillStyle(0x8b0000);
    g.fillRect(0, 0, 34, 34);
    g.fillStyle(0xb71c1c);
    g.fillRect(3, 3, 28, 28);
    g.lineStyle(3, 0xffd700, 0.9);
    g.strokeRect(1, 1, 32, 32);
    g.fillStyle(0xffffff);
    g.fillCircle(11, 13, 4);
    g.fillCircle(23, 13, 4);
    g.fillStyle(0x000000);
    g.fillCircle(11, 13, 2);
    g.fillCircle(23, 13, 2);
    g.generateTexture('enemy_tank', 34, 34);
    g.clear();

    // Elite enemy: purple with white border, slightly larger
    g.fillStyle(0x7c4dff);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0xb388ff);
    g.fillRect(3, 3, 26, 26);
    g.lineStyle(2, 0xffffff, 0.95);
    g.strokeRect(1, 1, 30, 30);
    g.fillStyle(0xffffff);
    g.fillCircle(10, 11, 3.5);
    g.fillCircle(22, 11, 3.5);
    g.fillStyle(0x000000);
    g.fillCircle(10, 11, 2);
    g.fillCircle(22, 11, 2);
    g.generateTexture('enemy_elite', 32, 32);
    g.clear();

    // Boss 1: Demon (red, horned, spiky)
    const bR = BOSS_SIZE / 2;
    g.fillStyle(0x8b0000);
    g.fillCircle(bR, bR, bR - 2);
    g.fillStyle(0xd50000);
    g.fillCircle(bR, bR + 2, bR - 8);
    // Horns
    g.fillStyle(0x3e2723);
    g.fillTriangle(bR - 12, bR - 10, bR - 18, bR - 28, bR - 4, bR - 14);
    g.fillTriangle(bR + 12, bR - 10, bR + 18, bR - 28, bR + 4, bR - 14);
    // Spikes around body
    g.fillStyle(0xff1744);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const sx = bR + Math.cos(a) * (bR - 6);
      const sy = bR + Math.sin(a) * (bR - 6);
      g.fillTriangle(sx, sy, sx + Math.cos(a - 0.3) * 14, sy + Math.sin(a - 0.3) * 14, sx + Math.cos(a + 0.3) * 14, sy + Math.sin(a + 0.3) * 14);
    }
    // Eyes
    g.fillStyle(0xffeb3b);
    g.fillCircle(bR - 8, bR - 2, 6);
    g.fillCircle(bR + 8, bR - 2, 6);
    g.fillStyle(0x000000);
    g.fillCircle(bR - 8, bR - 2, 3);
    g.fillCircle(bR + 8, bR - 2, 3);
    // Mouth
    g.fillStyle(0x000000);
    g.fillTriangle(bR - 6, bR + 10, bR + 6, bR + 10, bR, bR + 20);
    g.lineStyle(2, 0xff6f00, 0.8);
    g.strokeCircle(bR, bR, bR - 2);
    g.generateTexture('boss_demon', BOSS_SIZE, BOSS_SIZE);
    g.clear();

    // Boss 2: Giant Eye (purple, tentacles)
    g.fillStyle(0x311b92);
    g.fillCircle(bR, bR, bR - 2);
    g.fillStyle(0x4a148c);
    g.fillCircle(bR, bR, bR - 8);
    // Tentacles (6 small arcs around)
    g.fillStyle(0x7c4dff);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tx = bR + Math.cos(a) * (bR - 8);
      const ty = bR + Math.sin(a) * (bR - 8);
      g.fillCircle(tx, ty, 6);
    }
    // Eye white
    g.fillStyle(0xffffff);
    g.fillCircle(bR, bR, 17);
    // Iris
    g.fillStyle(0x7c4dff);
    g.fillCircle(bR, bR, 11);
    // Pupil
    g.fillStyle(0x000000);
    g.fillCircle(bR, bR, 6);
    // Pupil highlight
    g.fillStyle(0xffffff);
    g.fillCircle(bR + 3, bR - 3, 3);
    // Veins
    g.lineStyle(1.5, 0xb388ff, 0.6);
    g.strokeCircle(bR, bR, bR - 1);
    g.generateTexture('boss_eye', BOSS_SIZE, BOSS_SIZE);
    g.clear();

    // Boss 3: Reaper (dark, skull-like, bone white)
    g.fillStyle(0x1a1a2e);
    g.fillCircle(bR, bR, bR - 2);
    g.fillStyle(0x263238);
    g.fillCircle(bR, bR + 1, bR - 6);
    // Skull shape
    g.fillStyle(0xcfd8dc);
    g.fillCircle(bR, bR - 2, 14);
    g.fillRect(bR - 12, bR - 2, 24, 14);
    // Eye sockets
    g.fillStyle(0x000000);
    g.fillCircle(bR - 6, bR - 2, 5);
    g.fillCircle(bR + 6, bR - 2, 5);
    // Glowing dots in eyes
    g.fillStyle(0x00e5ff);
    g.fillCircle(bR - 6, bR - 2, 2);
    g.fillCircle(bR + 6, bR - 2, 2);
    // Nose hole
    g.fillStyle(0x000000);
    g.fillTriangle(bR - 2, bR + 4, bR + 2, bR + 4, bR, bR + 8);
    // Teeth
    g.fillStyle(0xffffff);
    for (let j = 0; j < 5; j++) {
      g.fillRect(bR - 7 + j * 3, bR + 12, 2, 4);
    }
    // Bone details on sides
    g.fillStyle(0x90a4ae);
    g.fillRect(bR - 22, bR - 6, 6, 12);
    g.fillRect(bR + 16, bR - 6, 6, 12);
    g.lineStyle(2, 0x546e7a, 0.7);
    g.strokeCircle(bR, bR, bR - 2);
    g.generateTexture('boss_reaper', BOSS_SIZE, BOSS_SIZE);
    g.clear();

    // Bullet: small bright yellow dot
    g.fillStyle(0xffee58);
    g.fillCircle(5, 5, 4);
    g.fillStyle(0xffffff);
    g.fillCircle(5, 5, 2);
    g.generateTexture('bullet', 10, 10);
    g.clear();

    // XP orb: tiny green dot
    g.fillStyle(0x69f0ae);
    g.fillCircle(4, 4, 3.5);
    g.lineStyle(1, 0xb9f6ca, 0.9);
    g.strokeCircle(4, 4, 3.5);
    g.generateTexture('xp', 8, 8);
    g.clear();

    // Magnet: U-shaped horseshoe magnet (red & blue)
    const mw = 20, mh = 22;
    // Red pole (left/N pole)
    g.fillStyle(0xef5350);
    g.fillRect(3, 0, 7, 16);
    g.fillStyle(0xff8a80);
    g.fillRect(3, 0, 2, 16);
    // Blue pole (right/S pole)
    g.fillStyle(0x1565c0);
    g.fillRect(11, 0, 7, 16);
    g.fillStyle(0x42a5f5);
    g.fillRect(16, 0, 2, 16);
    // Bottom connecting bar
    g.fillStyle(0x9e9e9e);
    g.fillRect(3, 16, 14, 5);
    g.fillStyle(0xbdbdbd);
    g.fillRect(5, 16, 10, 2);
    // Rounded tips
    g.fillStyle(0xef5350);
    g.fillRect(2, -1, 9, 3);
    g.fillStyle(0x1565c0);
    g.fillRect(10, -1, 9, 3);
    g.generateTexture('loot_magnet', mw, mh);
    g.clear();

    // Health: glass bottle with red blood (~2/3 full)
    const bw = 16, bh = 24;
    // glass body outline
    g.lineStyle(1.5, 0xbcddf5, 0.85);
    g.strokeRect(3, 8, 10, 12);                          // bottle body
    g.strokeRect(5, 3, 6, 6);                             // neck
    // red blood liquid (bottom 2/3 of body)
    g.fillStyle(0xcc0000, 0.85);
    g.fillRect(4, 14, 8, 6);                              // liquid in body
    g.fillStyle(0xff1a1a, 0.7);
    g.fillRect(4, 13, 8, 3);                              // liquid surface highlight
    // glass shine
    g.lineStyle(1, 0xffffff, 0.45);
    g.strokeRect(5, 9, 1, 8);                             // left reflection line
    // cork
    g.fillStyle(0x8d6e63, 0.95);
    g.fillRect(5, 0, 6, 4);
    g.lineStyle(1, 0x6d4c41, 0.9);
    g.strokeRect(5, 0, 6, 4);
    g.generateTexture('loot_health', bw, bh);
    g.clear();

    // Gold: shiny coin with rim
    const gr = 10;
    // Outer rim
    g.fillStyle(0xf9a825);
    g.fillCircle(gr, gr, gr);
    g.lineStyle(1.5, 0xff8f00, 0.9);
    g.strokeCircle(gr, gr, gr - 1);
    // Inner circle
    g.fillStyle(0xffd54f);
    g.fillCircle(gr, gr, gr - 3);
    // Shine highlight
    g.fillStyle(0xffecb3, 0.7);
    g.fillCircle(gr - 2, gr - 3, 3);
    g.generateTexture('loot_gold', gr * 2, gr * 2);
    g.clear();

    g.destroy();
  }

  /* ========== WORLD SETUP ========== */

  private createWorld() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.add
      .grid(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 80, 80, 0x1d2430, 0.45, 0x2a3444, 0.55)
      .setDepth(-20);

    this.player = this.physics.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 'player');
    this.player.setCircle(PLAYER_RADIUS);
    this.player.setDepth(20);
    this.player.setCollideWorldBounds(true);

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.xpOrbs = this.physics.add.group();
    this.lootDrops = this.physics.add.group();
    this.bossBullets = this.physics.add.group();

    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
  }

  /* ========== HUD ========== */

  private createHud() {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '18px',
      color: '#f6f1e7',
      stroke: '#10141c',
      strokeThickness: 4
    };

    this.hud = {
      hp: this.add.text(18, 16, '', style).setScrollFactor(0).setDepth(100),
      level: this.add.text(18, 42, '', style).setScrollFactor(0).setDepth(100),
      xp: this.add.text(18, 68, '', style).setScrollFactor(0).setDepth(100),
      time: this.add.text(18, 94, '', style).setScrollFactor(0).setDepth(100),
      stats: this.add.text(18, 126, '', { ...style, fontSize: '14px' }).setScrollFactor(0).setDepth(100),
      gold: this.add.text(0, 16, '', { ...style, fontSize: '20px', color: '#ffd700' }).setScrollFactor(0).setDepth(100),
      message: this.add
        .text(this.scale.width / 2, 24, 'WASD 移动 | 自动攻击 | 击杀敌人升级', { ...style, fontSize: '16px' })
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(100),
      bossHp: this.add.text(0, 0, '', { ...style, fontSize: '16px', color: '#ff5252' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(100).setVisible(false),
      bossBarBg: this.add.rectangle(0, 0, 300, 10, 0x333333, 0.8)
        .setScrollFactor(0).setDepth(100).setVisible(false),
      bossBar: this.add.rectangle(0, 0, 300, 10, 0xff1744, 1)
        .setScrollFactor(0).setDepth(101).setVisible(false)
    };

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.hud.message.setX(size.width / 2);
      this.layoutBossHud();
      this.layoutCommercialButtons();
    });
  }

  private layoutBossHud() {
    const w = this.scale.width;
    this.hud.bossHp.setPosition(w / 2, 60);
    this.hud.bossBarBg.setPosition(w / 2, 82);
    this.hud.bossBar.setPosition(w / 2 - 150, 82);
    this.hud.bossBar.setOrigin(0, 0.5);
  }

  private createCommercialMock() {
    const buttonConfigs = [
      { label: '广告升级', action: () => this.tryAdUpgrade() },
      { label: '双倍经验', action: () => this.toggleDoubleXp() },
      { label: '战斗通行证', action: () => this.showBattlePassMock() }
    ];

    this.commercialButtons = [];
    buttonConfigs.forEach((config) => {
      const bg = this.add.rectangle(0, 0, 150, 34, 0x222b38, 0.9)
        .setStrokeStyle(2, 0x69d8ff, 0.7).setScrollFactor(0).setDepth(100)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, config.label, {
        fontFamily: 'Arial, sans-serif', fontSize: '15px', color: '#f6f1e7'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

      bg.on('pointerover', () => bg.setFillStyle(0x314056, 0.98));
      bg.on('pointerout', () => bg.setFillStyle(0x222b38, 0.9));
      bg.on('pointerdown', config.action);
      this.commercialButtons.push(bg, label);
    });

    this.layoutCommercialButtons();
  }

  private layoutCommercialButtons() {
    for (let i = 0; i < this.commercialButtons.length; i += 2) {
      const row = i / 2;
      const x = this.scale.width - 96;
      const y = 24 + row * 44;
      (this.commercialButtons[i] as Phaser.GameObjects.Rectangle).setPosition(x, y);
      (this.commercialButtons[i + 1] as Phaser.GameObjects.Text).setPosition(x, y);
    }
  }

  /* ========== PLAYER MOVEMENT ========== */

  private movePlayer() {
    const v = new Phaser.Math.Vector2(0, 0);
    if (this.keys.A.isDown) v.x -= 1;
    if (this.keys.D.isDown) v.x += 1;
    if (this.keys.W.isDown) v.y -= 1;
    if (this.keys.S.isDown) v.y += 1;
    if (v.lengthSq() > 0) {
      v.normalize().scale(this.stats.moveSpeed);
    }
    this.player.setVelocity(v.x, v.y);
  }

  /* ========== ENEMY SPAWNING ========== */

  private getEnemyVariant(): EnemyVariant {
    const t = this.elapsedMs / 1000;
    const r = Math.random();
    if (t < 30) return 'normal';
    if (t < 60) return r < 0.6 ? 'normal' : r < 0.85 ? 'fast' : 'tank';
    if (t < 120) return r < 0.4 ? 'normal' : r < 0.7 ? 'fast' : r < 0.9 ? 'tank' : 'elite';
    return r < 0.25 ? 'normal' : r < 0.5 ? 'fast' : r < 0.75 ? 'tank' : 'elite';
  }

  private getEnemyConfig(v: EnemyVariant): EnemyConfig {
    switch (v) {
      case 'fast': return { hpMul: 0.5, speedMul: 1.7, damageMul: 0.8, tex: 'enemy_fast' };
      case 'tank': return { hpMul: 3, speedMul: 0.5, damageMul: 1.5, tex: 'enemy_tank' };
      case 'elite': return { hpMul: 2.2, speedMul: 1.2, damageMul: 2, tex: 'enemy_elite' };
      case 'boss': return { hpMul: 15, speedMul: 0.6, damageMul: 3, tex: Phaser.Utils.Array.GetRandom(['boss_demon', 'boss_eye', 'boss_reaper']) };
      default: return { hpMul: 1, speedMul: 1, damageMul: 1, tex: 'enemy' };
    }
  }

  private spawnEnemyAt(x: number, y: number, variant: EnemyVariant) {
    const cfg = this.getEnemyConfig(variant);
    const timeScale = 1 + (this.elapsedMs / 1000) * 0.006;
    const baseHp = Math.floor((38 + Math.floor(this.level / 3) * 10) * timeScale);
    const baseDmg = Math.floor((8 + Math.floor(this.level / 5) * 2) * timeScale);
    const baseSpd = Math.floor((66 + Math.min(this.level * 2, 42)) * (1 + timeScale * 0.08));

    const enemy = this.enemies.create(x, y, cfg.tex) as Phaser.Physics.Arcade.Image;
    enemy.setData('hp', Math.floor(baseHp * cfg.hpMul));
    enemy.setData('maxHp', Math.floor(baseHp * cfg.hpMul));
    enemy.setData('damage', Math.floor(baseDmg * cfg.damageMul));
    enemy.setData('speed', Math.floor(baseSpd * cfg.speedMul));
    enemy.setData('variant', variant);
    enemy.setData('isBoss', variant === 'boss');

    if (variant === 'boss') {
      enemy.setCircle(BOSS_SIZE / 2);
      enemy.setDepth(12);
    } else {
      enemy.setDepth(10);
    }
    return enemy;
  }

  private spawnPosition() {
    const view = this.cameras.main.worldView;
    const side = Phaser.Math.Between(0, 3);
    const margin = 90;
    let x = this.player.x;
    let y = this.player.y;

    if (side === 0) { x = view.left - margin; y = Phaser.Math.Between(view.top - margin, view.bottom + margin); }
    else if (side === 1) { x = view.right + margin; y = Phaser.Math.Between(view.top - margin, view.bottom + margin); }
    else if (side === 2) { x = Phaser.Math.Between(view.left - margin, view.right + margin); y = view.top - margin; }
    else { x = Phaser.Math.Between(view.left - margin, view.right + margin); y = view.bottom + margin; }

    return {
      x: Phaser.Math.Clamp(x, 20, WORLD_WIDTH - 20),
      y: Phaser.Math.Clamp(y, 20, WORLD_HEIGHT - 20)
    };
  }

  private spawnEnemy() {
    const variant = this.getEnemyVariant();
    const pos = this.spawnPosition();
    this.spawnEnemyAt(pos.x, pos.y, variant);
  }

  private spawnEnemiesWhenReady() {
    const spawnInterval = Math.max(360, 1100 - this.level * 45);
    while (this.spawnElapsed >= spawnInterval) {
      this.spawnElapsed -= spawnInterval;
      this.spawnEnemy();
    }
  }

  /* ========== BOSS SYSTEM ========== */

  private updateBossSpawn() {
    if (this.bossActive || this.bossElapsed < BOSS_INTERVAL_MS) return;
    this.bossElapsed = 0;
    this.bossActive = true;

    const pos = this.spawnPosition();
    const boss = this.spawnEnemyAt(pos.x, pos.y, 'boss');

    this.showBossAlert();

    this.hud.bossHp.setVisible(true);
    this.hud.bossBarBg.setVisible(true);
    this.hud.bossBar.setVisible(true);
    this.layoutBossHud();
  }

  private showBossAlert() {
    const w = this.scale.width;
    const txt = this.add.text(w / 2, this.scale.height / 2 - 100, '⚠ BOSS 来袭!', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '40px', color: '#ff1744', stroke: '#000', strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(400);

    this.tweens.add({
      targets: txt, scale: 1.2, alpha: 0, duration: 2000,
      ease: 'Sine.easeOut', onComplete: () => txt.destroy()
    });
  }

  /* ========== BOSS ATTACK ========== */

  private getBoss(): Phaser.Physics.Arcade.Image | null {
    let boss: Phaser.Physics.Arcade.Image | null = null;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (enemy.active && enemy.getData('isBoss')) boss = enemy;
    });
    return boss;
  }

  private clearLaserObjs() {
    this.bossLaserObjs.forEach((o) => o.destroy());
    this.bossLaserObjs = [];
  }

  private updateBossAttack() {
    if (!this.bossActive) {
      this.bossAttackElapsed = 0;
      this.bossAttackCooldown = 4000;
      this.bossCasting = false;
      if (this.bossLaserPhase !== 'idle') {
        this.clearLaserObjs();
        this.bossLaserPhase = 'idle';
      }
      return;
    }

    const boss = this.getBoss();
    if (!boss) return;

    // Laser telegraph: continuously track player
    if (this.bossLaserPhase === 'telegraph') {
      this.bossLaserAngle = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);
      this.updateLaserTelegraphVisuals(boss);
      if (this.bossAttackElapsed >= 1500) {
        this.clearLaserObjs();
        this.bossLaserPhase = 'beam';
        this.bossAttackElapsed = 0;
        this.createLaserBeam(boss);
      }
      return;
    }

    if (this.bossLaserPhase === 'beam') {
      this.checkLaserDamage(boss);
      if (this.bossAttackElapsed >= 600) {
        this.clearLaserObjs();
        this.bossLaserPhase = 'idle';
        this.bossCasting = false;
        this.bossAttackElapsed = 0;
        this.bossAttackCooldown = Phaser.Math.Between(2500, 4500);
      }
      return;
    }

    // Idle: wait for cooldown
    if (this.bossCasting) return;

    if (this.bossAttackElapsed >= this.bossAttackCooldown) {
      this.bossAttackElapsed = 0;
      if (Math.random() < 0.5) {
        this.startLaserTelegraph(boss);
      } else {
        this.fireSpreadVolley(boss);
        this.bossCasting = false;
        this.bossAttackElapsed = 0;
        this.bossAttackCooldown = Phaser.Math.Between(2500, 4500);
      }
    }
  }

  private getLaserMaxRange(boss: Phaser.Physics.Arcade.Image): number {
    // Calculate distance to world boundary in the laser direction
    const cos = Math.cos(this.bossLaserAngle);
    const sin = Math.sin(this.bossLaserAngle);
    let maxDist = 0;
    if (cos > 0.001) maxDist = Math.max(maxDist, (WORLD_WIDTH - boss.x) / cos);
    if (cos < -0.001) maxDist = Math.max(maxDist, -boss.x / cos);
    if (sin > 0.001) maxDist = Math.max(maxDist, (WORLD_HEIGHT - boss.y) / sin);
    if (sin < -0.001) maxDist = Math.max(maxDist, -boss.y / sin);
    return Math.max(100, maxDist);
  }

  private startLaserTelegraph(boss: Phaser.Physics.Arcade.Image) {
    this.bossCasting = true;
    this.bossLaserPhase = 'telegraph';
    this.bossAttackElapsed = 0;
  }

  private updateLaserTelegraphVisuals(boss: Phaser.Physics.Arcade.Image) {
    // Clear old telegraph visuals each frame and redraw to track player
    this.bossLaserObjs.forEach((o) => o.destroy());
    this.bossLaserObjs = [];

    const range = this.getLaserMaxRange(boss);
    const endX = boss.x + Math.cos(this.bossLaserAngle) * range;
    const endY = boss.y + Math.sin(this.bossLaserAngle) * range;

    // Warning line from boss body outward
    const line = this.add.line(0, 0, boss.x, boss.y, endX, endY, 0xff1744, 0.55)
      .setLineWidth(6).setDepth(24);
    // Outer glow
    const glow = this.add.line(0, 0, boss.x, boss.y, endX, endY, 0xff5252, 0.3)
      .setLineWidth(16).setDepth(23);
    this.bossLaserObjs.push(line, glow);

    // Pulsing dots along the line
    const steps = 6;
    const pulseOffset = (this.bossAttackElapsed / 1500) * steps;
    for (let i = 0; i < steps; i++) {
      const t = ((i + pulseOffset) % steps) / steps;
      const cx = boss.x + Math.cos(this.bossLaserAngle) * range * t;
      const cy = boss.y + Math.sin(this.bossLaserAngle) * range * t;
      const alpha = 0.25 + 0.3 * Math.sin((this.bossAttackElapsed / 200) + i);
      const dot = this.add.circle(cx, cy, 7, 0xff1744, alpha)
        .setStrokeStyle(1, 0xff8a80, 0.5).setDepth(25);
      this.bossLaserObjs.push(dot);
    }
  }

  private createLaserBeam(boss: Phaser.Physics.Arcade.Image) {
    const range = this.getLaserMaxRange(boss);
    const endX = boss.x + Math.cos(this.bossLaserAngle) * range;
    const endY = boss.y + Math.sin(this.bossLaserAngle) * range;

    // Thick bright beam
    const beam = this.add.line(0, 0, boss.x, boss.y, endX, endY, 0xff0000, 0.85)
      .setLineWidth(18).setDepth(26);
    // Inner bright core
    const core = this.add.line(0, 0, boss.x, boss.y, endX, endY, 0xff6666, 0.9)
      .setLineWidth(8).setDepth(27);
    this.bossLaserObjs.push(beam, core);

    // Flash effect at boss origin
    const flash = this.add.circle(boss.x, boss.y, 20, 0xff0000, 0.6).setDepth(28);
    this.tweens.add({
      targets: flash, scale: 2, alpha: 0, duration: 500,
      ease: 'Sine.easeOut', onComplete: () => flash.destroy()
    });
    this.bossLaserObjs.push(flash);
  }

  private checkLaserDamage(boss: Phaser.Physics.Arcade.Image) {
    const range = this.getLaserMaxRange(boss);
    // Check if player is close to the laser line
    const px = this.player.x;
    const py = this.player.y;
    const bx = boss.x;
    const by = boss.y;

    // Distance from player to the laser line segment
    const dx = Math.cos(this.bossLaserAngle) * range;
    const dy = Math.sin(this.bossLaserAngle) * range;
    const t = Phaser.Math.Clamp(
      ((px - bx) * dx + (py - by) * dy) / (dx * dx + dy * dy),
      0, 1
    );
    const closestX = bx + t * dx;
    const closestY = by + t * dy;
    const distToLine = Phaser.Math.Distance.Between(px, py, closestX, closestY);

    if (distToLine < 30 && this.contactDamageElapsed >= 400) {
      this.contactDamageElapsed = 0;
      this.stats.hp = Math.max(0, this.stats.hp - 15);
      this.cameras.main.shake(120, 0.006);
      this.showHitText(this.player.x, this.player.y - 20, '-15', '#ff0000');
      if (this.stats.hp <= 0) {
        this.endGame(false);
      }
    }
  }

  private fireSpreadVolley(boss: Phaser.Physics.Arcade.Image) {
    const rounds = Phaser.Math.Between(1, 5);
    for (let r = 0; r < rounds; r++) {
      this.time.delayedCall(r * 350, () => {
        if (!boss.active || this.gameOver) return;
        this.fireSpreadSingle(boss);
      });
    }
  }

  private fireSpreadSingle(boss: Phaser.Physics.Arcade.Image) {
    const count = 18;
    const speed = 140;
    // Bullets live indefinitely, removed when off-screen

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.1, 0.1);
      const bullet = this.bossBullets.create(boss.x, boss.y, 'bullet') as Phaser.Physics.Arcade.Image;
      bullet.setTint(0xff1744);
      bullet.setScale(1.5);
      bullet.setCircle(5);
      bullet.setDepth(18);
      // No life limit - will be destroyed when off screen
      this.physics.velocityFromRotation(angle, speed, bullet.body!.velocity);
    }
  }

  private updateBossBullets(_delta: number) {
    const margin = 60;
    this.bossBullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return;

      // Destroy if off screen
      if (bullet.x < -margin || bullet.x > WORLD_WIDTH + margin ||
          bullet.y < -margin || bullet.y > WORLD_HEIGHT + margin) {
        bullet.destroy();
        return;
      }

      // Collision with player
      const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.player.x, this.player.y);
      if (dist < PLAYER_RADIUS + 5) {
        bullet.destroy();
        this.stats.hp = Math.max(0, this.stats.hp - 10);
        this.cameras.main.shake(80, 0.004);
        this.showHitText(this.player.x, this.player.y - 20, '-10', '#ff5252');
        if (this.stats.hp <= 0) {
          this.endGame(false);
        }
      }
    });
  }

  /* ========== ENEMY UPDATE ========== */

  private updateEnemies() {
    let touchingPlayer = false;

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) return;

      const spd = enemy.getData('speed') as number;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      this.physics.velocityFromRotation(angle, spd, enemy.body!.velocity);

      const size = enemy.getData('isBoss') ? BOSS_SIZE * 0.5 : ENEMY_SIZE * 0.55;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (distance <= PLAYER_RADIUS + size) {
        touchingPlayer = true;
      }
    });

    if (touchingPlayer && this.contactDamageElapsed >= 700) {
      this.contactDamageElapsed = 0;
      this.stats.hp = Math.max(0, this.stats.hp - 8);
      this.cameras.main.shake(90, 0.004);
      if (this.stats.hp <= 0) {
        this.endGame(false);
      }
    }
  }

  /* ========== AUTO ATTACK ========== */

  private updateAutoAttack() {
    if (this.attackElapsed < this.stats.attackInterval) return;

    const targets = this.findNearestEnemies(this.stats.bulletCount);
    if (targets.length === 0) {
      this.attackElapsed = this.stats.attackInterval;
      return;
    }

    this.attackElapsed = 0;
    targets.forEach((target) => this.fireAt(target));
  }

  private findNearestEnemies(limit: number, extraFilter?: (e: Phaser.Physics.Arcade.Image) => boolean) {
    const attackRangeSq = ATTACK_RANGE * ATTACK_RANGE;
    return this.enemies
      .getChildren()
      .map((child) => child as Phaser.Physics.Arcade.Image)
      .filter((enemy) => enemy.active && (!extraFilter || extraFilter(enemy)))
      .map((enemy) => ({
        enemy,
        distanceSq: Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y)
      }))
      .filter((entry) => entry.distanceSq <= attackRangeSq)
      .sort((a, b) => a.distanceSq - b.distanceSq)
      .slice(0, limit)
      .map((entry) => entry.enemy);
  }

  private fireAt(target: Phaser.Physics.Arcade.Image) {
    this.shots += 1;
    this.fireBulletToTarget(this.player.x, this.player.y, target, 3);
  }

  private fireBulletToTarget(fromX: number, fromY: number, target: Phaser.Physics.Arcade.Image, pierceLeft: number) {
    if (!target.active || this.gameOver) return;
    const distance = Phaser.Math.Distance.Between(fromX, fromY, target.x, target.y);
    const flightMs = Phaser.Math.Clamp(distance / 4.8, 90, 240);
    const bullet = this.bullets.create(fromX, fromY, 'bullet') as Phaser.Physics.Arcade.Image;

    bullet.setCircle(5);
    bullet.setDepth(16);
    bullet.setData('life', flightMs + 120);

    this.time.delayedCall(flightMs, () => {
      if (!bullet.active || this.gameOver) return;
      if (target.active) {
        this.damageEnemy(target, this.stats.bulletDamage);
      }

      // Piercing: chain to next enemy
      if (this.piercingBullets && pierceLeft > 1 && target.active === false) {
        // target was just killed, find next
        const nextTarget = this.findNearestEnemies(1, (e: Phaser.Physics.Arcade.Image) => e !== target && e.active);
        if (nextTarget.length > 0) {
          this.fireBulletToTarget(target.x, target.y, nextTarget[0], pierceLeft - 1);
        }
      }
    });

    this.tweens.add({
      targets: bullet, x: target.x, y: target.y,
      duration: flightMs, ease: 'Linear',
      onComplete: () => bullet.destroy()
    });
  }

  /* ========== SPECIAL WEAPONS ========== */

  private updateSpecialWeapons() {
    if (this.orbitLevel > 0 && this.orbitElapsed >= Math.max(380, 950 - this.orbitLevel * 90)) {
      this.orbitElapsed = 0;
      const orbitDmg = this.orbitCount >= 3 ? (12 + this.orbitLevel * 5) * 2 : 12 + this.orbitLevel * 5;
      for (let i = 0; i < this.orbitCount; i++) {
        this.time.delayedCall(i * 80, () => {
          this.damageArea(155 + this.orbitLevel * 18, orbitDmg, 0xfff275);
        });
      }
    }

    if (this.auraLevel > 0 && this.auraElapsed >= Math.max(320, 720 - this.auraLevel * 55)) {
      this.auraElapsed = 0;
      const auraRadius = this.auraSlow ? (115 + this.auraLevel * 18) * 2 : 115 + this.auraLevel * 18;
      this.damageArea(auraRadius, 8 + this.auraLevel * 4, 0x67ff7a);
    }
  }

  private damageArea(radius: number, damage: number, color: number) {
    const radiusSq = radius * radius;
    let hit = false;

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) return;

      const distanceSq = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distanceSq <= radiusSq) {
        hit = true;
        this.damageEnemy(enemy, damage);
      }
    });

    if (hit) {
      const ring = this.add.circle(this.player.x, this.player.y, radius, color, 0.08)
        .setStrokeStyle(3, color, 0.75).setDepth(15);
      this.tweens.add({
        targets: ring, scale: 1.15, alpha: 0, duration: 260,
        ease: 'Sine.easeOut', onComplete: () => ring.destroy()
      });
    }
  }

  /* ========== DAMAGE & DEATH ========== */

  private damageEnemy(enemy: Phaser.Physics.Arcade.Image, amount: number) {
    if (!enemy.active) return;

    let finalDmg = amount;
    let isCrit = false;
    if (this.critChance > 0 && Math.random() < this.critChance) {
      finalDmg = Math.floor(amount * this.critMultiplier);
      isCrit = true;
    }

    const hp = (enemy.getData('hp') as number) - finalDmg;
    enemy.setData('hp', hp);

    this.showHitText(enemy.x, enemy.y, Math.ceil(finalDmg).toString(), isCrit ? '#ffd700' : '#fff275');

    if (hp <= 0) {
      const x = enemy.x;
      const y = enemy.y;
      const isBoss = enemy.getData('isBoss') as boolean;
      enemy.destroy();
      this.kills += 1;

      if (isBoss) {
        this.onBossDefeated(x, y);
      } else {
        this.dropXp(x, y, 4);
        this.tryDropLoot(x, y);
      }
      this.showDeathEffect(x, y, isBoss);
    }
  }

  private onBossDefeated(x: number, y: number) {
    this.bossActive = false;
    this.bossCasting = false;
    this.bossLaserPhase = 'idle';
    this.clearLaserObjs();
    // Clean up all boss bullets
    this.bossBullets.getChildren().forEach((child) => {
      (child as Phaser.Physics.Arcade.Image).destroy();
    });
    this.hud.bossHp.setVisible(false);
    this.hud.bossBarBg.setVisible(false);
    this.hud.bossBar.setVisible(false);

    // Boss drops lots of XP
    for (let i = 0; i < 8; i++) {
      const ox = x + Phaser.Math.Between(-40, 40);
      const oy = y + Phaser.Math.Between(-40, 40);
      this.dropXp(ox, oy, 8);
    }
    // Boss always drops loot
    this.dropLoot(x + 10, y, 'health');
    this.dropLoot(x - 10, y, 'magnet');
    this.dropLoot(x, y + 10, 'gold');
    this.dropLoot(x, y - 10, 'gold');

    const w = this.scale.width;
    const txt = this.add.text(w / 2, this.scale.height / 2 - 60, 'BOSS 击败!', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '32px', color: '#ffd700', stroke: '#000', strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(400);

    this.tweens.add({
      targets: txt, scale: 1.3, alpha: 0, duration: 1800,
      ease: 'Sine.easeOut', onComplete: () => txt.destroy()
    });
  }

  private showHitText(x: number, y: number, text: string, color: string) {
    const label = this.add.text(x, y - 24, text, {
      fontFamily: 'Arial, sans-serif', fontSize: '14px',
      color, stroke: '#11151c', strokeThickness: 3
    }).setOrigin(0.5).setDepth(30);

    this.tweens.add({
      targets: label, y: y - 44, alpha: 0, duration: 520,
      ease: 'Sine.easeOut', onComplete: () => label.destroy()
    });
  }

  private showDeathEffect(x: number, y: number, isBoss: boolean) {
    const radius = isBoss ? 60 : 16;
    const ring = this.add.circle(x, y, radius, 0xffffff, 0)
      .setStrokeStyle(isBoss ? 6 : 4, isBoss ? 0xffd700 : 0xfff275, 0.95)
      .setDepth(28);
    this.tweens.add({
      targets: ring, radius: radius * 2.5, alpha: 0, duration: isBoss ? 600 : 360,
      ease: 'Sine.easeOut', onComplete: () => ring.destroy()
    });
  }

  /* ========== XP & LOOT DROPS ========== */

  private dropXp(x: number, y: number, value: number) {
    const orb = this.xpOrbs.create(x, y, 'xp') as Phaser.Physics.Arcade.Image;
    orb.setCircle(XP_RADIUS);
    orb.setData('value', value);
    orb.setDepth(14);
    this.tweens.add({
      targets: orb, scale: 1.3, duration: 400,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  private tryDropLoot(x: number, y: number) {
    const r = Math.random();
    if (r < 0.02) {
      this.dropLoot(x, y, 'magnet');
    } else if (r < 0.04) {
      this.dropLoot(x, y, 'health');
    } else if (r < 0.16) {
      this.dropLoot(x, y, 'gold');
    }
  }

  private dropLoot(x: number, y: number, type: LootType) {
    const tex = type === 'xp' ? 'xp' : `loot_${type}`;
    const orb = this.lootDrops.create(x, y, tex) as Phaser.Physics.Arcade.Image;
    orb.setCircle(type === 'health' ? 8 : LOOT_RADIUS);
    orb.setData('lootType', type);
    orb.setData('value', type === 'gold' ? Phaser.Math.Between(1, 5) : 1);
    orb.setDepth(15);
    this.tweens.add({
      targets: orb, scale: 1.2, duration: 500,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  private updateXpCollection() {
    this.xpOrbs.getChildren().forEach((child) => {
      const orb = child as Phaser.Physics.Arcade.Image;
      if (!orb.active) return;

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, orb.x, orb.y);
      if (distance < this.stats.pickupRadius) {
        this.collectXp(orb);
      } else if (distance < this.stats.pickupRadius + 110) {
        const angle = Phaser.Math.Angle.Between(orb.x, orb.y, this.player.x, this.player.y);
        this.physics.velocityFromRotation(angle, 180, orb.body!.velocity);
      } else {
        orb.setVelocity(0, 0);
      }
    });
  }

  private updateLootCollection() {
    this.lootDrops.getChildren().forEach((child) => {
      const orb = child as Phaser.Physics.Arcade.Image;
      if (!orb.active) return;

      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, orb.x, orb.y);
      if (distance < this.stats.pickupRadius) {
        this.collectLoot(orb);
      } else if (distance < this.stats.pickupRadius + 110) {
        const angle = Phaser.Math.Angle.Between(orb.x, orb.y, this.player.x, this.player.y);
        this.physics.velocityFromRotation(angle, 180, orb.body!.velocity);
      } else {
        orb.setVelocity(0, 0);
      }
    });
  }

  private collectXp(orb: Phaser.Physics.Arcade.Image) {
    const value = (orb.getData('value') as number) * (this.doubleXp ? 2 : 1);
    this.showHitText(orb.x, orb.y - 10, `+${value} 经验`, '#69f0ae');
    orb.destroy();
    this.xp += value;

    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.floor(this.xpToNext * 1.25 + 8);
      this.stats.attackInterval = this.getLevelAttackInterval();
      this.showSkillChoices();
      break;
    }
  }

  private collectLoot(orb: Phaser.Physics.Arcade.Image) {
    const lootType = orb.getData('lootType') as LootType;
    orb.destroy();

    if (lootType === 'magnet') {
      this.showHitText(this.player.x, this.player.y - 20, '磁铁!', '#448aff');
      // Instantly pull and collect ALL XP orbs and loot on the field
      const allOrbs: Phaser.Physics.Arcade.Image[] = [];
      this.xpOrbs.getChildren().forEach((child) => {
        const o = child as Phaser.Physics.Arcade.Image;
        if (o.active) allOrbs.push(o);
      });
      this.lootDrops.getChildren().forEach((child) => {
        const o = child as Phaser.Physics.Arcade.Image;
        // Skip other magnets to avoid recursive pulls
        if (o.active && o.getData('lootType') !== 'magnet') allOrbs.push(o);
      });

      allOrbs.forEach((orb) => {
        const dist = Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y);
        const duration = Math.max(150, Math.min(500, dist / 2));
        this.tweens.add({
          targets: orb, x: this.player.x, y: this.player.y,
          duration, ease: 'Sine.easeIn',
          onComplete: () => {
            if (!orb.active) return;
            const lt = orb.getData('lootType') as LootType | undefined;
            if (lt) {
              this.collectLoot(orb);
            } else {
              this.collectXp(orb);
            }
          }
        });
      });
    } else if (lootType === 'health') {
      const healed = Math.min(this.stats.maxHp - this.stats.hp, 25);
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 25);
      this.showHitText(this.player.x, this.player.y - 20, `+${healed} 生命`, '#4caf50');
    } else if (lootType === 'gold') {
      const val = orb.getData('value') as number;
      this.gold += val;
      this.showHitText(this.player.x, this.player.y - 20, `+${val} 金币 (共 ${this.gold})`, '#ffc107');
    }
  }

  /* ========== LEVEL UP & SKILLS ========== */

  private getLevelAttackInterval() {
    const levelScale = Math.pow(0.95, this.level - 1);
    return Math.max(MIN_ATTACK_INTERVAL, Math.floor(START_ATTACK_INTERVAL * levelScale));
  }

  private clearOverlay() {
    this.overlayElements.forEach((el) => el.destroy());
    this.overlayElements = [];
  }

  private getSkillLevelLabel(id: SkillId): string {
    const lv = this.skillLevels[id];
    if (lv === 0) return 'NEW';
    return `Lv.${lv} → Lv.${lv + 1}`;
  }

  private showSkillChoices() {
    if (this.choosingSkill || this.gameOver) return;
    this.choosingSkill = true;
    this.physics.world.pause();
    this.player.setVelocity(0, 0);

    const evoPreviews: Record<SkillId, string> = {
      attackSpeed: '【质变Lv5】攻击间隔减半 + 子弹+1',
      bulletCount: '【质变Lv5】子弹可穿透敌人3次',
      damage: '【质变Lv5】30%暴击率 暴击x2伤害',
      moveSpeed: '【质变Lv5】移动留下火焰轨迹',
      heal: '【质变Lv5】生命上限+50 每秒回复2点',
      orbit: '【质变Lv5】3重环绕 伤害翻倍',
      aura: '【质变Lv5】光环范围翻倍 减速敌人'
    };
    const baseDescriptions: Record<SkillId, string> = {
      attackSpeed: '攻击间隔 -15%',
      bulletCount: '每次 +1 发',
      damage: '子弹伤害 +6~14',
      moveSpeed: '移速 +12%',
      heal: '恢复 30~50 点生命',
      orbit: '周期性范围伤害',
      aura: '周期性近身伤害'
    };

    const allSkills: SkillOption[] = ([
      { id: 'attackSpeed' as SkillId, title: '攻击速度提升', description: '' },
      { id: 'bulletCount' as SkillId, title: '子弹数量提升', description: '' },
      { id: 'damage' as SkillId, title: '伤害提升', description: '' },
      { id: 'moveSpeed' as SkillId, title: '移速提升', description: '' },
      { id: 'heal' as SkillId, title: '回血', description: '' },
      { id: 'orbit' as SkillId, title: '环绕护体', description: '' },
      { id: 'aura' as SkillId, title: '腐蚀光环', description: '' }
    ] as SkillOption[]).map((s) => {
      const lv = this.skillLevels[s.id];
      const base = baseDescriptions[s.id];
      const evo = lv === 4 ? `\n${evoPreviews[s.id]}` : '';
      return { ...s, description: base + evo };
    });

    // Exclude evolved skills (lv5+)
    const available = allSkills.filter((s) => this.skillLevels[s.id] < 5);
    if (available.length === 0) {
      // All skills evolved, skip selection
      this.choosingSkill = false;
      this.physics.world.resume();
      return;
    }
    const shuffled = Phaser.Utils.Array.Shuffle([...available]);
    const choices = shuffled.slice(0, Math.min(3, available.length));

    const w = this.scale.width;
    const h = this.scale.height;
    const panelW = Math.min(780, w - 40);
    const panelH = 350;
    const px = w / 2;
    const py = h / 2;
    const D = 300;

    const darkBg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.55).setScrollFactor(0).setDepth(D);
    const panel = this.add.rectangle(px, py, panelW, panelH, 0x1a2332, 0.98).setStrokeStyle(2, 0x4fc3f7, 0.6).setScrollFactor(0).setDepth(D);
    const title = this.add.text(px, py - panelH / 2 + 36, `Lv.${this.level}  选择一个强化`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '24px', color: '#ffd966'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(darkBg, panel, title);

    const cardW = (panelW - 100) / 3;
    choices.forEach((skill, i) => {
      const cx = px - panelW / 2 + 40 + cardW / 2 + i * (cardW + 14);
      const cy = py + 16;

      const levelLbl = this.getSkillLevelLabel(skill.id);
      const isNew = levelLbl === 'NEW';
      const isEvo = this.skillLevels[skill.id] === 4;
      const cardBorderColor = isEvo ? 0xffd700 : (isNew ? 0x4caf50 : 0x5a6d80);

      const cardBg = this.add.rectangle(cx, cy, cardW, 230, isNew ? 0x1a3a2a : (isEvo ? 0x1a1a10 : 0x151c28), 1)
        .setStrokeStyle(isEvo ? 3 : 2, cardBorderColor, isEvo ? 0.9 : 0.6)
        .setScrollFactor(0).setDepth(D);
      const lvTag = this.add.text(cx, cy - 95, levelLbl + (isEvo ? ' → 质变!' : ''), {
        fontFamily: 'Arial, sans-serif', fontSize: '12px',
        color: isEvo ? '#ffd700' : (isNew ? '#4caf50' : '#ffd966'),
        stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
      const cardTitle = this.add.text(cx, cy - 60, skill.title, {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
        color: '#fff8dd', wordWrap: { width: cardW - 24 }, align: 'center'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
      const cardDesc = this.add.text(cx, cy + 10, skill.description, {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '14px',
        color: '#cbd7e3', wordWrap: { width: cardW - 24 }, align: 'center'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

      const btnW = cardW - 40;
      const btnColor = isEvo ? 0xf9a825 : (isNew ? 0x2e7d32 : 0x0ea5e9);
      const btnColorHover = isEvo ? 0xfbc02d : (isNew ? 0x388e3c : 0x38bdf8);
      const btnStroke = isEvo ? 0xffd700 : (isNew ? 0x4caf50 : 0x38bdf8);
      const btnBg = this.add.rectangle(cx, cy + 70, btnW, 34, btnColor, 1)
        .setStrokeStyle(1, btnStroke, 0.8)
        .setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: true });
      const btnLabel = this.add.text(cx, cy + 70, isEvo ? '质变!' : '选择', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '15px', color: '#ffffff'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

      btnBg.on('pointerover', () => btnBg.setFillStyle(btnColorHover, 1));
      btnBg.on('pointerout', () => btnBg.setFillStyle(btnColor, 1));
      btnBg.on('pointerdown', () => this.applySkill(skill.id));

      this.overlayElements.push(cardBg, lvTag, cardTitle, cardDesc, btnBg, btnLabel);
    });
  }

  private applySkill(skillId: SkillId) {
    this.skillLevels[skillId] += 1;
    const lv = this.skillLevels[skillId];
    let evolved = false;

    if (skillId === 'attackSpeed') {
      this.stats.attackInterval = Math.max(MIN_ATTACK_INTERVAL, Math.floor(this.stats.attackInterval * 0.85));
      if (lv === 5) {
        this.stats.attackInterval = Math.max(MIN_ATTACK_INTERVAL, Math.floor(this.stats.attackInterval * 0.5));
        this.stats.bulletCount += 1;
        evolved = true;
      }
    } else if (skillId === 'bulletCount') {
      this.stats.bulletCount += 1;
      if (lv === 5) {
        this.piercingBullets = true;
        evolved = true;
      }
    } else if (skillId === 'damage') {
      this.stats.bulletDamage += 6 + lv * 2;
      if (lv === 5) {
        this.critChance = 0.3;
        this.critMultiplier = 2;
        evolved = true;
      }
    } else if (skillId === 'moveSpeed') {
      this.stats.moveSpeed = Math.floor(this.stats.moveSpeed * 1.12);
      if (lv === 5) {
        this.fireTrail = true;
        evolved = true;
      }
    } else if (skillId === 'heal') {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 30 + lv * 5);
      if (lv === 5) {
        this.stats.maxHp += 50;
        this.stats.hp += 50;
        this.hpRegen = 2;
        evolved = true;
      }
    } else if (skillId === 'orbit') {
      this.orbitLevel += 1;
      if (lv === 5) {
        this.orbitCount = 3;
        evolved = true;
      }
    } else if (skillId === 'aura') {
      this.auraLevel += 1;
      if (lv === 5) {
        this.auraSlow = true;
        evolved = true;
      }
    }

    if (evolved) {
      this.showEvolutionEffect(skillId);
    }

    this.clearOverlay();
    this.choosingSkill = false;
    this.physics.world.resume();
  }

  private showEvolutionEffect(skillId: SkillId) {
    const names: Record<SkillId, string> = {
      attackSpeed: '狂暴攻势', bulletCount: '穿透射击', damage: '致命一击',
      moveSpeed: '烈焰轨迹', heal: '血之契约', orbit: '三星环绕', aura: '凋零光环'
    };
    const w = this.scale.width;
    const txt = this.add.text(w / 2, this.scale.height / 2 - 140, `✨ ${names[skillId]} 质变!`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '34px', color: '#ffd700', stroke: '#000', strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    this.tweens.add({
      targets: txt, scale: 1.3, alpha: 0, duration: 2200,
      ease: 'Sine.easeOut', onComplete: () => txt.destroy()
    });
  }

  /* ========== GAME OVER ========== */

  private endGame(win: boolean) {
    this.gameOver = true;
    this.physics.world.pause();
    this.player.setVelocity(0, 0);

    this.hud.bossHp.setVisible(false);
    this.hud.bossBarBg.setVisible(false);
    this.hud.bossBar.setVisible(false);

    const w = this.scale.width;
    const h = this.scale.height;
    const D = 300;

    const darkBg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7).setScrollFactor(0).setDepth(D);
    this.overlayElements.push(darkBg);

    const resultText = win ? '胜利!' : '阵亡';
    const resultColor = win ? '#ffd700' : '#ff5252';
    const title = this.add.text(w / 2, h / 2 - 100, resultText, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '42px',
      color: resultColor, stroke: '#000', strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(title);

    const statsLine = [
      `Lv.${this.level}`,
      `${this.kills} Kills`,
      `${this.gold} Gold`,
      `${Math.ceil(this.elapsedMs / 1000)}s`
    ].join('  |  ');
    const stats = this.add.text(w / 2, h / 2 - 20, statsLine, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
      color: '#f6f1e7', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(stats);

    if (!win && !this.reviveUsed) {
      const reviveBtn = this.add.rectangle(w / 2, h / 2 + 50, 220, 44, 0x8b4513, 0.9)
        .setStrokeStyle(2, 0xffd966, 0.8).setScrollFactor(0).setDepth(D)
        .setInteractive({ useHandCursor: true });
      const reviveLabel = this.add.text(w / 2, h / 2 + 50, '看广告复活 (恢复50%生命)', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px', color: '#ffd966'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
      reviveBtn.on('pointerover', () => reviveBtn.setFillStyle(0xa0522d, 0.95));
      reviveBtn.on('pointerout', () => reviveBtn.setFillStyle(0x8b4513, 0.9));
      reviveBtn.on('pointerdown', () => this.tryAdRevive());
      this.overlayElements.push(reviveBtn, reviveLabel);
    }

    const restartBtn = this.add.rectangle(w / 2, h / 2 + 110, 200, 44, 0x1565c0, 0.95)
      .setStrokeStyle(2, 0x42a5f5, 0.8).setScrollFactor(0).setDepth(D)
      .setInteractive({ useHandCursor: true });
    const restartLabel = this.add.text(w / 2, h / 2 + 110, '重新开始', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px', color: '#f6f1e7'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    restartBtn.on('pointerover', () => restartBtn.setFillStyle(0x1976d2, 0.98));
    restartBtn.on('pointerout', () => restartBtn.setFillStyle(0x1565c0, 0.95));
    restartBtn.on('pointerdown', () => this.scene.restart());
    this.overlayElements.push(restartBtn, restartLabel);
  }

  private tryAdUpgrade() {
    if (this.gameOver || this.choosingSkill) return;

    const candidates: SkillId[] = (['attackSpeed', 'bulletCount', 'damage', 'moveSpeed', 'heal', 'orbit', 'aura'] as SkillId[])
      .filter((id) => this.skillLevels[id] < 5);

    if (candidates.length === 0) {
      const msg = this.add.text(this.scale.width / 2, 80, '所有技能已质变!', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
        color: '#ffd700', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
      this.time.delayedCall(2000, () => msg.destroy());
      return;
    }

    this.choosingSkill = true;
    this.physics.world.pause();

    const names: Record<SkillId, string> = {
      attackSpeed: '攻击速度提升', bulletCount: '子弹数量提升', damage: '伤害提升',
      moveSpeed: '移速提升', heal: '回血', orbit: '环绕护体', aura: '腐蚀光环'
    };
    const evoPreviews: Record<SkillId, string> = {
      attackSpeed: '攻击间隔减半 + 子弹+1',
      bulletCount: '子弹穿透3个敌人',
      damage: '30%暴击率 暴击x2',
      moveSpeed: '移动留下火焰轨迹',
      heal: '生命上限+50 每秒回2血',
      orbit: '3重环绕 伤害翻倍',
      aura: '光环范围翻倍 减速敌人'
    };

    const w = this.scale.width;
    const h = this.scale.height;
    const D = 400;
    const cardW = 160;
    const cardH = 200;
    const totalW = candidates.length * cardW + (candidates.length - 1) * 16;
    const startX = w / 2 - totalW / 2 + cardW / 2;
    const cy = h / 2 + 20;

    // Dark background
    const darkBg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6).setScrollFactor(0).setDepth(D);
    this.overlayElements.push(darkBg);

    // Title
    const title = this.add.text(w / 2, h / 2 - 140, '选择一个技能直升 Lv.5 质变', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '26px',
      color: '#ffd700', stroke: '#000', strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(title);

    // Close button
    const closeBtn = this.add.rectangle(w / 2, h / 2 + 140, 120, 36, 0x555555, 0.9)
      .setStrokeStyle(1, 0x888888).setScrollFactor(0).setDepth(D)
      .setInteractive({ useHandCursor: true });
    const closeLabel = this.add.text(w / 2, h / 2 + 140, '关闭', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px', color: '#f6f1e7'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    closeBtn.on('pointerover', () => closeBtn.setFillStyle(0x777777, 0.9));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(0x555555, 0.9));
    closeBtn.on('pointerdown', () => {
      this.clearOverlay();
      this.choosingSkill = false;
      this.physics.world.resume();
    });
    this.overlayElements.push(closeBtn, closeLabel);

    // Skill cards
    candidates.forEach((skillId, i) => {
      const cx = startX + i * (cardW + 16);
      const currentLv = this.skillLevels[skillId];

      const card = this.add.rectangle(cx, cy, cardW, cardH, 0x1a2332, 0.95)
        .setStrokeStyle(2, 0xffd700, 0.8).setScrollFactor(0).setDepth(D);

      const lvTag = this.add.text(cx, cy - 78, `Lv.${currentLv} → Lv.5`, {
        fontFamily: 'Arial, sans-serif', fontSize: '13px',
        color: '#ffd700', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

      const nameTxt = this.add.text(cx, cy - 40, names[skillId], {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px',
        color: '#fff8dd', wordWrap: { width: cardW - 16 }, align: 'center'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

      const evoTxt = this.add.text(cx, cy + 10, evoPreviews[skillId], {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '12px',
        color: '#ffab40', wordWrap: { width: cardW - 16 }, align: 'center'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

      const btnBg = this.add.rectangle(cx, cy + 62, cardW - 30, 32, 0xf9a825, 1)
        .setStrokeStyle(1, 0xffd700, 0.8).setScrollFactor(0).setDepth(D)
        .setInteractive({ useHandCursor: true });
      const btnLabel = this.add.text(cx, cy + 62, '升满!', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '15px', color: '#1a1a1a'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

      btnBg.on('pointerover', () => btnBg.setFillStyle(0xfbc02d, 1));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0xf9a825, 1));
      btnBg.on('pointerdown', () => {
        this.clearOverlay();
        this.boostSkillToMax(skillId);
      });

      this.overlayElements.push(card, lvTag, nameTxt, evoTxt, btnBg, btnLabel);
    });
  }

  private boostSkillToMax(skillId: SkillId) {
    const currentLv = this.skillLevels[skillId];
    const levelsToAdd = 5 - currentLv;

    let applied = 0;
    this.time.addEvent({
      delay: 120,
      repeat: levelsToAdd - 1,
      callback: () => {
        applied++;
        this.applySkillSilent(skillId);
        if (applied >= levelsToAdd) {
          this.choosingSkill = false;
          this.physics.world.resume();
        }
      }
    });

    const names: Record<SkillId, string> = {
      attackSpeed: '攻击速度提升', bulletCount: '子弹数量提升', damage: '伤害提升',
      moveSpeed: '移速提升', heal: '回血', orbit: '环绕护体', aura: '腐蚀光环'
    };
    const msg = this.add.text(this.scale.width / 2, 80, `广告升级: ${names[skillId]} → Lv.5 质变!`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
      color: '#ffd700', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
    this.time.delayedCall(2500, () => msg.destroy());
  }

  private applySkillSilent(skillId: SkillId) {
    // Same as applySkill but without clearing overlay or toggling chooingSkill
    this.skillLevels[skillId] += 1;
    const lv = this.skillLevels[skillId];

    if (skillId === 'attackSpeed') {
      this.stats.attackInterval = Math.max(MIN_ATTACK_INTERVAL, Math.floor(this.stats.attackInterval * 0.85));
      if (lv === 5) {
        this.stats.attackInterval = Math.max(MIN_ATTACK_INTERVAL, Math.floor(this.stats.attackInterval * 0.5));
        this.stats.bulletCount += 1;
        this.showEvolutionEffect(skillId);
      }
    } else if (skillId === 'bulletCount') {
      this.stats.bulletCount += 1;
      if (lv === 5) { this.piercingBullets = true; this.showEvolutionEffect(skillId); }
    } else if (skillId === 'damage') {
      this.stats.bulletDamage += 6 + lv * 2;
      if (lv === 5) { this.critChance = 0.3; this.critMultiplier = 2; this.showEvolutionEffect(skillId); }
    } else if (skillId === 'moveSpeed') {
      this.stats.moveSpeed = Math.floor(this.stats.moveSpeed * 1.12);
      if (lv === 5) { this.fireTrail = true; this.showEvolutionEffect(skillId); }
    } else if (skillId === 'heal') {
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 30 + lv * 5);
      if (lv === 5) { this.stats.maxHp += 50; this.stats.hp += 50; this.hpRegen = 2; this.showEvolutionEffect(skillId); }
    } else if (skillId === 'orbit') {
      this.orbitLevel += 1;
      if (lv === 5) { this.orbitCount = 3; this.showEvolutionEffect(skillId); }
    } else if (skillId === 'aura') {
      this.auraLevel += 1;
      if (lv === 5) { this.auraSlow = true; this.showEvolutionEffect(skillId); }
    }
  }

  private tryAdRevive() {
    if (this.reviveUsed || !this.gameOver) return;
    this.reviveUsed = true;
    this.gameOver = false;
    this.stats.hp = Math.floor(this.stats.maxHp * 0.5);
    this.clearOverlay();
    this.physics.world.resume();

    const msg = this.add.text(this.scale.width / 2, 80, '已观看广告! 恢复 50% 生命', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
      color: '#ffd966', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
    this.time.delayedCall(2000, () => msg.destroy());
  }

  private toggleDoubleXp() {
    this.doubleXp = !this.doubleXp;
    const msg = this.add.text(this.scale.width / 2, 80,
      this.doubleXp ? '双倍经验 ON' : '双倍经验 OFF', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
        color: '#ffd966', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
    this.time.delayedCall(1500, () => msg.destroy());
  }

  private showBattlePassMock() {
    const w = this.scale.width;
    const h = this.scale.height;
    const D = 350;

    const bg = this.add.rectangle(w / 2, h / 2, 340, 260, 0x1e293b, 0.98)
      .setStrokeStyle(2, 0xffd966, 0.8).setScrollFactor(0).setDepth(D);
    const title = this.add.text(w / 2, h / 2 - 90, '战斗通行证', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '24px',
      color: '#ffd966', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    const desc = this.add.text(w / 2, h / 2, `当前金币: ${this.gold}\n即将上线...\n每日任务 | 等级奖励 | 高级通行证`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '15px',
      color: '#a8bdd4', stroke: '#000', strokeThickness: 2, align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const closeBtn = this.add.rectangle(w / 2, h / 2 + 85, 120, 36, 0x555555, 0.9)
      .setStrokeStyle(1, 0x888888).setScrollFactor(0).setDepth(D)
      .setInteractive({ useHandCursor: true });
    const closeLabel = this.add.text(w / 2, h / 2 + 85, '关闭', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px', color: '#f6f1e7'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const popupEls = [bg, title, desc, closeBtn, closeLabel];

    closeBtn.on('pointerover', () => closeBtn.setFillStyle(0x777777, 0.9));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(0x555555, 0.9));
    closeBtn.on('pointerdown', () => popupEls.forEach((el) => el.destroy()));
  }

  /* ========== EVOLUTION MECHANICS ========== */

  private updateFireTrail(delta: number) {
    if (!this.fireTrail) return;
    const speed = new Phaser.Math.Vector2(this.player.body!.velocity.x, this.player.body!.velocity.y).length();
    if (speed < 30) return;

    this.fireTrailElapsed += delta;
    if (this.fireTrailElapsed >= 120) {
      this.fireTrailElapsed = 0;
      // Spawn fire behind player
      const angle = Math.atan2(this.player.body!.velocity.y, this.player.body!.velocity.x) + Math.PI;
      const fx = this.player.x + Math.cos(angle) * 22;
      const fy = this.player.y + Math.sin(angle) * 22;
      const fire = this.add.circle(fx, fy, 10, 0xff6d00, 0.5)
        .setStrokeStyle(2, 0xffab00, 0.7).setDepth(13);

      // Damage nearby enemies
      const radiusSq = 20 * 20;
      this.enemies.getChildren().forEach((child) => {
        const enemy = child as Phaser.Physics.Arcade.Image;
        if (!enemy.active) return;
        if (Phaser.Math.Distance.Squared(fx, fy, enemy.x, enemy.y) <= radiusSq) {
          this.damageEnemy(enemy, 8);
        }
      });

      this.tweens.add({
        targets: fire, scale: 0.2, alpha: 0, duration: 500,
        ease: 'Sine.easeOut', onComplete: () => fire.destroy()
      });
    }
  }

  private updateHpRegen(delta: number) {
    if (this.hpRegen <= 0) return;
    this.hpRegenElapsed += delta;
    if (this.hpRegenElapsed >= 1000) {
      this.hpRegenElapsed -= 1000;
      if (this.stats.hp < this.stats.maxHp) {
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.hpRegen);
      }
    }
  }

  private updateAuraSlow() {
    if (!this.auraSlow) return;
    const slowRadius = (115 + this.auraLevel * 18) * 2;
    const slowRadiusSq = slowRadius * slowRadius;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) return;
      const distSq = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distSq <= slowRadiusSq) {
        // Reduce speed by 40%
        const baseSpd = enemy.getData('speed') as number;
        const slowSpd = Math.floor(baseSpd * 0.6);
        enemy.setData('slowed', true);
        // Apply slow by adjusting velocity
        const currentVel = enemy.body!.velocity;
        const currentSpeed = new Phaser.Math.Vector2(currentVel.x, currentVel.y).length();
        if (currentSpeed > slowSpd + 5) {
          const angle = Math.atan2(currentVel.y, currentVel.x);
          this.physics.velocityFromRotation(angle, slowSpd, enemy.body!.velocity);
        }
      }
    });
  }

  /* ========== UTILITY ========== */

  private cleanupBullets(delta: number) {
    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return;
      const life = (bullet.getData('life') as number) - delta;
      if (life <= 0) { bullet.destroy(); }
      else { bullet.setData('life', life); }
    });
  }

  private updateHud() {
    const remaining = Math.max(0, GAME_DURATION_MS - this.elapsedMs);
    const sec = Math.ceil(remaining / 1000);
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    const timeStr = `${min}:${s.toString().padStart(2, '0')}`;

    this.hud.hp.setText(`生命: ${this.stats.hp}/${this.stats.maxHp}`);
    this.hud.level.setText(`等级: ${this.level}`);
    this.hud.xp.setText(`经验: ${this.xp}/${this.xpToNext}${this.doubleXp ? ' (双倍)' : ''}`);
    this.hud.time.setText(`时间: ${timeStr}`);
    this.hud.stats.setText(`击杀: ${this.kills} | 金币: ${this.gold} | 射击: ${this.shots}`);
    this.hud.gold.setText(`🪙 ${this.gold}`).setX(this.scale.width - 90);

    // Update boss HP bar
    if (this.bossActive) {
      let bossHp = 0;
      let bossMaxHp = 1;
      this.enemies.getChildren().forEach((child) => {
        const enemy = child as Phaser.Physics.Arcade.Image;
        if (enemy.active && enemy.getData('isBoss')) {
          bossHp = enemy.getData('hp') as number;
          bossMaxHp = enemy.getData('maxHp') as number;
        }
      });

      if (bossMaxHp > 0) {
        const ratio = Math.max(0, bossHp / bossMaxHp);
        const barW = 300 * ratio;
        this.hud.bossHp.setText(`BOSS  HP: ${Math.ceil(bossHp)}/${bossMaxHp}`);
        this.hud.bossBar.setSize(barW, 10);
      }
    }
  }
}
