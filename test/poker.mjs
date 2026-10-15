// Prova do Poker pelo fio: dois humanos e dois robôs numa sala de Poker jogam
// algumas mãos — blinds, mesa, pagar, aumentar, correr —, o juiz recusa
// aposta errada, nenhuma ficha some, e a mão seguinte começa sozinha. Depois,
// uma mesa de um humano que só vai de all-in contra três robôs vai até o fim
// do jogo, e o anfitrião recomeça.
//   node test/poker.mjs           sobe um servidor próprio, com robôs rápidos
//   node test/poker.mjs 3023      usa um servidor que já está no ar nessa porta
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';
import { FICHAS_INICIAIS } from '../shared/poker.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let PORT = process.argv.slice(2).find((a) => /^\d+$/.test(a));
let servidor = null, saida = '';
if (!PORT) {
  const livre = net.createServer(); livre.listen(0, '127.0.0.1'); await once(livre, 'listening');
  PORT = livre.address().port; await new Promise((r) => livre.close(r));
  servidor = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PUBLIC_URL: '', TRUST_PROXY: '0', SEGREDO_SALAS: 'chave-do-teste', DATABASE_URL: '', RITMO_DOS_ROBOS: '0.05' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stderr.on('data', (d) => { saida += d; });
  await new Promise((ok, erro) => {
    servidor.stdout.on('data', (d) => { saida += d; if (String(d).includes('Caçamba no ar')) ok(); });
    servidor.on('exit', () => erro(new Error(`o servidor não subiu:\n${saida}`)));
  });
}
const HOST = servidor ? '127.0.0.1' : 'localhost';
const URL = `ws://${HOST}:${PORT}`;

function cliente(nome) {
  const ws = new WebSocket(URL, { headers: { origin: `http://${HOST}:${PORT}` } });
  const c = { nome, ws, eventos: [], erros: [], sessao: null, sumiu: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'state') {
      c.view = m.view;
      for (const e of m.events || []) c.eventos.push(e);
      const total = m.view.players.reduce((s, p) => s + p.fichas, 0) + m.view.pote;
      if (total !== m.view.players.length * FICHAS_INICIAIS) c.sumiu.push(total);
    }
  });
  return new Promise((res) => ws.on('open', () => res(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}
async function ate(cond, ms = 15000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await espera(20); }
  return false;
}

// ---- 1. Mesa de quatro: dois humanos e dois robôs ------------------------------
const A = await cliente('A');
manda(A, { t: 'create', name: 'Ana', modo: 'poker' });
await ate(() => A.lobby);
confere(A.lobby?.modo === 'poker', 'sala criada no modo Poker');
const code = A.sessao.code;
const B = await cliente('B'); manda(B, { t: 'join', code, name: 'Bia' });
await ate(() => B.lobby);
confere(B.lobby?.modo === 'poker', 'quem entra pelo código vê o modo da sala');
manda(A, { t: 'addBot' }); manda(A, { t: 'addBot' });
await ate(() => A.lobby.players.length === 4);
manda(A, { t: 'start' });
await ate(() => A.view && B.view);
const humanos = [A, B];
confere(humanos.every((c) => c.view.modo === 'poker' && c.view.you.hand.length === 2), 'cada um recebeu 2 cartas');
confere(!JSON.stringify(A.view.players).includes('"hand"'), 'a visão não traz a mão de ninguém');
const [sb, bb] = A.view.blinds;
confere(A.view.pote === sb + bb, `blinds postos: pote ${A.view.pote} = ${sb} + ${bb}`);

// Joga como gente cautelosa: dá mesa quando pode, paga até 3 big blinds, corre do resto.
// Uma vez por partida, tenta um aumento abaixo do mínimo (o juiz recusa) e depois aumenta certo.
let tentouErrado = false;
function jogada(c) {
  const y = c.view.you;
  if (y.podeAumentar && !tentouErrado) {
    tentouErrado = true;
    return [{ a: 'aumentar', para: y.minPara - 5 }, { a: 'aumentar', para: y.minPara }];
  }
  if (y.podeMesa) return [{ a: 'mesa' }];
  if (y.paraPagar <= c.view.blinds[1] * 3) return [{ a: 'pagar' }];
  return [{ a: 'correr' }];
}

let maos = 0;
const errosAntes = A.erros.length + B.erros.length;
for (let i = 0; i < 300 && A.view.round < 4 && A.view.phase === 'play'; i++) {
  const v = A.view;
  const daVez = humanos.find((c) => c.sessao.playerId === v.turnId);
  if (!daVez) { await ate(() => A.view.turnNo !== v.turnNo || A.view.phase !== 'play', 20000); continue; }
  const antes = v.turnNo;
  for (const action of jogada(daVez)) manda(daVez, { t: 'action', action });
  await ate(() => A.view.turnNo !== antes || A.view.phase !== 'play');
}
maos = A.eventos.filter((e) => e.e === 'maoFim').length;
confere(maos >= 4, `${maos} mãos completas, começando sozinhas uma depois da outra`);
const recusas = A.erros.length + B.erros.length - errosAntes;
confere(tentouErrado && recusas === 1 && /mínimo/.test([...A.erros, ...B.erros].at(-1) || ''), 'aumento abaixo do mínimo é recusado pelo juiz (e só ele)');
confere(A.eventos.some((e) => e.e === 'aumentou' || e.e === 'apostou'), 'teve aposta ou aumento');
confere(A.eventos.some((e) => e.e === 'etapa' && e.etapa === 'flop'), 'abriu flop');
confere(A.view.ultimaMao && A.view.ultimaMao.potes.length >= 1, 'a visão traz o resultado da mão anterior');
confere(A.sumiu.length === 0 && B.sumiu.length === 0, 'nenhuma ficha sumiu nem apareceu');
const mostrou = A.eventos.find((e) => e.e === 'maoFim' && !e.semShowdown);
if (mostrou) confere(mostrou.mostradas.every((m) => m.cards.length === 2 && m.mao), 'no showdown as mãos aparecem com o nome da combinação');

// B sai: o assento fica, e o jogo nunca aposta por ele (mesa ou corre)
manda(B, { t: 'leave' });
const idB = B.sessao.playerId;
await ate(() => A.eventos.some((e) => e.e === 'desistiu'));
const desdeSaida = A.eventos.length;
await ate(() => A.view.round >= 6 || A.view.phase !== 'play', 30000);
for (let i = 0; i < 300 && A.view.round < 6 && A.view.phase === 'play'; i++) {
  const v = A.view;
  if (v.turnId !== A.sessao.playerId) { await ate(() => A.view.turnNo !== v.turnNo || A.view.phase !== 'play', 20000); continue; }
  for (const action of jogada(A)) manda(A, { t: 'action', action });
  await ate(() => A.view.turnNo !== v.turnNo || A.view.phase !== 'play');
}
const deB = A.eventos.slice(desdeSaida).filter((e) => e.p === idB && ['mesa', 'correu', 'pagou', 'aumentou', 'apostou'].includes(e.e));
confere(deB.length > 0 && deB.every((e) => e.e === 'mesa' || e.e === 'correu'), `quem saiu só dá mesa ou corre (${deB.map((e) => e.e).join(', ')})`);
A.ws.close(); B.ws.close();

// ---- 2. Um humano que só vai de all-in contra três robôs, até o fim ----------
const X = await cliente('X');
manda(X, { t: 'create', name: 'Xavier', modo: 'poker' });
await ate(() => X.lobby);
for (let k = 0; k < 3; k++) manda(X, { t: 'addBot' });
await ate(() => X.lobby.players.length === 4);
manda(X, { t: 'start' });
await ate(() => X.view);
const fim = await ate(() => {
  const v = X.view;
  if (v.phase === 'play' && v.turnId === X.sessao.playerId && !X.mandou?.[v.turnNo]) {
    (X.mandou ||= {})[v.turnNo] = true;
    manda(X, { t: 'action', action: { a: 'allin' } });
  }
  return v.phase === 'gameEnd';
}, 120000);
confere(fim, `a partida chegou ao fim (mão ${X.view.round + 1})`);
const lugares = X.view.players.map((p) => p.lugar).sort((a, b) => a - b);
confere(JSON.stringify(lugares) === '[1,2,3,4]', 'cada um com o seu lugar, do 1º ao 4º');
const campeao = X.view.players.find((p) => p.id === X.view.vencedor);
confere(campeao?.fichas === 4 * FICHAS_INICIAIS, 'o campeão ficou com todas as fichas');
confere(X.sumiu.length === 0, 'nenhuma ficha sumiu nem apareceu');
manda(X, { t: 'playAgain' });
await ate(() => X.view.phase === 'play' && X.view.round === 0);
confere(X.view.phase === 'play' && X.view.players.every((p) => p.fichas + p.aposta === FICHAS_INICIAIS && !p.fora), 'jogar de novo: todo mundo volta com 1.000');
X.ws.close();

if (servidor) {
  servidor.kill();
  confere(!/erro de bot/.test(saida), 'nenhum erro de robô no servidor');
}
console.log(falhou.length ? `\nPOKER FALHOU: ${falhou.length}` : '\nPOKER OK');
process.exit(falhou.length ? 1 : 0);
