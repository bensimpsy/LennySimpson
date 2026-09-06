// Gentle synthesized music and golf effects; no downloads or autoplay.
export class GolfAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private timer = 0;
  private note = 0;
  muted = false;
  constructor(){try{this.muted=localStorage.getItem('mini-golf-muted')==='1';}catch{}}
  start() {
    try {
      if(!this.ctx){this.ctx=new AudioContext();this.gain=this.ctx.createGain();this.gain.gain.value=this.muted?0:1;this.gain.connect(this.ctx.destination);}
      void this.ctx.resume().catch(()=>{});
      if(!this.timer)this.timer=window.setInterval(()=>{
        const melody=[72,0,76,0,79,0,76,74,72,0,69,0,67,0,71,0];
        const midi=melody[this.note++%melody.length];if(midi)this.tone(440*2**((midi-69)/12),.8,.032,'sine');
        if(this.note%4===1)this.tone(this.note%16<8?130.81:174.61,1.4,.02,'triangle');
      },520);
    }catch{/* Audio support is optional; the course remains playable. */}
  }
  private tone(frequency:number,duration:number,volume:number,type:OscillatorType='sine',delay=0){
    if(!this.ctx||!this.gain)return;const at=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type=type;osc.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.015);gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(gain).connect(this.gain);osc.start(at);osc.stop(at+duration+.03);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  effect(event:string){if(event==='strike')this.tone(650,.08,.13,'triangle');if(event==='bounce')this.tone(230,.07,.07,'triangle');if(event==='lip')this.tone(480,.14,.06);if(event==='holed'){[523,659,784].forEach((f,i)=>this.tone(f,.3,.09,'sine',i*.12));}}
  toggle(){this.muted=!this.muted;if(this.gain&&this.ctx)this.gain.gain.setTargetAtTime(this.muted?0:1,this.ctx.currentTime,.02);try{localStorage.setItem('mini-golf-muted',this.muted?'1':'0');}catch{}}
  pause(){if(this.timer)window.clearInterval(this.timer);this.timer=0;if(this.ctx)void this.ctx.suspend().catch(()=>{});}
  dispose(){this.pause();if(this.ctx)void this.ctx.close().catch(()=>{});}
}
