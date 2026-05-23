import Phaser from 'phaser';
import { BALANCE } from './data/balance';
import { Bullet } from './entities/Bullet';
import { ExpOrb } from './entities/ExpOrb';
import { Player } from './entities/Player';
import { EnemySpawner } from './systems/EnemySpawner';
import { MonetizationMock } from './systems/MonetizationMock';

export class GameScene extends Phaser.Scene {
  private player?: Player;
  private enemies?: Phaser.Physics.Arcade.Group;
  private bullets?: Phaser.Physics.Arcade.Group;
  private xpOrbs?: Phaser.Physics.Arcade.Group;
  private enemySpawner = new EnemySpawner();
  private keys?: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private elapsedMs = 0;
  private hp: number = BALANCE.player.hp;
  private level = 1;
  private xp = 0;
  private totalXp = 0;
  private xpToNext: number = BALANCE.xp.firstLevelNeed;
  private damageCooldownMs = 0;
  private attackCooldownMs = 0;
  private shots = 0;
  private kills = 0;
  private gameEnded = false;
  private reviveUsed = false;
  private doubleRewardClaimed = false;
  private overlay?: Phaser.GameObjects.Container;
  private hud?: {
    hp: Phaser.GameObjects.Text;
    level: Phaser.GameObjects.Text;
    xp: Phaser.GameObjects.Text;
    time: Phaser.GameObjects.Text;
    combat: Phaser.GameObjects.Text;
    hint: Phaser.GameObjects.Text;
  };

  constructor() {
    super('GameScene');
  }

  create() {
    this.createTextures();
    this.setupFixedWorld();
    this.createBackground();

    this.player = new Player(this, this.scale.width / 2, this.scale.height / 2);
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.xpOrbs = this.physics.add.group();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    this.createHud();
    this.createMonetizationMock();
    this.updateHud();

    this.scale.on('resize', () => {
      this.setupFixedWorld();
      this.keepPlayerInsideBounds();
    });
  }

  update(_time: number, delta: number) {
    if (this.gameEnded || this.overlay) {
      return;
    }

    this.elapsedMs += delta;
    this.damageCooldownMs += delta;
    this.attackCooldownMs += delta;
    this.player?.move(this.keys!);
    this.updateEnemies(delta);
    this.updateAutoAttack();
    this.updateXpOrbs();
    this.cleanupBullets(delta);
    this.updateHud();

    if (this.elapsedMs >= BALANCE.run.durationMs) {
      this.endRun(true);
    }
  }

  private setupFixedWorld() {
    this.physics.world.setBounds(0, 0, this.scale.width, this.scale.height);
    this.cameras.main.setBounds(0, 0, this.scale.width, this.scale.height);
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0, 0);
  }

  private createBackground() {
    this.add
      .grid(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 80, 80, 0x1d2430, 0.45, 0x2a3444, 0.55)
      .setDepth(-10)
      .setScrollFactor(0);
  }

  private createHud() {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Arial, Microsoft YaHei, sans-serif',
      fontSize: '18px',
      color: '#f6f1e7',
      stroke: '#10141c',
      strokeThickness: 4
    };

    this.hud = {
      hp: this.add.text(18, 16, '', style).setDepth(100).setScrollFactor(0),
      level: this.add.text(18, 42, '', style).setDepth(100).setScrollFactor(0),
      xp: this.add.text(18, 68, '', style).setDepth(100).setScrollFactor(0),
      time: this.add.text(18, 94, '', style).setDepth(100).setScrollFactor(0),
      combat: this.add.text(18, 120, '', { ...style, fontSize: '14px' }).setDepth(100).setScrollFactor(0),
      hint: this.add
        .text(this.scale.width / 2, 18, 'WASD to move', {
          ...style,
          fontSize: '16px'
        })
        .setOrigin(0.5, 0)
        .setDepth(100)
        .setScrollFactor(0)
    };
  }

  private updateHud() {
    if (!this.hud) return;

    const remainMs = Math.max(0, BALANCE.run.durationMs - this.elapsedMs);
    const remainSeconds = Math.ceil(remainMs / 1000);
    const minutes = Math.floor(remainSeconds / 60);
    const seconds = `${remainSeconds % 60}`.padStart(2, '0');

    this.hud.hp.setText(`HP: ${Math.ceil(this.hp)} / ${BALANCE.player.hp}`);
    this.hud.level.setText(`Level: ${this.level}`);
    this.hud.xp.setText(`XP: ${this.xp} / ${this.xpToNext}`);
    this.hud.time.setText(`Time: ${minutes}:${seconds}`);
    this.hud.combat.setText(`Shots: ${this.shots}  Kills: ${this.kills}`);
    this.hud.hint.setX(this.scale.width / 2);
  }

  private keepPlayerInsideBounds() {
    if (!this.player) return;

    this.player.sprite.setPosition(
      Phaser.Math.Clamp(this.player.sprite.x, BALANCE.player.radius, this.scale.width - BALANCE.player.radius),
      Phaser.Math.Clamp(this.player.sprite.y, BALANCE.player.radius, this.scale.height - BALANCE.player.radius)
    );
  }

  private updateEnemies(delta: number) {
    if (!this.player || !this.enemies) return;

    this.enemySpawner.update(delta, this, this.player.sprite, this.enemies, this.elapsedMs);

    let touchingPlayer = false;
    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) return;

      const speed = enemy.getData('speed') as number;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player!.sprite.x, this.player!.sprite.y);
      this.physics.velocityFromRotation(angle, speed, enemy.body!.velocity);

      const distance = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player!.sprite.x, this.player!.sprite.y);
      if (distance <= BALANCE.player.radius + BALANCE.enemy.size * 0.5) {
        touchingPlayer = true;
      }
    });

    if (touchingPlayer && this.damageCooldownMs >= 700) {
      this.damageCooldownMs = 0;
      this.hp = Math.max(0, this.hp - BALANCE.enemy.damage);
      this.cameras.main.shake(80, 0.004);
      if (this.hp <= 0) {
        this.endRun(false);
      }
    }
  }

  private updateAutoAttack() {
    if (!this.player || !this.enemies || this.attackCooldownMs < BALANCE.weapon.attackIntervalMs) {
      return;
    }

    const target = this.findNearestEnemy();
    if (!target) {
      return;
    }

    this.attackCooldownMs = 0;
    this.fireBulletAt(target);
  }

  private findNearestEnemy() {
    if (!this.player || !this.enemies) return undefined;

    let nearest: Phaser.Physics.Arcade.Image | undefined;
    let nearestDistanceSq = BALANCE.weapon.range * BALANCE.weapon.range;

    this.enemies.getChildren().forEach((child) => {
      const enemy = child as Phaser.Physics.Arcade.Image;
      if (!enemy.active) return;

      const distanceSq = Phaser.Math.Distance.Squared(this.player!.sprite.x, this.player!.sprite.y, enemy.x, enemy.y);
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearest = enemy;
      }
    });

    return nearest;
  }

  private fireBulletAt(target: Phaser.Physics.Arcade.Image) {
    if (!this.player || !this.bullets) return;

    const bullet = new Bullet(this, this.player.sprite.x, this.player.sprite.y);
    this.bullets.add(bullet.sprite);
    this.shots += 1;

    const distance = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, target.x, target.y);
    const flightMs = Math.max(80, (distance / BALANCE.weapon.bulletSpeed) * 1000);

    this.time.delayedCall(flightMs, () => {
      if (target.active) {
        this.damageEnemy(target, BALANCE.weapon.damage);
      }
    });

    this.tweens.add({
      targets: bullet.sprite,
      x: target.x,
      y: target.y,
      duration: flightMs,
      ease: 'Linear',
      onComplete: () => bullet.sprite.destroy()
    });
  }

  private damageEnemy(enemy: Phaser.Physics.Arcade.Image, amount: number) {
    const hp = (enemy.getData('hp') as number) - amount;
    enemy.setData('hp', hp);

    this.showDamageText(enemy.x, enemy.y, amount);

    if (hp <= 0) {
      const x = enemy.x;
      const y = enemy.y;
      enemy.destroy();
      this.kills += 1;
      this.dropXp(x, y);
      this.showKillEffect(x, y);
    }
  }

  private dropXp(x: number, y: number) {
    if (!this.xpOrbs) return;

    const orb = new ExpOrb(this, x, y);
    this.xpOrbs.add(orb.sprite);
    this.tweens.add({
      targets: orb.sprite,
      scale: 1.18,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private updateXpOrbs() {
    if (!this.player || !this.xpOrbs) return;

    this.xpOrbs.getChildren().forEach((child) => {
      const orb = child as Phaser.Physics.Arcade.Image;
      if (!orb.active) return;

      const distance = Phaser.Math.Distance.Between(this.player!.sprite.x, this.player!.sprite.y, orb.x, orb.y);
      if (distance <= 34) {
        this.collectXp(orb);
        return;
      }

      if (distance <= 110) {
        const angle = Phaser.Math.Angle.Between(orb.x, orb.y, this.player!.sprite.x, this.player!.sprite.y);
        this.physics.velocityFromRotation(angle, 210, orb.body!.velocity);
      } else {
        orb.setVelocity(0, 0);
      }
    });
  }

  private collectXp(orb: Phaser.Physics.Arcade.Image) {
    const value = orb.getData('value') as number;
    orb.destroy();
    this.xp += value;
    this.totalXp += value;

    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.floor(this.xpToNext * 1.25 + 8);
      this.showLevelUpText();
    }
  }

  private showLevelUpText() {
    if (!this.player) return;

    const text = this.add
      .text(this.player.sprite.x, this.player.sprite.y - 52, `LEVEL ${this.level}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#67ff7a',
        stroke: '#10141c',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(45);

    this.tweens.add({
      targets: text,
      y: text.y - 36,
      alpha: 0,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy()
    });
  }

  private showDamageText(x: number, y: number, amount: number) {
    const text = this.add
      .text(x, y - 22, `${amount}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        color: '#fff275',
        stroke: '#10141c',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setDepth(40);

    this.tweens.add({
      targets: text,
      y: y - 42,
      alpha: 0,
      duration: 500,
      ease: 'Sine.easeOut',
      onComplete: () => text.destroy()
    });
  }

  private showKillEffect(x: number, y: number) {
    const ring = this.add.circle(x, y, 14, 0xffffff, 0).setStrokeStyle(4, 0xfff275, 0.9).setDepth(35);
    this.tweens.add({
      targets: ring,
      radius: 38,
      alpha: 0,
      duration: 320,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy()
    });
  }

  private cleanupBullets(delta: number) {
    if (!this.bullets) return;

    this.bullets.getChildren().forEach((child) => {
      const bullet = child as Phaser.Physics.Arcade.Image;
      const life = ((bullet.getData('life') as number | undefined) ?? 1500) - delta;
      bullet.setData('life', life);
      if (life <= 0) {
        bullet.destroy();
      }
    });
  }

  private createMonetizationMock() {
    new MonetizationMock(this).create([
      {
        label: 'Battle Pass',
        action: () => this.showBattlePass()
      }
    ]);
  }

  private endRun(victory: boolean) {
    if (this.gameEnded) return;

    this.gameEnded = true;
    this.player?.sprite.setVelocity(0, 0);
    this.enemies?.getChildren().forEach((child) => (child as Phaser.Physics.Arcade.Image).setVelocity(0, 0));
    this.showResultPanel(victory);
  }

  private getSurvivalTimeText() {
    const seconds = Math.floor(this.elapsedMs / 1000);
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${`${seconds % 60}`.padStart(2, '0')}`;
  }

  private showResultPanel(victory: boolean) {
    const title = victory ? 'Victory' : 'Defeat';
    const resultColor = victory ? '#67ff7a' : '#ff6b81';
    const lines = [
      `Survival Time: ${this.getSurvivalTimeText()}`,
      `Kills: ${this.kills}`,
      `Level: ${this.level}`,
      `XP Gained: ${this.totalXp}`
    ];

    const container = this.createOverlayBase();
    const x = this.scale.width / 2;
    const y = this.scale.height / 2;
    const panel = this.add.rectangle(x, y, 520, 360, 0x202838, 0.98).setStrokeStyle(2, 0x69d8ff, 0.8);
    const titleText = this.add
      .text(x, y - 128, title, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '34px',
        color: resultColor,
        stroke: '#10141c',
        strokeThickness: 5
      })
      .setOrigin(0.5);
    const summary = this.add
      .text(x, y - 46, lines.join('\n'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '18px',
        color: '#f6f1e7',
        align: 'center',
        lineSpacing: 8
      })
      .setOrigin(0.5);

    const restart = this.createButton(x, y + 76, 'Restart', () => this.scene.restart(), 0x67ff7a);
    const doubleXp = this.createButton(x, y + 124, 'Double XP Reward', () => {
      if (this.doubleRewardClaimed) return;
      this.doubleRewardClaimed = true;
      this.totalXp *= 2;
      summary.setText([`Survival Time: ${this.getSurvivalTimeText()}`, `Kills: ${this.kills}`, `Level: ${this.level}`, `XP Gained: ${this.totalXp} (x2)`].join('\n'));
    }, 0xfff275);

    container.add([panel, titleText, summary, ...restart, ...doubleXp]);

    if (!victory) {
      const revive = this.createButton(x, y + 172, 'Watch Ad to Revive', () => this.reviveFromAd(), 0x69d8ff);
      container.add(revive);
    }
  }

  private reviveFromAd() {
    if (this.reviveUsed) return;

    this.reviveUsed = true;
    this.gameEnded = false;
    this.hp = Math.floor(BALANCE.player.hp * 0.6);
    this.damageCooldownMs = 0;
    this.overlay?.destroy();
    this.overlay = undefined;
    this.updateHud();
  }

  private showBattlePass() {
    const container = this.createOverlayBase();
    const x = this.scale.width / 2;
    const y = this.scale.height / 2;
    const panel = this.add.rectangle(x, y, 620, 380, 0x202838, 0.98).setStrokeStyle(2, 0xfff275, 0.8);
    const title = this.add
      .text(x, y - 150, 'Growth Battle Pass', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#fff275',
        stroke: '#10141c',
        strokeThickness: 4
      })
      .setOrigin(0.5);
    const progress = this.add
      .text(x, y - 106, `Progress: Level ${this.level} / 30`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        color: '#f6f1e7'
      })
      .setOrigin(0.5);
    const free = this.add
      .text(x - 150, y - 16, 'Free Rewards\nLv.1 Gold\nLv.5 Gem\nLv.10 Chest', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        color: '#dce6f2',
        align: 'center',
        lineSpacing: 10
      })
      .setOrigin(0.5);
    const premium = this.add
      .text(x + 150, y - 16, 'Premium Rewards\nLv.1 Skin\nLv.5 Epic Gem\nLv.10 S Weapon', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '17px',
        color: '#fff275',
        align: 'center',
        lineSpacing: 10
      })
      .setOrigin(0.5);
    const unlock = this.createButton(x, y + 118, 'Unlock Premium Mock', () => {
      this.showToast('Premium track mock only');
    }, 0xfff275);
    const close = this.createButton(x, y + 166, 'Close', () => {
      container.destroy();
      this.overlay = undefined;
    }, 0x67ff7a);

    container.add([panel, title, progress, free, premium, ...unlock, ...close]);
  }

  private createOverlayBase() {
    this.overlay?.destroy();
    const container = this.add.container(0, 0).setScrollFactor(0).setDepth(200);
    const shade = this.add
      .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x05070b, 0.62)
      .setInteractive();
    container.add(shade);
    this.overlay = container;
    return container;
  }

  private createButton(x: number, y: number, label: string, onClick: () => void, color: number) {
    const bg = this.add.rectangle(x, y, 220, 34, color, 0.92).setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: '#10141c'
      })
      .setOrigin(0.5);
    bg.on('pointerdown', onClick);
    return [bg, text];
  }

  private showToast(message: string) {
    const toast = this.add
      .text(this.scale.width / 2, this.scale.height - 72, message, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#f6f1e7',
        backgroundColor: '#202838',
        padding: { x: 14, y: 8 }
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(260);
    this.tweens.add({
      targets: toast,
      alpha: 0,
      duration: 900,
      delay: 700,
      onComplete: () => toast.destroy()
    });
  }

  private createTextures() {
    const g = this.add.graphics();

    g.fillStyle(0x5bd8ff);
    g.fillCircle(BALANCE.player.radius, BALANCE.player.radius, BALANCE.player.radius);
    g.lineStyle(3, 0xffffff, 0.9);
    g.strokeCircle(BALANCE.player.radius, BALANCE.player.radius, BALANCE.player.radius);
    g.generateTexture('player', BALANCE.player.radius * 2, BALANCE.player.radius * 2);
    g.clear();

    g.fillStyle(0xff4d6d);
    g.fillRect(0, 0, BALANCE.enemy.size, BALANCE.enemy.size);
    g.generateTexture('enemy', BALANCE.enemy.size, BALANCE.enemy.size);
    g.clear();

    g.fillStyle(0xfff275);
    g.fillCircle(7, 7, 7);
    g.generateTexture('bullet', 14, 14);
    g.clear();

    g.fillStyle(0x67ff7a);
    g.fillTriangle(14, 0, 28, 14, 14, 28);
    g.fillTriangle(14, 0, 0, 14, 14, 28);
    g.lineStyle(2, 0xf4ffd9, 0.85);
    g.strokeTriangle(14, 0, 28, 14, 14, 28);
    g.strokeTriangle(14, 0, 0, 14, 14, 28);
    g.generateTexture('xp', 28, 28);
    g.destroy();
  }
}
