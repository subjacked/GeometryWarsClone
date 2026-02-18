const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const hudLevel = document.getElementById("hud-level");
const hudScore = document.getElementById("hud-score");
const hudLives = document.getElementById("hud-lives");
const hudStreak = document.getElementById("hud-streak");
const menuScreen = document.getElementById("menu-screen");
const pauseScreen = document.getElementById("pause-screen");
const gameOverScreen = document.getElementById("game-over-screen");
const gameOverSummary = document.getElementById("game-over-summary");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const highscoreList = document.getElementById("highscore-list");

const STORAGE_KEY = "neon-geometry-rift-highscores-v1";
const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;
const BASE_WIDTH = 1280;
const BASE_HEIGHT = 720;
const BASE_ENEMY_POINTS = {
  seeker: 120,
  spinner: 170,
  tank: 260,
  mine: 220,
  splitter: 210,
  shard: 70,
};

const levelConfigs = [
  {
    name: "Boot Sequence",
    targetKills: 26,
    spawnInterval: 1.1,
    maxEnemies: 12,
    mix: [
      ["seeker", 6],
      ["spinner", 2],
      ["mine", 1],
    ],
    playerSpeedBonus: 0,
  },
  {
    name: "Pulse District",
    targetKills: 40,
    spawnInterval: 0.95,
    maxEnemies: 16,
    mix: [
      ["seeker", 4],
      ["spinner", 4],
      ["mine", 2],
      ["splitter", 2],
    ],
    playerSpeedBonus: 12,
  },
  {
    name: "Fractal Pressure",
    targetKills: 56,
    spawnInterval: 0.78,
    maxEnemies: 20,
    mix: [
      ["seeker", 3],
      ["spinner", 5],
      ["tank", 2],
      ["mine", 3],
      ["splitter", 3],
    ],
    playerSpeedBonus: 16,
  },
  {
    name: "Event Horizon",
    targetKills: 74,
    spawnInterval: 0.64,
    maxEnemies: 24,
    mix: [
      ["seeker", 2],
      ["spinner", 5],
      ["tank", 4],
      ["mine", 3],
      ["splitter", 5],
    ],
    playerSpeedBonus: 22,
  },
  {
    name: "Rift Core",
    targetKills: 96,
    spawnInterval: 0.53,
    maxEnemies: 30,
    mix: [
      ["seeker", 2],
      ["spinner", 4],
      ["tank", 5],
      ["mine", 4],
      ["splitter", 6],
    ],
    playerSpeedBonus: 30,
  },
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
  }

  async ensureStarted() {
    if (this.ready) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.4;
    this.master.connect(this.ctx.destination);
    this.ready = true;
  }

  setMuted(next) {
    this.muted = next;
    if (this.master) {
      this.master.gain.value = next ? 0 : 0.4;
    }
  }

  tone({ type = "sine", freq = 440, duration = 0.12, volume = 0.12, sweep = 0 }) {
    if (!this.ready || this.muted) return;
    const start = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (sweep !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.015);
  }

  noise({ duration = 0.16, volume = 0.14 }) {
    if (!this.ready || this.muted) return;
    const length = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 920;
    filter.Q.value = 0.7;
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(now);
  }

  shoot() {
    this.tone({ type: "triangle", freq: 780, duration: 0.06, volume: 0.11, sweep: -420 });
  }

  enemyHit() {
    this.tone({ type: "square", freq: 320, duration: 0.08, volume: 0.08, sweep: -120 });
  }

  enemyExplode() {
    this.noise({ duration: 0.12, volume: 0.16 });
    this.tone({ type: "sawtooth", freq: 180, duration: 0.14, volume: 0.1, sweep: -70 });
  }

  playerDamaged() {
    this.tone({ type: "sawtooth", freq: 220, duration: 0.2, volume: 0.15, sweep: -140 });
  }

  levelUp() {
    this.tone({ type: "triangle", freq: 520, duration: 0.1, volume: 0.09, sweep: 340 });
    this.tone({ type: "triangle", freq: 760, duration: 0.14, volume: 0.1, sweep: 270 });
  }

  powerup() {
    this.tone({ type: "sine", freq: 680, duration: 0.1, volume: 0.1, sweep: 180 });
  }

  gameOver() {
    this.tone({ type: "square", freq: 170, duration: 0.32, volume: 0.12, sweep: -80 });
    this.noise({ duration: 0.26, volume: 0.14 });
  }
}

const audio = new AudioEngine();

const input = {
  keys: new Set(),
  mouseX: BASE_WIDTH * 0.5,
  mouseY: BASE_HEIGHT * 0.5,
  firing: false,
  dashQueued: false,
};

const state = {
  mode: "menu",
  time: 0,
  score: 0,
  lives: 3,
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
  levelDoneTimer: 0,
  player: null,
  bullets: [],
  enemies: [],
  particles: [],
  powerups: [],
  highscores: [],
  stars: [],
  endedLevel: 0,
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
    shieldTimer: 0,
    trail: [],
  };
}

function resetRun() {
  state.mode = "playing";
  state.time = 0;
  state.score = 0;
  state.lives = 3;
  state.levelIndex = 0;
  state.killsInLevel = 0;
  state.streak = 0;
  state.streakTimer = 0;
  state.spawnTimer = 0;
  state.levelDoneTimer = 0;
  state.shake = 0;
  state.flash = 0;
  state.bullets.length = 0;
  state.enemies.length = 0;
  state.particles.length = 0;
  state.powerups.length = 0;
  state.endedLevel = 0;
  spawnPlayer();
  hideOverlay(gameOverScreen);
  hideOverlay(menuScreen);
  hideOverlay(pauseScreen);
  updateHud();
}

function loadHighscores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && Number.isFinite(entry.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch {
    return [];
  }
}

function saveHighscore(score, level) {
  if (score <= 0) return;
  const entries = loadHighscores();
  entries.push({
    score: Math.floor(score),
    level,
    date: new Date().toISOString().slice(0, 10),
  });
  entries.sort((a, b) => b.score - a.score);
  const trimmed = entries.slice(0, 10);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  state.highscores = trimmed;
  drawHighscores();
}

function drawHighscores() {
  highscoreList.innerHTML = "";
  if (!state.highscores.length) {
    const item = document.createElement("li");
    item.textContent = "No records yet. Start your first run.";
    highscoreList.appendChild(item);
    return;
  }
  state.highscores.forEach((entry, idx) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>#${idx + 1} ${entry.score}</strong><span>Lvl ${entry.level} • ${entry.date}</span>`;
    highscoreList.appendChild(item);
  });
}

function showOverlay(el) {
  el.classList.add("active");
}

function hideOverlay(el) {
  el.classList.remove("active");
}

function ensureInputAudio() {
  audio.ensureStarted();
}

function levelConfig() {
  return levelConfigs[Math.min(state.levelIndex, levelConfigs.length - 1)];
}

function currentLevelLabel() {
  const info = levelConfig();
  return `${state.levelIndex + 1}: ${info.name}`;
}

function updateHud() {
  hudLevel.textContent = `Level ${currentLevelLabel()}`;
  hudScore.textContent = `Score ${Math.floor(state.score)}`;
  hudLives.textContent = `Lives ${state.lives}`;
  hudStreak.textContent = `Streak x${Math.max(1, state.streak)}`;
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

function spawnEnemy(forceType = null, x = null, y = null) {
  const cfg = levelConfig();
  const type = forceType || weightedPick(cfg.mix);
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
  }

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
  const type = Math.random() < 0.52 ? "rapid" : Math.random() < 0.5 ? "shield" : "nova";
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

function shootBullet() {
  const p = state.player;
  const dx = input.mouseX - p.x;
  const dy = input.mouseY - p.y;
  const len = Math.hypot(dx, dy) || 1;
  const spread = rand(-0.07, 0.07);
  const base = Math.atan2(dy, dx) + spread;
  const speed = p.rapidTimer > 0 ? 660 : 610;
  state.bullets.push({
    x: p.x,
    y: p.y,
    vx: Math.cos(base) * speed,
    vy: Math.sin(base) * speed,
    radius: p.rapidTimer > 0 ? 4.6 : 4,
    life: 1.25,
    glow: p.rapidTimer > 0 ? "#fcf980" : "#67ecff",
  });
  audio.shoot();
  emitParticles(p.x, p.y, "#75f0ff", 2, 58);
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
  if (p.shieldTimer > 0) p.shieldTimer -= dt;

  const triggerHeld = input.firing || input.keys.has("Space");
  const cooldown = p.rapidTimer > 0 ? 0.07 : 0.12;
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
  }

  enemy.vx *= enemy.type === "tank" ? 0.94 : 0.96;
  enemy.vy *= enemy.type === "tank" ? 0.94 : 0.96;
  enemy.x += enemy.vx * dt;
  enemy.y += enemy.vy * dt;

  const margin = enemy.radius + 7;
  const wallBounce = enemy.type === "tank" ? 0.34 : 0.42;
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
  emitParticles(enemy.x, enemy.y, enemy.color, enemy.type === "tank" ? 26 : 16, enemy.type === "tank" ? 240 : 170);
  state.shake = Math.max(state.shake, enemy.type === "tank" ? 14 : 9);
  state.flash = Math.max(state.flash, enemy.type === "tank" ? 0.34 : 0.22);
  audio.enemyExplode();

  if (hitByPlayer) {
    state.streak += 1;
    state.streakTimer = 2.8;
    state.killsInLevel += 1;
    addScore((BASE_ENEMY_POINTS[enemy.type] || 100) + state.levelIndex * 14);
    if (Math.random() < 0.1) {
      spawnPowerup(enemy.x, enemy.y);
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
      state.lives -= Math.max(1, enemy.contactDamage - 1);
      p.invulnerable = 1.5;
      state.shake = Math.max(state.shake, 18);
      state.flash = Math.max(state.flash, 0.44);
      audio.playerDamaged();
      emitParticles(p.x, p.y, "#ff7892", 22, 220);
      if (state.lives <= 0) {
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
        p.shieldTimer = Math.max(p.shieldTimer, 5.5);
      } else if (item.type === "nova") {
        for (let e = state.enemies.length - 1; e >= 0; e--) {
          destroyEnemy(e, true);
        }
      }
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

function handleSpawns(dt) {
  const cfg = levelConfig();
  if (state.killsInLevel >= cfg.targetKills && state.enemies.length === 0) {
    state.mode = "level-complete";
    state.levelDoneTimer = 2.8;
    state.endedLevel = state.levelIndex + 1;
    audio.levelUp();
    emitParticles(canvas.width * 0.5, canvas.height * 0.5, "#6dfcff", 80, 260);
    addScore(1200 + state.levelIndex * 320);
    state.flash = Math.max(state.flash, 0.45);
    return;
  }

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.enemies.length < cfg.maxEnemies && state.killsInLevel < cfg.targetKills) {
    spawnEnemy();
    const intensity = state.killsInLevel / Math.max(1, cfg.targetKills);
    state.spawnTimer = cfg.spawnInterval * lerp(1, 0.62, intensity);
  }
}

function advanceLevel() {
  state.levelIndex += 1;
  state.killsInLevel = 0;
  state.spawnTimer = 0.2;
  state.mode = "playing";
  state.flash = Math.max(state.flash, 0.25);
  if (state.levelIndex > levelConfigs.length - 1) {
    state.levelIndex = levelConfigs.length - 1;
  }
  emitParticles(state.player.x, state.player.y, "#95fff5", 22, 220);
}

function onRunFailed() {
  state.mode = "game-over";
  audio.gameOver();
  state.endedLevel = state.levelIndex + 1;
  saveHighscore(state.score, state.endedLevel);
  gameOverSummary.textContent = `Score ${Math.floor(state.score)} • Reached Level ${state.endedLevel}`;
  showOverlay(gameOverScreen);
}

function update(dt) {
  state.time += dt;
  state.streakTimer -= dt;
  if (state.streakTimer <= 0) {
    state.streak = 0;
  }
  state.shake = Math.max(0, state.shake - dt * 26);
  state.flash = Math.max(0, state.flash - dt * 0.9);
  state.cameraOffsetX = rand(-state.shake, state.shake) * 0.5;
  state.cameraOffsetY = rand(-state.shake, state.shake) * 0.5;

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

function drawBackground() {
  const levelHue = 188 + state.levelIndex * 8;
  const horizonY = canvas.height * 0.24;

  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, `hsl(${levelHue}, 62%, 12%)`);
  sky.addColorStop(1, `hsl(${Math.max(0, levelHue - 18)}, 58%, 7%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, horizonY);

  const floor = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
  floor.addColorStop(0, `hsl(${Math.max(0, levelHue - 22)}, 70%, 8%)`);
  floor.addColorStop(1, "hsl(176, 90%, 3%)");
  ctx.fillStyle = floor;
  ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);

  const horizonGlow = ctx.createRadialGradient(
    canvas.width * 0.5,
    horizonY - 8,
    12,
    canvas.width * 0.5,
    horizonY,
    canvas.width * 0.66
  );
  horizonGlow.addColorStop(0, "rgba(116, 242, 255, 0.22)");
  horizonGlow.addColorStop(1, "rgba(116, 242, 255, 0)");
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const star of state.stars) {
    star.y += star.speed * FIXED_DT;
    if (star.y > canvas.height + 12) {
      star.y = -12;
      star.x = rand(0, canvas.width);
    }
    const alpha = 0.28 + Math.sin(state.time * 1.2 + star.twinkle) * 0.2;
    const depthAlpha = star.y < horizonY ? 1 : 0.35;
    ctx.fillStyle = `rgba(160, 243, 255, ${Math.max(0.08, alpha) * depthAlpha})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }

  const drift = state.time * 0.42;
  const vanishingX = canvas.width * 0.5 + Math.sin(state.time * 0.2) * 18;

  ctx.strokeStyle = "rgba(80, 230, 255, 0.22)";
  ctx.lineWidth = 1;
  for (let i = -16; i <= 16; i++) {
    const xTop = vanishingX + i * 48 + Math.sin(drift + i * 0.3) * 9;
    const xBottom = vanishingX + i * 142;
    ctx.beginPath();
    ctx.moveTo(xTop, horizonY);
    ctx.lineTo(xBottom, canvas.height);
    ctx.stroke();
  }
  for (let i = 1; i <= 20; i++) {
    const t = i / 20;
    const y = horizonY + t * t * (canvas.height - horizonY);
    const alpha = 0.26 * (1 - t) + 0.05;
    ctx.strokeStyle = `rgba(80, 230, 255, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
  ctx.fillRect(0, canvas.height - 36, canvas.width, 36);
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

  if (p.shieldTimer > 0) {
    ctx.strokeStyle = "rgba(132, 255, 219, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 24 + Math.sin(state.time * 7) * 2, 0, Math.PI * 2);
    ctx.stroke();
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
  drawGroundShadow(enemy.x, enemy.y, enemy.radius * scale, enemy.type === "tank" ? 0.3 : 0.22);

  ctx.save();
  ctx.translate(enemy.x, py);
  ctx.rotate(enemy.angle);
  ctx.scale(scale, scale);

  ctx.save();
  ctx.translate(-2, enemy.type === "tank" ? 7 : 5);
  ctx.fillStyle = shadeHex(enemy.color, 0.38, 0.9);
  ctx.strokeStyle = shadeHex(enemy.color, 0.6, 0.95);
  ctx.lineWidth = enemy.type === "tank" ? 3 : 2;
  traceEnemyShape(enemy.type, enemy.radius);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.shadowBlur = enemy.type === "tank" ? 24 : 15;
  ctx.shadowColor = shadeHex(enemy.color, 1.18, 0.95);
  ctx.fillStyle = shadeHex(enemy.color, 0.95, 0.88);
  ctx.strokeStyle = shadeHex(enemy.color, 1.4, 1);
  ctx.lineWidth = enemy.type === "tank" ? 3 : 2;
  traceEnemyShape(enemy.type, enemy.radius);
  ctx.fill();
  ctx.stroke();

  if (enemy.type === "tank") {
    ctx.strokeStyle = shadeHex(enemy.color, 1.65, 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius * 0.56, 0, Math.PI * 2);
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
  const color = item.type === "rapid" ? "#fff28c" : item.type === "shield" ? "#89ffd2" : "#c48dff";
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
  if (state.mode !== "level-complete") return;
  const opacity = clamp(state.levelDoneTimer / 2.2, 0, 1);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(0, 12, 18, 0.72)";
  ctx.fillRect(canvas.width * 0.25, canvas.height * 0.4, canvas.width * 0.5, 102);
  ctx.strokeStyle = "rgba(101, 236, 255, 0.75)";
  ctx.strokeRect(canvas.width * 0.25, canvas.height * 0.4, canvas.width * 0.5, 102);
  ctx.fillStyle = "#9ef9ff";
  ctx.font = "700 36px Rajdhani";
  ctx.textAlign = "center";
  ctx.fillText(`Level ${state.endedLevel} Cleared`, canvas.width * 0.5, canvas.height * 0.46);
  ctx.font = "600 23px Rajdhani";
  ctx.fillText("Stabilizing warp gate...", canvas.width * 0.5, canvas.height * 0.52);
  ctx.restore();
}

function render() {
  drawBackground();

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

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.23})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (state.mode === "game-over") {
    ctx.fillStyle = "rgba(9, 0, 6, 0.25)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const p = state.player;
  if (p && state.mode === "playing") {
    ctx.fillStyle = "rgba(150, 250, 255, 0.82)";
    ctx.font = "600 18px Rajdhani";
    ctx.textAlign = "left";
    const objective = levelConfig().targetKills;
    ctx.fillText(`Kills ${state.killsInLevel}/${objective}`, 16, 28);
    const rapid = p.rapidTimer > 0 ? `Rapid ${p.rapidTimer.toFixed(1)}s` : "Rapid offline";
    const shield = p.shieldTimer > 0 ? `Shield ${p.shieldTimer.toFixed(1)}s` : "Shield offline";
    const dash = p.dashCooldown > 0 ? `Dash ${(p.dashCooldown).toFixed(1)}s` : "Dash ready";
    ctx.fillText(`${rapid}  •  ${shield}  •  ${dash}`, 16, 50);
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

  render();
  requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (state.mode === "playing" || state.mode === "level-complete") {
    state.mode = "paused";
    showOverlay(pauseScreen);
  } else if (state.mode === "paused") {
    hideOverlay(pauseScreen);
    state.mode = "playing";
  }
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
    },
    player: {
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
      vx: Number(p.vx.toFixed(2)),
      vy: Number(p.vy.toFixed(2)),
      radius: p.radius,
      lives: state.lives,
      rapid_timer: Number(Math.max(0, p.rapidTimer || 0).toFixed(2)),
      shield_timer: Number(Math.max(0, p.shieldTimer || 0).toFixed(2)),
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
    score: Math.floor(state.score),
    streak: state.streak,
    audio_muted: audio.muted,
  };
  return JSON.stringify(payload, null, 2);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms = 16.67) => {
  if (state.mode === "menu" || state.mode === "paused") {
    render();
    return Promise.resolve();
  }
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) {
    update(FIXED_DT);
  }
  render();
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
  if (document.hidden && (state.mode === "playing" || state.mode === "level-complete")) {
    state.mode = "paused";
    showOverlay(pauseScreen);
  }
});

startBtn.addEventListener("click", () => {
  ensureInputAudio();
  resetRun();
});

restartBtn.addEventListener("click", () => {
  ensureInputAudio();
  resetRun();
});

state.highscores = loadHighscores();
drawHighscores();
resizeCanvas();
seedStars();
spawnPlayer();
showOverlay(menuScreen);
updateHud();
requestAnimationFrame(gameLoop);
