// A ordem das cartas na mão: arrumação automática e arrastar para reordenar.
//
// O caso que deu origem a este arquivo: depois de arrumar a mão à mão e puxar
// uma carta, a carta nova entrava num canto do leque e NÃO SAÍA DE LÁ — ela
// seguia o dedo e voltava para o lugar ao soltar. A causa era haver duas
// fontes de verdade para a ordem: a tela usava uma e o arrasto usava outra.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenaMao, reordena } from '../shared/mao.js';

const carta = (id, rank, suit = 0) => ({ id, rank, suit });
const ids = (mao) => mao.map((c) => c.id);

// Arrasta como o cliente arrasta: reordena e devolve a mão já na ordem nova.
function arrasta(hand, ordemManual, id, destino, modo = 'rank') {
  const naTela = ordenaMao(hand, ordemManual, modo);
  const nova = reordena(naTela, id, destino);
  return { ordem: nova ?? ordemManual, mudou: nova !== null };
}

test('sem arrumação manual, a mão sai ordenada sozinha', () => {
  const hand = [carta(5, 5), carta(1, 1), carta(3, 3)];
  assert.deepEqual(ids(ordenaMao(hand, [], 'rank')), [1, 3, 5]);
  const porNaipe = [carta(1, 9, 2), carta(2, 3, 0), carta(3, 4, 0)];
  assert.deepEqual(ids(ordenaMao(porNaipe, [], 'suit')), [2, 3, 1]);
});

test('a arrumação manual manda, e a carta que ela não conhece vai para o fim', () => {
  const hand = [carta(1, 1), carta(2, 2), carta(3, 3), carta(99, 7)];
  assert.deepEqual(ids(ordenaMao(hand, [3, 1, 2], 'rank')), [3, 1, 2, 99]);
});

test('a carta recém-puxada, no canto do leque, PODE ser arrastada', () => {
  // 1. o jogador arruma a mão levando a última carta para o começo
  let hand = [1, 2, 3, 4, 5, 6].map((id) => carta(id, id));
  let { ordem, mudou } = arrasta(hand, [], 6, 0);
  assert.ok(mudou);
  assert.deepEqual(ordem, [6, 1, 2, 3, 4, 5]);

  // 2. puxa uma carta: ela entra no canto, porque a arrumação não a conhece
  hand = [...hand, carta(99, 7)];
  assert.deepEqual(ids(ordenaMao(hand, ordem, 'rank')), [6, 1, 2, 3, 4, 5, 99]);

  // 3. e é justamente aqui que ela ficava presa
  ({ ordem, mudou } = arrasta(hand, ordem, 99, 0));
  assert.ok(mudou, 'a carta nova tem de aceitar ser arrastada');
  assert.deepEqual(ordem, [99, 6, 1, 2, 3, 4, 5]);
});

test('a carta nova vai para qualquer lugar, não só para o começo', () => {
  const hand = [1, 2, 3].map((id) => carta(id, id)).concat(carta(99, 9));
  const base = [1, 2, 3];
  // na tela a carta nova está no fim: [1, 2, 3, 99]
  assert.deepEqual(arrasta(hand, base, 99, 0).ordem, [99, 1, 2, 3]);
  assert.deepEqual(arrasta(hand, base, 99, 2).ordem, [1, 2, 99, 3]);
  assert.equal(arrasta(hand, base, 99, 3).mudou, false, 'soltar no fim, onde ela já está');
  // e volta para o fim depois de ter ido para o começo
  assert.deepEqual(arrasta(hand, [99, 1, 2, 3], 99, 3).ordem, [1, 2, 3, 99]);
});

test('soltar a carta no próprio lugar não conta como mudança', () => {
  const hand = [1, 2, 3, 4].map((id) => carta(id, id));
  assert.equal(reordena(ordenaMao(hand, [], 'rank'), 2, 1), null);
  assert.equal(reordena(ordenaMao(hand, [], 'rank'), 1, 0), null);
});

test('a ordem não guarda id de carta que saiu da mão', () => {
  const hand = [1, 2, 3, 4].map((id) => carta(id, id));
  const { ordem } = arrasta(hand, [], 4, 0);
  assert.deepEqual(ordem, [4, 1, 2, 3]);
  // o 2 foi descartado; o próximo arrasto não pode carregar o id morto adiante
  const menor = hand.filter((c) => c.id !== 2);
  const depois = arrasta(menor, ordem, 3, 0);
  assert.ok(!depois.ordem.includes(2));
  assert.equal(depois.ordem.length, menor.length);
});

test('carta que não está na mão não move nada', () => {
  const hand = [1, 2].map((id) => carta(id, id));
  assert.equal(reordena(ordenaMao(hand, [], 'rank'), 777, 0), null);
});

test('destino fora da faixa é grampeado nas pontas', () => {
  const hand = [1, 2, 3].map((id) => carta(id, id));
  assert.deepEqual(reordena(ordenaMao(hand, [], 'rank'), 3, -5), [3, 1, 2]);
  assert.deepEqual(reordena(ordenaMao(hand, [], 'rank'), 1, 999), [2, 3, 1]);
});
