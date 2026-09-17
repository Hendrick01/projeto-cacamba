// PESCOÇO NAS ESCULTURAS. O elenco é malha estática, sem osso (LEIA-ME de
// 07/09/2026): para virar o rosto, virava o corpo inteiro. O rig automático
// testado antes espalhava o peso do pescoço pela cara — "quando é movimentado
// o tronco ou o pescoço acaba deformando toda a cara" (usuário, 17/09/2026).
// Aqui o peso é GEOMÉTRICO, não por calor de osso: tudo acima da linha do
// queixo é cabeça a 100% — a cara é RÍGIDA, não deforma nunca —; tudo abaixo do
// pé do pescoço é corpo a 100%; só o anel do pescoço (6 cm) mistura. Dois
// ossos, criados ao carregar; nenhum arquivo muda.
//
// A linha do queixo é MEDIDA em cada escultura: numa faixa central estreita,
// o perfil da frente desce do rosto (~10 cm à frente do eixo da cabeça) para o
// pescoço (~0) num degrau de um ou dois centímetros. Conferido nos oito do
// elenco em 17/09/2026: o degrau fica entre 1,13 e 1,20 m (altura sentada 1,45).
import * as THREE from './vendor/three.module.js';

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function medePescoco(pontos) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pontos) { if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const H = y1 - y0, k = H / 1.45;
  if (!(H > 0)) return null;
  // o eixo da cabeça: o centro, em x e z, dos 8% de cima
  let sx = 0, sz = 0, n = 0;
  for (const p of pontos) if (p.y > y0 + 0.92 * H) { sx += p.x; sz += p.z; n++; }
  if (!n) return null;
  const cx = sx / n, cz = sz / n;
  // o perfil da frente, de centímetro em centímetro, entre 70% e 92% da altura
  const passo = 0.01 * k, faixa = 0.04 * k, fatias = [];
  for (let y = y0 + 0.70 * H; y <= y0 + 0.92 * H; y += passo) fatias.push({ y, frente: -Infinity, n: 0 });
  for (const p of pontos) {
    if (Math.abs(p.x - cx) > faixa) continue;
    const i = Math.round((p.y - (y0 + 0.70 * H)) / passo);
    if (i < 0 || i >= fatias.length) continue;
    fatias[i].n++;
    if (p.z - cz > fatias[i].frente) fatias[i].frente = p.z - cz;
  }
  // fatia rala (menos de 3 pontos) mente para os dois lados: herda a de baixo
  for (let i = 0; i < fatias.length; i++) if (fatias[i].n < 3) fatias[i].frente = i ? fatias[i - 1].frente : 0;
  // A BASE DO QUEIXO é o degrau entre dois PATAMARES: os 4 cm de cima todos à
  // frente (o rosto, ~10 cm) e os 4 cm de baixo todos recuados (o pescoço,
  // ~0). Comparar patamar com patamar — o mínimo de cima contra o máximo de
  // baixo — é o que tira o ruído: um degrau de uma fatia só (franja, nariz,
  // gola, um vértice solto) não separa patamares. Entre 73% e 88% da altura.
  let queixo = null, maior = 0.035 * k;
  for (let i = 3; i + 4 < fatias.length; i++) {
    const y = fatias[i].y + passo / 2;
    if (y < y0 + 0.73 * H || y > y0 + 0.88 * H) continue;
    // de cada patamar, o SEGUNDO pior valor: tolera uma fatia torta por lado (a
    // Esterex tem um vão de 4 cm logo acima do queixo, entre o lábio e o nariz)
    const acima = [], abaixo = [];
    for (let j = 1; j <= 4; j++) { acima.push(fatias[i + j].frente); abaixo.push(fatias[i + 1 - j].frente); }
    acima.sort((a, b) => a - b); abaixo.sort((a, b) => b - a);
    const cima = acima[1], baixo = abaixo[1];
    if (cima - baixo >= maior) { maior = cima - baixo; queixo = y; }
  }
  if (queixo == null) return null;
  return { H, k, cx, cz, queixo, pe: queixo - 0.075 * k, topo: queixo - 0.015 * k, pivo: new THREE.Vector3(cx, queixo - 0.05 * k, cz - 0.02 * k) };
}

// Devolve { osso, medida } ou null se a escultura não deixou medir o pescoço
// (aí nada muda: ela continua virando o corpo inteiro, como antes).
export function criaPescoco(raiz) {
  raiz.updateWorldMatrix(true, true);
  const paraARaiz = raiz.matrixWorld.clone().invert();
  const malhas = [];
  raiz.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) malhas.push(o); });
  if (!malhas.length) return null;
  const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
  // a medida usa as malhas de verdade, não as cascas de contorno (mesma geometria, inflada)
  const pontos = [];
  for (const m of malhas) {
    if (m.userData.contorno) continue;
    m4.multiplyMatrices(paraARaiz, m.matrixWorld);
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) { v.fromBufferAttribute(p, i).applyMatrix4(m4); pontos.push(v.clone()); }
  }
  const medida = medePescoco(pontos);
  if (!medida) return null;
  const { pe, topo, queixo, cx, cz, k } = medida;
  const corpo = new THREE.Bone(); corpo.name = 'EsculturaCorpo';
  const cabeca = new THREE.Bone(); cabeca.name = 'EsculturaPescoco'; cabeca.position.copy(medida.pivo);
  raiz.add(corpo, cabeca);
  raiz.updateWorldMatrix(true, true);
  const esqueleto = new THREE.Skeleton([corpo, cabeca]);
  const pesadas = new WeakSet();
  for (const m of malhas) {
    const geo = m.geometry;
    if (!pesadas.has(geo)) {
      pesadas.add(geo);
      m4.multiplyMatrices(paraARaiz, m.matrixWorld);
      const p = geo.attributes.position, idx = new Uint16Array(p.count * 4), peso = new Float32Array(p.count * 4);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m4);
        let w = suave(pe, topo, v.y);
        // abaixo do queixo só o que está perto do eixo do pescoço sobe com a
        // cabeça: o alto dos ombros e o cabelo caído ficam com o corpo
        if (v.y < queixo) w *= 1 - suave(0.085 * k, 0.13 * k, Math.hypot(v.x - cx, v.z - cz));
        idx[i * 4 + 1] = 1; peso[i * 4] = 1 - w; peso[i * 4 + 1] = w;
      }
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(idx, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(peso, 4));
    }
    const s = new THREE.SkinnedMesh(geo, m.material);
    s.name = m.name; s.position.copy(m.position); s.quaternion.copy(m.quaternion); s.scale.copy(m.scale);
    s.castShadow = m.castShadow; s.receiveShadow = m.receiveShadow; s.renderOrder = m.renderOrder; s.visible = m.visible;
    s.userData = m.userData; s.frustumCulled = false;
    for (const filho of [...m.children]) s.add(filho);
    m.parent.add(s); m.parent.remove(m);
    s.updateWorldMatrix(true, false);
    s.bind(esqueleto);
  }
  return { osso: cabeca, medida };
}
