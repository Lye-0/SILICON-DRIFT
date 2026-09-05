/* Shared indexed primitives, rendered with hardware instancing. Y is up. */
(() => {
  'use strict';
  const {normalize,cross}=SD.math;
  class Builder {
    constructor(){ this.v=[]; this.i=[]; }
    vertex(p,n,uv=[0,0]) { const idx=this.v.length/8; this.v.push(...p,...n,...uv); return idx; }
    quad(a,b,c,d,n,uv=[[0,0],[1,0],[1,1],[0,1]]) {
      if(!n) n=normalize(cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i])));
      const k=this.v.length/8;
      [a,b,c,d].forEach((p,i)=>this.vertex(p,n,uv[i]));
      this.i.push(k,k+1,k+2,k,k+2,k+3);
    }
    triangle(a,b,c,n){
      const k=this.v.length/8;[a,b,c].forEach(p=>this.vertex(p,n));this.i.push(k,k+1,k+2);
    }
    result(){return {vertices:new Float32Array(this.v),indices:new Uint16Array(this.i)};}
  }
  function box(bevel=0) {
    const b=new Builder();
    if(!bevel) {
      b.quad([-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5],[-.5,.5,-.5],[0,1,0]);
      b.quad([-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]);
      b.quad([.5,-.5,.5],[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[1,0,0]);
      b.quad([-.5,-.5,-.5],[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-1,0,0]);
      b.quad([-.5,-.5,.5],[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[0,0,1]);
      b.quad([.5,-.5,-.5],[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[0,0,-1]);
    } else {
      const r=.5-bevel;
      b.quad([-r,.5,r],[r,.5,r],[r,.5,-r],[-r,.5,-r],[0,1,0]);
      const top=[[-r,.5,r],[r,.5,r],[r,.5,-r],[-r,.5,-r]];
      const ring=[[-.5,r,.5],[.5,r,.5],[.5,r,-.5],[-.5,r,-.5]];
      for(let j=0;j<4;j++) {
        const k=(j+1)%4;
        b.quad(ring[j],ring[k],top[k],top[j]);
        b.quad([ring[j][0],-.5,ring[j][2]],[ring[k][0],-.5,ring[k][2]],ring[k],ring[j]);
      }
      b.quad([-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,-1,0]);
    }
    return b.result();
  }
  function cylinder(segments=24) {
    const b=new Builder();
    for(let i=0;i<segments;i++) {
      const t=i/segments*Math.PI*2, u=(i+1)/segments*Math.PI*2;
      const c=Math.cos(t),s=Math.sin(t),d=Math.cos(u),f=Math.sin(u);
      const k=b.v.length/8;
      b.vertex([c*.5,-.5,s*.5],[c,0,s]); b.vertex([c*.5,.5,s*.5],[c,0,s]);
      b.vertex([d*.5,.5,f*.5],[d,0,f]); b.vertex([d*.5,-.5,f*.5],[d,0,f]);
      b.i.push(k,k+1,k+2,k,k+2,k+3);
      b.triangle([0,.5,0],[d*.5,.5,f*.5],[c*.5,.5,s*.5],[0,1,0]);
      b.triangle([0,-.5,0],[c*.5,-.5,s*.5],[d*.5,-.5,f*.5],[0,-1,0]);
    }
    return b.result();
  }
  function torus(segments=24,tubeSegments=8) {
    const b=new Builder();
    const p=(u,v)=>[(.36+.14*Math.cos(v))*Math.cos(u),.14*Math.sin(v),(.36+.14*Math.cos(v))*Math.sin(u)];
    const n=(u,v)=>[Math.cos(v)*Math.cos(u),Math.sin(v),Math.cos(v)*Math.sin(u)];
    for(let i=0;i<segments;i++)for(let j=0;j<tubeSegments;j++){
      const u=i/segments*Math.PI*2,v=j/tubeSegments*Math.PI*2,uu=(i+1)/segments*Math.PI*2,vv=(j+1)/tubeSegments*Math.PI*2;
      const k=b.v.length/8;
      [[u,v],[u,vv],[uu,vv],[uu,v]].forEach(([a,c])=>b.vertex(p(a,c),n(a,c)));
      b.i.push(k,k+1,k+2,k,k+2,k+3);
    }
    return b.result();
  }
  function plane() {
    const b=new Builder();
    b.quad([-.5,0,.5],[.5,0,.5],[.5,0,-.5],[-.5,0,-.5],[0,1,0]);
    return b.result();
  }
  SD.geometry={box,cylinder,torus,plane};
})();

