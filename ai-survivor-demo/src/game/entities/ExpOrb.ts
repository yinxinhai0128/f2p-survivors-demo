import Phaser from 'phaser';
import { BALANCE } from '../data/balance';

export class ExpOrb {
  readonly sprite: Phaser.Physics.Arcade.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.image(x, y, 'xp');
    this.sprite.setCircle(BALANCE.xp.radius);
    this.sprite.setData('value', BALANCE.xp.perEnemy);
    this.sprite.setDepth(14);
  }
}
