import * as THREE from './vendor/three.module.js';

const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
const suaviza = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

// Poses de primeira pessoa. Os valores sao multiplicadores de flexao por junta.
// Em vez de fechar todos os dedos por um unico valor, cada dedo recebe um alvo
// proprio. Isto evita a mao em "garra" e permite pinça real para a carta.
export const POSES_FP = Object.freeze({
  repouso: Object.freeze({
    Thumb:  [0.10, 0.16, 0.10],
    Index:  [0.12, 0.16, 0.10],
    Middle: [0.18, 0.24, 0.16],
    Ring:   [0.24, 0.34, 0.24],
    Pinky:  [0.30, 0.42, 0.30],
  }),
  leque: Object.freeze({
    Thumb:  [0.34, 0.54, 0.28],
    Index:  [0.26, 0.38, 0.24],
    Middle: [0.46, 0.68, 0.54],
    Ring:   [0.60, 0.88, 0.70],
    Pinky:  [0.70, 0.98, 0.80],
  }),
  pinca: Object.freeze({
    Thumb:  [0.52, 0.72, 0.38],
    Index:  [0.42, 0.62, 0.38],
    Middle: [0.28, 0.42, 0.30],
    Ring:   [0.42, 0.62, 0.46],
    Pinky:  [0.54, 0.76, 0.58],
  }),
});

function nomeDedo(nome = '') {
  for (const dedo of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
    if (nome.includes(dedo)) return dedo;
  }
  return null;
}

function segmentoDoOsso(osso) {
  const doUserData = Number(osso?.userData?.segmento);
  if (Number.isFinite(doUserData)) return THREE.MathUtils.clamp(doUserData, 0, 2);
  const m = osso?.name?.match(/(Thumb|Index|Middle|Ring|Pinky)([123])$/);
  return m ? Number(m[2]) - 1 : 0;
}

function eixoFlexao(osso, fallback = new THREE.Vector3(1, 0, 0)) {
  const dado = osso?.userData?.eixoFlexao;
  if (Array.isArray(dado) && dado.length === 3) return new THREE.Vector3().fromArray(dado).normalize();
  return fallback.clone().normalize();
}

function coletaJuntas(raiz, lado) {
  const hand = raiz.getObjectByName(`${lado}Hand`);
  if (!hand) return null;
  const juntas = [];
  hand.traverse((osso) => {
    if (!osso.isBone) return;
    const dedo = nomeDedo(osso.name);
    if (!dedo) return;
    const seg = segmentoDoOsso(osso);
    juntas.push({
      osso,
      dedo,
      seg,
      base: osso.quaternion.clone(),
      eixo: eixoFlexao(osso),
    });
  });
  return { hand, juntas };
}

export function criaRigPrimeiraPessoa(raiz) {
  if (!raiz) return null;
  const rig = {
    Left: coletaJuntas(raiz, 'Left'),
    Right: coletaJuntas(raiz, 'Right'),
    atual: { Left: 'leque', Right: 'repouso' },
    blend: { Left: 1, Right: 1 },
    anterior: { Left: 'leque', Right: 'repouso' },
    transicao: { Left: 1, Right: 1 },
  };
  if (!rig.Left && !rig.Right) return null;
  return rig;
}

export function definePosePrimeiraPessoa(rig, lado, pose) {
  if (!rig?.[lado] || !POSES_FP[pose]) return;
  if (rig.atual[lado] === pose) return;
  rig.anterior[lado] = rig.atual[lado];
  rig.atual[lado] = pose;
  rig.transicao[lado] = 0;
}

function valorPose(nome, dedo, seg) {
  return POSES_FP[nome]?.[dedo]?.[seg] ?? 0;
}

const qTmp = new THREE.Quaternion();
export function atualizaRigPrimeiraPessoa(rig, dt = 0.016, imediato = false) {
  if (!rig) return;
  for (const lado of ['Left', 'Right']) {
    const mao = rig[lado];
    if (!mao) continue;
    rig.transicao[lado] = imediato ? 1 : Math.min(1, rig.transicao[lado] + Math.min(dt, 0.05) * 9);
    const t = suaviza(rig.transicao[lado]);
    const de = rig.anterior[lado];
    const para = rig.atual[lado];
    for (const j of mao.juntas) {
      const a = valorPose(de, j.dedo, j.seg);
      const b = valorPose(para, j.dedo, j.seg);
      const valor = THREE.MathUtils.lerp(a, b, t);
      // Limite conservador: a primeira pessoa amplifica qualquer erro anatomico.
      const anguloMax = j.dedo === 'Thumb' ? 0.95 : 1.35;
      qTmp.setFromAxisAngle(j.eixo, valor * anguloMax);
      j.osso.quaternion.copy(j.base).multiply(qTmp);
    }
  }
}

// Objeto de referencia para prender cartas ao gesto sem depender da origem da malha.
export function criaGripAnchor(nome = 'FPGripAnchor') {
  const grip = new THREE.Object3D();
  grip.name = nome;
  grip.userData.fpGrip = true;
  return grip;
}

// A carta passa a obedecer profundidade real dentro da cena de primeira pessoa.
// O renderOrder continua apenas como desempate; nao substitui o z-buffer.
export function configuraCartaPrimeiraPessoa(mesh, ordem = 100) {
  if (!mesh?.material) return;
  mesh.material.depthTest = true;
  mesh.material.depthWrite = true;
  mesh.renderOrder = ordem;
}

export function atualizaGripDaCarta(grip, { aberta = false, progresso = 1 } = {}) {
  if (!grip) return;
  const p = suaviza(progresso);
  // Pinça fica alguns milimetros a frente do leque e gira levemente ao puxar.
  grip.position.set(0, THREE.MathUtils.lerp(0.0, 0.018, p), THREE.MathUtils.lerp(0.008, 0.028, p));
  grip.rotation.set(THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-2, -10, p)), 0, THREE.MathUtils.degToRad(aberta ? 4 : 0));
}
