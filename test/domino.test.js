import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startRound, applyAction, actNextRound, viewFor, botNextAction,
  jogoDePedras, somaDasPontas, ramosPara, arredonda5, ehCarroca, RAMOS, playerById,
} from '../shared/domino.js';
import { mulberry32 } from '../shared/engine.js';

const TODAS = jogoDePedras();
// '5|3' → a pedra de verdade (a ordem dos lados não importa)
const P = (txt) => {
  const [x, y] = txt.split('|').map(Number);
  return TODAS.find((p) => p.a === Math.min(x, y) && p.b === Math.max(x, y));
};
const ids = ['p0', 'p1', 'p2', 'p3'];

function mesa(seed = 7, opts = {}) {
  return createGame(ids.map((id) => ({ id, name: id.toUpperCase(), isBot: true })), { rnd: mulberry32(seed), ...opts });
}

// Mão montada: cada jogador com as pedras dadas, a vez com quem sai.
function montada(maos, saida, turn = 0) {
  const s = mesa();
  startRound(s);
  s.players.forEach((p, i) => { p.hand = maos[i].map(P); });
  s.saida = P(saida).id; s.turn = turn; s.mesa = null; s.passes = [];
  return s;
}
const joga = (s, id, pedra, ramo) => applyAction(s, id, { a: 'jogar', pedraId: P(pedra).id, ramo });
const passa = (s, id) => applyAction(s, id, { a: 'passar' });

test('o jogo tem 28 pedras, 7 carroças e ids únicos', () => {
  assert.equal(TODAS.length, 28);
  assert.equal(TODAS.filter(ehCarroca).length, 7);
  assert.equal(new Set(TODAS.map((p) => p.id)).size, 28);
});

test('1ª mão: 7 pedras para cada um e sai quem tem a 6|6, com ela', () => {
  const s = mesa(3);
  const ev = startRound(s);
  assert.ok(s.players.every((p) => p.hand.length === 7));
  const sai = s.players[s.turn];
  assert.ok(sai.hand.some((p) => p.id === P('6|6').id));
  assert.equal(s.saida, P('6|6').id);
  assert.ok(ev.some((e) => e.e === 'abre' && e.p === sai.id));
  const outra = sai.hand.find((p) => p.id !== s.saida);
  assert.throws(() => applyAction(s, sai.id, { a: 'jogar', pedraId: outra.id }), /saia com a 6\|6/);
  assert.throws(() => passa(s, sai.id), /é você quem sai/);
});

test('as duplas são fixas: assentos 0 e 2 contra 1 e 3', () => {
  const s = mesa();
  assert.deepEqual(s.players.map((p) => p.time), [0, 1, 0, 1]);
});

test('a saída já marca, e a cruz abre em cima e embaixo só com os dois lados cobertos', () => {
  const s = montada([['5|5', '0|0'], ['3|5', '1|1'], ['0|5', '2|2'], ['2|5', '4|4']], '5|5');
  joga(s, 'p0', '5|5');
  assert.deepEqual(s.times, [10, 0], 'carroça de saída 5|5 vale 10');

  assert.throws(() => joga(s, 'p1', '3|5'), /Escolha em qual ponta/);
  joga(s, 'p1', '3|5', 'esq');
  assert.equal(somaDasPontas(s.mesa), 13, 'a cruz ainda conta os dois lados: 3 + 10');
  assert.deepEqual(ramosPara(s.mesa, P('2|5')), ['dir'], 'sem cima/baixo antes da direita');

  joga(s, 'p2', '0|5', 'dir');
  assert.equal(somaDasPontas(s.mesa), 3, 'coberta dos dois lados, a cruz sai da conta');
  assert.deepEqual(ramosPara(s.mesa, P('2|5')), ['cima', 'baixo']);

  joga(s, 'p3', '2|5', 'cima');
  assert.equal(somaDasPontas(s.mesa), 5);
  assert.deepEqual(s.times, [10, 5]);
});

test('carroça na ponta conta os dois lados; só a primeira vira cruz', () => {
  const s = montada([['6|6', '3|3'], ['6|3', '1|1'], ['6|2', '1|2'], ['0|1', '4|4']], '6|6');
  joga(s, 'p0', '6|6');                      // 12: não marca
  joga(s, 'p1', '6|3', 'esq');               // 3 + 12 = 15
  assert.deepEqual(s.times, [0, 15]);
  joga(s, 'p2', '6|2', 'dir');               // 3 + 2 = 5
  assert.deepEqual(s.times, [5, 15]);
  passa(s, 'p3');                            // sem 3, 2 nem 6: paga 10
  assert.deepEqual(s.times, [15, 15]);
  joga(s, 'p0', '3|3', 'esq');               // carroça na ponta: 6 + 2 = 8
  assert.equal(somaDasPontas(s.mesa), 8);
  assert.deepEqual(ramosPara(s.mesa, P('3|1')), ['esq'], 'a 3|3 não abre cima/baixo para o 3');
});

test('passe: o primeiro paga 10, os seguintes vão no escuro e a cobrança volta com a pedra', () => {
  const s = montada([['5|5', '4|5'], ['1|1', '2|2'], ['3|5', '6|6'], ['1|6', '2|6']], '5|5');
  joga(s, 'p0', '5|5');                                   // +10 para a dupla 0
  passa(s, 'p1');                                         // sem jogada: paga 10
  assert.deepEqual(s.times, [20, 0]);
  passa(s, 'p2');                                         // tem a 3|5, passa no escuro
  passa(s, 'p3');                                         // sem jogada, não paga
  passa(s, 'p0');                                         // no escuro também
  assert.deepEqual(s.times, [20, 0]);
  passa(s, 'p1');                                         // já passou, mas não tem jogada
  assert.throws(() => passa(s, 'p2'), /já passou nesta volta/);
  joga(s, 'p2', '3|5', 'esq');                            // 3 + 10 = 13
  assert.deepEqual(s.passes, []);
  passa(s, 'p3');                                         // primeiro passe de novo: paga
  assert.deepEqual(s.times, [30, 0]);
});

test('o primeiro passe não pode ser de quem tem jogada', () => {
  const s = montada([['5|5', '0|0'], ['5|1', '1|1'], ['5|2', '2|2'], ['5|3', '3|3']], '5|5');
  joga(s, 'p0', '5|5');
  assert.throws(() => passa(s, 'p1'), /Você tem jogada/);
  assert.equal(viewFor(s, 'p1').you.podePassar, false);
  assert.equal(viewFor(s, 'p1').you.passeCusta, 10);
});

test('batida: soma das pedras dos adversários, sem o parceiro, ao múltiplo de 5 mais perto', () => {
  assert.equal(arredonda5(22), 20);
  assert.equal(arredonda5(23), 25);
  assert.equal(arredonda5(0), 0);
  const s = montada([['5|5'], ['1|2', '6|6'], ['3|3', '6|5'], ['4|6', '0|1']], '5|5');
  const ev = joga(s, 'p0', '5|5');
  // adversários: 1+2+12 e 10+1 = 26 → 25; o parceiro (3|3, 6|5) não conta
  const bateu = ev.find((e) => e.e === 'bateu');
  assert.equal(bateu.resto, 26);
  assert.equal(bateu.pts, 25);
  assert.deepEqual(s.times, [35, 0]);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.lastRound.motivo, 'batida');
  assert.ok(viewFor(s, 'p1').lastRound.maos, 'fechada a mão, todos veem o que sobrou');
});

test('depois da batida sai quem bateu com a maior carroça dele; sem carroça, a maior da mesa', () => {
  let comCarroca = 0, semCarroca = 0;
  for (let seed = 1; seed < 400 && (!comCarroca || !semCarroca); seed++) {
    const s = mesa(seed);
    startRound(s);
    s.lastRound = { motivo: 'batida', por: 'p1' };
    s.phase = 'roundEnd';
    actNextRound(s);
    const p1 = playerById(s, 'p1');
    const dele = p1.hand.filter(ehCarroca).sort((x, y) => y.a - x.a)[0];
    if (dele) {
      comCarroca++;
      assert.equal(s.players[s.turn].id, 'p1');
      assert.equal(s.saida, dele.id);
    } else {
      semCarroca++;
      const maior = s.players.flatMap((p) => p.hand).filter(ehCarroca).sort((x, y) => y.a - x.a)[0];
      assert.equal(s.saida, maior.id);
      assert.ok(s.players[s.turn].hand.includes(maior));
    }
  }
  assert.ok(comCarroca && semCarroca, 'as duas situações apareceram');
});

test('trancou: quem trancou dá 40 à dupla adversária e a mão acaba', () => {
  const s = montada([['6|6', '0|0'], ['1|1'], ['2|2'], ['3|3']], '6|6');
  const ev = joga(s, 'p0', '6|6');
  assert.ok(ev.some((e) => e.e === 'trancou' && e.p === 'p0'));
  assert.deepEqual(s.times, [0, 40]);
  assert.equal(s.phase, 'roundEnd');
  actNextRound(s);
  const maior = s.players.flatMap((p) => p.hand).filter(ehCarroca).sort((x, y) => y.a - x.a)[0];
  assert.equal(s.saida, maior.id, 'depois de trancada, sai a maior carroça da mesa');
});

test('a partida acaba quando uma dupla chega a 240', () => {
  const s = montada([['5|5', '0|0'], ['5|1', '1|1'], ['5|2', '2|2'], ['5|3', '3|3']], '5|5');
  s.times = [235, 100];
  const ev = joga(s, 'p0', '5|5');
  assert.equal(s.phase, 'gameEnd');
  assert.equal(s.vencedor, 0);
  assert.ok(ev.some((e) => e.e === 'gameEnd' && e.vencedor === 0));
  assert.throws(() => joga(s, 'p1', '5|1', 'esq'), /Não é hora/);
});

test('a visão não vaza a mão dos outros e só oferece jogada a quem tem a vez', () => {
  const s = mesa(11);
  startRound(s);
  const daVez = s.players[s.turn].id;
  const outro = ids.find((id) => id !== daVez);
  const v = viewFor(s, outro);
  assert.equal(v.you.hand.length, 7);
  assert.deepEqual(v.you.jogadas, []);
  assert.ok(v.players.every((p) => p.hand === undefined && p.handCount === 7));
  assert.equal(JSON.stringify(v).includes('"maos"'), false);
  assert.equal(viewFor(s, daVez).you.jogadas.length, 1, 'na saída, só a carroça');
});

test('robôs jogam partidas inteiras sem erro, sem sumir pedra e com placar de 5 em 5', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const s = mesa(seed, { nivelRobos: seed % 3 === 0 ? 'facil' : 'normal' });
    startRound(s);
    let passos = 0;
    while (s.phase !== 'gameEnd') {
      assert.ok(++passos < 20000, `partida ${seed} não terminou`);
      if (s.phase === 'roundEnd') { actNextRound(s); continue; }
      const id = s.players[s.turn].id;
      applyAction(s, id, botNextAction(s, id));
      const naMesa = s.mesa ? 1 + RAMOS.reduce((n, r) => n + s.mesa.ramos[r].length, 0) : 0;
      const nasMaos = s.players.reduce((n, p) => n + p.hand.length, 0);
      assert.equal(naMesa + nasMaos, 28);
      assert.ok(s.times.every((t) => t % 5 === 0), `placar ${s.times}`);
    }
    assert.ok(s.times[s.vencedor] >= 240);
  }
});

test('robô normal ganha do fácil na maioria', () => {
  let normal = 0;
  const N = 120;
  for (let seed = 1; seed <= N; seed++) {
    const s = mesa(seed);
    startRound(s);
    while (s.phase !== 'gameEnd') {
      if (s.phase === 'roundEnd') { actNextRound(s); continue; }
      const p = s.players[s.turn];
      s.opts.nivelRobos = p.time === 0 ? 'normal' : 'facil';
      applyAction(s, p.id, botNextAction(s, p.id));
    }
    if (s.vencedor === 0) normal++;
  }
  assert.ok(normal > N * 0.55, `normal venceu ${normal} de ${N}`);
});
