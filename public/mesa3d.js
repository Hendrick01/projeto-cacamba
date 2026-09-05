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
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { GRADIENTE_TOON, M_CONTORNO, contornoDe, encaixaModelo, reage, criaBanqueta, ESCALA_ELENCO } from './modelo3d.js';
import { planBaixada, isJoker, rankLabel } from '/shared/engine.js';
import { SLUGS, personagemValido, personagemDoAssento, peleDe } from '/shared/elenco.js';
import { criaVoz } from '/voz.js';

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

// Chat de voz — o mesmo módulo da mesa 2D. Aqui quem fala mexe a boca do boneco.
const voz = criaVoz({
  meuId: () => me(),
  enviar: (to, dados) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'voz', to, dados })); },
});
function atualizaBotaoVoz() {
  const b = document.getElementById('btn-voz');
  if (!b) return;
  b.classList.toggle('voz-on', voz.ligado() && !voz.mudo);
  b.classList.toggle('voz-mudo', voz.ligado() && voz.mudo);
  b.textContent = !voz.ligado() ? '🎙 voz' : voz.mudo ? '🔇 mudo' : '🎙 falando';
}
document.getElementById('btn-voz')?.addEventListener('click', async () => {
  try {
    if (!voz.ligado()) await voz.ligar();
    else if (!voz.mudo) voz.silenciar(true);
    else voz.desligar();
  } catch (e) { aviso(`🎙 ${e.message || 'Não deu para ligar o microfone.'}`, true); }
  atualizaBotaoVoz();
});

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
    } else if (msg.t === 'voz') {
      voz.receber(msg);
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
// Sombra de verdade, da lâmpada: é o que cola cartas, monte e bonecos no feltro
// (os discos de contato ficam, mais leves, para o que a sombra dura não pega).
// Um mapa só, PCF suave, atualizado de 4 em 4 quadros no laço — cada
// atualização é um render extra da cena, e em celular isso pesa.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
// Mapeamento tonal neutro: a lâmpada forte deixava o feltro estourado no meio;
// o Neutral segura o branco sem lavar o âmbar da paleta (o ACES lava).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;

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
scene.add(new THREE.AmbientLight(0x9a7850, 1.05));
// O reflexo do feltro: uma luz fraca vinda do lado da câmera, para o elenco do
// outro lado não ficar só silhueta — o foco da lâmpada ilumina a mesa, não os
// rostos.
const reflexo = new THREE.DirectionalLight(0xffe2a8, 0.85);
reflexo.position.set(0, 2.4, 5);
scene.add(reflexo);
const foco = new THREE.SpotLight(0xffe2a8, 140, 14, 0.72, 0.55, 1.6);
// Um palmo fora do eixo, para o lado da câmera: exatamente a pino, o que está
// encostado no tampo não projeta nada e a sombra dura sumia. Assim ela cai
// para trás dos objetos, curta, e continua lendo como uma lâmpada só.
foco.position.set(0.45, 4.4, 0.7);
foco.target.position.set(0, MESA_TOPO, 0);
foco.castShadow = true;
foco.shadow.mapSize.set(2048, 2048);
foco.shadow.bias = -0.0004;
foco.shadow.normalBias = 0.02;
foco.shadow.camera.near = 1;
foco.shadow.camera.far = 9;
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
  chao.receiveShadow = true;
  scene.add(chao);
}

// ---------------------------------------------------------------------------
// Materiais da mesa. Tudo gerado em canvas, na hora: nada de textura baixada
// (peso em celular, e a regra do projeto é não depender de fora). O que faz o
// feltro parecer tecido é o GRÃO — um chuvisco fino de claro e escuro — mais
// um mapa de relevo com o mesmo chuvisco, que a luz rasante da lâmpada revela.
// A madeira é veio: faixas que ondulam e mudam de tom ao longo do aro.
// ---------------------------------------------------------------------------
function chuvisco(ctx, w, h, forca, semente = 7) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let x = semente;
  const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * 2 * forca;
    d[i] = Math.max(0, Math.min(255, d[i] + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v));
  }
  ctx.putImageData(img, 0, 0);
}
function texturaFeltro() {
  return texturaDeCanvas(1024, 1024, (ctx) => {
    const g = ctx.createRadialGradient(512, 472, 80, 512, 512, 520);
    g.addColorStop(0, '#1e6a50');
    g.addColorStop(0.55, '#12452f');
    g.addColorStop(1, '#082519');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 1024);
    // a fibra: duas famílias de linhas finíssimas, quase invisíveis de perto,
    // que de longe viram a trama
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for (let i = -1024; i < 2048; i += 6) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 1024, 1024); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    for (let i = -1024; i < 2048; i += 6) { ctx.beginPath(); ctx.moveTo(i + 1024, 0); ctx.lineTo(i, 1024); ctx.stroke(); }
    chuvisco(ctx, 1024, 1024, 14, 3);
  });
}
function texturaRelevoFeltro() {
  const t = texturaDeCanvas(256, 256, (ctx) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 256, 256);
    chuvisco(ctx, 256, 256, 60, 11);
  });
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(8, 8);
  return t;
}
function texturaMadeira(repeticoes) {
  const t = texturaDeCanvas(1024, 128, (ctx) => {
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(0, 0, 1024, 128);
    // veios: faixas horizontais que ondulam e alternam claro/escuro
    const tons = ['#4a2c19', '#7a4a2b', '#3e2717', '#6b4227', '#8c5733'];
    for (let k = 0; k < 26; k++) {
      const y0 = (k / 26) * 128 + (k % 3) * 1.7;
      const larg = 1.2 + (k % 4) * 0.9;
      ctx.strokeStyle = tons[k % tons.length];
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = larg;
      ctx.beginPath();
      for (let x = 0; x <= 1024; x += 8) {
        const y = y0 + Math.sin(x / 90 + k) * 3.5 + Math.sin(x / 23 + k * 2) * 1.2;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    chuvisco(ctx, 1024, 128, 10, 5);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeticoes, 1);
  return t;
}

// a mesa: tampo de feltro com aro de madeira
{
  const feltro = texturaFeltro();
  const madeiraLateral = texturaMadeira(10);
  const tampo = new THREE.Mesh(
    new THREE.CylinderGeometry(2.55, 2.55, 0.16, 48),
    [
      new THREE.MeshStandardMaterial({ map: madeiraLateral, roughness: 0.45, metalness: 0.05 }),   // lateral
      new THREE.MeshStandardMaterial({ map: feltro, bumpMap: texturaRelevoFeltro(), bumpScale: 0.012, roughness: 0.96, metalness: 0 }), // topo
      new THREE.MeshLambertMaterial({ color: 0x1b110b }),                // fundo
    ],
  );
  tampo.position.y = MESA_TOPO - 0.08;
  tampo.receiveShadow = true;
  scene.add(tampo);

  // O aro é madeira envernizada: veio ao longo do anel (u do toro dá a volta
  // no anel) e rugosidade baixa, para a lâmpada deixar um brilho comprido
  // nele — é o brilho que diz "madeira polida", não a cor.
  const aro = new THREE.Mesh(
    new THREE.TorusGeometry(2.62, 0.14, 12, 48),
    new THREE.MeshStandardMaterial({ map: texturaMadeira(6), roughness: 0.38, metalness: 0.06 }),
  );
  aro.rotation.x = Math.PI / 2;
  aro.position.y = MESA_TOPO - 0.04;
  aro.receiveShadow = true; aro.castShadow = true;
  scene.add(aro);

  const pe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.62, MESA_TOPO - 0.1, 20),
    new THREE.MeshStandardMaterial({ map: texturaMadeira(3), roughness: 0.6, metalness: 0.02, color: 0x8a7060 }),
  );
  pe.position.y = (MESA_TOPO - 0.1) / 2;
  scene.add(pe);
}

// Objetos de escala no tampo: sem eles as cartas flutuam num campo verde —
// é o copo que diz o tamanho da carta (referência: os copinhos e fichas do
// Capote). Ficam ATRÁS das pilhas, um de cada lado: em pé a meia-abertura
// horizontal da câmera é ~20°, e na beirada lateral (±1,5 m) saíam do quadro —
// a ±1 m e −1 m de profundidade cabem, e ficam fora do caminho dos jogos
// baixados, que ocupam a faixa entre −0,8 e +0,6. Vidro barato:
// sem passe de transmissão, que pesa em celular; a transparência simples e o
// dedo de bebida âmbar dentro bastam para ler como copo.
{
  const objetos = new THREE.Group();
  const cortica = new THREE.MeshStandardMaterial({ color: 0xa8865a, roughness: 0.92, metalness: 0 });
  const portaCopos = (x, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 24), cortica);
    m.position.set(x, MESA_TOPO + 0.004, z);
    m.castShadow = true; m.receiveShadow = true;
    objetos.add(m);
    return m;
  };
  portaCopos(1.0, -1.0);
  portaCopos(-1.0, -1.0);
  const vidro = new THREE.MeshStandardMaterial({
    color: 0xdfe8e6, transparent: true, opacity: 0.32, roughness: 0.12, metalness: 0.08, side: THREE.DoubleSide, depthWrite: false,
  });
  const copo = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.13, 20, 1, true), vidro);
  copo.position.set(1.0, MESA_TOPO + 0.008 + 0.065, -1.0);
  copo.castShadow = true;
  const fundoCopo = new THREE.Mesh(new THREE.CircleGeometry(0.044, 20), vidro);
  fundoCopo.rotation.x = -Math.PI / 2;
  fundoCopo.position.set(1.0, MESA_TOPO + 0.009, -1.0);
  const bebida = new THREE.Mesh(
    new THREE.CylinderGeometry(0.047, 0.042, 0.045, 20),
    new THREE.MeshStandardMaterial({ color: 0xc9822a, transparent: true, opacity: 0.9, roughness: 0.25, metalness: 0 }),
  );
  bebida.position.set(1.0, MESA_TOPO + 0.009 + 0.0225, -1.0);
  bebida.castShadow = true;
  objetos.add(copo, fundoCopo, bebida);
  scene.add(objetos);
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

// O salão em volta: a mesma cena do fundo da mesa normal — parede de azulejo
// até a meia altura, a porta aberta com a luz da rua, engradados empilhados.
// A neblina come o que está longe, então tudo aqui é forma simples e cor.
{
  // parede circular, vista por dentro
  const parede = texturaDeCanvas(1024, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#1b110b');
    g.addColorStop(0.55, '#31200f');
    g.addColorStop(1, '#3a2513');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    // azulejo na meia parede de baixo
    ctx.strokeStyle = 'rgba(92,61,34,0.55)';
    ctx.lineWidth = 3;
    for (let y = 150; y <= 250; y += 34) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
    }
    for (let x = 0; x <= 1024; x += 56) {
      ctx.beginPath(); ctx.moveTo(x, 150); ctx.lineTo(x, 256); ctx.stroke();
    }
  });
  parede.wrapS = THREE.RepeatWrapping;
  parede.repeat.set(5, 1);
  const muro = new THREE.Mesh(
    new THREE.CylinderGeometry(8.5, 8.5, 4.6, 48, 1, true),
    new THREE.MeshLambertMaterial({ map: parede, side: THREE.BackSide }),
  );
  muro.position.y = 2.3;
  scene.add(muro);

  // a porta aberta para a rua: luz fria de fora contra a quente de dentro
  const rua = texturaDeCanvas(128, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#f7dfa6');
    g.addColorStop(1, '#dfa458');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = 'rgba(185,128,63,0.7)';
    ctx.fillRect(18, 60, 42, 64);
    ctx.fillRect(76, 84, 36, 44);
    ctx.fillStyle = 'rgba(201,143,78,0.55)';
    ctx.fillRect(0, 178, 128, 78);
  });
  const angPorta = -0.44;
  const porta = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.7),
    new THREE.MeshBasicMaterial({ map: rua }),
  );
  porta.position.set(Math.sin(angPorta) * 8.35, 1.55, -Math.cos(angPorta) * 8.35);
  porta.rotation.y = angPorta;
  const batente = new THREE.Mesh(
    new THREE.PlaneGeometry(1.78, 2.95),
    new THREE.MeshLambertMaterial({ color: 0x241609 }),
  );
  batente.position.set(Math.sin(angPorta) * 8.42, 1.55, -Math.cos(angPorta) * 8.42);
  batente.rotation.y = angPorta;
  scene.add(batente, porta);

  // engradados empilhados do outro lado
  const angCaixas = 0.5;
  const caixas = new THREE.Group();
  const corCaixa = [0xb0402a, 0xc08f28, 0x9c3622];
  [[0, 0.28, 0], [0, 0.85, 0.04], [0.12, 1.42, -0.03]].forEach(([dx, y, dz], i) => {
    const cx = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.56, 0.8),
      new THREE.MeshLambertMaterial({ color: corCaixa[i] }),
    );
    cx.position.set(dx, y, dz);
    cx.rotation.y = i * 0.12;
    caixas.add(cx);
  });
  caixas.position.set(Math.sin(angCaixas) * 7.4, 0, -Math.cos(angCaixas) * 7.4);
  caixas.rotation.y = angCaixas;
  scene.add(caixas);
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
  // Fora do mapeamento tonal: a carta é desenho, e o mapeamento lavava o
  // vermelho dos naipes para rosa. A luz continua batendo nela — e o Standard
  // com rugosidade média dá o brilho de verniz que a carta plastificada tem.
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0, toneMapped: false });
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
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0, toneMapped: false });
})();
const materialBorda = new THREE.MeshStandardMaterial({ color: 0xcbc2ae, roughness: 0.85, metalness: 0, toneMapped: false });

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
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, toneMapped: false }));
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

// ---------------------------------------------------------------------------
// O elenco em 3D de verdade: bonecos montados por código, de primitivas.
//
// A identidade de cada um vem dos SINAIS que o README do elenco define como
// dominantes a 48px — cabelo cereja, óculos dourados, listras, cachos — e são
// exatamente essas coisas que primitivas modelam bem. O rosto é simples e
// igual para todos (olhos, sobrancelha, boca); quem distingue é o resto,
// como na mesa 2D. Corpos são objetos: recebem a luz da cena como a mesa.
// ---------------------------------------------------------------------------

const ESPEC_BONECO = {
  gabizinsky:    { cabelo: '#C6335A', corte: 'bob', torso: '#93BCD1', boca: '#B03048' },
  dri:           { cabelo: '#2A2730', corte: 'longo', torso: '#35323C', mechas: '#C08A45' },
  esterex:       { cabelo: '#26242C', corte: 'longo', torso: '#C24A3B', oculos: '#C9A24E', boca: '#B0303F' },
  matheus:       { cabelo: '#3A2A20', corte: 'curto', torso: 'listras', colar: '#C8A24E' },
  'mafra-kitty': { cabelo: '#38281E', corte: 'curto', torso: '#EBE4D5', argola: '#C9CDD1' },
  junior:        { cabelo: '#31241C', corte: 'flattop', torso: '#403630', pingente: '#C97AB0' },
  lyly:          { cabelo: '#EF7F8D', corte: 'longo', torso: '#4A3547', flores: '#EFA3B8' },
  mufasa:        { cabelo: '#372A21', corte: 'cachos', torso: '#33323A', oculos: '#C9CDD1' },
};

// a camisa do Matheus: só o padrão de listras, como manda o README do elenco
function texturaListras() {
  return texturaDeCanvas(64, 64, (ctx) => {
    const cores = ['#EFEAE0', '#2E6094', '#EFEAE0', '#26232A'];
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = cores[x % 4];
      ctx.fillRect(x * 8, 0, 8, 64);
    }
  });
}

// o vestido da Lyly: florzinhas de quatro pétalas sobre o fundo
function texturaFlores(fundo, flor) {
  return texturaDeCanvas(64, 64, (ctx) => {
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = flor;
    for (const [cx, cy] of [[12, 12], [40, 20], [22, 40], [52, 48], [8, 54], [56, 8]]) {
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
        ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 2.4, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
}

// O sombreamento chapado do elenco, o contorno de casca invertida e o encaixe
// de modelos externos moram em modelo3d.js — são os mesmos do provador
// (provador.html), onde o usuário confere um .glb antes de pô-lo na lista.

// um membro (braço, mecha) entre dois pontos: cápsula orientada
function membro(de, ate, raio, mat) {
  const a = new THREE.Vector3(...de);
  const b = new THREE.Vector3(...ate);
  const direcao = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(raio, direcao.length(), 4, 10), mat);
  m.position.copy(a.clone().add(b).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direcao.normalize());
  return m;
}

function montaBoneco(slug) {
  const spec = ESPEC_BONECO[slug] || ESPEC_BONECO.gabizinsky;
  const pele = peleDe(slug);
  const materiais = [];
  const mat = (opcoes) => {
    const m = new THREE.MeshToonMaterial({ transparent: true, gradientMap: GRADIENTE_TOON, ...opcoes });
    materiais.push(m);
    return m;
  };
  const mPele = mat({ color: pele });
  const mCabelo = mat({ color: spec.cabelo });
  const mTorso = spec.torso === 'listras'
    ? mat({ map: texturaListras() })
    : (spec.flores ? mat({ map: texturaFlores(spec.torso, spec.flores) }) : mat({ color: spec.torso }));

  const corpo = new THREE.Group();

  // tronco e ombros
  const tronco = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.34, 4, 14), mTorso);
  tronco.position.y = 1.08;
  tronco.scale.set(1, 1, 0.78);
  corpo.add(tronco);

  // braços descem dos ombros até as mãos, que seguram o leque
  for (const lado of [-1, 1]) {
    corpo.add(membro([lado * 0.2, 1.26, 0.02], [lado * 0.24, 1.0, 0.15], 0.05, mTorso));
    const maozinha = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), mPele);
    maozinha.position.set(lado * 0.24, 0.99, 0.17);
    corpo.add(maozinha);
    // o polegar por cima da frente do leque: é o que segura de verdade
    const dedao = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), mPele);
    dedao.position.set(lado * 0.19, 1.05, 0.22);
    corpo.add(dedao);
  }

  // pescoço e cabeça
  const pescoco = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.09, 10), mPele);
  pescoco.position.y = 1.4;
  corpo.add(pescoco);
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 16), mPele);
  cabeca.position.y = 1.58;
  cabeca.scale.set(1, 1.08, 0.92);
  corpo.add(cabeca);

  // Rosto: olhos, sobrancelhas e as três bocas (neutra, feliz, brava).
  // A cabeça achatada em z tem raio ~0.156 na frente: tudo do rosto fica em
  // z >= 0.16, senão afunda DENTRO da esfera e o rosto sai em branco.
  const mTinta = mat({ color: 0x2a1b12 });
  for (const lado of [-1, 1]) {
    const olho = new THREE.Mesh(new THREE.SphereGeometry(0.021, 8, 8), mTinta);
    olho.position.set(lado * 0.06, 1.6, 0.155);
    corpo.add(olho);
    const sobrancelha = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.013, 0.012), mTinta);
    sobrancelha.position.set(lado * 0.06, 1.655, 0.152);
    corpo.add(sobrancelha);
  }
  const mBoca = spec.boca ? mat({ color: spec.boca }) : mTinta;
  const bocaNeutra = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.013, 0.012), mBoca);
  bocaNeutra.position.set(0, 1.515, 0.152);
  const bocaFeliz = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 8, 10, Math.PI), mBoca);
  bocaFeliz.position.set(0, 1.525, 0.152);
  bocaFeliz.rotation.z = Math.PI;
  bocaFeliz.visible = false;
  const bocaBrava = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 8, 10, Math.PI), mBoca);
  bocaBrava.position.set(0, 1.502, 0.152);
  bocaBrava.visible = false;
  // A quarta boca é a da FALA: uma elipse escura que abre e fecha no ritmo do
  // nível do microfone de quem está falando no chat de voz.
  const bocaAberta = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mTinta);
  bocaAberta.position.set(0, 1.512, 0.156);
  bocaAberta.scale.set(1.3, 0.6, 0.5);
  bocaAberta.visible = false;
  corpo.add(bocaNeutra, bocaFeliz, bocaBrava, bocaAberta);

  // Cabelo, pelo corte. A capa é GORRO (só a calota de cima) + nuca atrás:
  // esfera inteira engolia o rosto.
  if (spec.corte !== 'flattop') {
    const gorro = new THREE.Mesh(
      new THREE.SphereGeometry(0.185, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
      mCabelo,
    );
    gorro.position.y = 1.6;
    const nuca = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mCabelo);
    nuca.position.set(0, 1.57, -0.06);
    nuca.scale.set(0.98, 1, 0.7);
    corpo.add(gorro, nuca);
  }
  if (spec.corte === 'bob') {
    for (const lado of [-1, 1]) corpo.add(membro([lado * 0.16, 1.62, 0.02], [lado * 0.17, 1.46, 0.04], 0.06, mCabelo));
  } else if (spec.corte === 'longo') {
    const costas = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.42, 4, 10), mCabelo);
    costas.position.set(0, 1.28, -0.1);
    costas.scale.set(1.25, 1, 0.55);
    corpo.add(costas);
    for (const lado of [-1, 1]) corpo.add(membro([lado * 0.15, 1.6, 0.05], [lado * 0.19, 1.08, 0.08], 0.055, mCabelo));
    if (spec.mechas) {
      const mMel = mat({ color: spec.mechas });
      for (const lado of [-1, 1]) corpo.add(membro([lado * 0.11, 1.6, 0.11], [lado * 0.14, 1.2, 0.13], 0.012, mMel));
    }
  } else if (spec.corte === 'flattop') {
    const topo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.26), mCabelo);
    topo.position.y = 1.73;
    corpo.add(topo);
  } else if (spec.corte === 'cachos') {
    for (let k = -1; k <= 1; k++) {
      const cacho = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mCabelo);
      cacho.position.set(k * 0.085, 1.71, 0.1);
      corpo.add(cacho);
    }
  }

  // acessórios: os detalhes que o README manda carregar
  if (spec.oculos) {
    const mAro = mat({ color: spec.oculos });
    for (const lado of [-1, 1]) {
      const aro = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.007, 8, 14), mAro);
      aro.position.set(lado * 0.062, 1.6, 0.162);
      corpo.add(aro);
    }
    const ponte = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.008, 0.008), mAro);
    ponte.position.set(0, 1.605, 0.165);
    corpo.add(ponte);
  }
  if (spec.colar) {
    const colar = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.009, 8, 16), mat({ color: spec.colar }));
    colar.position.set(0, 1.36, 0.07);
    colar.rotation.x = 1.25;
    corpo.add(colar);
  }
  if (spec.argola) {
    const argola = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.005, 6, 12), mat({ color: spec.argola }));
    argola.position.set(0.165, 1.55, 0.02);
    argola.rotation.y = Math.PI / 2;
    corpo.add(argola);
  }
  if (spec.pingente) {
    const fio = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.005, 6, 14), mTinta);
    fio.position.set(0, 1.38, 0.07);
    fio.rotation.x = 1.3;
    const pedra = new THREE.Mesh(new THREE.OctahedronGeometry(0.024), mat({ color: spec.pingente }));
    pedra.position.set(0, 1.32, 0.14);
    corpo.add(fio, pedra);
  }

  // O que é CABEÇA (acima do pescoço, em 1,4) some quando o rosto do elenco
  // chega: o recorte do SVG traz cabelo, óculos e brinco desenhados. Regra por
  // altura, não por lista: a franja do bob (centro em 1,54) entra, a cabeleira
  // longa das costas (1,28) e as mechas (1,4) ficam, que é o que se quer — elas
  // emolduram o rosto por trás e por baixo. A boca da fala fica de fora: ela
  // continua funcionando por cima do rosto desenhado.
  const daCabeca = [];
  corpo.traverse((m) => {
    if (m.isMesh && m !== bocaAberta && m.position.y > 1.44) { m.userData.cabeca = true; daCabeca.push(m); }
    if (m.isMesh) m.castShadow = true;   // o boneco projeta no feltro e no chão
  });
  // Contorno só no corpo: a cabeça desenhada já traz o dela. O material é
  // deste boneco (uma cópia), e entra em `materiais` para esmaecer junto com o
  // resto quando o jogador cai — senão sobrava uma silhueta escura firme.
  const mContorno = M_CONTORNO.clone(); mContorno.transparent = true;
  materiais.push(mContorno);
  for (const m of [...corpo.children]) {
    if (m.isMesh && !m.userData.cabeca) { const c = contornoDe(m); if (c) { c.material = mContorno; corpo.add(c); } }
  }

  return { corpo, materiais, daCabeca, bocas: { neutra: bocaNeutra, feliz: bocaFeliz, brava: bocaBrava, aberta: bocaAberta } };
}

// O rosto de cada personagem, recortado da PRÓPRIA arte do elenco (o SVG de
// corpo inteiro e as versões feliz e brava, que já existem). A cabeça mora no
// grupo `translate(87.36 36.96) scale(0.88)` sobre 256×256, com −22 por fora:
// cabelo e rosto cabem na faixa x 60–340, y 0–250 do quadro de 400×800. É
// isso que faz o boneco ser ESTE personagem — os sinais que o README define
// como dominantes a 48 px vêm inteiros, com o contorno do desenho.
const RECORTE_ROSTO = { x: 40, y: 0, w: 320, h: 260 };
const carasCache = new Map();
function carasDoElenco(slug) {
  if (carasCache.has(slug)) return carasCache.get(slug);
  const uma = (sufixo) => pegaImagem(`/assets/personagens/${slug}-corpo-inteiro${sufixo}.svg`).then((img) => {
    const tex = texturaDeCanvas(RECORTE_ROSTO.w * 2, RECORTE_ROSTO.h * 2, (ctx) => {
      ctx.drawImage(img, RECORTE_ROSTO.x, RECORTE_ROSTO.y, RECORTE_ROSTO.w, RECORTE_ROSTO.h,
        0, 0, RECORTE_ROSTO.w * 2, RECORTE_ROSTO.h * 2);
    });
    return tex;
  });
  const prom = Promise.all([uma(''), uma('-feliz'), uma('-bravo')])
    .then(([neutra, feliz, brava]) => ({ neutra, feliz, brava }));
  carasCache.set(slug, prom);
  return prom;
}

// ---------------------------------------------------------------------------
// Personagens vindos de fora: `public/models/<slug>.glb`. Quando o arquivo
// existe, o modelo entra no assento no lugar do boneco de código; quando não,
// o boneco fica. O contrato do que o modelo precisa ter (medidas, nós, morphs,
// animações) está em public/models/LEIA-ME.md — decisão do usuário em
// 2026-09-04: os oito personagens serão modelados fora, no estilo do elenco.
// ---------------------------------------------------------------------------
const carregadorGLTF = new GLTFLoader();
// Quem tem modelo está em public/models/lista.json — a mesa lê uma vez e só
// pede os que existem; tentar `<slug>.glb` às cegas era um 404 no console por
// assento sem modelo.
const listaDeModelos = fetch('/models/lista.json').then((r) => (r.ok ? r.json() : { modelos: [] }))
  .then((j) => new Set(Array.isArray(j.modelos) ? j.modelos : [])).catch(() => new Set());
function carregaModelo(slug) {
  return listaDeModelos.then((lista) => {
    if (!lista.has(slug)) throw new Error('ausente');
    return new Promise((resolve, reject) => carregadorGLTF.load(`/models/${slug}.glb`, resolve, undefined, reject));
  });
}


const LEQUE_MAX = 9;   // cartas viradas no leque de um adversário; o selo diz o número exato
const LEQUE_ESCALA_MODELO = 0.55;   // o leque encolhe nas mãos de um modelo externo (escala humana)
function criaAssento(p) {
  const slug = personagemDe(p);
  const grupo = new THREE.Group();

  const { corpo, materiais, daCabeca, bocas } = montaBoneco(slug);
  grupo.add(corpo);

  // O rosto desenhado: um plano com o recorte do SVG, na frente da cabeça,
  // sem sombreamento (é desenho, como as mãos). Nasce invisível e entra quando
  // as três texturas chegam; até lá o rosto de primitivas segura a cena.
  const mRosto = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.5, depthWrite: true, toneMapped: false });
  materiais.push(mRosto);
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(0.49, 0.40), mRosto);
  plano.position.set(0, 1.585, 0.17);
  plano.visible = false;
  corpo.add(plano);
  const cara = {
    plano, texturas: null,
    mostra(nome) { if (this.texturas) { mRosto.map = this.texturas[nome] || this.texturas.neutra; mRosto.needsUpdate = true; } },
  };
  carasDoElenco(slug).then((texturas) => {
    cara.texturas = texturas;
    cara.mostra('neutra');
    plano.visible = true;
    for (const m of daCabeca) m.visible = false;
    bocas.aberta.position.z = 0.2;   // a boca da fala passa para a frente do desenho
  }).catch(() => { /* fica o rosto de primitivas */ });

  // O modelo externo, se existir: entra depois, por cima do boneco de código.
  const assento = { modelo: null };
  carregaModelo(slug).then((gltf) => {
    const m = encaixaModelo(gltf, slug);
    corpo.visible = false;
    grupo.add(m.raiz);
    if (m.sentado) cadeira.scale.setScalar(ESCALA_ELENCO);   // a banqueta cresce com quem senta nela
    // a boca da fala sai da cabeça do boneco e vai para a do modelo (sem
    // morph `bocaAberta`, é a elipse escura pendurada no nó `Cabeca`)
    bocas.aberta.removeFromParent();
    bocas.aberta.position.set(0, m.alturaCabeca - 0.07, 0.16);
    grupo.add(bocas.aberta);
    assento.modelo = m;
    if (assento.ref) {
      assento.ref.corpo = m.raiz;             // respiro e pulo passam a mover o modelo
      assento.ref.materiais = m.materiais;    // e o esmaecer de quem cai também
      assento.ref.cara = null;
      // o leque fica À FRENTE das mãos, um pouco abaixo da ponta dos dedos:
      // as cartas escondem as mãos e só os dedos aparecem acima da borda,
      // como no boneco de código. O rig não tem dedos para fechar a mão, e
      // com o leque entre as mãos as cartas atravessavam os dedos.
      assento.ref.lequeBase = m.posLeque.clone().add(new THREE.Vector3(0, -0.06, 0.05));
      assento.ref.leque.position.copy(assento.ref.lequeBase);
      assento.ref.leque.rotation.x = -0.35;
      // cartas em escala humana nas mãos de um modelo: o leque do boneco de
      // código é exagerado de propósito (mãos de desenho), numa escultura
      // fica gigante. O selo compensa para continuar legível.
      assento.ref.leque.scale.setScalar(LEQUE_ESCALA_MODELO);
      assento.ref.contagem.scale.multiplyScalar(1 / LEQUE_ESCALA_MODELO);
      assento.ref.bocaBase = bocas.aberta.position.clone();   // a boca está no grupo, e gira com o corpo no quadro
      assento.ref.nome.position.y = m.alturaCabeca + 0.5;
    }
  }).catch(() => { console.info(`modelo: ${slug} ausente — boneco de código`); });

  // sombra de contato: é ela que cola o boneco no chão
  const sombra = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 22),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.scale.y = 0.42;
  sombra.position.y = 0.014;
  grupo.add(sombra);

  // O leque de cartas viradas entre as mãos do boneco. Nasce com LEQUE_MAX
  // cartas na abertura de cinco; a sincronização mostra tantas quantas a mão
  // tem (até o máximo) e reabre o leque para elas.
  const leque = new THREE.Group();
  for (let i = 0; i < LEQUE_MAX; i++) {
    const carta = new THREE.Mesh(geoCarta, materialVerso);
    carta.scale.setScalar(0.42);
    const ang = (i - 2) * 0.17;
    carta.position.set(Math.sin(ang) * 0.28, Math.cos(ang) * 0.02, i * 0.006);
    carta.rotation.z = -ang;
    leque.add(carta);
  }
  // o selo com o número exato mora NO leque, não solto no ar
  const contagem = rotulo('', 'rgba(27,17,11,0.92)', '#f2c14e');
  contagem.position.set(0.36, 0.14, 0.08);
  contagem.scale.set(0.42, 0.13, 1);
  leque.add(contagem);
  leque.position.set(0, 1.02, 0.17);
  leque.rotation.x = -0.14;
  grupo.add(leque);

  // a cadeira: uma banqueta de madeira com a almofada na cor do assento (o
  // anel da mesa normal, em outra forma). Era um disco no chão; com modelos
  // que têm pernas, o disco os deixava sentados no ar.
  const cor = new THREE.Color(CORES_DE_ASSENTO[assentoDe(p.id) % CORES_DE_ASSENTO.length]);
  const cadeira = criaBanqueta(cor);
  grupo.add(cadeira);

  const nome = rotulo(p.name);
  // Menor que o padrão: é o rótulo mais largo da cena e o que primeiro sai do
  // quadro nas pontas em pé (a conta está em `posicaoDoAssento`).
  nome.scale.set(0.66, 0.183, 1);
  nome.position.y = 2.1;
  nome.scale.set(0.78, 0.21, 1);
  grupo.add(nome);

  // foco da vez: um disco de luz no chão, que pulsa
  const focoVez = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, depthWrite: false }),
  );
  focoVez.rotation.x = -Math.PI / 2;
  focoVez.position.y = 0.012;
  grupo.add(focoVez);

  scene.add(grupo);
  const ref = { grupo, corpo, materiais, bocas, cara, leque, contagem, nome, focoVez, pulo: 0, caraAte: 0, assento, tAnterior: 0, lequeBase: leque.position.clone(), bocaBase: null, giroAlvo: 0 };
  assento.ref = ref;
  return ref;
}

// os adversários sentam no arco do outro lado; você fica na câmera
function posicaoDoAssento(indice, total) {
  const meio = (total - 1) / 2;
  // Em pé (celular) a abertura encolhe: com ±60° e a câmera mais perto, os
  // assentos das pontas saíam do quadro e os nomes ficavam cortados na borda.
  // A conta que fecha: a 5,8 m da câmera, um rótulo de 0,66 de largura no
  // assento a ±38° termina a ~19° do eixo, e a meia-abertura horizontal da
  // câmera em pé é ~20°. Em paisagem cabe a volta inteira da mesa.
  // Com cinco ou mais, aperta mais (±30°): a ±38° os das pontas saíam do
  // quadro (visto com cinco). Cabe porque as fileiras alternam o raio — na
  // da frente sobram ~0,9 m entre vizinhos, mais que um boneco.
  const abertura = camera.aspect < 1 ? (total >= 5 ? 0.52 : 0.66) : 1.05;   // ±30° / ±38° / ±60°
  const ang = total === 1 ? 0 : ((indice - meio) / Math.max(1, meio)) * abertura;
  // Mesa cheia: os assentos ímpares recuam para uma segunda fileira, como na
  // mesa 2D — sete bonecos num arco só viravam um corpo atrás do outro.
  const r = total > 4 && indice % 2 === 1 ? 3.3 : 2.66;
  return { x: Math.sin(ang) * r, z: -Math.cos(ang) * r, ang };
}

// ---------------------------------------------------------------------------
// Cartas na mesa: monte, descarte, jogos
// ---------------------------------------------------------------------------

// Sombra de contato: um disco suave sob o que está apoiado no feltro. Sem ela
// monte, descarte e jogos flutuavam — a cena não tem mapa de sombra (custa
// caro em celular), e é a mesma técnica que já cola os bonecos no chão.
const texSombra = texturaDeCanvas(128, 128, (ctx) => {
  const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.32)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.14)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
});
const geoSombra = new THREE.PlaneGeometry(1, 1);
const materialSombra = new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, depthWrite: false });
function sombraDeContato(largura, profundidade) {
  const m = new THREE.Mesh(geoSombra, materialSombra);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(largura, profundidade, 1);
  m.position.y = MESA_TOPO + 0.004;
  return m;
}

const monte = (() => {
  const caixa = new THREE.Mesh(
    new THREE.BoxGeometry(CARTA_L, 0.2, CARTA_A),
    [materialBorda, materialBorda, materialVerso, materialBorda, materialBorda, materialBorda],
  );
  caixa.scale.set(0.8, 1, 0.8);
  caixa.castShadow = true;
  caixa.position.set(-0.4, MESA_TOPO, -0.5);
  scene.add(caixa);
  const sombra = sombraDeContato(0.62, 0.8);
  sombra.position.x = -0.4; sombra.position.z = -0.5;
  scene.add(sombra);
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
  // fora do grupo, que é esvaziado a cada carta nova
  const sombra = sombraDeContato(0.62, 0.8);
  sombra.position.x = 0.4; sombra.position.z = -0.5;
  scene.add(sombra);
  return { grupo, topoId: null };
})();

const jogosNaMesa = new THREE.Group();
scene.add(jogosNaMesa);

// O sinal da SUA vez, no tampo: o mesmo disco âmbar que pulsa embaixo do
// adversário da vez, aqui na sua beirada do feltro. Antes a sua vez era só o
// texto do aviso — na 3D, tudo o que importa está na mesa, e a vez também.
const meuFoco = new THREE.Mesh(
  new THREE.CircleGeometry(0.75, 28),
  new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, depthWrite: false }),
);
meuFoco.rotation.x = -Math.PI / 2;
meuFoco.position.set(0, MESA_TOPO + 0.005, 1.55);
meuFoco.scale.y = 0.55;
scene.add(meuFoco);
let minhaVez = false;

// ---------------------------------------------------------------------------
// A sua mão, presa à câmera
// ---------------------------------------------------------------------------

const maoGrupo = new THREE.Group();
camera.add(maoGrupo);
scene.add(camera);

const cartasDaMao = new Map();  // cardId → mesh
let selecionadas = new Set();
// Arrumação à mão, como na mesa 2D: vazia = ordenação automática. Vale só na
// rodada — os ids das cartas recomeçam a cada uma.
let ordemManual = [];

function maoOrdenada() {
  const hand = [...(view.you?.hand || [])];
  if (ordemManual.length) {
    const pos = new Map(ordemManual.map((id, i) => [id, i]));
    return hand.sort((a, b) => (pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6));
  }
  return hand.sort((a, b) => a.suit - b.suit || a.rank - b.rank);
}

// As suas mãos segurando o leque: mesma construção da mesa normal (contorno
// escuro, pele por cima, halo por fora), com o tom de pele de quem você
// escolheu ser. Desenhadas no canvas — a única coisa que muda por personagem
// é a cor.
// Desenho de mão na mesma língua do elenco: silhueta chapada, contorno
// uniforme escuro, halo quente por fora. Cada forma entra duas vezes — o
// contorno mais largo por baixo, a pele por cima — que é exatamente como os
// geradores do elenco desenham dedos.
function capsula(ctx, x0, y0, x1, y1, w, cor) {
  ctx.strokeStyle = cor; ctx.lineWidth = w;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

function capsulaDupla(ctx, x0, y0, x1, y1, w, pele) {
  capsula(ctx, x0, y0, x1, y1, w, '#2a1b12');
  capsula(ctx, x0, y0, x1, y1, w - 10, pele);
}

// A mão da mesa 2D, traço por traço: são os MESMOS caminhos SVG do
// index.html, rasterizados com o tom de pele do personagem. Inventar outra mão
// aqui era o que a deixava incompatível com o resto — o jogo já tem uma.
const CAMINHOS_MAO_2D = {
  antebraco: 'M 43 84 C 40 120, 38 160, 36 200 L 84 200 C 82 160, 80 120, 77 84 Z',
  dorso: 'M 42 86 L 78 86 C 82 74, 82 62, 79 54 C 71 49, 49 49, 42 54 C 39 62, 38 74, 42 86 Z',
  dedos: [
    ['M 46 60 L 46 34', 12, 8],
    ['M 56 60 L 56 25', 12, 8],
    ['M 66 60 L 66 21', 12, 8],
    ['M 76 60 L 76 29', 12, 8],
  ],
  polegar: ['M 81 70 C 87 62, 88 54, 85 48', 14, 10],
};

function texturaMao2D(pele) {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 640;               // proporção do viewBox 120x200
  const ctx = c.getContext('2d');
  ctx.scale(384 / 120, 640 / 200);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  const antebraco = new Path2D(CAMINHOS_MAO_2D.antebraco);
  const dorso = new Path2D(CAMINHOS_MAO_2D.dorso);

  // halo quente por fora, como no elenco e na mesa 2D
  ctx.strokeStyle = 'rgba(140,106,69,0.8)'; ctx.lineWidth = 9;
  ctx.stroke(antebraco); ctx.stroke(dorso);

  ctx.fillStyle = pele;
  ctx.strokeStyle = '#2a1b12'; ctx.lineWidth = 5;
  ctx.fill(antebraco); ctx.stroke(antebraco);

  for (const [d, tinta, peleW] of CAMINHOS_MAO_2D.dedos) {
    const p2 = new Path2D(d);
    ctx.strokeStyle = '#2a1b12'; ctx.lineWidth = tinta; ctx.stroke(p2);
    ctx.strokeStyle = pele; ctx.lineWidth = peleW; ctx.stroke(p2);
  }
  const [dPol, tintaPol, pelePol] = CAMINHOS_MAO_2D.polegar;
  const pol = new Path2D(dPol);
  ctx.strokeStyle = '#2a1b12'; ctx.lineWidth = tintaPol; ctx.stroke(pol);
  ctx.strokeStyle = pele; ctx.lineWidth = pelePol; ctx.stroke(pol);

  ctx.fillStyle = pele;
  ctx.fill(dorso); ctx.strokeStyle = '#2a1b12'; ctx.lineWidth = 5; ctx.stroke(dorso);

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
    // desenho, como o elenco: sem sombreamento, só o escurecimento fixo
    const mat = new THREE.MeshBasicMaterial({
      map: texturaMao2D(pele), transparent: true, depthWrite: false, toneMapped: false,
    });
    mat.color.setScalar(0.94);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.6), mat);
    maos[lado] = m;
    maoGrupo.add(m);
  }
}

function sincronizaMao() {
  const hand = maoOrdenada();
  selecionadas = new Set([...selecionadas].filter((id) => hand.some((c) => c.id === id)));
  ordemManual = ordemManual.filter((id) => hand.some((c) => c.id === id));

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
  // O leque é CORTADO pela borda de baixo, como no Capote: carta inteira com
  // um vão de cenário embaixo é o que fazia a mão parecer flutuar.
  const baseY = -alturaVisivel * 0.43;
  layoutDaMao = { passo, escala, baseY, dist, meio: (n - 1) / 2, alturaVisivel, larguraVisivel };
  hand.forEach((card, i) => {
    let mesh = cartasDaMao.get(card.id);
    let nova = false;
    if (!mesh) {
      mesh = new THREE.Mesh(geoCarta, materialDaCarta(card));
      mesh.userData.cardId = card.id;
      cartasDaMao.set(card.id, mesh);
      maoGrupo.add(mesh);
      nova = true;
    }
    const meio = (n - 1) / 2;
    const sel = selecionadas.has(card.id);
    mesh.scale.setScalar(escala);
    mesh.position.set(
      (i - meio) * passo,
      baseY + Math.abs(i - meio) * -0.012 + (sel ? 0.1 * escala : 0),
      -dist + i * 0.004,
    );
    // a carta que acabou de entrar voa do monte (ou do meio) até o lugar dela
    if (nova && entradaNaMao && !semMovimento) {
      const origem = entradaNaMao === 'meio' ? descarte.grupo.position.clone().setY(MESA_TOPO + 0.06) : topoDoMonte();
      maoGrupo.updateMatrixWorld(true);
      voa(mesh, noEspacoDaMao(origem), mesh.position.clone(), { dur: 480, arco: 0.06 });
    }
    mesh.rotation.z = -(i - meio) * 0.05;
    mesh.rotation.x = -0.12;
  });

  entradaNaMao = null;
  baixadaDe = null;   // os jogos já foram montados neste sincroniza

  // as duas mãos sobem por trás das pontas do leque, viradas para dentro —
  // é a composição da mesa 2D, que já era a aprovada
  sincronizaMaos();
  const larguraLeque = (n - 1) * passo + CARTA_L * escala;
  if (maos.esq && maos.dir) {
    maos.esq.visible = n > 0; maos.dir.visible = n > 0;
    const yMao = baseY - 0.24 * escala;
    const zTras = -dist - 0.03;   // atrás das cartas, como na mesa 2D
    maos.esq.position.set(-larguraLeque * 0.5 - 0.03, yMao, zTras);
    maos.dir.position.set(larguraLeque * 0.5 + 0.03, yMao, zTras);
    maos.esq.rotation.z = -0.42;
    maos.dir.rotation.z = 0.42;
    maos.esq.scale.set(-escala, escala, 1);   // a esquerda é a direita espelhada
    maos.dir.scale.set(escala, escala, 1);
  }
}

// Toque na mão seleciona; ARRASTO arruma — o mesmo par de gestos da mesa 2D,
// com o mesmo limiar para o dedo que escorrega não reordenar sem querer.
const raycaster = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();
let layoutDaMao = null;
let arrasto3d = null;
const LIMIAR_ARRASTO = 10;

// converte o X do dedo para o X do espaço da câmera, na distância do leque —
// é o que deixa comparar o dedo com as posições das cartas sem projeção
function dedoParaXDoLeque(clientX) {
  const ndc = (clientX / innerWidth) * 2 - 1;
  const metadeV = Math.tan((camera.fov * Math.PI) / 360);
  return ndc * metadeV * camera.aspect * layoutDaMao.dist;
}

canvas.addEventListener('pointerdown', (e) => {
  ponteiro.x = (e.clientX / innerWidth) * 2 - 1;
  ponteiro.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(ponteiro, camera);
  const hits = raycaster.intersectObjects([...cartasDaMao.values()], false);
  if (hits.length) {
    arrasto3d = { id: hits[0].object.userData.cardId, x0: e.clientX, y0: e.clientY, ativo: false };
  }
});

window.addEventListener('pointermove', (e) => {
  if (!arrasto3d || !layoutDaMao) return;
  if (!arrasto3d.ativo) {
    if (Math.hypot(e.clientX - arrasto3d.x0, e.clientY - arrasto3d.y0) < LIMIAR_ARRASTO) return;
    arrasto3d.ativo = true;
  }
  const mesh = cartasDaMao.get(arrasto3d.id);
  if (!mesh) return;
  mesh.position.x = dedoParaXDoLeque(e.clientX);
  mesh.position.y = layoutDaMao.baseY + 0.14 * layoutDaMao.escala;
  mesh.position.z = -layoutDaMao.dist + 0.06;
  mesh.rotation.z = 0;
});

window.addEventListener('pointerup', (e) => {
  if (!arrasto3d) return;
  const { id, ativo } = arrasto3d;
  arrasto3d = null;
  if (!ativo) {
    // foi toque: seleciona/desseleciona
    if (selecionadas.has(id)) selecionadas.delete(id);
    else selecionadas.add(id);
    sincronizaMao();
    montaBotoes();
    return;
  }
  // foi arrasto: a carta cai onde o dedo soltou — conta quantas ficaram à
  // esquerda dele, que é a mesma régua da mesa 2D
  const x = dedoParaXDoLeque(e.clientX);
  const semEla = maoOrdenada().filter((c) => c.id !== id);
  const antes = semEla.filter((c, i) => {
    const meshC = cartasDaMao.get(c.id);
    return meshC && meshC.position.x < x;
  }).length;
  const ordem = semEla.map((c) => c.id);
  ordem.splice(antes, 0, id);
  ordemManual = ordem;
  sincronizaMao();
});
window.addEventListener('pointercancel', () => { arrasto3d = null; sincronizaMao(); });

// leve paralaxe: a cabeça mexe um pouco com o dedo/mouse, como quem se inclina
let olharX = 0;
window.addEventListener('pointermove', (e) => {
  olharX = ((e.clientX / innerWidth) - 0.5) * 0.35;
});

// ---------------------------------------------------------------------------
// Botões de ação (HTML): as jogadas do turno
// ---------------------------------------------------------------------------

const barra = document.createElement('div');
// `left: 0; right: 0` e centrar pelo flex: com `left: 50%`, o shrink-to-fit
// de elemento fixo só enxerga metade da tela e empilhava os botões.
barra.style.cssText = `position:fixed;left:0;right:0;bottom:max(200px, 27vh);
  display:flex;gap:8px;z-index:5;justify-content:center;flex-wrap:wrap;pointer-events:none;padding:0 10px;`;
document.body.appendChild(barra);

function botao(txt, cor, fn) {
  const b = document.createElement('button');
  b.textContent = txt;
  b.style.cssText = `pointer-events:auto;white-space:nowrap;border:1px solid rgba(140,106,69,.5);border-radius:14px;padding:9px 13px;
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
      if (!assentos.has(p.id)) assentos.set(p.id, criaAssento(p));
      const a = assentos.get(p.id);
      const pos = posicaoDoAssento(i, outros.length);
      a.grupo.position.set(pos.x, 0, pos.z);
      // Meio caminho entre encarar a câmera e encarar o centro: virado por
      // inteiro para o centro, o assento da ponta (±60°) virava uma lasca —
      // pior ainda com a curvatura do recorte.
      a.grupo.rotation.y = pos.ang * 0.45;

      trocaRotulo(a.contagem, `${p.handCount}`);
      // os LEQUE_MAX primeiros filhos são as cartas; o selo fica sempre. Até
      // cinco, a abertura é a de sempre; acima, o leque reabre no mesmo arco
      // com as cartas mais juntas — mão cheia se vê de longe.
      const nCartas = Math.min(LEQUE_MAX, p.handCount);
      const passo = nCartas <= 5 ? 0.17 : 0.68 / (nCartas - 1);
      a.leque.children.forEach((c, i) => {
        if (i >= LEQUE_MAX) return;
        c.visible = i < nCartas;
        if (!c.visible) return;
        const ang = (i - (nCartas - 1) / 2) * passo;
        c.position.set(Math.sin(ang) * 0.28, Math.cos(ang) * 0.02, i * 0.006);
        c.rotation.z = -ang;
      });
      a.leque.visible = p.handCount > 0;
      a.naVez = view.turnId === p.id && view.phase !== 'roundEnd';
      minhaVez = view.turnId === me() && view.phase !== 'roundEnd' && view.phase !== 'gameEnd';
      a.apagado = (p.desistiu || (!p.isBot && !p.connected));
      for (const m of a.materiais) m.opacity = a.apagado ? 0.4 : 1;
    }
    // Para onde cada um olha: quem está na vez — e, na sua vez, você. O corpo
    // vira só um pouco (±0,5 rad); o rosto desenhado continua encarando a
    // câmera, então o que vira é a postura, não o olhar.
    {
      const foco = new THREE.Vector3(0, 0, 2.4);   // a sua cadeira
      const naVez = assentos.get(view.turnId);
      if (view.turnId !== me() && naVez) foco.copy(naVez.grupo.position);
      const parado = view.phase === 'roundEnd' || view.phase === 'gameEnd';
      for (const [id, a] of assentos) {
        if (parado || id === view.turnId) { a.giroAlvo = 0; continue; }
        a.grupo.updateMatrixWorld(true);
        const local = a.grupo.worldToLocal(foco.clone());
        a.giroAlvo = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -0.5, 0.5);
      }
    }

    trocaRotulo(monte.num, String(view.deckCount));
    const alturaMonte = Math.max(0.03, Math.min(0.2, view.deckCount * 0.0022));
    monte.caixa.scale.y = alturaMonte / 0.2;
    monte.caixa.position.y = MESA_TOPO + alturaMonte / 2;
    // o número senta na caixa; solto no ar ele era mais uma coisa flutuando
    monte.num.position.set(-0.4, MESA_TOPO + alturaMonte + 0.09, -0.42);

    // Descarte: a pilha deitada e a carta do topo DEITADA sobre ela — como numa
    // mesa de verdade (decisão do usuário, 2026-09-04). O que a torna legível
    // é a câmera a ~30° sobre o tampo, o tamanho um pouco maior que o físico
    // e o leve inclinar para a câmera. Antes ela ficava de pé, porque a 17° a
    // carta deitada virava uma lasca ilegível — e é a carta mais importante da
    // mesa: decide a compra a cada turno.
    const topo = view.discardTop;
    const topoId = topo ? topo.id : null;
    if (topoId !== descarte.topoId) {
      descarte.topoId = topoId;
      // a caixa da pilha nasce com geometria própria a cada carta: solta antes
      for (const c of descarte.grupo.children) if (c.geometry && c.geometry !== geoCarta) c.geometry.dispose();
      descarte.grupo.clear();
      if (topo) {
        const alturaPilha = 0.02 + view.discardCount * 0.0016;
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(CARTA_L, alturaPilha, CARTA_A),
          materialBorda,
        );
        base.castShadow = true;
        base.position.y = MESA_TOPO + alturaPilha / 2;
        const face = new THREE.Mesh(geoCarta, materialDaCarta(topo));
        face.castShadow = true;
        face.scale.setScalar(1.15);
        face.rotation.x = -Math.PI / 2 + 0.2;   // deitada, 11° erguida para a câmera
        face.position.set(0, MESA_TOPO + alturaPilha + 0.05, 0.02);
        face.userData.alvo = face.position.clone();
        if (!semMovimento) { face.userData.cai = performance.now(); }
        descarte.grupo.add(base, face);
      }
    }

    // Jogos baixados: fileiras de cartas DEITADAS na frente de quem baixou,
    // sobrepostas como as minis da mesa 2D e um pouco erguidas para a câmera
    // (decisão do usuário, 2026-09-04). Ver os jogos da mesa é metade do
    // planejamento; antes ficavam de pé porque a 17° deitadas eram lascas.
    jogosNaMesa.clear();
    const todos = [view.players.find((p) => p.id === me()), ...outros].filter(Boolean);
    for (const p of todos) {
      if (!p.melds?.length) continue;
      const meu = p.id === me();
      const idx = outros.indexOf(p);
      const pos = meu ? { x: 0, z: 1.05 } : posicaoDoAssento(idx, outros.length);
      const frente = new THREE.Group();
      // Os jogos dos outros ficam mais perto do centro do que o assento sugere
      // (fator 0,4 em vez de 0,52): deitados, longe, viravam tiras que ninguém
      // lia. Os seus ficam junto da sua borda, como na mesa de verdade.
      frente.position.set(pos.x * 0.4, 0, meu ? pos.z * 0.52 : pos.z * 0.4 + 0.25);

      const passoCarta = 0.15;
      const vaoEntreJogos = 0.12;
      const larguras = p.melds.map((m) => (m.cards.length - 1) * passoCarta + CARTA_L * 0.85);
      const total = larguras.reduce((a, b) => a + b + vaoEntreJogos, -vaoEntreJogos);
      let x = -total / 2;
      p.melds.forEach((meld, mi) => {
        meld.cards.forEach((card, ci) => {
          const carta = new THREE.Mesh(geoCarta, materialDaCarta(card));
          carta.castShadow = true;
          carta.scale.setScalar(0.85);
          carta.rotation.x = -Math.PI / 2 + 0.36;   // deitada, 20° erguida para a câmera
          carta.position.set(
            x + CARTA_L * 0.425 + ci * passoCarta,
            MESA_TOPO + 0.008 + ci * 0.003,
            ci * 0.014,
          );
          frente.add(carta);
        });
        x += larguras[mi] + vaoEntreJogos;
      });
      const sombra = sombraDeContato(total + 0.25, 0.6);
      sombra.position.z = 0.06;
      frente.add(sombra);
      // mesa cheia de jogos: encolhe o conjunto em vez de estourar o feltro
      if (total > 2.3) frente.scale.setScalar(2.3 / total);
      jogosNaMesa.add(frente);
      // jogo novo de quem acabou de baixar: a fileira inteira voa do assento
      // dele (ou da frente da sua cadeira) até o lugar — o grupo, não carta
      // por carta, que é o gesto de quem põe o jogo na mesa
      const temNovo = p.melds.some((m) => !jogosVistos.has(m.id));
      if (temNovo && baixadaDe === p.id && !semMovimento) {
        const a = assentos.get(p.id);
        const origem = a ? lequeDe(a) : new THREE.Vector3(0, MESA_TOPO + 0.6, 1.9);
        voa(frente, origem, frente.position.clone(), { dur: 520, arco: 0.15 });
      }
      for (const m of p.melds) jogosVistos.add(m.id);
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
  // A textura de antes vai embora: cada troca criava um canvas de 256×72 na
  // GPU e nunca soltava — contagem de cartas e monte trocam a cada jogada, e
  // numa partida de sete rodadas isso virava um vazamento lento no celular.
  const velha = sprite.material.map;
  sprite.material.map = novo.material.map;
  sprite.material.needsUpdate = true;
  velha?.dispose();
  novo.material.dispose();
}

// reações: cara e pulo, como na mesa normal
function reageAoEvento(ev) {
  if (ev.e === 'roundStart') {
    ordemManual = []; selecionadas.clear();
    jogosVistos.clear();
    // distribuir: três cartas viradas por assento saem do monte, escalonadas —
    // as de verdade não vão (com oito na mesa seriam quase cem), como na 2D
    if (!semMovimento) {
      let k = 0;
      for (const a of assentos.values()) {
        for (let c = 0; c < 3; c++) {
          const m = cartaPassageira();
          voa(m, topoDoMonte(), lequeDe(a), { dur: 380, atraso: k++ * 90, aoFim: () => scene.remove(m) });
        }
      }
      entradaNaMao = 'monte';
    }
  }
  if ((ev.e === 'draw' || ev.e === 'buy' || ev.e === 'tomouSobra') && !semMovimento) {
    const doMeio = ev.e === 'draw' && ev.source === 'discard';
    if (ev.p === me()) entradaNaMao = doMeio ? 'meio' : 'monte';
    else {
      const a = assentos.get(ev.p);
      if (a) {
        const m = cartaPassageira();
        const de = doMeio ? descarte.grupo.position.clone().setY(MESA_TOPO + 0.06) : topoDoMonte();
        voa(m, de, lequeDe(a), { dur: 420, aoFim: () => scene.remove(m) });
      }
    }
  }
  if (ev.e === 'baixou' && !semMovimento) baixadaDe = ev.p;
  const alvo = ev.p || ev.winnerId;
  const a = alvo ? assentos.get(alvo) : null;
  if (!a) return;
  const feliz = ['baixou', 'swapJoker', 'pegouCoringa'].includes(ev.e)
    || (ev.e === 'roundEnd' && ev.reason === 'bateu');
  const bravo = ev.e === 'claimVoid';
  if (feliz || bravo) {
    a.bocas.neutra.visible = false;
    a.bocas.feliz.visible = feliz;
    a.bocas.brava.visible = bravo;
    a.cara?.mostra(feliz ? 'feliz' : 'brava');
    const m = a.assento?.modelo;
    if (m) {
      const qual = feliz ? 'feliz' : 'bravo';
      reage(m, qual);   // clip e/ou morph, os mesmos do provador
    }
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
  // Sentado à mesa, não pendurado no teto: o olho a ~1,3 m acima do tampo e a
  // ~3,7 m do centro em pé (era 1,7 m acima e 4,6 m atrás, com 84° de campo —
  // a mesa virava um campo vazio com gente miúda na borda). Quem paga a conta
  // de caber todo mundo é a abertura dos assentos, em `posicaoDoAssento`.
  // Inclinação sobre o tampo: ~30° em pé (era ~17°). É o que faz uma carta
  // DEITADA no feltro ler — a 17° ela virava uma tira; a 30°, com o descarte
  // e os jogos um pouco maiores que o físico e um leve inclinar para a câmera,
  // ela lê inteira. Decisão do usuário (2026-09-04): deitadas, desde que
  // visíveis. Subir muito mais viraria vista de cima, e some a sensação de
  // estar sentado com os outros — que é o que se quer da referência.
  camera.fov = Math.min(78, 50 / Math.max(0.68, emPe * 1.15));
  camera.position.set(0, 2.55 + (1 - emPe) * 0.35, 2.75 + (1 - emPe) * 0.75);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', encaixaTela);
encaixaTela();

// ---------------------------------------------------------------------------
// Voos: qualquer objeto indo de um ponto a outro com aceleração suave e um
// arco. É o que anima distribuir, puxar e baixar — a mesa 2D tem os mesmos
// gestos, e sem eles a 3D trocava de estado num piscar, como uma planilha.
// ---------------------------------------------------------------------------
const voos = [];
function voa(obj, de, para, { dur = 450, atraso = 0, arco = 0.12, aoFim = null } = {}) {
  obj.position.copy(de);
  voos.push({ obj, de: de.clone(), para: para.clone(), t0: performance.now(), dur, atraso, arco, aoFim });
}
function animaVoos(t) {
  for (let i = voos.length - 1; i >= 0; i--) {
    const v = voos[i];
    const k = (t - v.t0 - v.atraso) / v.dur;
    if (k < 0) continue;
    const e = 1 - Math.pow(1 - Math.min(1, k), 3);
    v.obj.position.lerpVectors(v.de, v.para, e);
    v.obj.position.y += Math.sin(e * Math.PI) * v.arco;
    if (k >= 1) { v.obj.position.copy(v.para); voos.splice(i, 1); v.aoFim?.(); }
  }
}
// uma carta virada, passageira, para os voos que não têm carta de verdade
function cartaPassageira(escala = 0.42) {
  const m = new THREE.Mesh(geoCarta, materialVerso);
  m.scale.setScalar(escala);
  m.rotation.x = -Math.PI / 2 + 0.3;
  scene.add(m);
  return m;
}
const topoDoMonte = () => new THREE.Vector3(monte.caixa.position.x, monte.caixa.position.y + monte.caixa.scale.y * 0.1 + 0.02, monte.caixa.position.z);
const lequeDe = (a) => { const v = new THREE.Vector3(); a.leque.getWorldPosition(v); return v; };
// A mão está presa à câmera: um ponto do mundo vira ponto do leque por aqui.
const noEspacoDaMao = (mundo) => maoGrupo.worldToLocal(mundo.clone());

// O que os eventos deixam armado para o próximo sincroniza animar.
let entradaNaMao = null;     // 'monte' | 'meio' — a carta nova da minha mão vem de lá
let baixadaDe = null;        // id de quem acabou de baixar: os jogos novos dele voam do assento
const jogosVistos = new Set();

function quadro(t) {
  requestAnimationFrame(quadro);
  animaVoos(t);

  // a cabeça acompanha o ponteiro de leve; a mesa continua o alvo
  camera.position.x += ((olharX * 1.4) - camera.position.x) * 0.06;
  camera.lookAt(camera.position.x * 0.25, MESA_TOPO - 0.05, -0.55);

  for (const [id, a] of assentos) {
    // respiro contínuo, dessincronizado por posição
    if (!semMovimento && !a.apagado) {
      a.corpo.position.y = Math.sin(t / 1300 + a.grupo.position.x * 3) * 0.012;
    }
    // pulo de reação
    if (a.pulo) {
      const dt = (t - a.pulo) / 480;
      if (dt >= 1) a.pulo = 0;
      else a.corpo.position.y = Math.sin(dt * Math.PI) * 0.14;
    }
    // o corpo vira de leve para quem está jogando; o leque (e a boca da fala
    // de um modelo externo, que mora no grupo) giram em volta do mesmo eixo
    {
      const alvoGiro = a.apagado ? 0 : a.giroAlvo;
      a.corpo.rotation.y += (alvoGiro - a.corpo.rotation.y) * (semMovimento ? 1 : 0.06);
      const r = a.corpo.rotation.y, s = Math.sin(r), c = Math.cos(r);
      const b = a.lequeBase;
      a.leque.position.set(c * b.x + s * b.z, b.y, c * b.z - s * b.x);
      a.leque.rotation.y = r;
      if (a.bocaBase) {
        const q = a.bocaBase;
        a.bocas.aberta.position.set(c * q.x + s * q.z, q.y, c * q.z - s * q.x);
        a.bocas.aberta.rotation.y = r;
      }
    }
    // a cara volta ao normal sozinha
    if (a.caraAte && t > a.caraAte) {
      a.caraAte = 0;
      a.bocas.neutra.visible = !a.falava;
      a.bocas.feliz.visible = false;
      a.bocas.brava.visible = false;
      a.cara?.mostra('neutra');
      const m = a.assento?.modelo;
      if (m) for (const q of ['feliz', 'bravo']) if (m.morfos[q]) m.morfos[q].malha.morphTargetInfluences[m.morfos[q].indice] = 0;
    }
    // modelo externo: anima os clips e move a boca por morph, se houver
    if (a.assento?.modelo) {
      const m = a.assento.modelo;
      const dt = a.tAnterior ? (t - a.tAnterior) / 1000 : 0; a.tAnterior = t;
      if (m.mixer) m.mixer.update(dt);
      if (m.morfos.bocaAberta) {
        const nvm = voz.nivel(id);
        m.morfos.bocaAberta.malha.morphTargetInfluences[m.morfos.bocaAberta.indice] = Math.min(1, nvm * 2.2);
        a.bocas.aberta.visible = false;
      }
    }
    // o rosto desenhado encara a câmera: é um plano, e de lado viraria fio
    if (a.cara?.plano.visible) a.cara.plano.lookAt(camera.position);
    // a boca mexe com a voz: abre na proporção do nível de quem fala
    const nv = voz.nivel(id);
    if (nv > 0.08) {
      if (!a.falava) { a.falava = true; a.bocas.neutra.visible = false; a.bocas.aberta.visible = true; }
      a.bocas.aberta.scale.y = 0.35 + nv * 1.8;
    } else if (a.falava) {
      a.falava = false;
      a.bocas.aberta.visible = false;
      if (!a.caraAte) a.bocas.neutra.visible = true;
    }
    // foco da vez
    const alvo = a.naVez ? 0.4 + Math.sin(t / 500) * 0.12 : 0;
    a.focoVez.material.opacity += (alvo - a.focoVez.material.opacity) * 0.1;
  }

  // a carta do meio chega girando e assenta no lugar de pé
  const face = descarte.grupo.children[1];
  if (face && face.userData.cai) {
    const dt = (t - face.userData.cai) / 420;
    if (dt >= 1) { face.userData.cai = 0; face.position.copy(face.userData.alvo); face.rotation.y = 0; }
    else {
      const e = 1 - Math.pow(1 - dt, 3);
      face.rotation.y = (1 - e) * -Math.PI * 0.55;
      face.position.x = face.userData.alvo.x + (1 - e) * -0.3;
      face.position.y = face.userData.alvo.y + (1 - e) * 0.3;
    }
  }

  // o foco da sua vez pulsa como o dos outros, um pouco mais discreto: ele
  // está perto da câmera e não precisa gritar
  const alvoMeu = minhaVez ? 0.22 + Math.sin(t / 500) * 0.07 : 0;
  meuFoco.material.opacity += (alvoMeu - meuFoco.material.opacity) * 0.1;

  quadro.n = (quadro.n || 0) + 1;
  if (quadro.n % 4 === 0) renderer.shadowMap.needsUpdate = true;
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
