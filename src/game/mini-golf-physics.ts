export type Point = { x: number; z: number };
export type Wall = Point & { width: number; depth: number; rotation?: number };
export type Bumper = Point & { radius: number; style: 'planter' | 'gate' };
export type Hole = { name: string; hint: string; tee: Point; cup: Point; walls: Wall[]; bumpers?: Bumper[]; ramp: boolean };
export const HOLES: Hole[] = [
  { name: 'The first putt', hint: 'A straight shot. Find the touch, not the top of the meter.', tee: { x: 0, z: 5.4 }, cup: { x: 0, z: -5 }, walls: [], ramp: false },
  { name: 'Around the bend', hint: 'Bank off a side rail to pass the diagonal divider and flower bed.', tee: { x: -.7, z: 5.4 }, cup: { x: -1, z: -5 }, walls: [{ x: -.65, z: .1, width: 4.3, depth: .24, rotation: -.4 }], bumpers: [{ x: 1.35, z: 2.8, radius: .62, style: 'planter' }], ramp: false },
  { name: 'The garden gate', hint: 'Thread the flower beds, climb the hill and roll through the arch.', tee: { x: .7, z: 5.4 }, cup: { x: -.7, z: -5.3 }, walls: [], bumpers: [
    { x: -1.3, z: 2.8, radius: .72, style: 'planter' },
    { x: 1.5, z: -.8, radius: .7, style: 'planter' },
    { x: -1.2, z: -2.7, radius: .26, style: 'gate' },
    { x: 1.2, z: -2.7, radius: .26, style: 'gate' },
  ], ramp: true },
];
export const BALL_RADIUS = .12;
export const COURSE_HALF_WIDTH = 3.4;
export const COURSE_HALF_LENGTH = 7;
export const CUP_RADIUS = .23;
export const CAPTURE_SPEED = 1.45;
export const PHYSICS_STEP = 1 / 240;
const FRICTION = .48;
const BOUNCE = .82;
export function surface(hole: Hole, z: number) {
  if (!hole.ramp || z <= -1.4 || z >= 2) return { height: 0, slope: 0 };
  return z >= .3 ? { height: (2 - z) * .3 / 1.7, slope: -.3 / 1.7 }
    : { height: (z + 1.4) * .3 / 1.7, slope: .3 / 1.7 };
}
export function swingPower(seconds: number) {
  const phase = (seconds % 3) / 1.5;
  return phase <= 1 ? phase : 2 - phase;
}
export class GolfBall {
  hole: Hole; x: number; z: number; vx = 0; vz = 0; time = 0; lipCooldown = 0;
  status: 'ready' | 'rolling' | 'missed' | 'holed' = 'ready';
  constructor(hole: Hole) { this.hole = hole; this.x = hole.tee.x; this.z = hole.tee.z; }
  hit(angle: number, power: number) {
    if (this.status !== 'ready') return;
    const speed = .2 + Math.max(0, Math.min(1, power)) * 6.3;
    this.vx = Math.sin(angle) * speed; this.vz = -Math.cos(angle) * speed;
    this.status = 'rolling';
  }
  step(dt: number): 'bounce' | 'lip' | 'missed' | 'holed' | undefined {
    if (this.status !== 'rolling') return;
    this.time += dt; this.lipCooldown = Math.max(0, this.lipCooldown - dt);
    const slope = surface(this.hole, this.z).slope;
    this.vz -= 9.81 * slope / (1 + slope * slope) * dt;
    const speed = Math.hypot(this.vx, this.vz);
    const friction = Math.max(0, 1 - FRICTION * dt / Math.max(speed, .0001));
    this.vx *= friction; this.vz *= friction;
    const previousX = this.x, previousZ = this.z;
    this.x += this.vx * dt; this.z += this.vz * dt;
    // Guard against invalid states or leaving the board (e.g. future course gaps).
    if (!Number.isFinite(this.x + this.z) || Math.abs(this.x) > 4 || Math.abs(this.z) > 7.6 || this.time > 24) {
      this.status = 'missed'; return 'missed';
    }
    let event: 'bounce' | 'lip' | undefined;
    const limitX = COURSE_HALF_WIDTH - BALL_RADIUS, limitZ = COURSE_HALF_LENGTH - BALL_RADIUS;
    if (Math.abs(this.x) > limitX) { this.x = Math.sign(this.x) * limitX; this.vx *= -BOUNCE; event = 'bounce'; }
    if (Math.abs(this.z) > limitZ) { this.z = Math.sign(this.z) * limitZ; this.vz *= -BOUNCE; event = 'bounce'; }
    for (const wall of this.hole.walls) {
      // Resolve a circle against the actual rail, including rounded corner contact.
      // This transform matches Three.js rotation about the Y axis.
      const c = Math.cos(wall.rotation || 0), s = Math.sin(wall.rotation || 0);
      const dx = this.x - wall.x, dz = this.z - wall.z;
      const x = c * dx - s * dz, z = s * dx + c * dz;
      const hw = wall.width / 2, hd = wall.depth / 2;
      let nx = x - Math.max(-hw, Math.min(hw, x));
      let nz = z - Math.max(-hd, Math.min(hd, z));
      const distance = Math.hypot(nx, nz);
      let penetration = BALL_RADIUS - distance;
      if (distance === 0) {
        if (hw - Math.abs(x) < hd - Math.abs(z)) { nx = Math.sign(x || 1); nz = 0; penetration = BALL_RADIUS + hw - Math.abs(x); }
        else { nx = 0; nz = Math.sign(z || 1); penetration = BALL_RADIUS + hd - Math.abs(z); }
      } else { nx /= distance; nz /= distance; }
      if (penetration > 0 && this.collide(c * nx + s * nz, -s * nx + c * nz, penetration)) event = 'bounce';
    }
    for (const bumper of this.hole.bumpers || []) {
      const dx = this.x - bumper.x, dz = this.z - bumper.z;
      const distance = Math.hypot(dx, dz), penetration = bumper.radius + BALL_RADIUS - distance;
      if (penetration > 0 && this.collide(distance ? dx / distance : 1, distance ? dz / distance : 0, penetration)) event = 'bounce';
    }
    const dx = this.x - this.hole.cup.x, dz = this.z - this.hole.cup.z;
    const distance = Math.hypot(dx, dz), arrivalSpeed = Math.hypot(this.vx, this.vz);
    // Soft putts use almost the entire visible opening. Faster putts need a
    // more central line to fall before reaching the far edge. The flag is visual
    // only: it must never eject a ball that should drop into the cup.
    const captureRadius = CUP_RADIUS - .045 * Math.min(1, (arrivalSpeed / CAPTURE_SPEED) ** 2);
    const travelX = this.x - previousX, travelZ = this.z - previousZ;
    const travelSquared = travelX * travelX + travelZ * travelZ;
    const closestT = travelSquared ? Math.max(0, Math.min(1,
      ((this.hole.cup.x - previousX) * travelX + (this.hole.cup.z - previousZ) * travelZ) / travelSquared)) : 0;
    const closestDistance = Math.hypot(previousX + travelX * closestT - this.hole.cup.x, previousZ + travelZ * closestT - this.hole.cup.z);
    if (closestDistance <= captureRadius && arrivalSpeed <= CAPTURE_SPEED) {
      this.status = 'holed'; this.vx = 0; this.vz = 0; return 'holed';
    }
    // Only a medium-speed graze INSIDE the opening can catch the lip.
    // Slow edge putts are allowed to fall, and near misses outside it stay true.
    if (distance < CUP_RADIUS && arrivalSpeed > CAPTURE_SPEED && arrivalSpeed < CAPTURE_SPEED + .55 && this.lipCooldown === 0 && dx * this.vx + dz * this.vz < 0) {
      const cross = Math.abs(dx * this.vz - dz * this.vx) / arrivalSpeed;
      if (cross > CUP_RADIUS * .8) {
        const radial = (dx * this.vx + dz * this.vz) / (distance * distance);
        this.vx -= 1.2 * radial * dx; this.vz -= 1.2 * radial * dz;
        this.lipCooldown = .4; event = 'lip';
      }
    }
    if (arrivalSpeed < .025 && Math.abs(slope) < .01) { this.status = 'missed'; return 'missed'; }
    return event;
  }
  private collide(nx: number, nz: number, penetration: number) {
    this.x += nx * penetration; this.z += nz * penetration;
    const inward = this.vx * nx + this.vz * nz;
    if (inward >= 0) return false;
    this.vx -= (1 + BOUNCE) * inward * nx;
    this.vz -= (1 + BOUNCE) * inward * nz;
    return true;
  }
}
export type GolfMode = 'aim' | 'charging' | 'swinging' | 'rolling' | 'missed' | 'holed' | 'complete';
export class GolfRound {
  holeIndex = 0; ball = new GolfBall(HOLES[0]); mode: GolfMode = 'aim';
  attempts = [0, 0, 0]; angle = 0; chargeTime = 0; shotPower = 0; timer = 0; paused = false;
  get total() { return this.attempts.reduce((a, b) => a + b, 0); }
  get power() { return this.mode === 'charging' ? swingPower(this.chargeTime) : this.shotPower; }
  aim(direction: number, dt: number) {
    if (!this.paused && (this.mode === 'aim' || this.mode === 'charging')) this.angle = Math.max(-Math.PI * .72, Math.min(Math.PI * .72, this.angle + direction * .7 * dt));
  }
  charge() { if (this.mode === 'aim' && !this.paused) { this.mode = 'charging'; this.chargeTime = 0; } }
  cancelCharge() { if (this.mode === 'charging') { this.mode = 'aim'; this.chargeTime = 0; this.shotPower = 0; } }
  release() {
    if (this.mode !== 'charging' || this.paused) return;
    this.shotPower = this.power; this.mode = 'swinging'; this.timer = 0; this.attempts[this.holeIndex]++;
  }
  pause() { this.cancelCharge(); this.paused = true; }
  resume() { this.paused = false; }
  step(dt: number): 'strike' | 'bounce' | 'lip' | 'missed' | 'holed' | 'next' | 'complete' | undefined {
    if (this.paused) return;
    if (this.mode === 'charging') { this.chargeTime += dt; return; }
    if (this.mode === 'swinging') {
      this.timer += dt;
      if (this.timer >= .22) { this.mode = 'rolling'; this.ball.hit(this.angle, this.shotPower); return 'strike'; }
    } else if (this.mode === 'rolling') {
      const event = this.ball.step(dt);
      if (event === 'holed' || event === 'missed') { this.mode = event; this.timer = 0; }
      return event;
    } else if (this.mode === 'missed' || this.mode === 'holed') {
      this.timer += dt;
      if (this.timer >= (this.mode === 'holed' ? 2 : 1)) {
        if (this.mode === 'holed') {
          if (this.holeIndex === HOLES.length - 1) { this.mode = 'complete'; return 'complete'; }
          this.holeIndex++; this.angle = 0;
        }
        this.ball = new GolfBall(HOLES[this.holeIndex]); this.mode = 'aim'; this.shotPower = 0;
        return 'next';
      }
    }
  }
}

