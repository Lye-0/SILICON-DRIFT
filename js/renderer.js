/* WebGL2 renderer: instancing, soft directional shadows, metal shading, HDR bloom.
   Everything is generated locally. No assets, CDNs, dependencies, or network requests. */
(() => {
  'use strict';
  const {mul,perspective,lookAt,ortho,normalize}=SD.math;
  const INSTANCE_FLOATS=16;
  const vertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec3 aNormal;
  layout(location=7) in vec2 aUV;
  layout(location=2) in vec3 iPosition;
  layout(location=3) in vec3 iScale;
  layout(location=4) in vec2 iRotation;
  layout(location=5) in vec4 iColor;
  layout(location=6) in vec4 iMaterial;
  uniform mat4 uVP; uniform mat4 uLightVP; uniform vec3 uOffset;
  out vec3 vWorld; out vec3 vNormal; out vec2 vUV;
  out vec4 vColor; out vec4 vMaterial; out vec4 vShadow;
  void main(){
    vec3 p=aPosition*iScale;
    p.xz=mat2(iRotation.x,-iRotation.y,iRotation.y,iRotation.x)*p.xz;
    vec3 n=aNormal/max(iScale,vec3(.0001));
    n.xz=mat2(iRotation.x,-iRotation.y,iRotation.y,iRotation.x)*n.xz;
    vWorld=p+iPosition+uOffset; vNormal=normalize(n); vUV=aUV;
    vColor=iColor; vMaterial=iMaterial;
    vShadow=uLightVP*vec4(vWorld,1.);
    gl_Position=uVP*vec4(vWorld,1.);
  }`;
  const fragment=`#version 300 es
  precision highp float;
  in vec3 vWorld; in vec3 vNormal; in vec2 vUV;
  in vec4 vColor; in vec4 vMaterial; in vec4 vShadow;
  uniform vec3 uEye; uniform sampler2D uTexture; uniform sampler2D uShadow;
  uniform int uMode; uniform float uTime; uniform float uShadowEnabled;
  uniform float uFog; uniform vec3 uAccent;
  out vec4 outColor;
  const float PI=3.14159265;
  float shadow(vec3 n,vec3 l){
    if(uShadowEnabled<.5)return 1.;
    vec3 p=vShadow.xyz/vShadow.w*.5+.5;
    if(p.x<0.||p.x>1.||p.y<0.||p.y>1.||p.z>1.)return 1.;
    float bias=max(.00045*(1.-dot(n,l)),.00010), result=0.;
    vec2 texel=1./vec2(textureSize(uShadow,0));
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++) {
      float depth=texture(uShadow,p.xy+vec2(float(x),float(y))*texel*1.15).r;
      result += p.z-bias>depth ? .25:1.;
    }
    return result/9.;
  }
  vec3 light(vec3 n, vec3 v, vec3 l, vec3 c, vec3 base, float metal, float rough){
    vec3 h=normalize(v+l); float nv=max(dot(n,v),.001), nl=max(dot(n,l),0.);
    float nh=max(dot(n,h),0.), vh=max(dot(v,h),0.);
    float a=rough*rough,a2=a*a,den=nh*nh*(a2-1.)+1.;
    float D=a2/(PI*den*den+.0001);
    float k=(rough+1.)*(rough+1.)/8.;
    float G=(nv/(nv*(1.-k)+k))*(nl/(nl*(1.-k)+k));
    vec3 F0=mix(vec3(.045),base,metal),F=F0+(1.-F0)*pow(1.-vh,5.);
    vec3 spec=D*G*F/max(4.*nv*nl,.001);
    vec3 diff=(1.-F)*(1.-metal)*base/PI;
    return (diff+spec)*c*nl;
  }
  void main(){
    vec3 base=vColor.rgb; float rough=vColor.a,metal=vMaterial.x;
    vec3 n=normalize(vNormal), v=normalize(uEye-vWorld);
    if(uMode==1){
      vec4 tex=texture(uTexture,vUV); base=tex.rgb*.34;
      float trace=smoothstep(.055,.19,max(max(tex.r,tex.g),tex.b));
      metal=.13+trace*.58; rough=.62-trace*.22;
    }
    if(uMode==2){
      vec4 tex=texture(uTexture,vUV);if(tex.a<.06)discard;
      base=tex.rgb*.34; rough=.65; metal=.1;
    }
    vec3 key=normalize(vec3(-.48,.83,.37));
    float sh=shadow(n,key);
    vec3 col=light(n,v,key,vec3(2.9,3.15,3.4),base,metal,rough)*sh;
    col+=light(n,v,normalize(vec3(.65,.48,-.6)),vec3(1.25,1.1,.94),base,metal,rough);
    col+=light(n,v,normalize(vec3(-.3,.25,-.8)),vec3(.3,.54,.65),base,metal,rough);
    float ambient=.13+.30*max(n.y,0.);
    col+=base*ambient*(1.-metal*.68);
    vec3 ref=reflect(-v,n);
    float strip=pow(max(dot(ref,normalize(vec3(-.55,.72,.4))),0.),28.)*1.1;
    float softbox=pow(max(dot(ref,normalize(vec3(.35,.85,-.38))),0.),5.)*.4;
    float fres=pow(1.-max(dot(n,v),0.),5.);
    col+=(strip+softbox+.035)*mix(vec3(.04),base,metal)*(1.+fres*1.8)*mix(.75,1.,sh);
    // A restrained warm bounce emphasizes low edges without washing out blacks.
    col+=uAccent*.015*base*(1.-max(n.y,0.));
    vec3 emit=vMaterial.yzw;
    float twinkle=.70+.30*sin(uTime*1.8+vWorld.x*1.35+vWorld.z*.42);
    col+=emit*twinkle;
    float dist=length(uEye-vWorld);
    float fog=smoothstep(48.,145.-uFog*34.,dist);
    col=mix(col,vec3(.005,.007,.009),fog);
    outColor=vec4(col,1.);
  }`;
  const depthFragment=`#version 300 es
  precision highp float; void main() { }`;
  const screenVertex=`#version 300 es
  precision highp float; out vec2 vUV;
  void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
  const blurFragment=`#version 300 es
  precision highp float; in vec2 vUV; uniform sampler2D uImage; uniform vec2 uDirection;
  uniform float uThreshold; out vec4 outColor;
  vec3 sampleColor(vec2 uv){vec3 c=texture(uImage,uv).rgb;return max(c-vec3(uThreshold),vec3(0.));}
  void main(){vec3 c=sampleColor(vUV)*.227027;
    c+=sampleColor(vUV+uDirection*1.384615)*.316216;
    c+=sampleColor(vUV-uDirection*1.384615)*.316216;
    c+=sampleColor(vUV+uDirection*3.230769)*.070270;
    c+=sampleColor(vUV-uDirection*3.230769)*.070270;
    outColor=vec4(c,1.);}`;
  const finalFragment=`#version 300 es
  precision highp float; in vec2 vUV; uniform sampler2D uImage; uniform sampler2D uBloom;
  uniform float uGlow; uniform float uExposure; uniform float uTime;
  out vec4 outColor;
  vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
  void main(){
    vec3 c=texture(uImage,vUV).rgb+texture(uBloom,vUV).rgb*uGlow*.7;
    c=pow(aces(c*uExposure),vec3(1./2.2));
    vec2 q=(vUV-.5)*vec2(1.,.9);
    c*=1.-dot(q,q)*.42;
    float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+floor(uTime*12.))*43758.5453);
    c+=(grain-.5)*.007;
    outColor=vec4(c,1.);
  }`;
  const signalVertex=`#version 300 es
  precision highp float;
  layout(location=0) in vec3 aPosition;
  layout(location=1) in vec4 aPath;
  layout(location=2) in vec3 aColor;
  uniform mat4 uVP; uniform vec3 uOffset;
  out vec3 vWorld;out vec4 vPath;out vec3 vColor;
  void main(){vWorld=aPosition+uOffset;vPath=aPath;vColor=aColor;gl_Position=uVP*vec4(vWorld,1.);}`;
  const signalFragment=`#version 300 es
  precision highp float;
  in vec3 vWorld; in vec4 vPath; in vec3 vColor;
  uniform float uTime;uniform float uSpeed;uniform vec3 uEye;uniform float uFog;
  uniform vec3 uAccent;out vec4 outColor;
  void main(){
    float phase=mod(vPath.x-uTime*uSpeed*vPath.w+vPath.z*vPath.y,vPath.y*1.8);
    float pulse=exp(-phase*1.8)+.35*exp(-phase*.35);
    vec3 color=mix(uAccent,vColor,step(.5,vColor.b));
    vec3 c=color*(pulse*3.8+.022);
    c*=1.-smoothstep(48.,145.-uFog*34.,length(uEye-vWorld));
    outColor=vec4(c,1.);
  }`;
  function program(gl,vs,fs){
    const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const msg=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error('Shader: '+msg);}return s;};
    const v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs),p=gl.createProgram();
    gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error('Program: '+gl.getProgramInfoLog(p));
    return {p,u:new Proxy({}, {get:(o,k)=>k in o?o[k]:(o[k]=gl.getUniformLocation(p,k))})};
  }
  class Renderer {
    constructor(canvas,settings){
      this.canvas=canvas;this.settings=settings;this.frames=0;this.drawCalls=0;
      const gl=this.gl=canvas.getContext('webgl2',{antialias:!settings.mobile&&settings.quality!=='low',alpha:false,powerPreference:settings.mobile?'default':'high-performance',preserveDrawingBuffer:!settings.mobile});
      if(!gl)throw new Error('WEBGL_UNAVAILABLE');
      this.floatSupport=!!gl.getExtension('EXT_color_buffer_float');
      this.hdr=settings.quality!=='low'&&!settings.safe&&this.floatSupport;
      this.maxDimension=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
      this.anisotropy=gl.getExtension('EXT_texture_filter_anisotropic');
      this.main=program(gl,vertex,fragment);this.depth=program(gl,vertex,depthFragment);
      this.blur=program(gl,screenVertex,blurFragment);this.final=program(gl,screenVertex,finalFragment);
      this.signal=program(gl,signalVertex,signalFragment);
      this.geometries={};
      for(const [name,geo] of Object.entries({box:SD.geometry.box(),bevel:SD.geometry.box(.065),cylinder:SD.geometry.cylinder(),torus:SD.geometry.torus(),plane:SD.geometry.plane()})) {
        const vb=gl.createBuffer(),ib=gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,geo.vertices,gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,geo.indices,gl.STATIC_DRAW);
        this.geometries[name]={vb,ib,count:geo.indices.length};
      }
      this.blank=this.makeTexture(new Uint8Array([255,255,255,255]),1,1);
      this.emptyVAO=gl.createVertexArray();
      this.shadowReady=false;this.resize();
    }
    initShadow(){
      if(this.shadowReady)return;
      const gl=this.gl;this.shadowSize=Math.min(2048,this.maxDimension);
      this.shadowTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTex);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,this.shadowSize,this.shadowSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      this.shadowFB=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,this.shadowTex,0);
      gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
      this.shadowReady=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
      if(!this.shadowReady){gl.deleteTexture(this.shadowTex);gl.deleteFramebuffer(this.shadowFB);this.shadowTex=null;this.shadowFB=null;}
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    makeTexture(source,width,height){
      const gl=this.gl,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      if(width)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(this.anisotropy)gl.texParameterf(gl.TEXTURE_2D,this.anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(this.settings.mobile?2:8,gl.getParameter(this.anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return t;
    }
    createBatch(type,data){
      const gl=this.gl,g=this.geometries[type],vao=gl.createVertexArray(),buffer=gl.createBuffer();
      gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,g.vb);
      for(const [loc,n,off] of [[0,3,0],[1,3,12],[7,2,24]]) {gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,32,off);}
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,g.ib);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
      for(const [loc,n,off] of [[2,3,0],[3,3,12],[4,2,24],[5,4,32],[6,4,48]]) {
        gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,64,off);gl.vertexAttribDivisor(loc,1);
      }
      gl.bindVertexArray(null);return {vao,buffer,count:data.length/INSTANCE_FLOATS,indices:g.count,type};
    }
    createSignals(data){
      const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
      for(const [loc,n,off] of [[0,3,0],[1,4,12],[2,3,28]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,40,off);}
      gl.bindVertexArray(null);return {vao,buffer,count:data.length/10};
    }
    disposeBatch(b){this.gl.deleteVertexArray(b.vao);this.gl.deleteBuffer(b.buffer);}
    makeTarget(w,h,depth=false){
      const gl=this.gl,tex=gl.createTexture(),fb=gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.texStorage2D(gl.TEXTURE_2D,1,this.hdr?gl.RGBA16F:gl.RGBA8,w,h);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
      let rb=null;
      if(depth){rb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorage(gl.RENDERBUFFER,this.settings.quality==='low'?gl.DEPTH_COMPONENT16:gl.DEPTH_COMPONENT24,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rb);}
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
        gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteTexture(tex);gl.deleteFramebuffer(fb);if(rb)gl.deleteRenderbuffer(rb);
        throw new Error('Render framebuffer unavailable');
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {tex,fb,rb,w,h};
    }
    disposeTargets(){
      const gl=this.gl;
      for(const name of ['target','blurA','blurB']){const t=this[name];if(t){gl.deleteTexture(t.tex);gl.deleteFramebuffer(t.fb);if(t.rb)gl.deleteRenderbuffer(t.rb);}this[name]=null;}
    }
    resize(){
      const low=this.settings.quality==='low'||this.settings.safe;
      const ratio=Math.min(devicePixelRatio||1,this.settings.quality==='high'?1.75:low?1:1.35);
      let w=Math.max(1,Math.round(this.canvas.clientWidth*ratio*(low?.8:1))),h=Math.max(1,Math.round(this.canvas.clientHeight*ratio*(low?.8:1)));
      const scale=Math.min(1,this.maxDimension/w,this.maxDimension/h,Math.sqrt((this.settings.mobile?1500000:6000000)/(w*h)));
      w=Math.max(1,Math.floor(w*scale));h=Math.max(1,Math.floor(h*scale));
      const profile=this.settings.quality+':'+this.settings.safe;
      if(this.width===w&&this.height===h&&this.profile===profile)return;
      this.width=w;this.height=h;this.profile=profile;this.canvas.width=w;this.canvas.height=h;
      const gl=this.gl;
      if(low&&this.shadowTex){gl.deleteTexture(this.shadowTex);gl.deleteFramebuffer(this.shadowFB);this.shadowTex=null;this.shadowFB=null;this.shadowReady=false;}
      if(!low)this.initShadow();
      this.disposeTargets();this.hdr=!low&&this.floatSupport;
      const make=()=>{
        const divisor=low?4:2,bw=this.settings.safe?1:Math.max(1,Math.floor(w/divisor)),bh=this.settings.safe?1:Math.max(1,Math.floor(h/divisor));
        this.target=this.makeTarget(w,h,true);this.blurA=this.makeTarget(bw,bh);this.blurB=this.makeTarget(bw,bh);
      };
      try{make();}catch(error){this.disposeTargets();if(!this.hdr)throw error;this.hdr=false;make();}
    }
    use(p){this.gl.useProgram(p.p);}
    drawBatch(b){if(!b.count)return;const gl=this.gl;gl.bindVertexArray(b.vao);gl.drawElementsInstanced(gl.TRIANGLES,b.indices,gl.UNSIGNED_SHORT,0,b.count);this.drawCalls++;}
    drawWorld(world,p,shadow=false){
      const gl=this.gl;
      for(const chunk of world.chunks.values()){
        const x=(chunk.cx-world.originX)*world.size,z=(chunk.cz-world.originZ)*world.size;
        gl.uniform3f(p.u.uOffset,x,0,z);
        if(!shadow){gl.uniform1i(p.u.uMode,1);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,chunk.texture);this.drawBatch(chunk.plane);}
        gl.uniform1i(p.u.uMode,0);
        for(const batch of Object.values(chunk.batches))this.drawBatch(batch);
        if(!shadow&&chunk.labels){gl.uniform1i(p.u.uMode,2);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,world.labelTexture);this.drawBatch(chunk.labels);}
      }
    }
    render(world,camera,time){
      const gl=this.gl,s=this.settings;this.drawCalls=0;
      const view=lookAt(camera.eye,camera.look),proj=perspective(camera.fov||.78,this.width/this.height,.10,220),vp=mul(proj,view);
      this.vp=vp;
      const focus=[camera.target[0],0,camera.target[2]], l=normalize([-.48,.83,.37]);
      const lightEye=focus.map((v,i)=>v+l[i]*100),lightVP=mul(ortho(-72,72,-72,72,1,230),lookAt(lightEye,focus));
      const shadows=s.quality!=='low'&&!s.safe&&this.shadowReady;
      gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
      if(shadows){
        gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFB);gl.viewport(0,0,this.shadowSize,this.shadowSize);gl.clear(gl.DEPTH_BUFFER_BIT);
        this.use(this.depth);gl.uniformMatrix4fv(this.depth.u.uVP,false,lightVP);gl.uniformMatrix4fv(this.depth.u.uLightVP,false,lightVP);
        this.drawWorld(world,this.depth,true);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.target.fb);gl.viewport(0,0,this.width,this.height);gl.clearColor(.005,.007,.009,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      this.use(this.main);const u=this.main.u;
      gl.uniformMatrix4fv(u.uVP,false,vp);gl.uniformMatrix4fv(u.uLightVP,false,lightVP);
      gl.uniform3fv(u.uEye,camera.eye);gl.uniform1f(u.uTime,time);gl.uniform1f(u.uFog,s.fog);
      gl.uniform3fv(u.uAccent,s.accent);gl.uniform1f(u.uShadowEnabled,shadows?1:0);
      gl.uniform1i(u.uTexture,0);gl.uniform1i(u.uShadow,1);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.shadowTex||this.blank);
      this.drawWorld(world,this.main);
      if(s.signals){
        this.use(this.signal);const u=this.signal.u;
        gl.uniformMatrix4fv(u.uVP,false,vp);gl.uniform3fv(u.uEye,camera.eye);gl.uniform1f(u.uTime,time);gl.uniform1f(u.uSpeed,s.speed);
        gl.uniform1f(u.uFog,s.fog);gl.uniform3fv(u.uAccent,s.accent);
        gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);
        for(const c of world.chunks.values()){
          gl.uniform3f(u.uOffset,(c.cx-world.originX)*world.size,0,(c.cz-world.originZ)*world.size);
          gl.bindVertexArray(c.signals.vao);gl.drawArrays(gl.TRIANGLES,0,c.signals.count);this.drawCalls++;
        }
        gl.depthMask(true);gl.disable(gl.BLEND);
      }
      gl.disable(gl.DEPTH_TEST);gl.bindVertexArray(this.emptyVAO);
      this.use(this.blur);const b=this.blur.u;gl.uniform1i(b.uImage,0);
      const blurPass=(input,output,dx,dy,threshold)=>{
        gl.bindFramebuffer(gl.FRAMEBUFFER,output.fb);gl.viewport(0,0,output.w,output.h);
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,input);
        gl.uniform2f(b.uDirection,dx,dy);gl.uniform1f(b.uThreshold,threshold);gl.drawArrays(gl.TRIANGLES,0,3);
      };
      if(!s.safe){
        blurPass(this.target.tex,this.blurA,1/this.blurA.w,0,.6);
        blurPass(this.blurA.tex,this.blurB,0,1/this.blurA.h,0);
        if(s.quality!=='low'){
          blurPass(this.blurB.tex,this.blurA,2/this.blurA.w,0,0);
          blurPass(this.blurA.tex,this.blurB,0,2/this.blurA.h,0);
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.width,this.height);
      this.use(this.final);const f=this.final.u;
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.target.tex);gl.uniform1i(f.uImage,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,s.safe?this.blank:this.blurB.tex);gl.uniform1i(f.uBloom,1);
      gl.uniform1f(f.uGlow,s.safe?0:s.glow);gl.uniform1f(f.uExposure,s.exposure);gl.uniform1f(f.uTime,time);gl.drawArrays(gl.TRIANGLES,0,3);
      gl.bindVertexArray(null);this.frames++;
    }
    project(p){
      const m=this.vp;if(!m)return null;
      const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];
      if(q[3]<=0)return null;
      return [(q[0]/q[3]*.5+.5)*this.canvas.clientWidth,(-q[1]/q[3]*.5+.5)*this.canvas.clientHeight,q[2]/q[3]];
    }
  }
  SD.Renderer=Renderer;
})();

