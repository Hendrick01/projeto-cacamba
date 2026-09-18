// O selo da sala (lib/selo-sala.js): o retrato cifrado que os jogadores guardam
// para a partida sobreviver ao reinício do servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chaveDasSalas, sela, abre } from '../lib/selo-sala.js';
import { validMessage } from '../lib/security.js';
import { createGame, startRound, mulberry32 } from '../shared/engine.js';

const chave = chaveDasSalas({ SEGREDO_SALAS: 'segredo-de-teste' });

test('sela e abre: volta igual, e a função de sorteio some (é refeita na volta)', () => {
  const jogo = createGame(Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Jogador ${i}`, isBot: i > 1 })), { rnd: mulberry32(7) });
  startRound(jogo);
  const retrato = { v: 1, seq: 12, em: Date.now(), code: 'ABCD', players: jogo.players.map((p) => ({ id: p.id, name: p.name, token: 't' })), game: jogo };
  const selo = sela(retrato, chave);
  assert.match(selo, /^[A-Za-z0-9_-]+$/);
  // oito jogadores, quatro baralhos, rodada recém-distribuída: tem de caber na
  // mensagem que o cliente consegue devolver (maxPayload de 16 KiB)
  assert.ok(selo.length < 15000, `selo de ${selo.length} caracteres`);
  const volta = abre(selo, chave);
  assert.equal(volta.code, 'ABCD');
  assert.equal(volta.game.rnd, undefined);
  assert.deepEqual(volta.game.deck, jogo.deck);
  assert.deepEqual(volta.game.players.map((p) => p.hand), jogo.players.map((p) => p.hand));
  assert.ok(validMessage({ t: 'restaura', selo, playerId: 'p0', token: 't' }));
});

test('o cliente não lê nem forja: outra chave, adulteração, truncagem e lixo dão null', () => {
  const selo = sela({ v: 1, segredo: 'a mão dos outros' }, chave);
  assert.equal(abre(selo, chaveDasSalas({ SEGREDO_SALAS: 'outra' })), null);
  const meio = Math.floor(selo.length / 2);
  const adulterado = selo.slice(0, meio) + (selo[meio] === 'A' ? 'B' : 'A') + selo.slice(meio + 1);
  assert.equal(abre(adulterado, chave), null);
  assert.equal(abre(selo.slice(0, -8), chave), null);
  for (const lixo of ['', 'abc', 'x'.repeat(500), null, 12, {}, '!'.repeat(100)]) assert.equal(abre(lixo, chave), null);
  assert.ok(!Buffer.from(selo, 'base64').toString('latin1').includes('a mão dos outros'), 'o conteúdo não viaja em claro');
  // dois selos do mesmo retrato não se repetem (IV novo a cada um)
  assert.notEqual(sela({ a: 1 }, chave), sela({ a: 1 }, chave));
});

test('a porta só aceita retrato com cara de retrato', () => {
  const ok = { t: 'restaura', selo: 'A'.repeat(60), playerId: 'p', token: 't' };
  assert.ok(validMessage(ok));
  for (const ruim of [{ ...ok, selo: 'curto' }, { ...ok, selo: 'A'.repeat(15001) }, { ...ok, selo: 'tem espaço '.repeat(8) }, { ...ok, selo: 7 }, { ...ok, playerId: 1 }, { ...ok, token: 'x'.repeat(65) }, { t: 'restaura' }]) {
    assert.equal(validMessage(ruim), false, JSON.stringify(ruim).slice(0, 60));
  }
});

test('a chave é a mesma para o mesmo segredo, e muda com ele', () => {
  assert.deepEqual(chaveDasSalas({ RENDER_SERVICE_ID: 'srv-abc' }), chaveDasSalas({ RENDER_SERVICE_ID: 'srv-abc' }));
  assert.notDeepEqual(chaveDasSalas({ RENDER_SERVICE_ID: 'srv-abc' }), chaveDasSalas({ RENDER_SERVICE_ID: 'srv-xyz' }));
  // SEGREDO_SALAS manda sobre os outros
  assert.deepEqual(chaveDasSalas({ SEGREDO_SALAS: 'a', RENDER_SERVICE_ID: 'srv-abc' }), chaveDasSalas({ SEGREDO_SALAS: 'a' }));
});
