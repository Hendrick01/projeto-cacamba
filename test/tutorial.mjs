// Prova da SALA DE TUTORIAL pelo fio, do jeito que o app a usa:
//   1. `create` com `tutorial: true` já devolve a partida começada, com um robô;
//   2. o lobby diz `tutorial`, e ninguém de fora consegue entrar;
//   3. a mão é a do roteiro (shared/tutorial.js);
//   4. jogando o roteiro — monte, baixar, encaixar, descartar, meio, baixar —
//      o robô larga o K♠ e quem aprende BATE.
// Rodar com o servidor no ar (com robô rápido, para não esperar):
//   RITMO_DOS_ROBOS=0.05 PORT=3057 node server.js
//   node test/tutorial.mjs 3057
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (cond, ms = 8000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await espera(40); }
  return false;
};

function cliente() {
  const ws = new WebSocket(URL, { headers: { Origin: `http://localhost:${PORT}` } });
  const c = { ws, eventos: [], erros: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'state') { c.view = m.view; for (const e of m.events || []) c.eventos.push(e); }
  });
  return new Promise((ok) => ws.on('open', () => ok(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const acao = (c, action) => manda(c, { t: 'action', action });
const carta = (mao, valor, naipe) => mao.find((x) => x.rank === valor && x.suit === naipe);
let total = 0;
const falhou = [];
function confere(ok, texto) {
  total++;
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}

const A = await cliente();
manda(A, { t: 'create', name: 'Aprendiz', tutorial: true });
await ate(() => A.view && A.lobby?.started);
confere(A.lobby?.tutorial === true, 'o lobby diz que a sala é de tutorial');
confere(A.lobby?.players.length === 2 && A.lobby.players.some((p) => p.isBot), 'a sala nasce com um robô');
confere(!!A.view && A.view.phase === 'draw' && A.view.turnId === A.sessao.playerId, 'a partida já começou, na vez de quem aprende');
const mao0 = (A.view?.you?.hand || []).map((c) => `${c.rank}/${c.suit}`).sort().join(' ');
confere(mao0 === ['7/1', '7/0', '7/2', '13/3', '13/2', '2/0'].sort().join(' '), `a mão é a do roteiro (${mao0})`);

const B = await cliente();
manda(B, { t: 'join', code: A.sessao.code, name: 'Intrometido' });
await ate(() => B.erros.length > 0, 2000);
confere(B.erros.length === 1 && !B.sessao, 'ninguém de fora entra na sala de tutorial');

// o roteiro
acao(A, { a: 'draw', source: 'deck' });
await ate(() => A.view.phase === 'play');
let mao = A.view.you.hand;
confere(mao.filter((c) => c.rank === 7).length === 4, 'o monte deu o segundo 7');
acao(A, { a: 'baixar', cardIds: [carta(mao, 7, 1).id, carta(mao, 7, 0).id, carta(mao, 7, 2).id] });
await ate(() => A.view.players.find((p) => p.id === A.sessao.playerId).melds.length === 1);
const meu = () => A.view.players.find((p) => p.id === A.sessao.playerId);
confere(meu().melds.length === 1, 'baixou a trinca de 7');
const outro7 = A.view.you.hand.find((c) => c.rank === 7);
acao(A, { a: 'layoff', cardId: outro7.id, meldId: meu().melds[0].id });
await ate(() => meu().melds[0].cards.length === 4);
confere(meu().melds[0].cards.length === 4, 'encaixou o outro 7 de copas');
acao(A, { a: 'discard', cardId: carta(A.view.you.hand, 2, 0).id });
const kEspadas = () => A.view.discardTop && A.view.discardTop.rank === 13 && A.view.discardTop.suit === 0;
confere(await ate(() => A.view.turnId === A.sessao.playerId && kEspadas(), 10000), 'o robô jogou e largou o K♠ no meio');
acao(A, { a: 'draw', source: 'discard' });
await ate(() => A.view.phase === 'play');
mao = A.view.you.hand;
const reis = mao.filter((c) => c.rank === 13);
confere(reis.length === 3 && mao.length === 3, 'pegou o rei do meio: três reis na mão');
acao(A, { a: 'baixar', cardIds: reis.map((c) => c.id) });
await ate(() => A.view.phase === 'roundEnd');
const fim = A.eventos.find((e) => e.e === 'roundEnd');
confere(!!fim && fim.reason === 'bateu' && fim.winnerId === A.sessao.playerId, 'quem aprende BATEU');

for (const c of [A, B]) { try { c.ws.close(); } catch { /* ok */ } }
await espera(200);
console.log(falhou.length ? `\nTUTORIAL FALHOU: ${falhou.length} de ${total}` : `\nTUTORIAL OK: ${total}/${total}`);
process.exit(falhou.length ? 1 : 0);
