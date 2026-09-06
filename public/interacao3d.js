// ============================================================================
// Caçamba — o corpo do personagem em jogo: postura, leque, gestos e cadeira
//
// A pose SENTADA vem assada no .glb (test/modelo-senta.mjs): tronco, pernas,
// braços e mãos em volta do leque. Este módulo não a refaz — só corrige o
// que a assadura deixou (o tronco torcido ~50°), pendura o leque na palma da
// mão esquerda, move o braço direito nos gestos de comprar/descartar/baixar
// e vira a cabeça para quem está jogando. Tudo em cima da pose do arquivo,
// que é a que o dono do projeto aprovou no provador.
// ============================================================================
import * as T from './vendor/three.module.js';
import { atualizaDedos } from './dedos3d.js';

// Medidas da mesa de jantar (referência do Capote): tampo baixo, feltro
// pequeno, cadeiras encostadas na beirada — as coxas entram sob o tampo e os
// cotovelos alcançam a borda. `folgaQuadril` é a distância do osso do quadril
// ao assento na pose assada (senta.mjs: --folga 0.16 até o osso, menos os 5 cm
// da almofada). `assento` é o raio mínimo da roda de cadeiras.
export const MESA = Object.freeze({ altura: 0.76, raio: 1.15, assento: 1.45, folgaQuadril: 0.11 });
// O tamanho da carta na mão de um modelo, em relação à carta de 42×59 cm da
// mesa: 0,26 dá 11×15 cm — maior que uma carta de verdade, como no desenho.
export const ESCALA_CARTA_MAO = 0.26;

const v = () => new T.Vector3();
const q = () => new T.Quaternion();
const wp = (o) => o.getWorldPosition(v());
const wq = (o) => o.getWorldQuaternion(q());
const Y = new T.Vector3(0, 1, 0);
const smooth = (t) => { t = T.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// Gira um osso por um quaternion dado no ESPAÇO DA RAIZ do modelo (o eixo Y
// da raiz é a vertical do personagem, aponte ele para onde apontar na cena):
// local' = P⁻¹·R·P·local, com P = orientação do pai relativa à raiz.
function giraNaRaiz(m, osso, rot) {
  const P = wq(m.raiz).invert().multiply(wq(osso.parent));
  osso.quaternion.premultiply(P.clone().invert().multiply(rot).multiply(P));
}
// O mixer escreve o quaternion do osso a cada quadro que anda; quando NÃO
// anda (parado, ou o clip não tem esse osso), o valor do quadro anterior já
// traz o nosso giro. Guardar o par (cru, escrito) deixa o giro idempotente.
function giraSobreOCru(i, m, osso, chave, rot) {
  const g = i.cru[chave];
  if (g && osso.quaternion.equals(g.escrito)) osso.quaternion.copy(g.cru);
  const cru = osso.quaternion.clone();
  giraNaRaiz(m, osso, rot);
  i.cru[chave] = { cru, escrito: osso.quaternion.clone() };
}

function orientaOsso(osso, filho, alvo) {
  osso.updateWorldMatrix(true, true);
  const p = wp(osso), de = wp(filho).sub(p).normalize(), para = alvo.clone().sub(p).normalize();
  if (para.lengthSq() < 0.5) return;
  const rot = q().setFromUnitVectors(de, para).multiply(wq(osso));
  osso.quaternion.copy(wq(osso.parent).invert().multiply(rot));
  osso.updateWorldMatrix(false, true);
}
// Dois segmentos de comprimento fixo; o cotovelo vai para o lado do polo. A
// mão NÃO é tocada: ela mantém a orientação que tem em relação ao antebraço,
// e é isso que impede o pulso de torcer 180° quando o braço estica.
export function resolveBraco(b, alvo, polo) {
  const { ombro, cotovelo, mao } = b;
  ombro.updateWorldMatrix(true, true);
  const a = wp(ombro), e = wp(cotovelo), c = wp(mao), l1 = a.distanceTo(e), l2 = e.distanceTo(c);
  const dir = alvo.clone().sub(a), d = T.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 0.002, (l1 + l2) * 0.985);
  dir.normalize();
  const fim = a.clone().addScaledVector(dir, d), x = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const n = polo.clone().sub(a).addScaledVector(dir, -polo.clone().sub(a).dot(dir)).normalize();
  orientaOsso(ombro, cotovelo, a.clone().addScaledVector(dir, x).addScaledVector(n, h));
  orientaOsso(cotovelo, mao, fim);
  return fim;
}

// Onde a mão segura: um ponto no espaço LOCAL do osso da mão, escrito nos
// eixos anatômicos que dedos3d.js mede (Y = para os dedos, `lateral` = para o
// polegar, `palma` = para fora da palma). Vale para qualquer rig do elenco.
const PEGA = {
  leque: { dedos: 0.055, palma: 0.012, lateral: 0.0 },   // o pé do leque na palma esquerda
  carta: { dedos: 0.06, palma: 0.014, lateral: 0.0 },    // a carta solta na palma direita
};
// Os rigs do elenco vêm em centímetros (o Armature tem escala 0,01): um
// deslocamento em metros no espaço do osso precisa ser dividido por essa
// escala, e um objeto pendurado num osso, multiplicado por ela.
function escalaDoOsso(osso) { return osso.getWorldScale(v()).x || 1; }
function pontoNaMao(mao, pega) {
  return Y.clone().multiplyScalar(pega.dedos).addScaledVector(mao.palma, pega.palma).addScaledVector(mao.lateral, pega.lateral)
    .divideScalar(escalaDoOsso(mao.osso));
}

export function preparaInteracao(m) {
  const raiz = m.raiz;
  const spine = raiz.getObjectByName('Spine01'), head = raiz.getObjectByName('Head');
  const left = raiz.getObjectByName('LeftArm'), right = raiz.getObjectByName('RightArm');
  const i = { bracos: {}, spine, head, alinha: null, desalinha: null, cru: {}, evento: null, fila: [], tempo: 0, leque: null, carta: null, ancora: new T.Object3D(), pegaEsq: null, pegaDir: null };
  raiz.updateWorldMatrix(true, true);
  // A pose assada trazia o tronco torcido: um ombro ~25 cm atrás do outro.
  // Endireita o tronco a partir de Spine01 (a pelve e as pernas ficam) e
  // devolve à cabeça a orientação que ela tinha — ela foi assada olhando
  // para a frente, e sem isto sairia olhando 50° para o lado.
  if (spine && left && right) {
    const linha = raiz.worldToLocal(wp(left)).sub(raiz.worldToLocal(wp(right)));
    const ang = Math.atan2(linha.z, linha.x);
    i.alinha = q().setFromAxisAngle(Y, ang);
    i.desalinha = i.alinha.clone().invert();
  }
  for (const lado of ['Left', 'Right']) {
    const ombro = raiz.getObjectByName(`${lado}Arm`), cotovelo = raiz.getObjectByName(`${lado}ForeArm`), mao = m.dedos.maos[lado];
    if (!ombro || !cotovelo || !mao) continue;
    // Os braços foram assados em volta do leque com o tronco torcido; ao
    // endireitar o tronco eles iriam junto, para o lado. Guarda onde cada mão
    // ESTAVA (no espaço da raiz) e desfaz o giro no ombro: a cinemática do
    // repouso leva a mão de volta a esse ponto a partir daí, e só o cotovelo
    // se acomoda ao ombro que mudou de lugar com o tronco.
    const repouso = raiz.worldToLocal(wp(mao.osso));
    if (i.desalinha) giraNaRaiz(m, ombro, i.desalinha);
    i.bracos[lado] = { ombro, cotovelo, mao: mao.osso, dedos: mao, repouso, baseO: ombro.quaternion.clone(), baseC: cotovelo.quaternion.clone(), sinal: lado === 'Left' ? 1 : -1 };
  }
  if (i.bracos.Left) i.pegaEsq = pontoNaMao(i.bracos.Left.dedos, PEGA.leque);
  if (i.bracos.Right) i.pegaDir = pontoNaMao(i.bracos.Right.dedos, PEGA.carta);
  m.interacao = i;
  raiz.add(i.ancora);
  return i;
}

// O leque (e a carta solta) entram no corpo: o leque numa âncora que segue a
// palma esquerda mas mantém a orientação da mesa (as costas para a câmera,
// levemente deitado para trás); a carta solta vira filha do osso da mão
// direita, na palma, e aparece só durante o gesto.
export function conectaLeque(m, leque, carta = null) {
  const i = m.interacao || preparaInteracao(m);
  i.leque = leque; i.carta = carta;
  leque.removeFromParent(); i.ancora.add(leque);
  leque.position.set(0, 0.035, 0.01); leque.rotation.set(-0.28, 0, 0); leque.scale.setScalar(1);
  if (!i.bracos.Left) { const p = m.posLeque.clone(); m.raiz.parent?.localToWorld(p); i.ancora.position.copy(m.raiz.worldToLocal(p)); }
  if (carta) {
    carta.visible = false; carta.removeFromParent();
    const b = i.bracos.Right;
    if (b) {
      b.mao.add(carta);
      carta.scale.divideScalar(escalaDoOsso(b.mao));   // o tamanho pedido pelo chamador é em metros
      carta.position.copy(i.pegaDir);
      const y = Y.clone(), z = b.dedos.palma.clone(), x = y.clone().cross(z).normalize(); z.copy(x).cross(y).normalize();
      carta.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    } else m.raiz.add(carta);
  }
}

// A ponta projetada de um dedo (as falanges do arquivo param a 76% do dedo).
export function pontaDedo(m, lado, dedo) {
  const b = m.raiz.getObjectByName(`${lado}Hand${dedo}3`);
  if (!b) return null;
  return b.localToWorld(b.position.clone().multiplyScalar(0.24 / 0.31));
}

// Abre o leque em volta da pega: cartas de ESCALA_CARTA_MAO, abertura que
// cresce com a mão até um teto, giradas em torno do pé do leque.
export function arrumaLeque(leque, n, max = 9) {
  n = Math.min(max, n);
  const passo = n > 1 ? Math.min(0.13, 0.95 / (n - 1)) : 0;
  for (let k = 0; k < max; k++) {
    const c = leque.children[k];
    if (!c?.isMesh) continue;
    c.visible = k < n;
    if (!c.visible) continue;
    const a = (k - (n - 1) / 2) * passo;
    c.scale.setScalar(ESCALA_CARTA_MAO);
    // pivô no pé do leque: a carta sobe do pé e gira em torno dele
    const r = 0.59 * ESCALA_CARTA_MAO * 0.5;
    c.position.set(Math.sin(a) * r, Math.cos(a) * r, k * 0.0007);
    c.rotation.set(0, 0, -a);
    c.material.side = T.DoubleSide;
  }
}

// Um gesto do braço direito: a mão vai até `destino` (no mundo) e volta. O
// alvo é trazido para o alcance do braço; o resto do caminho a carta voa.
export function gestoCarta(m, tipo, destino) {
  const i = m.interacao;
  if (!i || !destino || !i.bracos.Right) return false;
  m.raiz.updateWorldMatrix(true, true);
  const p = m.raiz.worldToLocal(destino.clone());
  p.y = T.MathUtils.clamp(p.y, MESA.altura + 0.08 - m.raiz.position.y, 1.0);
  p.z = T.MathUtils.clamp(p.z, 0.38, 0.62);
  p.x = T.MathUtils.clamp(p.x, -0.30, 0.16);
  const e = { tipo, alvo: p, t: 0, dur: tipo === 'baixar' ? 1.3 : 1.05 };
  if (i.evento) { if (i.fila.length < 4) i.fila.push(e); } else i.evento = e;
  return true;
}

export function atualizaInteracao(m, dt, { flexao = 0.62, flexaoDir = 0.3, parado = false, olhar = 0 } = {}) {
  const i = m.interacao;
  if (!i) { m.dedos.alvo = flexao; atualizaDedos(m.dedos, dt, parado); return; }
  i.tempo += parado ? 0 : dt;
  m.raiz.updateWorldMatrix(true, true);
  // tronco endireitado, cabeça devolvida e virada para quem joga
  if (i.alinha && i.spine) giraSobreOCru(i, m, i.spine, 'spine', i.alinha);
  if (i.head) {
    const rot = i.alinha ? i.desalinha.clone() : q();
    rot.premultiply(q().setFromAxisAngle(Y, T.MathUtils.clamp(olhar, -0.4, 0.4)));
    giraSobreOCru(i, m, i.head, 'head', rot);
  }
  // gesto em curso: a mão direita vai e volta (mover 0→1→0)
  let mover = 0, aperto = flexaoDir;
  const e = i.evento;
  if (e && !parado) {
    e.t += dt;
    const t = e.t / e.dur;
    mover = t < 0.4 ? smooth(t / 0.4) : t < 0.57 ? 1 : 1 - smooth((t - 0.57) / 0.43);
    aperto = e.tipo === 'comprar' ? (t < 0.4 ? 0.12 : 0.55) : (t > 0.4 && t < 0.6 ? 0.1 : 0.55);
    if (t >= 1) i.evento = i.fila.shift() || null;
  } else if (parado) { i.evento = null; i.fila.length = 0; }
  for (const lado of ['Left', 'Right']) {
    const b = i.bracos[lado];
    if (!b) continue;
    // repouso: a mão no ponto em que foi assada; no gesto, a mão direita
    // desliza desse ponto até o alvo e volta (mover 0→1→0)
    b.ombro.quaternion.copy(b.baseO); b.cotovelo.quaternion.copy(b.baseC);
    const alvo = b.repouso.clone();
    if (lado === 'Right' && mover > 0) { alvo.lerp(e.alvo, mover); alvo.y += Math.sin(mover * Math.PI) * 0.05; }
    const polo = m.raiz.localToWorld(new T.Vector3(b.sinal * 0.45, 0.72 - m.raiz.position.y, 0.0));
    resolveBraco(b, m.raiz.localToWorld(alvo), polo);
    b.ombro.updateWorldMatrix(false, true);
  }
  m.dedos.alvo = flexao; m.dedos.alvos = { Left: flexao, Right: aperto };
  atualizaDedos(m.dedos, dt, parado);
  m.raiz.updateWorldMatrix(true, true);
  // o leque segue a palma esquerda (posição), com a orientação da mesa
  if (i.bracos.Left && i.pegaEsq) {
    const p = i.bracos.Left.mao.localToWorld(i.pegaEsq.clone());
    i.ancora.position.copy(m.raiz.worldToLocal(p));
  }
  if (i.carta) i.carta.visible = !!e && !parado && (e.tipo === 'comprar' ? e.t / e.dur > 0.42 : e.t / e.dur < 0.49);
}

// A cadeira sob o quadril: o osso do quadril fica `folgaQuadril` acima do
// assento na pose assada, então é ele que dita a altura — e não a roupa, que
// numa saia desce muito abaixo das coxas e deixava a cadeira lá embaixo.
export function ajustaBanqueta(m, banco) {
  const hips = m.raiz.getObjectByName('Hips');
  if (!hips) return;
  m.raiz.updateWorldMatrix(true, true);
  const h = m.raiz.worldToLocal(wp(hips));
  banco.position.set(h.x, 0, h.z - 0.045);
  const topo = h.y + m.raiz.position.y - MESA.folgaQuadril;
  const base = banco.userData.alturaAssento || 0.5;
  banco.scale.set(1, T.MathUtils.clamp(topo / base, 0.85, 1.3), 1);
}
