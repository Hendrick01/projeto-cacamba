import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { carregaCPU } from '../scripts/modelo-node.mjs';
import { encaixaModelo, criaBanqueta } from '../public/modelo3d.js';
import { MESA, atualizaInteracao, conectaLeque, arrumaLeque, gestoCarta, ajustaBanqueta } from '../public/interacao3d.js';

const world = (o) => o.getWorldPosition(new T.Vector3());

// O elenco vem esculpido já sentado e segurando as cartas: malha estática, sem esqueleto.
// A mesa então não move braços nem dedos — pendura o leque no ponto das mãos, faz a carta
// voar e atua com o CORPO INTEIRO (vira para quem joga, respira, chega para a frente na
// própria vez). O que este teste guarda é o encaixe (escala, pés no chão, nós, leque na
// pinça, cadeira sob o nó `Assento`) e essa atuação.
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
    // parado (respiro desligado, fora da vez): o leque fica EXATAMENTE na pinça
    atualizaInteracao(m, 1 / 60, { parado: true });
    raiz.updateMatrixWorld(true);
    assert.ok(world(m.interacao.ancora).distanceTo(m.posLeque) < 1e-6, 'leque fora do ponto das mãos');
    const tamLeque = new T.Box3().setFromObject(leque, true).getSize(new T.Vector3());
    assert.ok(tamLeque.x > 0.15 && tamLeque.x < 0.45, `leque fora da escala humana: ${tamLeque.x.toFixed(2)} m`);

    // respiro: o corpo sobe e desce, mas em milímetros — não é um pulo
    const repouso = m.interacao.repousoRaiz.clone();
    let maior = 0;
    for (let f = 0; f < 90; f++) { atualizaInteracao(m, 1 / 60); maior = Math.max(maior, Math.abs(raiz.position.y - repouso.y)); }
    assert.ok(maior > 0.002 && maior < 0.02, `respiro de ${(maior * 100).toFixed(1)} cm`);

    // vira para quem está jogando: menos que o pedido (é o tronco, não o pescoço) e para o lado certo
    for (let f = 0; f < 120; f++) atualizaInteracao(m, 1 / 60, { olhar: 0.5 });
    assert.ok(raiz.rotation.y > 0.2 && raiz.rotation.y < 0.5, `girou ${raiz.rotation.y.toFixed(2)} rad`);
    for (let f = 0; f < 120; f++) atualizaInteracao(m, 1 / 60, { olhar: 0 });
    assert.ok(Math.abs(raiz.rotation.y) < 0.02, 'não voltou de frente para a mesa');

    // na própria vez: chega para a frente e levanta o leque
    const zAntes = raiz.position.z, lequeAntes = m.interacao.ancora.position.y;
    for (let f = 0; f < 120; f++) atualizaInteracao(m, 1 / 60, { suaVez: true });
    assert.ok(raiz.position.z - zAntes > 0.03, `não chegou para a frente (${(raiz.position.z - zAntes).toFixed(3)} m)`);
    assert.ok(m.interacao.ancora.position.y - lequeAntes > 0.03, 'o leque não subiu na vez dele');
    for (let f = 0; f < 120; f++) atualizaInteracao(m, 1 / 60);
    assert.ok(Math.abs(raiz.position.z - zAntes) < 0.005, 'não voltou ao lugar depois da vez');

    // ninguém entra no feltro: no raio da roda de cadeiras, nenhum vértice
    // pode cair na fatia do tampo (as mãos passam POR CIMA, os joelhos por
    // baixo). É o que o recuo automático de `encaixaModelo` garante.
    {
      const v = new T.Vector3(); const rt = MESA.raio + 0.01; let dentro = 0;
      raiz.updateMatrixWorld(true);
      raiz.traverse((o) => {
        if (!o.isMesh) return;
        const pa = o.geometry.attributes.position;
        for (let k = 0; k < pa.count; k++) {
          v.fromBufferAttribute(pa, k).applyMatrix4(o.matrixWorld);
          if (v.y < MESA.altura - 0.03 || v.y > MESA.altura + 0.02) continue;
          if (Math.hypot(v.x, MESA.assento - v.z) < rt - 1e-4) dentro++;
        }
      });
      assert.equal(dentro, 0, `${dentro} vértices dentro do tampo (recuo de ${(m.recuo * 100).toFixed(1)} cm)`);
    }

    // sem braços não há gesto de braço: a carta voa e o corpo fica parado
    assert.equal(gestoCarta(m, 'comprar', raiz.localToWorld(new T.Vector3(0, 0.9, 0.5))), false);
    // a cadeira vai para o nó `Assento` — sob o quadril, e não onde a caixa manda
    const banco = criaBanqueta(0x405c50);
    ajustaBanqueta(m, banco);
    assert.ok(m.posAssento, 'sem o nó Assento');
    assert.ok(Math.abs(banco.position.z - m.posAssento.z) < 1e-6 && Math.abs(banco.position.x - m.posAssento.x) < 1e-6, 'cadeira fora do assento medido');
    const topo = banco.userData.alturaAssento * banco.scale.y;
    assert.ok(Math.abs(topo - m.posAssento.y) < 0.06, `assento da cadeira a ${topo.toFixed(2)} m e o corpo a ${m.posAssento.y.toFixed(2)} m`);
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
