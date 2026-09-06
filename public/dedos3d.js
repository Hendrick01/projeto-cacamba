import * as THREE from './vendor/three.module.js';

// Somente os ossos marcados pelo preparo participam. Modelos externos sem
// esses metadados continuam com sua pose original, sem tentativa de adivinhação.
export function preparaDedos(raiz) {
  const juntas = [];
  raiz.traverse((osso) => {
    if (!osso.isBone || !osso.userData.dedo) return;
    const eixo = osso.userData.eixoFlexao;
    const angulo = osso.userData.anguloFlexao;
    if (!Array.isArray(eixo) || eixo.length !== 3 || !eixo.every(Number.isFinite) || !Number.isFinite(angulo)) return;
    juntas.push({ osso, base: osso.quaternion.clone(), eixo: new THREE.Vector3(...eixo).normalize(), angulo });
  });
  return { juntas, valor: 0, alvo: 0 };
}
const giro = new THREE.Quaternion();
export function atualizaDedos(rig, dt = 0.016, imediato = false) {
  if (!rig?.juntas.length) return;
  rig.valor += (THREE.MathUtils.clamp(rig.alvo, 0, 1) - rig.valor) * (imediato ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 12));
  for (const { osso, base, eixo, angulo } of rig.juntas) {
    giro.setFromAxisAngle(eixo, angulo * rig.valor);
    osso.quaternion.copy(base).multiply(giro);
  }
}
