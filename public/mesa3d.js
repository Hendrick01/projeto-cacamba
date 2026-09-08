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
import { arteDaCarta, chaveDaArte, VERSO } from './baralho.js';
import { MESA, ESCALA_CARTA_MAO, conectaLeque, arrumaLeque, atualizaInteracao, ajustaBanqueta, gestoCarta } from './interacao3d.js';
import { iluminaSala, criaMesa, criaSala } from './cenario3d.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { GRADIENTE_TOON, M_CONTORNO, contornoDe, encaixaModelo, reage, criaBanqueta, ESCALA_ELENCO } from './modelo3d.js';
import { planBaixada, isJoker, cardLabel, layoffOption, layoffEnds } from '/shared/engine.js';
import { personagemValido, personagemDoAssento, peleDe } from '/shared/elenco.js';
import { criaVoz } from '/voz.js';
import { layoutMao3D, indiceInsercao3D } from '/interface-core.js';
import { criaRigPrimeiraPessoa, definePosePrimeiraPessoa, atualizaRigPrimeiraPessoa } from '/primeira-pessoa-maos.js';
import { configuraInterface, estadoConexao, ligaControlesVoz } from '/interface.js';
configuraInterface();

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
const controlesVoz = ligaControlesVoz(voz, { botao: $('btn-voz'), avisar: texto => aviso(texto,true) });

function conecta() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => { estadoConexao('online'); ws.send(JSON.stringify({
    t: 'resume', code: sessao.code, playerId: sessao.playerId, token: sessao.token,
  })); };
  ws.onmessage = (e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.t === 'state') {
      const primeira = !view;
      view = msg.view;
      controlesVoz.presenca(view.players);
      for (const ev of msg.events || []) reageAoEvento(ev);
      sincroniza(primeira);
    } else if (msg.t === 'lobby' && !msg.started) {
      aviso('A partida ainda não começou — comece pela mesa normal.', true);
    } else if (msg.t === 'welcome') {
      voz.reconectar?.();
    } else if (msg.t === 'voz') {
      voz.receber(msg);
    } else if (msg.t === 'error') {
      aviso(`⚠️ ${msg.msg}`);
    } else if (msg.t === 'gone') {
      voz.desligar();
      aviso('A sala não existe mais. Voltando…', true);
      setTimeout(() => { location.href = '/'; }, 1500);
    }
  };
  ws.onclose = (event) => {
    estadoConexao([4001,1008].includes(event.code) ? 'paused' : 'offline');
    if ([4001, 1008].includes(event.code)) { voz.desligar(); aviso('Conexão pausada. Recarregue para retomar nesta janela.', true); return; }
    aviso('Reconectando à partida…', true);
    setTimeout(conecta, 1800 + Math.random() * 1000);
  };
}

// ---------------------------------------------------------------------------
// Cena: salão, mesa e luz
// ---------------------------------------------------------------------------

const canvas = $('cena');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
catch (error) {
  aviso('O 3D não está disponível neste navegador. Use a mesa normal para continuar.', true);
  $('btn-voltar').onclick = () => { location.href = '/'; };
  throw error;
}
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault(); aviso('O 3D foi interrompido. Volte à mesa normal ou recarregue.', true);
});
canvas.addEventListener('webglcontextrestored', () => { location.reload(); });
const compacto = matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory || 8) <= 4;
let escalaPixels = Math.min(compacto ? 1.25 : 1.75, window.devicePixelRatio || 1);
renderer.setPixelRatio(escalaPixels);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Sombra de verdade, da lâmpada: é o que cola cartas, monte e bonecos no feltro
// (os discos de contato ficam, mais leves, para o que a sombra dura não pega).
// Um mapa só, PCF suave, atualizado a cada 100–150 ms no laço — cada
// atualização é um render extra da cena, e em celular isso pesa.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
// Mapeamento tonal neutro: a lâmpada forte deixava o feltro estourado no meio;
// o Neutral segura o branco sem lavar o âmbar da paleta (o ACES lava).
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x17100a);
// A penumbra do salão é neblina, não parede: o que está longe some no escuro,
// como na mesa normal — só que aqui de verdade, por distância.
scene.fog = new THREE.FogExp2(0x272a29, 0.025);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 40);

// A geometria é a da referência (Capote, 2026-09-05): mesa de jantar
// pequena, gente a um braço de distância com as coxas sob o tampo e os
// cotovelos na borda, câmera na altura dos olhos de quem senta. Antes o tampo
// estava a 0,92 m com 2,55 m de raio e a câmera a 30° sobre ele — bom para
// ler cartas deitadas, ruim para ver gente: um modelo em tamanho real ficava
// pequeno e baixo atrás da borda. Agora as cartas do tampo encolhem
// (ESCALA_TAMPO) e se erguem mais para a câmera, e é isso que as mantém
// legíveis de lado.
const MESA_TOPO = 0.76;
const MESA_RAIO = 1.15;          // o feltro; o aro vai a 1,2
// A roda de cadeiras: encostada na mesa com poucos (raio mínimo), e abrindo
// só o necessário para 78 cm entre vizinhos quando a mesa enche — com sete
// adversários a roda vai a 1,8 m e a câmera recua para caber todos.
const raioDosAssentos = (total) => Math.max(MESA.assento, (total - 1) * 0.30);
const ESCALA_TAMPO = 0.55;       // monte, descarte e jogos, em relação à carta da mão
// a sua cabeça, na sua cadeira: a distância é daqui, a ALTURA sai da
// inclinação (`alturaDoOlho`, lá embaixo) para a carta deitada sempre ler
const OLHO = { x: 0, z: 1.35 };

const foco = iluminaSala(scene, renderer, { compacto });
scene.add(criaSala());

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
    g.addColorStop(0, '#245d4c');
    g.addColorStop(0.55, '#225948');
    g.addColorStop(1, '#205544');
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

scene.add(criaMesa());

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

const imagens = new Map();     // url → HTMLImageElement (carregada)
function pegaImagem(url) {
  if (imagens.has(url)) return imagens.get(url);
  const prom = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`Imagem: HTTP ${r.status}`); return r.text(); })
    .then((texto) => new Promise((res, reject) => {
      // Safari só rasteriza SVG em canvas quando o SVG declara width/height.
      let t = texto;
      if (!/<svg[^>]*\swidth=/.test(t)) {
        const m = t.match(/viewBox="0 0 (\d+) (\d+)"/);
        if (m) t = t.replace('<svg ', `<svg width="${m[1]}" height="${m[2]}" `);
      }
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}`;
    }));
  imagens.set(url, prom);
  return prom;
}

const carregador = new THREE.TextureLoader();

// O renderizador nasce dentro de um `try` (placa sem WebGL existe), então quem
// pergunta pela capacidade dele precisa aguentar não ter renderizador.
const anisotropiaMax = () => {
  try { return renderer.capabilities.getMaxAnisotropy(); } catch { return 4; }
};
const texturasDeCarta = new Map();  // chave → material
function chaveDaCarta(card) {
  return chaveDaArte(card);
}

// A face da carta é a MESMA arte da mesa normal, do mesmo arquivo. Antes ela
// era desenhada aqui no canvas, naipe por naipe — duas versões do mesmo baralho
// que divergiam a cada ajuste. Agora as duas mesas leem /assets/baralho/, e o
// que a pessoa vira na mão é exatamente o que ela vê deitado no feltro.
function materialDaCarta(card) {
  const chave = chaveDaCarta(card);
  if (texturasDeCarta.has(chave)) return texturasDeCarta.get(chave);
  const tex = carregador.load(arteDaCarta(card));
  tex.colorSpace = THREE.SRGBColorSpace;
  // Anisotropia no máximo que a placa dá: a carta quase sempre é vista de
  // esguelha (deitada no feltro, ou no leque inclinado), e é exatamente aí que
  // filtro fraco embola o índice do canto. `4` era um chute conservador.
  tex.anisotropy = anisotropiaMax();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  // Fora do mapeamento tonal: a carta é desenho, e o mapeamento lavava o
  // vermelho dos naipes para rosa. A luz continua batendo nela — e o Standard
  // com rugosidade média dá o brilho de verniz que a carta plastificada tem.
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.88, metalness: 0, toneMapped: true,
  });
  texturasDeCarta.set(chave, mat);
  return mat;
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
// O verso: o mesmo arquivo que a mesa normal usa no monte e no leque dos
// adversários.
const materialVerso = (() => {
  const tex = carregador.load(VERSO);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropiaMax();
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0 });
})();

const materialBorda = new THREE.MeshStandardMaterial({ color: 0xcbc2ae, roughness: 0.85, metalness: 0, toneMapped: true });

const CARTA_L = 0.42; const CARTA_A = 0.59;

// A carta é um retângulo de CANTO ARREDONDADO, e não um plano seco.
//
// O canto podia sair de um recorte por alfa na textura, mas isso obrigaria o
// baralho inteiro a carregar canal alfa — e é justamente o alfa que fazia o
// arquivo pesar sete vezes mais. Aqui ele sai de GRAÇA: é geometria, três
// dezenas de triângulos, e ainda fica com a borda limpa em qualquer ângulo,
// sem o serrilhado que o `alphaTest` deixa.
//
// A UV é montada à mão porque `ShapeGeometry` mapeia a textura pelas
// coordenadas do mundo: sem isto a carta sairia com a arte deslocada e cortada.
function geometriaDeCarta(l, a, raio = 0.045) {
  const forma = new THREE.Shape();
  const x = l / 2; const y = a / 2; const r = Math.min(raio, x, y);
  forma.moveTo(-x + r, -y);
  forma.lineTo(x - r, -y);
  forma.quadraticCurveTo(x, -y, x, -y + r);
  forma.lineTo(x, y - r);
  forma.quadraticCurveTo(x, y, x - r, y);
  forma.lineTo(-x + r, y);
  forma.quadraticCurveTo(-x, y, -x, y - r);
  forma.lineTo(-x, -y + r);
  forma.quadraticCurveTo(-x, -y, -x + r, -y);
  const geo = new THREE.ShapeGeometry(forma, 6);
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) + x) / l;
    uv[i * 2 + 1] = (pos.getY(i) + y) / a;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const geoCarta = geometriaDeCarta(CARTA_L, CARTA_A);

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
function criaAssento(p) {
  const slug = personagemDe(p);
  const grupo = new THREE.Group();

  const { corpo, materiais, daCabeca, bocas } = montaBoneco(slug);
  grupo.add(corpo);
  // o boneco de código foi desenhado para uma mesa de 1,55 m sentado; na mesa
  // de jantar ele encolhe para o tamanho de gente (o modelo, quando chega, volta a 1)
  grupo.scale.setScalar(0.8);

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
  // O rosto desenhado é o RESERVA: só entra quando não há modelo para o slug.
  // Montá-lo sempre custava três SVGs e três canvas de 640×520 por assento —
  // uns 4 MB de textura na placa por vizinho — que iam para o lixo assim que o
  // .glb chegava, e hoje os oito têm modelo.
  const montaRosto = () => carasDoElenco(slug).then((texturas) => {
    if (assento.modelo) return;
    cara.texturas = texturas;
    cara.mostra('neutra');
    plano.visible = true;
    for (const m of daCabeca) m.visible = false;
    bocas.aberta.position.z = 0.2;   // a boca da fala passa para a frente do desenho
  }).catch(() => { /* fica o rosto de primitivas */ });

  // O modelo externo, se existir: entra depois, por cima do boneco de código.
  const assento = { modelo: null };
  carregaModelo(slug).then((gltf) => {
    // material ORIGINAL da escultura (cor, normal map): com o cenário
    // realista, o sombreamento em degraus deixava o rosto chapado
    const m = encaixaModelo(gltf, slug, { estilo: 'original' });
    atualizaInteracao(m, 0, { parado: true });
    corpo.visible = false;
    grupo.add(m.raiz);
    grupo.scale.setScalar(1);   // tamanho real: a mesa é de gente de verdade
    // a cadeira vai para debaixo de quem senta nela: pelo osso do quadril num
    // modelo rigado, pelo nó `Assento` numa escultura estática
    if (m.sentado || m.estatico) ajustaBanqueta(m, cadeira);
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
      const cartaAtiva = new THREE.Mesh(geoCarta, materialVerso);
      cartaAtiva.scale.setScalar(ESCALA_CARTA_MAO);
      conectaLeque(m, assento.ref.leque, cartaAtiva);
      arrumaLeque(assento.ref.leque, p.handCount || 5);
      // o selo com a contagem sobe para o canto de cima do leque, do lado da
      // outra mão, onde não tampa carta nem dedo
      assento.ref.contagem.position.set(-0.1, 0.19, 0.03);
      assento.ref.contagem.scale.set(0.13, 0.05, 1);
      atualizaInteracao(m, 0, { parado: true });
      assento.ref.bocaBase = bocas.aberta.position.clone();   // a boca está no grupo, e gira com o corpo no quadro
      // o nome (e a placa de estado sobre ele) descem para a cabeça do modelo:
      // a altura do boneco de código deixava os dois no teto do boteco
      assento.ref.nome.position.y = m.alturaCabeca + 0.26;
      assento.ref.estado.position.y = assento.ref.nome.position.y + 0.155;
    }
  }).catch((error) => {
    console.info(`modelo: ${slug} — usando o boneco de reserva (${error.message})`);
    montaRosto();
  });

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
  // perto assim (1,5 m), o rótulo grande da mesa antiga tampava o vizinho
  nome.position.y = 2.0;
  nome.scale.set(0.46, 0.124, 1);
  grupo.add(nome);

  // A placa de estado, logo acima do nome (referência do Capote: sobre a
  // cabeça de cada um está escrito se ele está JOGANDO, se é o PRÓXIMO ou o
  // que acabou de fazer). Numa escultura sem esqueleto é ela que conta o
  // turno — o corpo só vira e se inclina.
  const estado = rotulo('', 'rgba(207,138,42,0.95)', '#fff6e2');
  estado.position.y = nome.position.y + 0.17;
  estado.scale.set(0.36, 0.098, 1);
  estado.visible = false;
  grupo.add(estado);

  // O foco da vez no TAMPO, na frente da cadeira (no chão ficaria escondido
  // sob a mesa). Fica num grupo próprio, na CENA, preso à beirada do feltro na
  // direção da cadeira (a sincronia o põe lá): dentro do grupo do assento ele
  // herdaria a escala 0,8 do boneco de reserva e afundaria no tampo enquanto o
  // modelo não chega. Os copinhos de dose que ficavam ao lado saíram
  // (decisão do usuário, 08/09/2026): eram vidro seco na frente dos jogos.
  const naBeirada = new THREE.Group();
  const focoVez = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 24),
    new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, depthWrite: false }),
  );
  focoVez.rotation.x = -Math.PI / 2;
  focoVez.position.set(0, MESA_TOPO + 0.006, 0.2);
  focoVez.scale.y = 0.6;
  naBeirada.add(focoVez);
  scene.add(naBeirada);

  scene.add(grupo);
  const ref = { grupo, corpo, materiais, bocas, cara, leque, contagem, nome, estado, focoVez, naBeirada, cadeira, pulo: 0, caraAte: 0, assento, tAnterior: 0, lequeBase: leque.position.clone(), bocaBase: null, giroAlvo: 0, aviso: null, avisoAte: 0 };
  assento.ref = ref;
  return ref;
}

// os adversários sentam no arco do outro lado; você fica na câmera
function posicaoDoAssento(indice, total) {
  // Uma única roda de cadeiras, com distância mínima de 78 cm entre centros.
  const raio = raioDosAssentos(total);
  const passo = 2 * Math.asin(0.78 / (2 * raio));
  const ang = (indice - (total - 1) / 2) * Math.max(passo, total < 4 ? 0.6 : passo);
  return { x: Math.sin(ang) * raio, z: -Math.cos(ang) * raio, ang };
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
  caixa.scale.set(ESCALA_TAMPO, 1, ESCALA_TAMPO);
  caixa.castShadow = true;
  caixa.position.set(-0.2, MESA_TOPO, 0);
  scene.add(caixa);
  const sombra = sombraDeContato(0.42, 0.55);
  sombra.position.x = -0.2; sombra.position.z = 0;
  scene.add(sombra);
  const num = rotulo('', 'rgba(27,17,11,0.85)', '#9dbbad');
  num.position.set(-0.2, MESA_TOPO + 0.2, 0.15);
  num.scale.set(0.3, 0.09, 1);
  scene.add(num);
  return { caixa, num };
})();

const descarte = (() => {
  const grupo = new THREE.Group();
  grupo.position.set(0.2, 0, 0);
  scene.add(grupo);
  // fora do grupo, que é esvaziado a cada carta nova
  const sombra = sombraDeContato(0.42, 0.55);
  sombra.position.x = 0.2; sombra.position.z = 0;
  scene.add(sombra);
  return { grupo, topoId: null };
})();

const jogosNaMesa = new THREE.Group();
scene.add(jogosNaMesa);

// ---------------------------------------------------------------------------
// Os enfeites do tampo: o copo e o pod da casa, esculpidos e com a marca do
// jogo (arquivos do usuário, 08/09/2026, no lugar do copo de cerveja de
// cilindro e dos copinhos de dose secos). Eles seguem servindo de ESCALA — sem
// um objeto de tamanho conhecido no feltro as cartas flutuam num campo verde —
// mas agora sem custar visão: moram no aro DE TRÁS, a 1,02 m do centro, atrás
// de tudo o que se lê na mesa. O monte e o descarte estão no meio e o anel dos
// jogos chega no máximo a 0,92 m; quem está mais longe da câmera nunca tapa
// quem está na frente, e a folga ainda deixa a fileira mais externa livre. O
// copo antigo ficava a 0,78 m — em cima da fileira da frente dos jogos.
// Se o arquivo não carregar, a mesa segue sem eles.
// ---------------------------------------------------------------------------
{
  const RAIO_ENFEITE = 1.02;
  const cortica = new THREE.MeshStandardMaterial({ color: 0xa8865a, roughness: 0.92, metalness: 0 });
  const enfeites = [
    { arquivo: 'copo', ang: -0.60, giro: 0.5, sombra: 0.2, portaCopos: true },
    { arquivo: 'pod', ang: 0.52, giro: -0.75, sombra: 0.1, portaCopos: false },
  ];
  for (const e of enfeites) {
    const x = Math.sin(e.ang) * RAIO_ENFEITE;
    const z = -Math.cos(e.ang) * RAIO_ENFEITE;
    const base = sombraDeContato(e.sombra, e.sombra * 0.8);
    base.position.x = x; base.position.z = z;
    scene.add(base);
    if (e.portaCopos) {
      const disco = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 24), cortica);
      disco.position.set(x, MESA_TOPO + 0.004, z);
      disco.castShadow = true; disco.receiveShadow = true;
      scene.add(disco);
    }
    carregadorGLTF.load(`/models/${e.arquivo}.glb`, (gltf) => {
      const obj = gltf.scene;
      // vêm preparados em metros, apoiados no zero (scripts/prepara_enfeite.py)
      obj.position.set(x, MESA_TOPO + (e.portaCopos ? 0.008 : 0.001), z);
      obj.rotation.y = e.giro;
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(obj);
    }, undefined, () => { /* sem enfeite, a mesa continua */ });
  }
}

// O sinal da SUA vez, no tampo: o mesmo disco âmbar que pulsa embaixo do
// adversário da vez, aqui na sua beirada do feltro. Antes a sua vez era só o
// texto do aviso — na 3D, tudo o que importa está na mesa, e a vez também.
const meuFoco = new THREE.Mesh(
  new THREE.CircleGeometry(0.32, 28),
  new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, depthWrite: false }),
);
meuFoco.rotation.x = -Math.PI / 2;
meuFoco.position.set(0, MESA_TOPO + 0.005, 0.9);
meuFoco.scale.y = 0.55;
scene.add(meuFoco);
let minhaVez = false;

// ---------------------------------------------------------------------------
// A sua mão, presa à câmera
// ---------------------------------------------------------------------------

const maoGrupo = new THREE.Group();
scene.add(camera);
// A sua mão mora numa CENA À PARTE, desenhada num segundo passe com o
// z-buffer limpo. Ela está a 1,3 m do olho e a beirada do tampo a 48 cm: pelo
// mundo, a mesa passaria na frente das cartas. Antes isso se resolvia com
// `depthTest: false`, que serve a carta chapada mas destrói um sólido — a mão
// esculpida saía como um amontoado de cacos, com as costas desenhadas por cima
// da palma. Com passe próprio, cada coisa da mão se ordena entre si e o
// conjunto continua por cima do mundo.
const cenaMao = new THREE.Scene();
cenaMao.add(maoGrupo);
// luz própria, suave: a mão está encostada na câmera e o holofote do boteco,
// que é forte e âmbar, a estouraria
// clareza suficiente para ler o gesto, sem estourar o tom da pele: com o
// ambiente em 1,5 a mão saía branca e perdia a cor do personagem
cenaMao.add(new THREE.AmbientLight(0xffffff, 0.7));
const luzDaMao = new THREE.DirectionalLight(0xfff0d8, 0.95);
luzDaMao.position.set(-0.4, 1, 0.8);
cenaMao.add(luzDaMao);
// o grupo copia a câmera a cada quadro (era filho dela)
function segueACamera() {
  camera.updateMatrixWorld();
  maoGrupo.position.copy(camera.position);
  maoGrupo.quaternion.copy(camera.quaternion);
  maoGrupo.updateMatrixWorld(true);
}

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

const maos = { esq: null, dir: null, pele: null, slug: null, tridi: false, rig: null };
// ENCAIXA A MÃO NO LEQUE, em vez de adivinhar onde ela vai.
//
// A conta é invertida: primeiro se MEDE a pinça na própria mão — o meio entre a
// ponta do polegar e a falange média do indicador, e o eixo que vai de um ao
// outro — e depois se gira a mão até esse eixo apontar para a câmera e se a
// desloca até a pinça cair no pé do leque. Assim o plano das cartas passa
// SEMPRE entre o polegar e os dedos, que é o que faz a mão segurar em vez de
// atravessar. Empurrar posição e rotação à mão nunca convergia: com o eixo da
// pinça de través, polegar e dedos caem na mesma profundidade e a carta não
// tem por onde entrar.
//
// Sobra um grau de liberdade — o giro em torno do próprio eixo da pinça. Ele é
// fixado pelo `inclina`: quanto os dedos sobem em relação à horizontal da tela.
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const EIXO_Z = new THREE.Vector3(0, 0, 1);
const _qMao = new THREE.Quaternion(), _qGiro = new THREE.Quaternion();
function encaixaNaPinca(mao, lado, alvo, escala, inclina) {
  const polegar = mao.getObjectByName(`${lado}Thumb3`), dedo = mao.getObjectByName(`${lado}Index2`);
  const dedos = mao.getObjectByName(`${lado}Middle3`);
  if (!polegar || !dedo || !dedos) return false;
  // 1. mede no espaço da PRÓPRIA mão (transformação zerada)
  mao.position.set(0, 0, 0); mao.quaternion.identity(); mao.scale.setScalar(1);
  mao.updateWorldMatrix(true, true);
  // no espaço do PAI (o grupo da mão), que é onde a transformação da mão vive:
  // `getWorldPosition` devolve mundo, e o grupo acompanha a câmera
  const pai = mao.parent;
  const emCasa = (o, v) => pai.worldToLocal(o.getWorldPosition(v));
  const pontaPolegar = emCasa(polegar, _v1.clone());
  const ancora = pontaPolegar.clone().add(emCasa(dedo, _v2)).multiplyScalar(0.5);
  const eixoPinca = pontaPolegar.clone().sub(_v2).normalize();          // do dedo para o polegar
  const paraOsDedos = emCasa(dedos, _v3.clone()).sub(ancora);           // para onde a mão aponta
  // 2. o eixo da pinça olha para a câmera: o polegar fica na frente do plano
  //    das cartas e os dedos, atrás
  _q1.setFromUnitVectors(eixoPinca, EIXO_Z);
  // 3. o giro que sobra: leva os dedos para a inclinação pedida na tela
  const dedosGirados = paraOsDedos.clone().applyQuaternion(_q1);
  const roda = inclina - Math.atan2(dedosGirados.y, dedosGirados.x);
  _q2.setFromAxisAngle(EIXO_Z, roda);
  mao.quaternion.copy(_q2).multiply(_q1);
  mao.scale.setScalar(escala);
  // 4. a pinça cai no alvo
  mao.position.copy(alvo).sub(ancora.applyQuaternion(mao.quaternion).multiplyScalar(escala));
  return true;
}

// ENCAIXA PELO CONTRATO. `PlanoDaCarta` é um nó gravado dentro do próprio
// modelo (scripts/mao_pose_segura.py): a origem é o centro da carta que a mão
// segura, o +Z é a normal da palma — o lado por onde o polegar cruza — e o +Y é
// a direção em que a carta sobe. Alinhar a mão a ele é o que tira o palpite:
// antes o jogo procurava um eixo de pinça entre dois ossos e ADIVINHAVA o giro
// que sobrava, e era daí que saíam as mãos viradas ao contrário e furando o
// leque. Aqui a conta é direta: se P é o plano no espaço da mão e A é onde a
// carta está na tela, a mão vai para M = A · P⁻¹.
const _mA = new THREE.Matrix4(), _mP = new THREE.Matrix4(), _escala = new THREE.Vector3();
const EIXO_Y = new THREE.Vector3(0, 1, 0);
function encaixaPeloPlano(mao, alvo, giro, escala) {
  const plano = mao.getObjectByName('PlanoDaCarta');
  if (!plano) return false;
  mao.position.set(0, 0, 0); mao.quaternion.identity(); mao.scale.setScalar(1);
  mao.updateWorldMatrix(true, true);
  _mP.copy(mao.parent.matrixWorld).invert().multiply(plano.matrixWorld);
  _mA.compose(alvo, giro, _escala.set(escala, escala, escala));   // vetor próprio: `alvo` costuma vir de um temporário
  mao.matrix.copy(_mA.multiply(_mP.invert()));
  mao.matrix.decompose(mao.position, mao.quaternion, mao.scale);
  mao.updateWorldMatrix(true, true);
  return true;
}

// MEDE a mão contra o plano das cartas, vértice a vértice, separando o polegar
// do resto pelos pesos do esqueleto. Devolve o quanto o resto da mão precisa
// RECUAR para ficar inteiro atrás das cartas, e quanto do polegar sobra à
// frente depois disso. Sem estimativa: é a malha deformada de verdade
// (`getVertexPosition` aplica o esqueleto) medida no espaço do grupo da mão.
const _vm = new THREE.Vector3(), _base = new THREE.Vector3(), _mOsso = new THREE.Matrix4(), _peso = new THREE.Vector3();
// Compõe o vértice deformado À MÃO, pelos ossos. O `getVertexPosition` do
// three.js devolve no espaço do BIND — e o bind foi capturado no carregamento,
// com a mão ainda fora do grupo — então multiplicar o resultado pela
// `matrixWorld` de agora dava um erro que crescia com a transformação da mão:
// meio metro de sobra, que o jogo "corrigia" empurrando a mão para trás. Aqui a
// conta é a mesma que a GPU faz, e não depende de quando o bind foi tirado.
function posicaoDeformada(malha, i, alvo) {
  const { bones, boneInverses } = malha.skeleton;
  const idx = malha.geometry.attributes.skinIndex, peso = malha.geometry.attributes.skinWeight;
  _base.fromBufferAttribute(malha.geometry.attributes.position, i);
  alvo.set(0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const w = peso.getComponent(i, k);
    if (!w) continue;
    const b = idx.getComponent(i, k);
    _mOsso.multiplyMatrices(bones[b].matrixWorld, boneInverses[b]);
    alvo.addScaledVector(_peso.copy(_base).applyMatrix4(_mOsso), w);
  }
  return alvo;
}
function medeAMao(mao, zCarta, passo = 2) {
  let malha = null; mao.traverse((o) => { if (o.isSkinnedMesh) malha = o; });
  if (!malha) return null;
  const pai = mao.parent;
  const ossos = malha.skeleton.bones;
  const doPolegar = ossos.map((b) => /Thumb/.test(b.name));
  const idx = malha.geometry.attributes.skinIndex, peso = malha.geometry.attributes.skinWeight;
  const pos = malha.geometry.attributes.position;
  mao.updateWorldMatrix(true, true);
  let recuo = -Infinity, polegarNaFrente = 0, restoNaFrente = 0, maisFundoDoPolegar = -Infinity, lidos = 0;
  for (let i = 0; i < pos.count; i += passo) {
    const z = pai.worldToLocal(posicaoDeformada(malha, i, _vm)).z;
    // de que osso é este vértice: o de maior peso
    let melhor = 0, pesoMax = -1;
    for (let k = 0; k < 4; k++) {
      const w = peso.getComponent(i, k);
      if (w > pesoMax) { pesoMax = w; melhor = idx.getComponent(i, k); }
    }
    lidos++;
    if (doPolegar[melhor]) {
      if (z > zCarta) polegarNaFrente++;
      maisFundoDoPolegar = Math.max(maisFundoDoPolegar, z);
    } else {
      if (z > zCarta) restoNaFrente++;
      recuo = Math.max(recuo, z - zCarta);
    }
  }
  return { lidos, recuo: Math.max(0, recuo), polegarNaFrente, restoNaFrente, pontaDoPolegar: maisFundoDoPolegar };
}

// Recua a mão até que NADA além do polegar fique à frente do plano das cartas,
// e devolve a medida final. O recuo é uma translação, então uma passada já
// resolve; a segunda medida existe para PROVAR que resolveu — e para dizer
// quanto do polegar sobrou à mostra, que é o ponto do gesto.
function recuaAteSoOPolegarAparecer(mao, zCarta) {
  let m = medeAMao(mao, zCarta);
  if (!m) return null;
  if (m.recuo > 0) { mao.position.z -= m.recuo + 0.002; mao.updateWorldMatrix(true, true); m = medeAMao(mao, zCarta); }
  return m;
}

function poeAMao(lado, objeto) {
  if (maos[lado]) { maoGrupo.remove(maos[lado]); maos[lado].traverse?.((o) => o.material?.dispose?.()); }
  // sólido de verdade: profundidade LIGADA (o passe da mão tem z-buffer próprio).
  // A malha chapada do desenho continua sem escrever profundidade, que é o que
  // um plano transparente quer.
  // A mão fica ATRÁS do leque (renderOrder abaixo do das cartas). Por cima,
  // como estava, os dedos cobriam a face das cartas e o corte do recorte
  // aparecia inteiro no meio da mão — "as mãos estão por cima das cartas e mal
  // cortadas" (usuário, 08/09/2026). Atrás, a carta esconde o corte e o que
  // sobra à vista são os dedos nas pontas do leque, que é o que se quer.
  // Sólido de verdade: profundidade LIGADA (o passe da mão tem z-buffer
  // próprio); a malha chapada do desenho continua sem escrever profundidade,
  // que é o que um plano transparente quer.
  objeto.traverse((o) => { if (o.isMesh) { o.material.depthTest = true; o.material.depthWrite = !o.material.transparent; o.renderOrder = 60; } });
  objeto.renderOrder = 60;
  maos[lado] = objeto;
  maoGrupo.add(objeto);
}
// As mãos de primeira pessoa são um VIEWMODEL: uma mão própria, rigada, feita
// para ser vista de perto (scripts/mao_modelo.py), e não mais o recorte da
// escultura do personagem — recorte não tem osso, e sem osso não há pinça, nem
// dedo que se feche na carta. A identidade vem da COR da pele do personagem;
// manga, relógio e pulseira são o passo seguinte.
// Sem os arquivos, o desenho 2D chapado continua sendo o reserva.
function maosDePrimeiraPessoa() {
  return Promise.all(['esq', 'dir'].map((lado) => new Promise((ok, erro) =>
    carregadorGLTF.load(`/models/mao-fp-${lado}.glb`, ok, undefined, erro))));
}
function sincronizaMaos() {
  const eu = view.players.find((p) => p.id === me());
  if (!eu) return;
  const slug = personagemDe(eu);
  const pele = peleDe(slug);
  if (slug === maos.slug && pele === maos.pele) return;
  maos.pele = pele; maos.slug = slug; maos.tridi = false;
  for (const lado of ['esq', 'dir']) {
    // desenho, como o elenco: sem sombreamento, só o escurecimento fixo
    const mat = new THREE.MeshBasicMaterial({
      map: texturaMao2D(pele), transparent: true, depthWrite: false, toneMapped: false,
    });
    mat.color.setScalar(0.94);
    poeAMao(lado, new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.6), mat));
  }
  maosDePrimeiraPessoa().then(([esq, dir]) => {
    if (maos.slug !== slug) return;              // trocou de personagem enquanto carregava
    const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(pele), roughness: 0.62, metalness: 0 });
    for (const [lado, gltf] of [['esq', esq], ['dir', dir]]) {
      const raiz = gltf.scene;
      raiz.traverse((o) => { if (o.isMesh) { o.material = material; o.frustumCulled = false; } });
      poeAMao(lado, raiz);
    }
    // o rig vê as duas mãos de uma vez: os ossos se chamam Left*/Right*
    maos.rig = criaRigPrimeiraPessoa(maoGrupo);
    if (maos.rig) {
      // A ESQUERDA SAI POSADA DO ARQUIVO e o rig não a toca: a pose foi medida
      // em scripts/mao_pose_segura.py (dedos enrolados 95 graus somando as três
      // falanges, polegar cruzando à frente) e `atualizaRigPrimeiraPessoa`
      // escreve `base × pose` em cada junta — aplicar `leque` por cima dobraria
      // tudo duas vezes. A direita continua no rig, que é ela quem gesticula.
      maos.rig.Left = null;
      definePosePrimeiraPessoa(maos.rig, 'Right', 'repouso');
      atualizaRigPrimeiraPessoa(maos.rig, 0.016, true);
    }
    maos.tridi = true;
    sincronizaMao();
  }).catch((erro) => { console.info(`mão de primeira pessoa: ${erro.message} — fica o desenho`); });
}

function sincronizaMao() {
  if (!view?.you) return;
  const hand = maoOrdenada(), ids = new Set(hand.map(c => c.id));
  selecionadas = new Set([...selecionadas].filter(id => ids.has(id)));
  ordemManual = ordemManual.filter(id => ids.has(id));
  const cancelarVoo = mesh => { for (let i = voos.length - 1; i >= 0; i--) if (voos[i].obj === mesh) voos.splice(i, 1); };
  for (const [id, mesh] of cartasDaMao) {
    if (!ids.has(id)) { cancelarVoo(mesh); maoGrupo.remove(mesh); mesh.material.dispose(); cartasDaMao.delete(id); }
  }
  const n = hand.length;
  const plano = layoutMao3D({ quantidade:n, largura:innerWidth, altura:innerHeight, fov:camera.fov, cartaL:CARTA_L, cartaA:CARTA_A });
  layoutDaMao = plano;
  document.body.style.setProperty('--hand-height', plano.alturaMao + 'px');
  hand.forEach((card,i) => {
    let mesh = cartasDaMao.get(card.id), nova = false;
    if (!mesh) {
      mesh = new THREE.Mesh(geoCarta, materialDaCarta(card).clone());
      // Profundidade LIGADA. Com ela desligada a carta era sempre desenhada por
      // cima e o polegar nunca podia passar na frente — era a trapaça que
      // impedia a mão de parecer que segura. O passe da mão tem z-buffer
      // próprio, então ligar aqui não deixa a mesa cortar o leque.
      mesh.material.depthTest = true; mesh.material.depthWrite = true;
      mesh.userData.cardId = card.id; cartasDaMao.set(card.id,mesh); maoGrupo.add(mesh); nova = true;
    }
    cancelarVoo(mesh);
    const p = plano.posicoes[i];
    mesh.visible = true; mesh.renderOrder = 100 + i; mesh.userData.linhaMao = p.fila;
    // meio milímetro entre uma carta e a seguinte: o layout as devolve todas no
    // mesmo plano, e com profundidade ligada isso seria briga de z
    mesh.scale.setScalar(p.escala); mesh.position.set(p.x,p.y + (selecionadas.has(card.id) ? 14 * plano.unidade : 0),p.z + i * 0.0006);
    mesh.rotation.set(0,0,p.giro);
    if (nova && entradaNaMao && !semMovimento) {
      const origem = entradaNaMao === 'meio' ? descarte.grupo.position.clone().setY(MESA_TOPO + 0.06) : topoDoMonte();
      segueACamera();
      voa(mesh,noEspacoDaMao(origem),mesh.position.clone(),{dur:400,arco:0.04});
    }
  });
  entradaNaMao = null; baixadaDe = null;
  sincronizaMaos();
  if (maos.esq && maos.dir) {
    const { escala,baseY,dist,larguraLeque } = plano;
    maos.esq.visible = maos.dir.visible = n > 0;
    if (maos.tridi) {
      // O leque converge num ponto abaixo dele (é o pivô do arco). É ali que a
      // pinça da mão tem de cair: a carta entra entre o polegar e os dedos.
      // ESCALA PELA ANATOMIA, não por tentativa: uma carta de baralho tem 63 mm
      // de largura e uma mão adulta, 185 mm do punho à ponta do médio — 2,94
      // larguras de carta. Como o modelo canônico tem exatamente esse
      // comprimento igual a 1, a escala sai da conta. Com o 0,38 que estava
      // aqui a mão media 1,1 largura de carta: um terço do tamanho.
      const escalaDaMao = 2.94 * CARTA_L * escala;
      const pinca = new THREE.Vector3(-.045, baseY + CARTA_A * escala * 0.16, -dist);
      // a esquerda segura a carta do MEIO do leque — é onde a mão fica quando
      // se abre um leque de verdade, e na ponta ela puxava o olho para o canto.
      // O contrato do modelo diz o resto: a carta do modelo tem a mesma largura
      // da carta da tela (0,341 de mão × 2,94 larguras = 1 largura de carta),
      // então encaixar o plano no lugar da carta acerta tamanho, lugar e ângulo
      // de uma vez. Sem o nó no arquivo, cai no encaixe antigo, por pinça.
      const doMeio = plano.posicoes[Math.floor((n - 1) / 2)];
      _qMao.setFromAxisAngle(EIXO_Z, doMeio.giro);
      if (!encaixaPeloPlano(maos.esq, _v1.set(doMeio.x, doMeio.y, doMeio.z), _qMao, escalaDaMao))
        encaixaNaPinca(maos.esq, 'Left', pinca, escalaDaMao, 1.15);
      // e recua o que a MEDIÇÃO pedir: tudo que não é polegar tem de ficar
      // atrás do plano das cartas. Mede, recua e MEDE DE NOVO — sem a segunda
      // medida não se sabe se o recuo bastou, e era isso que faltava.
      maos.medida = recuaAteSoOPolegarAparecer(maos.esq, -dist);
      // A DIREITA fica fora do quadro fora da sua vez: parada, ela só rouba a
      // faixa de leitura das cartas. Na sua vez, entra pela direita do leque.
      if (minhaVez) {
        // e entra em PINÇA, não espalmada: ela existe para pegar a carta, então
        // é essa a mão que o rig ainda comanda (a esquerda vem posada do
        // arquivo). Sem laço por quadro, a troca é imediata.
        definePosePrimeiraPessoa(maos.rig, 'Right', 'pinca');
        atualizaRigPrimeiraPessoa(maos.rig, 0.016, true);
        // e pelo mesmo contrato, não mais pelo eixo de pinça com um giro
        // escolhido a esmo — era esse giro que a deixava de cabeça para baixo.
        // Ela entra pela direita ALCANÇANDO o leque, e isso são duas voltas
        // sobre o quadro do modelo: meia volta em Y põe a palma para longe da
        // câmera (é o dorso da própria mão que se vê ao esticar o braço) e um
        // quarto de volta em Z deita a mão, apontando os dedos para o leque e
        // deixando o polegar por cima.
        _qMao.setFromAxisAngle(EIXO_Y, Math.PI);
        _qGiro.setFromAxisAngle(EIXO_Z, Math.PI / 2 + doMeio.giro);
        _qMao.premultiply(_qGiro);
        if (!encaixaPeloPlano(maos.dir, _v1.set(larguraLeque * .5, pinca.y, -dist), _qMao, escalaDaMao))
          encaixaNaPinca(maos.dir, 'Right', pinca.clone().setX(larguraLeque * .5), escalaDaMao, 2.0);
        recuaAteSoOPolegarAparecer(maos.dir, -dist);
      } else {
        definePosePrimeiraPessoa(maos.rig, 'Right', 'repouso');
        atualizaRigPrimeiraPessoa(maos.rig, 0.016, true);
        maos.dir.position.set(larguraLeque * 1.4, baseY - 2 * escala, -dist); maos.dir.scale.setScalar(escalaDaMao);
      }
    } else {
      // o desenho 2D de reserva: entra pela borda de baixo, nas pontas do leque
      const x = larguraLeque * .5 + .03;
      maos.esq.position.set(-x,baseY - .24 * escala,-dist - .03);
      maos.dir.position.set(x,baseY - .24 * escala,-dist - .03);
      maos.esq.rotation.z = -.42; maos.dir.rotation.z = .42;
      maos.esq.scale.set(-escala,escala,1); maos.dir.scale.set(escala,escala,1);
    }
  }
}

// Toque na mão seleciona; ARRASTO arruma — o mesmo par de gestos da mesa 2D,
// com o mesmo limiar para o dedo que escorrega não reordenar sem querer.
const raycaster = new THREE.Raycaster();
const ponteiro = new THREE.Vector2();
let layoutDaMao = null;
let arrasto3d = null;
let toqueNoJogo = null;
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
  segueACamera();
  raycaster.setFromCamera(ponteiro, camera);
  const hits = raycaster.intersectObjects([...cartasDaMao.values()], false).sort((a,b) => b.object.renderOrder - a.object.renderOrder);
  if (hits.length) {
    arrasto3d = { id: hits[0].object.userData.cardId, x0: e.clientX, y0: e.clientY, ativo: false };
    return;
  }
  // toque num jogo do feltro: abre o visor naquele jogador. É o caminho para
  // ler carta por carta numa mesa cheia — e para encaixar sem sair da 3D.
  const noJogo = raycaster.intersectObjects(jogosNaMesa.children, true).find((h) => h.object.userData.jogo);
  if (noJogo) toqueNoJogo = { dono: noJogo.object.userData.jogo.dono, x0: e.clientX, y0: e.clientY };
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
  mesh.position.y = (innerHeight / 2 - e.clientY) * layoutDaMao.unidade;
  mesh.renderOrder = 1000;
  mesh.position.z = -layoutDaMao.dist + 0.06;
  mesh.rotation.z = 0;
});

window.addEventListener('pointerup', (e) => {
  if (toqueNoJogo) {
    const { dono, x0, y0 } = toqueNoJogo;
    toqueNoJogo = null;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) < LIMIAR_ARRASTO) { abreVisor(dono); return; }
  }
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
  const y = (innerHeight / 2 - e.clientY) * layoutDaMao.unidade;
  const antes = indiceInsercao3D(semEla.map(c => { const m = cartasDaMao.get(c.id); return {fila:m.userData.linhaMao,x:m.position.x,y:m.position.y}; }),x,y);
  const ordem = semEla.map((c) => c.id);
  ordem.splice(antes, 0, id);
  ordemManual = ordem;
  sincronizaMao();
});
window.addEventListener('pointercancel', () => { arrasto3d = null; toqueNoJogo = null; sincronizaMao(); });

// leve paralaxe: a cabeça mexe um pouco com o dedo/mouse, como quem se inclina
let olharX = 0;
window.addEventListener('pointermove', (e) => {
  olharX = ((e.clientX / innerWidth) - 0.5) * 0.35;
});

// ---------------------------------------------------------------------------
// Botões de ação (HTML): as jogadas do turno
// ---------------------------------------------------------------------------

const barra = document.createElement('div');
barra.className = 'action-3d';
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
  // o visor de jogos sempre à mão: na mesa cheia é por ele que se lê carta por
  // carta, e com uma carta escolhida é por ele que se encaixa
  if (view.players.some((p) => p.melds?.length)) {
    const comCarta = selecionadas.size === 1 && view.turnId === me() && view.phase === 'play';
    barra.appendChild(botao(comCarta ? '🃏 Encaixar num jogo' : '🃏 Ver os jogos', comCarta ? 'primario' : 'normal', () => abreVisor(null)));
  }
  // compra fora da vez: a mesma regra da mesa normal (carta fresca e
  // comprável no meio, fase de puxar, não é a sua vez)
  if (!minhaVez) {
    const podePedir = view.phase === 'draw' && view.discardFresh && view.discardBuyable && view.discardTop;
    if (podePedir) {
      const pedi = view.claims.includes(me());
      barra.appendChild(botao(pedi ? '✓ Pedido feito — toque para desistir' : `🛒 Quero o ${cardLabel(view.discardTop)} do meio`, pedi ? 'normal' : 'primario', () => sendAction({ a: pedi ? 'unclaim' : 'claim' })));
    }
    return;
  }
  if (view.phase === 'draw') {
    barra.appendChild(botao('Puxar do monte', 'normal', () => sendAction({ a: 'draw', source: 'deck' })));
    if (view.discardTop && view.discardBuyable) {
      barra.appendChild(botao('Pegar do meio', 'primario', () => sendAction({ a: 'draw', source: 'discard' })));
    }
    return;
  }
  // quem abre a rodada pode recusar a primeira carta do monte: ela sai do jogo
  // e ele puxa outra, uma vez só
  if (view.you.podeQueimar) {
    barra.appendChild(botao('Queimar e puxar outra', 'normal', () => sendAction({ a: 'queimar' })));
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
// Visor de jogos: o toque num jogo do feltro abre a mesa inteira em tamanho de
// leitura — e é ali que dá para encaixar e trocar pelo coringa.
//
// Numa mesa de oito com todo mundo baixado são umas sessenta cartas em 4 m² de
// feltro: nenhum arranjo faz todas caberem legíveis ao mesmo tempo, e erguer
// carta está proibido (decisão do usuário, 08/09/2026). Então o feltro fica
// com a VISÃO DE CONJUNTO — quem baixou o quê, de quem é cada bloco — e a
// leitura fina (e a jogada) vem daqui, sem mandar o jogador para a mesa 2D.
// ---------------------------------------------------------------------------

const visor = document.createElement('div');
visor.className = 'visor-jogos';
visor.hidden = true;
visor.innerHTML = '<div class="visor-caixa" role="dialog" aria-label="Jogos na mesa">'
  + '<header><strong>Jogos na mesa</strong><button class="visor-x" type="button">fechar</button></header>'
  + '<div class="visor-corpo"></div></div>';
document.body.appendChild(visor);
visor.addEventListener('click', (e) => {
  if (e.target === visor || e.target.classList.contains('visor-x')) fechaVisor();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !visor.hidden) fechaVisor(); });

let visorEm = null;   // id de quem está em foco, ou null quando fechado

function fechaVisor() { visor.hidden = true; visorEm = null; }
function abreVisor(donoId) {
  visorEm = donoId || view?.players.find((p) => p.melds?.length)?.id || null;
  desenhaVisor();
  visor.hidden = false;
}

// a carta do visor é a MESMA arte do tampo: o canvas da textura, redesenhado
// no tamanho de leitura (nada de segunda fonte de verdade para o desenho)
function cartaDoVisor(card) {
  const c = document.createElement('canvas');
  c.className = 'visor-carta';
  c.width = 132; c.height = 185;
  const fonte = materialDaCarta(card).map?.image;
  if (fonte) c.getContext('2d').drawImage(fonte, 0, 0, c.width, c.height);
  return c;
}

function desenhaVisor() {
  const corpo = visor.querySelector('.visor-corpo');
  corpo.textContent = '';
  const comJogos = (view?.players || []).filter((p) => p.melds?.length);
  if (!comJogos.length) {
    const p = document.createElement('p');
    p.className = 'visor-vazio';
    p.textContent = 'Ninguém baixou nada ainda.';
    corpo.appendChild(p);
    return;
  }
  const minhaVez = view.turnId === me() && view.phase === 'play';
  const selecionada = selecionadas.size === 1
    ? (view.you?.hand || []).find((c) => c.id === [...selecionadas][0]) : null;
  const coringaNaMao = selecionada && isJoker(selecionada) ? selecionada : null;

  for (const p of comJogos) {
    const bloco = document.createElement('section');
    bloco.className = 'visor-jogador' + (p.id === visorEm ? ' foco' : '');
    bloco.style.setProperty('--cor', CORES_DE_ASSENTO[assentoDe(p.id) % CORES_DE_ASSENTO.length]);
    const titulo = document.createElement('h3');
    titulo.textContent = p.id === me() ? 'Você' : p.name;
    bloco.appendChild(titulo);

    for (const meld of p.melds) {
      const linha = document.createElement('div');
      linha.className = 'visor-jogo';
      const cartas = document.createElement('div');
      cartas.className = 'visor-cartas';
      for (const card of meld.cards) {
        const alvo = document.createElement('div');
        alvo.className = 'visor-slot';
        alvo.appendChild(cartaDoVisor(card));
        // coringa na mão: ele entra no lugar de QUALQUER carta da sequência
        // baixada e a trocada vem para a sua mão (regra do usuário, 07/09)
        if (minhaVez && coringaNaMao && meld.type === 's' && !meld.cards.some(isJoker) && !isJoker(card)) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'visor-acao';
          b.textContent = 'trocar pelo coringa';
          b.onclick = () => {
            sendAction({ a: 'trocarPorCoringa', meldId: meld.id, cardId: card.id, coringaId: coringaNaMao.id });
            selecionadas.clear(); fechaVisor(); sincronizaMao(); montaBotoes();
          };
          alvo.appendChild(b);
        }
        cartas.appendChild(alvo);
      }
      linha.appendChild(cartas);
      // encaixe: a mesma pergunta da mesa 2D quando a carta serve nas duas
      // pontas — aqui ela vira dois botões, que é mais rápido no dedo
      if (minhaVez && selecionada && layoffOption(selecionada, meld)) {
        const pontas = meld.type === 's' ? layoffEnds(selecionada, meld) : [];
        const acoes = document.createElement('div');
        acoes.className = 'visor-encaixes';
        const manda = (end) => {
          sendAction({ a: 'layoff', cardId: selecionada.id, meldId: meld.id, ...(end ? { end } : {}) });
          selecionadas.clear(); fechaVisor(); sincronizaMao(); montaBotoes();
        };
        if (pontas.length > 1) {
          for (const end of pontas) {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'visor-acao forte';
            b.textContent = end === 'lo' ? `encaixar ${cardLabel(selecionada)} embaixo` : `encaixar ${cardLabel(selecionada)} em cima`;
            b.onclick = () => manda(end);
            acoes.appendChild(b);
          }
        } else {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'visor-acao forte';
          b.textContent = `encaixar ${cardLabel(selecionada)} aqui`;
          b.onclick = () => manda(pontas[0] || null);
          acoes.appendChild(b);
        }
        linha.appendChild(acoes);
      }
      bloco.appendChild(linha);
    }
    corpo.appendChild(bloco);
  }
  const foco = corpo.querySelector('.foco');
  if (foco) foco.scrollIntoView({ block: 'nearest' });
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
    ajustaCameraParaAssentos(outros.length);
    for (const [id, a] of assentos) {
      if (!outros.some((p) => p.id === id)) { scene.remove(a.grupo); scene.remove(a.naBeirada); assentos.delete(id); }
    }
    for (let i = 0; i < outros.length; i++) {
      const p = outros[i];
      if (!assentos.has(p.id)) assentos.set(p.id, criaAssento(p));
      const a = assentos.get(p.id);
      const pos = posicaoDoAssento(i, outros.length);
      a.grupo.position.set(pos.x, 0, pos.z);
      // A frente +Z de cada personagem aponta para o centro da mesa.
      a.grupo.rotation.y = -pos.ang;
      // na beirada do feltro, na direção desta cadeira, com +Z para o centro
      a.naBeirada.position.set(Math.sin(pos.ang) * MESA_RAIO, 0, -Math.cos(pos.ang) * MESA_RAIO);
      a.naBeirada.rotation.y = -pos.ang;

      trocaRotulo(a.contagem, `${p.handCount}`);
      trocaRotulo(a.nome, view.claims?.includes(p.id) ? `🛒 ${p.name}` : p.name);
      // os LEQUE_MAX primeiros filhos são as cartas; o selo fica sempre. Até
      // cinco, a abertura é a de sempre; acima, o leque reabre no mesmo arco
      // com as cartas mais juntas — mão cheia se vê de longe.
      if (a.assento?.modelo) arrumaLeque(a.leque, p.handCount);
      else {
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
      }
      a.leque.visible = p.handCount > 0;
      a.naVez = view.turnId === p.id && view.phase !== 'roundEnd';
      a.proximo = view.players[(view.players.findIndex((q) => q.id === view.turnId) + 1) % view.players.length]?.id === p.id
        && view.phase !== 'roundEnd' && view.phase !== 'gameEnd';
      minhaVez = view.turnId === me() && view.phase !== 'roundEnd' && view.phase !== 'gameEnd';
      a.apagado = (p.desistiu || (!p.isBot && !p.connected));
      for (const m of a.materiais) {
        const transparent = a.apagado || !!m.userData.transparentBase;
        if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
        m.opacity = (m.userData.opacityBase ?? 1) * (a.apagado ? 0.4 : 1);
        m.depthWrite = !a.apagado;
      }
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
    const alturaMonte = Math.max(0.02, Math.min(0.12, view.deckCount * 0.0013));
    monte.caixa.scale.y = alturaMonte / 0.2;
    monte.caixa.position.y = MESA_TOPO + alturaMonte / 2;
    // o número senta na caixa; solto no ar ele era mais uma coisa flutuando
    monte.num.position.set(-0.2, MESA_TOPO + alturaMonte + 0.06, 0.05);

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
        const alturaPilha = 0.012 + view.discardCount * 0.001;
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(CARTA_L * ESCALA_TAMPO, alturaPilha, CARTA_A * ESCALA_TAMPO),
          materialBorda,
        );
        base.castShadow = true;
        base.position.y = MESA_TOPO + alturaPilha / 2;
        const face = new THREE.Mesh(geoCarta, materialDaCarta(topo));
        face.castShadow = true;
        face.scale.setScalar(ESCALA_TAMPO);
        // A carta repousa sobre a pilha, com folga para a espessura do papel.
        face.rotation.x = -Math.PI / 2 + 0.035;
        face.position.set(0, MESA_TOPO + alturaPilha + 0.007, 0.0);
        face.userData.alvo = face.position.clone();
        if (!semMovimento && descarteDe) {
          const a = assentos.get(descarteDe);
          if (a?.assento?.modelo) {
            const destino = face.position.clone();
            voa(face, destino, destino, { dur: 330, atraso: temGesto(a) ? 520 : 90, arco: 0.012,
              deAtual: () => descarte.grupo.worldToLocal(pontoDaMaoAtiva(a)) });
          } else face.userData.cai = performance.now();
        }
        descarteDe = null;
        descarte.grupo.add(base, face);
      }
    }

    // Jogos baixados: cartas DEITADAS no feltro na frente de quem baixou
    // (decisão do usuário, 2026-09-04 e de novo em 08/09: nada de erguer,
    // flutuar ou inclinar carta). Ver os jogos da mesa é metade do
    // planejamento, então o que dá leitura aqui é outra coisa:
    //   * toda carta fica VIRADA PARA A CÂMERA. Antes cada fileira girava
    //     junto com a cadeira do dono, e a sua saía de cabeça para baixo.
    //   * a carta do tampo cresceu (ESCALA_TAMPO cheia) e o passo abriu de
    //     8 para 10,5 cm, que é a fatia onde mora o índice do canto.
    //   * cada jogador ganha um TAPETE na cor da sua banqueta: com a mesa
    //     cheia os jogos viravam uma sopa de cartas sem dono (queixa do
    //     usuário, 08/09/2026).
    //   * quem baixa muito QUEBRA EM LINHAS em vez de encolher tudo.
    // O resto da leitura vem da câmera (mais alta, em `alturaDoOlho`) e do
    // visor de jogos, que abre no toque.
    jogosNaMesa.clear();
    let meuJogoZ = Infinity;    // a borda mais funda dos MEUS jogos, para a barra não sentar em cima
    let meuJogoPertoZ = -Infinity;  // e a mais perto de você, a de baixo na tela
    const todos = [view.players.find((p) => p.id === me()), ...outros].filter(Boolean);
    for (const p of todos) {
      if (!p.melds?.length) continue;
      const meu = p.id === me();
      const idx = outros.indexOf(p);
      const pos = meu ? { x: 0, z: MESA.assento, ang: Math.PI } : posicaoDoAssento(idx, outros.length);
      // Os jogos ficam num ANEL em volta das pilhas do centro, cada um na
      // frente da própria cadeira: a fileira da frente a 0,72 m do centro, a
      // de trás (mesa cheia) mais para dentro. Os SEUS vêm bem para dentro:
      // na sua beirada eles caíam no rodapé, onde mora o seu leque.
      const fundo = !meu && outros.length > 4 && idx % 2 === 1;
      const raioJogos = meu ? 0.38 : fundo ? 0.48 : 0.72;
      // O giro do conjunto acompanha a cadeira do dono (é o que diz de quem é
      // o jogo), mas limitado a ±35°: além disso a carta deitada vira texto de
      // lado. A sua fileira não gira — ela é lida de frente.
      const giro = meu ? 0 : Math.max(-0.61, Math.min(0.61, -pos.ang));
      const escalaJogo = meu ? 0.72 : 1;   // a sua é a mais perto da câmera

      const passoCarta = 0.105;
      const vaoEntreJogos = 0.14;
      const cartaLarg = CARTA_L * ESCALA_TAMPO;
      const larguras = p.melds.map((m) => (m.cards.length - 1) * passoCarta + cartaLarg);
      // quanto cabe numa linha: o vão até o vizinho do anel
      const vao = meu || outros.length < 2 ? 1.15 : Math.max(0.5, raioJogos * (2 * (camera.aspect < 1 ? 0.58 : 0.96) / Math.max(1, outros.length - 1)) * 1.7);
      const limite = Math.min(1.15, vao) / escalaJogo;
      // Uma linha por vez, quebrando quando estoura. Encolher a fileira
      // inteira (o que se fazia antes) era o que sumia com as cartas de quem
      // baixava três jogos; a segunda linha vai para DENTRO da mesa, na
      // direção do centro, onde há feltro sobrando.
      const maxLinhas = fundo ? 1 : 2;
      const linhas = [[]]; const largs = [0];
      p.melds.forEach((meld, mi) => {
        const k = linhas.length - 1;
        if (largs[k] > 0 && largs[k] + vaoEntreJogos + larguras[mi] > limite && linhas.length < maxLinhas) {
          linhas.push([]); largs.push(0);
        }
        const j = linhas.length - 1;
        linhas[j].push({ meld, larg: larguras[mi] });
        largs[j] += (largs[j] ? vaoEntreJogos : 0) + larguras[mi];
      });

      const cor = new THREE.Color(CORES_DE_ASSENTO[assentoDe(p.id) % CORES_DE_ASSENTO.length]);
      const novas = [];
      linhas.forEach((linha, k) => {
        const raio = raioJogos - k * 0.24;
        const frente = new THREE.Group();
        frente.position.set(Math.sin(pos.ang) * raio, MESA_TOPO, -Math.cos(pos.ang) * raio);
        frente.rotation.y = giro;
        const total = largs[k];
        // o tapete do dono: a borda na cor da banqueta dele e o miolo escuro,
        // que é o que separa um jogo do outro quando a mesa enche
        const alt = CARTA_A * ESCALA_TAMPO;
        for (const [dl, dp, material, y] of [
          [total + 0.13, alt + 0.11, new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.5, depthWrite: false }), 0.004],
          [total + 0.08, alt + 0.06, new THREE.MeshBasicMaterial({ color: 0x0a2419, transparent: true, opacity: 0.55, depthWrite: false }), 0.005],
        ]) {
          const t = new THREE.Mesh(geoSombra, material);
          t.rotation.x = -Math.PI / 2;
          t.scale.set(dl, dp, 1);
          t.position.set(0, y, 0);
          frente.add(t);
        }
        let x = -total / 2;
        for (const { meld, larg } of linha) {
          meld.cards.forEach((card, ci) => {
            const carta = new THREE.Mesh(geoCarta, materialDaCarta(card));
            carta.castShadow = true;
            carta.scale.setScalar(ESCALA_TAMPO);
            // deitada no feltro (o 0,025 é só a sombra da borda), e virada
            // para a câmera: o giro do conjunto é desfeito na carta
            carta.rotation.set(-Math.PI / 2 + 0.025, 0, 0);
            carta.position.set(x + cartaLarg / 2 + ci * passoCarta, 0.008 + ci * 0.001, ci * 0.006);
            carta.userData.jogo = { dono: p.id, meldId: meld.id };
            frente.add(carta);
          });
          x += larg + vaoEntreJogos;
        }
        if (escalaJogo !== 1 || total > limite) {
          const f = escalaJogo * Math.min(1, limite / total);
          frente.scale.set(f, 1, f);
        }
        jogosNaMesa.add(frente);
        if (meu) {
          meuJogoZ = Math.min(meuJogoZ, raio - (alt * escalaJogo) / 2 - 0.03);
          meuJogoPertoZ = Math.max(meuJogoPertoZ, raio + (alt * escalaJogo) / 2);
        }
        if (linha.some(({ meld }) => !jogosVistos.has(meld.id))) novas.push(frente);
      });
      // jogo novo de quem acabou de baixar: a linha inteira voa do assento
      // dele (ou da frente da sua cadeira) até o lugar — o grupo, não carta
      // por carta, que é o gesto de quem põe o jogo na mesa
      if (novas.length && baixadaDe === p.id && !semMovimento) {
        const a = assentos.get(p.id);
        const origem = a ? lequeDe(a) : new THREE.Vector3(0, MESA_TOPO + 0.3, 1.2);
        for (const frente of novas) {
          voa(frente, origem, frente.position.clone(), { dur: 340, atraso: temGesto(a) ? 635 : 120, arco: 0.015, deAtual: a?.assento?.modelo ? () => pontoDaMaoAtiva(a) : null });
        }
      }
      for (const m of p.melds) jogosVistos.add(m.id);
    }

    sincronizaMao();
    // A barra de ações sobe acima dos SEUS jogos: com eles na beirada, os
    // botões (que são HTML, por cima da cena) sentavam bem no meio das cartas
    // que você acabou de baixar.
    {
      const base = parseFloat(document.body.style.getPropertyValue('--hand-height')) || 160;
      let fundo = base + 14;
      if (meuJogoZ < Infinity) {
        // a mira é a mesma do laço de desenho: na PRIMEIRA sincronia ainda não
        // houve quadro nenhum, e sem isso a câmera ainda olha no horizonte
        camera.lookAt(camera.position.x * 0.25, MESA_TOPO + 0.12, -0.35);
        camera.updateMatrixWorld();
        const naTela = (z) => {
          const p = new THREE.Vector3(0, MESA_TOPO, z).project(camera);
          return (-p.y * 0.5 + 0.5) * innerHeight;
        };
        // Se os seus jogos terminam ACIMA da barra, ela fica onde estava
        // (encostada no leque, que é onde a mão a alcança). Só quando eles
        // descem até a faixa da barra é que ela sobe para o outro lado deles —
        // e nunca a ponto de tapar o monte e o descarte.
        if (naTela(meuJogoPertoZ) > innerHeight - fundo - 46) {
          const teto = innerHeight - naTela(0.2) - 46;
          fundo = Math.max(fundo, Math.min(teto, innerHeight - naTela(meuJogoZ) + 10));
        }
      }
      document.body.style.setProperty('--acao-fundo', `${Math.round(Math.min(innerHeight * 0.6, fundo))}px`);
    }
    montaBotoes();
    if (!visor.hidden) desenhaVisor();   // com o visor aberto, ele segue a mesa

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

function trocaRotulo(sprite, texto, corFundo = 'rgba(27,17,11,0.9)', corTexto = '#f2c14e') {
  if (sprite.userData.texto === texto && sprite.userData.cor === corFundo) return;
  sprite.userData.texto = texto; sprite.userData.cor = corFundo;
  const novo = rotulo(texto, corFundo, corTexto);
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
        if (a.assento?.modelo) {
          gestoCarta(a.assento.modelo, 'comprar', de);
          const destino = a.grupo.localToWorld(new THREE.Vector3(-0.1, 0.91, 0.53));
          m.scale.setScalar(ESCALA_CARTA_MAO);
          voa(m, de, destino, { dur: 430, arco: 0.015, paraAtual: () => pontoDaMaoAtiva(a), aoFim: () => scene.remove(m) });
        } else voa(m, de, lequeDe(a), { dur: 420, aoFim: () => scene.remove(m) });
      }
    }
  }
  if (ev.e === 'baixou' && !semMovimento) baixadaDe = ev.p;
  if (ev.e === 'discard' && !semMovimento) descarteDe = ev.p;
  // o verbo do lance na placa de quem o fez, por um instante — é o "JOGOU" da
  // referência, e o único jeito de saber o que um vizinho fez sem ler o toast
  {
    const VERBOS = { draw: 'COMPROU', buy: 'COMPROU', tomouSobra: 'PEGOU A SOBRA', discard: 'DESCARTOU', baixou: 'BAIXOU', layoff: 'ENCAIXOU', claim: 'PEDIU O MEIO' };
    const dele = ev.p ? assentos.get(ev.p) : null;
    if (dele && VERBOS[ev.e]) { dele.aviso = VERBOS[ev.e]; dele.avisoAte = performance.now() + 1800; }
  }
  const alvo = ev.p || ev.winnerId;
  const a = alvo ? assentos.get(alvo) : null;
  if (!a) return;
  if (!semMovimento && a.assento?.modelo && ['discard', 'baixou', 'layoff'].includes(ev.e)) gestoCarta(a.assento.modelo, ev.e === 'discard' ? 'descartar' : 'baixar', descarte.grupo.position.clone().setY(MESA_TOPO + 0.06));
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
// A altura do olho SEGUE a distância: o que faz uma carta deitada ler é o
// ângulo com que a vista bate no feltro, e ele é altura ÷ distância. Com o
// olho fixo a 1,20 m, a fileira do outro lado da mesa era vista a 11° e virava
// uma tira de 19 px — e quando a mesa enchia a câmera ainda recuava, piorando.
// Fixando a INCLINAÇÃO, a mesa cheia sobe o olho junto e todo jogo do anel é
// visto a ~19°, do jeito de quem se debruça um pouco sobre a mesa para ver.
// (Erguer a CARTA está proibido — decisão do usuário, 08/09/2026 — então quem
// se move é a cabeça.)
// O teto de 1,62 m é o limite de continuar SENTADO à mesa: com sete
// adversários a câmera recua a 2,6 m e, sem teto, a inclinação viraria uma
// vista de cima com todo mundo miúdo. Mesa cheia é o caso em que nenhuma
// câmera dá conta das sessenta cartas — ali quem resolve é o visor de jogos.
const INCLINACAO = 0.34;                  // tangente do ângulo sobre o tampo
const ANEL_LONGE = 0.78;                  // a fileira mais distante do anel
const alturaDoOlho = (z) => Math.min(1.62, MESA_TOPO + (z + ANEL_LONGE) * INCLINACAO);
function ajustaCameraParaAssentos(total) {
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  let z = OLHO.z;
  // Recua só o necessário para o corpo de cada vizinho caber (folga de 22 cm;
  // o rótulo do nome pode cortar) e **nunca além de 1,95 m**: era 2,6 m, e
  // com a mesa cheia isso jogava a câmera longe demais — "muito longe também
  // dificulta para entender o jogo que está na mesa" (usuário, 08/09/2026).
  // Um pouco de recuo basta; quem senta nas pontas fica de fora do quadro, e
  // é o rodízio do turno que os traz para o meio.
  for (let i=0;i<total;i++) { const p=posicaoDoAssento(i,total); z=Math.max(z, p.z + (Math.abs(p.x)+0.22)/tanH); }
  camera.position.z=Math.min(1.95, z); camera.position.y=alturaDoOlho(camera.position.z);
}
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
  // Na altura dos olhos de quem senta (2026-09-05, referência do Capote): a
  // cabeça a 1,2 m, um pouco à frente da própria cadeira, olhando 12° para
  // baixo, para o meio do tampo. Em pé o campo abre para caber os vizinhos.
  camera.fov = camera.aspect < 1 ? 72 : 55;
  const z = OLHO.z + (1 - emPe) * 0.15;
  camera.position.set(OLHO.x, alturaDoOlho(z), z);
  camera.updateProjectionMatrix();
  if(view) ajustaCameraParaAssentos(Math.max(0, view.players.length-1));
}
window.addEventListener('resize', encaixaTela);
encaixaTela();
window.addEventListener('resize', () => { if (view) sincroniza(true); });

// ---------------------------------------------------------------------------
// Voos: qualquer objeto indo de um ponto a outro com aceleração suave e um
// arco. É o que anima distribuir, puxar e baixar — a mesa 2D tem os mesmos
// gestos, e sem eles a 3D trocava de estado num piscar, como uma planilha.
// ---------------------------------------------------------------------------
const voos = [];
function voa(obj, de, para, { dur = 450, atraso = 0, arco = 0.12, aoFim = null, deAtual = null, paraAtual = null } = {}) {
  obj.position.copy(de); if (atraso) obj.visible = false;
  voos.push({ obj, de: de.clone(), para: para.clone(), t0: performance.now(), dur, atraso, arco, aoFim, deAtual, paraAtual, iniciou: false });
}
function animaVoos(t) {
  for (let i = voos.length - 1; i >= 0; i--) {
    const v = voos[i];
    const k = (t - v.t0 - v.atraso) / v.dur;
    if (k < 0) continue;
    if (!v.iniciou) { v.obj.visible = true; if(v.deAtual) v.de.copy(v.deAtual()); v.iniciou = true; }
    if (v.paraAtual) v.para.copy(v.paraAtual());
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
// Quem TEM gesto de braço: só um modelo com esqueleto. Os voos de descarte e
// de baixada esperavam meio segundo para a carta sair da mão no meio do gesto;
// numa escultura estática, que não estende o braço, isso virou tempo parado
// antes de a carta se mexer.
const temGesto = (a) => !!a?.assento?.modelo?.interacao && !a.assento.modelo.interacao.estatico;
const pontoDaMaoAtiva = (a) => { const obj = a.assento?.modelo?.interacao?.carta || a.leque; obj.updateWorldMatrix(true, false); return obj.getWorldPosition(new THREE.Vector3()); };
const lequeDe = (a) => { const v = new THREE.Vector3(); a.leque.getWorldPosition(v); return v; };
// A mão está presa à câmera: um ponto do mundo vira ponto do leque por aqui.
const noEspacoDaMao = (mundo) => maoGrupo.worldToLocal(mundo.clone());

// O que os eventos deixam armado para o próximo sincroniza animar.
let entradaNaMao = null;     // 'monte' | 'meio' — a carta nova da minha mão vem de lá
let descarteDe = null;
let baixadaDe = null;        // id de quem acabou de baixar: os jogos novos dele voam do assento
const jogosVistos = new Set();

let ultimoDesenho = 0, ultimaSombra = 0, somaFrame = 0, nFrames = 0;
function quadro(t) {
  requestAnimationFrame(quadro);
  if (document.hidden || renderer.getContext().isContextLost()) { ultimoDesenho = 0; return; }
  const intervalo = compacto || semMovimento ? 1000 / 30 : 1000 / 60;
  if (ultimoDesenho && t - ultimoDesenho < intervalo - 1) return;
  const frameMs = ultimoDesenho ? t - ultimoDesenho : intervalo;
  ultimoDesenho = t;
  somaFrame += frameMs; nFrames++;
  if (nFrames >= 240) {
    if (somaFrame / nFrames > 42 && escalaPixels > 1) {
      escalaPixels = Math.max(1, escalaPixels - 0.25); renderer.setPixelRatio(escalaPixels);
    }
    somaFrame = 0; nFrames = 0;
  }
  animaVoos(t);

  // a cabeça acompanha o ponteiro de leve; a mesa continua o alvo
  camera.position.x += (((semMovimento ? 0 : olharX) * 0.4) - camera.position.x) * (1 - Math.exp(-frameMs / 160));
  camera.lookAt(camera.position.x * 0.25, MESA_TOPO + 0.12, -0.35);

  for (const [id, a] of assentos) {
    // respiro contínuo, dessincronizado por posição
    if (!semMovimento && !a.apagado && !a.assento?.modelo) {
      a.corpo.position.y = a.assento?.modelo ? 0 : Math.sin(t / 1300 + a.grupo.position.x * 3) * 0.006;
    }
    // pulo de reação
    if (a.pulo && !semMovimento && !a.assento?.modelo) {
      const dt = (t - a.pulo) / 480;
      if (dt >= 1) a.pulo = 0;
      else a.corpo.position.y = Math.sin(dt * Math.PI) * 0.14;
    }
    // o corpo vira de leve para quem está jogando; o leque (e a boca da fala
    // de um modelo externo, que mora no grupo) giram em volta do mesmo eixo
    {
      const alvoGiro = a.apagado || a.assento?.modelo ? 0 : a.giroAlvo;
      a.corpo.rotation.y += (alvoGiro - a.corpo.rotation.y) * (semMovimento ? 1 : 0.06);
      const r = a.corpo.rotation.y, s = Math.sin(r), c = Math.cos(r);
      const b = a.lequeBase;
      if (!a.assento?.modelo) { a.leque.position.set(c * b.x + s * b.z, b.y + a.corpo.position.y, c * b.z - s * b.x); a.leque.rotation.y = r; }
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
      const dt = a.tAnterior ? Math.min(0.05, (t - a.tAnterior) / 1000) : 0; a.tAnterior = t;
      if (m.mixer && !semMovimento) m.mixer.update(dt);
      atualizaInteracao(m, dt, { flexao: a.leque.visible ? 0.68 : 0, parado: semMovimento, olhar: a.giroAlvo, suaVez: !!a.naVez });
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
    // a placa de estado: o verbo do último lance manda enquanto dura; depois
    // volta a dizer de quem é a vez. Some quando não há nada a dizer.
    {
      if (a.avisoAte && t > a.avisoAte) { a.aviso = null; a.avisoAte = 0; }
      const texto = a.aviso || (a.apagado ? 'FORA' : a.naVez ? 'JOGANDO' : a.proximo ? 'PRÓXIMO' : '');
      const cor = a.aviso ? 'rgba(58,102,74,0.95)' : a.naVez ? 'rgba(207,138,42,0.95)' : 'rgba(27,17,11,0.8)';
      a.estado.visible = !!texto;
      if (texto) trocaRotulo(a.estado, texto, cor, '#fff6e2');
    }
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
  if (t - ultimaSombra > (compacto ? 150 : 100)) { renderer.shadowMap.needsUpdate = true; ultimaSombra = t; }
  renderer.render(scene, camera);
  // os dedos caminham entre as poses (repouso, leque, pinça) no ritmo do quadro
  if (maos.rig) atualizaRigPrimeiraPessoa(maos.rig, frameMs / 1000, semMovimento);
  // segundo passe: limpa a profundidade e desenha a sua mão por cima do mundo,
  // com profundidade correta entre as cartas e os dedos
  segueACamera();
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(cenaMao, camera);
  renderer.autoClear = true;
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

// para olhar de fora (console), como o provador: os assentos, a cena e a câmera
window.mesa3d = { assentos, scene, camera, renderer, quadro, cenaMao, maoGrupo, abreVisor, maos, encaixaNaPinca, medeAMao };

// interface-2026-09-07-r1
