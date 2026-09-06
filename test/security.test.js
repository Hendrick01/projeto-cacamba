import test from 'node:test';
import assert from 'node:assert/strict';
import { consume, clientIp, validOrigin, validMessage } from '../lib/security.js';

test('origem exige domínio exato, inclusive sem PUBLIC_URL', () => {
  const req = (origin, host = 'jogo.test') => ({ headers: { origin, host } });
  assert.equal(validOrigin(req('https://jogo.test')), true);
  assert.equal(validOrigin(req('https://intruso.test')), false);
  assert.equal(validOrigin(req('null')), false);
  assert.equal(validOrigin(req('https://jogo.test.evil')), false);
  assert.equal(validOrigin(req('https://jogo.test'), 'https://jogo.test/'), true);
  assert.equal(validOrigin(req('http://jogo.test'), 'https://jogo.test/'), false);
  assert.equal(validOrigin(req('https://jogo.test/path')), false);
  assert.equal(validOrigin(req(undefined), 'https://jogo.test'), false);
  assert.equal(validOrigin(req(undefined)), true);
});
test('IP não confia no primeiro X-Forwarded-For fornecido pelo cliente', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 192.0.2.5' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientIp(req, true), '192.0.2.5');
  assert.equal(clientIp(req, false), '127.0.0.1');
  req.headers['x-forwarded-for'] = 'nome-forjado';
  assert.equal(clientIp(req, true), '127.0.0.1');
});
test('limite tolera rajada pequena, bloqueia excesso e repõe com o tempo', () => {
  const bucket = {};
  for (let i=0;i<3;i++) assert.ok(consume(bucket,3,2,1000));
  assert.equal(consume(bucket,3,2,1000),false);
  assert.equal(consume(bucket,3,2,1499),false);
  assert.equal(consume(bucket,3,2,1500),true);
  assert.equal(consume(bucket,3,2,1500),false);
});
test('JSON nulo, arrays e ações sem estrutura não chegam ao motor', () => {
  for (const msg of [null, [], 3, 'create', {}, {t:'action'}, {t:'action',action:[]}]) assert.equal(validMessage(msg),false);
  assert.ok(validMessage({t:'action',action:{a:'draw'}}));
});
