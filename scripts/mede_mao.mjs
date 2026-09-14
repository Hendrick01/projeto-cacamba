// MEDE a mão de primeira pessoa COMO O JOGO A VÊ: three.js lendo o .glb, a
// mesma conta de esqueleto que a GPU faz, no espaço do `PlanoDaCarta`.
//
// Uso: node scripts/mede_mao.mjs public/models/mao-fp-esq.glb
//
// Por que não basta o `scripts/olha_mao.py`: ele reimporta o .glb no Blender, e
// o importador de glTF do Blender converte eixos de forma INCONSISTENTE entre a
// malha e o empty — o contrato sai de um jeito e a mão de outro, e a medida
// mente. (Custou uma sessão inteira; está na memória do projeto.) Quem manda é
// o que o three.js lê, porque é o three.js que desenha o jogo.
//
// O que se mede é o retângulo, não o plano infinito: estar à FRENTE do plano da
// carta não é estar SOBRE a carta — o polegar pode estar à frente e 23 cm ao
// lado, sem cruzar nada, e foi exatamente isso que passou despercebido antes.
import fs from 'node:fs';
import path from 'node:path';
import * as T from '../public/vendor/three.module.js';
import { GLTFLoader } from '../public/vendor/GLTFLoader.js';

globalThis.ProgressEvent ||= class extends Event { constructor(t, p) { super(t); Object.assign(this, p); } };

const LARG = 0.34, ALT = 0.478;   // a carta na escala da mão: 63 mm contra 185 mm do punho à ponta do médio

export async function carregaArquivo(arquivo) {
  const bytes = fs.readFileSync(arquivo);
  const len = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8', 20, 20 + len));
  delete json.images; delete json.textures; delete json.materials;
  for (const m of json.meshes) for (const p of m.primitives) delete p.material;
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + len).toString('base64')}`;
  return new Promise((ok, fail) => new GLTFLoader().parse(JSON.stringify(json), '', ok, fail));
}

// o vértice deformado composto osso a osso — `getVertexPosition` devolve no
// espaço do VÍNCULO, que não é onde o plano vive
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

export async function mede(arquivo) {
  const gltf = await carregaArquivo(arquivo);
  gltf.scene.updateMatrixWorld(true);
  const plano = gltf.scene.getObjectByName('PlanoDaCarta');
  if (!plano) throw new Error('sem PlanoDaCarta: o contrato não viajou no arquivo');
  let malha = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh) malha = o; });
  if (!malha) throw new Error('sem malha com esqueleto');

  const paraOPlano = plano.matrixWorld.clone().invert();
  let polegarSobre = 0, restoSobre = 0, polegarNoRetangulo = 0;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  let somaV = 0, nDedos = 0, pontaDoPolegar = -Infinity;
  for (const { p, osso } of deformados(malha)) {
    const q = p.applyMatrix4(paraOPlano);           // no espaço do contrato
    const ehPolegar = /Thumb/.test(osso);
    const dentro = Math.abs(q.x) <= LARG / 2 && Math.abs(q.y) <= ALT / 2;
    if (dentro && q.z > 0) { if (ehPolegar) polegarSobre++; else restoSobre++; }
    if (ehPolegar) {
      if (dentro) polegarNoRetangulo++;
      uMin = Math.min(uMin, q.x); uMax = Math.max(uMax, q.x);
      pontaDoPolegar = Math.max(pontaDoPolegar, q.z);
    } else if (/Index|Middle|Ring|Pinky/.test(osso)) {
      // só os DEDOS entram na altura da pegada. Contando a palma, o punho e o
      // toco do antebraço — que descem a −0,99 — a média afundava para fora da
      // carta e a medida dizia −0,46 numa pegada que está no terço de baixo.
      somaV += q.y; nDedos++;
    }
    vMin = Math.min(vMin, q.y); vMax = Math.max(vMax, q.y);
  }
  return {
    polegarSobre, restoSobre, polegarNoRetangulo, pontaDoPolegar,
    pegada: (somaV / nDedos + ALT / 2) / ALT,
    polegarU: [uMin, uMax], maoV: [vMin, vMax],
    cumpre: polegarSobre > 0 && restoSobre === 0,
  };
}

const direto = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (direto) {
  const arquivo = process.argv[2];
  if (!arquivo) { console.error('uso: node scripts/mede_mao.mjs <arquivo.glb>'); process.exit(2); }
  const m = await mede(arquivo);
  console.log(`MEDIDA COMO O JOGO VE (${path.basename(arquivo)}):`);
  console.log(`  polegar sobre a carta   ${m.polegarSobre}`);
  console.log(`  resto sobre a carta     ${m.restoSobre}   <- tem de ser 0`);
  console.log(`  polegar no retangulo    ${m.polegarNoRetangulo} (qualquer profundidade)`);
  console.log(`  ponta do polegar        ${m.pontaDoPolegar.toFixed(4)} a frente do plano`);
  console.log(`  altura da pegada        ${m.pegada.toFixed(2)}  (0 = borda de baixo, 1 = topo)`);
  console.log(`  polegar em u de ${m.polegarU[0].toFixed(4)} a ${m.polegarU[1].toFixed(4)}   (a carta vai de ${(-LARG / 2).toFixed(4)} a ${(LARG / 2).toFixed(4)})`);
  console.log(`  mao em v de ${m.maoV[0].toFixed(4)} a ${m.maoV[1].toFixed(4)}       (a carta vai de ${(-ALT / 2).toFixed(4)} a ${(ALT / 2).toFixed(4)})`);
  console.log(`CRITERIO: ${m.cumpre ? 'CUMPRIDO' : 'NAO CUMPRIDO'}`);
}
