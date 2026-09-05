// Cross The Swamp — Lenny's Frogger-style game.
// Grid hop: start bank → land (dodge snakes & crabs) → middle bank →
// water (ride logs, avoid crocs) → far bank to score.
// Built with plain Three.js primitives + three/addons so it's easy to tweak together.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sound } from './sound';

export type AnimalId = 'chicken' | 'duck' | 'swan';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Animal {
  id: AnimalId;
  name: string;
  emoji: string;
  color: number;
  lives: number;
  time: number;
  bonus: number;
  blurb: string;
}

export const ANIMALS: Animal[] = [
  { id: 'chicken', name: 'Chicken', emoji: '🐔', color: 0xffffff, lives: 3, time: 90, bonus: 25, blurb: '+25 bonus per crossing' },
  { id: 'duck', name: 'Duck', emoji: '🦆', color: 0xffd23f, lives: 3, time: 120, bonus: 0, blurb: '+30s swim time' },
  { id: 'swan', name: 'Swan', emoji: '🦢', color: 0xf8faff, lives: 4, time: 90, bonus: 0, blurb: '+1 extra life' },
];

export interface SwampCallbacks {
  onScore?: (score: number, best: number) => void;
  onLives?: (lives: number) => void;
  onTime?: (timeLeft: number) => void;
  onCrossings?: (n: number) => void;
  onToast?: (msg: string) => void;
  onEnd?: (result: { score: number; best: number; won: boolean; reason: string }) => void;
}

const BEST_KEY = 'lenny-swamp-best';
// Goal columns (lily-pad nests). Each can be claimed once — win by filling all three.
const PAD_COLS = [1, 4, 7];

const COLS = 9;
const ROWS = 11;
const CELL = 2;
const HALF_W = (COLS * CELL) / 2;

type LaneKind = 'goal' | 'water' | 'safe' | 'land';

interface LaneDef {
  kind: LaneKind;
  dir: 1 | -1;
  speed: number;
  count: number;
}

// row 0 = far bank (top), row 10 = start (bottom)
const LANES: LaneDef[] = [
  { kind: 'goal', dir: 1, speed: 0, count: 0 }, // 0
  { kind: 'water', dir: 1, speed: 2.6, count: 3 }, // 1 logs
  { kind: 'water', dir: -1, speed: 3.4, count: 2 }, // 2 logs + croc
  { kind: 'water', dir: 1, speed: 3.0, count: 3 }, // 3 logs
  { kind: 'water', dir: -1, speed: 2.2, count: 2 }, // 4 logs + croc
  { kind: 'safe', dir: 1, speed: 0, count: 0 }, // 5 middle bank
  { kind: 'land', dir: 1, speed: 3.0, count: 3 }, // 6 crabs
  { kind: 'land', dir: -1, speed: 4.0, count: 2 }, // 7 snakes
  { kind: 'land', dir: 1, speed: 5.0, count: 3 }, // 8 crabs (fast)
  { kind: 'land', dir: -1, speed: 3.0, count: 2 }, // 9 snakes
  { kind: 'safe', dir: 1, speed: 0, count: 0 }, // 10 start
];

interface Mover {
  row: number;
  x: number;
  speed: number;
  mesh: THREE.Group;
  isLog: boolean;
  isCroc: boolean;
  halfLen: number;
}

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  maxLife: number;
}

function emojiSprite(emoji: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '96px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(1.4, 1.4, 1);
  return s;
}

// --- procedural lane textures (no image files needed) ---

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d')!, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, s: number, n: number, colors: string[], size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.fillRect(Math.random() * s, Math.random() * s, size, size);
  }
}

export class SwampGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private player!: THREE.Group;
  private gear!: THREE.Group;
  private face!: THREE.Sprite;
  private beacon!: THREE.Group;
  private movers: Mover[] = [];
  private bursts: Burst[] = [];
  private waterTex: { tex: THREE.Texture; dir: number }[] = [];
  private raf = 0;
  private running = false;
  private last = 0;
  private col = 4;
  private row = 10;
  private px = 0;
  private hopT = 1; // 1 = settled, 0..1 = hopping
  private hopFrom = new THREE.Vector3();
  private hopTo = new THREE.Vector3();
  private lastHopAt = 0;
  private moved = false;
  private score = 0;
  private lives = 3;
  private timeLeft = 90;
  private crossings = 0;
  private taken = [false, false, false];
  private nestMarkers: THREE.Group[] = [];
  private deadPause = 0;
  animal: Animal = ANIMALS[0];
  best = 0;

  constructor(
    private wrap: HTMLElement,
    private cb: SwampCallbacks = {},
  ) {
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.wrap.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 300);

    this.scene.background = new THREE.Color(0x0b1020);
    this.scene.fog = new THREE.Fog(0x0b1020, 45, 120);
    this.scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x2f5f3a, 0.85));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
    sun.position.set(8, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.far = 60;
    this.scene.add(sun);
    // soft green glow over the goal bank
    const goalGlow = new THREE.PointLight(0xa3e635, 20, 16, 2);
    goalGlow.position.set(0, 3, this.rowZReal(0));
    this.scene.add(goalGlow);

    this.buildBoard();
    this.buildPlayer();
    this.buildBeacon();
    this.spawnMovers();
    this.resetPos();

    this.frameCamera();
    window.addEventListener('resize', () => this.frameCamera());
    window.addEventListener('keydown', (e) => {
      if (!this.running || this.deadPause > 0) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') this.hop('up');
      else if (k === 'arrowdown' || k === 's') this.hop('down');
      else if (k === 'arrowleft' || k === 'a') this.hop('left');
      else if (k === 'arrowright' || k === 'd') this.hop('right');
    });

    this.loop(performance.now());
  }

  setAnimal(id: AnimalId) {
    const found = ANIMALS.find((a) => a.id === id);
    if (found) this.animal = found;
    if (this.face) {
      const fresh = emojiSprite(this.animal.emoji);
      this.face.material.map = fresh.material.map;
      this.face.material.needsUpdate = true;
    }
    const body = this.player?.getObjectByName('body') as THREE.Mesh | undefined;
    if (body) (body.material as THREE.MeshStandardMaterial).color.set(this.animal.color);
    if (this.gear) this.buildGear();
  }

  start() {
    this.score = 0;
    this.lives = this.animal.lives;
    this.timeLeft = this.animal.time;
    this.crossings = 0;
    this.taken = [false, false, false];
    this.clearNests();
    this.deadPause = 0;
    this.resetPos();
    this.spawnMovers();
    sound.ensure();
    sound.playMusic('swamp');
    this.running = true;
    this.last = performance.now();
    this.cb.onScore?.(0, this.best);
    this.cb.onLives?.(this.lives);
    this.cb.onTime?.(this.timeLeft);
    this.cb.onCrossings?.(0);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  hop(dir: Dir) {
    if (!this.running || this.deadPause > 0) return;
    const now = performance.now();
    if (now - this.lastHopAt < 130 || this.hopT < 1) return; // debounce + no mid-hop turns
    this.lastHopAt = now;
    this.moved = true;
    sound.hop();
    this.beacon.visible = false;
    if (dir === 'up') this.row = Math.max(0, this.row - 1);
    else if (dir === 'down') this.row = Math.min(ROWS - 1, this.row + 1);
    else if (dir === 'left') this.col = Math.max(0, this.col - 1);
    else this.col = Math.min(COLS - 1, this.col + 1);
    this.px = THREE.MathUtils.clamp(this.px, -HALF_W + CELL / 2, HALF_W - CELL / 2);
    if (dir === 'left') this.px = Math.max(-HALF_W + CELL / 2, this.px - CELL);
    if (dir === 'right') this.px = Math.min(HALF_W - CELL / 2, this.px + CELL);
    const target = this.cellCenter(this.col, this.row);
    target.x = this.px; // keep continuous x (matters when leaving a log)
    this.hopFrom.copy(this.player.position);
    this.hopTo.copy(target);
    this.hopT = 0;
  }

  // ---- coordinates ----

  private rowZReal(rowIndexFromTop: number) {
    // row 0 (goal) far = -Z, row 10 (start) near = +Z
    const topZ = -((ROWS - 1) * CELL) / 2;
    return topZ + rowIndexFromTop * CELL;
  }

  private colX(col: number) {
    return -HALF_W + CELL / 2 + col * CELL;
  }

  private cellCenter(col: number, row: number) {
    return new THREE.Vector3(this.px, 0.55, this.rowZReal(row));
  }

  // Fit the whole board (esp. the spawn row!) on any screen size.
  // Verified with a projection script: worst corner stays inside NDC 0.84
  // from 390px phones to desktop.
  private frameCamera() {
    const w = this.wrap.clientWidth || 800;
    const h = 560;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const dist = 14 / Math.tan(Math.min(halfV, halfH));
    const el = THREE.MathUtils.degToRad(57);
    this.camera.position.set(0, Math.sin(el) * dist, Math.cos(el) * dist);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }

  // ---- world building ----

  private laneTexture(kind: LaneKind, dir: number): THREE.Texture {
    let tex: THREE.CanvasTexture;
    if (kind === 'water') {
      tex = canvasTexture((ctx, s) => {
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(0, 0, s, s);
        ctx.strokeStyle = 'rgba(147,197,253,0.55)';
        ctx.lineWidth = 3;
        for (let y = 8; y < s; y += 22) {
          ctx.beginPath();
          for (let x = 0; x <= s; x += 8) ctx.lineTo(x, y + Math.sin(x / 14 + y) * 4);
          ctx.stroke();
        }
      });
      tex.repeat.set(3, 1);
      this.waterTex.push({ tex, dir });
    } else if (kind === 'land') {
      tex = canvasTexture((ctx, s) => {
        ctx.fillStyle = '#37b24d';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 260, ['#2b9348', '#40c057', '#2f9e44', '#69db7c'], 3);
      });
      tex.repeat.set(5, 1);
    } else if (kind === 'goal') {
      tex = canvasTexture((ctx, s) => {
        ctx.fillStyle = '#74b816';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 200, ['#5c940d', '#82c91e', '#a9e34b'], 3);
      });
      tex.repeat.set(5, 1);
    } else {
      tex = canvasTexture((ctx, s) => {
        ctx.fillStyle = '#c2a36b';
        ctx.fillRect(0, 0, s, s);
        speckle(ctx, s, 220, ['#b08d57', '#d0b183', '#a17f4b'], 2);
      });
      tex.repeat.set(5, 1);
    }
    return tex;
  }

  private buildBoard() {
    for (let r = 0; r < ROWS; r++) {
      const def = LANES[r];
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(COLS * CELL + 1.5, 0.4, CELL),
        new THREE.MeshStandardMaterial({ map: this.laneTexture(def.kind, def.dir), roughness: 0.95 }),
      );
      tile.position.set(0, -0.2, this.rowZReal(r));
      tile.receiveShadow = true;
      this.scene.add(tile);
    }
    // lily pads + flowers on the goal bank
    const padMat = new THREE.MeshStandardMaterial({ color: 0x2b8a3e, roughness: 0.7, emissive: 0x0f3d1a, emissiveIntensity: 0.5 });
    for (const c of [1, 4, 7]) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.15, 20), padMat);
      pad.position.set(this.colX(c), 0.08, this.rowZReal(0));
      pad.receiveShadow = true;
      this.scene.add(pad);
      const flower = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.22, 0),
        new THREE.MeshStandardMaterial({ color: c === 4 ? 0xffd43b : 0xf783ac, roughness: 0.5, emissive: 0x552200, emissiveIntensity: 0.3 }),
      );
      flower.position.set(this.colX(c) + 0.5, 0.3, this.rowZReal(0) + 0.3);
      this.scene.add(flower);
    }
    // reeds + cattails along both safe banks
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x2f9e44, roughness: 0.8 });
    const catMat = new THREE.MeshStandardMaterial({ color: 0x744522, roughness: 0.9 });
    for (const r of [5, 10]) {
      for (let i = 0; i < 8; i++) {
        const x = -HALF_W + 1 + i * 2.3 + (Math.random() * 0.8 - 0.4);
        const z = this.rowZReal(r) + (r === 10 ? CELL / 2 - 0.3 : -CELL / 2 + 0.3);
        const reed = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.1 + Math.random() * 0.5, 6), reedMat);
        reed.position.set(x, 0.5, z);
        reed.castShadow = true;
        this.scene.add(reed);
        if (i % 3 === 0) {
          const cat = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.4, 4, 8), catMat);
          cat.position.set(x + 0.35, 0.75, z);
          cat.castShadow = true;
          this.scene.add(cat);
        }
      }
    }
  }

  private buildPlayer() {
    this.player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 18),
      new THREE.MeshStandardMaterial({ color: this.animal.color, roughness: 0.45 }),
    );
    body.name = 'body';
    body.position.y = 0.1;
    body.castShadow = true;
    this.player.add(body);
    this.gear = new THREE.Group();
    this.player.add(this.gear);
    this.buildGear();
    this.face = emojiSprite(this.animal.emoji);
    this.face.position.set(0, 1.45, 0);
    this.player.add(this.face);
    // soft blob shadow so the hop height reads clearly
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    blob.name = 'blob';
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = -0.45;
    this.player.add(blob);
    this.scene.add(this.player);
  }

  // Per-animal accessories — the fun bit to extend with Lenny!
  private buildGear() {
    this.gear.clear();
    const orange = new THREE.MeshStandardMaterial({ color: 0xff922b, roughness: 0.6 });
    if (this.animal.id === 'chicken') {
      const comb = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.35, 0.4, 2, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xfa5252, roughness: 0.6 }));
      comb.position.set(0, 0.7, 0.05);
      this.gear.add(comb);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.35, 10), orange);
      beak.rotation.x = -Math.PI / 2;
      beak.position.set(0, 0.1, -0.62);
      this.gear.add(beak);
    } else if (this.animal.id === 'duck') {
      const beak = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.14, 0.4, 2, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xffa94d, roughness: 0.6 }));
      beak.position.set(0, 0.08, -0.6);
      this.gear.add(beak);
    } else {
      // swan: long curved neck + head + black knob
      const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
      const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.7, 4, 10), white);
      neck.position.set(0, 0.55, -0.42);
      neck.rotation.x = 0.25;
      this.gear.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), white);
      head.position.set(0, 1.0, -0.52);
      this.gear.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 10), orange);
      beak.rotation.x = -Math.PI / 2;
      beak.position.set(0, 0.98, -0.75);
      this.gear.add(beak);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x111111 }));
      knob.position.set(0, 1.1, -0.6);
      this.gear.add(knob);
    }
    this.gear.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  }

  // Pulsing "YOU START HERE" marker so the spawn is impossible to miss
  private buildBeacon() {
    this.beacon = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.95, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.name = 'ring';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.beacon.add(ring);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.6, 4),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x664400, emissiveIntensity: 0.6 }),
    );
    arrow.name = 'arrow';
    arrow.rotation.x = Math.PI; // point down
    arrow.position.y = 2.2;
    this.beacon.add(arrow);
    this.scene.add(this.beacon);
  }

  private eyes(parent: THREE.Group, y: number, zFront: number, spread: number, size = 0.13) {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.3 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(size, 10, 8), white);
      eye.position.set(s * spread, y, zFront);
      parent.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(size * 0.5, 8, 6), black);
      pupil.position.set(s * spread, y, zFront - size * 0.8);
      parent.add(pupil);
    }
  }

  private shadowify(g: THREE.Group) {
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    return g;
  }

  private makeLog(): THREE.Group {
    const g = new THREE.Group();
    const len = [4, 5, 6][Math.floor(Math.random() * 3)];
    const bark = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 });
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, len, 14), bark);
    log.rotation.z = Math.PI / 2;
    g.add(log);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1a, roughness: 0.9 });
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.18, 14), capMat);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = s * (len / 2 - 0.05);
      g.add(cap);
    }
    // mossy top stripe so logs read as "safe"
    const moss = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.1, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x69db7c, roughness: 0.9 }));
    moss.position.y = 0.42;
    g.add(moss);
    return this.shadowify(g);
  }

  private makeCrab(): THREE.Group {
    const g = new THREE.Group();
    const red = new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.55 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.55, 0.8, 3, 0.2), red);
    body.position.y = 0.1;
    g.add(body);
    for (const s of [-1, 1]) {
      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), red);
      claw.position.set(s * 0.7, 0.15, -0.35);
      g.add(claw);
      for (const l of [-1, 0, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 6), red);
        leg.position.set(s * 0.55, -0.05, l * 0.28);
        leg.rotation.z = s * 0.7;
        g.add(leg);
      }
    }
    this.eyes(g, 0.42, -0.35, 0.22, 0.14);
    return this.shadowify(g);
  }

  private makeSnake(): THREE.Group {
    const g = new THREE.Group();
    const green = new THREE.MeshStandardMaterial({ color: 0x40c057, roughness: 0.55 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.5, 6, 12), green);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    // darker stripes
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x2b8a3e, roughness: 0.6 });
    for (const x of [-0.4, 0.1, 0.6]) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.06, 8, 16), stripeMat);
      stripe.rotation.y = Math.PI / 2;
      stripe.position.x = x;
      g.add(stripe);
    }
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), green);
    head.position.set(1.0, 0.1, 0);
    g.add(head);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xff0000 }));
    tongue.position.set(1.5, 0.05, 0);
    g.add(tongue);
    this.eyes(g, 0.32, 0.85, 0.18, 0.11);
    return this.shadowify(g);
  }

  private makeCroc(): THREE.Group {
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0x2f6b2f, roughness: 0.8 });
    const belly = new THREE.MeshStandardMaterial({ color: 0x94d82d, roughness: 0.8 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.55, 0.95, 3, 0.2), skin);
    g.add(body);
    const snout = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.32, 0.7, 2, 0.1), skin);
    snout.position.set(1.65, 0.02, 0);
    g.add(snout);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.6), belly);
    jaw.position.set(1.65, -0.2, 0);
    g.add(jaw);
    // back spikes
    for (let i = -1; i <= 1; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 6), skin);
      spike.position.set(i * 0.8, 0.4, 0);
      g.add(spike);
    }
    this.eyes(g, 0.42, 0.75, 0.28, 0.15);
    return this.shadowify(g);
  }

  private spawnMovers() {
    for (const m of this.movers) this.scene.remove(m.mesh);
    this.movers = [];
    const levelBoost = 1 + this.crossings * 0.08;
    const limit = HALF_W + 3;
    for (let r = 0; r < ROWS; r++) {
      const def = LANES[r];
      if (def.kind !== 'land' && def.kind !== 'water') continue;
      const isWater = def.kind === 'water';
      const hasCroc = isWater && (r === 2 || r === 4);
      // Slot every mover evenly across the wrap interval AND give the whole
      // lane one shared speed — relative positions are frozen, so a croc can
      // never drift into a log (and nothing spawns overlapped).
      const total = def.count + (hasCroc ? 1 : 0);
      for (let i = 0; i < total; i++) {
        const isCroc = hasCroc && i === 0;
        const isLog = isWater && !isCroc;
        const isLandCrabRow = r === 6 || r === 8;
        const mesh = isCroc ? this.makeCroc() : isLog ? this.makeLog() : isLandCrabRow ? this.makeCrab() : this.makeSnake();
        const jitter = Math.random() * 1.6 - 0.8;
        const x = -limit + ((i + 0.5) / total) * limit * 2 + jitter;
        mesh.position.set(x, isWater ? 0.35 : 0.45, this.rowZReal(r));
        this.scene.add(mesh);
        this.movers.push({
          row: r, x, speed: def.dir * def.speed * levelBoost, mesh, isLog, isCroc,
          halfLen: isCroc ? 1.7 : isWater ? 3.0 : 0.9,
        });
      }
    }
  }

  private burst(at: THREE.Vector3, color: number) {
    const n = 26;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const up = 2.5 + Math.random() * 3.5;
      const out = 1 + Math.random() * 3;
      vel.set([Math.cos(a) * out, up, Math.sin(a) * out], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size: 0.28, transparent: true, opacity: 1 });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.bursts.push({ points, vel, life: 0.8, maxLife: 0.8 });
  }

  // Nest marker left on a claimed lily pad: twig ring + egg + animal flag.
  private occupyPad(i: number) {
    const g = new THREE.Group();
    const nest = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.18, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 }));
    nest.rotation.x = Math.PI / 2;
    g.add(nest);
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xfff9db, roughness: 0.4 }));
    egg.position.y = 0.15;
    egg.scale.y = 1.25;
    g.add(egg);
    const flag = emojiSprite(this.animal.emoji);
    flag.scale.set(1.0, 1.0, 1);
    flag.position.y = 1.1;
    g.add(flag);
    g.position.set(this.colX(PAD_COLS[i]), 0.15, this.rowZReal(0));
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    this.scene.add(g);
    this.nestMarkers.push(g);
  }

  private clearNests() {
    for (const g of this.nestMarkers) this.scene.remove(g);
    this.nestMarkers = [];
  }

  private resetPos() {
    this.col = 4;
    this.row = ROWS - 1;
    this.px = this.colX(4);
    this.hopT = 1;
    this.moved = false;
    this.player.position.set(this.px, 0.55, this.rowZReal(this.row));
    this.hopFrom.copy(this.player.position);
    this.hopTo.copy(this.player.position);
    this.beacon.position.set(this.px, 0, this.rowZReal(this.row));
    this.beacon.visible = true;
  }

  private die(reason: string) {
    const onWater = LANES[this.row]?.kind === 'water';
    this.burst(this.player.position.clone(), onWater ? 0x74c0fc : 0xffa94d);
    if (onWater) sound.splash(); else sound.hurt();
    this.lives -= 1;
    this.cb.onLives?.(this.lives);
    if (this.lives <= 0) {
      this.finish(false, reason);
      return;
    }
    this.deadPause = 1.0;
    this.resetPos();
  }

  private finish(won: boolean, reason: string) {
    this.running = false;
    sound.stopMusic();
    if (won) sound.win(); else sound.lose();
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    this.cb.onScore?.(this.score, this.best);
    this.cb.onEnd?.({ score: this.score, best: this.best, won, reason });
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;

    // move obstacles / logs always (lively background)
    for (const m of this.movers) {
      m.x += m.speed * dt;
      const limit = HALF_W + 3;
      if (m.x > limit) m.x = -limit;
      if (m.x < -limit) m.x = limit;
      m.mesh.position.x = m.x;
      if (!m.isLog) m.mesh.position.y = 0.45 + Math.abs(Math.sin(now / 300 + m.x)) * 0.12;
    }
    // ripple the water
    for (const w of this.waterTex) w.tex.offset.x += dt * 0.04 * w.dir;

    // splash particles
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const p = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let j = 0; j < p.count; j++) {
        b.vel[j * 3 + 1] -= 9 * dt;
        p.setXYZ(j, p.getX(j) + b.vel[j * 3] * dt, Math.max(0.05, p.getY(j) + b.vel[j * 3 + 1] * dt), p.getZ(j) + b.vel[j * 3 + 2] * dt);
      }
      p.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / b.maxLife);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }

    // beacon pulse (until first hop)
    if (this.beacon.visible) {
      const t = now / 1000;
      const ring = this.beacon.getObjectByName('ring')!;
      const arrow = this.beacon.getObjectByName('arrow')!;
      ring.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
      arrow.position.y = 2.2 + Math.sin(t * 3) * 0.3;
    }

    // hop animation
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / 0.14);
      this.player.position.lerpVectors(this.hopFrom, this.hopTo, this.hopT);
      this.player.position.y = 0.55 + Math.sin(this.hopT * Math.PI) * 0.7;
    }

    if (this.running) {
      if (this.deadPause > 0) {
        this.deadPause -= dt;
      } else {
        this.timeLeft -= dt;
        this.cb.onTime?.(Math.max(0, this.timeLeft));
        if (this.timeLeft <= 0) {
          this.finish(false, 'Time up!');
        } else {
          const def = LANES[this.row];
          const settled = this.hopT >= 1;

          if (settled && def.kind === 'land') {
            for (const m of this.movers) {
              if (m.row !== this.row || m.isLog) continue;
              if (Math.abs(m.x - this.player.position.x) < 1.0) {
                this.die(this.row === 7 || this.row === 9 ? 'Snake bite!' : 'Crab pinch!');
                break;
              }
            }
          }

          if (settled && def.kind === 'water') {
            let onLog: Mover | null = null;
            for (const m of this.movers) {
              if (m.row !== this.row) continue;
              if (m.isCroc && Math.abs(m.x - this.player.position.x) < 1.7) {
                this.die('Crocodile!');
                break;
              }
              if (m.isLog && Math.abs(m.x - this.player.position.x) < m.halfLen) onLog = m;
            }
            if (this.running && this.deadPause <= 0 && LANES[this.row]?.kind === 'water') {
              if (!onLog) {
                this.die('Splash! Missed the log.');
              } else {
                // ride the log
                this.px += onLog.speed * dt;
                this.player.position.x = this.px;
                this.hopTo.x = this.px;
                this.hopFrom.x = this.px;
                if (this.px < -HALF_W - 0.5 || this.px > HALF_W + 0.5) {
                  this.die('Swept away!');
                } else {
                  this.col = Math.max(0, Math.min(COLS - 1, Math.round((this.px + HALF_W - CELL / 2) / CELL)));
                }
              }
            }
          }

          if (settled && this.row === 0 && this.running && this.deadPause <= 0) {
            // snap to the column grid for a tidy landing
            this.px = this.colX(this.col);
            this.player.position.x = this.px;
            this.hopTo.x = this.px;
            this.hopFrom.x = this.px;
            const padIdx = PAD_COLS.indexOf(this.col);
            if (padIdx >= 0 && !this.taken[padIdx]) {
              // free nest — claim it
              this.taken[padIdx] = true;
              this.crossings += 1;
              this.score += 100 + this.animal.bonus;
              this.occupyPad(padIdx);
              sound.nest();
              this.burst(this.player.position.clone(), 0xa3e635);
              this.cb.onScore?.(this.score, Math.max(this.best, this.score));
              this.cb.onCrossings?.(this.crossings);
              if (this.crossings >= PAD_COLS.length) {
                this.finish(true, 'All nests filled!');
              } else {
                this.cb.onToast?.(`Nest claimed! ${PAD_COLS.length - this.crossings} to go.`);
                this.spawnMovers(); // speed up a touch
                this.resetPos();
              }
            } else {
              // taken nest or bare bank: no point, no life lost — next turn must use another spot
              this.cb.onToast?.(padIdx >= 0 ? 'That nest is taken — try another one!' : 'Missed the nests — aim for a lily pad!');
              this.resetPos();
            }
          }
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
