/* SILICON DRIFT — small, dependency-free math and deterministic generation helpers. */
(() => {
  'use strict';
  const SD = window.SD = window.SD || {};
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const normalize = a => { const n = Math.hypot(...a) || 1; return a.map(v => v / n); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v*b[i], 0);
  function mul(a, b) {
    const o = new Float32Array(16);
    for(let c=0;c<4;c++) for(let r=0;r<4;r++) {
      for(let k=0;k<4;k++) o[c*4+r] += a[k*4+r]*b[c*4+k];
    }
    return o;
  }
  function perspective(fov, aspect, near, far) {
    const f = 1/Math.tan(fov/2), nf = 1/(near-far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  }
  function lookAt(eye, target, up=[0,1,0]) {
    const z=normalize(eye.map((v,i)=>v-target[i])), x=normalize(cross(up,z)), y=cross(z,x);
    return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
  }
  function ortho(left,right,bottom,top,near,far) {
    return new Float32Array([2/(right-left),0,0,0, 0,2/(top-bottom),0,0, 0,0,-2/(far-near),0,
      -(right+left)/(right-left),-(top+bottom)/(top-bottom),-(far+near)/(far-near),1]);
  }
  function hash(x,z,seed=1) {
    let h = Math.imul(x|0, 374761393) ^ Math.imul(z|0, 668265263) ^ Math.imul(seed|0, 1442695041);
    h = Math.imul(h ^ h>>>13,1274126177); return (h ^ h>>>16)>>>0;
  }
  function rng(seed) {
    let a = seed>>>0;
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a>>>15, 1|a);
      t ^= t + Math.imul(t ^ t>>>7, 61|t);
      return ((t ^ t>>>14)>>>0)/4294967296;
    };
  }
  function valueNoise(x,z,seed) {
    const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
    const sx=fx*fx*(3-2*fx),sz=fz*fz*(3-2*fz);
    return mix(mix(hash(ix,iz,seed)/4294967296,hash(ix+1,iz,seed)/4294967296,sx),
      mix(hash(ix,iz+1,seed)/4294967296,hash(ix+1,iz+1,seed)/4294967296,sx),sz);
  }
  function randomSeed() {
    const a=new Uint32Array(1);
    if(globalThis.crypto?.getRandomValues) crypto.getRandomValues(a);
    else a[0]=Date.now() ^ Math.floor(Math.random()*0xffffffff);
    return a[0]%100000000;
  }
  SD.math={clamp,mix,normalize,cross,dot,mul,perspective,lookAt,ortho,hash,rng,valueNoise,randomSeed};
})();

