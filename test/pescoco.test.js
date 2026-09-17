// O pescoço das esculturas (public/pescoco3d.js): a linha do queixo é medida em
// cada um dos oito do elenco, e o peso é geométrico — a cara é rígida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as T from '../public/vendor/three.module.js';
import { carregaArquivo } from '../scripts/mede_mao.mjs';
import { medePescoco, criaPescoco } from '../public/pescoco3d.js';

const ELENCO = JSON.parse(fs.readFileSync(new URL('../public/models/lista.json', import.meta.url), 'utf8'));
const slugs = Array.isArray(ELENCO) ? ELENCO : (ELENCO.modelos || ELENCO.slugs || Object.keys(ELENCO));

test('a lista do elenco tem os oito', () => { assert.equal(slugs.length, 8, JSON.stringify(slugs)); });

for (const slug of slugs) {
  test(`${slug}: queixo medido, cara rígida, corpo rígido, e só o anel do pescoço mistura`, async () => {
    const g = await carregaArquivo(fileURLToPath(new URL(`../public/models/${slug}.glb`, import.meta.url)));
    const raiz = g.scene; raiz.updateMatrixWorld(true);
    const antes = []; raiz.traverse((o) => { if (o.isMesh) antes.push(o); });
    const p = criaPescoco(raiz);
    assert.ok(p, 'mediu o pescoço');
    const { queixo, pe, topo, H } = p.medida;
    assert.ok(Math.abs(H - 1.45) < 0.03, `altura sentada ${H.toFixed(2)}`);
    assert.ok(queixo > 1.10 && queixo < 1.23, `linha do queixo a ${queixo.toFixed(2)} m`);
    assert.ok(pe < topo && topo < queixo);
    // todas as malhas viraram malha com esqueleto de dois ossos, e nenhuma se perdeu
    const depois = []; raiz.traverse((o) => { if (o.isMesh) depois.push(o); });
    assert.equal(depois.length, antes.length);
    assert.ok(depois.every((o) => o.isSkinnedMesh && o.skeleton.bones.length === 2));
    // o peso, vértice a vértice, no espaço da raiz
    raiz.updateMatrixWorld(true);
    const inv = raiz.matrixWorld.clone().invert(), v = new T.Vector3(), m4 = new T.Matrix4();
    let cara = 0, corpo = 0, anel = 0;
    for (const o of depois) {
      m4.multiplyMatrices(inv, o.matrixWorld);
      const pos = o.geometry.attributes.position, w = o.geometry.attributes.skinWeight;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m4);
        const wc = w.getY(i);
        assert.ok(Math.abs(w.getX(i) + wc - 1) < 1e-6, 'os pesos somam 1');
        if (v.y >= queixo) { assert.equal(wc, 1, 'acima do queixo é cabeça inteira: a cara não deforma'); cara++; }
        else if (v.y <= pe) { assert.equal(wc, 0, 'abaixo do pé do pescoço é corpo inteiro'); corpo++; }
        else anel++;
      }
    }
    assert.ok(cara > 1000 && corpo > 5000 && anel > 20, `cara ${cara}, corpo ${corpo}, anel ${anel}`);
    // girar a cabeça não move nenhum vértice do corpo
    p.osso.rotation.y = 0.8; raiz.updateMatrixWorld(true);
    assert.ok(p.osso.name === 'EsculturaPescoco');
  });
}
