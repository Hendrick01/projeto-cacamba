import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startRound, applyAction, viewFor, botNextAction, playerById,
  GEO, RECURSOS, CUSTOS, PECAS, META, TETO_DE_VEZES, chances,
  pontos, pontosVisiveis, maiorRua, taxas, legais, podeCasaEm,
} from '../shared/puxadinho.js';
import { mulberry32 } from '../shared/engine.js';

const ids = ['p0', 'p1', 'p2', 'p3'];
const mesa = (seed = 7, n = 4, opts = {}) => {
  const s = createGame(ids.slice(0, n).map((id) => ({ id, name: id.toUpperCase(), isBot: false })), { rnd: mulberry32(seed), ...opts });
  startRound(s);
  return s;
};
// Partida já no meio: tabuleiro vazio, vez de p0, fase de ações.
const emJogo = (seed = 7, n = 4) => {
  const s = mesa(seed, n);
  s.colocacao = null; s.phase = 'acoes'; s.dono = 0; s.turn = 0;
  return s;
};
const vez = (s, i, fase = 'acoes') => { s.dono = i; s.turn = i; s.phase = fase; s.jogouCarta = false; };
const da = (s, id, rec) => { for (const [r, n] of Object.entries(rec)) playerById(s, id).recursos[r] += n; };
const age = (s, id, a) => applyAction(s, id, a);
const arestaEntre = (a, b) => GEO.arestas.findIndex((x) => x.v[0] === Math.min(a, b) && x.v[1] === Math.max(a, b));
// Dados viciados: cada valor do dado vira o número que o gerador devolve.
const dados = (...valores) => { let i = 0; return () => (valores[i++ % valores.length] - 1) / 6 + 0.01; };
const CENTRO = GEO.hexes.findIndex((h) => h.q === 0 && h.r === 0);
const C = GEO.hexes[CENTRO];

// ---------------------------------------------------------------------------
// Tabuleiro
// ---------------------------------------------------------------------------

test('o tabuleiro tem 19 terrenos, 54 esquinas, 72 lados e 30 de beira', () => {
  assert.equal(GEO.hexes.length, 19);
  assert.equal(GEO.vertices.length, 54);
  assert.equal(GEO.arestas.length, 72);
  assert.equal(GEO.beira.length, 30);
  for (const v of GEO.vertices) {
    assert.ok(v.vizinhos.length >= 2 && v.vizinhos.length <= 3);
    assert.equal(v.vizinhos.length, v.arestas.length);
    assert.ok(v.hexes.length >= 1 && v.hexes.length <= 3);
  }
  assert.equal(C.vizinhos.length, 6);
  // linhas de 3-4-5-4-3
  const porLinha = [-2, -1, 0, 1, 2].map((r) => GEO.hexes.filter((h) => h.r === r).length);
  assert.deepEqual(porLinha, [3, 4, 5, 4, 3]);
});

test('as 9 vagas de revenda ficam na beira e nunca dividem esquina', () => {
  const vagas = GEO.vagasDeRevenda;
  assert.equal(vagas.length, 9);
  const esquinas = vagas.flatMap((e) => GEO.arestas[e].v);
  assert.equal(new Set(esquinas).size, 18);
  for (const e of vagas) assert.equal(GEO.arestas[e].hexes.length, 1);
});

test('terrenos, plaquinhas e revendas saem nas quantidades certas; 6 e 8 nunca vizinhos', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = mesa(seed);
    const conta = (t) => s.tabuleiro.filter((h) => h.t === t).length;
    assert.deepEqual(
      ['pedreira', 'areal', 'olaria', 'cimenteira', 'ferrovelho', 'prefeitura'].map(conta),
      [3, 4, 4, 4, 3, 1],
    );
    const nums = s.tabuleiro.filter((h) => h.t !== 'prefeitura').map((h) => h.n).sort((a, b) => a - b);
    assert.deepEqual(nums, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
    assert.equal(s.tabuleiro[s.fiscal].t, 'prefeitura');
    assert.equal(s.tabuleiro[s.fiscal].n, 0);
    const quente = (h) => [6, 8].includes(s.tabuleiro[h].n);
    GEO.hexes.forEach((h, i) => { if (quente(i)) for (const j of h.vizinhos) assert.ok(!quente(j), `seed ${seed}: 6/8 vizinhos`); });
    const tipos = s.revendas.map((r) => r.tipo).sort();
    assert.deepEqual(tipos, ['areia', 'cimento', 'ferro', 'geral', 'geral', 'geral', 'geral', 'pedra', 'tijolo']);
    assert.equal(s.deck.length, 25);
  }
  assert.equal(chances(6), 5); assert.equal(chances(2), 1); assert.equal(chances(12), 1); assert.equal(chances(0), 0);
});

// ---------------------------------------------------------------------------
// Colocação inicial
// ---------------------------------------------------------------------------

test('a colocação vai e volta em cobra, e a 2ª casa rende o material em volta', () => {
  const s = mesa(3);
  const primeiro = s.turn;
  const ordem = [];
  while (s.phase === 'colocacao') {
    const p = s.players[s.turn];
    ordem.push(s.turn);
    const l = legais(s, p.id);
    const v = l.casa[0];
    const antes = { ...p.recursos };
    age(s, p.id, { a: 'casa', alvo: v });
    const segunda = ordem.length > 4;
    const esperado = {};
    for (const h of GEO.vertices[v].hexes) {
      const r = { pedreira: 'pedra', areal: 'areia', olaria: 'tijolo', cimenteira: 'cimento', ferrovelho: 'ferro' }[s.tabuleiro[h].t];
      if (r) esperado[r] = (esperado[r] || 0) + 1;
    }
    for (const r of RECURSOS) assert.equal(p.recursos[r] - antes[r], segunda ? (esperado[r] || 0) : 0);
    assert.throws(() => age(s, p.id, { a: 'casa', alvo: l.casa[1] }), /rua/);
    age(s, p.id, { a: 'rua', alvo: legais(s, p.id).rua[0] });
  }
  const ida = [0, 1, 2, 3].map((i) => (primeiro + i) % 4);
  assert.deepEqual(ordem, [...ida, ...ida.slice().reverse()]);
  assert.equal(s.phase, 'rolar');
  assert.equal(s.dono, primeiro);
  for (const p of s.players) {
    assert.equal(p.pecas.casa, PECAS.casa - 2);
    assert.equal(p.pecas.rua, PECAS.rua - 2);
    assert.equal(pontos(s, p.id), 2);
  }
});

test('regra de distância e rua da colocação encostada na casa nova', () => {
  const s = mesa(4);
  const p = s.players[s.turn];
  const v = GEO.hexes[CENTRO].vertices[0];
  age(s, p.id, { a: 'casa', alvo: v });
  const longe = GEO.arestas.findIndex((a) => !a.v.includes(v));
  assert.throws(() => age(s, p.id, { a: 'rua', alvo: longe }), /sair da casa/);
  age(s, p.id, { a: 'rua', alvo: GEO.vertices[v].arestas[0] });
  const q = s.players[s.turn];
  for (const w of GEO.vertices[v].vizinhos) assert.throws(() => age(s, q.id, { a: 'casa', alvo: w }), /esquina livre/);
  assert.throws(() => age(s, p.id, { a: 'casa', alvo: 0 }), /vez/);
});

// ---------------------------------------------------------------------------
// Construção
// ---------------------------------------------------------------------------

test('casa precisa de material, de rua sua e da regra de distância; prédio devolve a peça da casa', () => {
  const s = emJogo();
  const [v0, v1, v2] = C.vertices;
  s.construcoes[v0] = { p: 'p0', tipo: 'casa' };
  s.ruas[C.arestas[0]] = 'p0';   // v0–v1
  assert.throws(() => age(s, 'p0', { a: 'rua', alvo: C.arestas[1] }), /Falta material/);
  da(s, 'p0', { pedra: 2, areia: 2, tijolo: 1, cimento: 1 });
  age(s, 'p0', { a: 'rua', alvo: C.arestas[1] });           // v1–v2
  assert.throws(() => age(s, 'p0', { a: 'casa', alvo: v1 }), /esquina livre/);   // vizinha da v0
  const longe = GEO.vertices.findIndex((x, i) => !s.construcoes[i] && podeCasaEm(s, 'p0', i, true) && !GEO.vertices[i].arestas.some((e) => s.ruas[e]));
  assert.throws(() => age(s, 'p0', { a: 'casa', alvo: longe }), /rua sua/);
  age(s, 'p0', { a: 'casa', alvo: v2 });
  assert.equal(pontos(s, 'p0'), 2);
  assert.deepEqual(playerById(s, 'p0').recursos, { pedra: 0, areia: 0, tijolo: 0, cimento: 0, ferro: 0 });
  da(s, 'p0', CUSTOS.predio);
  age(s, 'p0', { a: 'predio', alvo: v2 });
  assert.equal(s.construcoes[v2].tipo, 'predio');
  assert.equal(playerById(s, 'p0').pecas.casa, PECAS.casa);   // a casa voltou (a de v0 foi posta à mão)
  assert.equal(playerById(s, 'p0').pecas.predio, PECAS.predio - 1);
  assert.equal(pontos(s, 'p0'), 3);
  // o material pago volta ao fornecedor (o teste deu 3 ferros do nada)
  assert.equal(s.banca.ferro, 19 + 3);
});

test('rua não atravessa a esquina da casa de outro jogador', () => {
  const s = emJogo();
  const [v0, v1] = C.vertices;
  s.construcoes[v0] = { p: 'p0', tipo: 'casa' };
  s.ruas[C.arestas[0]] = 'p0';             // v0–v1
  s.construcoes[v1] = { p: 'p1', tipo: 'casa' };   // (posição forçada só para o teste)
  da(s, 'p0', { pedra: 1, areia: 1 });
  assert.throws(() => age(s, 'p0', { a: 'rua', alvo: C.arestas[1] }), /encostar/);   // v1–v2 passa pela casa de p1
  const outra = GEO.vertices[v0].arestas.find((e) => e !== C.arestas[0] && s.ruas[e] === undefined);
  age(s, 'p0', { a: 'rua', alvo: outra });
});

test('as peças acabam: 15 ruas, 5 casas, 4 prédios', () => {
  const s = emJogo();
  const p = playerById(s, 'p0');
  p.pecas.rua = 0;
  s.construcoes[C.vertices[0]] = { p: 'p0', tipo: 'casa' };
  da(s, 'p0', { pedra: 1, areia: 1 });
  assert.throws(() => age(s, 'p0', { a: 'rua', alvo: C.arestas[0] }), /Acabaram/);
});

// ---------------------------------------------------------------------------
// Dados e produção
// ---------------------------------------------------------------------------

// Tabuleiro controlado: só o centro produz (olaria, 5); o resto é prefeitura.
function soOCentro(s, t = 'olaria', n = 5) {
  s.tabuleiro = s.tabuleiro.map(() => ({ t: 'prefeitura', n: 0 }));
  s.tabuleiro[CENTRO] = { t, n };
  s.fiscal = 0;
}

test('o número rolado produz: casa 1, prédio 2; o terreno embargado não produz', () => {
  const s = emJogo();
  soOCentro(s);
  s.construcoes[C.vertices[0]] = { p: 'p0', tipo: 'casa' };
  s.construcoes[C.vertices[2]] = { p: 'p1', tipo: 'predio' };
  vez(s, 0, 'rolar');
  s.rnd = dados(2, 3);
  const ev = age(s, 'p0', { a: 'rolar' });
  assert.deepEqual(s.dados, [2, 3]);
  assert.equal(playerById(s, 'p0').recursos.tijolo, 1);
  assert.equal(playerById(s, 'p1').recursos.tijolo, 2);
  assert.equal(s.banca.tijolo, 16);
  assert.deepEqual(ev.find((e) => e.e === 'rolou').ganhos.p1.tijolo, 2);
  assert.equal(s.phase, 'acoes');

  age(s, 'p0', { a: 'passar' });
  s.fiscal = CENTRO;
  s.rnd = dados(4, 1);
  age(s, 'p1', { a: 'rolar' });
  assert.equal(playerById(s, 'p1').recursos.tijolo, 2);   // embargado: nada
});

test('fornecedor sem estoque: ninguém recebe, a não ser que só um tenha direito', () => {
  const s = emJogo();
  soOCentro(s);
  s.construcoes[C.vertices[0]] = { p: 'p0', tipo: 'casa' };
  s.construcoes[C.vertices[2]] = { p: 'p1', tipo: 'predio' };
  s.banca.tijolo = 2;   // pedem 3
  vez(s, 0, 'rolar');
  s.rnd = dados(2, 3);
  const ev = age(s, 'p0', { a: 'rolar' });
  assert.equal(playerById(s, 'p0').recursos.tijolo, 0);
  assert.equal(playerById(s, 'p1').recursos.tijolo, 0);
  assert.deepEqual(ev.find((e) => e.e === 'rolou').faltou, ['tijolo']);

  delete s.construcoes[C.vertices[0]];
  age(s, 'p0', { a: 'passar' });
  s.rnd = dados(2, 3);
  age(s, 'p1', { a: 'rolar' });
  assert.equal(playerById(s, 'p1').recursos.tijolo, 2);   // só ele: leva o que tem
  assert.equal(s.banca.tijolo, 0);
});

// ---------------------------------------------------------------------------
// O 7: fiscalização
// ---------------------------------------------------------------------------

test('7: quem tem mais de 7 devolve metade, em ordem; depois o fiscal muda de terreno e leva 1', () => {
  const s = emJogo();
  soOCentro(s);
  s.fiscal = 0;
  s.construcoes[C.vertices[0]] = { p: 'p1', tipo: 'casa' };
  da(s, 'p0', { pedra: 7 });                       // 7: não devolve
  da(s, 'p1', { areia: 5, ferro: 4 });             // 9: devolve 4
  da(s, 'p3', { cimento: 8 });                     // 8: devolve 4
  vez(s, 0, 'rolar');
  s.rnd = dados(3, 4);
  const ev = age(s, 'p0', { a: 'rolar' });
  assert.deepEqual(ev.find((e) => e.e === 'fiscalizacao').quem, [{ p: 'p1', n: 4 }, { p: 'p3', n: 4 }]);
  assert.equal(s.phase, 'descarte');
  assert.equal(s.players[s.turn].id, 'p1');
  assert.throws(() => age(s, 'p3', { a: 'descartar', recursos: { cimento: 4 } }), /sua vez/);
  assert.throws(() => age(s, 'p1', { a: 'descartar', recursos: { areia: 3 } }), /exatamente 4/);
  assert.throws(() => age(s, 'p1', { a: 'descartar', recursos: { areia: 2.5, ferro: 2, tijolo: -2 } }), /exatamente 4/);
  age(s, 'p1', { a: 'descartar', recursos: { areia: 2, ferro: 2 } });
  assert.equal(s.players[s.turn].id, 'p3');
  age(s, 'p3', { a: 'descartar', recursos: { cimento: 4 } });
  assert.equal(s.phase, 'fiscal');
  assert.equal(s.players[s.turn].id, 'p0');
  assert.throws(() => age(s, 'p0', { a: 'fiscal', h: 0 }), /outro terreno/);
  s.rnd = () => 0;
  const evf = age(s, 'p0', { a: 'fiscal', h: CENTRO });
  assert.deepEqual(evf[0], { e: 'fiscal', p: 'p0', h: CENTRO, de: 'p1', levou: true });
  assert.equal(s.fiscal, CENTRO);
  assert.equal(playerById(s, 'p1').recursos.areia, 2);   // o 1º da lista (areia) saiu
  assert.equal(playerById(s, 'p0').recursos.areia, 1);
  assert.equal(s.phase, 'acoes');
  // só ladrão e vítima sabem o que foi
  assert.equal(viewFor(s, 'p1').roubo.res, 'areia');
  assert.equal(viewFor(s, 'p2').roubo.res, undefined);
});

test('fiscal num terreno com dois vizinhos: escolhe de quem levar', () => {
  const s = emJogo();
  soOCentro(s);
  s.construcoes[C.vertices[0]] = { p: 'p1', tipo: 'casa' };
  s.construcoes[C.vertices[3]] = { p: 'p2', tipo: 'casa' };
  s.construcoes[C.vertices[2]] = { p: 'p0', tipo: 'casa' };   // a sua não conta
  da(s, 'p2', { ferro: 1 });
  vez(s, 0, 'fiscal');
  assert.throws(() => age(s, 'p0', { a: 'fiscal', h: CENTRO }), /de quem/);
  assert.throws(() => age(s, 'p0', { a: 'fiscal', h: CENTRO, de: 'p0' }), /de quem/);
  age(s, 'p0', { a: 'fiscal', h: CENTRO, de: 'p2' });
  assert.equal(playerById(s, 'p0').recursos.ferro, 1);
});

test('fiscal camarada (opção): não embarga terreno de quem tem 2 pontos ou menos', () => {
  const s = emJogo();
  s.opts.fiscalCamarada = true;
  soOCentro(s);
  s.construcoes[C.vertices[0]] = { p: 'p1', tipo: 'casa' };
  vez(s, 0, 'fiscal');
  assert.throws(() => age(s, 'p0', { a: 'fiscal', h: CENTRO }), /camarada/);
  s.construcoes[GEO.hexes[18].vertices[0]] = { p: 'p1', tipo: 'predio' };   // p1 com 3 pontos
  age(s, 'p0', { a: 'fiscal', h: CENTRO });
});

// ---------------------------------------------------------------------------
// Cartas de obra
// ---------------------------------------------------------------------------

test('carta comprada só se joga na vez seguinte; uma por vez; o Mestre vale antes de rolar', () => {
  const s = emJogo();
  soOCentro(s);
  s.construcoes[C.vertices[0]] = { p: 'p1', tipo: 'casa' };
  s.deck.push({ tipo: 'mestre' }, { tipo: 'mestre' });
  da(s, 'p0', { ferro: 2, tijolo: 2, cimento: 2 });
  age(s, 'p0', { a: 'comprarCarta' });
  age(s, 'p0', { a: 'comprarCarta' });
  assert.equal(viewFor(s, 'p1').players[0].cartasDeObra, 2);
  assert.throws(() => age(s, 'p0', { a: 'carta', tipo: 'mestre' }), /próxima/);
  age(s, 'p0', { a: 'passar' });
  for (const id of ['p1', 'p2', 'p3']) { age(s, id, { a: 'rolar' }); if (s.phase !== 'acoes') return; age(s, id, { a: 'passar' }); }
  // de novo na vez de p0, antes de rolar
  assert.equal(s.phase, 'rolar');
  age(s, 'p0', { a: 'carta', tipo: 'mestre' });
  assert.equal(s.phase, 'fiscal');
  age(s, 'p0', { a: 'fiscal', h: CENTRO });
  assert.equal(s.phase, 'rolar');   // volta para rolar
  assert.throws(() => age(s, 'p0', { a: 'carta', tipo: 'mestre' }), /Uma carta/);
  assert.equal(playerById(s, 'p0').mestres, 1);
});

test('Obra Pública não se joga e vale ponto escondido', () => {
  const s = emJogo();
  playerById(s, 'p0').cartas.push({ tipo: 'obra', nome: 'Praça', nova: false });
  assert.throws(() => age(s, 'p0', { a: 'carta', tipo: 'obra' }), /escondido/);
  assert.equal(pontos(s, 'p0'), 1);
  assert.equal(pontosVisiveis(s, 'p0'), 0);
  assert.equal(viewFor(s, 'p1').players[0].pontos, 0);
  assert.equal(viewFor(s, 'p0').you.pontos, 1);
});

test('Mutirão: duas ruas de graça; Achado: dois materiais; Arremate: todo o material de um tipo', () => {
  const s = emJogo();
  const p = playerById(s, 'p0');
  s.construcoes[C.vertices[0]] = { p: 'p0', tipo: 'casa' };
  p.cartas.push({ tipo: 'mutirao', nova: false }, { tipo: 'achado', nova: false }, { tipo: 'arremate', nova: false });
  age(s, 'p0', { a: 'carta', tipo: 'mutirao' });
  assert.equal(s.phase, 'mutirao');
  assert.throws(() => age(s, 'p0', { a: 'casa', alvo: C.vertices[2] }), /mutirão/);
  age(s, 'p0', { a: 'rua', alvo: C.arestas[0] });
  age(s, 'p0', { a: 'rua', alvo: C.arestas[1] });
  assert.equal(s.phase, 'acoes');
  assert.equal(p.pecas.rua, PECAS.rua - 2);
  assert.deepEqual(p.recursos, { pedra: 0, areia: 0, tijolo: 0, cimento: 0, ferro: 0 });

  s.jogouCarta = false;
  assert.throws(() => age(s, 'p0', { a: 'carta', tipo: 'achado', recursos: { ferro: 3 } }), /2 materiais/);
  age(s, 'p0', { a: 'carta', tipo: 'achado', recursos: { ferro: 1, cimento: 1 } });
  assert.equal(p.recursos.ferro, 1);
  assert.equal(s.banca.ferro, 18);

  s.jogouCarta = false;
  da(s, 'p1', { tijolo: 3 }); da(s, 'p3', { tijolo: 1, ferro: 2 });
  const ev = age(s, 'p0', { a: 'carta', tipo: 'arremate', recurso: 'tijolo' });
  assert.equal(p.recursos.tijolo, 4);
  assert.equal(playerById(s, 'p1').recursos.tijolo, 0);
  assert.equal(playerById(s, 'p3').recursos.ferro, 2);
  assert.deepEqual(ev[1].de, { p1: 3, p3: 1 });
});

// ---------------------------------------------------------------------------
// Títulos
// ---------------------------------------------------------------------------

test('Avenida Principal: 5 ruas seguidas; perde para uma maior; cortada e empatada fica guardada', () => {
  const s = emJogo();
  const [v0, , v2, , , v5] = C.vertices;
  // p0: 5 lados do centro (v0…v5) e mais dois para fora a partir de v5
  for (const e of C.arestas.slice(0, 5)) s.ruas[e] = 'p0';
  const o1 = GEO.vertices[v5].vizinhos.find((w) => !C.vertices.includes(w));
  const o2 = GEO.vertices[o1].vizinhos.find((w) => w !== v5);
  s.ruas[arestaEntre(v5, o1)] = 'p0';
  s.construcoes[v0] = { p: 'p0', tipo: 'casa' };
  // p2: 5 lados de um terreno da beira, longe
  const H18 = GEO.hexes[18];
  for (const e of H18.arestas.slice(0, 5)) s.ruas[e] = 'p2';
  assert.equal(maiorRua(s, 'p0'), 6);
  assert.equal(maiorRua(s, 'p2'), 5);

  da(s, 'p0', { pedra: 1, areia: 1 });
  const ev = age(s, 'p0', { a: 'rua', alvo: arestaEntre(o1, o2) });
  assert.deepEqual(ev.find((e) => e.e === 'avenida'), { e: 'avenida', p: 'p0', de: null, n: 7 });
  assert.equal(pontos(s, 'p0'), 3);

  // p1 corta em v2: sobram 2 e 5 para p0 — empata com p2 → título guardado
  const fora = GEO.vertices[v2].vizinhos.find((w) => !C.vertices.includes(w));
  s.ruas[arestaEntre(v2, fora)] = 'p1';
  age(s, 'p0', { a: 'passar' });
  vez(s, 1);
  da(s, 'p1', CUSTOS.casa);
  const ev2 = age(s, 'p1', { a: 'casa', alvo: v2 });
  assert.equal(maiorRua(s, 'p0'), 5);
  assert.deepEqual(ev2.find((e) => e.e === 'avenida'), { e: 'avenida', p: null, de: 'p0', n: 5 });
  assert.equal(s.avenida.id, null);
  assert.equal(pontos(s, 'p0'), 1);

  // p2 faz a 6ª e leva sozinho
  vez(s, 2);
  da(s, 'p2', { pedra: 1, areia: 1 });
  age(s, 'p2', { a: 'rua', alvo: H18.arestas[5] });
  assert.equal(s.avenida.id, 'p2');
});

test('Avenida Principal: empatar não toma o título de quem tem', () => {
  const s = emJogo();
  for (const e of C.arestas.slice(0, 4)) s.ruas[e] = 'p0';
  s.construcoes[C.vertices[0]] = { p: 'p0', tipo: 'casa' };
  da(s, 'p0', { pedra: 1, areia: 1 });
  age(s, 'p0', { a: 'rua', alvo: C.arestas[4] });
  assert.equal(s.avenida.id, 'p0');
  const H18 = GEO.hexes[18];
  for (const e of H18.arestas.slice(0, 4)) s.ruas[e] = 'p3';
  vez(s, 3);
  da(s, 'p3', { pedra: 1, areia: 1 });
  age(s, 'p3', { a: 'rua', alvo: H18.arestas[4] });
  assert.equal(s.avenida.id, 'p0');
});

test('Maior Equipe: 3 Mestres de Obras; perde para quem jogar mais', () => {
  const s = emJogo();
  playerById(s, 'p0').mestres = 2;
  playerById(s, 'p0').cartas.push({ tipo: 'mestre', nova: false });
  const ev = age(s, 'p0', { a: 'carta', tipo: 'mestre' });
  assert.deepEqual(ev.find((e) => e.e === 'equipe'), { e: 'equipe', p: 'p0', de: null, n: 3 });
  assert.equal(pontos(s, 'p0'), 2);
  age(s, 'p0', { a: 'fiscal', h: CENTRO });
  vez(s, 1);
  playerById(s, 'p1').mestres = 2;
  playerById(s, 'p1').cartas.push({ tipo: 'mestre', nova: false });
  age(s, 'p1', { a: 'carta', tipo: 'mestre' });
  assert.equal(s.equipe.id, 'p0');   // 3 não passa de 3
  age(s, 'p1', { a: 'fiscal', h: 0 });
  s.jogouCarta = false;
  playerById(s, 'p1').cartas.push({ tipo: 'mestre', nova: false });
  age(s, 'p1', { a: 'carta', tipo: 'mestre' });
  assert.equal(s.equipe.id, 'p1');
  assert.equal(pontos(s, 'p0'), 0);
});

// ---------------------------------------------------------------------------
// Trocas
// ---------------------------------------------------------------------------

test('fornecedor 4 por 1; revenda geral 3 por 1; especializada 2 por 1', () => {
  const s = emJogo();
  da(s, 'p0', { pedra: 4, ferro: 4 });
  assert.throws(() => age(s, 'p0', { a: 'banca', da: 'pedra', quer: 'pedra' }), /diferente/);
  age(s, 'p0', { a: 'banca', da: 'pedra', quer: 'tijolo' });
  assert.equal(playerById(s, 'p0').recursos.pedra, 0);
  assert.equal(playerById(s, 'p0').recursos.tijolo, 1);
  s.revendas = [{ e: GEO.vagasDeRevenda[0], tipo: 'geral' }, { e: GEO.vagasDeRevenda[4], tipo: 'ferro' }];
  s.construcoes[GEO.arestas[GEO.vagasDeRevenda[0]].v[0]] = { p: 'p0', tipo: 'casa' };
  assert.equal(taxas(s, 'p0').ferro, 3);
  s.construcoes[GEO.arestas[GEO.vagasDeRevenda[4]].v[1]] = { p: 'p0', tipo: 'casa' };
  assert.deepEqual(taxas(s, 'p0'), { pedra: 3, areia: 3, tijolo: 3, cimento: 3, ferro: 2 });
  age(s, 'p0', { a: 'banca', da: 'ferro', quer: 'areia', n: 2 });
  assert.equal(playerById(s, 'p0').recursos.ferro, 0);
  assert.equal(playerById(s, 'p0').recursos.areia, 2);
  assert.throws(() => age(s, 'p0', { a: 'banca', da: 'ferro', quer: 'areia' }), /precisa de 2/);
});

test('troca entre jogadores: o da vez oferece, os outros respondem, ele fecha com quem aceitou', () => {
  const s = emJogo();
  da(s, 'p0', { pedra: 2 });
  da(s, 'p2', { ferro: 1 });
  assert.throws(() => age(s, 'p0', { a: 'oferta', da: { pedra: 1 }, quer: { pedra: 1 } }), /ele mesmo/);
  assert.throws(() => age(s, 'p0', { a: 'oferta', da: { pedra: 3 }, quer: { ferro: 1 } }), /não tem/);
  assert.throws(() => age(s, 'p1', { a: 'oferta', da: { pedra: 1 }, quer: { ferro: 1 } }), /vez/);
  age(s, 'p0', { a: 'oferta', da: { pedra: 2 }, quer: { ferro: 1 } });
  assert.throws(() => age(s, 'p1', { a: 'responder', aceita: true }), /não tem/);
  age(s, 'p1', { a: 'responder', aceita: false });
  age(s, 'p2', { a: 'responder', aceita: true });
  assert.throws(() => age(s, 'p0', { a: 'fecharTroca', com: 'p1' }), /não aceitou/);
  const ev = age(s, 'p0', { a: 'fecharTroca', com: 'p2' });
  assert.equal(ev[0].e, 'trocou');
  assert.equal(playerById(s, 'p0').recursos.ferro, 1);
  assert.equal(playerById(s, 'p2').recursos.pedra, 2);
  assert.equal(s.oferta, null);
});

test('robô responde a oferta na hora: aceita o que o aproxima do que quer construir', () => {
  const s = createGame(ids.map((id, i) => ({ id, name: id, isBot: i > 0 })), { rnd: mulberry32(9) });
  startRound(s);
  s.colocacao = null; vez(s, 0);
  s.construcoes[C.vertices[0]] = { p: 'p1', tipo: 'casa' };
  s.ruas[C.arestas[0]] = 'p1';
  s.ruas[C.arestas[1]] = 'p1';   // tem esquina livre (v2): quer uma casa
  da(s, 'p1', { pedra: 1, areia: 1, tijolo: 1, ferro: 3 });   // falta cimento; ferro sobra
  da(s, 'p0', { cimento: 1 });
  const ev = age(s, 'p0', { a: 'oferta', da: { cimento: 1 }, quer: { ferro: 1 } });
  assert.ok(ev.some((e) => e.e === 'respondeu' && e.p === 'p1' && e.aceita === true));
  assert.ok(ev.some((e) => e.e === 'respondeu' && e.p === 'p2' && e.aceita === false));   // não tem ferro
  age(s, 'p0', { a: 'fecharTroca', com: 'p1' });
});

// ---------------------------------------------------------------------------
// Vitória
// ---------------------------------------------------------------------------

test('ganha quem chega a 10 na própria vez', () => {
  const s = emJogo();
  // p0: 4 prédios e uma casa = 9; constrói a 2ª casa
  const H = GEO.hexes;
  const longe = [0, 2, 7, 11].map((h) => H[h].vertices[0]);
  for (const v of longe) s.construcoes[v] = { p: 'p0', tipo: 'predio' };
  s.construcoes[C.vertices[0]] = { p: 'p0', tipo: 'casa' };
  s.ruas[C.arestas[0]] = 'p0'; s.ruas[C.arestas[1]] = 'p0';
  assert.equal(pontos(s, 'p0'), 9);
  // p1 também tem 10, mas não é a vez dele
  for (const h of [16, 18, 12, 14, 4]) s.construcoes[H[h].vertices[3]] = { p: 'p1', tipo: 'predio' };
  da(s, 'p0', CUSTOS.casa);
  const ev = age(s, 'p0', { a: 'casa', alvo: C.vertices[2] });
  assert.deepEqual(ev.at(-1), { e: 'venceu', p: 'p0', pontos: 10, motivo: 'meta' });
  assert.equal(s.phase, 'gameEnd');
  assert.equal(s.lastRound.pontos.p1, 10);
  assert.throws(() => age(s, 'p1', { a: 'rolar' }), /acabou/);
  // fim de jogo: os pontos escondidos aparecem
  assert.equal(viewFor(s, 'p2').players[1].pontos, 10);
});

test('com 10 fora da vez, a vitória vem quando a vez chega', () => {
  const s = emJogo();
  const H = GEO.hexes;
  for (const h of [16, 18, 12, 14, 4]) s.construcoes[H[h].vertices[3]] = { p: 'p1', tipo: 'predio' };
  da(s, 'p0', { pedra: 4 });
  age(s, 'p0', { a: 'banca', da: 'pedra', quer: 'ferro' });
  assert.equal(s.phase, 'acoes');   // p1 tem 10, mas a vez é de p0
  const ev = age(s, 'p0', { a: 'passar' });
  assert.deepEqual(ev.at(-1), { e: 'venceu', p: 'p1', pontos: 10, motivo: 'meta' });
});

test('teto de vezes: a partida acaba com quem tem mais pontos', () => {
  const s = emJogo();
  s.turnNo = TETO_DE_VEZES - 1;
  s.construcoes[C.vertices[0]] = { p: 'p2', tipo: 'casa' };
  const ev = age(s, 'p0', { a: 'passar' });
  assert.equal(s.phase, 'gameEnd');
  assert.deepEqual(ev.at(-1), { e: 'venceu', p: 'p2', pontos: 1, motivo: 'teto' });
});

// ---------------------------------------------------------------------------
// Visão
// ---------------------------------------------------------------------------

test('a visão mostra só a quantidade do material e das cartas dos outros', () => {
  const s = emJogo();
  da(s, 'p1', { ferro: 3 });
  playerById(s, 'p1').cartas.push({ tipo: 'mestre', nova: false });
  const v = viewFor(s, 'p0');
  const p1 = v.players.find((p) => p.id === 'p1');
  assert.equal(p1.handCount, 3);
  assert.equal(p1.cartasDeObra, 1);
  assert.equal(p1.recursos, undefined);
  assert.equal(/"tipo":"mestre"/.test(JSON.stringify(v)), false);
  assert.deepEqual(viewFor(s, 'p1').you.cartas, [{ tipo: 'mestre', nome: undefined, nova: false }]);
  assert.equal(v.turnId, 'p0');
  assert.deepEqual(v.you.legais.casa, []);
});

// ---------------------------------------------------------------------------
// Robôs
// ---------------------------------------------------------------------------

function partidaDeRobos(n, seed, opts = {}) {
  const s = createGame(ids.slice(0, n).map((id) => ({ id, name: id, isBot: true })), { rnd: mulberry32(seed), ...opts });
  startRound(s);
  let acoes = 0;
  while (s.phase !== 'gameEnd' && acoes < 5000) {
    const ator = s.players[s.turn];
    const a = botNextAction(s, ator.id);
    assert.ok(a, `seed ${seed}: robô sem ação na fase ${s.phase}`);
    applyAction(s, ator.id, a);
    acoes++;
  }
  return s;
}

test('partidas só de robôs terminam com alguém chegando a 10, sem jogada recusada', () => {
  for (const n of [3, 4]) {
    for (let seed = 1; seed <= 12; seed++) {
      const s = partidaDeRobos(n, seed, { nivelRobos: seed % 4 ? 'normal' : 'facil' });
      assert.equal(s.phase, 'gameEnd');
      assert.equal(s.lastRound.motivo, 'meta', `seed ${seed}, ${n} jogadores`);
      assert.ok(s.lastRound.pontos[s.vencedor] >= META);
      // material nunca some nem nasce: fornecedor + mãos = 19 de cada
      for (const r of RECURSOS) assert.equal(s.banca[r] + s.players.reduce((t, p) => t + p.recursos[r], 0), 19);
    }
  }
});

test('com as regras opcionais ligadas, os robôs também terminam', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const s = partidaDeRobos(4, seed, { fiscalCamarada: true, baralhoDeDados: true, cacamba: true, meta: 8 });
    assert.equal(s.lastRound.motivo, 'meta', `seed ${seed}`);
    assert.ok(s.lastRound.pontos[s.vencedor] >= 8);
    for (const r of RECURSOS) {
      assert.equal(s.banca[r] + s.cacamba[r] + s.players.reduce((t, p) => t + p.recursos[r], 0), 19);
    }
  }
});

test('o robô só age na vez dele (ou quando é ele quem precisa devolver material)', () => {
  const s = mesa(2);
  const outro = s.players[(s.turn + 1) % 4];
  assert.equal(botNextAction(s, outro.id), null);
  assert.ok(botNextAction(s, s.players[s.turn].id));
});
