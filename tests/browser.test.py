"""Regression tests for the split static site. No deployment is performed.
Default: start the included HTTP server and navigate to /SILICON-DRIFT/.
SD_BASE_URL can instead point to an already running local preview server.
SD_BROWSER_FIXTURE=1 is for restricted runners that block browser navigation:
  set_content + a test-only <base> + locally fulfilled external asset requests.
This fixture mode is NOT a live HTTP / GitHub Pages / Safari verification.
On this Linux runner: xvfb-run -a env SD_BROWSER_FIXTURE=1 python tests/browser.test.py
"""
from pathlib import Path
import os, json, time, re, subprocess, socket
from urllib.parse import urlsplit, unquote
from urllib.request import urlopen
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'index.html').read_text()
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
report={'version':'1.1.0','engine':'Chromium / software GPU','mobile':'390x844 DPR3, 844x390 DPR3, touch emulation; not iPhone hardware / not Safari','checks':[], 'unexpected_errors':[]}

def record(name,ok=True):
    report['checks'].append({'name':name,'passed':bool(ok)})
    print(('PASS ' if ok else 'FAIL ')+name,flush=True)
    assert ok,name

FIXTURE=os.environ.get('SD_BROWSER_FIXTURE')=='1'
BASE_URL=os.environ.get('SD_BASE_URL','')
server=None
server_log=None
report['mode']='in-memory HTML + separate external asset fixtures' if FIXTURE else 'HTTP navigation'
report['repository_path']='/SILICON-DRIFT/'

if not FIXTURE and not BASE_URL:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
    BASE_URL=f'http://127.0.0.1:{port}/SILICON-DRIFT/'
    server_log=(OUT/'preview-server.log').open('w')
    server=subprocess.Popen(['node','serve.mjs',f'--port={port}','--base=/SILICON-DRIFT/'],cwd=ROOT,stdout=server_log,stderr=server_log)
    for attempt in range(100):
        try:
            with urlopen(BASE_URL,timeout=1) as r: r.read()
            break
        except Exception:
            if server.poll() is not None: raise RuntimeError('Preview server failed; see test-results/preview-server.log')
            time.sleep(.1)
    else:
        server.terminate(); raise RuntimeError('Preview server did not start')


def load(page,query='?seed=80426',inject='',broken=False,blocked=False,missing=False):
    """Inject faults only into browser responses, never into files in the ZIP."""
    if inject:
        if FIXTURE: page.evaluate('() => {'+inject+'}')
        else: page.add_init_script(inject)
    if FIXTURE:
        page._sd_requests=[]
        def asset(route):
            pathname=unquote(urlsplit(route.request.url).path)
            page._sd_requests.append(pathname)
            prefix='/SILICON-DRIFT/'
            relative=pathname[len(prefix):] if pathname.startswith(prefix) else ''
            fp=(ROOT/relative).resolve()
            if not fp.is_relative_to(ROOT) or not fp.is_file() or not relative.startswith(('css/','js/','assets/')):
                route.fulfill(status=404,body='Not found'); return
            if missing and relative=='js/app.js':
                route.fulfill(status=404,body='Intentionally missing script');return
            mime={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[fp.suffix]
            body=fp.read_text()
            if relative=='js/app.js':
                body=body.replace('new URLSearchParams(location.search)',f'new URLSearchParams({json.dumps(query)})')
                if broken: body='const deliberately_broken = ;\n'+body
            route.fulfill(status=200,content_type=mime,body=body)
        page.route('https://silicon-drift.test/**',asset)
        head='<base href="https://silicon-drift.test/SILICON-DRIFT/">'
        if blocked: head+="<meta http-equiv=\"Content-Security-Policy\" content=\"script-src 'none'\">"
        page.set_content(HTML.replace('<head>','<head>'+head,1),wait_until='domcontentloaded')
    else:
        if broken:
            page.route('**/js/app.js',lambda r:r.fulfill(status=200,content_type='text/javascript',body='const deliberately_broken = ;'))
        if missing:
            page.route('**/js/app.js',lambda r:r.fulfill(status=404,body='Intentionally missing script'))
        if blocked:
            def block_scripts(route):
                response=route.fetch()
                route.fulfill(response=response,headers={**response.headers,'Content-Security-Policy':"script-src 'none'"})
            page.route('**/SILICON-DRIFT/?*',block_scripts)
        page.goto(BASE_URL.rstrip('/')+'/'+query,wait_until='domcontentloaded',timeout=30000)

def settle(page):
    page.wait_for_function("document.body.dataset.ready==='true'||!!document.body.dataset.error",timeout=90000)
    error=page.evaluate('document.body.dataset.error')
    assert not error,page.locator('#error-detail').inner_text()
    page.evaluate('__SD.pause()')

def snap(page,name):
    page.evaluate('__SD.renderAt(16)')
    page.screenshot(path=str(OUT/name),scale='css',animations='disabled')

def watch(page):
    page.on('pageerror',lambda e:report['unexpected_errors'].append(str(e)))
    page.on('console',lambda m:report['unexpected_errors'].append(m.text) if m.type=='error' else None)
    page.set_default_timeout(30000)

try:
 with sync_playwright() as p:
    options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']}
    if os.environ.get('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
    elif Path('/usr/bin/chromium').exists(): options['executable_path']='/usr/bin/chromium'
    browser=p.chromium.launch(**options)
    report['browser_version']=browser.version
    ctx=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True)
    page=ctx.new_page();watch(page)
    started=time.monotonic();load(page);settle(page)
    report['mobile_initial_seconds']=round(time.monotonic()-started,3)
    record('Mobile: first frame reaches READY and loader is hidden',not page.locator('#loading').is_visible())
    record('Split loading: all seven scripts are external and ordered',page.evaluate('Array.from(document.scripts).map(s=>new URL(s.src).pathname)').__eq__([f'/SILICON-DRIFT/js/{n}.js' for n in ['bootstrap','math','geometry','renderer','world','controls','app']]))
    if FIXTURE:
        record('Subdirectory fixture: browser requested every split script',all(f'/SILICON-DRIFT/js/{n}.js' in page._sd_requests for n in ['bootstrap','math','geometry','renderer','world','controls','app']))
    record('Mobile: all 25 chunks generated',page.evaluate('__SD.world.chunks.size===25'))
    record('Mobile: default auto cruise remains enabled',page.evaluate('__SD.camera.auto'))
    record('Mobile: light profile, no unused shadow texture, LDR target',page.evaluate("__SD.settings.quality==='low'&&!__SD.renderer.hdr&&!__SD.renderer.shadowTex"))
    record('Mobile: no preserved default buffer or MSAA',page.evaluate("!__SD.renderer.gl.getContextAttributes().preserveDrawingBuffer&&!__SD.renderer.gl.getContextAttributes().antialias"))
    record('Mobile: no horizontal overflow',page.evaluate('document.documentElement.scrollWidth===innerWidth'))
    original=page.evaluate('JSON.stringify([...__SD.world.chunks].map(([k,c])=>[k,c.components]).sort())')
    snap(page,'mobile-portrait.png')
    page.tap('#explore');record('Mobile: exploration and joystick appear',page.locator('#joystick').is_visible() and page.evaluate('!__SD.camera.auto'))
    cd=ctx.new_cdp_session(page)
    before=page.evaluate('__SD.camera.goal.yaw')
    for typ,points in [('touchStart',[{'x':150,'y':375}]),('touchMove',[{'x':235,'y':388}]),('touchEnd',[])]:cd.send('Input.dispatchTouchEvent',{'type':typ,'touchPoints':points})
    record('Mobile: native one-finger touch rotates',page.evaluate('__SD.camera.goal.yaw')!=before)
    before=page.evaluate('__SD.camera.goal.radius')
    for typ,points in [('touchStart',[{'x':125,'y':405,'id':1},{'x':245,'y':405,'id':2}]),('touchMove',[{'x':100,'y':418,'id':1},{'x':270,'y':418,'id':2}]),('touchEnd',[])]:cd.send('Input.dispatchTouchEvent',{'type':typ,'touchPoints':points})
    record('Mobile: native two-finger pinch zooms',page.evaluate('__SD.camera.goal.radius')<before)
    before=page.evaluate('[__SD.camera.goal.x,__SD.camera.goal.z]')
    rect=page.locator('#joystick').bounding_box();x,y=rect['x']+rect['width']/2,rect['y']+rect['height']/2
    for typ,points in [('touchStart',[{'x':x,'y':y}]),('touchMove',[{'x':x+18,'y':y-10}])]:cd.send('Input.dispatchTouchEvent',{'type':typ,'touchPoints':points})
    page.evaluate('__SD.step(.2)');cd.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    record('Mobile: joystick moves and releases',page.evaluate('[__SD.camera.goal.x,__SD.camera.goal.z]')!=before and page.evaluate('__SD.camera.stick.every(v=>v===0)'))
    # After CDP-generated touch gestures, use DOM-control clicks for the UI checks.
    page.click('#settings-button');page.locator('#settings').wait_for(state='visible');record('Mobile: settings panel fits screen',page.locator('#settings').bounding_box()['x']>=0)
    page.locator('#density').select_option('1.35');settle(page)
    record('Mobile: density rebuild completes',page.evaluate('__SD.world.density===1.35'))
    page.locator('#density').select_option('1');settle(page);page.click('#settings-close')
    page.click('#seed-button');page.fill('#seed-input','12345678');page.click('#seed-form button[type=submit]');settle(page)
    record('Mobile: seed form regenerates successfully',page.evaluate('__SD.status.seed===12345678'))
    page.evaluate('__SD.regenerate(80426)');settle(page)
    record('Mobile: same seed regenerates identical component layout',page.evaluate('JSON.stringify([...__SD.world.chunks].map(([k,c])=>[k,c.components]).sort())')==original)
    before=page.evaluate('__SD.world.totalGenerated');page.evaluate('__SD.setView({x:3300,z:-3300,radius:52,phi:1.14,yaw:.63})')
    record('Mobile: distant exploration streams bounded chunks',page.evaluate('__SD.world.totalGenerated')>before and page.evaluate('__SD.world.chunks.size<=25'))
    record('Mobile: floating origin keeps coordinates small',page.evaluate('Math.abs(__SD.camera.target[0])<32&&Math.abs(__SD.camera.target[2])<32'))
    record('Mobile: no WebGL errors after interaction',page.evaluate('__SD.renderer.gl.getError()===0'))
    page.click('#hide-ui');record('Mobile: immersive toggle hides HUD',page.evaluate("document.body.classList.contains('immersive')"))
    page.click('#restore-ui');record('Mobile: restore HUD works',page.evaluate("!document.body.classList.contains('immersive')"))
    # Draw and capture in the same task: validates preserveDrawingBuffer=false capture path.
    capture=page.evaluate('''()=>new Promise(resolve=>{__SD.renderAt(16);document.getElementById('world').toBlob(b=>resolve({size:b&&b.size,type:b&&b.type}),'image/png');})''')
    record('Mobile: PNG capture remains available',capture['size']>2000 and capture['type']=='image/png')
    page.set_viewport_size({'width':844,'height':390});page.evaluate('__SD.renderer.resize();__SD.setView({x:1,z:1,radius:52,phi:1.14,yaw:.63})')
    record('Mobile: landscape resize keeps lightweight profile',page.evaluate('__SD.settings.mobile&&__SD.settings.quality==="low"&&__SD.renderer.width>__SD.renderer.height'))
    snap(page,'mobile-landscape.png')
    report['mobile_status']=page.evaluate('__SD.status')
    page.close();ctx.close()
    # Cold-start landscape verifies touch detection, not simply CSS viewport width.
    ctx=browser.new_context(viewport={'width':844,'height':390},device_scale_factor=3,is_mobile=True,has_touch=True)
    page=ctx.new_page();watch(page);load(page);settle(page)
    record('Landscape cold start: selects low profile despite width > 760px',page.evaluate('__SD.settings.quality==="low"&&__SD.settings.mobile'))
    page.close();ctx.close()
    ctx=browser.new_context(viewport={'width':1200,'height':800},device_scale_factor=1)
    page=ctx.new_page();watch(page);load(page);settle(page)
    record('Desktop: still starts in balanced mode with shadows',page.evaluate('__SD.settings.quality==="balanced"&&__SD.renderer.shadowReady'))
    snap(page,'desktop.png')
    page.click('#explore');before=page.evaluate('__SD.camera.goal.yaw')
    page.mouse.move(600,390);page.mouse.down();page.mouse.move(680,410,steps=3);page.mouse.up()
    record('Desktop: mouse orbit works',page.evaluate('__SD.camera.goal.yaw')!=before)
    before=page.evaluate('[__SD.camera.goal.x,__SD.camera.goal.z]')
    page.mouse.move(600,390);page.mouse.down(button='right');page.mouse.move(650,410,steps=3);page.mouse.up(button='right')
    record('Desktop: right-drag translates',page.evaluate('[__SD.camera.goal.x,__SD.camera.goal.z]')!=before)
    page.locator('#world').focus();before=page.evaluate('__SD.camera.goal.z');page.keyboard.down('w');page.evaluate('__SD.step(.2)');page.keyboard.up('w')
    record('Desktop: WASD navigation works',page.evaluate('__SD.camera.goal.z')!=before)
    for view in ['low','overview','macro']: page.click('[data-view='+view+']')
    record('Desktop: camera presets work',page.evaluate('__SD.camera.goal.radius===13'))
    page.click('#settings-button');page.select_option('#quality','low');settle(page)
    record('Desktop: switching to low releases shadow target',page.evaluate('!__SD.renderer.shadowTex&&!__SD.renderer.hdr'))
    page.select_option('#quality','balanced');settle(page)
    record('Desktop: switching back restores shadows',page.evaluate('__SD.renderer.shadowReady'))
    page.click('#settings-close');page.click('#seed-button');page.fill('#seed-input','87654321');page.click('#seed-form button[type=submit]');settle(page)
    record('Desktop: seed rebuild completes',page.evaluate('__SD.status.seed===87654321'))
    record('Desktop: no WebGL error',page.evaluate('__SD.renderer.gl.getError()===0'))
    # Simulated page lifecycle (not OS suspension): ensures rescheduling works.
    page.evaluate('__SD.resume();window.dispatchEvent(new Event("pagehide"));window.dispatchEvent(new Event("pageshow"))')
    before=page.evaluate('__SD.renderer.frames');page.wait_for_function(f'__SD.renderer.frames>{before}',timeout=30000);page.evaluate('__SD.pause()')
    record('Lifecycle: resumes rendering after pagehide/pageshow')
    record('No unexpected JS / console errors during normal interactions',len(report['unexpected_errors'])==0)
    page.close();ctx.close()
    # Fault fixtures. Errors here are intentional, not included in unexpected_errors.
    def fault_page(query='?seed=80426',inject='',broken=False,blocked=False,missing=False):
      pg=browser.new_page(viewport={'width':390,'height':844},has_touch=True,is_mobile=True)
      load(pg,query,inject,broken,blocked,missing);return pg
    page=fault_page('?seed=80426&safe=1');settle(page)
    record('Safe mode: reaches READY without HDR, shadows or bloom passes',page.evaluate('__SD.settings.safe&&!__SD.renderer.hdr&&!__SD.renderer.shadowTex&&__SD.renderer.blurA.w===1'))
    record('Safe mode: no WebGL errors',page.evaluate('__SD.renderer.gl.getError()===0'));page.close()
    page=fault_page(inject="const originalGetContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return t==='webgl2'?null:originalGetContext.call(this,t,...a);};")
    page.wait_for_function('!!document.body.dataset.error')
    record('WebGL unavailable: visible error instead of stuck loader',page.evaluate('document.body.dataset.error==="WEBGL_UNAVAILABLE"') and not page.locator('#loading').is_visible())
    record('WebGL unavailable: stage and retry actions are visible',page.locator('#safe-retry').is_visible() and 'STAGE: WEBGL' in page.locator('#error-detail').inner_text())
    page.screenshot(path=str(OUT/'startup-diagnostic.png'),scale='css');page.close()
    page=fault_page(broken=True);page.wait_for_function('document.body.dataset.error==="SCRIPT_ERROR"')
    record('Main script syntax error: independent bootstrap reports it',page.locator('#error-screen').is_visible());page.close()
    page=fault_page(missing=True)
    page.wait_for_function('!!document.body.dataset.error',polling=100,timeout=45000)
    record('Missing external script: shows diagnosis instead of an endless loader',page.locator('#error-screen').is_visible());page.close()
    page=fault_page(blocked=True)
    record('CSP blocks scripts: static opening instructions remain visible',page.locator('#boot-notice').is_visible() and page.evaluate('!window.__SD_BOOT'))
    page.screenshot(path=str(OUT/'scripts-blocked.png'),scale='css');page.close()
    page=browser.new_page(viewport={'width':390,'height':844},java_script_enabled=False);load(page)
    record('JavaScript disabled: explicit noscript instructions replace loader',page.locator('noscript .error-screen').is_visible() and not page.locator('#loading').is_visible());page.close()
    # Emulate rAF not being serviced; let the real 30s watchdog run.
    page=fault_page(inject='window.requestAnimationFrame=function(){return 42;};')
    page.wait_for_function('document.body.dataset.error==="STARTUP_TIMEOUT"',polling=100,timeout=45000)
    record('No animation frames: real watchdog exits loading with diagnosis',page.locator('#error-screen').is_visible());page.close()
    # Initial context works then is lost; no synthetic success claim for a killed process.
    page=fault_page();settle(page)
    page.evaluate('__SD.renderer.gl.getExtension("WEBGL_lose_context").loseContext()')
    page.wait_for_function('!!document.body.dataset.error')
    record('Context loss: diagnostic error and retry rather than infinite loader',page.locator('#error-screen').is_visible());page.close()
    browser.close()
except Exception as e:
 report['failure']=str(e)
 raise
finally:
 (OUT/'browser-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 if server is not None:
    server.terminate()
    try: server.wait(timeout=5)
    except subprocess.TimeoutExpired: server.kill()
 if server_log: server_log.close()
 print('CHECKS',sum(c['passed'] for c in report['checks']),'/',len(report['checks']),flush=True)
