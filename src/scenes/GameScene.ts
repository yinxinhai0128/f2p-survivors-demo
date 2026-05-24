import Phaser from 'phaser';

type WeaponSkillId = 'drone' | 'molotov' | 'orbit' | 'missile' | 'aura' | 'laser';
type SupportSkillId = 'attackSpeed' | 'range' | 'damage' | 'bulletCount' | 'heal' | 'moveSpeed';
type SkillId = WeaponSkillId | SupportSkillId;
type LootType = 'xp' | 'magnet' | 'health' | 'gold';
type SkillKind = 'weapon' | 'support';
type BossAttackId = 'laser' | 'spread' | 'mortar' | 'spiral' | 'ring' | 'sweep';

type SkillOption = {
  id: SkillId;
  kind: SkillKind;
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

const WORLD_WIDTH = 3344;
const WORLD_HEIGHT = 1882;
const GAME_DURATION_MS = 300_000;
const PLAYER_RADIUS = 24;
const ENEMY_SIZE = 60;
const BOSS_SIZE = 85;
const XP_RADIUS = 6;
const LOOT_RADIUS = 20;
const START_ATTACK_INTERVAL = 900;
const MIN_ATTACK_INTERVAL = 200;
const ATTACK_RANGE = 350;
const BOSS_INTERVAL_MS = 55_000;

type Difficulty = 'easy' | 'normal' | 'hard';

const DIFFICULTY_MULT: Record<Difficulty, { spawnRate: number; hp: number; bossHp: number; count: number }> = {
  easy:   { spawnRate: 1.5,  hp: 0.65, bossHp: 0.55, count: 0.7 },
  normal: { spawnRate: 1.0,  hp: 1.0,  bossHp: 1.0,  count: 1.0 },
  hard:   { spawnRate: 0.65, hp: 1.5,  bossHp: 1.8,  count: 1.4 },
};
const BOSS_LASER_TELEGRAPH_MS = 1400;
const BOSS_LASER_BEAM_MS = 550;
const BOSS_LASER_DAMAGE_WIDTH = 24;
const VERSION = 'ai-lab-weapons-v1';
const ALL_SKILLS: SkillId[] = [
  'drone', 'molotov', 'orbit', 'missile', 'aura', 'laser',
  'attackSpeed', 'range', 'damage', 'bulletCount', 'heal', 'moveSpeed'
];
const WEAPON_SKILLS: WeaponSkillId[] = ['drone', 'molotov', 'orbit', 'missile', 'aura', 'laser'];
const SUPPORT_SKILLS: SupportSkillId[] = ['attackSpeed', 'range', 'damage', 'bulletCount', 'heal', 'moveSpeed'];

export class GameScene extends Phaser.Scene {
  private selectedCharacter = 'drone_assault';
  private difficulty: Difficulty = 'normal';
  private player!: Phaser.Physics.Arcade.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private playerAura!: Phaser.GameObjects.Ellipse;

  private thrusterEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dataFlowDots: Phaser.GameObjects.Arc[] = [];
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private xpOrbs!: Phaser.Physics.Arcade.Group;
  private lootDrops!: Phaser.Physics.Arcade.Group;
  private keys!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

  private hud!: {
    brand: Phaser.GameObjects.Text;
    objective: Phaser.GameObjects.Text;
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
  private bossLaserOriginX = 0;
  private bossLaserOriginY = 0;
  private bossAttackObjs: Phaser.GameObjects.GameObject[] = [];
  private bossPendingEvents: Phaser.Time.TimerEvent[] = [];
  private bossLastAttack: BossAttackId | null = null;
  private bossBullets!: Phaser.Physics.Arcade.Group;
  private settingsMenuOpen = false;
  private settingsMenuItems: Phaser.GameObjects.GameObject[] = [];
  // Skill evolution flags (level 5 quality change)
  private piercingBullets = false;
  private critChance = 0;
  private critMultiplier = 1;
  private fireTrail = false;
  private fireTrailElapsed = 0;
  private hpRegen = 0;
  private hpRegenElapsed = 0;
  private waveElapsed = 0;
  private waveActive = false;
  private waveDuration = 0;
  private orbitCount = 1;
  private auraSlow = false;
  private attackElapsed = START_ATTACK_INTERVAL;
  private droneElapsed = 0;
  private molotovElapsed = 0;
  private missileElapsed = 0;
  private laserElapsed = 0;
  private contactDamageElapsed = 0;
  private orbitElapsed = 0;
  private auraElapsed = 0;
  private droneVisuals: Phaser.GameObjects.Image[] = [];
  private bladeVisuals: Phaser.GameObjects.Image[] = [];
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
  private firstBoss = true;
  private bossPool: string[] = [];
  private skillLevels: Record<SkillId, number> = {
    drone: 0, molotov: 0, orbit: 0, missile: 0, aura: 0, laser: 0,
    attackSpeed: 0, range: 0, damage: 0, bulletCount: 0, heal: 0, moveSpeed: 0
  };

  constructor() {
    super('GameScene');
  }

  init(data: { character?: string; difficulty?: Difficulty }) {
    if (data?.character) this.selectedCharacter = data.character;
    if (data?.difficulty) this.difficulty = data.difficulty;
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

    // 星场视差滚动（仅随玩家实际移动偏移，玩家不动则背景不动）
    const playerVX = this.player.body!.velocity.x;
    const playerVY = this.player.body!.velocity.y;
    if (this.textures.exists('starfield_deep')) {
      this.children.list.forEach((child) => {
        const spd = child.getData('scrollSpeed') as number | undefined;
        if (spd !== undefined && child instanceof Phaser.GameObjects.TileSprite) {
          child.tilePositionX += playerVX * delta * spd * 0.0004;
          child.tilePositionY += playerVY * delta * spd * 0.0004;
        }
      });
    }

    this.elapsedMs += delta;
    this.spawnElapsed += delta;
    this.bossElapsed += delta;
    if (this.bossActive) this.bossAttackElapsed += delta;
    this.attackElapsed += delta;
    this.droneElapsed += delta;
    this.molotovElapsed += delta;
    this.missileElapsed += delta;
    this.laserElapsed += delta;
    this.contactDamageElapsed += delta;
    this.orbitElapsed += delta;
    this.auraElapsed += delta;

    this.movePlayer();
    // 阴影跟随玩家
    this.playerShadow.setPosition(this.player.x, this.player.y + 4);
    this.playerAura.setPosition(this.player.x, this.player.y);


    // 推进器粒子 + 移动倾斜
    const speed = new Phaser.Math.Vector2(this.player.body!.velocity.x, this.player.body!.velocity.y).length();
    if (speed > 30) {
      const angle = Math.atan2(this.player.body!.velocity.y, this.player.body!.velocity.x) + Math.PI;
      const ex = this.player.x + Math.cos(angle) * 44;
      const ey = this.player.y + Math.sin(angle) * 44;
      this.thrusterEmitter.emitting = true;
      this.thrusterEmitter.setPosition(ex, ey);
      this.thrusterEmitter.setParticleSpeed(20 + speed * 0.15, 50 + speed * 0.25);
      // 移动方向倾斜
      const targetRot = Phaser.Math.Angle.Between(0, 0, this.player.body!.velocity.x, this.player.body!.velocity.y);
      this.player.rotation = Phaser.Math.Angle.RotateTo(this.player.rotation, targetRot, 0.08);
    } else {
      this.thrusterEmitter.emitting = false;
      this.player.rotation = Phaser.Math.Angle.RotateTo(this.player.rotation, 0, 0.04);
    }

    this.spawnEnemiesWhenReady();
    this.updateBossSpawn();
    this.updateBossAttack();
    this.updateBossBullets(delta);
    this.updateEnemies();
    this.updateAutoAttack();
    this.updateSpecialWeapons();
    this.updateWeaponVisuals();
    this.updateWeaponContactDamage();
    this.updateFireTrail(delta);
    this.updateHpRegen(delta);
    this.updateAuraSlow();
    this.updateDataFlow(delta);
    this.updateWave(delta);
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
    this.bossLaserOriginX = 0;
    this.bossLaserOriginY = 0;
    this.bossLastAttack = null;
    this.clearBossAttackEffects();
    this.piercingBullets = false;
    this.critChance = 0;
    this.critMultiplier = 1;
    this.fireTrail = false;
    this.fireTrailElapsed = 0;
    this.hpRegen = 0;
    this.hpRegenElapsed = 0;
    this.waveElapsed = 0;
    this.waveActive = false;
    this.waveDuration = 0;
    this.orbitCount = 1;
    this.auraSlow = false;
    this.attackElapsed = START_ATTACK_INTERVAL;
    this.droneElapsed = 0;
    this.molotovElapsed = 0;
    this.missileElapsed = 0;
    this.laserElapsed = 0;
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
    const starterWeapon: Record<string, WeaponSkillId> = {
      drone_assault: 'drone',
      drone_stealth: 'laser',
      drone_heavy: 'aura',
      drone_speed: 'missile',
      drone_support: 'orbit',
      drone_elite: 'molotov',
    };
    this.skillLevels = {
      drone: 0, molotov: 0, orbit: 0, missile: 0, aura: 0, laser: 0,
      attackSpeed: 0, range: 0, damage: 0, bulletCount: 0, heal: 0, moveSpeed: 0
    };
    this.skillLevels[starterWeapon[this.selectedCharacter] || 'drone'] = 1;
    this.droneVisuals.forEach((o) => o.destroy());
    this.bladeVisuals.forEach((o) => o.destroy());
    this.droneVisuals = [];
    this.bladeVisuals = [];
    this.firstBoss = true;
    this.bossPool = [];
    this.clearOverlay();
  }

  /* ========== TEXTURES ========== */

  private createTextures() {
    const g = this.add.graphics();

    // Player: lab operator drone with a cyan visor and containment shield.
    if (!this.textures.exists('player')) {
      g.fillStyle(0x071a25);
      g.fillCircle(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS);
      g.lineStyle(3, 0x67e8f9, 0.9);
      g.strokeCircle(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS - 1);
      g.fillStyle(0x0f2d3a);
      g.fillRoundedRect(8, 10, 20, 18, 5);
      g.lineStyle(2, 0x93f4ff, 0.85);
      g.strokeRoundedRect(8, 10, 20, 18, 5);
      g.fillStyle(0x8df7ff);
      g.fillRoundedRect(12, 14, 12, 5, 2);
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(14, 15, 2);
      g.lineStyle(2, 0x1ee7b7, 0.75);
      g.beginPath();
      g.arc(PLAYER_RADIUS, PLAYER_RADIUS, PLAYER_RADIUS - 5, -0.2, 1.25);
      g.strokePath();
      g.generateTexture('player', PLAYER_RADIUS * 2, PLAYER_RADIUS * 2);
      g.clear();
    }

    // 敌人纹理由 BootScene 从 敌人1-4.png 加载，此处不再程序化生成

    // Boss 1: Demon (red, horned, spiky)
    if (!this.textures.exists('boss_demon')) {
      const bR1 = BOSS_SIZE / 2;
      g.fillStyle(0x8b0000);
      g.fillCircle(bR1, bR1, bR1 - 2);
      g.fillStyle(0xd50000);
      g.fillCircle(bR1, bR1 + 2, bR1 - 8);
      g.fillStyle(0x3e2723);
      g.fillTriangle(bR1 - 12, bR1 - 10, bR1 - 18, bR1 - 28, bR1 - 4, bR1 - 14);
      g.fillTriangle(bR1 + 12, bR1 - 10, bR1 + 18, bR1 - 28, bR1 + 4, bR1 - 14);
      g.fillStyle(0xff1744);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const sx = bR1 + Math.cos(a) * (bR1 - 6);
        const sy = bR1 + Math.sin(a) * (bR1 - 6);
        g.fillTriangle(sx, sy, sx + Math.cos(a - 0.3) * 14, sy + Math.sin(a - 0.3) * 14, sx + Math.cos(a + 0.3) * 14, sy + Math.sin(a + 0.3) * 14);
      }
      g.fillStyle(0xffeb3b);
      g.fillCircle(bR1 - 8, bR1 - 2, 6);
      g.fillCircle(bR1 + 8, bR1 - 2, 6);
      g.fillStyle(0x000000);
      g.fillCircle(bR1 - 8, bR1 - 2, 3);
      g.fillCircle(bR1 + 8, bR1 - 2, 3);
      g.fillStyle(0x000000);
      g.fillTriangle(bR1 - 6, bR1 + 10, bR1 + 6, bR1 + 10, bR1, bR1 + 20);
      g.lineStyle(2, 0xff6f00, 0.8);
      g.strokeCircle(bR1, bR1, bR1 - 2);
      g.generateTexture('boss_demon', BOSS_SIZE, BOSS_SIZE);
      g.clear();
    }

    // Boss 2: Giant Eye (purple, tentacles)
    if (!this.textures.exists('boss_eye')) {
      const bR2 = BOSS_SIZE / 2;
      g.fillStyle(0x311b92);
      g.fillCircle(bR2, bR2, bR2 - 2);
      g.fillStyle(0x4a148c);
      g.fillCircle(bR2, bR2, bR2 - 8);
      g.fillStyle(0x7c4dff);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const tx = bR2 + Math.cos(a) * (bR2 - 8);
        const ty = bR2 + Math.sin(a) * (bR2 - 8);
        g.fillCircle(tx, ty, 6);
      }
      g.fillStyle(0xffffff);
      g.fillCircle(bR2, bR2, 17);
      g.fillStyle(0x7c4dff);
      g.fillCircle(bR2, bR2, 11);
      g.fillStyle(0x000000);
      g.fillCircle(bR2, bR2, 6);
      g.fillStyle(0xffffff);
      g.fillCircle(bR2 + 3, bR2 - 3, 3);
      g.lineStyle(1.5, 0xb388ff, 0.6);
      g.strokeCircle(bR2, bR2, bR2 - 1);
      g.generateTexture('boss_eye', BOSS_SIZE, BOSS_SIZE);
      g.clear();
    }

    // Boss 3: Reaper (dark, skull-like, bone white)
    if (!this.textures.exists('boss_reaper')) {
      const bR3 = BOSS_SIZE / 2;
      g.fillStyle(0x1a1a2e);
      g.fillCircle(bR3, bR3, bR3 - 2);
      g.fillStyle(0x263238);
      g.fillCircle(bR3, bR3 + 1, bR3 - 6);
      g.fillStyle(0xcfd8dc);
      g.fillCircle(bR3, bR3 - 2, 14);
      g.fillRect(bR3 - 12, bR3 - 2, 24, 14);
      g.fillStyle(0x000000);
      g.fillCircle(bR3 - 6, bR3 - 2, 5);
      g.fillCircle(bR3 + 6, bR3 - 2, 5);
      g.fillStyle(0x00e5ff);
      g.fillCircle(bR3 - 6, bR3 - 2, 2);
      g.fillCircle(bR3 + 6, bR3 - 2, 2);
      g.fillStyle(0x000000);
      g.fillTriangle(bR3 - 2, bR3 + 4, bR3 + 2, bR3 + 4, bR3, bR3 + 8);
      g.fillStyle(0xffffff);
      for (let j = 0; j < 5; j++) {
        g.fillRect(bR3 - 7 + j * 3, bR3 + 12, 2, 4);
      }
      g.fillStyle(0x90a4ae);
      g.fillRect(bR3 - 22, bR3 - 6, 6, 12);
      g.fillRect(bR3 + 16, bR3 - 6, 6, 12);
      g.lineStyle(2, 0x546e7a, 0.7);
      g.strokeCircle(bR3, bR3, bR3 - 2);
      g.generateTexture('boss_reaper', BOSS_SIZE, BOSS_SIZE);
      g.clear();
    }

    // Bullet: cyan data pulse.
    g.fillStyle(0x22d3ee, 0.35);
    g.fillCircle(5, 5, 5);
    g.fillStyle(0x67e8f9);
    g.fillCircle(5, 5, 3.5);
    g.fillStyle(0xffffff);
    g.fillCircle(4, 4, 1.5);
    g.generateTexture('bullet', 10, 10);
    g.clear();

    // Drone: small physical craft that orbits the player and fires independently.
    if (!this.textures.exists('weapon_drone')) {
      g.fillStyle(0x0b1722);
      g.fillRoundedRect(1, 5, 22, 14, 5);
      g.lineStyle(2, 0x67e8f9, 0.9);
      g.strokeRoundedRect(1, 5, 22, 14, 5);
      g.fillStyle(0x8df7ff);
      g.fillRoundedRect(7, 9, 10, 5, 2);
      g.fillStyle(0x14b8a6);
      g.fillCircle(2, 12, 3);
      g.fillCircle(22, 12, 3);
      g.generateTexture('weapon_drone', 24, 24);
      g.clear();
    }

    // Blade: rotating close-range weapon with a clear cutting edge.
    if (!this.textures.exists('weapon_blade')) {
      g.fillStyle(0xe0faff);
      g.fillTriangle(18, 2, 5, 14, 18, 26);
      g.fillStyle(0x38bdf8);
      g.fillTriangle(15, 8, 8, 14, 15, 20);
      g.lineStyle(2, 0x0ea5e9, 0.9);
      g.strokeTriangle(18, 2, 5, 14, 18, 26);
      g.generateTexture('weapon_blade', 28, 28);
      g.clear();
    }

    // Molotov: arcing bottle projectile before the fire zone blooms.
    if (!this.textures.exists('weapon_molotov')) {
      g.fillStyle(0x14532d);
      g.fillRoundedRect(5, 8, 10, 16, 3);
      g.fillStyle(0xf97316);
      g.fillRect(6, 15, 8, 7);
      g.lineStyle(1.5, 0xbbf7d0, 0.8);
      g.strokeRoundedRect(5, 8, 10, 16, 3);
      g.fillStyle(0xfacc15);
      g.fillTriangle(7, 7, 13, 7, 10, 0);
      g.generateTexture('weapon_molotov', 20, 26);
      g.clear();
    }

    // Missile: directional projectile with thrust flame.
    if (!this.textures.exists('weapon_missile')) {
      g.fillStyle(0xe5e7eb);
      g.fillTriangle(22, 8, 6, 2, 6, 14);
      g.fillStyle(0x94a3b8);
      g.fillRect(5, 3, 10, 10);
      g.fillStyle(0xf97316);
      g.fillTriangle(4, 8, 0, 4, 0, 12);
      g.lineStyle(1.5, 0x38bdf8, 0.75);
      g.strokeTriangle(22, 8, 6, 2, 6, 14);
      g.generateTexture('weapon_missile', 24, 16);
      g.clear();
    }

    // Orbital laser carrier: visible emitter before the beam fires.
    if (!this.textures.exists('weapon_laser_sat')) {
      g.fillStyle(0x08111f);
      g.fillCircle(18, 18, 15);
      g.lineStyle(2, 0x67e8f9, 0.9);
      g.strokeCircle(18, 18, 14);
      g.fillStyle(0x22d3ee);
      g.fillCircle(18, 18, 5);
      g.fillStyle(0xe0faff);
      g.fillCircle(16, 16, 2);
      g.lineStyle(3, 0x94a3b8, 0.85);
      g.lineBetween(3, 18, 0, 18);
      g.lineBetween(33, 18, 36, 18);
      g.lineStyle(2, 0xfacc15, 0.85);
      g.strokeCircle(18, 18, 9);
      g.generateTexture('weapon_laser_sat', 36, 36);
      g.clear();
    }

    // XP orb: recovered data fragment.
    g.fillStyle(0x34d399);
    g.fillTriangle(4, 0, 8, 4, 4, 8);
    g.fillStyle(0xa7f3d0);
    g.fillTriangle(4, 2, 6, 4, 4, 6);
    g.lineStyle(1, 0xd1fae5, 0.9);
    g.strokeTriangle(4, 0, 8, 4, 4, 8);
    g.generateTexture('xp', 8, 8);
    g.clear();

    // 道具纹理由 BootScene 从 PNG 文件加载，此处不再程序化生成

    g.destroy();
  }

  /* ========== FLOOR TEXTURE GENERATOR ========== */

  private generateFloorTexture() {
    if (this.textures.exists('floor_tile')) return;
    const S = 800; // tile size
    const g = this.add.graphics();

    // — Layer 1: 底色 —
    g.fillStyle(0x131e2b);
    g.fillRect(0, 0, S, S);

    // — Layer 2: 200px 主面板 —
    const panelColors = [0x162231, 0x192838, 0x111c28, 0x152030, 0x182736, 0x14212e];
    for (let px = 0; px < S; px += 200) {
      for (let py = 0; py < S; py += 200) {
        const ci = ((px + py) / 200) % panelColors.length;
        g.fillStyle(panelColors[ci], 0.9);
        g.fillRect(px + 1, py + 1, 198, 198);
        // 主面板边框
        g.lineStyle(1.5, 0x1e3448, 0.45);
        g.strokeRect(px, py, 200, 200);
      }
    }

    // — Layer 3: 100px 子面板分割线 —
    g.lineStyle(0.8, 0x1a2d3f, 0.3);
    for (let x = 0; x <= S; x += 100) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.strokePath();
    }
    for (let y = 0; y <= S; y += 100) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.strokePath();
    }

    // — Layer 4: 面板角螺栓 —
    for (let px = 0; px <= S; px += 200) {
      for (let py = 0; py <= S; py += 200) {
        // 十字交叉处的4个螺栓
        const offsets = [[-14,-14],[14,-14],[-14,14],[14,14]];
        offsets.forEach(([ox, oy]) => {
          const bx = Phaser.Math.Clamp(px + ox, 6, S - 6);
          const by = Phaser.Math.Clamp(py + oy, 6, S - 6);
          g.fillStyle(0x253b4d, 0.28);
          g.fillCircle(bx, by, 3);
          g.fillStyle(0x1a2a38, 0.4);
          g.fillCircle(bx, by, 1.5);
        });
      }
    }

    // — Layer 5: 电路纹路 —
    g.lineStyle(1, 0x1ee7b7, 0.06);
    const circuitSeed = [7, 23, 41, 59, 73, 89, 103, 127, 151, 179, 197, 211];
    circuitSeed.forEach((seed) => {
      const sx = (seed * 37) % S;
      const sy = (seed * 53) % S;
      const len = 40 + (seed % 80);
      const horizontal = seed % 3 === 0;
      if (horizontal) {
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(Math.min(sx + len, S - 4), sy); g.strokePath();
        // 小分支
        if (seed % 5 === 0) {
          g.beginPath(); g.moveTo(sx + len * 0.5, sy); g.lineTo(sx + len * 0.5, Math.min(sy + 24, S - 4)); g.strokePath();
        }
      } else {
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, Math.min(sy + len, S - 4)); g.strokePath();
        if (seed % 5 === 0) {
          g.beginPath(); g.moveTo(sx, sy + len * 0.5); g.lineTo(Math.min(sx + 24, S - 4), sy + len * 0.5); g.strokePath();
        }
      }
      // 端点小圆
      g.fillStyle(0x1ee7b7, 0.12);
      g.fillCircle(sx, sy, 2);
    });

    // — Layer 6: 数据主干线 —
    const dataPaths = [[80,80,720,80],[80,400,720,400],[80,200,720,680],[200,720,600,80],[400,40,400,760]];
    dataPaths.forEach(([x1,y1,x2,y2]) => {
      g.lineStyle(1.2, 0x22d3ee, 0.05);
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
      // 伴随虚线
      g.lineStyle(0.6, 0x67e8f9, 0.04);
      g.beginPath(); g.moveTo(x1 + 6, y1 - 4); g.lineTo(x2 + 6, y2 - 4); g.strokePath();
    });

    // — Layer 7: 磨损痕迹 —
    for (let i = 0; i < 8; i++) {
      const wx = 40 + ((i * 137 + 61) % (S - 80));
      const wy = 40 + ((i * 193 + 37) % (S - 80));
      const wr = 12 + (i % 3) * 10;
      g.fillStyle(0x0a1118, 0.12 + (i % 3) * 0.04);
      g.fillEllipse(wx, wy, wr, wr * 0.6);
      if (i % 2 === 0) {
        // 划痕
        g.lineStyle(0.6, 0x0d1520, 0.2);
        g.beginPath();
        g.moveTo(wx - wr, wy - 2); g.lineTo(wx + wr * 0.6, wy + 1);
        g.strokePath();
      }
    }

    // — Layer 8: 警示区标记（四角） —
    const corners = [[40,40],[S-40,40],[40,S-40],[S-40,S-40]];
    corners.forEach(([cx, cy]) => {
      g.lineStyle(1, 0xf59e0b, 0.05);
      // L形角标
      g.beginPath(); g.moveTo(cx-16, cy-16); g.lineTo(cx-16, cy-4); g.lineTo(cx-4, cy-4); g.strokePath();
      g.beginPath(); g.moveTo(cx+16, cy-16); g.lineTo(cx+16, cy-4); g.lineTo(cx+4, cy-4); g.strokePath();
      g.beginPath(); g.moveTo(cx-16, cy+16); g.lineTo(cx-16, cy+4); g.lineTo(cx-4, cy+4); g.strokePath();
      g.beginPath(); g.moveTo(cx+16, cy+16); g.lineTo(cx+16, cy+4); g.lineTo(cx+4, cy+4); g.strokePath();
    });

    g.generateTexture('floor_tile', S, S);
    g.destroy();
  }

  /* ========== 宇宙星场纹理生成 ========== */

  private generateStarfieldTexture() {
    if (this.textures.exists('starfield_deep')) return;
    const S = 1024;
    const g = this.add.graphics();

    // —— 深层星场（稀疏小星点） ——
    g.fillStyle(0x050a14);
    g.fillRect(0, 0, S, S);
    const starColors = [0xffffff, 0xaaccff, 0x8899cc, 0xbbddff, 0x667799];
    for (let i = 0; i < 400; i++) {
      const sx = Phaser.Math.Between(0, S);
      const sy = Phaser.Math.Between(0, S);
      const sr = Phaser.Math.FloatBetween(0.3, 1.8);
      const ci = Phaser.Math.Between(0, starColors.length - 1);
      g.fillStyle(starColors[ci], Phaser.Math.FloatBetween(0.15, 0.7));
      g.fillCircle(sx, sy, sr);
      // 亮星加十字光芒
      if (i % 40 === 0 && sr > 1.2) {
        g.fillStyle(starColors[ci], 0.15);
        g.fillRect(sx - sr * 3, sy - 0.3, sr * 6, 0.6);
        g.fillRect(sx - 0.3, sy - sr * 3, 0.6, sr * 6);
      }
    }
    g.generateTexture('starfield_deep', S, S);
    g.clear();

    // —— 浅层星场（稍大、稍密的星点+星云斑块） ——
    g.fillStyle(0x060b18);
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) {
      const sx = Phaser.Math.Between(0, S);
      const sy = Phaser.Math.Between(0, S);
      const sr = Phaser.Math.FloatBetween(0.4, 2.2);
      const ci = Phaser.Math.Between(0, starColors.length - 1);
      g.fillStyle(starColors[ci], Phaser.Math.FloatBetween(0.2, 0.8));
      g.fillCircle(sx, sy, sr);
      if (i % 30 === 0 && sr > 1.4) {
        g.fillStyle(starColors[ci], 0.2);
        g.fillRect(sx - sr * 4, sy - 0.4, sr * 8, 0.8);
        g.fillRect(sx - 0.4, sy - sr * 4, 0.8, sr * 8);
      }
    }
    // 稀薄星云斑块
    for (let i = 0; i < 5; i++) {
      const nx = Phaser.Math.Between(100, S - 100);
      const ny = Phaser.Math.Between(100, S - 100);
      const nr = Phaser.Math.Between(60, 130);
      g.fillStyle(0x1a2255, 0.04);
      g.fillCircle(nx, ny, nr);
      g.fillStyle(0x221144, 0.03);
      g.fillCircle(nx + Phaser.Math.Between(-30, 30), ny + Phaser.Math.Between(-30, 30), nr * 0.7);
    }
    g.generateTexture('starfield_near', S, S);
    g.destroy();
  }

  private createShootingStars() {
    const w = WORLD_WIDTH;
    const h = WORLD_HEIGHT;
    this.time.addEvent({
      delay: Phaser.Math.Between(3000, 7000),
      loop: true,
      callback: () => {
        const sx = Phaser.Math.Between(w * 0.1, w * 0.9);
        const sy = Phaser.Math.Between(h * 0.05, h * 0.3);
        const ex = sx + Phaser.Math.Between(-200, 200);
        const ey = sy + Phaser.Math.Between(300, 600);
        const line = this.add.line(0, 0, sx, sy, ex, ey, 0xffffff, 0)
          .setDepth(-28).setLineWidth(1.5);
        this.tweens.add({
          targets: line,
          alpha: 0.6,
          duration: 600,
          yoyo: true,
          ease: 'Quad.easeIn',
          onComplete: () => {
            this.tweens.add({
              targets: line, alpha: 0, duration: 400,
              onComplete: () => line.destroy()
            });
          }
        });
      }
    });
  }

  private createTwinklingStars() {
    const w = WORLD_WIDTH;
    const h = WORLD_HEIGHT;
    const colors = [0xaaccff, 0xffffff, 0x8899cc, 0xccddff];
    for (let i = 0; i < 50; i++) {
      const sx = Phaser.Math.Between(20, w - 20);
      const sy = Phaser.Math.Between(20, h - 20);
      const sr = Phaser.Math.FloatBetween(0.5, 2.5);
      const dot = this.add.circle(sx, sy, sr,
        colors[Phaser.Math.Between(0, colors.length - 1)],
        Phaser.Math.FloatBetween(0.1, 0.5)
      ).setDepth(-30);
      this.tweens.add({
        targets: dot,
        alpha: 0.05,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: Phaser.Math.Between(1500, 4000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 3000)
      });
    }
  }

  /* ========== WORLD SETUP ========== */

  private createWorld() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 纯宇宙星空背景
    this.generateStarfieldTexture();
    this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 'starfield_deep')
      .setDepth(-36).setAlpha(0.6).setData('scrollSpeed', 0.03);
    this.add.tileSprite(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 'starfield_near')
      .setDepth(-35).setAlpha(0.8).setData('scrollSpeed', 0.07);

    // 动态流星点缀（每2-6秒随机划过）
    this.createShootingStars();
    // 闪烁星点
    this.createTwinklingStars();
    // 宇宙边界（非常微淡）
    this.createBoundaryHazards(-28);
    this.createBoundaryForcefield(-27);

    // 选中角色精灵优先，AI通用精灵次之，原始精灵兜底
    const charTex = this.textures.exists(this.selectedCharacter) ? this.selectedCharacter
      : this.textures.exists('player_ai') ? 'player_ai' : 'player';
    this.player = this.physics.add.image(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, charTex);
    this.player.setDisplaySize(85, 85);
    this.player.setCircle(PLAYER_RADIUS);
    this.player.setDepth(20);
    this.player.setCollideWorldBounds(true);

    // 玩家脚下投影（立体感）
    this.playerShadow = this.add.ellipse(0, 0, 58, 21, 0x000000, 0.22).setDepth(19);

    // 玩家呼吸脉冲动画
    const pBaseSX = this.player.scaleX;
    const pBaseSY = this.player.scaleY;
    this.tweens.add({
      targets: this.player,
      scaleX: pBaseSX * 1.03,
      scaleY: pBaseSY * 1.03,
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    // 玩家能量光环
    this.playerAura = this.add.ellipse(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 93, 93, undefined, 0)
      .setStrokeStyle(2, 0x22ccff, 0.3)
      .setDepth(18);
    this.tweens.add({
      targets: this.playerAura,
      scaleX: 1.12,
      scaleY: 1.12,
      alpha: 0.12,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 推进器粒子纹理
    if (!this.textures.exists('particle_glow')) {
      const pg = this.add.graphics();
      pg.fillStyle(0xffffff, 1);
      pg.fillCircle(4, 4, 4);
      pg.generateTexture('particle_glow', 8, 8);
      pg.destroy();
    }
    // 推进器粒子发射器
    this.thrusterEmitter = this.add.particles(0, 0, 'particle_glow', {
      lifespan: { min: 200, max: 450 },
      speed: { min: 20, max: 80 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: [0x67e8f9, 0x22d3ee, 0x93f4ff],
      emitting: false,
      quantity: 1,
    });
    this.thrusterEmitter.setDepth(17);

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.xpOrbs = this.physics.add.group();
    this.lootDrops = this.physics.add.group();
    this.bossBullets = this.physics.add.group();

    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-ESC', () => {
      if (!this.gameOver && !this.choosingSkill) this.toggleSettingsMenu();
    });

    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
  }

  private createLabDecor() {
    const floorDepth = -32;
    const decorDepth = -25;

    this.createAmbientFloorDetails(floorDepth + 1);
    this.createContainmentCore(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, decorDepth);

    [
      { x: 730, y: 760, w: 920, h: 560, label: 'DATA FARM', tint: 0x1a5c5e },
      { x: 3450, y: 820, w: 860, h: 540, label: 'MODEL VAULT', tint: 0x2e3f7a },
      { x: 1080, y: 2420, w: 900, h: 520, label: 'POWER BAY', tint: 0x5a4815 },
      { x: 3220, y: 2260, w: 860, h: 540, label: 'RED TEAM LAB', tint: 0x5c1e32 }
    ].forEach((zone) => this.createLabZone(zone.x, zone.y, zone.w, zone.h, zone.label, zone.tint, decorDepth));

    this.createServerCluster(520, 590, decorDepth);
    this.createServerCluster(805, 860, decorDepth);
    this.createServerCluster(3320, 700, decorDepth);
    this.createServerCluster(3600, 940, decorDepth);
    this.createPowerBay(1080, 2420, decorDepth);
    this.createRedTeamDesks(3220, 2260, decorDepth);
    this.createIncidentDetails(decorDepth + 3);

    [
      [1460, 1280, 730, 760],
      [2740, 1280, 3450, 820],
      [1460, 1720, 1080, 2420],
      [2740, 1720, 3220, 2260],
      [640, 2070, 1080, 2420],
      [3560, 1860, 3220, 2260]
    ].forEach(([x1, y1, x2, y2]) => this.createCableLine(x1, y1, x2, y2, decorDepth + 1));

    [
      { x: 1620, y: 1500, label: 'LOCK A' },
      { x: 2580, y: 1500, label: 'LOCK B' },
      { x: 2100, y: 1030, label: 'AIRLOCK' },
      { x: 2100, y: 1970, label: 'AIRLOCK' }
    ].forEach((door) => this.createAirlockDoor(door.x, door.y, door.label, decorDepth + 2));

    [
      { x: 420, y: 290 }, { x: 3780, y: 310 }, { x: 410, y: 2720 }, { x: 3760, y: 2700 },
      { x: 1540, y: 980 }, { x: 2680, y: 980 }, { x: 1540, y: 2020 }, { x: 2680, y: 2020 }
    ].forEach((beacon, i) => this.createWarningBeacon(beacon.x, beacon.y, decorDepth + 4, i * 130));

    this.createBoundaryHazards(decorDepth + 2);
    this.createBoundaryForcefield(decorDepth + 3);
  }

  private createAmbientFloorDetails(depth: number) {
    const stains = [
      { x: 1760, y: 1180, r: 74, color: 0x0f766e, alpha: 0.08 },
      { x: 2410, y: 1880, r: 96, color: 0x0f766e, alpha: 0.07 },
      { x: 840, y: 1040, r: 62, color: 0x164e63, alpha: 0.08 },
      { x: 3380, y: 2040, r: 70, color: 0x4c1d1d, alpha: 0.08 }
    ];
    stains.forEach((s) => {
      this.add.circle(s.x, s.y, s.r, s.color, s.alpha).setDepth(depth);
      this.add.circle(s.x + 28, s.y - 18, s.r * 0.42, s.color, s.alpha * 0.75).setDepth(depth);
      this.add.circle(s.x - 34, s.y + 24, s.r * 0.32, s.color, s.alpha * 0.62).setDepth(depth);
    });

    const shadows = [
      { x: 700, y: 730, w: 680, h: 280 },
      { x: 3450, y: 820, w: 620, h: 270 },
      { x: 1070, y: 2420, w: 650, h: 240 },
      { x: 3220, y: 2260, w: 610, h: 260 }
    ];
    shadows.forEach((s) => {
      this.add.rectangle(s.x, s.y + 70, s.w, s.h, 0x02060a, 0.16)
        .setDepth(depth);
    });

    // 地面标记碎片 (增加到60个，多样化)
    for (let i = 0; i < 60; i++) {
      const x = 120 + ((i * 211) % (WORLD_WIDTH - 240));
      const y = 120 + ((i * 337) % (WORLD_HEIGHT - 240));
      const detailType = i % 5;
      if (detailType === 0) {
        // 地板裂缝
        this.add.rectangle(x, y, 38 + (i % 3) * 12, 5, 0x0a1620, 0.3)
          .setRotation((i % 7 - 3) * 0.1)
          .setDepth(depth);
      } else if (detailType === 1) {
        // 数据流痕迹 (青色短线)
        this.add.rectangle(x, y, 22 + (i % 3) * 10, 3, 0x22d3ee, 0.15)
          .setRotation((i % 8) * 0.15)
          .setDepth(depth);
      } else if (detailType === 2) {
        // 火花残痕 (橙色小点)
        this.add.circle(x, y, 4 + (i % 2) * 2, 0xf59e0b, 0.12).setDepth(depth);
        this.add.circle(x + 8, y - 5, 3, 0xf59e0b, 0.08).setDepth(depth);
      } else if (detailType === 3) {
        // 电缆碎片
        this.add.rectangle(x, y, 28 + (i % 2) * 14, 3, 0x1f2937, 0.25)
          .setRotation((i % 4) * 0.25)
          .setDepth(depth);
      } else {
        // 烧焦痕迹
        this.add.ellipse(x, y, 18 + (i % 3) * 8, 14, 0x1a0a05, 0.15)
          .setDepth(depth);
      }
    }
    // 数据流动画：电缆线上的光点
    const cablePaths = [
      [1460, 1280, 730, 760], [2740, 1280, 3450, 820],
      [1460, 1720, 1080, 2420], [2740, 1720, 3220, 2260],
      [640, 2070, 1080, 2420], [3560, 1860, 3220, 2260]
    ];
    cablePaths.forEach(([x1, y1, x2, y2]) => {
      for (let j = 0; j < 2; j++) {
        const dot = this.add.circle(x1, y1, 3, j === 0 ? 0x67e8f9 : 0xfacc15, 0.6).setDepth(depth + 2);
        dot.setData('path', { x1, y1, x2, y2, t: j * 0.5 });
        this.dataFlowDots.push(dot);
      }
    });
  }

  private createLabZone(x: number, y: number, w: number, h: number, label: string, tint: number, depth: number) {
    this.add.rectangle(x, y, w, h, tint, 0.11)
      .setStrokeStyle(2, 0x38bdf8, 0.08)
      .setDepth(depth - 2);
    this.add.rectangle(x, y - h / 2 + 34, w - 80, 34, 0x061018, 0.52)
      .setStrokeStyle(1, 0x38bdf8, 0.16)
      .setDepth(depth);
    this.add.text(x - w / 2 + 62, y - h / 2 + 20, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '18px',
      color: '#8df7ff'
    }).setDepth(depth + 1).setAlpha(0.56);

    for (let i = 0; i < 4; i++) {
      const sx = x - w / 2 + 80 + i * ((w - 160) / 3);
      this.add.rectangle(sx, y + h / 2 - 46, 92, 10, 0xb98524, i % 2 === 0 ? 0.26 : 0.12)
        .setDepth(depth + 1);
    }
  }

  private createContainmentCore(x: number, y: number, depth: number) {
    this.add.circle(x, y, 310, 0x02060a, 0.28).setDepth(depth - 3);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const panelX = x + Math.cos(a) * 255;
      const panelY = y + Math.sin(a) * 255;
      this.add.rectangle(panelX, panelY, 112, 20, i % 2 === 0 ? 0x0d2a36 : 0x07111a, 0.3)
        .setRotation(a)
        .setDepth(depth - 1);
    }

    const outer = this.add.circle(x, y, 220, 0x07111a, 0.2)
      .setStrokeStyle(4, 0x22d3ee, 0.22)
      .setDepth(depth);
    const middle = this.add.circle(x, y, 150, 0x0b2530, 0.16)
      .setStrokeStyle(3, 0x67e8f9, 0.18)
      .setDepth(depth + 1);
    const inner = this.add.circle(x, y, 78, 0x061018, 0.5)
      .setStrokeStyle(2, 0x8df7ff, 0.28)
      .setDepth(depth + 2);

    this.tweens.add({ targets: outer, scale: 1.04, alpha: 0.28, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: middle, scale: 0.96, alpha: 0.34, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = x + Math.cos(a) * 186;
      const py = y + Math.sin(a) * 186;
      this.add.rectangle(px, py, 72, 12, 0xb98524, 0.22)
        .setRotation(a)
        .setDepth(depth + 2);
    }

    this.add.text(x, y + 242, 'CONTAINMENT CORE', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      color: '#8df7ff'
    }).setOrigin(0.5).setDepth(depth + 3).setAlpha(0.72);
    this.add.text(x, y + 266, 'AI MODEL QUARANTINE // STATUS: BREACH', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
      color: '#c7797f'
    }).setOrigin(0.5).setDepth(depth + 3).setAlpha(0.46);

    this.createBrokenGlass(x - 286, y - 180, depth + 2, 0.18);
    this.createBrokenGlass(x + 286, y + 160, depth + 2, -0.12);
  }

  private createServerCluster(x: number, y: number, depth: number) {
    for (let i = 0; i < 4; i++) {
      const rackX = x + i * 58;
      this.add.rectangle(rackX, y, 42, 132, 0x08121b, 0.88)
        .setStrokeStyle(2, 0x1f5f73, 0.52)
        .setDepth(depth + 1);
      for (let j = 0; j < 5; j++) {
        const led = this.add.circle(rackX - 10 + (j % 2) * 18, y - 45 + j * 18, 3, j % 3 === 0 ? 0xb84a55 : 0x34d399, 0.42)
          .setDepth(depth + 2);
        this.tweens.add({ targets: led, alpha: 0.12, duration: 900 + j * 120, yoyo: true, repeat: -1 });
      }
      this.add.rectangle(rackX, y - 66, 28, 5, 0x8df7ff, 0.1).setDepth(depth + 2);
    }
    this.add.rectangle(x + 86, y + 84, 260, 8, 0x22d3ee, 0.1).setDepth(depth);
  }

  private createPowerBay(x: number, y: number, depth: number) {
    for (let i = 0; i < 5; i++) {
      const coilX = x - 230 + i * 115;
      this.add.circle(coilX, y + 10, 42, 0x120f05, 0.9)
        .setStrokeStyle(3, 0xf59e0b, 0.42)
        .setDepth(depth + 1);
      this.add.circle(coilX, y + 10, 22, 0xfacc15, 0.12).setDepth(depth + 2);
    }
    this.add.rectangle(x, y - 120, 620, 18, 0xf59e0b, 0.2).setDepth(depth + 1);
  }

  private createRedTeamDesks(x: number, y: number, depth: number) {
    for (let i = 0; i < 4; i++) {
      const deskX = x - 210 + i * 140;
      this.add.rectangle(deskX, y + 20, 100, 58, 0x16080d, 0.88)
        .setStrokeStyle(2, 0xb84a55, 0.16)
        .setDepth(depth + 1);
      this.add.rectangle(deskX, y - 28, 70, 36, 0x070b10, 0.92)
        .setStrokeStyle(2, 0xb84a55, 0.22)
        .setDepth(depth + 2);
      this.add.rectangle(deskX, y - 28, 48, 5, 0xb84a55, 0.18).setDepth(depth + 3);
      this.add.text(deskX - 20, y - 32, 'SIM', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '8px',
        color: '#c7797f'
      }).setDepth(depth + 4).setAlpha(0.34);
    }
  }

  private createIncidentDetails(depth: number) {
    [
      { x: 1280, y: 1340, rot: 0.2 },
      { x: 2930, y: 1280, rot: -0.16 },
      { x: 1640, y: 2140, rot: -0.28 },
      { x: 2780, y: 2100, rot: 0.18 }
    ].forEach((spill) => {
      this.add.ellipse(spill.x, spill.y, 96, 30, 0x0f766e, 0.13)
        .setRotation(spill.rot)
        .setDepth(depth);
      this.add.ellipse(spill.x + 42, spill.y + 12, 54, 16, 0x2dd4bf, 0.08)
        .setRotation(spill.rot)
        .setDepth(depth + 1);
    });

    [
      { x: 1510, y: 940 }, { x: 2700, y: 960 }, { x: 1510, y: 2050 }, { x: 2700, y: 2050 }
    ].forEach((screen, i) => {
      const body = this.add.rectangle(screen.x, screen.y, 92, 54, 0x050b11, 0.78)
        .setStrokeStyle(1, 0x38bdf8, 0.2)
        .setDepth(depth);
      const scan = this.add.rectangle(screen.x, screen.y - 8, 66, 4, i % 2 === 0 ? 0x22d3ee : 0xb84a55, 0.18)
        .setDepth(depth + 1);
      this.tweens.add({ targets: scan, y: screen.y + 14, alpha: 0.04, duration: 1100 + i * 180, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: body, alpha: 0.58, duration: 1600 + i * 120, yoyo: true, repeat: -1 });
    });

    [
      { x: 1180, y: 1260 }, { x: 3000, y: 1320 }, { x: 1700, y: 1980 }, { x: 2500, y: 2040 }
    ].forEach((cable, i) => {
      this.add.rectangle(cable.x, cable.y, 120, 8, 0x0f2a36, 0.28)
        .setRotation(i % 2 === 0 ? 0.35 : -0.32)
        .setDepth(depth);
      this.add.circle(cable.x + 58, cable.y + 18, 10, 0x0f2a36, 0.22).setDepth(depth);
    });
  }

  private createBrokenGlass(x: number, y: number, depth: number, rotation: number) {
    this.add.rectangle(x, y, 150, 78, 0x07111a, 0.24)
      .setStrokeStyle(1, 0x8df7ff, 0.12)
      .setRotation(rotation)
      .setDepth(depth);
    const cracks = [
      [-48, -18, -10, 4],
      [-10, 4, 36, -24],
      [-10, 4, 30, 28],
      [8, 2, 58, 4],
      [-12, 6, -38, 28]
    ];
    cracks.forEach(([x1, y1, x2, y2]) => {
      this.add.line(0, 0, x + x1, y + y1, x + x2, y + y2, 0x8df7ff, 0.14)
        .setOrigin(0)
        .setDepth(depth + 1);
    });
  }

  private createCableLine(x1: number, y1: number, x2: number, y2: number, depth: number) {
    this.add.line(0, 0, x1, y1, x2, y2, 0x22d3ee, 0.08).setOrigin(0).setDepth(depth);
    this.add.line(0, 0, x1, y1 + 9, x2, y2 + 9, 0x14b8a6, 0.05).setOrigin(0).setDepth(depth);
    this.add.line(0, 0, x1, y1 - 9, x2, y2 - 9, 0xb98524, 0.035).setOrigin(0).setDepth(depth);
  }

  private createAirlockDoor(x: number, y: number, label: string, depth: number) {
    this.add.rectangle(x, y, 210, 54, 0x050b11, 0.92)
      .setStrokeStyle(2, 0x38bdf8, 0.34)
      .setDepth(depth);
    this.add.rectangle(x - 54, y, 72, 38, 0x122434, 0.82).setDepth(depth + 1);
    this.add.rectangle(x + 54, y, 72, 38, 0x122434, 0.82).setDepth(depth + 1);
    this.add.rectangle(x, y, 12, 48, 0xf59e0b, 0.34).setDepth(depth + 2);
    this.add.text(x, y + 42, label, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
      color: '#9fb6c8'
    }).setOrigin(0.5).setDepth(depth + 2).setAlpha(0.72);
  }

  private createWarningBeacon(x: number, y: number, depth: number, delay: number) {
    const glow = this.add.circle(x, y, 34, 0x8f2430, 0.045).setDepth(depth);
    const lamp = this.add.circle(x, y, 8, 0xb84a55, 0.34)
      .setStrokeStyle(2, 0xd68a77, 0.24)
      .setDepth(depth + 1);
    this.tweens.add({ targets: glow, alpha: 0.12, duration: 780, delay, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: lamp, alpha: 0.5, duration: 780, delay, yoyo: true, repeat: -1 });
  }

  private createBoundaryHazards(depth: number) {
    // 宇宙边际：微淡的深空渐变标记，几乎不可见
    const colors = [0x0a1030, 0x060c20];
    for (let i = 0; i < 28; i++) {
      const x = (i % 14) * 300 + 130;
      this.add.rectangle(x, 60, 180, 18, colors[i % 2], 0.12).setDepth(depth);
      this.add.rectangle(x, WORLD_HEIGHT - 60, 180, 18, colors[(i + 1) % 2], 0.12).setDepth(depth);
    }
    for (let i = 0; i < 18; i++) {
      const y = i * 160 + 120;
      this.add.rectangle(55, y, 18, 110, colors[i % 2], 0.1).setDepth(depth);
      this.add.rectangle(WORLD_WIDTH - 55, y, 18, 110, colors[(i + 1) % 2], 0.1).setDepth(depth);
    }
  }

  private createBoundaryForcefield(depth: number) {
    const wallAlpha = 0.06;
    const wallColor = 0x1a1050;
    // 四条几乎不可见的深空边界
    const walls = [
      this.add.rectangle(WORLD_WIDTH / 2, 20, WORLD_WIDTH, 40, wallColor, wallAlpha).setDepth(depth),
      this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT - 20, WORLD_WIDTH, 40, wallColor, wallAlpha).setDepth(depth),
      this.add.rectangle(20, WORLD_HEIGHT / 2, 40, WORLD_HEIGHT, wallColor, wallAlpha).setDepth(depth),
      this.add.rectangle(WORLD_WIDTH - 20, WORLD_HEIGHT / 2, 40, WORLD_HEIGHT, wallColor, wallAlpha).setDepth(depth),
    ];
    walls.forEach((wall, i) => {
      this.tweens.add({
        targets: wall,
        alpha: 0.03,
        duration: 3000 + i * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });
  }

  /* ========== HUD ========== */

  private createHud() {
    const panelX = 10;
    const panelW = 210;
    const panelTop = 8;
    const rowH = 28;
    const rows = 6;
    const panelH = panelTop + rowH * rows + 12;

    // 面板背景
    this.add.rectangle(panelX + panelW / 2, panelH / 2, panelW, panelH, 0x060e1a, 0.82)
      .setStrokeStyle(1, 0x22d3ee, 0.5)
      .setScrollFactor(0)
      .setDepth(95);
    // 顶部标题栏
    this.add.rectangle(panelX + panelW / 2, panelTop + 14, panelW, 28, 0x0b1a30, 0.9)
      .setStrokeStyle(1, 0x67e8f9, 0.4)
      .setScrollFactor(0)
      .setDepth(96);

    const ts = (y: number, sz: number, color: string): Phaser.GameObjects.Text =>
      this.add.text(panelX + panelW / 2, y, '', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif',
        fontSize: `${sz}px`, color, stroke: '#000000', strokeThickness: 3
      }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    const line0Y = panelTop + 8;
    const line1Y = panelTop + 34;
    const line2Y = line1Y + rowH;
    const line3Y = line2Y + rowH;
    const line4Y = line3Y + rowH;
    const line5Y = line4Y + rowH;

    // 标题
    this.add.text(panelX + panelW / 2, line0Y, 'AI 失控实验室', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '13px', color: '#67e8f9', stroke: '#000000', strokeThickness: 2
    }).setScrollFactor(0).setDepth(100).setOrigin(0.5, 0);

    this.hud = {
      brand: ts(line0Y, 13, '#67e8f9'), // unused ref
      objective: ts(line1Y, 12, '#9fb6c8'), // unused
      hp: ts(line1Y, 14, '#f87171'),
      level: ts(line2Y, 14, '#e2e8f0'),
      xp: ts(line3Y, 14, '#67e8f9'),
      time: ts(line4Y, 14, '#facc15'),
      stats: ts(line5Y, 11, '#94a3b8'),
      gold: this.add.text(this.scale.width - 16, 16, '', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif',
        fontSize: '15px', color: '#facc15', stroke: '#000', strokeThickness: 4
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(100),
      message: this.add
        .text(this.scale.width / 2, 10, '', {
          fontFamily: 'Microsoft YaHei, Arial, sans-serif',
          fontSize: '12px', color: '#94a3b8', stroke: '#000000', strokeThickness: 2
        })
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(100),
      bossHp: this.add.text(0, 0, '', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif',
        fontSize: '15px', color: '#ff6b8a', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setVisible(false),
      bossBarBg: this.add.rectangle(0, 0, 320, 12, 0x111827, 0.9)
        .setScrollFactor(0).setDepth(100).setVisible(false),
      bossBar: this.add.rectangle(0, 0, 320, 12, 0xff1744, 1)
        .setScrollFactor(0).setDepth(101).setVisible(false),
    };

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.hud.message.setX(size.width / 2);
      this.hud.message.setY(size.width < 760 ? 180 : 10);
      this.hud.gold.setX(size.width - 16);
      this.hud.gold.setY(16);
      this.layoutBossHud();
      this.layoutCommercialButtons();
    });

    this.hud.gold.setX(this.scale.width - 16);
    this.hud.gold.setY(16);
    this.layoutCommercialButtons();

    // 设置按钮（右下角）
    const gearBtn = this.add.text(this.scale.width - 38, this.scale.height - 38, '⚙', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      color: '#475569',
      stroke: '#000',
      strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setInteractive({ useHandCursor: true });

    gearBtn.on('pointerover', () => gearBtn.setColor('#94a3b8'));
    gearBtn.on('pointerout', () => gearBtn.setColor('#475569'));
    gearBtn.on('pointerdown', () => this.toggleSettingsMenu());

    this.scale.on('resize', () => {
      gearBtn.setPosition(this.scale.width - 38, this.scale.height - 38);
      if (this.settingsMenuOpen) {
        this.closeSettingsMenu();
      }
    });
  }

  private layoutBossHud() {
    const w = this.scale.width;
    this.hud.bossHp.setPosition(w / 2, 60);
    this.hud.bossBarBg.setPosition(w / 2, 82);
    this.hud.bossBar.setPosition(w / 2 - 160, 82);
    this.hud.bossBar.setOrigin(0, 0.5);
  }

  private createCommercialMock() {
    const buttonConfigs = [
      { label: 'AI 赞助升级', action: () => this.tryAdUpgrade() },
      { label: '算力双倍', action: () => this.toggleDoubleXp() },
      { label: '研究通行证', action: () => this.showBattlePassMock() }
    ];

    this.commercialButtons = [];
    buttonConfigs.forEach((config) => {
      const bg = this.add.rectangle(0, 0, 156, 36, 0x061018, 0.86)
        .setStrokeStyle(2, 0x22d3ee, 0.62).setScrollFactor(0).setDepth(100)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(0, 0, config.label, {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '14px', color: '#e0faff'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(101);

      bg.on('pointerover', () => bg.setFillStyle(0x103444, 0.98));
      bg.on('pointerout', () => bg.setFillStyle(0x061018, 0.86));
      bg.on('pointerdown', config.action);
      this.commercialButtons.push(bg, label);
    });

    this.layoutCommercialButtons();
  }

  private layoutCommercialButtons() {
    for (let i = 0; i < this.commercialButtons.length; i += 2) {
      const row = i / 2;
      const narrow = this.scale.width < 760;
      const x = narrow ? this.scale.width - 84 : this.scale.width - 106;
      const y = narrow ? this.scale.height - 126 + row * 42 : 24 + row * 44;
      const scale = narrow ? 0.84 : 1;
      (this.commercialButtons[i] as Phaser.GameObjects.Rectangle).setPosition(x, y).setScale(scale);
      (this.commercialButtons[i + 1] as Phaser.GameObjects.Text).setPosition(x, y).setScale(scale);
    }
  }

  /* ========== SETTINGS MENU ========== */

  private toggleSettingsMenu() {
    if (this.settingsMenuOpen) {
      this.closeSettingsMenu();
    } else {
      this.openSettingsMenu();
    }
  }

  private openSettingsMenu() {
    this.settingsMenuOpen = true;
    const w = this.scale.width;
    const items: Phaser.GameObjects.GameObject[] = [];
    const D = 250;

    // 半透明遮罩（点击关闭）
    const overlay = this.add.rectangle(0, 0, w, this.scale.height, 0x000000, 0.3)
      .setOrigin(0).setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: false });
    overlay.on('pointerdown', () => this.closeSettingsMenu());
    items.push(overlay);

    // 菜单面板（右下角，向上展开）
    const menuX = w - 110;
    const menuY = this.scale.height - 96;
    const panel = this.add.rectangle(menuX, menuY, 140, 142, 0x0b1721, 0.95)
      .setStrokeStyle(1, 0x22d3ee, 0.5)
      .setScrollFactor(0).setDepth(D + 1);
    items.push(panel);

    const btnStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '16px',
      color: '#cbd7e3',
      stroke: '#000',
      strokeThickness: 3
    };

    // 暂停按钮
    const isPaused = this.physics.world.isPaused;
    const pauseLabel = isPaused ? '▶  继续游戏' : '⏸  暂停游戏';
    items.push(...this.createMenuItem(menuX, menuY - 52, pauseLabel, btnStyle, D, () => {
      if (this.physics.world.isPaused) {
        this.physics.world.resume();
      } else {
        this.physics.world.pause();
      }
      this.closeSettingsMenu();
    }));

    // 重新开始按钮
    items.push(...this.createMenuItem(menuX, menuY - 4, '↻  重新开始', btnStyle, D, () => {
      this.closeSettingsMenu();
      this.time.delayedCall(200, () => this.scene.restart());
    }));

    // 返回标题按钮
    items.push(...this.createMenuItem(menuX, menuY + 44, '⏏  返回标题', btnStyle, D, () => {
      this.closeSettingsMenu();
      this.time.delayedCall(200, () => {
        this.scene.start('TitleScene');
      });
    }));

    this.settingsMenuItems = items;
  }

  private createMenuItem(
    x: number, y: number, label: string,
    style: Phaser.Types.GameObjects.Text.TextStyle, depth: number,
    callback: () => void
  ): Phaser.GameObjects.GameObject[] {
    const btnW = 128;
    const btnH = 38;
    const bg = this.add.rectangle(x, y, btnW, btnH, 0x1e293b, 0.85)
      .setStrokeStyle(1, 0x334155, 0.5)
      .setScrollFactor(0).setDepth(depth + 2)
      .setInteractive({ useHandCursor: true });

    const txt = this.add.text(x, y, label, style)
      .setOrigin(0.5).setScrollFactor(0).setDepth(depth + 3);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x0e7490, 1);
      bg.setStrokeStyle(1, 0x67e8f9, 0.7);
      txt.setColor('#ffffff');
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x1e293b, 0.85);
      bg.setStrokeStyle(1, 0x334155, 0.5);
      txt.setColor('#cbd7e3');
    });
    bg.on('pointerdown', callback);

    return [bg, txt];
  }

  private closeSettingsMenu() {
    this.settingsMenuOpen = false;
    this.settingsMenuItems.forEach((el) => el.destroy());
    this.settingsMenuItems = [];
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
      case 'boss': {
        if (this.bossPool.length === 0) {
          this.bossPool = ['boss_demon', 'boss_eye', 'boss_reaper'];
          Phaser.Math.RND.shuffle(this.bossPool);
        }
        return { hpMul: 75, speedMul: 0.6, damageMul: 3, tex: this.bossPool.pop()! };
      }
      default: return { hpMul: 1, speedMul: 1, damageMul: 1, tex: 'enemy' };
    }
  }

  private spawnEnemyAt(x: number, y: number, variant: EnemyVariant) {
    const cfg = this.getEnemyConfig(variant);
    const timeScale = 1 + (this.elapsedMs / 1000) * 0.006;
    const baseHp = Math.floor((38 + Math.floor(this.level / 3) * 10) * timeScale);
    const baseDmg = Math.floor((8 + Math.floor(this.level / 5) * 2) * timeScale);
    const baseSpd = Math.floor((66 + Math.min(this.level * 2, 42)) * (1 + timeScale * 0.08));

    const diffMul = this.difficulty;
    const diff = DIFFICULTY_MULT[diffMul];
    const hpMult = variant === 'boss' ? diff.bossHp : diff.hp;

    const enemy = this.enemies.create(x, y, cfg.tex) as Phaser.Physics.Arcade.Image;
    enemy.setData('hp', Math.floor(baseHp * cfg.hpMul * hpMult));
    enemy.setData('maxHp', Math.floor(baseHp * cfg.hpMul * hpMult));
    enemy.setData('damage', Math.floor(baseDmg * cfg.damageMul));
    enemy.setData('speed', Math.floor(baseSpd * cfg.speedMul));
    enemy.setData('variant', variant);
    enemy.setData('isBoss', variant === 'boss');

    if (variant === 'boss') {
      enemy.setDisplaySize(512, 512);
      enemy.setCircle(BOSS_SIZE / 2);
      enemy.setDepth(12);
      // Boss投影
      const bShadow = this.add.ellipse(x, y + 19, 280, 85, 0x000000, 0.3).setDepth(11);
      enemy.setData('shadow', bShadow);
      // 呼吸脉冲动画
      const baseSX = enemy.scaleX;
      const baseSY = enemy.scaleY;
      this.tweens.add({
        targets: enemy,
        scaleX: baseSX * 1.06,
        scaleY: baseSY * 1.06,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      // 光环
      const auraRing = this.add.ellipse(x, y, 587, 587, undefined, 0)
        .setStrokeStyle(3, 0xff4444, 0.35)
        .setDepth(11);
      enemy.setData('auraRing', auraRing);
      this.tweens.add({
        targets: auraRing,
        scaleX: 1.2,
        scaleY: 1.2,
        alpha: 0.15,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    } else {
      const sz = variant === 'tank' ? 96 : variant === 'elite' ? 88 : 80;
      enemy.setDisplaySize(sz, sz);
      enemy.setDepth(10);
      // 敌人投影（带颜色偏移增强立体感）
      const glowColors: Record<string, number> = {
        normal: 0xff2244, fast: 0xff8800, tank: 0xfbbf24, elite: 0xa855f7
      };
      const glowColor = glowColors[variant] || 0xff2244;
      const eShadow = this.add.ellipse(x, y + 6, sz * 0.75, sz * 0.32, 0x000000, 0.28).setDepth(9);
      enemy.setData('shadow', eShadow);
      // 底部彩色光晕（防止与背景同化）
      const eGlow = this.add.ellipse(x, y + 2, sz * 0.85, sz * 0.85, glowColor, 0.12)
        .setDepth(8);
      enemy.setData('glow', eGlow);
      // 敌人体型呼吸脉冲
      const eBaseSX = enemy.scaleX;
      const eBaseSY = enemy.scaleY;
      this.tweens.add({
        targets: enemy,
        scaleX: eBaseSX * 1.04,
        scaleY: eBaseSY * 1.04,
        duration: Phaser.Math.Between(800, 1400),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
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
    const baseInterval = Math.max(360, 1100 - this.level * 45);
    const dif = DIFFICULTY_MULT[this.difficulty];
    const spawnInterval = (this.waveActive ? Math.max(120, baseInterval / 4) : baseInterval) * dif.spawnRate;
    while (this.spawnElapsed >= spawnInterval) {
      this.spawnElapsed -= spawnInterval;
      this.spawnEnemy();
      // 难度数量倍率：概率性额外生成
      let extraCount = Math.floor(dif.count);
      if (Math.random() < dif.count - Math.floor(dif.count)) extraCount++;
      for (let i = 0; i < extraCount - 1; i++) {
        this.spawnEnemy();
      }
    }
  }

  /* ========== BOSS SYSTEM ========== */

  private updateBossSpawn() {
    if (this.bossActive || this.bossElapsed < BOSS_INTERVAL_MS) return;
    this.bossElapsed = 0;
    this.bossActive = true;

    const pos = this.spawnPosition();
    const boss = this.spawnEnemyAt(pos.x, pos.y, 'boss');

    if (this.firstBoss) {
      this.firstBoss = false;
      const halfHp = Math.floor(boss.getData('hp') as number / 2);
      boss.setData('hp', halfHp);
      boss.setData('maxHp', halfHp);
    }

    this.showBossAlert();

    this.hud.bossHp.setVisible(true);
    this.hud.bossBarBg.setVisible(true);
    this.hud.bossBar.setVisible(true);
    this.layoutBossHud();
  }

  private showBossAlert() {
    const w = this.scale.width;
    const txt = this.add.text(w / 2, this.scale.height / 2 - 100, '警报: 失控核心上线', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '40px', color: '#ff6b8a', stroke: '#000', strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(400);

    this.tweens.add({
      targets: txt, scale: 1.2, alpha: 0, duration: 2000,
      ease: 'Sine.easeOut', onComplete: () => txt.destroy()
    });

    // 红色警报闪烁：全屏红色覆盖
    const alertFlash = this.add.rectangle(w / 2, this.scale.height / 2, w, this.scale.height, 0xff0000, 0)
      .setScrollFactor(0).setDepth(395);
    this.tweens.add({
      targets: alertFlash,
      alpha: 0.08,
      duration: 200,
      yoyo: true,
      repeat: 3,
      onComplete: () => alertFlash.destroy()
    });
  }

  /* ========== BOSS ATTACK ========== */

  private getBoss(): Phaser.Physics.Arcade.Image | null {
    let boss: Phaser.Physics.Arcade.Image | null = null;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (enemy.active && enemy.getData('isBoss') && !enemy.getData('dying')) boss = enemy;
    });
    return boss;
  }

  private trackBossAttackObj<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.bossAttackObjs.push(obj);
    return obj;
  }

  private destroyBossAttackObj(obj: Phaser.GameObjects.GameObject) {
    this.tweens.killTweensOf(obj);
    obj.destroy();
    this.bossAttackObjs = this.bossAttackObjs.filter((entry) => entry !== obj);
  }

  private clearLaserObjs() {
    this.bossAttackObjs.forEach((o) => {
      this.tweens.killTweensOf(o);
      o.destroy();
    });
    this.bossAttackObjs = [];
  }

  private clearBossAttackEffects() {
    this.clearLaserObjs();
    this.bossPendingEvents.forEach((event) => event.remove(false));
    this.bossPendingEvents = [];
  }

  private scheduleBossEvent(delayMs: number, callback: () => void) {
    const event = this.time.delayedCall(delayMs, () => {
      this.bossPendingEvents = this.bossPendingEvents.filter((entry) => entry !== event);
      callback();
    });
    this.bossPendingEvents.push(event);
  }

  private finishBossAttack(minCooldown = 2200, maxCooldown = 3800) {
    this.bossCasting = false;
    this.bossAttackElapsed = 0;
    this.bossAttackCooldown = Phaser.Math.Between(minCooldown, maxCooldown);
  }

  private updateBossAttack() {
    if (!this.bossActive) {
      this.bossAttackElapsed = 0;
      this.bossAttackCooldown = 4000;
      this.bossCasting = false;
      if (this.bossLaserPhase !== 'idle') {
        this.bossLaserPhase = 'idle';
      }
      this.clearBossAttackEffects();
      return;
    }

    const boss = this.getBoss();
    if (!boss) return;

    // Laser telegraph locks direction at cast start, giving the player time to sidestep.
    if (this.bossLaserPhase === 'telegraph') {
      this.updateLaserTelegraphVisuals(boss);
      if (this.bossAttackElapsed >= BOSS_LASER_TELEGRAPH_MS) {
        this.clearLaserObjs();
        this.bossLaserPhase = 'beam';
        this.bossAttackElapsed = 0;
        this.createLaserBeam(boss);
      }
      return;
    }

    if (this.bossLaserPhase === 'beam') {
      this.checkLaserDamage(boss);
      if (this.bossAttackElapsed >= BOSS_LASER_BEAM_MS) {
        this.clearLaserObjs();
        this.bossLaserPhase = 'idle';
        this.finishBossAttack(2600, 4200);
      }
      return;
    }

    // Idle: wait for cooldown
    if (this.bossCasting) {
      if (this.bossAttackElapsed >= 4200) {
        this.clearBossAttackEffects();
        this.finishBossAttack(1800, 3000);
      }
      return;
    }

    if (this.bossAttackElapsed >= this.bossAttackCooldown) {
      this.bossAttackElapsed = 0;
      this.startNextBossAttack(boss);
    }
  }

  private startNextBossAttack(boss: Phaser.Physics.Arcade.Image) {
    const distance = Phaser.Math.Distance.Between(boss.x, boss.y, this.player.x, this.player.y);
    const allAttacks: BossAttackId[] = ['laser', 'spread', 'mortar', 'spiral', 'ring', 'sweep'];
    const preferred: BossAttackId[] = distance < 280
      ? ['spread', 'mortar', 'sweep', 'spiral', 'ring', 'laser']
      : ['laser', 'ring', 'spiral', 'mortar', 'sweep', 'spread'];
    const candidates = preferred.filter((attack) => attack !== this.bossLastAttack);
    const attack = Phaser.Utils.Array.GetRandom(candidates.length > 0 ? candidates : allAttacks);
    this.bossLastAttack = attack;

    switch (attack) {
      case 'laser':
        this.startLaserTelegraph(boss);
        break;
      case 'mortar':
        this.startMortarBarrage(boss);
        break;
      case 'spread':
        this.fireSpreadVolley(boss);
        break;
      case 'spiral':
        this.fireSpiralBurst(boss);
        break;
      case 'ring':
        this.fireExpandingRing(boss);
        break;
      case 'sweep':
        this.fireSweepFan(boss);
        break;
    }
  }

  private getLaserMaxRange(originX: number, originY: number): number {
    const cos = Math.cos(this.bossLaserAngle);
    const sin = Math.sin(this.bossLaserAngle);
    const distances: number[] = [];
    if (cos > 0.001) distances.push((WORLD_WIDTH - originX) / cos);
    if (cos < -0.001) distances.push(-originX / cos);
    if (sin > 0.001) distances.push((WORLD_HEIGHT - originY) / sin);
    if (sin < -0.001) distances.push(-originY / sin);
    return Math.max(100, Math.min(...distances.filter((value) => value > 0)));
  }

  private startLaserTelegraph(boss: Phaser.Physics.Arcade.Image) {
    this.bossCasting = true;
    this.bossLastAttack = 'laser';
    this.bossLaserPhase = 'telegraph';
    this.bossLaserOriginX = boss.x;
    this.bossLaserOriginY = boss.y;
    this.bossLaserAngle = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);
    this.bossAttackElapsed = 0;
  }

  private updateLaserTelegraphVisuals(boss: Phaser.Physics.Arcade.Image) {
    if (this.bossAttackObjs.length > 0) return;

    const originX = this.bossLaserOriginX || boss.x;
    const originY = this.bossLaserOriginY || boss.y;
    const range = this.getLaserMaxRange(originX, originY);
    const endX = originX + Math.cos(this.bossLaserAngle) * range;
    const endY = originY + Math.sin(this.bossLaserAngle) * range;

    const line = this.add.line(0, 0, originX, originY, endX, endY, 0xff1744, 0.55)
      .setLineWidth(8).setDepth(24);
    const glow = this.add.line(0, 0, originX, originY, endX, endY, 0xff5252, 0.3)
      .setLineWidth(20).setDepth(23);
    this.trackBossAttackObj(line);
    this.trackBossAttackObj(glow);

    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const cx = originX + Math.cos(this.bossLaserAngle) * range * t;
      const cy = originY + Math.sin(this.bossLaserAngle) * range * t;
      const dot = this.add.circle(cx, cy, 7, 0xff1744, 0.35)
        .setStrokeStyle(1, 0xff8a80, 0.5).setDepth(25);
      this.trackBossAttackObj(dot);
    }
  }

  private createLaserBeam(boss: Phaser.Physics.Arcade.Image) {
    const originX = this.bossLaserOriginX || boss.x;
    const originY = this.bossLaserOriginY || boss.y;
    const range = this.getLaserMaxRange(originX, originY);
    const endX = originX + Math.cos(this.bossLaserAngle) * range;
    const endY = originY + Math.sin(this.bossLaserAngle) * range;

    const beam = this.add.line(0, 0, originX, originY, endX, endY, 0xff0000, 0.85)
      .setLineWidth(18).setDepth(26);
    const core = this.add.line(0, 0, originX, originY, endX, endY, 0xff6666, 0.9)
      .setLineWidth(8).setDepth(27);
    this.trackBossAttackObj(beam);
    this.trackBossAttackObj(core);

    const flash = this.add.circle(originX, originY, 20, 0xff0000, 0.6).setDepth(28);
    this.tweens.add({
      targets: flash, scale: 2, alpha: 0, duration: 500,
      ease: 'Sine.easeOut', onComplete: () => flash.destroy()
    });
    this.trackBossAttackObj(flash);
  }

  private checkLaserDamage(boss: Phaser.Physics.Arcade.Image) {
    const bx = this.bossLaserOriginX || boss.x;
    const by = this.bossLaserOriginY || boss.y;
    const range = this.getLaserMaxRange(bx, by);
    // Check if player is close to the laser line
    const px = this.player.x;
    const py = this.player.y;

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

    if (distToLine < BOSS_LASER_DAMAGE_WIDTH && this.contactDamageElapsed >= 500) {
      this.contactDamageElapsed = 0;
      this.stats.hp = Math.max(0, this.stats.hp - 15);
      this.flashPlayerDamage();
      this.showHitText(this.player.x, this.player.y - 20, '-15', '#ff0000');
      if (this.stats.hp <= 0) {
        this.endGame(false);
      }
    }
  }

  private fireSpreadVolley(boss: Phaser.Physics.Arcade.Image) {
    this.bossCasting = true;
    this.bossLastAttack = 'spread';
    const rounds = Phaser.Math.Between(3, 4);
    for (let r = 0; r < rounds; r++) {
      this.scheduleBossEvent(r * 300, () => {
        if (!boss.active || this.gameOver) return;
        this.fireSpreadSingle(boss, r);
      });
    }
    this.scheduleBossEvent(rounds * 300 + 120, () => this.finishBossAttack(2000, 3400));
  }

  private fireSpreadSingle(boss: Phaser.Physics.Arcade.Image, round = 0) {
    const count = 14;
    const speed = 125 + round * 22;
    const offset = round % 2 === 0 ? 0 : Math.PI / count;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + offset + Phaser.Math.FloatBetween(-0.035, 0.035);
      const bullet = this.bossBullets.create(boss.x, boss.y, 'bullet') as Phaser.Physics.Arcade.Image;
      bullet.setTint(0xff1744);
      bullet.setScale(1.35);
      bullet.setCircle(5);
      bullet.setDepth(18);
      bullet.setData('lifeMs', 8500);
      bullet.setData('damage', 9);
      this.physics.velocityFromRotation(angle, speed, bullet.body!.velocity);
    }
  }

  private startMortarBarrage(boss: Phaser.Physics.Arcade.Image) {
    this.bossCasting = true;
    this.bossLastAttack = 'mortar';
    this.bossAttackElapsed = 0;

    const count = Phaser.Math.Between(4, 6);
    for (let i = 0; i < count; i++) {
      const delay = i * 130;
      const x = Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-190, 190), 70, WORLD_WIDTH - 70);
      const y = Phaser.Math.Clamp(this.player.y + Phaser.Math.Between(-150, 150), 70, WORLD_HEIGHT - 70);
      this.createMortarWarning(x, y, 880 + delay);
    }
    this.scheduleBossEvent(1050 + count * 130, () => this.finishBossAttack(2400, 3800));
  }

  private createMortarWarning(x: number, y: number, delayMs: number) {
    const radius = 58;
    const ring = this.add.circle(x, y, radius, 0xff7a00, 0.14)
      .setStrokeStyle(3, 0xffb300, 0.85).setDepth(22);
    const core = this.add.circle(x, y, radius * 0.85, 0xffe082, 0.22)
      .setDepth(23)
      .setScale(0.08);
    this.trackBossAttackObj(ring);
    this.trackBossAttackObj(core);

    this.tweens.add({
      targets: core,
      scale: 1,
      alpha: 0.08,
      duration: delayMs,
      ease: 'Sine.easeIn'
    });

    this.scheduleBossEvent(delayMs, () => {
      if (ring.active) this.destroyBossAttackObj(ring);
      if (core.active) this.destroyBossAttackObj(core);
      if (!this.bossActive || this.gameOver) return;
      this.createMortarExplosion(x, y, radius);
    });
  }

  private createMortarExplosion(x: number, y: number, radius: number) {
    const blast = this.add.circle(x, y, radius, 0xff3d00, 0.38)
      .setStrokeStyle(4, 0xfff176, 0.9)
      .setDepth(24)
      .setScale(0.45);
    this.tweens.add({
      targets: blast,
      scale: 1,
      alpha: 0,
      duration: 260,
      ease: 'Sine.easeOut',
      onComplete: () => blast.destroy()
    });

    const distance = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
    if (distance <= radius + PLAYER_RADIUS * 0.35 && this.contactDamageElapsed >= 320) {
      this.contactDamageElapsed = 0;
      this.stats.hp = Math.max(0, this.stats.hp - 12);
      this.flashPlayerDamage();
      this.showHitText(this.player.x, this.player.y - 20, '-12', '#ff8a65');
      if (this.stats.hp <= 0) {
        this.endGame(false);
      }
    }
  }

  // === 螺旋弹幕 ===
  private fireSpiralBurst(boss: Phaser.Physics.Arcade.Image) {
    this.bossCasting = true;
    this.bossLastAttack = 'spiral';
    const arms = 3;
    const bulletsPerArm = 12;
    const totalRounds = 18;
    let round = 0;

    const fireRound = () => {
      if (!boss.active || this.gameOver) {
        this.finishBossAttack(1800, 3000);
        return;
      }
      const baseAngle = (round * 0.38) % (Math.PI * 2);
      for (let a = 0; a < arms; a++) {
        const armAngle = baseAngle + (a / arms) * Math.PI * 2;
        for (let b = 0; b < bulletsPerArm; b++) {
          const angle = armAngle + (b / bulletsPerArm) * Math.PI * 0.5;
          const bullet = this.bossBullets.create(boss.x, boss.y, 'bullet') as Phaser.Physics.Arcade.Image;
          bullet.setTint(0xff3344);
          bullet.setScale(1.1);
          bullet.setCircle(5);
          bullet.setDepth(18);
          bullet.setData('lifeMs', 6000);
          bullet.setData('damage', 8);
          const spd = 90 + b * 14;
          this.physics.velocityFromRotation(angle, spd, bullet.body!.velocity);
        }
      }
      round++;
      if (round < totalRounds) {
        this.scheduleBossEvent(95, fireRound);
      } else {
        this.scheduleBossEvent(200, () => this.finishBossAttack(2200, 3600));
      }
    };
    fireRound();
  }

  // === 扩散冲击环 ===
  private fireExpandingRing(boss: Phaser.Physics.Arcade.Image) {
    this.bossCasting = true;
    this.bossLastAttack = 'ring';
    const rings = 4;
    for (let r = 0; r < rings; r++) {
      const delay = r * 500;
      this.scheduleBossEvent(delay, () => {
        if (!boss.active || this.gameOver) return;
        const count = 20 + r * 6;
        const speed = 100 + r * 25;
        const tint = r % 2 === 0 ? 0xff2244 : 0xff6633;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const bullet = this.bossBullets.create(boss.x, boss.y, 'bullet') as Phaser.Physics.Arcade.Image;
          bullet.setTint(tint);
          bullet.setScale(1.2);
          bullet.setCircle(5);
          bullet.setDepth(18);
          bullet.setData('lifeMs', 5000);
          bullet.setData('damage', 10);
          this.physics.velocityFromRotation(angle, speed, bullet.body!.velocity);
        }
        // 视觉冲击波
        const wave = this.add.circle(boss.x, boss.y, 10, tint, 0.25)
          .setStrokeStyle(2, tint, 0.7).setDepth(22);
        this.trackBossAttackObj(wave);
        this.tweens.add({
          targets: wave, scale: 3.5, alpha: 0, duration: 600,
          ease: 'Sine.easeOut', onComplete: () => this.destroyBossAttackObj(wave)
        });
      });
    }
    this.scheduleBossEvent(rings * 500 + 200, () => this.finishBossAttack(2400, 4000));
  }

  // === 扇形扫射 ===
  private fireSweepFan(boss: Phaser.Physics.Arcade.Image) {
    this.bossCasting = true;
    this.bossLastAttack = 'sweep';
    const sweeps = 5;
    const bulletsPerSweep = 9;
    const fanAngle = Math.PI / 4; // 45度扇形

    for (let s = 0; s < sweeps; s++) {
      const delay = s * 280;
      this.scheduleBossEvent(delay, () => {
        if (!boss.active || this.gameOver) return;
        const angleToPlayer = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);
        const startAngle = angleToPlayer - fanAngle / 2 + (s % 2 === 0 ? -0.15 : 0.15);
        for (let i = 0; i < bulletsPerSweep; i++) {
          const t = i / (bulletsPerSweep - 1);
          const angle = startAngle + t * fanAngle;
          const bullet = this.bossBullets.create(boss.x, boss.y, 'bullet') as Phaser.Physics.Arcade.Image;
          bullet.setTint(0xff0044);
          bullet.setScale(1.25);
          bullet.setCircle(5);
          bullet.setDepth(18);
          bullet.setData('lifeMs', 5500);
          bullet.setData('damage', 11);
          this.physics.velocityFromRotation(angle, 160 + i * 18, bullet.body!.velocity);
        }
      });
    }
    this.scheduleBossEvent(sweeps * 280 + 150, () => this.finishBossAttack(2000, 3400));
  }

  private updateBossBullets(delta: number) {
    const margin = 60;
    this.bossBullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return;
      const lifeMs = (bullet.getData('lifeMs') as number | undefined) ?? 8500;
      const remainingLifeMs = lifeMs - delta;
      bullet.setData('lifeMs', remainingLifeMs);

      // Destroy if off screen or after its readable attack window expires.
      if (bullet.x < -margin || bullet.x > WORLD_WIDTH + margin ||
          bullet.y < -margin || bullet.y > WORLD_HEIGHT + margin ||
          remainingLifeMs <= 0) {
        bullet.destroy();
        return;
      }

      // Collision with player
      const dist = Phaser.Math.Distance.Between(bullet.x, bullet.y, this.player.x, this.player.y);
      if (dist < PLAYER_RADIUS + 5) {
        bullet.destroy();
        const damage = (bullet.getData('damage') as number | undefined) ?? 10;
        this.stats.hp = Math.max(0, this.stats.hp - damage);
        this.flashPlayerDamage();
        this.showHitText(this.player.x, this.player.y - 20, `-${damage}`, '#ff5252');
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

      if (enemy.getData('dying')) return;

      const isBoss = enemy.getData('isBoss') as boolean;
      const spd = enemy.getData('speed') as number;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      const speedScale = isBoss && this.bossCasting ? 0.35 : 1;
      this.physics.velocityFromRotation(angle, spd * speedScale, enemy.body!.velocity);

      const size = isBoss ? BOSS_SIZE * 0.5 : ENEMY_SIZE * 0.55;
      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (distance <= PLAYER_RADIUS + size) {
        touchingPlayer = true;
      }
      // 同步阴影、光晕和光环位置
      const shadow = enemy.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
      const glow = enemy.getData('glow') as Phaser.GameObjects.Ellipse | undefined;
      if (shadow) { shadow.setPosition(enemy.x, enemy.y + (isBoss ? 19 : 6)); }
      if (glow) { glow.setPosition(enemy.x, enemy.y + 2); }
      const auraRing = enemy.getData('auraRing') as Phaser.GameObjects.Ellipse | undefined;
      if (auraRing) { auraRing.setPosition(enemy.x, enemy.y); }
    });

    if (touchingPlayer && this.contactDamageElapsed >= 700) {
      this.contactDamageElapsed = 0;
      this.stats.hp = Math.max(0, this.stats.hp - 8);
      this.flashPlayerDamage();
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
    const attackRange = ATTACK_RANGE * (1 + this.skillLevels.range * 0.08);
    const attackRangeSq = attackRange * attackRange;
    return this.enemies
      .getChildren()
      .map((child) => child as Phaser.Physics.Arcade.Image)
      .filter((enemy) => enemy.active && (!extraFilter || extraFilter(enemy)))
      .map((enemy) => ({
        enemy,
        distanceSq: Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y)
      }))
      .filter((entry) => entry.distanceSq <= attackRangeSq)
      .sort((a, b) => {
        const aBoss = a.enemy.getData('isBoss') ? 1 : 0;
        const bBoss = b.enemy.getData('isBoss') ? 1 : 0;
        if (aBoss !== bBoss) return bBoss - aBoss;
        return a.distanceSq - b.distanceSq;
      })
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
        this.damageEnemy(target, Math.floor(this.stats.bulletDamage * this.getDamageScale()));
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
    this.updateDroneWeapon();
    this.updateMolotovWeapon();
    this.updateMissileWeapon();
    this.updateLaserWeapon();

    if (this.orbitLevel > 0 && this.orbitElapsed >= Math.max(520, 1100 - this.orbitLevel * 85)) {
      this.orbitElapsed = 0;
      const bladeRadius = (82 + this.orbitLevel * 11) * this.getRangeScale();
      const ring = this.add.circle(this.player.x, this.player.y, bladeRadius, 0xe0faff, 0.025)
        .setStrokeStyle(2, 0x67e8f9, 0.35)
        .setDepth(15);
      this.tweens.add({
        targets: ring, scale: 1.08, alpha: 0, duration: 220,
        ease: 'Sine.easeOut', onComplete: () => ring.destroy()
      });
    }

    if (this.auraLevel > 0 && this.auraElapsed >= Math.max(320, 720 - this.auraLevel * 55)) {
      this.auraElapsed = 0;
      const auraRadius = (this.auraSlow ? (115 + this.auraLevel * 18) * 2 : 115 + this.auraLevel * 18) * this.getRangeScale();
      this.damageArea(auraRadius, Math.floor((8 + this.auraLevel * 4) * this.getDamageScale()), 0x67ff7a);
    }
  }

  private updateDroneWeapon() {
    const lv = this.skillLevels.drone;
    if (lv <= 0) return;
    const droneCount = Math.min(5, lv);
    const shotsPerVolley = Math.min(3, 1 + Math.floor(this.getProjectileBonus() / 3));
    const cooldown = Math.max(260, (920 - lv * 80) * this.getCooldownScale());
    if (this.droneElapsed < cooldown) return;
    this.droneElapsed = 0;

    for (let i = 0; i < droneCount; i++) {
      const origin = this.droneVisuals[i] ?? this.player;
      const targets = this.findNearestEnemies(shotsPerVolley, (enemy) => {
        return Phaser.Math.Distance.Squared(origin.x, origin.y, enemy.x, enemy.y) <= 520 * 520 * this.getRangeScale();
      });
      targets.forEach((target, shotIndex) => {
        this.time.delayedCall(shotIndex * 60, () => {
          if (!target.active || this.gameOver) return;
          this.fireDronePulse(origin.x, origin.y, target, lv);
        });
      });
    }
  }

  private fireDronePulse(fromX: number, fromY: number, target: Phaser.Physics.Arcade.Image, level: number) {
    const distance = Phaser.Math.Distance.Between(fromX, fromY, target.x, target.y);
    const flightMs = Phaser.Math.Clamp(distance / 5.7, 80, 210);
    const bullet = this.bullets.create(fromX, fromY, 'bullet') as Phaser.Physics.Arcade.Image;
    bullet.setTint(0x67e8f9);
    bullet.setScale(0.9);
    bullet.setCircle(5);
    bullet.setDepth(17);
    bullet.setData('life', flightMs + 120);
    this.time.delayedCall(flightMs, () => {
      if (!bullet.active || this.gameOver || !target.active) return;
      this.damageEnemy(target, Math.floor((9 + level * 4) * this.getDamageScale()));
      if (level >= 5) {
        this.damageAreaAt(target.x, target.y, 54 * this.getRangeScale(), Math.floor((5 + level * 2) * this.getDamageScale()), 0x67e8f9);
      }
    });
    this.tweens.add({
      targets: bullet, x: target.x, y: target.y,
      duration: flightMs, ease: 'Sine.easeIn',
      onComplete: () => bullet.destroy()
    });
  }

  private updateMolotovWeapon() {
    const lv = this.skillLevels.molotov;
    if (lv <= 0) return;
    const cooldown = Math.max(900, (3400 - lv * 260) * this.getCooldownScale());
    if (this.molotovElapsed < cooldown) return;
    this.molotovElapsed = 0;

    const throws = Math.min(3, 1 + Math.floor((lv + this.getProjectileBonus()) / 4));
    for (let i = 0; i < throws; i++) {
      this.time.delayedCall(i * 180, () => {
        const target = this.findClusterTarget();
        if (target) this.throwMolotov(target.x, target.y, lv);
      });
    }
  }

  private throwMolotov(targetX: number, targetY: number, level: number) {
    const startX = this.player.x;
    const startY = this.player.y - 14;
    const bottle = this.add.image(startX, startY, 'weapon_molotov').setDisplaySize(20, 26).setDepth(18);
    const distance = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
    const flightMs = Phaser.Math.Clamp(distance / 2.2, 360, 760);
    this.tweens.add({
      targets: bottle,
      x: targetX,
      y: targetY,
      rotation: Phaser.Math.FloatBetween(2.4, 4.2),
      duration: flightMs,
      ease: 'Sine.easeIn',
      onComplete: () => {
        bottle.destroy();
        this.createFireZone(targetX, targetY, level);
      }
    });
  }

  private createFireZone(x: number, y: number, level: number) {
    const radius = (58 + level * 11 + (level >= 5 ? 34 : 0)) * this.getRangeScale();
    const duration = (1700 + level * 280 + (level >= 5 ? 900 : 0)) * this.getDurationScale();
    const tickMs = 420;
    const fire = this.add.circle(x, y, radius, 0xf97316, 0.16)
      .setStrokeStyle(3, 0xfacc15, 0.55)
      .setDepth(13);
    this.tweens.add({
      targets: fire,
      scale: { from: 0.65, to: 1 },
      alpha: { from: 0.08, to: 0.18 },
      duration: 180,
      ease: 'Sine.easeOut'
    });
    const ticks = Math.max(1, Math.floor(duration / tickMs));
    for (let i = 0; i < ticks; i++) {
      this.time.delayedCall(i * tickMs, () => {
        if (this.gameOver) return;
        this.damageAreaAt(x, y, radius, Math.floor((7 + level * 3) * this.getDamageScale()), 0xf97316);
      });
    }
    this.time.delayedCall(duration, () => {
      this.tweens.add({
        targets: fire, alpha: 0, scale: 0.75, duration: 260,
        ease: 'Sine.easeIn', onComplete: () => fire.destroy()
      });
    });
  }

  private updateMissileWeapon() {
    const lv = this.skillLevels.missile;
    if (lv <= 0) return;
    const cooldown = Math.max(680, (2600 - lv * 190) * this.getCooldownScale());
    if (this.missileElapsed < cooldown) return;
    this.missileElapsed = 0;

    const count = Math.min(6, 1 + Math.floor((lv + this.getProjectileBonus()) / 2) + (lv >= 5 ? 1 : 0));
    const targets = this.findNearestEnemies(count, (enemy) => {
      const d = Phaser.Math.Distance.Squared(this.player.x, this.player.y, enemy.x, enemy.y);
      return d > 150 * 150 && d < 760 * 760 * this.getRangeScale();
    });
    targets.forEach((target, i) => {
      this.time.delayedCall(i * 120, () => this.fireMissile(target, lv));
    });
  }

  private fireMissile(target: Phaser.Physics.Arcade.Image, level: number) {
    if (!target.active) return;
    const missile = this.add.image(this.player.x, this.player.y - 10, 'weapon_missile').setDisplaySize(24, 16).setDepth(18);
    const startX = missile.x;
    const startY = missile.y;
    const targetX = target.x;
    const targetY = target.y;
    const distance = Phaser.Math.Distance.Between(startX, startY, targetX, targetY);
    const flightMs = Phaser.Math.Clamp(distance / 3.2, 260, 620);
    missile.setRotation(Phaser.Math.Angle.Between(startX, startY, targetX, targetY));
    this.tweens.add({
      targets: missile,
      x: targetX,
      y: targetY,
      duration: flightMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        missile.destroy();
        const radius = (54 + level * 9 + (level >= 5 ? 24 : 0)) * this.getRangeScale();
        this.damageAreaAt(targetX, targetY, radius, Math.floor((20 + level * 8) * this.getDamageScale()), 0xfacc15);
      }
    });
  }

  private updateLaserWeapon() {
    const lv = this.skillLevels.laser;
    if (lv <= 0) return;
    const cooldown = Math.max(1200, (4100 - lv * 280) * this.getCooldownScale());
    if (this.laserElapsed < cooldown) return;
    this.laserElapsed = 0;

    const beams = Math.min(4, 1 + Math.floor((lv + this.getProjectileBonus()) / 4) + (lv >= 5 ? 1 : 0));
    for (let i = 0; i < beams; i++) {
      this.time.delayedCall(i * 160, () => {
        const target = this.findClusterTarget();
        if (target) this.fireOrbitalLaser(target.x, target.y, lv, i);
      });
    }
  }

  private fireOrbitalLaser(x: number, y: number, level: number, index: number) {
    const angle = -Math.PI / 2 + (index - 1) * 0.35;
    const length = (500 + level * 70) * this.getRangeScale();
    const dx = Math.cos(angle) * length / 2;
    const dy = Math.sin(angle) * length / 2;
    const x1 = x - dx;
    const y1 = y - dy;
    const x2 = x + dx;
    const y2 = y + dy;
    const carrierStartX = x1 - Math.cos(angle) * 120;
    const carrierStartY = y1 - Math.sin(angle) * 120;
    const carrier = this.add.image(carrierStartX, carrierStartY, 'weapon_laser_sat').setDisplaySize(36, 36)
      .setDepth(26)
      .setAlpha(0)
      .setRotation(angle + Math.PI / 2);
    const lockRing = this.add.circle(x, y, 34 + level * 4, 0x22d3ee, 0)
      .setStrokeStyle(2, 0x67e8f9, 0.5)
      .setDepth(17);
    this.tweens.add({
      targets: carrier,
      x: x1,
      y: y1,
      alpha: 1,
      duration: 170,
      ease: 'Sine.easeOut'
    });
    this.tweens.add({
      targets: lockRing,
      scale: 1.35,
      alpha: 0.1,
      duration: 170,
      yoyo: true,
      ease: 'Sine.easeInOut'
    });

    this.time.delayedCall(170, () => {
      if (!carrier.active || this.gameOver) {
        carrier.destroy();
        lockRing.destroy();
        return;
      }
      const warning = this.add.line(0, 0, x1, y1, x2, y2, 0x67e8f9, 0.32)
        .setOrigin(0)
        .setLineWidth(5)
        .setDepth(18);
      const uplink = this.add.line(0, 0, carrier.x, carrier.y, x, y, 0xfacc15, 0.35)
        .setOrigin(0)
        .setLineWidth(2)
        .setDepth(19);
      this.time.delayedCall(170, () => {
        warning.destroy();
        uplink.destroy();
        lockRing.destroy();
        if (!carrier.active || this.gameOver) {
          carrier.destroy();
          return;
        }
        const beam = this.add.line(0, 0, x1, y1, x2, y2, 0xe0faff, 0.88)
          .setOrigin(0)
          .setLineWidth(level >= 5 ? 20 : 14)
          .setDepth(23);
        const core = this.add.line(0, 0, x1, y1, x2, y2, 0x22d3ee, 0.95)
          .setOrigin(0)
          .setLineWidth(level >= 5 ? 8 : 5)
          .setDepth(24);
        const muzzle = this.add.circle(carrier.x, carrier.y, 20, 0xe0faff, 0.22)
          .setStrokeStyle(2, 0x67e8f9, 0.75)
          .setDepth(25);
        this.damageLine(x1, y1, x2, y2, level >= 5 ? 44 : 32, Math.floor((26 + level * 9) * this.getDamageScale()));
        this.tweens.add({
          targets: [beam, core, muzzle], alpha: 0, duration: 260,
          ease: 'Sine.easeIn', onComplete: () => { beam.destroy(); core.destroy(); muzzle.destroy(); }
        });
        this.tweens.add({
          targets: carrier,
          y: carrier.y - 28,
          alpha: 0,
          duration: 320,
          ease: 'Sine.easeIn',
          onComplete: () => carrier.destroy()
        });
      });
    });
  }

  private findClusterTarget(): Phaser.Physics.Arcade.Image | null {
    let best: Phaser.Physics.Arcade.Image | null = null;
    let bestScore = -1;
    const radiusSq = 170 * 170 * this.getRangeScale();
    this.enemies.getChildren().forEach((child) => {
      const candidate = child as Phaser.Physics.Arcade.Image;
      if (!candidate.active) return;
      let score = 0;
      this.enemies.getChildren().forEach((otherChild) => {
        const other = otherChild as Phaser.Physics.Arcade.Image;
        if (!other.active) return;
        if (Phaser.Math.Distance.Squared(candidate.x, candidate.y, other.x, other.y) <= radiusSq) score++;
      });
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, candidate.x, candidate.y);
      score += Math.max(0, 2 - dist / 420);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    return best;
  }

  private updateWeaponVisuals() {
    const droneLevel = this.skillLevels.drone;
    const droneCount = droneLevel > 0 ? Math.min(5, droneLevel) : 0;
    while (this.droneVisuals.length < droneCount) {
      this.droneVisuals.push(this.add.image(this.player.x, this.player.y, 'weapon_drone').setDisplaySize(48, 48).setDepth(22));
    }
    while (this.droneVisuals.length > droneCount) {
      this.droneVisuals.pop()?.destroy();
    }
    this.droneVisuals.forEach((drone, i) => {
      const angle = this.elapsedMs / 650 + (i / Math.max(1, droneCount)) * Math.PI * 2;
      drone.setPosition(this.player.x + Math.cos(angle) * 58, this.player.y + Math.sin(angle) * 58);
      drone.setRotation(angle + Math.PI / 2);
    });

    const bladeLevel = this.skillLevels.orbit;
    const bladeCount = bladeLevel > 0 ? Math.min(6, bladeLevel + (bladeLevel >= 5 ? 1 : 0)) : 0;
    const bladeRadius = (82 + bladeLevel * 11) * this.getRangeScale();
    while (this.bladeVisuals.length < bladeCount) {
      this.bladeVisuals.push(this.add.image(this.player.x, this.player.y, 'weapon_blade').setDisplaySize(56, 56).setDepth(21));
    }
    while (this.bladeVisuals.length > bladeCount) {
      this.bladeVisuals.pop()?.destroy();
    }
    this.bladeVisuals.forEach((blade, i) => {
      const angle = this.elapsedMs / 420 + (i / Math.max(1, bladeCount)) * Math.PI * 2;
      blade.setPosition(this.player.x + Math.cos(angle) * bladeRadius, this.player.y + Math.sin(angle) * bladeRadius);
      blade.setRotation(angle + Math.PI / 2);
    });
  }

  private syncDroneVisuals() {
    this.updateWeaponVisuals();
  }

  private syncBladeVisuals() {
    this.updateWeaponVisuals();
  }

  private updateWeaponContactDamage() {
    this.updateBladeContactDamage();
  }

  private updateBladeContactDamage() {
    const level = this.skillLevels.orbit;
    if (level <= 0 || this.bladeVisuals.length === 0) return;

    const hitRadius = 24 + Math.min(10, level * 2);
    const hitRadiusSq = hitRadius * hitRadius;
    const cooldownMs = Math.max(120, 260 - level * 18);
    const damage = Math.floor((10 + level * 5) * this.getDamageScale() * (level >= 5 ? 1.65 : 1));

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) return;
      const lastHit = (enemy.getData('bladeHitAt') as number | undefined) ?? -9999;
      if (this.elapsedMs - lastHit < cooldownMs) return;

      const hit = this.bladeVisuals.some((blade) => {
        return Phaser.Math.Distance.Squared(blade.x, blade.y, enemy.x, enemy.y) <= hitRadiusSq;
      });
      if (!hit) return;

      enemy.setData('bladeHitAt', this.elapsedMs);
      this.damageEnemy(enemy, damage);
      const spark = this.add.circle(enemy.x, enemy.y, 10, 0xe0faff, 0.24)
        .setStrokeStyle(2, 0x67e8f9, 0.75)
        .setDepth(28);
      this.tweens.add({
        targets: spark, scale: 1.5, alpha: 0, duration: 160,
        ease: 'Sine.easeOut', onComplete: () => spark.destroy()
      });
    });
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

  private damageAreaAt(x: number, y: number, radius: number, damage: number, color: number) {
    const radiusSq = radius * radius;
    let hit = false;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) return;
      if (Phaser.Math.Distance.Squared(x, y, enemy.x, enemy.y) <= radiusSq) {
        hit = true;
        this.damageEnemy(enemy, damage);
      }
    });
    const flash = this.add.circle(x, y, radius, color, hit ? 0.11 : 0.05)
      .setStrokeStyle(2, color, 0.55)
      .setDepth(16);
    this.tweens.add({
      targets: flash, scale: 1.1, alpha: 0, duration: 220,
      ease: 'Sine.easeOut', onComplete: () => flash.destroy()
    });
  }

  private damageLine(x1: number, y1: number, x2: number, y2: number, width: number, damage: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active || enemy.getData('dying')) return;
      const t = Phaser.Math.Clamp(((enemy.x - x1) * dx + (enemy.y - y1) * dy) / lenSq, 0, 1);
      const closestX = x1 + t * dx;
      const closestY = y1 + t * dy;
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, closestX, closestY) <= width) {
        this.damageEnemy(enemy, damage);
      }
    });
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

    // Boss受击闪白
    const isBoss = enemy.getData('isBoss') as boolean;
    if (isBoss && hp > 0) {
      enemy.setTint(0xffffff);
      this.time.delayedCall(80, () => {
        if (enemy.active) enemy.clearTint();
      });
    }

    if (hp <= 0) {
      const x = enemy.x;
      const y = enemy.y;

      if (isBoss) {
        // Boss死亡动画：放大+淡出
        enemy.setData('dying', true);
        (enemy.body as Phaser.Physics.Arcade.Body).enable = false;
        this.tweens.killTweensOf(enemy);
        this.hud.bossHp.setVisible(false);
        this.hud.bossBarBg.setVisible(false);
        this.hud.bossBar.setVisible(false);

        const shadow = enemy.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
        const auraRing = enemy.getData('auraRing') as Phaser.GameObjects.Ellipse | undefined;
        if (auraRing) {
          this.tweens.killTweensOf(auraRing);
          this.tweens.add({ targets: auraRing, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 550, ease: 'Sine.easeOut' });
        }
        if (shadow) {
          this.tweens.add({ targets: shadow, alpha: 0, duration: 550 });
        }

        this.tweens.add({
          targets: enemy,
          scaleX: enemy.scaleX * 1.5,
          scaleY: enemy.scaleY * 1.5,
          alpha: 0,
          duration: 550,
          ease: 'Sine.easeOut',
          onComplete: () => {
            if (shadow) shadow.destroy();
            if (auraRing) auraRing.destroy();
            const glow = enemy.getData('glow') as Phaser.GameObjects.Ellipse | undefined;
            if (glow) glow.destroy();
            enemy.destroy();
            this.onBossDefeated(x, y);
            this.showDeathEffect(x, y, true);
          }
        });
        // 立即显示死亡特效
        this.showDeathEffect(x, y, true);
        return;
      }

      const shadow = enemy.getData('shadow') as Phaser.GameObjects.Ellipse | undefined;
      const glow = enemy.getData('glow') as Phaser.GameObjects.Ellipse | undefined;
      if (shadow) shadow.destroy();
      if (glow) glow.destroy();
      enemy.destroy();
      this.kills += 1;

      this.dropXp(x, y, 4);
      this.tryDropLoot(x, y);
      this.showDeathEffect(x, y, false);
    }
  }

  private onBossDefeated(x: number, y: number) {
    this.bossActive = false;
    this.bossCasting = false;
    this.bossLaserPhase = 'idle';
    this.bossLastAttack = null;
    this.clearBossAttackEffects();
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
    const txt = this.add.text(w / 2, this.scale.height / 2 - 60, '失控核心已隔离', {
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
      targets: ring, scale: 2.5, alpha: 0, duration: isBoss ? 600 : 360,
      ease: 'Sine.easeOut', onComplete: () => ring.destroy()
    });
  }

  private flashPlayerDamage() {
    this.cameras.main.shake(90, 0.004);
    this.player.setTint(0xff4444);
    this.tweens.add({
      targets: this.player,
      alpha: 0.35,
      duration: 80,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        this.player.clearTint();
        this.player.setAlpha(1);
      }
    });
  }

  /* ========== XP & LOOT DROPS ========== */

  private dropXp(x: number, y: number, value: number) {
    const orb = this.xpOrbs.create(x, y, 'xp') as Phaser.Physics.Arcade.Image;
    orb.setCircle(XP_RADIUS);
    orb.setDisplaySize(16, 16);
    orb.setData('value', value);
    orb.setDepth(14);
    this.tweens.add({
      targets: orb, scale: 1.3, duration: 400,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  private tryDropLoot(x: number, y: number) {
    const r = Math.random();
    if (r < 0.013) {
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
    orb.setCircle(type === 'health' ? 16 : LOOT_RADIUS);
    orb.setData('lootType', type);
    orb.setData('value', type === 'gold' ? Phaser.Math.Between(1, 5) : 1);
    orb.setDepth(15);
    if (type !== 'xp') {
      orb.setDisplaySize(40, 40);
    }
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
      this.stats.attackInterval = Math.floor(this.getLevelAttackInterval() * this.getCooldownScale());
      this.showSkillChoices();
      break;
    }
  }

  private collectLoot(orb: Phaser.Physics.Arcade.Image) {
    const lootType = orb.getData('lootType') as LootType;
    const val = orb.getData('value') as number;
    orb.destroy();

    if (lootType === 'magnet') {
      this.showHitText(this.player.x, this.player.y - 20, '全域回收', '#67e8f9');
      // Instantly pull and collect ALL XP orbs and loot on the field
      const allOrbs: Phaser.Physics.Arcade.Image[] = [];
      this.xpOrbs.getChildren().forEach((child) => {
        const o = child as Phaser.Physics.Arcade.Image;
        if (o.active) allOrbs.push(o);
      });
      this.lootDrops.getChildren().forEach((child) => {
        const o = child as Phaser.Physics.Arcade.Image;
        if (o.active && o.getData('lootType') !== 'magnet') allOrbs.push(o);
      });

      allOrbs.forEach((o) => {
        const dist = Phaser.Math.Distance.Between(o.x, o.y, this.player.x, this.player.y);
        const duration = Math.max(150, Math.min(500, dist / 2));
        this.tweens.add({
          targets: o, x: this.player.x, y: this.player.y,
          duration, ease: 'Sine.easeIn',
          onComplete: () => {
            if (!o.active) return;
            const lt = o.getData('lootType') as LootType | undefined;
            if (lt) {
              this.collectLoot(o);
            } else {
              this.collectXp(o);
            }
          }
        });
      });
    } else if (lootType === 'health') {
      const healed = Math.min(this.stats.maxHp - this.stats.hp, 40);
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 40);
      this.showHitText(this.player.x, this.player.y - 20, `+${healed} 生命`, '#4caf50');
    } else if (lootType === 'gold') {
      this.gold += val;
      this.showHitText(this.player.x, this.player.y - 20, `+${val} 算力 (共 ${this.gold})`, '#ffc107');
    }
  }

  /* ========== LEVEL UP & SKILLS ========== */

  private getSkillKind(id: SkillId): SkillKind {
    return WEAPON_SKILLS.includes(id as WeaponSkillId) ? 'weapon' : 'support';
  }

  private getSkillTitle(id: SkillId): string {
    const titles: Record<SkillId, string> = {
      drone: 'AI 无人机群',
      molotov: '燃烧瓶',
      orbit: '环绕飞剑',
      missile: '追踪导弹',
      aura: '电磁力场',
      laser: '轨道激光',
      attackSpeed: '冷却核心',
      range: '范围扩展',
      damage: '攻击增幅',
      bulletCount: '弹道扩容',
      heal: '续航电池',
      moveSpeed: '移动校准'
    };
    return titles[id];
  }

  private getBaseDescription(id: SkillId): string {
    const descriptions: Record<SkillId, string> = {
      drone: '部署无人机，环绕玩家并自动射击最近目标',
      molotov: '向敌群投掷燃烧瓶，制造持续火区',
      orbit: '召唤飞剑环绕切割近身敌人',
      missile: '周期性发射追踪导弹并造成范围爆炸',
      aura: '展开电磁力场，持续灼伤近身敌人',
      laser: '调用轨道激光，对高密度区域扫射',
      attackSpeed: '所有周期武器冷却降低，基础火控更快',
      range: '火区、爆炸、力场和拾取半径扩大',
      damage: '所有武器伤害提升',
      bulletCount: '脉冲、导弹和无人机弹幕数量提升',
      heal: '生命上限和修复效率提升，持续武器时间延长',
      moveSpeed: '移速和拾取效率提升，利于拉扯走位'
    };
    return descriptions[id];
  }

  private getEvolutionPreview(id: SkillId): string {
    const previews: Record<SkillId, string> = {
      drone: '质变: 歼灭者无人机，双机合流穿透激光',
      molotov: '质变: 燃料桶风暴，火区扩大并连续爆燃',
      orbit: '质变: 量子剑阵，双层环绕高速切割',
      missile: '质变: 蜂群导弹，分裂追踪多个目标',
      aura: '质变: EMP 禁区，范围翻倍并减速敌人',
      laser: '质变: 天基审判，多道激光交叉扫场',
      attackSpeed: '质变: 冷却矩阵，基础脉冲间隔大幅降低',
      range: '质变: 扩散协议，范围武器额外扩张',
      damage: '质变: 红队漏洞，获得暴击能力',
      bulletCount: '质变: 并行弹道，基础脉冲可穿透',
      heal: '质变: 纳米修复舱，每秒自动修复',
      moveSpeed: '质变: 离子尾迹，移动留下灼烧轨迹'
    };
    return previews[id];
  }

  private getDamageScale() {
    return 1 + this.skillLevels.damage * 0.12;
  }

  private getCooldownScale() {
    return Math.max(0.55, 1 - this.skillLevels.attackSpeed * 0.07);
  }

  private getRangeScale() {
    return 1 + this.skillLevels.range * 0.13;
  }

  private getDurationScale() {
    return 1 + this.skillLevels.heal * 0.08;
  }

  private getProjectileBonus() {
    return this.skillLevels.bulletCount;
  }

  private wrapCnText(text: string, maxChars: number) {
    return text
      .split('\n')
      .map((part) => {
        const lines: string[] = [];
        let current = '';
        Array.from(part).forEach((char) => {
          const charWeight = /[A-Za-z0-9]/.test(char) ? 0.55 : 1;
          const currentWeight = Array.from(current).reduce((sum, c) => sum + (/[A-Za-z0-9]/.test(c) ? 0.55 : 1), 0);
          if (current && currentWeight + charWeight > maxChars) {
            lines.push(current);
            current = char;
          } else {
            current += char;
          }
        });
        if (current) lines.push(current);
        return lines.join('\n');
      })
      .join('\n');
  }

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

    const allSkills: SkillOption[] = ALL_SKILLS.map((id) => {
      const lv = this.skillLevels[id];
      const evo = lv === 4 ? `\n${this.getEvolutionPreview(id)}` : '';
      return {
        id,
        kind: this.getSkillKind(id),
        title: this.getSkillTitle(id),
        description: this.getBaseDescription(id) + evo
      };
    });

    // Exclude evolved skills (lv5+)
    const available = allSkills.filter((s) => this.skillLevels[s.id] < 5);
    if (available.length === 0) {
      // All skills evolved, skip selection
      this.choosingSkill = false;
      this.physics.world.resume();
      return;
    }
    const choices: SkillOption[] = [];
    const weapons = Phaser.Utils.Array.Shuffle(available.filter((s) => s.kind === 'weapon'));
    const supports = Phaser.Utils.Array.Shuffle(available.filter((s) => s.kind === 'support'));
    const owned = Phaser.Utils.Array.Shuffle(available.filter((s) => this.skillLevels[s.id] > 0));
    const pushUnique = (skill?: SkillOption) => {
      if (skill && !choices.some((s) => s.id === skill.id)) choices.push(skill);
    };
    pushUnique(owned[0]);
    pushUnique(weapons[0]);
    pushUnique(supports[0]);
    Phaser.Utils.Array.Shuffle([...available]).forEach((skill) => {
      if (choices.length < Math.min(3, available.length)) pushUnique(skill);
    });

    const w = this.scale.width;
    const h = this.scale.height;
    const maxVisibleChoices = w < 560 ? 2 : 3;
    choices.splice(maxVisibleChoices);
    const panelW = Math.min(780, w - 40);
    const panelH = 350;
    const px = w / 2;
    const py = h / 2;
    const D = 300;

    const darkBg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.55).setScrollFactor(0).setDepth(D);
    const panel = this.add.rectangle(px, py, panelW, panelH, 0x07111a, 0.98).setStrokeStyle(2, 0x22d3ee, 0.7).setScrollFactor(0).setDepth(D);
    const title = this.add.text(px, py - panelH / 2 + 36, `权限 Lv.${this.level}  选择实验模块`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '24px', color: '#8df7ff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(darkBg, panel, title);

    const cardGap = 14;
    const cardW = Math.min(210, (panelW - 64 - (choices.length - 1) * cardGap) / choices.length);
    const totalCardsW = choices.length * cardW + (choices.length - 1) * cardGap;
    choices.forEach((skill, i) => {
      const cx = px - totalCardsW / 2 + cardW / 2 + i * (cardW + cardGap);
      const cy = py + 16;

      const levelLbl = this.getSkillLevelLabel(skill.id);
      const isNew = levelLbl === 'NEW';
      const isEvo = this.skillLevels[skill.id] === 4;
      const cardBorderColor = isEvo ? 0xffd700 : (isNew ? 0x4caf50 : 0x5a6d80);

      const cardBg = this.add.rectangle(cx, cy, cardW, 230, isNew ? 0x0b2f2a : (isEvo ? 0x2a2205 : 0x0b1722), 1)
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
      }).setOrigin(0.5).setAlign('center').setScrollFactor(0).setDepth(D + 1);
      const desc = this.wrapCnText(skill.description, Math.max(9, Math.floor(cardW / 13)));
      const cardDesc = this.add.text(cx, cy - 16, desc, {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '12px',
        color: '#cbd7e3', wordWrap: { width: cardW - 26, useAdvancedWrap: true }, align: 'center',
        lineSpacing: 4
      }).setOrigin(0.5, 0).setAlign('center').setScrollFactor(0).setDepth(D + 1);
      cardDesc.setFixedSize(cardW - 24, 76);

      const btnW = cardW - 40;
      const btnColor = isEvo ? 0xf9a825 : (isNew ? 0x2e7d32 : 0x0ea5e9);
      const btnColorHover = isEvo ? 0xfbc02d : (isNew ? 0x388e3c : 0x38bdf8);
      const btnStroke = isEvo ? 0xffd700 : (isNew ? 0x4caf50 : 0x38bdf8);
      const btnBg = this.add.rectangle(cx, cy + 70, btnW, 34, btnColor, 1)
        .setStrokeStyle(1, btnStroke, 0.8)
        .setScrollFactor(0).setDepth(D).setInteractive({ useHandCursor: true });
      const btnLabel = this.add.text(cx, cy + 70, isEvo ? '启动质变' : '装配模块', {
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
    const evolved = this.applySkillEffect(skillId);
    if (evolved) {
      this.showEvolutionEffect(skillId);
    }
    this.showModuleInstallEffect(skillId);

    this.clearOverlay();
    this.choosingSkill = false;
    this.physics.world.resume();
  }

  private applySkillEffect(skillId: SkillId): boolean {
    const lv = this.skillLevels[skillId];
    if (skillId === 'attackSpeed') {
      this.stats.attackInterval = Math.max(MIN_ATTACK_INTERVAL, Math.floor(this.stats.attackInterval * 0.88));
      if (lv === 5) {
        this.stats.attackInterval = Math.max(MIN_ATTACK_INTERVAL, Math.floor(this.stats.attackInterval * 0.65));
        return true;
      }
    } else if (skillId === 'range') {
      this.stats.pickupRadius += 12;
      if (lv === 5) {
        this.stats.pickupRadius += 40;
        return true;
      }
    } else if (skillId === 'bulletCount') {
      this.stats.bulletCount += 1;
      if (lv === 5) {
        this.piercingBullets = true;
        return true;
      }
    } else if (skillId === 'damage') {
      this.stats.bulletDamage += 6 + lv * 2;
      if (lv === 5) {
        this.critChance = 0.3;
        this.critMultiplier = 2;
        return true;
      }
    } else if (skillId === 'moveSpeed') {
      this.stats.moveSpeed = Math.floor(this.stats.moveSpeed * 1.1);
      if (lv === 5) {
        this.fireTrail = true;
        return true;
      }
    } else if (skillId === 'heal') {
      this.stats.maxHp += 6;
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 28 + lv * 5);
      if (lv === 5) {
        this.stats.maxHp += 50;
        this.stats.hp += 50;
        this.hpRegen = 2;
        return true;
      }
    } else if (skillId === 'orbit') {
      this.orbitLevel = lv;
      this.syncBladeVisuals();
      if (lv === 5) {
        this.orbitCount = 6;
        this.syncBladeVisuals();
        return true;
      }
    } else if (skillId === 'aura') {
      this.auraLevel = lv;
      if (lv === 5) {
        this.auraSlow = true;
        return true;
      }
    } else if (skillId === 'drone') {
      this.syncDroneVisuals();
      return lv === 5;
    } else if (skillId === 'molotov' || skillId === 'missile' || skillId === 'laser') {
      return lv === 5;
    }
    return false;
  }

  private showModuleInstallEffect(skillId: SkillId) {
    const color = this.getSkillKind(skillId) === 'weapon' ? 0x67e8f9 : 0xfacc15;
    const ring = this.add.circle(this.player.x, this.player.y, 32, color, 0.06)
      .setStrokeStyle(3, color, 0.9)
      .setDepth(35);
    this.tweens.add({
      targets: ring, scale: 2.3, alpha: 0, duration: 420,
      ease: 'Sine.easeOut', onComplete: () => ring.destroy()
    });
  }

  private showEvolutionEffect(skillId: SkillId) {
    const names: Record<SkillId, string> = {
      drone: '无人机蜂群', molotov: '冷却液燃爆', missile: '追踪导弹阵列', laser: '切割激光',
      attackSpeed: '神经脉冲过载', bulletCount: '分布式穿透弹道', damage: '红队漏洞爆破',
      range: '雷达阵列', moveSpeed: '离子尾迹', heal: '纳米修复舱', orbit: '三重防火墙', aura: 'EMP 场域'
    };
    const w = this.scale.width;
    const h = this.scale.height;
    const txt = this.add.text(w / 2, h / 2 - 140, `${names[skillId]} 已解锁`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '34px', color: '#8df7ff', stroke: '#000', strokeThickness: 8
    }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

    this.tweens.add({
      targets: txt, scale: 1.3, alpha: 0, duration: 2200,
      ease: 'Sine.easeOut', onComplete: () => txt.destroy()
    });

    // 金色光柱从玩家位置升起
    const pillar = this.add.rectangle(this.player.x, this.player.y - 300, 80, 600, 0xffd700, 0.35)
      .setDepth(45);
    this.tweens.add({
      targets: pillar, alpha: 0, scaleX: 1.6, scaleY: 1.3, duration: 800,
      ease: 'Sine.easeOut', onComplete: () => pillar.destroy()
    });
    // 光柱粒子环
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(this.player.x, this.player.y, 40 + i * 20, 0xffd700, 0)
        .setStrokeStyle(3 - i, 0xffd700, 0.7 - i * 0.2)
        .setDepth(46);
      this.tweens.add({
        targets: ring, scale: 3, alpha: 0, duration: 700 + i * 120,
        ease: 'Sine.easeOut', delay: i * 80,
        onComplete: () => ring.destroy()
      });
    }
    // 全屏闪白
    const flash = this.add.rectangle(w / 2, h / 2, w, h, 0xffffff, 0.15)
      .setScrollFactor(0).setDepth(498);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 400,
      onComplete: () => flash.destroy()
    });
  }

  /* ========== GAME OVER ========== */

  private endGame(win: boolean) {
    this.gameOver = true;
    this.physics.world.pause();
    this.player.setVelocity(0, 0);

    // 可复活时显示内联UI，否则跳转到结算场景
    if (!win && !this.reviveUsed) {
      this.showReviveUI();
      return;
    }

    // 跳转结算场景
    this.time.delayedCall(400, () => {
      this.scene.start('GameOverScene', {
        win,
        level: this.level,
        kills: this.kills,
        gold: this.gold,
        elapsedMs: this.elapsedMs,
        shots: this.shots
      });
    });
  }

  private showReviveUI() {
    const w = this.scale.width;
    const h = this.scale.height;
    const D = 300;

    const darkBg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.7).setScrollFactor(0).setDepth(D);
    this.overlayElements.push(darkBg);

    const title = this.add.text(w / 2, h / 2 - 80, '实验员离线', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '40px',
      color: '#ff6b8a', stroke: '#000', strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(title);

    const sub = this.add.text(w / 2, h / 2 - 30, `存活: ${Math.ceil(this.elapsedMs / 1000)}s  |  Lv.${this.level}  |  清除: ${this.kills}`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px',
      color: '#94a3b8', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(sub);

    // 复活按钮
    const reviveBtn = this.add.rectangle(w / 2, h / 2 + 30, 260, 48, 0x7c2d12, 0.9)
      .setStrokeStyle(2, 0xffd966, 0.8).setScrollFactor(0).setDepth(D)
      .setInteractive({ useHandCursor: true });
    const reviveLabel = this.add.text(w / 2, h / 2 + 30, '观看赞助补给 (恢复50%生命)', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px', color: '#ffd966'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    reviveBtn.on('pointerover', () => reviveBtn.setFillStyle(0xa0522d, 0.95));
    reviveBtn.on('pointerout', () => reviveBtn.setFillStyle(0x8b4513, 0.9));
    reviveBtn.on('pointerdown', () => this.tryAdRevive());
    this.overlayElements.push(reviveBtn, reviveLabel);

    // 放弃按钮
    const quitBtn = this.add.rectangle(w / 2, h / 2 + 90, 180, 40, 0x1e293b, 0.9)
      .setStrokeStyle(1, 0x64748b, 0.5).setScrollFactor(0).setDepth(D)
      .setInteractive({ useHandCursor: true });
    const quitLabel = this.add.text(w / 2, h / 2 + 90, '放弃实验', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '14px', color: '#94a3b8'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    quitBtn.on('pointerover', () => quitBtn.setFillStyle(0x334155, 1));
    quitBtn.on('pointerout', () => quitBtn.setFillStyle(0x1e293b, 0.9));
    quitBtn.on('pointerdown', () => {
      this.clearOverlay();
      this.scene.start('GameOverScene', {
        win: false,
        level: this.level,
        kills: this.kills,
        gold: this.gold,
        elapsedMs: this.elapsedMs,
        shots: this.shots
      });
    });
    this.overlayElements.push(quitBtn, quitLabel);
  }

  private tryAdUpgrade() {
    if (this.gameOver || this.choosingSkill) return;

    const candidates: SkillId[] = ALL_SKILLS
      .filter((id) => this.skillLevels[id] < 5);

    if (candidates.length === 0) {
      const msg = this.add.text(this.scale.width / 2, 80, '所有实验模块已完成质变', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
        color: '#ffd700', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
      this.time.delayedCall(2000, () => msg.destroy());
      return;
    }

    this.choosingSkill = true;
    this.physics.world.pause();

    const w = this.scale.width;
    const h = this.scale.height;
    const displayLimit = w < 560 ? 2 : 6;
    const displayCandidates = Phaser.Utils.Array.Shuffle([...candidates]).slice(0, Math.min(displayLimit, candidates.length));
    const D = 400;
    const cardW = 160;
    const cardH = 200;
    const totalW = displayCandidates.length * cardW + (displayCandidates.length - 1) * 16;
    const startX = w / 2 - totalW / 2 + cardW / 2;
    const cy = h / 2 + 20;

    // Dark background
    const darkBg = this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6).setScrollFactor(0).setDepth(D);
    this.overlayElements.push(darkBg);

    // Title
    const title = this.add.text(w / 2, h / 2 - 140, w < 560 ? '模块直升 Lv.5' : '选择一个实验模块直升 Lv.5', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: w < 560 ? '20px' : '26px',
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
    displayCandidates.forEach((skillId, i) => {
      const cx = startX + i * (cardW + 16);
      const currentLv = this.skillLevels[skillId];

      const card = this.add.rectangle(cx, cy, cardW, cardH, 0x1a2332, 0.95)
        .setStrokeStyle(2, 0xffd700, 0.8).setScrollFactor(0).setDepth(D);

      const lvTag = this.add.text(cx, cy - 78, `Lv.${currentLv} → Lv.5`, {
        fontFamily: 'Arial, sans-serif', fontSize: '13px',
        color: '#ffd700', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

      const nameTxt = this.add.text(cx, cy - 40, this.getSkillTitle(skillId), {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px',
        color: '#fff8dd', wordWrap: { width: cardW - 16 }, align: 'center'
      }).setOrigin(0.5).setAlign('center').setScrollFactor(0).setDepth(D + 1);

      const evoTxt = this.add.text(cx, cy - 2, this.wrapCnText(this.getEvolutionPreview(skillId), 9), {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '12px',
        color: '#ffab40', wordWrap: { width: cardW - 18, useAdvancedWrap: true }, align: 'center',
        lineSpacing: 3
      }).setOrigin(0.5, 0).setAlign('center').setScrollFactor(0).setDepth(D + 1);
      evoTxt.setFixedSize(cardW - 18, 58);

      const btnBg = this.add.rectangle(cx, cy + 62, cardW - 30, 32, 0xf9a825, 1)
        .setStrokeStyle(1, 0xffd700, 0.8).setScrollFactor(0).setDepth(D)
        .setInteractive({ useHandCursor: true });
      const btnLabel = this.add.text(cx, cy + 62, '授权升级', {
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

    const msg = this.add.text(this.scale.width / 2, 80, `赞助升级: ${this.getSkillTitle(skillId)} → Lv.5`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
      color: '#ffd700', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
    this.time.delayedCall(2500, () => msg.destroy());
  }

  private applySkillSilent(skillId: SkillId) {
    // Same as applySkill but without clearing overlay or toggling chooingSkill
    this.skillLevels[skillId] += 1;
    if (this.applySkillEffect(skillId)) {
      this.showEvolutionEffect(skillId);
    }
    this.showModuleInstallEffect(skillId);
  }

  private tryAdRevive() {
    if (this.reviveUsed || !this.gameOver) return;
    this.reviveUsed = true;
    this.gameOver = false;
    this.stats.hp = Math.floor(this.stats.maxHp * 0.5);
    this.clearOverlay();
    this.physics.world.resume();

    const msg = this.add.text(this.scale.width / 2, 80, '赞助补给已送达: 恢复 50% 生命', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
      color: '#ffd966', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
    this.time.delayedCall(2000, () => msg.destroy());
  }

  private toggleDoubleXp() {
    this.doubleXp = !this.doubleXp;
    const msg = this.add.text(this.scale.width / 2, 80,
      this.doubleXp ? '算力双倍 ON' : '算力双倍 OFF', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
        color: '#ffd966', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setScrollFactor(0).setDepth(350);
    this.time.delayedCall(1500, () => msg.destroy());
  }

  private showBattlePassMock() {
    const w = this.scale.width;
    const h = this.scale.height;
    const D = 350;

    const bg = this.add.rectangle(w / 2, h / 2, 360, 260, 0x07111a, 0.98)
      .setStrokeStyle(2, 0x22d3ee, 0.8).setScrollFactor(0).setDepth(D);
    const title = this.add.text(w / 2, h / 2 - 90, '研究通行证', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '24px',
      color: '#8df7ff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    const desc = this.add.text(w / 2, h / 2, `当前算力: ${this.gold}\n即将上线...\n每日实验 | 节点奖励 | 高级研究许可`, {
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

  /* ========== MONSTER WAVE ========== */

  private updateWave(delta: number) {
    this.waveElapsed += delta;
    if (this.waveActive) {
      this.waveDuration += delta;
      if (this.waveDuration >= 10_000) {
        this.waveActive = false;
        this.waveDuration = 0;
        this.waveElapsed = 0;
        this.hud.message.setText('WASD 移动 | 自动火控 | 回收数据碎片升级');
      } else {
        const remaining = Math.ceil((10_000 - this.waveDuration) / 1000);
        this.hud.message.setText(`警报: 失控单元涌入 | ${remaining} 秒`);
      }
    } else if (this.waveElapsed >= 35_000) {
      this.waveActive = true;
      this.waveDuration = 0;
      this.waveElapsed = 0;
    }
  }

  /* ========== DATA FLOW ANIMATION ========== */

  private updateDataFlow(delta: number) {
    this.dataFlowDots.forEach((dot) => {
      if (!dot.active) return;
      const path = dot.getData('path') as { x1: number; y1: number; x2: number; y2: number; t: number };
      path.t += delta * 0.00015;
      if (path.t > 1) path.t -= 1;
      const x = path.x1 + (path.x2 - path.x1) * path.t;
      const y = path.y1 + (path.y2 - path.y1) * path.t;
      dot.setPosition(x, y);
      dot.setAlpha(0.3 + Math.sin(path.t * Math.PI) * 0.4);
    });
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
      const fx = this.player.x + Math.cos(angle) * 44;
      const fy = this.player.y + Math.sin(angle) * 44;
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

    this.hud.hp.setText(`生命 ${this.stats.hp} / ${this.stats.maxHp}`);
    this.hud.level.setText(`权限 Lv.${this.level}`);
    this.hud.xp.setText(`数据 ${this.xp} / ${this.xpToNext}${this.doubleXp ? ' x2' : ''}`);
    this.hud.time.setText(`倒计时 ${timeStr}`);
    this.hud.stats.setText(`击杀 ${this.kills}  |  算力 ${this.gold}  |  弹药 ${this.shots}`);
    this.hud.gold.setText(`算力 ${this.gold}`);

    if (!this.waveActive && !this.bossActive) {
      this.hud.message.setText('WASD 移动  |  自动火控  |  回收数据碎片升级');
    } else if (this.bossActive && !this.waveActive) {
      this.hud.message.setText('⚠ 警告: BOSS 失控单元出现');
    }

    if (this.bossActive) {
      let bossHp = 0;
      let bossMaxHp = 1;
      this.enemies.getChildren().forEach((child) => {
        const enemy = child as Phaser.Physics.Arcade.Image;
        if (enemy.active && enemy.getData('isBoss') && !enemy.getData('dying')) {
          bossHp = enemy.getData('hp') as number;
          bossMaxHp = enemy.getData('maxHp') as number;
        }
      });

      if (bossMaxHp > 0) {
        const ratio = Math.max(0, bossHp / bossMaxHp);
        const barW = 320 * ratio;
        this.hud.bossHp.setText(`失控核心 ${Math.ceil(bossHp)} / ${bossMaxHp}`);
        this.hud.bossBar.setSize(barW, 12);
      }
    }
  }
}
