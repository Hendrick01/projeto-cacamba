import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../public/vendor/three.module.js';
import { carregaCPU } from '../scripts/modelo-node.mjs';

// A mão de primeira pessoa que segura o leque sai POSADA do arquivo
// (scripts/mao_pose_segura.py), e não posada pelo jogo: a pose foi achada por
// medida contra o plano da carta, e é ela que cumpre o que se pede à vista —
// polegar cruzando na FRENTE das cartas, os outros quatro dedos fechados ATRÁS.
//
// Este teste refaz a mesma medida no arquivo entregue. Ele existe porque as
// duas metades falham em silêncio: sem o nó `PlanoDaCarta` a mesa volta a
// adivinhar de que lado a mão segura (era daí que saíam as mãos viradas ao
// contrário), e sem a pose nos ossos o modelo chega espalmado e atravessa o
// leque — os dois já aconteceram numa exportação distraída.

// Compõe o vértice deformado pelos ossos: a mesma conta de `medeAMao` na mesa e
// da GPU. `getVertexPosition` não serve aqui pela mesma razão que não servia lá:
// devolve no espaço do vínculo, que não é o espaço em que o plano vive.
function deformados(malha) {
  const { bones, boneInverses } = malha.skeleton;
  const pos = malha.geometry.attributes.position;
  const idx = malha.geometry.attributes.skinIndex, peso = malha.geometry.attributes.skinWeight;
  const base = new T.Vector3(), acc = new T.Vector3(), tmp = new T.Vector3(), m = new T.Matrix4();
  const fora = [];
  for (let i = 0; i < pos.count; i++) {
    base.fromBufferAttribute(pos, i);
    acc.set(0, 0, 0);
    let dono = 0, maior = -1;
    for (let k = 0; k < 4; k++) {
      const w = peso.getComponent(i, k);
      if (w > maior) { maior = w; dono = idx.getComponent(i, k); }
      if (!w) continue;
      const b = idx.getComponent(i, k);
      m.multiplyMatrices(bones[b].matrixWorld, boneInverses[b]);
      acc.addScaledVector(tmp.copy(base).applyMatrix4(m), w);
    }
    fora.push({ p: acc.clone(), osso: bones[dono].name });
  }
  return fora;
}

test('a mão esquerda vem posada e traz o plano da carta', async () => {
  const arquivo = new URL('../public/models/mao-fp-esq.glb', import.meta.url);
  assert.ok(fs.existsSync(arquivo), 'falta o arquivo — rode scripts/mao_pose_segura.py');
  assert.ok(fs.statSync(arquivo).size < 280 * 1024, `${(fs.statSync(arquivo).size / 1024).toFixed(0)} kB: pesado para o primeiro carregamento`);

  const gltf = await carregaCPU('mao-fp-esq');
  gltf.scene.updateMatrixWorld(true);

  const plano = gltf.scene.getObjectByName('PlanoDaCarta');
  assert.ok(plano, 'sem o nó PlanoDaCarta: a mesa não sabe de que lado a mão segura');
  const centro = plano.getWorldPosition(new T.Vector3());
  const normal = new T.Vector3(0, 0, 1).applyQuaternion(plano.getWorldQuaternion(new T.Quaternion()));

  let malha = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) malha = o; });
  assert.ok(malha, 'sem malha com esqueleto: sem osso não há pose');

  // a pose tem de estar NOS OSSOS: exportar na posição de repouso devolve a mão
  // espalmada, que é o que havia antes
  const dobra = malha.skeleton.bones
    .filter((b) => /Index|Middle|Ring|Pinky/.test(b.name))
    .reduce((m, b) => Math.max(m, 2 * Math.acos(Math.min(1, Math.abs(b.quaternion.w)))), 0);
  assert.ok(dobra > 0.2, `dedos quase retos (${(dobra * 180 / Math.PI).toFixed(0)}°): o arquivo saiu na posição de repouso`);

  let polegarNaFrente = 0, restoNaFrente = 0, pontaDoPolegar = -Infinity;
  for (const { p, osso } of deformados(malha)) {
    const d = p.sub(centro).dot(normal);
    if (/Thumb/.test(osso)) { if (d > 0) polegarNaFrente++; pontaDoPolegar = Math.max(pontaDoPolegar, d); }
    else if (d > 0) restoNaFrente++;
  }
  assert.equal(restoNaFrente, 0, `${restoNaFrente} vértices que não são do polegar à frente das cartas: a mão fura o leque`);
  assert.ok(polegarNaFrente > 0, 'nenhum vértice do polegar à frente: o polegar não aparece sobre as cartas');
  assert.ok(pontaDoPolegar > 0.01, `polegar só ${(pontaDoPolegar * 1000).toFixed(0)} milésimos à frente: some na espessura do leque`);
});

test('a mão direita fica rigada e aberta, que é como ela joga', async () => {
  const gltf = await carregaCPU('mao-fp-dir');
  let malha = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) malha = o; });
  assert.ok(malha, 'sem esqueleto: é o rig que faz a pinça na hora de pegar a carta');
  // ela não segura leque, mas precisa do mesmo contrato: é por ele que a mesa
  // sabe para onde a palma olha. Sem o nó, o encaixe antigo a punha de cabeça
  // para baixo ("a outra mão está ao contrário", 08/09/2026)
  assert.ok(gltf.scene.getObjectByName('PlanoDaCarta'), 'sem PlanoDaCarta: a mesa volta a adivinhar a orientação');
  const nomes = malha.skeleton.bones.map((b) => b.name);
  for (const junta of ['RightHand', 'RightThumb3', 'RightIndex2'])
    assert.ok(nomes.includes(junta), `sem o osso ${junta}, que primeira-pessoa-maos.js procura`);
});
