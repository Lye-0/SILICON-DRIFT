/* Deterministic, continuous X/Z chunk streaming. The board never nests into itself.
   Distant chunks are disposed. Floating-origin rebasing keeps GPU coordinates small. */
(() => {
  'use strict';
  const {rng,hash,valueNoise,clamp}=SD.math;
  const SIZE=32;
  const BUS_X=[[-16,-8.4],[-10,-8.4],[-8,-6.4],[3,-6.4],[5,-8.4],[16,-8.4]];
  const BUS_Z=[[-8.4,-16],[-8.4,-11],[-6.4,-9],[-6.4,2],[-8.4,4],[-8.4,16]];
  const C={
    black:[.021,.027,.030], ceramic:[.075,.079,.073], substrate:[.028,.042,.042],
    darkMetal:[.15,.18,.19],silver:[.50,.55,.58],bright:[.7,.74,.76],
    copper:[.36,.19,.075],gold:[.43,.32,.15],body:[.065,.078,.082],
    warm:[.25,.19,.12]
  };
  function layout(cx,cz,seed,density=1){
    const random=rng(hash(cx,cz,seed)),parts=[];
    const biome=valueNoise(cx*.22,cz*.22,seed+771);
    for(let iz=0;iz<4;iz++)for(let ix=0;ix<4;ix++){
      const x=-12+ix*8+(random()-.5)*1.1,z=-12+iz*8+(random()-.5)*1.1;
      const skip=1-clamp((.66+biome*.33)*density,.28,.97);
      if(random()<skip)continue;
      const pick=random();
      let type=pick<.24?0:pick<.35?1:pick<.55?2:pick<.60?3:pick<.70?4:pick<.85?5:pick<.93?6:7;
      if(biome>.7&&random()>.45)type=2;
      if(biome<.25&&random()>.45)type=1;
      const angle=random()>.5?Math.PI/2:0;
      const w=3.5+random()*1.8,d=3.4+random()*1.8,h=.38+random()*.54;
      parts.push({type,x,z,angle,w,d,h,variant:random(),id:Math.floor(random()*999)});
    }
    if(cx===0&&cz===0){
      const i=parts.findIndex(p=>p.x>0&&p.x<8&&p.z>0&&p.z<8);if(i>=0)parts.splice(i,1);
      parts.push({type:0,x:4,z:4,angle:0,w:6,d:6,h:.75,variant:.82,id:808});
      const j=parts.findIndex(p=>p.x>8&&p.z<0&&p.z>-8);if(j>=0)parts.splice(j,1);
      parts.push({type:1,x:12,z:-4,angle:Math.PI/2,w:4.8,d:5.2,h:3.9,variant:.8,id:404});
    }
    return {parts,biome};
  }
  class Chunk {
    constructor(world,cx,cz){
      this.world=world;this.cx=cx;this.cz=cz;this.raw={box:[],bevel:[],cylinder:[],torus:[]};
      this.labelRaw=[];this.paths=[];this.components=[];
      const seed=world.seed,r=this.random=rng(hash(cx,cz,seed+14));
      const l=layout(cx,cz,seed,world.density);this.biome=l.biome;
      this.surface=this.drawSurface(l.parts);
      for(const p of l.parts){this.buildComponent(p);this.components.push(p);}
      this.populateDetails(l.parts);
      // Identical boundary lanes meet their neighbours, so no visible tile edges exist.
      this.addPath(BUS_X,r(),.039);
      this.addPath(BUS_Z,r(),.038);
      for(let k=0;k<3;k++){
        const x=-14+r()*28,z=-14+r()*28;
        const dx=(r()>.5?1:-1)*(2+r()*6),dz=(r()>.5?1:-1)*(2+r()*6);
        this.addPath([[x,z],[clamp(x+dx,-15,15),z],[clamp(x+dx+Math.sign(dx)*1.4,-15,15),clamp(z+Math.sign(dz)*1.4,-15,15)],[clamp(x+dx+Math.sign(dx)*1.4,-15,15),clamp(z+dz,-15,15)]],r(),.041);
      }
      const renderer=world.renderer;
      this.texture=renderer.makeTexture(this.surface);
      this.plane=renderer.createBatch('plane',[0,0,0,SIZE,1,SIZE,1,0,1,1,1,.5,.2,0,0,0]);
      this.batches={};
      for(const [type,data]of Object.entries(this.raw))if(data.length)this.batches[type]=renderer.createBatch(type,data);
      this.labels=this.labelRaw.length?renderer.createBatch('plane',this.labelRaw):null;
      this.signals=renderer.createSignals(this.paths);
      this.instanceCount=Object.values(this.raw).reduce((n,a)=>n+a.length/16,0);
      this.raw=null;this.paths=null;this.surface.width=1;this.surface.height=1;this.surface=null;
    }
    add(type,x,y,z,sx,sy,sz,color=C.black,rough=.4,metal=.1,angle=0,emission=[0,0,0]){
      this.raw[type].push(x,y,z,sx,sy,sz,Math.cos(angle),Math.sin(angle),...color,rough,metal,...emission);
    }
    label(x,y,z,w,d,angle){this.labelRaw.push(x,y,z,w,1,d,Math.cos(angle),Math.sin(angle),1,1,1,.6,0,0,0,0);}
    buildComponent(p){
      const {x,z,w,d,angle}=p,r=this.random;
      const transformed=(lx,lz)=>[x+lx*Math.cos(angle)+lz*Math.sin(angle),z-lx*Math.sin(angle)+lz*Math.cos(angle)];
      const b=(type,lx,y,lz,sx,sy,sz,color,rough,metal,rot=0,emit)=>{
        const [px,pz]=transformed(lx,lz);this.add(type,px,y,pz,sx,sy,sz,color,rough,metal,angle+rot,emit);
      };
      const chip=(cx,cz,cw,cd,ch,count,label=false)=>{
        b('bevel',cx,.11,cz,cw+.34,.2,cd+.34,C.substrate,.65,.12);
        b('bevel',cx,.2+ch/2,cz,cw,ch,cd,C.black,.48,.2);
        for(let side=0;side<4;side++){
          const sideLength=side%2?cd:cw,spread=(sideLength-.35)/count;
          for(let i=0;i<count;i++){
            const t=(i-(count-1)/2)*spread;
            if(side===0||side===2){
              const sign=side===0?1:-1;
              b('box',cx+t,.14,cz+sign*(cd/2+.26),.12,.08,.55,C.silver,.26,.85);
              b('box',cx+t,.27,cz+sign*(cd/2+.07),.12,.26,.11,C.silver,.26,.85);
            }else{
              const sign=side===1?1:-1;
              b('box',cx+sign*(cw/2+.26),.14,cz+t,.55,.08,.12,C.silver,.26,.85);
              b('box',cx+sign*(cw/2+.07),.27,cz+t,.11,.26,.12,C.silver,.26,.85);
            }
          }
        }
        if(label){const [xx,zz]=transformed(cx,cz);this.label(xx,.206+ch,zz,cw*.85,cd*.85,angle);}
        b('cylinder',cx-cw*.37,.208+ch,cz+cd*.37,.11,.007,.11,C.darkMetal,.8,.2);
      };
      switch(p.type){
        case 0: {
          chip(0,0,w,d,p.h,Math.floor(w*3),true);
          if(p.variant>.7){
            b('bevel',0,.29+p.h,0,w*.48,.14,d*.48,C.darkMetal,.24,.82);
            const [xx,zz]=transformed(0,0);this.label(xx,.367+p.h,zz,w*.43,d*.43,angle);
            for(let k=-1;k<=1;k+=2){
              b('box',k*w*.38,.21+p.h,0,.055,.018,d*.62,C.gold,.5,.7,0,[.17,.045,.008]);
            }
          }
          break;
        }
        case 1: { // Extruded, staggered heat-sink fins.
          const height=p.h<1?1.8+p.variant*2.8:p.h;
          b('bevel',0,.32,0,w,.62,d,C.darkMetal,.3,.85);
          const n=11;
          for(let k=0;k<n;k++){
            const fx=(k-(n-1)/2)*(w-.22)/(n-1);
            b('bevel',fx,.58+height/2,0,.16,height,d*.96,C.darkMetal,.24,.92);
            b('box',fx,.59+height,0,.10,.025,d*.91,C.silver,.25,.9);
          }
          for(const ox of [-w*.45,w*.45])for(const oz of [-d*.44,d*.44])
            b('cylinder',ox,.69,oz,.19,.12,.19,C.silver,.22,.95);
          break;
        }
        case 2: { // Electrolytic capacitors: ferrules, rolled edges, scored metal tops.
          const n=p.variant>.45?5:3;
          for(let j=0;j<n;j++){
            const lx=(j%2-.5)*1.9,lz=(Math.floor(j/2)-.7)*1.9,diam=1.15+r()*.34,height=1.7+r()*2.3;
            b('cylinder',lx,.16,lz,diam*1.09,.26,diam*1.09,C.darkMetal,.38,.9);
            b('cylinder',lx,height/2+.21,lz,diam,height,diam,C.body,.3,.62);
            b('cylinder',lx,height+.2,lz,diam*1.025,.12,diam*1.025,C.silver,.25,.95);
            b('cylinder',lx,height+.27,lz,diam*.86,.045,diam*.86,C.silver,.28,.9);
            b('box',lx,height+.299,lz,diam*.67,.014,.025,C.black,.9,.1);
            b('box',lx,height+.300,lz,.025,.014,diam*.67,C.black,.9,.1);
            b('cylinder',lx,.38,lz,diam*1.015,.08,diam*1.015,C.silver,.35,.85);
          }
          break;
        }
        case 3: { // Copper-wound power inductor and regulator package.
          b('bevel',-.4,.26,0,3.7,.5,3.7,C.black,.5,.2);
          b('torus',-.4,1.05,0,3.2,3.5,3.2,C.copper,.31,.85);
          b('torus',-.4,1.1,0,1.7,2.1,1.7,C.black,.5,.3);
          for(let k=0;k<17;k++){
            const a=k/17*Math.PI*2;
            b('bevel',-.4+Math.cos(a)*1.20,1.13,Math.sin(a)*1.20,.095,.85,.78,C.copper,.3,.85,Math.PI/2-a);
          }
          chip(2.25,-1.6,.9,1.4,.37,4);
          break;
        }
        case 4: { // Open female connector + twin rows of plated pins.
          b('bevel',0,.46,0,w,.85,2.15,C.black,.5,.16);
          b('box',0,.89,0,w-.35,.08,1.6,C.substrate,.8,.0);
          b('box',0,1.04,-.99,w,.34,.18,C.body,.5,.2);
          b('box',0,1.04,.99,w,.34,.18,C.body,.5,.2);
          b('box',-w/2+.12,1.05,0,.25,.35,2,C.body,.5,.2);
          b('box',w/2-.12,1.05,0,.25,.35,2,C.body,.5,.2);
          for(let i=0;i<9;i++)for(const j of [-1,1]){
            const xx=(i-4)*(w-.8)/8;
            b('box',xx,1.15,j*.46,.12,.53,.12,C.gold,.22,.9);
            b('box',xx,.1,j*1.22,.12,.12,.55,C.silver,.27,.9);
          }
          break;
        }
        case 5: { // Parallel memory banks.
          for(let k=-1;k<=1;k++)chip(k*1.75,0,1.15,4.6,.43,10,false);
          const [xx,zz]=transformed(0,0);this.label(xx,.641,zz,.92,3.8,angle);
          break;
        }
        case 6: { // Shielded crystal oscillator and a compact logic array.
          b('bevel',-1.25,.18,-.6,2.6,.25,3.4,C.darkMetal,.4,.9);
          b('bevel',-1.25,.6,-.6,2.3,.72,3.1,C.silver,.27,.9);
          const [xx,zz]=transformed(-1.25,-.6);this.label(xx,.967,zz,1.9,2.5,angle);
          chip(1.65,1.05,1.5,1.9,.38,5);
          for(let i=0;i<3;i++)b('cylinder',.9+i*.85,.6,-1.5,.56,1.1,.56,C.body,.35,.4);
          break;
        }
        default: { // Power MOSFETs: mounting eyelets, metal tabs, three leads.
          for(let j=-1;j<=1;j++){
            b('bevel',j*1.65,1.05,0,1.18,1.85,.84,C.black,.45,.3);
            b('bevel',j*1.65,1.64,-.46,1.14,1.24,.12,C.silver,.27,.85);
            b('cylinder',j*1.65,2.27,-.47,.31,.027,.31,C.black,.8,.1);
            for(let k=-1;k<=1;k++)b('box',j*1.65+k*.3,.13,.78,.1,.11,1.0,C.silver,.28,.9);
          }
        }
      }
    }
    populateDetails(parts){
      const r=this.random;
      for(let n=0;n<92*this.world.density;n++){
        const x=-15+r()*30,z=-15+r()*30;
        const blocked=parts.some(p=>Math.abs(p.x-x)<3.45&&Math.abs(p.z-z)<3.45);
        if(blocked)continue;
        const a=r()>.5?Math.PI/2:0,ct=1+Math.floor(r()*4);
        for(let k=0;k<ct;k++){
          const xx=x+(a?0:k*.44),zz=z+(a?k*.44:0);
          if(Math.abs(xx)>15.6||Math.abs(zz)>15.6)continue;
          const color=r()>.74?C.warm:C.black;
          this.add('box',xx,.1,zz,.31,.15,.76,C.silver,.3,.82,a);
          this.add('bevel',xx,.21,zz,.33,.22,.48,color,.62,.03,a);
        }
      }
      for(let k=0;k<3;k++){
        const x=-14+r()*28,z=-14+r()*28;
        if(parts.some(p=>Math.abs(p.x-x)<3.3&&Math.abs(p.z-z)<3.3))continue;
        this.add('box',x,.08,z,.65,.12,.35,C.darkMetal,.4,.8);
        const e=r()>.8?[.1,.9,1.5]:[2.8,.37,.05];
        this.add('bevel',x,.20,z,.30,.16,.24,[.2,.16,.10],.2,.2,0,e);
      }
    }
    drawSurface(parts){
      const res=this.world.textureSize,canvas=document.createElement('canvas');canvas.width=canvas.height=res;
      const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas2Dのメモリーを確保できませんでした。');
      const scale=res/SIZE,r=rng(hash(this.cx,this.cz,this.world.seed+923));
      ctx.fillStyle='#080c0e';ctx.fillRect(0,0,res,res);
      const coord=v=>(v+16)*scale;
      const path=(pts,color='#283236',width=.030)=>{
        ctx.strokeStyle=color;ctx.lineWidth=width*scale;ctx.beginPath();
        pts.forEach(([x,z],i)=>i?ctx.lineTo(coord(x),coord(z)):ctx.moveTo(coord(x),coord(z)));ctx.stroke();
      };
      const via=(x,z,size=.072)=>{
        ctx.strokeStyle='#45504b';ctx.lineWidth=.029*scale;ctx.beginPath();ctx.arc(coord(x),coord(z),size*scale,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle='#020405';ctx.beginPath();ctx.arc(coord(x),coord(z),size*.46*scale,0,Math.PI*2);ctx.fill();
      };
      // Continuous micro-copper weave, very low contrast.
      ctx.strokeStyle='#0b1113';ctx.lineWidth=.025*scale;
      for(let i=0;i<SIZE/.5;i++){
        const t=i*.5*scale;ctx.beginPath();ctx.moveTo(t,0);ctx.lineTo(t,res);ctx.stroke();
        ctx.beginPath();ctx.moveTo(0,t);ctx.lineTo(res,t);ctx.stroke();
      }
      // Multi-lane buses wrap across chunk boundaries at fixed edge coordinates.
      for(let lane=0;lane<8;lane++){
        const off=lane*.13;
        path(BUS_X.map(([x,z])=>[x,z+off]),lane%3?'#263135':'#3c3830',.031);
        path(BUS_Z.map(([x,z])=>[x+off,z]),'#273135',.033);
        path([[-16,8.1+off],[1,8.1+off],[3,10.1+off],[10,10.1+off],[12,8.1+off],[16,8.1+off]],'#252f32',.026);
      }
      for(let k=0;k<90;k++){
        const x=-15.7+r()*31.4,z=-15.7+r()*31.4,l=.4+r()*5,d=r()>.5?1:-1;
        const pts=[[x,z],[clamp(x+l*.5,-15.8,15.8),z],[clamp(x+l*.5+Math.min(l*.5,.8),-15.8,15.8),clamp(z+d*Math.min(l*.5,.8),-15.8,15.8)],[clamp(x+l,-15.8,15.8),clamp(z+d*Math.min(l*.5,.8),-15.8,15.8)]];
        path(pts,r()>.75?'#3f3c30':'#263136',.027+r()*.018);via(...pts[pts.length-1],.06);
      }
      for(const p of parts){
        const {x,z,w,d,angle}=p;
        const point=(a,b)=>[x+a*Math.cos(angle)+b*Math.sin(angle),z-a*Math.sin(angle)+b*Math.cos(angle)];
        // Ground-contact darkening is baked; nearby solids also receive real shadows.
        ctx.save();ctx.translate(coord(x),coord(z));ctx.rotate(-angle);
        ctx.shadowColor='#000';ctx.shadowBlur=scale*.38;ctx.fillStyle='#030607';
        ctx.fillRect(-w*scale/2,-d*scale/2,w*scale,d*scale);ctx.restore();
        if(p.type===0||p.type===5||p.type===6){
          const n=Math.floor(w*3),spread=(w-.35)/n;
          for(let side=0;side<4;side++)for(let j=0;j<n;j++){
            const t=(j-(n-1)/2)*spread,extension=.75+(j%4)*.12,sign=side<2?1:-1;
            let pts;
            if(side%2===0)pts=[[t,sign*(d/2+.18)],[t,sign*(d/2+.64)],[t+Math.sign(t)*.52,sign*(d/2+1.16)],[t+Math.sign(t)*.52,sign*(d/2+extension+1)]];
            else pts=[[sign*(w/2+.18),t],[sign*(w/2+.64),t],[sign*(w/2+1.16),t+Math.sign(t)*.52],[sign*(w/2+extension+1),t+Math.sign(t)*.52]];
            pts=pts.map(q=>point(...q));path(pts,'#354044',.029);via(...pts[pts.length-1],.062);
          }
        }
        // Silkscreen corner marks and reference identifiers.
        const border=3.45;
        for(const sx of [-1,1])for(const sz of [-1,1]){
          const xx=x+sx*border,zz=z+sz*border;
          path([[xx-sx*.42,zz],[xx,zz],[xx,zz-sz*.42]],'#3c4646',.027);
        }
        ctx.fillStyle='#536063';ctx.font=`${Math.round(scale*.25)}px monospace`;
        ctx.fillText(['U','HS','C','L','J','U','Y','Q'][p.type]+String(p.id).padStart(3,'0'),coord(x-2.7),coord(z-3.55));
        if(p.type===0){ctx.fillStyle='#455050';ctx.fillText('SILICON / '+String(this.world.seed).slice(-4),coord(x-2.6),coord(z+3.73));}
      }
      for(let i=0;i<110;i++)via(-15.5+r()*31,-15.5+r()*31,.044+r()*.037);
      // Small, sparse test pads make close-ups feel manufactured rather than abstract.
      for(let i=0;i<18;i++){
        const x=-15+r()*30,z=-15+r()*30;
        if(parts.some(p=>Math.abs(p.x-x)<3.3&&Math.abs(p.z-z)<3.3))continue;
        ctx.fillStyle='#4c4531';ctx.fillRect(coord(x),coord(z),.19*scale,.31*scale);
        ctx.fillStyle='#374245';ctx.font=`${Math.round(scale*.18)}px monospace`;ctx.fillText('TP'+i,coord(x+.25),coord(z+.22));
      }
      return canvas;
    }
    addPath(points,phase,width){
      const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
      const total=lengths.at(-1),rate=1.4+this.random()*2.4,color=this.random()>.9?[.15,.7,1.15]:[1,.25,.055];
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],len=lengths[i]-lengths[i-1];if(len<.001)continue;
        const nx=-(b[1]-a[1])/len*width,nz=(b[0]-a[0])/len*width;
        const v=[
          [a[0]+nx,.028,a[1]+nz,lengths[i-1],phase,total,rate],
          [a[0]-nx,.028,a[1]-nz,lengths[i-1],phase,total,rate],
          [b[0]-nx,.028,b[1]-nz,lengths[i],phase,total,rate],
          [b[0]+nx,.028,b[1]+nz,lengths[i],phase,total,rate]
        ];
        for(const k of [0,1,2,0,2,3]){
          const q=v[k];this.paths.push(q[0],q[1],q[2],q[3],q[5],q[4],q[6],...color);
        }
      }
    }
    dispose(){
      const r=this.world.renderer;r.gl.deleteTexture(this.texture);r.disposeBatch(this.plane);
      for(const b of Object.values(this.batches))r.disposeBatch(b);
      if(this.labels)r.disposeBatch(this.labels);r.disposeBatch(this.signals);
    }
  }
  class World {
    constructor(renderer,seed,settings){
      this.renderer=renderer;this.seed=seed;this.size=SIZE;this.density=settings.density;
      this.textureSize=settings.quality==='low'?512:1024;
      this.radius=settings.quality==='high'?3:2;this.chunks=new Map();this.originX=0;this.originZ=0;
      this.queue=[];this.totalGenerated=0;
      const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d');
      if(!c)throw new Error('Canvas2Dの初期化に失敗しました。');
      c.clearRect(0,0,512,512);c.fillStyle='#869393';
      c.font='500 49px Arial';c.fillText('SILICON',43,129);c.font='400 30px monospace';c.fillText('SD — 0808',46,176);
      c.fillStyle='#46575a';c.font='19px monospace';c.fillText('FIELD PROCESSOR',46,330);c.fillText('∞  /  REV. 01',46,361);
      c.fillStyle='#84918e';c.beginPath();c.arc(455,54,7,0,Math.PI*2);c.fill();
      for(let i=0;i<22;i++){c.fillStyle=i%3?'#506164':'#78817e';c.fillRect(46+i*8,403,i%3===0?4:2,39);}
      this.labelTexture=renderer.makeTexture(canvas);canvas.width=canvas.height=1;
    }
    get sizeLimit(){return (this.radius*2+1)**2;}
    update(x,z,budget=2){
      const cx=Math.floor((x+SIZE/2)/SIZE)+this.originX,cz=Math.floor((z+SIZE/2)/SIZE)+this.originZ;
      if(cx!==this.centerX||cz!==this.centerZ){
        this.centerX=cx;this.centerZ=cz;this.queue=[];
        for(const [key,c]of this.chunks)if(Math.abs(c.cx-cx)>this.radius||Math.abs(c.cz-cz)>this.radius){c.dispose();this.chunks.delete(key);}
        for(let dz=-this.radius;dz<=this.radius;dz++)for(let dx=-this.radius;dx<=this.radius;dx++){
          const xx=cx+dx,zz=cz+dz,key=xx+','+zz;
          if(!this.chunks.has(key))this.queue.push({cx:xx,cz:zz,key,d:dx*dx+dz*dz});
        }
        this.queue.sort((a,b)=>a.d-b.d);
      }
      for(let i=0;i<budget&&this.queue.length;i++){
        const q=this.queue.shift();this.chunks.set(q.key,new Chunk(this,q.cx,q.cz));this.totalGenerated++;
      }
    }
    rebase(camera){
      const [x,,z]=camera.target;
      if(Math.abs(x)<1024&&Math.abs(z)<1024)return false;
      const sx=Math.floor(x/SIZE),sz=Math.floor(z/SIZE);
      this.originX+=sx;this.originZ+=sz;camera.shift(-sx*SIZE,-sz*SIZE);return true;
    }
    get instanceCount(){return [...this.chunks.values()].reduce((a,c)=>a+c.instanceCount,0);}
    reset(seed,settings){
      for(const c of this.chunks.values())c.dispose();this.chunks.clear();
      this.seed=seed;this.density=settings.density;this.textureSize=settings.quality==='low'?512:1024;
      this.radius=settings.quality==='high'?3:2;this.originX=this.originZ=0;this.centerX=this.centerZ=undefined;this.queue=[];this.totalGenerated=0;
    }
    dispose(){for(const c of this.chunks.values())c.dispose();this.chunks.clear();this.renderer.gl.deleteTexture(this.labelTexture);}
  }
  SD.World=World;SD.worldLayout=layout;SD.worldTopology={size:SIZE,busX:BUS_X,busZ:BUS_Z};
})();

