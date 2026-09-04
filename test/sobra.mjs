// Teste de integração das três portas da SOBRA, pelo fio, contra o servidor
// real. Rodar com o servidor no ar:
//   node test/sobra.mjs [porta]
//
// Três clientes roteirizados jogam como no e2e. A Ana, além de jogar, exercita
// as regras da casa de 2026-08-28: leva uma carta que sobra para a MÃO
// (`tomarSobra`) e descarta uma que sobra num jogo ALHEIO (`meldDiscard`),
// conferindo o estado que volta do servidor depois de cada uma.
//
// As sobras nascem do jogo (encaixes que deixam trinca com 4 ou sequência com
// 5), então este teste depende do sorteio: se uma partida inteira não gerar
// sobra alguma, ele avisa e sai com código 2 — rodar de novo é a resposta.
//
// A mesa é de QUATRO de propósito: com três jogadores o jogo usa um baralho
// só, e aí existe uma única quarta carta de cada valor na partida inteira —
// três partidas seguidas (21 rodadas) passaram sem sobra nenhuma. Com quatro
// são dois baralhos, e os encaixes valem a qualquer momento (a regra que
// exigia ter baixado caiu), o que é o que faz as trincas chegarem a 4.
import WebSocket from 'ws';
import { findContractMelds, layoffOption, removableCards, isJoker } from '../shared/engine.js';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;

const feitos = { tomou: 0, tomouDeOutro: 0, descartouDeJogo: 0, descartouDeOutro: 0, coringaSobrando: 0, rodadas: 0 };
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   · ' : '  FALHOU · ') + msg); if (!cond) falhas++; };

const deadline = setTimeout(() => { console.error('SOBRA FALHOU: tempo esgotado (150s)'); process.exit(1); }, 200_000);

function client(name) {
  const ws = new WebSocket(URL);
  const c = { name, ws, id: null, view: null, isHost: false, code: null, lastAction: null, pendente: null };
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.t === 'welcome') { c.id = msg.playerId; c.code = msg.code; }
    if (msg.t === 'lobby') c.onLobby?.(msg);
    if (msg.t === 'error') {
      // Baixar e encaixar são tentativas do roteiro, e o juiz pode recusar
      // (a trava das duas cartas, por exemplo): desiste delas neste turno e
      // segue. Qualquer outra recusa é bug de verdade.
      const a = c.lastAction?.a;
      if (a === 'baixar' || a === 'layoff') {
        if (a === 'baixar') c.semBaixar = true; else c.semEncaixe = true;
        c.lastSig = null;
        setImmediate(() => act(c));
        return;
      }
      console.error(`[${name}] erro do servidor: ${msg.msg}\n  última ação: ${JSON.stringify(c.lastAction)}`);
      process.exit(1);
    }
    if (msg.t === 'state') {
      c.view = msg.view;
      for (const ev of msg.events || []) if (ev.e === 'roundEnd') feitos.rodadas++;
      if (c.pendente) confere(c);
      setImmediate(() => act(c));
    }
  });
  return c;
}

function send(c, msg) { c.ws.send(JSON.stringify(msg)); }
function action(c, a) { c.lastAction = a; send(c, { t: 'action', action: a }); }

const meldsDe = (v, p) => (p.melds || []).map((m) => ({ ...m, ownerId: p.id }));
function sobrasDaMesa(v, meuId) {
  const fora = [];
  for (const p of v.players) {
    for (const m of meldsDe(v, p)) {
      for (const card of removableCards(m)) fora.push({ meld: m, card, dono: p.id, deOutro: p.id !== meuId });
    }
  }
  return fora;
}
function meldNaVisao(v, meldId) {
  for (const p of v.players) for (const m of p.melds || []) if (m.id === meldId) return m;
  return null;
}

// O que a Ana espera ver no estado seguinte a uma das duas ações novas.
function confere(c) {
  const { tipo, meldId, cardId, tamanhoAntes, maoAntes, deOutro } = c.pendente;
  const v = c.view;
  const meld = meldNaVisao(v, meldId);
  c.pendente = null;
  if (tipo === 'tomar') {
    ok(v.you.hand.some((x) => x.id === cardId), `tomarSobra: a carta veio para a mão (${deOutro ? 'de jogo alheio' : 'de jogo próprio'})`);
    ok(v.you.hand.length === maoAntes + 1, 'tomarSobra: a mão cresceu em uma');
    ok(meld && meld.cards.length === tamanhoAntes - 1, 'tomarSobra: o jogo da mesa encurtou em uma e continua lá');
    ok(v.phase === 'play' && v.turnId === c.id, 'tomarSobra: não passou a vez');
    feitos.tomou++; if (deOutro) feitos.tomouDeOutro++;
  } else {
    ok(!v.you.hand.some((x) => x.id === cardId) && v.you.hand.length === maoAntes, 'meldDiscard: a mão ficou intacta');
    ok(meld && meld.cards.length === tamanhoAntes - 1, 'meldDiscard: o jogo encurtou em uma e continua válido');
    ok(v.discardTop && v.discardTop.id === cardId, 'meldDiscard: a carta está no topo do meio');
    ok(v.turnId !== c.id, 'meldDiscard: a vez passou');
    feitos.descartouDeJogo++; if (deOutro) feitos.descartouDeOutro++;
  }
}

function act(c) {
  const v = c.view;
  if (!v) return;
  if (v.phase === 'gameEnd') { if (c.isHost && !c.finished) { c.finished = true; finish(); } return; }
  if (v.phase === 'roundEnd') {
    if (c.isHost && c.lastNextRound !== v.round) { c.lastNextRound = v.round; setTimeout(() => send(c, { t: 'nextRound' }), 10); }
    return;
  }
  const myTurn = v.turnId === c.id;
  if (!myTurn) { c.tomouNoTurno = false; c.semBaixar = false; c.semEncaixe = false; return; }
  if (c.pendente) return;

  const sig = JSON.stringify([v.phase, v.turnId, v.deckCount, v.discardCount, v.you.hand.map((x) => x.id), v.you.baixou,
    v.players.map((p) => (p.melds || []).map((m) => m.cards.length))]);
  if (sig === c.lastSig) return;
  c.lastSig = sig;

  if (v.phase === 'draw') { action(c, { a: 'draw', source: 'deck' }); return; }

  if (v.phase === 'play') {
    const hand = v.you.hand;
    const sobras = sobrasDaMesa(v, c.id);
    if (sobras.some((s) => isJoker(s.card))) feitos.coringaSobrando++;

    // A Ana: uma sobra para a mão por vez (prefere a de adversário), enquanto
    // ainda não provou as duas portas.
    if (c.isHost && sobras.length && !c.tomouNoTurno && feitos.tomou < 2) {
      const s = sobras.find((x) => x.deOutro) || sobras[0];
      c.tomouNoTurno = true;
      c.pendente = { tipo: 'tomar', meldId: s.meld.id, cardId: s.card.id, tamanhoAntes: s.meld.cards.length, maoAntes: hand.length, deOutro: s.deOutro };
      action(c, { a: 'tomarSobra', meldId: s.meld.id, cardId: s.card.id });
      return;
    }
    // Baixa o que der, UM JOGO DE CADA VEZ. É isso que abre a janela para os
    // outros encaixarem — e é dos encaixes que as sobras nascem. O e2e só
    // baixa o contrato inteiro, e aí quem baixa bate na mesma jogada: a rodada
    // acaba antes de alguém encaixar qualquer coisa (84 rodadas sem sobra).
    const rem = v.you.remaining || { t: 0, s: 0 };
    if (!c.semBaixar && (rem.t > 0 || rem.s > 0)) {
      const fecha = findContractMelds(hand, rem.t, rem.s);
      const umaTrinca = rem.t > 0 && hand.length - 3 >= 2 && findContractMelds(hand, 1, 0);
      const umaSeq = rem.s > 0 && hand.length - 4 >= 2 && findContractMelds(hand, 0, 1);
      if (fecha || umaTrinca || umaSeq) { action(c, { a: 'baixar', cardIds: [] }); return; }
    }
    // Encaixar vale a qualquer momento; a única trava é não ficar com menos de
    // duas cartas sem o contrato, por isso só com três ou mais na mão.
    if (!c.semEncaixe && hand.length >= 3) {
      for (const card of hand) {
        for (const m of v.players.flatMap((p) => p.melds || [])) {
          if (layoffOption(card, m)) { action(c, { a: 'layoff', cardId: card.id, meldId: m.id }); return; }
        }
      }
    }
    // Descarte: a Ana prefere descartar a sobra de um jogo ALHEIO enquanto não provou isso.
    const alheias = sobrasDaMesa(v, c.id).filter((x) => x.deOutro);
    if (c.isHost && alheias.length && feitos.descartouDeOutro < 1) {
      const s = alheias[0];
      c.pendente = { tipo: 'descartar', meldId: s.meld.id, cardId: s.card.id, tamanhoAntes: s.meld.cards.length, maoAntes: hand.length, deOutro: true };
      action(c, { a: 'meldDiscard', meldId: s.meld.id, cardId: s.card.id });
      return;
    }
    const worst = [...hand].sort((a, b) => b.rank - a.rank)[0];
    action(c, { a: 'discard', cardId: worst.id });
  }
}

function finish() {
  clearTimeout(deadline);
  console.log(`\nrodadas: ${feitos.rodadas} · sobras para a mão: ${feitos.tomou} (${feitos.tomouDeOutro} de adversário) · descartes de jogo: ${feitos.descartouDeJogo} (${feitos.descartouDeOutro} de adversário) · estados com coringa sobrando: ${feitos.coringaSobrando}`);
  if (feitos.tomou === 0 || feitos.descartouDeOutro === 0) {
    console.error('SOBRA INCONCLUSIVO: a partida não gerou sobra suficiente para provar as duas portas — rode de novo.');
    process.exit(2);
  }
  console.log(falhas ? `SOBRA FALHOU: ${falhas} verificação(ões)` : 'SOBRA OK: as três portas funcionam pelo fio, inclusive em jogo alheio');
  process.exit(falhas ? 1 : 0);
}

const ana = client('Ana'); ana.isHost = true;
ana.ws.on('open', () => send(ana, { t: 'create', name: 'Ana Sobra' }));
ana.onLobby = (lobby) => {
  if (!ana.invited) {
    ana.invited = true;
    for (const nome of ['Bia', 'Caio', 'Dani']) {
      const outro = client(nome);
      outro.ws.on('open', () => send(outro, { t: 'join', code: ana.code, name: `${nome} Sobra` }));
    }
  }
  if (!ana.started && lobby.players.length === 4) { ana.started = true; setTimeout(() => send(ana, { t: 'start' }), 100); }
};
