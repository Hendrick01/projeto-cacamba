// Aliados roteirizados para conferir a TELA com sobras na mesa. Entram numa
// sala existente (você é o anfitrião, no navegador) e jogam de um jeito que
// gera sobras rápido: baixam UM jogo por vez e encaixam sempre que a trava
// deixa — é dos encaixes que as sobras nascem. Ferramenta de QA, não teste.
//
//   node test/aliados.mjs CODIGO [quantos=3] [porta=3000]
import WebSocket from 'ws';
import { findContractMelds, layoffOption, removableCards } from '../shared/engine.js';

const CODE = process.argv[2];
const N = Number(process.argv[3] || 3);
const PORT = process.argv[4] || 3000;
if (!CODE) { console.error('uso: node aliados.mjs CODIGO [n] [porta]'); process.exit(1); }
let sobrasVistas = 0;

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { name, ws, id: null, view: null, lastAction: null };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', code: CODE, name })));
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.t === 'welcome') { c.id = msg.playerId; console.log(`${name} entrou`); }
    if (msg.t === 'error') {
      const a = c.lastAction?.a;
      if (a === 'baixar' || a === 'layoff') { if (a === 'baixar') c.semBaixar = true; else c.semEncaixe = true; c.lastSig = null; setImmediate(() => act(c)); return; }
      console.error(`[${name}] erro: ${msg.msg} · ${JSON.stringify(c.lastAction)}`);
    }
    if (msg.t === 'state') { c.view = msg.view; setImmediate(() => act(c)); }
  });
  ws.on('close', () => console.log(`${name} saiu`));
  return c;
}
const action = (c, a) => { c.lastAction = a; c.ws.send(JSON.stringify({ t: 'action', action: a })); };

function act(c) {
  const v = c.view; if (!v) return;
  if (v.phase === 'gameEnd') return;
  if (v.phase === 'roundEnd') return;
  const n = v.players.reduce((s, p) => s + (p.melds || []).reduce((t, m) => t + removableCards(m).length, 0), 0);
  if (n > sobrasVistas) { sobrasVistas = n; console.log(`sobras na mesa agora: ${n}`); }
  if (v.turnId !== c.id) { c.semBaixar = false; c.semEncaixe = false; return; }
  const sig = JSON.stringify([v.phase, v.deckCount, v.discardCount, v.you.hand.map((x) => x.id), v.players.map((p) => (p.melds || []).map((m) => m.cards.length))]);
  if (sig === c.lastSig) return; c.lastSig = sig;
  if (v.phase === 'draw') { action(c, { a: 'draw', source: 'deck' }); return; }
  if (v.phase !== 'play') return;
  const hand = v.you.hand;
  const rem = v.you.remaining || { t: 0, s: 0 };
  if (!c.semBaixar && (rem.t > 0 || rem.s > 0)) {
    const fecha = findContractMelds(hand, rem.t, rem.s);
    const umaT = rem.t > 0 && hand.length - 3 >= 2 && findContractMelds(hand, 1, 0);
    const umaS = rem.s > 0 && hand.length - 4 >= 2 && findContractMelds(hand, 0, 1);
    // Um jogo por vez, com as cartas ditas: baixar o contrato inteiro de uma
    // vez bate na mesma jogada e some com a mesa que se quer olhar.
    if (umaT) { action(c, { a: 'baixar', cardIds: umaT.trincas[0].map((x) => x.id) }); return; }
    if (umaS) { action(c, { a: 'baixar', cardIds: umaS.seqs[0].cards.map((x) => x.id) }); return; }
    if (fecha) { action(c, { a: 'baixar', cardIds: [] }); return; }
  }
  if (!c.semEncaixe && hand.length >= 3) {
    for (const card of hand) for (const m of v.players.flatMap((p) => p.melds || [])) {
      if (layoffOption(card, m)) { action(c, { a: 'layoff', cardId: card.id, meldId: m.id }); return; }
    }
  }
  const worst = [...hand].sort((a, b) => b.rank - a.rank)[0];
  action(c, { a: 'discard', cardId: worst.id });
}
for (let i = 0; i < N; i++) client(['Bia', 'Caio', 'Dani', 'Edu', 'Fabi'][i] || `Aliado${i}`);
setTimeout(() => { console.log('aliados encerrando (tempo)'); process.exit(0); }, 240_000);
