// O BR Code é uma fila de campos que se declaram: cada um diz o próprio
// tamanho. Isso dá um teste forte e barato — percorrer a fila obriga cada
// tamanho a bater com a realidade, e um campo mal medido não chega ao fim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { codigoPix, crc16, normalizaChave } from '../lib/pix.js';

// Percorre a fila e devolve { id: valor }. Estoura se algum tamanho mentir.
function campos(payload) {
  const achados = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tam = Number(payload.slice(i + 2, i + 4));
    assert.ok(Number.isInteger(tam), `tamanho ilegível no campo ${id}`);
    const valor = payload.slice(i + 4, i + 4 + tam);
    assert.equal(valor.length, tam, `campo ${id} promete ${tam} e entrega ${valor.length}`);
    achados[id] = valor;
    i += 4 + tam;
  }
  assert.equal(i, payload.length, 'sobrou lixo depois do último campo');
  return achados;
}

test('crc16 bate com o valor de conferência da literatura', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('o payload é uma fila íntegra e termina no CRC do que veio antes', () => {
  const codigo = codigoPix({ chave: 'apoio@cacamba.com.br', nome: 'Caçamba', cidade: 'São Paulo' });
  const c = campos(codigo);
  assert.equal(c['00'], '01');
  assert.equal(c['53'], '986');
  assert.equal(c['58'], 'BR');
  // O CRC é do payload inteiro menos os 4 dígitos finais — "6304" incluído.
  assert.equal(c['63'], crc16(codigo.slice(0, -4)));
});

test('a chave viaja dentro do template do Pix', () => {
  const c = campos(codigoPix({ chave: 'apoio@cacamba.com.br', nome: 'X', cidade: 'Y' }));
  assert.equal(campos(c['26'])['00'], 'br.gov.bcb.pix');
  assert.equal(campos(c['26'])['01'], 'apoio@cacamba.com.br');
});

test('nome e cidade perdem acento, cedilha e caixa', () => {
  const c = campos(codigoPix({ chave: 'x', nome: 'Caçamba Jogos', cidade: 'São Paulo' }));
  assert.equal(c['59'], 'CACAMBA JOGOS');
  assert.equal(c['60'], 'SAO PAULO');
});

test('nome e cidade cabem nos limites do formato', () => {
  const c = campos(codigoPix({
    chave: 'x',
    nome: 'Um nome absurdamente comprido que nao cabe em 25',
    cidade: 'Cidade comprida demais tambem',
  }));
  assert.ok(c['59'].length <= 25, `nome tem ${c['59'].length}`);
  assert.ok(c['60'].length <= 15, `cidade tem ${c['60'].length}`);
});

test('sem valor fixo: quem apoia digita quanto quer', () => {
  const c = campos(codigoPix({ chave: 'x', nome: 'X', cidade: 'Y' }));
  assert.equal(c['54'], undefined);
});

test('sem chave não há código — é o que mantém o botão escondido', () => {
  assert.equal(codigoPix({ nome: 'X', cidade: 'Y' }), null);
  assert.equal(codigoPix({ chave: '   ' }), null);
  assert.equal(codigoPix(), null);
});

// Nenhum número real aqui: os exemplos são inventados de propósito, porque
// chave de Pix é dado de quem recebe e não entra em repositório.
test('a chave vira o formato que o Pix exige', () => {
  const casos = [
    ['11 987654321', 'telefone', '+5511987654321'],
    ['(11) 98765-4321', 'telefone', '+5511987654321'],
    ['+55 11 98765-4321', 'telefone', '+5511987654321'],
    ['123.456.789-01', 'CPF', '12345678901'],
    ['12345678901', 'CPF', '12345678901'],
    ['12345678000199', 'CNPJ', '12345678000199'],
    ['Apoio@Cacamba.com.BR', 'e-mail', 'apoio@cacamba.com.br'],
    ['9f8e7d6c-1234-4abc-8def-0123456789ab', 'aleatória', '9f8e7d6c-1234-4abc-8def-0123456789ab'],
  ];
  for (const [entrada, tipo, esperado] of casos) {
    const lido = normalizaChave(entrada);
    assert.equal(lido.tipo, tipo, `"${entrada}" foi lida como ${lido.tipo}`);
    assert.equal(lido.chave, esperado);
  }
});

test('PIX_TIPO desempata o que os 11 dígitos não resolvem', () => {
  // Um CPF cujo terceiro dígito é 9 tem exatamente o molde de um celular.
  assert.equal(normalizaChave('12945678901').tipo, 'telefone');
  assert.equal(normalizaChave('12945678901', 'cpf').chave, '12945678901');
});

test('a chave chega ao payload já normalizada', () => {
  const c = campos(codigoPix({ chave: '11 98765-4321', nome: 'X', cidade: 'Y' }));
  assert.equal(campos(c['26'])['01'], '+5511987654321');
});
