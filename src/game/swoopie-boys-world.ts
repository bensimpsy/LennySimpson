export const WORLD = { width: 1280, height: 960 };
export type Point = { x: number; y: number };
export type Block = Point & { w: number; h: number };
export const stops = [
  { x: 192, y: 480, name: 'Corner shop' },
  { x: 640, y: 800, name: 'School crossing' },
  { x: 1088, y: 480, name: 'Bottlebrush bend' },
  { x: 640, y: 192, name: 'Best mate’s house' },
  { x: 1088, y: 192, name: 'Park gate' },
  { x: 1088, y: 80, name: 'The park' },
];
export const houses: Block[] = [];
for (const x of [280, 470, 730, 920]) for (const y of [280, 590]) houses.push({ x, y, w: 100, h: 100 });
export const trees: Point[] = [
  {x:100,y:100},{x:300,y:90},{x:470,y:100},{x:740,y:90},{x:930,y:100},{x:1200,y:110},
  {x:100,y:350},{x:430,y:405},{x:850,y:410},{x:1190,y:360},
  {x:100,y:650},{x:430,y:720},{x:850,y:725},{x:1190,y:650},
  {x:110,y:890},{x:320,y:885},{x:550,y:890},{x:750,y:890},{x:970,y:890},{x:1190,y:875},
];
export function canRide(x: number, y: number): boolean {
  if (x < 14 || y < 14 || x > WORLD.width - 14 || y > WORLD.height - 14) return false;
  if (houses.some(b => x > b.x - 10 && x < b.x+b.w+10 && y > b.y-10 && y < b.y+b.h+10)) return false;
  return !trees.some(t => Math.hypot(t.x-x,t.y+10-y) < 23);
}
export type Bird = { x: number; y: number; tx: number; ty: number; age: number; hit: boolean };
export type Ride = {
  player: Point; direction: Point; lives: number; elapsed: number; stop: number;
  dash: number; cooldown: number; invulnerable: number; spawn: number;
  birds: Bird[]; dodged: number; state: 'ready' | 'playing' | 'paused' | 'won' | 'lost';
};
export function newRide(): Ride {
  return { player:{x:192,y:800}, direction:{x:0,y:-1}, lives:3, elapsed:0, stop:0,
    dash:0,cooldown:0,invulnerable:0,spawn:2.5,birds:[],dodged:0,state:'ready' };
}
export function dash(ride: Ride) {
  if (ride.state==='playing' && ride.cooldown<=0) { ride.dash=.4; ride.cooldown=2.2; }
}
export function birdPosition(b: Bird): Point {
  const progress = Math.max(0,Math.min(1,(b.age-1.1)/.65));
  return { x:b.x+(b.tx-b.x)*progress, y:b.y+(b.ty-b.y)*progress };
}
export function stepRide(r: Ride, dt: number, input: Point) {
  if(r.state!=='playing') return;
  dt=Math.min(.05,Math.max(0,dt));
  r.elapsed+=dt; r.cooldown=Math.max(0,r.cooldown-dt); r.dash=Math.max(0,r.dash-dt); r.invulnerable=Math.max(0,r.invulnerable-dt);
  const length=Math.hypot(input.x,input.y);
  if(length) {
    const dx=input.x/length,dy=input.y/length;
    r.direction={x:dx,y:dy};
    const speed=r.dash>0?240:105;
    const x=r.player.x+dx*speed*dt, y=r.player.y+dy*speed*dt;
    if(canRide(x,r.player.y)) r.player.x=x;
    if(canRide(r.player.x,y)) r.player.y=y;
  }
  const target=stops[r.stop];
  if(target && Math.hypot(target.x-r.player.x,target.y-r.player.y)<24) {
    r.stop++;
    if(r.stop===stops.length) { r.state='won'; return; }
  }
  r.spawn-=dt;
  if(r.spawn<=0) {
    // Predict the rider's path, then commit. The warning never follows them.
    const angle=r.elapsed*2.39,dx=Math.cos(angle),dy=Math.sin(angle);
    const lead=length?150:0;
    const mx=Math.max(14,Math.min(WORLD.width-14,r.player.x+r.direction.x*lead));
    const my=Math.max(14,Math.min(WORLD.height-14,r.player.y+r.direction.y*lead));
    r.birds.push({x:mx-dx*125,y:my-dy*125,tx:mx+dx*125,ty:my+dy*125,age:0,hit:false});
    r.spawn=Math.max(1.35,3-r.stop*.24-r.elapsed*.004);
  }
  for(const b of r.birds) {
    const old=birdPosition(b); b.age+=dt; const p=birdPosition(b);
    const vx=p.x-old.x,vy=p.y-old.y,den=vx*vx+vy*vy;
    const t=den ? Math.max(0,Math.min(1,((r.player.x-old.x)*vx+(r.player.y-old.y)*vy)/den)):0;
    const distance=Math.hypot(r.player.x-old.x-vx*t,r.player.y-old.y-vy*t);
    if(b.age>=1.1 && b.age<1.8 && !b.hit && distance<13 && r.invulnerable<=0 && r.dash<=0) {
      b.hit=true;r.lives--;r.invulnerable=1.6;
      if(r.lives===0)r.state='lost';
    }
    if(b.age>=1.8 && !b.hit) {r.dodged++;b.hit=true;}
  }
  r.birds=r.birds.filter(b=>b.age<2);
}
