// Prova do Presidente pelo fio: três humanos numa sala de Presidente jogam uma
// rodada inteira, e a seguinte começa com a troca feita POR HUMANO — o Cu
// entrega as 2 mais fortes e o Presidente escolhe quais devolve.
// Confere também que uma sala de Caçamba continua nascendo Caçamba.
// Rodar com o servidor no ar:
//   node test/presidente.mjs [porta] [--parar-na-troca]
// Com --parar-na-troca, sai na hora da troca e imprime a sessão de quem
// devolve: dá para colar no localStorage do navegador e ver a tela da troca.
import WebSocket from 'ws';
import { motivoDaRecusa, forca } from '../shared/presidente.js';

const PORT = process.argv.find((a) => /^\d+$/.test(a)) || process.env.PORT || 3000;
const PARAR = process.argv.includes('--parar-na-troca');
const URL = `ws://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function cliente(nome) {
  const ws = new WebSocket(URL, { headers: { origin: `http://localhost:${PORT}` } });
  const c = { nome, ws, eventos: [], erros: [], sessao: null };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'state') { c.view = m.view; for (const e of m.events || []) c.eventos.push(e); }
  });
  return new Promise((res) => ws.on('open', () => res(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}

// Caçamba continua sendo o padrão
const K = await cliente('K');
manda(K, { t: 'create', name: 'Caçambeiro' });
await espera(300);
confere(K.lobby?.modo === 'cacamba', 'sala sem modo nasce Caçamba');
K.ws.close();

const A = await cliente('A');
manda(A, { t: 'create', name: 'Ana', modo: 'presidente' });
await espera(300);
confere(A.lobby?.modo === 'presidente', 'sala criada no modo Presidente');
const code = A.sessao.code;
const B = await cliente('B'); manda(B, { t: 'join', code, name: 'Bia' });
await espera(250);
manda(A, { t: 'start' });
await espera(250);
confere(A.erros.some((e) => /pelo menos/.test(e)), 'Presidente não começa com 2');
const C = await cliente('C'); manda(C, { t: 'join', code, name: 'Caio' });
await espera(250);
confere(B.lobby?.modo === 'presidente', 'quem entra pelo código vê o modo da sala');
manda(A, { t: 'start' });
await espera(500);
const todos = [A, B, C];
confere(todos.every((c) => c.view?.modo === 'presidente' && c.view.you.hand.length >= 17), 'cada um recebeu a mão do Presidente (52 cartas em 3)');

// Joga como um robô simples: o grupo mais fraco que cobre, ou passa.
function jogada(v) {
  const grupos = new Map();
  for (const c of v.you.hand) { if (!grupos.has(c.rank)) grupos.set(c.rank, []); grupos.get(c.rank).push(c); }
  const gs = [...grupos.values()].sort((a, b) => forca(a[0]) - forca(b[0]));
  if (!v.mesa) return { a: 'jogar', cardIds: gs[0].map((c) => c.id) };
  for (const g of gs) {
    const cartas = g.slice(0, v.mesa.n);
    if (cartas.length === v.mesa.n && !motivoDaRecusa(v.mesa, cartas)) return { a: 'jogar', cardIds: cartas.map((c) => c.id) };
  }
  return { a: 'passar' };
}

async function jogaAteAcabar() {
  for (let i = 0; i < 400; i++) {
    const v = A.view;
    if (v.phase !== 'play') return v.phase;
    const daVez = todos.find((c) => c.sessao.playerId === v.turnId);
    const antes = v.turnNo;
    manda(daVez, { t: 'action', action: jogada(daVez.view) });
    for (let k = 0; k < 40 && A.view.turnNo === antes && A.view.phase === 'play'; k++) await espera(15);
  }
  return 'travou';
}

confere(await jogaAteAcabar() === 'roundEnd', 'a rodada 1 chegou ao fim só com humanos');
const lr = A.view.lastRound;
confere(lr && new Set(lr.ordem).size === 3, `ordem de saída com os 3: ${lr?.ordem.map((id) => todos.find((c) => c.sessao.playerId === id).nome).join(' > ')}`);
confere(lr && lr.titulos[lr.ordem[0]] === 'presidente' && lr.titulos[lr.ordem[2]] === 'cu', 'primeiro é Presidente, último é Cu');
confere(todos.every((c) => c.erros.every((e) => /pelo menos/.test(e))), 'nenhuma jogada recusada pelo juiz');

manda(B, { t: 'nextRound' });
await espera(200);
confere(B.erros.some((e) => /Só quem criou/.test(e)), 'só o anfitrião avança a rodada');
manda(A, { t: 'nextRound' });
await espera(400);
const pres = todos.find((c) => c.sessao.playerId === lr.ordem[0]);
const cu = todos.find((c) => c.sessao.playerId === lr.ordem[2]);
confere(A.view.phase === 'troca' && A.view.troca?.de === pres.sessao.playerId && A.view.troca.n === 2, 'rodada 2 abre na troca, com o Presidente devolvendo 2');
// 52 em 3 dá 18/17/17, e a carta a mais gira de assento a cada rodada
confere([19, 20].includes(pres.view.you.hand.length) && [15, 16].includes(cu.view.you.hand.length), 'o Cu já entregou as 2 mais fortes ao Presidente');
const antesDaTroca = { pres: pres.view.you.hand.length, cu: cu.view.you.hand.length };

if (PARAR) {
  console.log(`\nSessão de quem devolve (${pres.nome}):\n${JSON.stringify({ code: pres.sessao.code, playerId: pres.sessao.playerId, token: pres.sessao.token })}`);
  for (const c of todos) if (c !== pres) c.ws.close();
  pres.ws.close();
  process.exit(falhou.length ? 1 : 0);
}

const errosAntes = pres.erros.length;
manda(pres, { t: 'action', action: { a: 'trocar', cardIds: [pres.view.you.hand[0].id] } });
await espera(200);
confere(pres.erros.length > errosAntes, 'devolver 1 quando são 2 é recusado');
const fracas = [...pres.view.you.hand].sort((a, b) => forca(a) - forca(b)).slice(0, 2);
manda(pres, { t: 'action', action: { a: 'trocar', cardIds: fracas.map((c) => c.id) } });
await espera(300);
confere(A.view.phase === 'play', 'depois da troca a rodada começa');
confere(A.view.turnId === cu.sessao.playerId, 'o Cu abre a rodada');
confere(pres.view.you.hand.length === antesDaTroca.pres - 2 && cu.view.you.hand.length === antesDaTroca.cu + 2, 'as mãos voltam ao tamanho');
confere(fracas.every((f) => cu.view.you.hand.some((c) => c.id === f.id)), 'as cartas escolhidas foram para o Cu');

confere(await jogaAteAcabar() === 'roundEnd', 'a rodada 2 também chegou ao fim');
const pts = A.view.players.reduce((s, p) => s + p.pontos, 0);
confere(pts === 6, 'pontos: 2+1+0 por rodada, 6 em duas');

for (const c of todos) c.ws.close();
console.log(falhou.length ? `\nPRESIDENTE FALHOU: ${falhou.length}` : '\nPRESIDENTE OK');
process.exit(falhou.length ? 1 : 0);
