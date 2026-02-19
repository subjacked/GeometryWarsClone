// @ts-nocheck
import { getLevelConfig } from "./game/levels";
import { getLevelHighscores, getOverallHighscores, loadAllHighscores, saveHighscore } from "./game/highscores";
import type { EnemyType } from "./game/types";
import { AudioEngine } from "./game/audio";
import { Background3D } from "./game/background3d";
import {
  canvas,
  bossHealthFill,
  bossHealthName,
  bossHealthWrap,
  ctx,
  gameOverHighscoreList,
  gameOverHighscoreTitle,
  gameOverScreen,
  gameOverSummary,
  highscoreLevelSelect,
  highscoreList,
  hudEnergyFill,
  hudLevelInfo,
  hudLevel,
  hudPowerupInfo,
  hudScore,
  hudShieldFill,
  hudStreak,
  hudWeapon,
  menuScreen,
  overallHighscoreList,
  pauseScreen,
  playerNameInput,
  restartBtn,
  scoreForm,
  scoreSaveStatus,
  startBtn,
} from "./game/dom";

const PLAYER_NAME_KEY = "neon-geometry-rift-player-name-v1";
const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const BASE_ENEMY_POINTS: Record<EnemyType, number> = {
  seeker: 120,
  spinner: 170,
  tank: 260,
  mine: 220,
  splitter: 210,
  shard: 70,
  boss: 2400,
};

const audio = new AudioEngine();
const background3d = new Background3D(BASE_WIDTH, BASE_HEIGHT);

const input = {
  keys: new Set(),
  mouseX: BASE_WIDTH * 0.5,
  mouseY: BASE_HEIGHT * 0.5,
  firing: false,
  dashQueued: false,
  cannonQueued: false,
};

const state = {
  mode: "menu",
  time: 0,
  score: 0,
  levelIndex: 0,
  killsInLevel: 0,
  streak: 0,
  streakTimer: 0,
  spawnTimer: 0,
  globalEnemyId: 0,
  shake: 0,
  flash: 0,
  cameraOffsetX: 0,
  cameraOffsetY: 0,
  pauseReturnMode: "playing",
  levelDoneTimer: 0,
  warpTimer: 0,
  warpDuration: 1.15,
  player: null,
  bullets: [],
  enemies: [],
  particles: [],
  ripples: [],
  powerups: [],
  highscores: [],
  stars: [],
  endedLevel: 0,
  scoreSaved: false,
  pendingScoreEntry: null,
  menuHighscoreLevel: 1,
  bossSpawned: false,
  bossDefeated: false,
  powerupMessage: "",
  powerupMessageTimer: 0,
};

let lastTime = performance.now();
let accumulator = 0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function shadeHex(hex, factor, alpha = 1) {
  const rgb = hexToRgb(hex);
  const r = clamp(Math.round(rgb.r * factor), 0, 255);
  const g = clamp(Math.round(rgb.g * factor), 0, 255);
  const b = clamp(Math.round(rgb.b * factor), 0, 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function depthScale(y) {
  const t = clamp(y / canvas.height, 0, 1);
  return lerp(0.9, 1.12, t);
}

function depthLift(y) {
  const t = clamp(y / canvas.height, 0, 1);
  return lerp(-10, 8, t);
}

function projectY(y) {
  return y + depthLift(y);
}

function weightedPick(entries) {
  let total = 0;
  for (const [, weight] of entries) total += weight;
  let point = Math.random() * total;
  for (const [value, weight] of entries) {
    point -= weight;
    if (point <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(800, Math.floor(rect.width));
  const height = Math.max(460, Math.floor(rect.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    seedStars();
    background3d.resize(width, height);
  }
}

function inBounds(entity, padding = 40) {
  return (
    entity.x > -padding &&
    entity.y > -padding &&
    entity.x < canvas.width + padding &&
    entity.y < canvas.height + padding
  );
}

function spawnPlayer() {
  state.player = {
    x: canvas.width * 0.5,
    y: canvas.height * 0.5,
    vx: 0,
    vy: 0,
    radius: 16,
    speed: 290,
    fireCooldown: 0,
    invulnerable: 0,
    dashCooldown: 0,
    dashTimer: 0,
    rapidTimer: 0,
    scatterTimer: 0,
    shieldTimer: 0,
    shieldMaxTimer: 6,
    energy: 100,
    maxEnergy: 100,
    shield: 100,
    maxShield: 100,
    shieldRegenDelay: 0,
    shieldRegenActive: false,
    cannonCharges: 0,
    cannonCooldown: 0,
    trail: [],
  };
}

function resetRun() {
  state.mode = "playing";
  state.time = 0;
  state.score = 0;
  state.levelIndex = 0;
  state.killsInLevel = 0;
  state.streak = 0;
  state.streakTimer = 0;
  state.spawnTimer = 0;
  state.levelDoneTimer = 0;
  state.warpTimer = 0;
  state.warpDuration = 1.15;
  state.pauseReturnMode = "playing";
  state.shake = 0;
  state.flash = 0;
  state.bullets.length = 0;
  state.enemies.length = 0;
  state.particles.length = 0;
  state.ripples.length = 0;
  state.powerups.length = 0;
  state.endedLevel = 0;
  state.scoreSaved = false;
  state.pendingScoreEntry = null;
  state.bossSpawned = false;
  state.bossDefeated = false;
  state.powerupMessage = "";
  state.powerupMessageTimer = 0;
  scoreSaveStatus.textContent = "";
  spawnPlayer();
  hideOverlay(gameOverScreen);
  hideOverlay(menuScreen);
  hideOverlay(pauseScreen);
  updateHud();
  syncMusicForMode();
}

function drawHighscores() {
  const targets = [overallHighscoreList, highscoreList, gameOverHighscoreList];
  const overallScores = getOverallHighscores(state.highscores, 10);
  const menuScores = getLevelHighscores(state.highscores, state.menuHighscoreLevel, 10);
  const gameOverLevel = Math.max(1, state.endedLevel || state.menuHighscoreLevel);
  const gameOverScores = getLevelHighscores(state.highscores, gameOverLevel, 10);

  gameOverHighscoreTitle.textContent = `Top Pilots • Level ${gameOverLevel}`;
  for (const list of targets) {
    list.innerHTML = "";
  }

  if (!overallScores.length) {
    const item = document.createElement("li");
    item.textContent = "No overall records yet.";
    overallHighscoreList.appendChild(item);
  } else {
    overallScores.forEach((entry, idx) => {
      const item = document.createElement("li");
      item.innerHTML = `<strong>#${idx + 1} ${entry.name} • ${entry.score}</strong><span>L${entry.level} • ${entry.date}</span>`;
      overallHighscoreList.appendChild(item);
    });
  }

  if (!menuScores.length) {
    const item = document.createElement("li");
    item.textContent = "No records for this level yet.";
    highscoreList.appendChild(item);
  } else {
    menuScores.forEach((entry, idx) => {
      const item = document.createElement("li");
      item.innerHTML = `<strong>#${idx + 1} ${entry.name} • ${entry.score}</strong><span>${entry.date}</span>`;
      highscoreList.appendChild(item);
    });
  }

  if (!gameOverScores.length) {
      const item = document.createElement("li");
      item.textContent = "No records for this level yet.";
      gameOverHighscoreList.appendChild(item);
  } else {
    gameOverScores.forEach((entry, idx) => {
      const item = document.createElement("li");
      item.innerHTML = `<strong>#${idx + 1} ${entry.name} • ${entry.score}</strong><span>${entry.date}</span>`;
      gameOverHighscoreList.appendChild(item);
    });
  }
}

function populateHighscoreLevelOptions(maxLevel = 25) {
  highscoreLevelSelect.innerHTML = "";
  for (let level = 1; level <= maxLevel; level++) {
    const option = document.createElement("option");
    option.value = String(level);
    option.textContent = `Level ${level}${getLevelConfig(level - 1).bossLevel ? " (Boss)" : ""}`;
    highscoreLevelSelect.appendChild(option);
  }
  highscoreLevelSelect.value = String(state.menuHighscoreLevel);
}

function sanitizePlayerName(name) {
  const cleaned = (name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, "")
    .trim()
    .slice(0, 16);
  return cleaned || "ANON";
}

async function submitScoreEntry() {
  if (!state.pendingScoreEntry || state.scoreSaved) return;
  const name = sanitizePlayerName(playerNameInput.value);
  localStorage.setItem(PLAYER_NAME_KEY, name);
  playerNameInput.value = name;
  if (state.pendingScoreEntry.score <= 0) {
    state.scoreSaved = true;
    scoreSaveStatus.textContent = "No score to save this run.";
    return;
  }
  scoreSaveStatus.textContent = "Saving...";
  await saveHighscore({
    name,
    score: state.pendingScoreEntry.score,
    level: state.pendingScoreEntry.level,
    date: new Date().toISOString().slice(0, 10),
  });
  state.highscores = await loadAllHighscores();
  drawHighscores();
  state.scoreSaved = true;
  scoreSaveStatus.textContent = "Score saved.";
}

function showOverlay(el) {
  el.classList.add("active");
}

function hideOverlay(el) {
  el.classList.remove("active");
}

function ensureInputAudio() {
  audio.ensureStarted().then(() => {
    syncMusicForMode();
  });
}

function syncMusicForMode() {
  const combatMode = state.mode === "playing" || state.mode === "level-complete" || state.mode === "warp-jump";
  audio.setCombatMusic(combatMode);
}

function levelConfig() {
  return getLevelConfig(state.levelIndex);
}

function currentLevelLabel() {
  const info = levelConfig();
  return `${info.levelNumber}: ${info.name}${info.bossLevel ? " [BOSS]" : ""}`;
}

function describePowerup(type) {
  if (type === "rapid") return "Rapid Fire: higher fire rate";
  if (type === "shield") return "Shield: ram enemies safely";
  if (type === "scatter") return "Scatter: multi-direction shots";
  if (type === "cannon") return "Heavy Cannon: press E for radial blast";
  if (type === "heart") return "Heart: restores health";
  if (type === "nova") return "Nova: instant arena wipe";
  return "";
}

function updateHud() {
  hudLevel.textContent = `Level ${currentLevelLabel()}`;
  hudScore.textContent = `Score ${Math.floor(state.score)}`;
  hudStreak.textContent = `Streak x${Math.max(1, state.streak)}`;
  const p = state.player;
  if (!p) {
    bossHealthWrap.classList.remove("active", "critical");
    return;
  }
  const healthRatio = clamp(p.energy / p.maxEnergy, 0, 1);
  hudEnergyFill.style.width = `${(healthRatio * 100).toFixed(1)}%`;
  const shieldRatio = clamp(p.shield / p.maxShield, 0, 1);
  hudShieldFill.style.width = `${(shieldRatio * 100).toFixed(1)}%`;
  const weaponLabel = p.scatterTimer > 0 ? "Scatter Blaster" : p.rapidTimer > 0 ? "Rapid Blaster" : "Standard Blaster";
  const aegis = p.shieldTimer > 0 ? `Aegis ${p.shieldTimer.toFixed(1)}s` : "Aegis offline";
  const objective = levelConfig().targetKills;
  hudLevelInfo.textContent = `Level ${currentLevelLabel()} • Kills ${state.killsInLevel}/${objective}`;
  hudWeapon.textContent = `Weapon: ${weaponLabel} • Cannon ${p.cannonCharges} • ${aegis}`;
  hudPowerupInfo.textContent = state.powerupMessageTimer > 0 && state.powerupMessage
    ? state.powerupMessage
    : "Rapid: faster fire • Shield: contact immunity • Scatter: multi-shot • Cannon (E): massive blast • Heart: restore health • Nova: wipe";

  const liveBoss = state.enemies.find((enemy) => enemy.type === "boss");
  if (!liveBoss) {
    bossHealthWrap.classList.remove("active", "critical");
  } else {
    const maxHp = Math.max(1, liveBoss.maxHp || liveBoss.hp || 1);
    const hpRatio = clamp(liveBoss.hp / maxHp, 0, 1);
    const phase = hpRatio > 0.66 ? "GODFORM I" : hpRatio > 0.33 ? "GODFORM II" : "GODFORM III";
    bossHealthFill.style.width = `${(hpRatio * 100).toFixed(1)}%`;
    bossHealthName.textContent = `RIFT TITAN ${phase} • ${Math.ceil(liveBoss.hp)}/${maxHp}`;
    bossHealthWrap.classList.add("active");
    bossHealthWrap.classList.toggle("critical", hpRatio < 0.25);
  }
}

function addScore(amount) {
  const multiplier = Math.max(1, Math.min(12, state.streak || 1));
  state.score += amount * multiplier;
}

function emitParticles(x, y, color, count, speed) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const mag = rand(speed * 0.4, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * mag,
      vy: Math.sin(angle) * mag,
      life: rand(0.25, 0.8),
      maxLife: 0,
      size: rand(2, 6),
      color,
      glow: rand(6, 18),
    });
    state.particles[state.particles.length - 1].maxLife = state.particles[state.particles.length - 1].life;
  }
}

function spawnEnemy(forceType: EnemyType | null = null, x: number | null = null, y: number | null = null) {
  const cfg = levelConfig();
  const type = (forceType || weightedPick(cfg.mix)) as EnemyType;
  const side = randInt(0, 3);
  let px = x;
  let py = y;
  const autoSpawnAtEdge = px === null || py === null;
  if (autoSpawnAtEdge) {
    px = canvas.width * 0.5;
    py = canvas.height * 0.5;
  }

  const enemy = {
    id: ++state.globalEnemyId,
    type,
    x: px,
    y: py,
    vx: 0,
    vy: 0,
    angle: rand(0, Math.PI * 2),
    hp: 1,
    maxHp: 1,
    radius: 14,
    speed: 100,
    spin: rand(-3, 3),
    pulse: rand(0, Math.PI * 2),
    trail: [],
    color: "#60f0ff",
    contactDamage: 1,
  };

  if (type === "seeker") {
    enemy.hp = 1;
    enemy.radius = 13;
    enemy.speed = rand(120, 170) + state.levelIndex * 7;
    enemy.color = "#59f3ff";
  } else if (type === "spinner") {
    enemy.hp = 2;
    enemy.radius = 15;
    enemy.speed = rand(90, 140) + state.levelIndex * 8;
    enemy.spin = rand(-6, 6);
    enemy.color = "#ff6696";
  } else if (type === "tank") {
    enemy.hp = 6;
    enemy.radius = 22;
    enemy.speed = rand(50, 85) + state.levelIndex * 4;
    enemy.color = "#ff9648";
    enemy.contactDamage = 2;
  } else if (type === "mine") {
    enemy.hp = 3;
    enemy.radius = 17;
    enemy.speed = 40;
    enemy.color = "#f6ff67";
  } else if (type === "splitter") {
    enemy.hp = 2;
    enemy.radius = 16;
    enemy.speed = rand(95, 135) + state.levelIndex * 6;
    enemy.color = "#7d8bff";
  } else if (type === "shard") {
    enemy.hp = 1;
    enemy.radius = 8;
    enemy.speed = rand(150, 210) + state.levelIndex * 7;
    enemy.color = "#b5c2ff";
  } else if (type === "boss") {
    enemy.hp = 46 + Math.floor(state.levelIndex * 1.5);
    enemy.radius = 44;
    enemy.speed = 52 + state.levelIndex * 2.4;
    enemy.color = "#ff4fd5";
    enemy.contactDamage = 3;
    enemy.spin = 2.1;
  }
  enemy.maxHp = enemy.hp;

  if (autoSpawnAtEdge) {
    const margin = enemy.radius + 12;
    if (side === 0) {
      enemy.x = margin;
      enemy.y = rand(margin, canvas.height - margin);
      enemy.vx = rand(40, 100);
    } else if (side === 1) {
      enemy.x = canvas.width - margin;
      enemy.y = rand(margin, canvas.height - margin);
      enemy.vx = -rand(40, 100);
    } else if (side === 2) {
      enemy.x = rand(margin, canvas.width - margin);
      enemy.y = margin;
      enemy.vy = rand(40, 100);
    } else {
      enemy.x = rand(margin, canvas.width - margin);
      enemy.y = canvas.height - margin;
      enemy.vy = -rand(40, 100);
    }
  }

  state.enemies.push(enemy);
}

function spawnPowerup(x, y) {
  const roll = Math.random();
  const type = roll < 0.26
    ? "rapid"
    : roll < 0.46
    ? "shield"
    : roll < 0.64
    ? "scatter"
    : roll < 0.8
    ? "cannon"
    : roll < 0.92
    ? "heart"
    : "nova";
  state.powerups.push({
    type,
    x,
    y,
    vy: rand(-10, 10),
    radius: 11,
    life: 8,
    pulse: rand(0, Math.PI * 2),
  });
}

function fireBulletAtAngle(angle, speed, radius, glow, spread = 0) {
  const p = state.player;
  state.bullets.push({
    x: p.x,
    y: p.y,
    vx: Math.cos(angle + spread) * speed,
    vy: Math.sin(angle + spread) * speed,
    radius,
    life: 1.25,
    glow,
  });
}

function fireCannonBlast() {
  const p = state.player;
  if (p.cannonCharges <= 0 || p.cannonCooldown > 0) return;
  p.cannonCharges -= 1;
  p.cannonCooldown = 1.1;
  const radius = 230;
  state.shake = Math.max(state.shake, 24);
  state.flash = Math.max(state.flash, 0.56);
  spawnRipple(p.x, p.y, 2.7);
  emitParticles(p.x, p.y, "#ffc18f", 44, 300);
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    const dx = enemy.x - p.x;
    const dy = enemy.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist > radius) continue;
    if (enemy.type === "boss") {
      enemy.hp -= 12;
      emitParticles(enemy.x, enemy.y, "#ff95da", 20, 210);
      if (enemy.hp <= 0) destroyEnemy(i, true);
    } else {
      destroyEnemy(i, true);
    }
  }
}

function shootBullet() {
  const p = state.player;
  const dx = input.mouseX - p.x;
  const dy = input.mouseY - p.y;
  const spread = rand(-0.07, 0.07);
  const base = Math.atan2(dy, dx) + spread;
  const speed = p.rapidTimer > 0 ? 660 : 610;
  const radius = p.rapidTimer > 0 ? 4.6 : 4;
  const glow = p.rapidTimer > 0 ? "#fcf980" : "#67ecff";
  if (p.scatterTimer > 0) {
    const offsets = [-0.42, -0.2, 0, 0.2, 0.42];
    for (const offset of offsets) {
      fireBulletAtAngle(base, speed * 0.95, radius, "#8ff6ff", offset);
    }
  } else {
    fireBulletAtAngle(base, speed, radius, glow);
  }
  audio.shoot();
  emitParticles(p.x, p.y, "#75f0ff", p.scatterTimer > 0 ? 4 : 2, 58);
}

function trackTrail(entity, max = 9) {
  entity.trail.push({ x: entity.x, y: entity.y });
  if (entity.trail.length > max) entity.trail.shift();
}

function handlePlayer(dt) {
  const p = state.player;
  const cfg = levelConfig();
  const moveX = (input.keys.has("KeyD") || input.keys.has("ArrowRight") ? 1 : 0) -
    (input.keys.has("KeyA") || input.keys.has("ArrowLeft") ? 1 : 0);
  const moveY = (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) -
    (input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0);

  const moving = Math.hypot(moveX, moveY);
  if (moving > 0) {
    const nx = moveX / moving;
    const ny = moveY / moving;
    const currentSpeed = p.speed + cfg.playerSpeedBonus;
    p.vx += nx * currentSpeed * dt * 7.4;
    p.vy += ny * currentSpeed * dt * 7.4;
    emitParticles(p.x, p.y, "#2ed8ff", 1, 22);
  }

  if (p.shield > 0 && p.shield < p.maxShield) {
    if (p.shieldRegenDelay > 0) {
      p.shieldRegenDelay = Math.max(0, p.shieldRegenDelay - dt);
      p.shieldRegenActive = false;
    } else {
      if (!p.shieldRegenActive) {
        p.shieldRegenActive = true;
        audio.shieldRecharge();
      }
      p.shield = Math.min(p.maxShield, p.shield + dt * 20);
      if (p.shield >= p.maxShield) {
        p.shieldRegenActive = false;
        audio.shieldRestored();
      }
    }
  } else {
    p.shieldRegenActive = false;
  }

  if (input.dashQueued && p.dashCooldown <= 0) {
    const dashX = moving > 0 ? moveX / moving : Math.cos(Math.atan2(input.mouseY - p.y, input.mouseX - p.x));
    const dashY = moving > 0 ? moveY / moving : Math.sin(Math.atan2(input.mouseY - p.y, input.mouseX - p.x));
    p.vx += dashX * 650;
    p.vy += dashY * 650;
    p.dashCooldown = 1.3;
    p.dashTimer = 0.18;
    state.shake = Math.max(state.shake, 10);
    emitParticles(p.x, p.y, "#8ce9ff", 16, 250);
  }
  input.dashQueued = false;

  if (input.cannonQueued) {
    fireCannonBlast();
  }
  input.cannonQueued = false;

  p.vx *= p.dashTimer > 0 ? 0.96 : 0.89;
  p.vy *= p.dashTimer > 0 ? 0.96 : 0.89;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.x = clamp(p.x, p.radius + 4, canvas.width - p.radius - 4);
  p.y = clamp(p.y, p.radius + 4, canvas.height - p.radius - 4);

  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.invulnerable > 0) p.invulnerable -= dt;
  if (p.dashCooldown > 0) p.dashCooldown -= dt;
  if (p.dashTimer > 0) p.dashTimer -= dt;
  if (p.rapidTimer > 0) p.rapidTimer -= dt;
  if (p.scatterTimer > 0) p.scatterTimer -= dt;
  if (p.shieldTimer > 0) p.shieldTimer -= dt;
  if (p.cannonCooldown > 0) p.cannonCooldown -= dt;

  const triggerHeld = input.firing || input.keys.has("Space");
  const cooldown = p.scatterTimer > 0 ? 0.2 : p.rapidTimer > 0 ? 0.07 : 0.12;
  if (triggerHeld && p.fireCooldown <= 0) {
    shootBullet();
    p.fireCooldown = cooldown;
  }

  trackTrail(p, 16);
}

function handleBullets(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0 || !inBounds(b, 30)) {
      state.bullets.splice(i, 1);
    }
  }
}

function enemyBehavior(enemy, dt) {
  const p = state.player;
  const dx = p.x - enemy.x;
  const dy = p.y - enemy.y;
  const dist = Math.hypot(dx, dy) || 1;

  if (enemy.type === "seeker" || enemy.type === "shard") {
    enemy.vx += (dx / dist) * enemy.speed * dt * 5;
    enemy.vy += (dy / dist) * enemy.speed * dt * 5;
  } else if (enemy.type === "spinner") {
    const orbitX = -dy / dist;
    const orbitY = dx / dist;
    enemy.vx += (dx / dist) * enemy.speed * dt * 3 + orbitX * enemy.speed * dt * 1.8;
    enemy.vy += (dy / dist) * enemy.speed * dt * 3 + orbitY * enemy.speed * dt * 1.8;
    enemy.angle += enemy.spin * dt;
  } else if (enemy.type === "tank") {
    enemy.vx += (dx / dist) * enemy.speed * dt * 2.2;
    enemy.vy += (dy / dist) * enemy.speed * dt * 2.2;
    enemy.angle += 1.4 * dt;
  } else if (enemy.type === "mine") {
    if (dist < 280) {
      enemy.vx += (dx / dist) * (enemy.speed + 130) * dt * 2.6;
      enemy.vy += (dy / dist) * (enemy.speed + 130) * dt * 2.6;
    } else {
      enemy.vx += Math.cos(enemy.angle + state.time * 0.8) * 14 * dt;
      enemy.vy += Math.sin(enemy.angle + state.time * 0.6) * 14 * dt;
    }
    enemy.angle += dt;
  } else if (enemy.type === "splitter") {
    enemy.vx += (dx / dist) * enemy.speed * dt * 4;
    enemy.vy += (dy / dist) * enemy.speed * dt * 4;
    enemy.angle += 3.5 * dt;
  } else if (enemy.type === "boss") {
    const orbitX = -dy / dist;
    const orbitY = dx / dist;
    enemy.vx += (dx / dist) * enemy.speed * dt * 1.8 + orbitX * enemy.speed * dt * 0.7;
    enemy.vy += (dy / dist) * enemy.speed * dt * 1.8 + orbitY * enemy.speed * dt * 0.7;
    enemy.angle += enemy.spin * dt;
  }

  const damping = enemy.type === "tank" ? 0.94 : enemy.type === "boss" ? 0.975 : 0.96;
  enemy.vx *= damping;
  enemy.vy *= damping;
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;

  const margin = enemy.radius + 7;
  const wallBounce = enemy.type === "tank" ? 0.34 : enemy.type === "boss" ? 0.2 : 0.42;
  if (enemy.x < margin) {
    enemy.x = margin;
    enemy.vx = Math.abs(enemy.vx) * wallBounce;
  } else if (enemy.x > canvas.width - margin) {
    enemy.x = canvas.width - margin;
    enemy.vx = -Math.abs(enemy.vx) * wallBounce;
  }
  if (enemy.y < margin) {
    enemy.y = margin;
    enemy.vy = Math.abs(enemy.vy) * wallBounce;
  } else if (enemy.y > canvas.height - margin) {
    enemy.y = canvas.height - margin;
    enemy.vy = -Math.abs(enemy.vy) * wallBounce;
  }

  trackTrail(enemy, enemy.type === "tank" ? 6 : 10);
}

function destroyEnemy(index, hitByPlayer = true) {
  const enemy = state.enemies[index];
  if (!enemy) return;
  const isHeavy = enemy.type === "tank" || enemy.type === "boss";
  emitParticles(enemy.x, enemy.y, enemy.color, enemy.type === "boss" ? 54 : isHeavy ? 26 : 16, enemy.type === "boss" ? 320 : isHeavy ? 240 : 170);
  spawnRipple(enemy.x, enemy.y, enemy.type === "boss" ? 2.4 : enemy.type === "tank" ? 1.45 : 1);
  state.shake = Math.max(state.shake, enemy.type === "boss" ? 24 : isHeavy ? 14 : 9);
  state.flash = Math.max(state.flash, enemy.type === "boss" ? 0.52 : isHeavy ? 0.34 : 0.22);
  audio.enemyExplode();

  if (hitByPlayer) {
    state.streak += 1;
    state.streakTimer = 2.8;
    state.killsInLevel += 1;
    addScore((BASE_ENEMY_POINTS[enemy.type] || 100) + state.levelIndex * 14);
    if (Math.random() < 0.1) {
      spawnPowerup(enemy.x, enemy.y);
    }
    if (enemy.type === "boss") {
      state.bossDefeated = true;
      state.killsInLevel = levelConfig().targetKills;
      addScore(5000 + state.levelIndex * 260);
    }
  }

  if (enemy.type === "splitter") {
    for (let i = 0; i < 2; i++) {
      spawnEnemy("shard", enemy.x + rand(-8, 8), enemy.y + rand(-8, 8));
    }
  }

  if (enemy.type === "mine") {
    for (let i = 0; i < state.enemies.length; i++) {
      if (i === index) continue;
      const other = state.enemies[i];
      const dx = other.x - enemy.x;
      const dy = other.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 120) {
        other.hp -= 1;
      }
    }
  }

  state.enemies.splice(index, 1);
}

function collideCircle(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.radius + b.radius;
  return dx * dx + dy * dy <= rr * rr;
}

function handleEnemies(dt) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    enemyBehavior(enemy, dt);

    if (!inBounds(enemy, 120)) {
      state.enemies.splice(i, 1);
      continue;
    }

    for (let j = state.bullets.length - 1; j >= 0; j--) {
      const b = state.bullets[j];
      if (!collideCircle(enemy, b)) continue;
      enemy.hp -= 1;
      state.bullets.splice(j, 1);
      audio.enemyHit();
      emitParticles(b.x, b.y, "#b5f8ff", 4, 130);
      if (enemy.hp <= 0) {
        destroyEnemy(i, true);
      }
      break;
    }
  }

  const p = state.player;
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const enemy = state.enemies[i];
    if (!enemy) continue;
    if (!collideCircle(enemy, p)) continue;

    if (p.shieldTimer > 0) {
      destroyEnemy(i, true);
      emitParticles(p.x, p.y, "#8fffea", 10, 180);
      continue;
    }

    if (p.invulnerable <= 0) {
      const impactDamage = 26 + enemy.contactDamage * 10;
      const absorbed = Math.min(p.shield, impactDamage);
      p.shield = Math.max(0, p.shield - absorbed);
      if (absorbed > 0) {
        p.shieldRegenDelay = p.shield > 0 ? 1.9 : 0;
        p.shieldRegenActive = false;
      }
      const spill = Math.max(0, impactDamage - absorbed);
      if (spill > 0) {
        p.energy = Math.max(0, p.energy - spill);
      }
      p.invulnerable = p.energy <= 0 ? 1.8 : 1.2;
      state.shake = Math.max(state.shake, 18);
      state.flash = Math.max(state.flash, 0.44);
      audio.playerDamaged();
      emitParticles(p.x, p.y, "#ff7892", 22, 220);
      if (p.energy <= 0) {
        onRunFailed();
        return;
      }
    }
    destroyEnemy(i, false);
  }
}

function handlePowerups(dt) {
  const p = state.player;
  for (let i = state.powerups.length - 1; i >= 0; i--) {
    const item = state.powerups[i];
    item.life -= dt;
    item.pulse += dt * 4;
    item.y += item.vy * dt;
    item.vy *= 0.98;
    if (item.life <= 0) {
      state.powerups.splice(i, 1);
      continue;
    }
    if (collideCircle(item, p)) {
      audio.powerup();
      emitParticles(item.x, item.y, "#fff28a", 15, 200);
      if (item.type === "rapid") {
        p.rapidTimer = Math.max(p.rapidTimer, 5.5);
      } else if (item.type === "shield") {
        p.shield = p.maxShield;
        p.shieldTimer = Math.max(p.shieldTimer, 5.5);
        p.shieldRegenDelay = 0;
        p.shieldRegenActive = false;
      } else if (item.type === "scatter") {
        p.scatterTimer = Math.max(p.scatterTimer, 7.5);
      } else if (item.type === "cannon") {
        p.cannonCharges += 1;
      } else if (item.type === "heart") {
        p.energy = Math.min(p.maxEnergy, p.energy + 34);
      } else if (item.type === "nova") {
        for (let e = state.enemies.length - 1; e >= 0; e--) {
          destroyEnemy(e, true);
        }
      }
      state.powerupMessage = describePowerup(item.type);
      state.powerupMessageTimer = 3.4;
      state.powerups.splice(i, 1);
    }
  }
}

function handleParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.97;
    p.vy *= 0.97;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function spawnRipple(x, y, power = 1) {
  background3d.spawnRipple(x, y, power);
  state.ripples.push({
    x,
    y,
    radius: 0,
    speed: 320 + rand(-50, 60),
    life: 1,
    maxLife: 1,
    band: 38,
    power: 12 * power,
  });
  if (state.ripples.length > 10) {
    state.ripples.shift();
  }
}

function handleRipples(dt) {
  for (let i = state.ripples.length - 1; i >= 0; i--) {
    const ripple = state.ripples[i];
    ripple.radius += ripple.speed * dt;
    ripple.life -= dt * 1.08;
    if (ripple.life <= 0) state.ripples.splice(i, 1);
  }
}

function handleSpawns(dt) {
  const cfg = levelConfig();
  if (state.killsInLevel >= cfg.targetKills && state.enemies.length === 0) {
    state.mode = "level-complete";
    state.levelDoneTimer = 1.2;
    state.endedLevel = state.levelIndex + 1;
    audio.levelUp();
    emitParticles(canvas.width * 0.5, canvas.height * 0.5, "#6dfcff", 80, 260);
    addScore(1200 + state.levelIndex * 320);
    state.flash = Math.max(state.flash, 0.45);
    return;
  }

  state.spawnTimer -= dt;
  if (cfg.bossLevel) {
    if (!state.bossSpawned) {
      spawnEnemy("boss", canvas.width * 0.5, canvas.height * 0.2);
      state.bossSpawned = true;
      state.spawnTimer = 1.1;
      return;
    }
    if (state.spawnTimer <= 0 && state.enemies.length < cfg.maxEnemies && !state.bossDefeated) {
      spawnEnemy();
      state.spawnTimer = cfg.spawnInterval * 1.25;
    }
    return;
  }

  if (state.spawnTimer <= 0 && state.enemies.length < cfg.maxEnemies && state.killsInLevel < cfg.targetKills) {
    spawnEnemy();
    const intensity = state.killsInLevel / Math.max(1, cfg.targetKills);
    state.spawnTimer = cfg.spawnInterval * lerp(1, 0.62, intensity);
  }
}

function startWarpJump() {
  state.mode = "warp-jump";
  state.warpDuration = 1.15;
  state.warpTimer = state.warpDuration;
  state.shake = Math.max(state.shake, 20);
  state.flash = Math.max(state.flash, 0.58);
  emitParticles(canvas.width * 0.5, canvas.height * 0.5, "#8af4ff", 56, 280);
}

function advanceLevel() {
  state.levelIndex += 1;
  state.killsInLevel = 0;
  state.spawnTimer = 0.2;
  state.mode = "playing";
  state.warpTimer = 0;
  state.flash = Math.max(state.flash, 0.25);
  state.bossSpawned = false;
  state.bossDefeated = false;
  state.player.shield = state.player.maxShield;
  state.player.shieldRegenDelay = 0;
  state.player.shieldRegenActive = false;
  emitParticles(state.player.x, state.player.y, "#95fff5", 22, 220);
}

function onRunFailed() {
  state.mode = "game-over";
  audio.gameOver();
  state.endedLevel = state.levelIndex + 1;
  if (state.endedLevel > highscoreLevelSelect.options.length) {
    populateHighscoreLevelOptions(state.endedLevel + 5);
  }
  state.menuHighscoreLevel = state.endedLevel;
  highscoreLevelSelect.value = String(state.menuHighscoreLevel);
  state.pendingScoreEntry = {
    score: Math.floor(state.score),
    level: state.endedLevel,
  };
  state.scoreSaved = false;
  const rememberedName = localStorage.getItem(PLAYER_NAME_KEY) || "ANON";
  playerNameInput.value = sanitizePlayerName(rememberedName);
  scoreSaveStatus.textContent = "Enter name and save your run.";
  gameOverSummary.textContent = `Score ${Math.floor(state.score)} • Reached Level ${state.endedLevel}`;
  showOverlay(gameOverScreen);
  syncMusicForMode();
  setTimeout(() => playerNameInput.focus(), 20);
}

function update(dt) {
  state.time += dt;
  state.streakTimer -= dt;
  if (state.streakTimer <= 0) {
    state.streak = 0;
  }
  state.shake = Math.max(0, state.shake - dt * 26);
  state.flash = Math.max(0, state.flash - dt * 0.9);
  state.powerupMessageTimer = Math.max(0, state.powerupMessageTimer - dt);
  state.cameraOffsetX = rand(-state.shake, state.shake) * 0.5;
  state.cameraOffsetY = rand(-state.shake, state.shake) * 0.5;
  handleRipples(dt);

  if (state.mode === "playing") {
    handlePlayer(dt);
    handleBullets(dt);
    handleEnemies(dt);
    handlePowerups(dt);
    handleParticles(dt);
    handleSpawns(dt);
  } else if (state.mode === "level-complete") {
    handlePlayer(dt * 0.5);
    handleBullets(dt * 0.4);
    handleParticles(dt);
    state.levelDoneTimer -= dt;
    if (state.levelDoneTimer <= 0) {
      startWarpJump();
    }
  } else if (state.mode === "warp-jump") {
    const p = state.player;
    if (p) {
      const cx = canvas.width * 0.5;
      const cy = canvas.height * 0.5;
      p.x = lerp(p.x, cx, dt * 5);
      p.y = lerp(p.y, cy, dt * 5);
      p.vx *= 0.86;
      p.vy *= 0.86;
      trackTrail(p, 18);
    }
    handleParticles(dt * 1.2);
    handleBullets(dt * 1.05);
    state.warpTimer = Math.max(0, state.warpTimer - dt);
    const t = 1 - state.warpTimer / Math.max(0.001, state.warpDuration);
    state.shake = Math.max(state.shake, 9 + t * 18);
    state.flash = Math.max(state.flash, 0.08 + t * 0.2);
    if (state.warpTimer <= 0) {
      advanceLevel();
    }
  } else {
    handleParticles(dt);
  }

  updateHud();
}

function seedStars() {
  const count = Math.floor((canvas.width * canvas.height) / 14000);
  state.stars = [];
  for (let i = 0; i < count; i++) {
    state.stars.push({
      x: rand(0, canvas.width),
      y: rand(0, canvas.height),
      size: rand(0.7, 2),
      speed: rand(5, 32),
      twinkle: rand(0, Math.PI * 2),
    });
  }
}

function sampleRippleWarp(x, y) {
  let ox = 0;
  let oy = 0;
  let glow = 0;
  for (const ripple of state.ripples) {
    const dx = x - ripple.x;
    const dy = y - ripple.y;
    const dist = Math.hypot(dx, dy) || 1;
    const edge = dist - ripple.radius;
    const ring = Math.exp(-(edge * edge) / (2 * ripple.band * ripple.band));
    const wave = Math.sin(edge * 0.12 - state.time * 6);
    const force = ring * wave * ripple.power * (ripple.life / ripple.maxLife);
    ox += (dx / dist) * force * 0.22;
    oy += (dy / dist) * force * 0.22;
    glow += ring * (ripple.life / ripple.maxLife) * 0.6;
  }
  return { x: x + ox, y: y + oy, glow };
}

function traceCapsulePath(cx, cy, halfLen, radius) {
  ctx.beginPath();
  ctx.moveTo(cx - halfLen, cy - radius);
  ctx.lineTo(cx + halfLen, cy - radius);
  ctx.arc(cx + halfLen, cy, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx - halfLen, cy + radius);
  ctx.arc(cx - halfLen, cy, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
}

function drawBackground() {
  const levelHue = 188 + state.levelIndex * 8;
  const arenaCx = canvas.width * 0.52;
  const arenaCy = canvas.height * 0.54;
  const arenaHalfLen = canvas.width * 0.21;
  const arenaRadius = canvas.height * 0.25;

  const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  bg.addColorStop(0, `hsl(${levelHue}, 70%, 15%)`);
  bg.addColorStop(0.55, "hsl(192, 74%, 10%)");
  bg.addColorStop(1, "hsl(224, 78%, 14%)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bloomA = ctx.createRadialGradient(
    canvas.width * 0.18,
    canvas.height * 0.88,
    8,
    canvas.width * 0.18,
    canvas.height * 0.88,
    canvas.height * 0.55
  );
  bloomA.addColorStop(0, "rgba(72, 168, 255, 0.38)");
  bloomA.addColorStop(1, "rgba(72, 168, 255, 0)");
  ctx.fillStyle = bloomA;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bloomB = ctx.createRadialGradient(
    canvas.width * 0.82,
    canvas.height * 0.2,
    8,
    canvas.width * 0.82,
    canvas.height * 0.2,
    canvas.height * 0.52
  );
  bloomB.addColorStop(0, "rgba(34, 255, 222, 0.32)");
  bloomB.addColorStop(1, "rgba(34, 255, 222, 0)");
  ctx.fillStyle = bloomB;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(122, 239, 255, 0.18)";
  for (let i = 0; i < state.stars.length; i += 2) {
    const a = state.stars[i];
    const b = state.stars[(i + 7) % state.stars.length];
    a.y += a.speed * FIXED_DT * 0.22;
    if (a.y > canvas.height + 10) {
      a.y = -10;
      a.x = rand(0, canvas.width);
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const star of state.stars) {
    const alpha = 0.25 + Math.sin(state.time * 1.2 + star.twinkle) * 0.2;
    ctx.fillStyle = `rgba(180, 248, 255, ${Math.max(0.04, alpha)})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }

  const aura = ctx.createRadialGradient(arenaCx, arenaCy, arenaRadius * 0.3, arenaCx, arenaCy, arenaRadius * 2.4);
  aura.addColorStop(0, "rgba(112, 255, 238, 0.42)");
  aura.addColorStop(1, "rgba(112, 255, 238, 0)");
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  traceCapsulePath(arenaCx, arenaCy, arenaHalfLen, arenaRadius);
  const arenaFill = ctx.createLinearGradient(0, arenaCy - arenaRadius, 0, arenaCy + arenaRadius);
  arenaFill.addColorStop(0, "rgba(4, 34, 47, 0.78)");
  arenaFill.addColorStop(1, "rgba(0, 11, 24, 0.88)");
  ctx.fillStyle = arenaFill;
  ctx.fill();

  ctx.save();
  traceCapsulePath(arenaCx, arenaCy, arenaHalfLen, arenaRadius);
  ctx.clip();

  const rowCount = 24;
  for (let row = 0; row <= rowCount; row++) {
    const ny = -1 + (row / rowCount) * 2;
    const y = arenaCy + ny * arenaRadius;
    const span = arenaHalfLen + Math.cos((ny * Math.PI) / 2) * arenaRadius * 0.96;
    const alpha = 0.26 * (1 - Math.abs(ny)) + 0.06;
    ctx.strokeStyle = `rgba(86, 240, 255, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const steps = 60;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = arenaCx - span + t * span * 2;
      const curve = Math.sin((t - 0.5) * Math.PI * 2) * Math.abs(ny) * 8;
      const warped = sampleRippleWarp(x, y + curve * 0.2);
      const px = warped.x;
      const py = warped.y + curve * 0.22;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  const colCount = 38;
  for (let col = -colCount; col <= colCount; col++) {
    const nx = col / colCount;
    const alpha = 0.2 * (1 - Math.abs(nx)) + 0.04;
    ctx.strokeStyle = `rgba(86, 240, 255, ${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const steps = 42;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ny = -1 + t * 2;
      const localSpan = arenaHalfLen + Math.cos((ny * Math.PI) / 2) * arenaRadius * 0.96;
      const x = arenaCx + nx * localSpan;
      const y = arenaCy + ny * arenaRadius;
      const bow = Math.sin(nx * Math.PI) * ny * 8;
    const farPressure = clamp((dist - 260) / 520, 0, 1);
    const chaseForce = 3.1 + farPressure * 1.55;
    const orbitForce = 1.6 + (1 - farPressure) * 0.75;
    enemy.vx += (dx / dist) * enemy.speed * dt * chaseForce + orbitX * enemy.speed * dt * orbitForce;
    enemy.vy += (dy / dist) * enemy.speed * dt * chaseForce + orbitY * enemy.speed * dt * orbitForce;
    if (dist < 420) {
      const rush = dist < 220 ? 1.45 : 1;
      enemy.vx += (dx / dist) * (enemy.speed + 140) * dt * 2.5 * rush;
      enemy.vy += (dy / dist) * (enemy.speed + 140) * dt * 2.5 * rush;
      const drift = 24;
      enemy.vx += (dx / dist) * (enemy.speed + 24) * dt * 0.95 + Math.cos(enemy.angle + state.time * 0.8) * drift * dt;
      enemy.vy += (dy / dist) * (enemy.speed + 24) * dt * 0.95 + Math.sin(enemy.angle + state.time * 0.6) * drift * dt;
  }

    if (enemy.type === "spinner" && dist < 580) {

  if (enemy.type === "spinner" || enemy.type === "mine") {
    const speedSq = enemy.vx * enemy.vx + enemy.vy * enemy.vy;
    const minSpeed = enemy.type === "spinner" ? 118 : 92;
    if (speedSq < minSpeed * minSpeed) {
      const boost = enemy.type === "spinner" ? 320 : 250;
      enemy.vx += (dx / dist) * dt * boost;
      enemy.vy += (dy / dist) * dt * boost;
    }
  }
    const alpha = 0.42 * (ripple.life / ripple.maxLife);
    ctx.strokeStyle = `rgba(144, 250, 255, ${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(ripple.x, ripple.y, ripple.radius * 1.22, ripple.radius * 0.92, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  ctx.shadowBlur = 24;
  ctx.shadowColor = "rgba(114, 251, 255, 0.65)";
  ctx.strokeStyle = "rgba(134, 252, 255, 0.84)";
  ctx.lineWidth = 2;
  traceCapsulePath(arenaCx, arenaCy, arenaHalfLen, arenaRadius);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(171, 255, 255, 0.42)";
  ctx.lineWidth = 1;
  traceCapsulePath(arenaCx, arenaCy, arenaHalfLen - 26, arenaRadius - 22);
  ctx.stroke();
}

function drawTrail(entity, color) {
  if (!entity.trail.length) return;
  ctx.beginPath();
  for (let i = 0; i < entity.trail.length; i++) {
    const point = entity.trail[i];
    if (i === 0) ctx.moveTo(point.x, projectY(point.y));
    else ctx.lineTo(point.x, projectY(point.y));
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8 * depthScale(entity.y);
  ctx.stroke();
}

function drawGroundShadow(x, y, radius, alpha = 0.22) {
  const py = projectY(y) + radius * 0.7;
  ctx.save();
  ctx.translate(x, py);
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, radius * 0.95, radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function traceEnemyShape(type, radius) {
  if (type === "boss") {
    ctx.beginPath();
    const points = 10;
    for (let i = 0; i < points; i++) {
      const angle = (Math.PI * 2 * i) / points;
      const r = i % 2 === 0 ? radius : radius * 0.68;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }
  if (type === "seeker") {
    ctx.beginPath();
    ctx.moveTo(0, -radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(0, radius);
    ctx.lineTo(-radius, 0);
    ctx.closePath();
    return;
  }
  if (type === "spinner") {
    ctx.beginPath();
    ctx.rect(-radius, -radius, radius * 2, radius * 2);
    ctx.closePath();
    return;
  }
  if (type === "tank") {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    return;
  }
  if (type === "mine") {
    ctx.beginPath();
    const spikes = 14;
    for (let i = 0; i < spikes; i++) {
      const angle = (Math.PI * 2 * i) / spikes;
      const r = i % 2 === 0 ? radius + 6 : radius * 0.54;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }
  if (type === "splitter") {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const r = i % 2 === 0 ? radius : radius * 0.5;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(radius, radius);
  ctx.lineTo(-radius, radius);
  ctx.closePath();
}

function drawPlayer() {
  const p = state.player;
  drawTrail(p, "rgba(89, 247, 255, 0.2)");

  const aim = Math.atan2(input.mouseY - p.y, input.mouseX - p.x);
  const invulAlpha = p.invulnerable > 0 ? 0.45 + Math.sin(state.time * 24) * 0.25 : 1;
  const scale = depthScale(p.y);
  const py = projectY(p.y);
  drawGroundShadow(p.x, p.y, p.radius * scale * 1.1, 0.25);

  const drawHullPath = () => {
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-12, 11);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, -11);
    ctx.closePath();
  };

  ctx.save();
  ctx.translate(p.x, py);
  ctx.rotate(aim);
  ctx.scale(scale, scale);

  ctx.save();
  ctx.translate(-2.2, 4);
  ctx.fillStyle = `rgba(31, 130, 146, ${invulAlpha})`;
  drawHullPath();
  ctx.fill();
  ctx.restore();

  ctx.shadowBlur = 26;
  ctx.shadowColor = "rgba(73, 240, 255, 0.9)";
  const hullGradient = ctx.createLinearGradient(-15, -14, 20, 16);
  hullGradient.addColorStop(0, `rgba(178, 255, 255, ${invulAlpha})`);
  hullGradient.addColorStop(1, `rgba(50, 212, 235, ${invulAlpha})`);
  ctx.fillStyle = hullGradient;
  drawHullPath();
  ctx.fill();
  ctx.strokeStyle = `rgba(220, 253, 255, ${invulAlpha})`;
  ctx.lineWidth = 2;
  drawHullPath();
  ctx.stroke();

  ctx.fillStyle = "rgba(236, 252, 255, 0.98)";
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.fill();

  const shieldRatio = clamp(p.shield / p.maxShield, 0, 1);
  if (shieldRatio > 0 || p.shieldTimer > 0) {
    const invulnBoost = p.shieldTimer > 0 ? 0.48 : 0;
    const charge = clamp(shieldRatio + invulnBoost, 0, 1.6);
    const baseRadius = 24 + Math.sin(state.time * 7) * 1.6;
    const isLow = shieldRatio > 0 && shieldRatio < 0.3 && p.shieldTimer <= 0;
    const flicker = isLow ? (Math.sin(state.time * 36) > -0.2 ? 1 : 0.35) : 1;
    const auraAlpha = (0.08 + charge * 0.1) * flicker;

    // Inner glow bubble
    const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, 34);
    aura.addColorStop(0, `rgba(158, 255, 240, ${auraAlpha})`);
    aura.addColorStop(0.65, `rgba(130, 255, 232, ${auraAlpha * 0.8})`);
    aura.addColorStop(1, "rgba(130, 255, 232, 0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 29, 0, 0, Math.PI * 2);
    ctx.fill();

    const layerCount = p.shieldTimer > 0 ? 3 : 2;
    // Waving energy shells
    for (let layer = 0; layer < layerCount; layer++) {
      const layerRadius = baseRadius + layer * 4.4;
      const amp = 1.6 + layer * 0.7 + shieldRatio * 0.6;
      const alpha = (0.62 - layer * 0.16 + charge * 0.18) * flicker;
      const hue = layer === 0 ? "145,255,220" : layer === 1 ? "120,245,255" : "175,255,245";
      ctx.strokeStyle = `rgba(${hue}, ${clamp(alpha, 0.1, 0.92)})`;
      ctx.lineWidth = 2.2 - layer * 0.4;
      ctx.beginPath();
      const steps = 58;
      for (let i = 0; i <= steps; i++) {
        const a = (Math.PI * 2 * i) / steps;
        const waveA = Math.sin(a * (5 + layer) + state.time * (6.6 + layer * 1.2));
        const waveB = Math.sin(a * (9 + layer * 2) - state.time * (3.9 + layer * 0.8));
        const r = layerRadius + waveA * amp + waveB * (amp * 0.45);
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.92;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Rotating segmented arcs are reserved for invincibility powerup.
    if (p.shieldTimer > 0) {
      ctx.save();
      ctx.lineCap = "round";
      for (let ring = 0; ring < 2; ring++) {
        const spin = state.time * (ring === 0 ? 2.4 : -1.8);
        const ringR = baseRadius + 3 + ring * 8.5;
        const arcLen = Math.PI * (0.22 + ring * 0.08);
        ctx.strokeStyle = ring === 0 ? "rgba(160, 255, 238, 0.85)" : "rgba(118, 241, 255, 0.76)";
        ctx.lineWidth = ring === 0 ? 3 : 2.2;
        for (let seg = 0; seg < 3; seg++) {
          const start = spin + seg * ((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.arc(0, 0, ringR, start, start + arcLen);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawBullet(b) {
  const scale = depthScale(b.y);
  const py = projectY(b.y);
  ctx.shadowBlur = 16;
  ctx.shadowColor = b.glow;
  ctx.fillStyle = b.glow;
  ctx.beginPath();
  ctx.arc(b.x, py, b.radius * scale, 0, Math.PI * 2);
  ctx.fill();
}

function drawEnemy(enemy) {
  drawTrail(enemy, shadeHex(enemy.color, 0.95, 0.22));
  const scale = depthScale(enemy.y);
  const py = projectY(enemy.y);
  const heavy = enemy.type === "tank" || enemy.type === "boss";
  drawGroundShadow(enemy.x, enemy.y, enemy.radius * scale, heavy ? 0.3 : 0.22);

  ctx.save();
  ctx.translate(enemy.x, py);
  ctx.rotate(enemy.angle);
  ctx.scale(scale, scale);

  ctx.save();
  ctx.translate(-2, heavy ? 7 : 5);
  ctx.fillStyle = shadeHex(enemy.color, 0.38, 0.9);
  ctx.strokeStyle = shadeHex(enemy.color, 0.6, 0.95);
  ctx.lineWidth = heavy ? 3 : 2;
  traceEnemyShape(enemy.type, enemy.radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.shadowBlur = heavy ? 24 : 15;
  ctx.shadowColor = shadeHex(enemy.color, 1.18, 0.95);
  ctx.fillStyle = shadeHex(enemy.color, 0.95, 0.88);
  ctx.strokeStyle = shadeHex(enemy.color, 1.4, 1);
  ctx.lineWidth = heavy ? 3 : 2;
  traceEnemyShape(enemy.type, enemy.radius);
  ctx.fill();
  ctx.stroke();

  if (enemy.type === "tank") {
    ctx.strokeStyle = shadeHex(enemy.color, 1.65, 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.56, 0, Math.PI * 2);
    ctx.stroke();
  } else if (enemy.type === "boss") {
    ctx.strokeStyle = shadeHex(enemy.color, 1.7, 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (enemy.type === "spinner") {
    ctx.strokeStyle = shadeHex(enemy.color, 1.7, 0.95);
    ctx.beginPath();
    ctx.moveTo(-enemy.radius, 0);
    ctx.lineTo(enemy.radius, 0);
    ctx.stroke();
  } else if (enemy.type === "mine") {
    ctx.strokeStyle = shadeHex(enemy.color, 1.45, 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.56, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPowerup(item) {
  const color = item.type === "rapid"
    ? "#fff28c"
    : item.type === "shield"
    ? "#89ffd2"
    : item.type === "scatter"
    ? "#6fc4ff"
    : item.type === "cannon"
    ? "#ff9a63"
    : item.type === "heart"
    ? "#ff6f8e"
    : "#c48dff";
  const scale = depthScale(item.y);
  const py = projectY(item.y);
  const r = (item.radius + Math.sin(item.pulse) * 2) * scale;
  drawGroundShadow(item.x, item.y, r * 0.95, 0.18);
  ctx.shadowBlur = 20;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(item.x, py, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(item.x - r * 0.6, py);
  ctx.lineTo(item.x + r * 0.6, py);
  ctx.stroke();
}

function drawParticles() {
  for (const p of state.particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    const scale = depthScale(p.y);
    ctx.shadowBlur = p.glow;
    ctx.shadowColor = p.color;
    ctx.fillStyle = `${p.color}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0")}`;
    ctx.beginPath();
    ctx.arc(p.x, projectY(p.y), p.size * alpha * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLevelBanner() {
  if (state.mode !== "level-complete" && state.mode !== "warp-jump") return;
  const opacity = state.mode === "level-complete"
    ? clamp(state.levelDoneTimer / 1.1, 0, 1)
    : clamp(state.warpTimer / Math.max(0.001, state.warpDuration), 0, 1);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(0, 12, 18, 0.72)";
  ctx.fillRect(canvas.width * 0.25, canvas.height * 0.4, canvas.width * 0.5, 102);
  ctx.strokeStyle = "rgba(101, 236, 255, 0.75)";
  ctx.strokeRect(canvas.width * 0.25, canvas.height * 0.4, canvas.width * 0.5, 102);
  ctx.fillStyle = "#9ef9ff";
  ctx.font = "700 36px Rajdhani";
  ctx.textAlign = "center";
  ctx.fillText(
    state.mode === "warp-jump" ? `Warping To Level ${state.levelIndex + 2}` : `Level ${state.endedLevel} Cleared`,
    canvas.width * 0.5,
    canvas.height * 0.46
  );
  ctx.font = "600 23px Rajdhani";
  ctx.fillText(
    state.mode === "warp-jump" ? "Hold tight..." : "Stabilizing warp gate...",
    canvas.width * 0.5,
    canvas.height * 0.52
  );
  ctx.restore();
}

function drawWarpJumpEffect() {
  if (state.mode !== "warp-jump") return;
  const t = 1 - state.warpTimer / Math.max(0.001, state.warpDuration);
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  const tunnelGlow = ctx.createRadialGradient(cx, cy, 16, cx, cy, canvas.width * 0.58);
  tunnelGlow.addColorStop(0, `rgba(180, 252, 255, ${0.22 + t * 0.38})`);
  tunnelGlow.addColorStop(0.45, `rgba(92, 203, 255, ${0.13 + t * 0.24})`);
  tunnelGlow.addColorStop(1, "rgba(20, 60, 110, 0)");
  ctx.fillStyle = tunnelGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 92; i++) {
    const baseAngle = (i / 92) * Math.PI * 2;
    const wobble = Math.sin(state.time * 2.7 + i * 0.6) * 0.05;
    const angle = baseAngle + wobble;
    const inner = 32 + t * 22;
    const outer = lerp(80, canvas.width * 0.72, t * t);
    ctx.strokeStyle = `rgba(${120 + (i % 24) * 4}, 232, 255, ${0.06 + t * 0.2})`;
    ctx.lineWidth = 0.8 + t * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }

  for (let ring = 0; ring < 4; ring++) {
    const ringT = (t + ring * 0.18) % 1;
    const radius = lerp(38, canvas.width * 0.32, ringT);
    ctx.strokeStyle = `rgba(141, 244, 255, ${0.2 * (1 - ringT)})`;
    ctx.lineWidth = 2.4 - ring * 0.35;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * 1.05, radius * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (t > 0.82) {
    const flashAlpha = clamp((t - 0.82) / 0.18, 0, 1) * 0.45;
    ctx.fillStyle = `rgba(210, 250, 255, ${flashAlpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.restore();
}

function render(frameDt = FIXED_DT) {
  if (background3d.ready) {
    background3d.update(frameDt, state.levelIndex, state.ripples.length);
    ctx.drawImage(background3d.canvas, 0, 0, canvas.width, canvas.height);
  } else {
    drawBackground();
  }

  ctx.save();
  ctx.translate(state.cameraOffsetX, state.cameraOffsetY);
  ctx.globalCompositeOperation = "lighter";

  const enemiesByDepth = [...state.enemies].sort((a, b) => a.y - b.y);
  const powerupsByDepth = [...state.powerups].sort((a, b) => a.y - b.y);

  for (const enemy of enemiesByDepth) drawEnemy(enemy);
  for (const item of powerupsByDepth) drawPowerup(item);
  for (const b of state.bullets) drawBullet(b);
  drawParticles();

  ctx.globalCompositeOperation = "source-over";
  if (state.player) drawPlayer();

  ctx.restore();

  drawLevelBanner();
  drawWarpJumpEffect();

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.23})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.mode === "game-over") {
    ctx.fillStyle = "rgba(9, 0, 6, 0.25)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.powerupMessageTimer > 0) {
    const alpha = clamp(state.powerupMessageTimer / 1.4, 0, 1);
    ctx.fillStyle = `rgba(193, 250, 255, ${alpha})`;
    ctx.font = "700 26px Rajdhani";
    ctx.textAlign = "center";
    ctx.fillText(state.powerupMessage, canvas.width * 0.5, canvas.height * 0.88);
  }
}

function gameLoop(ts) {
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;

  if (state.mode !== "menu" && state.mode !== "paused") {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
  }

  render(dt);
  requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (state.mode === "playing" || state.mode === "level-complete" || state.mode === "warp-jump") {
    state.pauseReturnMode = state.mode;
    state.mode = "paused";
    showOverlay(pauseScreen);
  } else if (state.mode === "paused") {
    hideOverlay(pauseScreen);
    state.mode = state.pauseReturnMode || "playing";
  }
  syncMusicForMode();
}

function setMouseFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  input.mouseX = (event.clientX - rect.left) * scaleX;
  input.mouseY = (event.clientY - rect.top) * scaleY;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    canvas.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

function renderGameToText() {
  const p = state.player || { x: 0, y: 0, vx: 0, vy: 0, radius: 0 };
  const payload = {
    coordinate_system: {
      origin: "top-left",
      x_axis: "increases to the right",
      y_axis: "increases downward",
      width: canvas.width,
      height: canvas.height,
    },
    mode: state.mode,
    level: {
      index: state.levelIndex + 1,
      name: levelConfig().name,
      kills: state.killsInLevel,
      target_kills: levelConfig().targetKills,
      warp_timer: Number(Math.max(0, state.warpTimer || 0).toFixed(2)),
    },
    player: {
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
      vx: Number(p.vx.toFixed(2)),
      vy: Number(p.vy.toFixed(2)),
      radius: p.radius,
      energy: Number(Math.max(0, p.energy || 0).toFixed(2)),
      shield: Number(Math.max(0, p.shield || 0).toFixed(2)),
      rapid_timer: Number(Math.max(0, p.rapidTimer || 0).toFixed(2)),
      scatter_timer: Number(Math.max(0, p.scatterTimer || 0).toFixed(2)),
      shield_timer: Number(Math.max(0, p.shieldTimer || 0).toFixed(2)),
      cannon_charges: p.cannonCharges || 0,
      invulnerable: Number(Math.max(0, p.invulnerable || 0).toFixed(2)),
    },
    enemies: state.enemies.slice(0, 20).map((enemy) => ({
      id: enemy.id,
      type: enemy.type,
      x: Number(enemy.x.toFixed(2)),
      y: Number(enemy.y.toFixed(2)),
      hp: enemy.hp,
      radius: enemy.radius,
    })),
    bullets: state.bullets.slice(0, 25).map((bullet) => ({
      x: Number(bullet.x.toFixed(2)),
      y: Number(bullet.y.toFixed(2)),
      vx: Number(bullet.vx.toFixed(2)),
      vy: Number(bullet.vy.toFixed(2)),
    })),
    powerups: state.powerups.map((powerup) => ({
      type: powerup.type,
      x: Number(powerup.x.toFixed(2)),
      y: Number(powerup.y.toFixed(2)),
      life: Number(powerup.life.toFixed(2)),
    })),
    ripples: state.ripples.slice(0, 6).map((ripple) => ({
      x: Number(ripple.x.toFixed(2)),
      y: Number(ripple.y.toFixed(2)),
      radius: Number(ripple.radius.toFixed(2)),
      life: Number(ripple.life.toFixed(2)),
    })),
    score: Math.floor(state.score),
    streak: state.streak,
    audio_muted: audio.muted,
  };
  return JSON.stringify(payload, null, 2);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms = 16.67) => {
  if (state.mode === "menu" || state.mode === "paused") {
    render(ms / 1000);
    return Promise.resolve();
  }
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) {
    update(FIXED_DT);
  }
  render(ms / 1000);
  return Promise.resolve();
};

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  ensureInputAudio();
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  input.keys.add(event.code);

  if (event.code === "KeyP") {
    togglePause();
  }
  if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
    input.dashQueued = true;
  }
  if (event.code === "KeyE") {
    input.cannonQueued = true;
  }
  if (event.code === "KeyF") {
    toggleFullscreen();
  }
  if (event.code === "KeyM") {
    audio.setMuted(!audio.muted);
  }
});

window.addEventListener("keyup", (event) => {
  input.keys.delete(event.code);
});

canvas.addEventListener("mousemove", (event) => {
  setMouseFromEvent(event);
});

canvas.addEventListener("mousedown", (event) => {
  ensureInputAudio();
  setMouseFromEvent(event);
  if (state.mode === "menu") {
    resetRun();
  }
  if (event.button === 0) {
    input.firing = true;
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    input.firing = false;
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && (state.mode === "playing" || state.mode === "level-complete" || state.mode === "warp-jump")) {
    state.pauseReturnMode = state.mode;
    state.mode = "paused";
    showOverlay(pauseScreen);
    syncMusicForMode();
  }
});

startBtn.addEventListener("click", () => {
  ensureInputAudio();
  resetRun();
});

scoreForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ensureInputAudio();
  await submitScoreEntry();
});

restartBtn.addEventListener("click", async () => {
  ensureInputAudio();
  await submitScoreEntry();
  resetRun();
});

highscoreLevelSelect.addEventListener("change", () => {
  state.menuHighscoreLevel = Math.max(1, Number.parseInt(highscoreLevelSelect.value, 10) || 1);
  drawHighscores();
});

populateHighscoreLevelOptions();
drawHighscores();
resizeCanvas();
seedStars();
spawnPlayer();
showOverlay(menuScreen);
updateHud();
requestAnimationFrame(gameLoop);

loadAllHighscores().then((entries) => {
  state.highscores = entries;
  drawHighscores();
});
