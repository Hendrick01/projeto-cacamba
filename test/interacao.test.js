import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { carregaCPU } from '../scripts/modelo-node.mjs';
import { encaixaModelo, criaBanqueta } from '../public/modelo3d.js';
import { MESA, atualizaInteracao, conectaLeque, arrumaLeque, gestoCarta, ajustaBanqueta } from '../public/interacao3d.js';

const world = (o) => o.getWorldPosition(new T.Vector3());
const OSSOS_BRACO = ['LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand'];
const PERNAS = ['LeftUpLeg', 'RightUpLeg', 'LeftFoot', 'RightFoot'];

for (const slug of ['matheus', 'junior', 'dri', 'esterex', 'gabizinsky', 'lyly', 'mafra-kitty', 'mufasa']) {
  test(`${slug}: pose assada, tronco reto, cabeça à frente, leque na mão e gesto que volta`, async () => {
    const gltf = await carregaCPU(slug);
    // o que o arquivo traz, antes de qualquer encaixe: a cabeça foi assada olhando para a frente
    gltf.scene.updateMatrixWorld(true);
    const cabecaAssada = gltf.scene.getObjectByName('Head').getWorldQuaternion(new T.Quaternion());
    const m = encaixaModelo(gltf, slug, { estilo: 'original', avisa: false });
    const raiz = m.raiz;
    const osso = (n) => raiz.getObjectByName(n);
    const leque = new T.Group();
    for (let i = 0; i < 9; i++) leque.add(new T.Mesh(new T.PlaneGeometry(0.42, 0.59), new T.MeshStandardMaterial()));
    const carta = new T.Mesh(new T.PlaneGeometry(0.42, 0.59), new T.MeshStandardMaterial());
    carta.scale.setScalar(0.26);
    conectaLeque(m, leque, carta); arrumaLeque(leque, 9);
    atualizaInteracao(m, 0, { parado: true });
    raiz.updateMatrixWorld(true);

    // tronco endireitado: os dois ombros na mesma linha de frente
    const oe = raiz.worldToLocal(world(osso('LeftArm'))), od = raiz.worldToLocal(world(osso('RightArm')));
    assert.ok(Math.abs(oe.z - od.z) < 0.03, `ombros desalinhados em z: ${oe.z.toFixed(3)} vs ${od.z.toFixed(3)}`);
    // a cabeça continua olhando para onde foi assada (para a frente)
    const cabeca = osso('Head').getWorldQuaternion(new T.Quaternion());
    assert.ok(cabeca.angleTo(cabecaAssada) < 0.02, `cabeça girou ${(cabeca.angleTo(cabecaAssada) * 180 / Math.PI).toFixed(1)}° em relação ao arquivo`);
    // as mãos ficam à frente do tronco, uma de cada lado, na altura do peito
    const me = raiz.worldToLocal(world(osso('LeftHand'))), md = raiz.worldToLocal(world(osso('RightHand')));
    assert.ok(me.z > 0.05 && md.z > 0.05, `mãos atrás do corpo: z ${me.z.toFixed(2)} / ${md.z.toFixed(2)}`);
    assert.ok(me.x > md.x, 'mãos cruzadas');
    for (const p of [me, md]) assert.ok(p.y > 0.75 && p.y < 1.05, `mão fora da altura do peito: ${p.y.toFixed(2)}`);
    // o leque pendurado na palma esquerda, pertinho dela
    assert.equal(leque.parent, m.interacao.ancora);
    assert.ok(world(m.interacao.ancora).distanceTo(world(osso('LeftHand'))) < 0.09, 'leque longe da mão esquerda');
    const tamLeque = new T.Box3().setFromObject(leque, true).getSize(new T.Vector3());
    assert.ok(tamLeque.x > 0.15 && tamLeque.x < 0.45, `leque fora da escala humana: ${tamLeque.x.toFixed(2)} m`);
    // a carta solta vive na mão direita, em metros (o rig está em centímetros)
    assert.equal(carta.parent, osso('RightHand'));
    const escalaCarta = carta.getWorldScale(new T.Vector3());
    assert.ok(Math.abs(escalaCarta.y - 0.26) < 0.01, `carta solta na escala ${escalaCarta.y.toFixed(3)} (pedida 0,26)`);

    // repouso: em pé parado, os braços são os do arquivo — quadro após quadro
    const antes = OSSOS_BRACO.map((n) => osso(n).quaternion.clone());
    for (let f = 0; f < 30; f++) atualizaInteracao(m, 1 / 60);
    OSSOS_BRACO.forEach((n, k) => assert.ok(osso(n).quaternion.angleTo(antes[k]) < 1e-6, `${n} se mexeu em repouso`));
    // e a correção do tronco não acumula de um quadro para o outro
    const cabeca2 = osso('Head').getWorldQuaternion(new T.Quaternion());
    assert.ok(cabeca2.angleTo(cabecaAssada) < 0.02, 'a correção da cabeça acumulou');

    // o banco fica sob o quadril, na folga da pose assada
    const banco = criaBanqueta(0x405c50); ajustaBanqueta(m, banco);
    const topo = banco.scale.y * banco.userData.alturaAssento;
    const quadril = raiz.worldToLocal(world(osso('Hips'))).y + raiz.position.y;
    assert.ok(Math.abs(quadril - topo - MESA.folgaQuadril) < 0.03 || banco.scale.y === 0.85 || banco.scale.y === 1.3, `banco a ${(quadril - topo).toFixed(3)} do quadril`);

    // gestos: a mão direita vai até o alvo e volta; pernas e mão esquerda ficam
    const pernas = PERNAS.map((n) => world(osso(n)));
    const esqAntes = world(osso('LeftHand'));
    let mesh; raiz.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    for (const tipo of ['comprar', 'descartar', 'baixar']) {
      const repouso = world(osso('RightHand'));
      const alvo = raiz.localToWorld(new T.Vector3(-0.1, 0.9, 0.55));
      assert.ok(gestoCarta(m, tipo, alvo));
      let maisPerto = Infinity, viuCarta = false;
      for (let f = 0; f < 90; f++) {
        atualizaInteracao(m, 1 / 60);
        raiz.updateMatrixWorld(true);
        const d = world(osso('RightHand')).distanceTo(alvo);
        maisPerto = Math.min(maisPerto, d);
        if (carta.visible) viuCarta = true;
        if (f % 15) continue;
        mesh.skeleton.update();
        const p = new T.Vector3();
        for (let vtx = 0; vtx < mesh.geometry.attributes.position.count; vtx += 7) {
          mesh.getVertexPosition(vtx, p).applyMatrix4(mesh.matrixWorld);
          assert.ok(Number.isFinite(p.x + p.y + p.z), 'vértice inválido durante o gesto');
          assert.ok(p.y >= -0.002, `pé abaixo do chão: ${p.y.toFixed(3)}`);
        }
      }
      // o alvo fica além do braço (o resto do caminho a carta voa): basta a mão ir bem na direção dele
      assert.ok(maisPerto < repouso.distanceTo(alvo) - 0.08, `${tipo}: a mão direita não foi ao alvo (de ${repouso.distanceTo(alvo).toFixed(2)} chegou a ${maisPerto.toFixed(2)})`);
      assert.ok(viuCarta, `${tipo}: a carta nunca apareceu`);
      assert.equal(m.interacao.evento, null, `${tipo}: gesto não terminou`);
      assert.equal(carta.visible, false, `${tipo}: carta ficou visível`);
      assert.ok(world(osso('RightHand')).distanceTo(repouso) < 1e-3, `${tipo}: a mão direita não voltou`);
      assert.ok(world(osso('LeftHand')).distanceTo(esqAntes) < 1e-3, `${tipo}: a mão esquerda se mexeu`);
    }
    PERNAS.forEach((n, k) => assert.ok(world(osso(n)).distanceTo(pernas[k]) < 1e-6, 'gesto arrastou as pernas'));
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
