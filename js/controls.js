/* Damped orbit + ground-plane navigation; touch gestures do not create nested worlds. */
(() => {
  'use strict';
  const {clamp,mix}=SD.math;
  class Camera {
    constructor(canvas,onInteract=()=>{},onMode=()=>{}){
      this.canvas=canvas;this.onInteract=onInteract;this.onMode=onMode;
      this.keys=new Set();this.pointers=new Map();this.stick=[0,0];this.auto=true;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.listeners=[];this.reset(true);this.bind();
      if(this.reducedMotion)this.auto=false;
    }
    reset(immediate=false){
      this.goal={x:1,y:0,z:1,radius:52,yaw:.63,phi:1.14};
      if(immediate){this.target=[1,0,1];this.radius=52;this.yaw=.63;this.phi=1.14;this.eye=[0,0,0];this.look=[0,0,0];}
    }
    shift(x,z){this.goal.x+=x;this.goal.z+=z;this.target[0]+=x;this.target[2]+=z;this.eye[0]+=x;this.eye[2]+=z;this.look[0]+=x;this.look[2]+=z;}
    setAuto(v){if(v===this.auto)return;this.auto=v;this.onMode(v);}
    interact(){this.setAuto(false);this.onInteract();}
    move(dx,dz){
      const c=Math.cos(this.yaw),s=Math.sin(this.yaw);
      this.goal.x+=c*dx-s*dz;this.goal.z+=-s*dx-c*dz;
    }
    zoom(delta){this.goal.radius=clamp(this.goal.radius*Math.exp(delta),5,105);}
    preset(type){
      this.interact();
      if(type==='low'){this.goal.phi=1.38;this.goal.radius=30;this.goal.y=.3;}
      if(type==='overview'){this.goal.phi=.42;this.goal.radius=70;this.goal.y=0;}
      if(type==='macro'){this.goal.phi=1.0;this.goal.radius=13;this.goal.y=.35;}
      if(type==='home')this.reset();
    }
    listen(target,event,fn,options){target.addEventListener(event,fn,options);this.listeners.push([target,event,fn,options]);}
    bind(){
      const c=this.canvas;
      this.listen(c,'contextmenu',e=>e.preventDefault());
      this.listen(c,'pointerdown',e=>{
        if(e.button>2)return;e.preventDefault();this.interact();c.focus({preventScroll:true});
        c.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,button:e.button,type:e.pointerType});
        c.classList.add('is-dragging');
      });
      this.listen(c,'pointermove',e=>{
        const prev=this.pointers.get(e.pointerId);if(!prev)return;
        const dx=e.clientX-prev.x,dy=e.clientY-prev.y;
        if(this.pointers.size===2){
          const other=[...this.pointers.entries()].find(([id])=>id!==e.pointerId)[1];
          const a=Math.hypot(prev.x-other.x,prev.y-other.y),b=Math.hypot(e.clientX-other.x,e.clientY-other.y);
          if(a>3&&b>3)this.zoom(Math.log(a/b));
          this.move(-dx*this.radius*.0009,dy*this.radius*.0009);
        }else if(prev.button===2||prev.button===1||e.shiftKey){
          this.move(-dx*this.radius*.0014,dy*this.radius*.0014);
        }else{
          this.goal.yaw-=dx*.0042;this.goal.phi=clamp(this.goal.phi-dy*.0035,.12,1.43);
        }
        prev.x=e.clientX;prev.y=e.clientY;
      });
      const end=e=>{this.pointers.delete(e.pointerId);if(!this.pointers.size)c.classList.remove('is-dragging');};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])this.listen(c,event,end);
      this.listen(c,'wheel',e=>{
        e.preventDefault();this.interact();const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);
        this.zoom(clamp(delta,-200,200)*.0011);
      },{passive:false});
      this.listen(window,'keydown',e=>{
        if(/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
        const k=e.key.toLowerCase();
        if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','shift'].includes(k)){
          e.preventDefault();this.keys.add(k);if(k!=='shift')this.interact();
        }
      });
      this.listen(window,'keyup',e=>this.keys.delete(e.key.toLowerCase()));
      this.listen(window,'blur',()=>{this.keys.clear();this.pointers.clear();this.stick=[0,0];c.classList.remove('is-dragging');});
      this.listen(document,'visibilitychange',()=>{if(document.hidden){this.keys.clear();this.stick=[0,0];}});
    }
    update(dt,time){
      if(this.auto&&!this.reducedMotion){
        this.goal.yaw+=dt*.009;
        this.goal.x-=Math.sin(this.yaw)*dt*.63;this.goal.z-=Math.cos(this.yaw)*dt*.63;
      }
      let vx=0,vz=0,vy=0;
      for(const k of this.keys){if(k==='w'||k==='arrowup')vz++;if(k==='s'||k==='arrowdown')vz--;if(k==='d'||k==='arrowright')vx++;if(k==='a'||k==='arrowleft')vx--;if(k==='e')vy++;if(k==='q')vy--;}
      vx+=this.stick[0];vz-=this.stick[1];
      const norm=Math.max(1,Math.hypot(vx,vz)),speed=(this.keys.has('shift')?20:7)*dt;
      if(vx||vz)this.move(vx/norm*speed,vz/norm*speed);
      this.goal.y=clamp(this.goal.y+vy*dt*4,0,22);
      const smooth=1-Math.exp(-dt*5.4);
      this.target[0]=mix(this.target[0],this.goal.x,smooth);this.target[1]=mix(this.target[1],this.goal.y,smooth);this.target[2]=mix(this.target[2],this.goal.z,smooth);
      this.radius=mix(this.radius,this.goal.radius,smooth);this.yaw=mix(this.yaw,this.goal.yaw,smooth);this.phi=mix(this.phi,this.goal.phi,smooth);
      const sp=Math.sin(this.phi);
      this.eye=[this.target[0]+this.radius*sp*Math.sin(this.yaw),this.target[1]+this.radius*Math.cos(this.phi),this.target[2]+this.radius*sp*Math.cos(this.yaw)];
      this.look=[this.target[0],this.target[1]+.25,this.target[2]];this.fov=.88;
    }
    dispose(){for(const [t,e,f,o]of this.listeners)t.removeEventListener(e,f,o);this.listeners=[];}
  }
  SD.Camera=Camera;
})();

