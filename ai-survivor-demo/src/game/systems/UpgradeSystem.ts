export type UpgradeId = 'attackSpeed' | 'bulletCount' | 'damage' | 'moveSpeed' | 'heal';

export type UpgradeOption = {
  id: UpgradeId;
  title: string;
  description: string;
};

export class UpgradeSystem {
  getOptions(): UpgradeOption[] {
    const all: UpgradeOption[] = [
      { id: 'attackSpeed', title: 'Attack Speed', description: 'Attack interval -12%' },
      { id: 'bulletCount', title: 'More Bullets', description: 'Fire one extra bullet' },
      { id: 'damage', title: 'Stronger Bullet', description: 'Bullet damage +8' },
      { id: 'moveSpeed', title: 'Move Speed', description: 'Move speed +12%' },
      { id: 'heal', title: 'Heal', description: 'Recover 35 HP' }
    ];

    return all.sort(() => Math.random() - 0.5).slice(0, 3);
  }
}
