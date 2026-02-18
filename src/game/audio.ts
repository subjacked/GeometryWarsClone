// @ts-nocheck
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicTempoMs = 95;
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

  shieldRecharge() {
    this.tone({ type: "sine", freq: 310, duration: 0.24, volume: 0.08, sweep: 210 });
    this.tone({ type: "triangle", freq: 470, duration: 0.18, volume: 0.06, sweep: 130 });
  }

  shieldRestored() {
    this.tone({ type: "sine", freq: 690, duration: 0.12, volume: 0.06, sweep: 120 });
    this.tone({ type: "triangle", freq: 860, duration: 0.14, volume: 0.05, sweep: 60 });
  }

  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  kick(volume = 0.08) {
    this.tone({ type: "sine", freq: 95, duration: 0.1, volume, sweep: -48 });
  }

  snare(volume = 0.05) {
    this.noise({ duration: 0.08, volume });
    this.tone({ type: "triangle", freq: 210, duration: 0.05, volume: volume * 0.7, sweep: -50 });
  }

  hat(volume = 0.028) {
    this.noise({ duration: 0.03, volume });
  }

  musicTick() {
    if (!this.ready) return;
    const step = this.musicStep;
    const bassPattern = [40, null, 40, null, 43, null, 40, null, 47, null, 43, null, 38, null, 35, null];
    const arpPattern = [76, 79, 83, 86, 83, 79, 74, 79, 83, 86, 83, 79, 74, 77, 81, 84];
    const bassNote = bassPattern[step % bassPattern.length];
    const arpNote = arpPattern[step % arpPattern.length];

    if (step % 4 === 0) this.kick(0.08);
    if (step % 8 === 4) this.snare(0.05);
    if (step % 2 === 1) this.hat(0.03);

    if (bassNote !== null) {
      this.tone({
        type: "sawtooth",
        freq: this.midiToFreq(bassNote),
        duration: 0.19,
        volume: 0.045,
        sweep: -24,
      });
    }
    this.tone({
      type: "triangle",
      freq: this.midiToFreq(arpNote),
      duration: 0.09,
      volume: 0.03,
      sweep: 8,
    });
    if (step % 8 === 0) {
      this.tone({
        type: "sine",
        freq: this.midiToFreq(arpNote - 12),
        duration: 0.28,
        volume: 0.018,
        sweep: 0,
      });
    }
    this.musicStep += 1;
  }

  setCombatMusic(active) {
    if (!this.ready) return;
    if (active && !this.musicTimer) {
      this.musicTimer = setInterval(() => this.musicTick(), this.musicTempoMs);
    } else if (!active && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
      this.musicStep = 0;
    }
  }
}
