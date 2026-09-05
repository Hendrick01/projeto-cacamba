// ============================================================================
// Caçamba — o provador de modelos 3D
//
// A oficina do elenco: abre um .glb do aparelho (fica no navegador; nada
// sobe), senta o personagem à mesa com a MESMA luz, o mesmo sombreamento e o
// mesmo encaixe da mesa 3D (modelo3d.js) e confere o contrato de
// public/models/LEIA-ME.md, item a item. Serve para quem está modelando ver
// o resultado antes de pôr o arquivo em public/models e na lista.
// ============================================================================

import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { ALTURA_SENTADO, encaixaModelo, confereModelo, reage, criaBanqueta, ESCALA_ELENCO } from './modelo3d.js';
import { SLUGS } from '/shared/elenco.js';

const $ = (id) => document.getElementById(id);
const MESA_TOPO = 0.92;          // o tampo, como na mesa 3D
const MESA_RAIO = 1.8;
const DIST_ASSENTO = 2.66;       // do centro da mesa à cadeira, como na mesa 3D

// ---------------------------------------------------------------------------
// Cena: o mesmo salão, uma cadeira só
// ---------------------------------------------------------------------------
const canvas = $('cena');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b110b);
scene.fog = new THREE.Fog(0x1b110b, 7, 16);
const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 40);

// a lâmpada da mesa: uma fonte só sobre o meio do tampo, mais o reflexo do feltro
scene.add(new THREE.AmbientLight(0x9a7850, 1.05));
const reflexo = new THREE.DirectionalLight(0xffe2a8, 0.85);
reflexo.position.set(0, 2.4, 5);
scene.add(reflexo);
const foco = new THREE.SpotLight(0xffe2a8, 140, 14, 0.72, 0.55, 1.6);
foco.position.set(0.45, 4.4, DIST_ASSENTO - 0.7);
foco.target.position.set(0, MESA_TOPO, DIST_ASSENTO);
foco.castShadow = true;
foco.shadow.mapSize.set(1024, 1024);
foco.shadow.bias = -0.0004;
foco.shadow.normalBias = 0.02;
foco.shadow.camera.near = 1;
scene.add(foco, foco.target);

// chão e mesa (a parte que interessa: a beirada na frente da cadeira)
const chao = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.95 }));
chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true;
scene.add(chao);
const mesa = new THREE.Group();
const tampo = new THREE.Mesh(new THREE.CylinderGeometry(MESA_RAIO, MESA_RAIO, 0.06, 64), new THREE.MeshStandardMaterial({ color: 0x2f7a4a, roughness: 0.92 }));
tampo.position.y = MESA_TOPO - 0.03; tampo.receiveShadow = true; tampo.castShadow = true;
const aro = new THREE.Mesh(new THREE.TorusGeometry(MESA_RAIO, 0.07, 12, 96), new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.6 }));
aro.rotation.x = Math.PI / 2; aro.position.y = MESA_TOPO - 0.01; aro.castShadow = true;
const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, MESA_TOPO - 0.06, 24), new THREE.MeshStandardMaterial({ color: 0x4a2a16, roughness: 0.7 }));
pe.position.y = (MESA_TOPO - 0.06) / 2;
mesa.add(tampo, aro, pe);
mesa.position.z = DIST_ASSENTO;
scene.add(mesa);

// o palco gira com o dedo: o personagem, as marcas e o leque vão junto
const palco = new THREE.Group();
scene.add(palco);

// marcas: a linha de 1,55 m e a seta da frente (+Z)
const M_MARCA = new THREE.MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false });
const linhaAltura = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.006, 0.006), M_MARCA);
linhaAltura.position.y = ALTURA_SENTADO;
const seta = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.02, 0.2), 0.4, 0xf2c14e, 0.12, 0.07);
palco.add(linhaAltura, seta);
// a banqueta da mesa: é nela que o personagem tem de estar sentado
const banqueta = criaBanqueta(0x8c6a45);
palco.add(banqueta);

// o leque de cartas viradas, no lugar em que a mesa o põe (entre as mãos)
const texturaVerso = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 180;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5f1e6'; ctx.fillRect(0, 0, 128, 180);
  ctx.fillStyle = '#b5432e'; ctx.fillRect(8, 8, 112, 164);
  ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 3; ctx.strokeRect(18, 18, 92, 144);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const materialVerso = new THREE.MeshStandardMaterial({ map: texturaVerso, roughness: 0.5, toneMapped: false });
const geoCarta = new THREE.PlaneGeometry(0.42, 0.59);
const leque = new THREE.Group();
for (let i = 0; i < 5; i++) {
  const carta = new THREE.Mesh(geoCarta, materialVerso);
  carta.scale.setScalar(0.42);
  const ang = (i - 2) * 0.17;
  carta.position.set(Math.sin(ang) * 0.28, Math.cos(ang) * 0.02, i * 0.006);
  carta.rotation.z = -ang;
  leque.add(carta);
}
leque.position.set(0, 1.02, 0.17);
leque.rotation.x = -0.14;
leque.scale.setScalar(0.55);   // como na mesa: escala humana nas mãos de um modelo
leque.visible = false;
palco.add(leque);

// a boca da fala quando o modelo não tem o morph: a elipse escura da mesa
const bocaFala = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshBasicMaterial({ color: 0x2a1b12 }));
bocaFala.scale.set(1, 0.6, 1); bocaFala.visible = false;
palco.add(bocaFala);

// ---------------------------------------------------------------------------
// Câmera: sempre do lado da mesa, olhando para a cadeira; o dedo gira o palco
// ---------------------------------------------------------------------------
// o alvo fica baixo de propósito: a folha de conferência toma o pé da tela,
// e o personagem inteiro (0 a 1,55 m) precisa caber no que sobra em cima
// e de viés (AZIMUTE): de frente, o tampo da mesa tapava tudo abaixo do peito
const alvo = new THREE.Vector3(0, 0.6, 0);
const AZIMUTE = 0.95;
let elev = 0.3, dist = 3.2;
function posicionaCamera() {
  const r = dist * Math.cos(elev);
  camera.position.set(Math.sin(AZIMUTE) * r, alvo.y + dist * Math.sin(elev), Math.cos(AZIMUTE) * r);
  camera.lookAt(alvo);
}
function encaixaTela() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 46 : 36;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', encaixaTela);
encaixaTela(); posicionaCamera();

const dedos = new Map();
let pincaAnterior = 0;
canvas.addEventListener('pointerdown', (e) => { dedos.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture?.(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  const d = dedos.get(e.pointerId); if (!d) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  d.x = e.clientX; d.y = e.clientY;
  if (dedos.size === 1) {
    palco.rotation.y += dx * 0.012;
    elev = Math.min(1.25, Math.max(0.05, elev + dy * 0.006));
  } else if (dedos.size === 2) {
    const [a, b] = [...dedos.values()];
    const agora = Math.hypot(a.x - b.x, a.y - b.y);
    if (pincaAnterior) dist = Math.min(6, Math.max(1.4, dist * (pincaAnterior / agora)));
    pincaAnterior = agora;
  }
  posicionaCamera();
});
const solta = (e) => { dedos.delete(e.pointerId); if (dedos.size < 2) pincaAnterior = 0; };
canvas.addEventListener('pointerup', solta);
canvas.addEventListener('pointercancel', solta);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); dist = Math.min(6, Math.max(1.4, dist * (1 + e.deltaY * 0.0015))); posicionaCamera(); }, { passive: false });

// ---------------------------------------------------------------------------
// O modelo: carregar, encaixar, conferir
// ---------------------------------------------------------------------------
const carregador = new GLTFLoader();
let atual = null;            // { nome, fonte, m }  — fonte: ArrayBuffer ou URL
let estilo = 'elenco';
let caraAte = 0;
const itensEl = $('itens');
const dicaEl = document.querySelector('.dica');
const botoesReacao = ['ex-neutro', 'ex-feliz', 'ex-bravo', 'ex-boca', 'estilo'].map($);

function avisa(texto, classe = '') {
  itensEl.innerHTML = '';
  const li = document.createElement('li'); li.textContent = texto; if (classe) li.className = classe;
  itensEl.appendChild(li);
}
function limpa(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m) continue;
      for (const t of [m.map, m.normalMap, m.emissiveMap, m.roughnessMap, m.metalnessMap]) t?.dispose?.();
      m.dispose();
    }
  });
  obj.removeFromParent();
}
function mostraItens(itens) {
  itensEl.innerHTML = '';
  for (const it of itens) {
    const li = document.createElement('li');
    li.className = it.ok === true ? 'ok' : it.ok === false ? 'nao' : '';
    li.textContent = it.texto;
    itensEl.appendChild(li);
  }
  const pendentes = itens.filter((i) => i.ok === false).length;
  dicaEl.innerHTML = pendentes
    ? `<span class="aviso">${pendentes} item(ns) fora do combinado.</span> A mesa corrige medidas, mas o resto é do arquivo. Arraste para girar; dois dedos ou a roda aproximam.`
    : 'Tudo no combinado. Arraste para girar; dois dedos ou a roda aproximam. Ponha o arquivo em public/models/&lt;slug&gt;.glb e o slug em lista.json.';
}

function poeNaCena(gltf, nome) {
  if (atual?.m) { atual.m.mixer?.stopAllAction(); limpa(atual.m.raiz); }
  const m = encaixaModelo(gltf, nome, { estilo, avisa: false });
  palco.add(m.raiz);
  banqueta.scale.setScalar(m.sentado ? ESCALA_ELENCO : 1);   // como na mesa: a banqueta cresce com quem senta nela
  leque.position.copy(m.posLeque).add(new THREE.Vector3(0, -0.06, 0.05)); leque.rotation.x = -0.35; leque.visible = true;   // como na mesa: à frente das mãos, só os dedos acima da borda
  bocaFala.position.set(0, m.alturaCabeca - 0.07, 0.16); bocaFala.visible = false;
  atual = { ...atual, nome, m };
  mostraItens(confereModelo(gltf, m));
  for (const b of botoesReacao) b.disabled = false;
  $('ex-boca').disabled = false;
  document.title = `${nome} — Provador de modelos`;
  // a arte 2D do mesmo personagem ao lado, para conferir os sinais de identidade
  const slug = nome.replace(/[_-]?teste.*$/i, '').toLowerCase();
  const ref = $('ref2d');
  ref.hidden = !SLUGS.includes(slug);
  if (!ref.hidden) ref.src = `assets/personagens/${slug}-corpo-inteiro.svg`;
}

function carrega(nome, fonte) {
  avisa(`Abrindo ${nome}…`);
  const erro = (e) => { console.error(e); avisa(`Não deu para abrir ${nome}: ${e?.message || e}`, 'nao'); };
  atual = { nome, fonte, m: atual?.m || null };
  // os modelos da mesa vêm com cache longo (são arte); aqui o arquivo é o que
  // acabou de ser trocado, então pede de novo ao servidor e passa pelo mesmo
  // `parse` do arquivo local
  const bytes = fonte instanceof ArrayBuffer ? Promise.resolve(fonte)
    : fetch(fonte, { cache: 'reload' }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); });
  bytes.then((buf) => carregador.parse(buf, '', (g) => poeNaCena(g, nome), erro)).catch(erro);
}

$('arquivo').addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  $('lista').value = '';
  try { carrega(f.name.replace(/\.(glb|gltf)$/i, ''), await f.arrayBuffer()); }
  catch (err) { avisa(`Não deu para ler o arquivo: ${err.message}`, 'nao'); }
});

// os que já estão na mesa (lista.json) e o exemplo mínimo
fetch('/models/lista.json').then((r) => (r.ok ? r.json() : { modelos: [] })).catch(() => ({ modelos: [] })).then((j) => {
  const sel = $('lista');
  for (const slug of (Array.isArray(j.modelos) ? j.modelos : [])) {
    const o = document.createElement('option'); o.value = slug; o.textContent = slug; sel.appendChild(o);
  }
  const ex = document.createElement('option'); ex.value = '_exemplo'; ex.textContent = '_exemplo (caixas)'; sel.appendChild(ex);
});
$('lista').addEventListener('change', (e) => { const slug = e.target.value; if (slug) carrega(slug, `/models/${slug}.glb`); });

// ---------------------------------------------------------------------------
// Reações e estilo
// ---------------------------------------------------------------------------
function neutro() {
  const m = atual?.m; if (!m) return;
  for (const q of ['feliz', 'bravo', 'bocaAberta']) if (m.morfos[q]) m.morfos[q].malha.morphTargetInfluences[m.morfos[q].indice] = 0;
  bocaFala.visible = false;
  caraAte = 0;
}
$('ex-neutro').onclick = neutro;
for (const nome of ['feliz', 'bravo']) {
  $(`ex-${nome}`).onclick = () => {
    const m = atual?.m; if (!m) return;
    neutro();
    if (!reage(m, nome)) { dicaEl.innerHTML = `<span class="aviso">Este modelo não tem morph nem clip “${nome}”</span> — a mesa não mostra reação nele.`; return; }
    caraAte = performance.now() + 1900;   // a mesa desfaz a cara depois de 1,9 s
  };
}
const boca = (aberta) => {
  const m = atual?.m; if (!m) return;
  if (m.morfos.bocaAberta) m.morfos.bocaAberta.malha.morphTargetInfluences[m.morfos.bocaAberta.indice] = aberta ? 0.85 : 0;
  else bocaFala.visible = aberta;
};
$('ex-boca').addEventListener('pointerdown', (e) => { e.preventDefault(); boca(true); });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('ex-boca').addEventListener(ev, () => boca(false));

$('estilo').onclick = () => {
  if (!atual) return;
  estilo = estilo === 'elenco' ? 'original' : 'elenco';
  $('estilo').textContent = `estilo: ${estilo}`;
  carrega(atual.nome, atual.fonte);
};
$('alca').onclick = () => $('folha').classList.toggle('recolhida');
$('mesa').onclick = () => {
  mesa.visible = !mesa.visible;
  $('mesa').textContent = `mesa: ${mesa.visible ? 'sim' : 'não'}`;
};

// ---------------------------------------------------------------------------
// Quadro a quadro
// ---------------------------------------------------------------------------
let tAnterior = 0;
function quadro(t) {
  const dt = tAnterior ? (t - tAnterior) / 1000 : 0; tAnterior = t;
  const m = atual?.m;
  if (m) {
    m.mixer?.update(dt);
    if (caraAte && t > caraAte) neutro();
  }
  renderer.render(scene, camera);
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

// para olhar de fora (console): o modelo atual, o palco e a cena
window.provador = { atual: () => atual, palco, scene, camera, carrega, leque };
