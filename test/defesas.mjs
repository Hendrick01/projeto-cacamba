// Teste de fumaça das defesas do servidor (auditoria de 2026-08-28). Rodar com
// o servidor no ar: node test/defesas.mjs [porta]
//
// Cada caso aqui derrubava o processo inteiro (com todas as salas) ou abria
// uma porta que não devia existir. O teste confere que o servidor CONTINUA
// respondendo depois de cada um — é isso que "não derruba" quer dizer.
import http from 'node:http';
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   · ' : '  FALHOU · ') + msg); if (!cond) falhas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function pedido(path) {
  return new Promise((resolve) => {
    const req = http.request({ host: 'localhost', port: PORT, path, method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', () => resolve('erro'));
    req.end();
  });
}
const vivo = async () => (await pedido('/')) === 200;

// 1. URL que faz `new URL()` lançar: era exceção não tratada no listener.
{
  const status = await new Promise((resolve) => {
    const s = http.request({ host: 'localhost', port: PORT, path: '//[', method: 'GET' }, (res) => { res.resume(); resolve(res.statusCode); });
    s.on('error', (e) => resolve('erro: ' + e.message));
    s.end();
  });
  ok(status === 400, `GET //[ responde 400 (veio ${status})`);
  ok(await vivo(), 'o servidor continua de pé depois da URL malformada');
}

// 2. Mensagem acima do maxPayload (16 KB): o ws fecha a conexão sem derrubar nada.
{
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((r) => ws.on('open', r));
  let fechou = null;
  ws.on('close', (code) => { fechou = code; });
  ws.on('error', () => {});
  ws.send(JSON.stringify({ t: 'create', name: 'x'.repeat(40_000) }));
  await espera(400);
  ok(fechou === 1009, `mensagem de 40 KB fecha a conexão com 1009 (veio ${fechou})`);
  ok(await vivo(), 'o servidor continua de pé depois da mensagem grande');
}

// 4. Retomar como robô: token vazio + id público não pode anexar o socket ao robô.
{
  const anfitriao = new WebSocket(`ws://localhost:${PORT}`);
  const msgs = [];
  anfitriao.on('message', (raw) => msgs.push(JSON.parse(raw)));
  await new Promise((r) => anfitriao.on('open', r));
  anfitriao.send(JSON.stringify({ t: 'create', name: 'Anfitrião' }));
  await espera(200);
  anfitriao.send(JSON.stringify({ t: 'addBot' }));
  await espera(200);
  const code = msgs.find((m) => m.t === 'welcome')?.code;
  const lobby = [...msgs].reverse().find((m) => m.t === 'lobby');
  const bot = lobby?.players.find((p) => p.isBot || /Rob[oô]/.test(p.name));
  ok(!!code && !!bot, `sala ${code} com um robô (${bot?.name})`);
  const intruso = new WebSocket(`ws://localhost:${PORT}`);
  const resp = [];
  intruso.on('message', (raw) => resp.push(JSON.parse(raw)));
  await new Promise((r) => intruso.on('open', r));
  intruso.send(JSON.stringify({ t: 'resume', code, playerId: bot?.id, token: '' }));
  await espera(300);
  ok(resp.some((m) => m.t === 'gone') && !resp.some((m) => m.t === 'welcome'), `resume com id do robô e token vazio recebe "gone", não "welcome" (${resp.map((m) => m.t).join(',')})`);
  anfitriao.close(); intruso.close();
}

// 5. O mesmo socket criando duas salas não deixa a primeira com humano "conectado" para sempre.
{
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const msgs = [];
  ws.on('message', (raw) => msgs.push(JSON.parse(raw)));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'create', name: 'Dupla' }));
  await espera(200);
  ws.send(JSON.stringify({ t: 'create', name: 'Dupla' }));
  await espera(200);
  const codes = msgs.filter((m) => m.t === 'welcome').map((m) => m.code);
  ok(codes.length === 2 && codes[0] !== codes[1], `duas salas criadas pelo mesmo socket (${codes.join(', ')})`);
  // Entra na primeira sala com outro socket e olha o lobby: o criador tem de aparecer desconectado.
  const olheiro = new WebSocket(`ws://localhost:${PORT}`);
  const vis = [];
  olheiro.on('message', (raw) => vis.push(JSON.parse(raw)));
  await new Promise((r) => olheiro.on('open', r));
  olheiro.send(JSON.stringify({ t: 'join', code: codes[0], name: 'Olheiro' }));
  await espera(300);
  const lobby1 = [...vis].reverse().find((m) => m.t === 'lobby');
  const criador = lobby1?.players.find((p) => p.name === 'Dupla');
  ok(criador && criador.connected === false, `na sala antiga o criador consta desconectado (connected=${criador?.connected})`);
  ws.close(); olheiro.close();
}

// 6. Cabeçalhos de segurança e as fontes servidas daqui.
{
  const cab = await new Promise((resolve) => {
    const req = http.request({ host: 'localhost', port: PORT, path: '/', method: 'GET' }, (res) => { res.resume(); resolve(res.headers); });
    req.on('error', () => resolve({})); req.end();
  });
  ok(/script-src 'self'/.test(cab['content-security-policy'] || '') && /frame-ancestors 'none'/.test(cab['content-security-policy'] || ''), 'a página vem com CSP (script só daqui, sem embutir em outro site)');
  ok(cab['x-content-type-options'] === 'nosniff' && !!cab['referrer-policy'] && cab['x-frame-options'] === 'DENY', 'nosniff, referrer-policy e x-frame-options presentes');
  ok(/microphone=\(self\)/.test(cab['permissions-policy'] || '') && /camera=\(\)/.test(cab['permissions-policy'] || ''), 'microfone liberado só para esta origem; câmera fechada');
  const fonte = await new Promise((resolve) => {
    const req = http.request({ host: 'localhost', port: PORT, path: '/fonts/nunito-latin.woff2', method: 'GET' }, (res) => { res.resume(); resolve({ status: res.statusCode, tipo: res.headers['content-type'], cache: res.headers['cache-control'] }); });
    req.on('error', () => resolve({})); req.end();
  });
  ok(fonte.status === 200 && fonte.tipo === 'font/woff2' && /max-age/.test(fonte.cache || ''), `a fonte sai daqui como font/woff2 e com cache (${fonte.status}, ${fonte.tipo})`);
}

console.log(falhas ? `\nDEFESAS FALHARAM: ${falhas}` : '\nDEFESAS OK: 12/12');
process.exit(falhas ? 1 : 0);
