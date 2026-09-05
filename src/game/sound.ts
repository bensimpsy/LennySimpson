// Shared sound engine — 100% WebAudio, zero audio files to host.
// Music = a tiny step sequencer, SFX = oscillator/noise blips.
// Kid-tweakable: change the MELODY/BASS patterns or add your own SFX!
export type MusicStyle = 'swamp' | 'space';

const MUTE_KEY = 'lenny-muted';
const mtof = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// 16 steps each, 0 = rest. Notes are MIDI numbers (60 = middle C).
const PATTERNS: Record<MusicStyle, { bpm: number; lead: number[]; bass: number[] }> = {
  // bouncy pentatonic waddle 🐸
  swamp: {
    bpm: 116,
    lead: [72, 0, 76, 0, 79, 0, 76, 0, 81, 0, 79, 76, 74, 0, 72, 0],
    bass: [48, 0, 0, 0, 43, 0, 0, 0, 45, 0, 0, 0, 43, 0, 47, 0],
  },
  // dreamy space float ⭐
  space: {
    bpm: 92,
    lead: [69, 0, 0, 72, 0, 0, 76, 0, 0, 74, 0, 72, 0, 0, 71, 0],
    bass: [45, 0, 0, 0, 0, 0, 0, 0, 41, 0, 0, 0, 0, 0, 0, 0],
  },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private seqTimer = 0;
  private step = 0;
  private nextAt = 0;
  private style: MusicStyle = 'swamp';
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch { /* private mode etc. — sound on */ }
  }

  // Must be called from a user gesture at least once (Start button does this).
  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.16;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.5;
      this.sfxBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch { /* ignore */ }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    return this.muted;
  }

  // ---- primitives ----

  private tone(
    freq: number,
    opts: { at?: number; dur?: number; type?: OscillatorType; vol?: number; slideTo?: number; bus?: GainNode | null } = {},
  ) {
    if (!this.ctx || !this.sfxBus) return;
    const t = opts.at ?? this.ctx.currentTime;
    const dur = opts.dur ?? 0.15;
    const osc = this.ctx.createOscillator();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(opts.vol ?? 0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(opts.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(at: number, dur: number, cutoff: number, vol = 0.5) {
    if (!this.ctx || !this.sfxBus) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(this.sfxBus);
    src.start(at);
  }

  private get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---- SFX ----

  click() { this.ensure(); this.tone(660, { dur: 0.06, type: 'square', vol: 0.25 }); }
  tick() { this.ensure(); this.tone(1200, { dur: 0.05, type: 'square', vol: 0.18 }); }
  powerup() {
    this.ensure();
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.tone(f, { at: this.now + i * 0.06, dur: 0.14, type: 'square', vol: 0.3 }));
  }
  hop() { this.ensure(); this.tone(280, { dur: 0.12, type: 'square', vol: 0.3, slideTo: 620 }); }
  collect() { this.ensure(); this.tone(880, { dur: 0.12, type: 'sine', vol: 0.5, slideTo: 1568 }); }
  nest() {
    this.ensure();
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, { at: this.now + i * 0.09, dur: 0.18, type: 'triangle', vol: 0.5 }));
  }
  splash() {
    this.ensure();
    this.noise(this.now, 0.45, 700, 0.6);
    this.tone(380, { dur: 0.35, type: 'sine', vol: 0.5, slideTo: 90 });
  }
  hurt() { this.ensure(); this.tone(220, { dur: 0.3, type: 'sawtooth', vol: 0.45, slideTo: 55 }); }
  win() {
    this.ensure();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, { at: this.now + i * 0.12, dur: 0.22, type: 'triangle', vol: 0.5 }));
    this.tone(1318.5, { at: this.now + 0.5, dur: 0.45, type: 'triangle', vol: 0.5 });
  }
  lose() {
    this.ensure();
    [392, 329.63, 261.63, 196].forEach((f, i) => this.tone(f, { at: this.now + i * 0.16, dur: 0.2, type: 'square', vol: 0.3 }));
  }

  // ---- music sequencer ----

  playMusic(style: MusicStyle) {
    this.ensure();
    this.stopMusic();
    this.style = style;
    this.step = 0;
    if (this.ctx) this.nextAt = this.ctx.currentTime + 0.06;
    this.seqTimer = window.setInterval(() => this.schedule(), 80);
  }

  stopMusic() {
    if (this.seqTimer) {
      window.clearInterval(this.seqTimer);
      this.seqTimer = 0;
    }
  }

  private schedule() {
    if (!this.ctx || !this.musicBus) return;
    const { bpm, lead, bass } = PATTERNS[this.style];
    const stepDur = 60 / bpm / 2; // 8th notes
    while (this.nextAt < this.ctx.currentTime + 0.25) {
      const i = this.step % 16;
      if (lead[i]) this.tone(mtof(lead[i]), { at: this.nextAt, dur: stepDur * 0.9, type: 'triangle', vol: 0.6, bus: this.musicBus });
      if (bass[i]) this.tone(mtof(bass[i]), { at: this.nextAt, dur: stepDur * 1.6, type: 'square', vol: 0.25, bus: this.musicBus });
      // soft hats on off-beats
      if (i % 2 === 1) this.noise(this.nextAt, 0.03, 6000, 0.06);
      this.nextAt += stepDur;
      this.step += 1;
    }
  }
}

// One shared engine so both games (and the mute button) stay in sync.
export const sound = new SoundEngine();
