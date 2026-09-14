import * as THREE from './vendor/three.module.js';

const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
const suaviza = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };

// Poses de primeira pessoa. Os valores sao multiplicadores de flexao por junta.
// Em vez de fechar todos os dedos por um unico valor, cada dedo recebe um alvo
// proprio. Isto evita a mao em "garra" e permite pinça real para a carta.
//
// Os valores são SOMADOS ao que veio no arquivo (`base × pose` em cada junta),
// não substituem a pose assada. Por isso existe `neutro`: é a pose que devolve
// a mão exatamente como `mao_pose_segura.py` a mediu — quem carrega um .glb já
// posado começa por ela, senão a dobra entra duas vezes e a mão vira garra.
export const POSES_FP = Object.freeze({
  neutro: Object.freeze({
    Thumb:  [0, 0, 0],
    Index:  [0, 0, 0],
    Middle: [0, 0, 0],
    Ring:   [0, 0, 0],
    Pinky:  [0, 0, 0],
  }),
  repouso: Object.freeze({
    Thumb:  [0.10, 0.16, 0.10],
    Index:  [0.12, 0.16, 0.10],
    Middle: [0.18, 0.24, 0.16],
    Ring:   [0.24, 0.34, 0.24],
    Pinky:  [0.30, 0.42, 0.30],
  }),
  // SEGURANDO O LEQUE. A ordem importa mais que os valores: numa mão que segura
  // cartas, os quatro dedos ficam ATRÁS delas, sustentando, e só o POLEGAR
  // cruza na frente. Com os dedos dobrados como estavam, eles avançavam tanto
  // quanto o polegar e a mão saía furando o leque, empurrada contra as cartas
  // em vez de segurá-las. Agora os quatro quase não dobram — ficam de pé atrás
  // do leque, onde não se veem — e o polegar fecha por cima.
  leque: Object.freeze({
    Thumb:  [0.62, 0.72, 0.34],
    Index:  [0.10, 0.14, 0.10],
    Middle: [0.12, 0.18, 0.12],
    Ring:   [0.16, 0.24, 0.16],
    Pinky:  [0.22, 0.32, 0.22],
  }),
  // O LEQUE COM UMA CARTA ESCOLHIDA. Só o polegar muda — é ele que empurra a
  // carta selecionada para fora do maço. Os quatro continuam exatamente onde
  // estavam, atrás: se eles subissem junto, a mão passaria na frente do leque
  // e o jogador perderia de vista justamente a carta que acabou de escolher.
  lequeAberto: Object.freeze({
    Thumb:  [0.78, 0.86, 0.44],
    Index:  [0.10, 0.14, 0.10],
    Middle: [0.12, 0.18, 0.12],
    Ring:   [0.16, 0.24, 0.16],
    Pinky:  [0.22, 0.32, 0.22],
  }),
  // O APERTO DA RECUSA. Quando a jogada não vale, a mão fecha um tico no leque
  // e volta — é o "não dá" sem texto na tela. Continua sendo uma mão que
  // segura: os quatro só se firmam, ninguém sai de trás das cartas.
  lequeFirme: Object.freeze({
    Thumb:  [0.70, 0.80, 0.40],
    Index:  [0.14, 0.20, 0.14],
    Middle: [0.16, 0.24, 0.16],
    Ring:   [0.20, 0.30, 0.20],
    Pinky:  [0.26, 0.38, 0.26],
  }),
  // A MÃO DE QUEM VAI PEGAR. É o repouso com o indicador estendido e o polegar
  // saindo da palma: o resto se recolhe um pouco para tirá-los do caminho. É a
  // pose da própria vez, antes de qualquer movimento.
  pronta: Object.freeze({
    Thumb:  [0.22, 0.20, 0.10],
    Index:  [0.06, 0.10, 0.06],
    Middle: [0.20, 0.28, 0.18],
    Ring:   [0.28, 0.40, 0.28],
    Pinky:  [0.34, 0.48, 0.34],
  }),
  pinca: Object.freeze({
    Thumb:  [0.52, 0.72, 0.38],
    Index:  [0.42, 0.62, 0.38],
    Middle: [0.28, 0.42, 0.30],
    Ring:   [0.42, 0.62, 0.46],
    Pinky:  [0.54, 0.76, 0.58],
  }),
  // A PINÇA UM INSTANTE ANTES DE FECHAR — e a mesma que SOLTA a carta no
  // descarte. Polegar e indicador afastados, os outros três já recolhidos: é o
  // que dá ao descarte a leitura de largar, e não de empurrar.
  pincaAberta: Object.freeze({
    Thumb:  [0.30, 0.34, 0.18],
    Index:  [0.18, 0.24, 0.16],
    Middle: [0.28, 0.42, 0.30],
    Ring:   [0.42, 0.62, 0.46],
    Pinky:  [0.54, 0.76, 0.58],
  }),
  // A MÃO QUE ENTREGA: abre e deixa o jogo na mesa. Serve para baixar e para
  // bater — nas duas o gesto é o mesmo, o que muda é quanto ele dura.
  espalmada: Object.freeze({
    Thumb:  [0.14, 0.10, 0.06],
    Index:  [0.04, 0.05, 0.04],
    Middle: [0.05, 0.06, 0.05],
    Ring:   [0.07, 0.09, 0.07],
    Pinky:  [0.10, 0.12, 0.10],
  }),
});

// Limite conservador por junta, em radianos: a primeira pessoa amplifica
// qualquer erro anatômico, e o polegar é o que mais denuncia — ele cruza na
// frente das cartas, onde se vê. Nenhuma pose, nem nenhuma interpolação entre
// duas, pode passar daqui: o valor da pose é sempre lido preso a [0, 1].
export const ANGULO_MAX_FP = Object.freeze({
  Thumb: 0.95, Index: 1.35, Middle: 1.35, Ring: 1.35, Pinky: 1.35,
});
const anguloMaximo = (dedo) => ANGULO_MAX_FP[dedo] ?? 1.35;

const LADOS = Object.freeze(['Left', 'Right']);
// 1/9 de segundo entre duas poses: era a velocidade fixa do módulo antes da
// máquina, e continua sendo o padrão de quem não pede tempo nenhum.
const DURACAO_PADRAO = 1 / 9;

// ---------------------------------------------------------------------------
// Os gestos: o que a mão faz em cada momento da partida
// ---------------------------------------------------------------------------
// Um gesto é um par de poses (uma por mão) mais o tempo que ele leva. Há dois
// tipos, e a diferença é quem manda parar:
//
//  * o gesto de BASE fica de pé até outro tomar o lugar — "não é minha vez"
//    dura o turno inteiro do vizinho;
//  * o PULSO vai e volta sozinho — puxar a carta do monte é um movimento só, e
//    a mão volta ao leque sem ninguém pedir.
//
// Isto mora aqui, e não na mesa, porque a mesa já tem o que fazer: ela avisa o
// momento ("comprei do monte") e esquece. O tempo do dedo é problema daqui.
//
// `null` num lado quer dizer NÃO ENCOSTE nesta mão: no pulso da compra a
// esquerda continua segurando o leque, e mexer nela seria derrubar as cartas
// no meio do gesto.
export const GESTOS_FP = Object.freeze({
  // --- gestos de base -------------------------------------------------------
  espera:      Object.freeze({ Left: 'leque', Right: 'repouso', dur: 0.20 }),
  minhaVez:    Object.freeze({ Left: 'leque', Right: 'pronta',  dur: 0.16 }),
  // com carta escolhida o polegar a empurra para fora do maço, e assim fica
  // enquanto a seleção durar: é o feedback de "esta aqui" na própria mão
  selecionada: Object.freeze({ Left: 'lequeAberto', Right: 'pronta', dur: 0.14 }),
  // fim de rodada / fim de jogo: as mãos descansam, não há mais o que segurar
  fim:         Object.freeze({ Left: 'repouso', Right: 'repouso', dur: 0.30 }),

  // --- pulsos ---------------------------------------------------------------
  // A pinça fecha, segura um instante e volta. Quem leva a mão até o monte é a
  // mesa; daqui sai só o dedo que se fecha na carta.
  compraMonte:    Object.freeze({ pulso: true, Left: null, Right: 'pinca', subida: 0.16, sustenta: 0.12, descida: 0.22 }),
  // pegar do meio é um alcance mais longo que puxar do monte — a carta está do
  // outro lado do tampo, e o gesto acompanha
  compraDescarte: Object.freeze({ pulso: true, Left: null, Right: 'pinca', subida: 0.20, sustenta: 0.16, descida: 0.24 }),
  // descartar é LARGAR: a pinça abre, e é a abertura que se vê
  descarta:       Object.freeze({ pulso: true, Left: null, Right: 'pincaAberta', subida: 0.14, sustenta: 0.10, descida: 0.26 }),
  // baixar mexe nas duas: a direita entrega o jogo, a esquerda solta as cartas
  // que saíram do leque
  baixaJogo:      Object.freeze({ pulso: true, Left: 'lequeAberto', Right: 'espalmada', subida: 0.22, sustenta: 0.20, descida: 0.30 }),
  // bater é a única vez em que as duas mãos abrem — e a única que se demora
  bate:           Object.freeze({ pulso: true, Left: 'espalmada', Right: 'espalmada', subida: 0.24, sustenta: 0.60, descida: 0.36 }),
  // jogada recusada: um aperto curto no leque. Curto de propósito — é um
  // "não", não uma reação
  bloqueado:      Object.freeze({ pulso: true, Left: 'lequeFirme', Right: null, subida: 0.09, sustenta: 0.05, descida: 0.14 }),
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

const qDesconta = new THREE.Quaternion();
function coletaJuntas(raiz, lado, poseDoArquivo = null) {
  const hand = raiz.getObjectByName(`${lado}Hand`);
  if (!hand) return null;
  const juntas = [];
  hand.traverse((osso) => {
    if (!osso.isBone) return;
    const dedo = nomeDedo(osso.name);
    if (!dedo) return;
    const seg = segmentoDoOsso(osso);
    const base = osso.quaternion.clone();
    const eixo = eixoFlexao(osso);
    // O ARQUIVO JÁ VEM POSADO (mao_pose_segura.py mediu a mão fechada no leque
    // e a pinça contra o plano da carta). Como a máquina escreve `base × pose`,
    // aplicar a pose do leque por cima de uma mão que já está no leque dobra
    // tudo duas vezes — foi assim que a mão virou garra e furou as cartas.
    // Descontando aqui a pose que veio assada, `base` passa a ser a mão
    // espalmada de mentira: pedir `leque` devolve EXATAMENTE o arquivo, e as
    // outras poses saem dele por diferença, que é o que a máquina precisa.
    if (poseDoArquivo) {
      qDesconta.setFromAxisAngle(eixo, valorPose(poseDoArquivo, dedo, seg) * anguloMaximo(dedo));
      base.multiply(qDesconta.invert());
    }
    juntas.push({
      osso,
      dedo,
      seg,
      base,
      eixo,
      angulo: 0,   // último ângulo escrito, em radianos — para conferir de fora
    });
  });
  return { hand, juntas };
}

// `poseDoArquivo` diz em que pose cada mão saiu do .glb — 'leque' para a
// esquerda e 'pinca' para a direita, no elenco de hoje. Sem ele, o módulo
// entende que o arquivo veio espalmado.
export function criaRigPrimeiraPessoa(raiz, { gesto = 'espera', poseDoArquivo = null } = {}) {
  if (!raiz) return null;
  const doArquivo = typeof poseDoArquivo === 'string'
    ? { Left: poseDoArquivo, Right: poseDoArquivo }
    : (poseDoArquivo || {});
  const inicial = GESTOS_FP[gesto] && !GESTOS_FP[gesto].pulso ? GESTOS_FP[gesto] : GESTOS_FP.espera;
  const rig = {
    Left: coletaJuntas(raiz, 'Left', POSES_FP[doArquivo.Left] ? doArquivo.Left : null),
    Right: coletaJuntas(raiz, 'Right', POSES_FP[doArquivo.Right] ? doArquivo.Right : null),
    // `atual` é a pose para onde a junta caminha AGORA (durante um pulso é a do
    // pulso); `base` é para onde ela volta quando o pulso acabar.
    atual: { Left: inicial.Left, Right: inicial.Right },
    base: { Left: inicial.Left, Right: inicial.Right },
    anterior: { Left: inicial.Left, Right: inicial.Right },
    transicao: { Left: 1, Right: 1 },
    duracao: { Left: DURACAO_PADRAO, Right: DURACAO_PADRAO },
    pulso: { Left: null, Right: null },
    gesto: GESTOS_FP[gesto] && !GESTOS_FP[gesto].pulso ? gesto : 'espera',
    blend: { Left: 1, Right: 1 },   // legado: ninguém escreve, ninguém lê
  };
  if (!rig.Left && !rig.Right) return null;
  return rig;
}

// Manda UMA mão para uma pose e começa a transição. É a porta de baixo: a
// máquina de gestos entra por aqui, e quem quiser posar um lado à mão também.
// Mexer numa mão cancela o pulso que estivesse correndo nela — quem pediu a
// pose nova é mais recente que o gesto que já ia terminar.
export function definePosePrimeiraPessoa(rig, lado, pose, { dur = DURACAO_PADRAO, imediato = false } = {}) {
  if (!rig?.[lado] || !POSES_FP[pose]) return false;
  rig.pulso[lado] = null;
  rig.base[lado] = pose;
  return caminhaPara(rig, lado, pose, dur, imediato);
}

// O passo interno: nem toca no pulso nem na base, só põe a junta a caminho.
function caminhaPara(rig, lado, pose, dur, imediato = false) {
  if (!rig?.[lado] || !POSES_FP[pose]) return false;
  if (rig.atual[lado] === pose && rig.transicao[lado] >= 1) return false;
  // Sai de onde a mão ESTÁ, não de onde ela deveria estar: interromper uma
  // transição pela metade e recomeçar do alvo antigo daria um tranco.
  rig.anterior[lado] = poseCongelada(rig, lado);
  rig.atual[lado] = pose;
  rig.transicao[lado] = imediato ? 1 : 0;
  rig.duracao[lado] = Math.max(0.001, dur);
  return true;
}

// Uma transição cortada no meio não tem nome de pose: congela os valores onde
// estão e devolve uma pose de verdade, para a próxima interpolar a partir dela.
function poseCongelada(rig, lado) {
  const t = rig.transicao[lado];
  if (t >= 1) return rig.atual[lado];
  const de = rig.anterior[lado], para = rig.atual[lado], s = suaviza(t);
  const congelada = {};
  for (const dedo of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
    congelada[dedo] = [0, 1, 2].map((seg) =>
      THREE.MathUtils.lerp(valorPose(de, dedo, seg), valorPose(para, dedo, seg), s));
  }
  return congelada;
}

// O gesto: a entrada única para a mesa. Se ele for de pulso, vai e volta
// sozinho; se não, fica de pé até o próximo. Gesto que não existe não muda
// nada e devolve `false` — a mesa pode inventar nome sem derrubar a mão.
export function defineGestoPrimeiraPessoa(rig, nome, opcoes = {}) {
  const g = GESTOS_FP[nome];
  if (!rig || !g) return false;
  if (g.pulso) return pulsoPrimeiraPessoa(rig, nome, opcoes);
  const { imediato = false, dur = g.dur ?? DURACAO_PADRAO } = opcoes;
  rig.gesto = nome;
  let mudou = false;
  for (const lado of LADOS) {
    if (!rig[lado] || !g[lado]) continue;
    rig.base[lado] = g[lado];
    // Base trocada no meio de um pulso NÃO interrompe o pulso: ela só muda
    // para onde ele vai voltar. Cortar a compra da carta porque a vez virou
    // seria a mão largando a carta no ar.
    if (rig.pulso[lado]) { rig.pulso[lado].volta = g[lado]; mudou = true; continue; }
    mudou = caminhaPara(rig, lado, g[lado], dur, imediato) || mudou;
  }
  return mudou;
}

// O pulso por fora do catálogo: serve para pulsar qualquer gesto, inclusive um
// de base (uma "espiada" no leque, por exemplo).
export function pulsoPrimeiraPessoa(rig, nome, opcoes = {}) {
  const g = GESTOS_FP[nome];
  if (!rig || !g) return false;
  const subida = opcoes.subida ?? g.subida ?? g.dur ?? DURACAO_PADRAO;
  const sustenta = opcoes.sustenta ?? g.sustenta ?? 0.1;
  const descida = opcoes.descida ?? g.descida ?? subida * 1.4;
  let mudou = false;
  for (const lado of LADOS) {
    if (!rig[lado] || !g[lado] || !POSES_FP[g[lado]]) continue;
    // A volta é sempre para a BASE do lado, e não para a pose de agora: dois
    // pulsos seguidos (compra e descarte no mesmo turno) devolveriam a mão à
    // pinça se a referência fosse a pose corrente.
    rig.pulso[lado] = { nome, fase: 'ida', volta: rig.base[lado], sustenta, descida, resta: sustenta };
    caminhaPara(rig, lado, g[lado], subida, false);
    mudou = true;
  }
  return mudou;
}

// Corta os pulsos e devolve as mãos à base. É o que fazer quando a partida
// para (fim de rodada) ou quando o jogador pediu menos movimento.
export function cancelaPulsoPrimeiraPessoa(rig, { imediato = false } = {}) {
  if (!rig) return false;
  let mudou = false;
  for (const lado of LADOS) {
    if (!rig[lado] || !rig.pulso[lado]) continue;
    const volta = rig.pulso[lado].volta;
    rig.pulso[lado] = null;
    mudou = caminhaPara(rig, lado, volta, rig.duracao[lado], imediato) || mudou;
  }
  return mudou;
}

// O que a mesa precisa saber para acompanhar o gesto com a CARTA (o grip) sem
// duplicar a contagem de tempo aqui dentro. `progresso` é o envelope do pulso:
// sobe a 1 na ida, fica em 1 enquanto sustenta e volta a 0 na descida.
export function estadoGestoPrimeiraPessoa(rig) {
  if (!rig) return { base: null, pulso: null, fase: null, progresso: 0, ocupado: false };
  let pulso = null, fase = null, progresso = 0;
  for (const lado of LADOS) {
    const p = rig.pulso[lado];
    if (!p) continue;
    const s = suaviza(rig.transicao[lado]);
    const v = p.fase === 'ida' ? s : 1 - s;
    if (v >= progresso) { progresso = v; pulso = p.nome; fase = p.fase; }
  }
  return { base: rig.gesto, pulso, fase, progresso, ocupado: !!pulso };
}

function valorPose(nome, dedo, seg) {
  // Pose pode chegar como nome do catálogo ou como a tabela congelada de uma
  // transição cortada. Nome que não existe vale zero — a mão volta ao arquivo,
  // que é o pior caso aceitável; o que não pode é lançar no meio do quadro.
  const pose = typeof nome === 'string' ? POSES_FP[nome] : nome;
  const v = pose?.[dedo]?.[seg];
  // Preso a [0,1] AQUI: é o que garante que nem uma pose mal escrita nem a
  // interpolação entre duas passem do `anguloMax` da junta.
  return Number.isFinite(v) ? clamp01(v) : 0;
}

const qTmp = new THREE.Quaternion();
export function atualizaRigPrimeiraPessoa(rig, dt = 0.016, imediato = false) {
  if (!rig) return;
  // Teto no dt: uma aba que volta do segundo plano entrega um salto de vários
  // segundos, e sem teto o pulso inteiro passaria num quadro só.
  const passo = Math.min(Math.max(dt, 0), 0.05);
  // Menos movimento: sem gesto nenhum. Os pulsos morrem e as mãos ficam na
  // base — a mão continua segurando o leque, que é informação, não enfeite.
  if (imediato) cancelaPulsoPrimeiraPessoa(rig, { imediato: true });
  for (const lado of LADOS) {
    const mao = rig[lado];
    if (!mao) continue;
    const dur = rig.duracao[lado] || DURACAO_PADRAO;
    rig.transicao[lado] = imediato ? 1 : Math.min(1, rig.transicao[lado] + passo / dur);
    // a máquina só anda quando a transição chegou: sustentar antes de a mão
    // ter fechado seria contar o tempo do gesto duas vezes
    const p = rig.pulso[lado];
    if (p && rig.transicao[lado] >= 1) {
      if (p.fase === 'ida') {
        p.resta -= passo;
        if (p.resta <= 0) { p.fase = 'volta'; caminhaPara(rig, lado, p.volta, p.descida, false); }
      } else {
        rig.pulso[lado] = null;   // voltou ao leque: o gesto acabou sozinho
      }
    }
    const t = suaviza(rig.transicao[lado]);
    const de = rig.anterior[lado];
    const para = rig.atual[lado];
    for (const j of mao.juntas) {
      const a = valorPose(de, j.dedo, j.seg);
      const b = valorPose(para, j.dedo, j.seg);
      const valor = THREE.MathUtils.lerp(a, b, t);
      j.angulo = valor * anguloMaximo(j.dedo);
      qTmp.setFromAxisAngle(j.eixo, j.angulo);
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
