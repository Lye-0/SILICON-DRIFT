/* Application shell. Static files only; no backend, account, or external service. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),{randomSeed,clamp}=SD.math;
  const canvas=$('world'),isMobile=matchMedia('(max-width: 760px)').matches || matchMedia('(pointer: coarse)').matches;
  const boot=window.__SD_BOOT;
  const params=new URLSearchParams(location.search);
  const supplied=params.get('seed');
  let seed=supplied!==null&&/^\d{1,8}$/.test(supplied)?Number(supplied):randomSeed();
  const safe=params.get('safe')==='1';
  const requestedQuality=params.get('quality');
  const settings={quality:safe?'low':['low','balanced','high'].includes(requestedQuality)?requestedQuality:isMobile?'low':'balanced',mobile:isMobile,safe,density:1,glow:.65,exposure:1.10,fog:.35,speed:1,signals:true,accent:[1,.25,.055]};
  let renderer,world,camera,time=0,last=0,ready=false,stopped=false,frameID=0,toastTimer,hiddenUI=false;
  let lastHUD=0,audioContext=null,audioOn=false,ambientGain=null;
  const errors=[];
  function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2700);}
  function showError(error){
    const message=String(error?.message||error);errors.push(message);stopped=true;ready=false;cancelAnimationFrame(frameID);
    boot.fail(message,message==='WEBGL_UNAVAILABLE'?'WEBGL_UNAVAILABLE':'RENDER_ERROR');
  }
  window.addEventListener('sd:fatal',()=>{stopped=true;ready=false;cancelAnimationFrame(frameID);});
  function scheduleFrame(){cancelAnimationFrame(frameID);if(!stopped&&!document.hidden)frameID=requestAnimationFrame(frame);}
  function explore(){document.body.classList.add('exploring');}
  function syncMode(auto){
    $('auto-mode').classList.toggle('selected',auto);$('auto-mode').setAttribute('aria-pressed',String(auto));
    $('free-mode').classList.toggle('selected',!auto);$('free-mode').setAttribute('aria-pressed',String(!auto));
    document.querySelector('.intro-note').innerHTML=`<span class="orbit-symbol">◌</span> ${auto?'現在、自動巡航中':'ドラッグして探索できます'} <span class="note-line"></span>`;
  }
  function setImmersive(value){
    hiddenUI=value;document.body.classList.toggle('immersive',value);$('restore-ui').hidden=!value;
    if(value){toggleSettings(false);$('restore-ui').focus({preventScroll:true});}else canvas.focus({preventScroll:true});
  }
  function toggleSettings(open=!$('settings').hidden){
    $('settings').hidden=!open;$('settings-button').setAttribute('aria-expanded',String(open));
    if(open)$('settings-close').focus({preventScroll:true});
  }
  function rebuild(newSeed=seed,notify=true){
    if(!world)return;
    boot.begin();boot.mark('REBUILD','新しい世界を準備しています',5);
    seed=newSeed;world.reset(seed,settings);camera.reset(true);
    ready=false;$('loading').hidden=false;$('loading').classList.remove('done');$('loading-progress').style.width='0%';
    $('seed-value').textContent=String(seed).padStart(8,'0');$('seed-input').value=seed;
    document.body.dataset.ready='false';stopped=false;last=0;scheduleFrame();
    if(notify)toast('新しい世界を生成しました · '+String(seed).padStart(8,'0'));
  }
  async function audioToggle(){
    try{
      if(!audioContext){
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Audio unavailable');
        audioContext=new Audio();ambientGain=audioContext.createGain();ambientGain.gain.value=0;ambientGain.connect(audioContext.destination);
        [55,82.4069,110.03,164.78].forEach((freq,i)=>{
          const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=freq;g.gain.value=.12/(i+1);
          o.connect(g);g.connect(ambientGain);o.start();
        });
        const lfo=audioContext.createOscillator(),amount=audioContext.createGain();lfo.frequency.value=.065;amount.gain.value=.0015;lfo.connect(amount);amount.connect(ambientGain.gain);lfo.start();
      }
      await audioContext.resume();audioOn=!audioOn;
      ambientGain.gain.setTargetAtTime(audioOn?.055:0,audioContext.currentTime,.6);
      $('audio-toggle').setAttribute('aria-pressed',String(audioOn));$('audio-toggle').setAttribute('aria-label',audioOn?'環境音をオフにする':'環境音をオンにする');
      toast(audioOn?'静かな環境音をオンにしました':'環境音をオフにしました');
      if(!audioOn)setTimeout(()=>{if(!audioOn)audioContext.suspend();},1800);
    }catch{toast('この環境では環境音を再生できませんでした');}
  }
  function savePNG(){
    if(!renderer||!ready)return;
    renderer.render(world,camera,time);
    canvas.toBlob(blob=>{
      if(!blob){toast('撮影できませんでした');return;}
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`silicon-drift-${String(seed).padStart(8,'0')}-${Date.now()}.png`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('景色をPNGで保存しました');
    },'image/png');
  }
  function drawRadar(){
    const rc=$('radar'),c=rc.getContext('2d'),w=rc.width,h=rc.height,scale=2.3;
    if(!c)return;
    c.clearRect(0,0,w,h);c.fillStyle='#809ca803';c.fillRect(0,0,w,h);
    c.strokeStyle='#9fb3bd13';c.lineWidth=.6;
    for(let x=0;x<w;x+=20){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
    for(let y=0;y<h;y+=20){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
    for(const chunk of world.chunks.values())for(const p of chunk.components){
      const x=(p.x+(chunk.cx-world.originX)*world.size-camera.target[0])*scale+w/2;
      const z=(p.z+(chunk.cz-world.originZ)*world.size-camera.target[2])*scale+h/2;
      if(x<-12||x>w+12||z<-12||z>h+12)continue;
      c.fillStyle=p.type===1?'#728d8f72':'#61798140';c.strokeStyle='#91a49d33';
      c.fillRect(x-p.w*scale/2,z-p.d*scale/2,p.w*scale,p.d*scale);c.strokeRect(x-p.w*scale/2,z-p.d*scale/2,p.w*scale,p.d*scale);
    }
    c.save();c.translate(w/2,h/2);c.rotate(-camera.yaw);
    c.fillStyle='#ef975e12';c.beginPath();c.moveTo(0,0);c.arc(0,0,64,-Math.PI/2-.42,-Math.PI/2+.42);c.closePath();c.fill();
    c.strokeStyle='#ef975e55';c.lineWidth=1;c.beginPath();c.moveTo(0,-7);c.lineTo(-4,4);c.lineTo(0,2);c.lineTo(4,4);c.closePath();c.stroke();
    c.fillStyle='#f3b484';c.beginPath();c.arc(0,0,2,0,Math.PI*2);c.fill();c.restore();
    const text=n=>(n>=0?'+':'−')+Math.abs(n).toFixed(1).padStart(6,'0');
    $('coord-x').textContent=text(camera.target[0]+world.originX*world.size);$('coord-z').textContent=text(camera.target[2]+world.originZ*world.size);
  }
  function bindUI(){
    $('explore').onclick=()=>{explore();camera.setAuto(false);canvas.focus({preventScroll:true});toast(isMobile?'1本指で回転 · 2本指で移動 · 左下のスティックでも移動できます':'ドラッグで回転 · 右ドラッグ / WASDで移動');};
    $('free-mode').onclick=()=>{explore();camera.setAuto(false);canvas.focus({preventScroll:true});};
    $('auto-mode').onclick=()=>{explore();camera.reducedMotion=false;camera.setAuto(true);canvas.focus({preventScroll:true});};
    $('home').onclick=()=>{rebuild(seed,false);document.body.classList.remove('exploring');camera.setAuto(!camera.reducedMotion);toast('最初の視点に戻りました');};
    $('regenerate').onclick=()=>rebuild(randomSeed());
    $('settings-button').onclick=()=>toggleSettings($('settings').hidden);
    $('settings-close').onclick=()=>{toggleSettings(false);$('settings-button').focus();};
    $('hide-ui').onclick=()=>setImmersive(true);$('restore-ui').onclick=()=>setImmersive(false);
    $('audio-toggle').onclick=audioToggle;
    $('capture').onclick=savePNG;
    $('fullscreen').onclick=async()=>{
      try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('このブラウザでは全画面切替に対応していません');}catch{toast('この環境では全画面切替を利用できません');}
    };
    document.addEventListener('fullscreenchange',()=>$('fullscreen').setAttribute('aria-label',document.fullscreenElement?'全画面を終了':'全画面表示'));
    $('help-button').onclick=()=>$('help-dialog').showModal();
    $('seed-button').onclick=()=>{$('seed-input').value=seed;$('seed-dialog').showModal();};
    document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
    document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
    $('seed-form').onsubmit=e=>{
      e.preventDefault();const text=$('seed-input').value;
      if(!/^\d{1,8}$/.test(text)){toast('0〜99999999の整数を入力してください');return;}
      $('seed-dialog').close();rebuild(Number(text));
    };
    $('copy-seed').onclick=async()=>{
      const value=String(seed).padStart(8,'0');
      try{if(!navigator.clipboard)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(value);toast('シード値をコピーしました');}
      catch{$('seed-input').focus();$('seed-input').select();toast('値を選択しました。コピー操作で保存してください');}
    };
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
      camera.preset(b.dataset.view);canvas.focus({preventScroll:true});document.querySelectorAll('[data-view]').forEach(v=>v.classList.toggle('active',v===b));
    });
    for(const name of ['glow','exposure','fog','speed']){
      const input=$(name);input.value=settings[name];
      input.oninput=()=>{settings[name]=Number(input.value);$(name+'-value').textContent=name==='speed'?settings[name].toFixed(1)+'×':Math.round(settings[name]*100)+'%';};
    }
    $('signals').onchange=e=>settings.signals=e.target.checked;
    document.querySelectorAll('[data-palette]').forEach(b=>b.onclick=()=>{
      const palettes={copper:[[1,.25,.055],'#ef975e'],ice:[[.12,.72,1.4],'#83d3e4'],white:[[.8,.98,1.1],'#cfdbd8']};
      const [rgb,css]=palettes[b.dataset.palette];settings.accent=rgb;document.documentElement.style.setProperty('--accent',css);
      document.querySelectorAll('[data-palette]').forEach(v=>{v.classList.toggle('selected',v===b);v.setAttribute('aria-pressed',String(v===b));});
    });
    $('density').onchange=e=>{settings.density=Number(e.target.value);rebuild(seed,false);toast('部品の密度を変更しました');};
    $('quality').value=settings.quality;$('quality').disabled=settings.safe;$('quality').onchange=e=>{settings.quality=e.target.value;renderer.resize();rebuild(seed,false);toast('描画品質を変更しました');};
    $('zoom-in').onclick=()=>{camera.interact();camera.zoom(-.2);};$('zoom-out').onclick=()=>{camera.interact();camera.zoom(.2);};
    let stickPointer=null;
    const stick=$('joystick'),thumb=$('joystick-thumb');
    const moveStick=e=>{
      const rect=stick.getBoundingClientRect(),x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2;
      const d=Math.max(1,Math.hypot(x,y)/24);camera.stick=[x/d/24,y/d/24];thumb.style.transform=`translate(${x/d}px,${y/d}px)`;
    };
    stick.addEventListener('pointerdown',e=>{e.preventDefault();camera.interact();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
    stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)moveStick(e);});
    const releaseStick=()=>{stickPointer=null;camera.stick=[0,0];thumb.style.transform='';};
    for(const ev of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(ev,releaseStick);
    window.addEventListener('keydown',e=>{
      if(e.key==='Escape'){if(hiddenUI)setImmersive(false);if(!$('settings').hidden)toggleSettings(false);return;}
      if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)||document.querySelector('dialog[open]')||e.repeat)return;
      if(e.key===' '&&e.target.tagName==='BUTTON')return;
      const key=e.key.toLowerCase();
      if(key===' '){e.preventDefault();explore();camera.reducedMotion=false;camera.setAuto(!camera.auto);}
      if(key==='h'){e.preventDefault();setImmersive(!hiddenUI);}
      if(key==='r'){e.preventDefault();rebuild(randomSeed());}
      if(['1','2','3'].includes(key)){e.preventDefault();document.querySelector(`[data-view="${['low','overview','macro'][Number(key)-1]}"]`).click();}
    });
    window.addEventListener('resize',()=>{try{renderer?.resize();}catch(error){showError(error);}});
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){cancelAnimationFrame(frameID);audioContext?.suspend();}
      else if(!stopped){last=0;scheduleFrame();if(audioOn)audioContext?.resume().catch(()=>{});}
    });
    window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameID);last=0;});
    window.addEventListener('pageshow',()=>{last=0;scheduleFrame();});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();showError(new Error('GPU描画が中断されました。再読み込みで再開してください。'));});
    $('retry').onclick=()=>location.reload();
  }
  function frame(stamp){
    if(stopped||document.hidden)return;
    try{
      const dt=last?clamp((stamp-last)/1000,.001,.05):1/60;last=stamp;
      if(!ready){
        world.update(camera.target[0],camera.target[2],isMobile?1:2);
        boot.mark('CHUNKS','基板を生成しています · '+world.chunks.size+' / '+world.sizeLimit,20+world.chunks.size/world.sizeLimit*70);
        if(world.queue.length){scheduleFrame();return;}
        boot.mark('FIRST_FRAME','最初の3Dフレームを描画しています',95);
        renderer.render(world,camera,time);
        if(renderer.gl.isContextLost())throw new Error('GPU描画が中断されました。');
        ready=true;document.body.dataset.ready='true';boot.complete();last=0;drawRadar();
      }else{
        time+=dt;camera.update(dt,time);world.rebase(camera);world.update(camera.target[0],camera.target[2],1);
        renderer.render(world,camera,time);
        if(stamp-lastHUD>150){drawRadar();lastHUD=stamp;}
      }
      scheduleFrame();
    }catch(error){console.error(error);showError(error);}
  }
  function start(){
   try{
    boot.mark('WEBGL','WebGL 2 と描画プログラムを準備しています',8);
    renderer=new SD.Renderer(canvas,settings);
    boot.mark('WORLD','電子部品と配線を準備しています',16);
    world=new SD.World(renderer,seed,settings);camera=new SD.Camera(canvas,explore,syncMode);
    $('seed-value').textContent=String(seed).padStart(8,'0');syncMode(camera.auto);bindUI();
    camera.update(0,0);scheduleFrame();
    // Read-only status + deterministic QA controls, useful for local regression testing.
    window.__SD={renderer,world,camera,settings,
      get status(){return {version:"1.1.0",boot:boot.snapshot(),quality:settings.quality,mobile:settings.mobile,safe:settings.safe,hdr:renderer.hdr,shadow:renderer.shadowReady,ready,seed,time,loadedChunks:world.chunks.size,chunkLimit:world.sizeLimit,generated:world.totalGenerated,instances:world.instanceCount,drawCalls:renderer.drawCalls,errors:[...errors],origin:[world.originX,world.originZ],position:[...camera.target],eye:[...camera.eye],auto:camera.auto};},
      pause(){stopped=true;cancelAnimationFrame(frameID);},
      resume(){if(!stopped||boot.snapshot().failed)return;stopped=false;last=0;scheduleFrame();},
      renderAt(t){time=t;renderer.render(world,camera,t);drawRadar();},
      regenerate(value){rebuild(value,false);},
      step(dt=1/60){time+=dt;camera.update(dt,time);world.rebase(camera);world.update(camera.target[0],camera.target[2],3);renderer.render(world,camera,time);drawRadar();},
      setView({x,z,y,radius,yaw,phi}={}){
        camera.setAuto(false);if(x!==undefined)camera.goal.x=x;if(z!==undefined)camera.goal.z=z;if(y!==undefined)camera.goal.y=y;
        if(radius!==undefined)camera.goal.radius=radius;if(yaw!==undefined)camera.goal.yaw=yaw;if(phi!==undefined)camera.goal.phi=phi;
        camera.update(8,time);world.rebase(camera);world.update(camera.target[0],camera.target[2],99);renderer.render(world,camera,time);drawRadar();
      }
    };
    // Explicit testing parameter only; normal visits honour the user's motion preference.
    if(params.has('still')){camera.setAuto(false);}
   }catch(error){console.error(error);showError(error);}
  }
  setTimeout(start,0);
})();
