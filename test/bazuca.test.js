// Bazuca: as regras ditadas pelo dono do jogo (15/10/2026), uma por uma, e
// partidas inteiras só de robôs com o relógio simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from '../shared/bazuca.js';

const T0 = 1_000_000;
const c = (rank, id = 100 + rank) => ({ id, rank, suit: rank ? 0 : -1, ...(rank ? {} : { joker: true }) });

function novo(n = 3, nivel = 'normal') {
  const g = B.createGame(Array.from({ length: n }, (_, k) => ({ id: `p${k}`, name: `P${k}`, isBot: false })), { nivelRobos: nivel });
  let s = 7;
  g.rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return g;
}
// Partida já na vez de p0, com as mãos que o teste quiser.
function montado(maos, { topo = null, deck = null } = {}) {
  const g = novo(maos.length);
  B.startRound(g, T0);
  B.tick(g, T0 + B.ESPIADA_INICIAL_MS);
  g.turn = 0; g.etapa = 'comprar'; g.prazo = T0 + 60000;
  maos.forEach((m, k) => { g.players[k].slots = m.map((r, i) => (r === null ? null : c(r, 1000 + k * 10 + i))); });
  g.descarte = topo === null ? [] : [c(topo, 900)];
  if (deck) g.deck = deck.map((r, i) => c(r, 800 + i));
  return g;
}
const total = (g) => g.deck.length + g.descarte.length + (g.comprada ? 1 : 0)
  + g.players.reduce((n, p) => n + p.slots.filter(Boolean).length, 0);

test('começo: 4 cartas viradas, só as duas de perto à vista por 5 s, sem carta no meio', () => {
  const g = novo(4);
  const ev = B.startRound(g, T0);
  assert.equal(ev[0].e, 'roundStart');
  assert.equal(g.phase, 'espiar');
  assert.equal(g.descarte.length, 0);
  assert.equal(total(g), 54);
  const v = B.viewFor(g, 'p1', T0);
  assert.deepEqual(v.you.espiadas.map((x) => x.i).sort(), B.PERTO);
  assert.ok(v.you.espiadas.every((x) => x.p === 'p1' && x.card));
  // a visão dos outros não traz valor de carta nenhuma
  assert.ok(v.players.every((p) => p.slots.every((x) => x === true)));
  assert.throws(() => B.applyAction(g, g.players[g.turn].id, { a: 'comprar' }, T0 + 100), /espiada/);
  const ev2 = B.tick(g, T0 + B.ESPIADA_INICIAL_MS);
  assert.equal(ev2[0].e, 'comeca');
  assert.equal(g.phase, 'play');
  assert.equal(B.viewFor(g, 'p1', T0 + B.ESPIADA_INICIAL_MS).you.espiadas.length, 0, 'só na primeira vez');
});

test('vez: compra só do monte, troca manda a sua para o descarte', () => {
  const g = montado([[5, 6, 7, 8], [1, 1, 1, 1]], { deck: [2] });
  B.applyAction(g, 'p0', { a: 'comprar' }, T0);
  assert.equal(B.viewFor(g, 'p0', T0).you.comprada.rank, 2);
  assert.equal(B.viewFor(g, 'p1', T0).you.comprada, null, 'a comprada é só de quem comprou');
  const ev = B.applyAction(g, 'p0', { a: 'trocar', i: 3 }, T0);
  assert.equal(ev[0].card.rank, 8);
  assert.equal(g.players[0].slots[3].rank, 2);
  assert.equal(g.descarte.at(-1).rank, 8);
  assert.equal(g.players[g.turn].id, 'p1');
});

test('J: depois de descartar, olha uma carta sua — só ele vê', () => {
  const g = montado([[5, 6, 7, 8], [1, 1, 1, 1]], { deck: [11] });
  B.applyAction(g, 'p0', { a: 'comprar' }, T0);
  const ev = B.applyAction(g, 'p0', { a: 'descartarComprada' }, T0);
  assert.deepEqual(ev.at(-1), { e: 'poder', p: 'p0', poder: 'J' });
  assert.throws(() => B.applyAction(g, 'p1', { a: 'espiar', i: 0 }, T0), /vez/);
  B.applyAction(g, 'p0', { a: 'espiar', i: 1 }, T0);
  assert.equal(B.viewFor(g, 'p0', T0).you.espiadas[0].card.rank, 6);
  assert.equal(B.viewFor(g, 'p1', T0).you.espiadas.length, 0);
  B.tick(g, T0 + B.ESPIADA_MS);
  assert.equal(B.viewFor(g, 'p0', T0 + B.ESPIADA_MS).you.espiadas.length, 0);
});

test('poder também vale quando o J sai da mão pela troca', () => {
  const g = montado([[5, 11, 7, 8], [1, 1, 1, 1]], { deck: [2] });
  B.applyAction(g, 'p0', { a: 'comprar' }, T0);
  const ev = B.applyAction(g, 'p0', { a: 'trocar', i: 1 }, T0);
  assert.equal(ev.at(-1).poder, 'J');
});

test('Q: olha a carta de outro; K: troca às cegas', () => {
  const g = montado([[5, 6, 7, 8], [1, 2, 3, 4], [9, 9, 9, 9]], { deck: [12, 13] });
  B.applyAction(g, 'p0', { a: 'comprar' }, T0);
  B.applyAction(g, 'p0', { a: 'descartarComprada' }, T0);
  assert.throws(() => B.applyAction(g, 'p0', { a: 'olhar', p: 'p1', i: 0 }, T0), /outro/);
  assert.throws(() => B.applyAction(g, 'p0', { a: 'rei', i: 0, p: 'p0', j: 1 }, T0), /OUTRO/);
  const ev = B.applyAction(g, 'p0', { a: 'rei', i: 3, p: 'p1', j: 0 }, T0);
  assert.deepEqual(ev[0], { e: 'reiTrocou', p: 'p0', i: 3, alvo: 'p1', j: 0 });
  assert.equal(g.players[0].slots[3].rank, 1);
  assert.equal(g.players[1].slots[0].rank, 8);
  assert.equal(B.viewFor(g, 'p0', T0).you.espiadas.length, 0, 'ninguém vê os valores da troca');
  // vez de p1: dama
  B.applyAction(g, 'p1', { a: 'comprar' }, T0);
  B.applyAction(g, 'p1', { a: 'descartarComprada' }, T0);
  assert.throws(() => B.applyAction(g, 'p1', { a: 'olhar', p: 'p1', i: 0 }, T0), /OUTRO/);
  B.applyAction(g, 'p1', { a: 'olhar', p: 'p2', i: 2 }, T0);
  assert.deepEqual(B.viewFor(g, 'p1', T0).you.espiadas.map((x) => [x.p, x.i, x.card.rank]), [['p2', 2, 9]]);
  assert.equal(B.viewFor(g, 'p2', T0).you.espiadas.length, 0);
});

test('descarte rápido da própria carta, fora da vez, sem poder', () => {
  const g = montado([[5, 6, 7, 8], [1, 11, 3, 4]], { topo: 11 });
  const ev = B.applyAction(g, 'p1', { a: 'descartar', p: 'p1', i: 1 }, T0);
  assert.equal(ev[0].e, 'rapido');
  assert.equal(g.players[1].slots[1], null, 'a posição vira buraco: as outras não mudam de lugar');
  assert.equal(g.poder, null);
  assert.equal(g.players[g.turn].id, 'p0', 'a vez não muda');
});

test('descarte rápido da carta de outro: dá uma sua para o buraco', () => {
  const g = montado([[5, 6, 7, 8], [1, 3, 3, 4]], { topo: 3 });
  B.applyAction(g, 'p0', { a: 'descartar', p: 'p1', i: 1 }, T0);
  assert.deepEqual(B.viewFor(g, 'p0', T0).you.devo, { para: 'p1', i: 1 });
  assert.throws(() => B.applyAction(g, 'p0', { a: 'descartar', p: 'p1', i: 2 }, T0), /deve/);
  B.applyAction(g, 'p0', { a: 'dar', j: 0 }, T0);
  assert.equal(g.players[1].slots[1].rank, 5);
  assert.equal(g.players[0].slots[0], null);
  assert.equal(g.players[0].slots.filter(Boolean).length, 3);
  assert.equal(g.players[1].slots.filter(Boolean).length, 4);
});

test('descarte errado: a carta aparece para todos, volta, e quem errou leva +1', () => {
  const g = montado([[5, 6, 7, 8], [1, 2, 3, 4]], { topo: 9 });
  const ev = B.applyAction(g, 'p1', { a: 'descartar', p: 'p0', i: 2 }, T0);
  assert.equal(ev[0].e, 'errou');
  assert.equal(ev[1].e, 'punicao');
  assert.equal(g.players[0].slots[2].rank, 7, 'volta para o lugar');
  assert.equal(g.players[1].slots.length, 5);
  for (const quem of ['p0', 'p1']) assert.equal(B.viewFor(g, quem, T0).reveladas[0].card.rank, 7);
  B.tick(g, T0 + B.REVELADA_MS);
  assert.equal(B.viewFor(g, 'p0', T0 + B.REVELADA_MS).reveladas.length, 0);
  // sem nada no descarte, qualquer descarte rápido é errado
  const g2 = montado([[5, 6, 7, 8], [1, 2, 3, 4]]);
  assert.equal(B.applyAction(g2, 'p0', { a: 'descartar', p: 'p0', i: 0 }, T0)[0].e, 'errou');
});

test('corrida: o segundo atrás da mesma carta não é punido', () => {
  const g = montado([[5, 6, 7, 8], [1, 2, 3, 4], [9, 9, 9, 9]], { topo: 3 });
  B.applyAction(g, 'p0', { a: 'descartar', p: 'p1', i: 2 }, T0);
  assert.throws(() => B.applyAction(g, 'p1', { a: 'descartar', p: 'p1', i: 2 }, T0), /já saiu/);
  assert.equal(g.players[1].slots.length, 4);
});

test('enquanto não cair outra por cima, vale descartar em cadeia', () => {
  const g = montado([[3, 6, 7, 8], [3, 2, 3, 4]], { topo: 3 });
  B.applyAction(g, 'p1', { a: 'descartar', p: 'p1', i: 0 }, T0);
  B.applyAction(g, 'p1', { a: 'descartar', p: 'p1', i: 2 }, T0);
  B.applyAction(g, 'p0', { a: 'descartar', p: 'p0', i: 0 }, T0);
  assert.equal(g.descarte.length, 4);
});

test('par na sua vez; par errado mostra as duas e pune', () => {
  const g = montado([[4, 6, 4, 8], [1, 2, 3, 4]]);
  assert.throws(() => B.applyAction(g, 'p1', { a: 'par', i: 0, j: 1 }, T0), /vez/);
  const ev = B.applyAction(g, 'p0', { a: 'par', i: 0, j: 2 }, T0);
  assert.equal(ev[0].e, 'par');
  assert.equal(g.players[0].slots.filter(Boolean).length, 2);
  assert.equal(g.etapa, 'comprar', 'o par não substitui a compra');
  const ev2 = B.applyAction(g, 'p0', { a: 'par', i: 1, j: 3 }, T0);
  assert.equal(ev2[0].e, 'parErrado');
  assert.equal(B.viewFor(g, 'p1', T0).reveladas.length, 2);
  assert.equal(g.players[0].slots.filter(Boolean).length, 3);
});

test('bater: sem nenhuma carta vence na hora, até de quem só tem coringa', () => {
  const g = montado([[0], [5]], { topo: 5 });
  const ev = B.applyAction(g, 'p1', { a: 'descartar', p: 'p1', i: 0 }, T0);
  assert.equal(ev.at(-1).e, 'roundEnd');
  assert.equal(g.lastRound.vencedor, 'p1');
  assert.equal(g.lastRound.motivo, 'bateu');
  assert.equal(g.players[1].vitorias, 1);
  // no fim todos veem todas as cartas
  assert.equal(B.viewFor(g, 'p1', T0).players[0].slots[0].rank, 0);
});

test('bater dando a última carta para outro', () => {
  const g = montado([[5, 6], [7]], { topo: 6 });
  B.applyAction(g, 'p1', { a: 'descartar', p: 'p0', i: 1 }, T0);
  assert.equal(g.phase, 'play', 'com a carta ainda a caminho, ninguém bateu');
  B.applyAction(g, 'p1', { a: 'dar', j: 0 }, T0);
  assert.equal(g.lastRound.vencedor, 'p1');
});

test('bazuca certo vence; empate ou soma maior não vence, pune e o jogo segue', () => {
  const g = montado([[1, 3], [4, 0], [9]]);
  B.applyAction(g, 'p0', { a: 'bazuca' }, T0);
  assert.equal(g.phase, 'play', 'empatou com 4: não vence');
  assert.equal(g.players[0].slots.length, 3);
  assert.equal(g.players[g.turn].id, 'p1');
  const g2 = montado([[1, 2], [4, 0], [9]]);
  const ev = B.applyAction(g2, 'p0', { a: 'bazuca' }, T0);
  assert.deepEqual(ev[0], { e: 'bazuca', p: 'p0', certo: true });
  assert.equal(g2.lastRound.vencedor, 'p0');
  assert.equal(g2.lastRound.motivo, 'bazuca');
});

test('bazuca só no começo da vez', () => {
  const g = montado([[1, 2], [4, 0]], { deck: [5] });
  B.applyAction(g, 'p0', { a: 'comprar' }, T0);
  assert.throws(() => B.applyAction(g, 'p0', { a: 'bazuca' }, T0), /carta comprada/);
});

test('35 s: estourou, a comprada vai para o descarte sem poder', () => {
  const g = montado([[5, 6], [7, 8]], { deck: [12] });
  g.prazo = T0 + B.VEZ_MS;
  B.applyAction(g, 'p0', { a: 'comprar' }, T0);
  const ev = B.tick(g, T0 + B.VEZ_MS);
  assert.equal(ev[0].e, 'estourou');
  assert.equal(ev[1].semPoder, true);
  assert.equal(g.poder, null);
  assert.equal(g.players[g.turn].id, 'p1');
  assert.equal(B.proximoPrazo(g), T0 + 2 * B.VEZ_MS);
});

test('dívida esquecida: depois do prazo vai uma carta qualquer', () => {
  const g = montado([[5, 6, 7, 8], [1, 3, 3, 4]], { topo: 3 });
  B.applyAction(g, 'p0', { a: 'descartar', p: 'p1', i: 1 }, T0);
  B.tick(g, T0 + B.DIVIDA_MS);
  assert.equal(g.dividas.length, 0);
  assert.ok(g.players[1].slots[1]);
});

test('o monte acaba: o descarte vira monte, menos a de cima', () => {
  const g = montado([[5, 6], [7, 8]], { deck: [], topo: 4 });
  g.descarte = [c(1, 1), c(2, 2), c(4, 3)];
  const ev = B.applyAction(g, 'p0', { a: 'comprar' }, T0);
  assert.equal(ev[0].e, 'remexeu');
  assert.equal(g.descarte.length, 1);
  assert.equal(g.descarte[0].rank, 4);
});

// --------------------------------------------------------------------------
// Robôs: o relógio e os planos simulados como o servidor faz.

function simula(n, nivel, rodadas = 3, limite = 400000) {
  const g = B.createGame(Array.from({ length: n }, (_, k) => ({ id: `b${k}`, name: `B${k}`, isBot: true })), { nivelRobos: nivel });
  let s = 11 + n;
  g.rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
  let agora = T0;
  B.startRound(g, agora);
  const planos = new Map();     // chave → { em, plano } | null
  const fins = [];
  let passos = 0;
  while (fins.length < rodadas && passos++ < limite) {
    if (g.phase === 'roundEnd') { fins.push(g.lastRound); B.actNextRound(g, agora); planos.clear(); continue; }
    for (const pl of B.planosDosRobos(g, [], agora)) {
      if (!planos.has(pl.chave)) planos.set(pl.chave, pl.action ? { em: agora + pl.atraso, pl } : null);
    }
    let prox = B.proximoPrazo(g) ?? Infinity, escolhido = null;
    for (const [k, x] of planos) if (x && x.em < prox) { prox = x.em; escolhido = k; }
    assert.ok(prox < Infinity, 'o jogo não pode ficar parado sem prazo nem plano');
    agora = Math.max(agora, prox);
    if (escolhido) {
      const { pl } = planos.get(escolhido);
      planos.set(escolhido, null);
      try { B.applyAction(g, pl.botId, pl.action, agora); } catch (e) { assert.ok(e.gameRule, e.stack); }
    } else B.tick(g, agora);
    assert.equal(total(g), 54, 'nenhuma carta some nem aparece');
  }
  return { fins, g, passos };
}

for (const nivel of B.NIVEIS_DE_ROBO) {
  for (const n of [2, 4, 6]) {
    test(`robôs ${nivel}, ${n} na mesa: três rodadas inteiras`, () => {
      const { fins, g } = simula(n, nivel);
      assert.equal(fins.length, 3);
      assert.equal(g.players.reduce((a, p) => a + p.vitorias, 0), fins.filter((f) => f.vencedor).length);
    });
  }
}

test('robô difícil vence mais que robô fácil a longo prazo (memória conta)', () => {
  const placar = { facil: 0, dificil: 0 };
  for (const nivel of ['facil', 'dificil']) {
    const { fins } = simula(3, nivel, 12);
    // quantas rodadas acabaram com bazuca CERTO ou batida (jogo bem jogado), não por monte
    placar[nivel] = fins.filter((f) => f.motivo !== 'monte').length;
  }
  assert.ok(placar.dificil >= placar.facil - 2, JSON.stringify(placar));
});
