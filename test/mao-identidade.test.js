import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { identidadeDaMao, maoDoLado, mangaNoQuadro, TINTA } from '../public/mao-identidade.js';
import { SLUGS, peleDe } from '../shared/elenco.js';

// Este teste existe porque a mão de primeira pessoa falha em SILÊNCIO. Se a
// tabela deste módulo divergir da arte do elenco, ninguém vê um erro: vê uma
// mão plausível, com a manga errada, e só desconfia se conhecer o personagem.
// Então o teste não confere "a função devolve alguma coisa" — ele confere que o
// que ela devolve continua batendo com o que os geradores desenham.

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARTE = path.join(AQUI, '..', 'public', 'assets', 'personagens');

test('todo o elenco tem mão, e a pele é a do elenco (não uma cópia)', () => {
  for (const slug of SLUGS) {
    const m = identidadeDaMao(slug);
    assert.equal(m.slug, slug);
    assert.ok(m.conhecido, `${slug} devia ser reconhecido`);
    // A pele NÃO pode ser um hex escrito aqui: tem de sair de shared/elenco.js.
    // Se alguém copiar o valor para cá, o dia em que a Lyly mudar de tom a mão
    // dela fica para trás — foi para não ter esse dia que se importa `peleDe`.
    assert.equal(m.pele, peleDe(slug), `pele do ${slug} divergiu do elenco`);
    assert.match(m.pele, /^#[0-9A-F]{6}$/i);
    assert.match(m.peleSombra, /^#[0-9A-F]{6}$/i);
    assert.equal(m.contorno, TINTA);
  }
});

test('a pele separa quem a arte separa — e só quem ela separa', () => {
  // O elenco tem três tons: o comum, a EstereX mais dourada, a Lyly mais clara.
  // Se este teste quebrar, ou o elenco ganhou um tom novo (ótimo, atualize) ou
  // alguém achatou os três num só (péssimo, era isso que se queria evitar).
  const tons = new Set(SLUGS.map((s) => identidadeDaMao(s).pele));
  assert.equal(tons.size, 3, 'o elenco deixou de ter três tons de pele');
  assert.notEqual(identidadeDaMao('esterex').pele, identidadeDaMao('matheus').pele);
  assert.notEqual(identidadeDaMao('lyly').pele, identidadeDaMao('matheus').pele);
  // E a sombra acompanha: quem tem pele própria tem sombra própria.
  assert.notEqual(identidadeDaMao('lyly').peleSombra, identidadeDaMao('matheus').peleSombra);
});

test('personagem desconhecido cai na reserva, e avisa que caiu', () => {
  for (const lixo of ['', 'ninguem', null, undefined, 42, {}, { slug: 'x' }]) {
    const m = identidadeDaMao(lixo);
    assert.equal(m.conhecido, false);
    assert.equal(m.slug, SLUGS[0], 'a reserva tem de ser a mesma de peleDe');
    assert.equal(m.pele, peleDe(SLUGS[0]));
  }
});

test('aceita o slug cru, a entrada do elenco e o jogador do view', () => {
  const cru = identidadeDaMao('mufasa');
  assert.deepEqual(identidadeDaMao({ slug: 'mufasa' }), cru);
  // `avatar` é como o personagem viaja no protocolo (server.js carimba isso em
  // cada jogador), então a mesa deve poder passar o jogador direto.
  assert.deepEqual(identidadeDaMao({ id: 'p1', avatar: 'mufasa' }), cru);
});

test('só o Mufasa tem manga no punho; só ele e a Dri entram no quadro', () => {
  // Esta é a afirmação mais forte do módulo, e a que mais se paga: é ela que
  // decide se a mesa gasta geometria com um aro de tecido.
  const noQuadro = SLUGS.filter((s) => mangaNoQuadro(identidadeDaMao(s).manga));
  assert.deepEqual(noQuadro.sort(), ['dri', 'mufasa']);
  assert.equal(identidadeDaMao('mufasa').manga.ate, 'punho');
  assert.equal(identidadeDaMao('dri').manga.ate, 'antebraco');
  // A manga bufante da Lyly é de OMBRO: existe, mas o antebraço dela é nu.
  assert.equal(identidadeDaMao('lyly').manga.ate, 'ombro');
  assert.equal(mangaNoQuadro(identidadeDaMao('lyly').manga), false);
  assert.equal(mangaNoQuadro(null), false);
});

test('a mão direita é a que carrega anel no elenco', () => {
  // Convenção do README: brinco, piercing e anel são do lado DO PERSONAGEM.
  // Em primeira pessoa isso vale sem tradução, e o teste trava a convenção.
  for (const slug of SLUGS) {
    for (const a of identidadeDaMao(slug).adornos) {
      assert.ok(a.mao === 'direita' || a.mao === 'esquerda', `${slug}: lado inválido`);
      assert.match(a.cor, /^#[0-9A-F]{6}$/i, `${slug}: cor de adorno inválida`);
    }
    const aneis = identidadeDaMao(slug).adornos.filter((a) => a.tipo === 'anel');
    for (const anel of aneis) {
      assert.equal(anel.mao, 'direita', `${slug}: anel fora da mão direita`);
      assert.equal(anel.onde, 'anelar');
    }
  }
  const comAnel = SLUGS.filter((s) => identidadeDaMao(s).adornos.some((a) => a.tipo === 'anel'));
  assert.deepEqual(comAnel.sort(), ['esterex', 'gabizinsky', 'matheus']);
});

test('maoDoLado devolve só o que está naquela mão', () => {
  const dir = maoDoLado('matheus', 'direita');
  const esq = maoDoLado('matheus', 'esquerda');
  assert.equal(dir.lado, 'direita');
  assert.equal(esq.lado, 'esquerda');
  // O punho direito dele é o cheio: aliança, pérolas e corrente. O esquerdo tem
  // uma corrente só — é o que matheus-pulso.svg desenha e o gerador confirma.
  assert.equal(dir.adornos.length, 3);
  assert.equal(esq.adornos.length, 1);
  assert.equal(esq.adornos[0].tipo, 'corrente');
  assert.ok(dir.adornos.every((a) => a.mao === 'direita'));
  // Os nomes de osso da mão de primeira pessoa também servem como lado, para a
  // mesa não ter de traduzir 'Left' → 'esquerda' em cada quadro.
  assert.deepEqual(maoDoLado('matheus', 'Left'), esq);
  assert.deepEqual(maoDoLado('matheus', 'Right'), dir);
  // Pele e manga continuam inteiras no recorte de um lado só.
  assert.equal(dir.pele, identidadeDaMao('matheus').pele);
  assert.equal(dir.manga.cor, identidadeDaMao('matheus').manga.cor);
});

test('ninguém do elenco tem unha pintada — e o Junior é o único sem arte de mão', () => {
  for (const slug of SLUGS) {
    // Se um dia alguém desenhar esmalte, este teste cai e obriga a atualizar a
    // tabela junto com a arte. É de propósito: hoje `unha` é uma ausência
    // documentada, não um campo esquecido.
    assert.equal(identidadeDaMao(slug).unha, null, `${slug} ganhou unha sem avisar`);
  }
  const semArte = SLUGS.filter((s) => identidadeDaMao(s).semArteDeMao);
  assert.deepEqual(semArte, ['junior'], 'só o Junior está de mãos nos bolsos');
});

test('o resultado é congelado: ninguém pinta a tabela por engano', () => {
  const m = identidadeDaMao('mufasa');
  assert.ok(Object.isFrozen(m));
  assert.ok(Object.isFrozen(m.manga));
  assert.ok(Object.isFrozen(m.adornos));
  assert.throws(() => { m.pele = '#000000'; }, TypeError);
  // E duas chamadas não compartilham objeto mutável nenhum.
  assert.notEqual(identidadeDaMao('matheus').adornos, identidadeDaMao('matheus').adornos);
});

// ---------------------------------------------------------------------------
// Contra a ARTE, não contra a tabela: os closes de punho do elenco existem em
// tamanho grande e são a prova de que a tabela não foi inventada. Se o desenho
// mudar de cor, este teste cai — que é exatamente o que se quer, porque é a
// arte que manda.
// ---------------------------------------------------------------------------

test('matheus-pulso.svg confirma manga, pele, aliança e pérolas', () => {
  const svg = fs.readFileSync(path.join(ARTE, 'matheus-pulso.svg'), 'utf8');
  const m = identidadeDaMao('matheus');
  assert.ok(svg.includes(m.pele), 'a pele da tabela não está no close do punho');
  assert.ok(svg.includes(m.manga.cor), 'a cor da manga não está no close');
  const anel = m.adornos.find((a) => a.tipo === 'anel');
  const perola = m.adornos.find((a) => a.tipo === 'pulseira');
  assert.ok(svg.includes(anel.cor), 'o ouro da aliança não está no close');
  assert.ok(svg.includes(perola.cor), 'a pérola não está no close');
  assert.ok(svg.includes(TINTA), 'o contorno do elenco não está no close');
});

test('gabizinsky-anel.svg confirma prata e a pedra em coração', () => {
  const svg = fs.readFileSync(path.join(ARTE, 'gabizinsky-anel.svg'), 'utf8');
  const anel = identidadeDaMao('gabizinsky').adornos.find((a) => a.tipo === 'anel');
  assert.equal(anel.metal, 'prata');
  assert.ok(svg.includes(anel.cor), 'a prata do anel não está no close');
  assert.ok(svg.includes(anel.pedra), 'o rubi do coração não está no close');
  // O close é de manga curta: o antebraço chega nu à mão, e é por isso que a
  // manga azul dela não entra no quadro da primeira pessoa.
  assert.equal(mangaNoQuadro(identidadeDaMao('gabizinsky').manga), false);
});
