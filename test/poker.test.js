import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startRound, applyAction, viewFor, botNextAction, playerById,
  avaliaCinco, melhorMao, compara, emFichas, montaPotes, poteDe, pausaDoRobo,
  FICHAS_INICIAIS, MAOS_POR_NIVEL, BLINDS, equidade,
} from '../shared/poker.js';
import { mulberry32 } from '../shared/engine.js';

const SU = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
const RK = { A: 1, J: 11, Q: 12, K: 13 };
// O id é o mesmo do baralho do motor (naipe × 13 + valor): o robô depende disso.
const c = (txt) => {
  const suit = SU[txt.slice(-1)];
  const r = txt.slice(0, -1);
  const rank = RK[r] ?? Number(r);
  return { id: suit * 13 + rank, rank, suit };
};
const cs = (s) => s.split(' ').map(c);

function mesa(n, opts = {}) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isBot: true }));
  return createGame(players, { rnd: mulberry32(opts.seed ?? 7), ...opts });
}
const total = (s) => s.players.reduce((t, p) => t + p.fichas, 0) + poteDe(s);
const vez = (s) => s.players[s.turn].id;
const age = (s, a) => applyAction(s, vez(s), a);

// Troca as mãos e o que vai abrir na mesa (queima, flop, queima, turn, queima, river).
function fixa(s, maos, board) {
  s.players.forEach((p, i) => { if (maos[i]) p.hand = cs(maos[i]); });
  const b = cs(board);
  const lixo = { id: 99, rank: 2, suit: 0 };
  s.deck = [lixo, b[4], lixo, b[3], lixo, b[2], b[1], b[0], lixo];
}

test('ordem das mãos: carta alta < par < … < straight flush', () => {
  const maos = [
    'A♠ K♦ 9♣ 7♥ 3♠', '2♠ 2♦ 9♣ 7♥ 3♠', '2♠ 2♦ 9♣ 9♥ 3♠', '2♠ 2♦ 2♣ 7♥ 3♠',
    '5♠ 6♦ 7♣ 8♥ 9♠', '2♥ 6♥ 9♥ J♥ K♥', '2♠ 2♦ 2♣ 7♥ 7♠', '2♠ 2♦ 2♣ 2♥ 7♠', '5♣ 6♣ 7♣ 8♣ 9♣',
  ].map((m) => avaliaCinco(cs(m)));
  for (let i = 1; i < maos.length; i++) assert.ok(compara(maos[i], maos[i - 1]) > 0, `mão ${i} deveria vencer a ${i - 1}`);
});

test('A-2-3-4-5 é sequência até o 5, e perde para 2-3-4-5-6', () => {
  const roda = avaliaCinco(cs('A♠ 2♦ 3♣ 4♥ 5♠'));
  assert.deepEqual(roda, [4, 5]);
  assert.ok(compara(avaliaCinco(cs('2♠ 3♦ 4♣ 5♥ 6♠')), roda) > 0);
  assert.equal(avaliaCinco(cs('Q♠ K♦ A♣ 2♥ 3♠'))[0], 0, 'não dá a volta pelo Ás');
});

test('desempate pelo kicker e naipe não conta', () => {
  assert.ok(compara(avaliaCinco(cs('K♠ K♦ A♣ 7♥ 3♠')), avaliaCinco(cs('K♥ K♣ Q♣ J♥ 9♠'))) > 0);
  assert.equal(compara(avaliaCinco(cs('A♠ K♠ 9♠ 7♠ 3♠')), avaliaCinco(cs('A♥ K♥ 9♥ 7♥ 3♥'))), 0);
});

test('melhor mão de 7 e o nome em português', () => {
  let m = melhorMao(cs('A♠ K♠ Q♠ J♠ 10♠ 2♦ 2♣'));
  assert.equal(m.descricao, 'Royal flush');
  m = melhorMao(cs('9♥ 9♦ 9♣ 4♠ 4♥ 4♦ K♣'));
  assert.equal(m.descricao, 'Full house: 9 com 4');
  m = melhorMao(cs('Q♥ Q♦ 7♣ 7♠ 2♥ 2♦ K♣'));
  assert.equal(m.descricao, 'Dois pares: Damas e 7');
  assert.equal(m.cards.length, 5);
  assert.equal(melhorMao(cs('A♠ 2♦ 3♣ 4♥ 5♠ 9♦')).descricao, 'Sequência até o 5');
  assert.equal(melhorMao(cs('A♠ 2♦ 9♣ J♥ 5♠ 8♦ 4♣')).descricao, 'Carta alta: Ás');
});

test('fichas: a pilha sai em cores, da maior para a menor, e soma o valor certo', () => {
  assert.deepEqual(emFichas(1000).map((f) => [f.valor, f.n]), [[500, 1], [100, 4], [25, 3], [5, 5]]);
  assert.deepEqual(emFichas(5000).map((f) => [f.valor, f.n]), [[1000, 3], [500, 3], [100, 4], [25, 3], [5, 5]]);
  assert.deepEqual(emFichas(20).map((f) => [f.cor, f.n]), [['vermelha', 4]]);
  assert.deepEqual(emFichas(0), []);
  for (const v of [5, 15, 30, 95, 340, 985, 1630, 7995]) {
    assert.equal(emFichas(v).reduce((s, f) => s + f.valor * f.n, 0), v, `pilha de ${v}`);
  }
});

test('começo da mão: 2 cartas para cada um, blinds postos, fala quem está depois do big blind', () => {
  const s = mesa(4);
  const ev = startRound(s);
  assert.ok(s.players.every((p) => p.hand.length === 2));
  const [sb, bb] = BLINDS[0];
  assert.equal(s.players[s.sb].aposta, sb);
  assert.equal(s.players[s.bb].aposta, bb);
  assert.equal(s.sb, (s.botao + 1) % 4);
  assert.equal(s.bb, (s.botao + 2) % 4);
  assert.equal(s.turn, (s.botao + 3) % 4, 'UTG abre a fala');
  assert.equal(ev[0].e, 'roundStart');
  assert.equal(total(s), 4 * FICHAS_INICIAIS);
});

test('mano a mano: o botão é o small blind, fala primeiro antes do flop e por último depois', () => {
  const s = mesa(2);
  startRound(s);
  assert.equal(s.sb, s.botao);
  assert.equal(s.turn, s.botao);
  age(s, { a: 'pagar' });
  assert.equal(s.turn, s.bb, 'o big blind ainda tem a opção');
  age(s, { a: 'mesa' });
  assert.equal(s.etapa, 'flop');
  assert.equal(s.board.length, 3);
  assert.equal(s.turn, s.bb, 'depois do flop fala o big blind');
});

test('todos pagam, o big blind dá mesa: a rua fecha e abre o flop', () => {
  const s = mesa(3);
  startRound(s);
  age(s, { a: 'pagar' });    // botão
  age(s, { a: 'pagar' });    // small blind completa
  assert.equal(s.players[s.turn].id, s.players[s.bb].id);
  assert.throws(() => age(s, { a: 'pagar' }), /mesa/);
  age(s, { a: 'mesa' });
  assert.equal(s.etapa, 'flop');
  assert.equal(poteDe(s), 60);
  assert.ok(s.players.every((p) => p.aposta === 0));
});

test('aumento mínimo, múltiplo da menor ficha, e quem não tem a vez não age', () => {
  const s = mesa(3);
  startRound(s);
  const outro = s.players.find((p) => p.id !== vez(s)).id;
  assert.throws(() => applyAction(s, outro, { a: 'pagar' }), /vez/);
  assert.throws(() => age(s, { a: 'aumentar', para: 30 }), /mínimo é 40/);
  assert.throws(() => age(s, { a: 'aumentar', para: 42 }), /múltiplos de 5/);
  assert.throws(() => age(s, { a: 'aumentar', para: 5000 }), /fichas/);
  age(s, { a: 'aumentar', para: 60 });   // aumento de 40
  assert.equal(s.apostaAtual, 60);
  assert.throws(() => age(s, { a: 'aumentar', para: 90 }), /mínimo é 100/);
  age(s, { a: 'aumentar', para: 100 });
  assert.equal(s.ultimoAumento, 40);
});

test('all-in que não completa o aumento não reabre a aposta para quem já falou', () => {
  const s = mesa(3);
  startRound(s);
  const [a, b, cc] = [s.turn, (s.turn + 1) % 3, (s.turn + 2) % 3].map((i) => s.players[i]);
  b.fichas = 140 - b.aposta;   // o small blind só tem 140 no total
  age(s, { a: 'aumentar', para: 100 });          // A: aumento completo de 80
  age(s, { a: 'allin' });                        // B: vai a 140, aumento de 40 (incompleto)
  assert.equal(s.apostaAtual, 140);
  assert.ok(b.allIn);
  // C ainda não tinha falado: pode reaumentar
  assert.equal(vez(s), cc.id);
  assert.ok(viewFor(s, cc.id).you.podeAumentar);
  age(s, { a: 'pagar' });
  // A já falou e só viu 40 a mais: paga ou corre
  assert.equal(vez(s), a.id);
  assert.equal(viewFor(s, a.id).you.podeAumentar, false);
  assert.throws(() => age(s, { a: 'aumentar', para: 300 }), /reabriu/);
  age(s, { a: 'pagar' });
  assert.equal(s.etapa, 'flop');
});

test('todos correm: quem sobrou leva o pote e a mão seguinte já começa, com o botão andando', () => {
  const s = mesa(3);
  startRound(s);
  const botao = s.botao;
  const bb = s.players[s.bb];
  age(s, { a: 'correr' });
  const ev = age(s, { a: 'correr' });
  const fim = ev.find((e) => e.e === 'maoFim');
  assert.ok(fim.semShowdown);
  assert.equal(fim.ganhos[bb.id], 30);
  assert.equal(bb.fichas - (bb === s.players[s.bb] ? bb.aposta : 0) >= FICHAS_INICIAIS, true);
  assert.equal(s.round, 1);
  assert.equal(s.botao, (botao + 1) % 3);
  assert.ok(ev.some((e) => e.e === 'roundStart' && e.round === 1));
  assert.equal(total(s), 3 * FICHAS_INICIAIS);
});

test('showdown: a melhor mão leva, e todos que chegaram mostram', () => {
  const s = mesa(2);
  startRound(s);
  const [x, y] = [s.players[s.botao], s.players[s.bb]];
  fixa(s, s.players.map((p) => (p === x ? 'A♠ A♦' : 'K♠ K♦')), '2♣ 7♥ 9♠ J♦ 4♣');
  age(s, { a: 'pagar' });
  age(s, { a: 'mesa' });
  for (let k = 0; k < 3; k++) { age(s, { a: 'mesa' }); age(s, { a: 'mesa' }); }
  const um = s.ultimaMao;
  assert.equal(um.semShowdown, false);
  assert.equal(um.mostradas.length, 2);
  assert.equal(um.potes[0].vencedores[0], x.id);
  assert.equal(um.potes[0].mao, 'Par de Ases');
  assert.equal(x.fichas + (x.investido || 0), FICHAS_INICIAIS + 20);
  assert.equal(total(s), 2 * FICHAS_INICIAIS);
});

test('potes paralelos: o all-in curto só disputa o que cobriu', () => {
  const s = mesa(3);
  startRound(s);
  // Arruma a mesa: o curto (100) tem a melhor mão, o médio (300) a segunda.
  const [curto, medio, grande] = [s.players[s.turn], s.players[(s.turn + 1) % 3], s.players[(s.turn + 2) % 3]];
  curto.fichas = 100 - curto.aposta;
  medio.fichas = 300 - medio.aposta;
  fixa(s, s.players.map((p) => (p === curto ? 'A♠ A♦' : p === medio ? 'K♠ K♦' : 'Q♠ Q♦')), '2♣ 7♥ 9♠ J♦ 4♣');
  const antes = total(s);
  age(s, { a: 'allin' });                  // curto: 100
  age(s, { a: 'allin' });                  // médio: 300
  age(s, { a: 'pagar' });                  // grande paga 300
  const um = s.ultimaMao;
  assert.equal(um.potes.length, 2);
  assert.deepEqual([um.potes[0].valor, um.potes[0].vencedores], [300, [curto.id]]);
  assert.deepEqual([um.potes[1].valor, um.potes[1].vencedores], [400, [medio.id]]);
  assert.equal(curto.fichas + curto.investido, 300);
  assert.equal(total(s), antes);
  assert.ok(um.corrida, 'a mesa abriu sozinha');
  assert.equal(pausaDoRobo(s), 6000, 'os robôs esperam a corrida acabar na tela');
});

test('pote paralelo de quem correu não é devolução: quem ficou ganhou', () => {
  const s = mesa(3);
  startRound(s);
  const [curto, medio, grande] = [s.players[s.turn], s.players[(s.turn + 1) % 3], s.players[(s.turn + 2) % 3]];
  curto.fichas = 30;
  fixa(s, s.players.map((p) => (p === curto ? 'A♠ A♦' : p === medio ? 'K♠ K♦' : 'Q♠ Q♦')), '2♣ 7♥ 9♠ J♦ 4♣');
  age(s, { a: 'allin' });                      // curto: 30
  age(s, { a: 'aumentar', para: 100 });        // médio
  age(s, { a: 'pagar' });                      // grande
  age(s, { a: 'aumentar', para: 200 });        // médio aposta no flop
  age(s, { a: 'correr' });                     // grande corre
  const um = s.ultimaMao;
  assert.deepEqual(um.potes.map((p) => [p.valor, p.vencedores, p.devolvido]), [[90, [curto.id], false], [340, [medio.id], false]]);
  assert.equal(medio.maos, 1);
  assert.equal(total(s), 3 * FICHAS_INICIAIS - 1000 + 30);
});

test('montaPotes devolve o que ninguém cobriu', () => {
  const s = mesa(2);
  startRound(s);
  s.players[0].investido = 500; s.players[1].investido = 200;
  const potes = montaPotes(s);
  assert.deepEqual(potes.map((p) => [p.valor, p.elegiveis.length]), [[400, 2], [300, 1]]);
});

test('empate divide o pote; a ficha que sobra vai para o primeiro à esquerda do botão', () => {
  const s = mesa(3);
  startRound(s);
  const [a, b, cc] = [s.players[s.turn], s.players[(s.turn + 1) % 3], s.players[(s.turn + 2) % 3]];
  // Mesa dá a sequência a todos; quem corre deixa 15 de blind no pote.
  fixa(s, s.players.map(() => '2♥ 3♦'), '10♠ J♦ Q♣ K♥ A♠');
  age(s, { a: 'pagar' });   // botão (a): 20
  age(s, { a: 'correr' });  // small blind (b) deixa 10
  age(s, { a: 'mesa' });    // big blind (cc)
  for (let k = 0; k < 3; k++) { age(s, { a: 'mesa' }); age(s, { a: 'mesa' }); }
  const pote = s.ultimaMao.potes[0];
  assert.equal(pote.valor, 50);
  assert.equal(pote.vencedores.length, 2);
  // à esquerda do botão vem o big blind (o small blind correu)
  assert.equal(s.ultimaMao.ganhos[cc.id], 25);
  assert.equal(s.ultimaMao.ganhos[a.id], 25);
  assert.equal(total(s), 3 * FICHAS_INICIAIS);
  void b;
});

test('quem zera sai da mesa, e com um só com fichas a partida acaba', () => {
  const s = mesa(2);
  startRound(s);
  const [x, y] = [s.players[s.botao], s.players[s.bb]];
  fixa(s, s.players.map((p) => (p === x ? 'A♠ A♦' : 'K♠ K♦')), '2♣ 7♥ 9♠ J♦ 4♣');
  age(s, { a: 'allin' });
  const ev = age(s, { a: 'pagar' });
  assert.ok(ev.some((e) => e.e === 'etapa' && e.corrida), 'abre a mesa sozinha com todos all-in');
  assert.ok(ev.some((e) => e.e === 'eliminado' && e.p === y.id && e.lugar === 2));
  assert.equal(s.phase, 'gameEnd');
  assert.equal(s.vencedor, x.id);
  assert.equal(x.fichas, 2 * FICHAS_INICIAIS);
  assert.equal(x.lugar, 1);
});

test('os blinds sobem a cada MAOS_POR_NIVEL mãos', () => {
  const s = mesa(2);
  let ev = startRound(s);
  for (let m = 1; m <= MAOS_POR_NIVEL; m++) ev = age(s, { a: 'correr' });
  assert.equal(s.round, MAOS_POR_NIVEL);
  assert.deepEqual(viewFor(s, 'p0').blinds, BLINDS[1]);
  assert.ok(ev.find((e) => e.e === 'roundStart').subiu);
});

test('a visão não mostra a mão dos outros, nem o baralho', () => {
  const s = mesa(3);
  startRound(s);
  const v = viewFor(s, 'p1');
  assert.equal(v.you.hand.length, 2);
  assert.ok(!('hand' in v.players[0]));
  assert.ok(!('deck' in v));
  assert.equal(JSON.stringify(v).includes(JSON.stringify(s.players[0].hand[0])), false);
  assert.equal(v.players[0].handCount, 2);
});

test('robô ausente (gente que caiu) nunca aposta as fichas de ninguém', () => {
  const s = createGame([{ id: 'h', name: 'H' }, { id: 'b', name: 'B', isBot: true }], { rnd: mulberry32(3) });
  startRound(s);
  if (vez(s) !== 'h') age(s, { a: 'aumentar', para: 60 });
  const a = botNextAction(s, 'h');
  assert.ok(['correr', 'mesa'].includes(a.a));
});

test('equidade: par de Ases ganha quase sempre de uma mão aleatória', () => {
  const s = mesa(2, { seed: 11 });
  startRound(s);
  s.players[0].hand = cs('A♠ A♦');
  s.players[1].hand = cs('7♣ 2♥');
  const eq = equidade(s, s.players[0], 400, mulberry32(5));
  assert.ok(eq > 0.78 && eq < 0.92, `equidade ${eq}`);
});

test('a pausa dos robôs: o resultado da mão anterior precisa ser lido', () => {
  const s = mesa(2);
  startRound(s);
  fixa(s, ['A♠ A♦', 'K♠ K♦'], '2♣ 7♥ 9♠ J♦ 4♣');
  age(s, { a: 'pagar' });
  age(s, { a: 'mesa' });
  assert.equal(pausaDoRobo(s), 700, 'flop acabou de abrir');
  for (let k = 0; k < 3; k++) { age(s, { a: 'mesa' }); age(s, { a: 'mesa' }); }
  assert.equal(pausaDoRobo(s), 4500, 'teve showdown');
  age(s, { a: 'pagar' });
  assert.equal(pausaDoRobo(s), 0);
});

for (const [n, nivel, seed] of [[2, 'normal', 1], [4, 'normal', 2], [6, 'facil', 3], [8, 'normal', 4]]) {
  test(`partida inteira de ${n} robôs (${nivel}) chega ao fim sem sumir ficha`, () => {
    const s = mesa(n, { seed, nivelRobos: nivel, maosPorNivel: 2 });
    startRound(s);
    const inicial = total(s);
    let lances = 0;
    while (s.phase === 'play') {
      const id = vez(s);
      const a = botNextAction(s, id);
      assert.ok(a, 'robô sem ação');
      applyAction(s, id, a);
      assert.equal(total(s), inicial);
      for (const p of s.players) assert.ok(p.fichas >= 0 && p.fichas % 5 === 0, `fichas de ${p.id}: ${p.fichas}`);
      assert.ok(++lances < 4000, 'a partida não acaba');
    }
    assert.equal(s.phase, 'gameEnd');
    const lugares = s.players.map((p) => p.lugar).sort((a, b) => a - b);
    assert.deepEqual(lugares, Array.from({ length: n }, (_, i) => i + 1));
    assert.equal(playerById(s, s.vencedor).fichas, inicial);
  });
}
