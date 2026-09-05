import assert from 'node:assert/strict';
import { RiderPhysics, SECTION_LENGTH, MAX_BOOST_SPEED, difficultyAt, RAMPS, terrain, LANDING_REACTION_SECONDS, isSafeObstaclePosition } from '../src/game/pumpkin-rider.ts';
const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
for (let seed = 1; seed <= 20; seed++) {
  const g = new RiderPhysics(seeded(seed));
  let loops = 0;
  for (let tick = 0; tick < 100000 && g.furthest < SECTION_LENGTH * 20; tick++) {
    const next = g.obstacles.find(o => o.x > g.x - 34 && o.x - g.x < 290);
    if (next && g.grounded && next.x - g.x < Math.max(135, g.speed * .39)) g.jump();
    const result = g.step(1 / 120, 0, false);
    assert.notEqual(result, 'crash', `Seed ${seed} crash at ${g.x}, height ${g.y}`);
    assert.notEqual(result, 'finish');
    if (result === 'loop') loops++;
  }
  assert.ok(g.furthest >= SECTION_LENGTH * 20);
  assert.ok(loops >= 35);
  assert.ok(g.score > 16000);
  assert.ok(g.candies.length < 200 && g.obstacles.length < 12 && g.ramps.length < 16);
  assert.ok(g.collected.size < 200 && g.completed.size < 8 && g.openedBoxes.size < 10);
}
console.log('20 endless rides across 20 sections passed; loops, score, streaming and bounded memory verified.');
assert.ok(difficultyAt(80000).speed > difficultyAt(8000).speed);
assert.ok(difficultyAt(16000).obstacleCount > difficultyAt(0).obstacleCount);
assert.ok(difficultyAt(1e9).speed * 1.2 <= MAX_BOOST_SPEED);
// Boost refreshes once per box, counts riding time, and expires to normal speed.
const boost = new RiderPhysics(() => 0);
boost.obstacles = []; boost.surpriseBoxes = [{x:300,y:38},{x:3070,y:38}]; boost.x = 300; boost.speed = 350;
assert.equal(boost.step(1/120, 0, false), 'boost');
assert.equal(boost.boostRemaining, 20); assert.ok(boost.speed >= 420 && boost.speed <= boost.difficulty.speed * 1.2);
boost.step(1/120, 0, false); assert.ok(boost.boostRemaining < 20);
boost.x = 3070; boost.y = 24; boost.grounded = true;
assert.equal(boost.step(1/120, 0, false), 'boost');assert.equal(boost.boostRemaining, 20);
boost.surpriseBoxes = [];
for (let i = 0; i < 2401; i++) { boost.x = 100; boost.step(1/120, 0, false); }
assert.equal(boost.boostRemaining, 0); assert.ok(boost.speed <= boost.difficulty.speed);
const fresh = new RiderPhysics(() => 0);
assert.equal(fresh.score, 0);assert.equal(fresh.boostRemaining, 0);assert.equal(fresh.difficulty.stage, 1);
fresh.x = 510;assert.equal(fresh.step(1/120,0,false), 'crash');
const upsideDown = new RiderPhysics(() => 0);upsideDown.obstacles=[];upsideDown.jump();upsideDown.angle=Math.PI;
let event;for(let i=0;i<200;i++){event=upsideDown.step(1/120,0,false);if(event==='crash')break;}assert.equal(event,'crash');
console.log('Progressive difficulty, boost duration/refresh/expiry, fresh runs and collisions passed.');
// Protect manual ramp jumps even at the highest difficulty and boost speed.
let checks = 0;
for (const section of [0, 5, 50]) for (const ramp of RAMPS) for (const before of [null, 1, 40, 120]) for (const profile of ['normal', 'boost', 'brake', 'expiry']) {
  const rider = new RiderPhysics(seeded(checks + 1));
  rider.x = section * SECTION_LENGTH + ramp + 190 - (before ?? 1);
  rider.furthest = rider.x;rider.ensureWorld();rider.surpriseBoxes=[];
  assert.ok(rider.obstacles.every(o=>isSafeObstaclePosition(o.x)));
  rider.completed = new Set(rider.loops);rider.y=terrain(rider.x)+24;rider.angle=Math.atan(.52);
  rider.speed = rider.difficulty.speed * (profile === 'normal' ? 1 : 1.2);
  rider.boostRemaining = profile === 'normal' ? 0 : profile === 'expiry' ? .2 : 20;
  if(before!==null)rider.jump();
  let airborne=!rider.grounded, recovery=0;
  for(let tick=0;tick<1200 && recovery<LANDING_REACTION_SECONDS;tick++) {
    const result=rider.step(1/120,0,profile==='brake');
    assert.notEqual(result,'crash',`Ramp ${ramp}, section ${section}, ${profile}, jump ${before}`);
    if(!rider.grounded)airborne=true;
    if(airborne && rider.grounded)recovery+=1/120;
  }
  assert.ok(recovery>=LANDING_REACTION_SECONDS);checks++;
}
console.log(`${checks} ramp landings passed across early, medium and maximum difficulty.`);


// Balance regressions: visible escalation early, guaranteed obstacle counts,
// and long boost-free intervals even at the highest possible speed.
assert.equal(difficultyAt(2600).stage, 2);
assert.ok(difficultyAt(8100).speed >= 440);
const balance = new RiderPhysics(seeded(123));
const boxes = new Set();
for (let section = 0; section < 30; section++) {
  balance.x = section * SECTION_LENGTH;balance.ensureWorld();
  const local = balance.obstacles.filter(o=>Math.floor(o.x/SECTION_LENGTH)===section);
  assert.equal(local.length, section === 0 ? 2 : section === 1 ? 3 : 4);
  for (const box of balance.surpriseBoxes) if(box.x<30*SECTION_LENGTH)boxes.add(box.x);
}
const positions = [...boxes].sort((a,b)=>a-b);
assert.equal(positions.length, 10);
assert.ok(positions[0] >= SECTION_LENGTH);
for(let i=1;i<positions.length;i++) {
  assert.ok((positions[i]-positions[i-1])/MAX_BOOST_SPEED - 20 > 16);
}
console.log('Balance verified: 2 → 3 → 4 obstacles, faster early stages, and 10 boosts per 30 sections with at least 16 seconds between boosts at top speed.');
