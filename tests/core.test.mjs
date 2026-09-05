import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=name=>fs.readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8');
const sandbox={console,Float32Array,Uint16Array,Uint32Array,Math,Map,Set};sandbox.window=sandbox;
vm.createContext(sandbox);
for(const f of ['math','geometry','world','controls'])vm.runInContext(src(f),sandbox);
const {SD}=sandbox;
const json=v=>JSON.parse(JSON.stringify(v));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('same seed and coordinates regenerate exactly the same layout',()=>{
 for(const [x,z]of [[0,0],[21,-33],[-731,-61],[0,80000]])assert.deepEqual(json(SD.worldLayout(x,z,80426)),json(SD.worldLayout(x,z,80426)));
});
test('different seeds and neighbour tiles produce different arrangements',()=>{
 assert.notDeepEqual(json(SD.worldLayout(3,1,42)),json(SD.worldLayout(3,1,43)));
 assert.notDeepEqual(json(SD.worldLayout(3,1,42)),json(SD.worldLayout(4,1,42)));
});
test('all eight component families occur in the generated field',()=>{
 const types=new Set();for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)for(const p of SD.worldLayout(x,z,123).parts)types.add(p.type);assert.equal(types.size,8);
});
test('density changes average occupied-cell count',()=>{
 let low=0,high=0;for(let x=-5;x<5;x++)for(let z=-5;z<5;z++){low+=SD.worldLayout(x,z,42,.65).parts.length;high+=SD.worldLayout(x,z,42,1.35).parts.length;}assert.ok(high>low*1.4);
});
test('continuous buses meet across all four tile boundaries',()=>{
 const {size,busX,busZ}=SD.worldTopology;assert.equal(busX[0][1],busX.at(-1)[1]);assert.equal(busX.at(-1)[0]-busX[0][0],size);assert.equal(busZ[0][0],busZ.at(-1)[0]);assert.equal(busZ.at(-1)[1]-busZ[0][1],size);
});
test('shared meshes have finite in-range geometry with unit normals',()=>{
 for(const geo of [SD.geometry.box(),SD.geometry.box(.065),SD.geometry.cylinder(),SD.geometry.torus(),SD.geometry.plane()]){
 assert.equal(geo.vertices.length%8,0);assert.equal(geo.indices.length%3,0);for(const n of geo.vertices)assert.ok(Number.isFinite(n));for(const idx of geo.indices)assert.ok(idx<geo.vertices.length/8);
 for(let i=0;i<geo.vertices.length;i+=8)near(Math.hypot(geo.vertices[i+3],geo.vertices[i+4],geo.vertices[i+5]),1);
 }
});
test('view/projection places look-at point in center',()=>{
 const m=SD.math.mul(SD.math.perspective(.8,1.6,.1,200),SD.math.lookAt([10,10,10],[0,0,0]));near(m[12],0);near(m[13],0);assert.ok(m[15]>0);
});
test('chunk requests cover negative coordinates and remain bounded',()=>{
 const w={radius:2,originX:0,originZ:0,chunks:new Map(),queue:[],totalGenerated:0};SD.World.prototype.update.call(w,-80,-48,0);
 assert.equal(w.queue.length,25);assert.equal(w.queue[0].d,0);assert.equal(w.centerX,-2);assert.equal(w.centerZ,-1);
});
test('moving sectors disposes distant chunks',()=>{
 let disposed=0;const w={radius:2,originX:0,originZ:0,chunks:new Map([['0,0',{cx:0,cz:0,dispose:()=>disposed++}]]),queue:[],totalGenerated:0};
 SD.World.prototype.update.call(w,640,0,0);assert.equal(disposed,1);assert.equal(w.chunks.size,0);assert.equal(w.queue.length,25);
});
test('floating origin preserves logical world position',()=>{
 const w={originX:15,originZ:-3},c={target:[1100,0,-1300],shift(x,z){this.target[0]+=x;this.target[2]+=z;}};
 const before=[c.target[0]+w.originX*32,c.target[2]+w.originZ*32];assert.equal(SD.World.prototype.rebase.call(w,c),true);
 near(c.target[0]+w.originX*32,before[0]);near(c.target[2]+w.originZ*32,before[1]);assert.ok(Math.abs(c.target[0])<32&&Math.abs(c.target[2])<32);
});
test('camera zoom is bounded',()=>{
 const c={goal:{radius:50}};SD.Camera.prototype.zoom.call(c,-100);assert.equal(c.goal.radius,5);SD.Camera.prototype.zoom.call(c,100);assert.equal(c.goal.radius,105);
});
function bootFixture(){
 let now=0,callback,cleared=false;const elements=new Map(),events=new Map(),docEvents=new Map();
 function element(){return {hidden:false,textContent:'',style:{},attrs:{},classList:{add(){}},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};}
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const document={hidden:false,body:element(),documentElement:element(),getElementById:get,addEventListener:(k,f)=>docEvents.set(k,f)};
 const context={document,Date:{now:()=>now},URL,Event:class {constructor(type){this.type=type;}},innerWidth:390,innerHeight:844,location:{href:'https://example.test/?seed=42',protocol:'https:',replace(url){this.destination=url;},reload(){this.reloaded=true;}},setInterval(fn){callback=fn;cleared=false;return 1;},clearInterval(){cleared=true;},addEventListener(k,f){events.set(k,f);},dispatchEvent(e){events.get(e.type)?.(e);}};
 context.window=context;vm.createContext(context);vm.runInContext(src('bootstrap'),context);
 return {context,get,document,events,boot:context.__SD_BOOT,tick(ms){now+=ms;if(!cleared)callback();},visibility(hidden){document.hidden=hidden;docEvents.get('visibilitychange')();}};
}
test('independent bootstrap marks actual script execution',()=>{
 const f=bootFixture();assert.equal(f.document.documentElement.attrs['data-sd-js'],'true');assert.equal(f.boot.snapshot().stage,'BOOT');
});
test('watchdog replaces stalled loading with diagnostic text',()=>{
 const f=bootFixture();f.tick(31001);assert.equal(f.document.body.attrs['data-error'],'STARTUP_TIMEOUT');assert.equal(f.get('loading').hidden,true);assert.ok(f.get('error-detail').textContent.includes('STAGE: BOOT'));
});
test('background time is not counted as a foreground startup stall',()=>{
 const f=bootFixture();f.visibility(true);f.tick(120000);f.visibility(false);f.tick(1000);assert.equal(f.boot.snapshot().failed,false);
});
test('completed boot disables startup watchdog',()=>{
 const f=bootFixture();f.boot.complete();f.tick(120000);assert.equal(f.boot.snapshot().failed,false);assert.equal(f.get('loading').hidden,true);
});
test('global syntax errors are visible without the main app running',()=>{
 const f=bootFixture();f.events.get('error')({message:'Unexpected token'});assert.equal(f.document.body.attrs['data-error'],'SCRIPT_ERROR');assert.ok(f.get('error-detail').textContent.includes('Unexpected token'));
});
test('safe retry preserves URL seed and opts into low quality',()=>{
 const f=bootFixture();f.get('safe-retry').onclick();const u=new URL(f.context.location.destination);assert.equal(u.searchParams.get('safe'),'1');assert.equal(u.searchParams.get('seed'),'42');assert.equal(u.searchParams.get('quality'),'low');
});
test('rebuild can re-arm a previously completed boot',()=>{
 const f=bootFixture();f.boot.complete();f.boot.begin();f.boot.mark('CHUNKS','生成中',30);f.tick(31001);assert.equal(f.boot.snapshot().failed,true);assert.ok(f.get('error-detail').textContent.includes('CHUNKS'));
});

test('missing split script is reported with its path',()=>{
 const f=bootFixture();f.events.get('error')({target:{tagName:'SCRIPT',src:'https://example.test/SILICON-DRIFT/js/world.js'}});
 assert.equal(f.document.body.attrs['data-error'],'SCRIPT_LOAD_ERROR');
 assert.ok(f.get('error-detail').textContent.includes('/SILICON-DRIFT/js/world.js'));
 assert.equal(f.get('loading').hidden,true);
});
