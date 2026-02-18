import rawLevels from "../config/levels.json";
import type { LevelBaseConfig, LevelRuntimeConfig } from "./types";

const baseLevels = rawLevels as LevelBaseConfig[];

export function getLevelConfig(levelIndex: number): LevelRuntimeConfig {
  const levelNumber = levelIndex + 1;
  const cycle = Math.floor(levelIndex / baseLevels.length);
  const base = baseLevels[levelIndex % baseLevels.length];

  return {
    ...base,
    targetKills: Math.floor(base.targetKills + cycle * 16),
    spawnInterval: Math.max(0.32, base.spawnInterval - cycle * 0.04),
    maxEnemies: base.maxEnemies + cycle * 2,
    playerSpeedBonus: base.playerSpeedBonus + cycle * 2,
    levelNumber,
    bossLevel: base.bossLevel,
  };
}
