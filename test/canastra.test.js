import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startRound, applyAction, actNextRound, viewFor, botNextAction,
  analisaJogo, jogoVale, valorDaCarta, valorNaAbertura, minimoDaAbertura, lixoTrancado,
  REGRAS, META,
} from '../shared/canastra.js';
import { mulberry32 } from '../shared/engine.js';

const SU = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RK = { A: 1, J: 11, Q: 12, K: 13 };
let nextId = 1000;
// c('7♥'), c('10♣'), c('A♠'), c('JK') = joker
const c = (txt) => {
  if (txt === 'JK') return { id: nextId++, rank: 0, suit: -1, joker: true };
  const suit = SU[txt.slice(-1)];
  const r = txt.slice(0, -1);
  return { id: nextId++, rank: RK[r] ?? Number(r), suit };
};
const cs = (txt) => txt.split(' ').map(c);
const ids = (cards) => cards.map((x) => x.id);
const conv = (txt, o) => analisaJogo(cs(txt), 'convencional', o);
const do3 = (txt, o) => analisaJogo(cs(txt), 'do3', o);

function mesa(n, { variante = 'convencional', seed = 7, nivelRobos = 'normal', meta } = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
  return createGame(players, { rnd: mulberry32(seed), variante, nivelRobos, meta });
}

// Mesa com mãos e jogos montados à mão, na vez de `turn`, na fase `phase`.
function montada(maos, { variante = 'convencional', jogos = [[], []], turn = 0, phase = 'play', lixo = [], deck } = {}) {
  const s = mesa(maos.length, { variante });
  startRound(s);
  s.players.forEach((p, i) => { p.hand = maos[i]; });
  let id = 1;
  s.lados.forEach((l, i) => { l.jogos = (jogos[i] || []).map((cards) => ({ id: id++, cards: analisaJogo(cards, variante).cards })); l.tresVermelhos = []; });
  s.proximoJogo = id;
  s.lixo = lixo;
  if (deck) s.deck = deck;
  s.turn = turn;
  s.phase = phase;
  return s;
}

test('sequência: mesmo naipe, Ás embaixo e em cima, até um coringa', () => {
  assert.ok(conv('A♠ 2♠ 3♠').ok);
  assert.ok(conv('Q♥ K♥ A♥').ok);
  assert.ok(conv('5♦ 3♦ 4♦ 6♦').ok);
  assert.ok(conv('5♦ JK 7♦').ok);                  // o joker no buraco
  assert.ok(conv('5♦ 6♦ 2♣').ok);                  // o 2 de outro naipe é coringa
  assert.equal(conv('5♦ 6♦ 2♣').coringas, 1);
  assert.match(conv('5♦ JK 7♦ 2♣').motivo, /1 coringa/);
  assert.match(conv('3♠ 5♠ 6♠').motivo, /Falta o 4♠/);
  assert.match(conv('5♠ 6♥ 7♠').motivo, /Misturou/);
  // o Ás de baixo e o de cima: a de mil tem 14 cartas
  assert.ok(conv('A♣ 2♣ 3♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣ A♣').ok);
  // mostra na ordem: Q K A, com o Ás no fim
  assert.deepEqual(conv('A♥ Q♥ K♥').cards.map((x) => x.rank), [12, 13, 1]);
});

test('o 2 do naipe na casa dele é carta normal; fora dela, é coringa', () => {
  const limpa = conv('A♠ 2♠ 3♠ 4♠');
  assert.ok(limpa.ok);
  assert.equal(limpa.coringas, 0);
  // 2♠ no lugar do 3: é coringa
  const suja = conv('2♠ 4♠ 5♠');
  assert.ok(suja.ok);
  assert.equal(suja.coringas, 1);
  // natural + mais um coringa: cabe (o natural não conta)
  assert.ok(conv('A♠ 2♠ JK 4♠').ok);
  // a suja vira limpa quando chega a carta que o 2 cobria
  assert.equal(conv('2♠ 4♠ 5♠ 3♠').coringas, 0);
});

test('trinca: nasce com 3 naipes; depois entra qualquer carta do valor e 1 coringa', () => {
  assert.ok(conv('7♠ 7♥ 7♦', { formacao: true }).ok);
  assert.match(conv('7♠ 7♠ 7♥', { formacao: true }).motivo, /3 naipes/);
  assert.ok(!conv('7♠ 7♥ JK', { formacao: true }).ok);
  // já na mesa: repete naipe e aceita coringa
  assert.ok(conv('7♠ 7♥ 7♦ 7♠ JK').ok);
  assert.match(conv('7♠ 7♥ 7♦ JK 2♣').motivo, /1 coringa/);
  assert.ok(!conv('2♠ 2♥ 2♦').ok);                 // trinca de coringa não existe
});

test('canastra: limpa, suja, de 500 e de mil', () => {
  assert.equal(conv('4♥ 5♥ 6♥ 7♥ 8♥ 9♥ 10♥').canastra, 'limpa');
  assert.equal(conv('4♥ 5♥ 6♥ JK 8♥ 9♥ 10♥').canastra, 'suja');
  assert.equal(conv('7♠ 7♥ 7♦ 7♣ 7♠ 7♥ 7♦').canastra, 'limpa');
  assert.equal(conv('A♣ 2♣ 3♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣').canastra, '500');
  assert.equal(conv('A♣ 2♣ 3♣ 4♣ 5♣ JK 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣').canastra, '500');
  assert.equal(conv('A♣ 2♣ 3♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣ A♣').canastra, 'mil');
  assert.equal(conv('A♣ 2♣ 3♣ 4♣ 5♣ JK 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣ A♣').canastra, '500');
  assert.equal(conv('4♥ 5♥ 6♥ 7♥ 8♥ 9♥').canastra, null);
});

test('do 3: o 3 não entra em jogo e a sequência pula do 2 para o 4', () => {
  assert.match(do3('3♠ 4♠ 5♠').motivo, /3 não entra/);
  assert.match(do3('3♠ 3♥ 3♦', { formacao: true }).motivo, /3 não entra/);
  assert.ok(do3('A♠ 2♠ 4♠').ok);
  assert.equal(do3('A♠ 2♠ 4♠').coringas, 0);
  assert.ok(!conv('A♠ 2♠ 4♠').ok);                 // na convencional falta o 3
  // na do 3 não tem a de 500: Ás ao K (12 cartas, sem o 3) é limpa; Ás ao Ás é a de mil
  assert.equal(do3('A♣ 2♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣').canastra, 'limpa');
  assert.equal(do3('A♣ 2♣ 4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣ J♣ Q♣ K♣ A♣').canastra, 'mil');
});

test('do 3: o joker não suja a canastra; o 2 suja', () => {
  const comJoker = do3('4♥ 5♥ 6♥ JK 8♥ 9♥ 10♥');
  assert.equal(comJoker.canastra, 'limpa');
  assert.equal(comJoker.coringas, 1);
  assert.equal(do3('4♥ 5♥ 6♥ 2♣ 8♥ 9♥ 10♥').canastra, 'suja');
  assert.equal(do3('7♠ 7♥ 7♦ 7♣ 7♠ 7♥ JK').canastra, 'limpa');
  assert.equal(do3('7♠ 7♥ 7♦ 7♣ 7♠ 7♥ 2♦').canastra, 'suja');
  // na convencional, qualquer coringa suja
  assert.equal(conv('7♠ 7♥ 7♦ 7♣ 7♠ 7♥ JK').canastra, 'suja');
});

test('do 3: a trinca nasce com um coringa (dois ases de naipes diferentes e um 2)', () => {
  assert.ok(do3('A♠ A♥ 2♦', { formacao: true }).ok);
  assert.ok(do3('A♠ A♥ JK', { formacao: true }).ok);
  assert.match(do3('A♠ A♠ 2♦', { formacao: true }).motivo, /naipes diferentes/);
  assert.ok(!conv('A♠ A♥ 2♦', { formacao: true }).ok);
});

test('do 3: valores das cartas e abertura de 75 sem o 2 e o joker', () => {
  const v = (t) => cs(t).map((x) => valorDaCarta(x, 'do3'));
  assert.deepEqual(v('3♠ 4♥ 7♥ 8♦ K♣ 2♠ A♥'), [0, 5, 5, 10, 10, 20, 20]);
  assert.equal(valorDaCarta(c('JK'), 'do3'), 50);
  assert.equal(valorNaAbertura(c('JK'), 'do3'), 0);
  assert.equal(valorNaAbertura(c('2♠'), 'do3'), 0);
  assert.equal(valorNaAbertura(c('A♠'), 'do3'), 20);
  const s = mesa(2, { variante: 'do3' });
  assert.equal(minimoDaAbertura(s, 0), 75);
  s.lados[0].pontos = 2500; assert.equal(minimoDaAbertura(s, 0), 75);
});

test('valores das cartas e mínimo da abertura pelo placar', () => {
  assert.deepEqual(cs('3♠ 7♥ 8♦ K♣ 2♠ A♥').map((x) => valorDaCarta(x)), [5, 5, 10, 10, 10, 15]);
  assert.equal(valorDaCarta(c('JK')), 20);
  const s = mesa(2);
  assert.equal(minimoDaAbertura(s, 0), 50);
  s.lados[0].pontos = -200; assert.equal(minimoDaAbertura(s, 0), 50);
  s.lados[0].pontos = 1495; assert.equal(minimoDaAbertura(s, 0), 50);
  s.lados[0].pontos = 1500; assert.equal(minimoDaAbertura(s, 0), 90);
  s.lados[0].pontos = 2995; assert.equal(minimoDaAbertura(s, 0), 90);
});

test('distribuição: 11 na mão e 11 no morto; 2 baralhos no 1v1, 3 no 2v2', () => {
  const a = mesa(2); startRound(a);
  assert.equal(a.players[0].hand.length, 11);
  assert.equal(a.players[0].morto.length, 11);
  assert.equal(a.deck.length, 108 - 44);
  const b = mesa(4); startRound(b);
  assert.equal(b.deck.length, 162 - 88);
  assert.deepEqual(b.players.map((p) => p.lado), [0, 1, 0, 1]);
  assert.throws(() => mesa(3), /2 \(mano a mano\) ou de 4/);
});

test('do 3: 15 cartas, sem morto, 2 baralhos também no 2v2', () => {
  for (const [n, monte] of [[2, 108 - 30], [4, 108 - 60]]) {
    const s = mesa(n, { variante: 'do3', seed: 11 });
    startRound(s);
    const tres = s.lados.reduce((t, l) => t + l.tresVermelhos.length, 0);
    assert.ok(s.players.every((p) => p.hand.length === 15 && !p.morto.length && p.pegouMorto));
    assert.equal(s.deck.length, monte - tres);
    assert.equal(viewFor(s, 'p0').semMorto, true);
  }
});

test('do 3: o 3 vermelho vai para a mesa na hora e quem recebeu compra outra', () => {
  const s = mesa(2, { variante: 'do3', seed: 3 });
  startRound(s);
  for (const p of s.players) {
    assert.ok(!p.hand.some((x) => x.rank === 3 && (x.suit === 1 || x.suit === 2)));
    assert.equal(p.hand.length, REGRAS.do3.cartasNaMao);
  }
  // compra um 3 vermelho: baixa e repõe
  const t = montada([cs('5♠ 6♠'), cs('9♣')], { variante: 'do3', phase: 'draw', deck: cs('8♦ 3♥') });
  const ev = applyAction(t, 'p0', { a: 'comprar' });
  assert.ok(ev.some((e) => e.e === 'tresVermelho'));
  assert.equal(t.lados[0].tresVermelhos.length, 1);
  assert.deepEqual(t.players[0].hand.map((x) => x.rank).sort((a, b) => a - b), [5, 6, 8]);
  // o 3 vermelho foi a última carta do monte: não há o que repor, a rodada fecha
  const u = montada([cs('5♠'), cs('9♣')], { variante: 'do3', phase: 'draw', deck: cs('3♦') });
  const fim = applyAction(u, 'p0', { a: 'comprar' });
  assert.ok(fim.some((e) => e.e === 'semMonte'));
  assert.equal(u.phase, 'roundEnd');
  assert.equal(u.lastRound.motivo, 'monte');
});

test('abertura: precisa somar o mínimo de uma vez', () => {
  const s = montada([cs('4♠ 5♠ 6♠ 9♥ 9♦ 9♣ K♠ K♥ K♦ 8♣'), cs('7♣')]);
  // 4-5-6 = 15: não abre
  assert.throws(() => applyAction(s, 'p0', { a: 'baixar', jogos: [ids(s.players[0].hand.slice(0, 3))] }), /50 pontos/);
  // 4-5-6 + 9-9-9 + K-K-K = 15 + 30 + 30 = 75: abre
  const h = s.players[0].hand;
  applyAction(s, 'p0', { a: 'baixar', jogos: [ids(h.slice(0, 3)), ids(h.slice(3, 6)), ids(h.slice(6, 9))] });
  assert.equal(s.lados[0].jogos.length, 3);
  // aberto, qualquer jogo vale
  s.players[0].hand.push(...cs('7♠'));
  const sete = s.players[0].hand.find((x) => x.rank === 7);
  applyAction(s, 'p0', { a: 'baixar', encaixes: [{ jogo: s.lados[0].jogos[0].id, ids: [sete.id] }] });
  assert.equal(s.lados[0].jogos[0].cards.length, 4);
});

test('o lixo: leva o bolo inteiro, mas a carta de cima tem que ir para um jogo', () => {
  const lixo = cs('2♥ 9♦ 8♠');
  const s = montada([cs('6♠ 7♠ K♣ K♥'), cs('4♦')], { phase: 'draw', lixo, jogos: [[cs('Q♣ Q♥ Q♦')], []] });
  const [seis, sete] = s.players[0].hand;
  assert.throws(() => applyAction(s, 'p0', { a: 'pegarLixo', jogos: [[seis.id, sete.id]] }), /Falta|carta de cima/);
  applyAction(s, 'p0', { a: 'pegarLixo', jogos: [[seis.id, sete.id, lixo[2].id]] });
  assert.equal(s.lixo.length, 0);
  assert.equal(s.phase, 'play');
  // ficou K♣ K♥ + o resto do lixo (2♥ 9♦)
  assert.equal(s.players[0].hand.length, 4);
});

test('do 3: o 3 preto, o 2 e o joker descartados trancam o lixo', () => {
  for (const t of ['3♠', '2♦', 'JK']) {
    const s = montada([cs(`${t} 9♥ 9♦`), cs('9♠ 9♣')], { variante: 'do3' });
    applyAction(s, 'p0', { a: 'descartar', id: s.players[0].hand[0].id });
    assert.ok(lixoTrancado(s), t);
    assert.throws(() => applyAction(s, 'p1', { a: 'pegarLixo', jogos: [] }), /trancado/);
  }
  const conv2 = montada([cs('2♦ 9♥ 9♦'), cs('9♠ 9♣')]);
  applyAction(conv2, 'p0', { a: 'descartar', id: conv2.players[0].hand[0].id });
  assert.ok(!lixoTrancado(conv2));
});

test('morto: esvaziou baixando segue jogando; no descarte, joga na próxima', () => {
  const s = montada([cs('8♥ 9♥ 10♥'), cs('4♦ 5♣')], { jogos: [[cs('K♠ K♥ K♦')], []] });
  applyAction(s, 'p0', { a: 'baixar', jogos: [ids(s.players[0].hand)] });
  assert.ok(s.players[0].pegouMorto);
  assert.equal(s.players[0].hand.length, REGRAS.convencional.cartasNoMorto);
  assert.equal(s.phase, 'play');
  assert.equal(s.turn, 0);

  const t = montada([cs('8♥'), cs('4♦ 5♣')], { jogos: [[cs('K♠ K♥ K♦')], []] });
  applyAction(t, 'p0', { a: 'descartar', id: t.players[0].hand[0].id });
  assert.ok(t.players[0].pegouMorto);
  assert.equal(t.turn, 1);
});

test('bater: só com o morto pego e canastra limpa no lado', () => {
  const suja = [...cs('4♥ 5♥ 6♥ JK 8♥ 9♥ 10♥')];
  const s = montada([cs('Q♠ Q♥ Q♦'), cs('4♦')], { jogos: [[suja], []] });
  s.players[0].pegouMorto = true;
  assert.throws(() => applyAction(s, 'p0', { a: 'baixar', jogos: [ids(s.players[0].hand)] }), /canastra limpa/);
  const limpa = [...cs('4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣')];
  const t = montada([cs('Q♠ Q♥ Q♦ 6♠'), cs('4♦')], { jogos: [[limpa], []] });
  t.players[0].pegouMorto = true;
  const ev = applyAction(t, 'p0', { a: 'baixar', jogos: [ids(t.players[0].hand.slice(0, 3))] });
  assert.ok(!ev.some((e) => e.e === 'bateu'));
  const fim = applyAction(t, 'p0', { a: 'descartar', id: t.players[0].hand[0].id });
  assert.ok(fim.some((e) => e.e === 'bateu'));
  assert.equal(t.phase, 'roundEnd');
  const conta = t.lastRound.lados[0];
  // mesa: 7 de paus (5×4 + 10×3 = 50) + Q Q Q (30) = 80; limpa 300; batida 100
  assert.equal(conta.mesa, 80);
  assert.equal(conta.canastras, 300);
  assert.equal(conta.batida, 100);
  // o p1 ficou com o morto na mesa e um 4 na mão
  assert.equal(t.lastRound.lados[1].mortos, -100);
  assert.equal(t.lastRound.lados[1].mao, -5);
});

test('sem canastra limpa e com o morto pego, a baixada deixa 2 cartas', () => {
  const s = montada([cs('Q♠ Q♥ Q♦ 6♠'), cs('4♦')], { jogos: [[cs('K♠ K♥ K♦')], []] });
  s.players[0].pegouMorto = true;
  assert.throws(() => applyAction(s, 'p0', { a: 'baixar', jogos: [ids(s.players[0].hand.slice(0, 3))] }), /2 cartas/);
  // com 4 na mão, descartar uma pode
  applyAction(s, 'p0', { a: 'descartar', id: s.players[0].hand[3].id });
  assert.equal(s.players[0].hand.length, 3);
});

test('do 3: abrir pede 75 sem contar o 2 e o joker', () => {
  const s = montada([cs('A♠ A♥ 2♦ K♠ K♥ K♦ 8♠ 8♥ 8♦ 5♣ 9♣'), cs('4♦')], { variante: 'do3' });
  const h = s.players[0].hand;
  // A A 2 (40, o 2 não conta) + K K K (30) = 70: não abre
  assert.throws(() => applyAction(s, 'p0', { a: 'baixar', jogos: [ids(h.slice(0, 3)), ids(h.slice(3, 6))] }), /75 pontos.*70.*coringa não conta/);
  // + 8 8 8 (30) = 100: abre
  applyAction(s, 'p0', { a: 'baixar', jogos: [ids(h.slice(0, 3)), ids(h.slice(3, 6)), ids(h.slice(6, 9))] });
  assert.equal(s.lados[0].jogos.length, 3);
});

test('do 3: o 2 na casa dele é carta normal — não suja e conta para abrir', () => {
  // A♠ 2♠ 4♠ 5♠ 6♠ 7♠ 8♠: o 2 na casa dele, canastra limpa
  assert.equal(do3('A♠ 2♠ 4♠ 5♠ 6♠ 7♠ 8♠').canastra, 'limpa');
  // A-2-4♠ = 20 + 20 + 5 = 45; K K K = 30 → 75: abre
  const s = montada([cs('A♠ 2♠ 4♠ K♠ K♥ K♦ 9♣ 9♦'), cs('4♦')], { variante: 'do3' });
  const h = s.players[0].hand;
  applyAction(s, 'p0', { a: 'baixar', jogos: [ids(h.slice(0, 3)), ids(h.slice(3, 6))] });
  assert.equal(s.lados[0].jogos.length, 2);
  // na do 3, 2-4-5♠ também é natural: depois do 2 vem o 4
  assert.equal(do3('2♠ 4♠ 5♠').coringas, 0);
  // o 2 fazendo papel de coringa (7♠ 8♠ e o 2 no lugar do 9♠) não conta: 5+10+0 + 30 = 45
  const t = montada([cs('7♠ 8♠ 2♠ K♠ K♥ K♦ 9♣ 9♦'), cs('4♦')], { variante: 'do3' });
  const g = t.players[0].hand;
  assert.throws(() => applyAction(t, 'p0', { a: 'baixar', jogos: [ids(g.slice(0, 3)), ids(g.slice(3, 6))] }), /somam 45/);
});

test('do 3: só pega o lixo quem já abriu, e a carta de cima forma jogo novo', () => {
  const lixo = cs('4♦ 9♠');
  const s = montada([cs('9♥ 9♦ 6♣ 7♣'), cs('4♣')], { variante: 'do3', phase: 'draw', lixo: [...lixo] });
  const [nove1, nove2] = s.players[0].hand;
  assert.throws(() => applyAction(s, 'p0', { a: 'pegarLixo', jogos: [[nove1.id, nove2.id, lixo[1].id]] }), /já abriu/);
  // aberto (um jogo de noves na mesa): encaixar a de cima não vale
  const t = montada([cs('9♥ 9♦ 6♣ 7♣'), cs('4♣')], { variante: 'do3', phase: 'draw', lixo: [...lixo], jogos: [[cs('9♣ 9♥ 9♦')], []] });
  assert.throws(() => applyAction(t, 'p0', { a: 'pegarLixo', encaixes: [{ jogo: t.lados[0].jogos[0].id, ids: [lixo[1].id] }] }), /jogo novo/);
  const [a, b] = t.players[0].hand;
  applyAction(t, 'p0', { a: 'pegarLixo', jogos: [[a.id, b.id, lixo[1].id]] });
  assert.equal(t.lados[0].jogos.length, 2);
  assert.equal(t.players[0].hand.length, 3);   // 6♣ 7♣ e o 4♦ que estava embaixo
});

test('do 3: sem morto, esvaziar a mão é bater, e só com canastra limpa', () => {
  const comJoker = cs('4♥ 5♥ 6♥ JK 8♥ 9♥ 10♥');   // limpa na do 3
  const s = montada([cs('Q♠ Q♥ Q♦'), cs('4♦')], { variante: 'do3', jogos: [[comJoker], []] });
  const ev = applyAction(s, 'p0', { a: 'baixar', jogos: [ids(s.players[0].hand)] });
  assert.ok(ev.some((e) => e.e === 'bateu'));
  assert.ok(!ev.some((e) => e.e === 'morto'));
  const conta = s.lastRound.lados;
  assert.equal(conta[0].batida, 200);
  // mesa: 4♥..10♥ sem o joker = 5×3 + 10×3 = 45, joker 50, Q Q Q 30 → 125; limpa 500; batida 200
  assert.equal(conta[0].total, 125 + 500 + 200);
  // o outro lado não tinha canastra limpa: −500 cravado
  assert.equal(conta[1].cravado, true);
  assert.equal(conta[1].total, -500);

  const comDois = cs('4♥ 5♥ 6♥ 2♣ 8♥ 9♥ 10♥');    // suja
  const t = montada([cs('Q♠ Q♥ Q♦'), cs('4♦')], { variante: 'do3', jogos: [[comDois], []] });
  assert.throws(() => applyAction(t, 'p0', { a: 'baixar', jogos: [ids(t.players[0].hand)] }), /canastra limpa/);
});

test('do 3: monte acabou, quem não tem canastra limpa fica com −500; quem tem conta normal', () => {
  const limpa = cs('7♠ 7♥ 7♦ 7♣ 7♠ 7♥ 7♦');
  const s = montada([cs('8♥ K♠'), cs('4♦')], { variante: 'do3', phase: 'draw', deck: [], jogos: [[limpa], [cs('9♠ 9♥ 9♦')]] });
  s.lados[0].tresVermelhos = cs('3♥ 3♦');
  applyAction(s, 'p0', { a: 'comprar' });
  const [nos, eles] = s.lastRound.lados;
  assert.equal(nos.cravado, false);
  // 7 setes = 35; limpa 500; dois 3 vermelhos 200; mão 8♥ K♠ = −20
  assert.equal(nos.total, 35 + 500 + 200 - 20);
  assert.equal(eles.cravado, true);
  assert.equal(eles.total, -500);
});

test('2v2: os dois da dupla jogam nos mesmos jogos', () => {
  const s = montada([cs('5♠'), cs('9♣ 9♦'), cs('8♥'), cs('4♦')], { jogos: [[cs('6♥ 7♥ 9♥')], []] });
  assert.throws(() => applyAction(s, 'p0', { a: 'baixar', encaixes: [{ jogo: 99, ids: [s.players[0].hand[0].id] }] }), /seu lado/);
  s.lados[0].jogos[0].cards = analisaJogo(cs('6♥ 7♥ 8♥'), 'convencional').cards;
  s.turn = 2;
  const oito = s.players[2].hand[0];
  s.players[2].hand.push(...cs('10♣ J♣'));
  assert.throws(() => applyAction(s, 'p2', { a: 'baixar', encaixes: [{ jogo: s.lados[0].jogos[0].id, ids: [oito.id] }] }), /repetida/);
  const v = viewFor(s, 'p2');
  assert.equal(v.you.lado, 0);
  assert.deepEqual(v.lados[0].jogadores, ['p0', 'p2']);
});

test('fim de partida: passa da meta e não empata no topo', () => {
  const s = montada([cs('8♥'), cs('4♦')], { jogos: [[cs('4♣ 5♣ 6♣ 7♣ 8♣ 9♣ 10♣')], []] });
  s.lados[0].pontos = META - 100;
  s.players[0].pegouMorto = true;
  const ev = applyAction(s, 'p0', { a: 'descartar', id: s.players[0].hand[0].id });
  assert.ok(ev.some((e) => e.e === 'gameEnd'));
  assert.equal(s.phase, 'gameEnd');
  assert.equal(s.vencedor, 0);
  assert.deepEqual(actNextRound(s), []);
});

test('monte vazio: quem precisa comprar fecha a rodada sem batida', () => {
  const s = montada([cs('8♥ 9♥'), cs('4♦')], { phase: 'draw', deck: [] });
  const ev = applyAction(s, 'p0', { a: 'comprar' });
  assert.ok(ev.some((e) => e.e === 'semMonte'));
  assert.equal(s.lastRound.motivo, 'monte');
  assert.equal(s.lastRound.lados[0].batida, 0);
  assert.equal(s.lastRound.lados[0].mortos, -100);
});

test('fora da vez e fora da fase', () => {
  const s = montada([cs('8♥ 9♥'), cs('4♦')], { phase: 'draw' });
  assert.throws(() => applyAction(s, 'p1', { a: 'comprar' }), /sua vez/);
  assert.throws(() => applyAction(s, 'p0', { a: 'descartar', id: s.players[0].hand[0].id }), /Primeiro compre/);
  applyAction(s, 'p0', { a: 'comprar' });
  assert.throws(() => applyAction(s, 'p0', { a: 'comprar' }), /já comprou/);
});

test('a visão não mostra a mão nem o morto dos outros', () => {
  const s = mesa(4); startRound(s);
  const v = viewFor(s, 'p1');
  assert.equal(v.you.hand.length, REGRAS.convencional.cartasNaMao);
  const txt = JSON.stringify(v);
  const alheia = s.players[0].hand[0];
  assert.ok(!v.players.some((p) => p.hand || p.morto));
  assert.ok(!txt.includes(`"morto"`));
  assert.ok(v.players.every((p) => p.handCount === REGRAS.convencional.cartasNaMao));
  assert.ok(alheia);
});

// Partidas só de robôs: nenhuma jogada recusada, a rodada sempre fecha, as
// cartas nunca somem nem duplicam. Os normais levam a partida até a meta; os
// fáceis jogam algumas rodadas (entre eles a partida demora muito).
const contaCartas = (s) => s.deck.length + s.lixo.length
  + s.players.reduce((t, p) => t + p.hand.length + p.morto.length, 0)
  + s.lados.reduce((t, l) => t + l.tresVermelhos.length + l.jogos.reduce((u, j) => u + j.cards.length, 0), 0);
for (const [variante, n, nivel] of [['convencional', 2, 'normal'], ['do3', 2, 'normal'], ['convencional', 4, 'normal'], ['do3', 4, 'normal'], ['do3', 4, 'facil'], ['convencional', 2, 'facil']]) {
  test(`robôs jogam: ${variante} ${n === 4 ? '2v2' : '1v1'} ${nivel}`, () => {
    let batidas = 0, rodadas = 0, pegouLixo = 0, canastras = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const s = mesa(n, { variante, seed, nivelRobos: nivel });
      startRound(s);
      const total = contaCartas(s);
      let passos = 0;
      const ate = nivel === 'normal' ? 40 : 6;
      for (let r0 = s.round; s.phase !== 'gameEnd' && s.round - r0 < ate;) {
        if (s.phase === 'roundEnd') {
          rodadas++;
          if (s.lastRound.motivo === 'bateu') batidas++;
          actNextRound(s);
          passos = 0;
          continue;
        }
        assert.ok(++passos < 4000, `rodada ${s.round} da partida ${seed} não fechou`);
        const quem = s.players[s.turn].id;
        const acao = botNextAction(s, quem);
        const ev = applyAction(s, quem, acao);
        if (acao.a === 'pegarLixo') pegouLixo++;
        canastras += ev.filter((e) => e.e === 'canastra').length;
        if (s.phase === 'draw' || s.phase === 'play') assert.equal(contaCartas(s), total, 'carta sumiu ou duplicou');
      }
      assert.ok(nivel !== 'normal' || s.phase === 'gameEnd');
      if (s.phase === 'gameEnd' && s.lastRound.motivo === 'bateu') batidas++;
    }
    assert.ok(rodadas > 0);
    assert.ok(canastras > 0, 'nunca fez canastra');
    if (nivel === 'normal') {
      assert.ok(batidas > 0, 'nenhuma batida');
      assert.ok(pegouLixo > 0, 'nunca pegou o lixo');
    }
  });
}
