import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../public/vendor/three.module.js';
import { carregaCPU } from '../scripts/modelo-node.mjs';

// A mão que você vê nas pontas do leque é a mão do SEU personagem, recortada da
// própria escultura (scripts/mao_primeira_pessoa.py). O que este teste guarda é o
// contrato que mesa3d.js espera: os dois nós, tamanho de mão, cor nos vértices
// (não há textura — o atlas do gerador espalha os triângulos da mão pelo mapa
// inteiro) e peso pequeno, porque isto entra no primeiro carregamento da partida.
const ELENCO = ['matheus', 'junior', 'dri', 'esterex', 'gabizinsky', 'lyly', 'mafra-kitty', 'mufasa'];

for (const slug of ELENCO) {
  test(`${slug}: as duas mãos da primeira pessoa`, async () => {
    const caminho = new URL(`../public/models/${slug}-maos.glb`, import.meta.url);
    assert.ok(fs.existsSync(caminho), 'falta o arquivo — rode scripts/mao_primeira_pessoa.py');
    assert.ok(fs.statSync(caminho).size < 220 * 1024, `${(fs.statSync(caminho).size / 1024).toFixed(0)} kB: pesado para carregar junto com a partida`);

    const gltf = await carregaCPU(`${slug}-maos`);
    for (const nome of ['Esq', 'Dir']) {
      const o = gltf.scene.getObjectByName(nome);
      assert.ok(o?.isMesh, `sem o nó ${nome}`);
      const g = o.geometry;
      assert.ok(g.attributes.color, 'sem COLOR_0: a mão sairia branca');
      assert.ok(g.attributes.normal, 'sem NORMAL: a mão sairia facetada');
      const tri = g.index.count / 3;
      assert.ok(tri > 200 && tri < 4000, `${tri} triângulos`);
      // tamanho de mão, e a origem no ponto da pinça (é por ela que a mesa a
      // encosta na ponta do leque), com a palma para baixo dela
      const c = new T.Box3().setFromObject(o).getSize(new T.Vector3());
      assert.ok(c.x > 0.05 && c.x < 0.25, `largura de ${(c.x * 100).toFixed(0)} cm`);
      assert.ok(c.y > 0.05 && c.y < 0.30, `altura de ${(c.y * 100).toFixed(0)} cm`);
    }
    // uma de cada lado: as duas mãos NÃO são a mesma malha espelhada (espelhar
    // com escala negativa viraria as normais do avesso)
    const esq = gltf.scene.getObjectByName('Esq'), dir = gltf.scene.getObjectByName('Dir');
    assert.notEqual(esq.geometry.attributes.position.count, 0);
    assert.notEqual(esq.geometry.uuid, dir.geometry.uuid);
  });
}
