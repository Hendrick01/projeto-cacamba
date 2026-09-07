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
    // O arquivo preparado (scripts/rig_dedos.py) grava no osso da mão para onde
    // a palma e a lateral do polegar apontam; sem isso, deduz das juntas.
    const ex = osso.userData || {};
    const lateral = ex.lateral ? new THREE.Vector3().fromArray(ex.lateral).normalize()
      : polegar.position.clone().sub(medio.position).setY(0).normalize();
    const palma = ex.palma ? new THREE.Vector3().fromArray(ex.palma).normalize()
      : lateral.clone().cross(Y).multiplyScalar(lado === 'Left' ? 1 : -1).normalize();
    const eixo = Y.clone().cross(palma).normalize();
    const mao = { osso, palma, lateral, lado, juntas: [], valor: 0 }; maos[lado] = mao;
    osso.traverse((b) => {
      if (!b.isBone || !b.userData.dedo) return;
      const thumb = b.name.includes('Thumb'), seg = b.userData.segmento || 0;
      const eixoDoOsso = b.userData.eixoFlexao ? new THREE.Vector3().fromArray(b.userData.eixoFlexao).normalize() : eixo.clone();
      const j = { osso: b, base: b.quaternion.clone(), eixo: eixoDoOsso,
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
