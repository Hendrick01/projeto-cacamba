import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startRound, applyAction, actNextRound, viewFor, botNextAction,
  analisaJogo, jogoVale, planejaJogada, tick, proximoPrazo, retoma, playerById,
  VEZ_MS, CARTAS_NA_MAO,
} from '../shared/mexemexe.js';
import { mulberry32 } from '../shared/engine.js';

const SU = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RK = { A: 1, J: 11, Q: 12, K: 13 };
let nextId = 1000;
// c('7♥'), c('10♣'), c('A♠')
const c = (txt) => {
  const suit = SU[txt.slice(-1)];
  const r = txt.slice(0, -1);
  return { id: nextId++, rank: RK[r] ?? Number(r), suit };
};
const cs = (txt) => txt.split(' ').map(c);
const ids = (cards) => cards.map((x) => x.id);

function mesa(n, seed = 7) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
  return createGame(players, { rnd: mulberry32(seed) });
}

// Mesa com mãos e jogos montados à mão, na vez de `turn`.
function montada(maos, jogos = [], turn = 0, agora = 0) {
  const s = mesa(maos.length);
  startRound(s, agora);
  s.players.forEach((p, i) => { p.hand = maos[i]; });
  s.mesa = jogos.map((cards, i) => ({ id: i + 1, cards }));
  s.proximoJogo = jogos.length + 1;
  s.turn = turn;
  return s;
}

const jogosDaMesa = (s) => s.mesa.map((j) => ids(j.cards));

test('sequência: cartas seguidas do mesmo naipe, Ás embaixo ou depois do K', () => {
  assert.ok(jogoVale(cs('A♠ 2♠ 3♠')));
  assert.ok(jogoVale(cs('Q♥ K♥ A♥')));
  assert.ok(jogoVale(cs('5♦ 3♦ 4♦ 6♦')));
  assert.ok(jogoVale(cs('A♣ 2♣ 3♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣')));
  assert.match(analisaJogo(cs('K♠ A♠ 2♠')).motivo, /K-A-2/);
  assert.match(analisaJogo(cs('3♠ 5♠ 6♠')).motivo, /Falta o 4♠/);
  assert.match(analisaJogo(cs('3♠ 4♠ 4♠')).motivo, /repetida/);
  // o Ás não fica nas duas pontas: A-…-K-A são 14 cartas, com o Ás duas vezes
  assert.ok(!jogoVale(cs('A♣ 2♣ 3♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣ A♣')));
  // mostra na ordem: Q K A, com o Ás no fim
  assert.deepEqual(analisaJogo(cs('A♥ Q♥ K♥')).cards.map((x) => x.rank), [12, 13, 1]);
});

test('trinca: 3 naipes diferentes; com 4 ou mais, um par de naipe no máximo', () => {
  assert.ok(jogoVale(cs('7♠ 7♥ 7♦')));
  assert.ok(jogoVale(cs('7♠ 7♥ 7♦ 7♣')));
  assert.ok(!jogoVale(cs('7♠ 7♠ 7♥')));
  assert.match(analisaJogo(cs('7♠ 7♠ 7♥')).motivo, /precisa de 4/);
  assert.ok(jogoVale(cs('7♠ 7♠ 7♥ 7♦')));
  assert.ok(jogoVale(cs('7♠ 7♠ 7♥ 7♦ 7♣')));
  assert.ok(!jogoVale(cs('7♠ 7♠ 7♥ 7♥')));
  assert.match(analisaJogo(cs('7♠ 7♠ 7♥ 7♥')).motivo, /um naipe/);
});

test('jogo incompleto ou misturado diz o que está errado', () => {
  assert.match(analisaJogo(cs('9♠')).motivo, /Faltam 2/);
  assert.equal(analisaJogo(cs('9♠ 9♥')).falta, 1);
  assert.match(analisaJogo(cs('9♠ 10♠')).motivo, /Falta 1/);
  assert.match(analisaJogo(cs('9♠ 10♥ J♠')).motivo, /Misturou/);
});

test('começo: dois baralhos sem coringa, 11 cartas, abre o anfitrião', () => {
  const s = mesa(4);
  const ev = startRound(s, 1000);
  assert.equal(s.phase, 'play');
  for (const p of s.players) assert.equal(p.hand.length, CARTAS_NA_MAO);
  assert.equal(s.deck.length, 104 - 4 * CARTAS_NA_MAO);
  const todas = [...s.deck, ...s.players.flatMap((p) => p.hand)];
  assert.equal(new Set(todas.map((x) => x.id)).size, 104);
  assert.ok(todas.every((x) => x.rank >= 1 && x.rank <= 13 && x.suit >= 0 && x.suit <= 3));
  assert.equal(s.turn, 0);
  assert.equal(s.prazo, 1000 + VEZ_MS);
  assert.deepEqual(ev, [{ e: 'roundStart', round: 0, first: 'p0' }]);
});

test('baixar um jogo da mão passa a vez', () => {
  const m = cs('4♥ 5♥ 6♥ K♠');
  const s = montada([m, cs('2♣ 3♣')]);
  const ev = applyAction(s, 'p0', { a: 'jogar', mesa: [ids(m.slice(0, 3))] }, 5);
  assert.deepEqual(jogosDaMesa(s), [ids(m.slice(0, 3))]);
  assert.deepEqual(ids(s.players[0].hand), [m[3].id]);
  assert.equal(s.players[s.turn].id, 'p1');
  assert.equal(s.prazo, 5 + VEZ_MS);
  assert.equal(ev[0].e, 'jogou');
  assert.equal(ev[0].mexeu, false);
});

test('mexer na mesa: partir uma sequência e usar as cartas com as da mão', () => {
  // mesa: 3♠ 4♠ 5♠ 6♠ 7♠ e 9♥ 9♦ 9♣; mão: 5♠ (repetido) e 9♠
  const seq = cs('3♠ 4♠ 5♠ 6♠ 7♠'), trinca = cs('9♥ 9♦ 9♣');
  const [cinco, nove, sobra] = cs('5♠ 9♠ 2♦');
  const s = montada([[cinco, nove, sobra], cs('2♣ 3♣')], [seq, trinca]);
  const nova = [ids(seq.slice(0, 3)), [cinco.id, ...ids(seq.slice(3))], [...ids(trinca), nove.id]];
  const ev = applyAction(s, 'p0', { a: 'jogar', mesa: nova });
  assert.equal(s.mesa.length, 3);
  assert.deepEqual(ids(s.players[0].hand), [sobra.id]);
  assert.equal(ev[0].mexeu, true);
  // a trinca mudou (ganhou o 9♠): id novo; nada ficou com o id da sequência
  assert.ok(s.mesa.every((j) => j.id > 2));
});

test('recusa: carta da mesa para a mão, nada da mão, jogo inválido, carta alheia', () => {
  const seq = cs('3♠ 4♠ 5♠ 6♠');
  const meu = cs('7♠ 8♥'), dele = cs('7♥ 7♦');
  const s = montada([meu, dele], [seq]);
  // o 6♠ "sumiu": voltaria para a mão
  assert.throws(() => applyAction(s, 'p0', { a: 'jogar', mesa: [[...ids(seq.slice(0, 3)), meu[0].id]] }), /não volta para a mão/);
  // só mexeu, sem pôr carta da mão
  assert.throws(() => applyAction(s, 'p0', { a: 'jogar', mesa: [ids(seq)] }), /pelo menos uma carta da sua mão/);
  // 8♥ não cabe na sequência de espadas
  assert.throws(() => applyAction(s, 'p0', { a: 'jogar', mesa: [[...ids(seq), meu[1].id]] }), /Misturou/);
  // carta repetida em dois jogos
  assert.throws(() => applyAction(s, 'p0', { a: 'jogar', mesa: [[...ids(seq), meu[0].id], [meu[0].id]] }), /dois jogos/);
  // carta da mão do outro
  assert.throws(() => applyAction(s, 'p0', { a: 'jogar', mesa: [ids(seq), [dele[0].id, dele[1].id, meu[0].id]] }), /nem na sua mão|não está/);
  // fora da vez
  assert.throws(() => applyAction(s, 'p1', { a: 'jogar', mesa: [[...ids(seq), meu[0].id]] }), /sua vez/);
  // id que não é número inteiro
  assert.throws(() => applyAction(s, 'p0', { a: 'jogar', mesa: [[String(seq[0].id)]] }), /inválida/);
  // nada mudou com as recusas
  assert.deepEqual(jogosDaMesa(s), [ids(seq)]);
  assert.equal(s.players[0].hand.length, 2);
  // e a jogada certa passa
  applyAction(s, 'p0', { a: 'jogar', mesa: [[...ids(seq), meu[0].id]] });
  assert.equal(s.mesa[0].cards.length, 5);
});

test('comprar é livre e passa a vez; a carta comprada não aparece no evento', () => {
  const m = cs('4♥ 5♥ 6♥');
  const s = montada([m, cs('2♣ 3♣')]);
  const antes = s.deck.length;
  const ev = applyAction(s, 'p0', { a: 'comprar' });
  assert.equal(s.players[0].hand.length, 4);
  assert.equal(s.deck.length, antes - 1);
  assert.equal(s.players[s.turn].id, 'p1');
  assert.deepEqual(ev, [{ e: 'comprou', p: 'p0', n: 1, porTempo: false }]);
});

test('bater: quem esvazia a mão ganha a partida, e abre a próxima', () => {
  const m = cs('4♥ 5♥ 6♥');
  const s = montada([cs('2♣ 3♣'), m, cs('K♦ K♣')], [], 1);
  const ev = applyAction(s, 'p1', { a: 'jogar', mesa: [ids(m)] });
  assert.equal(s.phase, 'roundEnd');
  assert.deepEqual(ev.map((e) => e.e), ['jogou', 'bateu', 'roundEnd']);
  assert.deepEqual(s.lastRound.vencedores, ['p1']);
  assert.equal(s.lastRound.motivo, 'bateu');
  assert.equal(playerById(s, 'p1').vitorias, 1);
  assert.equal(proximoPrazo(s), null);
  assert.throws(() => applyAction(s, 'p0', { a: 'comprar' }), /Não é hora/);
  const ev2 = actNextRound(s, 0);
  assert.equal(s.phase, 'play');
  assert.equal(s.players[s.turn].id, 'p1');
  assert.equal(ev2[0].first, 'p1');
  assert.equal(s.mesa.length, 0);
});

test('monte vazio: o jogo segue, e acaba quando alguém precisa comprar', () => {
  const s = montada([cs('4♥ 5♥ 6♥ 9♣'), cs('2♣ 3♣ 8♦'), cs('K♦ Q♣ J♠ 10♥')]);
  s.deck = [];
  // quem tem jogada ainda joga
  applyAction(s, 'p0', { a: 'jogar', mesa: [ids(s.players[0].hand.slice(0, 3))] });
  assert.equal(s.phase, 'play');
  // o próximo precisa comprar: não há carta, a rodada acaba
  const ev = applyAction(s, 'p1', { a: 'comprar' });
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.lastRound.motivo, 'monte');
  // p0 ficou com 1 carta: menos cartas ganha
  assert.deepEqual(s.lastRound.vencedores, ['p0']);
  assert.deepEqual(ev.map((e) => e.e), ['semMonte', 'roundEnd']);
});

test('monte vazio com empate: desempata a menor soma, e empate de novo ganham os dois', () => {
  const a = montada([cs('K♠ 2♥'), cs('3♣ 4♦'), cs('A♥ 6♠')]);
  a.deck = [];
  applyAction(a, 'p0', { a: 'comprar' });
  // 15, 7, 7: p1 e p2 empatam na soma (3+4 e 1+6)
  assert.deepEqual(a.lastRound.vencedores, ['p1', 'p2']);
  assert.equal(playerById(a, 'p1').vitorias, 1);
  assert.equal(playerById(a, 'p2').vitorias, 1);

  const b = montada([cs('K♠ 2♥'), cs('3♣ 5♦')]);
  b.deck = [];
  applyAction(b, 'p0', { a: 'comprar' });
  assert.deepEqual(b.lastRound.vencedores, ['p1']);
});

test('relógio: a vez estoura em 90 s e quem estava nela compra 1', () => {
  const s = montada([cs('4♥ 5♥ 6♥'), cs('2♣ 3♣')], [], 0, 1000);
  assert.equal(proximoPrazo(s), 1000 + VEZ_MS);
  assert.deepEqual(tick(s, 1000 + VEZ_MS - 1), []);
  const ev = tick(s, 1000 + VEZ_MS);
  assert.deepEqual(ev.map((e) => e.e), ['estourou', 'comprou']);
  assert.equal(ev[1].porTempo, true);
  assert.equal(s.players[0].hand.length, 4);
  assert.equal(s.players[s.turn].id, 'p1');
  assert.equal(proximoPrazo(s), 1000 + VEZ_MS + VEZ_MS);
  // monte vazio e o tempo acaba: é a mesma coisa que precisar comprar
  s.deck = [];
  tick(s, 10_000_000);
  assert.equal(s.phase, 'roundEnd');
  assert.equal(s.lastRound.motivo, 'monte');
});

test('retoma: depois do reinício a vez recomeça inteira', () => {
  const s = montada([cs('4♥ 5♥ 6♥'), cs('2♣ 3♣')], [], 0, 0);
  retoma(s, 500_000);
  assert.equal(s.prazo, 500_000 + VEZ_MS);
});

test('visão: só a própria mão, o tamanho do monte e o tempo que resta', () => {
  const s = mesa(3);
  startRound(s, 0);
  const v = viewFor(s, 'p1', 30_000);
  assert.equal(v.modo, 'mexemexe');
  assert.equal(v.you.hand.length, CARTAS_NA_MAO);
  assert.equal(v.monte, 104 - 33);
  assert.equal(v.restaMs, VEZ_MS - 30_000);
  assert.ok(v.players.every((p) => !('hand' in p)));
  assert.ok(v.players.every((p) => p.handCount === CARTAS_NA_MAO));
  assert.equal(JSON.stringify(v).includes(JSON.stringify(s.players[0].hand[0])), false);
});

test('robô fácil baixa jogo da mão e encaixa; não desmonta a mesa', () => {
  const seq = cs('3♠ 4♠ 5♠ 6♠ 7♠');
  const [cinco] = cs('5♠');
  const facil = planejaJogada([seq], [cinco, ...cs('9♥ 9♦ 9♣ 8♠ K♦')], { facil: true });
  // 9♥9♦9♣ da mão e o 8♠ na ponta da sequência
  assert.equal(facil.usadas, 4);
  assert.ok(facil.mesa.every(jogoVale));
  assert.deepEqual(facil.resto.map((x) => x.rank).sort((a, b) => a - b), [5, 13]);
  // o normal também parte a sequência com o 5♠ repetido
  const normal = planejaJogada([seq], [cinco, ...cs('9♥ 9♦ 9♣ 8♠ K♦')]);
  assert.equal(normal.usadas, 5);
  assert.ok(normal.mesa.every(jogoVale));
});

test('robô normal pega carta que sobra na mesa para fechar jogo com a mão', () => {
  // a mesa pode ceder o 7♠ (ponta da sequência de 4); a mão tem 7♥ 7♦
  const seq = cs('4♠ 5♠ 6♠ 7♠');
  const plano = planejaJogada([seq], cs('7♥ 7♦ K♣'));
  assert.equal(plano.usadas, 2);
  assert.ok(plano.mesa.every(jogoVale));
  const s = montada([cs('7♥ 7♦ K♣'), cs('2♣ 3♣')], [seq]);
  const acao = botNextAction(s, 'p0');
  assert.equal(acao.a, 'jogar');
  applyAction(s, 'p0', acao);
  assert.deepEqual(ids(s.players[0].hand).length, 1);
  // sem jogada, o robô compra
  const t = montada([cs('2♣ 9♦'), cs('3♣')], []);
  assert.deepEqual(botNextAction(t, 'p0'), { a: 'comprar' });
});

test('partidas inteiras de robôs terminam, e o motor nunca recusa o robô', () => {
  for (const nivel of ['facil', 'normal']) {
    for (let n = 2; n <= 6; n++) {
      for (let seed = 1; seed <= 6; seed++) {
        const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
        const s = createGame(players, { rnd: mulberry32(seed * 31 + n), nivelRobos: nivel });
        startRound(s, 0);
        let lances = 0;
        while (s.phase === 'play') {
          const quem = s.players[s.turn].id;
          const acao = botNextAction(s, quem);
          applyAction(s, quem, acao, 0);   // se o motor recusar, o teste quebra aqui
          for (const j of s.mesa) assert.ok(jogoVale(j.cards));
          assert.ok(++lances < 2000, 'partida não acabou');
        }
        assert.equal(s.phase, 'roundEnd');
        const total = s.deck.length + s.players.reduce((q, p) => q + p.hand.length, 0)
          + s.mesa.reduce((q, j) => q + j.cards.length, 0);
        assert.equal(total, 104, 'carta sumiu ou duplicou');
      }
    }
  }
});
