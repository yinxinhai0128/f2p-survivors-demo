import Phaser from 'phaser';

type WeaponSkillId = 'drone' | 'molotov' | 'orbit' | 'missile' | 'aura' | 'laser';
type SupportSkillId = 'attackSpeed' | 'range' | 'damage' | 'bulletCount' | 'heal' | 'moveSpeed';
type SkillId = WeaponSkillId | SupportSkillId;
type LootType = 'xp' | 'magnet' | 'health' | 'gold';
type SkillKind = 'weapon' | 'support';
type BossAttackId = 'laser' | 'spread' | 'mortar';

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
  private player!: Phaser.Physics.Arcade.Image;
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
  private skillLevels: Record<SkillId, number> = {
    drone: 0, molotov: 0, orbit: 0, missile: 0, aura: 0, laser: 0,
    attackSpeed: 0, range: 0, damage: 0, bulletCount: 0, heal: 0, moveSpeed: 0
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
    this.droneElapsed += delta;
    this.molotovElapsed += delta;
    this.missileElapsed += delta;
    this.laserElapsed += delta;
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
    this.updateWeaponVisuals();
    this.updateWeaponContactDamage();
    this.updateFireTrail(delta);
    this.updateHpRegen(delta);
    this.updateAuraSlow();
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
    this.skillLevels = {
      drone: 0, molotov: 0, orbit: 0, missile: 0, aura: 0, laser: 0,
      attackSpeed: 0, range: 0, damage: 0, bulletCount: 0, heal: 0, moveSpeed: 0
    };
    this.droneVisuals.forEach((o) => o.destroy());
    this.bladeVisuals.forEach((o) => o.destroy());
    this.droneVisuals = [];
    this.bladeVisuals = [];
    this.clearOverlay();
  }

  /* ========== TEXTURES ========== */

  private createTextures() {
    const g = this.add.graphics();

    // Player: lab operator drone with a cyan visor and containment shield.
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

    // Normal enemy: corrupted test bot.
    g.fillStyle(0x30080d);
    g.fillRoundedRect(2, 2, ENEMY_SIZE - 4, ENEMY_SIZE - 4, 3);
    g.fillStyle(0xe11d48);
    g.fillRoundedRect(5, 6, ENEMY_SIZE - 10, ENEMY_SIZE - 12, 3);
    g.lineStyle(2, 0xff6b8a, 0.9);
    g.strokeRoundedRect(2, 2, ENEMY_SIZE - 4, ENEMY_SIZE - 4, 3);
    g.lineStyle(1, 0xff9fb3, 0.55);
    g.lineBetween(8, 2, 8, 0);
    g.lineBetween(22, 2, 22, 0);
    g.fillStyle(0xffffff);
    g.fillCircle(10, 14, 3);
    g.fillCircle(20, 14, 3);
    g.fillStyle(0x111827);
    g.fillCircle(10, 14, 1.5);
    g.fillCircle(20, 14, 1.5);
    g.fillStyle(0xffd166);
    g.fillRect(8, 22, 14, 2);
    g.generateTexture('enemy', ENEMY_SIZE, ENEMY_SIZE);
    g.clear();

    // Fast enemy: rogue data shard.
    g.fillStyle(0xff8a00);
    g.fillTriangle(15, 2, 2, 28, 28, 28);
    g.fillStyle(0xffc46b);
    g.fillTriangle(15, 7, 8, 25, 22, 25);
    g.lineStyle(2, 0xfff0c2, 0.9);
    g.strokeTriangle(15, 2, 2, 28, 28, 28);
    g.lineStyle(1, 0x451a03, 0.9);
    g.lineBetween(15, 8, 15, 23);
    g.lineBetween(10, 21, 20, 21);
    g.generateTexture('enemy_fast', ENEMY_SIZE, ENEMY_SIZE);
    g.clear();

    // Tank enemy: armored firewall block.
    g.fillStyle(0x141017);
    g.fillRoundedRect(0, 0, 34, 34, 4);
    g.fillStyle(0x7f1d1d);
    g.fillRoundedRect(4, 4, 26, 26, 3);
    g.lineStyle(3, 0xfbbf24, 0.9);
    g.strokeRoundedRect(1, 1, 32, 32, 4);
    g.fillStyle(0xfff7ad);
    g.fillRect(8, 10, 18, 4);
    g.fillStyle(0x111827);
    g.fillRect(10, 20, 14, 4);
    g.lineStyle(1, 0xfde68a, 0.55);
    g.lineBetween(6, 28, 28, 6);
    g.generateTexture('enemy_tank', 34, 34);
    g.clear();

    // Elite enemy: unstable neural cluster.
    g.fillStyle(0x24113f);
    g.fillCircle(16, 16, 16);
    g.fillStyle(0x8b5cf6);
    g.fillCircle(16, 16, 12);
    g.lineStyle(2, 0xd8b4fe, 0.95);
    g.strokeCircle(16, 16, 15);
    g.lineStyle(1.5, 0xffffff, 0.75);
    g.lineBetween(9, 12, 16, 8);
    g.lineBetween(16, 8, 23, 12);
    g.lineBetween(9, 20, 16, 24);
    g.lineBetween(16, 24, 23, 20);
    g.fillStyle(0xffffff);
    g.fillCircle(16, 16, 4);
    g.fillStyle(0x2e1065);
    g.fillCircle(16, 16, 2);
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

    // Blade: rotating close-range weapon with a clear cutting edge.
    g.fillStyle(0xe0faff);
    g.fillTriangle(18, 2, 5, 14, 18, 26);
    g.fillStyle(0x38bdf8);
    g.fillTriangle(15, 8, 8, 14, 15, 20);
    g.lineStyle(2, 0x0ea5e9, 0.9);
    g.strokeTriangle(18, 2, 5, 14, 18, 26);
    g.generateTexture('weapon_blade', 28, 28);
    g.clear();

    // Molotov: arcing bottle projectile before the fire zone blooms.
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

    // Missile: directional projectile with thrust flame.
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

    // Orbital laser carrier: visible emitter before the beam fires.
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

    // XP orb: recovered data fragment.
    g.fillStyle(0x34d399);
    g.fillTriangle(4, 0, 8, 4, 4, 8);
    g.fillStyle(0xa7f3d0);
    g.fillTriangle(4, 2, 6, 4, 4, 6);
    g.lineStyle(1, 0xd1fae5, 0.9);
    g.strokeTriangle(4, 0, 8, 4, 4, 8);
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

    // Gold/currency: compute credit chip.
    const gr = 10;
    g.fillStyle(0xfacc15);
    g.fillRoundedRect(1, 1, 18, 18, 3);
    g.fillStyle(0x111827);
    g.fillRoundedRect(5, 5, 10, 10, 2);
    g.lineStyle(1.5, 0xfff7ad, 0.9);
    g.strokeRoundedRect(1, 1, 18, 18, 3);
    g.lineStyle(1, 0xfff7ad, 0.65);
    g.lineBetween(5, 2, 5, 0);
    g.lineBetween(10, 2, 10, 0);
    g.lineBetween(15, 2, 15, 0);
    g.lineBetween(5, 20, 5, 18);
    g.lineBetween(10, 20, 10, 18);
    g.lineBetween(15, 20, 15, 18);
    g.generateTexture('loot_gold', gr * 2, gr * 2);
    g.clear();

    g.destroy();
  }

  /* ========== WORLD SETUP ========== */

  private createWorld() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x07111a, 1)
      .setDepth(-35);
    this.add
      .grid(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 80, 80, 0x0b1721, 0.48, 0x173242, 0.28)
      .setDepth(-30);
    this.createLabDecor();

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

  private createLabDecor() {
    const floorDepth = -32;
    const decorDepth = -25;

    this.createFloorPanels(floorDepth);
    this.createAmbientFloorDetails(floorDepth + 1);
    this.createContainmentCore(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, decorDepth);

    [
      { x: 730, y: 760, w: 920, h: 560, label: 'DATA FARM', tint: 0x0f3d3e },
      { x: 3450, y: 820, w: 860, h: 540, label: 'MODEL VAULT', tint: 0x26345f },
      { x: 1080, y: 2420, w: 900, h: 520, label: 'POWER BAY', tint: 0x3f2f0b },
      { x: 3220, y: 2260, w: 860, h: 540, label: 'RED TEAM LAB', tint: 0x411521 }
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
  }

  private createFloorPanels(depth: number) {
    for (let y = 160; y < WORLD_HEIGHT; y += 320) {
      for (let x = 160; x < WORLD_WIDTH; x += 320) {
        const alternate = ((x + y) / 320) % 2 === 0;
        this.add.rectangle(x, y, 292, 292, alternate ? 0x0a1620 : 0x08121b, 0.34)
          .setStrokeStyle(1, 0x164457, 0.1)
          .setDepth(depth);
        if (alternate) {
          this.add.rectangle(x - 96, y - 96, 74, 8, 0x123244, 0.14).setDepth(depth + 1);
          this.add.rectangle(x + 96, y + 96, 74, 8, 0x123244, 0.12).setDepth(depth + 1);
        }
      }
    }
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

    for (let i = 0; i < 18; i++) {
      const x = 260 + (i * 211) % (WORLD_WIDTH - 520);
      const y = 240 + (i * 337) % (WORLD_HEIGHT - 480);
      this.add.rectangle(x, y, 46 + (i % 3) * 16, 6, 0x0f2a36, 0.22)
        .setRotation((i % 5) * 0.08)
        .setDepth(depth);
    }
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
    const hazard = 0xf59e0b;
    for (let i = 0; i < 28; i++) {
      const x = (i % 14) * 300 + 130;
      const topY = 88;
      const bottomY = WORLD_HEIGHT - 88;
      this.add.rectangle(x, topY, 138, 12, i % 2 === 0 ? hazard : 0x050b11, 0.72).setDepth(depth);
      this.add.rectangle(x, bottomY, 138, 12, i % 2 === 0 ? 0x050b11 : hazard, 0.72).setDepth(depth);
    }
    for (let i = 0; i < 18; i++) {
      const y = i * 160 + 120;
      this.add.rectangle(78, y, 12, 86, i % 2 === 0 ? hazard : 0x050b11, 0.55).setDepth(depth);
      this.add.rectangle(WORLD_WIDTH - 78, y, 12, 86, i % 2 === 0 ? 0x050b11 : hazard, 0.55).setDepth(depth);
    }
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

    this.add.rectangle(142, 94, 264, 168, 0x061018, 0.78)
      .setStrokeStyle(2, 0x22d3ee, 0.45)
      .setScrollFactor(0)
      .setDepth(95);
    this.add.rectangle(142, 30, 264, 30, 0x0d2a36, 0.92)
      .setStrokeStyle(1, 0x67e8f9, 0.5)
      .setScrollFactor(0)
      .setDepth(96);
    this.add.rectangle(this.scale.width / 2, 28, 370, 40, 0x061018, 0.72)
      .setStrokeStyle(1, 0x22d3ee, 0.38)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(95);

    this.hud = {
      brand: this.add.text(22, 18, 'AI 失控实验室', {
        ...style,
        fontSize: '17px',
        color: '#8df7ff',
        strokeThickness: 3
      }).setScrollFactor(0).setDepth(100),
      objective: this.add.text(22, 44, '目标: 坚持到隔离门解锁', {
        ...style,
        fontSize: '13px',
        color: '#9fb6c8',
        strokeThickness: 2
      }).setScrollFactor(0).setDepth(100),
      hp: this.add.text(22, 68, '', { ...style, fontSize: '16px' }).setScrollFactor(0).setDepth(100),
      level: this.add.text(22, 92, '', { ...style, fontSize: '16px' }).setScrollFactor(0).setDepth(100),
      xp: this.add.text(22, 116, '', { ...style, fontSize: '16px' }).setScrollFactor(0).setDepth(100),
      time: this.add.text(22, 140, '', { ...style, fontSize: '16px' }).setScrollFactor(0).setDepth(100),
      stats: this.add.text(22, 160, '', { ...style, fontSize: '13px', color: '#b7c9d9' }).setScrollFactor(0).setDepth(100),
      gold: this.add.text(0, 16, '', { ...style, fontSize: '18px', color: '#facc15' }).setScrollFactor(0).setDepth(100),
      message: this.add
        .text(this.scale.width / 2, 18, 'WASD 移动 | 自动火控 | 回收数据碎片升级', { ...style, fontSize: '15px', color: '#e0faff' })
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(100),
      bossHp: this.add.text(0, 0, '', { ...style, fontSize: '16px', color: '#ff6b8a' })
        .setOrigin(0.5).setScrollFactor(0).setDepth(100).setVisible(false),
      bossBarBg: this.add.rectangle(0, 0, 320, 12, 0x111827, 0.9)
        .setScrollFactor(0).setDepth(100).setVisible(false),
      bossBar: this.add.rectangle(0, 0, 320, 12, 0xff1744, 1)
        .setScrollFactor(0).setDepth(101).setVisible(false)
    };

    this.scale.on('resize', (size: Phaser.Structs.Size) => {
      this.hud.message.setX(size.width / 2);
      this.hud.message.setY(size.width < 760 ? 184 : 18);
      this.layoutBossHud();
      this.layoutCommercialButtons();
    });
    this.hud.message.setY(this.scale.width < 760 ? 184 : 18);
    this.layoutCommercialButtons();
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
      case 'boss': return { hpMul: 75, speedMul: 0.6, damageMul: 3, tex: Phaser.Utils.Array.GetRandom(['boss_demon', 'boss_eye', 'boss_reaper']) };
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
    const baseInterval = Math.max(360, 1100 - this.level * 45);
    const spawnInterval = this.waveActive ? Math.max(120, baseInterval / 4) : baseInterval;
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
    const txt = this.add.text(w / 2, this.scale.height / 2 - 100, '警报: 失控核心上线', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '40px', color: '#ff6b8a', stroke: '#000', strokeThickness: 8
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
    const preferred: BossAttackId[] = distance < 280
      ? ['spread', 'mortar', 'laser']
      : ['laser', 'mortar', 'spread'];
    const candidates = preferred.filter((attack) => attack !== this.bossLastAttack);
    const attack = Phaser.Utils.Array.GetRandom(candidates.length > 0 ? candidates : preferred);

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
      this.cameras.main.shake(120, 0.006);
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
      this.cameras.main.shake(90, 0.005);
      this.showHitText(this.player.x, this.player.y - 20, '-12', '#ff8a65');
      if (this.stats.hp <= 0) {
        this.endGame(false);
      }
    }
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
        this.cameras.main.shake(80, 0.004);
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
    const droneCount = Math.min(4, 1 + Math.floor((lv + 1) / 2) + (lv >= 5 ? 1 : 0));
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
    const bottle = this.add.image(startX, startY, 'weapon_molotov').setDepth(18);
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
    const missile = this.add.image(this.player.x, this.player.y - 10, 'weapon_missile').setDepth(18);
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
    const carrier = this.add.image(carrierStartX, carrierStartY, 'weapon_laser_sat')
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
    const droneCount = droneLevel > 0 ? Math.min(4, 1 + Math.floor((droneLevel + 1) / 2) + (droneLevel >= 5 ? 1 : 0)) : 0;
    while (this.droneVisuals.length < droneCount) {
      this.droneVisuals.push(this.add.image(this.player.x, this.player.y, 'weapon_drone').setDepth(22));
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
      this.bladeVisuals.push(this.add.image(this.player.x, this.player.y, 'weapon_blade').setDepth(21));
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
      if (!enemy.active) return;
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
      const healed = Math.min(this.stats.maxHp - this.stats.hp, 25);
      this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + 25);
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
    const txt = this.add.text(w / 2, this.scale.height / 2 - 140, `${names[skillId]} 已解锁`, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '34px', color: '#8df7ff', stroke: '#000', strokeThickness: 8
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

    const resultText = win ? '隔离成功' : '实验员离线';
    const resultColor = win ? '#8df7ff' : '#ff6b8a';
    const title = this.add.text(w / 2, h / 2 - 100, resultText, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '42px',
      color: resultColor, stroke: '#000', strokeThickness: 6
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(title);

    const statsLine = [
      `Lv.${this.level}`,
      `清除 ${this.kills}`,
      `算力 ${this.gold}`,
      `${Math.ceil(this.elapsedMs / 1000)}s`
    ].join('  |  ');
    const stats = this.add.text(w / 2, h / 2 - 20, statsLine, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px',
      color: '#f6f1e7', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    this.overlayElements.push(stats);

    if (!win && !this.reviveUsed) {
      const reviveBtn = this.add.rectangle(w / 2, h / 2 + 50, 240, 44, 0x7c2d12, 0.9)
        .setStrokeStyle(2, 0xffd966, 0.8).setScrollFactor(0).setDepth(D)
        .setInteractive({ useHandCursor: true });
      const reviveLabel = this.add.text(w / 2, h / 2 + 50, '观看赞助补给 (恢复50%生命)', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '16px', color: '#ffd966'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
      reviveBtn.on('pointerover', () => reviveBtn.setFillStyle(0xa0522d, 0.95));
      reviveBtn.on('pointerout', () => reviveBtn.setFillStyle(0x8b4513, 0.9));
      reviveBtn.on('pointerdown', () => this.tryAdRevive());
      this.overlayElements.push(reviveBtn, reviveLabel);
    }

    const restartBtn = this.add.rectangle(w / 2, h / 2 + 110, 200, 44, 0x0e7490, 0.95)
      .setStrokeStyle(2, 0x67e8f9, 0.8).setScrollFactor(0).setDepth(D)
      .setInteractive({ useHandCursor: true });
    const restartLabel = this.add.text(w / 2, h / 2 + 110, '重启实验', {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: '18px', color: '#f6f1e7'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
    restartBtn.on('pointerover', () => restartBtn.setFillStyle(0x1976d2, 0.98));
    restartBtn.on('pointerout', () => restartBtn.setFillStyle(0x1565c0, 0.95));
    restartBtn.on('pointerdown', () => this.scene.restart());
    this.overlayElements.push(restartBtn, restartLabel);
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

    this.hud.hp.setText(`生命维持: ${this.stats.hp}/${this.stats.maxHp}`);
    this.hud.level.setText(`权限等级: ${this.level}`);
    this.hud.xp.setText(`数据碎片: ${this.xp}/${this.xpToNext}${this.doubleXp ? '  x2' : ''}`);
    this.hud.time.setText(`隔离倒计时: ${timeStr}`);
    this.hud.stats.setText(`清除: ${this.kills} | 算力: ${this.gold} | 脉冲: ${this.shots}`);
    this.hud.gold.setText(`算力 ${this.gold}`).setX(this.scale.width - 112);

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
        const barW = 320 * ratio;
        this.hud.bossHp.setText(`失控核心 HP: ${Math.ceil(bossHp)}/${bossMaxHp}`);
        this.hud.bossBar.setSize(barW, 12);
      }
    }
  }
}
