export type EnemyType = "seeker" | "spinner" | "tank" | "mine" | "splitter" | "shard" | "boss";

export type LevelMix = [EnemyType, number][];

export interface LevelBaseConfig {
  name: string;
  targetKills: number;
  spawnInterval: number;
  maxEnemies: number;
  mix: LevelMix;
  playerSpeedBonus: number;
  bossLevel: boolean;
}

export interface LevelRuntimeConfig extends LevelBaseConfig {
  levelNumber: number;
  bossLevel: boolean;
}

export interface ScoreEntry {
  name: string;
  score: number;
  level: number;
  date: string;
}
