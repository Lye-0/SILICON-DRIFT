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
  const settings={quality:safe?'low':['low','balanced','high'].includes(requestedQuality)?requestedQuality:'balanced',mobile:isMobile,safe,density:1,glow:.65,exposure:1.10,fog:.35,speed:1,signals:true,accent:[1,.25,.055]};
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
  // Ambient soundtrack: generated locally, with audible midrange pads and a slow
  // musical pulse. Every signal, including modulation and echoes, passes through
  // the final master gain so OFF really means silence.
  const AUDIO_LEVEL=.8,AUDIO_FADE_OUT=.22;
  let audioWanted=false,audioStarting=false,audioRevision=0,audioSuspendTimer=0;
  let audioForeground=!document.hidden,previousAudioSessionType=null;

  function createAmbientField(context,output){
    const sources=[],mix=context.createGain(),highpass=context.createBiquadFilter();
    const lowpass=context.createBiquadFilter(),compressor=context.createDynamicsCompressor();
    highpass.type='highpass';highpass.frequency.value=85;highpass.Q.value=.5;
    lowpass.type='lowpass';lowpass.frequency.value=2300;lowpass.Q.value=.45;
    compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=3;
    compressor.attack.value=.02;compressor.release.value=.4;
    mix.connect(highpass);highpass.connect(lowpass);lowpass.connect(compressor);compressor.connect(output);

    const delay=context.createDelay(1),feedback=context.createGain(),wet=context.createGain();
    delay.delayTime.value=.6;feedback.gain.value=.22;wet.gain.value=.22;
    mix.connect(delay);delay.connect(feedback);feedback.connect(delay);delay.connect(wet);wet.connect(highpass);
    const connectVoice=(node,pan)=>{
      if(typeof context.createStereoPanner==='function'){
        const panner=context.createStereoPanner();panner.pan.value=pan;node.connect(panner);panner.connect(mix);
      }else node.connect(mix);
    };

    // A minor/add9 colour. Upper voices remain audible on small speakers; the
    // original sub-bass-only, very low-level mix was easy to mistake for silence.
    const voices=[
      [110,.035,'triangle',-.25],
      [164.8138,.055,'sine',.25],
      [220,.09,'triangle',-.12],
      [261.6256,.06,'sine',.12],
      [329.6276,.04,'sine',0]
    ];
    voices.forEach(([frequency,level,type,pan],index)=>{
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type=type;oscillator.frequency.value=frequency;gain.gain.value=level;
      oscillator.connect(gain);connectVoice(gain,pan);sources.push(oscillator);
      const lfo=context.createOscillator(),depth=context.createGain();
      lfo.frequency.value=.043+index*.011;depth.gain.value=level*.18;
      lfo.connect(depth);depth.connect(gain.gain);sources.push(lfo);
    });

    // A short, seamless, generated phrase. AudioBufferSourceNode loops on the
    // audio thread: scene rendering and timer throttling cannot skip its notes.
    const sampleRate=22050,beat=1.5,duration=24;
    const phrase=context.createBuffer(1,sampleRate*duration,sampleRate),samples=phrase.getChannelData(0);
    const notes=[440,0,659.2551,523.2511,0,391.9954,587.3295,0,523.2511,0,329.6276,659.2551,0,440,391.9954,0];
    notes.forEach((frequency,step)=>{
      if(!frequency)return;
      const offset=Math.round((.18+step*beat)*sampleRate),length=Math.round(2.8*sampleRate);
      for(let i=0;i<length;i++){
        const t=i/sampleRate,phase=2*Math.PI*frequency*t;
        const attack=Math.min(1,t/.018),end=Math.min(1,(2.8-t)/.12);
        const envelope=attack*end*Math.exp(-t/0.62);
        samples[(offset+i)%samples.length]+=.13*envelope*(Math.sin(phase)+.16*Math.sin(phase*2)*Math.exp(-t*2));
      }
    });
    const pulses=context.createBufferSource();pulses.buffer=phrase;pulses.loop=true;
    connectVoice(pulses,.08);sources.push(pulses);

    // Low-level, band-limited texture rather than conspicuous white-noise hiss.
    const noiseBuffer=context.createBuffer(1,2*sampleRate,sampleRate),noise=noiseBuffer.getChannelData(0);
    let state=80426;
    for(let i=0;i<noise.length;i++){
      state=(Math.imul(state,1664525)+1013904223)>>>0;noise[i]=state/2147483648-1;
    }
    const noiseSource=context.createBufferSource(),noiseFilter=context.createBiquadFilter(),noiseGain=context.createGain();
    noiseSource.buffer=noiseBuffer;noiseSource.loop=true;noiseFilter.type='bandpass';
    noiseFilter.frequency.value=780;noiseFilter.Q.value=.7;noiseGain.gain.value=.009;
    noiseSource.connect(noiseFilter);noiseFilter.connect(noiseGain);noiseGain.connect(mix);sources.push(noiseSource);
    const when=context.currentTime+.03;sources.forEach(source=>source.start(when));
  }

  function syncAudioButton(){
    audioOn=audioWanted&&!audioStarting&&audioForeground&&!document.hidden&&audioContext?.state==='running';
    const button=$('audio-toggle');
    const state=audioStarting?'starting':audioOn?'playing':audioWanted?'paused':'off';
    const label=audioStarting?'環境音の開始をキャンセル':audioOn?'環境音をオフにする':audioWanted?'環境音を再開する':'環境音をオンにする';
    button.setAttribute('aria-pressed',String(audioOn));button.setAttribute('aria-label',label);
    button.setAttribute('aria-busy',String(audioStarting));button.title=label;button.dataset.audioState=state;
  }
  function setAmbientLevel(level,seconds=0){
    if(!audioContext||!ambientGain||audioContext.state==='closed')return;
    const gain=ambientGain.gain,now=audioContext.currentTime,current=gain.value;
    if(seconds<=0){
      // Reset the intrinsic value as well as automation. A context suspended in
      // this same task may not process another quantum before it is resumed.
      gain.cancelScheduledValues(0);gain.value=level;gain.setValueAtTime(level,now);return;
    }
    if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(now);
    else{gain.cancelScheduledValues(now);gain.setValueAtTime(current,now);}
    gain.linearRampToValueAtTime(level,now+seconds);
  }
  function suspendAudioContext(context=audioContext){
    if(!context||context.state==='closed'||context.state==='suspended')return;
    try{Promise.resolve(context.suspend()).catch(()=>{});}catch{/* A closed device must not break the artwork. */}
  }
  function acquireAudioSession(){
    // Optional enhancement only. Never require this experimental API to exist.
    // Choose media playback after an explicit ON action, and restore the previous
    // session type when OFF or hidden. No microphone permission is requested.
    try{
      const session=navigator.audioSession;
      if(session){
        if(previousAudioSessionType===null)previousAudioSessionType=session.type;
        session.type='playback';
      }
    }catch{/* Regular Web Audio remains available without AudioSession. */}
  }
  function releaseAudioSession(){
    try{
      if(previousAudioSessionType!==null&&navigator.audioSession?.type==='playback')navigator.audioSession.type=previousAudioSessionType;
    }catch{/* Some browsers expose a read-only/partial AudioSession. */}
    previousAudioSessionType=null;
  }
  function ensureAudioContext(){
    if(audioContext&&audioContext.state!=='closed')return audioContext;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw new Error('Web Audio is unavailable');
    const context=new Audio();audioContext=context;
    try{
      ambientGain=context.createGain();ambientGain.gain.value=0;ambientGain.connect(context.destination);
      createAmbientField(context,ambientGain);
      context.addEventListener('statechange',()=>{
        if(audioContext!==context)return;
        // A late resume must not undo OFF, a failed start, or a hidden tab.
        if(!audioWanted||!audioForeground||document.hidden){
          setAmbientLevel(0);suspendAudioContext(context);
        }else if(context.state==='running'&&!audioStarting)setAmbientLevel(AUDIO_LEVEL,.7);
        syncAudioButton();
      });
      return context;
    }catch(error){
      audioContext=null;ambientGain=null;
      try{Promise.resolve(context.close()).catch(()=>{});}catch{}
      throw error;
    }
  }
  function waitForAudioStart(promise){
    // resume() can stay pending under autoplay/device restrictions. Do not leave
    // the button in a permanent starting state; retry on a fresh user gesture.
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Audio start timed out')),5000);
      Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
    });
  }
  async function startAmbientAudio(notify=true){
    if(document.hidden||!audioForeground)return;
    const revision=++audioRevision;
    audioWanted=true;audioStarting=true;clearTimeout(audioSuspendTimer);syncAudioButton();
    try{
      acquireAudioSession();
      const context=ensureAudioContext();
      // Keep resume() in the original click call stack, before the first await.
      await waitForAudioStart(context.resume());
      if(revision!==audioRevision||!audioWanted||!audioForeground||document.hidden)return;
      if(context.state!=='running')throw new Error('Audio playback is interrupted');
      audioStarting=false;setAmbientLevel(AUDIO_LEVEL,.85);syncAudioButton();
      if(notify)toast('環境音をオンにしました');
    }catch{
      if(revision!==audioRevision)return;
      audioWanted=false;audioStarting=false;setAmbientLevel(0);suspendAudioContext();releaseAudioSession();syncAudioButton();
      toast('音声を開始できませんでした。音ボタンをもう一度押してください');
    }
  }
  function stopAmbientAudio(){
    const revision=++audioRevision,context=audioContext;
    audioWanted=false;audioStarting=false;clearTimeout(audioSuspendTimer);
    setAmbientLevel(0,AUDIO_FADE_OUT);syncAudioButton();toast('環境音をオフにしました');
    audioSuspendTimer=setTimeout(()=>{
      if(revision!==audioRevision||audioWanted)return;
      setAmbientLevel(0);suspendAudioContext(context);releaseAudioSession();
    },350);
  }
  function audioToggle(){
    // Also allow cancellation while resume() is pending. If Safari interrupted
    // playback, a tap retries rather than falsely reporting that sound is ON.
    if(audioWanted&&(audioStarting||audioContext?.state==='running'))stopAmbientAudio();
    else return startAmbientAudio();
  }
  function pauseAmbientAudio(){
    audioForeground=false;++audioRevision;audioStarting=false;clearTimeout(audioSuspendTimer);
    setAmbientLevel(0);suspendAudioContext();releaseAudioSession();syncAudioButton();
  }
  function restoreAmbientAudio(){
    audioForeground=!document.hidden;
    if(audioForeground&&audioWanted&&!audioStarting&&audioContext?.state!=='running')return startAmbientAudio(false);
    if(audioForeground&&audioWanted&&!audioStarting)setAmbientLevel(AUDIO_LEVEL,.7);
    syncAudioButton();
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
    $('audio-toggle').onclick=audioToggle;syncAudioButton();
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
      if(document.hidden){cancelAnimationFrame(frameID);pauseAmbientAudio();}
      else{if(!stopped){last=0;scheduleFrame();}restoreAmbientAudio();}
    });
    window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameID);last=0;pauseAmbientAudio();});
    window.addEventListener('pageshow',()=>{last=0;scheduleFrame();restoreAmbientAudio();});
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
