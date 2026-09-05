// World coordinates use positive Y upwards; rendering inverts the vertical axis.
export const SECTION_LENGTH = 8000;
export const LOOPS = [2450, 5000];
export const BOOST_SECONDS = 20;
export const NORMAL_SPEED = 350;
export const BOOST_SPEED = 420;
export const MAX_BOOST_SPEED = 648;
export const DIFFICULTY_DISTANCE = 2500;
export function difficultyAt(x: number) {
  const distance = Math.max(0, x - 100);
  return {
    stage: 1 + Math.floor(distance / DIFFICULTY_DISTANCE),
    speed: NORMAL_SPEED + 190 * (1 - Math.exp(-distance / 11000)),
    obstacleCount: Math.min(4, 2 + Math.floor(distance / 4000)),
  };
}
export const RAMPS = [700, 1550, 3300, 4050, 5800];
const GRAVITY = 1000;
const JUMP_SPEED = 490;
const RAMP_LENGTH = 190;
const RAMP_HEIGHT = RAMP_LENGTH * .52;
export const LANDING_REACTION_SECONDS = .6;
// Reserve the entire jump envelope, including a Space jump at the ramp lip,
// at maximum boost speed. Include rider collision width and two physics steps.
const MAX_RAMP_AIRTIME = (JUMP_SPEED + Math.sqrt(JUMP_SPEED ** 2 + 2 * GRAVITY * RAMP_HEIGHT)) / GRAVITY;
export const RAMP_CLEAR_DISTANCE = RAMP_LENGTH
  + MAX_BOOST_SPEED * (MAX_RAMP_AIRTIME + LANDING_REACTION_SECONDS) + 34 + MAX_BOOST_SPEED / 60;
export function isSafeObstaclePosition(x: number): boolean {
  x = ((x % SECTION_LENGTH) + SECTION_LENGTH) % SECTION_LENGTH;
  return RAMPS.every(start => x < start - 34 || x > start + RAMP_CLEAR_DISTANCE);
}
export function terrain(x: number): number {
  x = ((x % SECTION_LENGTH) + SECTION_LENGTH) % SECTION_LENGTH;
  for (const start of RAMPS) {
    if (x >= start && x < start + 190) return (x - start) * .52;
    if (x >= start + 190 && x < start + 310) return 98.8 * (1 - (x - start - 190) / 120);
  }
  return 0;
}
export type Obstacle = { x: number; y: number; kind: number };
export class RiderPhysics {
  x = 100; y = 24; speed = 0; vy = 0; angle = 0; grounded = true;
  loop = -1; loopAngle = 0; completed = new Set<number>();
  bonus = 0; furthest = 100; collected = new Set<number>(); obstacles: Obstacle[] = [];
  boostRemaining = 0;
  surpriseBoxes: { x: number; y: number }[] = [];
  openedBoxes = new Set<number>();
  candies: { x: number; y: number }[] = [];
  loops: number[] = [];
  ramps: number[] = [];
  private nextSection = 0;
  private random: () => number;
  get score() { return this.bonus + Math.floor((this.furthest - 100) / 10); }
  get difficulty() { return difficultyAt(this.furthest); }
  constructor(random = Math.random) { this.random = random; this.ensureWorld(); }
  ensureWorld() {
    const current = Math.floor(this.x / SECTION_LENGTH);
    while (this.nextSection <= current + 1) {
      const section = this.nextSection++, base = section * SECTION_LENGTH;
      const difficulty = difficultyAt(base);
      this.ramps.push(...RAMPS.map(x => base + x));
      this.loops.push(...LOOPS.map(x => base + x));
      // Separated slots leave room for a jump, even at maximum boosted speed.
      // Guaranteed escalation: random spawn omissions used to make later
      // sections easier by chance. Add slots in a fixed order as distance rises.
      const slots = [520, 5490, 2930, 7300].slice(0, difficulty.obstacleCount).sort((a, b) => a - b);
      for (const slot of slots) {
        const x = base + slot + this.random() * 55;
        const roll = this.random();
        // Taller ghosts become more common, demanding better jump timing.
        const kind = roll < Math.min(.65, .1 + (difficulty.stage - 1) * .07) ? 1 : roll < .8 ? 0 : 2;
        if (isSafeObstaclePosition(x))
          this.obstacles.push({ x, y: 0, kind });
      }
      // One pickup every three sections, starting in the second section.
      // Even at maximum speed there is a substantial break between boosts.
      if (section % 3 === 1) {
        const x = base + 300 + this.random() * 80;
        this.surpriseBoxes.push({ x, y: terrain(x) + 38 });
      }
      for (let offset = 340; offset < SECTION_LENGTH; offset += 98) {
        const x = base + offset;
        this.candies.push({ x, y: terrain(x) + 75 });
      }
    }
    // Retain only nearby objects so memory stays bounded on long rides.
    const behind = this.x - 1800;
    this.obstacles = this.obstacles.filter(o => o.x > behind);
    this.candies = this.candies.filter(o => o.x > behind);
    this.surpriseBoxes = this.surpriseBoxes.filter(o => o.x > behind);
    this.ramps = this.ramps.filter(x => x > behind);
    this.loops = this.loops.filter(x => x > behind);
    for (const set of [this.collected, this.openedBoxes, this.completed])
      for (const x of set) if (x < behind) set.delete(x);
  }
  jump() { if (this.grounded && this.loop < 0) { this.vy = JUMP_SPEED; this.grounded = false; } }
  step(dt: number, tilt: number, brake: boolean): 'crash' | 'loop' | 'boost' | undefined {
    this.ensureWorld();
    this.furthest = Math.max(this.furthest, this.x);
    this.boostRemaining = Math.max(0, this.boostRemaining - dt);
    const boosted = this.boostRemaining > 0;
    this.speed = Math.max(100, Math.min(this.difficulty.speed * (boosted ? 1.2 : 1), this.speed + (brake ? -560 : boosted ? 180 : 115) * dt));
    if (this.loop >= 0) {
      this.loopAngle += Math.max(this.speed, 290) / 135 * dt;
      this.x = this.loop + 135 * Math.sin(this.loopAngle);
      this.y = 24 + 135 * (1 - Math.cos(this.loopAngle));
      this.angle = this.loopAngle;
      if (this.loopAngle >= Math.PI * 2) {
        this.x = this.loop + 12; this.y = 24; this.angle = 0;
        this.completed.add(this.loop); this.loop = -1; this.bonus += 250; this.grounded = true;
        return 'loop';
      }
      return;
    }
    const oldX = this.x, oldY = this.y;
    this.x += this.speed * dt;
    for (const center of this.loops) {
      if (!this.completed.has(center) && oldX < center && this.x >= center && this.y < 70) {
        this.loop = center; this.loopAngle = 0; return;
      }
    }
    this.furthest = Math.max(this.furthest, this.x);
    const floor = terrain(this.x) + 24;
    const slope = (terrain(this.x + 2) - terrain(this.x - 2)) / 4;
    if (this.grounded) {
      if (floor < oldY - 1) { this.grounded = false; this.vy = 210; }
      else { this.y = floor; this.angle = Math.atan(slope); }
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt; this.y += this.vy * dt; this.angle += tilt * 3.8 * dt;
      if (this.y <= floor && this.vy < 0) {
        const error = Math.atan2(Math.sin(this.angle - Math.atan(slope)), Math.cos(this.angle - Math.atan(slope)));
        if (Math.abs(error) > 1.25) return 'crash';
        this.y = floor; this.grounded = true; this.vy = 0; this.angle = Math.atan(slope);
      }
    }
    for (const o of this.obstacles) {
      if (Math.abs(this.x - o.x) < 34 && this.y < terrain(o.x) + (o.kind === 1 ? 87 : 62)) return 'crash';
    }
    this.candies.forEach((c, i) => { if (!this.collected.has(c.x) && Math.hypot(c.x - this.x, c.y - this.y - 20) < 50) { this.collected.add(c.x); this.bonus += 10; } });
    for (let i = 0; i < this.surpriseBoxes.length; i++) {
      const box = this.surpriseBoxes[i];
      if (!this.openedBoxes.has(box.x) && Math.abs(box.x - this.x) < 42 && Math.abs(box.y - this.y - 20) < 42) {
        this.openedBoxes.add(box.x);
        this.boostRemaining = BOOST_SECONDS;
        if (!brake) this.speed = Math.min(this.difficulty.speed * 1.2, this.speed * 1.2);
        return 'boost';
      }
    }
  }
}

export function mountPumpkinRider() {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(`rider-${id}`) as T;
  const canvas = el<HTMLCanvasElement>('canvas'), ctx = canvas.getContext('2d')!;
  const overlay = el('overlay'), start = el<HTMLButtonElement>('start'), pause = el<HTMLButtonElement>('pause');
  let game = new RiderPhysics(), mode: 'ready' | 'playing' | 'paused' | 'crashed' = 'ready';
  let best = 0, savedBest = 0, lastSave = 0, last = 0, accumulator = 0, time = 0, noticeUntil = 0;
  let announcedStage = 1;
  try { best = Number(localStorage.getItem('pumpkin-rider-endless-best')) || 0; } catch { /* Storage is optional. */ }
  el('best').textContent = String(best);
  const keys = new Set<string>();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function message(title: string, body: string, action: string) { el('title').textContent = title; el('message').textContent = body; start.textContent = action; overlay.hidden = false; }
  function announce(text: string) { el('notice').textContent = text; noticeUntil = time + 2.5; }
  function begin(fresh = false) {
    if (fresh || mode === 'crashed') game = new RiderPhysics();
    announcedStage = game.difficulty.stage;
    el('notice').textContent = '';
    mode = 'playing'; keys.clear(); overlay.hidden = true; pause.textContent = 'Pause'; canvas.focus(); accumulator = 0;
    el('boost').textContent = game.boostRemaining > 0 ? `⚡ Boost ${Math.ceil(game.boostRemaining)}s` : '⚡ Find a ? box';
  }
  function togglePause() {
    if (mode === 'playing') { mode = 'paused'; keys.clear(); pause.textContent = 'Resume'; message('Taking a pit stop.', 'Your ride is waiting right here.', 'Resume ride →'); }
    else if (mode === 'paused') begin();
  }
  start.addEventListener('click', () => begin());
  el('restart').addEventListener('click', () => begin(true));
  pause.addEventListener('click', togglePause);
  const mapping: Record<string, string> = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowDown: 'brake', s: 'brake', ArrowUp: 'jump', w: 'jump', ' ': 'jump' };
  window.addEventListener('keydown', e => {
    if (e.target instanceof HTMLButtonElement) return;
    const action = mapping[e.key];
    if (action && (mode === 'playing' || document.activeElement === canvas)) { e.preventDefault(); if (!e.repeat && action === 'jump' && mode === 'playing') game.jump(); keys.add(action); }
    if (e.key.toLowerCase() === 'p') togglePause();
  });
  window.addEventListener('keyup', e => keys.delete(mapping[e.key]));
  window.addEventListener('blur', () => { keys.clear(); if (mode === 'playing') togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') togglePause(); });
  document.querySelectorAll<HTMLButtonElement>('[data-rider]').forEach(button => {
    const action = button.dataset.rider!;
    button.addEventListener('pointerdown', e => { e.preventDefault(); button.setPointerCapture(e.pointerId); keys.add(action); if (action === 'jump' && mode === 'playing') game.jump(); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => keys.delete(action));
    button.addEventListener('click', e => { if (e.detail === 0 && action === 'jump' && mode === 'playing') game.jump(); });
  });
  function ellipse(x:number,y:number,rx:number,ry:number,color:string) { ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill(); }
  function path(points:number[][],color:string,width=0) { ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}else{ctx.closePath();ctx.fillStyle=color;ctx.fill();} }
  function pumpkin(x:number,y:number,r:number) {
    ellipse(x,y,r,r*.8,'#ed792c');ellipse(x-r*.38,y,r*.42,r*.73,'#ff9b3e');ellipse(x+r*.38,y,r*.42,r*.73,'#ff9b3e');
    path([[x-3,y-r*.65],[x,y-r-7],[x+6,y-r-5],[x+3,y-r*.6]],'#86a35b');
    path([[x-r*.65,y],[x-r*.3,y-r*.35],[x-r*.1,y]],'#342038');path([[x+r*.1,y],[x+r*.3,y-r*.35],[x+r*.65,y]],'#342038');
    path([[x-r*.5,y+r*.2],[x,y+r*.35],[x+r*.5,y+r*.2],[x+r*.25,y+r*.52],[x-r*.25,y+r*.52]],'#342038');
  }
  function draw() {
    const camera = Math.max(0, game.x - 240), ground = 447;
    const sky=ctx.createLinearGradient(0,0,0,560);sky.addColorStop(0,'#18182f');sky.addColorStop(.7,'#493354');sky.addColorStop(1,'#b16a59');ctx.fillStyle=sky;ctx.fillRect(0,0,1000,560);
    for(let i=0;i<46;i++) ellipse((i*163.7)%1000,(i*71.3)%270,1.2,1.2,'#cec6ce');
    ellipse(805,96,49,49,'#f4ddae');ellipse(787,83,9,12,'#dfc99c');ellipse(822,111,13,9,'#dfc99c');
    for(let layer=0;layer<2;layer++) {
      const offset=camera*(layer?.28:.12), color=layer?'#29263f':'#38314d';
      for(let i=-1;i<8;i++){const x=i*220-offset%220;path([[x,447],[x,320],[x+90,230+layer*40],[x+210,340],[x+260,447]],color);}
    }
    // Silhouetted graveyard and bare trees move more slowly than the track.
    for(let i=-1;i<8;i++) {
      const x=i*190-(camera*.48)%190;
      path([[x,447],[x+9,282],[x+19,447]],'#201f32');path([[x+12,350],[x-32,318],[x-39,289]],'#201f32',7);path([[x+11,327],[x+42,288],[x+55,287]],'#201f32',6);
      ctx.fillStyle='#282238';ctx.fillRect(x+70,408,26,39);ellipse(x+83,408,13,13,'#282238');
    }
    ctx.save();ctx.translate(-camera,ground);
    const terrainPoints:number[][]=[[camera-10,120]];
    for(let x=camera-10;x<=camera+1020;x+=5) terrainPoints.push([x,-terrain(x)]);
    terrainPoints.push([camera+1020,120]);path(terrainPoints,'#211b2c');path(terrainPoints.slice(1,-1),'#d29469',5);
    for(const loop of game.loops) {
      ctx.strokeStyle='#211b2c';ctx.lineWidth=24;ctx.beginPath();ctx.arc(loop,-159,147,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#d29469';ctx.lineWidth=4;ctx.stroke();
      path([[loop-100,0],[loop,-160],[loop+100,0]],'#574153',8);
    }
    for(const ramp of game.ramps) { ctx.fillStyle='#ffc479';ctx.font='bold 15px system-ui';ctx.fillText('RAMP ↗',ramp+35, -terrain(ramp+35)-30); }
    game.candies.forEach((c,i)=>{if(game.collected.has(c.x)||Math.abs(c.x-camera-500)>550)return;path([[c.x-13,-c.y-6],[c.x-13,-c.y+6],[c.x+13,-c.y-6],[c.x+13,-c.y+6]],'#ffe4a4');ellipse(c.x,-c.y,7,7,'#ffc66d');});
    game.surpriseBoxes.forEach((box, i) => {
      if (game.openedBoxes.has(box.x) || Math.abs(box.x - camera - 500) > 550) return;
      ctx.save();ctx.translate(box.x, -box.y);
      ctx.fillStyle = '#ffc66d';ctx.fillRect(-20, -20, 40, 40);
      ctx.strokeStyle = '#fff0bd';ctx.lineWidth = 3;ctx.strokeRect(-20, -20, 40, 40);
      ctx.fillStyle = '#35233e';ctx.font = '900 32px system-ui';ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.fillText('?', 0, 1);
      ctx.restore();
    });
    for(const o of game.obstacles) {
      const y=-terrain(o.x);
      if(o.kind===0){ctx.fillStyle='#9b91a7';ctx.fillRect(o.x-17,y-34,34,34);ellipse(o.x,y-34,17,15,'#9b91a7');path([[o.x-8,y-30],[o.x+8,y-30]],'#534959',3);path([[o.x,y-38],[o.x,y-15]],'#534959',3);}
      else if(o.kind===1){const bob=reduced?0:Math.sin(time*3+o.x)*4;ellipse(o.x,y-55+bob,19,24,'#e5ddd9');path([[o.x-19,y-53+bob],[o.x-19,y-23+bob],[o.x-8,y-30+bob],[o.x,y-23+bob],[o.x+9,y-30+bob],[o.x+19,y-23+bob],[o.x+19,y-53+bob]],'#e5ddd9');ellipse(o.x-7,y-59+bob,3,5,'#34283d');ellipse(o.x+7,y-59+bob,3,5,'#34283d');}
      else {ellipse(o.x,y-27,21,21,'#201628');for(let i=-1;i<=1;i++)path([[o.x,y-25],[o.x+32,y-40+i*14],[o.x+40,y-22+i*14]],'#a99abc',3);for(let i=-1;i<=1;i++)path([[o.x,y-25],[o.x-32,y-40+i*14],[o.x-40,y-22+i*14]],'#a99abc',3);ellipse(o.x-6,y-32,4,4,'#ffc479');ellipse(o.x+6,y-32,4,4,'#ffc479');}
    }
    ctx.save();ctx.translate(game.x,-game.y);ctx.rotate(-game.angle);
    if (game.boostRemaining > 0) {
      path([[-39,-5],[-70,0],[-39,5]],'#ffc66d');
      path([[-39,-2],[-57,0],[-39,2]],'#fff0bd');
    }
    for(const x of [-26,27]){ellipse(x,7,18,18,'#111322');ctx.strokeStyle='#ac9dac';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,7,12,0,Math.PI*2);ctx.stroke();path([[x-10*Math.cos(game.x/18),7-10*Math.sin(game.x/18)],[x+10*Math.cos(game.x/18),7+10*Math.sin(game.x/18)]],'#72677c',2);}
    path([[-26,7],[-8,-17],[11,7],[-26,7],[14,-17],[27,7]],'#df8358',5);path([[14,-17],[13,-29],[24,-30]],'#e3d4d0',4);path([[-13,-20],[2,-20]],'#f6c87a',7);
    ellipse(1,-17,13,8,'#ffad55');
    ctx.fillStyle='#615c72';ctx.fillRect(-8,-9,17,14);
    path([[-7,3],[-22,0],[-39,0]],'#d4c8cd',5);
    path([[15,-8],[27,-12],[40,-7]],'#ffad55',5);
    path([[-6,-46],[-13,-25],[4,-7]],'#9382b2',9);path([[-5,-39],[10,-30],[17,-29]],'#9382b2',7);pumpkin(-4,-59,23);
    ctx.restore();ctx.restore();
  }
  function frame(now:number) {
    const dt=Math.min((now-last)/1000 || 0, .05);last=now;
    if(mode==='playing') {
      time+=dt;accumulator+=dt;
      while(accumulator>=1/120 && mode==='playing') {
        accumulator-=1/120;
        const event=game.step(1/120,(keys.has('left')?1:0)-(keys.has('right')?1:0),keys.has('brake'));
        if(event==='crash'){mode='crashed';keys.clear();message('A little pumpkin tumble.', `You rode ${Math.floor((game.furthest - 100) / 10)} m and scored ${game.score} points. Jump early and land wheels down!`, 'Try again →');}
        if(event==='loop')announce('Loop complete! +250');
        if(event==='boost')announce('Surprise! Speed boost for 20 seconds!');
      }
      best = Math.max(best, game.score);
      if (best > savedBest && (mode === 'crashed' || time - lastSave >= 1)) {
        try { localStorage.setItem('pumpkin-rider-endless-best', String(best)); savedBest = best; } catch {}
        lastSave = time;
      }
      el('score').textContent=String(game.score);el('best').textContent=String(best);el('distance').textContent=`${Math.floor((game.furthest - 100) / 10)} m`;
      el('boost').textContent = game.boostRemaining > 0 ? `⚡ Boost ${Math.ceil(game.boostRemaining)}s` : '⚡ Find a ? box';
      const difficulty = game.difficulty;
      el('difficulty').textContent = `Stage ${difficulty.stage} · Speed +${Math.round((difficulty.speed / NORMAL_SPEED - 1) * 100)}%`;
      if (difficulty.stage > announcedStage) {
        announcedStage = difficulty.stage;
        announce(`Stage ${difficulty.stage} — picking up speed!`);
      }
      if(time>noticeUntil)el('notice').textContent='';
    }
    draw();requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}






