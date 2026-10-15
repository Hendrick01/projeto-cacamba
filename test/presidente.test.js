import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startRound, applyAction, actNextRound, viewFor, botNextAction,
  forca, motivoDaRecusa, tituloDaPosicao, playerById,
} from '../shared/presidente.js';
import { mulberry32 } from '../shared/engine.js';

const SU = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RK = { A: 1, J: 11, Q: 12, K: 13 };
let nextId = 1000;
const c = (rank, suit = '♠') => ({ id: nextId++, rank: RK[rank] ?? Number(rank), suit: SU[suit] });

function mesa(n, seed = 7) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
  return createGame(players, { rnd: mulberry32(seed) });
}

// Mesa com mãos montadas à mão, já na fase de jogo, com a vez em `turn`.
function montada(maos, turn = 0) {
  const s = mesa(maos.length);
  startRound(s);
  s.players.forEach((p, i) => { p.hand = maos[i]; });
  s.phase = 'play'; s.turn = turn; s.trocas = [];
  return s;
}

test('força: 3 é a mais fraca, 2 a mais forte, A logo abaixo do 2', () => {
  assert.equal(forca(c(3)), 0);
  assert.equal(forca(c('K')), 10);
  assert.equal(forca(c('A')), 11);
  assert.equal(forca(c(2)), 12);
});

test('distribui o baralho inteiro e abre quem tem o 3 de paus', () => {
  const s = mesa(5);
  const ev = startRound(s);
  assert.equal(s.players.reduce((n, p) => n + p.hand.length, 0), 52);
  assert.equal(s.phase, 'play');
  const abre = s.players[s.turn];
  assert.ok(abre.hand.some((x) => x.rank === 3 && x.suit === 3));
  assert.ok(ev.some((e) => e.e === 'abre' && e.p === abre.id));
});

test('cobrir: mesma quantidade e mais alto', () => {
  const m = { n: 2, forca: forca(c(9)), cards: [c(9), c(9, '♥')] };
  assert.equal(motivoDaRecusa(m, [c(10), c(10, '♥')]), null);
  assert.match(motivoDaRecusa(m, [c(9, '♦'), c(9, '♣')]), /mais alto/);
  assert.match(motivoDaRecusa(m, [c('K')]), /par/);
  assert.match(motivoDaRecusa(null, [c(5), c(6)]), /mesmo valor/);
  // a visão do cliente não leva `forca`: a regra tem de valer só com as cartas
  assert.match(motivoDaRecusa({ n: 1, cards: [c('A')] }, [c(5)]), /mais alto que A/);
  assert.equal(motivoDaRecusa(null, [c(5), c(5, '♥'), c(5, '♦')]), null);
});

test('todos passam: quem jogou por último limpa a mesa e abre', () => {
  const a = c(7), s = montada([[a, c(4)], [c(5), c(6)], [c(3), c(8)]]);
  applyAction(s, 'p0', { a: 'jogar', cardIds: [a.id] });
  assert.equal(s.players[s.turn].id, 'p1');
  assert.throws(() => applyAction(s, 'p1', { a: 'jogar', cardIds: [s.players[1].hand[0].id] }), /mais alto/);
  applyAction(s, 'p1', { a: 'passar' });
  const ev = applyAction(s, 'p2', { a: 'passar' });
  assert.ok(ev.some((e) => e.e === 'limpou' && e.p === 'p0'));
  assert.equal(s.mesa, null);
  assert.equal(s.players[s.turn].id, 'p0');
  assert.throws(() => applyAction(s, 'p0', { a: 'passar' }), /limpa/);
});

test('quem passou ainda joga quando a vez volta, se a mesa não limpou', () => {
  const quatro = c(4), rei = c('K'), cinco = c(5), dois = c(2), seis = c(6), tres = c(3);
  const s = montada([[quatro, rei], [cinco, dois], [seis, tres]]);
  applyAction(s, 'p0', { a: 'jogar', cardIds: [quatro.id] });
  applyAction(s, 'p1', { a: 'passar' });
  applyAction(s, 'p2', { a: 'jogar', cardIds: [seis.id] });
  applyAction(s, 'p0', { a: 'jogar', cardIds: [rei.id] });
  // p1 tinha passado no 4, mas pode cobrir o K com o 2
  applyAction(s, 'p1', { a: 'jogar', cardIds: [dois.id] });
  assert.equal(s.mesa.by, 'p1');
});

test('quem sai jogando a última carta: se ninguém cobre, abre o próximo com carta', () => {
  const s = montada([[c(2)], [c(5), c(6)], [c(3), c(8)]]);
  const ev = applyAction(s, 'p0', { a: 'jogar', cardIds: [s.players[0].hand[0].id] });
  assert.ok(ev.some((e) => e.e === 'saiu' && e.p === 'p0' && e.pos === 0));
  applyAction(s, 'p1', { a: 'passar' });
  const ev2 = applyAction(s, 'p2', { a: 'passar' });
  assert.ok(ev2.some((e) => e.e === 'limpou' && e.p === 'p1'));
});

test('títulos pela ordem de saída', () => {
  assert.deepEqual([0, 1, 2].map((i) => tituloDaPosicao(i, 3)), ['presidente', 'neutro', 'cu']);
  assert.deepEqual([0, 1, 2, 3].map((i) => tituloDaPosicao(i, 4)), ['presidente', 'vice', 'vice-cu', 'cu']);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => tituloDaPosicao(i, 5)), ['presidente', 'vice', 'neutro', 'vice-cu', 'cu']);
});

test('fim de rodada distribui títulos e pontos; troca 2/1 na seguinte', () => {
  const s = montada([[c(2)], [c('A')], [c(3)], [c(5), c(6)]]);
  applyAction(s, 'p0', { a: 'jogar', cardIds: [s.players[0].hand[0].id] });
  for (const id of ['p1', 'p2', 'p3']) applyAction(s, id, { a: 'passar' });
  applyAction(s, 'p1', { a: 'jogar', cardIds: [s.players[1].hand[0].id] });
  for (const id of ['p2', 'p3']) applyAction(s, id, { a: 'passar' });
  const ev = applyAction(s, 'p2', { a: 'jogar', cardIds: [s.players[2].hand[0].id] });
  const fim = ev.find((e) => e.e === 'roundEnd');
  assert.ok(fim);
  assert.deepEqual(fim.ordem, ['p0', 'p1', 'p2', 'p3']);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(playerById(s, 'p0').titulo, 'presidente');
  assert.equal(playerById(s, 'p3').titulo, 'cu');
  assert.equal(playerById(s, 'p0').pontos, 3);
  assert.equal(playerById(s, 'p3').pontos, 0);

  const ev2 = actNextRound(s);
  assert.equal(s.phase, 'troca');
  assert.ok(ev2.some((e) => e.e === 'entregou' && e.p === 'p3' && e.para === 'p0' && e.n === 2));
  assert.equal(playerById(s, 'p0').hand.length, 15);
  assert.equal(playerById(s, 'p3').hand.length, 11);
  // o Cu entregou as duas mais fortes que tinha: nada sobrou na mão dele mais forte que elas
  assert.equal(s.players[s.turn].id, 'p0');
  assert.throws(() => applyAction(s, 'p0', { a: 'trocar', cardIds: [playerById(s, 'p0').hand[0].id] }), /2 cartas/);
  const devolve = playerById(s, 'p0').hand.slice(0, 2).map((x) => x.id);
  applyAction(s, 'p0', { a: 'trocar', cardIds: devolve });
  assert.equal(playerById(s, 'p3').hand.length, 13);
  assert.equal(s.players[s.turn].id, 'p1');   // o Vice devolve 1
  applyAction(s, 'p1', botNextAction(s, 'p1'));
  assert.equal(s.phase, 'play');
  assert.equal(s.players[s.turn].id, 'p3');   // o Cu abre
  assert.deepEqual(s.players.map((p) => p.hand.length), [13, 13, 13, 13]);
});

test('a visão não mostra a mão dos outros', () => {
  const s = mesa(4); startRound(s);
  const v = viewFor(s, 'p1');
  assert.equal(v.modo, 'presidente');
  assert.equal(v.you.hand.length, 13);
  for (const p of v.players) assert.equal(p.hand, undefined);
  assert.deepEqual(v.claims, []);
});

test('robôs jogam rodadas inteiras sem travar nem recusar jogada', () => {
  for (const n of [3, 4, 6, 8]) {
    for (const nivel of ['normal', 'facil']) {
      const s = createGame(Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true })), { rnd: mulberry32(n * 31), nivelRobos: nivel });
      startRound(s);
      for (let rodada = 0; rodada < 4; rodada++) {
        let passos = 0;
        while (s.phase !== 'roundEnd') {
          const id = s.players[s.turn].id;
          applyAction(s, id, botNextAction(s, id));
          assert.ok(++passos < 2000, `travou com ${n} (${nivel})`);
        }
        assert.equal(new Set(s.lastRound.ordem).size, n);
        actNextRound(s);
      }
    }
  }
});

test('o estado sobrevive ao JSON (retrato da sala)', () => {
  const s = mesa(4); startRound(s);
  const volta = JSON.parse(JSON.stringify(s));
  volta.rnd = Math.random;
  const id = volta.players[volta.turn].id;
  applyAction(volta, id, botNextAction(volta, id));
  assert.ok(Array.isArray(volta.deck));
});
