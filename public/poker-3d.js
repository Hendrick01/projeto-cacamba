// ============================================================================
// Poker — a mesa 3D. Como o poker-mesa.js da 2D, este arquivo só é baixado
// quando a sala é de Poker: a 3D do Caçamba nunca paga por ele.
//
// Não monta cena nova. Mesa, elenco, a sua mão em primeira pessoa e o leque
// nas mãos de cada um são os do mesa3d.js e chegam pelo `ctx`; o que é daqui:
//  - as cinco cartas da mesa, DEITADAS no meio, com as vagas marcadas no
//    feltro antes de abrir; cada uma cai virada e se vira ao chegar;
//  - as FICHAS em 3D, cada cor o seu valor (FICHAS, emFichas): o pote no meio,
//    a aposta da rua na frente de cada cadeira, e o caminho delas — da mão de
//    quem aposta até a frente dele, dali para o pote quando a rua fecha, e do
//    pote para quem levou;
//  - o botão do dealer (o disco "D") na frente de quem dá as cartas;
//  - sob o nome de cada um, a placa com D/SB/BB e as fichas dele;
//  - os botões Correr / Mesa / Pagar / Aumentar e a bandeja de montar a
//    aposta, que são os MESMOS da 2D (poker-mesa.js exporta a lógica);
//  - o resultado da mão: ele SEGURA a mesa uns segundos (ou até um toque),
//    como na 2D — a mesa da mão que acabou, as cinco que ganharam acesas, as
//    mãos mostradas deitadas na frente de cada um e o pote indo para quem
//    levou. Só depois as cartas da mão nova são dadas.
//
// O que este modo NÃO herda da mesa do Caçamba está em `recursos`.
// A regra continua em /shared/poker.js: daqui só se pergunta.
// ============================================================================

import { emFichas, FICHAS, NOME_DA_ETAPA } from '/shared/poker.js';
import {
  fmt, msDaSegura, posicaoDe, falaDoLance, textoDaVez, botoesDaVez,
  linhasDoResultado, cartasVencedoras, classificacao, pilhas, criaBandeja,
} from './poker-mesa.js';
import { arteDaCarta } from './baralho.js';

// As cores das fichas, as mesmas do poker.css (.f-vermelha …).
const COR_DA_FICHA = {
  vermelha: { base: '#c62f2f', borda: '#f5f1e6' },
  verde: { base: '#2e8b4e', borda: '#f5f1e6' },
  preta: { base: '#262626', borda: '#f5f1e6' },
  roxa: { base: '#6d3fa0', borda: '#f5f1e6' },
  amarela: { base: '#d99a17', borda: '#fff3d1' },
};
const RAIO_FICHA = 0.04;        // a ficha: ~1/3 da largura da carta do tampo
const ALTURA_FICHA = 0.012;
const PILHA_MAX = 10;           // fichas desenhadas por pilha (o número diz o resto)
const CAPACIDADE = 480;         // fichas de uma cor na mesa inteira, no máximo
const VAO = 0.03;               // entre as cartas da mesa
const ESC_MOSTRADA = 0.4;       // as cartas mostradas na frente de cada um
const RAIO_APOSTA = 0.84;       // a aposta dos outros: entre o meio e a cadeira
const OURO = 0xf2c14e;

export function criaPoker3D(ctx) {
  const { THREE, scene, MESA_TOPO, CARTA_L, CARTA_A } = ctx;
  const v = () => ctx.view();
  const me = () => ctx.me();
  const nome = (id) => v()?.players.find((p) => p.id === id)?.name || '…';
  const Nome = (id) => (id === me() ? 'Você' : nome(id));
  const jogador = (id) => v()?.players.find((p) => p.id === id);
  const agora = () => performance.now();

  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.appendChild(estilo);
  // as fichas em HTML, a bandeja e o resultado são os do poker.css da 2D
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/poker.css';
  document.head.appendChild(css);
  document.body.classList.add('pk3');

  // O aviso de um lance fica uns segundos e depois volta o texto da vez.
  let avisoDoLance = null;
  function anuncia(texto, ms = 2600) {
    const este = { texto, ate: agora() + ms };
    avisoDoLance = este;
    ctx.aviso(texto, true);
    setTimeout(() => {
      if (avisoDoLance !== este) return;
      avisoDoLance = null;
      const t = api.textoDaVez();
      if (t) ctx.aviso(t, true);
    }, ms);
  }

  // ---- texturas ---------------------------------------------------------------

  function texturaDeCanvas(w, h, desenha) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    desenha(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  // a face da ficha: a cor, o anel de marcas brancas da borda e o miolo
  function texturaTopo({ base, borda }) {
    return texturaDeCanvas(128, 128, (g) => {
      g.fillStyle = base;
      g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
      g.fillStyle = borda;
      for (let k = 0; k < 8; k++) {
        g.save(); g.translate(64, 64); g.rotate((k * Math.PI) / 4);
        g.fillRect(-7, -64, 14, 17);
        g.restore();
      }
      g.strokeStyle = borda; g.lineWidth = 4;
      g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
      g.beginPath(); g.arc(64, 64, 29, 0, Math.PI * 2); g.stroke();
    });
  }
  // a borda: a cor com as marcas, que é o que se vê de lado numa pilha
  function texturaLado({ base, borda }) {
    return texturaDeCanvas(256, 16, (g) => {
      g.fillStyle = base; g.fillRect(0, 0, 256, 16);
      g.fillStyle = borda;
      for (let k = 0; k < 8; k++) g.fillRect(k * 32 + 9, 0, 14, 16);
    });
  }
  const AREA = { w: 160, h: 210, iw: 124, ih: 174 };
  const texAro = texturaDeCanvas(AREA.w, AREA.h, (g) => {
    const r = 16, x = 18, y = 18, w = AREA.iw, h = AREA.ih;
    const caminho = () => {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.shadowColor = '#fff'; g.shadowBlur = 14;
    caminho(); g.stroke(); g.shadowBlur = 0; caminho(); g.stroke();
  });
  const escalaDoAro = (l, a, folga = 0.016) => [(l + folga) * (AREA.w / AREA.iw), (a + folga) * (AREA.h / AREA.ih)];
  // a vaga de uma carta que ainda não abriu: tracejada no feltro
  const texVaga = texturaDeCanvas(128, 180, (g) => {
    const r = 12, x = 6, y = 6, w = 116, h = 168;
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill();
    g.setLineDash([14, 9]); g.lineWidth = 5; g.strokeStyle = 'rgba(245,241,230,0.42)'; g.stroke();
  });
  const texBotao = texturaDeCanvas(128, 128, (g) => {
    g.fillStyle = '#f5f1e6'; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c9b98f'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#232a33'; g.font = '900 70px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('D', 64, 69);
  });

  function plano(map, cor, opacidade) {
    const m = new THREE.Mesh(ctx.geoSombra, new THREE.MeshBasicMaterial({ map, color: cor, transparent: true, opacity: opacidade, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  // ---- as fichas: uma malha instanciada por cor --------------------------------
  // Numa mesa de oito com todo mundo apostando são centenas de fichas; uma
  // malha por ficha seria uma chamada de desenho por ficha (e outra na sombra).
  // Aqui cada cor é UMA malha, e a cada quadro as fichas visíveis são escritas
  // nela em ordem.

  const geoFicha = new THREE.CylinderGeometry(RAIO_FICHA, RAIO_FICHA, ALTURA_FICHA, 28);
  const malhas = {};
  for (const f of FICHAS) {
    const cores = COR_DA_FICHA[f.cor];
    const lado = new THREE.MeshStandardMaterial({ map: texturaLado(cores), roughness: 0.55, metalness: 0 });
    const topo = new THREE.MeshStandardMaterial({ map: texturaTopo(cores), roughness: 0.5, metalness: 0 });
    const m = new THREE.InstancedMesh(geoFicha, [lado, topo, topo], CAPACIDADE);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    scene.add(m);
    malhas[f.cor] = m;
  }

  // Um MONTINHO é um valor em fichas num ponto da mesa: emFichas() diz
  // quantas de cada cor, e cada cor vira uma pilha. `valor` é o que a visão
  // manda; `mostrado` é o que está na mesa agora — fica para trás enquanto há
  // fichas voando para ele (`chegando`) e alcança o valor quando elas pousam.
  const montinhos = new Set();
  function criaMontinho({ rotulo = true, prefixo = '' } = {}) {
    const m = { valor: 0, mostrado: 0, chegando: 0, pos: new THREE.Vector3(0, MESA_TOPO, 0), voo: null, prefixo, texto: null, rot: null, visivel: true, transitorio: !rotulo };
    if (rotulo) {
      m.rot = ctx.rotulo('', 'rgba(27,17,11,0.88)', '#f2c14e');
      m.rot.scale.set(0.2, 0.2 * 72 / 256, 1);
      m.rot.visible = false;
      scene.add(m.rot);
    }
    montinhos.add(m);
    return m;
  }
  function soltaMontinho(m) {
    montinhos.delete(m);
    if (m.rot) { scene.remove(m.rot); m.rot.material.map?.dispose(); m.rot.material.dispose(); }
  }

  // um número quase aleatório, mas fixo por ficha: o desalinho da pilha não treme
  const desalinho = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
  const _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _Y = new THREE.Vector3(0, 1, 0);
  const PASSO_PILHA = RAIO_FICHA * 2 + 0.006;
  // Escreve as fichas de um montinho nas malhas; devolve a altura da pilha mais alta.
  function poeFichas(m, uso) {
    const cores = emFichas(m.mostrado);
    const k = cores.length;
    if (!k) return 0;
    const naFrente = k <= 3 ? k : Math.ceil(k / 2);
    let alto = 0;
    cores.forEach((f, i) => {
      const atras = i >= naFrente;
      const j = atras ? i - naFrente : i;
      const n = atras ? k - naFrente : naFrente;
      const x = (j - (n - 1) / 2) * PASSO_PILHA + (atras ? PASSO_PILHA / 2 : 0);
      const z = atras ? -PASSO_PILHA * 0.9 : 0;
      const quantas = Math.min(PILHA_MAX, f.n);
      const malha = malhas[f.cor];
      for (let c = 0; c < quantas; c++) {
        if (uso[f.cor] >= CAPACIDADE) break;
        const sem = f.valor * 7 + i * 31 + c;
        _p.set(m.pos.x + x + (desalinho(sem, 1) - 0.5) * 0.004, m.pos.y + ALTURA_FICHA / 2 + c * ALTURA_FICHA + 0.0005, m.pos.z + z + (desalinho(sem, 2) - 0.5) * 0.004);
        _q.setFromAxisAngle(_Y, desalinho(sem, 3) * Math.PI * 2);
        _mtx.compose(_p, _q, _s);
        malha.setMatrixAt(uso[f.cor]++, _mtx);
      }
      alto = Math.max(alto, quantas * ALTURA_FICHA);
    });
    return alto;
  }

  // Fichas voando: um montinho passageiro, sem número, de um ponto a outro.
  function voaFichas(valor, de, para, { atraso = 0, dur = 420, arco = 0.1, visivelAntes = false, aoFim = null } = {}) {
    if (!(valor > 0)) { aoFim?.(); return; }
    if (ctx.semMovimento) { aoFim?.(); return; }
    const m = criaMontinho({ rotulo: false });
    m.valor = m.mostrado = valor;
    m.pos.copy(de);
    m.visivel = visivelAntes;
    m.voo = { de: de.clone(), para: para.clone(), t0: agora() + atraso, dur, arco, aoFim };
  }
  // Fichas que vão PARA um montinho: ele só mostra o valor novo quando elas pousam.
  function chegaEm(alvo, valor, de, opcoes = {}) {
    if (!(valor > 0) || ctx.semMovimento) return;
    alvo.chegando++;
    voaFichas(valor, de, alvo.pos.clone(), {
      ...opcoes,
      aoFim: () => {
        alvo.chegando = Math.max(0, alvo.chegando - 1);
        if (!alvo.chegando) alvo.mostrado = alvo.valor;
      },
    });
  }

  function animaFichas(t) {
    for (const m of montinhos) {
      const o = m.voo;
      if (!o) continue;
      const k = (t - o.t0) / o.dur;
      if (k < 0) continue;
      m.visivel = true;
      const e = 1 - Math.pow(1 - Math.min(1, k), 3);
      m.pos.lerpVectors(o.de, o.para, e);
      m.pos.y += Math.sin(e * Math.PI) * o.arco;
      if (k >= 1) {
        m.voo = null;
        if (m.transitorio) soltaMontinho(m);
        o.aoFim?.();
      }
    }
    const uso = {};
    for (const f of FICHAS) uso[f.cor] = 0;
    for (const m of montinhos) {
      const alto = m.visivel ? poeFichas(m, uso) : 0;
      if (!m.rot) continue;
      const mostra = m.visivel && !m.voo && m.texto && (m.mostrado > 0 || m.semFichas);
      m.rot.visible = !!mostra;
      // o do pote fica ao lado das fichas: em cima, ele tapava a carta do meio da mesa
      if (mostra && m.aoLado) m.rot.position.set(m.pos.x + 0.27, MESA_TOPO + 0.05, m.pos.z + 0.02);
      else if (mostra) m.rot.position.set(m.pos.x, MESA_TOPO + Math.max(alto, 0.01) + 0.07, m.pos.z);
    }
    for (const f of FICHAS) {
      const malha = malhas[f.cor];
      malha.count = uso[f.cor];
      malha.instanceMatrix.needsUpdate = true;
    }
  }
  function textoDoMontinho(m, texto) {
    if (m.texto === texto) return;
    m.texto = texto;
    if (texto) ctx.trocaRotulo(m.rot, texto, 'rgba(27,17,11,0.88)', '#f2c14e');
  }

  // ---- onde fica cada coisa -------------------------------------------------------
  // A sua aposta fica logo acima da barra de botões (que mora sobre o seu
  // leque), o pote um palmo para dentro, e as cinco da mesa atrás dele, do
  // tamanho que couber na largura da tela. Os outros apostam no anel entre o
  // meio e a cadeira.

  const camRepouso = new THREE.PerspectiveCamera();
  const _v = new THREE.Vector3();
  function repouso() {
    camRepouso.copy(ctx.camera, false);
    camRepouso.position.x = 0;
    camRepouso.rotation.set(0, 0, 0);
    camRepouso.lookAt(0, MESA_TOPO + 0.12, -0.35);   // o olhar de repouso, para a mesa
    camRepouso.updateMatrixWorld();
    camRepouso.updateProjectionMatrix();
  }
  function zDaTela(yPx) {
    const alvo = _v.set(0, 1 - (2 * yPx) / innerHeight, 0.5).unproject(camRepouso);
    const dir = alvo.sub(camRepouso.position);
    if (dir.y > -1e-4) return null;
    const t = (MESA_TOPO - camRepouso.position.y) / dir.y;
    return camRepouso.position.z + dir.z * t;
  }
  // meia largura da tela, em metros do tampo, na profundidade z
  function meiaLargura(z) {
    const p = _v.set(1, MESA_TOPO, z).project(camRepouso);
    return 1 / Math.max(0.05, Math.abs(p.x));
  }
  let medida = null;
  function mede() {
    repouso();
    const emPe = innerWidth < innerHeight;
    const fundo = parseFloat(document.body.style.getPropertyValue('--acao-fundo')) || 174;
    // a faixa da barra: em pé os botões podem quebrar em duas linhas
    const zLivre = zDaTela(innerHeight - fundo - (emPe ? 96 : 56)) ?? 0.5;
    const zMinha = THREE.MathUtils.clamp(zLivre - 0.05, 0, 0.62);
    const zPote = zMinha - 0.27;
    // a carta da mesa: o maior tamanho que deixa as cinco na largura da tela
    let esc = 0.5;
    // entre o pote e as cartas, um vão: a pilha alta do pote, vista daqui,
    // sobe na tela e encostava na carta do meio
    const VAO_DO_POTE = 0.16;
    for (let k = 0; k < 3; k++) {
      const zMesa = zPote - VAO_DO_POTE - (CARTA_A * esc) / 2;
      const cabe = (meiaLargura(zMesa + (CARTA_A * esc) / 2) * 2 * (emPe ? 0.94 : 0.62) - 4 * VAO) / 5 / CARTA_L;
      esc = THREE.MathUtils.clamp(cabe, 0.3, 0.52);
    }
    const zMesa = zPote - VAO_DO_POTE - (CARTA_A * esc) / 2;
    medida = { emPe, zMinha, zPote, zMesa, esc };
    return medida;
  }
  // a frente de cada um, onde ele aposta (e onde mostra a mão no fim)
  function frenteDe(pid, raio = RAIO_APOSTA) {
    if (pid === me()) return new THREE.Vector3(0, MESA_TOPO, medida.zMinha);
    const outros = v().players.filter((p) => p.id !== me());
    const i = outros.findIndex((p) => p.id === pid);
    if (i < 0) return new THREE.Vector3(0, MESA_TOPO, -raio);
    const ang = ctx.posicaoDoAssento(i, outros.length).ang;
    return new THREE.Vector3(Math.sin(ang) * raio, MESA_TOPO, -Math.cos(ang) * raio);
  }
  // de onde saem as fichas e as cartas de alguém: a mão dele (a sua, de baixo da câmera)
  function maoDe(pid) {
    // (a sua: a beirada do tampo do seu lado; mais perto, as fichas passavam
    // rente à câmera e enchiam a tela)
    if (pid === me()) return new THREE.Vector3(0, MESA_TOPO + 0.1, Math.min(0.85, medida.zMinha + 0.4));
    const a = ctx.assentos.get(pid);
    if (!a) return frenteDe(pid).setY(MESA_TOPO + 0.2);
    const p = a.assento?.modelo ? ctx.pontoDaMaoAtiva(a) : ctx.lequeDe(a);
    return p.setY(Math.min(p.y, MESA_TOPO + 0.3));
  }
  const pontoDoPote = () => new THREE.Vector3(0, MESA_TOPO, medida.zPote);
  const pontoDoMeio = () => new THREE.Vector3(0, MESA_TOPO + 0.02, medida.zMesa);

  // ---- as cinco da mesa ------------------------------------------------------------

  const vagas = [];
  for (let i = 0; i < 5; i++) {
    const vaga = plano(texVaga, 0xffffff, 1);
    vaga.renderOrder = 1;
    scene.add(vaga);
    const carta = new THREE.Mesh(ctx.geoCarta, ctx.materialVerso);
    carta.rotation.set(-Math.PI / 2 + 0.025, 0, 0);
    carta.castShadow = true;
    carta.visible = false;
    scene.add(carta);
    const aro = plano(texAro, OURO, 0);
    aro.renderOrder = 2;
    aro.visible = false;
    scene.add(aro);
    vagas.push({ i, vaga, carta, aro, card: null, mat: null, anim: null, acesa: false, apagada: false, x: 0, z: 0, esc: 0.5 });
  }
  const vistas = new Set();     // cartas da mesa já mostradas nesta mão: não caem de novo
  let vistasDaMao = null;

  function soltaMaterial(s) { if (s.mat) { s.mat.dispose(); s.mat = null; } }
  function poeCarta(s, card, atraso) {
    soltaMaterial(s);
    s.card = card;
    if (!card) { s.carta.visible = false; s.anim = null; return; }
    // o material da carta é compartilhado: apagar a que perdeu é numa cópia
    s.mat = ctx.materialDaCarta(card).clone();
    s.carta.visible = true;
    if (ctx.semMovimento || atraso == null) { s.carta.material = s.mat; s.anim = null; return; }
    // cai virada, de cima do meio, e se vira ao pousar
    s.carta.material = ctx.materialVerso;
    s.carta.visible = false;
    s.anim = { t0: agora() + atraso, trocou: false };
  }
  function desenhaMesa(cartas, n, s, vencedoras) {
    if (vistasDaMao !== n) { vistas.clear(); vistasDaMao = n; }
    const { zMesa, esc } = medida;
    const passo = CARTA_L * esc + VAO;
    // numa corrida (todos all-in), flop, turn e river caem um de cada vez
    const primeiraRua = s && s.corrida.length ? 3 - s.corrida.length : 0;
    const rua = (i) => (i < 3 ? 0 : i - 2);
    let novas = 0;
    vagas.forEach((slot, i) => {
      slot.x = (i - 2) * passo; slot.z = zMesa; slot.esc = esc;
      slot.vaga.position.set(slot.x, MESA_TOPO + 0.003, zMesa);
      slot.vaga.scale.set(CARTA_L * esc * 1.04, CARTA_A * esc * 1.04, 1);
      slot.carta.scale.setScalar(esc);
      if (!slot.anim) slot.carta.position.set(slot.x, MESA_TOPO + 0.008, zMesa);
      slot.aro.position.set(slot.x, MESA_TOPO + 0.004, zMesa);
      const [aw, ah] = escalaDoAro(CARTA_L * esc, CARTA_A * esc);
      slot.aro.scale.set(aw, ah, 1);
      const c = cartas[i] || null;
      if ((c?.id ?? null) !== (slot.card?.id ?? null)) {
        let atraso = null;
        if (c && !vistas.has(c.id)) {
          atraso = s && s.corrida.length ? (rua(i) - primeiraRua) * 900 + (i < 3 ? i * 80 : 0) : novas * 110;
          novas++;
        }
        poeCarta(slot, c, atraso);
      }
      if (c) vistas.add(c.id);
      slot.vaga.visible = !c || !slot.carta.visible;
      slot.acesa = vencedoras.has(c?.id);
      slot.apagada = vencedoras.size > 0 && !!c && !slot.acesa;
      if (slot.mat) slot.mat.color.setScalar(slot.apagada ? 0.45 : 1);
    });
  }
  function animaMesa(t) {
    for (const s of vagas) {
      const a = s.anim;
      if (a) {
        const k = (t - a.t0) / 380;
        if (k >= 0) {
          s.carta.visible = true;
          s.vaga.visible = false;
          const e = Math.min(1, k);
          // cai de um palmo acima, virando: a largura passa por zero no meio
          s.carta.position.set(s.x, MESA_TOPO + 0.008 + (1 - e) * (1 - e) * 0.22, s.z - (1 - e) * 0.08);
          s.carta.scale.set(s.esc * Math.max(0.03, Math.abs(Math.cos(Math.PI * e))), s.esc, s.esc);
          if (e >= 0.5 && !a.trocou) { s.carta.material = s.mat; a.trocou = true; }
          if (e >= 1) { s.anim = null; s.carta.scale.setScalar(s.esc); s.carta.position.set(s.x, MESA_TOPO + 0.008, s.z); }
        }
      }
      // as cinco que ganharam brilham; o brilho espera a carta pousar
      const op = s.acesa && !s.anim ? (ctx.semMovimento ? 0.95 : 0.7 + 0.3 * Math.abs(Math.sin(t / 300))) : 0;
      s.aro.visible = op > 0;
      s.aro.material.opacity = op;
    }
  }

  // ---- as mãos mostradas no fim (deitadas na frente de cada um) --------------------

  const mostradas = new THREE.Group();
  scene.add(mostradas);
  function limpaMostradas() {
    for (const g of [...mostradas.children]) {
      mostradas.remove(g);
      g.traverse((o) => { if (o.isMesh && o.userData.proprio) o.material.dispose(); });
    }
  }
  function mostraMaos(ev, atraso) {
    limpaMostradas();
    const ganhou = new Set(ev.potes.filter((x) => !x.devolvido).flatMap((x) => x.vencedores));
    const cinco = cartasVencedoras(ev);
    for (const m of ev.mostradas) {
      if (m.p === me()) continue;   // a sua está na sua mão
      const g = new THREE.Group();
      // mais perto do dono que a aposta: na altura dela, as do lado encostavam
      // na ponta das cinco da mesa
      const centro = frenteDe(m.p, 0.92);
      g.position.copy(centro);
      const largura = CARTA_L * ESC_MOSTRADA;
      m.cards.forEach((card, i) => {
        const mat = ctx.materialDaCarta(card).clone();
        if (!ganhou.has(m.p)) mat.color.setScalar(0.62);
        const c = new THREE.Mesh(ctx.geoCarta, mat);
        c.userData.proprio = true;
        c.castShadow = true;
        c.scale.setScalar(ESC_MOSTRADA);
        c.rotation.set(-Math.PI / 2 + 0.03, 0, 0);
        c.position.set((i - 0.5) * (largura + 0.015), 0.01 + i * 0.001, 0);
        g.add(c);
        if (cinco.has(card.id)) {
          const aro = plano(texAro, OURO, 0.85);
          aro.userData.proprio = true;
          aro.renderOrder = 2;
          aro.position.set(c.position.x, 0.005, 0);
          const [aw, ah] = escalaDoAro(largura, CARTA_A * ESC_MOSTRADA);
          aro.scale.set(aw, ah, 1);
          g.add(aro);
        }
      });
      g.visible = ctx.semMovimento || !atraso;
      if (!g.visible) setTimeout(() => { g.visible = true; }, atraso);
      mostradas.add(g);
    }
  }

  // ---- o botão do dealer -------------------------------------------------------------

  const botaoD = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, 0.012, 32),
    [
      new THREE.MeshStandardMaterial({ color: 0xe9e1cc, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: texBotao, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: 0xe9e1cc, roughness: 0.6 }),
    ],
  );
  botaoD.castShadow = true;
  botaoD.visible = false;
  scene.add(botaoD);
  let donoDoBotao = null;
  let vooDoBotao = null;
  function lugarDoBotao(pid) {
    const f = frenteDe(pid);
    // ao lado da aposta, para a esquerda de quem senta (a direita de quem olha)
    const lado = new THREE.Vector3(-f.z, 0, f.x).normalize();
    if (pid === me()) return f.add(new THREE.Vector3(0.3, 0, 0)).setY(MESA_TOPO + 0.006);
    return f.addScaledVector(lado, -0.16).setY(MESA_TOPO + 0.006);
  }
  function poeBotao(pid) {
    if (!pid) { botaoD.visible = false; donoDoBotao = null; return; }
    const para = lugarDoBotao(pid);
    botaoD.visible = true;
    if (donoDoBotao && donoDoBotao !== pid && !ctx.semMovimento) {
      vooDoBotao = { de: botaoD.position.clone(), para, t0: agora(), dur: 520 };
    } else if (!vooDoBotao) botaoD.position.copy(para);
    else vooDoBotao.para.copy(para);
    donoDoBotao = pid;
  }
  function animaBotao(t) {
    const o = vooDoBotao;
    if (!o) return;
    const k = Math.min(1, (t - o.t0) / o.dur);
    const e = k * k * (3 - 2 * k);
    botaoD.position.lerpVectors(o.de, o.para, e);
    botaoD.position.y += Math.sin(e * Math.PI) * 0.05;
    if (k >= 1) vooDoBotao = null;
  }

  // ---- as apostas e o pote -------------------------------------------------------------

  const apostas = new Map();   // playerId → montinho
  const pote = criaMontinho();
  pote.semFichas = true;       // o número aparece mesmo sem fichas no meio (só os blinds na mesa)
  pote.aoLado = true;
  pote.rot.scale.set(0.26, 0.26 * 72 / 256, 1);
  const apostaDe = (pid) => {
    let m = apostas.get(pid);
    if (!m) { m = criaMontinho(); apostas.set(pid, m); }
    return m;
  };

  // A aposta de alguém aumentou: as fichas novas saem da mão dele e pousam na
  // frente dele. Se a rua fechou no mesmo lance (o último a pagar), elas vão
  // direto para o pote.
  function entraAposta(pid, inc) {
    const m = apostaDe(pid);
    const falta = m.valor - m.mostrado;
    if (falta > 0) chegaEm(m, falta, maoDe(pid), { dur: 380 });
    else if (inc > 0) chegaEm(pote, inc, maoDe(pid), { dur: 460 });
  }
  // A rua fechou: as apostas na frente de cada um deslizam para o pote.
  function recolhe(atraso = 0) {
    let k = 0;
    for (const m of apostas.values()) {
      if (!(m.mostrado > 0)) continue;
      chegaEm(pote, m.mostrado, m.pos.clone(), { atraso: atraso + k++ * 60, dur: 420, arco: 0.04, visivelAntes: true });
      m.mostrado = 0;
    }
  }
  // O pote vai para quem levou: cada pote para os vencedores dele, dividido.
  function pagaVencedores(ev) {
    pote.valor = 0; pote.mostrado = 0; pote.chegando = 0;
    let k = 0;
    for (const pt of ev.potes) {
      const cada = pt.valor / pt.vencedores.length;
      for (const id of pt.vencedores) {
        voaFichas(Math.round(cada), pontoDoPote(), maoDe(id), { atraso: k++ * 120, dur: 620, arco: 0.12, visivelAntes: true });
      }
    }
  }

  // ---- o resultado da mão: segura a mesa ---------------------------------------------

  let segura = null;          // { ev, ate, corrida, mao, poteNaMesa }
  let timerSegura = null;
  let corridaPendente = [];
  let depoisDaSegura = [];    // o que a mão nova faz quando o resultado sai (blinds, cartas)
  let maoMostrada = [];       // a sua mão como está na tela: é ela que fica durante o resultado
  const segurando = () => !!segura && Date.now() < segura.ate;
  const escondeLequeAte = new Map();

  const painel = document.createElement('button');
  painel.type = 'button';
  painel.className = 'pk-resultado pk3-resultado';
  painel.hidden = true;
  painel.setAttribute('aria-live', 'polite');
  painel.onclick = () => solta();
  document.body.appendChild(painel);

  function desenhaPainel() {
    painel.hidden = !segurando();
    if (painel.hidden) { painel.textContent = ''; painel.dataset.mao = ''; return; }
    if (painel.dataset.mao === String(segura.ev.n)) return;
    painel.dataset.mao = String(segura.ev.n);
    const ev = segura.ev;
    const atraso = segura.corrida.length ? segura.corrida.length * 0.9 + 0.2 : 0;
    painel.style.setProperty('--atraso', `${ctx.semMovimento ? 0 : atraso}s`);
    const dentro = document.createElement('div');
    dentro.className = 'pk-res-dentro';
    const potes = linhasDoResultado(ev, me(), nome);
    for (const l of potes) {
      const p = document.createElement('p');
      p.className = `pk-res-titulo${l.meu ? ' meu' : ''}`;
      p.append(`${l.antes} `);
      const b = document.createElement('b'); b.textContent = fmt(l.valor); p.append(b);
      if (l.mao) { const s = document.createElement('span'); s.textContent = ` com ${l.mao}`; p.append(s); }
      dentro.appendChild(p);
    }
    const vencedores = new Set(potes.flatMap((x) => x.vencedores));
    if (ev.mostradas.length) {
      const ul = document.createElement('ul');
      ul.className = 'pk-res-maos';
      for (const m of ev.mostradas) {
        const li = document.createElement('li');
        if (vencedores.has(m.p)) li.className = 'venceu';
        const img = document.createElement('img');
        img.className = 'avatar'; img.alt = ''; img.width = 22; img.height = 22;
        img.src = ctx.avatarDe(m.p);
        img.style.setProperty('--anel', ctx.corDe(m.p));
        const n = document.createElement('span'); n.className = 'pk-res-nome'; n.textContent = Nome(m.p);
        const cartas = document.createElement('span'); cartas.className = 'pk-res-cartas';
        for (const c of m.cards) {
          const ci = document.createElement('img');
          ci.className = 'pk3-carta'; ci.alt = ''; ci.src = `/${arteDaCarta(c)}`;
          cartas.appendChild(ci);
        }
        const mao = document.createElement('span'); mao.className = 'pk-res-mao'; mao.textContent = m.mao;
        li.append(img, n, cartas, mao);
        ul.appendChild(li);
      }
      dentro.appendChild(ul);
    }
    const dica = document.createElement('span'); dica.className = 'pk-res-dica'; dica.textContent = 'toque para continuar';
    dentro.appendChild(dica);
    painel.textContent = '';
    painel.appendChild(dentro);
  }

  function seguraResultado(ev) {
    const corrida = corridaPendente.splice(0);
    const ms = msDaSegura(ev, corrida.length);
    segura = { ev, ate: Date.now() + ms, corrida, mao: maoMostrada.slice(), poteNaMesa: ev.pote };
    clearTimeout(timerSegura);
    timerSegura = setTimeout(solta, ms + 30);
    bandeja.el.hidden = true;
    const revela = corrida.length ? corrida.length * 900 + 300 : 650;
    const este = segura;
    pendentes.push(() => {
      recolhe();
      mostraMaos(ev, ctx.semMovimento ? 0 : revela - 300);
    });
    // o pote vai para quem levou depois que as cartas que faltavam abriram
    setTimeout(() => {
      if (segura !== este) return;
      pagaVencedores(ev);
      segura.poteNaMesa = 0;
      textoDoMontinho(pote, null);
      const ganhou = ev.potes.filter((x) => !x.devolvido).flatMap((x) => x.vencedores);
      for (const id of new Set(ganhou)) {
        if (id !== me()) { ctx.cara(id, 'feliz'); ctx.verbo(id, 'LEVOU'); }
      }
    }, ctx.semMovimento ? 0 : revela + 350);
  }

  // O resultado sai (o tempo acabou ou alguém tocou): a mesa volta à mão de
  // agora — as cartas novas são dadas, e os blinds vão à mesa.
  function solta() {
    clearTimeout(timerSegura);
    if (!segura) return;
    segura = null;
    limpaMostradas();
    distribui();
    pendentes.push(...depoisDaSegura.splice(0));
    ctx.atualiza();
  }

  // Dar as cartas: duas viradas para cada um que está na mão, uma volta de
  // cada vez, saindo do meio; as suas entram na sua mão.
  function distribui() {
    const vw = v();
    if (vw.phase !== 'play') return;
    if (!medida) mede();
    const de = pontoDoMeio();
    if (ctx.semMovimento) return;
    const na = vw.players.filter((p) => p.naMao && p.id !== me() && ctx.assentos.has(p.id));
    let ultimo = 0;
    for (let volta = 0; volta < 2; volta++) {
      na.forEach((p, i) => {
        const a = ctx.assentos.get(p.id);
        const atraso = (volta * na.length + i) * 90;
        const m = new THREE.Mesh(ctx.geoCarta, ctx.materialVerso);
        m.scale.setScalar(0.36);
        m.rotation.x = -Math.PI / 2 + 0.3;
        m.visible = false;
        scene.add(m);
        ctx.voa(m, de, ctx.lequeDe(a), { dur: 360, atraso, aoFim: () => scene.remove(m) });
        ultimo = Math.max(ultimo, atraso + 360);
        escondeLequeAte.set(p.id, agora() + atraso + 360);
      });
    }
    if (na.length) setTimeout(() => ctx.atualiza(), ultimo + 40);
    if (vw.you?.hand?.length && !jogador(me())?.fora) ctx.chegaNaMao(de);
  }

  // ---- a bandeja e os botões ----------------------------------------------------------

  const bandeja = criaBandeja({ v, sendAction: (a) => ctx.sendAction(a), avisa: (t) => anuncia(t), aoMudar: () => ctx.atualizaBotoes() });
  bandeja.el.classList.add('pk3-bandeja');
  document.body.appendChild(bandeja.el);

  // ---- as suas fichas -------------------------------------------------------------------

  const meuPainel = document.createElement('div');
  meuPainel.className = 'pk-eu pk3-eu';
  document.body.appendChild(meuPainel);
  let chaveDoMeuPainel = '';
  function desenhaMeuPainel() {
    const vw = v();
    const p = jogador(me());
    const pos = segurando() ? '' : posicaoDe(vw, me());
    const nota = !p ? '' : vw.phase === 'play' && p.foldou && !segurando() ? 'você correu' : vw.phase === 'play' && p.allIn && !segurando() ? 'all-in' : '';
    const chave = p ? `${p.fichas}|${p.fora}|${p.lugar}|${pos}|${nota}` : '';
    if (chave === chaveDoMeuPainel) return;
    chaveDoMeuPainel = chave;
    meuPainel.textContent = '';
    meuPainel.hidden = !p;
    if (!p) return;
    const texto = document.createElement('span'); texto.className = 'pk-eu-texto';
    const rot = document.createElement('span'); rot.className = 'pk-eu-rotulo';
    rot.textContent = p.fora ? `Você está fora · ${p.lugar}º` : 'Suas fichas';
    const val = document.createElement('strong'); val.className = 'pk-eu-valor';
    val.textContent = p.fora ? '' : fmt(p.fichas);
    texto.append(rot, val);
    meuPainel.append(pilhas(p.fichas, 6), texto);
    if (pos) { const s = document.createElement('span'); s.className = `pk3-pos${pos.startsWith('D') ? ' botao' : ''}`; s.textContent = pos; meuPainel.appendChild(s); }
    if (nota) { const s = document.createElement('span'); s.className = `pk-eu-nota${nota === 'all-in' ? ' ouro' : ''}`; s.textContent = nota; meuPainel.appendChild(s); }
  }

  // ---- os assentos: a placa das fichas sob o nome --------------------------------------

  function marcaAssentos() {
    const vw = v();
    for (const [id, a] of ctx.assentos) {
      const p = vw.players.find((x) => x.id === id);
      if (!p) continue;
      if (!a.pkFichas) {
        a.pkFichas = ctx.rotulo('', 'rgba(27,17,11,0.92)', '#f2c14e');
        a.pkFichas.scale.set(0.4, 0.11, 1);
        a.grupo.add(a.pkFichas);
      }
      const pos = posicaoDe(vw, id);
      // (enquanto o resultado está na mesa, a posição ainda seria a da mão nova
      // e o disco D, o da que acabou: fica só o número)
      const texto = p.fora ? `${p.lugar}º lugar` : `${pos && !segurando() ? `${pos} · ` : ''}${fmt(p.fichas)}`;
      // o dealer em creme, como o disco; quem saiu, apagado
      const dealer = pos.startsWith('D') && !segurando();
      const fundo = p.fora ? 'rgba(70,58,48,0.92)' : dealer ? 'rgba(245,241,230,0.95)' : 'rgba(27,17,11,0.92)';
      const tinta = p.fora ? '#d8cbb8' : dealer ? '#232a33' : '#f2c14e';
      ctx.trocaRotulo(a.pkFichas, texto, fundo, tinta);
      const naMao = vw.phase === 'play' && !segurando();
      a.marca = naMao && p.foldou ? 'CORREU' : naMao && p.allIn ? 'ALL-IN' : null;
    }
  }

  // ---- o toque dos lances: pendências para depois da sincronia --------------------------
  // As fichas voam para os lugares da visão nova, que só existem depois do
  // `sincroniza`; o evento deixa anotado e a sincronia executa.
  const pendentes = [];

  // a sua mão sai pelo meio quando você corre (a pinça leva as duas)
  function jogaFora(pid) {
    if (ctx.semMovimento) return;
    const para = pontoDoPote().setY(MESA_TOPO + 0.03);
    if (pid === me()) {
      if (ctx.pincaVaiLevar()) ctx.armaPinca(para);
      return;
    }
    const a = ctx.assentos.get(pid);
    if (!a) return;
    const modelo = a.assento?.modelo;
    if (modelo) ctx.gestoCarta(modelo, 'descartar', para);
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(ctx.geoCarta, ctx.materialVerso);
      m.scale.setScalar(0.36);
      m.rotation.set(-Math.PI / 2 + 0.05, k * 0.4 - 0.2, 0);
      m.visible = false;
      scene.add(m);
      ctx.voa(m, ctx.lequeDe(a), para, { dur: 380, atraso: (ctx.temGesto(a) ? 420 : 60) + k * 70, arco: 0.06, aoFim: () => scene.remove(m) });
    }
  }

  // ---- o que mesa3d.js chama --------------------------------------------------------------

  const api = {
    // O que este modo NÃO herda da mesa do Caçamba. As cartas na mão ficam
    // (a sua em primeira pessoa e o leque de cada um, com duas); saem o monte
    // e o descarte (o baralho é do dealer, e ninguém compra), o selo com a
    // contagem do leque (é sempre 2: no lugar dele, as fichas sob o nome) e a
    // distribuição de três cartas no começo da rodada — a mão nova é dada por
    // aqui, de duas em duas, e só depois que o resultado da anterior sai.
    recursos: { monteEDescarte: false, contagemDaMao: false, distribuicao: false },

    get medidas() { return medida; },
    get segura() { return segura; },

    sincroniza() {
      const vw = v();
      mede();
      const s = segurando() ? segura : null;
      const [sb, bb] = vw.blinds;
      const curto = innerWidth < 520;
      document.getElementById('rot-rodada').textContent = curto
        ? `Poker · Mão ${(s ? s.ev.n : vw.round) + 1} · ${fmt(sb)}/${fmt(bb)}`
        : `Poker · Mão ${(s ? s.ev.n : vw.round) + 1} · Blinds ${fmt(sb)}/${fmt(bb)}${vw.proximosBlinds && vw.phase === 'play' ? ` · sobem ${vw.maosParaSubir === 1 ? 'na próxima' : `em ${vw.maosParaSubir} mãos`}` : ''}`;
      document.getElementById('rot-contrato').textContent = vw.phase === 'gameEnd' && !s ? 'Fim de jogo'
        : s ? 'Fim da mão' : vw.phase === 'play' ? NOME_DA_ETAPA[vw.etapa] : '—';

      marcaAssentos();
      // as cinco: durante o resultado, as da mão que acabou
      desenhaMesa(s ? s.ev.board : vw.phase === 'play' ? vw.board : [], s ? s.ev.n : vw.round, s, s ? cartasVencedoras(s.ev) : new Set());

      // as apostas na frente de cada um (nenhuma enquanto o resultado está na mesa)
      for (const [pid, m] of apostas) if (!vw.players.some((p) => p.id === pid)) { soltaMontinho(m); apostas.delete(pid); }
      let naRua = 0;
      for (const p of vw.players) {
        const m = apostaDe(p.id);
        m.pos.copy(frenteDe(p.id));
        m.valor = s ? 0 : p.aposta;
        naRua += p.aposta;
      }
      pote.pos.copy(pontoDoPote());
      pote.valor = s ? s.poteNaMesa : Math.max(0, vw.pote - naRua);
      for (const f of pendentes.splice(0)) f();
      // o que não tem fichas a caminho vai direto ao valor da visão
      for (const m of [pote, ...apostas.values()]) if (!m.chegando) m.mostrado = m.valor;
      for (const m of apostas.values()) textoDoMontinho(m, m.valor > 0 ? fmt(m.valor) : null);
      const totalNaMesa = s ? s.poteNaMesa : vw.pote;
      textoDoMontinho(pote, totalNaMesa > 0 ? `Pote ${fmt(totalNaMesa)}` : null);

      poeBotao(vw.phase === 'play' && !s ? vw.botao : s ? donoDoBotao : null);
      desenhaPainel();
      desenhaMeuPainel();
    },

    quadro(t) {
      animaFichas(t);
      animaMesa(t);
      animaBotao(t);
      // as fichas sob o nome acompanham o nome, que desce para a cabeça quando o modelo carrega
      for (const a of ctx.assentos.values()) if (a.pkFichas) a.pkFichas.position.set(a.nome.position.x, a.nome.position.y - 0.125, a.nome.position.z);
    },

    // A sua mão: a da mão que acabou enquanto o resultado está na mesa; nada
    // quando você corre (ela foi para o meio) ou já saiu da partida.
    mao(hand) {
      const vw = v();
      if (segurando()) return segura.mao.slice();
      const eu = jogador(me());
      maoMostrada = !eu || eu.fora || (vw.phase === 'play' && eu.foldou) ? [] : hand;
      return maoMostrada.slice();
    },
    // o leque de cada um: ninguém segura carta enquanto o resultado está na
    // mesa (foram mostradas ou jogadas fora), e as novas esperam chegar
    cartasNaMao(p) {
      if (segurando()) return 0;
      if ((escondeLequeAte.get(p.id) || 0) > agora()) return 0;
      return p.handCount;
    },
    segurando,

    // quem fala depois: o próximo que ainda pode apostar
    proximoId() {
      const vw = v();
      if (vw.phase !== 'play' || segurando()) return null;
      const n = vw.players.length;
      const i = vw.players.findIndex((p) => p.id === vw.turnId);
      if (i < 0) return null;
      for (let k = 1; k < n; k++) {
        const p = vw.players[(i + k) % n];
        if (p.naMao && !p.foldou && !p.allIn && !p.fora) return p.id;
      }
      return null;
    },

    botoes(barra) {
      const vw = v();
      const b = botoesDaVez(vw, me(), segurando());
      if (!b || !b.aumentar) bandeja.el.hidden = true;
      if (!b) return;
      // com a bandeja aberta, ela é a barra (tem Voltar e o botão de apostar)
      if (bandeja.aberta) { bandeja.desenha(); return; }
      const poe = (txt, cor, fn) => { const el = ctx.botao(txt, cor, fn); barra.appendChild(el); return el; };
      if (b.correr) poe('Correr', 'normal', () => ctx.sendAction({ a: 'correr' }));
      if (b.mesa) poe('Mesa', 'primario', () => ctx.sendAction({ a: 'mesa' }));
      if (b.pagar) poe(b.textoPagar, 'primario', () => ctx.sendAction({ a: 'pagar' }));
      if (b.aumentar) {
        const el = poe(b.textoAumentar, 'normal', () => bandeja.abre());
        el.style.borderColor = 'rgba(242,193,78,0.7)';
        el.style.color = '#f2c14e';
      }
    },

    textoDaVez() {
      if (avisoDoLance && agora() < avisoDoLance.ate) return avisoDoLance.texto;
      return textoDaVez(v(), me(), nome, segurando()).texto;
    },

    evento(ev) {
      const eu = me();
      switch (ev.e) {
        case 'roundStart': {
          const novaMao = () => {
            if (ev.subiu) anuncia(`Os blinds subiram: ${fmt(ev.blinds[0])}/${fmt(ev.blinds[1])}.`);
          };
          // chegando junto com o resultado da anterior, a mão nova espera ele sair
          if (segurando()) depoisDaSegura.push(novaMao);
          else {
            pendentes.push(novaMao);
            // já aqui, antes da sincronia: é ela que esconde o leque de quem
            // ainda vai receber as cartas
            distribui();
          }
          bandeja.el.hidden = true;
          break;
        }
        case 'blinds': {
          const f = () => { entraAposta(ev.sb, ev.valores[0]); entraAposta(ev.bb, ev.valores[1]); };
          if (segurando()) depoisDaSegura.push(f); else pendentes.push(f);
          break;
        }
        case 'mesa': case 'correu': case 'pagou': case 'apostou': case 'aumentou': {
          const f = falaDoLance(ev);
          if (ev.p !== eu) ctx.verbo(ev.p, f.texto.toUpperCase());
          if (ev.allIn && ev.p !== eu) ctx.cara(ev.p, 'feliz');
          if (segurando()) break;   // a mesa ainda mostra a mão anterior
          if (ev.e === 'correu') jogaFora(ev.p);
          else if (ev.e !== 'mesa') {
            const antes = apostaDe(ev.p).mostrado;
            const inc = ev.e === 'pagou' ? ev.valor : ev.para - antes;
            pendentes.push(() => entraAposta(ev.p, inc));
          }
          break;
        }
        case 'etapa':
          if (ev.corrida) corridaPendente.push({ etapa: ev.etapa, n: ev.cards.length });
          if (!segurando()) pendentes.push(() => recolhe());
          break;
        case 'maoFim':
          seguraResultado(ev);
          break;
        case 'eliminado':
          anuncia(ev.p === eu ? `Suas fichas acabaram: ${ev.lugar}º lugar.` : `${nome(ev.p)} ficou sem fichas (${ev.lugar}º).`);
          if (ev.p !== eu) setTimeout(() => ctx.cara(ev.p, 'bravo'), 400);
          break;
        case 'gameEnd':
          if (ev.vencedor !== eu) setTimeout(() => { ctx.cara(ev.vencedor, 'feliz'); ctx.verbo(ev.vencedor, 'CAMPEÃO!'); }, 1500);
          break;
        default:
          break;
      }
    },

    // O placar, na caixa da 3D (a mesma dos outros modos): no fim da partida, o
    // campeão e a colocação; no meio, as fichas de cada um.
    desenhaPlacar(corpo, acoes) {
      const vw = v();
      const tabela = document.createElement('table');
      if (vw.phase === 'gameEnd') {
        const q = jogador(vw.vencedor);
        if (q) corpo.appendChild(ctx.palcoDe(q));
        corpo.append(...ctx.cabecalho(q?.id === me() ? 'Você ficou com todas as fichas!' : `${q ? ctx.nomeDe(q) : '…'} ficou com todas as fichas!`,
          `Poker · ${vw.round + 1} mão${vw.round ? 's' : ''}`));
        tabela.innerHTML = '<tr><th>Jogador</th><th style="text-align:right">Mãos</th><th style="text-align:right">Lugar</th></tr>';
        for (const p of classificacao(vw.players)) tabela.appendChild(ctx.linhaDoPlacar(p, ctx.nomeDe(p), p.id === vw.vencedor, p.maos, `${p.lugar || 1}º`));
        corpo.appendChild(tabela);
        if (ctx.souAnfitriao()) acoes.appendChild(ctx.acaoDoPlacar('Jogar de novo', true, () => ctx.enviaAoServidor({ t: 'playAgain' })));
        else { const e = document.createElement('p'); e.className = 'espera'; e.textContent = 'Esperando o anfitrião decidir…'; corpo.appendChild(e); }
        acoes.appendChild(ctx.acaoDoPlacar('Sair da sala', false, () => {
          try { localStorage.removeItem('cacamba-session'); localStorage.removeItem('cacamba-selo'); } catch { /* modo privado */ }
          location.href = '/';
        }));
        return;
      }
      const [sb, bb] = vw.blinds;
      corpo.append(...ctx.cabecalho('Fichas na mesa', `Mão ${vw.round + 1} · blinds ${fmt(sb)}/${fmt(bb)} · ganha quem ficar com todas`));
      tabela.innerHTML = '<tr><th>Jogador</th><th style="text-align:right">Mãos</th><th style="text-align:right">Fichas</th></tr>';
      for (const p of classificacao(vw.players)) tabela.appendChild(ctx.linhaDoPlacar(p, ctx.nomeDe(p), false, p.maos, p.fora ? `fora (${p.lugar}º)` : fmt(p.fichas)));
      corpo.appendChild(tabela);
    },
  };
  return api;
}

// O que esta mesa desenha em HTML por cima do canvas. As fichas, a bandeja e
// o resultado vêm do poker.css da 2D; aqui ficam as cores que lá vêm do
// style.css (que a 3D não carrega), os botões da bandeja e onde cada coisa mora.
const CSS = `
body.pk3 {
  --gold: #f2c14e; --cream: #f5f1e6; --sage: #9dbbad; --ink: #232a33;
  --felt-line: #1c5440; --shadow: 0 6px 14px -4px rgba(0, 0, 0, 0.75);
}
/* A bandeja não pode tapar as cinco da mesa, que é o que se olha para
   decidir quanto apostar: em pé ela vai para o pé da tela, por cima da sua
   mão (você já sabe o que tem); deitada, para o canto da direita, ao lado do
   leque. */
.pk-bandeja.pk3-bandeja {
  position: fixed; z-index: 6; left: 8px; right: 8px; bottom: max(8px, env(safe-area-inset-bottom));
  width: auto; max-width: none; margin: 0;
  border: 1px solid rgba(242, 193, 78, 0.45); border-radius: 16px;
  box-shadow: 0 18px 40px -10px #000; padding: 10px 12px 10px;
}
@media (min-aspect-ratio: 1/1) {
  .pk-bandeja.pk3-bandeja { left: auto; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); width: min(360px, 44vw); }
  .pk3-bandeja .pk-band-dica { flex-basis: 100%; margin-left: 0; }
}
.pk3-bandeja .btn {
  border: 1px solid rgba(140, 106, 69, 0.5); border-radius: 12px; cursor: pointer;
  font: 900 0.8rem Nunito, sans-serif; color: #f5f1e6; background: rgba(0, 0, 0, 0.45);
  min-height: 40px; padding: 8px 12px; white-space: nowrap;
}
.pk3-bandeja .btn:disabled { opacity: 0.35; cursor: default; }
.pk3-bandeja .btn-ghost { background: transparent; border-color: transparent; color: var(--sage); }
.pk3-bandeja .btn-primary { background: linear-gradient(180deg, #ffd473, #f2c14e); border-color: #f2c14e; color: #3d2c07; }
.pk3-bandeja .btn-primary.soft-disabled { opacity: 0.55; }
.pk3-bandeja .pk-band-atalhos .btn { flex: 1; min-height: 34px; padding: 6px 4px; font-size: 0.72rem; }
.pk3-bandeja .pk-band-acoes .pk-confirma { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.pk3-bandeja .pk-ficha-btn { width: 46px; height: 46px; }

/* o resultado da mão: em tela deitada, no canto de baixo à direita (o tampo
   perto de você, onde não há carta nem ficha — no meio da altura ele tapava
   a mão mostrada de quem senta à direita); em pé, no alto, abaixo do aviso */
.pk-resultado.pk3-resultado {
  position: fixed; z-index: 15; right: 12px; bottom: max(12px, env(safe-area-inset-bottom));
  width: min(330px, 42vw); margin: 0; max-height: min(52vh, 420px);
  box-shadow: 0 24px 60px -10px #000;
  /* o pkAparece da 2D anima o transform, e aqui o transform é o que centra */
  animation-name: pk3Aparece;
}
@keyframes pk3Aparece { from { opacity: 0; } }
.pk3-resultado[hidden] { display: none; }
@media (max-aspect-ratio: 1/1) {
  .pk-resultado.pk3-resultado { right: auto; bottom: auto; left: 50%; top: max(146px, calc(env(safe-area-inset-top) + 134px)); transform: translateX(-50%); width: min(330px, calc(100vw - 24px)); max-height: 36vh; }
}
.pk3-resultado .pk-res-titulo { font-size: 0.84rem; }
.pk3-resultado .pk-res-cartas .pk3-carta { width: 27px; height: 38px; border-radius: 4px; display: block; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
.pk3-resultado .avatar { border-radius: 50%; background: #1b110b; box-shadow: 0 0 0 2px var(--anel, #8c6a45); }

/* as suas fichas: no canto, acima da barra */
.pk-eu.pk3-eu {
  position: fixed; z-index: 4; left: 10px; bottom: calc(var(--acao-fundo, 174px) + 52px);
  width: auto; max-width: calc(100vw - 20px); margin: 0; padding: 6px 12px 6px 8px;
  background: rgba(27, 17, 11, 0.82); border: 1px solid rgba(140, 106, 69, 0.45); border-radius: 14px;
  pointer-events: none; min-height: 0;
}
.pk3-eu[hidden] { display: none; }
.pk3-eu .pk-eu-nota { margin-left: 4px; }
.pk3-pos { font-size: 0.7rem; font-weight: 900; padding: 1px 6px; border-radius: 7px; background: rgba(157, 187, 173, 0.2); color: var(--sage); }
.pk3-pos.botao { background: var(--cream); color: var(--ink); }
/* deitada, o canto de baixo está livre (o leque fica no meio); acima do
   rodapé da conexão */
@media (min-aspect-ratio: 1/1) {
  .pk-eu.pk3-eu { bottom: max(24px, calc(env(safe-area-inset-bottom) + 18px)); left: 12px; }
}
`;
