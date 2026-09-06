import assert from 'node:assert/strict';
import {
  CAPTURE_SPEED,
  BALL_RADIUS,
  CUP_RADIUS,
  GolfBall,
  GolfRound,
  HOLES,
  PHYSICS_STEP,
  swingPower,
} from '../src/game/mini-golf-physics.ts';

function roll(ball, maxSteps = 10000) {
  let events = [];
  for (let i = 0; i < maxSteps && ball.status === 'rolling'; i++) {
    const event = ball.step(PHYSICS_STEP);
    if (event) events.push(event);
  }
  return events;
}

// The meter is a continuous triangle wave and has predictable release points.
assert.equal(swingPower(0), 0);
assert.equal(swingPower(.75), .5);
assert.equal(swingPower(1.5), 1);
assert.equal(swingPower(2.25), .5);
assert.equal(swingPower(3), 0);

// Each hole has a tested hole-in-one line: straight, bank, then ramp.
const solutions = [[0, .5], [-.47, .52], [-.14, .5]];
for (let i = 0; i < HOLES.length; i++) {
  const ball = new GolfBall(HOLES[i]);
  ball.hit(...solutions[i]);
  const events = roll(ball);
  assert.equal(ball.status, 'holed', `Hole ${i + 1} should have a repeatable solution`);
  if (i === 1) assert.equal(events.filter(e => e === 'bounce').length, 1, 'Hole 2 should allow a single bank around the divider');
}

// Solutions have some aim/power tolerance rather than needing a lucky exact input.
for (const [index, angles, powers] of [[1, [-.475, -.47, -.465], [.51, .52, .53]], [2, [-.145, -.14, -.135], [.495, .5, .505]]]) {
  for (const angle of angles) for (const power of powers) {
    const ball = new GolfBall(HOLES[index]);ball.hit(angle, power);roll(ball);
    assert.equal(ball.status, 'holed', `Hole ${index + 1}: aim ${angle}, power ${power}`);
  }
}

const practice = { name: 'Physics test', hint: '', tee: { x: 0, z: .3 }, cup: { x: 0, z: 0 }, walls: [], ramp: false };
function approaching(offset, speed, rotation = 0) {
  const ball = new GolfBall(practice);
  ball.x = offset * Math.cos(rotation) + .3 * Math.sin(rotation);
  ball.z = -offset * Math.sin(rotation) + .3 * Math.cos(rotation);
  ball.vx = -Math.sin(rotation) * speed;ball.vz = -Math.cos(rotation) * speed;
  ball.status = 'rolling';return ball;
}

// Regression: soft off-centre putts used to bounce away from the visible opening.
// Test both rims and approaches from every side, including the visual flag centre.
for (const rotation of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  for (const offset of [-.215, -.19, 0, .19, .215]) {
    const ball = approaching(offset, .55, rotation), events = roll(ball);
    assert.equal(ball.status, 'holed', `Soft cup approach at offset ${offset}, rotation ${rotation}`);
    assert.ok(!events.includes('lip') && !events.includes('bounce'), 'A soft putt must not be ejected by the rim or flag');
  }
}
const stoppedOnRim = approaching(0, 0);
stoppedOnRim.x = CUP_RADIUS - .005;stoppedOnRim.z = 0;
assert.equal(stoppedOnRim.step(PHYSICS_STEP), 'holed', 'A ball resting inside the opening must fall');
const steadyCentre = approaching(0, 1.4);
roll(steadyCentre);
assert.equal(steadyCentre.status, 'holed', 'A moderate centred putt should drop rather than skim over the flag');
for (const offset of [-CUP_RADIUS - .01, CUP_RADIUS + .01]) {
  const outside = approaching(offset, .7), events = roll(outside);
  assert.equal(outside.status, 'missed');assert.ok(!events.includes('lip'));
  assert.equal(outside.x, offset, 'Putts outside the visible rim must not be deflected');
}
const fastCrossing = approaching(0, 2.5);
roll(fastCrossing, 60);
assert.equal(fastCrossing.status, 'rolling');assert.ok(fastCrossing.z < -.23);
assert.equal(Math.abs(fastCrossing.vx), 0, 'A centred overshoot must not bounce off the decorative flag');
const rimGraze = approaching(.215, 1.8);
assert.ok(roll(rimGraze).includes('lip'), 'A faster glancing putt can still lip out');
assert.equal(rimGraze.status, 'missed');

// Rail normals follow the rendered angle; collisions preserve tangential motion
// and lose energy, with no second bounce when already travelling away.
const railAngle = -.4, normal = { x: Math.sin(railAngle), z: Math.cos(railAngle) };
const railBall = new GolfBall({ ...practice, cup: { x: 2, z: -5 }, walls: [{ x: 0, z: 0, width: 3, depth: .24, rotation: railAngle }] });
railBall.x = normal.x * .245;railBall.z = normal.z * .245;
railBall.vx = -normal.x * 2;railBall.vz = -normal.z * 2;railBall.status = 'rolling';
assert.equal(railBall.step(PHYSICS_STEP), 'bounce');
assert.ok(railBall.vx * normal.x + railBall.vz * normal.z > 0);
assert.ok(Math.hypot(railBall.vx, railBall.vz) < 2);
assert.notEqual(railBall.step(PHYSICS_STEP), 'bounce');
const circleBall = new GolfBall({ ...practice, cup: { x: 2, z: -5 }, bumpers: [{ x: 0, z: 0, radius: .6, style: 'planter' }] });
circleBall.x = .5;circleBall.z = .5;circleBall.vx = -.8;circleBall.vz = -1.1;circleBall.status = 'rolling';
assert.equal(circleBall.step(PHYSICS_STEP), 'bounce');
assert.ok(Math.hypot(circleBall.x, circleBall.z) >= .6 + BALL_RADIUS - 1e-10);
assert.ok(circleBall.x * circleBall.vx + circleBall.z * circleBall.vz > 0);
assert.ok(Math.hypot(circleBall.vx, circleBall.vz) < Math.hypot(.8, 1.1));

// A fast ball can cross the cup and keep rolling; a soft, centered ball drops.
const fast = new GolfBall(HOLES[0]);
fast.hit(0, 1);
roll(fast, 2500);
assert.notEqual(fast.status, 'holed');
const soft = new GolfBall(HOLES[0]);
soft.hit(0, .5);
roll(soft);
assert.equal(soft.status, 'holed');

// Round state counts attempts, resets only the active hole after a miss,
// and advances automatically after a successful hole.
const round = new GolfRound();
round.charge();
round.chargeTime = 1.5;
round.release();
assert.equal(round.attempts[0], 1);
assert.equal(round.total, 1);
assert.equal(round.mode, 'swinging');
for (let i = 0; i < 10000 && round.mode !== 'aim'; i++) round.step(PHYSICS_STEP);
assert.equal(round.mode, 'aim');
assert.equal(round.attempts[0], 1);
assert.equal(round.holeIndex, 0);

round.angle = solutions[0][0];
round.charge();
round.chargeTime = solutions[0][1] * 1.5;
round.release();
for (let i = 0; i < 10000 && round.mode !== 'holed'; i++) round.step(PHYSICS_STEP);
assert.equal(round.mode, 'holed');
for (let i = 0; i < 500 && round.mode !== 'aim'; i++) round.step(PHYSICS_STEP);
assert.equal(round.holeIndex, 1);
assert.equal(round.total, 2);

for (let hole = 1; hole < HOLES.length; hole++) {
  round.angle = solutions[hole][0];round.charge();round.chargeTime = solutions[hole][1] * 1.5;round.release();
  for (let i = 0; i < 10000 && round.mode !== 'holed'; i++) round.step(PHYSICS_STEP);
  assert.equal(round.mode, 'holed');
  for (let i = 0; i < 500 && round.mode === 'holed'; i++) round.step(PHYSICS_STEP);
}
assert.equal(round.mode, 'complete');assert.deepEqual(round.attempts, [2, 1, 1]);assert.equal(round.total, 4);

// Cancelling a charge is not a shot; pausing freezes all state.
const cancelled = new GolfRound();
cancelled.charge();
cancelled.chargeTime = 1;
cancelled.cancelCharge();
assert.equal(cancelled.mode, 'aim');
assert.equal(cancelled.total, 0);
cancelled.charge();
cancelled.pause();
assert.equal(cancelled.mode, 'aim');
assert.equal(cancelled.paused, true);
assert.equal(cancelled.step(1), undefined);
cancelled.resume();
assert.equal(cancelled.paused, false);

assert.ok(CAPTURE_SPEED > 0);
console.log('Mini Golf physics passed: soft cup approaches, fair rim misses, fast overshoots/lip-outs, angled rails, circular bumpers, three repeatable hole-in-one routes, full round scoring, retries and controls.');
