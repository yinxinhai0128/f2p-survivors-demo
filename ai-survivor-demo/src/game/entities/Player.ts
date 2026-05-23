import Phaser from 'phaser';
import { BALANCE } from '../data/balance';

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.image(x, y, 'player');
    this.sprite.setCircle(BALANCE.player.radius);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setDepth(20);
  }

  move(keys: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>) {
    const direction = new Phaser.Math.Vector2(0, 0);

    if (keys.A.isDown) direction.x -= 1;
    if (keys.D.isDown) direction.x += 1;
    if (keys.W.isDown) direction.y -= 1;
    if (keys.S.isDown) direction.y += 1;

    if (direction.lengthSq() > 0) {
      direction.normalize().scale(BALANCE.player.speed);
    }

    this.sprite.setVelocity(direction.x, direction.y);
  }
}
