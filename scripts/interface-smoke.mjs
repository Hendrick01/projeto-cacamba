import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const base='http://127.0.0.1:3017';
const dir='qa-interface';fs.mkdirSync(dir,{recursive:true});
const server=spawn(process.execPath,['server.js','--port','3017','--host','127.0.0.1'],{stdio:['ignore','pipe','pipe']});
server.stdout.on('data',()=>{});server.stderr.on('data',d=>process.stderr.write(d));
let browser;
const report={checks:[],errors:[],voice:null,webgl:false};
const pages=[];
const ok=label=>{report.checks.push(label);console.log('OK '+label);};
try {
 for(let i=0;i<50;i++){try{const r=await fetch(base);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 const host=await browser.newContext({viewport:{width:1366,height:900},permissions:['microphone'],reducedMotion:'reduce'});
 const guest=await browser.newContext({viewport:{width:390,height:844},permissions:['microphone'],reducedMotion:'reduce'});
 for(const c of [host,guest]) await c.addInitScript(()=>{
  window.__qaPeers=[];window.__qaSockets=[];
  const RTC=window.RTCPeerConnection,WS=window.WebSocket;
  window.RTCPeerConnection=class extends RTC{constructor(...args){super(...args);window.__qaPeers.push(this);}};
  window.WebSocket=class extends WS{constructor(...args){super(...args);window.__qaSockets.push(this);}};
 });
 const a=await host.newPage(),b=await guest.newPage();pages.push(a,b);
 for(const p of pages){p.setDefaultTimeout(20000);p.setDefaultNavigationTimeout(30000);p.on('pageerror',e=>report.errors.push(e.message));}
 console.log('PHASE Home');
 await a.goto(base);await a.waitForSelector('[data-connection][data-state=online]');
 assert.equal(await a.locator('.ui-entry').count(),1);
 await a.screenshot({path:dir+'/home-desktop.png',fullPage:true});
 await b.goto(base);await b.waitForSelector('[data-connection][data-state=online]');
 await b.screenshot({path:dir+'/home-mobile.png',fullPage:true});
 for(const p of [a,b])assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 ok('Home desktop/mobile sem transbordamento horizontal');
 console.log('PHASE lobby');
 await a.click('#btn-personagem');await a.waitForSelector('#screen-avatar:not([hidden])');
 await a.click('#btn-avatar-prox');await a.click('#btn-avatar-ok');await a.waitForSelector('.ui-entry');
 await a.fill('#name-input','QA anfitriao');await a.click('#btn-create');await a.waitForSelector('#screen-lobby:not([hidden])');
 const code=(await a.textContent('#lobby-code')).trim();assert.match(code,/^[A-Z]{4}$/);
 await a.screenshot({path:dir+'/lobby.png',fullPage:true});
 await b.fill('#name-input','QA visitante');await b.fill('#code-input',code);await b.click('#btn-join');await b.waitForSelector('#screen-lobby:not([hidden])');
 await a.click('#btn-start');await Promise.all([a.waitForSelector('#hand .card'),b.waitForSelector('#hand .card')]);
 ok('Personagem, criar sala, entrar por codigo e iniciar partida');
 await b.locator('#hand .card').first().focus();await b.keyboard.press('Enter');
 assert.ok(await b.locator('#hand .card.sel').count()>0);
 await b.screenshot({path:dir+'/mesa-2d-mobile.png',fullPage:true});
 await a.screenshot({path:dir+'/mesa-2d-desktop.png',fullPage:true});
 const bounds=await b.locator('#hand .card').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right};}));
 assert.ok(bounds.every(r=>r.left>=-1&&r.right<=391));
 ok('Mesa 2D: selecao por teclado e cartas dentro da tela');
 console.log('PHASE voice');
 await a.click('#btn-voz');await b.click('#btn-voz');
 try {
  await a.waitForFunction(()=>window.__qaPeers.some(p=>p.connectionState==='connected'),null,{timeout:20000});
  await b.waitForFunction(async()=>{for(const pc of window.__qaPeers){const stats=await pc.getStats();for(const s of stats.values())if(s.type==='inbound-rtp'&&s.kind==='audio'&&s.bytesReceived>0)return true;}return false;},null,{timeout:15000});
  report.voice='RTP de audio sintetico recebido entre dois contextos Chromium';ok(report.voice);
 }catch(e){report.voice='SDP/UI testados; RTP nao confirmado neste runner: '+e.message.split('\n')[0];console.log('LIMIT '+report.voice);}
 await a.click('#btn-voz');assert.equal(await a.getAttribute('#btn-voz','aria-pressed'),'false');
 await a.click('#btn-voz');assert.equal(await a.getAttribute('#btn-voz','aria-pressed'),'true');
 await a.evaluate(()=>window.__qaSockets.at(-1).close());
 await a.waitForFunction(()=>window.__qaSockets.length>=2&&window.__qaSockets.at(-1).readyState===1);
 assert.equal(await a.getAttribute('#btn-voz','aria-pressed'),'true');
 ok('Voz: silenciar, voltar a falar e manter captura apos reconexao WebSocket');
 console.log('PHASE 3D');
 await a.goto(base+'/3d.html');
 await a.waitForFunction(()=>!!window.mesa3d?.renderer,null,{timeout:30000});
 await a.waitForFunction(()=>[...window.mesa3d.assentos.values()].some(a=>a.assento?.modelo),null,{timeout:60000});
 report.webgl=await a.evaluate(()=>!window.mesa3d.renderer.getContext().isContextLost());assert.ok(report.webgl);
 await a.waitForTimeout(800);await a.screenshot({path:dir+'/mesa-3d-desktop.png'});
 await a.setViewportSize({width:390,height:844});await a.waitForTimeout(700);await a.screenshot({path:dir+'/mesa-3d-mobile.png'});
 const hand3d=await a.evaluate(()=>{let cards=[];window.mesa3d.scene.traverse(o=>{if(o.userData?.cardId!==undefined&&o.renderOrder>=100)cards.push(o);});return cards.length;});
 assert.ok(hand3d>=6);ok('Mesa 3D: WebGL ativo, GLB real carregado e leque em retrato/paisagem');
 assert.deepEqual(report.errors,[]);ok('Nenhuma excecao JavaScript nas telas exercitadas');
}catch(e){report.failure=e.stack;console.error(e);process.exitCode=1;
 for(let i=0;i<pages.length;i++){try{await pages[i].screenshot({path:dir+'/failure-'+i+'.png',timeout:8000});}catch{}}
}finally{fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2));await browser?.close();server.kill('SIGTERM');}
