// Gera public/models/_exemplo.glb: um modelo MÍNIMO (duas caixas) com tudo o
// que a mesa 3D espera de um personagem externo — origem no chão, frente em
// +Z, ~1,55 m sentado, nós `Cabeca`, `MaoEsq` e `MaoDir`. Não é arte; é a prova
// de que o caminho glTF → assento funciona. Uso: node test/modelo-exemplo.mjs
import fs from 'node:fs';

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
  const pos = [], nor = [], idx = [];
  faces.forEach(([n, vs], f) => {
    vs.forEach(([x, y, z]) => { pos.push(cx + x * hx, cy + y * hy, cz + z * hz); nor.push(...n); });
    idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { pos, nor, idx };
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

// sentado: tronco de 0,9 a 1,25 (assento em ~0,45 embaixo), cabeça até 1,55
const partes = [
  { nome: 'Corpo', geo: caixa(0, 1.0, 0, 0.5, 0.7, 0.3), cor: '#35323C' },
  { nome: 'Cabeca', geo: caixa(0, 1.4, 0, 0.3, 0.3, 0.28), cor: '#F4CFAA' },
];
const bin = []; const bufferViews = []; const accessors = []; const meshes = []; const nodes = [];
let off = 0;
function view(bytes, target) { const pad = (4 - (bytes.length % 4)) % 4; const b = Buffer.concat([bytes, Buffer.alloc(pad)]); bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.length, target }); bin.push(b); off += b.length; return bufferViews.length - 1; }
function minmax(arr, n) { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { mn[i % n] = Math.min(mn[i % n], arr[i]); mx[i % n] = Math.max(mx[i % n], arr[i]); } return { mn, mx }; }
partes.forEach((p, i) => {
  const pos = Buffer.from(new Float32Array(p.geo.pos).buffer);
  const nor = Buffer.from(new Float32Array(p.geo.nor).buffer);
  const idx = Buffer.from(new Uint16Array(p.geo.idx).buffer);
  const { mn, mx } = minmax(p.geo.pos, 3);
  const aPos = accessors.push({ bufferView: view(pos, 34962), componentType: 5126, count: p.geo.pos.length / 3, type: 'VEC3', min: mn, max: mx }) - 1;
  const aNor = accessors.push({ bufferView: view(nor, 34962), componentType: 5126, count: p.geo.nor.length / 3, type: 'VEC3' }) - 1;
  const aIdx = accessors.push({ bufferView: view(idx, 34963), componentType: 5123, count: p.geo.idx.length, type: 'SCALAR' }) - 1;
  meshes.push({ name: p.nome, primitives: [{ attributes: { POSITION: aPos, NORMAL: aNor }, indices: aIdx, material: i }] });
  nodes.push({ name: p.nome, mesh: i });
});
nodes.push({ name: 'MaoEsq', translation: [-0.22, 1.02, 0.17] }, { name: 'MaoDir', translation: [0.22, 1.02, 0.17] });
const json = {
  asset: { version: '2.0', generator: 'cacamba/test/modelo-exemplo.mjs' },
  scene: 0, scenes: [{ name: 'Exemplo', nodes: nodes.map((_, i) => i) }],
  nodes, meshes,
  materials: partes.map((p) => ({ name: p.nome, pbrMetallicRoughness: { baseColorFactor: [...hex(p.cor), 1], metallicFactor: 0, roughnessFactor: 0.9 } })),
  accessors, bufferViews, buffers: [{ byteLength: off }],
};
let jsonBuf = Buffer.from(JSON.stringify(json)); const jpad = (4 - (jsonBuf.length % 4)) % 4; jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
const binBuf = Buffer.concat(bin);
const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(jsonBuf.length, 0); cj.write('JSON', 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(binBuf.length, 0); cb.write('BIN\0', 4);
fs.mkdirSync('public/models', { recursive: true });
fs.writeFileSync('public/models/_exemplo.glb', Buffer.concat([cab, cj, jsonBuf, cb, binBuf]));
console.log(`public/models/_exemplo.glb: ${(12 + 8 + jsonBuf.length + 8 + binBuf.length)} bytes, nós: ${nodes.map((n) => n.name).join(', ')}`);
