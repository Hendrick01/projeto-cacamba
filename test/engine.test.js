import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACTS, TOTAL_ROUNDS, buildDecks, cardPoints, cardValues, findContractMelds,
  layoffOption, layoffEnds, removableCards, createGame, startRound, actDraw, actBaixar,
  actLayoff, actDiscard, actMeldDiscard, actClaim, actUnclaim, actNextRound, applyAction,
  botNextAction, botWantsCard, mulberry32, viewFor, allMelds, playerById,
  podeComprarDoDescarte, isJoker, topoDoDescarte, cartasNecessarias,
} from '../shared/engine.js';

// Atalho para criar cartas nos testes: c('A','♠') etc.
const SU = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RK = { A: 1, J: 11, Q: 12, K: 13 };
let nextId = 1000;
function c(rank, suit) {
  return { id: nextId++, rank: RK[rank] ?? Number(rank), suit: SU[suit] };
}
function J() {
  return { id: nextId++, rank: 0, suit: -1, joker: true };
}

test('contratos batem com a contagem de cartas das rodadas (6 a 12)', () => {
  CONTRACTS.forEach((ct, i) => {
    assert.equal(ct.t * 3 + ct.s * 4, 6 + i, `rodada ${i + 1}`);
  });
  assert.equal(TOTAL_ROUNDS, 7);
});

test('pontos: valor de face, A=15, coringa=20', () => {
  assert.equal(cardPoints(c('A', '♠')), 15);
  assert.equal(cardPoints(c('K', '♠')), 13);
  assert.equal(cardPoints(c('Q', '♠')), 12);
  assert.equal(cardPoints(c('J', '♠')), 11);
  assert.equal(cardPoints(c('10', '♥')), 10);
  assert.equal(cardPoints(c('9', '♦')), 9);
  assert.equal(cardPoints(c('2', '♣')), 2);
  assert.equal(cardPoints({ id: 1, rank: 0, suit: -1, joker: true }), 20);
  // O exemplo do jogador: 5 + valete + coringa = 36
  assert.equal(
    [c('5', '♠'), c('J', '♥'), { id: 2, rank: 0, suit: -1, joker: true }]
      .reduce((s, card) => s + cardPoints(card), 0),
    36,
  );
});

test('rodada 1: duas trincas válidas são encontradas', () => {
  const hand = [c('7', '♠'), c('7', '♥'), c('7', '♦'), c('Q', '♠'), c('Q', '♥'), c('Q', '♣')];
  const res = findContractMelds(hand, 2, 0);
  assert.ok(res);
  assert.equal(res.trincas.length, 2);
});

test('trinca exige naipes diferentes', () => {
  const hand = [c('7', '♠'), c('7', '♠'), c('7', '♥'), c('Q', '♠'), c('Q', '♥'), c('Q', '♣')];
  assert.equal(findContractMelds(hand, 2, 0), null);
});

test('sequência: exatamente 4 do mesmo naipe, em ordem', () => {
  assert.ok(findContractMelds([c('3', '♥'), c('4', '♥'), c('5', '♥'), c('6', '♥')], 0, 1));
  // naipe misturado não vale
  assert.equal(findContractMelds([c('3', '♥'), c('4', '♠'), c('5', '♥'), c('6', '♥')], 0, 1), null);
});

test('ás vale baixo (A-2-3-4) e alto (J-Q-K-A), mas não vira a esquina', () => {
  assert.ok(findContractMelds([c('A', '♣'), c('2', '♣'), c('3', '♣'), c('4', '♣')], 0, 1));
  assert.ok(findContractMelds([c('J', '♦'), c('Q', '♦'), c('K', '♦'), c('A', '♦')], 0, 1));
  assert.equal(findContractMelds([c('Q', '♦'), c('K', '♦'), c('A', '♦'), c('2', '♦')], 0, 1), null);
});

test('retrocesso: trinca não pode roubar o ás da sequência', () => {
  // 4 ases: a trinca deve escolher os 3 que deixam o A♣ livre para a sequência
  const hand = [c('A', '♠'), c('A', '♥'), c('A', '♦'), c('A', '♣'), c('2', '♣'), c('3', '♣'), c('4', '♣')];
  const res = findContractMelds(hand, 1, 1);
  assert.ok(res);
  const seqSuits = new Set(res.seqs[0].cards.map((x) => x.suit));
  assert.deepEqual([...seqSuits], [SU['♣']]);
});

test('impossível: único ás do naipe disputado por trinca e sequência', () => {
  const hand = [c('A', '♥'), c('A', '♦'), c('A', '♣'), c('2', '♣'), c('3', '♣'), c('4', '♣'), c('9', '♠')];
  // trinca só pode ser ♥♦♣ (usa o A♣), aí a sequência de ♣ morre
  assert.equal(findContractMelds(hand, 1, 1), null);
});

test('duas trincas do mesmo valor com 2 baralhos', () => {
  const hand = [c('5', '♠'), c('5', '♥'), c('5', '♦'), c('5', '♠'), c('5', '♥'), c('5', '♣')];
  const res = findContractMelds(hand, 2, 0);
  assert.ok(res);
});

test('encaixe em sequência: só nas pontas, sem passar do ás', () => {
  const meld = { id: 1, type: 's', suit: SU['♥'], values: [3, 4, 5, 6], cards: [c('3', '♥'), c('4', '♥'), c('5', '♥'), c('6', '♥')], ownerId: 'x' };
  assert.ok(layoffOption(c('2', '♥'), meld));
  assert.ok(layoffOption(c('7', '♥'), meld));
  assert.equal(layoffOption(c('8', '♥'), meld), null);
  assert.equal(layoffOption(c('7', '♠'), meld), null);
  const topMeld = { id: 2, type: 's', suit: SU['♦'], values: [11, 12, 13, 14], cards: [c('J', '♦'), c('Q', '♦'), c('K', '♦'), c('A', '♦')], ownerId: 'x' };
  assert.equal(layoffOption(c('2', '♦'), topMeld), null, 'não pode continuar acima do ás');
  assert.ok(layoffOption(c('10', '♦'), topMeld));
});

test('encaixe em trinca: mesmo valor, naipe novo até completar os 4', () => {
  const meld = { id: 3, type: 't', rank: 9, cards: [c('9', '♠'), c('9', '♥'), c('9', '♦')], ownerId: 'x' };
  assert.ok(layoffOption(c('9', '♣'), meld));
  assert.equal(layoffOption(c('9', '♠'), meld), null, 'naipe repetido antes dos 4');
  meld.cards.push(c('9', '♣'));
  assert.ok(layoffOption(c('9', '♠'), meld), 'com os 4 naipes, libera repetição');
});

test('descarte de jogo: sequência >4 só pelas pontas; trinca >3 mantendo validade', () => {
  const seq = { id: 4, type: 's', suit: 0, values: [3, 4, 5, 6], cards: [c('3', '♠'), c('4', '♠'), c('5', '♠'), c('6', '♠')], ownerId: 'x' };
  assert.equal(removableCards(seq).length, 0);
  seq.cards.push(c('7', '♠')); seq.values.push(7);
  const rem = removableCards(seq);
  assert.equal(rem.length, 2);
  assert.deepEqual([rem[0].rank, rem[1].rank], [3, 7]);

  const tri = { id: 5, type: 't', rank: 4, cards: [c('4', '♠'), c('4', '♥'), c('4', '♦')], ownerId: 'x' };
  assert.equal(removableCards(tri).length, 0);
  tri.cards.push(c('4', '♣'));
  assert.equal(removableCards(tri).length, 4);
});

// ---------------------------------------------------------------------------
// Partida controlada: compra fora da vez com preferência de quem está na vez
// ---------------------------------------------------------------------------

function freshGame(seed = 42) {
  const players = [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Bia' },
    { id: 'p3', name: 'Caio' },
    { id: 'p4', name: 'Duda' },
  ];
  const state = createGame(players, { rnd: mulberry32(seed) });
  startRound(state);
  return state;
}

test('fluxo: puxar é obrigatório antes de descartar; descarte encerra a vez', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  assert.throws(() => actDiscard(state, p.id, p.hand[0].id), /Puxe uma carta/);
  actDraw(state, p.id, 'deck');
  assert.equal(state.phase, 'play');
  actDiscard(state, p.id, p.hand[0].id);
  assert.equal(state.phase, 'draw');
  assert.notEqual(state.players[state.turn].id, p.id);
});

test('compra fora da vez: quem está na vez tem preferência', () => {
  const state = freshGame();
  const a = state.players[state.turn];
  actDraw(state, a.id, 'deck');
  const discarded = a.hand[0];
  actDiscard(state, a.id, discarded.id);

  const onTurn = state.players[state.turn];
  const other = state.players.find((p) => p.id !== onTurn.id && p.id !== a.id);
  actClaim(state, other.id);
  // Quem está na vez decide pegar a carta: o pedido do outro é anulado
  const events = actDraw(state, onTurn.id, 'discard');
  assert.ok(events.some((ev) => ev.e === 'claimVoid'));
  assert.ok(onTurn.hand.some((card) => card.id === discarded.id));
  assert.equal(other.hand.some((card) => card.id === discarded.id), false);
});

test('compra fora da vez: leva a carta + castigo quando a vez libera', () => {
  const state = freshGame();
  const a = state.players[state.turn];
  actDraw(state, a.id, 'deck');
  const discarded = a.hand[0];
  actDiscard(state, a.id, discarded.id);

  const onTurn = state.players[state.turn];
  const other = state.players.find((p) => p.id !== onTurn.id && p.id !== a.id);
  const handBefore = other.hand.length;
  actClaim(state, other.id);
  const events = actDraw(state, onTurn.id, 'deck'); // na vez, prefere o monte → libera a compra
  const buy = events.find((ev) => ev.e === 'buy');
  assert.ok(buy);
  assert.equal(buy.p, other.id);
  assert.ok(other.hand.some((card) => card.id === discarded.id));
  assert.equal(other.hand.length, handBefore + 2, 'carta comprada + 1 de castigo');
});

test('prioridade entre compradores segue a ordem dos assentos após a vez', () => {
  const state = freshGame();
  const a = state.players[state.turn];
  actDraw(state, a.id, 'deck');
  actDiscard(state, a.id, a.hand[0].id);

  const n = state.players.length;
  const turnIdx = state.turn;
  const near = state.players[(turnIdx + 1) % n];   // logo depois de quem está na vez
  const far = state.players[(turnIdx + 2) % n];
  actClaim(state, far.id);
  actClaim(state, near.id); // pediu depois, mas está mais perto na ordem
  const events = actDraw(state, state.players[turnIdx].id, 'deck');
  const buy = events.find((ev) => ev.e === 'buy');
  assert.equal(buy.p, near.id);
});

test('pedidos de compra inválidos são ignorados em silêncio (corridas de toque)', () => {
  const state = freshGame();
  const onTurn = state.players[state.turn];
  const other = state.players.find((p) => p.id !== onTurn.id);
  // Carta virada no início não é comprável; quem está na vez não "compra"
  assert.deepEqual(actClaim(state, other.id), []);
  assert.deepEqual(actClaim(state, onTurn.id), []);
  assert.equal(state.claims.length, 0);
  // Com carta fresca, quem está na vez continua sem poder pedir
  actDraw(state, onTurn.id, 'deck');
  actDiscard(state, onTurn.id, onTurn.hand[0].id);
  const nowTurn = state.players[state.turn];
  assert.equal(state.discardFresh, true);
  assert.deepEqual(actClaim(state, nowTurn.id), []);
  assert.equal(state.claims.length, 0);
});

test('sem nenhum jogo completo não baixa nada; visão não vaza mão alheia', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  // Força uma mão sem contrato: valores todos espalhados
  p.hand = [c('2', '♠'), c('4', '♥'), c('6', '♦'), c('8', '♣'), c('10', '♠'), c('Q', '♥'), c('K', '♦')];
  assert.throws(() => actBaixar(state, p.id), /nenhum jogo completo/);

  const view = viewFor(state, p.id);
  assert.ok(view.you.hand.length > 0);
  for (const pl of view.players) assert.equal(pl.hand, undefined);
});

test('baixa um jogo de cada vez: trinca sozinha desce, contrato completa depois', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [c('7', '♠'), c('7', '♥'), c('7', '♦'), c('2', '♠'), c('4', '♥'), c('6', '♦'), c('8', '♣')];
  const ev1 = actBaixar(state, p.id);
  assert.equal(ev1[0].e, 'baixou');
  assert.equal(ev1[0].completa, false, 'só metade do contrato');
  assert.deepEqual(p.baixados, { t: 1, s: 0 });
  assert.equal(p.baixou, false);
  assert.equal(p.melds.length, 1);
  // Sem o contrato inteiro, ainda não pode encaixar
  assert.throws(() => actLayoff(state, p.id, p.hand[0].id, p.melds[0].id), /baixar o jogo antes/);
  // Segunda trinca chega: baixa e completa
  p.hand.push(c('Q', '♠'), c('Q', '♥'), c('Q', '♣'));
  const ev2 = actBaixar(state, p.id);
  assert.equal(ev2[0].completa, true);
  assert.equal(p.baixou, true);
  assert.deepEqual(p.baixados, { t: 2, s: 0 });
});

test('só desce o que o contrato ainda pede: sequência não vale na rodada de trincas', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [c('3', '♥'), c('4', '♥'), c('5', '♥'), c('6', '♥'), c('9', '♠'), c('J', '♦'), c('2', '♣')];
  assert.throws(() => actBaixar(state, p.id), /nenhum jogo completo/);
  // Nem selecionando a sequência na marra
  const ids = p.hand.slice(0, 4).map((x) => x.id);
  assert.throws(() => actBaixar(state, p.id, ids), /não formam jogos que o contrato ainda pede/);
});

test('não pode baixar até ficar de mão vazia sem completar o contrato', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [c('7', '♠'), c('7', '♥'), c('7', '♦')]; // só a trinca, nada mais
  assert.throws(() => actBaixar(state, p.id), /sem nenhuma carta sem completar/);
  // Com uma carta sobrando, a mesma trinca desce numa boa
  p.hand.push(c('2', '♣'));
  const ev = actBaixar(state, p.id);
  assert.equal(ev[0].completa, false);
  assert.equal(p.hand.length, 1);
});

test('seleção parcial: baixa exatamente a trinca escolhida', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  const trinca = [c('9', '♠'), c('9', '♥'), c('9', '♣')];
  p.hand = [...trinca, c('Q', '♠'), c('Q', '♥'), c('Q', '♣'), c('2', '♦')];
  actBaixar(state, p.id, trinca.map((x) => x.id));
  assert.deepEqual(p.baixados, { t: 1, s: 0 });
  assert.equal(p.melds[0].rank, 9, 'desceu a trinca selecionada, não a outra');
  assert.equal(p.hand.length, 4);
});

test('baixar contrato e bater: rodada termina e pontua os demais', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  // Mão artificial: 2 trincas + 1 carta para descartar
  p.hand = [c('7', '♠'), c('7', '♥'), c('7', '♦'), c('Q', '♠'), c('Q', '♥'), c('Q', '♣'), c('2', '♦')];
  actBaixar(state, p.id);
  assert.equal(p.baixou, true);
  assert.equal(p.hand.length, 1);
  actDiscard(state, p.id, p.hand[0].id);
  assert.equal(state.phase, 'roundEnd');
  assert.equal(state.lastRound.winnerId, p.id);
  assert.equal(state.lastRound.scores[p.id], 0);
  const others = state.players.filter((x) => x.id !== p.id);
  assert.ok(others.every((x) => state.lastRound.scores[x.id] > 0));
});

test('descartar de um jogo com sobra em vez da mão', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [c('7', '♠'), c('7', '♥'), c('7', '♦'), c('Q', '♠'), c('Q', '♥'), c('Q', '♣'), c('7', '♣'), c('9', '♦')];
  actBaixar(state, p.id, p.hand.slice(0, 6).map((x) => x.id));
  const meld = p.melds.find((m) => m.rank === 7);
  actLayoff(state, p.id, p.hand.find((x) => x.rank === 7).id, meld.id); // trinca vira 4 cartas
  assert.equal(meld.cards.length, 4);
  const removable = removableCards(meld);
  const events = actMeldDiscard(state, p.id, meld.id, removable[0].id);
  assert.ok(events.some((ev) => ev.e === 'meldDiscard'));
  assert.equal(meld.cards.length, 3);
  assert.equal(p.hand.length, 1, 'a mão ficou intacta');
  assert.equal(state.phase, 'draw', 'vez passou adiante');
});

test('não pode encaixar sem ter baixado', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  assert.throws(() => actLayoff(state, p.id, p.hand[0].id, 999), /baixar o jogo antes/);
});

// ---------------------------------------------------------------------------
// Simulação de partidas completas com bots (semente fixa)
// ---------------------------------------------------------------------------

function totalCards(state) {
  return (
    state.deck.length +
    state.discard.length +
    state.players.reduce((s, p) => s + p.hand.length, 0) +
    allMelds(state).reduce((s, m) => s + m.cards.length, 0)
  );
}

// Cartas em jogo na rodada atual: rodada só de trincas fica sem os coringas
function expectedCards(state) {
  const ct = CONTRACTS[state.round];
  return state.opts.decks * (52 + (ct.s > 0 ? state.opts.jokersPerDeck : 0));
}

function simulateGame(seed, numPlayers = 4) {
  const players = Array.from({ length: numPlayers }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
  const state = createGame(players, { rnd: mulberry32(seed) });
  startRound(state);
  let rounds = 0;

  while (state.phase !== 'gameEnd') {
    const expected = expectedCards(state);
    let guard = 0;
    while (state.phase === 'draw' || state.phase === 'play') {
      assert.ok(guard++ < 5000, `rodada ${state.round + 1} não terminou (semente ${seed})`);
      // Compras fora da vez: outros bots pedem a carta fresca se ela serve
      if (state.phase === 'draw' && state.discardFresh && state.discard.length) {
        const top = state.discard[state.discard.length - 1];
        for (const p of state.players) {
          if (p.id === state.players[state.turn].id) continue;
          if (podeComprarDoDescarte(state) && botWantsCard(state, p, top)) actClaim(state, p.id);
        }
      }
      const current = state.players[state.turn];
      const action = botNextAction(state, current.id);
      assert.ok(action, 'bot sem ação');
      applyAction(state, current.id, action);
      assert.equal(totalCards(state), expected, `cartas sumiram/sobraram (semente ${seed})`);
    }
    assert.equal(state.phase, 'roundEnd');
    rounds++;
    actNextRound(state);
  }
  assert.equal(rounds, TOTAL_ROUNDS);
  const ranking = viewFor(state, 'b0').ranking;
  assert.equal(ranking.length, numPlayers);
  for (let i = 1; i < ranking.length; i++) assert.ok(ranking[i - 1].score <= ranking[i].score);
  return state;
}

test('cada rodada recomeça com o baralho inteiro de volta, coringas inclusive', () => {
  const players = [0, 1, 2, 3].map((i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
  const state = createGame(players, { rnd: mulberry32(7) });

  for (let rodada = 0; rodada < TOTAL_ROUNDS; rodada++) {
    startRound(state);
    assert.equal(state.round, rodada);
    const esperado = expectedCards(state);
    // Rodada só de trincas joga sem coringa (ele só vale em sequência)
    const coringasEsperados = CONTRACTS[rodada].s > 0 ? state.opts.decks * state.opts.jokersPerDeck : 0;
    // Nada some entre rodadas: mãos, jogos baixados, descarte e monte somados
    // têm que dar o baralho inteiro no começo de cada uma das 7 rodadas.
    assert.equal(totalCards(state), esperado, `rodada ${rodada + 1}`);
    const todas = [
      ...state.deck, ...state.discard,
      ...state.players.flatMap((p) => p.hand),
      ...allMelds(state).flatMap((m) => m.cards),
    ];
    assert.equal(todas.filter(isJoker).length, coringasEsperados, `coringas na rodada ${rodada + 1}`);
    assert.equal(new Set(todas.map((c) => c.id)).size, esperado, `ids repetidos na rodada ${rodada + 1}`);
    // Suja o estado de propósito antes da próxima: cartas espalhadas em mãos,
    // jogos baixados e descarte precisam voltar todas ao baralho.
    const p0 = state.players[0];
    p0.melds.push({ id: 9000 + rodada, type: 't', rank: 5, ownerId: p0.id, cards: p0.hand.splice(0, 3) });
    state.discard.push(...state.players[1].hand.splice(0, 2));
  }
});

test('coringa pode cobrir valor que também existe como carta real (janelas sobrepostas)', () => {
  // 3♥ 4♥ 5♥ 5♥ 6♥ 6♥ + 2 coringas = contrato da rodada 3 (2 sequências):
  // [3♥ 🃏 5♥ 6♥] + [🃏 4♥ 5♥ 6♥]. A busca gulosa antiga só usava coringa em
  // buraco sem carta real e recusava esta mão legal.
  const hand = [c('3', '♥'), c('4', '♥'), c('5', '♥'), c('5', '♥'), c('6', '♥'), c('6', '♥'), J(), J()];
  const res = findContractMelds(hand, 0, 2);
  assert.ok(res, 'contrato legal recusado');
  assert.equal(res.seqs.length, 2);
  for (const { cards } of res.seqs) {
    assert.ok(cards.filter(isJoker).length <= 1, 'no máximo 1 coringa por sequência');
    assert.equal(cards.length, 4);
  }
});

test('encaixe do coringa: dá para escolher a ponta, e o padrão continua a alta', () => {
  const meld = { id: 60, type: 's', suit: SU['♥'], values: [5, 6, 7, 8], cards: [c('5', '♥'), c('6', '♥'), c('7', '♥'), c('8', '♥')], ownerId: 'x' };
  const joker = J();
  assert.equal(layoffOption(joker, meld).end, 'hi', 'sem preferência, ponta alta');
  const lo = layoffOption(joker, meld, 0, 'lo');
  assert.ok(lo && lo.end === 'lo' && lo.v === 4);
  assert.deepEqual(layoffEnds(joker, meld), ['lo', 'hi']);
  // Carta real continua com uma ponta só
  assert.deepEqual(layoffEnds(c('9', '♥'), meld), ['hi']);
  assert.deepEqual(layoffEnds(c('2', '♥'), meld), []);
});

test('bater com o coringa na ponta baixa (mesa 5♥6♥7♥8♥, mão [🃏, 3♥])', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  const seq = { id: 777, type: 's', suit: SU['♥'], values: [5, 6, 7, 8], cards: [c('5', '♥'), c('6', '♥'), c('7', '♥'), c('8', '♥')], ownerId: p.id };
  p.baixou = true;
  p.melds.push(seq);
  const joker = J();
  const tres = c('3', '♥');
  p.hand = [joker, tres];
  actLayoff(state, p.id, joker.id, seq.id, 'lo'); // coringa vira 4♥
  assert.deepEqual(seq.values, [4, 5, 6, 7, 8]);
  actLayoff(state, p.id, tres.id, seq.id);        // e o 3♥ entra em seguida
  assert.equal(state.phase, 'roundEnd');
  assert.equal(state.lastRound.winnerId, p.id, 'bateu esvaziando a mão');
});

test('unclaim só gera evento (e rebroadcast) quando havia pedido de verdade', () => {
  const state = freshGame();
  const a = state.players[state.turn];
  actDraw(state, a.id, 'deck');
  actDiscard(state, a.id, a.hand[0].id);
  const other = state.players.find((p) => p.id !== state.players[state.turn].id && p.id !== a.id);
  assert.deepEqual(actUnclaim(state, other.id), [], 'sem pedido, sem evento');
  actClaim(state, other.id);
  const events = actUnclaim(state, other.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].e, 'unclaim');
  assert.equal(state.claims.length, 0);
});

test('rodadas só de trincas (1ª e 4ª) jogam sem coringa no baralho', () => {
  const players = [0, 1].map((i) => ({ id: `b${i}`, name: `Bot ${i}`, isBot: true }));
  const state = createGame(players, { rnd: mulberry32(11) });
  startRound(state); // rodada 1: 2 trincas
  const todas1 = [...state.deck, ...state.discard, ...state.players.flatMap((p) => p.hand)];
  assert.equal(todas1.filter(isJoker).length, 0, 'rodada 1 sem coringa');
  assert.equal(todas1.length, state.opts.decks * 52);
});

test('30 partidas completas: terminam, conservam as cartas e pontuam', () => {
  for (let seed = 1; seed <= 30; seed++) {
    simulateGame(seed, 2 + (seed % 3)); // 2, 3 e 4 jogadores
  }
});

test('baralho insuficiente é recusado com erro de regra, sem sujar o estado', () => {
  // 8 jogadores em 1 baralho: a rodada 1 ainda cabe, as de mão grande não.
  const mesa = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const state = createGame(mesa, { rnd: mulberry32(1), decks: 1 });
  assert.equal(cartasNecessarias(8, 0), 49);
  startRound(state);
  assert.equal(state.round, 0, 'a rodada 1 cabe em 52 cartas');

  let recusou = null;
  for (let i = 0; i < TOTAL_ROUNDS && !recusou; i++) {
    const roundAntes = state.round;
    try {
      state.phase = 'roundEnd';
      state.lastRound = { winnerId: null, scores: {}, reason: 'esgotado' };
      actNextRound(state);
    } catch (err) {
      recusou = err;
      assert.equal(err.gameRule, true, 'erro de regra, não TypeError');
      assert.match(err.message, /Baralho insuficiente/);
      assert.equal(state.round, roundAntes, 'a rodada não pode ficar pela metade');
    }
  }
  assert.ok(recusou, 'a distribuição impossível tem que ser recusada');
  for (const p of state.players) {
    assert.equal(p.hand.filter((c) => !c).length, 0, 'nenhuma carta indefinida na mão');
  }
});
