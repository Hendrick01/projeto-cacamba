import test from 'node:test';
import assert from 'node:assert/strict';
import { acabamentoMaterial, contatoVisual, criaTransicaoCamera, faseVisual, graoVisual, pulsoPiscar } from '../public/visual3d-core.js';

test('fase estavel, dessincronizada por personagem, dentro de 0..1', () => {
  assert.equal(faseVisual('dri'), faseVisual('dri'));
  assert.notEqual(faseVisual('dri'), faseVisual('gabizinsky'));
  for (const n of ['', 'dri', 'esterex', 'junior', 'lyly']) assert.ok(faseVisual(n) >= 0 && faseVisual(n) < 1);
});
test('piscar fecha e reabre sem extrapolar pesos de morph', () => {
  assert.equal(pulsoPiscar(0, 0), 0); assert.equal(pulsoPiscar(0.065, 0), 1);
  assert.equal(pulsoPiscar(0.18, 0), 0); assert.equal(pulsoPiscar(2, 0), 0);
  for (let t = -10; t < 20; t += 0.013) assert.ok(pulsoPiscar(t, 0.42) >= 0 && pulsoPiscar(t, 0.42) <= 1);
});
test('piscar tolera valores nao finitos sem NaN', () => {
  for (const n of [NaN, Infinity, -Infinity]) assert.ok(Number.isFinite(pulsoPiscar(n, n)));
});
test('camera inicia sem deslocamento', () => {
  assert.deepEqual(criaTransicaoCamera()({ y: 1.2, z: 1.8 }), { y: 1.2, z: 1.8 });
});
test('camera converge ao alvo original, nao ao quadro anterior', () => {
  const mover = criaTransicaoCamera(); mover({ y: 1.2, z: 1.35 });
  let p = mover({ y: 1.32, z: 2.6, dt: 1 / 60 });
  assert.ok(p.z > 1.35 && p.z < 2.6);
  for (let i = 0; i < 180; i++) p = mover({ ...p, dt: 1 / 60 });
  assert.ok(Math.abs(p.z - 2.6) < 0.00001); assert.ok(Math.abs(p.y - 1.32) < 0.00001);
});
test('camera converge igualmente a 30 e 60 quadros por segundo', () => {
  const simular = fps => {
    const mover = criaTransicaoCamera(); mover({ y: 1.2, z: 1.35 });
    let p = { y: 1.32, z: 2.6 };
    for (let i = 0; i < fps; i++) p = mover({ ...p, dt: 1 / fps });
    return p;
  };
  assert.ok(Math.abs(simular(30).z - simular(60).z) < 1e-12);
});
test('mudanca de orientacao aplica enquadramento imediatamente', () => {
  const mover = criaTransicaoCamera(); mover({ y: 1.2, z: 1.35, aspecto: 1.7 });
  assert.deepEqual(mover({ y: 1.32, z: 2.6, aspecto: 0.46, dt: 0.01 }), { y: 1.32, z: 2.6 });
});
test('preferencia por menos movimento desativa transicao', () => {
  const mover = criaTransicaoCamera(); mover({ y: 1.2, z: 1.35 });
  assert.deepEqual(mover({ y: 1.32, z: 2.6, reduzido: true }), { y: 1.32, z: 2.6 });
});
test('camera respeita o teto de recuo e recusa valores invalidos', () => {
  assert.equal(criaTransicaoCamera()({ z: 40, y: 1.2 }).z, 2.6);
  assert.equal(criaTransicaoCamera()({ z: -40, y: 1.2 }).z, 1.35);
  assert.deepEqual(criaTransicaoCamera()({ z: NaN, y: Infinity }), { y: 1.2, z: 1.35 });
});
test('camera pode trocar de alvo durante a transicao', () => {
  const mover = criaTransicaoCamera(); mover({ y: 1.2, z: 1.35 });
  const indo = mover({ y: 1.32, z: 2.6, dt: 0.1 });
  const voltando = mover({ y: 1.2, z: 1.35, dt: 0.1 });
  assert.ok(voltando.z < indo.z);
});
test('atlas desconhecido permanece nao metalico e sem inferencia de cor', () => {
  assert.deepEqual(acabamentoMaterial('Material_0'), { roughness: 0.78, metalness: 0, envMapIntensity: 0.3 });
  assert.ok(!('color' in acabamentoMaterial('pele'))); assert.ok(!('map' in acabamentoMaterial('pele')));
});
test('materiais explicitamente nomeados recebem acabamentos distintos', () => {
  assert.equal(acabamentoMaterial('tecido_algodao').roughness, 0.9);
  assert.equal(acabamentoMaterial('couro').roughness, 0.55);
  assert.equal(acabamentoMaterial('cromo_metal').metalness, 0.65);
  assert.equal(acabamentoMaterial('lente', true).roughness, 0.16);
  assert.notEqual(acabamentoMaterial('lente', false).roughness, 0.16);
});
test('grao procedural deterministico em RGBA, sem transparencia', () => {
  const a = graoVisual(16); assert.equal(a.length, 16 * 16 * 4);
  assert.deepEqual(a, graoVisual(16)); assert.notDeepEqual(a, graoVisual(16, 18));
  for (let i = 0; i < a.length; i += 4) {
    assert.ok(a[i] >= 112 && a[i] <= 143); assert.equal(a[i], a[i + 1]); assert.equal(a[i + 3], 255);
  }
});
test('textura de contato suave, bordas transparentes e centro escuro', () => {
  const a = contatoVisual(16); assert.equal(a.length, 16 * 16 * 4);
  assert.equal(a[3], 0); assert.ok(a[(7 * 16 + 7) * 4 + 3] > 180);
  assert.equal(a[(7 * 16 + 7) * 4 + 3], a[(8 * 16 + 8) * 4 + 3]);
  for (let i = 0; i < a.length; i += 4) assert.equal(a[i], 0);
});
test('texturas tem limite de memoria explicito', () => {
  for (const t of [-1, 1, 257, 3.5, NaN]) { assert.throws(() => graoVisual(t)); assert.throws(() => contatoVisual(t)); }
});
