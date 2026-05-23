import Phaser from 'phaser';

export class Bullet {
  readonly sprite: Phaser.Physics.Arcade.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.image(x, y, 'bullet');
    this.sprite.setCircle(7);
    this.sprite.setDepth(16);
  }
}
