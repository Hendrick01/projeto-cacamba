// Testes reais de HTTP/WebSocket; inicia um servidor isolado e o encerra.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import http from 'node:http';
import WebSocket from 'ws';
const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));
const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',PUBLIC_URL:'',TRUST_PROXY:'0'},stdio:['ignore','pipe','pipe']});
const sockets=[];let serverErrors='';child.stderr.on('data',d=>{serverErrors+=d});
const timeout=setTimeout(()=>{child.kill();process.exitCode=1;console.error('Timeout da revisão de segurança');},15000);
const opened=async(origin)=>{
 const ws=new WebSocket(`ws://127.0.0.1:${port}`,origin?{origin}:{});sockets.push(ws);ws.messages=[];
 ws.on('message',raw=>ws.messages.push(JSON.parse(raw)));await once(ws,'open');return ws;
};
const send=(ws,msg)=>ws.send(JSON.stringify(msg));
const wait=async(ws,predicate)=>{const end=Date.now()+2000;while(Date.now()<end){const item=ws.messages.find(predicate);if(item)return item;await new Promise(r=>setTimeout(r,10));}throw new Error('Resposta ausente');};
const request=(path,method='GET')=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path,method},res=>{let data='';res.on('data',d=>data+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data}));});req.on('error',reject);req.end();});
try {
 await new Promise((resolve,reject)=>{child.stdout.on('data',d=>{if(String(d).includes('Caçamba no ar'))resolve()});child.on('exit',()=>reject(new Error('Servidor não iniciou')))});
 const page=await request('/');assert.equal(page.status,200);assert.match(page.headers['content-security-policy'],/frame-ancestors 'none'/);
 const head=await request('/models/matheus.glb','HEAD');assert.equal(head.status,200);assert.equal(head.data,'');assert.ok(Number(head.headers['content-length'])>0);
 assert.equal((await request('/','POST')).status,405);
 for(const path of ['/server.js','/package.json','/.git/config','/shared-secret.txt','/../server.js','/%2e%2e/server.js'])assert.equal((await request(path)).status,404,path);
 console.log('OK HTTP: origem de arquivos, HEAD, métodos e cabeçalhos');
 await assert.rejects(opened('https://intruso.test'),/401/);console.log('OK origem externa recusada');
 const a=await opened();send(a,{t:'create',name:'Teste'});const identity=await wait(a,m=>m.t==='welcome');
 const oldClosed=once(a,'close');const b=await opened();send(b,{...identity,t:'resume'});await wait(b,m=>m.t==='welcome');const [code]=await oldClosed;assert.equal(code,4001);
 send(b,{t:'addBot'});await wait(b,m=>m.t==='lobby'&&m.players.length===2);console.log('OK retomada revoga conexão anterior');
 b.messages=[];send(b,{t:'join',code:identity.code,name:'Segundo assento'});await wait(b,m=>m.t==='welcome');const lobby=await wait(b,m=>m.t==='lobby'&&m.players.length===3);
 assert.equal(lobby.players.find(p=>p.id===identity.playerId).connected,false);console.log('OK troca de assento desanexa presença anterior');
 b.messages=[];send(b,null);await wait(b,m=>m.t==='error');send(b,{t:'addBot'});await wait(b,m=>m.t==='lobby'&&m.players.length===4);console.log('OK JSON inválido não derruba o servidor');
 const flood=await opened();const floodClosed=once(flood,'close');for(let i=0;i<1400;i++)send(flood,{});assert.equal((await floodClosed)[0],1008);console.log('OK excesso de mensagens encerrado');
 assert.equal((await request('/')).status,200);assert.equal(serverErrors,'');
} catch (error) { console.error(error.message, serverErrors); process.exitCode=1; } finally {
 clearTimeout(timeout);for(const ws of sockets)ws.terminate();if (child.exitCode === null && child.signalCode === null) { const stopped=once(child,'exit');child.kill('SIGTERM');await stopped; }
}
