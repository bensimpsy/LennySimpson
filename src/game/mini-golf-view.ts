import * as THREE from 'three';
import { BALL_RADIUS, CUP_RADIUS, HOLES, surface, type GolfRound } from './mini-golf-physics';

export class GolfView {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-10, 10, 8, -8, .1, 100);
  course = new THREE.Group();
  ball: THREE.Mesh;
  golfer = new THREE.Group();
  swing = new THREE.Group();
  aimLine: THREE.Line;
  holeIndex = -1;
  observer: ResizeObserver;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color('#b8dce3');
    this.scene.add(new THREE.HemisphereLight('#fff9e8', '#729967', 2.5));
    const sun = new THREE.DirectionalLight('#fff4d9', 3);sun.position.set(-8, 16, 6);sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);Object.assign(sun.shadow.camera, { left:-14, right:14, top:14, bottom:-14 });sun.shadow.bias = -.0005;
    this.scene.add(sun);this.scene.add(this.course);
    this.camera.position.set(7, 17, 20);this.camera.lookAt(0, .2, 0);
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 24, 16), new THREE.MeshStandardMaterial({ color:'#fffef5', roughness:.3 }));
    this.ball.castShadow = true;this.scene.add(this.ball);
    this.aimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]), new THREE.LineDashedMaterial({color:'#fff9c9',dashSize:.16,gapSize:.12}));
    this.scene.add(this.aimLine);
    this.makeGolfer();this.scene.add(this.golfer);
    this.observer = new ResizeObserver(() => this.resize(canvas));this.observer.observe(canvas);
    this.resize(canvas);
  }
  private material(color: string) { return new THREE.MeshStandardMaterial({color,roughness:.82}); }
  private box(parent: THREE.Object3D, size: number[], position: number[], color: string) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]), this.material(color));
    mesh.position.set(...position as [number,number,number]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  private sphere(parent: THREE.Object3D, r:number, position:number[], color:string) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r,16,12),this.material(color));m.position.set(...position as [number,number,number]);m.castShadow=true;parent.add(m);return m;
  }
  private limb(parent: THREE.Object3D, a: number[], b: number[], r:number, color:string) {
    const start=new THREE.Vector3(...a as [number,number,number]),end=new THREE.Vector3(...b as [number,number,number]);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,start.distanceTo(end),10),this.material(color));
    mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());mesh.castShadow=true;parent.add(mesh);return mesh;
  }
  private makeGolfer() {
    // Club and both arms share a pivot, so the hands remain on the grip.
    this.limb(this.golfer,[-.68,.12,-.2],[-.66,.72,-.16],.095,'#eee8d8');
    this.limb(this.golfer,[-.68,.12,.22],[-.66,.72,.17],.095,'#eee8d8');
    this.box(this.golfer,[.27,.13,.32],[-.62,.08,-.2],'#f9f7ef');this.box(this.golfer,[.27,.13,.32],[-.62,.08,.25],'#f9f7ef');
    const torso=this.box(this.golfer,[.35,.5,.49],[-.62,.97,0],'#d36642');torso.rotation.z=.15;
    this.sphere(this.golfer,.205,[-.54,1.42,0],'#bd865f');
    this.sphere(this.golfer,.21,[-.55,1.5,0],'#244e48');this.box(this.golfer,[.28,.05,.42],[-.34,1.52,0],'#244e48');
    this.swing.position.set(-.47,1.14,0);this.golfer.add(this.swing);
    this.limb(this.swing,[-.1,0,-.2],[.16,-.37,-.02],.065,'#bd865f');
    this.limb(this.swing,[-.1,0,.2],[.16,-.37,.02],.065,'#bd865f');
    this.sphere(this.swing,.075,[.16,-.37,0],'#f9f7ef');
    this.limb(this.swing,[.16,-.3,0],[.45,-1.01,0],.021,'#bbc6c8');
    this.limb(this.swing,[.16,-.3,0],[.23,-.47,0],.028,'#213d3e');
    this.box(this.swing,[.34,.105,.10],[.47,-1.04,.015],'#657d83');
  }
  private resize(canvas: HTMLCanvasElement) {
    const width=canvas.clientWidth,height=canvas.clientHeight;if(!width||!height)return;
    this.renderer.setSize(width,height,false);
    // Fit the entire board and golfer at every aspect ratio; no ball-following.
    this.camera.updateMatrixWorld();
    const bounds=new THREE.Box3();
    for(const x of [-4.2,4.2])for(const y of [-.5,2])for(const z of [-7.6,7.6])bounds.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(this.camera.matrixWorldInverse));
    const aspect=width/height,half=Math.max(Math.max(Math.abs(bounds.min.y),Math.abs(bounds.max.y))+.35,(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x))+.35)/aspect);
    this.camera.left=-half*aspect;this.camera.right=half*aspect;this.camera.top=half;this.camera.bottom=-half;this.camera.updateProjectionMatrix();
  }
  private clearCourse() {
    this.course.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const mats=Array.isArray(object.material)?object.material:[object.material];mats.forEach(m=>m.dispose());}});
    this.course.clear();
  }
  loadHole(index:number) {
    this.holeIndex=index;this.clearCourse();const hole=HOLES[index];
    this.box(this.course,[90,.2,90],[0,-.72,0],'#83ae78');
    this.box(this.course,[7.7,.28,14.9],[0,-.48,0],'#e7d4ad');
    this.box(this.course,[7.1,.36,14.3],[0,-.23,0],'#376f51');
    // Mown turf follows the exact physical ramp profile.
    const zs=[-7,-1.4,.3,2,7,...Array.from({length:29},(_,i)=>-7+i*.5)].sort((a,b)=>a-b).filter((v,i,a)=>i===0||v!==a[i-1]);
    zs.slice(0,-1).forEach((z,i)=>{
      const end=zs[i+1],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-3.4,surface(hole,z).height,z,3.4,surface(hole,z).height,z,-3.4,surface(hole,end).height,end,3.4,surface(hole,end).height,end],3));g.setIndex([0,2,1,1,2,3]);g.computeVertexNormals();
      const m=new THREE.Mesh(g,this.material(Math.floor((z+7)*2)%2?'#438b57':'#49935d'));m.receiveShadow=true;this.course.add(m);
      for(const x of [-3.52,3.52])this.box(this.course,[.24,.22,end-z+.01],[x,(surface(hole,z).height+surface(hole,end).height)/2+.09,(z+end)/2],'#efe8d5');
    });
    for(const z of [-7.12,7.12])this.box(this.course,[7.28,.22,.24],[0,.09,z],'#efe8d5');
    for(const wall of hole.walls){
      const rail = new THREE.Group();rail.position.set(wall.x,surface(hole,wall.z).height,wall.z);rail.rotation.y=wall.rotation||0;this.course.add(rail);
      this.box(rail,[wall.width,.3,wall.depth],[0,.15,0],'#ccae82');
      this.box(rail,[wall.width,.055,wall.depth],[0,.3275,0],'#f4e8cf');
    }
    for(const bumper of hole.bumpers || []) {
      const y=surface(hole,bumper.z).height,height=bumper.style==='gate'?.85:.32;
      const base=new THREE.Mesh(new THREE.CylinderGeometry(bumper.radius,bumper.radius,height,40),this.material('#ccae82'));
      base.position.set(bumper.x,y+height/2,bumper.z);base.castShadow=true;base.receiveShadow=true;this.course.add(base);
      if(bumper.style==='planter') {
        const soil=new THREE.Mesh(new THREE.CircleGeometry(bumper.radius-.06,32),this.material('#614b36'));
        soil.rotation.x=-Math.PI/2;soil.position.set(bumper.x,y+height+.003,bumper.z);this.course.add(soil);
        const edging=new THREE.Mesh(new THREE.TorusGeometry(bumper.radius-.035,.035,8,40),this.material('#f1dfbd'));
        edging.rotation.x=Math.PI/2;edging.position.set(bumper.x,y+height,bumper.z);this.course.add(edging);
        for(let i=0;i<7;i++) {
          const angle=i*Math.PI*2/7,x=bumper.x+Math.cos(angle)*bumper.radius*.55,z=bumper.z+Math.sin(angle)*bumper.radius*.55;
          this.sphere(this.course,.14,[x,y+height+.075,z],'#4f7845');
          this.sphere(this.course,.09,[x,y+height+.19,z],i%2?'#f3bf53':'#d87977');
        }
      }
    }
    const gatePosts=(hole.bumpers || []).filter(b=>b.style==='gate');
    if(gatePosts.length===2) {
      const [left,right]=gatePosts,centerX=(left.x+right.x)/2,halfWidth=(right.x-left.x)/2;
      const points=Array.from({length:25},(_,i)=>{
        const angle=Math.PI-i*Math.PI/24;
        return new THREE.Vector3(centerX+Math.cos(angle)*halfWidth,.85+Math.sin(angle)*.7,left.z);
      });
      const arch=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.11,10,false),this.material('#f1dfbd'));
      arch.castShadow=true;this.course.add(arch);
    }
    // The dark well sits under a thin metal rim; the ball visibly drops inside.
    const cup=new THREE.Mesh(new THREE.CircleGeometry(CUP_RADIUS,40),this.material('#102e27'));cup.rotation.x=-Math.PI/2;cup.position.set(hole.cup.x,.012,hole.cup.z);this.course.add(cup);
    const rim=new THREE.Mesh(new THREE.RingGeometry(CUP_RADIUS,CUP_RADIUS+.027,40),this.material('#b8ccbc'));rim.rotation.x=-Math.PI/2;rim.position.set(hole.cup.x,.017,hole.cup.z);this.course.add(rim);
    this.limb(this.course,[hole.cup.x,0,hole.cup.z],[hole.cup.x,1.7,hole.cup.z],.021,'#f2eee0');
    const flagShape=new THREE.Shape();flagShape.moveTo(0,0);flagShape.lineTo(.65,-.15);flagShape.lineTo(0,-.36);flagShape.closePath();
    const flag=new THREE.Mesh(new THREE.ShapeGeometry(flagShape),new THREE.MeshStandardMaterial({color:'#cf593e',side:THREE.DoubleSide}));flag.position.set(hole.cup.x,1.7,hole.cup.z);this.course.add(flag);
    // A few garden details keep the playing surface uncluttered.
    for(const [x,z] of [[-5,-5],[5,-3],[-5,4],[5,5]]){
      this.limb(this.course,[x,-.6,z],[x,1,z],.13,'#816449');this.sphere(this.course,.8,[x,1.45,z],'#3b7350');this.sphere(this.course,.6,[x+.4,1.2,z+.1],'#4b8754');
      for(let i=0;i<3;i++)this.sphere(this.course,.12,[x+.9+i*.17,-.4,z+.2],'#e7b958');
    }
    this.box(this.course,[.5,.12,1.6],[5,-.12,.5],'#ae7a4a');for(const z of [-.1,1.1])this.box(this.course,[.3,.4,.16],[5,-.35,z],'#486e53');
  }
  render(round: GolfRound) {
    if(this.holeIndex!==round.holeIndex)this.loadHole(round.holeIndex);
    const hole=HOLES[round.holeIndex],b=round.ball;
    const sinking=round.mode==='holed'||round.mode==='complete';
    const settle=sinking?Math.min(1,round.timer/.18):0;
    this.ball.position.set(b.x+(hole.cup.x-b.x)*settle,surface(hole,b.z).height+BALL_RADIUS-(sinking?Math.min(.42,round.timer*.6):0),b.z+(hole.cup.z-b.z)*settle);
    this.ball.visible=!sinking||round.timer<.5;
    this.ball.rotation.x+=b.vz/1000;this.ball.rotation.z-=b.vx/1000;
    this.golfer.position.set(hole.tee.x,surface(hole,hole.tee.z).height,hole.tee.z+.1);this.golfer.rotation.y=-round.angle;
    this.swing.rotation.x=round.mode==='charging'?-round.power*.85:round.mode==='swinging'?-round.shotPower*.85*(1-round.timer/.22):round.mode==='rolling'?.24:0;
    if(round.mode==='holed')this.golfer.position.y+=Math.sin(Math.min(1,round.timer)*Math.PI)*.16;
    const aim=round.mode==='aim'||round.mode==='charging';this.aimLine.visible=aim;
    if(aim){
      const direction=new THREE.Vector3(Math.sin(round.angle),0,-Math.cos(round.angle));
      const origin=new THREE.Vector3(b.x,.15,b.z),points=[origin.clone().addScaledVector(direction,.22),origin.clone().addScaledVector(direction,1.5)];
      this.aimLine.geometry.setFromPoints(points);this.aimLine.computeLineDistances();
    }
    this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.observer.disconnect();this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});this.renderer.dispose();}
}
