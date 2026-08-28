// ============================================================================
// Caçamba — a mesa em 3D (three.js)
//
// É a MESMA partida, vista da sua cadeira: o servidor continua sendo o juiz e
// esta tela é só outra janela para o mesmo estado — ela entra com a sessão
// guardada, recebe as mesmas visões e manda as mesmas ações do cliente normal.
//
// O que ela desenha: o salão na penumbra, a mesa redonda sob a lâmpada, o
// elenco sentado em volta (as figuras chapadas, em pé no espaço — foi para
// isso que elas foram desenhadas frontais), o monte com espessura de verdade,
// o descarte, os jogos baixados deitados no feltro e a sua mão em leque.
//
// O que ela NÃO tenta: reimplementar regra. Os palpites de interface (posso
// baixar?) vêm do mesmo /shared/engine.js do cliente normal; jogadas finas
// (encaixe, troca de coringa, arrumar a mão) continuam na mesa normal — o
// botão de voltar está sempre à vista.
// ============================================================================

import * as THREE from './vendor/three.module.js';
import { planBaixada, isJoker, rankLabel } from '/shared/engine.js';
import { SLUGS, EXPRESSOES, personagemValido, personagemDoAssento, peleDe } from '/shared/elenco.js';

const $ = (id) => document.getElementById(id);
const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Sessão e servidor — o mesmo caminho do cliente normal
// ---------------------------------------------------------------------------

let ws = null;
let view = null;
let sessao = null;
try { sessao = JSON.parse(localStorage.getItem('cacamba-session')); } catch { /* ok */ }

const me = () => sessao?.playerId;

function aviso(texto, fixo = false) {
  const el = $('aviso');
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(aviso.t);
  if (!fixo) aviso.t = setTimeout(() => { el.hidden = true; }, 3200);
}

function sendAction(action) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'action', action }));
}

function conecta() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({
    t: 'resume', code: sessao.code, playerId: sessao.playerId, token: sessao.token,
  }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'state') {
      const primeira = !view;
      view = msg.view;
      for (const ev of msg.events || []) reageAoEvento(ev);
      sincroniza(primeira);
    } else if (msg.t === 'lobby' && !msg.started) {
      aviso('A partida ainda não começou — comece pela mesa normal.', true);
    } else if (msg.t === 'error') {
      aviso(`⚠️ ${msg.msg}`);
    } else if (msg.t === 'gone') {
      aviso('A sala não existe mais. Voltando…', true);
      setTimeout(() => { location.href = '/'; }, 1500);
    }
  };
  ws.onclose = () => setTimeout(conecta, 1200);
}

// ---------------------------------------------------------------------------
// Cena: salão, mesa e luz
// ---------------------------------------------------------------------------

const canvas = $('cena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17100a);
// A penumbra do salão é neblina, não parede: o que está longe some no escuro,
// como na mesa normal — só que aqui de verdade, por distância.
scene.fog = new THREE.FogExp2(0x17100a, 0.075);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 40);

const MESA_TOPO = 0.92;

// A lâmpada é a mesma decisão de luz do jogo inteiro: uma fonte só, a pino
// sobre o meio. O foco ilumina o feltro; o ambiente quente e fraco é o que
// sobra refletido no salão.
scene.add(new THREE.AmbientLight(0x8c6a45, 0.85));
// O reflexo do feltro: uma luz fraca vinda do lado da câmera, para o elenco do
// outro lado não ficar só silhueta — o foco da lâmpada ilumina a mesa, não os
// rostos.
const reflexo = new THREE.DirectionalLight(0xffe2a8, 0.6);
reflexo.position.set(0, 2.4, 5);
scene.add(reflexo);
const foco = new THREE.SpotLight(0xffe2a8, 140, 14, 0.72, 0.55, 1.6);
foco.position.set(0, 4.4, 0);
foco.target.position.set(0, MESA_TOPO, 0);
scene.add(foco, foco.target);

// chão de tábuas escuras — só um disco com gradiente; a neblina faz o resto
{
  const tex = texturaDeCanvas(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 180);
    g.addColorStop(0, '#33200f');
    g.addColorStop(1, '#150d07');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  const chao = new THREE.Mesh(
    new THREE.CircleGeometry(16, 40),
    new THREE.MeshLambertMaterial({ map: tex }),
  );
  chao.rotation.x = -Math.PI / 2;
  scene.add(chao);
}

// a mesa: tampo de feltro com aro de madeira
{
  const feltro = texturaDeCanvas(512, 512, (ctx) => {
    const g = ctx.createRadialGradient(256, 236, 40, 256, 256, 260);
    g.addColorStop(0, '#1e6a50');
    g.addColorStop(0.55, '#12452f');
    g.addColorStop(1, '#082519');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  });
  const tampo = new THREE.Mesh(
    new THREE.CylinderGeometry(2.55, 2.55, 0.16, 48),
    [
      new THREE.MeshLambertMaterial({ color: 0x3e2717 }),                // lateral
      new THREE.MeshLambertMaterial({ map: feltro }),                    // topo
      new THREE.MeshLambertMaterial({ color: 0x1b110b }),                // fundo
    ],
  );
  tampo.position.y = MESA_TOPO - 0.08;
  scene.add(tampo);

  const aro = new THREE.Mesh(
    new THREE.TorusGeometry(2.62, 0.14, 12, 48),
    new THREE.MeshLambertMaterial({ color: 0x4a2c19 }),
  );
  aro.rotation.x = Math.PI / 2;
  aro.position.y = MESA_TOPO - 0.04;
  scene.add(aro);

  const pe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.62, MESA_TOPO - 0.1, 20),
    new THREE.MeshLambertMaterial({ color: 0x2a1b12 }),
  );
  pe.position.y = (MESA_TOPO - 0.1) / 2;
  scene.add(pe);
}

// a cúpula da lâmpada, pendurada sobre o meio
{
  const cupula = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 0.42, 24, 1, true),
    new THREE.MeshLambertMaterial({ color: 0x2a1b12, side: THREE.DoubleSide }),
  );
  cupula.position.set(0, 3.35, 0);
  const bulbo = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3d0 }),
  );
  bulbo.position.set(0, 3.18, 0);
  const fio = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 3, 6),
    new THREE.MeshLambertMaterial({ color: 0x8c6a45 }),
  );
  fio.position.set(0, 4.9, 0);
  scene.add(cupula, bulbo, fio);
}

// ---------------------------------------------------------------------------
// Texturas desenhadas: cartas, rótulos
// ---------------------------------------------------------------------------

function texturaDeCanvas(w, h, desenha) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  desenha(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const SUIT_RED = [false, true, true, false]; // ♠ ♥ ♦ ♣

function desenhaNaipe(ctx, suit, x, y, s, cor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = cor;
  ctx.beginPath();
  if (suit === 1) { // copas
    ctx.moveTo(50, 92);
    ctx.bezierCurveTo(14, 60, 6, 38, 20, 22);
    ctx.bezierCurveTo(34, 8, 50, 20, 50, 34);
    ctx.bezierCurveTo(50, 20, 66, 8, 80, 22);
    ctx.bezierCurveTo(94, 38, 86, 60, 50, 92);
  } else if (suit === 2) { // ouros
    ctx.moveTo(50, 4); ctx.lineTo(88, 50); ctx.lineTo(50, 96); ctx.lineTo(12, 50);
  } else if (suit === 0) { // espadas
    ctx.moveTo(50, 6);
    ctx.bezierCurveTo(66, 26, 88, 42, 88, 60);
    ctx.bezierCurveTo(88, 76, 68, 82, 56, 72);
    ctx.bezierCurveTo(58, 84, 64, 90, 70, 94);
    ctx.lineTo(30, 94);
    ctx.bezierCurveTo(36, 90, 42, 84, 44, 72);
    ctx.bezierCurveTo(32, 82, 12, 76, 12, 60);
    ctx.bezierCurveTo(12, 42, 34, 26, 50, 6);
  } else { // paus
    ctx.arc(50, 30, 17, 0, Math.PI * 2);
    ctx.moveTo(29 + 17, 58); ctx.arc(29, 58, 17, 0, Math.PI * 2);
    ctx.moveTo(71 + 17, 58); ctx.arc(71, 58, 17, 0, Math.PI * 2);
    ctx.moveTo(56, 94); ctx.lineTo(44, 94);
    ctx.bezierCurveTo(50, 82, 50, 70, 47, 60);
    ctx.lineTo(53, 60);
    ctx.bezierCurveTo(50, 70, 50, 82, 56, 94);
  }
  ctx.fill();
  ctx.restore();
}

// mesmo arranjo do cliente normal: um naipe por unidade
const ARRANJO_PIPS = {
  2: [[50, 8], [50, 92]],
  3: [[50, 8], [50, 50], [50, 92]],
  4: [[26, 8], [74, 8], [26, 92], [74, 92]],
  5: [[26, 8], [74, 8], [50, 50], [26, 92], [74, 92]],
  6: [[26, 8], [74, 8], [26, 50], [74, 50], [26, 92], [74, 92]],
  7: [[26, 8], [74, 8], [50, 29], [26, 50], [74, 50], [26, 92], [74, 92]],
  8: [[26, 8], [74, 8], [50, 29], [26, 50], [74, 50], [50, 71], [26, 92], [74, 92]],
  9: [[26, 6], [74, 6], [26, 35], [74, 35], [50, 50], [26, 65], [74, 65], [26, 94], [74, 94]],
  10: [[26, 6], [74, 6], [50, 20], [26, 35], [74, 35], [26, 65], [74, 65], [50, 80], [26, 94], [74, 94]],
};

// mesma conta do cliente normal, para o MESMO rosto cair na mesma carta
function figuraDaCarta(card) {
  if (isJoker(card) || card.rank < 11) return null;
  const n = SLUGS.length;
  const casa = (card.rank - 11) * 4 + card.suit;
  return SLUGS[(casa + Math.floor(casa / n) * 2) % n];
}

const imagens = new Map();     // url → HTMLImageElement (carregada)
function pegaImagem(url) {
  if (imagens.has(url)) return imagens.get(url);
  const prom = fetch(url)
    .then((r) => r.text())
    .then((texto) => new Promise((res) => {
      // Safari só rasteriza SVG em canvas quando o SVG declara width/height.
      let t = texto;
      if (!/<svg[^>]*\swidth=/.test(t)) {
        const m = t.match(/viewBox="0 0 (\d+) (\d+)"/);
        if (m) t = t.replace('<svg ', `<svg width="${m[1]}" height="${m[2]}" `);
      }
      const img = new Image();
      img.onload = () => res(img);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}`;
    }));
  imagens.set(url, prom);
  return prom;
}

const texturasDeCarta = new Map();  // chave → material
function chaveDaCarta(card) {
  return isJoker(card) ? 'joker' : `${card.rank}:${card.suit}`;
}

function materialDaCarta(card) {
  const chave = chaveDaCarta(card);
  if (texturasDeCarta.has(chave)) return texturasDeCarta.get(chave);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 358;
  const ctx = c.getContext('2d');
  desenhaFrente(ctx, card);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  texturasDeCarta.set(chave, mat);
  // O retrato das figuras chega depois (a imagem é assíncrona): desenha de
  // novo por cima quando carregar.
  const slug = figuraDaCarta(card);
  if (slug) {
    pegaImagem(`/assets/personagens/${slug}-avatar.svg`).then((img) => {
      const lado = 150;
      ctx.drawImage(img, (256 - lado) / 2, 358 * 0.52 - lado / 2, lado, lado);
      tex.needsUpdate = true;
    });
  }
  return mat;
}

function desenhaFrente(ctx, card) {
  const W = 256; const H = 358;
  const joker = isJoker(card);
  arredondado(ctx, 0, 0, W, H, 22);
  const g = ctx.createLinearGradient(0, 0, 40, H);
  if (joker) {
    g.addColorStop(0, '#ffdc85'); g.addColorStop(0.42, '#f2c14e'); g.addColorStop(1, '#c9a24e');
  } else {
    g.addColorStop(0, '#fffdf6'); g.addColorStop(0.46, '#f5f1e6'); g.addColorStop(1, '#ded6c3');
  }
  ctx.fillStyle = g;
  ctx.fill();

  const cor = joker ? '#33240a' : (SUIT_RED[card.suit] ? '#c93a3a' : '#232a33');
  const rank = joker ? 'C' : rankLabel(card.rank);

  // os dois cantos, o de baixo de cabeça para baixo
  for (const virado of [false, true]) {
    ctx.save();
    if (virado) { ctx.translate(W, H); ctx.rotate(Math.PI); }
    ctx.fillStyle = cor;
    ctx.font = '900 44px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(rank, 30, 46);
    if (joker) desenhaGorro(ctx, 12, 54, 38, cor);
    else desenhaNaipe(ctx, card.suit, 12, 54, 38, cor);
    ctx.restore();
  }

  if (joker) {
    desenhaGorro(ctx, 58, 110, 140, cor);
  } else if (card.rank === 1) {
    desenhaNaipe(ctx, card.suit, 78, 118, 100, cor);
  } else if (ARRANJO_PIPS[card.rank]) {
    // área central com folga dos cantos, como no cliente normal
    const x0 = W * 0.21; const x1 = W * 0.79;
    const y0 = H * 0.15; const y1 = H * 0.85;
    for (const [px, py] of ARRANJO_PIPS[card.rank]) {
      const x = x0 + ((x1 - x0) * px) / 100;
      const y = y0 + ((y1 - y0) * py) / 100;
      ctx.save();
      if (py > 50) { ctx.translate(x, y); ctx.rotate(Math.PI); ctx.translate(-x, -y); }
      desenhaNaipe(ctx, card.suit, x - 21, y - 21, 42, cor);
      ctx.restore();
    }
  }
  // figuras: o retrato entra assíncrono, em materialDaCarta
}

function desenhaGorro(ctx, x, y, s, cor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 100, s / 100);
  ctx.fillStyle = cor;
  ctx.beginPath();
  ctx.moveTo(16, 74); ctx.lineTo(25, 33); ctx.lineTo(39, 55); ctx.lineTo(50, 25);
  ctx.lineTo(61, 55); ctx.lineTo(75, 33); ctx.lineTo(84, 74);
  ctx.closePath(); ctx.fill();
  for (const [cx, cy] of [[25, 26], [50, 18], [75, 26]]) {
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function arredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// o verso: madeira com trama âmbar, o mesmo material da mesa normal
const materialVerso = (() => {
  const tex = texturaDeCanvas(128, 180, (ctx) => {
    arredondado(ctx, 0, 0, 128, 180, 12);
    const g = ctx.createLinearGradient(0, 0, 30, 180);
    g.addColorStop(0, '#7a4a2b'); g.addColorStop(0.58, '#4a2c19'); g.addColorStop(1, '#33200f');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(242,193,78,0.16)';
    ctx.lineWidth = 3;
    for (let i = -180; i < 180; i += 12) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 180, 180); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + 180, 0); ctx.lineTo(i, 180); ctx.stroke();
    }
    ctx.strokeStyle = '#f5f1e6';
    ctx.lineWidth = 8;
    arredondado(ctx, 4, 4, 120, 172, 10);
    ctx.stroke();
  });
  return new THREE.MeshLambertMaterial({ map: tex });
})();
const materialBorda = new THREE.MeshLambertMaterial({ color: 0xcbc2ae });

const CARTA_L = 0.42; const CARTA_A = 0.59;
const geoCarta = new THREE.PlaneGeometry(CARTA_L, CARTA_A);

function cartaDeitada(card) {
  const m = new THREE.Mesh(geoCarta, materialDaCarta(card));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// rótulo de texto flutuante (nome do jogador, contagem)
function rotulo(texto, corFundo = 'rgba(27,17,11,0.85)', corTexto = '#f5f1e6') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const ctx = c.getContext('2d');
  ctx.font = '900 34px Nunito, sans-serif';
  const w = Math.min(240, ctx.measureText(texto).width + 44);
  arredondado(ctx, (256 - w) / 2, 8, w, 56, 28);
  ctx.fillStyle = corFundo; ctx.fill();
  ctx.fillStyle = corTexto;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, 128, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sp.scale.set(0.9, 0.25, 1);
  return sp;
}

// ---------------------------------------------------------------------------
// O elenco sentado
// ---------------------------------------------------------------------------

const CORES_DE_ASSENTO = [
  '#F2C14E', '#3A7D6E', '#E4572E', '#8C6A45',
  '#C97AB0', '#5B8DC9', '#7FB069', '#B0605D',
];

function assentoDe(playerId) {
  const i = (view?.players || []).findIndex((p) => p.id === playerId);
  return i < 0 ? 0 : i;
}

function personagemDe(p) {
  return personagemValido(p.avatar) ? p.avatar : personagemDoAssento(assentoDe(p.id));
}

const assentos = new Map();   // playerId → { grupo, plano, texturas, nomeSprite, ... }

async function texturaDaFigura(slug, expressao) {
  const sufixo = expressao && (EXPRESSOES[slug] || []).includes(expressao)
    ? `-${expressao}` : '';
  const img = await pegaImagem(`/assets/personagens/${slug}-corpo-inteiro${sufixo}.svg`);
  const c = document.createElement('canvas');
  // 512x1024: anéis, pulseiras, correntes e pespontos são traços de poucas
  // unidades num quadro de 400 — a 256 de largura eles derretem.
  c.width = 512; c.height = 1024;
  c.getContext('2d').drawImage(img, 0, 0, 512, 1024);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

async function criaAssento(p) {
  const slug = personagemDe(p);
  const grupo = new THREE.Group();

  const [normal, feliz, bravo] = await Promise.all([
    texturaDaFigura(slug, null),
    texturaDaFigura(slug, 'feliz'),
    texturaDaFigura(slug, 'bravo'),
  ]);
  const mat = new THREE.MeshLambertMaterial({ map: normal, transparent: true, alphaTest: 0.06 });
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.1), mat);
  plano.position.y = 1.05;
  grupo.add(plano);

  // a cadeira é o anel do assento em outra forma, como na mesa normal
  const cor = new THREE.Color(CORES_DE_ASSENTO[assentoDe(p.id) % CORES_DE_ASSENTO.length]);
  const cadeira = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.05, 20),
    new THREE.MeshLambertMaterial({ color: cor }),
  );
  cadeira.position.y = 0.03;
  grupo.add(cadeira);

  // o leque de cartas viradas nas mãos, como na mesa normal: presença, não
  // contagem — o número exato fica no selo ao lado
  const leque = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const carta = new THREE.Mesh(geoCarta, materialVerso);
    carta.scale.setScalar(0.42);
    const ang = (i - 2) * 0.17;
    carta.position.set(Math.sin(ang) * 0.3, 0.02 + Math.cos(ang) * 0.02, i * 0.006);
    carta.rotation.z = -ang;
    leque.add(carta);
  }
  leque.position.set(0, 0.98, 0.14);
  grupo.add(leque);

  const nome = rotulo(p.name);
  nome.position.y = 2.16;
  grupo.add(nome);

  const contagem = rotulo('', 'rgba(27,17,11,0.92)', '#f2c14e');
  contagem.position.set(0.42, 1.62, 0.06);
  contagem.scale.set(0.55, 0.16, 1);
  grupo.add(contagem);

  // foco da vez: um disco de luz no chão, que pulsa
  const focoVez = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, depthWrite: false }),
  );
  focoVez.rotation.x = -Math.PI / 2;
  focoVez.position.y = 0.012;
  grupo.add(focoVez);

  scene.add(grupo);
  return { grupo, plano, leque, mat, texturas: { normal, feliz, bravo }, nome, contagem, focoVez, pulo: 0, caraAte: 0 };
}

// os adversários sentam no arco do outro lado; você fica na câmera
function posicaoDoAssento(indice, total) {
  const meio = (total - 1) / 2;
  const ang = total === 1 ? 0 : ((indice - meio) / Math.max(1, meio)) * 1.05; // ±60°
  const r = 2.8;
  return { x: Math.sin(ang) * r, z: -Math.cos(ang) * r, ang };
}

// ---------------------------------------------------------------------------
// Cartas na mesa: monte, descarte, jogos
// ---------------------------------------------------------------------------

const monte = (() => {
  const caixa = new THREE.Mesh(
    new THREE.BoxGeometry(CARTA_L, 0.2, CARTA_A),
    [materialBorda, materialBorda, materialVerso, materialBorda, materialBorda, materialBorda],
  );
  caixa.scale.set(0.8, 1, 0.8);
  caixa.position.set(-0.4, MESA_TOPO, -0.5);
  scene.add(caixa);
  const num = rotulo('', 'rgba(27,17,11,0.85)', '#9dbbad');
  num.position.set(-0.4, MESA_TOPO + 0.3, -0.2);
  num.scale.set(0.5, 0.15, 1);
  scene.add(num);
  return { caixa, num };
})();

const descarte = (() => {
  const grupo = new THREE.Group();
  grupo.position.set(0.4, 0, -0.5);
  scene.add(grupo);
  return { grupo, topoId: null };
})();

const jogosNaMesa = new THREE.Group();
scene.add(jogosNaMesa);

// ---------------------------------------------------------------------------
// A sua mão, presa à câmera
// ---------------------------------------------------------------------------

const maoGrupo = new THREE.Group();
camera.add(maoGrupo);
scene.add(camera);

const cartasDaMao = new Map();  // cardId → mesh
let selecionadas = new Set();

// As suas mãos segurando o leque: mesma construção da mesa normal (contorno
// escuro, pele por cima, halo por fora), com o tom de pele de quem você
// escolheu ser. Desenhadas no canvas — a única coisa que muda por personagem
// é a cor.
function texturaDaMao(pele) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const traco = (cor, w) => { ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };

  // Quem segura um leque mostra o POLEGAR e a beirada da palma na frente das
  // cartas — os dedos ficam atrás delas. Mão de dedos esticados lê como aceno,
  // não como pegada.

  // halo quente, para a mão não sumir contra a penumbra
  ctx.save();
  ctx.filter = 'blur(4px)';
  traco('#8c6a45', 26);
  ctx.beginPath(); ctx.moveTo(128, 250); ctx.lineTo(146, 120); ctx.stroke();
  ctx.restore();

  // beirada da palma, subindo da borda de baixo
  traco('#2a1b12', 104);
  ctx.beginPath(); ctx.moveTo(118, 272); ctx.lineTo(124, 202); ctx.stroke();
  traco(pele, 92);
  ctx.beginPath(); ctx.moveTo(118, 278); ctx.lineTo(124, 204); ctx.stroke();

  // o polegar atravessa na diagonal, por cima da frente das cartas
  traco('#2a1b12', 52);
  ctx.beginPath(); ctx.moveTo(108, 212); ctx.quadraticCurveTo(132, 162, 152, 114); ctx.stroke();
  traco(pele, 42);
  ctx.beginPath(); ctx.moveTo(110, 216); ctx.quadraticCurveTo(134, 164, 152, 118); ctx.stroke();
  // unha: um toque de luz seca na ponta, como as pérolas do elenco
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(148, 128, 7, 10, 0.5, 0, Math.PI * 2); ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const maos = { esq: null, dir: null, pele: null };
function sincronizaMaos() {
  const eu = view.players.find((p) => p.id === me());
  if (!eu) return;
  const pele = peleDe(personagemDe(eu));
  if (pele === maos.pele) return;
  maos.pele = pele;
  for (const lado of ['esq', 'dir']) {
    if (maos[lado]) maoGrupo.remove(maos[lado]);
    const mat = new THREE.MeshBasicMaterial({
      map: texturaDaMao(pele), transparent: true, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), mat);
    if (lado === 'esq') m.scale.x = -1;   // a esquerda é a direita espelhada
    maos[lado] = m;
    maoGrupo.add(m);
  }
}

function sincronizaMao() {
  const hand = [...(view.you?.hand || [])].sort(
    (a, b) => a.suit - b.suit || a.rank - b.rank,
  );
  selecionadas = new Set([...selecionadas].filter((id) => hand.some((c) => c.id === id)));

  for (const [id, mesh] of cartasDaMao) {
    if (!hand.some((c) => c.id === id)) { maoGrupo.remove(mesh); cartasDaMao.delete(id); }
  }
  const n = hand.length;
  // Largura visível na distância do leque, calculada da câmera de verdade:
  // é o que faz a mão caber tanto no monitor quanto no celular em pé.
  const dist = 1.3;
  const alturaVisivel = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
  const larguraVisivel = alturaVisivel * camera.aspect;
  const escala = Math.min(0.8, larguraVisivel / 1.9);
  const passo = n > 1
    ? Math.min(0.16 * escala, (larguraVisivel * 0.84 - CARTA_L * escala) / (n - 1))
    : 0;
  const baseY = -alturaVisivel * 0.40;
  hand.forEach((card, i) => {
    let mesh = cartasDaMao.get(card.id);
    if (!mesh) {
      mesh = new THREE.Mesh(geoCarta, materialDaCarta(card));
      mesh.userData.cardId = card.id;
      cartasDaMao.set(card.id, mesh);
      maoGrupo.add(mesh);
    }
    const meio = (n - 1) / 2;
    const sel = selecionadas.has(card.id);
    mesh.scale.setScalar(escala);
    mesh.position.set(
      (i - meio) * passo,
      baseY + Math.abs(i - meio) * -0.012 + (sel ? 0.1 * escala : 0),
      -dist + i * 0.004,
    );
    mesh.rotation.z = -(i - meio) * 0.05;
    mesh.rotation.x = -0.12;
  });

  // as mãos seguram o leque por baixo, com o polegar na frente das cartas
  sincronizaMaos();
  const larguraLeque = (n - 1) * passo + CARTA_L * escala;
  if (maos.esq && maos.dir) {
    const mostrar = n > 0;
    maos.esq.visible = mostrar; maos.dir.visible = mostrar;
    const yMao = baseY - 0.13 * escala;
    const zFrente = -dist + n * 0.004 + 0.02;
    maos.esq.position.set(-larguraLeque * 0.28, yMao, zFrente);
    maos.dir.position.set(larguraLeque * 0.28, yMao, zFrente);
    maos.esq.rotation.z = -0.18; maos.dir.rotation.z = 0.18;
    maos.esq.scale.set(-0.9 * escala, 0.9 * escala, 1);
    maos.dir.scale.set(0.9 * escala, 0.9 * escala, 1);
  }
}

// toque na mão: seleciona; os demais alvos são os botões HTML
const raycaster = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();
canvas.addEventListener('pointerdown', (e) => {
  ponteiro.x = (e.clientX / innerWidth) * 2 - 1;
  ponteiro.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(ponteiro, camera);
  const hits = raycaster.intersectObjects([...cartasDaMao.values()], false);
  if (hits.length) {
    const id = hits[0].object.userData.cardId;
    if (selecionadas.has(id)) selecionadas.delete(id);
    else selecionadas.add(id);
    sincronizaMao();
    montaBotoes();
  }
});

// leve paralaxe: a cabeça mexe um pouco com o dedo/mouse, como quem se inclina
let olharX = 0;
window.addEventListener('pointermove', (e) => {
  olharX = ((e.clientX / innerWidth) - 0.5) * 0.35;
});

// ---------------------------------------------------------------------------
// Botões de ação (HTML): as jogadas do turno
// ---------------------------------------------------------------------------

const barra = document.createElement('div');
barra.style.cssText = `position:fixed;left:50%;bottom:max(200px, 27vh);
  transform:translateX(-50%);display:flex;gap:8px;z-index:5;flex-wrap:wrap;justify-content:center;max-width:94vw;`;
document.body.appendChild(barra);

function botao(txt, cor, fn) {
  const b = document.createElement('button');
  b.textContent = txt;
  b.style.cssText = `white-space:nowrap;border:1px solid rgba(140,106,69,.5);border-radius:14px;padding:9px 13px;
    font:900 0.84rem Nunito,sans-serif;color:${cor === 'primario' ? '#3d2c07' : '#f5f1e6'};
    background:${cor === 'primario' ? 'linear-gradient(180deg,#ffd473,#f2c14e)' : cor === 'perigo' ? '#e4572e' : 'rgba(0,0,0,.45)'};cursor:pointer;`;
  b.onclick = fn;
  return b;
}

function montaBotoes() {
  barra.innerHTML = '';
  if (!view || !view.you) return;
  const minhaVez = view.turnId === me() && (view.phase === 'draw' || view.phase === 'play');
  if (view.phase === 'roundEnd' || view.phase === 'gameEnd') {
    barra.appendChild(botao('Ver o placar na mesa normal', 'primario', () => { location.href = '/'; }));
    return;
  }
  if (!minhaVez) return;
  if (view.phase === 'draw') {
    barra.appendChild(botao('Puxar do monte', 'normal', () => sendAction({ a: 'draw', source: 'deck' })));
    if (view.discardTop && view.discardBuyable) {
      barra.appendChild(botao('Pegar do meio', 'primario', () => sendAction({ a: 'draw', source: 'discard' })));
    }
    return;
  }
  // fase de jogar: baixar (o plano vem do mesmo motor) e descartar
  const ids = selecionadas.size ? [...selecionadas] : null;
  const plano = view.you.remaining
    ? planBaixada(view.you.hand, view.you.remaining, ids)
    : null;
  if (plano) {
    barra.appendChild(botao('Baixar jogo', 'primario', () => {
      sendAction({ a: 'baixar', ...(ids ? { cardIds: ids } : {}) });
      selecionadas.clear();
    }));
  }
  if (selecionadas.size === 1) {
    barra.appendChild(botao('Descartar', 'perigo', () => {
      sendAction({ a: 'discard', cardId: [...selecionadas][0] });
      selecionadas.clear();
    }));
  }
}

// ---------------------------------------------------------------------------
// Sincronia com o estado do servidor
// ---------------------------------------------------------------------------

let sincronizando = false;
async function sincroniza(primeira) {
  if (sincronizando) return;
  sincronizando = true;
  try {
    $('rot-rodada').textContent = `Rodada ${view.round + 1}/${view.totalRounds}`;
    $('rot-contrato').textContent = view.contract ? view.contract.label : '—';
    if (primeira) $('aviso').hidden = true;

    const outros = view.players.filter((p) => p.id !== me());
    for (const [id, a] of assentos) {
      if (!outros.some((p) => p.id === id)) { scene.remove(a.grupo); assentos.delete(id); }
    }
    for (let i = 0; i < outros.length; i++) {
      const p = outros[i];
      if (!assentos.has(p.id)) assentos.set(p.id, await criaAssento(p));
      const a = assentos.get(p.id);
      const pos = posicaoDoAssento(i, outros.length);
      a.grupo.position.set(pos.x, 0, pos.z);
      a.grupo.rotation.y = pos.ang;       // de frente para a mesa (e para você)
      trocaRotulo(a.contagem, `${p.handCount}`);
      a.leque.children.forEach((c, i) => { c.visible = i < Math.min(5, p.handCount); });
      a.naVez = view.turnId === p.id && view.phase !== 'roundEnd';
      a.apagado = (p.desistiu || (!p.isBot && !p.connected));
      a.mat.color.setScalar(a.apagado ? 0.45 : 1);
    }

    trocaRotulo(monte.num, String(view.deckCount));
    const alturaMonte = Math.max(0.03, Math.min(0.2, view.deckCount * 0.0022));
    monte.caixa.scale.y = alturaMonte / 0.2;
    monte.caixa.position.y = MESA_TOPO + alturaMonte / 2;

    // descarte: refeito quando o topo muda
    const topo = view.discardTop;
    const topoId = topo ? topo.id : null;
    if (topoId !== descarte.topoId) {
      descarte.topoId = topoId;
      descarte.grupo.clear();
      if (topo) {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(CARTA_L, 0.02 + view.discardCount * 0.0016, CARTA_A),
          materialBorda,
        );
        base.position.y = MESA_TOPO + base.geometry.parameters.height / 2;
        const face = cartaDeitada(topo);
        face.position.y = base.position.y + base.geometry.parameters.height / 2 + 0.002;
        face.rotation.z = 0.06;
        if (!semMovimento) { face.userData.cai = performance.now(); }
        descarte.grupo.add(base, face);
      }
    }

    // jogos baixados: deitados na frente de quem baixou
    jogosNaMesa.clear();
    const todos = [view.players.find((p) => p.id === me()), ...outros].filter(Boolean);
    for (const p of todos) {
      if (!p.melds?.length) continue;
      const meu = p.id === me();
      const idx = outros.indexOf(p);
      const pos = meu
        ? { x: 0, z: 1.35, ang: Math.PI }
        : posicaoDoAssento(idx, outros.length);
      const frente = new THREE.Group();
      // entre o assento e o centro, já sobre o feltro
      frente.position.set(pos.x * 0.55, MESA_TOPO + 0.004, pos.z * 0.55);
      frente.rotation.y = meu ? 0 : pos.ang;
      p.melds.forEach((meld, mi) => {
        meld.cards.forEach((card, ci) => {
          const carta = cartaDeitada(card);
          carta.scale.setScalar(0.62);
          carta.position.set(
            (ci - (meld.cards.length - 1) / 2) * 0.13,
            0.002 * (mi + 1),
            (mi - (p.melds.length - 1) / 2) * 0.42,
          );
          frente.add(carta);
        });
      });
      jogosNaMesa.add(frente);
    }

    sincronizaMao();
    montaBotoes();

    // aviso da vez
    if (view.phase === 'draw' || view.phase === 'play') {
      if (view.turnId === me()) {
        aviso(view.phase === 'draw' ? 'Sua vez: puxe uma carta.' : 'Baixe ou descarte.', true);
      } else {
        const dono = view.players.find((p) => p.id === view.turnId);
        aviso(`Vez de ${dono ? dono.name : '…'}`, true);
      }
    } else if (view.phase === 'roundEnd') {
      aviso('Fim da rodada — o placar está na mesa normal.', true);
    } else if (view.phase === 'gameEnd') {
      aviso('Fim de jogo! O resultado está na mesa normal.', true);
    }
  } finally {
    sincronizando = false;
  }
}

function trocaRotulo(sprite, texto) {
  if (sprite.userData.texto === texto) return;
  sprite.userData.texto = texto;
  const novo = rotulo(texto, 'rgba(27,17,11,0.9)', '#f2c14e');
  sprite.material.map = novo.material.map;
  sprite.material.needsUpdate = true;
}

// reações: cara e pulo, como na mesa normal
function reageAoEvento(ev) {
  const alvo = ev.p || ev.winnerId;
  const a = alvo ? assentos.get(alvo) : null;
  if (!a) return;
  const feliz = ['baixou', 'swapJoker', 'pegouCoringa'].includes(ev.e)
    || (ev.e === 'roundEnd' && ev.reason === 'bateu');
  const bravo = ev.e === 'claimVoid';
  if (feliz || bravo) {
    a.mat.map = feliz ? a.texturas.feliz : a.texturas.bravo;
    a.mat.needsUpdate = true;
    a.caraAte = performance.now() + 1900;
    a.pulo = performance.now();
  }
}

// ---------------------------------------------------------------------------
// Laço de desenho
// ---------------------------------------------------------------------------

// O enquadramento depende da tela: em pé (celular), o campo de visão vertical
// precisa abrir e a câmera recuar, senão o horizontal fica um túnel — fov
// vertical de 52° numa tela 9:19 dá só ~26° de largura, e a mesa some.
function encaixaTela() {
  const w = innerWidth; const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const emPe = Math.min(1, camera.aspect);
  camera.fov = Math.min(88, 52 / Math.max(0.62, emPe * 1.15));
  camera.position.set(0, 2.3 + (1 - emPe) * 0.55, 3.9 + (1 - emPe) * 1.3);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', encaixaTela);
encaixaTela();

function quadro(t) {
  requestAnimationFrame(quadro);

  // a cabeça acompanha o ponteiro de leve; a mesa continua o alvo
  camera.position.x += ((olharX * 1.4) - camera.position.x) * 0.06;
  camera.lookAt(camera.position.x * 0.25, MESA_TOPO - 0.05, -0.7);

  for (const a of assentos.values()) {
    // respiro contínuo, dessincronizado por posição
    if (!semMovimento && !a.apagado) {
      a.plano.position.y = 0.95 + Math.sin(t / 1300 + a.grupo.position.x * 3) * 0.012;
    }
    // pulo de reação
    if (a.pulo) {
      const dt = (t - a.pulo) / 480;
      if (dt >= 1) a.pulo = 0;
      else a.plano.position.y = 0.95 + Math.sin(dt * Math.PI) * 0.16;
    }
    // a cara volta ao normal sozinha
    if (a.caraAte && t > a.caraAte) {
      a.caraAte = 0;
      a.mat.map = a.texturas.normal;
      a.mat.needsUpdate = true;
    }
    // foco da vez
    const alvo = a.naVez ? 0.4 + Math.sin(t / 500) * 0.12 : 0;
    a.focoVez.material.opacity += (alvo - a.focoVez.material.opacity) * 0.1;
  }

  // a carta do meio pousa girando
  const face = descarte.grupo.children[1];
  if (face && face.userData.cai) {
    const dt = (t - face.userData.cai) / 420;
    if (dt >= 1) { face.userData.cai = 0; face.rotation.y = 0; face.position.x = 0; }
    else {
      const e = 1 - Math.pow(1 - dt, 3);
      face.rotation.y = (1 - e) * -Math.PI * 0.55;
      face.position.x = (1 - e) * -0.3;
      face.position.y = MESA_TOPO + 0.05 + (1 - e) * 0.35;
    }
  }

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
// Partida
// ---------------------------------------------------------------------------

$('btn-voltar').onclick = () => { location.href = '/'; };

if (!sessao) {
  aviso('Sem partida em andamento. Entre por uma sala primeiro.', true);
  setTimeout(() => { location.href = '/'; }, 2200);
} else {
  conecta();
  requestAnimationFrame(quadro);
}
