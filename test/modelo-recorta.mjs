// Recorta UMA figura de um .glb que trouxe várias lado a lado (a "ficha de
// personagem" com frente, lado, costas e lado exportada como malha única).
// Separa as figuras pelos vazios no eixo x, descobre para onde cada uma olha
// pelos pés (a ponta do pé vai para a frente) e grava só a escolhida, com o
// material e as texturas do arquivo. Depois, test/modelo-prepara.mjs reduz.
//
// Uso: node test/modelo-recorta.mjs <fonte.glb> <saida.glb> [--figura N | --frente]
//   --frente (padrão): a figura que olha para +Z; --figura N: a N-ésima da esquerda (1..)
import fs from 'node:fs';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const [fonte, saida] = pos;
const iFig = args.includes('--figura') ? Number(args[args.indexOf('--figura') + 1]) : 0;
if (!fonte || !saida) { console.error('uso: node test/modelo-recorta.mjs <fonte.glb> <saida.glb> [--figura N | --frente]'); process.exit(2); }

const b = fs.readFileSync(fonte);
const jl = b.readUInt32LE(12); const json = JSON.parse(b.toString('utf8', 20, 20 + jl));
const bl = b.readUInt32LE(20 + jl); const bin = b.subarray(28 + jl, 28 + jl + bl);
if (json.meshes.length !== 1 || json.meshes[0].primitives.length !== 1) throw new Error('esperava um arquivo com uma malha e uma primitiva');
const prim = json.meshes[0].primitives[0];
const TIPOS = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function le(iAcc) {
  const a = json.accessors[iAcc]; const bv = json.bufferViews[a.bufferView];
  const T = TIPOS[a.componentType]; const n = N[a.type];
  if (bv.byteStride && bv.byteStride !== n * T.BYTES_PER_ELEMENT) throw new Error('stride não suportado');
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return { arr: new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT)), n, T, comp: a.componentType, tipo: a.type };
}
const P = le(prim.attributes.POSITION);
const outros = Object.entries(prim.attributes).filter(([k]) => k !== 'POSITION').map(([k, i]) => [k, le(i)]);
const I = prim.indices != null ? le(prim.indices).arr : Uint32Array.from({ length: P.arr.length / 3 }, (_, i) => i);
const nV = P.arr.length / 3;

// figuras = grupos de vértices separados por vazios em x (caixas de 1 cm)
let xmin = Infinity, xmax = -Infinity;
for (let i = 0; i < nV; i++) { const x = P.arr[i * 3]; if (x < xmin) xmin = x; if (x > xmax) xmax = x; }
const CX = 0.01; const nCx = Math.ceil((xmax - xmin) / CX) + 1; const cheio = new Uint8Array(nCx);
for (let i = 0; i < nV; i++) cheio[Math.floor((P.arr[i * 3] - xmin) / CX)] = 1;
const figuras = []; let ini = -1;
for (let c = 0; c <= nCx; c++) { const on = c < nCx && cheio[c]; if (on && ini < 0) ini = c; if (!on && ini >= 0) { figuras.push([xmin + ini * CX, xmin + c * CX]); ini = -1; } }
if (figuras.length < 2) console.log('aviso: só uma figura encontrada em x — o arquivo já é uma figura só?');

// para onde cada uma olha: o centro dos pés (5% de baixo) contra o centro do corpo
const info = figuras.map(([x0, x1]) => {
  let ymin = Infinity, ymax = -Infinity; const idx = [];
  for (let i = 0; i < nV; i++) { const x = P.arr[i * 3]; if (x >= x0 && x <= x1) { idx.push(i); const y = P.arr[i * 3 + 1]; if (y < ymin) ymin = y; if (y > ymax) ymax = y; } }
  const corte = ymin + (ymax - ymin) * 0.05;
  let cz = 0, cx = 0, n = 0, pz = 0, px = 0, np = 0;
  for (const i of idx) { const x = P.arr[i * 3], y = P.arr[i * 3 + 1], z = P.arr[i * 3 + 2]; cz += z; cx += x; n++; if (y < corte) { pz += z; px += x; np++; } }
  const dz = pz / np - cz / n, dx = px / np - cx / n;
  const olha = Math.abs(dz) >= Math.abs(dx) ? (dz > 0 ? '+Z (frente)' : '-Z (costas)') : (dx > 0 ? '+X (lado)' : '-X (lado)');
  return { x0, x1, idx: new Set(idx), vertices: idx.length, altura: ymax - ymin, dz, dx, olha, cx: cx / n };
});
info.forEach((f, i) => console.log(`figura ${i + 1}: x ${f.x0.toFixed(2)}..${f.x1.toFixed(2)}, ${f.vertices.toLocaleString('pt-BR')} vértices, altura ${f.altura.toFixed(2)} m, pés ${f.dz >= 0 ? '+' : ''}${(f.dz * 100).toFixed(0)} cm em z / ${f.dx >= 0 ? '+' : ''}${(f.dx * 100).toFixed(0)} cm em x → olha para ${f.olha}`));
const escolhida = iFig ? info[iFig - 1] : info.reduce((m, f) => (f.dz > (m?.dz ?? -Infinity) ? f : m), null);
if (!escolhida) throw new Error('figura não encontrada');
console.log(`recortando a figura ${info.indexOf(escolhida) + 1} (olha para ${escolhida.olha}), recentrada em x`);

// triângulos inteiros dentro da figura; vértices renumerados; x recentrado
const mapa = new Int32Array(nV).fill(-1); const novosIdx = []; let nNovo = 0;
for (let t = 0; t < I.length; t += 3) {
  const a = I[t], bb = I[t + 1], c = I[t + 2];
  if (!(escolhida.idx.has(a) && escolhida.idx.has(bb) && escolhida.idx.has(c))) continue;
  for (const v of [a, bb, c]) { if (mapa[v] < 0) mapa[v] = nNovo++; novosIdx.push(mapa[v]); }
}
const junta = (fonteArr, n, T, ajusteX = 0) => { const out = new T(nNovo * n); for (let v = 0; v < nV; v++) { const m = mapa[v]; if (m < 0) continue; for (let k = 0; k < n; k++) out[m * n + k] = fonteArr[v * n + k]; if (ajusteX) out[m * n] -= ajusteX; } return out; };
const posNova = junta(P.arr, 3, Float32Array, escolhida.cx);
const atributosNovos = outros.map(([k, d]) => [k, junta(d.arr, d.n, d.T), d]);
const idxNovo = nNovo > 65535 ? Uint32Array.from(novosIdx) : Uint16Array.from(novosIdx);

// monta o .glb novo: imagens copiadas, material igual, uma primitiva
const partes = []; const bufferViews = []; const accessors = []; let off = 0;
function view(bytes, target) { const pad = (4 - (bytes.length % 4)) % 4; bufferViews.push({ buffer: 0, byteOffset: off, byteLength: bytes.length, ...(target ? { target } : {}) }); partes.push(bytes, Buffer.alloc(pad)); off += bytes.length + pad; return bufferViews.length - 1; }
function minmax(arr, n) { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { const k = i % n; if (arr[i] < mn[k]) mn[k] = arr[i]; if (arr[i] > mx[k]) mx[k] = arr[i]; } return { mn, mx }; }
const imagens = (json.images || []).map((im) => ({ ...im, bufferView: view(Buffer.from(bin.buffer, bin.byteOffset + (json.bufferViews[im.bufferView].byteOffset || 0), json.bufferViews[im.bufferView].byteLength)) }));
const { mn, mx } = minmax(posNova, 3);
const aPos = accessors.push({ bufferView: view(Buffer.from(posNova.buffer), 34962), componentType: 5126, count: nNovo, type: 'VEC3', min: mn, max: mx }) - 1;
const attributes = { POSITION: aPos };
for (const [k, arr, d] of atributosNovos) attributes[k] = accessors.push({ bufferView: view(Buffer.from(arr.buffer), 34962), componentType: d.comp, count: nNovo, type: d.tipo, ...(d.normalized ? { normalized: true } : {}) }) - 1;
const aIdx = accessors.push({ bufferView: view(Buffer.from(idxNovo.buffer), 34963), componentType: nNovo > 65535 ? 5125 : 5123, count: idxNovo.length, type: 'SCALAR' }) - 1;
const novo = {
  asset: { version: '2.0', generator: 'cacamba/test/modelo-recorta.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'figura', mesh: 0 }],
  meshes: [{ name: json.meshes[0].name || 'figura', primitives: [{ attributes, indices: aIdx, material: prim.material }] }],
  materials: json.materials, textures: json.textures, samplers: json.samplers, images: imagens,
  accessors, bufferViews, buffers: [{ byteLength: off }],
};
for (const k of ['textures', 'samplers', 'images', 'materials']) if (!novo[k]) delete novo[k];
let jsonBuf = Buffer.from(JSON.stringify(novo)); const jpad = (4 - (jsonBuf.length % 4)) % 4; jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
const binBuf = Buffer.concat(partes);
const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(jsonBuf.length, 0); cj.write('JSON', 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(binBuf.length, 0); cb.write('BIN\0', 4);
fs.writeFileSync(saida, Buffer.concat([cab, cj, jsonBuf, cb, binBuf]));
console.log(`saída: ${saida} — ${(idxNovo.length / 3).toLocaleString('pt-BR')} triângulos, ${nNovo.toLocaleString('pt-BR')} vértices, ${(fs.statSync(saida).size / 1048576).toFixed(1)} MB`);
