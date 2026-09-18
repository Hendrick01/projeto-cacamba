import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACTS, TOTAL_ROUNDS, buildDecks, cardPoints, cardValues, findContractMelds,
  layoffOption, layoffEnds, removableCards, createGame, startRound, actDraw, actBaixar,
  actLayoff, actDiscard, actMeldDiscard, actTomarSobra, actClaim, actUnclaim, actNextRound, applyAction,
  botNextAction, botWantsCard, mulberry32, viewFor, allMelds, playerById,
  podeComprarDoDescarte, isJoker, topoDoDescarte, sobrasNaMesa, sobraFechaJogo,
  coringaLiberadoPeloEncaixe, actTrocarPorCoringa, actQueimar, trocasNaTrinca, actTrocarNaTrinca,
  decksParaJogadores, conferirBaralho, cartasNecessarias, DEFAULT_OPTS,
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

test('o coringa da ponta muda de ponta para a carta real encaixar', () => {
  // C‑8‑9‑10 de copas: o coringa nasceu como 7. Quem tem o Q não cabe em
  // ponta nenhuma — mas cabe se o coringa virar J (áudio do usuário, 10/09/2026).
  const coringa = { id: 'j1', joker: true, rank: 0, suit: -1 };
  const meld = () => ({ id: 9, type: 's', suit: SU['♥'], values: [7, 8, 9, 10], cards: [coringa, c('8', '♥'), c('9', '♥'), c('10', '♥')], ownerId: 'x' });
  const opt = layoffOption(c('Q', '♥'), meld());
  assert.deepEqual(opt, { kind: 's', end: 'hi', v: 12, desloca: 'lo' });
  assert.deepEqual(layoffEnds(c('Q', '♥'), meld()), ['hi']);
  // o 6 continua entrando direto pela ponta baixa, sem mexer no coringa
  assert.deepEqual(layoffOption(c('6', '♥'), meld()), { kind: 's', end: 'lo', v: 6 });
  // o K não: exigiria dois valores de folga
  assert.equal(layoffOption(c('K', '♥'), meld()), null);
  // e o coringa que muda de ponta não é coringa "sobrando" para ninguém pegar
  assert.equal(coringaLiberadoPeloEncaixe(meld(), opt, 'y'), null);
  // o espelho: 8‑9‑10‑C (coringa como J) recebe o 6 com o coringa virando 7
  const alto = { id: 10, type: 's', suit: SU['♥'], values: [8, 9, 10, 11], cards: [c('8', '♥'), c('9', '♥'), c('10', '♥'), coringa], ownerId: 'x' };
  assert.deepEqual(layoffOption(c('6', '♥'), alto), { kind: 's', end: 'lo', v: 6, desloca: 'hi' });
  // coringa no meio não se move: 8‑C‑10‑J não aceita o 6 nem o K
  const meio = { id: 11, type: 's', suit: SU['♥'], values: [8, 9, 10, 11], cards: [c('8', '♥'), coringa, c('10', '♥'), c('J', '♥')], ownerId: 'x' };
  assert.equal(layoffOption(c('6', '♥'), meio), null);
  assert.equal(layoffOption(c('K', '♥'), meio), null);
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

test('encaixe em trinca: mesmo valor e só naipe que já está no jogo', () => {
  const meld = { id: 3, type: 't', rank: 9, cards: [c('9', '♠'), c('9', '♥'), c('9', '♦')], ownerId: 'x' };
  assert.equal(layoffOption(c('9', '♣'), meld), null, 'naipe de fora não entra');
  assert.ok(layoffOption(c('9', '♠'), meld), 'naipe repetido dá continuidade');
  assert.ok(layoffOption(c('9', '♥'), meld) && layoffOption(c('9', '♦'), meld), 'os três naipes do jogo valem');
  assert.equal(layoffOption(c('8', '♠'), meld), null, 'valor diferente, não');
  assert.equal(layoffOption(J(), meld), null, 'coringa não entra em trinca');
  // sem limite de adições: a quarta e a quinta carta continuam entrando
  meld.cards.push(c('9', '♠'), c('9', '♥'));
  assert.ok(layoffOption(c('9', '♦'), meld), 'não há teto de cartas na trinca');
  // Quem exige naipes diferentes é a FORMAÇÃO da trinca, não o encaixe
  assert.equal(findContractMelds([c('9', '♠'), c('9', '♥'), c('9', '♥')], 1, 0), null);
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

test('compra fora da vez: leva SÓ a carta pedida, sem castigo', () => {
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
  assert.equal(other.hand.length, handBefore + 1, 'só a carta comprada');
  assert.equal(buy.penalty, undefined, 'o evento não fala mais de castigo');
});

test('prioridade entre compradores: quem pediu primeiro leva, não o assento', () => {
  const state = freshGame();
  const a = state.players[state.turn];
  actDraw(state, a.id, 'deck');
  const discarded = a.hand[0];
  actDiscard(state, a.id, discarded.id);

  const n = state.players.length;
  const turnIdx = state.turn;
  const perto = state.players[(turnIdx + 1) % n]; // assento logo após a vez
  const longe = state.players[(turnIdx + 2) % n];
  actClaim(state, longe.id);  // apertou primeiro, mesmo estando mais longe
  actClaim(state, perto.id);
  const events = actDraw(state, state.players[turnIdx].id, 'deck');
  const buy = events.find((ev) => ev.e === 'buy');
  assert.equal(buy.p, longe.id, 'quem apertou primeiro leva');
  assert.ok(longe.hand.some((card) => card.id === discarded.id));
  assert.deepEqual(buy.losers, [perto.id]);
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
  // Segunda trinca chega: baixa e completa
  p.hand.push(c('Q', '♠'), c('Q', '♥'), c('Q', '♣'));
  const ev2 = actBaixar(state, p.id);
  assert.equal(ev2[0].completa, true);
  assert.equal(p.baixou, true);
  assert.deepEqual(p.baixados, { t: 2, s: 0 });
});

test('com o contrato na mesa, ainda dá para baixar jogo extra', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [
    c('7', '♠'), c('7', '♥'), c('7', '♦'),
    c('Q', '♠'), c('Q', '♥'), c('Q', '♣'),
    c('9', '♠'), c('9', '♥'), c('9', '♦'),
    c('2', '♣'),
  ];
  actBaixar(state, p.id, [p.hand[0].id, p.hand[1].id, p.hand[2].id]);
  actBaixar(state, p.id, [p.hand[0].id, p.hand[1].id, p.hand[2].id]);
  assert.equal(p.baixou, true, 'contrato inteiro na mesa');
  assert.deepEqual(p.baixados, { t: 2, s: 0 });

  // Agora a trinca de 9: é jogo EXTRA, não faz parte do contrato
  const noves = p.hand.filter((x) => x.rank === 9).map((x) => x.id);
  const ev = actBaixar(state, p.id, noves);
  assert.equal(ev[0].e, 'baixou');
  assert.equal(ev[0].extra, true);
  assert.equal(p.melds.length, 3);
  assert.deepEqual(p.baixados, { t: 2, s: 0 }, 'extra não infla o progresso do contrato');
  assert.equal(p.hand.length, 1, 'sobrou só a carta de descarte');
});

test('jogo extra que esvazia a mão bate a rodada', () => {
  const state = freshGame();
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [
    c('7', '♠'), c('7', '♥'), c('7', '♦'),
    c('Q', '♠'), c('Q', '♥'), c('Q', '♣'),
    c('9', '♠'), c('9', '♥'), c('9', '♦'),
  ];
  actBaixar(state, p.id, p.hand.slice(0, 3).map((x) => x.id));
  actBaixar(state, p.id, p.hand.slice(0, 3).map((x) => x.id));
  const ev = actBaixar(state, p.id, p.hand.map((x) => x.id));
  assert.equal(p.hand.length, 0);
  assert.ok(ev.some((e) => e.e === 'roundEnd' && e.reason === 'bateu' && e.winnerId === p.id));
});

test('carta sobrando de jogo alheio completa jogo que desce na hora', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');

  // B tem na mesa uma trinca de 5 com QUATRO cartas: uma está sobrando
  b.melds = [{
    id: 9001, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦'), c('5', '♣')],
  }];
  const sobrando = sobrasNaMesa(state);
  assert.ok(sobrando.length > 0, 'a quarta carta da trinca está sobrando');

  // O naipe importa: trinca exige naipes diferentes, então a carta que vem da
  // mesa tem de ser a de naipe que falta na mão.
  const alvo = sobrando.find((x) => x.card.suit === SU['♦']);
  a.hand = [c('5', '♠'), c('5', '♥'), c('K', '♦'), c('K', '♣'), c('K', '♥'), c('2', '♣')];
  const cincos = a.hand.filter((x) => x.rank === 5).map((x) => x.id);

  const ev = actBaixar(state, a.id, cincos, { meldId: alvo.meldId, cardId: alvo.card.id });
  assert.equal(ev[0].e, 'baixou');
  assert.equal(ev[0].daMesa.rank, 5);
  assert.equal(a.melds.length, 1, 'a trinca desceu com a carta da mesa');
  assert.equal(a.melds[0].cards.length, 3);
  assert.equal(b.melds[0].cards.length, 3, 'o jogo do B continua válido, com 3');
  assert.equal(a.hand.some((x) => x.rank === 5), false, 'a carta da mesa não passou pela mão');
});

test('sobraFechaJogo acende só onde o juiz deixaria baixar', () => {
  const mao = [c('5', '♠'), c('5', '♥')];
  const contrato = { t: 1, s: 0 };
  // Naipe que falta: fecha
  assert.equal(sobraFechaJogo(mao, c('5', '♦'), contrato, { permitirMaoVazia: true }), true);
  // Naipe repetido: trinca exige naipes diferentes
  assert.equal(sobraFechaJogo(mao, c('5', '♠'), contrato, { permitirMaoVazia: true }), false);
  // Carta que não tem nada a ver
  assert.equal(sobraFechaJogo(mao, c('9', '♣'), contrato, { permitirMaoVazia: true }), false);
  // Sem nada escolhido na mão, não acende
  assert.equal(sobraFechaJogo([], c('5', '♦'), contrato, { permitirMaoVazia: true }), false);
  // Sequência: 3♥ 4♥ 5♥ na mão + 6♥ da mesa fecha as quatro
  const seq = [c('3', '♥'), c('4', '♥'), c('5', '♥')];
  assert.equal(sobraFechaJogo(seq, c('6', '♥'), { t: 0, s: 1 }, { permitirMaoVazia: true }), true);
  assert.equal(sobraFechaJogo(seq, c('6', '♠'), { t: 0, s: 1 }, { permitirMaoVazia: true }), false);
  // E com o contrato já cumprido, o que desce é jogo extra
  assert.equal(sobraFechaJogo(mao, c('5', '♦'), { t: 0, s: 0 }, { permitirMaoVazia: true }), true);
});

test('carta da mesa só sai se fechar jogo — senão nada muda', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  b.melds = [{
    id: 9002, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦'), c('5', '♣')],
  }];
  const alvo = sobrasNaMesa(state)[0];
  a.hand = [c('9', '♠'), c('2', '♥'), c('4', '♦')]; // não fecha nada com um 5

  assert.throws(
    () => actBaixar(state, a.id, [a.hand[0].id], { meldId: alvo.meldId, cardId: alvo.card.id }),
    /só sai de lá se for para baixar na hora/,
  );
  assert.equal(b.melds[0].cards.length, 4, 'o jogo do B ficou intacto');
  assert.equal(a.melds.length, 0);
  assert.equal(a.hand.length, 3, 'a mão do A ficou intacta');
});

test('carta que NÃO está sobrando não sai do jogo alheio', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  // Trinca de exatamente 3: nada sobra nela
  b.melds = [{
    id: 9003, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦')],
  }];
  assert.deepEqual(sobrasNaMesa(state), []);
  a.hand = [c('5', '♣'), c('5', '♠'), c('2', '♥')];
  assert.throws(
    () => actBaixar(state, a.id, [a.hand[0].id, a.hand[1].id], { meldId: 9003, cardId: b.melds[0].cards[0].id }),
    /não está sobrando/,
  );
  assert.equal(b.melds[0].cards.length, 3);
});

test('o automático desce só o contrato: jogo extra é escolha', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  // Duas trincas (o contrato) e uma sequência (extra) na mesma mão
  p.hand = [
    c('7', '♠'), c('7', '♥'), c('7', '♦'),
    c('Q', '♠'), c('Q', '♥'), c('Q', '♣'),
    c('3', '♥'), c('4', '♥'), c('5', '♥'), c('6', '♥'),
    c('2', '♣'),
  ];
  const ev = actBaixar(state, p.id); // sem seleção: automático
  assert.equal(ev[0].t, 2, 'desceram as duas trincas do contrato');
  assert.equal(ev[0].extra, false, 'a sequência ficou na mão');
  assert.equal(p.melds.length, 2);
  assert.equal(p.hand.length, 5, 'sequência + carta solta continuam na mão');

  // Ela desce quando o jogador escolhe as cartas dela
  const seq = p.hand.filter((x) => x.suit === SU['♥']).map((x) => x.id);
  const ev2 = actBaixar(state, p.id, seq);
  assert.equal(ev2[0].extraS, 1);
  assert.equal(p.melds.length, 3);
});

test('jogo extra desce ANTES do contrato, e não conta nele', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [c('3', '♥'), c('4', '♥'), c('5', '♥'), c('6', '♥'), c('9', '♠'), c('J', '♦'), c('2', '♣')];
  const ids = p.hand.slice(0, 4).map((x) => x.id);
  const ev = actBaixar(state, p.id, ids);
  assert.equal(ev[0].e, 'baixou');
  assert.equal(ev[0].extra, true);
  assert.equal(ev[0].extraS, 1, 'a sequência desceu como jogo extra');
  assert.deepEqual(p.baixados, { t: 0, s: 0 }, 'sequência não conta num contrato de trincas');
  assert.equal(p.baixou, false, 'o contrato continua de pé');
  assert.equal(p.melds.length, 1);
});

test('sem contrato cumprido não bate, nem baixando jogo extra', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  // Uma trinca e uma sequência: dá 7 cartas, a mão inteira. Baixar tudo
  // esvaziaria a mão faltando ainda uma trinca do contrato.
  p.hand = [c('7', '♠'), c('7', '♥'), c('7', '♦'), c('3', '♥'), c('4', '♥'), c('5', '♥'), c('6', '♥')];
  assert.throws(
    () => actBaixar(state, p.id, p.hand.map((x) => x.id)),
    /só dá para bater com o contrato cumprido/,
  );
  assert.equal(p.melds.length, 0, 'nada desceu');
  assert.equal(p.hand.length, 7);

  // Deixando uma carta de fora, desce numa boa (e ainda não bate)
  const semUm = p.hand.slice(0, 3).map((x) => x.id);
  actBaixar(state, p.id, semUm);
  assert.equal(p.melds.length, 1);
  assert.equal(state.phase, 'play', 'a rodada não acabou');
});

test('não esvazia a mão sem ter cumprido o contrato', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [c('7', '♠'), c('7', '♥'), c('7', '♦')]; // só a trinca, nada mais
  assert.throws(() => actBaixar(state, p.id), /só dá para bater com o contrato cumprido/);
  // Nem com UMA carta sobrando: o descarte obrigatório zeraria a mão e isso
  // seria bater sem contrato.
  p.hand.push(c('2', '♣'));
  assert.throws(() => actBaixar(state, p.id), /só dá para bater com o contrato cumprido/);
  // Com duas, desce numa boa: sobra uma para descartar e uma para seguir.
  p.hand.push(c('9', '♣'));
  const ev = actBaixar(state, p.id);
  assert.equal(ev[0].completa, false);
  assert.equal(p.hand.length, 2);
});

test('descartar a última carta sem contrato é recusado', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const p = state.players[state.turn];
  actDraw(state, p.id, 'deck');
  p.hand = [c('2', '♣')];
  assert.throws(() => actDiscard(state, p.id, p.hand[0].id), /só dá para bater depois de cumpri-lo/);
  assert.equal(p.hand.length, 1, 'a carta continua na mão');
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
  // o 7 extra repete um naipe do jogo: naipe de fora não encaixa mais em trinca
  p.hand = [c('7', '♠'), c('7', '♥'), c('7', '♦'), c('Q', '♠'), c('Q', '♥'), c('Q', '♣'), c('7', '♠'), c('9', '♦')];
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

test('robô FÁCIL: joga a partida inteira sem pegar do meio, sem encaixar em jogo alheio e sem trocar coringa', () => {
  for (const seed of [3, 11]) {
    const players = [{ id: 'r1', name: 'A', isBot: true }, { id: 'r2', name: 'B', isBot: true }, { id: 'r3', name: 'C', isBot: true }];
    const state = createGame(players, { rnd: mulberry32(seed), nivelRobos: 'facil' });
    startRound(state);
    let guarda = 0, descartes = 0;
    while (state.phase !== 'gameEnd') {
      while (state.phase === 'draw' || state.phase === 'play') {
        assert.ok(guarda++ < 40000, `a partida fácil não terminou (semente ${seed})`);
        const atual = state.players[state.turn];
        const acao = botNextAction(state, atual.id);
        assert.ok(acao, 'robô sem ação');
        if (acao.a === 'draw') assert.equal(acao.source, 'deck', 'o robô fácil não pega do meio');
        if (acao.a === 'layoff') assert.equal(allMelds(state).find((m) => m.id === acao.meldId).ownerId, atual.id, 'o robô fácil só encaixa nos próprios jogos');
        assert.notEqual(acao.a, 'swapJoker', 'o robô fácil não troca coringa');
        if (acao.a === 'discard') { descartes++; assert.ok(atual.hand.some((c) => c.id === acao.cardId), 'descarta carta que tem'); }
        applyAction(state, atual.id, acao);
      }
      if (state.phase === 'roundEnd') actNextRound(state);
    }
    assert.ok(descartes > 20);
  }
  // e o normal continua pegando do meio quando a carta serve
  const s = freshGame(); const p = s.players[s.turn]; p.isBot = true;
  p.hand = [c('7', '♠'), c('7', '♥'), c('2', '♣'), c('9', '♦'), c('K', '♠'), c('4', '♥')];
  const topo = c('7', '♦'); topo.by = s.players[(s.turn + 1) % s.players.length].id; s.discard.push(topo); s.discardFresh = true;
  assert.deepEqual(botNextAction(s, p.id), { a: 'draw', source: 'discard' });
  s.opts.nivelRobos = 'facil';
  assert.deepEqual(botNextAction(s, p.id), { a: 'draw', source: 'deck' });
});

test('troca na trinca: o 5♦ entra no lugar do 5♠, o 5♠ vai para a sequência do outro e o 2♥ bate', () => {
  // A jogada real de 16/09/2026 que o jogo não deixou fazer.
  const state = freshGame();
  const p = state.players[state.turn];
  const outro = state.players.find((x) => x.id !== p.id);
  actDraw(state, p.id, 'deck');
  const cincoS = c('5', '♠'), cincoD = c('5', '♦'), doisC = c('2', '♥');
  p.hand = [cincoS, c('5', '♥'), c('5', '♣'), c('Q', '♠'), c('Q', '♥'), c('Q', '♣'), cincoD, doisC];
  actBaixar(state, p.id, p.hand.slice(0, 6).map((x) => x.id));   // 1ª rodada: duas trincas
  const trinca = p.melds.find((m) => m.rank === 5);
  const seq = { id: 9001, type: 's', suit: SU['♠'], values: [1, 2, 3, 4], cards: [J(), c('2', '♠'), c('3', '♠'), c('4', '♠')], ownerId: outro.id };
  outro.melds.push(seq);

  // a quarta carta de naipe de fora continua NÃO entrando (regra de 07/09)...
  assert.equal(layoffOption(cincoD, trinca), null);
  // ...mas trocada por qualquer uma das três vale: a trinca segue com três naipes
  assert.deepEqual(trocasNaTrinca(cincoD, trinca).map((x) => x.suit).sort(), [SU['♠'], SU['♥'], SU['♣']].sort());
  // um 5♥ repetido só poderia sair no lugar do próprio 5♥: tirar ♠ ou ♣ deixaria dois naipes
  assert.deepEqual(trocasNaTrinca(c('5', '♥'), trinca).map((x) => x.suit), [SU['♥']]);
  // valor diferente ou coringa não trocam nada
  assert.deepEqual(trocasNaTrinca(c('6', '♦'), trinca), []);
  assert.deepEqual(trocasNaTrinca(J(), trinca), []);
  assert.throws(() => actTrocarNaTrinca(state, p.id, trinca.id, doisC.id, cincoS.id), /mesmo valor/);

  const ev = actTrocarNaTrinca(state, p.id, trinca.id, cincoD.id, cincoS.id);
  assert.equal(ev[0].e, 'trocouNaTrinca');
  assert.equal(ev[0].deQuem, p.id);
  assert.deepEqual(trinca.cards.map((x) => x.suit).sort(), [SU['♥'], SU['♦'], SU['♣']].sort(), 'o 5♦ ficou no lugar do 5♠');
  assert.deepEqual(p.hand.map((x) => x.id).sort(), [doisC.id, cincoS.id].sort(), 'o 5♠ veio para a mão, sem passar a vez');
  assert.equal(state.phase, 'play');

  actLayoff(state, p.id, cincoS.id, seq.id);
  assert.deepEqual(seq.values, [1, 2, 3, 4, 5]);
  actDiscard(state, p.id, doisC.id);
  assert.equal(state.lastRound.winnerId, p.id, 'bateu com o 2♥');
});

test('a carta que você descartou não volta para a sua mão', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  const descartada = a.hand[0];
  actDiscard(state, a.id, descartada.id);

  // Agora é a vez do B: para ele a carta está comprável
  assert.equal(state.players[state.turn].id, b.id);
  assert.equal(podeComprarDoDescarte(state, b.id), true);
  assert.equal(viewFor(state, b.id).discardBuyable, true);

  // Para quem descartou, não — nem pedindo fora da vez
  assert.equal(podeComprarDoDescarte(state, a.id), false);
  const vistaDele = viewFor(state, a.id);
  assert.equal(vistaDele.discardBuyable, false);
  assert.equal(vistaDele.discardLocked, false, 'não é trava de coringa: é carta dele');
  assert.deepEqual(actClaim(state, a.id), [], 'o pedido dele nem é registrado');
  assert.equal(state.claims.length, 0);

  // E se a vez voltasse para ele com a carta dele no topo, também não
  state.turn = state.players.indexOf(a);
  state.phase = 'draw';
  assert.throws(() => actDraw(state, a.id, 'discard'), /foi você que descartou/);

  // A carta virada do monte no começo da rodada não é descarte de ninguém
  const outra = freshGame();
  assert.equal(topoDoDescarte(outra).by, undefined);
  assert.equal(podeComprarDoDescarte(outra, outra.players[0].id), true);
});

test('o coringa só é resgatado de sequência dos outros', () => {
  const state = freshGame();
  const a = state.players[0];
  state.turn = 0;
  actDraw(state, a.id, 'deck');

  const jk = J();
  a.melds = [{
    id: 8300, type: 's', suit: SU['♦'], ownerId: a.id,
    cards: [c('J', '♦'), c('Q', '♦'), c('K', '♦'), jk],
    values: [11, 12, 13, 14],
  }];
  a.hand = [c('10', '♦'), c('2', '♥'), c('4', '♣'), c('8', '♠')];
  const dez = a.hand[0];
  const opt = layoffOption(dez, a.melds[0]);

  assert.equal(coringaLiberadoPeloEncaixe(a.melds[0], opt, a.id), null, 'jogo próprio não libera');
  assert.ok(coringaLiberadoPeloEncaixe(a.melds[0], opt), 'sem dono na pergunta, a forma é válida');
  assert.throws(
    () => actLayoff(state, a.id, dez.id, 8300, null, true),
    /só pode ser resgatado de sequência de outro jogador/,
  );
  assert.equal(a.melds[0].cards.some(isJoker), true, 'o coringa continua no jogo dele');

  // Sem pedir o coringa, o encaixe no próprio jogo continua valendo
  const ev = actLayoff(state, a.id, dez.id, 8300);
  assert.equal(ev[0].e, 'layoff');
  assert.equal(a.melds[0].cards.length, 5);
});

test('esticar a sequência pela outra ponta resgata o coringa da ponta', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');

  // J♦ Q♦ K♦ 🃏(=A♦) — o coringa está na ponta ALTA
  const jk = J();
  b.melds = [{
    id: 8100, type: 's', suit: SU['♦'], ownerId: b.id,
    cards: [c('J', '♦'), c('Q', '♦'), c('K', '♦'), jk],
    values: [11, 12, 13, 14],
  }];
  a.hand = [c('10', '♦'), c('2', '♥'), c('4', '♣'), c('8', '♠')];
  const dez = a.hand[0];

  // O 10♦ entra pela ponta baixa; a alta continua sendo o coringa
  const opt = layoffOption(dez, b.melds[0]);
  assert.equal(opt.end, 'lo');
  assert.equal(coringaLiberadoPeloEncaixe(b.melds[0], opt)?.id, jk.id);

  const ev = actLayoff(state, a.id, dez.id, 8100, null, true);
  assert.ok(ev.some((e) => e.e === 'pegouCoringa'));
  assert.equal(b.melds[0].cards.length, 4, '10 J Q K continua sequência válida');
  assert.equal(b.melds[0].cards.some(isJoker), false, 'o coringa saiu do jogo');
  assert.equal(a.hand.some(isJoker), true, 'e foi para a mão de quem esticou');
  assert.equal(a.hand.length, 4, 'entrou uma, saiu uma');
});

test('não resgata coringa que o encaixe empurraria para o meio', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');

  // 🃏(=10♦) J♦ Q♦ K♦ — o coringa está na ponta BAIXA, e o encaixe vem por lá
  const jk = J();
  b.melds = [{
    id: 8200, type: 's', suit: SU['♦'], ownerId: b.id,
    cards: [jk, c('J', '♦'), c('Q', '♦'), c('K', '♦')],
    values: [10, 11, 12, 13],
  }];
  a.hand = [c('A', '♦'), c('2', '♥'), c('4', '♣'), c('8', '♠')];

  // O Ás entra por cima: a ponta oposta é o coringa... que ficaria de ponta
  // ainda, então ESTE caso resgata. Já o 9♦ entra por baixo, empurrando o
  // coringa para o meio — e aí não dá.
  a.hand.push(c('9', '♦'));
  const nove = a.hand[a.hand.length - 1];
  const optNove = layoffOption(nove, b.melds[0]);
  assert.equal(optNove.end, 'lo');
  assert.equal(coringaLiberadoPeloEncaixe(b.melds[0], optNove), null);
  assert.throws(() => actLayoff(state, a.id, nove.id, 8200, null, true), /não deixa coringa nenhum sobrando/);
  assert.equal(b.melds[0].cards.length, 4, 'nada mudou no jogo');
  assert.equal(a.hand.length, 5, 'nem na mão');
});

test('encaixe vale antes do contrato, mas não pode encurtar a mão até bater', () => {
  const state = freshGame(); // rodada 1: 2 trincas
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  b.melds = [{
    id: 8001, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦')],
  }];

  // Sem ter baixado nada, o encaixe agora vale (naipe que já está na trinca)
  a.hand = [c('5', '♥'), c('2', '♥'), c('9', '♦'), c('J', '♠')];
  assert.equal(a.baixou, false);
  const ev = actLayoff(state, a.id, a.hand[0].id, 8001);
  assert.equal(ev[0].e, 'layoff');
  assert.equal(b.melds[0].cards.length, 4);
  assert.equal(a.hand.length, 3);

  // Mas encurtar até sobrar uma carta, não: seria bater sem contrato
  b.melds.push({
    id: 8002, type: 't', rank: 9, ownerId: b.id,
    cards: [c('9', '♠'), c('9', '♥'), c('9', '♣')],
  });
  a.hand = [c('9', '♥'), c('2', '♥')];
  assert.throws(() => actLayoff(state, a.id, a.hand[0].id, 8002), /Guarde pelo menos duas cartas/);
  assert.equal(a.hand.length, 2);
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

// ---------------------------------------------------------------------------
// Tamanho da mesa: baralhos conforme o número de jogadores, até 8 lugares
// ---------------------------------------------------------------------------

test('baralhos seguem a tabela: até 3 → 1, de 4 a 6 → 2, de 7 a 8 → 3', () => {
  assert.deepEqual([2, 3].map(decksParaJogadores), [1, 1]);
  assert.deepEqual([4, 5, 6].map(decksParaJogadores), [2, 2, 2]);
  assert.deepEqual([7, 8].map(decksParaJogadores), [3, 3]);
});

test('createGame tira os baralhos do tamanho da mesa, e opts explícito manda', () => {
  const mesa = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  assert.equal(createGame(mesa(3)).opts.decks, 1);
  assert.equal(createGame(mesa(6)).opts.decks, 2);
  assert.equal(createGame(mesa(8)).opts.decks, 3);
  // testes e regras da casa continuam podendo forçar
  assert.equal(createGame(mesa(8), { decks: 1 }).opts.decks, 1);
});

test('a mesa vai até 8 jogadores e todas as 7 rodadas cabem no baralho', () => {
  assert.equal(DEFAULT_OPTS.maxPlayers, 8);
  for (let n = DEFAULT_OPTS.minPlayers; n <= DEFAULT_OPTS.maxPlayers; n++) {
    assert.equal(conferirBaralho(n), null, `${n} jogadores`);
  }
});

test('baralho insuficiente é recusado com erro de regra, sem sujar o estado', () => {
  const mesa = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
  const state = createGame(mesa, { rnd: mulberry32(1), decks: 1 }); // 1 baralho para 8: não dá
  // A rodada 1 ainda cabe (6 × 8 + 1 = 49 de 52); o aperto aparece adiante.
  assert.equal(conferirBaralho(8, { decks: 1 }).round > 0, true);
  startRound(state);
  assert.equal(state.round, 0);
  // Avança até a rodada que não cabe e confirma a recusa limpa
  let recusou = null;
  for (let i = 0; i < TOTAL_ROUNDS && !recusou; i++) {
    const antes = { round: state.round, maos: state.players.map((p) => p.hand.length) };
    try {
      state.phase = 'roundEnd';
      state.lastRound = { winnerId: null, scores: {}, reason: 'esgotado' };
      actNextRound(state);
    } catch (err) {
      recusou = err;
      assert.equal(err.gameRule, true, 'tem que ser erro de regra, não TypeError');
      assert.match(err.message, /Baralho insuficiente/);
      assert.equal(state.round, antes.round, 'a rodada não pode ficar pela metade');
    }
  }
  assert.ok(recusou, 'a distribuição impossível tem que ser recusada');
  // Nenhuma carta indefinida chegou a entrar em mão nenhuma
  for (const p of state.players) assert.equal(p.hand.filter((c) => !c).length, 0);
});

test('assentos e prioridade de compra funcionam em mesa de 7 e de 8', () => {
  for (const n of [7, 8]) {
    const mesa = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
    const state = createGame(mesa, { rnd: mulberry32(7) });
    startRound(state);
    assert.equal(state.players.length, n);
    assert.equal(cartasNecessarias(n, 0), 6 * n + 1);
    // A vez dá a volta na mesa inteira, na ordem dos assentos
    const vistos = [];
    for (let i = 0; i < n; i++) {
      const atual = state.players[state.turn];
      vistos.push(atual.id);
      actDraw(state, atual.id, 'deck');
      actDiscard(state, atual.id, atual.hand[0].id);
    }
    assert.equal(new Set(vistos).size, n, `todos jogaram uma vez (${n})`);
    // Prioridade da compra fora da vez: quem apertou primeiro leva, mesmo
    // sendo o assento mais distante da vez
    const daVez = state.players[state.turn];
    const ordem = [];
    for (let k = 1; k < n; k++) ordem.push(state.players[(state.turn + k) % n]);
    // O último da ordem é quem acabou de descartar: a carta é dele e ele não
    // pode pedir de volta.
    const quemDescartou = ordem[ordem.length - 1];
    assert.deepEqual(actClaim(state, quemDescartou.id), [], `quem descartou não pede de volta (${n})`);
    assert.equal(state.claims.includes(quemDescartou.id), false);

    const cedo = ordem[ordem.length - 2];  // pediu primeiro, assento distante
    const tarde = ordem[0];                // assento melhor, pedido depois
    actClaim(state, cedo.id);
    actClaim(state, tarde.id);
    const antes = cedo.hand.length;
    const eventos = actDraw(state, daVez.id, 'deck');
    const buy = eventos.find((ev) => ev.e === 'buy');
    assert.ok(buy, `alguém devia ter comprado (${n})`);
    assert.equal(buy.p, cedo.id, `quem apertou primeiro leva (${n})`);
    assert.equal(cedo.hand.length, antes + 1, `só a carta comprada (${n})`);
  }
});

test('partidas completas em mesa grande: 5 a 8 jogadores', () => {
  for (let n = 5; n <= 8; n++) simulateGame(100 + n, n);
});


// ---------------------------------------------------------------------------
// A sobra da mesa: três portas, jogo de qualquer um, coringa da ponta incluído
// (regras da casa confirmadas pelo usuário em 2026-08-28)
// ---------------------------------------------------------------------------

test('coringa na ponta de sequência com carta a mais sobra como qualquer outra', () => {
  const j = J();
  const seq = { id: 7101, type: 's', suit: 0, ownerId: 'x',
    values: [3, 4, 5, 6], cards: [c('3', '♠'), c('4', '♠'), c('5', '♠'), j] };
  assert.deepEqual(removableCards(seq), [], 'com 4 cartas nada sobra, nem o coringa');
  seq.cards.push(c('7', '♠')); seq.values.push(7);   // 3 4 5 🃏(=6) 7: coringa no MEIO
  assert.ok(!removableCards(seq).some(isJoker), 'no meio ele não é ponta, não sobra');
  const seq2 = { id: 7102, type: 's', suit: 0, ownerId: 'x',
    values: [3, 4, 5, 6, 7], cards: [c('3', '♠'), c('4', '♠'), c('5', '♠'), c('6', '♠'), J()] };
  const rem = removableCards(seq2);
  assert.equal(rem.length, 2);
  assert.ok(rem.some(isJoker), 'na ponta, com 5 cartas, o coringa sobra');
});

test('descartar a sobra de um jogo ALHEIO: o jogo encurta, a mão fica, a vez passa', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  b.melds = [{ id: 9101, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦'), c('5', '♣')] }];
  const maoAntes = a.hand.length;
  const alvo = removableCards(b.melds[0])[0];
  const ev = actMeldDiscard(state, a.id, 9101, alvo.id);
  assert.equal(ev[0].e, 'meldDiscard');
  assert.equal(ev[0].deQuem, b.id, 'o aviso diz de quem era o jogo');
  assert.equal(b.melds[0].cards.length, 3, 'o jogo do B continua válido, com 3');
  assert.equal(a.hand.length, maoAntes, 'a mão do A ficou intacta');
  assert.equal(topoDoDescarte(state).id, alvo.id, 'a carta foi para o meio');
  assert.equal(state.phase, 'draw', 'a vez passou');
});

test('descartar o coringa que sobra na ponta põe o coringa no topo do meio (que tranca)', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  const j = J();
  b.melds = [{ id: 9102, type: 's', suit: 0, ownerId: b.id,
    values: [3, 4, 5, 6, 7], cards: [c('3', '♠'), c('4', '♠'), c('5', '♠'), c('6', '♠'), j] }];
  actMeldDiscard(state, a.id, 9102, j.id);
  assert.ok(isJoker(topoDoDescarte(state)), 'o coringa está no topo do meio');
  assert.equal(b.melds[0].cards.length, 4, 'a sequência continua válida sem ele');
});

test('a sobra pode vir para a MÃO, de jogo alheio ou próprio, sem passar a vez', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  b.melds = [{ id: 9103, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦'), c('5', '♣')] }];
  a.melds = [{ id: 9104, type: 's', suit: 1, ownerId: a.id,
    values: [8, 9, 10, 11, 12], cards: [c('8', '♥'), c('9', '♥'), c('10', '♥'), c('J', '♥'), c('Q', '♥')] }];
  const maoAntes = a.hand.length;
  const daTrinca = removableCards(b.melds[0])[0];
  const ev = applyAction(state, a.id, { a: 'tomarSobra', meldId: 9103, cardId: daTrinca.id });
  assert.equal(ev[0].e, 'tomouSobra');
  assert.equal(ev[0].deQuem, b.id);
  assert.ok(a.hand.some((x) => x.id === daTrinca.id), 'a carta está na mão do A');
  assert.equal(b.melds[0].cards.length, 3);
  assert.equal(state.phase, 'play', 'não passou a vez');
  assert.equal(state.players[state.turn].id, a.id);
  // do próprio jogo também, pela ponta
  const daSeq = removableCards(a.melds[0]).find((x) => x.rank === 12);
  actTomarSobra(state, a.id, 9104, daSeq.id);
  assert.equal(a.melds[0].cards.length, 4);
  assert.equal(a.hand.length, maoAntes + 2);
});

test('a sobra para a mão respeita vez, fase e o que está sobrando', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  b.melds = [{ id: 9105, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦'), c('5', '♣')] }];
  const alvo = removableCards(b.melds[0])[0];
  assert.throws(() => actTomarSobra(state, a.id, 9105, alvo.id), /Puxe uma carta/, 'na fase de compra, não');
  actDraw(state, a.id, 'deck');
  assert.throws(() => actTomarSobra(state, b.id, 9105, alvo.id), /Não é a sua vez/);
  b.melds.push({ id: 9106, type: 't', rank: 9, ownerId: b.id, cards: [c('9', '♠'), c('9', '♥'), c('9', '♦')] });
  assert.throws(() => actTomarSobra(state, a.id, 9106, b.melds[1].cards[0].id), /não está sobrando/);
  assert.throws(() => actTomarSobra(state, a.id, 424242, alvo.id), /não está na mesa/);
});

test('coringa da mão ocupa o lugar de QUALQUER carta da sequência, não só das pontas', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  const coringa = J();
  a.hand.push(coringa);
  const meio = c('10', '♥');
  b.melds = [{ id: 9201, type: 's', suit: 1, ownerId: b.id,
    values: [8, 9, 10, 11], cards: [c('8', '♥'), c('9', '♥'), meio, c('J', '♥')] }];
  const maoAntes = a.hand.length;
  const ev = applyAction(state, a.id, { a: 'trocarPorCoringa', meldId: 9201, cardId: meio.id, coringaId: coringa.id });
  assert.equal(ev[0].e, 'trocouPorCoringa');
  assert.equal(ev[0].deQuem, b.id);
  assert.equal(b.melds[0].cards.length, 4, 'a sequência continua com 4 cartas');
  assert.deepEqual(b.melds[0].values, [8, 9, 10, 11], 'os valores não mudam');
  assert.ok(isJoker(b.melds[0].cards[2]), 'o coringa ficou no lugar do 10♥');
  assert.ok(a.hand.some((x) => x.id === meio.id), 'o 10♥ veio para a mão');
  assert.ok(!a.hand.some((x) => x.id === coringa.id), 'o coringa saiu da mão');
  assert.equal(a.hand.length, maoAntes, 'a mão não encurta: é troca');
  assert.equal(state.phase, 'play', 'não passou a vez');
});

test('a troca pelo coringa recusa trinca, sequência com coringa, carta de fora e mão sem coringa', () => {
  const state = freshGame();
  const [a, b] = state.players;
  state.turn = state.players.indexOf(a);
  actDraw(state, a.id, 'deck');
  const trinca = { id: 9202, type: 't', rank: 5, ownerId: b.id,
    cards: [c('5', '♠'), c('5', '♥'), c('5', '♦')] };
  const comCoringa = { id: 9203, type: 's', suit: 0, ownerId: b.id,
    values: [3, 4, 5, 6], cards: [c('3', '♠'), J(), c('5', '♠'), c('6', '♠')] };
  const limpa = { id: 9204, type: 's', suit: 2, ownerId: b.id,
    values: [2, 3, 4, 5], cards: [c('2', '♦'), c('3', '♦'), c('4', '♦'), c('5', '♦')] };
  b.melds = [trinca, comCoringa, limpa];
  const fora = c('9', '♦');
  a.hand = a.hand.filter((x) => !isJoker(x));
  assert.throws(() => actTrocarPorCoringa(state, a.id, 9204, limpa.cards[0].id), /coringa na mão/i);
  a.hand.push(J());
  assert.throws(() => actTrocarPorCoringa(state, a.id, 9202, trinca.cards[0].id), /sequência/i);
  assert.throws(() => actTrocarPorCoringa(state, a.id, 9203, comCoringa.cards[0].id), /já tem coringa/i);
  assert.throws(() => actTrocarPorCoringa(state, a.id, 9204, fora.id), /não está nesse jogo/i);
  assert.throws(() => actTrocarPorCoringa(state, b.id, 9204, limpa.cards[0].id), /sua vez/i);
  assert.equal(limpa.cards.length, 4, 'nada mudou na mesa depois das recusas');
});

test('a 1ª rodada começa no anfitrião; as seguintes, em quem venceu a anterior', () => {
  const state = freshGame();
  assert.equal(state.players[state.turn].id, state.players[0].id, 'a primeira é de quem criou a sala');
  const caio = state.players[2];
  state.phase = 'roundEnd';
  state.lastRound = { winnerId: caio.id, scores: {}, reason: 'bateu' };
  startRound(state);
  assert.equal(state.players[state.turn].id, caio.id, 'quem bateu abre a rodada seguinte');
  // rodada morta (sem vencedor) não trava a mesa: volta ao rodízio
  state.phase = 'roundEnd';
  state.lastRound = { winnerId: null, scores: {}, reason: 'esgotado' };
  startRound(state);
  assert.ok(state.players[state.turn], 'a rodada seguinte tem quem comece');
});

test('quem abre a rodada queima a carta do monte uma vez e ela sai do jogo', () => {
  const state = freshGame();
  const abre = state.players[state.turn];
  const antes = abre.hand.length;
  actDraw(state, abre.id, 'deck');
  const puxada = state.compraDaVez.cardId;
  assert.equal(viewFor(state, abre.id).you.podeQueimar, true, 'a opção aparece para quem abriu');
  const ev = applyAction(state, abre.id, { a: 'queimar' });
  assert.equal(ev[0].e, 'queimou');
  assert.ok(!abre.hand.some((x) => x.id === puxada), 'a carta queimada saiu da mão');
  assert.ok(state.queimadas.some((x) => x.id === puxada), 'e foi para fora do jogo');
  assert.ok(!state.deck.some((x) => x.id === puxada) && !state.discard.some((x) => x.id === puxada),
    'a queimada não volta para o monte nem para o meio');
  assert.equal(abre.hand.length, antes + 1, 'no lugar dela veio outra do monte');
  assert.equal(state.phase, 'play', 'continua na mesma jogada');
  assert.equal(viewFor(state, abre.id).you.podeQueimar, false, 'e é uma vez só');
  assert.throws(() => actQueimar(state, abre.id), /abre a rodada/i);
});

test('a queima é só de quem abre, na 1ª jogada, e nunca da carta do meio', () => {
  const state = freshGame();
  const abre = state.players[state.turn];
  const outro = state.players[(state.turn + 1) % state.players.length];
  actDraw(state, abre.id, 'deck');
  assert.throws(() => actQueimar(state, outro.id), /sua vez/i);
  actDiscard(state, abre.id, abre.hand[0].id);
  const segundo = state.players[state.turn];
  actDraw(state, segundo.id, 'deck');
  assert.equal(viewFor(state, segundo.id).you.podeQueimar, false, 'o segundo a jogar não queima');
  assert.throws(() => actQueimar(state, segundo.id), /abre a rodada/i);

  const outra = freshGame(7);
  const abre2 = outra.players[outra.turn];
  actDraw(outra, abre2.id, 'discard');
  assert.equal(viewFor(outra, abre2.id).you.podeQueimar, false);
  assert.throws(() => actQueimar(outra, abre2.id), /do monte/i);
});
