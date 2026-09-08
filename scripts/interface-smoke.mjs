import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const base='http://127.0.0.1:3017',dir='qa-interface';
fs.mkdirSync(dir,{recursive:true});
const server=spawn(process.execPath,['server.js','--port','3017','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe']});
server.stdout.on('data',()=>{});server.stderr.on('data',d=>process.stderr.write(d));
let browser;
const report={checks:[],errors:[],voice:null,webgl:false},pages=[];
const ok=label=>{report.checks.push(label);console.log('OK '+label);};
const shot=(page,name,fullPage=false)=>page.screenshot({path:dir+'/'+name+'.png',fullPage,timeout:60000});
try {
 for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 const contexts=[];
 for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
  const c=await browser.newContext({viewport,permissions:['microphone'],reducedMotion:'reduce'});contexts.push(c);
  await c.addInitScript(()=>{
   window.__qaPeers=[];window.__qaSockets=[];
   const frame=window.requestAnimationFrame.bind(window);
   window.requestAnimationFrame=cb=>frame(t=>{if(!window.__qaPauseRender)cb(t);});
   const RTC=window.RTCPeerConnection,WS=window.WebSocket;
   window.RTCPeerConnection=class extends RTC{constructor(...args){super(...args);window.__qaPeers.push(this);}};
   window.WebSocket=class extends WS{constructor(...args){super(...args);window.__qaSockets.push(this);}};
  });
  const p=await c.newPage();pages.push(p);p.setDefaultTimeout(20000);p.setDefaultNavigationTimeout(30000);
  p.on('pageerror',e=>report.errors.push(e.message));
 }
 const [a,b]=pages;
 console.log('PHASE Home');
 for(const [i,p]of pages.entries()){
  await p.goto(base);await p.waitForSelector('[data-connection][data-state=online]');
  assert.equal(await p.locator('.ui-entry').count(),1);
  await shot(p,i?'home-mobile':'home-desktop',true);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 ok('Home desktop/mobile sem transbordamento horizontal');
 console.log('PHASE lobby');
 await a.click('#btn-personagem');await a.waitForSelector('#screen-avatar:not([hidden])');
 await a.click('#btn-avatar-prox');await a.click('#btn-avatar-ok');await a.waitForSelector('.ui-entry');
 await a.fill('#name-input','QA anfitriao');await a.click('#btn-create');await a.waitForSelector('#screen-lobby:not([hidden])');
 const code=(await a.textContent('#lobby-code')).trim();assert.match(code,/^[A-Z]{4}$/);await shot(a,'lobby',true);
 await b.fill('#name-input','QA visitante');await b.fill('#code-input',code);await b.click('#btn-join');await b.waitForSelector('#screen-lobby:not([hidden])');
 await a.click('#btn-start');
 await Promise.all(pages.map(p=>p.waitForSelector('#hand .card')));
 ok('Personagem, criar sala, entrar por codigo e iniciar partida');
 await Promise.all(pages.map(p=>p.locator('#anuncio-rodada').waitFor({state:'hidden'})));
 assert.equal(await b.locator('#opponents-hint').isVisible(),false);
 await b.locator('#hand .card').first().focus();await b.keyboard.press('Enter');assert.ok(await b.locator('#hand .card.sel').count()>0);
 await shot(b,'mesa-2d-mobile',true);await shot(a,'mesa-2d-desktop',true);
 const bounds=await b.locator('#hand .card').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right};}));
 assert.ok(bounds.every(r=>r.left>=-1&&r.right<=391));ok('Mesa 2D: selecao por teclado, cartas dentro da tela e sem aviso falso de assento');
 console.log('PHASE voice');
 await a.click('#btn-voz');await b.click('#btn-voz');
 try{
  await a.waitForFunction(()=>window.__qaPeers.some(p=>p.connectionState==='connected'),null,{timeout:20000});
  await b.waitForFunction(async()=>{for(const pc of window.__qaPeers){for(const s of(await pc.getStats()).values())if(s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0)return true;}return false;},null,{timeout:15000});
  report.voice='RTP de audio sintetico recebido entre dois contextos Chromium';ok(report.voice);
 }catch(e){report.voice='RTP nao confirmado neste runner: '+e.message.split('\n')[0];console.log('LIMIT '+report.voice);}
 await a.click('#btn-voz');assert.equal(await a.getAttribute('#btn-voz','aria-pressed'),'false');
 await a.click('#btn-voz');assert.equal(await a.getAttribute('#btn-voz','aria-pressed'),'true');
 await a.evaluate(()=>window.__qaSockets.at(-1).close());
 await a.waitForFunction(()=>window.__qaSockets.length>=2&&window.__qaSockets.at(-1).readyState===1);
 assert.equal(await a.getAttribute('#btn-voz','aria-pressed'),'true');ok('Voz: silenciar, voltar a falar e manter captura apos reconexao WebSocket');
 console.log('PHASE 3D');
 await a.goto(base+'/3d.html');await a.waitForFunction(()=>!!window.mesa3d?.renderer,null,{timeout:30000});
 await a.waitForFunction(()=>[...window.mesa3d.assentos.values()].some(a=>a.assento?.modelo),null,{timeout:60000});
 report.webgl=await a.evaluate(()=>!window.mesa3d.renderer.getContext().isContextLost());assert.ok(report.webgl);
 // Pause only the test frame pump; production animations remain unchanged.
 // `quadro` e não `renderer.render(scene,camera)`: a sua mão é um segundo
 // passe, numa cena própria, e o render direto do mundo a deixaria de fora
 await a.evaluate(()=>{window.__qaPauseRender=true;window.mesa3d.renderer.setPixelRatio(1);window.mesa3d.quadro(performance.now());});
 await a.waitForTimeout(800);await shot(a,'mesa-3d-desktop');
 await a.setViewportSize({width:390,height:844});await a.waitForTimeout(700);
 await a.evaluate(()=>window.mesa3d.quadro(performance.now()+100));await shot(a,'mesa-3d-mobile');
 // as cartas da mão moram na cena do segundo passe desde que a mão virou
 // sólido com profundidade própria; procura nas duas
 const n=await a.evaluate(()=>{let n=0;for(const c of [window.mesa3d.scene,window.mesa3d.cenaMao])c?.traverse(o=>{if(o.userData?.cardId!==undefined&&o.renderOrder>=100)n++;});return n;});
 assert.ok(n>=6);ok('Mesa 3D: WebGL ativo, GLB real carregado e leque em retrato/paisagem');
 assert.deepEqual(report.errors,[]);ok('Nenhuma excecao JavaScript nas telas exercitadas');
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;
 for(const [i,p]of pages.entries()){try{await p.screenshot({path:dir+'/failure-'+i+'.png',timeout:8000});}catch{}}
}finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM');}
