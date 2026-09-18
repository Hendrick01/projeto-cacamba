// A lista de servidores da voz: STUN sempre; TURN só o que o servidor entregar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { criaVoz } from '../public/voz.js';
const { ICE, carregaIce } = criaVoz;

test('sem /voz.json a voz segue só com STUN; com ele, o TURN entra — e não acumula', async () => {
  const stun = ICE.length;
  assert.ok(stun >= 1 && ICE.every((s) => String(s.urls).includes('stun:')));
  await carregaIce(() => Promise.resolve({ ok: false }));
  assert.equal(ICE.length, stun);
  const resposta = { ok: true, json: () => Promise.resolve({ iceServers: [{ urls: ['turn:voz.exemplo:3478'], username: 'u', credential: 'c' }, { lixo: true }] }) };
  await carregaIce(() => Promise.resolve(resposta));
  assert.equal(ICE.length, stun + 1);
  assert.deepEqual(ICE.at(-1), { urls: ['turn:voz.exemplo:3478'], username: 'u', credential: 'c' });
  await carregaIce(() => Promise.resolve(resposta));
  assert.equal(ICE.length, stun + 1, 'recarregar troca o TURN, não empilha');
  await carregaIce(() => Promise.reject(new Error('sem rede')));
  assert.equal(ICE.length, stun + 1, 'falha de rede não derruba o que já havia');
});
