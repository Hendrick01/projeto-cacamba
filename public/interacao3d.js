// ============================================================================
// Caçamba — o corpo do personagem em jogo: postura, leque, gestos e cadeira
//
// Há DOIS elencos possíveis, e este módulo atende os dois:
//
// 1. **Com esqueleto** (test/modelo-senta.mjs): a pose sentada vem assada no
//    .glb. Aqui só se corrige o que a assadura deixou (o tronco torcido ~50°),
//    pendura-se o leque na palma esquerda, move-se o braço direito nos gestos
//    de comprar/descartar/baixar e vira-se a cabeça para quem joga.
// 2. **Escultura estática** (scripts/prepara_sentado.py, o elenco de
//    07/09/2026): malha só, já sentada e com as mãos em pinça. Não há osso
//    nenhum para mover, então a atuação é do CORPO INTEIRO — é o que a
//    referência do Capote mostra de longe e o que se lê numa mesa de celular:
//    o tronco vira para quem está jogando, respira, e na própria vez inclina
//    para a frente e levanta o leque para olhar as cartas.
// ============================================================================
import * as T from './vendor/three.module.js';
import { atualizaDedos } from './dedos3d.js';

// Medidas da mesa de jantar (referência do Capote): tampo baixo, feltro
// pequeno, cadeiras encostadas na beirada — as coxas entram sob o tampo e os
// cotovelos alcançam a borda. `folgaQuadril` é a distância do osso do quadril
// ao assento na pose assada (senta.mjs: --folga 0.16 até o osso, menos os 5 cm
// da almofada). `assento` é o raio mínimo da roda de cadeiras.
// `assento` é o raio da roda de cadeiras. 1,34 m encosta a barriga na borda do
// tampo (raio 1,15 + aro): é assim na referência do Capote — joelhos por baixo
// do tampo, mãos e leque SOBRE a madeira. A 1,45 sobrava um palmo de chão
// entre a mesa e cada um, e as cartas ficavam boiando fora do tampo.
export const MESA = Object.freeze({ altura: 0.76, raio: 1.15, assento: 1.34, folgaQuadril: 0.11 });
// O tamanho da carta na mão de um modelo, em relação à carta de 42×59 cm da
// mesa: 0,21 dá 8,8×12,4 cm. Era 0,26 (11×15 cm) e o leque tampava o queixo —
// na referência dá para ler a cara de quem está jogando por cima das cartas.
export const ESCALA_CARTA_MAO = 0.21;

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
    const ombro = raiz.getObjectByName(`${lado}Arm`), cotovelo = raiz.getObjectByName(`${lado}ForeArm`), maoOsso = raiz.getObjectByName(`${lado}Hand`);
    if (!ombro || !cotovelo || !maoOsso) continue;
    // Os braços foram assados em volta do leque com o tronco torcido; ao
    // endireitar o tronco eles iriam junto, para o lado. Guarda onde cada mão
    // ESTAVA (no espaço da raiz) e desfaz o giro no ombro: a cinemática do
    // repouso leva a mão de volta a esse ponto a partir daí, e só o cotovelo
    // se acomoda ao ombro que mudou de lugar com o tronco.
    const repouso = raiz.worldToLocal(wp(maoOsso));
    if (i.desalinha) giraNaRaiz(m, ombro, i.desalinha);
    // `dedos` (eixos da palma) só existe num rig com ossos de dedo; sem ele o
    // braço ainda vai e volta, mas o leque se pendura no osso da mão
    i.bracos[lado] = { ombro, cotovelo, mao: maoOsso, dedos: m.dedos.maos[lado] || null, repouso, baseO: ombro.quaternion.clone(), baseC: cotovelo.quaternion.clone(), sinal: lado === 'Left' ? 1 : -1 };
  }
  // Endireitar o tronco sem poder levar as mãos de volta deixaria os braços
  // apontando para o lado: rig sem os dois braços fica com o tronco do arquivo.
  if (!i.bracos.Left || !i.bracos.Right) i.alinha = i.desalinha = null;
  // Escultura sem esqueleto: nada a girar por dentro. Guarda o repouso da
  // raiz — é sobre ele que o corpo inteiro vira, respira e se inclina.
  i.estatico = !i.bracos.Left && !i.bracos.Right;
  if (i.estatico) {
    i.repousoRaiz = raiz.position.clone();
    i.giroBase = raiz.rotation.y;
    i.giro = 0; i.vez = 0;
    // o pescoço medido na escultura (pescoco3d.js), quando há: a cabeça vira
    // por conta própria e o corpo acompanha menos
    i.pescoco = m.pescoco?.osso || null; i.giroCabeca = 0;
  }
  if (i.bracos.Left?.dedos) i.pegaEsq = pontoNaMao(i.bracos.Left.dedos, PEGA.leque);
  if (i.bracos.Right?.dedos) i.pegaDir = pontoNaMao(i.bracos.Right.dedos, PEGA.carta);
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
  i.ancoraBase = i.ancora.position.clone();
  if (carta) {
    carta.visible = false; carta.removeFromParent();
    const b = i.bracos.Right;
    if (b?.dedos) {
      b.mao.add(carta);
      carta.scale.divideScalar(escalaDoOsso(b.mao));   // o tamanho pedido pelo chamador é em metros
      carta.position.copy(i.pegaDir);
      const y = Y.clone(), z = b.dedos.palma.clone(), x = y.clone().cross(z).normalize(); z.copy(x).cross(y).normalize();
      carta.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    } else if (i.estatico) {
      // sem osso de mão, a carta que voa sai da PINÇA: pendurada na raiz ela
      // partiria da origem do modelo, que é o chão entre os pés
      i.ancora.add(carta); carta.position.set(0, 0.02, 0.04); carta.rotation.set(-0.28, 0, 0);
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
    // a base fica guardada: a presença de quem segura o leque ergue a carta
    // que ele está escolhendo, e ela volta para cá quando ele solta
    c.userData.base = c.position.clone();
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

// APONTAR, sustentado: a mão direita vai até `destino` (no mundo) e FICA lá
// enquanto houver destino; sem destino, volta ao repouso. É a presença de
// outro jogador — a carta que ele está escolhendo na própria mão — e por isso
// não é um pulso como `gestoCarta`: dura o que a escolha dele durar. O pulso
// de um evento (comprar, descartar) tem prioridade quando os dois coincidem.
export function apontaCarta(m, destino) {
  const i = m.interacao;
  if (!i || !i.bracos?.Right) return false;
  if (!destino) { i.aponta = false; return true; }
  m.raiz.updateWorldMatrix(true, true);
  const p = m.raiz.worldToLocal(destino.clone());
  p.y = T.MathUtils.clamp(p.y, MESA.altura + 0.08 - m.raiz.position.y, 1.05);
  p.z = T.MathUtils.clamp(p.z, 0.15, 0.62);
  p.x = T.MathUtils.clamp(p.x, -0.35, 0.25);
  i.apontaAlvo = p; i.aponta = true;
  return true;
}

// A atuação de uma escultura sem esqueleto: tudo acontece na raiz. Os três
// gestos vêm da referência do Capote — o corpo vira para quem está jogando, o
// peito sobe e desce parado, e quem está na vez chega para a frente e levanta
// o leque para conferir a mão. Nada disso pede osso, e é o que se enxerga de
// uma mesa inteira num celular.
const RESPIRO = 0.008;      // metros de sobe-e-desce
const CHEGADA = 0.055;      // metros para a frente na própria vez
const LEQUE_NA_VEZ = 0.06;  // metros que o leque sobe na própria vez

// A reação sem morph nem clip. Uma escultura não muda de cara, então quem
// baixou, bateu ou levou a carta responde com o CORPO: `feliz` pula duas vezes
// no assento, `bravo` balança a cabeça (aqui, o tronco) e recua um palmo. As
// duas nascem e morrem no repouso — o envelope `sin(pi·u)` garante isso, e por
// isso podem somar-se ao respiro e à chegada da vez sem tranco.
const REACOES = {
  feliz: { dur: 0.95, batidas: 2, sobe: 0.045, giro: 0.05, recua: 0 },
  bravo: { dur: 1.05, batidas: 2, sobe: 0.004, giro: 0.17, recua: 0.05 },
};
// Marca a reação. Só vale para escultura estática: num modelo com esqueleto o
// clip (ou o morph) manda, e mexer na raiz brigaria com a cinemática dos braços.
export function reageCorpo(m, tipo) {
  const i = m.interacao;
  if (!i?.estatico || !REACOES[tipo]) return false;
  i.reacao = { tipo, t: 0 };
  return true;
}
// Devolve {dy, dz, giro} da reação em curso, ou zeros.
function passoDaReacao(i, dt, parado) {
  const r = i.reacao;
  if (!r) return { dy: 0, dz: 0, giro: 0 };
  const e = REACOES[r.tipo];
  r.t += parado ? e.dur : dt;
  const u = r.t / e.dur;
  if (u >= 1) { i.reacao = null; return { dy: 0, dz: 0, giro: 0 }; }
  const env = Math.sin(Math.PI * u), onda = Math.sin(2 * Math.PI * e.batidas * u);
  return { dy: e.sobe * Math.abs(onda) * env, dz: -e.recua * env, giro: e.giro * onda * env };
}
function atuaCorpoInteiro(m, i, dt, { parado, olhar, suaVez }) {
  const suave = parado ? 1 : 1 - Math.exp(-dt * 4);
  // COM pescoço quem olha é a cabeça: o tronco dá só o começo do giro (até
  // ~13°) e a cabeça completa, até ~46° além dele — e chega antes, como
  // gente. SEM pescoço, o corpo inteiro vira até 0,37 rad, como sempre foi.
  const alvo = T.MathUtils.clamp(olhar, -1.3, 1.3);
  const doCorpo = T.MathUtils.clamp(alvo, -0.5, 0.5) * (i.pescoco ? 0.45 : 0.75);
  i.giro += (doCorpo - i.giro) * suave;
  if (i.pescoco) {
    const daCabeca = T.MathUtils.clamp(alvo - doCorpo, -0.8, 0.8);
    i.giroCabeca += (daCabeca - i.giroCabeca) * (parado ? 1 : 1 - Math.exp(-dt * 7));
    // quem olha para o lado baixa um pouco o queixo; e um nada de respiro
    i.pescoco.rotation.set(Math.abs(i.giroCabeca) * 0.06 + (parado ? 0 : Math.sin(i.tempo * 0.9) * 0.012), i.giroCabeca, 0);
  }
  i.vez += ((suaVez ? 1 : 0) - i.vez) * suave;
  const r = m.raiz;
  r.rotation.y = i.giroBase + i.giro;
  // chega para a frente NO EIXO DO CORPO (a raiz já está virada), para a
  // inclinação valer também quando ele está olhando para o lado
  const reacao = passoDaReacao(i, dt, parado);
  r.rotation.y += reacao.giro;
  const c = Math.cos(i.giro), sn = Math.sin(i.giro), avanca = i.vez * CHEGADA + reacao.dz;
  r.position.set(i.repousoRaiz.x + sn * avanca, i.repousoRaiz.y + reacao.dy + (parado ? 0 : Math.sin(i.tempo * 1.7) * RESPIRO), i.repousoRaiz.z + c * avanca);
  // o leque mora na âncora: sobe um pouco e deita para o dono na própria vez
  // (antes de `conectaLeque` ainda não há âncora com base — o corpo já atua)
  if (i.ancoraBase) i.ancora.position.y = i.ancoraBase.y + i.vez * LEQUE_NA_VEZ;
  if (i.leque) i.leque.rotation.x = -0.28 - i.vez * 0.22;
}

export function atualizaInteracao(m, dt, { flexao = 0.62, flexaoDir = 0.3, parado = false, olhar = 0, suaVez = false } = {}) {
  const i = m.interacao;
  if (!i) { m.dedos.alvo = flexao; atualizaDedos(m.dedos, dt, parado); return; }
  i.tempo += parado ? 0 : dt;
  if (i.estatico) { atuaCorpoInteiro(m, i, dt, { parado, olhar, suaVez }); m.raiz.updateWorldMatrix(true, true); return; }
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
  // apontar sustentado (presença): entra e sai devagar, e só quando não há
  // pulso de evento no ar
  i.apontaT = T.MathUtils.clamp((i.apontaT || 0) + (i.aponta && !parado ? dt * 3.5 : -dt * 3.5), 0, 1);
  if (!e && i.apontaT > 0 && i.apontaAlvo) { mover = smooth(i.apontaT); aperto = 0.3; }
  const alvoDoGesto = e ? e.alvo : i.apontaAlvo;
  for (const lado of ['Left', 'Right']) {
    const b = i.bracos[lado];
    if (!b) continue;
    // repouso: a mão no ponto em que foi assada; no gesto, a mão direita
    // desliza desse ponto até o alvo e volta (mover 0→1→0)
    b.ombro.quaternion.copy(b.baseO); b.cotovelo.quaternion.copy(b.baseC);
    const alvo = b.repouso.clone();
    if (lado === 'Right' && mover > 0 && alvoDoGesto) { alvo.lerp(alvoDoGesto, mover); alvo.y += Math.sin(mover * Math.PI) * 0.05; }
    const polo = m.raiz.localToWorld(new T.Vector3(b.sinal * 0.45, 0.72 - m.raiz.position.y, 0.0));
    resolveBraco(b, m.raiz.localToWorld(alvo), polo);
    b.ombro.updateWorldMatrix(false, true);
  }
  m.dedos.alvo = flexao; m.dedos.alvos = { Left: flexao, Right: aperto };
  atualizaDedos(m.dedos, dt, parado);
  m.raiz.updateWorldMatrix(true, true);
  // o leque segue a palma esquerda (posição), com a orientação da mesa; sem
  // ossos de dedo, segue o osso da mão, um pouco acima e à frente dele
  if (i.bracos.Left) {
    const p = i.pegaEsq ? i.bracos.Left.mao.localToWorld(i.pegaEsq.clone()) : wp(i.bracos.Left.mao);
    i.ancora.position.copy(m.raiz.worldToLocal(p));
    if (!i.pegaEsq) i.ancora.position.add(new T.Vector3(0, 0.03, 0.04));
  }
  if (i.carta) i.carta.visible = !!e && !parado && (e.tipo === 'comprar' ? e.t / e.dur > 0.42 : e.t / e.dur < 0.49);
}

// A cadeira sob o quadril: o osso do quadril fica `folgaQuadril` acima do
// assento na pose assada, então é ele que dita a altura — e não a roupa, que
// numa saia desce muito abaixo das coxas e deixava a cadeira lá embaixo.
export function ajustaBanqueta(m, banco) {
  const base = banco.userData.alturaAssento || 0.5;
  let x, z, topo;
  const hips = m.raiz.getObjectByName('Hips');
  if (hips) {
    m.raiz.updateWorldMatrix(true, true);
    const h = m.raiz.worldToLocal(wp(hips));
    x = h.x; z = h.z - 0.045; topo = h.y + m.raiz.position.y - MESA.folgaQuadril;
  } else if (m.posAssento) {
    // Escultura estática: `Assento` é o plano medido na malha (a face de baixo
    // das nádegas), já no espaço do assento. A cadeira vai EXATAMENTE ali —
    // pela caixa ela caía 15 a 20 cm à frente e o personagem sentava no ar.
    x = m.posAssento.x; z = m.posAssento.z; topo = m.posAssento.y;
  } else return;
  banco.position.set(x, 0, z);
  banco.scale.set(1, T.MathUtils.clamp(topo / base, 0.85, 1.3), 1);
}
