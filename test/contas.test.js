// A metade pura das contas: idade e cookie. Nenhum destes testes sobe banco —
// é por isso que estas funções foram separadas das que consultam o Postgres.
import test from 'node:test';
import assert from 'node:assert/strict';
import { idadeEm, avaliaIdade, normalizaEmail, assinaCookie, abreCookie } from '../lib/contas.js';

const HOJE = new Date('2026-09-08T12:00:00Z');

test('a idade vira no dia do aniversário, não perto dele', () => {
  assert.equal(idadeEm('2010-09-09', HOJE), 15);  // faz 16 amanhã
  assert.equal(idadeEm('2010-09-08', HOJE), 16);  // faz hoje
  assert.equal(idadeEm('2010-09-07', HOJE), 16);
  // Fevereiro é onde o atalho de 365,25 dias erra.
  assert.equal(idadeEm('2008-02-29', new Date('2026-02-28T12:00:00Z')), 17);
  assert.equal(idadeEm('2008-02-29', new Date('2026-03-01T12:00:00Z')), 18);
});

test('menor de 16 não compra, e o recado não o expulsa do jogo', () => {
  const v = avaliaIdade('2011-01-01', HOJE);
  assert.equal(v.ok, false);
  assert.equal(v.precisaResponsavel, false);
  assert.match(v.motivo, /de graça/);
});

test('16 e 17 anos passam pelo responsável', () => {
  for (const nascimento of ['2010-09-08', '2009-01-01', '2008-09-09']) {
    const v = avaliaIdade(nascimento, HOJE);
    assert.equal(v.ok, false, nascimento);
    assert.equal(v.precisaResponsavel, true, nascimento);
  }
});

test('a partir de 18 é livre', () => {
  assert.deepEqual(avaliaIdade('2008-09-08', HOJE).ok, true);
  assert.deepEqual(avaliaIdade('1980-05-20', HOJE).ok, true);
});

test('data impossível não vira maioridade por acidente', () => {
  for (const ruim of ['', 'xx', null, undefined, '1800-01-01', '2030-01-01']) {
    assert.equal(avaliaIdade(ruim, HOJE).ok, false, String(ruim));
  }
});

test('e-mail: normaliza o que serve, recusa o que nunca chegaria', () => {
  assert.equal(normalizaEmail('  Apoio@Cacamba.COM.br '), 'apoio@cacamba.com.br');
  for (const ruim of ['', 'sem-arroba', 'a@b', 'a@@b.com', 'com espaço@x.com', `${'a'.repeat(250)}@x.com`]) {
    assert.equal(normalizaEmail(ruim), '', JSON.stringify(ruim));
  }
});

test('o cookie só abre com a assinatura que saiu daqui', () => {
  const bom = assinaCookie('7f1c0e2a-0000-4000-8000-000000000001');
  assert.equal(abreCookie(bom), '7f1c0e2a-0000-4000-8000-000000000001');

  const [id, marca] = bom.split('.');
  assert.equal(abreCookie(`${id}x.${marca}`), null, 'id trocado passou');
  assert.equal(abreCookie(`${id}.${marca}x`), null, 'marca esticada passou');
  assert.equal(abreCookie(id), null, 'id sem marca passou');
  assert.equal(abreCookie(''), null);
  assert.equal(abreCookie(null), null);
});
