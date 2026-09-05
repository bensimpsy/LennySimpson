// Star Collector — Lenny's first Three.js game.
// ENDLESS DRIFT mode: the rocket never stops gliding — steer with arrows/WASD,
// grab stars, bounce off the rim. One asteroid hit ends the run. Every 15s it
// gets faster and another rock joins. How long can you survive?
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sound } from './sound';

export interface GameCallbacks {
  onScore?: (score: number, best: number) => void;
  onLives?: (lives: number) => void;
  onTime?: (timeLeft: number) => void;
  onLevel?: (level: number) => void;
  onBoost?: (secondsLeft: number) => void;
  onEnd?: (result: { score: number; best: number; won: boolean }) => void;
}

type Dir = 'up' | 'down' | 'left' | 'right';

const BEST_KEY = 'lenny-star-collector-best';

interface Star {
  mesh: THREE.Group;
  value: number;
}

function radialGlow(color: string, size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color + 'aa');
  g.addColorStop(1, color + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textSprite(text: string, color = '#ffd23f'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '900 64px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(2.6, 1.3, 1);
  return s;
}

// Simple ring-buffer particle pool (additive points, fade by darkening).
class ParticlePool {
  private cursor = 0;
  private pos: Float32Array;
  private colAttr: Float32Array;
  private base: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  readonly points: THREE.Points;

  constructor(scene: THREE.Scene, private max = 700) {
    this.pos = new Float32Array(max * 3).fill(-999);
    this.colAttr = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colAttr, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.32, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, life: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.life[i] = this.maxLife[i] = life;
  }

  burst(p: THREE.Vector3, color: THREE.Color, n = 24, speed = 5, life = 0.7) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(p, new THREE.Vector3(Math.cos(a) * Math.cos(e) * s, Math.abs(Math.sin(e)) * s + 1.5, Math.sin(a) * Math.cos(e) * s), color, life * (0.7 + Math.random() * 0.6));
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999;
        this.colAttr[i * 3] = this.colAttr[i * 3 + 1] = this.colAttr[i * 3 + 2] = 0;
        continue;
      }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.maxLife[i];
      this.colAttr[i * 3] = this.base[i * 3] * f;
      this.colAttr[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.colAttr[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class StarCollector {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private camBase = new THREE.Vector3(0, 14, 12);
  private ship!: THREE.Group;
  private flame!: THREE.Mesh;
  private engineTip = new THREE.Object3D();
  private faceAngle = 0;
  private stars: Star[] = [];
  private rocks: THREE.Mesh[] = [];
  private particles!: ParticlePool;
  private popups: { sprite: THREE.Sprite; life: number }[] = [];
  private keys = new Set<string>();
  private touch = new Set<Dir>();
  private raf = 0;
  private running = false;
  private score = 0;
  private heading = { x: 0, z: -1 };
  private shipSpeed = 6.5;
  private elapsed = 0;
  private level = 1;
  private launched = false;
  private boostLeft = 0;
  private lastBoostSecond = -1;
  private pkg: { mesh: THREE.Group; life: number } | null = null;
  private pkgTimer = 8;
  private trailAt = 0;
  private shake = 0;
  private last = 0;
  best = 0;

  constructor(
    private wrap: HTMLElement,
    private cb: GameCallbacks = {},
  ) {
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.wrap.prepend(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
    this.camera.position.copy(this.camBase);
    this.camera.lookAt(0, 0, 0);

    this.scene.background = new THREE.Color(0x050816);
    this.scene.fog = new THREE.Fog(0x050816, 40, 140);
    this.scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x0a0f2a, 0.7));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.8);
    sun.position.set(6, 14, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.far = 60;
    this.scene.add(sun);
    // cool blue rim light from behind
    const rim = new THREE.DirectionalLight(0x5eead4, 0.8);
    rim.position.set(-8, 6, -10);
    this.scene.add(rim);

    this.buildSky();
    this.buildArena();
    this.buildShip();
    this.particles = new ParticlePool(this.scene);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    this.spawnAll();
    this.loop(performance.now()); // render idle scene behind overlay
  }

  setTouch(dir: Dir, on: boolean) {
    if (on) this.touch.add(dir);
    else this.touch.delete(dir);
  }

  start() {
    this.score = 0;
    this.heading = { x: 0, z: -1 };
    this.shipSpeed = 6.5;
    this.elapsed = 0;
    this.level = 1;
    this.shake = 0;
    this.launched = false;
    this.boostLeft = 0;
    this.lastBoostSecond = -1;
    this.pkgTimer = 8;
    if (this.pkg) { this.scene.remove(this.pkg.mesh); this.pkg = null; }
    this.cb.onScore?.(0, this.best);
    this.cb.onLevel?.(1);
    this.cb.onBoost?.(0);
    this.ship.position.set(0, 0.6, 0);
    this.spawnAll();
    sound.ensure();
    sound.playMusic('space');
    this.running = true;
    this.last = performance.now();
  }

  stop() {
    this.running = false;
    sound.stopMusic();
    cancelAnimationFrame(this.raf);
  }

  // ---- world building ----

  private buildSky() {
    // starfield (fog off so distant stars stay bright)
    const mkStars = (n: number, rMin: number, rMax: number, size: number, color: number) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = rMin + Math.random() * (rMax - rMin);
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(Math.random() * 1.6 - 0.6); // bias upward
        pos.set([r * Math.sin(p) * Math.cos(t), Math.abs(r * Math.cos(p)) * 0.7 + 2, r * Math.sin(p) * Math.sin(t)], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ size, color, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.9 });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      this.scene.add(pts);
    };
    mkStars(420, 60, 160, 1.6, 0xffffff);
    mkStars(70, 60, 140, 2.6, 0x5eead4);
    mkStars(50, 60, 140, 2.6, 0xffd23f);
    // soft nebulae
    const neb = (color: string, x: number, y: number, z: number, s: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: radialGlow(color), transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      sp.position.set(x, y, z);
      sp.scale.set(s, s, 1);
      this.scene.add(sp);
    };
    neb('#7c3aed', -60, 30, -90, 70);
    neb('#0ea5e9', 65, 22, -80, 55);
    neb('#ec4899', 10, 45, -110, 80);
  }

  private arenaTexture(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0d1330';
    ctx.fillRect(0, 0, 512, 512);
    // subtle speckles
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = `rgba(148,163,255,${Math.random() * 0.12})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    // glowing grid
    ctx.strokeStyle = 'rgba(94,234,212,0.28)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    // center rings
    ctx.strokeStyle = 'rgba(255,210,63,0.35)';
    for (const r of [40, 90, 150]) {
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(256, 256, r, 0, Math.PI * 2); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildArena() {
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(12.5, 64),
      new THREE.MeshStandardMaterial({ map: this.arenaTexture(), roughness: 0.9, metalness: 0.1 }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    this.scene.add(disc);
    // glowing rim
    const rimRing = new THREE.Mesh(
      new THREE.TorusGeometry(12.5, 0.14, 12, 96),
      new THREE.MeshStandardMaterial({ color: 0x0b3b36, emissive: 0x5eead4, emissiveIntensity: 1.6 }),
    );
    rimRing.rotation.x = Math.PI / 2;
    rimRing.position.y = 0.05;
    this.scene.add(rimRing);
    // dark under-disc so the rim floats in space
    const under = new THREE.Mesh(
      new THREE.CylinderGeometry(12.6, 11.5, 1.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x070b1d, roughness: 1 }),
    );
    under.position.y = -0.65;
    this.scene.add(under);
  }

  private buildShip() {
    // Rocket faces -Z. Nose cone, capsule body, fins, glowing window, engine flame.
    const ship = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.35, metalness: 0.45 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.5, metalness: 0.2 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.0, 8, 20), hull);
    body.rotation.x = Math.PI / 2;
    ship.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.75, 20), accent);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -1.25;
    ship.add(nose);

    const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.07, 10, 24), accent);
    band.position.z = -0.35;
    ship.add(band);

    const window_ = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 14),
      new THREE.MeshStandardMaterial({ color: 0x0b2545, emissive: 0x9adcff, emissiveIntensity: 1.4, roughness: 0.2 }),
    );
    window_.position.set(0, 0.36, -0.25);
    ship.add(window_);

    // 3 fins
    for (const a of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]) {
      const fin = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.75, 0.55, 2, 0.05), accent);
      fin.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.72);
      fin.rotation.z = a - Math.PI / 2;
      ship.add(fin);
    }

    // engine glow + flame
    const engineLight = new THREE.PointLight(0xff9f43, 12, 8, 2);
    engineLight.position.z = 1.1;
    ship.add(engineLight);
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.95, 14),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9 }),
    );
    this.flame.rotation.x = Math.PI / 2; // point +Z (backward)
    this.flame.position.z = 1.35;
    ship.add(this.flame);
    const flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.55, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff3bf }),
    );
    flameCore.rotation.x = Math.PI / 2;
    flameCore.position.z = 1.25;
    ship.add(flameCore);
    this.engineTip.position.z = 1.6;
    ship.add(this.engineTip);

    ship.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    ship.position.set(0, 0.6, 0);
    this.scene.add(ship);
    this.ship = ship;
  }

  private makeStar(big: boolean): Star {
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(big ? 0.75 : 0.5),
      new THREE.MeshStandardMaterial({
        color: big ? 0xfff3bf : 0xffe45e,
        emissive: big ? 0xcc9a00 : 0xaa8800,
        emissiveIntensity: big ? 1.6 : 1.1,
        roughness: 0.25, metalness: 0.3,
      }),
    );
    core.castShadow = true;
    g.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlow(big ? '#fff3bf' : '#ffd23f'), transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const s = big ? 3.4 : 2.3;
    glow.scale.set(s, s, 1);
    g.add(glow);
    // keep clear of the launch pad so nothing is collected before liftoff
    for (let tries = 0; tries < 8; tries++) {
      g.position.set(THREE.MathUtils.randFloat(-9, 9), 0.6, THREE.MathUtils.randFloat(-9, 9));
      if (g.position.length() > 2.5) break;
    }
    return { mesh: g, value: big ? 30 : 10 };
  }

  private makeRock(): THREE.Mesh {
    // displaced icosahedron + flat shading = craggy asteroid.
    // Shared corners (rounded key) move together so faces stay watertight.
    const geo = new THREE.IcosahedronGeometry(THREE.MathUtils.randFloat(0.55, 0.95), 1);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const seen = new Map<string, number>();
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      let off = seen.get(key);
      if (off === undefined) {
        off = (Math.random() - 0.5) * 0.42;
        seen.set(key, off);
      }
      const l = v.length();
      v.multiplyScalar((l + off) / l);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0xc05746, roughness: 1, metalness: 0.05,
      emissive: 0x3d0a06, emissiveIntensity: 0.7, flatShading: true,
    }));
    m.castShadow = true;
    m.position.set(THREE.MathUtils.randFloat(-9, 9), 0.6, THREE.MathUtils.randFloat(-9, 9));
    m.userData.vel = new THREE.Vector3(THREE.MathUtils.randFloat(-2, 2), 0, THREE.MathUtils.randFloat(-2, 2));
    m.userData.spin = new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random() * 2);
    m.userData.phase = Math.random() * Math.PI * 2;
    return m;
  }

  private spawnAll() {
    for (const s of this.stars) this.scene.remove(s.mesh);
    for (const r of this.rocks) this.scene.remove(r);
    this.stars = Array.from({ length: 8 }, (_, i) => {
      const s = this.makeStar(i === 0); // first star is always a big +30 to teach it
      this.scene.add(s.mesh);
      return s;
    });
    this.rocks = Array.from({ length: 5 }, () => {
      const r = this.makeRock();
      this.scene.add(r);
      return r;
    });
  }

  private popup(text: string, at: THREE.Vector3, color = '#ffd23f') {
    const s = textSprite(text, color);
    s.position.copy(at).add(new THREE.Vector3(0, 1.2, 0));
    this.scene.add(s);
    this.popups.push({ sprite: s, life: 0.9 });
  }

  private resize() {
    const w = this.wrap.clientWidth || 800;
    const h = 520;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private steer(dt: number) {
    // The rocket never stops: held keys/buttons steer the heading, and it keeps
    // gliding that way until steered again. Bounces off the arena rim.
    const k = this.keys;
    let dx = 0;
    let dz = 0;
    if (k.has('a') || k.has('arrowleft') || this.touch.has('left')) dx -= 1;
    if (k.has('d') || k.has('arrowright') || this.touch.has('right')) dx += 1;
    if (k.has('w') || k.has('arrowup') || this.touch.has('up')) dz -= 1;
    if (k.has('s') || k.has('arrowdown') || this.touch.has('down')) dz += 1;
    if (dx || dz) {
      const len = Math.hypot(dx, dz);
      this.heading = { x: dx / len, z: dz / len };
      if (!this.launched) {
        this.launched = true;
        sound.collect();
        this.popup('🚀 LIFTOFF!', this.ship.position, '#5eead4');
      }
    }
    if (!this.launched) return; // parked on the pad until first steer
    const spd = this.shipSpeed * (this.boostLeft > 0 ? 1.6 : 1);
    const p = this.ship.position;
    p.x += this.heading.x * spd * dt;
    p.z += this.heading.z * spd * dt;
    if (p.x > 10) { p.x = 10; this.heading.x *= -1; }
    if (p.x < -10) { p.x = -10; this.heading.x *= -1; }
    if (p.z > 10) { p.z = 10; this.heading.z *= -1; }
    if (p.z < -10) { p.z = -10; this.heading.z *= -1; }
    // face travel direction (model forward is -Z)
    const target = Math.atan2(-this.heading.x, -this.heading.z);
    let d = target - this.faceAngle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.faceAngle += d * Math.min(1, dt * 12);
    this.ship.rotation.y = this.faceAngle;
  }

  private addRock() {
    if (this.rocks.length >= 12) return;
    const r = this.makeRock();
    (r.userData.vel as THREE.Vector3).multiplyScalar(1 + 0.12 * (this.level - 1));
    // spawn away from the ship so it never feels unfair
    for (let tries = 0; tries < 12; tries++) {
      r.position.set(THREE.MathUtils.randFloat(-9, 9), 0.6, THREE.MathUtils.randFloat(-9, 9));
      if (r.position.distanceTo(this.ship.position) > 6) break;
    }
    this.scene.add(r);
    this.rocks.push(r);
  }

  private makePackage(): THREE.Group {
    // supply crate: lime parcel, white ribbon, glow + lightning badge
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new RoundedBoxGeometry(0.75, 0.75, 0.75, 3, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x84cc16, emissive: 0x3f6212, emissiveIntensity: 0.9, roughness: 0.4 }),
    );
    g.add(box);
    const ribbonMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x999999, emissiveIntensity: 0.4 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.79, 0.2, 0.79), ribbonMat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.79, 0.79), ribbonMat));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlow('#a3e635'), transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(2.6, 2.6, 1);
    g.add(glow);
    const bolt = textSprite('⚡', '#ffffff');
    bolt.scale.set(1.3, 0.65, 1);
    bolt.position.y = 1.0;
    g.add(bolt);
    g.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });
    return g;
  }

  private spawnPackage() {
    const mesh = this.makePackage();
    for (let tries = 0; tries < 12; tries++) {
      mesh.position.set(THREE.MathUtils.randFloat(-9, 9), 0.6, THREE.MathUtils.randFloat(-9, 9));
      if (mesh.position.distanceTo(this.ship.position) > 5) break;
    }
    this.scene.add(mesh);
    this.pkg = { mesh, life: 12 };
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    const t = now / 1000;

    // ambient animation (always, for a lively backdrop)
    for (const s of this.stars) {
      s.mesh.rotation.y += dt * 2;
      s.mesh.position.y = 0.6 + Math.sin(t * 2.5 + s.mesh.position.x) * 0.15;
    }
    for (const r of this.rocks) {
      const spin = r.userData.spin as THREE.Vector3;
      r.rotation.x += spin.x * dt;
      r.rotation.y += spin.y * dt;
      r.rotation.z += spin.z * dt;
      r.position.y = 0.6 + Math.sin(t * 1.8 + (r.userData.phase as number)) * 0.12;
      if (this.running && this.launched) {
        r.position.addScaledVector(r.userData.vel as THREE.Vector3, dt);
        if (Math.abs(r.position.x) > 10) (r.userData.vel as THREE.Vector3).x *= -1;
        if (Math.abs(r.position.z) > 10) (r.userData.vel as THREE.Vector3).z *= -1;
      }
    }

    // flame flicker + hover bob
    const boosted = this.boostLeft > 0;
    const flameS = (1 + Math.sin(t * 31) * 0.15 + Math.random() * 0.06) * (boosted ? 1.5 : 1);
    this.flame.scale.set(flameS, flameS, 1 + Math.sin(t * 27) * 0.2);
    this.ship.position.y = 0.6 + Math.sin(t * 3) * 0.07;

    // engine trail while flying
    if (this.running && this.launched) {
      this.trailAt -= dt;
      if (this.trailAt <= 0) {
        this.trailAt = boosted ? 0.02 : 0.035;
        const tip = new THREE.Vector3();
        this.engineTip.getWorldPosition(tip);
        this.particles.spawn(tip,
          new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5),
          new THREE.Color(boosted ? 0xc084fc : Math.random() < 0.5 ? 0x5eead4 : 0xffb347), 0.4);
      }
    }
    this.particles.update(dt);

    // popups rise + fade
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.sprite.position.y += dt * 1.4;
      (p.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life / 0.9);
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.map?.dispose();
        p.sprite.material.dispose();
        this.popups.splice(i, 1);
      }
    }

    // camera: drift with the ship + impact shake
    const sh = this.shake > 0 ? this.shake : 0;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const desired = new THREE.Vector3(
      this.ship.position.x * 0.25 + (Math.random() - 0.5) * sh,
      14,
      12 + this.ship.position.z * 0.25 + (Math.random() - 0.5) * sh,
    );
    this.camera.position.lerp(desired, Math.min(1, dt * 3));
    this.camera.lookAt(this.ship.position.x * 0.4, 0, this.ship.position.z * 0.4);

    if (this.running) this.steer(dt);
    if (this.running && this.launched) {
      // difficulty ramps with survival time: faster ship, faster rocks, more rocks
      this.elapsed += dt;
      const newLevel = 1 + Math.floor(this.elapsed / 15);
      if (newLevel > this.level) {
        this.level = newLevel;
        this.shipSpeed = Math.min(11, 6.5 + 0.35 * (this.level - 1));
        for (const r of this.rocks) (r.userData.vel as THREE.Vector3).multiplyScalar(1.12);
        this.addRock();
        sound.nest();
        this.popup(`LEVEL ${this.level}!`, this.ship.position, '#5eead4');
        this.cb.onLevel?.(this.level);
      }
      // boost countdown
      if (this.boostLeft > 0) {
        this.boostLeft = Math.max(0, this.boostLeft - dt);
        const whole = Math.ceil(this.boostLeft);
        if (whole !== this.lastBoostSecond) {
          this.lastBoostSecond = whole;
          this.cb.onBoost?.(this.boostLeft);
        }
        if (this.boostLeft <= 0) this.cb.onBoost?.(0);
      }
      // supply crates: grab one for a 20s speed boost
      if (!this.pkg) {
        this.pkgTimer -= dt;
        if (this.pkgTimer <= 0) {
          this.pkgTimer = 12 + Math.random() * 6;
          this.spawnPackage();
        }
      } else {
        const pk = this.pkg;
        pk.life -= dt;
        pk.mesh.rotation.y += dt * 1.5;
        pk.mesh.position.y = 0.6 + Math.sin(t * 3) * 0.18;
        pk.mesh.visible = pk.life > 3 || Math.floor(t * 6) % 2 === 0; // blink when expiring
        if (pk.life <= 0) {
          this.scene.remove(pk.mesh);
          this.pkg = null;
        } else if (pk.mesh.position.distanceTo(this.ship.position) < 1.3) {
          this.scene.remove(pk.mesh);
          this.pkg = null;
          this.boostLeft = 20;
          this.lastBoostSecond = -1;
          sound.powerup();
          this.popup('⚡ BOOST 20s!', this.ship.position, '#c084fc');
          this.particles.burst(this.ship.position, new THREE.Color(0xc084fc), 36, 6, 0.8);
        }
      }

      // Collect stars
      for (const s of [...this.stars]) {
        if (s.mesh.position.distanceTo(this.ship.position) < (s.value > 10 ? 1.4 : 1.1)) {
          this.particles.burst(s.mesh.position, new THREE.Color(0xffd23f), s.value > 10 ? 40 : 22, 5, 0.7);
          this.popup(`+${s.value}`, s.mesh.position, s.value > 10 ? '#fff3bf' : '#ffd23f');
          this.scene.remove(s.mesh);
          this.stars.splice(this.stars.indexOf(s), 1);
          const fresh = this.makeStar(Math.random() < 0.15);
          this.scene.add(fresh.mesh);
          this.stars.push(fresh);
          this.score += s.value;
          sound.collect();
          this.cb.onScore?.(this.score, Math.max(this.best, this.score));
        }
      }
      // One hit ends the run — rocks keep coming, so keep moving!
      for (const r of this.rocks) {
        if (r.position.distanceTo(this.ship.position) < 1.2) {
          this.running = false;
          sound.stopMusic();
          sound.lose();
          this.shake = 0.9;
          this.particles.burst(this.ship.position, new THREE.Color(0xff6b6b), 60, 7, 1.1);
          const newBest = this.score > this.best && this.score > 0;
          if (newBest) {
            this.best = this.score;
            localStorage.setItem(BEST_KEY, String(this.best));
          }
          this.cb.onScore?.(this.score, this.best);
          this.cb.onEnd?.({ score: this.score, best: this.best, won: newBest });
          break;
        }
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
