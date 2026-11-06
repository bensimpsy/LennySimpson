import assert from 'node:assert/strict';
import { newRide, stepRide, dash, canRide, stops, houses } from '../src/game/swoopie-boys-world.ts';
const riding = () => { const r = newRide(); r.state = 'playing'; r.spawn = 999; return r; };
const tick = (r, n, input = { x: 0, y: 0 }) => { for (let i=0;i<n;i++) stepRide(r,1/60,input); };

// Obstacles and every road segment: the complete route is actually rideable.
assert.equal(canRide(-1,100),false);
for(const h of houses) assert.equal(canRide(h.x+50,h.y+50),false);
for(const stop of stops) assert.equal(canRide(stop.x,stop.y),true);
const route=riding();
for(const destination of [stops[0],{x:192,y:800},{x:640,y:800},{x:1088,y:800},stops[2],{x:1088,y:192},stops[3],stops[4],stops[5]]) {
  let ticks=0;
  while(Math.hypot(destination.x-route.player.x,destination.y-route.player.y)>3 && ticks++<1000) {
    stepRide(route,1/60,{x:destination.x-route.player.x,y:destination.y-route.player.y});
    if(route.state==='won')break;
  }
  assert.ok(ticks<1000,'No route segment may be blocked');
}
assert.equal(route.state,'won');assert.equal(route.stop,6);

// Diagonal cycling has the same speed as cycling straight.
const straight=riding(),diagonal=riding();
tick(straight,30,{x:1,y:0});tick(diagonal,30,{x:1,y:1});
assert.ok(Math.abs(Math.hypot(diagonal.player.x-192,diagonal.player.y-800)-(straight.player.x-192))<.001);
const wall=riding();wall.player={x:265,y:320};tick(wall,120,{x:1,y:0});assert.ok(wall.player.x<=270);

// Warnings grant time to react; a dive damages once, and hearts end the ride.
const hit=riding();
const swoop = r => ({x:r.player.x-125,y:r.player.y,tx:r.player.x+125,ty:r.player.y,age:0,hit:false});
hit.birds=[swoop(hit)];tick(hit,65);assert.equal(hit.lives,3);
tick(hit,35);assert.equal(hit.lives,2);tick(hit,60);assert.equal(hit.lives,2);
hit.invulnerable=0;hit.birds=[swoop(hit)];tick(hit,100);assert.equal(hit.lives,1);
hit.invulnerable=0;hit.birds=[swoop(hit)];tick(hit,100);assert.equal(hit.state,'lost');
const protectedRide=riding();protectedRide.birds=[{...swoop(protectedRide),age:1.4}];dash(protectedRide);tick(protectedRide,10);assert.equal(protectedRide.lives,3);
const escaped=riding();escaped.birds=[swoop(escaped)];tick(escaped,121,{x:0,y:-1});assert.equal(escaped.lives,3);assert.equal(escaped.dodged,1);assert.equal(escaped.birds.length,0);

// Dash cooldown, pause, and terminal states freeze game time and movement.
const boost=riding();dash(boost);tick(boost,10,{x:1,y:0});assert.ok(boost.player.x>192+105/6);
const cooldown=boost.cooldown;dash(boost);assert.equal(boost.cooldown,cooldown);
boost.state='paused';const frozen=structuredClone(boost);tick(boost,60);assert.deepEqual(boost,frozen);
boost.state='playing';tick(boost,140);assert.equal(boost.cooldown,0);dash(boost);assert.ok(boost.dash>0);
for(const state of ['ready','won','lost']){const r=riding();r.state=state;const old=structuredClone(r);tick(r,60,{x:1,y:1});assert.deepEqual(r,old);}
console.log('Swoopie Boys: full route, obstacles, cycling speed, warning/damage/dodge, dash, pause and end states passed.');

