import Phaser from 'phaser';
import { Enemy } from '../entities/Enemy';

export class EnemySpawner {
  private elapsed = 0;

  update(
    delta: number,
    scene: Phaser.Scene,
    player: Phaser.Physics.Arcade.Image,
    group: Phaser.Physics.Arcade.Group,
    elapsedMs: number
  ) {
    const seconds = elapsedMs / 1000;
    const interval = Math.max(360, 1400 - seconds * 16);
    this.elapsed += delta;

    while (this.elapsed >= interval) {
      this.elapsed -= interval;
      const enemy = this.createEnemyAroundScreen(scene, player, seconds);
      group.add(enemy.sprite);
    }
  }

  private createEnemyAroundScreen(scene: Phaser.Scene, player: Phaser.Physics.Arcade.Image, seconds: number) {
    const margin = 32;
    const side = Phaser.Math.Between(0, 3);
    let x = player.x;
    let y = player.y;

    if (side === 0) {
      x = -margin;
      y = Phaser.Math.Between(0, scene.scale.height);
    } else if (side === 1) {
      x = scene.scale.width + margin;
      y = Phaser.Math.Between(0, scene.scale.height);
    } else if (side === 2) {
      x = Phaser.Math.Between(0, scene.scale.width);
      y = -margin;
    } else {
      x = Phaser.Math.Between(0, scene.scale.width);
      y = scene.scale.height + margin;
    }

    const difficultyLevel = Math.floor(seconds / 30) + 1;
    return new Enemy(scene, x, y, difficultyLevel);
  }
}
