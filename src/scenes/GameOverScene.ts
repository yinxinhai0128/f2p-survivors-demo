import Phaser from 'phaser';

interface GameOverData {
  win: boolean;
  level: number;
  kills: number;
  gold: number;
  elapsedMs: number;
  shots: number;
}

export class GameOverScene extends Phaser.Scene {
  private resultData!: GameOverData;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: GameOverData) {
    this.resultData = data;
  }

  create() {
    const { win, level, kills, gold, elapsedMs, shots } = this.resultData;
    const w = this.scale.width;
    const h = this.scale.height;

    this.cameras.main.setBackgroundColor('#0a1018');

    // === 背景粒子 ===
    for (let i = 0; i < 20; i++) {
      const px = Phaser.Math.Between(20, w - 20);
      const py = Phaser.Math.Between(20, h - 20);
      const dot = this.add.circle(px, py, Phaser.Math.Between(1, 2),
        win ? 0x67e8f9 : 0xff6b8a, Phaser.Math.FloatBetween(0.05, 0.15)).setDepth(0);
      this.tweens.add({
        targets: dot, y: py - Phaser.Math.Between(20, 60), alpha: 0,
        duration: Phaser.Math.Between(2000, 4000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 2000)
      });
    }

    // === 结果标题 ===
    const resultText = win ? '隔离成功' : '实验员离线';
    const resultColor = win ? '#67e8f9' : '#ff6b8a';
    const accentColor = win ? 0x22d3ee : 0xff4444;

    // 标题背景光束
    const beam = this.add.rectangle(w / 2, h * 0.22, 0, 3, accentColor, 0)
      .setDepth(5);
    this.tweens.add({
      targets: beam, width: Math.min(400, w * 0.6), alpha: 0.5,
      duration: 600, ease: 'Back.easeOut', delay: 100
    });

    // 标题
    const title = this.add.text(w / 2, h * 0.22, resultText, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '48px', color: resultColor,
      stroke: '#000', strokeThickness: 8
    }).setOrigin(0.5).setAlpha(0).setDepth(10);

    this.tweens.add({
      targets: title, alpha: 1, y: h * 0.22 - 6, duration: 500,
      ease: 'Back.easeOut', delay: 200
    });

    // 标题光束还回
    this.tweens.add({
      targets: beam, alpha: 0.15, duration: 800, delay: 600,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // === 统计面板 ===
    const panelW = Math.min(440, w - 40);
    const panelH = 280;
    const panelX = w / 2;
    const panelY = h * 0.52;

    // 面板背景
    const panel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0b1721, 0.92)
      .setStrokeStyle(2, accentColor, 0.4).setDepth(5).setAlpha(0);

    this.tweens.add({
      targets: panel, alpha: 1, duration: 400, delay: 400
    });

    // 面板标题
    const panelTitle = this.add.text(panelX, panelY - panelH / 2 + 28, '// 实验报告 //', {
      fontFamily: 'Arial, monospace',
      fontSize: '12px', color: '#64748b'
    }).setOrigin(0.5).setDepth(6).setAlpha(0);

    this.tweens.add({
      targets: panelTitle, alpha: 0.6, duration: 300, delay: 600
    });

    // 统计项
    const timeStr = this.formatTime(elapsedMs);
    const stats = [
      { label: '权限等级', value: `Lv.${level}`, color: '#ffd966' },
      { label: '清除目标', value: `${kills}`, color: '#f6f1e7' },
      { label: '累计算力', value: `${gold}`, color: '#ffc107' },
      { label: '脉冲发射', value: `${shots}`, color: '#94a3b8' },
      { label: '存活时间', value: timeStr, color: '#67e8f9' },
    ];

    const rowH = 36;
    const startY = panelY - 70;
    stats.forEach((stat, i) => {
      const rowY = startY + i * rowH;

      // 分隔线
      if (i > 0) {
        const sep = this.add.rectangle(panelX, rowY - rowH / 2, panelW - 60, 1, 0x1e4050, 0)
          .setDepth(6);
        this.tweens.add({
          targets: sep, alpha: 0.5, duration: 300, delay: 700 + i * 100
        });
      }

      const label = this.add.text(panelX - panelW / 2 + 40, rowY, stat.label, {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif',
        fontSize: '16px', color: '#94a3b8'
      }).setOrigin(0, 0.5).setAlpha(0).setDepth(6);

      this.tweens.add({
        targets: label, alpha: 1, duration: 350, delay: 700 + i * 120
      });

      // 数值使用计数动画
      const valueText = this.add.text(panelX + panelW / 2 - 40, rowY, '0', {
        fontFamily: 'Arial, monospace',
        fontSize: '18px', color: stat.color
      }).setOrigin(1, 0.5).setAlpha(0).setDepth(6);

      this.tweens.add({
        targets: valueText, alpha: 1, duration: 350, delay: 700 + i * 120
      });

      // 数值滚动动画
      this.animateCounter(valueText, stat.value, 900 + i * 120, stat.color);
    });

    // === 按钮 ===
    const btnY = h * 0.78;
    const btnGap = 80;

    // 重新开始按钮
    this.createButton(w / 2 - (win ? 0 : btnGap), btnY, '重启实验', 0x0e7490, 0x67e8f9, () => {
      this.cameras.main.fadeOut(350, 0, 0, 0);
      this.time.delayedCall(350, () => this.scene.start('GameScene'));
    }, 900);

    // 失败时显示返回标题按钮
    if (!win) {
      this.createButton(w / 2 + btnGap, btnY, '返回标题', 0x1e293b, 0x94a3b8, () => {
        this.cameras.main.fadeOut(350, 0, 0, 0);
        this.time.delayedCall(350, () => this.scene.start('TitleScene'));
      }, 1050);
    } else {
      // 胜利时返回按钮在下面
      this.createButton(w / 2, btnY + 56, '返回标题', 0x1e293b, 0x94a3b8, () => {
        this.cameras.main.fadeOut(350, 0, 0, 0);
        this.time.delayedCall(350, () => this.scene.start('TitleScene'));
      }, 1100);
    }

    // === 成就提示(胜利时) ===
    if (win) {
      const achievement = this.add.text(w / 2, h * 0.9, '★ 实验体已成功隔离 ★', {
        fontFamily: 'Microsoft YaHei, Arial, sans-serif',
        fontSize: '18px', color: '#ffd700', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5).setAlpha(0).setDepth(10);

      this.tweens.add({
        targets: achievement, alpha: 1, duration: 600, delay: 1400
      });
      this.tweens.add({
        targets: achievement, alpha: 0.6, y: h * 0.9 - 4, duration: 2000,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 2000
      });
    }

    // 入场淡入
    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  private animateCounter(
    target: Phaser.GameObjects.Text,
    finalValue: string,
    delay: number,
    color: string
  ) {
    // 如果是纯数字，做滚动动画；否则直接设置
    const num = parseInt(finalValue, 10);
    if (isNaN(num)) {
      this.tweens.add({
        targets: { v: 0 }, v: 0,
        duration: 1, delay,
        onComplete: () => target.setText(finalValue)
      });
      return;
    }

    const counter = { v: 0 };
    this.tweens.add({
      targets: counter, v: num,
      duration: Math.min(800, 200 + num * 3),
      delay,
      ease: 'Sine.easeOut',
      onUpdate: () => {
        target.setText(Math.floor(counter.v).toString());
        target.setColor(color);
      }
    });
  }

  private createButton(
    x: number, y: number,
    label: string,
    bgColor: number,
    strokeColor: number,
    callback: () => void,
    delay: number
  ) {
    const btnW = 180;
    const btnH = 46;

    const btn = this.add.rectangle(x, y, btnW, btnH, bgColor, 0)
      .setStrokeStyle(2, strokeColor, 0).setDepth(10)
      .setInteractive({ useHandCursor: true });

    const btnLabel = this.add.text(x, y, label, {
      fontFamily: 'Microsoft YaHei, Arial, sans-serif',
      fontSize: '17px', color: '#e0f2fe'
    }).setOrigin(0.5).setAlpha(0).setDepth(11);

    // 入场动画
    this.tweens.add({
      targets: [btn, btnLabel], alpha: 1, duration: 400, delay,
      onUpdate: (_tween: Phaser.Tweens.Tween, target: Phaser.GameObjects.GameObject) => {
        if (target instanceof Phaser.GameObjects.Rectangle) {
          target.setFillStyle(bgColor, 0.9);
          target.setStrokeStyle(2, strokeColor, 0.6);
        }
      }
    });

    btn.on('pointerover', () => {
      btn.setFillStyle(bgColor, 1);
      btn.setStrokeStyle(2, strokeColor, 0.9);
      btnLabel.setColor('#ffffff');
    });
    btn.on('pointerout', () => {
      btn.setFillStyle(bgColor, 0.9);
      btn.setStrokeStyle(2, strokeColor, 0.6);
      btnLabel.setColor('#e0f2fe');
    });
    btn.on('pointerdown', callback);
  }

  private formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
}
