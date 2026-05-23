import Phaser from 'phaser';

type MockButton = {
  label: string;
  action: () => void;
};

export class MonetizationMock {
  private items: Phaser.GameObjects.GameObject[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  create(buttons: MockButton[]) {
    buttons.forEach((button) => {
      const bg = this.scene.add
        .rectangle(0, 0, 150, 34, 0x222b38, 0.9)
        .setStrokeStyle(2, 0x69d8ff, 0.7)
        .setScrollFactor(0)
        .setDepth(100)
        .setInteractive({ useHandCursor: true });
      const label = this.scene.add
        .text(0, 0, button.label, {
          fontFamily: 'Arial, sans-serif',
          fontSize: '15px',
          color: '#f6f1e7'
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(101);

      bg.on('pointerdown', button.action);
      this.items.push(bg, label);
    });

    this.layout();
    this.scene.scale.on('resize', () => this.layout());
  }

  private layout() {
    for (let i = 0; i < this.items.length; i += 2) {
      const row = i / 2;
      const x = this.scene.scale.width - 96;
      const y = 24 + row * 44;
      (this.items[i] as Phaser.GameObjects.Rectangle).setPosition(x, y);
      (this.items[i + 1] as Phaser.GameObjects.Text).setPosition(x, y);
    }
  }
}
