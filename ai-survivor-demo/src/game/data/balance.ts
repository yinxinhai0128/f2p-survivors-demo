export const BALANCE = {
  world: {
    width: 2400,
    height: 1600
  },
  player: {
    hp: 100,
    speed: 220,
    radius: 18
  },
  enemy: {
    hp: 24,
    speed: 70,
    damage: 8,
    size: 30
  },
  weapon: {
    attackIntervalMs: 900,
    damage: 28,
    range: 620,
    bulletSpeed: 720
  },
  xp: {
    perEnemy: 4,
    firstLevelNeed: 12,
    radius: 10
  },
  run: {
    durationMs: 180_000
  }
} as const;
