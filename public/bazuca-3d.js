// ============================================================================
// Bazuca — a mesa 3D. Como o bazuca-mesa.js da 2D, este arquivo só é baixado
// quando a sala é de Bazuca: a 3D do Caçamba nunca paga por ele.
//
// Não monta cena nova. Mesa, elenco, monte, descarte, voos e placas são os do
// mesa3d.js e chegam pelo `ctx`; o que é daqui:
//  - as cartas viradas de cada um, DEITADAS no feltro na frente da cadeira, em
//    duas fileiras e nas posições fixas do motor: 0 e 1 na fileira de longe
//    (a do meio da mesa), 2 e 3 na de perto (a do dono); a punição abre coluna
//    nova; carta que sai deixa o buraco no lugar. A grade de cada adversário é
//    a dele vista de onde você senta — a esquerda dele é a sua direita —, e a
//    face, quando aparece, vem virada para você;
//  - a carta que você comprou, de cara para cima no meio, ao lado do descarte
//    (a dos outros fica na mão de quem comprou, no leque dele);
//  - os botões, a lupa (carta de adversário à vista sai grande na tela), o
//    grito com o efeito e o som, e o relógio da vez no painel.
//
// Sem assistência, como na 2D: carta só mostra o valor quando ESTÁ à vista na
// visão do servidor (a sua espiada, a mostrada a todos num erro, o fim da
// rodada). Nada marca carta já vista nem acende descarte possível.
//
// A regra continua em /shared/bazuca.js: daqui só se pergunta.
// ============================================================================

import { rotulo as rotuloDoValor, contaDaRodada } from '/shared/bazuca.js';
import { arteDaCarta } from './baralho.js';

const NOME_DO_PODER = { J: 'valete', Q: 'dama', K: 'rei' };
const PLACA_DO_PODER = { J: 'VALETE', Q: 'DAMA', K: 'REI' };
const VAO = 0.035;            // entre uma carta e a vizinha, nas duas direções
const DUPLO_MS = 420;         // dois toques na mesma carta, dentro disto: descartar em cima
const ESC_COMPRADA = 0.6;     // a sua comprada, no meio: um pouco maior que o descarte
const OURO = 0xf2c14e, VERMELHO = 0xe0533d, CREME = 0xfff6e2;
// O que os outros fizeram: só a POSIÇÃO acende, nunca o valor (as cores da 2D).
const COR_DO_DESTAQUE = { olho: 0x7cc4ff, troca: 0xc58cff, mudou: 0xf5f1e6, chegou: 0xf5f1e6, nova: VERMELHO };

// A casa de cada posição na grade, no quadro do DONO: a coluna, da esquerda
// para a direita dele, e a fileira. É a ordem da 2D (ordemDasPosicoes): as
// de punição vão em colunas novas, a par na fileira de longe e a ímpar na de perto.
function casa(i) {
  if (i < 4) return { col: i % 2, perto: i >= 2 };
  return { col: 2 + Math.floor((i - 4) / 2), perto: (i - 4) % 2 === 1 };
}
const colunasDe = (n) => Math.max(2, Math.ceil(n / 2));
const idDe = (c) => (c ? c.id : null);

export function criaBazuca3D(ctx) {
  const { THREE, scene, MESA_TOPO, CARTA_L, CARTA_A } = ctx;
  const v = () => ctx.view();
  const me = () => ctx.me();
  const nomeDe = (id) => (id === me() ? 'você' : v()?.players.find((p) => p.id === id)?.name || '…');
  const Nome = (id) => (id === me() ? 'Você' : nomeDe(id));
  const doNome = (id) => (id === me() ? 'sua' : `de ${nomeDe(id)}`);
  const jogando = () => v()?.phase === 'play';
  const minhaVez = () => jogando() && v().turnId === me();
  const rot = (c) => (c?.joker ? 'coringa' : rotuloDoValor(c?.rank));

  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.appendChild(estilo);

  // O aviso de um lance fica uns segundos e depois volta o texto da vez (o
  // `sincroniza`, que roda logo depois dos eventos, o trocaria na hora).
  let avisoDoLance = null;
  let ultimoAviso = null;
  function anuncia(texto, ms = 2600) {
    const este = { texto, ate: performance.now() + ms };
    avisoDoLance = este;
    mostraAviso(texto);
    setTimeout(() => {
      if (avisoDoLance !== este) return;
      avisoDoLance = null;
      const t = textoDaVez();
      if (t) mostraAviso(t);
    }, ms);
  }
  function mostraAviso(texto) { ultimoAviso = texto; ctx.aviso(texto, true); }

  // ---- texturas próprias ----------------------------------------------------

  // O aro de realce em volta da carta: um retângulo de canto redondo com brilho,
  // tingido pela cor do momento (escolhida, à vista, o que os outros fizeram).
  const AREA = { w: 160, h: 210, x: 18, y: 18, iw: 124, ih: 174 };
  const texAro = (() => {
    const c = document.createElement('canvas');
    c.width = AREA.w; c.height = AREA.h;
    const g = c.getContext('2d');
    const r = 16;
    const caminho = () => {
      const { x, y, iw: w, ih: h } = AREA;
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    };
    g.strokeStyle = '#fff'; g.lineWidth = 9;
    g.shadowColor = '#fff'; g.shadowBlur = 14;
    caminho(); g.stroke();
    g.shadowBlur = 0; caminho(); g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  // o aro cobre a carta com um fio de folga: o traço passa logo do lado de fora
  const escalaDoAro = (l, a, folga = 0.014) => [(l + folga) * (AREA.w / AREA.iw), (a + folga) * (AREA.h / AREA.ih)];

  function plano(map, cor, opacidade) {
    const m = new THREE.Mesh(ctx.geoSombra, new THREE.MeshBasicMaterial({ map, color: cor, transparent: true, opacity: opacidade, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  const solta = (m) => { m.material.dispose(); };

  // ---- as grades ------------------------------------------------------------

  const mesa = new THREE.Group();
  scene.add(mesa);
  const grades = new Map();      // playerId → { grupo, tapetes, casas, s, f, px, pz, yaw, soma }
  const destaques = new Map();   // "p:i" → { tipo, ate }
  let sel = [];                  // [{ p, i }] — no máximo duas, de quem for
  let ultimoToque = null;
  let plano_ = null;             // as medidas da mesa nesta sincronia

  function criaGrade(pid) {
    const grupo = new THREE.Group();
    const meu = pid === me();
    // o tapete do dono: a borda na cor da banqueta dele e o miolo escuro — é
    // o que diz de quem é cada grade numa mesa cheia
    const tapetes = [
      [new THREE.Color(ctx.corDe(pid)), 0.62, 0.002],
      [0x1c120a, meu ? 0.5 : 0.82, 0.003],
    ].map(([cor, op, y]) => {
      const t = plano(ctx.texturaTapete, cor, op);
      t.position.y = y;
      grupo.add(t);
      return t;
    });
    mesa.add(grupo);
    // a soma de cada um, sobre a grade, quando a rodada acaba
    const soma = ctx.rotulo('', 'rgba(27,17,11,0.92)', '#f2c14e');
    soma.scale.set(0.34, 0.095, 1);
    soma.visible = false;
    scene.add(soma);
    return { pid, grupo, tapetes, casas: new Map(), s: 0.46, f: 1, px: 0, pz: 0, yaw: 0, soma };
  }

  function criaCasa(g, i) {
    const raiz = new THREE.Group();
    // Transparentes, os três planos (tapete, buraco, aro) seriam ordenados pela
    // distância do centro de cada um à câmera — e o tapete, cujo centro fica
    // mais perto que a fileira de longe, era desenhado POR CIMA do aro dela.
    // A ordem é fixa: tapete, buraco, aro.
    const aro = plano(texAro, OURO, 0);
    aro.position.y = 0.004;
    aro.renderOrder = 2;
    aro.visible = false;
    const buraco = plano(ctx.texturaTapete, 0x000000, 0.3);
    buraco.position.y = 0.0045;
    buraco.renderOrder = 1;
    buraco.visible = false;
    const carta = new THREE.Mesh(ctx.geoCarta, ctx.materialVerso);
    // deitada (o 0,025 é só a sombra da borda); a dos outros gira meia volta
    // dentro da grade dele para a face, quando aparecer, vir virada para você
    carta.rotation.order = 'YXZ';
    carta.rotation.set(-Math.PI / 2 + 0.025, g.pid === me() ? 0 : Math.PI, 0);
    carta.position.y = 0.008;
    carta.castShadow = true;
    carta.userData.bz = { p: g.pid, i };
    raiz.add(aro, buraco, carta);
    g.grupo.add(raiz);
    return { i, raiz, aro, buraco, carta, cheio: true, tipo: null, faceAlvo: null, faceAtual: null, vira: null, ocultoAte: 0 };
  }
  function soltaCasa(c) { solta(c.aro); solta(c.buraco); }
  function soltaGrade(g) {
    for (const c of g.casas.values()) soltaCasa(c);
    for (const t of g.tapetes) solta(t);
    mesa.remove(g.grupo);
    scene.remove(g.soma);
    g.soma.material.map?.dispose(); g.soma.material.dispose();
  }

  // A carta que ESTÁ à vista agora nesta posição, ou null.
  function aVista(jogador, i) {
    const vw = v();
    if (vw.phase === 'roundEnd' || vw.phase === 'gameEnd') {
      const c = jogador.slots[i];
      return c && typeof c === 'object' ? { card: c, tipo: 'fim' } : null;
    }
    const r = vw.reveladas.find((x) => x.p === jogador.id && x.i === i);
    if (r) return { card: r.card, tipo: 'revelada' };
    const e = vw.you?.espiadas.find((x) => x.p === jogador.id && x.i === i);
    if (e) return { card: e.card, tipo: 'espiada' };
    return null;
  }

  // Onde fica cada coisa. A barra de botões mora no pé da tela (não há leque),
  // e a SUA grade fica logo acima dela: é ali que a tela olha para o tampo
  // perto de você. O meio (monte, descarte, comprada) vai para trás da sua
  // grade, e os adversários abrem o anel o bastante para não encostar nele.
  const camRepouso = new THREE.PerspectiveCamera();
  const _v = new THREE.Vector3();
  function zDaTela(yPx) {
    camRepouso.copy(ctx.camera, false);
    camRepouso.position.x = 0;
    camRepouso.lookAt(0, MESA_TOPO + 0.12, -0.35);   // o olhar de repouso, para a mesa
    camRepouso.updateMatrixWorld();
    const alvo = _v.set(0, 1 - (2 * yPx) / innerHeight, 0.5).unproject(camRepouso);
    const dir = alvo.sub(camRepouso.position);
    if (dir.y > -1e-4) return null;
    const t = (MESA_TOPO - camRepouso.position.y) / dir.y;
    return camRepouso.position.z + dir.z * t;
  }
  function medidas(nOutros) {
    const emPe = innerWidth < innerHeight;
    // a faixa da barra: em pé os botões quebram em duas linhas
    const reserva = emPe ? 108 : 62;
    // em pé a tela alcança o tampo quase até a sua beirada (o feltro vai a 1,15)
    const zLivre = Math.min(1.0, zDaTela(innerHeight - reserva) ?? 0.6);
    // A sua grade é a mais perto da câmera: mesmo menor que a dos outros no
    // feltro, ela sai maior na tela. Com 0,48 ela empurrava o meio para cima
    // das grades de quem senta à frente (medido em 1024×768).
    const sMeu = emPe ? 0.4 : 0.42;
    const pzMeu = CARTA_A * sMeu + VAO;
    const zMeu = zLivre - 0.03 - pzMeu;            // o centro: entre as duas fileiras
    const longeMeu = zMeu - pzMeu + VAO / 2;       // a borda de lá da sua grade
    const PILHA = (CARTA_A * ctx.ESCALA_TAMPO) / 2;
    // Em pé sobra tampo: o meio pode vir um pouco para o seu lado, e o anel
    // dos outros se fecha — de longe, as cartas deles eram miúdas demais para
    // o dedo.
    const zPilhas = Math.min(0.1, longeMeu - 0.05 - PILHA);
    const sDeles = nOutros <= 3 ? 0.42 : 0.38;
    const pzDeles = CARTA_A * sDeles + VAO;
    // a folga até o meio é maior que a do seu lado: vista de longe e rasante,
    // a pilha (que tem altura) parecia encostar na grade de quem senta à frente
    const raio = THREE.MathUtils.clamp(-zPilhas + PILHA + 0.11 + pzDeles, 0.58, 1.1 - pzDeles);
    // largura que cabe a cada adversário: o arco até o vizinho
    let limite = 1.0;
    if (nOutros > 1) {
      const a0 = ctx.posicaoDoAssento(0, nOutros).ang, a1 = ctx.posicaoDoAssento(1, nOutros).ang;
      limite = Math.max(0.34, raio * Math.abs(a1 - a0) * 0.95);
    }
    return { sMeu, zMeu, zPilhas, sDeles, raio, limite, larguraMeu: emPe ? 0.62 : 0.9 };
  }

  function arrumaGrades() {
    const vw = v();
    const outros = vw.players.filter((p) => p.id !== me());
    plano_ = medidas(outros.length);
    const pl = plano_;
    for (const [pid, g] of grades) if (!vw.players.some((p) => p.id === pid)) { soltaGrade(g); grades.delete(pid); }
    const agora = performance.now();
    for (const p of vw.players) {
      let g = grades.get(p.id);
      if (!g) { g = criaGrade(p.id); grades.set(p.id, g); }
      const meu = p.id === me();
      const s = meu ? pl.sMeu : pl.sDeles;
      const n = p.slots.length;
      const C = colunasDe(n);
      const px = CARTA_L * s + VAO, pz = CARTA_A * s + VAO;
      Object.assign(g, { s, px, pz });
      if (meu) {
        g.grupo.position.set(0, MESA_TOPO, pl.zMeu);
        g.grupo.rotation.y = 0;
        g.yaw = 0;
        g.f = Math.min(1, pl.larguraMeu / (C * px));
      } else {
        const pos = ctx.posicaoDoAssento(outros.indexOf(p), outros.length);
        g.grupo.position.set(Math.sin(pos.ang) * pl.raio, MESA_TOPO, -Math.cos(pos.ang) * pl.raio);
        // o quadro do dono: a frente dele aponta para o meio da mesa
        g.grupo.rotation.y = Math.PI - pos.ang;
        g.yaw = -pos.ang;
        g.f = Math.min(1, pl.limite / (C * px));
      }
      g.grupo.scale.set(g.f, 1, g.f);
      const larg = C * px - VAO, prof = 2 * pz - VAO;
      g.tapetes[0].scale.set(larg + 0.1, prof + 0.1, 1);
      g.tapetes[1].scale.set(larg + 0.065, prof + 0.065, 1);
      // o aro da escolhida é mais largo que os outros: dourado sobre o tapete
      // marrom, o justo quase não se via
      const aroJusto = escalaDoAro(CARTA_L * s, CARTA_A * s), aroLargo = escalaDoAro(CARTA_L * s, CARTA_A * s, 0.05);
      for (let i = 0; i < n; i++) {
        let c = g.casas.get(i);
        if (!c) { c = criaCasa(g, i); g.casas.set(i, c); }
        const { col, perto } = casa(i);
        c.raiz.position.set((col - (C - 1) / 2) * px, 0, perto ? pz / 2 : -pz / 2);
        c.cheio = !!p.slots[i];
        c.buraco.visible = !c.cheio;
        c.buraco.scale.set(CARTA_L * s * 0.92, CARTA_A * s * 0.92, 1);
        c.aroJusto = aroJusto; c.aroLargo = aroLargo;
        if (!c.vira) c.carta.scale.setScalar(s);
        const vista = c.cheio ? aVista(p, i) : null;
        c.tipo = vista?.tipo || null;
        c.faceAlvo = vista?.card || null;
        if (c.faceAlvo) ctx.materialDaCarta(c.faceAlvo);   // começa a baixar a face já
        if (!c.cheio) { c.faceAtual = null; c.vira = null; c.carta.material = ctx.materialVerso; c.ocultoAte = 0; }
        c.carta.visible = c.cheio && !(c.ocultoAte > agora);
      }
      for (const [i, c] of g.casas) if (i >= n) { g.grupo.remove(c.raiz); soltaCasa(c); g.casas.delete(i); }
      // a soma, no fim da rodada
      const somaFim = vw.phase === 'roundEnd' || vw.phase === 'gameEnd' ? vw.lastRound?.somas?.[p.id] : null;
      g.soma.visible = somaFim != null;
      if (somaFim != null) {
        const venceu = vw.lastRound.vencedor === p.id;
        ctx.trocaRotulo(g.soma, `soma ${somaFim}`, venceu ? 'rgba(207,138,42,0.96)' : 'rgba(27,17,11,0.92)', venceu ? '#fff6e2' : '#f2c14e');
        // a sua ao lado da grade (por cima ela tapava a fileira de longe; em pé
        // não há lado, e ela vai para trás dela); a dos outros do lado do dono,
        // na frente do corpo dele
        const emPe = innerWidth < innerHeight;
        g.grupo.updateMatrixWorld(true);
        g.grupo.localToWorld(g.soma.position.set(meu && !emPe ? (C * px) / 2 + 0.2 : 0, 0, meu ? (emPe ? -pz - 0.08 : 0) : pz + 0.06));
        g.soma.position.y = MESA_TOPO + (meu ? 0.05 : 0.1);
      }
    }
  }

  const casaDe = (pid, i) => grades.get(pid)?.casas.get(i) || null;
  function pontoDaCasa(pid, i) {
    const c = casaDe(pid, i);
    if (!c) return new THREE.Vector3(0, MESA_TOPO + 0.02, 0);
    c.raiz.updateWorldMatrix(true, false);
    return c.raiz.getWorldPosition(new THREE.Vector3()).setY(MESA_TOPO + 0.014);
  }
  const escalaDaCasa = (pid) => { const g = grades.get(pid); return g ? g.s * g.f : 0.46; };
  const yawDaCasa = (pid) => grades.get(pid)?.yaw || 0;
  function ocultaCasa(pid, i, ms) {
    const c = casaDe(pid, i);
    if (!c || ctx.semMovimento) return;
    c.ocultoAte = performance.now() + ms;
    c.carta.visible = false;
  }
  function destaca(pid, i, tipo, ms = 2200) { destaques.set(`${pid}:${i}`, { tipo, ate: performance.now() + ms }); }

  // ---- o meio: monte, descarte e a sua comprada ------------------------------

  const X_MONTE = -0.3, X_COMPRADA = 0.3;
  function poePilhas(z) {
    const { monte, descarte } = ctx;
    monte.caixa.position.x = X_MONTE; monte.caixa.position.z = z;
    monte.sombra.position.x = X_MONTE; monte.sombra.position.z = z;
    monte.num.position.x = X_MONTE; monte.num.position.z = z + 0.05;
    descarte.grupo.position.x = 0; descarte.grupo.position.z = z;
    descarte.sombra.position.x = 0; descarte.sombra.position.z = z;
  }
  const pontoDoDescarte = () => ctx.descarte.grupo.position.clone().setY(MESA_TOPO + 0.03);
  // a do meio só aparece quando a carta que voa até ela chega
  function seguraDescarte(ms) {
    if (ctx.semMovimento) return;
    const face = ctx.descarte.grupo.children[1];
    if (!face) return;
    face.visible = false;
    face.userData.esperaAte = Math.max(face.userData.esperaAte || 0, performance.now() + ms);
  }

  const comprada = new THREE.Mesh(ctx.geoCarta, ctx.materialVerso);
  comprada.rotation.order = 'YXZ';
  comprada.rotation.set(-Math.PI / 2 + 0.03, 0, 0);
  comprada.scale.setScalar(ESC_COMPRADA);
  comprada.castShadow = true;
  comprada.visible = false;
  comprada.userData.bz = 'comprada';
  scene.add(comprada);
  const aroDaComprada = plano(texAro, OURO, 0.95);
  aroDaComprada.renderOrder = 2;
  // mais largo que o das casas: a comprada fica um pouco acima do feltro e o
  // aro justo some embaixo dela
  aroDaComprada.scale.set(...escalaDoAro(CARTA_L * ESC_COMPRADA, CARTA_A * ESC_COMPRADA, 0.04));
  aroDaComprada.visible = false;
  scene.add(aroDaComprada);
  let compradaOcultaAte = 0;
  let compradaId = null;
  const pontoDaComprada = () => comprada.position.clone().setY(MESA_TOPO + 0.02);

  function arrumaComprada() {
    const z = plano_.zPilhas;
    comprada.position.set(X_COMPRADA, MESA_TOPO + 0.012, z);
    aroDaComprada.position.set(X_COMPRADA, MESA_TOPO + 0.005, z);
    const c = v().you?.comprada || null;
    if (idDe(c) !== compradaId) {
      compradaId = idDe(c);
      if (c) comprada.material = ctx.materialDaCarta(c);
    }
    const ok = !!c && !(compradaOcultaAte > performance.now());
    comprada.visible = ok; aroDaComprada.visible = ok;
  }

  // ---- voos ---------------------------------------------------------------
  // Os do mesa3d.js (`voa`) só movem: aqui a carta também gira para o lado de
  // quem a recebe, muda de tamanho e, se for o caso, vira no meio do caminho.

  const voos = [];
  function passageira(material) {
    const m = new THREE.Mesh(ctx.geoCarta, material);
    m.rotation.order = 'YXZ';
    m.rotation.x = -Math.PI / 2 + 0.03;
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    return m;
  }
  const curto = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function voa(material, { de, para, yawDe = 0, yawPara = 0, escDe, escPara, dur = 420, atraso = 0, arco = 0.09, virarPara = null }) {
    if (ctx.semMovimento) return;
    const m = passageira(material);
    m.position.copy(de);
    voos.push({ m, de: de.clone(), para: para.clone(), yawDe, giro: curto(yawPara - yawDe), escDe, escPara, dur, t0: performance.now() + atraso, arco, virarPara, virou: false });
  }
  function animaVoos(t) {
    for (let k = voos.length - 1; k >= 0; k--) {
      const o = voos[k];
      const e0 = (t - o.t0) / o.dur;
      if (e0 < 0) continue;
      o.m.visible = true;
      const e = Math.min(1, e0);
      const s = 1 - Math.pow(1 - e, 3);
      o.m.position.lerpVectors(o.de, o.para, s);
      o.m.position.y += Math.sin(s * Math.PI) * o.arco;
      o.m.rotation.y = o.yawDe + o.giro * s;
      const esc = o.escDe + (o.escPara - o.escDe) * s;
      // virando no meio do voo: a largura passa por zero e a face troca ali
      let lx = esc;
      if (o.virarPara) {
        lx = esc * Math.max(0.03, Math.abs(Math.cos(Math.PI * s)));
        if (s >= 0.5 && !o.virou) { o.m.material = o.virarPara; o.virou = true; }
      }
      o.m.scale.set(lx, esc, esc);
      if (e >= 1) { scene.remove(o.m); voos.splice(k, 1); }
    }
  }
  function limpaVoos() { for (const o of voos) scene.remove(o.m); voos.length = 0; }

  // de onde sai a carta da mão de alguém (o leque dele, ou a mão do modelo)
  function maoDe(pid) {
    const a = ctx.assentos.get(pid);
    if (!a) return ctx.topoDoMonte();
    return a.assento?.modelo ? ctx.pontoDaMaoAtiva(a) : ctx.lequeDe(a);
  }
  function gesto(pid, tipo, alvo) {
    const m = ctx.assentos.get(pid)?.assento?.modelo;
    if (m && !ctx.semMovimento) ctx.gestoCarta(m, tipo, alvo);
  }
  // uma carta de uma casa (ou de outro ponto) para o descarte, de cara para cima
  function vaiAoDescarte(card, de, yaw, esc, atraso = 0) {
    const dur = 440;
    voa(ctx.materialDaCarta(card), { de, para: pontoDoDescarte(), yawDe: yaw, yawPara: 0, escDe: esc, escPara: ctx.ESCALA_TAMPO, dur, atraso });
    seguraDescarte(atraso + dur);
  }
  // uma carta virada até uma casa, que só aparece quando ela chega
  function vaiParaCasa(pid, i, de, { yawDe = 0, escDe = 0.42, atraso = 0, dur = 440, material = ctx.materialVerso, virarPara = null } = {}) {
    voa(material, { de, para: pontoDaCasa(pid, i), yawDe, yawPara: yawDaCasa(pid), escDe, escPara: escalaDaCasa(pid), dur, atraso, virarPara });
    ocultaCasa(pid, i, atraso + dur);
  }

  // O que os eventos deixam para depois da sincronia: os voos precisam das
  // casas já no lugar da visão nova.
  const pendentes = [];
  let distribuir = false;
  let antes = { etapa: null, comprada: null };

  // ---- o toque --------------------------------------------------------------

  const ehSel = (p, i) => sel.some((s) => s.p === p && s.i === i);
  const minhas = () => sel.filter((s) => s.p === me());
  const alheias = () => sel.filter((s) => s.p !== me());
  function escolhe(p, i) {
    if (ehSel(p, i)) sel = sel.filter((s) => !(s.p === p && s.i === i));
    else {
      sel.push({ p, i });
      if (sel.length > 2) sel.shift();
    }
    ctx.atualizaBotoes();
  }
  function manda(action) {
    ctx.sendAction(action);
    sel = [];
    ultimoToque = null;
    ctx.atualizaBotoes();
  }

  // ---- a lupa ---------------------------------------------------------------
  // Carta de adversário à vista (a dama, ou um descarte errado) sai grande na
  // tela: deitada do outro lado da mesa ela é uma tira, e é justamente a carta
  // que você precisa decorar. Vem com o nome do dono e um mapinha da grade
  // dele DO JEITO QUE VOCÊ A VÊ (as posições projetadas da própria cena).

  const lupa = document.createElement('div');
  lupa.className = 'bz3-lupa';
  lupa.hidden = true;
  lupa.setAttribute('role', 'status');
  lupa.setAttribute('aria-live', 'polite');
  lupa.title = 'Toque para fechar';
  lupa.onclick = () => { lupa.hidden = true; };
  document.body.appendChild(lupa);
  let lupaChave = '';

  function mapinha(pid, i) {
    const g = grades.get(pid);
    const box = document.createElement('div');
    box.className = 'bz3-mapinha';
    if (!g) return box;
    const jogador = v().players.find((p) => p.id === pid);
    const pts = [...g.casas.values()].map((c) => {
      c.raiz.updateWorldMatrix(true, false);
      const p = c.raiz.getWorldPosition(new THREE.Vector3()).project(ctx.camera);
      return { i: c.i, x: p.x, y: -p.y, cheio: !!jogador?.slots[c.i] };
    });
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    for (const p of pts) {
      const d = document.createElement('i');
      d.className = `${p.cheio ? '' : 'vazio'}${p.i === i ? ' aqui' : ''}`;
      d.style.left = `${8 + ((p.x - x0) / Math.max(1e-6, x1 - x0)) * 54}px`;
      d.style.top = `${8 + ((p.y - y0) / Math.max(1e-6, y1 - y0)) * 26}px`;
      box.appendChild(d);
    }
    return box;
  }

  function desenhaLupa() {
    const vw = v();
    const itens = vw.phase !== 'play' ? [] : [
      ...(vw.you?.espiadas || []).filter((x) => x.p !== me()).map((x) => ({ ...x, tipo: 'espiada' })),
      ...vw.reveladas.map((x) => ({ ...x, tipo: 'revelada' })),
    ];
    const chave = itens.map((x) => `${x.tipo}:${x.p}:${x.i}:${x.card.id}`).join('|');
    if (chave === lupaChave) return;
    lupaChave = chave;
    lupa.textContent = '';
    lupa.hidden = !itens.length;
    if (!itens.length) return;
    for (const x of itens.slice(0, 3)) {
      const bloco = document.createElement('div');
      bloco.className = `bz3-bloco ${x.tipo}`;
      const titulo = document.createElement('div');
      titulo.className = 'bz3-titulo';
      titulo.textContent = x.tipo === 'espiada' ? `Carta de ${nomeDe(x.p)}`
        : `${x.p === me() ? 'Sua carta' : `Carta de ${nomeDe(x.p)}`} (errou)`;
      const img = document.createElement('img');
      img.className = 'bz3-carta';
      img.src = `/${arteDaCarta(x.card)}`;
      img.alt = '';
      bloco.append(titulo, img, mapinha(x.p, x.i));
      bloco.setAttribute('aria-label', `${titulo.textContent}: ${rot(x.card)}`);
      lupa.appendChild(bloco);
    }
    lupa.classList.remove('entra');
    void lupa.offsetWidth;
    if (!ctx.semMovimento) lupa.classList.add('entra');
  }

  // ---- o grito --------------------------------------------------------------

  const grito = document.createElement('div');
  grito.className = 'bz3-grito';
  grito.hidden = true;
  grito.setAttribute('aria-hidden', 'true');
  grito.innerHTML = '<div class="bz3-grito-raios"></div><div class="bz3-grito-texto">BAZUCA!</div><div class="bz3-grito-quem"></div>';
  document.body.appendChild(grito);

  let audio = null;
  function som(tipo) {
    try {
      if (!navigator.userActivation?.hasBeenActive) return;
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const ac = audio;
      const t = ac.currentTime;
      const saida = ac.createGain();
      saida.connect(ac.destination);
      if (tipo === 'bazuca') {
        // o estouro: ruído grave abafando + uma descida de tom
        const n = ac.sampleRate * 1.2;
        const buf = ac.createBuffer(1, n, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / n) ** 2.4;
        const ruido = ac.createBufferSource();
        ruido.buffer = buf;
        const filtro = ac.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.setValueAtTime(2400, t);
        filtro.frequency.exponentialRampToValueAtTime(120, t + 1.1);
        ruido.connect(filtro).connect(saida);
        const grave = ac.createOscillator();
        grave.type = 'sine';
        grave.frequency.setValueAtTime(150, t);
        grave.frequency.exponentialRampToValueAtTime(36, t + 0.9);
        const gg = ac.createGain();
        gg.gain.setValueAtTime(0.9, t);
        gg.gain.exponentialRampToValueAtTime(0.001, t + 1);
        grave.connect(gg).connect(saida);
        saida.gain.setValueAtTime(0.55, t);
        ruido.start(t); grave.start(t); grave.stop(t + 1.05);
        return;
      }
      const o = ac.createOscillator();
      o.type = tipo === 'erro' ? 'square' : 'triangle';
      o.frequency.setValueAtTime(tipo === 'erro' ? 150 : 880, t);
      if (tipo === 'erro') o.frequency.linearRampToValueAtTime(110, t + 0.28);
      saida.gain.setValueAtTime(tipo === 'erro' ? 0.12 : 0.16, t);
      saida.gain.exponentialRampToValueAtTime(0.001, t + (tipo === 'erro' ? 0.32 : 0.12));
      o.connect(saida);
      o.start(t); o.stop(t + 0.35);
    } catch { /* sem áudio, segue o jogo */ }
  }

  function gritaBazuca(id) {
    som('bazuca');
    // sem um toque do usuário antes, o navegador recusa (e reclama no console)
    try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([60, 40, 140]); } catch { /* ok */ }
    grito.querySelector('.bz3-grito-quem').textContent = id === me() ? 'você gritou' : `${nomeDe(id)} gritou`;
    grito.hidden = false;
    grito.classList.remove('entra');
    void grito.offsetWidth;
    grito.classList.add('entra');
    const cena = document.getElementById('cena');
    if (!ctx.semMovimento && cena) {
      cena.classList.remove('bz3-treme');
      void cena.offsetWidth;
      cena.classList.add('bz3-treme');
    }
    clearTimeout(gritaBazuca.t);
    gritaBazuca.t = setTimeout(() => { grito.hidden = true; }, 1700);
  }

  // ---- o relógio --------------------------------------------------------------
  // No painel, no lugar do contrato do Caçamba: os segundos da vez (ou da
  // espiada), em vermelho quando aperta. O aviso da sua vez também conta.

  let prazoLocal = null;
  const segundos = () => (prazoLocal == null ? null : Math.max(0, Math.ceil((prazoLocal - Date.now()) / 1000)));
  function tique() {
    const vw = v();
    if (!vw || vw.modo !== 'bazuca') return;
    const el = document.getElementById('rot-contrato');
    const s = segundos();
    if (el) {
      // em tela estreita o painel divide a linha com três botões: só os segundos
      const quem = innerWidth < 520 ? '' : `${minhaVez() ? 'Sua vez' : `Vez de ${nomeDe(vw.turnId)}`} · `;
      el.textContent = vw.phase === 'gameEnd' ? 'Fim de jogo' : vw.phase === 'roundEnd' ? 'Fim da rodada'
        : vw.phase === 'espiar' ? `Espiada · ${s ?? 0}s`
        : vw.phase === 'play' && s != null ? `${quem}${s}s` : '—';
      el.style.color = vw.phase === 'play' && s != null && s <= 8 ? '#ff9c86' : '';
    }
    // o texto da vez acompanha o relógio — a não ser que outra coisa (um erro
    // do servidor, um emote) esteja no aviso agora; quando ela some, ele volta
    const aviso = document.getElementById('aviso');
    if (aviso && (aviso.hidden || aviso.textContent === ultimoAviso)) {
      const t = textoDaVez();
      if (t && (t !== ultimoAviso || aviso.hidden)) mostraAviso(t);
    }
  }
  setInterval(tique, 250);

  function textoDaVez() {
    const vw = v();
    if (avisoDoLance && performance.now() < avisoDoLance.ate) return avisoDoLance.texto;
    const s = segundos();
    const conta = s != null ? ` (${s}s)` : '';
    if (vw.phase === 'espiar') return `Decore as duas cartas mais perto de você!${conta}`;
    if (vw.phase === 'roundEnd') return 'Fim da rodada.';
    if (vw.phase === 'gameEnd') return 'Fim de jogo!';
    if (vw.phase !== 'play') return '';
    const devo = vw.you?.devo;
    if (devo) return `Acertou! Escolha uma carta sua para dar a ${nomeDe(devo.para)}.`;
    if (!minhaVez()) {
      const pd = vw.etapa === 'poder' ? ` (usando o ${NOME_DO_PODER[vw.poder]})` : '';
      return `Vez de ${nomeDe(vw.turnId)}${pd}…`;
    }
    if (vw.etapa === 'comprar') return `Sua vez: compre do monte — ou grite BAZUCA!${conta}`;
    if (vw.etapa === 'decidir') return `Troque por uma das suas (escolha a carta) ou descarte a comprada.${conta}`;
    if (vw.poder === 'J') return `Valete: escolha uma carta SUA para olhar.${conta}`;
    if (vw.poder === 'Q') return `Dama: escolha uma carta de OUTRO jogador para olhar.${conta}`;
    return `Rei: escolha uma carta sua e uma de outro jogador para trocar.${conta}`;
  }

  // ---- os assentos: a placa de quem deve uma carta ---------------------------

  function marcaAssentos() {
    const vw = v();
    for (const [id, a] of ctx.assentos) {
      a.marca = vw.phase === 'play' && vw.dividas.some((d) => d.de === id) ? 'DANDO CARTA' : null;
    }
  }

  // ---- o que mesa3d.js chama -------------------------------------------------

  const api = {
    // para olhar de fora (console): as medidas da mesa nesta sincronia
    get medidas() { return plano_; },

    sincroniza() {
      const vw = v();
      const eu = vw.players.find((p) => p.id === me());
      const vit = eu?.vitorias || 0;
      document.getElementById('rot-rodada').textContent = innerWidth < 520 ? `Bazuca · Rodada ${vw.round + 1}`
        : `Bazuca · Rodada ${vw.round + 1} · ${vit} de ${vw.meta || 4} vitórias`;
      prazoLocal = vw.prazoMs != null ? Date.now() + vw.prazoMs : null;
      // seleção que já não existe (carta saiu, rodada mudou) cai fora
      sel = sel.filter((s) => vw.players.find((p) => p.id === s.p)?.slots[s.i]);
      if (vw.phase !== 'play') sel = [];

      arrumaGrades();
      poePilhas(plano_.zPilhas);
      arrumaComprada();
      marcaAssentos();

      // a distribuição: quatro cartas para cada um, saindo do monte, uma
      // volta de cada vez como na mesa de verdade
      if (distribuir && !ctx.semMovimento) {
        const de = ctx.topoDoMonte();
        let k = 0;
        for (let i = 0; i < 4; i++) {
          for (const p of vw.players) {
            if (!p.slots[i]) continue;
            vaiParaCasa(p.id, i, de, { yawDe: 0, escDe: ctx.ESCALA_TAMPO, atraso: k++ * 70, dur: 380 });
          }
        }
      }
      distribuir = false;
      for (const f of pendentes.splice(0)) f();

      desenhaLupa();
      tique();
      antes = { etapa: vw.phase === 'play' ? vw.etapa : null, comprada: vw.you?.comprada || null };
    },

    quadro(t) {
      animaVoos(t);
      const agora = t;   // o tempo do laço (o mesmo relógio de performance.now)
      if (compradaOcultaAte && agora >= compradaOcultaAte) { compradaOcultaAte = 0; if (v()?.you?.comprada) { comprada.visible = true; aroDaComprada.visible = true; } }
      for (const g of grades.values()) {
        for (const c of g.casas.values()) {
          if (c.ocultoAte && agora >= c.ocultoAte) c.ocultoAte = 0;
          c.carta.visible = c.cheio && !c.ocultoAte;
          // a carta vira quando o que está à vista muda — só depois de chegar,
          // e só com a face já baixada (sem ela o giro mostrava um retângulo preto)
          if (!c.vira && c.carta.visible && idDe(c.faceAlvo) !== idDe(c.faceAtual) && (!c.faceAlvo || faceBaixada(c.faceAlvo))) {
            if (ctx.semMovimento) aplicaFace(c, c.faceAlvo);
            else c.vira = { t0: agora, para: c.faceAlvo, trocou: false };
          }
          if (c.vira) {
            const k = Math.min(1, (agora - c.vira.t0) / 320);
            if (k >= 0.5 && !c.vira.trocou) { aplicaFace(c, c.vira.para); c.vira.trocou = true; }
            c.carta.scale.set(g.s * Math.max(0.03, Math.abs(Math.cos(Math.PI * k))), g.s, g.s);
            c.carta.position.y = 0.008 + Math.sin(Math.PI * k) * 0.035;
            if (k >= 1) { c.vira = null; c.carta.scale.setScalar(g.s); c.carta.position.y = 0.008; }
          }
          // o aro: a sua escolha manda; depois o que os outros fizeram (pisca);
          // depois a carta à vista (vermelha para todos; creme, só para você —
          // em âmbar ela sumia no tapete de quem senta na cadeira dourada)
          let cor = null, op = 0;
          const d = destaques.get(`${g.pid}:${c.i}`);
          if (c.carta.visible) {
            if (ehSel(g.pid, c.i)) { cor = OURO; op = 1; }
            else if (d && d.ate > agora) { cor = COR_DO_DESTAQUE[d.tipo] ?? OURO; op = ctx.semMovimento ? 0.9 : 0.55 + 0.45 * Math.abs(Math.sin(agora / 260)); }
            else if (c.tipo === 'revelada') { cor = VERMELHO; op = 0.95; }
            else if (c.tipo === 'espiada') { cor = CREME; op = 0.9; }
          }
          if (d && d.ate <= agora) destaques.delete(`${g.pid}:${c.i}`);
          c.aro.visible = op > 0;
          if (op > 0) { const [w, h] = ehSel(g.pid, c.i) ? c.aroLargo : c.aroJusto; c.aro.scale.set(w, h, 1); }
          if (op > 0) { c.aro.material.color.setHex(cor); c.aro.material.opacity = op; }
        }
      }
    },

    // a do outro jogador fica na mão dele enquanto ele decide
    naMaoDe(id) {
      const vw = v();
      return vw?.phase === 'play' && vw.etapa === 'decidir' && vw.turnId === id ? 1 : 0;
    },

    // o que está sob o dedo: uma carta do feltro, a sua comprada ou o monte
    alvo(raycaster, x, y) {
      const vw = v();
      if (!vw || vw.phase !== 'play') return null;
      const alvos = [];
      for (const g of grades.values()) for (const c of g.casas.values()) if (c.cheio && c.carta.visible) alvos.push(c.carta);
      if (comprada.visible) alvos.push(comprada);
      const comprar = minhaVez() && vw.etapa === 'comprar';
      if (comprar) alvos.push(ctx.monte.caixa);
      const hit = raycaster.intersectObjects(alvos, false)[0];
      if (hit) return hit.object === ctx.monte.caixa ? 'monte' : hit.object.userData.bz;
      // De raspão: deitada do outro lado da mesa a carta tem 20 e poucos px de
      // altura, e o dedo é mais gordo que isso. Vale a mais perto, até 26 px.
      let melhor = null, dist = 26;
      for (const m of alvos) {
        if (m === ctx.monte.caixa) continue;
        const p = m.getWorldPosition(_v).project(ctx.camera);
        const d = Math.hypot((p.x + 1) / 2 * innerWidth - x, (1 - p.y) / 2 * innerHeight - y);
        if (d < dist) { dist = d; melhor = m.userData.bz; }
      }
      return melhor;
    },

    // Um toque escolhe (de qualquer um); dois toques rápidos na mesma carta
    // descartam em cima — ou dão a carta, quando você deve uma.
    toca(alvo) {
      const vw = v();
      if (!jogando()) return;
      const agora = performance.now();
      if (alvo === 'monte') { if (minhaVez() && vw.etapa === 'comprar') manda({ a: 'comprar' }); return; }
      if (alvo === 'comprada') {
        if (ultimoToque?.alvo === 'comprada' && agora - ultimoToque.t < DUPLO_MS) manda({ a: 'descartarComprada' });
        else ultimoToque = { alvo: 'comprada', t: agora };
        return;
      }
      const { p, i } = alvo;
      if (ultimoToque && ultimoToque.p === p && ultimoToque.i === i && agora - ultimoToque.t < DUPLO_MS) {
        if (vw.you?.devo) { if (p === me()) manda({ a: 'dar', j: i }); else ultimoToque = null; return; }
        manda({ a: 'descartar', p, i });
        return;
      }
      ultimoToque = { p, i, t: agora };
      escolhe(p, i);
    },

    botoes(barra) {
      const vw = v();
      if (!jogando()) return;
      const b = (txt, cor, fn) => { const el = ctx.botao(txt, cor, fn); barra.appendChild(el); return el; };
      const vez = minhaVez();
      const devo = vw.you?.devo;
      const m = minhas(), o = alheias();
      if (devo) {
        if (m.length === 1) b(`Dar esta carta a ${nomeDe(devo.para)}`, 'primario', () => manda({ a: 'dar', j: m[0].i }));
        return;
      }
      const grito = () => {
        const g = b('BAZUCA!', 'perigo', () => manda({ a: 'bazuca' }));
        g.style.fontFamily = "'Paytone One', 'Arial Black', sans-serif";
        g.style.letterSpacing = '0.06em';
        g.style.fontWeight = '400';
      };
      if (vez && vw.etapa === 'comprar') {
        b('Comprar do monte', 'primario', () => manda({ a: 'comprar' }));
        grito();
      }
      if (vez && vw.etapa === 'decidir') {
        if (m.length === 1 && sel.length === 1) b('Trocar', 'primario', () => manda({ a: 'trocar', i: m[0].i }));
        b('Descartar a comprada', 'normal', () => manda({ a: 'descartarComprada' }));
      }
      if (vez && vw.etapa === 'poder') {
        const pd = vw.poder;
        const pronto = pd === 'J' ? (m.length === 1 && sel.length === 1)
          : pd === 'Q' ? (o.length === 1 && sel.length === 1)
            : (m.length === 1 && o.length === 1);
        if (pronto) {
          b(pd === 'K' ? 'Trocar estas duas (rei)' : `Olhar esta carta (${NOME_DO_PODER[pd]})`, 'primario', () => {
            if (pd === 'J') manda({ a: 'espiar', i: m[0].i });
            else if (pd === 'Q') manda({ a: 'olhar', p: o[0].p, i: o[0].i });
            else manda({ a: 'rei', i: m[0].i, p: o[0].p, j: o[0].i });
          });
        }
      }
      if (vez && m.length === 2) b('Descartar o par', 'normal', () => manda({ a: 'par', i: m[0].i, j: m[1].i }));
      // o grito vale a vez inteira, decidindo ou no poder também
      if (vez && vw.etapa !== 'comprar') grito();
      // o descarte em cima vale para qualquer carta, a qualquer hora — e o
      // botão aparece igual, combine ou não: quem sabe é a sua memória
      if (sel.length === 1) b('Descartar em cima', 'normal', () => manda({ a: 'descartar', p: sel[0].p, i: sel[0].i }));
    },

    // o mesa3d.js põe este texto no aviso: fica anotado para o relógio saber
    // que o aviso ainda é dele
    textoDaVez() { ultimoAviso = textoDaVez(); return ultimoAviso; },

    evento(ev) {
      const eu = me();
      switch (ev.e) {
        case 'roundStart':
          for (const g of grades.values()) soltaGrade(g);
          grades.clear();
          sel = []; destaques.clear(); lupaChave = ''; ultimoToque = null;
          limpaVoos(); pendentes.length = 0;
          compradaId = null; compradaOcultaAte = 0;
          distribuir = true;
          avisoDoLance = null;
          if (ev.round > 0) anuncia(`Rodada ${ev.round + 1}`, 1500);
          break;
        case 'comeca':
          anuncia(ev.p === eu ? 'Sorteado: você começa.' : `Sorteado: ${nomeDe(ev.p)} começa.`);
          break;
        case 'comprou':
          if (ev.p === eu) {
            // do monte para o meio, virando de cara para cima no caminho
            pendentes.push(() => {
              const c = v().you?.comprada;
              if (!c || ctx.semMovimento) return;
              voa(ctx.materialVerso, { de: ctx.topoDoMonte(), para: pontoDaComprada(), escDe: ctx.ESCALA_TAMPO, escPara: ESC_COMPRADA, dur: 420, virarPara: ctx.materialDaCarta(c) });
              compradaOcultaAte = performance.now() + 420;
              comprada.visible = false; aroDaComprada.visible = false;
            });
          } else ctx.reage({ e: 'draw', p: ev.p, source: 'deck' });   // a carta vai para a mão dele
          break;
        case 'trocou': {
          const { p, i, card } = ev;
          destaca(p, i, 'mudou');
          ctx.verbo(p, 'TROCOU');
          const minha = antes.comprada;
          pendentes.push(() => {
            const lugar = pontoDaCasa(p, i);
            vaiAoDescarte(card, lugar, yawDaCasa(p), escalaDaCasa(p));
            if (p === eu) {
              // a sua comprada vai do meio para o lugar, virando para baixo
              vaiParaCasa(p, i, pontoDaComprada(), { escDe: ESC_COMPRADA, atraso: 140, material: minha ? ctx.materialDaCarta(minha) : ctx.materialVerso, virarPara: ctx.materialVerso });
            } else {
              vaiParaCasa(p, i, maoDe(p), { yawDe: yawDaCasa(p), escDe: 0.3, atraso: 140 });
              gesto(p, 'baixar', lugar);
            }
          });
          break;
        }
        case 'descartou':
          if (antes.etapa === 'comprar') {
            // o tempo acabou antes de comprar: a carta vai direto do monte
            pendentes.push(() => vaiAoDescarte(ev.card, ctx.topoDoMonte(), 0, ctx.ESCALA_TAMPO));
            ctx.verbo(ev.p, 'DESCARTOU');
          } else if (ev.p === eu) {
            pendentes.push(() => vaiAoDescarte(ev.card, pontoDaComprada(), 0, ESC_COMPRADA));
          } else ctx.reage({ e: 'discard', p: ev.p, card: ev.card });   // sai da mão dele
          if (ev.semPoder) anuncia(`${Nome(ev.p)} descartou ${rot(ev.card)} (sem poder).`);
          break;
        case 'poder':
          ctx.verbo(ev.p, PLACA_DO_PODER[ev.poder]);
          if (ev.p !== eu) anuncia(`${Nome(ev.p)} vai usar o ${NOME_DO_PODER[ev.poder]}.`);
          break;
        case 'espiou':
          destaca(ev.p, ev.i, 'olho');
          ctx.verbo(ev.p, 'ESPIOU');
          if (ev.p !== eu) anuncia(`${Nome(ev.p)} olhou uma carta dele.`);
          break;
        case 'olhou':
          destaca(ev.alvo, ev.i, 'olho');
          ctx.verbo(ev.p, 'OLHOU');
          if (ev.p !== eu) anuncia(ev.alvo === eu ? `${Nome(ev.p)} olhou uma carta sua.` : `${Nome(ev.p)} olhou uma carta ${doNome(ev.alvo)}.`);
          break;
        case 'reiTrocou': {
          const { p, i, alvo, j } = ev;
          destaca(p, i, 'troca', 2600);
          destaca(alvo, j, 'troca', 2600);
          ctx.verbo(p, 'REI: TROCA');
          anuncia(`${Nome(ev.p)} trocou uma carta ${p === eu ? 'sua' : 'dele'} com uma ${doNome(alvo)}.`);
          pendentes.push(() => {
            // as duas se cruzam, viradas, cada uma para o lugar da outra
            const a = pontoDaCasa(p, i), b = pontoDaCasa(alvo, j);
            vaiParaCasa(alvo, j, a, { yawDe: yawDaCasa(p), escDe: escalaDaCasa(p), dur: 560 });
            vaiParaCasa(p, i, b, { yawDe: yawDaCasa(alvo), escDe: escalaDaCasa(alvo), dur: 560 });
            gesto(p, 'baixar', b);
          });
          break;
        }
        case 'rapido': {
          som('rapido');
          ctx.verbo(ev.quem, 'EM CIMA!');
          if (ev.quem !== eu) ctx.cara(ev.quem, 'feliz');
          anuncia(`${Nome(ev.quem)} descartou em cima: ${rot(ev.card)}${ev.p === ev.quem ? '' : ` ${doNome(ev.p)}`}!`);
          const { p, i, card } = ev;
          pendentes.push(() => {
            const lugar = pontoDaCasa(p, i);
            vaiAoDescarte(card, lugar, yawDaCasa(p), escalaDaCasa(p));
            if (ev.quem !== eu) gesto(ev.quem, 'descartar', lugar);
          });
          break;
        }
        case 'deve':
          if (ev.de === eu) anuncia(`Acertou! Agora escolha uma carta sua para dar a ${nomeDe(ev.para)}.`);
          break;
        case 'deu': {
          const { de, j, para, i } = ev;
          destaca(para, i, 'chegou');
          ctx.verbo(de, 'DEU CARTA');
          if (para === eu) anuncia(`${Nome(de)} deu uma carta para você.`);
          pendentes.push(() => vaiParaCasa(para, i, pontoDaCasa(de, j), { yawDe: yawDaCasa(de), escDe: escalaDaCasa(de), dur: 520 }));
          break;
        }
        case 'errou':
          som('erro');
          ctx.verbo(ev.quem, 'ERROU');
          ctx.cara(ev.quem, 'bravo');
          anuncia(`${Nome(ev.quem)} errou: era ${rot(ev.card)}. Leva mais uma carta.`);
          break;
        case 'punicao':
          destaca(ev.p, ev.i, 'nova', 2600);
          pendentes.push(() => vaiParaCasa(ev.p, ev.i, ctx.topoDoMonte(), { escDe: ctx.ESCALA_TAMPO, atraso: 260, dur: 460 }));
          break;
        case 'par': {
          som('rapido');
          ctx.verbo(ev.p, 'PAR!');
          if (ev.p !== eu) ctx.cara(ev.p, 'feliz');
          anuncia(`${Nome(ev.p)} descartou um par de ${rot(ev.cards[0])}!`);
          const { p, i, j, cards } = ev;
          pendentes.push(() => {
            vaiAoDescarte(cards[0], pontoDaCasa(p, i), yawDaCasa(p), escalaDaCasa(p));
            vaiAoDescarte(cards[1], pontoDaCasa(p, j), yawDaCasa(p), escalaDaCasa(p), 130);
          });
          break;
        }
        case 'parErrado':
          som('erro');
          ctx.verbo(ev.p, 'ERROU');
          ctx.cara(ev.p, 'bravo');
          anuncia(`${Nome(ev.p)} errou o par (${rot(ev.cards[0])} e ${rot(ev.cards[1])}). Leva mais uma.`);
          break;
        case 'bazuca':
          gritaBazuca(ev.p);
          ctx.verbo(ev.p, 'BAZUCA!');
          // a rodada acaba aqui e vai para a contagem (o placar diz quem levou)
          if (ev.certo) ctx.cara(ev.p, 'feliz');
          else setTimeout(() => ctx.cara(ev.p, 'bravo'), 1200);
          break;
        case 'estourou':
          ctx.verbo(ev.p, 'ESTOUROU');
          anuncia(ev.p === eu ? 'Seu tempo acabou.' : `O tempo de ${nomeDe(ev.p)} acabou.`);
          break;
        case 'poderPerdido':
          anuncia(`${Nome(ev.p)} perdeu o poder do ${NOME_DO_PODER[ev.poder]}.`);
          break;
        case 'remexeu':
          anuncia('O monte acabou: o descarte foi embaralhado.');
          pendentes.push(() => {
            for (let k = 0; k < 3; k++) voa(ctx.materialVerso, { de: pontoDoDescarte(), para: ctx.topoDoMonte(), escDe: ctx.ESCALA_TAMPO, escPara: ctx.ESCALA_TAMPO, dur: 380, atraso: k * 90 });
          });
          break;
        case 'roundEnd':
          if (ev.vencedor) {
            ctx.cara(ev.vencedor, 'feliz');
            ctx.verbo(ev.vencedor, ev.campeao === ev.vencedor ? 'CAMPEÃO!' : ev.motivo === 'bateu' ? 'BATEU!' : 'VENCEU');
          }
          break;
        default:
          break;
      }
    },

    // O placar, na caixa da 3D (a mesma do Caçamba e do Presidente).
    desenhaPlacar(corpo, acoes) {
      const vw = v();
      const lr = vw.lastRound;
      const jogador = (id) => vw.players.find((p) => p.id === id);
      const tabela = document.createElement('table');
      tabela.innerHTML = '<tr><th>Jogador</th><th style="text-align:right">Vitórias</th></tr>';
      const linhas = () => {
        for (const p of [...vw.players].sort((a, b) => b.vitorias - a.vitorias)) {
          const venceu = vw.phase === 'gameEnd' ? vw.campeao === p.id : vw.phase === 'roundEnd' && lr?.vencedor === p.id;
          tabela.appendChild(ctx.linhaDoPlacar(p, ctx.nomeDe(p), venceu, p.vitorias));
        }
      };
      // fim da partida: quem chegou às 4 vitórias, e a mesa decide se joga de novo
      if (vw.phase === 'gameEnd') {
        const q = jogador(vw.campeao);
        if (q) corpo.appendChild(ctx.palcoDe(q));
        corpo.append(...ctx.cabecalho(q?.id === me() ? 'Você venceu a partida!' : `${q ? ctx.nomeDe(q) : '…'} venceu a partida!`,
          `Bazuca · chegou a ${vw.meta || 4} vitórias em ${vw.round + 1} rodada${vw.round ? 's' : ''}.`));
        linhas();
        corpo.appendChild(tabela);
        if (ctx.souAnfitriao()) acoes.appendChild(ctx.acaoDoPlacar('Jogar de novo', true, () => ctx.enviaAoServidor({ t: 'playAgain' })));
        else { const e = document.createElement('p'); e.className = 'espera'; e.textContent = 'Esperando o anfitrião decidir…'; corpo.appendChild(e); }
        acoes.appendChild(ctx.acaoDoPlacar('Sair da sala', false, () => {
          try { localStorage.removeItem('cacamba-session'); localStorage.removeItem('cacamba-selo'); } catch { /* modo privado */ }
          location.href = '/';
        }));
        return;
      }
      if (vw.phase === 'roundEnd' && lr) {
        const q = lr.vencedor ? jogador(lr.vencedor) : null;
        if (q) corpo.appendChild(ctx.palcoDe(q));
        const { titulo, texto } = contaDaRodada(lr, (id) => { const p = jogador(id); return p ? ctx.nomeDe(p) : '…'; }, me());
        corpo.append(...ctx.cabecalho(titulo, `Bazuca · Rodada ${vw.round + 1} · ${texto}`));
        // as cartas de cada um, enfim à vista, e a soma
        const lista = document.createElement('ul');
        lista.className = 'bz3-maos';
        for (const p of vw.players) {
          const li = document.createElement('li');
          if (lr.vencedor === p.id) li.className = 'venceu';
          const n = document.createElement('span');
          n.className = 'bz3-maos-nome';
          n.textContent = ctx.nomeDe(p);
          const cartas = document.createElement('span');
          cartas.className = 'bz3-maos-cartas';
          const deles = (lr.maos?.[p.id] || []).filter(Boolean);
          if (!deles.length) { const em = document.createElement('em'); em.textContent = 'bateu'; cartas.appendChild(em); }
          for (const c of deles) {
            const img = document.createElement('img');
            img.src = `/${arteDaCarta(c)}`;
            img.alt = rot(c);
            img.title = rot(c);
            cartas.appendChild(img);
          }
          const soma = document.createElement('span');
          soma.className = 'bz3-maos-soma';
          soma.textContent = lr.somas?.[p.id] ?? '';
          li.append(n, cartas, soma);
          lista.appendChild(li);
        }
        corpo.appendChild(lista);
        linhas();
        corpo.appendChild(tabela);
        // alguém chegou às 4: o próximo passo é o resultado final
        if (ctx.souAnfitriao()) acoes.appendChild(ctx.acaoDoPlacar(lr.campeao ? 'Ver resultado final' : 'Próxima rodada', true, () => ctx.enviaAoServidor({ t: 'nextRound' })));
        else { const e = document.createElement('p'); e.className = 'espera'; e.textContent = 'Esperando o anfitrião continuar…'; corpo.appendChild(e); }
        return;
      }
      corpo.append(...ctx.cabecalho('Placar', `Cada rodada vale uma vitória; a partida vai a ${vw.meta || 4}.`));
      linhas();
      corpo.appendChild(tabela);
    },
  };

  // o TextureLoader só põe a imagem na textura quando ela chega
  function faceBaixada(card) { return !!ctx.materialDaCarta(card).map?.image; }

  function aplicaFace(c, card) {
    c.faceAtual = card;
    c.carta.material = card ? ctx.materialDaCarta(card) : ctx.materialVerso;
  }

  return api;
}

// O que esta mesa desenha em HTML por cima do canvas. A 3D não carrega o
// style.css do jogo, então as cores vão por extenso.
const CSS = `
.bz3-lupa {
  position: fixed; left: 50%; top: 44%; transform: translate(-50%, -50%); z-index: 15;
  display: flex; gap: 14px; padding: 12px 14px; border-radius: 18px;
  background: rgba(20, 12, 7, 0.92); border: 1.5px solid rgba(242, 193, 78, 0.6);
  box-shadow: 0 24px 60px -10px #000; cursor: pointer; max-width: calc(100vw - 24px);
}
.bz3-lupa[hidden] { display: none; }
/* em pé, a lupa sobe para a faixa da sala, acima do tampo, e encolhe um pouco:
   no meio da tela ela tapava as grades de quem senta à frente */
@media (max-aspect-ratio: 1/1) {
  .bz3-lupa { top: 31%; padding: 10px 12px; gap: 10px; }
  .bz3-lupa .bz3-carta { width: 84px; height: 118px; }
}
.bz3-lupa.entra { animation: bz3Lupa 0.22s cubic-bezier(0.2, 1.3, 0.4, 1); }
@keyframes bz3Lupa { from { transform: translate(-50%, -50%) scale(0.6); opacity: 0; } }
@media (min-aspect-ratio: 1/1) {
  /* deitada, a lupa vai para a direita: o meio da tela é o meio da mesa */
  .bz3-lupa { left: auto; right: 14px; top: 50%; transform: translateY(-50%); }
  @keyframes bz3Lupa { from { transform: translateY(-50%) scale(0.6); opacity: 0; } }
}
.bz3-bloco { display: flex; flex-direction: column; align-items: center; gap: 8px; min-width: 0; }
.bz3-titulo { font-size: 0.8rem; font-weight: 900; color: #f5f1e6; text-align: center; line-height: 1.2; max-width: 132px; overflow-wrap: anywhere; }
.bz3-bloco.revelada .bz3-titulo { color: #ffb4a6; }
.bz3-carta { width: 104px; height: 146px; border-radius: 8px; display: block; box-shadow: 0 0 0 3px #f2c14e, 0 0 24px rgba(242, 193, 78, 0.5); }
.bz3-bloco.revelada .bz3-carta { box-shadow: 0 0 0 3px #e0533d, 0 0 24px rgba(224, 83, 61, 0.55); }
.bz3-mapinha { position: relative; width: 70px; height: 42px; }
.bz3-mapinha i { position: absolute; width: 9px; height: 12px; margin: -6px 0 0 -4.5px; border-radius: 2px; background: rgba(245, 241, 230, 0.35); }
.bz3-mapinha i.vazio { background: none; outline: 1px dashed rgba(245, 241, 230, 0.35); outline-offset: -1px; }
.bz3-mapinha i.aqui { background: #f2c14e; box-shadow: 0 0 6px #f2c14e; }
.bz3-bloco.revelada .bz3-mapinha i.aqui { background: #e0533d; box-shadow: 0 0 6px #e0533d; }

.bz3-grito { position: fixed; inset: 0; z-index: 30; pointer-events: none; display: grid; place-items: center; align-content: center; }
.bz3-grito[hidden] { display: none; }
.bz3-grito::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, rgba(20, 8, 4, 0.78) 0 30%, rgba(20, 8, 4, 0.35) 70%); }
.bz3-grito.entra::before { animation: bz3Some 1.6s ease-out both; }
.bz3-grito-raios {
  position: absolute; width: 140vmax; height: 140vmax; left: 50%; top: 50%; transform: translate(-50%, -50%);
  background: repeating-conic-gradient(rgba(242, 193, 78, 0.38) 0 9deg, transparent 9deg 22deg);
  -webkit-mask: radial-gradient(circle, #000 0 18%, transparent 55%); mask: radial-gradient(circle, #000 0 18%, transparent 55%);
}
.bz3-grito-texto {
  position: relative; font-family: 'Paytone One', 'Arial Black', sans-serif; font-size: clamp(3.2rem, 17vw, 7rem); line-height: 1;
  color: #ffe08a; letter-spacing: 0.02em; transform: rotate(-6deg);
  text-shadow: 0 4px 0 #b3361f, 0 8px 0 #5a160b, 0 0 40px rgba(255, 120, 40, 0.9);
}
.bz3-grito-quem { position: relative; margin-top: 10px; font-weight: 900; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.12em; color: #f5f1e6; text-shadow: 0 2px 6px #000; }
.bz3-grito.entra .bz3-grito-texto { animation: bz3Estoura 1.6s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
.bz3-grito.entra .bz3-grito-raios { animation: bz3Raios 1.6s ease-out both; }
.bz3-grito.entra .bz3-grito-quem { animation: bz3Some 1.6s ease-out both; }
@keyframes bz3Estoura {
  0% { transform: rotate(-6deg) scale(0.2); opacity: 0; } 14% { transform: rotate(-6deg) scale(1.25); opacity: 1; }
  24% { transform: rotate(-6deg) scale(1); } 80% { opacity: 1; } 100% { transform: rotate(-6deg) scale(1.08); opacity: 0; }
}
@keyframes bz3Raios { 0% { transform: translate(-50%, -50%) scale(0.3) rotate(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1.1) rotate(40deg); opacity: 0; } }
@keyframes bz3Some { 0%, 15% { opacity: 0; } 30%, 80% { opacity: 1; } 100% { opacity: 0; } }
#cena.bz3-treme { animation: bz3Treme 0.5s linear; }
@keyframes bz3Treme {
  0%, 100% { transform: none; } 15% { transform: translate(-7px, 3px); } 30% { transform: translate(6px, -4px); }
  45% { transform: translate(-5px, -2px); } 60% { transform: translate(4px, 3px); } 75% { transform: translate(-2px, 1px); }
}
@media (prefers-reduced-motion: reduce) {
  .bz3-grito.entra .bz3-grito-texto, .bz3-grito.entra .bz3-grito-raios, .bz3-grito.entra .bz3-grito-quem,
  .bz3-grito.entra::before, #cena.bz3-treme, .bz3-lupa.entra { animation: none; }
}

.placar-3d .bz3-maos { list-style: none; padding: 0; margin: 6px 0 10px; display: grid; gap: 6px; }
.placar-3d .bz3-maos li { display: grid; grid-template-columns: 76px minmax(0, 1fr) auto; align-items: center; gap: 6px; }
.placar-3d .bz3-maos li.venceu .bz3-maos-nome { color: #f5d28b; }
.placar-3d .bz3-maos-nome { font-weight: 800; font-size: 0.86rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.placar-3d .bz3-maos-cartas { display: flex; flex-wrap: wrap; gap: 3px; }
.placar-3d .bz3-maos-cartas img { width: 26px; height: 36px; border-radius: 3px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5); }
.placar-3d .bz3-maos-cartas em { color: #cad6be; font-size: 0.82rem; }
.placar-3d .bz3-maos-soma { font-family: 'Paytone One', 'Arial Black', sans-serif; font-size: 1.05rem; color: #f5d28b; }
`;
