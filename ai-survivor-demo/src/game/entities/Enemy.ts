import Phaser from 'phaser';
import { BALANCE } from '../data/balance';

export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, level: number) {
    this.sprite = scene.physics.add.image(x, y, 'enemy');
    this.sprite.setData('hp', BALANCE.enemy.hp + Math.floor(level / 3) * 8);
    this.sprite.setData('damage', BALANCE.enemy.damage);
    this.sprite.setData('speed', BALANCE.enemy.speed + Math.min(level * 2, 40));
    this.sprite.setDepth(10);
  }
}
