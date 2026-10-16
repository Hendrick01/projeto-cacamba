// ============================================================================
// Puxadinho — a mesa 3D. Como o puxadinho-mesa.js da 2D, este arquivo só é
// baixado quando a sala é de Puxadinho: a 3D do Caçamba nunca paga por ele.
//
// Não monta cena nova. Mesa, elenco, rótulos, voos e o placar são os do
// mesa3d.js e chegam pelo `ctx`; o que é daqui:
//  - o BAIRRO sobre o tampo: a mesma geometria da 2D (GEO, de
//    /shared/puxadinho.js), com a avenida em volta, as revendas na avenida e
//    as 19 quadras levantadas um dedo do asfalto: o tampo de cada uma é o
//    MESMO render do Blender que a 2D usa (puxadinho-arte.js), com o material
//    de pé no alto e a placa de lote com o número e a chance;
//  - as peças nas cores de cada um: ruas nos vãos entre as quadras, casas
//    nas esquinas e prédios no lugar delas, e o cone do fiscal em cima do
//    terreno embargado (listrado de vermelho) — casa, prédio, cone e
//    materiais são os modelos do Blender (public/models/puxadinho/); os
//    dois dados;
//  - o caminho das coisas: o dado rola de quem rolou, as quadras do número
//    acendem e o material sai delas para quem tem construção em volta; a peça
//    nova sai da mão de quem construiu; o cone anda; o material do fiscal, da
//    troca e do arremate vai de um para o outro;
//  - os toques: escolher o lugar (esquina, lado, casa ou terreno marcados em
//    dourado) e confirmar no botão — dois toques no mesmo lugar também
//    confirmam, como o duplo clique da 2D;
//  - em HTML, por cima: o seu material e as suas cartas de obra no pé da
//    tela, a oferta de troca na mesa, e os painéis de construir, trocar,
//    devolver e jogar carta — os mesmos da 2D, com as mesmas fichas e textos
//    (que vêm de puxadinho-mesa.js).
//
// A câmera: num jogo de tabuleiro o tabuleiro é o jogo, então aqui ela se
// debruça sobre ele (`camera`/`mira`) — mais alta e mais inclinada que no
// Caçamba, o bastante para as quadras de lá caberem e se lerem, e não tanto
// que o elenco suma: ele continua sentado em volta, no alto da tela.
//
// O que este modo NÃO herda da mesa do Caçamba está em `recursos`. A regra
// continua em /shared/puxadinho.js: daqui só se pergunta.
// ============================================================================

import {
  GEO, RECURSOS, NOME_DO_RECURSO, PRODUZ, CUSTOS, NOME_DA_CARTA, chances, LIMITE_DA_MAO, AVENIDA_MINIMA, EQUIPE_MINIMA,
} from '/shared/puxadinho.js';
import {
  plural, zerados, soma, temTudo, listaDeMaterial, fichasDe, nomeDoLote, DESC_DA_CARTA, NOME_DA_CONSTRUCAO, LOTE, BEIRA,
} from './puxadinho-mesa.js';
// a arte é a mesma da 2D: fonte única em puxadinho-arte.js
import {
  COR_DO_TERRENO, PALETA, fichaHTML, urlDoMaterial, urlDaQuadra, LADO_DO_RENDER_DA_QUADRA, LUZ_DO_MATERIAL, POSICAO_DO_MATERIAL,
} from './puxadinho-arte.js';
import { GRADIENTE_TOON } from './modelo3d.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

// Medidas. O tabuleiro é desenhado em raios de hexágono (as unidades do GEO);
// S converte para metros. Com 17,5 cm de raio o bairro inteiro, avenida
// incluída, cabe num círculo de 93 cm — o tampo vai a 1,15 m, e a beirada
// fica para as mãos de quem senta.
const S = 0.175;
const AV = 0.95;              // a avenida, para fora das esquinas da beira
const E = 5.6;                // meia largura do desenho do tabuleiro (em raios)
const TEX = 2048;             // o desenho do tabuleiro, em pixels
const K = TEX / (2 * E);      // pixels por raio
const ALT_BASE = 0.01;        // a placa do bairro (o asfalto)
const ALT_LOTE = 0.1 * S;      // a quadra acima do asfalto (o chão da maquete tem 0,1 raio): o meio-fio
const TOPO = ALT_BASE + ALT_LOTE;  // o chão de cima da quadra
const Y_RUA = TOPO + 0.0015;  // onde moram as marcas das esquinas e dos lados (acima do meio-fio)
const OURO = 0xf2c14e;
const DUPLO_MS = 420;
const LADO_DADO = 0.034;
const Z_MAX = 2.58;           // o recuo máximo da câmera (visual3d.js limita a 2,6)
const Y_MAX = 2.12;           // a cabeça fica abaixo da cúpula da luminária (2,28 m, cenario3d.js)
const TERRENOS = Object.keys(PRODUZ);
// a quadra tem o raio do render da 2D (o chão de raio 0,86 num quadrado de 1,72)
const RAIO = LADO_DO_RENDER_DA_QUADRA / 2;

const pos = (v) => GEO.vertices[v];
const contorno = (k) => BEIRA.map((x) => { const p = pos(x); const d = Math.hypot(p.x, p.y); return [p.x * (d + k) / d, p.y * (d + k) / d]; });
function cantosDoLote(h, fator = LOTE) {
  const c = GEO.hexes[h];
  return c.vertices.map((v) => [c.x + (pos(v).x - c.x) * fator, c.y + (pos(v).y - c.y) * fator]);
}
const hexagono = (r) => Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 90); return [Math.cos(a) * r, Math.sin(a) * r]; });

export function criaPuxadinho3D(ctx) {
  const { THREE, scene, MESA_TOPO } = ctx;
  const v = () => ctx.view();
  const eu = () => ctx.me();
  const jogador = (id) => v()?.players.find((p) => p.id === id);
  const nome = (id) => (id === eu() ? 'Você' : jogador(id)?.name || '…');
  const souEu = (id) => id === eu();
  const agindo = () => v()?.turnId === eu();
  const minhaVez = () => v()?.donoId === eu();
  const agora = () => performance.now();
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.appendChild(estilo);
  // as fichas, os contadores e as opções dos painéis são os do puxadinho.css da 2D
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/puxadinho.css';
  document.head.appendChild(css);
  document.body.classList.add('px3');

  // ---- o aviso: uma fila curta ----------------------------------------------------
  // Numa vez de robô saem vários lances de uma vez (rola, constrói, troca,
  // passa): cada um fica um instante no aviso, e o texto da vez volta depois.
  const fila = [];
  let falando = null;
  function anuncia(texto, ms = 1900) {
    fila.push({ texto, ms });
    if (fila.length > 3) fila.splice(0, fila.length - 3);
    if (!falando) proximoAviso();
  }
  function proximoAviso() {
    clearTimeout(proximoAviso.t);
    falando = fila.shift() || null;
    if (falando) { ctx.aviso(falando.texto, true); proximoAviso.t = setTimeout(proximoAviso, falando.ms); return; }
    const t = textoBase();
    if (t) ctx.aviso(t, true);
  }

  // ---- texturas ----------------------------------------------------------------------

  function texturaDeCanvas(w, h, desenha) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    desenha(c.getContext('2d'), c);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function retArredondado(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // O DESENHO DO BAIRRO: um canvas só, do tamanho do tabuleiro, que forra o
  // asfalto e o tampo de cada quadra (as quadras levantadas usam o mesmo
  // desenho, pela mesma régua — ver `forma`). Só muda quando o tabuleiro muda.
  const tela = document.createElement('canvas');
  tela.width = tela.height = TEX;
  const texTab = new THREE.CanvasTexture(tela);
  texTab.colorSpace = THREE.SRGBColorSpace;
  // vista de lado, a textura sem anisotropia vira um borrão já na segunda fileira
  texTab.anisotropy = ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
  // a régua: a forma vai em metros (x, −y) e a textura cobre de −E a E raios
  texTab.repeat.set(1 / (2 * E * S), 1 / (2 * E * S));
  texTab.offset.set(0.5, 0.5);
  const X = (u) => (u + E) * K;

  // A ARTE: o tampo de cada quadra é o MESMO render da 2D (o chão da maquete
  // do Blender visto de cima, puxadinho-arte.js), com o clarão do material por
  // cima — as duas mesas mostram a mesma quadra. Nas revendas, o material
  // renderizado das fichas.
  const imagens = new Map();
  function carregaImagem(chave, src) {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => { imagens.set(chave, img); ok(); };
      img.onerror = () => ok();
      img.src = src;
    });
  }
  const svg = (corpo) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-RAIO} ${-RAIO} ${2 * RAIO} ${2 * RAIO}" width="512" height="512">${corpo}</svg>`)}`;
  const arteCarregada = Promise.all([
    ...TERRENOS.map((t) => carregaImagem(`q:${t}`, urlDaQuadra(t))),
    ...RECURSOS.map((r) => carregaImagem(`m:${r}`, urlDoMaterial(r))),
    carregaImagem('m:prefeitura', urlDoMaterial('prefeitura')),
    carregaImagem('luz:1', svg(LUZ_DO_MATERIAL(true))),
    carregaImagem('luz:0', svg(LUZ_DO_MATERIAL(false))),
  ]);
  // O ladrilho de cada terreno: render + clarão; na Prefeitura (que não tem
  // material para ficar de pé), também o prédio e o nome, como na 2D.
  const ladrilhos = new Map();
  function montaLadrilhos() {
    for (const t of TERRENOS) {
      const chao = imagens.get(`q:${t}`);
      if (!chao || ladrilhos.has(t)) continue;
      const comNumero = t !== 'prefeitura';
      const tx = texturaDeCanvas(512, 512, (g) => {
        const L = (u) => ((u + RAIO) / (2 * RAIO)) * 512;
        g.drawImage(chao, 0, 0, 512, 512);
        const luz = imagens.get(`luz:${comNumero ? 1 : 0}`);
        if (luz) g.drawImage(luz, 0, 0, 512, 512);
        if (!comNumero) {
          const pm = POSICAO_DO_MATERIAL.semNumero;
          const pref = imagens.get('m:prefeitura');
          if (pref) g.drawImage(pref, L(pm.x), L(pm.y), (pm.tam / (2 * RAIO)) * 512, (pm.tam / (2 * RAIO)) * 512);
          g.fillStyle = '#eef5ee'; g.font = `900 ${(0.2 / (2 * RAIO)) * 512}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 6;
          g.fillText('Prefeitura', L(0), L(0.36));
        }
      });
      tx.anisotropy = ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
      ladrilhos.set(t, tx);
    }
  }

  let chaveDoDesenho = '';
  function desenhaBairro() {
    const vw = v();
    const g = tela.getContext('2d');
    g.clearRect(0, 0, TEX, TEX);
    const poligono = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), X(y)) : g.moveTo(X(x), X(y)))); g.closePath(); };
    g.lineJoin = 'round';
    // a avenida, a faixa amarela e o chão entre as quadras (o calçamento)
    poligono(contorno(AV)); g.fillStyle = '#2b2c2e'; g.fill(); g.strokeStyle = '#1a1b1c'; g.lineWidth = 0.06 * K; g.stroke();
    poligono(contorno(0.55)); g.save(); g.setLineDash([0.22 * K, 0.18 * K]); g.strokeStyle = 'rgba(232,199,102,0.6)'; g.lineWidth = 0.05 * K; g.stroke(); g.restore();
    poligono(contorno(0.16)); g.fillStyle = '#4a463f'; g.fill(); g.strokeStyle = '#8c8577'; g.lineWidth = 0.07 * K; g.stroke();
    // o eixo de cada rua, bem de leve: é onde as peças de rua assentam
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 0.03 * K;
    for (const a of GEO.arestas) { const [p, q] = a.v.map(pos); g.beginPath(); g.moveTo(X(p.x), X(p.y)); g.lineTo(X(q.x), X(q.y)); g.stroke(); }

    // as revendas, na avenida, ligadas às duas esquinas delas
    for (const rev of vw?.revendas || []) {
      const [a, b] = GEO.arestas[rev.e].v;
      const h = GEO.arestas[rev.e].hexes[0];
      const mx = (pos(a).x + pos(b).x) / 2, my = (pos(a).y + pos(b).y) / 2;
      const d = Math.hypot(mx - GEO.hexes[h].x, my - GEO.hexes[h].y);
      const tx = mx + ((mx - GEO.hexes[h].x) / d) * 0.78, ty = my + ((my - GEO.hexes[h].y) / d) * 0.78;
      g.strokeStyle = 'rgba(217,207,184,0.6)'; g.lineWidth = 0.05 * K;
      for (const x of [a, b]) { g.beginPath(); g.moveTo(X(pos(x).x), X(pos(x).y)); g.lineTo(X(tx), X(ty)); g.stroke(); }
      retArredondado(g, X(tx - 0.46), X(ty - 0.23), 0.92 * K, 0.46 * K, 0.1 * K);
      g.fillStyle = rev.tipo === 'geral' ? '#e8dcc0' : '#f5f1e6'; g.fill();
      g.strokeStyle = '#1a1b1c'; g.lineWidth = 0.04 * K; g.stroke();
      g.fillStyle = '#232a33'; g.font = `900 ${0.26 * K}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (rev.tipo === 'geral') g.fillText('3:1', X(tx), X(ty + 0.01));
      else {
        g.fillText('2:1', X(tx - 0.15), X(ty + 0.01));
        const img = imagens.get(`m:${rev.tipo}`);
        if (img) g.drawImage(img, X(tx + 0.02), X(ty - 0.2), 0.4 * K, 0.4 * K);
      }
    }

    texTab.needsUpdate = true;
  }
  // a arte pode chegar depois do primeiro desenho
  arteCarregada.then(() => { montaLadrilhos(); if (chaveDoDesenho) { desenhaBairro(); chaveDasQuadras = ''; montaQuadras(); } }).catch(() => {});

  // ---- o tabuleiro em 3D ---------------------------------------------------------------

  const tab = new THREE.Group();
  tab.position.set(0, MESA_TOPO, 0);
  tab.visible = false;
  scene.add(tab);
  // a forma em metros, no plano da placa: (x, −y), que vira (x, z) deitada
  const forma = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x * S, -y * S) : s.moveTo(x * S, -y * S))); s.closePath(); return s; };
  const local = (x, y, alt = 0) => new THREE.Vector3(x * S, alt, y * S);
  const noMundo = (p) => tab.localToWorld(p.clone());

  const mTampo = new THREE.MeshStandardMaterial({ map: texTab, roughness: 0.92, metalness: 0 });
  const mBordaTab = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.8, metalness: 0 });
  {
    const base = new THREE.Mesh(new THREE.ExtrudeGeometry(forma(contorno(AV)), { depth: ALT_BASE, bevelEnabled: false }), [mTampo, mBordaTab]);
    base.rotation.x = -Math.PI / 2;
    base.receiveShadow = true;
    tab.add(base);
  }
  // as quadras: o mesmo desenho por cima, o meio-fio de concreto nos lados
  const mMeioFio = new THREE.MeshStandardMaterial({ color: 0xc9c2b2, roughness: 0.9, metalness: 0 });
  const lotes = GEO.hexes.map((c, h) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.9, metalness: 0, emissive: OURO, emissiveIntensity: 0 });
    const geo = new THREE.ExtrudeGeometry(forma(cantosDoLote(h, RAIO)), { depth: ALT_LOTE, bevelEnabled: false });
    // o tampo usa o ladrilho do terreno inteiro (um por terreno, dividido
    // pelas quadras dele): as coordenadas de textura vão para o quadrado da quadra
    {
      const pa = geo.attributes.position, uv = geo.attributes.uv;
      for (const gr of geo.groups) {
        if (gr.materialIndex !== 0) continue;
        for (let i = gr.start; i < gr.start + gr.count; i++) {
          const x = pa.getX(i) / S, y = -pa.getY(i) / S;
          uv.setXY(i, (x - c.x + RAIO) / (2 * RAIO), (c.y + RAIO - y) / (2 * RAIO));
        }
      }
      uv.needsUpdate = true;
    }
    const mesh = new THREE.Mesh(geo, [mat, mMeioFio]);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = ALT_BASE;
    mesh.receiveShadow = true;
    mesh.userData.lote = h;
    tab.add(mesh);
    mat.userData.base = mat.color.clone();
    return { mesh, mat, mats: [mat], centro: local(c.x, c.y, TOPO) };
  });

  // O embargo: listras vermelhas por cima da quadra do fiscal.
  const texListras = texturaDeCanvas(64, 64, (g) => {
    g.strokeStyle = 'rgba(226,64,46,0.55)'; g.lineWidth = 14;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * 64 - 8, 72); g.lineTo(k * 64 + 72, -8); g.stroke(); }
  });
  texListras.wrapS = texListras.wrapT = THREE.RepeatWrapping;
  texListras.repeat.set(1 / (0.34 * S), 1 / (0.34 * S));
  const listras = new THREE.Mesh(new THREE.ShapeGeometry(forma(hexagono(RAIO * 0.99))), new THREE.MeshBasicMaterial({ map: texListras, transparent: true, depthWrite: false }));
  listras.rotation.x = -Math.PI / 2;
  listras.renderOrder = 3;
  tab.add(listras);

  // ---- as peças -------------------------------------------------------------------------

  const geoCaixa = new THREE.BoxGeometry(1, 1, 1);
  // o telhado: um triângulo de frente para quem olha (a casa de desenho de criança)
  const geoTelhado = (() => {
    const s = new THREE.Shape(); s.moveTo(-0.5, 0); s.lineTo(0.5, 0); s.lineTo(0, 1); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    return g;
  })();
  const geoCaixaDagua = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
  const mContorno = new THREE.MeshBasicMaterial({ color: 0x2a1b12, side: THREE.BackSide });
  const mPorta = new THREE.MeshToonMaterial({ color: 0x3a2618, gradientMap: GRADIENTE_TOON });
  const mConcreto = new THREE.MeshToonMaterial({ color: 0xd9d4c7, gradientMap: GRADIENTE_TOON });
  const mFantasma = new THREE.MeshBasicMaterial({ color: 0xfff6e2, transparent: true, opacity: 0.5, depthWrite: false });
  const toon = (cor, extra = {}) => new THREE.MeshToonMaterial({ color: cor, gradientMap: GRADIENTE_TOON, ...extra });

  // as janelas do prédio: a parede na cor do dono, as janelas acesas
  function texPredio(cor) {
    const t = texturaDeCanvas(64, 96, (g) => {
      g.fillStyle = cor; g.fillRect(0, 0, 64, 96);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 30, 64, 3); g.fillRect(0, 62, 64, 3);
      g.fillStyle = '#fff6d8';
      for (const y of [8, 40, 72]) for (const x of [10, 38]) g.fillRect(x, y, 16, 14);
    });
    return t;
  }
  const materiais = new Map();
  function matsDe(id) {
    const cor = ctx.corDe(id);
    let m = materiais.get(cor);
    if (m) return m;
    const c = new THREE.Color(cor);
    const lado = toon(0xffffff, { map: texPredio(cor) });
    const topo = toon(c.clone().multiplyScalar(0.72));
    m = { parede: toon(c), telhado: toon(c.clone().multiplyScalar(0.6)), predio: [lado, lado, topo, topo, lado, lado], rua: toon(c) };
    materiais.set(cor, m);
    return m;
  }
  // o contorno do elenco, em miniatura: a casca virada do avesso, com a
  // mesma espessura em toda peça (proporcional, a rua fina sumia)
  function comContorno(malha, t = 0.0022) {
    const casca = new THREE.Mesh(malha.geometry, mContorno);
    casca.position.copy(malha.position);
    casca.rotation.copy(malha.rotation);
    casca.scale.set(malha.scale.x + 2 * t, malha.scale.y + 2 * t, malha.scale.z + 2 * t);
    return [casca, malha];
  }
  const sombrear = (g) => { g.traverse((o) => { if (o.isMesh && o.material !== mContorno && o.material !== mFantasma) { o.castShadow = true; } }); return g; };

  function criaCasa(id, fantasma = false) {
    if (modelos.casa) return pecaDoModelo('casa', id, fantasma);
    const m = matsDe(id);
    const g = new THREE.Group();
    const W = 0.044, H = 0.026, D = 0.04, RH = 0.024;
    const parede = new THREE.Mesh(geoCaixa, fantasma ? mFantasma : m.parede);
    parede.scale.set(W, H, D); parede.position.y = H / 2;
    const telhado = new THREE.Mesh(geoTelhado, fantasma ? mFantasma : m.telhado);
    telhado.scale.set(W * 1.2, RH, D * 1.14); telhado.position.y = H;
    if (fantasma) { g.add(parede, telhado); return g; }
    const porta = new THREE.Mesh(geoCaixa, mPorta);
    porta.scale.set(W * 0.28, H * 0.62, 0.002); porta.position.set(0, H * 0.31, D / 2 + 0.0008);
    const [cp, pp] = comContorno(parede);
    const [ct, tt] = comContorno(telhado);
    ct.position.y -= 0.0018;
    g.add(cp, ct, pp, tt, porta);
    return sombrear(g);
  }
  function criaPredio(id, fantasma = false) {
    if (modelos.predio) return pecaDoModelo('predio', id, fantasma);
    const m = matsDe(id);
    const g = new THREE.Group();
    const W = 0.05, H = 0.082, D = 0.05;
    const corpo = new THREE.Mesh(geoCaixa, fantasma ? mFantasma : m.predio);
    corpo.scale.set(W, H, D); corpo.position.y = H / 2;
    if (fantasma) { g.add(corpo); return g; }
    // a caixa d'água no telhado: é o que faz o bloco ler como prédio de bairro
    const caixa = new THREE.Mesh(geoCaixaDagua, mConcreto);
    caixa.scale.set(0.018, 0.012, 0.018); caixa.position.set(W * 0.18, H + 0.006, -D * 0.15);
    g.add(...comContorno(corpo), ...comContorno(caixa, 0.0015));
    return sombrear(g);
  }
  // A rua: a peça no vão entre as quadras, um tico mais alta que o meio-fio.
  function criaRua(id, e, fantasma = false) {
    const m = matsDe(id);
    const [a, b] = GEO.arestas[e].v.map(pos);
    const g = new THREE.Group();
    g.position.copy(local((a.x + b.x) / 2, (a.y + b.y) / 2, ALT_BASE));
    g.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    // mais alta que o meio-fio: no vão entre as maquetes, rasa, ela sumia
    // atrás da quadra da frente
    const L = 0.6 * S, W = 0.15 * S, H = ALT_LOTE + 0.004;
    const peca = new THREE.Mesh(geoCaixa, fantasma ? mFantasma : m.rua);
    peca.scale.set(L, H, W); peca.position.y = H / 2;
    if (fantasma) { g.add(peca); return g; }
    g.add(...comContorno(peca, 0.0018));
    return sombrear(g);
  }

  // O fiscal: o cone de obra embargada.
  const cone = (() => {
    const g = new THREE.Group();
    const tex = texturaDeCanvas(4, 64, (c) => {
      c.fillStyle = '#f07c1f'; c.fillRect(0, 0, 4, 64);
      c.fillStyle = '#fff6e6'; c.fillRect(0, 14, 4, 9); c.fillRect(0, 33, 4, 9);
    });
    const corpo = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.07, 22), toon(0xffffff, { map: tex }));
    corpo.position.y = 0.006 + 0.035;
    const base = new THREE.Mesh(geoCaixa, toon(0x2a2622));
    base.scale.set(0.046, 0.006, 0.046); base.position.y = 0.003;
    g.add(...comContorno(corpo, 0.0018), ...comContorno(base, 0.0015));
    return sombrear(g);
  })();
  tab.add(cone);
  // o cone fica no fundo da quadra, sobre o ícone: a placa do número, na
  // frente, continua à vista (é ela que diz o que o embargo travou)
  const lugarDoCone = (h) => local(GEO.hexes[h].x + 0.36, GEO.hexes[h].y - 0.42, ALT_BASE + ALT_LOTE);

  // Os dados: o 1 em cima, o 6 embaixo, o 2 de frente — e a volta que põe
  // cada face em cima.
  const PONTOS_DO_DADO = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  const faceDoDado = (n) => texturaDeCanvas(128, 128, (g) => {
    g.fillStyle = '#c9bfa8'; g.fillRect(0, 0, 128, 128);
    retArredondado(g, 4, 4, 120, 120, 22); g.fillStyle = '#f5f1e6'; g.fill();
    g.fillStyle = '#232a33';
    for (const [x, y] of PONTOS_DO_DADO[n]) { g.beginPath(); g.arc(64 + x * 30, 64 + y * 30, 11, 0, Math.PI * 2); g.fill(); }
  });
  const matsDoDado = [3, 4, 1, 6, 2, 5].map((n) => new THREE.MeshStandardMaterial({ map: faceDoDado(n), roughness: 0.45, metalness: 0 }));
  const geoDado = new THREE.BoxGeometry(LADO_DADO, LADO_DADO, LADO_DADO);
  const VIRA = {
    1: new THREE.Euler(0, 0, 0), 6: new THREE.Euler(Math.PI, 0, 0), 2: new THREE.Euler(-Math.PI / 2, 0, 0),
    5: new THREE.Euler(Math.PI / 2, 0, 0), 3: new THREE.Euler(0, 0, Math.PI / 2), 4: new THREE.Euler(0, 0, -Math.PI / 2),
  };
  function orientacao(n, giro) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), giro);
    return q.multiply(new THREE.Quaternion().setFromEuler(VIRA[n]));
  }
  const dados = [0, 1].map((i) => {
    const m = new THREE.Mesh(geoDado, matsDoDado);
    m.castShadow = true;
    m.visible = false;
    m.userData.giro = 0.3 + i * 0.5;
    tab.add(m);
    return m;
  });
  // onde os dados param: no tampo, fora do bairro — deitada, à sua direita;
  // em pé (a tela é estreita), na beirada à sua frente, entre o bairro e os botões
  const lugarDosDados = (i) => {
    const emPe = ctx.camera.aspect < 1;
    const [x, z] = emPe ? [0.04, 1.0] : [0.84, 0.5];
    return new THREE.Vector3(x + i * 0.05, LADO_DADO / 2, z + (emPe ? -i * 0.012 : i * 0.01));
  };
  let rolagem = null;   // { t0, dur, de: [Vector3], qDe: [Quaternion], para: [...], qPara: [...] }

  // As fichas de material que andam pela mesa: um tijolinho na cor dele.
  const geoFicha = new THREE.BoxGeometry(0.024, 0.012, 0.017);
  const matsDaFicha = Object.fromEntries(RECURSOS.map((r) => [r, toon(PALETA[r].base)]));
  const mFichaOculta = toon(0x8c6a45);

  // ---- os modelos do Blender (public/models/puxadinho/) ----------------------------------
  // Feitos por scripts/puxadinho_blender.py, na régua da GEO (1 = raio do
  // hexágono, pé em y=0, ponta do hexágono para −Z). As quadras são maquetes
  // (o chão é um prisma de 0,1 com o topo em y=0, e o cenário nas laterais);
  // casa e prédio trazem o material "jogador", que vira a cor de cada um; os
  // materiais vêm em escala própria e são encaixados no tamanho que pedirem.
  // Os materiais deles são só cor: aqui viram o mesmo toon do elenco. Até
  // chegarem (ou se faltar algum), valem as peças desenhadas aqui.
  // (as maquetes das quadras, quadra-*.glb, ficam de fora: o tampo é o render
  // delas, o mesmo da 2D — em toon, de lado, a maquete saía outra quadra)
  const NOMES_DOS_MODELOS = ['casa', 'predio', 'cone', ...RECURSOS.map((r) => `material-${r}`)];
  const modelos = {};
  const toonDoModelo = new Map();
  // A cor de reserva, quando o GLB chega BRANCO puro: a cor que no Blender vem
  // de um nó não passa para o glTF (avisado à sessão do Blender, 15/10/2026).
  // Com a cor de volta no arquivo, vale a dele.
  function corDeReserva(nome, material) {
    const r = nome.startsWith('material-') ? nome.replace('material-', '') : null;
    if (r && material === 'cabo') return PALETA.areia.cabo;
    if (r && PALETA[r]) return PALETA[r].base;
    return null;
  }
  function preparaModelo(raiz, nome) {
    raiz.traverse((o) => {
      if (!o.isMesh) return;
      let t = toonDoModelo.get(o.material);
      if (!t) {
        const branco = o.material.color.getHex() === 0xffffff && !o.material.map;
        const reserva = branco ? corDeReserva(nome, o.material.name) : null;
        t = toon(reserva ? new THREE.Color(reserva) : o.material.color, { map: o.material.map || null, name: o.material.name });
        t.userData.base = t.color.clone();
        toonDoModelo.set(o.material, t);
      }
      o.material = t;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return raiz;
  }
  const modelosProntos = (() => {
    const carregador = new GLTFLoader();
    return Promise.all(NOMES_DOS_MODELOS.map((n) => carregador.loadAsync(`/models/puxadinho/${n}.glb`)
      .then((g) => { modelos[n] = preparaModelo(g.scene, n); })
      .catch((e) => console.warn(`Puxadinho 3D: sem o modelo ${n}`, e))));
  })();

  // Um objeto no tamanho pedido: o maior lado da planta vira `tam` (a altura
  // não passa de 1,1 × tam), centrado em x/z e com o pé em y=0.
  function encaixa(obj, tam) {
    obj.updateMatrixWorld(true);
    const caixa = new THREE.Box3().setFromObject(obj);
    const t = caixa.getSize(new THREE.Vector3());
    const k = Math.min(tam / Math.max(t.x, t.z, 1e-6), (tam * 1.1) / Math.max(t.y, 1e-6));
    const c = caixa.getCenter(new THREE.Vector3());
    obj.scale.multiplyScalar(k);
    obj.position.set(-c.x * k, -caixa.min.y * k, -c.z * k);
    const g = new THREE.Group();
    g.userData.k = k;
    g.add(obj);
    return g;
  }
  // o contorno numa malha do modelo: a casca, inflada em volta do meio dela
  // (o pé das peças do Blender fica fora do meio da geometria)
  const _t = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3();
  function contornaMalha(o, t) {
    o.geometry.computeBoundingBox();
    o.geometry.boundingBox.getSize(_t);
    o.geometry.boundingBox.getCenter(_c);
    _f.set(1 + (2 * t) / Math.max(_t.x, 1e-3), 1 + (2 * t) / Math.max(_t.y, 1e-3), 1 + (2 * t) / Math.max(_t.z, 1e-3));
    const casca = new THREE.Mesh(o.geometry, mContorno);
    casca.quaternion.copy(o.quaternion);
    casca.scale.copy(o.scale).multiply(_f);
    casca.position.copy(o.position).add(_c.clone().multiply(o.scale).multiply(new THREE.Vector3(1, 1, 1).sub(_f)).applyQuaternion(o.quaternion));
    o.parent.add(casca);
  }
  const SEM_CONTORNO = new Set(['detalhe', 'faixa-branca']);
  const matsDoJogador = new Map();
  function matDoJogador(id) {
    const cor = ctx.corDe(id);
    let m = matsDoJogador.get(cor);
    if (!m) { m = toon(cor); matsDoJogador.set(cor, m); }
    return m;
  }
  function pecaDoModelo(nome, id, fantasma = false) {
    const g = modelos[nome].clone(true);
    g.scale.setScalar(S);
    const malhas = [];
    g.traverse((o) => { if (o.isMesh) malhas.push(o); });
    for (const o of malhas) {
      if (fantasma) { o.material = mFantasma; o.castShadow = false; continue; }
      const nomeDoMaterial = o.material.name;
      if (nomeDoMaterial === 'jogador') o.material = matDoJogador(id);
      if (!SEM_CONTORNO.has(nomeDoMaterial)) contornaMalha(o, 0.0022 / S);
    }
    const raiz = new THREE.Group();
    raiz.add(g);
    return raiz;
  }

  // A placa de lote sobre a maquete: o número e a chance em barrinhas (a
  // mesma do desenho do bairro), um pouco acima do chão da quadra.
  const materiaisDaPlaca = new Map();
  function materialDaPlaca(n) {
    let m = materiaisDaPlaca.get(n);
    if (m) return m;
    const quente = n === 6 || n === 8;
    const t = texturaDeCanvas(256, 196, (g) => {
      retArredondado(g, 6, 6, 244, 184, 34);
      g.fillStyle = quente ? '#f2c14e' : '#f5f1e6'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9; g.stroke();
      g.fillStyle = quente ? '#5a1d0e' : '#232a33';
      g.font = '400 118px "Paytone One", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), 128, 82);
      const k = chances(n);
      for (let i = 0; i < k; i++) { retArredondado(g, 128 - (k * 34) / 2 + i * 34 + 6, 148, 22, 22, 6); g.fill(); }
    });
    t.anisotropy = ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
    m = new THREE.MeshBasicMaterial({ map: t, transparent: true, color: 0xf2eee4 });
    materiaisDaPlaca.set(n, m);
    return m;
  }
  const geoPlaca = new THREE.PlaneGeometry(0.84 * S, 0.64 * S).rotateX(-Math.PI / 2);

  // Cada quadra: o ladrilho do terreno no tampo, o material de pé no alto
  // (o modelo do Blender, com contorno como no render) e a placa do número.
  const quadras = [];
  let chaveDasQuadras = '';
  function montaQuadras() {
    const vw = v();
    if (!vw?.tabuleiro?.length) return;
    const chave = `${JSON.stringify(vw.tabuleiro)}|${Object.keys(modelos).length}|${ladrilhos.size}|${materiaisDaPlaca.size ? 1 : 0}`;
    if (chave === chaveDasQuadras) return;
    chaveDasQuadras = chave;
    for (const q of quadras) if (q) tab.remove(q);
    quadras.length = 0;
    vw.tabuleiro.forEach((casa, h) => {
      const l = lotes[h];
      const lad = ladrilhos.get(casa.t) || null;
      l.mat.map = lad;
      l.mat.userData.base.set(lad ? 0xffffff : COR_DO_TERRENO[casa.t]);
      l.mat.color.copy(l.mat.userData.base);
      l.mat.needsUpdate = true;
      const g = new THREE.Group();
      g.position.copy(local(GEO.hexes[h].x, GEO.hexes[h].y, TOPO));
      const r = PRODUZ[casa.t];
      if (r && modelos[`material-${r}`]) {
        const p = POSICAO_DO_MATERIAL.comNumero;
        const mat = encaixa(modelos[`material-${r}`].clone(true), p.tam * 0.8 * S);
        const malhas = [];
        mat.traverse((o) => { if (o.isMesh) malhas.push(o); });
        for (const o of malhas) contornaMalha(o, 0.0016 / mat.userData.k);
        mat.position.set((p.x + p.tam / 2) * S, 0.0006, (p.y + p.tam / 2) * S);
        g.add(mat);
      }
      if (casa.n) {
        const placa = new THREE.Mesh(geoPlaca, materialDaPlaca(casa.n));
        placa.position.set(0, 0.0012, 0.22 * S);
        placa.renderOrder = 2;
        g.add(placa);
      }
      tab.add(g);
      quadras[h] = g;
    });
  }
  function tingeLote(l, k) { for (const m of l.mats) m.color.copy(m.userData.base).multiplyScalar(k); }

  // chegaram: as quadras, o cone e as peças passam a ser os modelos
  modelosProntos.then(() => document.fonts?.load?.('400 118px "Paytone One"').catch(() => {})).then(() => {
    materiaisDaPlaca.clear();
    if (modelos.cone) { cone.clear(); cone.add(pecaDoModelo('cone', null)); }
    if (!v()) return;
    chaveDasQuadras = '';
    montaQuadras();
    for (const p of pecas.values()) tab.remove(p.obj);
    pecas.clear();
    arrumaPecas();
    arrumaMarcas();
    tingeLote(lotes[v().fiscal], 0.7);
  });

  // ---- os voos ------------------------------------------------------------------------
  // Tudo aqui anda no espaço do tabuleiro (que só está deslocado, sem giro).
  const voos = [];
  function voa(obj, de, para, { dur = 520, atraso = 0, arco = 0.1, giro = 0, esc = null, aoFim = null } = {}) {
    if (ctx.semMovimento) { obj.position.copy(para); aoFim?.(); return; }
    obj.position.copy(de);
    obj.visible = atraso <= 0;
    voos.push({ obj, de: de.clone(), para: para.clone(), t0: agora() + atraso, dur, arco, giro, esc, aoFim, r0: obj.rotation.y });
  }
  function animaVoos(t) {
    for (let k = voos.length - 1; k >= 0; k--) {
      const o = voos[k];
      const e0 = (t - o.t0) / o.dur;
      if (e0 < 0) continue;
      o.obj.visible = true;
      const e = Math.min(1, e0);
      const s = 1 - Math.pow(1 - e, 3);
      o.obj.position.lerpVectors(o.de, o.para, s);
      o.obj.position.y += Math.sin(s * Math.PI) * o.arco;
      if (o.giro) o.obj.rotation.y = o.r0 + o.giro * s;
      if (o.esc) o.obj.scale.setScalar(o.esc[0] + (o.esc[1] - o.esc[0]) * s);
      if (e >= 1) { voos.splice(k, 1); o.aoFim?.(); }
    }
  }
  function limpaVoos() { for (const o of voos) o.aoFim?.(); voos.length = 0; }

  // De onde e para onde vai o que é de cada um: o leque de quem senta à
  // mesa; o seu é o pé da tela (o painel do material), perto da câmera.
  function pontoDe(id, recurso = null) {
    if (souEu(id)) {
      const cam = ctx.camera;
      let ndc = new THREE.Vector2(0, -0.82);
      const el = recurso && painel.querySelector(`[data-r="${recurso}"]`);
      const r = (el || painel).getBoundingClientRect();
      if (r.width) ndc = new THREE.Vector2(((r.left + r.width / 2) / innerWidth) * 2 - 1, -(((r.top + r.height / 2) / innerHeight) * 2 - 1));
      const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam);
      const dir = p.sub(cam.position).normalize();
      return tab.worldToLocal(cam.position.clone().addScaledVector(dir, 0.55));
    }
    const a = ctx.assentos.get(id);
    if (!a) return local(0, 0, 0.1);
    return tab.worldToLocal(ctx.lequeDe(a));
  }
  // um tijolinho de material (o dos outros, quando não se sabe qual, vai marrom)
  function mandaFicha(recurso, de, para, { atraso = 0, dur = 620, arco = 0.12, paraMim = false } = {}) {
    if (ctx.semMovimento) return;
    const molde = recurso && modelos[`material-${recurso}`];
    const m = molde ? encaixa(molde.clone(true), 0.034) : new THREE.Mesh(geoFicha, recurso ? matsDaFicha[recurso] : mFichaOculta);
    m.rotation.y = Math.random() * Math.PI;
    tab.add(m);
    voa(m, de, para, { dur, atraso, arco, giro: 2.4, esc: paraMim ? [1, 0.45] : null, aoFim: () => tab.remove(m) });
  }
  // uma carta de obra virada, do meio do bairro para quem comprou
  function mandaCarta(id) {
    if (ctx.semMovimento) return;
    const m = new THREE.Mesh(ctx.geoCarta, ctx.materialVerso);
    m.scale.setScalar(0.2);
    m.rotation.x = -Math.PI / 2 + 0.3;
    tab.add(m);
    voa(m, local(0, 0, 0.06), pontoDe(id), { dur: 640, arco: 0.16, giro: 1.2, esc: souEu(id) ? [1, 0.5] : null, aoFim: () => tab.remove(m) });
  }

  // ---- o estado da mesa ------------------------------------------------------------------

  const pecas = new Map();       // 'r12' | 'v30' → { obj, dono, tipo }
  const chegadas = new Map();    // chave da peça → quem construiu (para a peça sair da mão dele)
  const pendentes = [];          // o que os eventos deixam para depois da sincronia
  let fiscalNaMesa = null;       // o terreno onde o cone está desenhado
  let conePara = null;           // o cone andando
  let brilho = null;             // { lotes: Set, ate } — as quadras do número que saiu
  let dadosDaMesa = null;        // os valores desenhados nos dados
  let ganhoRecente = null;       // { rec, ate } — o +n nas fichas depois dos dados
  let ultimoRoubo = 0;
  let modoEscolhido = null;      // o que veio do botão Construir
  let escolhido = null;          // índice do lugar escolhido
  let ultimoToque = null;
  let fantasma = null;           // a peça translúcida no lugar escolhido
  const casaDaColocacao = new Map();   // quem → a esquina da casa que acabou de pôr

  function modoAtual() {
    const vw = v();
    if (!vw || !agindo()) return null;
    if (vw.phase === 'colocacao') return vw.colocacao?.falta || null;
    if (vw.phase === 'fiscal') return 'fiscal';
    if (vw.phase === 'mutirao') return 'rua';
    if (vw.phase === 'acoes') return modoEscolhido;
    return null;
  }
  function alvos() {
    const vw = v();
    const m = modoAtual();
    if (!m) return [];
    if (m === 'fiscal') return vw.destinosDoFiscal || [];
    return vw.you?.legais?.[m] || [];
  }

  function arrumaPecas() {
    const vw = v();
    const quero = new Map();
    for (const [e, id] of Object.entries(vw.ruas || {})) quero.set(`r${e}`, { tipo: 'rua', dono: id, i: Number(e) });
    for (const [vert, c] of Object.entries(vw.construcoes || {})) quero.set(`v${vert}`, { tipo: c.tipo, dono: c.p, i: Number(vert) });
    for (const [k, p] of pecas) {
      const q = quero.get(k);
      if (!q || q.tipo !== p.tipo || q.dono !== p.dono) { tab.remove(p.obj); pecas.delete(k); }
    }
    for (const [k, q] of quero) {
      if (pecas.has(k)) continue;
      const obj = q.tipo === 'rua' ? criaRua(q.dono, q.i) : q.tipo === 'casa' ? criaCasa(q.dono) : criaPredio(q.dono);
      if (q.tipo !== 'rua') {
        obj.position.copy(local(pos(q.i).x, pos(q.i).y, ALT_BASE));
        // a fachada vira para você; as dos outros, de leve, para a cadeira de cada um
        obj.rotation.y = 0;
      }
      tab.add(obj);
      pecas.set(k, { obj, dono: q.dono, tipo: q.tipo });
      // a peça nova sai da mão de quem construiu e cai no lugar
      const quem = chegadas.get(k);
      if (quem && !ctx.semMovimento) {
        const para = obj.position.clone();
        const a = souEu(quem) ? null : ctx.assentos.get(quem);
        let atraso = 0;
        if (a?.assento?.modelo && ctx.temGesto(a)) { ctx.gestoCarta(a.assento.modelo, 'descartar', noMundo(para)); atraso = 380; }
        const de = souEu(quem) ? para.clone().add(new THREE.Vector3(0, 0.16, 0.05)) : pontoDe(quem);
        voa(obj, de, para, { dur: souEu(quem) ? 360 : 640, atraso, arco: souEu(quem) ? 0.02 : 0.14, esc: [0.5, 1] });
      }
    }
    chegadas.clear();
  }

  // ---- as marcas dos lugares tocáveis ------------------------------------------------------
  const mAlvo = new THREE.MeshBasicMaterial({ color: OURO, transparent: true, opacity: 0.9, depthWrite: false });
  const mAlvoSel = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
  const geoAnel = new THREE.RingGeometry(0.013, 0.022, 28).rotateX(-Math.PI / 2);
  const geoDisco = new THREE.CircleGeometry(0.022, 28).rotateX(-Math.PI / 2);
  const geoAnelPredio = new THREE.RingGeometry(0.034, 0.044, 32).rotateX(-Math.PI / 2);
  const geoTraco = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const geoAroLote = (() => {
    // por dentro da quadra, sobre a cor dela: em cima do meio-fio claro o
    // dourado sumia
    const s = forma(hexagono(LOTE * 0.96));
    const furo = new THREE.Path();
    hexagono(LOTE * 0.78).forEach(([x, y], i) => (i ? furo.lineTo(x * S, -y * S) : furo.moveTo(x * S, -y * S)));
    furo.closePath();
    s.holes.push(furo);
    return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  })();
  const marcas = new Map();   // 'casa:12' → mesh
  function marca(chave, geo, material) {
    let m = marcas.get(chave);
    if (!m) { m = new THREE.Mesh(geo, material); m.renderOrder = 6; tab.add(m); marcas.set(chave, m); }
    m.geometry = geo; m.material = material; m.visible = true;
    return m;
  }
  function arrumaMarcas() {
    const m = modoAtual();
    const lista = new Set(alvos());
    if (escolhido !== null && !lista.has(escolhido)) escolhido = null;
    const usadas = new Set();
    for (const i of lista) {
      const sel = escolhido === i;
      const chave = `${m}:${i}`;
      usadas.add(chave);
      if (m === 'casa') {
        const k = marca(chave, sel ? geoDisco : geoAnel, sel ? mAlvoSel : mAlvo);
        k.position.copy(local(pos(i).x, pos(i).y, Y_RUA));
        k.scale.setScalar(1); k.rotation.set(0, 0, 0);
      } else if (m === 'predio') {
        const k = marca(chave, geoAnelPredio, sel ? mAlvoSel : mAlvo);
        k.position.copy(local(pos(i).x, pos(i).y, ALT_BASE + 0.0012));
        k.scale.setScalar(1); k.rotation.set(0, 0, 0);
      } else if (m === 'rua') {
        const [a, b] = GEO.arestas[i].v.map(pos);
        const k = marca(chave, geoTraco, sel ? mAlvoSel : mAlvo);
        k.position.copy(local((a.x + b.x) / 2, (a.y + b.y) / 2, Y_RUA));
        k.rotation.set(0, -Math.atan2(b.y - a.y, b.x - a.x), 0);
        k.scale.set(0.56 * S, 1, (sel ? 0.17 : 0.13) * S);
      } else if (m === 'fiscal') {
        const k = marca(chave, geoAroLote, sel ? mAlvoSel : mAlvo);
        k.position.copy(local(GEO.hexes[i].x, GEO.hexes[i].y, ALT_BASE + ALT_LOTE + 0.0014));
        k.scale.setScalar(1); k.rotation.set(0, 0, 0);
      }
    }
    for (const [k, mesh] of marcas) if (!usadas.has(k)) mesh.visible = false;
    // a peça translúcida no lugar escolhido: o que vai ficar ali
    if (fantasma) { tab.remove(fantasma); fantasma = null; }
    if (escolhido !== null && (m === 'casa' || m === 'predio' || m === 'rua')) {
      fantasma = m === 'rua' ? criaRua(eu(), escolhido, true) : m === 'casa' ? criaCasa(eu(), true) : criaPredio(eu(), true);
      if (m !== 'rua') fantasma.position.copy(local(pos(escolhido).x, pos(escolhido).y, ALT_BASE + (m === 'predio' ? 0.001 : 0)));
      if (m === 'predio') fantasma.scale.setScalar(1.06);
      fantasma.renderOrder = 7;
      tab.add(fantasma);
    }
  }

  // ---- escolher e confirmar ---------------------------------------------------------------

  function escolhe(i) {
    escolhido = escolhido === i ? null : i;
    arrumaMarcas();
    ctx.atualizaBotoes();
    mostraTextoDaVez();
  }
  function confirma() {
    const m = modoAtual();
    if (m === null || escolhido === null) return;
    if (m === 'fiscal') { mandaFiscal(escolhido); return; }
    ctx.sendAction({ a: m, alvo: escolhido });
    escolhido = null;
    if (v().phase === 'acoes') modoEscolhido = null;
    arrumaMarcas();
    ctx.atualizaBotoes();
  }
  function vitimasEm(h) {
    const ids = new Set();
    for (const vert of GEO.hexes[h].vertices) {
      const c = v().construcoes[vert];
      if (c && c.p !== eu()) ids.add(c.p);
    }
    return [...ids];
  }
  function mandaFiscal(h) {
    const vit = vitimasEm(h);
    if (vit.length <= 1) {
      ctx.sendAction({ a: 'fiscal', h, de: vit[0] || null });
      escolhido = null;
      arrumaMarcas();
      return;
    }
    abre('fiscal', { h });
  }

  // ---- os painéis (o modal da 3D) ------------------------------------------------------------
  // A mesma caixa do visor e do placar da 3D (3d.html), com o miolo da 2D.
  const modal = document.createElement('div');
  modal.className = 'visor-jogos px3-modal';
  modal.hidden = true;
  modal.innerHTML = `<div class="visor-caixa" role="dialog" aria-modal="true" aria-labelledby="px3-titulo">
    <header><strong id="px3-titulo"></strong><button type="button" class="visor-x">Fechar</button></header>
    <div class="visor-corpo"></div><div class="placar-acoes"></div></div>`;
  document.body.appendChild(modal);
  const corpoModal = modal.querySelector('.visor-corpo');
  const acoesModal = modal.querySelector('.placar-acoes');
  let modalPx = null;
  function abre(tipo, estado = {}) {
    modalPx = { tipo, ...estado };
    modal.hidden = false;
    pintaModal();
    modal.querySelector('.visor-x').focus({ preventScroll: true });
  }
  function fecha() { modalPx = null; modal.hidden = true; }
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.classList.contains('visor-x')) { fecha(); return; }
    const alvo = e.target.closest('[data-px]');
    if (!alvo || !modalPx) return;
    const acao = alvo.dataset.px;
    const r = alvo.dataset.r;
    const m = modalPx;
    const you = v().you;
    if (m.tipo === 'fiscal' && acao === 'vitima') {
      ctx.sendAction({ a: 'fiscal', h: m.h, de: alvo.dataset.id });
      escolhido = null;
      fecha();
      arrumaMarcas();
      return;
    }
    if (m.tipo === 'construir' && acao === 'construir') {
      const t = alvo.dataset.t;
      fecha();
      if (t === 'carta') { ctx.sendAction({ a: 'comprarCarta' }); return; }
      modoEscolhido = t; escolhido = null;
      arrumaMarcas(); ctx.atualizaBotoes(); mostraTextoDaVez();
      return;
    }
    if (m.tipo === 'descarte') {
      if (acao === 'mais' && m.dar[r] < you.recursos[r] && soma(m.dar) < m.n) m.dar[r]++;
      if (acao === 'menos' && m.dar[r] > 0) m.dar[r]--;
    } else if (m.tipo === 'troca') {
      if (acao === 'da') m.da = m.da === r ? null : r;
      if (acao === 'quer') m.quer = m.quer === r ? null : r;
      if (acao === 'dou-mais' && m.dou[r] < you.recursos[r]) m.dou[r]++;
      if (acao === 'dou-menos' && m.dou[r] > 0) m.dou[r]--;
      if (acao === 'quero-mais' && m.quero[r] < 9) m.quero[r]++;
      if (acao === 'quero-menos' && m.quero[r] > 0) m.quero[r]--;
      if (acao === 'aba') m.aba = alvo.dataset.aba;
    } else if (m.tipo === 'carta') {
      if (m.carta === 'achado') {
        if (acao === 'mais' && soma(m.rec) < 2) m.rec[r]++;
        if (acao === 'menos' && m.rec[r] > 0) m.rec[r]--;
      }
      if (m.carta === 'arremate' && acao === 'um') m.recurso = r;
    }
    pintaModal();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) fecha(); });

  function pintaAcoes(acoes) {
    acoesModal.textContent = '';
    for (const a of acoes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `visor-acao${a.forte ? ' forte' : ''}`;
      b.textContent = a.label;
      if (a.off) { b.disabled = true; b.classList.add('desligada'); }
      b.onclick = () => { if (!a.off) a.fn(); };
      acoesModal.appendChild(b);
    }
  }
  // Os cinco materiais lado a lado, cada um com −/+ (o mesmo da 2D).
  function contadores(valores, tenho, menos, mais) {
    return `<div class="px-grade5">${RECURSOS.map((r) => `<div class="px-col">
      ${fichaHTML(r)}<span class="px-col-n">${valores[r]}</span>
      <span class="px-col-bt">
        <button type="button" class="px-mm" data-px="${menos}" data-r="${r}" aria-label="menos ${NOME_DO_RECURSO[r]}" ${valores[r] ? '' : 'disabled'}>−</button>
        <button type="button" class="px-mm" data-px="${mais}" data-r="${r}" aria-label="mais ${NOME_DO_RECURSO[r]}">+</button>
      </span>
      <small>${tenho ? `tem ${tenho[r] || 0}` : NOME_DO_RECURSO[r]}</small></div>`).join('')}</div>`;
  }

  function pintaModal() {
    const m = modalPx;
    if (!m) return;
    const vw = v();
    const you = vw.you;
    const titulo = modal.querySelector('#px3-titulo');
    if (!you) { fecha(); return; }
    if (m.tipo === 'construir') {
      titulo.textContent = 'Construir';
      const linhas = ['rua', 'casa', 'predio', 'carta'].map((t) => {
        const custo = CUSTOS[t];
        const falta = RECURSOS.filter((r) => (custo[r] || 0) > (you.recursos[r] || 0)).map((r) => `${custo[r] - you.recursos[r]} ${NOME_DO_RECURSO[r]}`);
        const semPeca = t !== 'carta' && you.pecas[t] <= 0;
        const semLugar = t !== 'carta' && !you.legais[t].length;
        const semCarta = t === 'carta' && !vw.cartasNoMonte;
        const motivo = semPeca ? 'acabaram as peças' : semCarta ? 'acabaram as cartas'
          : falta.length ? `falta ${falta.join(', ')}` : semLugar ? (t === 'predio' ? 'nenhuma casa para subir' : 'nenhum lugar livre') : '';
        const custoHTML = RECURSOS.filter((r) => custo[r]).map((r) => `<span class="px-par">${custo[r]}${fichaHTML(r, 'mini')}</span>`).join('');
        return `<button type="button" class="px-opcao" data-px="construir" data-t="${t}" ${motivo ? 'disabled' : ''}>
          <span class="px-opcao-nome">${NOME_DA_CONSTRUCAO[t]}${t === 'carta' ? '' : ` <small>(restam ${you.pecas[t]})</small>`}</span>
          <span class="px-custo">${custoHTML}</span>
          <span class="px-opcao-motivo">${motivo || (t === 'carta' ? `${vw.cartasNoMonte} no monte` : 'toque no tabuleiro')}</span>
        </button>`;
      }).join('');
      corpoModal.innerHTML = `<div class="px-opcoes">${linhas}</div>
        <p class="px3-dica">Rua sai de uma rua ou construção sua. Casa vai numa esquina sem vizinha ocupada, na ponta de uma rua sua. O prédio sobe em cima de uma casa sua.</p>`;
      pintaAcoes([{ label: 'Fechar', fn: fecha }]);
    } else if (m.tipo === 'descarte') {
      const ja = soma(m.dar);
      titulo.textContent = 'Dia de fiscalização';
      corpoModal.innerHTML = `<p>Você está com ${plural(soma(you.recursos), 'carta', 'cartas')} — mais de ${LIMITE_DA_MAO}. O fiscal apreende a metade: escolha <strong>${m.n}</strong> para devolver.</p>
        ${contadores(m.dar, you.recursos, 'menos', 'mais')}
        <p class="px-conta">${ja} de ${m.n}</p>`;
      pintaAcoes([{ label: `Devolver ${m.n}`, forte: true, off: ja !== m.n, fn: () => { ctx.sendAction({ a: 'descartar', recursos: m.dar }); fecha(); } }]);
    } else if (m.tipo === 'troca') {
      titulo.textContent = 'Trocar';
      const tx = you.taxas;
      let corpo; let acoes;
      if (m.aba === 'fornecedor') {
        const da = (r) => `<button type="button" class="px-esc ${m.da === r ? 'sel' : ''}" data-px="da" data-r="${r}" ${you.recursos[r] >= tx[r] ? '' : 'disabled'} aria-pressed="${m.da === r}">
          ${fichaHTML(r)}<span>${tx[r]} por 1</span><small>tem ${you.recursos[r]}</small></button>`;
        const quer = (r) => `<button type="button" class="px-esc ${m.quer === r ? 'sel' : ''}" data-px="quer" data-r="${r}" ${vw.banca[r] > 0 && r !== m.da ? '' : 'disabled'} aria-pressed="${m.quer === r}">
          ${fichaHTML(r)}<span>${NOME_DO_RECURSO[r]}</span></button>`;
        corpo = `<p class="px-rot">Você dá</p><div class="px-escolhas">${RECURSOS.map(da).join('')}</div>
          <p class="px-rot">Você recebe 1</p><div class="px-escolhas">${RECURSOS.map(quer).join('')}</div>
          <p class="px3-dica">O fornecedor troca 4 por 1. Casa ou prédio numa revenda geral baixa para 3 por 1; numa especializada, 2 por 1 daquele material.</p>`;
        const ok = m.da && m.quer && m.da !== m.quer;
        acoes = [{ label: ok ? `Trocar ${tx[m.da]} ${NOME_DO_RECURSO[m.da]} por 1 ${NOME_DO_RECURSO[m.quer]}` : 'Trocar', forte: true, off: !ok,
          fn: () => { ctx.sendAction({ a: 'banca', da: m.da, quer: m.quer }); fecha(); } }];
      } else {
        corpo = `<p class="px-rot">Você dá</p>${contadores(m.dou, you.recursos, 'dou-menos', 'dou-mais')}
          <p class="px-rot">Você quer</p>${contadores(m.quero, null, 'quero-menos', 'quero-mais')}
          <p class="px3-dica">A oferta vai para todos. Quem aceitar aparece na mesa, e você escolhe com quem fechar.</p>`;
        const repetido = RECURSOS.some((r) => m.dou[r] && m.quero[r]);
        const ok = soma(m.dou) && soma(m.quero) && !repetido;
        acoes = [{ label: repetido ? 'Não vale o mesmo material dos dois lados' : 'Oferecer a todos', forte: true, off: !ok,
          fn: () => { ctx.sendAction({ a: 'oferta', da: m.dou, quer: m.quero }); fecha(); } }];
      }
      corpoModal.innerHTML = `<div class="px-abas" role="tablist">
          <button type="button" role="tab" class="px-aba ${m.aba === 'fornecedor' ? 'sel' : ''}" data-px="aba" data-aba="fornecedor" aria-selected="${m.aba === 'fornecedor'}">Fornecedor</button>
          <button type="button" role="tab" class="px-aba ${m.aba === 'jogadores' ? 'sel' : ''}" data-px="aba" data-aba="jogadores" aria-selected="${m.aba === 'jogadores'}">Jogadores</button>
        </div>${corpo}`;
      pintaAcoes([...acoes, { label: 'Fechar', fn: fecha }]);
    } else if (m.tipo === 'carta') {
      const tipo = m.carta;
      titulo.textContent = 'Carta de obra';
      let extra = ''; let ok = m.pode; let porque = '';
      if (!m.pode) {
        const minhas = you.cartas.filter((c) => c.tipo === tipo);
        porque = tipo === 'obra' ? 'Obra Pública não se joga: o ponto conta sozinho.'
          : !minhaVez() ? 'Só na sua vez.'
            : minhas.every((c) => c.nova) ? 'A carta comprada nesta vez só pode ser jogada na próxima.'
              : vw.phase === 'rolar' || vw.phase === 'acoes' ? 'Você já jogou uma carta nesta vez.' : 'Agora não dá.';
      }
      if (m.pode && tipo === 'achado') { extra = `${contadores(m.rec, null, 'menos', 'mais')}<p class="px-conta">${soma(m.rec)} de 2</p>`; ok = soma(m.rec) === 2; }
      if (m.pode && tipo === 'arremate') {
        extra = `<div class="px-escolhas">${RECURSOS.map((r) => `<button type="button" class="px-esc ${m.recurso === r ? 'sel' : ''}" data-px="um" data-r="${r}" aria-pressed="${m.recurso === r}">${fichaHTML(r)}<span>${NOME_DO_RECURSO[r]}</span></button>`).join('')}</div>`;
        ok = !!m.recurso;
      }
      const nomes = tipo === 'obra' ? you.cartas.filter((c) => c.tipo === 'obra').map((c) => c.nome).filter(Boolean) : [];
      corpoModal.innerHTML = `<div class="px-carta-grande px-c-${tipo}">${NOME_DA_CARTA[tipo]}</div>
        <p>${DESC_DA_CARTA[tipo]}${nomes.length ? ` As suas: ${nomes.map(esc).join(', ')}.` : ''}</p>${extra}${porque ? `<p class="px3-dica">${porque}</p>` : ''}`;
      const acoes = [];
      if (m.pode) {
        acoes.push({ label: 'Jogar', forte: true, off: !ok, fn: () => {
          const a = { a: 'carta', tipo };
          if (tipo === 'achado') a.recursos = m.rec;
          if (tipo === 'arremate') a.recurso = m.recurso;
          ctx.sendAction(a);
          fecha();
        } });
      }
      acoes.push({ label: 'Fechar', fn: fecha });
      pintaAcoes(acoes);
    } else if (m.tipo === 'fiscal') {
      titulo.textContent = 'De quem levar?';
      const vit = vitimasEm(m.h);
      corpoModal.innerHTML = `<p>O fiscal vai para ${esc(nomeDoLote(vw.tabuleiro, m.h))}. Escolha de quem você leva 1 material, ao acaso.</p>
        <div class="px-lista">${vit.map((id) => {
          const p = jogador(id);
          return `<button type="button" class="px-opcao px3-vitima" data-px="vitima" data-id="${esc(id)}" style="--anel:${ctx.corDe(id)}">
            <img src="${ctx.avatarDe(id)}" alt="" width="30" height="30"><span class="px-opcao-nome">${esc(p?.name)}</span>
            <span class="px-opcao-motivo">${plural(p?.handCount || 0, 'carta', 'cartas')}</span></button>`;
        }).join('')}</div>`;
      pintaAcoes([{ label: 'Voltar', fn: fecha }]);
    }
  }
  function modalDeDescarte() {
    const d = v().descartes?.[0];
    if (!d || d.id !== eu()) return;
    abre('descarte', { n: d.n, dar: zerados() });
  }
  function modalDaCarta(tipo) { abre('carta', { carta: tipo, pode: v().you.jogaveis.includes(tipo), rec: zerados(), recurso: null }); }

  // ---- o seu material, no pé da tela ---------------------------------------------------------
  const painel = document.createElement('div');
  painel.className = 'px3-eu';
  painel.hidden = true;
  document.body.appendChild(painel);
  painel.addEventListener('click', (e) => {
    const c = e.target.closest('[data-carta]');
    if (c) { modalDaCarta(c.dataset.carta); return; }
    if (e.target.closest('.px3-pts')) ctx.abrePlacar();
  });
  let chaveDoPainel = '';
  function desenhaPainel() {
    const vw = v();
    const you = vw.you;
    painel.hidden = !you || vw.phase === 'gameEnd';
    if (painel.hidden) return;
    const ganho = ganhoRecente && Date.now() < ganhoRecente.ate ? ganhoRecente.rec : null;
    const chave = JSON.stringify([you.recursos, you.pontos, you.pecas, you.cartas, you.jogaveis, ganho, vw.meta, vw.dados]);
    if (chave === chaveDoPainel) return;
    chaveDoPainel = chave;
    const fichas = RECURSOS.map((r) => {
      const n = you.recursos[r] || 0;
      return `<div class="px-rec${n ? '' : ' zero'}" data-r="${r}" role="listitem">${fichaHTML(r)}<span class="px-rec-n">${n}</span><span class="px-rec-nome">${NOME_DO_RECURSO[r]}</span>${ganho?.[r] ? `<span class="px-ganho">+${ganho[r]}</span>` : ''}</div>`;
    }).join('');
    const grupos = new Map();
    for (const c of you.cartas) {
      const g = grupos.get(c.tipo) || { n: 0, novas: 0 };
      g.n++; if (c.nova) g.novas++;
      grupos.set(c.tipo, g);
    }
    const cartas = [...grupos].map(([tipo, g]) => {
      const pode = you.jogaveis.includes(tipo);
      return `<button type="button" class="px-carta px-c-${tipo}${pode ? ' pode' : ''}" data-carta="${tipo}" aria-label="${NOME_DA_CARTA[tipo]}${g.n > 1 ? `, ${g.n} cartas` : ''}${pode ? '. Toque para jogar.' : ''}">
        <span class="px-carta-nome">${NOME_DA_CARTA[tipo]}</span>${g.n > 1 ? `<span class="px-carta-n">×${g.n}</span>` : ''}${g.novas === g.n && tipo !== 'obra' ? '<span class="px-carta-nova">nova</span>' : ''}</button>`;
    }).join('');
    const d = vw.dados;
    const dadosHTML = d ? `<span class="px3-dados${d[0] + d[1] === 7 ? ' sete' : ''}" title="Últimos dados: ${d[0]} e ${d[1]}">${dadoSvg(d[0])}${dadoSvg(d[1])}<b>${d[0] + d[1]}</b></span>` : '';
    painel.innerHTML = `<div class="px-recursos" role="list" aria-label="Seu material: ${listaDeMaterial(you.recursos)}">${fichas}</div>
      <div class="px3-linha">
        <button type="button" class="px3-pts" title="Placar"><strong>${you.pontos}</strong> de ${vw.meta} pts</button>
        <span class="px3-pecas">${plural(you.pecas.rua, 'rua', 'ruas')} · ${plural(you.pecas.casa, 'casa', 'casas')} · ${plural(you.pecas.predio, 'prédio', 'prédios')}</span>
        ${dadosHTML}
      </div>
      ${cartas ? `<div class="px-cartas">${cartas}</div>` : ''}`;
  }
  function dadoSvg(n) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="1.5" width="21" height="21" rx="5"/>${PONTOS_DO_DADO[n].map(([x, y]) => `<circle cx="${12 + x * 5.5}" cy="${12 + y * 5.5}" r="2.2"/>`).join('')}</svg>`;
  }
  const alturaDoPe = () => (painel.hidden ? 0 : painel.getBoundingClientRect().height + 10);
  // a barra de botões mora logo acima do painel (mesa3d.js põe --acao-fundo a
  // cada estado); o painel muda de altura sem estado novo — o puxadinho.css
  // chega depois do primeiro desenho, as cartas de obra quebram linha
  new ResizeObserver(() => document.body.style.setProperty('--acao-fundo', `${Math.round(alturaDoPe() + 14)}px`)).observe(painel);

  // ---- a oferta de troca na mesa ---------------------------------------------------------------
  const ofertaBox = document.createElement('div');
  ofertaBox.className = 'px-oferta px3-oferta';
  ofertaBox.hidden = true;
  document.body.appendChild(ofertaBox);
  let chaveDaOferta = '';
  function desenhaOferta() {
    const vw = v();
    const o = vw.phase === 'acoes' ? vw.oferta : null;
    const chave = o ? JSON.stringify([o, temTudo(vw.you?.recursos, o.quer)]) : '';
    if (chave === chaveDaOferta) return;
    chaveDaOferta = chave;
    ofertaBox.hidden = !o;
    if (!o) { ofertaBox.innerHTML = ''; return; }
    const minha = o.de === eu();
    const cabeca = `<p class="px-oferta-txt"><strong>${esc(minha ? 'Sua oferta' : `${nome(o.de)} oferece`)}:</strong>
      <span class="px-oferta-lado">${fichasDe(o.da)}</span> por <span class="px-oferta-lado">${fichasDe(o.quer)}</span></p>`;
    let corpo;
    if (minha) {
      corpo = `<div class="px-respostas">${vw.players.filter((p) => p.id !== eu()).map((p) => {
        const r = o.respostas[p.id];
        if (r === true) return `<button type="button" class="btn btn-primary px-fechar" data-com="${esc(p.id)}">Fechar com ${esc(p.name)}</button>`;
        return `<span class="px-resp ${r === false ? 'nao' : ''}">${esc(p.name)}: ${r === false ? 'recusou' : 'pensando…'}</span>`;
      }).join('')}<button type="button" class="btn btn-ghost px-cancela-oferta">Cancelar</button></div>`;
    } else {
      const r = o.respostas[eu()];
      const posso = temTudo(vw.you?.recursos, o.quer);
      corpo = `<div class="px-respostas">
        <button type="button" class="btn btn-primary px-aceita${posso ? '' : ' soft-disabled'}" ${r === true ? 'aria-pressed="true"' : ''}>${r === true ? 'Aceitei' : 'Aceitar'}</button>
        <button type="button" class="btn px-recusa" ${r === false ? 'aria-pressed="true"' : ''}>${r === false ? 'Recusei' : 'Recusar'}</button>
        ${posso ? '' : '<span class="px-resp nao">você não tem o que ele pede</span>'}</div>`;
    }
    ofertaBox.innerHTML = cabeca + corpo;
    ofertaBox.querySelectorAll('.px-fechar').forEach((b) => { b.onclick = () => ctx.sendAction({ a: 'fecharTroca', com: b.dataset.com }); });
    ofertaBox.querySelector('.px-cancela-oferta')?.addEventListener('click', () => ctx.sendAction({ a: 'cancelarOferta' }));
    const aceita = ofertaBox.querySelector('.px-aceita');
    if (aceita) aceita.onclick = () => { if (temTudo(v().you?.recursos, o.quer)) ctx.sendAction({ a: 'responder', aceita: true, seq: o.seq }); else anuncia('Você não tem o que a oferta pede.'); };
    ofertaBox.querySelector('.px-recusa')?.addEventListener('click', () => ctx.sendAction({ a: 'responder', aceita: false, seq: o.seq }));
  }

  // ---- os assentos: a plaquinha no tampo ----------------------------------------------------
  // Na frente de cada cadeira, na beirada do tampo: o nome e os pontos à
  // vista (e os títulos). Acende em âmbar na vez da pessoa. É o que a câmera
  // debruçada sempre enquadra — o nome sobre a cabeça pode sair por cima.
  const placas = new Map();   // id → sprite
  function placaDe(id) {
    let p = placas.get(id);
    if (!p) {
      // por cima de tudo: na beirada não há nada na frente dela, e de pé
      // (virada para a câmera) a parte de cima entrava atrás do copo do aro
      p = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, toneMapped: false, depthTest: false }));
      p.scale.set(0.6, 0.131, 1);
      p.renderOrder = 8;
      scene.add(p);
      placas.set(id, p);
    }
    return p;
  }
  // o nome em creme e os pontos em ouro, numa pílula (o rótulo da mesa é
  // estreito demais para os dois)
  function pintaPlaca(sprite, nomeTxt, ptsTxt, vez, cartas = 0) {
    const chave = `${nomeTxt}|${ptsTxt}|${vez}|${cartas}`;
    if (sprite.userData.chave === chave) return;
    sprite.userData.chave = chave;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 112;
    const g = c.getContext('2d');
    const fN = '900 42px Nunito, sans-serif', fP = '400 42px "Paytone One", "Arial Black", sans-serif';
    g.font = fN; const wN = g.measureText(nomeTxt).width;
    g.font = fP; const wP = g.measureText(ptsTxt).width;
    // o cartão das cartas de material: um retângulo de carta e o número
    const fC = '900 34px Nunito, sans-serif';
    g.font = fC; const wC = 26 + 8 + g.measureText(String(cartas)).width;
    const larg = wN + 18 + wP + 22 + wC;
    const k = Math.min(1, 440 / larg);
    const w = Math.min(500, larg * k + 52);
    retArredondado(g, (512 - w) / 2, 12, w, 88, 44);
    g.fillStyle = vez ? 'rgba(207,138,42,0.96)' : 'rgba(27,17,11,0.92)'; g.fill();
    g.strokeStyle = vez ? '#fff6e2' : 'rgba(242,193,78,0.55)'; g.lineWidth = 3; g.stroke();
    g.save(); g.translate(256, 58); g.scale(k, k);
    const x0 = -larg / 2;
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = fN; g.fillStyle = '#f5f1e6'; g.fillText(nomeTxt, x0, 0);
    g.font = fP; g.fillStyle = vez ? '#fff6e2' : '#f2c14e'; g.fillText(ptsTxt, x0 + wN + 18, 2);
    const xc = x0 + wN + 18 + wP + 22;
    retArredondado(g, xc, -18, 26, 36, 5);
    g.fillStyle = '#f5f1e6'; g.fill(); g.strokeStyle = '#8c6a45'; g.lineWidth = 3; g.stroke();
    g.font = fC; g.fillStyle = '#f5f1e6'; g.fillText(String(cartas), xc + 34, 2);
    g.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const velha = sprite.material.map;
    sprite.material.map = tex;
    sprite.material.needsUpdate = true;
    velha?.dispose();
  }
  function marcaAssentos() {
    const vw = v();
    for (const [id, p] of placas) if (!ctx.assentos.has(id)) { scene.remove(p); placas.delete(id); }
    for (const [id, a] of ctx.assentos) {
      const p = jogador(id);
      if (!p) continue;
      const placa = placaDe(id);
      const ang = Math.atan2(a.grupo.position.x, -a.grupo.position.z);
      // (a 1,02 m ficava atrás do copo da casa, que mora no aro de trás)
      placa.position.set(Math.sin(ang) * 0.97, MESA_TOPO + 0.08, -Math.cos(ang) * 0.97);
      const titulos = [vw.avenida?.id === id ? 'Avenida' : '', vw.equipe?.id === id ? 'Equipe' : ''].filter(Boolean);
      const vez = vw.turnId === id && vw.phase !== 'gameEnd';
      pintaPlaca(placa, p.name, `${p.pontos} ${p.pontos === 1 ? 'pt' : 'pts'}${titulos.length ? ` · ${titulos.join(' · ')}` : ''}`, vez, p.handCount);
      a.marca = vw.descartes?.some((d) => d.id === id) ? 'DEVOLVENDO' : null;
    }
  }

  // ---- os textos ---------------------------------------------------------------------------
  function textoBase() {
    const vw = v();
    if (!vw) return '';
    const quem = nome(vw.turnId);
    const minha = agindo();
    switch (vw.phase) {
      case 'colocacao': {
        const c = vw.colocacao;
        const qual = c?.volta ? '2ª' : '1ª';
        if (!minha) return `${quem} está escolhendo onde pôr a ${c?.falta === 'rua' ? 'rua' : `${qual} casa`}…`;
        if (escolhido !== null) return c.falta === 'casa' ? 'Confirme no botão — ou toque em outra esquina.' : 'Confirme no botão — ou toque em outro lado.';
        return c.falta === 'casa' ? `Ponha a sua ${qual} casa: toque numa esquina marcada.${c.volta ? ' Ela já rende material.' : ''}` : 'Agora a rua, saindo dessa casa.';
      }
      case 'rolar': return minha ? 'Sua vez: role os dados.' : `Vez de ${quem}…`;
      case 'descarte': {
        const d = vw.descartes?.[0];
        return minha ? `Dia de fiscalização: devolva ${d?.n} cartas.` : `Dia de fiscalização: ${quem} está devolvendo material…`;
      }
      case 'fiscal': return minha ? 'Mande o fiscal para outro terreno: toque num terreno marcado.' : `${quem} está mandando o fiscal…`;
      case 'mutirao': return minha ? 'Mutirão: toque num lado marcado para a rua de graça.' : `${quem} está no mutirão…`;
      case 'acoes': {
        if (!minha) return `Vez de ${quem}…`;
        if (modoEscolhido === 'casa') return 'Toque numa esquina marcada para a casa.';
        if (modoEscolhido === 'rua') return 'Toque num lado marcado para a rua.';
        if (modoEscolhido === 'predio') return 'Toque numa casa sua para subir o prédio.';
        return 'Construa, troque ou passe a vez.';
      }
      case 'gameEnd': return 'Fim da partida!';
      default: return '';
    }
  }
  function mostraTextoDaVez() { if (!falando) { const t = textoBase(); if (t) ctx.aviso(t, true); } }

  // ---- o modal que a fase abre sozinha (o descarte) -------------------------------------------
  let chaveDoModalDeFase = null;
  function modalDeFase() {
    const vw = v();
    const chave = vw.phase === 'descarte' && vw.descartes?.[0]?.id === eu() ? `descarte:${vw.turnNo}` : null;
    if (chave === chaveDoModalDeFase) return;
    const antes = chaveDoModalDeFase;
    chaveDoModalDeFase = chave;
    if (!chave) { if (antes && modalPx?.tipo === 'descarte') fecha(); return; }
    modalDeDescarte();
  }

  // ---- a câmera debruçada --------------------------------------------------------------------
  // O que tem de caber: o contorno das quadras e os dados, acima do seu painel
  // e da barra de botões, e abaixo da faixa do alto (o elenco e o aviso).
  // Procura, com a inclinação de cada tela, a câmera mais perto que enquadra
  // tudo — de lado a mesa é larga, em pé é estreita e a câmera sobe.
  const camTeste = new THREE.PerspectiveCamera();
  const _p = new THREE.Vector3();
  let enquadramento = null;
  let chaveDoEnquadramento = '';
  function enquadra() {
    const cam = ctx.camera;
    const emPe = cam.aspect < 1;
    const reserva = alturaDoPe() + (emPe ? 112 : 66);
    const alturas = [...ctx.assentos.values()].map((a) => Math.round((a.nome?.position.y || 0) * 20)).join();
    const chave = `${innerWidth}x${innerHeight}:${Math.round(reserva / 8)}:${cam.fov}:${alturas}`;
    if (chave === chaveDoEnquadramento && enquadramento) return enquadramento;
    chaveDoEnquadramento = chave;
    // a inclinação: deitada, ~36°; em pé, a maior que couber debaixo da
    // cúpula (de cima dela, a cúpula tomava o alto da tela)
    const inclinacoes = emPe ? [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4] : [0.62, 0.58, 0.54, 0.5, 0.46, 0.66, 0.72];
    const yMin = -1 + 2 * Math.min(0.5, (reserva + 6) / innerHeight);
    const yMax = emPe ? 0.5 : 0.5;
    const pontos = BEIRA.map((x) => new THREE.Vector3(pos(x).x * S, MESA_TOPO + 0.02, pos(x).y * S));
    pontos.push(lugarDosDados(0).add(tab.position), lugarDosDados(1).add(tab.position));
    // e o alto da cabeça de quem senta à frente: debruçar sobre o tabuleiro
    // não pode cortar a cara de ninguém (em pé, a inclinação já os põe acima
    // do bairro). O nome e os pontos de cada um vão numa plaquinha no tampo,
    // na frente da cadeira (`placaDe`): esperar o rótulo de cima caber
    // jogava a câmera no teto e o bairro encolhia pela metade.
    const cabecas = emPe ? [] : [...ctx.assentos.values()].filter((a) => Math.abs(a.grupo.position.x) < 0.6).map((a) => {
      a.grupo.updateMatrixWorld(true);
      return a.nome.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, -0.2, 0));
    });
    camTeste.fov = cam.fov; camTeste.aspect = cam.aspect; camTeste.near = cam.near; camTeste.far = cam.far;
    camTeste.updateProjectionMatrix();
    // a camada visual (visual3d.js) não deixa a câmera recuar além de 2,6 m,
    // e acima de Y_MAX a cúpula entra no quadro: se não couber com uma
    // inclinação, tenta a próxima
    let melhor = null;
    for (const inclinacao of inclinacoes) {
    if (melhor) break;
    for (let zt = -0.3; zt <= 0.301; zt += 0.05) {
      for (let d = 1.2; d <= 4.2; d += 0.04) {
        if (zt + d * Math.cos(inclinacao) > Z_MAX || MESA_TOPO + d * Math.sin(inclinacao) > Y_MAX) break;
        camTeste.position.set(0, MESA_TOPO + d * Math.sin(inclinacao), zt + d * Math.cos(inclinacao));
        camTeste.lookAt(0, MESA_TOPO, zt);
        camTeste.updateMatrixWorld();
        let ok = true;
        for (const p of pontos) {
          _p.copy(p).project(camTeste);
          if (Math.abs(_p.x) > 0.96 || _p.y < yMin || _p.y > yMax) { ok = false; break; }
        }
        for (const p of ok ? cabecas : []) {
          _p.copy(p).project(camTeste);
          if (_p.y > 0.9) { ok = false; break; }
        }
        if (ok) { if (!melhor || d < melhor.d) melhor = { d, zt, inclinacao }; break; }
      }
    }
    }
    melhor ||= { d: 2.2, zt: 0, inclinacao: 0.58 };
    const z = Math.min(Z_MAX, melhor.zt + melhor.d * Math.cos(melhor.inclinacao));
    enquadramento = { y: MESA_TOPO + melhor.d * Math.sin(melhor.inclinacao), z, zt: melhor.zt };
    return enquadramento;
  }
  const mira = new THREE.Vector3();

  // ---- as quadras que produzem, os tijolinhos ----------------------------------------------
  function produzVisivel(ev) {
    const vw = v();
    const lotesDoNumero = new Set();
    (vw.tabuleiro || []).forEach((c, h) => { if (c.n === ev.soma) lotesDoNumero.add(h); });
    brilho = { lotes: lotesDoNumero, ate: agora() + 2600 };
    if (ev.soma === 7) return;
    let k = 0;
    for (const h of lotesDoNumero) {
      if (h === vw.fiscal) continue;
      const r = PRODUZ[vw.tabuleiro[h].t];
      if (!r || ev.faltou?.includes(r)) continue;
      for (const vert of GEO.hexes[h].vertices) {
        const c = vw.construcoes[vert];
        if (!c) continue;
        const n = c.tipo === 'predio' ? 2 : 1;
        for (let i = 0; i < n; i++) {
          mandaFicha(r, lotes[h].centro.clone().setY(ALT_BASE + ALT_LOTE + 0.01), pontoDe(c.p, r), { atraso: 120 * k++, dur: 680, arco: 0.16, paraMim: souEu(c.p) });
        }
      }
    }
  }
  function rolaOsDados(ev) {
    dadosDaMesa = ev.dados;
    if (ctx.semMovimento) { poeDados(ev.dados); return; }
    // saem da mão de quem rolou (a sua, logo abaixo da tela)
    const de = souEu(ev.p) ? pontoDe(ev.p).add(new THREE.Vector3(0.05, 0.05, 0)) : pontoDe(ev.p);
    const a = souEu(ev.p) ? null : ctx.assentos.get(ev.p);
    if (a?.assento?.modelo && ctx.temGesto(a)) ctx.gestoCarta(a.assento.modelo, 'descartar', noMundo(lugarDosDados(0)));
    rolagem = {
      t0: agora(), dur: 760,
      de: [de.clone(), de.clone().add(new THREE.Vector3(0.03, 0, 0.01))],
      para: [lugarDosDados(0), lugarDosDados(1)],
      qDe: dados.map(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6))),
      qPara: ev.dados.map((n, i) => orientacao(n, dados[i].userData.giro + (Math.random() - 0.5) * 0.5)),
      voltas: dados.map(() => new THREE.Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize()),
    };
    for (const d of dados) d.visible = true;
    setTimeout(() => {
      produzVisivel(ev);
      const meu = ev.ganhos?.[eu()];
      if (meu) { ganhoRecente = { rec: meu, ate: Date.now() + 2200 }; chaveDoPainel = ''; if (v()) desenhaPainel(); }
    }, 720);
  }
  function poeDados(valores) {
    valores.forEach((n, i) => {
      dados[i].visible = true;
      dados[i].position.copy(lugarDosDados(i));
      dados[i].quaternion.copy(orientacao(n, dados[i].userData.giro));
    });
  }

  // ---- os eventos -----------------------------------------------------------------------------
  function reage(id, humor) { if (!souEu(id)) ctx.cara(id, humor); }

  const api = {
    // Este modo não herda do Caçamba: a sua mão em primeira pessoa (o seu
    // material é o painel do pé da tela), o leque de baralho nas mãos de cada
    // um (aqui não há baralho; a 2D também o esconde — quantas cartas de
    // material cada um tem vai na plaquinha), o monte e o descarte (o meio da
    // mesa é o bairro) e a distribuição de cartas no começo.
    recursos: { maoEmPrimeiraPessoa: false, cartasNaMaoDosOutros: false, monteEDescarte: false, distribuicao: false },

    get medidas() { return { S, enquadramento }; },

    // a câmera desta mesa (mesa3d.js pergunta a cada enquadramento)
    camera() { const e = enquadra(); return { y: e.y, z: e.z }; },
    mira() { const e = enquadra(); return mira.set(ctx.camera.position.x * 0.25, MESA_TOPO, e.zt); },
    alturaDoPe,

    proximoId() {
      const vw = v();
      if (!vw) return null;
      const n = vw.players.length;
      const i = vw.players.findIndex((p) => p.id === vw.turnId);
      if (vw.phase === 'colocacao' && vw.colocacao) {
        const { passo, total } = vw.colocacao;
        if (passo === n - 1 || passo >= total - 1) return null;
        return vw.players[(i + (passo < n ? 1 : n - 1)) % n]?.id || null;
      }
      if (vw.phase === 'rolar' || vw.phase === 'acoes') {
        const d = vw.players.findIndex((p) => p.id === vw.donoId);
        return vw.players[(d + 1) % n]?.id || null;
      }
      return null;
    },

    sincroniza() {
      const vw = v();
      if (vw.phase !== 'acoes' || !minhaVez()) modoEscolhido = null;
      const lider = Math.max(...vw.players.map((p) => p.pontos));
      document.getElementById('rot-rodada').textContent = 'Puxadinho';
      document.getElementById('rot-contrato').textContent = vw.phase === 'colocacao' ? 'Colocação' : vw.phase === 'gameEnd' ? 'Fim da partida' : `até ${vw.meta} · líder ${lider}`;

      // o bairro: desenha quando o tabuleiro muda (partida nova)
      const chave = JSON.stringify([vw.tabuleiro, vw.revendas]);
      if (chave !== chaveDoDesenho) { chaveDoDesenho = chave; desenhaBairro(); }
      montaQuadras();
      tab.visible = !!vw.tabuleiro?.length;

      // o fiscal: as listras e o cone (que anda quando muda de terreno)
      const f = vw.fiscal;
      lotes.forEach((l, h) => tingeLote(l, h === f ? 0.7 : 1));
      listras.position.copy(local(GEO.hexes[f].x, GEO.hexes[f].y, ALT_BASE + ALT_LOTE + 0.0008));
      if (fiscalNaMesa !== f) {
        const de = fiscalNaMesa == null ? null : lugarDoCone(fiscalNaMesa);
        fiscalNaMesa = f;
        if (de && !ctx.semMovimento) {
          conePara = f;
          voa(cone, de, lugarDoCone(f), { dur: 720, arco: 0.12, aoFim: () => { if (conePara === f) conePara = null; } });
        } else cone.position.copy(lugarDoCone(f));
      }

      arrumaPecas();
      arrumaMarcas();
      // os dados: os da última rolada (quem abre a página no meio da vez também vê)
      if (vw.dados && !rolagem && (!dadosDaMesa || dadosDaMesa.join() !== vw.dados.join())) { dadosDaMesa = vw.dados; poeDados(vw.dados); }
      if (!vw.dados) { for (const d of dados) d.visible = false; dadosDaMesa = null; }

      marcaAssentos();
      desenhaPainel();
      desenhaOferta();
      for (const fn of pendentes.splice(0)) fn();
      modalDeFase();
      if (modalPx && modalPx.tipo !== 'descarte') pintaModal();
      if (vw.phase === 'gameEnd' && modalPx) fecha();
    },

    quadro(t) {
      animaVoos(t);
      // a câmera vai para o enquadramento de agora: ele muda quando os modelos
      // chegam (o rótulo de cima desce para a cabeça) ou o painel cresce, e o
      // mesa3d.js só o aplica na próxima jogada. (A suavização é a da camada
      // visual, visual3d.js, que segue o que estiver aqui.)
      { const e = enquadra(); ctx.camera.position.y = e.y; ctx.camera.position.z = e.z; }
      if (rolagem) {
        const r = rolagem;
        const e = Math.min(1, (t - r.t0) / r.dur);
        const s = 1 - Math.pow(1 - e, 3);
        dados.forEach((d, i) => {
          d.position.lerpVectors(r.de[i], r.para[i], s);
          // dois quiques: alto no começo, baixo no fim
          d.position.y += Math.abs(Math.sin(s * Math.PI * 2)) * 0.09 * (1 - s);
          const q = r.qDe[i].clone().slerp(r.qPara[i], s);
          if (e < 1) q.premultiply(new THREE.Quaternion().setFromAxisAngle(r.voltas[i], (1 - s) * 9));
          d.quaternion.copy(q);
        });
        if (e >= 1) rolagem = null;
      }
      // as quadras do número que saiu acendem (e a escolhida para o fiscal)
      const acesa = brilho && t < brilho.ate;
      const doFiscal = modoAtual() === 'fiscal' ? escolhido : null;
      lotes.forEach((l, h) => {
        const alvo = h === doFiscal ? 0.3 : acesa && brilho.lotes.has(h) ? (ctx.semMovimento ? 0.32 : 0.18 + 0.2 * Math.abs(Math.sin((t - brilho.ate) / 230))) : 0;
        const i = l.mat.emissiveIntensity + (alvo - l.mat.emissiveIntensity) * 0.25;
        for (const m of l.mats) m.emissiveIntensity = i;
      });
      // as marcas pulsam
      mAlvo.opacity = ctx.semMovimento ? 0.95 : 0.62 + 0.36 * Math.abs(Math.sin(t / 380));
    },

    // o que está sob o dedo: um lugar marcado (esquina, lado, casa ou terreno)
    alvo(raycaster, x, y) {
      const m = modoAtual();
      if (!m || !modal.hidden) return null;
      const lista = alvos();
      if (!lista.length) return null;
      const tela = (p) => { const q = noMundo(p).project(ctx.camera); return [(q.x + 1) / 2 * innerWidth, (1 - q.y) / 2 * innerHeight]; };
      if (m === 'fiscal') {
        const hit = raycaster.intersectObjects(lista.map((h) => lotes[h].mesh), false)[0];
        if (hit) return { i: hit.object.userData.lote };
        // de raspão: o terreno cujo meio está mais perto do dedo
        let perto = null, raio = 40;
        for (const h of lista) { const [px, py] = tela(lotes[h].centro); const d = Math.hypot(x - px, y - py); if (d < raio) { raio = d; perto = h; } }
        return perto === null ? null : { i: perto };
      }
      // o mais perto do dedo, até 34 px: de longe a esquina tem um dedo de
      // largura, e o lado é um traço — vale a distância até o traço inteiro
      let melhor = null, dist = 34;
      for (const i of lista) {
        let d;
        if (m === 'rua') {
          const [a, b] = GEO.arestas[i].v.map(pos);
          const [ax, ay] = tela(local(a.x + (b.x - a.x) * 0.2, a.y + (b.y - a.y) * 0.2, Y_RUA));
          const [bx, by] = tela(local(b.x + (a.x - b.x) * 0.2, b.y + (a.y - b.y) * 0.2, Y_RUA));
          const vx = bx - ax, vy = by - ay;
          const k = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
          d = Math.hypot(x - (ax + vx * k), y - (ay + vy * k));
        } else {
          const [px, py] = tela(local(pos(i).x, pos(i).y, m === 'predio' ? ALT_BASE + 0.03 : Y_RUA));
          d = Math.hypot(x - px, y - py);
        }
        if (d < dist) { dist = d; melhor = i; }
      }
      return melhor === null ? null : { i: melhor };
    },

    // Um toque escolhe; dois toques no mesmo lugar confirmam.
    toca(alvo) {
      const t = agora();
      if (ultimoToque && ultimoToque.i === alvo.i && t - ultimoToque.t < DUPLO_MS && escolhido === alvo.i) {
        ultimoToque = null;
        confirma();
        return;
      }
      ultimoToque = { i: alvo.i, t };
      escolhe(alvo.i);
    },

    botoes(barra) {
      const vw = v();
      if (!vw?.you || vw.phase === 'gameEnd') return;
      const b = (txt, cor, fn) => barra.appendChild(ctx.botao(txt, cor, fn));
      const m = modoAtual();
      if (m && escolhido !== null) {
        b(m === 'fiscal' ? 'Mandar o fiscal aqui'
          : m === 'casa' ? (vw.phase === 'colocacao' ? 'Pôr a casa aqui' : 'Levantar a casa aqui')
            : m === 'rua' ? (vw.phase === 'mutirao' ? 'Rua de graça aqui' : vw.phase === 'colocacao' ? 'Pôr a rua aqui' : 'Fazer a rua aqui')
              : 'Subir o prédio aqui', 'primario', confirma);
      }
      if (!agindo()) return;
      if (vw.phase === 'rolar') b('Rolar os dados', 'primario', () => ctx.sendAction({ a: 'rolar' }));
      if (vw.phase === 'descarte' && vw.descartes?.[0]?.id === eu()) b('Devolver material', 'primario', () => { fecha(); modalDeDescarte(); });
      if (vw.phase === 'mutirao') b('Parar o mutirão', 'normal', () => ctx.sendAction({ a: 'passar' }));
      if (vw.phase === 'acoes') {
        if (modoEscolhido) b('Cancelar', 'normal', () => { modoEscolhido = null; escolhido = null; arrumaMarcas(); ctx.atualizaBotoes(); mostraTextoDaVez(); });
        else {
          if (escolhido === null) b('Construir', 'primario', () => abre('construir'));
          b('Trocar', 'normal', () => abre('troca', { aba: 'fornecedor', da: null, quer: null, dou: zerados(), quero: zerados() }));
          b('Passar a vez', 'normal', () => { modoEscolhido = null; escolhido = null; ctx.sendAction({ a: 'passar' }); });
        }
      }
    },

    textoDaVez() { return falando ? falando.texto : textoBase(); },

    evento(ev) {
      const vw = v();
      const tab_ = vw?.tabuleiro || [];
      switch (ev.e) {
        case 'roundStart':
          for (const p of pecas.values()) tab.remove(p.obj);
          pecas.clear(); chegadas.clear(); pendentes.length = 0; limpaVoos(); casaDaColocacao.clear();
          modoEscolhido = null; escolhido = null; ultimoRoubo = 0; chaveDoModalDeFase = null;
          fiscalNaMesa = null; conePara = null; brilho = null; dadosDaMesa = null; rolagem = null;
          for (const d of dados) d.visible = false;
          if (modalPx) fecha();
          fila.length = 0;
          break;
        case 'inicio':
          anuncia(souEu(ev.p) ? 'Você começa: ponha a sua primeira casa.' : `${nome(ev.p)} começa a colocação.`, 2400);
          break;
        case 'vez':
          if (souEu(ev.p)) anuncia('Sua vez!', 1200);
          break;
        case 'rolou': {
          ctx.verbo(ev.p, `TIROU ${ev.soma}`);
          pendentes.push(() => rolaOsDados(ev));
          const meu = ev.ganhos?.[eu()];
          if (ev.soma === 7) { anuncia(`${nome(ev.p)} tirou 7: dia de fiscalização!`, 2400); break; }
          const txt = `${souEu(ev.p) ? 'Você tirou' : `${nome(ev.p)} tirou`} ${ev.soma}`;
          anuncia(meu ? `${txt}: você recebe ${listaDeMaterial(meu)}.` : `${txt}.`);
          if (ev.faltou?.length) anuncia(`O fornecedor ficou sem ${ev.faltou.map((r) => NOME_DO_RECURSO[r]).join(' e ')}: ninguém recebe.`, 2400);
          break;
        }
        case 'fiscalizacao':
          if (ev.quem.some((q) => souEu(q.p))) anuncia(`Você tem mais de ${LIMITE_DA_MAO} cartas: devolva a metade.`, 2400);
          break;
        case 'descartou':
          if (!souEu(ev.p)) anuncia(`${nome(ev.p)} devolveu ${listaDeMaterial(ev.recursos)}${ev.cacamba ? ' na caçamba' : ''}.`);
          pendentes.push(() => {
            // o material apreendido vai para o cone do fiscal
            let k = 0;
            for (const r of RECURSOS) for (let i = 0; i < Math.min(3, ev.recursos[r] || 0); i++) mandaFicha(r, pontoDe(ev.p, r), cone.position.clone().setY(ALT_BASE + 0.03), { atraso: 90 * k++ });
          });
          break;
        case 'cacambaRecolhida':
          anuncia('O caminhão recolheu a caçamba: o material voltou ao fornecedor.');
          break;
        case 'fiscal': {
          const lugar = nomeDoLote(tab_, ev.h);
          const roubo = vw?.roubo;
          let txt = `${souEu(ev.p) ? 'Você mandou' : `${nome(ev.p)} mandou`} o fiscal para ${lugar}`;
          let res = null;
          if (ev.de && ev.levou && roubo && roubo.seq !== ultimoRoubo) {
            ultimoRoubo = roubo.seq;
            res = roubo.res || null;
            if (souEu(ev.p)) txt += ` e levou 1 ${NOME_DO_RECURSO[roubo.res]} de ${nome(ev.de)}`;
            else if (souEu(ev.de)) txt += ` e levou 1 ${NOME_DO_RECURSO[roubo.res]} seu`;
            else txt += ` e levou 1 material de ${nome(ev.de)}`;
            reage(ev.de, 'bravo');
            const de = ev.de, para = ev.p;
            pendentes.push(() => mandaFicha(res, pontoDe(de, res), pontoDe(para, res), { atraso: 760, dur: 700, arco: 0.2, paraMim: souEu(para) }));
          } else if (ev.de) txt += `, mas ${nome(ev.de)} não tinha material`;
          ctx.verbo(ev.p, 'FISCAL!');
          anuncia(`${txt}.`, 2400);
          break;
        }
        case 'construiu':
          chegadas.set(ev.tipo === 'rua' ? `r${ev.a}` : `v${ev.v}`, ev.p);
          if (ev.inicial && ev.tipo === 'casa') casaDaColocacao.set(ev.p, ev.v);
          if (!souEu(ev.p)) ctx.verbo(ev.p, ev.tipo === 'rua' ? 'RUA' : ev.tipo === 'casa' ? 'CASA!' : 'PRÉDIO!');
          if (!souEu(ev.p) && !ev.inicial) {
            anuncia(ev.tipo === 'rua' ? `${nome(ev.p)} fez uma rua${ev.gratis ? ' (mutirão)' : ''}.`
              : ev.tipo === 'casa' ? `${nome(ev.p)} levantou uma casa.` : `${nome(ev.p)} subiu um prédio!`, 1500);
          }
          if (ev.tipo === 'predio') reage(ev.p, 'feliz');
          break;
        case 'recebeu':
          // a 2ª casa da colocação: um material de cada terreno em volta
          pendentes.push(() => {
            let k = 0;
            for (const r of RECURSOS) for (let i = 0; i < (ev.recursos[r] || 0); i++) {
              const h = GEO.vertices[casaDaColocacao.get(ev.p) ?? -1]?.hexes.find((x) => PRODUZ[v().tabuleiro[x]?.t] === r);
              const de = h != null ? lotes[h].centro.clone().setY(ALT_BASE + 0.02) : local(0, 0, 0.05);
              mandaFicha(r, de, pontoDe(ev.p, r), { atraso: 500 + 110 * k++, paraMim: souEu(ev.p) });
            }
          });
          break;
        case 'comprouCarta':
          anuncia(souEu(ev.p) ? 'Você comprou uma carta de obra.' : `${nome(ev.p)} comprou uma carta de obra.`, 1600);
          pendentes.push(() => mandaCarta(ev.p));
          break;
        case 'cartaJogada':
          ctx.verbo(ev.p, NOME_DA_CARTA[ev.tipo].toUpperCase());
          if (!souEu(ev.p)) anuncia(`${nome(ev.p)} jogou ${NOME_DA_CARTA[ev.tipo]}.`);
          break;
        case 'achado':
          anuncia(`${souEu(ev.p) ? 'Você achou' : `${nome(ev.p)} achou`} ${listaDeMaterial(ev.recursos)}${ev.daCacamba ? ' na caçamba' : ''}.`);
          pendentes.push(() => { let k = 0; for (const r of RECURSOS) for (let i = 0; i < (ev.recursos[r] || 0); i++) mandaFicha(r, local(0, 0, 0.05), pontoDe(ev.p, r), { atraso: 120 * k++, paraMim: souEu(ev.p) }); });
          break;
        case 'arremate': {
          const meu = ev.de?.[eu()];
          anuncia(souEu(ev.p) ? `Arremate: você juntou ${ev.total} ${NOME_DO_RECURSO[ev.recurso]}.`
            : `Arremate de ${nome(ev.p)}: ${ev.total} ${NOME_DO_RECURSO[ev.recurso]}${meu ? ` (${meu} seus)` : ''}.`, 2400);
          if (!souEu(ev.p) && meu) ctx.cara(ev.p, 'feliz');
          pendentes.push(() => {
            let k = 0;
            for (const [id, n] of Object.entries(ev.de || {})) for (let i = 0; i < Math.min(3, n); i++) mandaFicha(ev.recurso, pontoDe(id, ev.recurso), pontoDe(ev.p, ev.recurso), { atraso: 110 * k++, paraMim: souEu(ev.p) });
          });
          break;
        }
        case 'banca':
          if (!souEu(ev.p)) {
            anuncia(`${nome(ev.p)} trocou ${ev.taxa * ev.n} ${NOME_DO_RECURSO[ev.da]} por ${ev.n} ${NOME_DO_RECURSO[ev.quer]} no fornecedor.`);
            ctx.verbo(ev.p, 'TROCOU');
          }
          break;
        case 'oferta':
          if (!souEu(ev.p)) anuncia(`${nome(ev.p)} quer trocar ${listaDeMaterial(ev.da)} por ${listaDeMaterial(ev.quer)}.`, 2400);
          break;
        case 'respondeu':
          if (vw?.oferta?.de === eu() && ev.aceita) anuncia(`${nome(ev.p)} aceitou a sua oferta.`);
          if (!souEu(ev.p)) ctx.verbo(ev.p, ev.aceita ? 'ACEITO' : 'NÃO');
          break;
        case 'trocou':
          if (souEu(ev.p) || souEu(ev.com)) anuncia(`Troca feita com ${nome(souEu(ev.p) ? ev.com : ev.p)}.`);
          else anuncia(`${nome(ev.p)} trocou com ${nome(ev.com)}.`);
          pendentes.push(() => {
            let k = 0;
            for (const r of RECURSOS) {
              for (let i = 0; i < Math.min(2, ev.da[r] || 0); i++) mandaFicha(r, pontoDe(ev.p, r), pontoDe(ev.com, r), { atraso: 100 * k++, paraMim: souEu(ev.com) });
              for (let i = 0; i < Math.min(2, ev.quer[r] || 0); i++) mandaFicha(r, pontoDe(ev.com, r), pontoDe(ev.p, r), { atraso: 100 * k++, paraMim: souEu(ev.p) });
            }
          });
          break;
        case 'avenida':
          if (ev.p) {
            anuncia(`${souEu(ev.p) ? 'Você tem' : `${nome(ev.p)} tem`} a Avenida Principal: ${ev.n} ruas seguidas (+2).`, 2600);
            ctx.verbo(ev.p, 'AVENIDA!');
            reage(ev.p, 'feliz');
          } else if (ev.de) anuncia(`A Avenida Principal de ${nome(ev.de)} foi cortada e ficou sem dono.`, 2400);
          break;
        case 'equipe':
          anuncia(`${souEu(ev.p) ? 'Você tem' : `${nome(ev.p)} tem`} a Maior Equipe: ${ev.n} mestres de obras (+2).`, 2600);
          ctx.verbo(ev.p, 'EQUIPE!');
          reage(ev.p, 'feliz');
          break;
        case 'venceu':
          ctx.verbo(ev.p, 'VENCEU!');
          reage(ev.p, 'feliz');
          fila.length = 0;
          break;
        default:
          break;
      }
    },

    // O placar, na caixa da 3D: no fim, quem chegou a 10 e as Obras Públicas
    // que estavam escondidas; no meio, os pontos à vista.
    desenhaPlacar(corpo, acoes) {
      const vw = v();
      const fim = vw.phase === 'gameEnd';
      const lr = vw.lastRound || {};
      const tabela = document.createElement('table');
      tabela.innerHTML = '<tr><th>Jogador</th><th style="text-align:right">Casas</th><th style="text-align:right">Prédios</th><th style="text-align:right">Pts</th></tr>';
      for (const p of [...vw.players].sort((a, b) => b.pontos - a.pontos)) {
        let casas = 0; let predios = 0;
        for (const c of Object.values(vw.construcoes || {})) if (c.p === p.id) { if (c.tipo === 'casa') casas++; else predios++; }
        const obras = fim ? (p.obras?.length || 0) : 0;
        const extras = [vw.avenida?.id === p.id ? 'Avenida' : '', vw.equipe?.id === p.id ? 'Equipe' : '', obras ? plural(obras, 'obra', 'obras') : ''].filter(Boolean).join(' · ');
        tabela.appendChild(ctx.linhaDoPlacar(p, `${ctx.nomeDe(p)}${extras ? ` · ${extras}` : ''}`, fim && vw.vencedor === p.id, casas, predios, p.pontos));
      }
      if (fim) {
        const q = jogador(vw.vencedor);
        if (q) corpo.appendChild(ctx.palcoDe(q));
        corpo.append(...ctx.cabecalho(souEu(vw.vencedor) ? 'Você ganhou!' : `${q ? q.name : '…'} ganhou!`,
          lr.motivo === 'teto' ? 'A partida bateu o limite de vezes: ganha quem tinha mais pontos.' : `Puxadinho · chegou a ${lr.pontos?.[vw.vencedor]} pontos na própria vez.`));
        corpo.appendChild(tabela);
        const obras = Object.entries(lr.obras || {}).filter(([, l]) => l.length).map(([id, l]) => `${nome(id)}: ${l.join(', ')}`).join(' · ');
        if (obras) { const p = document.createElement('p'); p.className = 'espera'; p.textContent = `Obras Públicas escondidas — ${obras}.`; corpo.appendChild(p); }
        if (ctx.souAnfitriao()) acoes.appendChild(ctx.acaoDoPlacar('Jogar de novo', true, () => ctx.enviaAoServidor({ t: 'playAgain' })));
        else { const e = document.createElement('p'); e.className = 'espera'; e.textContent = 'Esperando o anfitrião decidir…'; corpo.appendChild(e); }
        acoes.appendChild(ctx.acaoDoPlacar('Sair da sala', false, () => {
          try { localStorage.removeItem('cacamba-session'); localStorage.removeItem('cacamba-selo'); } catch { /* modo privado */ }
          location.href = '/';
        }));
        return;
      }
      corpo.append(...ctx.cabecalho('Placar', `Puxadinho · ganha quem chega a ${vw.meta} pontos na própria vez`));
      corpo.appendChild(tabela);
      const p = document.createElement('p');
      p.className = 'espera';
      p.textContent = `Casa 1 ponto, prédio 2, Avenida Principal 2 (${AVENIDA_MINIMA}+ ruas seguidas), Maior Equipe 2 (${EQUIPE_MINIMA}+ mestres jogados), Obra Pública 1 (escondida). ${vw.cartasNoMonte} cartas de obra no monte.`;
      corpo.appendChild(p);
    },
  };
  return api;
}

// O que esta mesa desenha em HTML por cima do canvas. A 3D não carrega o
// style.css do jogo: as variáveis que o puxadinho.css usa vêm daqui.
const CSS = `
body.px3 {
  --cream: #f5f1e6; --felt-line: rgba(140, 106, 69, 0.55); --gold: #f2c14e; --gold-soft: #c9a24e; --ink: #232a33; --sage: #cad6be;
  --font-display: 'Paytone One', 'Arial Black', sans-serif; --font-body: 'Nunito', system-ui, sans-serif;
}
.px3 .btn {
  border: 1px solid rgba(140, 106, 69, 0.5); border-radius: 12px; padding: 7px 12px; min-height: 36px; cursor: pointer;
  font: 900 0.8rem Nunito, sans-serif; color: #f5f1e6; background: rgba(0, 0, 0, 0.45);
}
.px3 .btn-primary { background: linear-gradient(180deg, #ffd473, #f2c14e); color: #3d2c07; border-color: #f2c14e; }
.px3 .btn-ghost { background: transparent; }
.px3 .soft-disabled { opacity: 0.5; }

.px3-eu {
  position: fixed; z-index: 4; left: 50%; transform: translateX(-50%); bottom: max(8px, env(safe-area-inset-bottom));
  width: min(560px, calc(100vw - 16px)); padding: 7px 8px 8px; border-radius: 16px;
  background: rgba(20, 12, 7, 0.86); border: 1px solid rgba(140, 106, 69, 0.5); box-shadow: 0 10px 30px -8px #000;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
}
.px3-eu[hidden] { display: none; }
.px3-eu .px-rec { background: rgba(0, 0, 0, 0.32); }
.px3-eu .px-rec-nome { color: #cad6be; }
.px3-linha { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 12px; font-size: 0.72rem; font-weight: 700; color: #cad6be; }
.px3-pts {
  border: 1px solid rgba(242, 193, 78, 0.5); background: rgba(0, 0, 0, 0.35); color: #f5f1e6; border-radius: 999px;
  padding: 3px 10px; font: 800 0.74rem Nunito, sans-serif; cursor: pointer; min-height: 30px;
}
.px3-pts strong { font-family: 'Paytone One', 'Arial Black', sans-serif; font-weight: 400; font-size: 1rem; color: #f2c14e; }
.px3-dados { display: inline-flex; align-items: center; gap: 3px; }
.px3-dados svg { width: 18px; height: 18px; }
.px3-dados rect { fill: #f5f1e6; stroke: #1a1b1c; stroke-width: 1.2; }
.px3-dados circle { fill: #232a33; }
.px3-dados.sete rect { fill: #f3b7a8; }
.px3-dados b { font-family: 'Paytone One', 'Arial Black', sans-serif; font-weight: 400; color: #f5f1e6; margin-left: 2px; }
.px3-eu .px-carta { min-height: 34px; padding: 4px 10px; }
@media (max-width: 420px) {
  .px3-eu .px-rec { min-width: 0; flex-basis: 56px; padding: 4px 2px 3px; }
  .px3-eu .px-rec .px-ficha { width: 26px; height: 26px; }
  .px3-eu .px-rec-nome { font-size: 0.56rem; }
  .px3-pecas { display: none; }
}

.px3-oferta {
  position: fixed; z-index: 6; left: 50%; transform: translateX(-50%); top: max(118px, calc(env(safe-area-inset-top) + 106px));
  width: min(520px, calc(100vw - 16px)); background: rgba(20, 12, 7, 0.92); border-color: rgba(242, 193, 78, 0.55);
}
@media (min-aspect-ratio: 1/1) { .px3-oferta { top: 58px; } }

.px3-modal .visor-caixa { width: min(520px, 100%); }
.px3-modal .visor-corpo { color: #f5f1e6; font-size: 0.88rem; }
.px3-modal .visor-corpo p { margin: 6px 0; }
.px3-modal .px-opcao, .px3-modal .px-esc, .px3-modal .px-col, .px3-modal .px-mm { background: rgba(0, 0, 0, 0.3); }
.px3-modal .px-aba { color: #cad6be; }
.px3-dica { color: #cad6be; font-size: 0.78rem; }
.px3-modal .px3-vitima { grid-template-columns: auto 1fr; grid-template-areas: 'img nome' 'img motivo'; gap: 2px 12px; }
.px3-modal .px3-vitima img { grid-area: img; border-radius: 50%; background: #1b110b; box-shadow: 0 0 0 2px var(--anel, #8c6a45); }
.visor-acao.desligada { opacity: 0.5; cursor: default; }
`;
