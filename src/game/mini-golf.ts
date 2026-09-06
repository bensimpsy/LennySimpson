import { GolfRound, HOLES, PHYSICS_STEP } from './mini-golf-physics';
import { GolfView } from './mini-golf-view';
import { GolfAudio } from './mini-golf-audio';

export function mountMiniGolf() {
  const el = <T extends HTMLElement>(id:string)=>document.getElementById(`golf-${id}`) as T;
  const canvas=el<HTMLCanvasElement>('canvas'),audio=new GolfAudio();
  let view:GolfView;
  try{view=new GolfView(canvas);}catch{
    el('overlay-title').textContent='The course needs 3D graphics';el('overlay-message').textContent='WebGL is unavailable. Try a browser with hardware acceleration enabled.';el<HTMLButtonElement>('start').hidden=true;return;
  }
  let round=new GolfRound(),started=false,last=0,accumulator=0,animation=0,disposed=false,notice='',previousMode='',previousHole=-1;
  const keys=new Set<string>(),pointers=new Map<number,string>();
  let chargeOwner:string|null=null;
  const abort=new AbortController(),signal=abort.signal;
  const setNotice=(message:string)=>{if(notice!==message){notice=message;el('status').textContent=message;}};
  const paintMute=()=>{el('mute').textContent=audio.muted?'Sound off':'Sound on';el('mute').setAttribute('aria-pressed',String(audio.muted));};paintMute();
  function overlay(title:string,message:string,button:string){el('overlay-title').textContent=title;el('overlay-message').textContent=message;el('start').textContent=button;el('overlay').hidden=false;}
  function clearInput(){keys.clear();pointers.clear();chargeOwner=null;round.cancelCharge();}
  function paint() {
    el('hole').textContent=`${round.holeIndex+1} / 3`;
    el('total').textContent=String(round.total);el('attempts').textContent=String(round.attempts[round.holeIndex]);
    el('name').textContent=HOLES[round.holeIndex].name;el('hint').textContent=HOLES[round.holeIndex].hint;
    const power=round.mode==='charging'?round.power:round.mode==='swinging'||round.mode==='rolling'?round.shotPower:0;
    el('power-fill').style.transform=`scaleX(${power})`;el('power').setAttribute('aria-valuenow',String(Math.round(power*100)));el('power-number').textContent=`${Math.round(power*100)}%`;
    const unlocked=started&&!round.paused&&(round.mode==='aim'||round.mode==='charging');
    document.querySelectorAll<HTMLButtonElement>('[data-golf-control]').forEach(b=>b.disabled=!unlocked);
    el<HTMLButtonElement>('pause').disabled=!started||round.mode==='complete';el('pause').textContent=round.paused?'Resume':'Pause';
    el('swing-label').textContent=round.mode==='charging'?'Release to putt':round.mode==='rolling'?'Ball in play':'Hold to swing';
    document.querySelectorAll<HTMLElement>('[data-golf-result]').forEach((item,i)=>item.textContent=String(round.attempts[i]));
    if(previousMode!==round.mode||previousHole!==round.holeIndex){
      if(round.mode==='aim')setNotice('Aim with ← →. Hold Space, then release to putt.');
      if(round.mode==='charging')setNotice('Release when the power feels right. You can still adjust your aim.');
      if(round.mode==='rolling')setNotice('Ball in play…');
      if(round.mode==='missed')setNotice('Not quite! Returning to the tee. Your attempts still count.');
      if(round.mode==='holed')setNotice(`Hole in one! Hole ${round.holeIndex+1} completed in ${round.attempts[round.holeIndex]} ${round.attempts[round.holeIndex]===1?'attempt':'attempts'}.`);
      previousMode=round.mode;previousHole=round.holeIndex;
    }
  }
  function begin() {
    if(round.mode==='complete'){round=new GolfRound();previousMode='';previousHole=-1;}
    started=true;round.resume();clearInput();audio.start();el('overlay').hidden=true;el('results').hidden=true;
    canvas.focus({preventScroll:true});paint();
  }
  function pause(){
    if(!started||round.mode==='complete')return;
    if(round.paused){begin();return;}
    clearInput();round.pause();audio.pause();overlay('A little break', 'Your hole and attempts are saved for this round.', 'Resume round →');paint();
  }
  el('start').addEventListener('click',begin,{signal});
  el('pause').addEventListener('click',pause,{signal});
  el('restart').addEventListener('click',()=>{round=new GolfRound();previousMode='';previousHole=-1;begin();},{signal});
  el('mute').addEventListener('click',()=>{audio.toggle();paintMute();},{signal});
  function charge(owner:string){if(!started||round.paused||round.mode!=='aim')return;chargeOwner=owner;audio.start();round.charge();}
  window.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLButtonElement||e.target instanceof HTMLInputElement)return;
    if(e.code==='KeyP'&&!e.repeat){pause();return;}
    if(!started||round.paused)return;
    if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    if(e.code==='ArrowLeft'||e.code==='ArrowRight')keys.add(e.code);
    if(e.code==='Space'&&!e.repeat)charge('keyboard');
  },{signal});
  window.addEventListener('keyup',e=>{
    keys.delete(e.code);
    if(e.code==='Space'&&chargeOwner==='keyboard'){e.preventDefault();round.release();chargeOwner=null;}
  },{signal});
  document.querySelectorAll<HTMLButtonElement>('[data-golf-control]').forEach(button=>{
    const action=button.dataset.golfControl!;
    button.addEventListener('pointerdown',e=>{
      if(button.disabled)return;e.preventDefault();button.setPointerCapture(e.pointerId);pointers.set(e.pointerId,action);
      if(action==='swing')charge(`pointer-${e.pointerId}`);
    },{signal});
    button.addEventListener('pointerup',e=>{
      if(chargeOwner===`pointer-${e.pointerId}`){round.release();chargeOwner=null;}pointers.delete(e.pointerId);
    },{signal});
    for(const event of ['pointercancel','lostpointercapture'])button.addEventListener(event,e=>{
      const id=(e as PointerEvent).pointerId;
      if(chargeOwner===`pointer-${id}`){round.cancelCharge();chargeOwner=null;}pointers.delete(id);
    },{signal});
    button.addEventListener('keydown',e=>{
      if(e.code==='Space'){e.preventDefault();if(action==='swing'&&!e.repeat)charge('button');}
      if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();keys.add(e.code);}
    },{signal});
    button.addEventListener('keyup',e=>{if(e.code==='Space'&&chargeOwner==='button'){e.preventDefault();round.release();chargeOwner=null;}},{signal});
    button.addEventListener('click',e=>{if(e.detail===0&&action!=='swing')round.aim(action==='left'?-1:1,.07);},{signal});
  });
  window.addEventListener('blur',()=>{if(started&&!round.paused)pause();},{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!round.paused)pause();},{signal});
  function frame(now:number){
    if(disposed)return;const dt=Math.min((now-last)/1000||0,.05);last=now;
    if(started&&!round.paused&&round.mode!=='complete'){
      accumulator+=dt;
      while(accumulator>=PHYSICS_STEP){
        accumulator-=PHYSICS_STEP;
        const held=[...pointers.values()];
        const direction=Number(keys.has('ArrowRight')||held.includes('right'))-Number(keys.has('ArrowLeft')||held.includes('left'));
        round.aim(direction,PHYSICS_STEP);const event=round.step(PHYSICS_STEP);
        if(event)audio.effect(event);
        if(event==='complete'){
          clearInput();audio.pause();
          overlay(round.total===3?'A perfect round!':'Round complete!',`${round.total} total attempts. Lower is better. Three is a perfect round.`, 'Play again →');
          el('results').hidden=false;setNotice(`Round complete in ${round.total} attempts.`);
          break;
        }
      }
    }else accumulator=0;
    paint();view.render(round);animation=requestAnimationFrame(frame);
  }
  window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(animation);abort.abort();audio.dispose();view.dispose();},{once:true});
  // Restore a usable page if the browser brings this document back from its cache.
  window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
  paint();animation=requestAnimationFrame(frame);
}
