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

test('a mão direita vem posada em pinça, que é como ela pega a carta', async () => {
  const gltf = await carregaCPU('mao-fp-dir');
  gltf.scene.updateMatrixWorld(true);
  let malha = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) malha = o; });
  assert.ok(malha, 'sem esqueleto: sem osso não há pinça');
  // o mesmo contrato da esquerda: é por ele que a mesa sabe para onde a palma
  // olha e de onde o braço vem. Sem o nó, o encaixe antigo a punha de cabeça
  // para baixo ("a outra mão está ao contrário", 08/09/2026)
  assert.ok(gltf.scene.getObjectByName('PlanoDaCarta'), 'sem PlanoDaCarta: a mesa volta a adivinhar a orientação');

  // e a pinça tem de ESTAR FECHADA no arquivo: polegar e indicador a uma
  // espessura de leque um do outro, com o plano da carta entre os dois
  const p = gltf.scene.getObjectByName('PlanoDaCarta');
  const centro = p.getWorldPosition(new T.Vector3());
  const normal = new T.Vector3(0, 0, 1).applyQuaternion(p.getWorldQuaternion(new T.Quaternion()));
  const media = (osso) => {
    const pts = deformados(malha).filter((v) => v.osso === osso);
    return pts.reduce((a, v) => a.add(v.p), new T.Vector3()).multiplyScalar(1 / pts.length);
  };
  const polegar = media('RightThumb3'), indicador = media('RightIndex3');
  const folga = polegar.distanceTo(indicador);
  assert.ok(folga < 0.06, `${folga.toFixed(3)} entre as pontas: a mão não está pinçando`);
  // a carta passa ENTRE as duas pontas — uma de cada lado do plano. Qual delas
  // fica na frente é da pose e da orientação que a mesa dá; o que o contrato
  // garante é que existe uma carta ali no meio
  const dPol = polegar.clone().sub(centro).dot(normal), dInd = indicador.clone().sub(centro).dot(normal);
  assert.ok(dPol * dInd < 0, `a carta não passa entre as pontas (polegar ${dPol.toFixed(3)}, indicador ${dInd.toFixed(3)})`);
});

// ---------------------------------------------------------------------------
// A máquina de gestos (public/primeira-pessoa-maos.js)
// ---------------------------------------------------------------------------
// O módulo dos dedos não precisa do .glb para ser testado: ele só sabe girar
// juntas por nome. Um esqueleto de mentira com os ossos que ele procura mede a
// máquina inteira — transição, pulso e limite angular — sem carregar arquivo.
import {
  POSES_FP, GESTOS_FP, ANGULO_MAX_FP,
  criaRigPrimeiraPessoa, definePosePrimeiraPessoa, defineGestoPrimeiraPessoa,
  pulsoPrimeiraPessoa, cancelaPulsoPrimeiraPessoa, estadoGestoPrimeiraPessoa,
  atualizaRigPrimeiraPessoa,
} from '../public/primeira-pessoa-maos.js';

const DEDOS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

function maoDeMentira() {
  const raiz = new T.Object3D();
  for (const lado of ['Left', 'Right']) {
    const mao = new T.Bone(); mao.name = `${lado}Hand`; raiz.add(mao);
    for (const dedo of DEDOS) {
      let pai = mao;
      for (let s = 1; s <= 3; s++) {
        const b = new T.Bone(); b.name = `${lado}Hand${dedo}${s}`;
        pai.add(b); pai = b;
      }
    }
  }
  return raiz;
}
// o ângulo REALMENTE escrito no osso, medido contra a pose que veio do arquivo
const anguloEscrito = (j) => 2 * Math.acos(Math.min(1, Math.abs(
  j.base.clone().invert().multiply(j.osso.quaternion).w)));
// roda a máquina por `s` segundos em quadros de 60 Hz
function corre(rig, s, imediato = false) {
  for (let i = 0; i < Math.ceil(s * 60); i++) atualizaRigPrimeiraPessoa(rig, 1 / 60, imediato);
}
const juntas = (rig, lado) => rig[lado].juntas;
const valorDaJunta = (j) => anguloEscrito(j) / ANGULO_MAX_FP[j.dedo];

test('a transição chega a 1 e para lá — e o dedo pousa na pose pedida', () => {
  const rig = criaRigPrimeiraPessoa(maoDeMentira());
  assert.ok(rig, 'sem rig: os ossos do esqueleto de mentira não foram achados');
  assert.equal(defineGestoPrimeiraPessoa(rig, 'minhaVez'), true);
  assert.equal(rig.transicao.Right, 0, 'a transição tinha de começar do zero');
  corre(rig, 0.5);
  assert.equal(rig.transicao.Right, 1, 'a transição não fechou');
  assert.equal(rig.transicao.Left, 1);
  // e não passa de 1 por continuar rodando
  corre(rig, 2);
  assert.equal(rig.transicao.Right, 1);
  for (const j of juntas(rig, 'Right')) {
    assert.ok(Math.abs(valorDaJunta(j) - POSES_FP.pronta[j.dedo][j.seg]) < 1e-6,
      `${j.osso.name} parou em ${valorDaJunta(j).toFixed(3)} e a pose pede ${POSES_FP.pronta[j.dedo][j.seg]}`);
  }
});

test('o pulso vai e volta sozinho, sem ninguém mandar parar', () => {
  const rig = criaRigPrimeiraPessoa(maoDeMentira());
  defineGestoPrimeiraPessoa(rig, 'minhaVez');
  corre(rig, 0.5);
  assert.equal(defineGestoPrimeiraPessoa(rig, 'compraMonte'), true);
  assert.equal(estadoGestoPrimeiraPessoa(rig).pulso, 'compraMonte');
  // no auge, a direita está em pinça de verdade
  corre(rig, GESTOS_FP.compraMonte.subida + 0.02);
  const auge = estadoGestoPrimeiraPessoa(rig);
  assert.equal(auge.fase, 'ida');
  assert.ok(auge.progresso > 0.98, `progresso ${auge.progresso.toFixed(2)} no auge do pulso`);
  const pol = juntas(rig, 'Right').find((j) => j.dedo === 'Thumb' && j.seg === 1);
  assert.ok(Math.abs(valorDaJunta(pol) - POSES_FP.pinca.Thumb[1]) < 1e-6, 'a pinça não fechou no auge');
  // e a ESQUERDA não foi tocada: ela está segurando o leque
  const polEsq = juntas(rig, 'Left').find((j) => j.dedo === 'Thumb' && j.seg === 1);
  assert.ok(Math.abs(valorDaJunta(polEsq) - POSES_FP.leque.Thumb[1]) < 1e-6, 'o pulso da direita mexeu na mão do leque');
  // ninguém manda parar: passado o tempo do gesto, a mão volta à base
  corre(rig, 2);
  assert.equal(rig.pulso.Right, null, 'o pulso não se desfez sozinho');
  assert.equal(estadoGestoPrimeiraPessoa(rig).progresso, 0);
  assert.equal(rig.atual.Right, 'pronta', 'voltou para a pose errada');
  for (const j of juntas(rig, 'Right')) {
    assert.ok(Math.abs(valorDaJunta(j) - POSES_FP.pronta[j.dedo][j.seg]) < 1e-6, `${j.osso.name} não voltou ao leque`);
  }
});

test('a base trocada no meio do pulso muda o destino da volta, não corta o gesto', () => {
  const rig = criaRigPrimeiraPessoa(maoDeMentira());
  defineGestoPrimeiraPessoa(rig, 'minhaVez');
  corre(rig, 0.5);
  defineGestoPrimeiraPessoa(rig, 'descarta');
  corre(rig, 0.05);
  // a vez acabou no meio do descarte: o gesto continua, mas volta para o repouso
  assert.equal(defineGestoPrimeiraPessoa(rig, 'espera'), true);
  assert.ok(rig.pulso.Right, 'a troca de base cortou o pulso no ar');
  corre(rig, 2);
  assert.equal(rig.pulso.Right, null);
  assert.equal(rig.atual.Right, 'repouso', 'a mão voltou para a pose da vez que já passou');
});

test('gesto e pose desconhecidos não quebram nem bagunçam a mão', () => {
  const rig = criaRigPrimeiraPessoa(maoDeMentira());
  defineGestoPrimeiraPessoa(rig, 'minhaVez');
  corre(rig, 0.5);
  const antes = juntas(rig, 'Right').map(valorDaJunta);
  assert.equal(defineGestoPrimeiraPessoa(rig, 'chutaABola'), false);
  assert.equal(pulsoPrimeiraPessoa(rig, undefined), false);
  assert.equal(definePosePrimeiraPessoa(rig, 'Right', 'banana'), false);
  assert.equal(definePosePrimeiraPessoa(rig, 'Terceira', 'pinca'), false);
  assert.doesNotThrow(() => corre(rig, 0.5));
  assert.deepEqual(juntas(rig, 'Right').map(valorDaJunta), antes, 'um nome inventado mexeu na mão');
  // e uma pose desconhecida enfiada à força na máquina vira zero (a pose do
  // arquivo), que é o pior caso aceitável — o que não pode é lançar no quadro
  rig.anterior.Right = rig.atual.Right = 'naoExiste';
  rig.transicao.Right = 0;
  assert.doesNotThrow(() => corre(rig, 0.5));
  for (const j of juntas(rig, 'Right')) assert.ok(anguloEscrito(j) < 1e-6, `${j.osso.name} girou por uma pose que não existe`);
  // rig nulo também não derruba o laço de desenho
  assert.doesNotThrow(() => atualizaRigPrimeiraPessoa(null, 1 / 60));
  assert.equal(criaRigPrimeiraPessoa(new T.Object3D()), null, 'raiz sem mão devolveu rig');
  assert.equal(estadoGestoPrimeiraPessoa(null).progresso, 0);
});

test('nenhuma interpolação estoura o limite angular da junta', () => {
  const rig = criaRigPrimeiraPessoa(maoDeMentira());
  // varre TODOS os pares de poses: o meio do caminho entre duas é onde um
  // limite mal posto apareceria, e a primeira pessoa amplifica isso
  const nomes = Object.keys(POSES_FP);
  for (const de of nomes) {
    for (const para of nomes) {
      definePosePrimeiraPessoa(rig, 'Right', de, { imediato: true });
      atualizaRigPrimeiraPessoa(rig, 1 / 60);
      definePosePrimeiraPessoa(rig, 'Right', para, { dur: 0.2 });
      for (let i = 0; i < 20; i++) {
        atualizaRigPrimeiraPessoa(rig, 1 / 60);
        for (const j of juntas(rig, 'Right')) {
          const ang = anguloEscrito(j);
          assert.ok(ang <= ANGULO_MAX_FP[j.dedo] + 1e-9,
            `${de}→${para}: ${j.osso.name} a ${ang.toFixed(3)} rad, acima do teto de ${ANGULO_MAX_FP[j.dedo]}`);
          assert.ok(ang >= -1e-9, `${de}→${para}: ${j.osso.name} dobrou para trás`);
        }
      }
    }
  }
  // e uma pose fora da escala (alguém edita a tabela para 3) continua presa ao teto
  rig.anterior.Right = rig.atual.Right = { Thumb: [9, 9, 9], Index: [9, 9, 9], Middle: [9, 9, 9], Ring: [9, 9, 9], Pinky: [9, 9, 9] };
  rig.transicao.Right = 1;
  atualizaRigPrimeiraPessoa(rig, 1 / 60);
  for (const j of juntas(rig, 'Right')) {
    assert.ok(anguloEscrito(j) <= ANGULO_MAX_FP[j.dedo] + 1e-9, `${j.osso.name} passou do teto com pose fora de escala`);
  }
});

test('a mão que segura o leque mantém os quatro dedos atrás — só o polegar cruza', () => {
  // A regra anatômica que já custou caro: numa mão que segura cartas os quatro
  // ficam ATRÁS delas e só o polegar passa na frente. Qualquer pose que um
  // gesto ponha na ESQUERDA enquanto ela segura o leque tem de obedecer.
  const doLeque = new Set(['leque', 'lequeAberto', 'lequeFirme']);
  for (const nome of doLeque) {
    const pose = POSES_FP[nome];
    for (let seg = 0; seg < 3; seg++) {
      const maiorDosQuatro = Math.max(...['Index', 'Middle', 'Ring', 'Pinky'].map((d) => pose[d][seg]));
      // a folga exigida é nas DUAS PRIMEIRAS juntas: é ali que o polegar cruza
      // por cima do maço. Na ponta ele só acompanha, e um polegar de ponta
      // muito dobrada bate na carta em vez de pousar nela.
      const folga = seg < 2 ? 0.3 : 0;
      assert.ok(pose.Thumb[seg] > maiorDosQuatro + folga,
        `${nome}, segmento ${seg}: o polegar (${pose.Thumb[seg]}) não avança à frente dos quatro (${maiorDosQuatro}) — a mão fura o leque`);
      assert.ok(maiorDosQuatro < 0.45, `${nome}, segmento ${seg}: os quatro dobram ${maiorDosQuatro} e saem de trás das cartas`);
    }
  }
  // e todo gesto que mexe na esquerda segurando o leque usa uma dessas — ou
  // abre a mão de vez (baixar, bater), que é quando as cartas saem dela
  const abremAMao = new Set(['espalmada', 'repouso']);
  for (const [nome, g] of Object.entries(GESTOS_FP)) {
    if (!g.Left) continue;
    assert.ok(doLeque.has(g.Left) || abremAMao.has(g.Left), `gesto ${nome}: pose ${g.Left} na esquerda não é de mão que segura nem de mão que larga`);
  }
});

test('menos movimento: o gesto acontece de uma vez e o pulso não fica de pé', () => {
  const rig = criaRigPrimeiraPessoa(maoDeMentira());
  defineGestoPrimeiraPessoa(rig, 'minhaVez');
  defineGestoPrimeiraPessoa(rig, 'bate');
  atualizaRigPrimeiraPessoa(rig, 1 / 60, true);
  assert.equal(rig.pulso.Left, null, 'com movimento reduzido o pulso continuou correndo');
  assert.equal(rig.transicao.Left, 1);
  assert.equal(rig.atual.Left, 'leque', 'a mão não voltou à base');
  // cancelar à mão devolve à base sem tranco e é idempotente
  defineGestoPrimeiraPessoa(rig, 'baixaJogo');
  assert.equal(cancelaPulsoPrimeiraPessoa(rig, { imediato: true }), true);
  assert.equal(cancelaPulsoPrimeiraPessoa(rig), false);
  assert.equal(rig.atual.Right, 'pronta');
});

test('a API antiga continua de pé para quem já chamava', () => {
  const rig = criaRigPrimeiraPessoa(maoDeMentira());
  // as três poses do começo continuam existindo com os mesmos nomes
  for (const nome of ['repouso', 'leque', 'pinca']) assert.ok(POSES_FP[nome], `sumiu a pose ${nome}`);
  assert.equal(rig.atual.Left, 'leque');
  assert.equal(rig.atual.Right, 'repouso');
  definePosePrimeiraPessoa(rig, 'Left', 'pinca');
  assert.equal(rig.atual.Left, 'pinca');
  assert.equal(rig.anterior.Left, 'leque');
  assert.equal(rig.transicao.Left, 0);
  atualizaRigPrimeiraPessoa(rig, 1, true);   // o terceiro argumento continua sendo "agora"
  assert.equal(rig.transicao.Left, 1);
  // e sem argumentos de tempo, o passo padrão continua sendo o de antes (1/9 s)
  const outro = criaRigPrimeiraPessoa(maoDeMentira());
  definePosePrimeiraPessoa(outro, 'Left', 'pinca');
  for (let i = 0; i < 6; i++) atualizaRigPrimeiraPessoa(outro);   // 6 × 16 ms ≈ 0,096 s
  assert.ok(outro.transicao.Left < 1, 'a transição padrão ficou rápida demais');
  atualizaRigPrimeiraPessoa(outro);
  atualizaRigPrimeiraPessoa(outro);
  assert.equal(outro.transicao.Left, 1, 'a transição padrão ficou lenta demais');
});

test('a mão que já vem posada do arquivo não dobra duas vezes', () => {
  // `mao-fp-esq.glb` chega FECHADA no leque. Se a máquina somasse a pose do
  // leque por cima disso, o polegar iria ao dobro e a mão furaria as cartas —
  // é o erro que o módulo desconta ao criar o rig.
  const raiz = maoDeMentira();
  // finge o arquivo posado: escreve a pose do leque nos ossos antes de criar o rig
  const cru = criaRigPrimeiraPessoa(raiz);
  definePosePrimeiraPessoa(cru, 'Left', 'leque', { imediato: true });
  atualizaRigPrimeiraPessoa(cru, 1 / 60);
  const doArquivo = juntas(cru, 'Left').map((j) => j.osso.quaternion.clone());

  const rig = criaRigPrimeiraPessoa(raiz, { poseDoArquivo: { Left: 'leque' } });
  defineGestoPrimeiraPessoa(rig, 'espera', { imediato: true });
  atualizaRigPrimeiraPessoa(rig, 1 / 60);
  juntas(rig, 'Left').forEach((j, i) => {
    assert.ok(j.osso.quaternion.angleTo(doArquivo[i]) < 1e-6,
      `${j.osso.name}: pedir 'leque' devolveu ${j.angulo.toFixed(3)} rad em vez da pose do arquivo`);
  });
  // e a pose neutra agora é a mão ABERTA, não a do arquivo: é a diferença que
  // deixa o polegar sair de cima das cartas quando o jogo pede
  definePosePrimeiraPessoa(rig, 'Left', 'neutro', { imediato: true });
  atualizaRigPrimeiraPessoa(rig, 1 / 60);
  const polegar = juntas(rig, 'Left').find((j) => j.dedo === 'Thumb' && j.seg === 1);
  assert.ok(polegar.osso.quaternion.angleTo(doArquivo[juntas(rig, 'Left').indexOf(polegar)]) > 0.5,
    'a pose neutra ficou igual à do arquivo: o desconto não aconteceu');
  // sem declarar nada, o comportamento antigo fica de pé
  const semDeclarar = criaRigPrimeiraPessoa(raiz, { poseDoArquivo: 'poseQueNaoExiste' });
  assert.ok(semDeclarar, 'um nome de pose inválido derrubou a criação do rig');
});
