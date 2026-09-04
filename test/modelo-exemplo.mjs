// Gera public/models/_exemplo.glb: um modelo MÍNIMO (duas caixas) com tudo o
// que a mesa 3D espera de um personagem externo — origem no chão, frente em
// +Z, ~1,55 m sentado, nós `Cabeca`, `MaoEsq` e `MaoDir`, uma textura
// embutida (o rosto, 8×8 px), o morph `bocaAberta` e os clips `idle` e
// `feliz`. Não é arte; é a prova de que cada caminho glTF → assento funciona
// (inclusive a textura em blob:, que a CSP precisa deixar passar).
// Uso: node test/modelo-exemplo.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

function caixa(cx, cy, cz, sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
    [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
    [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
  ];
  const pos = [], nor = [], uv = [], idx = [];
  faces.forEach(([n, vs], f) => {
    vs.forEach(([x, y, z], k) => { pos.push(cx + x * hx, cy + y * hy, cz + z * hz); nor.push(...n); uv.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 0 : 1); });
    idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { pos, nor, uv, idx };
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// um PNG de verdade, 8×8 RGBA: pele com dois olhos escuros — é o "rosto"
function png(larg, alt, pixel) {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, dados) => { const l = Buffer.alloc(4); l.writeUInt32LE; l.writeUInt32BE(dados.length); const td = Buffer.concat([Buffer.from(tipo), dados]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const linhas = [];
  for (let y = 0; y < alt; y++) { linhas.push(0); for (let x = 0; x < larg; x++) linhas.push(...pixel(x, y)); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(larg, 0); ihdr.writeUInt32BE(alt, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.from(linhas))), chunk('IEND', Buffer.alloc(0))]);
}
const rosto = png(8, 8, (x, y) => ((y === 3 && (x === 2 || x === 5)) ? [42, 27, 18, 255] : (y === 5 && x >= 3 && x <= 4) ? [181, 67, 46, 255] : [244, 207, 170, 255]));

// sentado: pernas de 0 a 0,65, tronco de 0,65 a 1,25, cabeça de 1,25 a 1,55
// — a cabeça é um nó com translação, com a malha centrada nele (é "o centro
// da cabeça" do contrato), para os clips girarem em volta dela
const partes = [
  { nome: 'Pernas', geo: caixa(0, 0.325, 0.12, 0.44, 0.65, 0.34), cor: '#2E4A6B', em: [0, 0, 0] },
  { nome: 'Corpo', geo: caixa(0, 0.95, 0, 0.5, 0.6, 0.3), cor: '#35323C', em: [0, 0, 0] },
  { nome: 'Cabeca', geo: caixa(0, 0, 0, 0.3, 0.3, 0.28), cor: '#F4CFAA', em: [0, 1.4, 0], textura: true, boca: true },
];
const bin = []; const bufferViews = []; const accessors = []; const meshes = []; const nodes = [];
let off = 0;
function view(bytes, target) { const pad = (4 - (bytes.length % 4)) % 4; const b = Buffer.concat([bytes, Buffer.alloc(pad)]); bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.length, ...(target ? { target } : {}) }); bin.push(b); off += b.length; return bufferViews.length - 1; }
function minmax(arr, n) { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { mn[i % n] = Math.min(mn[i % n], arr[i]); mx[i % n] = Math.max(mx[i % n], arr[i]); } return { mn, mx }; }
const f32 = (arr, tipo, target = 34962, comMinMax = false) => {
  const n = { VEC3: 3, VEC2: 2, VEC4: 4, SCALAR: 1 }[tipo];
  const extra = comMinMax ? minmax(arr, n) : null;
  return accessors.push({ bufferView: view(Buffer.from(new Float32Array(arr).buffer), target), componentType: 5126, count: arr.length / n, type: tipo, ...(extra ? { min: extra.mn, max: extra.mx } : {}) }) - 1;
};
partes.forEach((p, i) => {
  const aPos = f32(p.geo.pos, 'VEC3', 34962, true);
  const aNor = f32(p.geo.nor, 'VEC3');
  const aUv = f32(p.geo.uv, 'VEC2');
  const aIdx = accessors.push({ bufferView: view(Buffer.from(new Uint16Array(p.geo.idx).buffer), 34963), componentType: 5123, count: p.geo.idx.length, type: 'SCALAR' }) - 1;
  const prim = { attributes: { POSITION: aPos, NORMAL: aNor, TEXCOORD_0: aUv }, indices: aIdx, material: i };
  const malha = { name: p.nome, primitives: [prim] };
  if (p.boca) {
    // o morph: a metade de baixo da cabeça desce 5 cm — a boca "abre"
    const delta = [];
    for (let k = 0; k < p.geo.pos.length; k += 3) delta.push(0, p.geo.pos[k + 1] < 0 ? -0.05 : 0, 0);
    prim.targets = [{ POSITION: f32(delta, 'VEC3', 34962, true) }];
    malha.extras = { targetNames: ['bocaAberta'] };
    malha.weights = [0];
  }
  meshes.push(malha);
  nodes.push({ name: p.nome, mesh: i, translation: p.em });
});
nodes.push({ name: 'MaoEsq', translation: [-0.22, 1.02, 0.17] }, { name: 'MaoDir', translation: [0.22, 1.02, 0.17] });

// a imagem embutida
const vImagem = view(rosto);

// clips: `idle` balança a cabeça (laço) e `feliz` é um aceno de 0,7 s
const NO_CABECA = 2;   // Pernas, Corpo, Cabeca
const qz = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const qx = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const animations = [];
function clip(nome, tempos, quats) {
  const aT = f32(tempos, 'SCALAR', 0, true);
  const aQ = f32(quats.flat(), 'VEC4', 0);
  animations.push({ name: nome, samplers: [{ input: aT, output: aQ, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: NO_CABECA, path: 'rotation' } }] });
}
clip('idle', [0, 1.2, 2.4], [qz(-0.06), qz(0.06), qz(-0.06)]);
clip('feliz', [0, 0.2, 0.45, 0.7], [qx(0), qx(0.25), qx(-0.15), qx(0)]);

const json = {
  asset: { version: '2.0', generator: 'cacamba/test/modelo-exemplo.mjs' },
  scene: 0, scenes: [{ name: 'Exemplo', nodes: nodes.map((_, i) => i) }],
  nodes, meshes, animations,
  materials: partes.map((p) => ({ name: p.nome, pbrMetallicRoughness: { baseColorFactor: [...hex(p.cor), 1], metallicFactor: 0, roughnessFactor: 0.9, ...(p.textura ? { baseColorTexture: { index: 0 } } : {}) } })),
  textures: [{ source: 0, sampler: 0 }],
  images: [{ name: 'rosto', mimeType: 'image/png', bufferView: vImagem }],
  samplers: [{ magFilter: 9728, minFilter: 9728 }],
  accessors, bufferViews, buffers: [{ byteLength: off }],
};
let jsonBuf = Buffer.from(JSON.stringify(json)); const jpad = (4 - (jsonBuf.length % 4)) % 4; jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
const binBuf = Buffer.concat(bin);
const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(jsonBuf.length, 0); cj.write('JSON', 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(binBuf.length, 0); cb.write('BIN\0', 4);
fs.mkdirSync('public/models', { recursive: true });
fs.writeFileSync('public/models/_exemplo.glb', Buffer.concat([cab, cj, jsonBuf, cb, binBuf]));
console.log(`public/models/_exemplo.glb: ${(12 + 8 + jsonBuf.length + 8 + binBuf.length)} bytes, nós: ${nodes.map((n) => n.name).join(', ')}, clips: ${animations.map((a) => a.name).join(', ')}, morph: bocaAberta, textura: rosto 8×8`);
