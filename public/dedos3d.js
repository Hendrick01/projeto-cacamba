import * as THREE from './vendor/three.module.js';
const Y = new THREE.Vector3(0, 1, 0);
// Base anatômica por mão: não depende de câmera ou orientação do corpo.
export function preparaDedos(raiz) {
  const juntas = [], maos = {};
  for (const lado of ['Left', 'Right']) {
    const osso = raiz.getObjectByName(`${lado}Hand`);
    const medio = raiz.getObjectByName(`${lado}HandMiddle1`);
    const polegar = raiz.getObjectByName(`${lado}HandThumb1`);
    if (!osso || !medio || !polegar) continue;
    const lateral = polegar.position.clone().sub(medio.position); lateral.y = 0; lateral.normalize();
    const palma = lateral.clone().cross(Y).multiplyScalar(lado === 'Left' ? 1 : -1).normalize();
    const eixo = Y.clone().cross(palma).normalize();
    const mao = { osso, palma, lateral, lado, juntas: [], valor: 0 }; maos[lado] = mao;
    osso.traverse((b) => {
      if (!b.isBone || !b.userData.dedo) return;
      const thumb = b.name.includes('Thumb'), seg = b.userData.segmento || 0;
      const j = { osso: b, base: b.quaternion.clone(), eixo: eixo.clone(),
        angulo: (thumb ? [0.90, 0.45, 0.25] : [1.10, 1.45, 0.80])[seg], thumb, seg, mao };
      juntas.push(j); mao.juntas.push(j);
    });
  }
  return { juntas, maos, valor: 0, alvo: 0, alvos: null };
}
const giro = new THREE.Quaternion();
export function atualizaDedos(rig, dt = 0.016, imediato = false) {
  if (!rig?.juntas.length) return;
  const blend = imediato ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 16);
  rig.valor += (THREE.MathUtils.clamp(rig.alvo, 0, 1) - rig.valor) * blend;
  for (const mao of Object.values(rig.maos)) {
    const alvo = rig.alvos?.[mao.lado] ?? rig.alvo;
    mao.valor += (THREE.MathUtils.clamp(alvo, 0, 1) - mao.valor) * blend;
    for (const { osso, base, eixo, angulo } of mao.juntas) {
      giro.setFromAxisAngle(eixo, angulo * mao.valor); osso.quaternion.copy(base).multiply(giro);
    }
  }
}
