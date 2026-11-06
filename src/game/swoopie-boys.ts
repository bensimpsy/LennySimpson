import { WORLD, houses, trees, stops, newRide, dash, stepRide, birdPosition, type Ride } from './swoopie-boys-world';
import { palette, drawCyclist, drawMagpie } from './swoopie-boys-sprites';
const clamp = (n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function mountSwoopieBoys() {
  const canvas=document.querySelector<HTMLCanvasElement>('#swoopie-canvas');
  const ctx=canvas?.getContext('2d');
  if(!canvas || !ctx)return;
  const element = (id:string)=>document.getElementById(`swoopie-${id}`)!;
  const overlay=element('overlay'),title=element('title'),message=element('message');
  const start=element('start') as HTMLButtonElement,pause=element('pause') as HTMLButtonElement;
  const status=element('status');
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  let ride:Ride=newRide(), keys=new Set<string>(), last=0, animation=0, best=0, lastHud='', announcedStop=0, announcedLives=3;
  try { best=Number(localStorage.getItem('swoopie-boys-best'))||0; } catch { /* Storage can be unavailable. */ }
  const time=(n:number)=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
  function rect(x:number,y:number,w:number,h:number,color:number) { ctx!.fillStyle=palette[color];ctx!.fillRect(Math.round(x),Math.round(y),w,h); }
  function text(label:string,x:number,y:number,color=0) {ctx!.fillStyle=palette[color];ctx!.font='bold 7px monospace';ctx!.fillText(label,Math.round(x),Math.round(y));}
  function draw() {
    const cx=Math.round(clamp(ride.player.x-192,0,WORLD.width-384)),cy=Math.round(clamp(ride.player.y-128,0,WORLD.height-256));
    ctx!.imageSmoothingEnabled=false;
    rect(0,0,384,256,2);
    ctx!.save();ctx!.translate(-cx,-cy);
    // Sparse, repeatable tufts keep the world crisp without external assets.
    for(let y=Math.floor(cy/32)*32;y<cy+280;y+=32)for(let x=Math.floor(cx/32)*32;x<cx+410;x+=32){
      rect(x+7,y+13,1,3,1);rect(x+9,y+15,2,1,1);rect(x+22,y+25,2,1,3);
    }
    for(const x of [192,640,1088]) {rect(x-46,0,92,960,3);rect(x-34,0,68,960,1);for(let y=8;y<960;y+=24)rect(x-1,y,2,10,2);}
    for(const y of [192,480,800]) {rect(0,y-46,1280,92,3);rect(0,y-34,1280,68,1);for(let x=8;x<1280;x+=24)rect(x,y-1,10,2,2);}
    // Zebra crossings, lawn fences, letterboxes, and tiny tiled roofs.
    for(const p of [{x:640,y:800},{x:192,y:480},{x:1088,y:192}])for(let i=0;i<6;i++)rect(p.x-28+i*10,p.y+20,5,10,3);
    for(let i=0;i<houses.length;i++) {
      const h=houses[i];
      rect(h.x-8,h.y+106,116,2,1);for(let x=h.x-8;x<h.x+112;x+=8)rect(x,h.y+102,2,9,0);
      rect(h.x+40,h.y+100,20,25,3);rect(h.x+8,h.y+118,3,10,0);rect(h.x+5,h.y+114,10,6,1);
      rect(h.x+5,h.y+8,h.w,h.h,1);rect(h.x,h.y,h.w,h.h,0);rect(h.x+3,h.y+3,h.w-6,h.h-6,3);
      rect(h.x,h.y,100,49,0);rect(h.x+3,h.y+3,94,43,i%2?1:2);
      for(let yy=h.y+10;yy<h.y+45;yy+=9)for(let xx=h.x+4;xx<h.x+98;xx+=12){rect(xx,yy,10,1,0);rect(xx+5,yy-5,1,5,0);}
      rect(h.x+37,h.y-8,9,18,0);rect(h.x+39,h.y-6,5,10,3);
      for(const xx of [h.x+12,h.x+69]) {rect(xx,h.y+62,18,20,0);rect(xx+2,h.y+64,14,16,2);rect(xx+8,h.y+64,2,16,0);rect(xx+2,h.y+71,14,2,0);}
      rect(h.x+42,h.y+67,17,33,0);rect(h.x+45,h.y+70,11,27,1);rect(h.x+52,h.y+83,2,2,3);
      if(i===0){rect(h.x+4,h.y+51,92,9,0);text('CORNER SHOP',h.x+17,h.y+58,3);for(let j=0;j<8;j++)rect(h.x+4+j*12,h.y+60,10,5,j%2?1:2);}
      if(i===5){rect(h.x+4,h.y+51,92,9,0);text('SCHOOL',h.x+35,h.y+58,3);}
    }
    rect(1015,35,146,89,1);rect(1018,38,140,83,2);rect(1067,57,42,18,0);text('PARK',1079,69,3);
    rect(1069,75,3,9,0);rect(1104,75,3,9,0);
    // Finish picnic rug and a little playground.
    rect(1123,51,22,20,3);rect(1123,58,22,2,1);rect(1130,51,2,20,1);rect(1140,51,2,20,1);
    rect(1032,89,18,4,0);rect(1035,93,2,5,0);rect(1045,93,2,5,0);
    text('HOME',174,854,0);rect(154,858,18,12,1);rect(154,856,18,2,0);
    // Trees sort naturally against the cyclist's feet for top-down depth.
    const objects=[...trees.map(t=>({y:t.y+22,draw:()=>{
      rect(t.x-4,t.y+8,8,16,0);rect(t.x-2,t.y+11,4,9,1);
      rect(t.x-17,t.y-17,34,32,0);rect(t.x-23,t.y-9,46,16,0);
      rect(t.x-15,t.y-15,30,27,1);rect(t.x-20,t.y-7,40,12,1);
      rect(t.x-12,t.y-13,19,4,2);rect(t.x-17,t.y-5,11,5,2);rect(t.x+6,t.y+4,11,3,2);
    }})),{y:ride.player.y+8,draw:()=>{
      const p=ride.player;
      if(ride.invulnerable>0 && !reduced.matches && Math.floor(ride.elapsed*12)%2===0)return;
      ctx!.save();ctx!.globalAlpha=.3;rect(p.x-12,p.y+13,25,4,0);ctx!.restore();
      if(ride.dash>0){rect(p.x-ride.direction.x*15-3,p.y-ride.direction.y*15,6,2,3);}
      drawCyclist(ctx!,p.x,p.y,ride.direction,keys.size>0,reduced.matches?0:Math.floor(ride.elapsed*9));
    }}];
    objects.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());
    const target=stops[Math.min(ride.stop,stops.length-1)];
    const pulse=reduced.matches?0:Math.floor(ride.elapsed*3)%2;
    rect(target.x-10,target.y-17,2,23,0);rect(target.x-8,target.y-17,18,12,pulse?3:0);text(String(Math.min(ride.stop+1,6)),target.x-3,target.y-8,pulse?0:3);
    for(const b of ride.birds) {
      const mx=(b.x+b.tx)/2,my=(b.y+b.ty)/2;
      const heading={x:b.tx-b.x,y:b.ty-b.y};
      const flap=reduced.matches?0:Math.floor(b.age*8);
      if(b.age<1.1){
        ctx!.strokeStyle=palette[0];ctx!.lineWidth=2;ctx!.setLineDash([4,5]);
        ctx!.beginPath();ctx!.moveTo(b.x,b.y);ctx!.lineTo(b.tx,b.ty);ctx!.stroke();ctx!.setLineDash([]);
        rect(mx-7,my-9,14,15,0);text('!',mx-2,my+2,3);
        ctx!.save();ctx!.globalAlpha=.25;rect(b.x-9,b.y+8,19,3,0);ctx!.restore();
        drawMagpie(ctx!,b.x,b.y-12,heading,flap);
      }else{
        const p=birdPosition(b);
        ctx!.save();ctx!.globalAlpha=.25;rect(p.x-10,p.y+12,21,4,0);ctx!.restore();
        drawMagpie(ctx!,p.x,p.y,heading,flap);
      }
    }
    ctx!.restore();
    // Edge compass points to the next stop even when it is off screen.
    const tx=target.x-cx,ty=target.y-cy;
    if(tx<14||tx>370||ty<14||ty>242) {
      const angle=Math.atan2(ty-128,tx-192),scale=Math.min(168/Math.max(.001,Math.abs(Math.cos(angle))),104/Math.max(.001,Math.abs(Math.sin(angle))));
      const x=192+Math.cos(angle)*scale,y=128+Math.sin(angle)*scale;
      rect(x-8,y-8,16,16,0);text(Math.abs(Math.cos(angle))>Math.abs(Math.sin(angle))?(Math.cos(angle)>0?'>':'<'):(Math.sin(angle)>0?'v':'^'),x-2,y+3,3);
    }
    // A persistent pocket map makes the entire neighbourhood navigable.
    rect(321,5,58,45,0);rect(323,7,54,41,2);
    for(const x of [192,640,1088])rect(323+x/1280*54-1,7,2,41,1);
    for(const y of [192,480,800])rect(323,7+y/960*41-1,54,2,1);
    rect(323+target.x/1280*54-2,7+target.y/960*41-2,4,4,0);
    rect(323+ride.player.x/1280*54-1,7+ride.player.y/960*41-1,3,3,3);
  }
  function hud() {
    const signature=[ride.state,ride.lives,ride.stop,Math.floor(ride.elapsed),Math.ceil(ride.cooldown*10)].join(':');
    if(signature===lastHud)return;lastHud=signature;
    element('lives').textContent=Array.from({length:3},(_,i)=>i<ride.lives?'♥':'♡').join(' ');
    element('stops').textContent=`${Math.min(ride.stop,5)} / 5`;
    element('time').textContent=time(ride.elapsed);
    element('target').textContent=ride.state==='won'?'Made it to the park!':`Next: ${stops[Math.min(ride.stop,5)].name}`;
    element('dash').textContent=ride.cooldown>0?`Dash: ${ride.cooldown.toFixed(1)}s`:'Dash ready';
    pause.disabled=ride.state!=='playing'&&ride.state!=='paused';
    pause.textContent=ride.state==='paused'?'Resume':'Pause';
    if(ride.stop!==announcedStop){announcedStop=ride.stop;status.textContent=ride.stop===5?'All five stops! Ride north through the park gate.':`Stop reached! Next up: ${stops[Math.min(ride.stop,5)].name}.`;}
    if(ride.lives!==announcedLives){announcedLives=ride.lives;status.textContent=`Swooped! ${ride.lives} helmet ${ride.lives===1?'heart':'hearts'} left.`;}
  }
  function showOverlay() {
    overlay.hidden=ride.state==='playing';
    if(ride.state==='paused'){title.textContent='Taking a breather.';message.textContent='Your bike and the magpies are paused. Ready when you are.';start.textContent='Keep riding →';}
    if(ride.state==='lost'){title.textContent='The magpies won this round.';message.textContent=`You reached ${Math.min(ride.stop,5)} of 5 stops and dodged ${ride.dodged} swoops. Watch the dive path and save your dash for a close call.`;start.textContent='Ride again →';}
    if(ride.state==='won'){
      title.textContent='You beauty!';message.textContent=`All five stops and safely to the park in ${time(ride.elapsed)}. ${ride.dodged} swoops dodged. The picnic is yours.`;start.textContent='Another lap →';
      if(!best||ride.elapsed<best){best=ride.elapsed;try{localStorage.setItem('swoopie-boys-best',String(best));}catch{}}
      status.textContent='Made it to the park! All five stops complete.';
    }
    element('best').textContent=best?`Fastest ride: ${time(best)}`:'Three helmet hearts. One brave little cyclist.';
  }
  function begin() {
    keys.clear();
    if(ride.state==='paused')ride.state='playing';
    else {ride=newRide();ride.state='playing';announcedLives=3;announcedStop=0;status.textContent='First stop: the corner shop. Follow the flag north!';}
    showOverlay();hud();canvas!.focus({preventScroll:true});
  }
  function togglePause(){
    if(ride.state==='playing')ride.state='paused';else if(ride.state==='paused')ride.state='playing';else return;
    keys.clear();showOverlay();hud();if(ride.state==='playing')canvas!.focus({preventScroll:true});
  }
  start.addEventListener('click',begin);pause.addEventListener('click',togglePause);element('restart').addEventListener('click',()=>{ride=newRide();begin();});
  const movement:Record<string,string>={ArrowUp:'up',w:'up',ArrowDown:'down',s:'down',ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right'};
  function keydown(event:KeyboardEvent){
    if(!(document.activeElement===canvas || (event.target instanceof HTMLElement && event.target.closest('.swoopie-shell'))))return;
    const key=event.key.length===1?event.key.toLowerCase():event.key;
    if(movement[key]||key===' '||key==='p'||key==='Escape'){
      // Keep native Space activation on buttons; only the canvas owns game keys.
      if(document.activeElement!==canvas)return;
      event.preventDefault();
      if(movement[key])keys.add(movement[key]);
      else if(!event.repeat){if(key===' ')dash(ride);else togglePause();}
    }
  }
  function keyup(event:KeyboardEvent){const key=event.key.length===1?event.key.toLowerCase():event.key;if(movement[key])keys.delete(movement[key]);}
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);
  document.querySelectorAll<HTMLButtonElement>('[data-swoopie]').forEach(button=>{
    const action=button.dataset.swoopie!;
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);if(action==='dash')dash(ride);else keys.add(action);canvas!.focus({preventScroll:true});});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(action));
  });
  function blur(){keys.clear();if(ride.state==='playing')togglePause();}
  window.addEventListener('blur',blur);
  function visibility(){if(document.hidden)blur();}
  document.addEventListener('visibilitychange',visibility);
  function loop(now:number){
    const oldState=ride.state;
    stepRide(ride,last?(now-last)/1000:0,{x:Number(keys.has('right'))-Number(keys.has('left')),y:Number(keys.has('down'))-Number(keys.has('up'))});
    last=now;draw();hud();if(ride.state!==oldState)showOverlay();animation=requestAnimationFrame(loop);
  }
  showOverlay();animation=requestAnimationFrame(loop);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(animation);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);},{once:true});
}
