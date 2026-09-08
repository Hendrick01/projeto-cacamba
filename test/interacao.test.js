import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { carregaCPU } from '../scripts/modelo-node.mjs';
import { encaixaModelo, criaBanqueta } from '../public/modelo3d.js';
import { MESA, atualizaInteracao, conectaLeque, arrumaLeque, gestoCarta, ajustaBanqueta } from '../public/interacao3d.js';

const world = (o) => o.getWorldPosition(new T.Vector3());

// O elenco vem esculpido já sentado e segurando as cartas: malha estática, sem esqueleto.
// A mesa então não move braços nem dedos — pendura o leque no ponto das mãos e faz a carta
// voar. O que este teste guarda é o encaixe: escala, pés no chão, nós e o leque na pinça.
for (const slug of ['matheus', 'junior', 'dri', 'esterex', 'gabizinsky', 'lyly', 'mafra-kitty', 'mufasa']) {
  test(`${slug}: sentado à mesa, com os nós do contrato e o leque nas mãos`, async () => {
    const gltf = await carregaCPU(slug);
    const m = encaixaModelo(gltf, slug, { estilo: 'original', avisa: false });
    const raiz = m.raiz;
    const no = (n) => raiz.getObjectByName(n);
    assert.equal(m.dedos.juntas.length, 0);
    let temOsso = false; raiz.traverse((o) => { if (o.isBone) temOsso = true; });
    assert.ok(!temOsso, 'o arquivo trouxe esqueleto');
    for (const n of ['Cabeca', 'MaoEsq', 'MaoDir']) assert.ok(no(n), `sem o nó ${n}`);

    raiz.updateMatrixWorld(true);
    const caixa = new T.Box3().setFromObject(raiz, true);
    const altura = caixa.max.y - caixa.min.y;
    assert.ok(Math.abs(altura - 1.45) < 0.05, `altura sentada ${altura.toFixed(2)} m`);
    assert.ok(Math.abs(caixa.min.y) < 0.03, `pés a ${caixa.min.y.toFixed(3)} do chão`);

    // as mãos: uma de cada lado, juntas na frente do peito e acima do tampo
    const esq = raiz.worldToLocal(world(no('MaoEsq'))), dir = raiz.worldToLocal(world(no('MaoDir')));
    assert.ok(esq.x > dir.x, 'MaoEsq e MaoDir trocadas de lado');
    assert.ok(esq.distanceTo(dir) < 0.25, `mãos a ${esq.distanceTo(dir).toFixed(2)} m uma da outra`);
    assert.ok(m.posLeque.y > MESA.altura && m.posLeque.y < 1.15, `leque a ${m.posLeque.y.toFixed(2)} m do chão`);
    assert.ok(m.alturaCabeca > m.posLeque.y, 'cabeça abaixo das mãos');

    // o leque nasce no ponto das mãos e fica na escala humana
    const leque = new T.Group();
    for (let i = 0; i < 9; i++) leque.add(new T.Mesh(new T.PlaneGeometry(0.42, 0.59), new T.MeshStandardMaterial()));
    conectaLeque(m, leque); arrumaLeque(leque, 9);
    for (let f = 0; f < 5; f++) atualizaInteracao(m, 1 / 60);
    raiz.updateMatrixWorld(true);
    assert.ok(world(m.interacao.ancora).distanceTo(m.posLeque) < 1e-6, 'leque fora do ponto das mãos');
    const tamLeque = new T.Box3().setFromObject(leque, true).getSize(new T.Vector3());
    assert.ok(tamLeque.x > 0.15 && tamLeque.x < 0.45, `leque fora da escala humana: ${tamLeque.x.toFixed(2)} m`);

    // sem braços não há gesto de braço: a carta voa e o corpo fica parado
    assert.equal(gestoCarta(m, 'comprar', raiz.localToWorld(new T.Vector3(0, 0.9, 0.5))), false);
    const banco = criaBanqueta(0x405c50), escalaBanco = banco.scale.y;
    ajustaBanqueta(m, banco);
    assert.equal(banco.scale.y, escalaBanco, 'sem osso do quadril a cadeira não deve ser remexida');
    assert.ok(m.materiais.every((mat) => !mat.transparent));
    m.mixer?.stopAllAction();
  });
}

test('importação sem ossos de dedos mantém leque na posição de apoio', () => {
  const g = { scene: new T.Group(), animations: [] };
  g.scene.add(new T.Mesh(new T.BoxGeometry(0.3, 1, 0.2), new T.MeshStandardMaterial()));
  const m = encaixaModelo(g, 'externo', { estilo: 'original', avisa: false }), leque = new T.Group();
  conectaLeque(m, leque); atualizaInteracao(m, 0, { parado: true });
  assert.ok(world(m.interacao.ancora).distanceTo(m.posLeque) < 1e-6);
});
