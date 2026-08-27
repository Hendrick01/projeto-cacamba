// Teste de integração: 2 jogadores roteirizados jogam uma partida completa
// contra o servidor real. Rodar com o servidor no ar:
//   node test/e2e.mjs [porta]
import WebSocket from 'ws';
import { findContractMelds, layoffOption } from '../shared/engine.js';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;

const deadline = setTimeout(() => {
  console.error('E2E FALHOU: tempo esgotado (120s)');
  process.exit(1);
}, 120_000);

let roundsSeen = 0;
let claimsMade = 0;
let buysSeen = 0;

function client(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, id: null, view: null, isHost: false, hostId: null, code: null, acting: false };

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.t === 'welcome') { c.id = msg.playerId; c.code = msg.code; c.onWelcome?.(msg); }
    if (msg.t === 'lobby') { c.hostId = msg.hostId; c.onLobby?.(msg); }
    if (msg.t === 'error') { console.error(`[${name}] erro do servidor:`, msg.msg); process.exit(1); }
    if (msg.t === 'state') {
      c.view = msg.view;
      for (const ev of msg.events || []) {
        if (ev.e === 'buy') buysSeen++;
        if (ev.e === 'roundEnd') roundsSeen++;
      }
      setImmediate(() => act(c));
    }
  });
  return c;
}

function send(c, msg) { c.ws.send(JSON.stringify(msg)); }
function action(c, a) { send(c, { t: 'action', action: a }); }

function act(c) {
  const v = c.view;
  if (!v) return;

  if (v.phase === 'gameEnd') {
    if (c.isHost && !c.finished) {
      c.finished = true;
      finish(v);
    }
    return;
  }
  if (v.phase === 'roundEnd') {
    if (c.isHost && c.lastNextRound !== v.round) {
      c.lastNextRound = v.round;
      setTimeout(() => send(c, { t: 'nextRound' }), 10);
    }
    return;
  }

  const myTurn = v.turnId === c.id;

  // Fora da vez: de vez em quando pede a carta do meio (testa a compra)
  if (!myTurn && v.phase === 'draw' && v.discardFresh && v.discardBuyable && !v.claims.includes(c.id)) {
    if (Math.random() < 0.25) { claimsMade++; action(c, { a: 'claim' }); }
    return;
  }
  if (!myTurn) return;

  // Age uma vez por estado relevante (broadcasts de "quer a carta" não mudam nada aqui)
  const sig = JSON.stringify([v.phase, v.turnId, v.deckCount, v.discardCount, v.you.hand.map((x) => x.id), v.you.baixou]);
  if (sig === c.lastSig) return;
  c.lastSig = sig;

  if (v.phase === 'draw') {
    const source = v.discardBuyable && Math.random() < 0.3 ? 'discard' : 'deck';
    action(c, { a: 'draw', source });
    return;
  }

  if (v.phase === 'play') {
    const hand = v.you.hand;
    const ct = v.contract;
    if (!v.you.baixou && findContractMelds(hand, ct.t, ct.s)) {
      action(c, { a: 'baixar', cardIds: [] });
      return;
    }
    if (v.you.baixou) {
      const melds = v.players.flatMap((p) => p.melds);
      for (const card of hand) {
        for (const m of melds) {
          if (layoffOption(card, m)) { action(c, { a: 'layoff', cardId: card.id, meldId: m.id }); return; }
        }
      }
    }
    // Descarta a carta de maior valor
    const worst = [...hand].sort((a, b) => b.rank - a.rank)[0];
    action(c, { a: 'discard', cardId: worst.id });
  }
}

function finish(v) {
  clearTimeout(deadline);
  if (roundsSeen < 7) { console.error(`E2E FALHOU: só ${roundsSeen} rodadas`); process.exit(1); }
  if (!v.ranking || v.ranking.length !== 2) { console.error('E2E FALHOU: ranking inválido'); process.exit(1); }
  console.log(`E2E OK: 7 rodadas completas · pedidos de compra: ${claimsMade} · compras efetivadas: ${buysSeen}`);
  console.log('Ranking:', v.ranking.map((r) => `${r.name}=${r.score}`).join(' · '));
  process.exit(0);
}

const ana = client('Ana');
ana.isHost = true;
ana.ws.on('open', () => send(ana, { t: 'create', name: 'Ana E2E' }));
ana.onLobby = (lobby) => {
  if (!ana.invited) {
    ana.invited = true;
    const bia = client('Bia');
    bia.ws.on('open', () => send(bia, { t: 'join', code: ana.code, name: 'Bia E2E' }));
    bia.onWelcome = () => setTimeout(() => send(ana, { t: 'start' }), 100);
  }
};
