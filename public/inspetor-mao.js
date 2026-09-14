import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const MAOS = (q.get('maos') || q.get('mao') || 'mao-fp-esq').split(',').filter(Boolean);
const N = Math.max(1, Math.min(15, Number(q.get('cartas') || 9)));
const LADO = Math.max(320, Math.min(900, Number(q.get('lado') || 420)));

// A carta na escala da mão: 63 mm de largura contra 185 mm do punho à ponta do
// médio. É a mesma proporção da carta do jogo (0,42 × 0,59).
const LARG = 0.34, ALT = LARG * 0.59 / 0.42;

const erro = document.getElementById('erro');
const grade = document.getElementById('grade');

function carta(cor, frente) {
  const g = new THREE.PlaneGeometry(LARG, ALT);
  const m = new THREE.MeshStandardMaterial({ color: cor, roughness: 0.85, side: THREE.DoubleSide });
  const malha = new THREE.Mesh(g, m);
  if (frente) {
    // uma tarja no ALTO da carta: é onde mora o índice que o jogador lê, e é
    // por ela que se vê num relance se a mão está tapando o que importa
    const t = new THREE.Mesh(new THREE.PlaneGeometry(LARG * 0.34, ALT * 0.22),
      new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    t.position.set(-LARG * 0.28, ALT * 0.33, 0.0006);
    malha.add(t);
  }
  return malha;
}

// O leque, montado como `layoutMao3D` monta na mesa: as cartas giram em torno de
// um pivô ABAIXO delas, os pés convergindo e os topos abrindo.
function leque(n) {
  const g = new THREE.Group();
  const raio = ALT * 2.6, passo = 0.15, meio = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const d = i - meio, ang = d * passo;
    const c = carta(i === Math.floor(meio) ? 0xf4ece0 : 0xe6dccb, true);
    c.position.set(Math.sin(ang) * raio, Math.cos(ang) * raio - raio, d * 0.0012);
    c.rotation.z = -ang;
    g.add(c);
  }
  return g;
}

async function cena1(MAO) {
  const gltf = await new Promise((ok, falha) => new GLTFLoader().load(`./models/${MAO}.glb`, ok, undefined, falha));
  const raiz = gltf.scene;
  raiz.updateMatrixWorld(true);
  const plano = raiz.getObjectByName('PlanoDaCarta');
  if (!plano) throw new Error('o arquivo não traz o nó PlanoDaCarta — sem contrato');

  const pele = new THREE.MeshStandardMaterial({ color: 0xe8b48c, roughness: 0.62, metalness: 0 });
  raiz.traverse((o) => { if (o.isMesh) { o.material = pele; o.frustumCulled = false; } });

  // O MESMO ENCAIXE DA MESA: a mão vai para M = A · P⁻¹, com A onde a carta do
  // meio do leque está. Aqui A é a identidade, então o leque fica na origem e a
  // mão se acomoda nele — que é exatamente o que o jogador vê.
  const P = new THREE.Matrix4().copy(plano.matrixWorld);
  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0x0d0f13);
  const grupo = new THREE.Group();
  raiz.matrix.copy(new THREE.Matrix4().copy(P).invert());
  raiz.matrix.decompose(raiz.position, raiz.quaternion, raiz.scale);
  grupo.add(raiz);
  grupo.add(leque(N));
  cena.add(grupo);

  cena.add(new THREE.AmbientLight(0xffffff, 1.5));
  const luz = new THREE.DirectionalLight(0xfff0d8, 2.2); luz.position.set(0.6, 0.9, 1.4); cena.add(luz);
  const contra = new THREE.DirectionalLight(0x9fb6ff, 0.7); contra.position.set(-0.8, 0.2, -1); cena.add(contra);

  return cena;
}

// A distância tem de caber o LEQUE, não a carta: com 9 cartas o arco abre ~1,4
// de corda, quase três larguras de carta. Colado, o inspetor só mostrava o
// miolo do leque e escondia justamente a mão, que entra pela beirada.
const D = Math.max(0.6, Math.min(8, Number(q.get('dist') || 2.6)));

async function principal() {
  const cenas = [];
  for (const nome of MAOS) cenas.push([nome, await cena1(nome)]);
  const vistas = [
    ['o olho do jogador', new THREE.Vector3(0, -0.18, 1).multiplyScalar(D), new THREE.Vector3(0, 1, 0)],
    ['de lado (quem está na frente)', new THREE.Vector3(1, -0.1, 0).multiplyScalar(D), new THREE.Vector3(0, 1, 0)],
    ['de cima', new THREE.Vector3(0, 1, 0.05).multiplyScalar(D), new THREE.Vector3(0, 0, -1)],
    ['três quartos', new THREE.Vector3(0.62, 0.1, 0.86).multiplyScalar(D), new THREE.Vector3(0, 1, 0)],
  ];
  // com mais de um modelo só a vista do jogador interessa: é a comparação
  const escolhidas = cenas.length > 1 ? vistas.slice(0, 1) : vistas;
  for (const [nome, cena] of cenas) {
    for (const [titulo, pos, cima] of escolhidas) {
      const fig = document.createElement('figure');
      const cv = document.createElement('canvas');
      cv.width = cv.height = LADO;
      fig.append(cv);
      const cap = document.createElement('figcaption');
      cap.textContent = cenas.length > 1 ? nome : titulo;
      fig.append(cap);
      grade.append(fig);
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1);
      r.setSize(LADO, LADO, false);
      const cam = new THREE.PerspectiveCamera(38, 1, 0.01, 20);
      cam.position.copy(pos); cam.up.copy(cima); cam.lookAt(0, 0, 0);
      r.render(cena, cam);
    }
  }
  // compõe tudo num JPEG só, para sair daqui como arquivo
  window.compoe = (rotulos = []) => {
    const cvs = [...document.querySelectorAll('canvas')];
    const alvo = document.createElement('canvas');
    const legenda = 30;
    alvo.width = cvs.length * LADO; alvo.height = LADO + legenda;
    const c = alvo.getContext('2d');
    c.fillStyle = '#0d0f13'; c.fillRect(0, 0, alvo.width, alvo.height);
    cvs.forEach((cv, i) => {
      c.drawImage(cv, i * LADO, legenda);
      c.fillStyle = '#e8e2d8';
      c.font = '600 17px system-ui, sans-serif';
      c.fillText(rotulos[i] || MAOS[i] || '', i * LADO + 12, 21);
    });
    return alvo.toDataURL('image/jpeg', 0.86);
  };
  document.getElementById('legenda').textContent =
    `${MAOS.join(' · ')} · leque de ${N} cartas · encaixe pelo PlanoDaCarta, como a mesa faz`;
  window.inspetorPronto = true;
}

principal().catch((e) => { erro.textContent = `${e.message}\n${e.stack || ''}`; window.inspetorPronto = 'erro'; });
