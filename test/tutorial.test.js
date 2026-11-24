// O roteiro do tutorial (shared/tutorial.js) jogado de verdade: o motor de
// sempre, o robô normal decidindo sozinho, e as jogadas que o treinador do app
// pede. Se o robô mudar de ideia (uma mudança na heurística dele, por
// exemplo), o tutorial deixa de chegar ao fim — e é aqui que isso aparece.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startRound, applyAction, botNextAction, mulberry32, topoDoDescarte, conferirBaralho,
} from '../shared/engine.js';
import { montaRodadaDoTutorial, OPCOES_DO_TUTORIAL, ROTEIRO } from '../shared/tutorial.js';

function partida(seed = 7) {
  const g = createGame(
    [{ id: 'eu', name: 'Aprendiz' }, { id: 'bot', name: 'Robô', isBot: true }],
    { ...OPCOES_DO_TUTORIAL, rnd: mulberry32(seed) },
  );
  startRound(g);
  assert.equal(montaRodadaDoTutorial(g), true, 'o roteiro se aplica');
  return g;
}
const eu = (g) => g.players.find((p) => p.id === 'eu');
const carta = (mao, valor, naipe) => mao.find((c) => c.rank === valor && c.suit === naipe);
const ids = (cartas) => cartas.map((c) => c.id);

// o robô joga a vez inteira dele; devolve as ações que ele escolheu
function vezDoRobo(g) {
  const acoes = [];
  for (let i = 0; i < 20 && g.players[g.turn].id === 'bot' && g.phase !== 'roundEnd'; i++) {
    const a = botNextAction(g, 'bot');
    acoes.push(a);
    applyAction(g, 'bot', a);
  }
  return acoes;
}

test('tutorial: a rodada sai arrumada e o baralho continua inteiro', () => {
  const g = partida();
  const total = g.deck.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length, 0);
  assert.equal(total, 104, 'dois baralhos sem coringa (a 1ª rodada é só de trincas)');
  assert.equal(new Set([...g.deck, ...g.discard, ...g.players.flatMap((p) => p.hand)].map((c) => c.id)).size, 104, 'nenhuma carta repetida');
  assert.deepEqual(eu(g).hand.map((c) => [c.rank, c.suit]), ROTEIRO.humano);
  assert.equal(g.players[g.turn].id, 'eu', 'quem aprende abre a rodada');
  assert.deepEqual([topoDoDescarte(g).rank, topoDoDescarte(g).suit], ROTEIRO.virada);
  assert.equal(g.queimaDe, null, 'sem queima no tutorial');
});

test('tutorial: o roteiro inteiro — monte, baixar, encaixar, descartar, meio e bater', () => {
  for (const seed of [1, 2, 3, 42, 2026]) {
    const g = partida(seed);
    // 1ª vez: puxa do monte e vem o outro 7 de copas
    applyAction(g, 'eu', { a: 'draw', source: 'deck' });
    const mao = eu(g).hand;
    const setes = mao.filter((c) => c.rank === 7);
    assert.equal(setes.length, 4, 'o monte deu o segundo 7');
    // baixa uma trinca de 7 (copas, espadas, ouros), como o arrastar do app manda
    const trinca = [carta(mao, 7, 1), carta(mao, 7, 0), carta(mao, 7, 2)];
    const ev1 = applyAction(g, 'eu', { a: 'baixar', cardIds: ids(trinca) });
    assert.equal(ev1[0].e, 'baixou');
    assert.equal(eu(g).baixou, false, 'o contrato pede duas trincas: falta uma');
    // encaixa o 7 de copas que sobrou — vale antes de cumprir o contrato
    const outro7 = eu(g).hand.find((c) => c.rank === 7);
    const ev2 = applyAction(g, 'eu', { a: 'layoff', cardId: outro7.id, meldId: eu(g).melds[0].id });
    assert.equal(ev2[0].e, 'layoff');
    // descarta o 2 de espadas e a vez passa
    applyAction(g, 'eu', { a: 'discard', cardId: carta(eu(g).hand, 2, 0).id });
    assert.equal(g.players[g.turn].id, 'bot');

    // o robô: não quer o 2♠, puxa do monte e larga o rei de espadas
    const acoes = vezDoRobo(g);
    assert.deepEqual(acoes[0], { a: 'draw', source: 'deck' }, `seed ${seed}: o robô puxa do monte`);
    assert.equal(acoes.at(-1).a, 'discard');
    const topo = topoDoDescarte(g);
    assert.deepEqual([topo.rank, topo.suit, topo.by], [13, 0, 'bot'], `seed ${seed}: o robô descarta o K♠`);

    // 2ª vez: pega o rei do meio, baixa os três reis e bate
    applyAction(g, 'eu', { a: 'draw', source: 'discard' });
    const reis = eu(g).hand.filter((c) => c.rank === 13);
    assert.equal(reis.length, 3);
    assert.equal(eu(g).hand.length, 3, 'só os três reis na mão');
    const fim = applyAction(g, 'eu', { a: 'baixar', cardIds: ids(reis) });
    const roundEnd = fim.find((e) => e.e === 'roundEnd');
    assert.ok(roundEnd, 'a rodada acabou');
    assert.equal(roundEnd.reason, 'bateu');
    assert.equal(roundEnd.winnerId, 'eu', 'quem aprende bateu');
    assert.equal(roundEnd.scores.eu, 0);
  }
});

test('tutorial: pegando a virada do meio na 1ª vez, o robô ainda larga o K♠', () => {
  const g = partida();
  applyAction(g, 'eu', { a: 'draw', source: 'discard' });     // o 9♣
  const mao = eu(g).hand;
  applyAction(g, 'eu', { a: 'baixar', cardIds: ids([carta(mao, 7, 1), carta(mao, 7, 0), carta(mao, 7, 2)]) });
  applyAction(g, 'eu', { a: 'discard', cardId: carta(eu(g).hand, 2, 0).id });
  vezDoRobo(g);   // ele puxa o 7♥ que era seu
  const topo = topoDoDescarte(g);
  assert.deepEqual([topo.rank, topo.suit], [13, 0]);
});

test('tutorial: fora do roteiro não mexe em nada', () => {
  // mesa de três
  const tres = createGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', isBot: true }, { id: 'c', name: 'C', isBot: true }], OPCOES_DO_TUTORIAL);
  startRound(tres);
  const antes = JSON.stringify(tres.players.map((p) => p.hand));
  assert.equal(montaRodadaDoTutorial(tres), false);
  assert.equal(JSON.stringify(tres.players.map((p) => p.hand)), antes);
  // segunda rodada
  const g = partida();
  g.round = 1;
  assert.equal(montaRodadaDoTutorial(g), false);
  // o baralho de dois dá conta das sete rodadas numa mesa de dois
  assert.equal(conferirBaralho(2, { decks: 2 }), null);
});
