// Exporta um .glb da mesa como OBJ + MTL + textura, num .zip pronto para
// subir num rigger automático (Mixamo aceita .zip com obj, mtl e imagens).
// É a ponta de ida do fluxo "escultura → rig → mesa": o modelo reduzido vai
// para o rig com a mesma malha e a mesma textura que a mesa usa.
//
// Uso: node test/modelo-obj.mjs <fonte.glb> <saida.zip>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [fonte, saida] = process.argv.slice(2);
if (!fonte || !saida) { console.error('uso: node test/modelo-obj.mjs <fonte.glb> <saida.zip>'); process.exit(2); }
const nome = path.basename(saida).replace(/\.zip$/i, '');

const b = fs.readFileSync(fonte);
const jl = b.readUInt32LE(12); const json = JSON.parse(b.toString('utf8', 20, 20 + jl));
const bl = b.readUInt32LE(20 + jl); const bin = b.subarray(28 + jl, 28 + jl + bl);
const TIPOS = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function le(iAcc) {
  const a = json.accessors[iAcc]; const bv = json.bufferViews[a.bufferView]; const T = TIPOS[a.componentType]; const n = N[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return { arr: new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT)), n };
}
const linhas = [`# ${nome} — exportado de ${path.basename(fonte)} por cacamba/test/modelo-obj.mjs`, `mtllib ${nome}.mtl`, `o ${nome}`];
let base = 0; const mtl = [];
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'cacamba-obj-'));
const imagens = {};
function imagem(iTex, sufixo) {
  if (iTex == null) return null;
  const im = json.images[json.textures[iTex].source]; const bv = json.bufferViews[im.bufferView];
  const ext = im.mimeType === 'image/png' ? 'png' : 'jpg'; const arq = `${nome}_${sufixo}.${ext}`;
  if (!imagens[arq]) { fs.writeFileSync(path.join(pasta, arq), bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)); imagens[arq] = true; }
  return arq;
}
json.meshes.forEach((mesh) => mesh.primitives.forEach((p, k) => {
  const P = le(p.attributes.POSITION), Nn = p.attributes.NORMAL != null ? le(p.attributes.NORMAL) : null, UV = p.attributes.TEXCOORD_0 != null ? le(p.attributes.TEXCOORD_0) : null;
  const I = p.indices != null ? le(p.indices).arr : Uint32Array.from({ length: P.arr.length / 3 }, (_, i) => i);
  const mat = json.materials?.[p.material]; const nomeMat = (mat?.name || `material${p.material ?? k}`).replace(/\s+/g, '_');
  const pbr = mat?.pbrMetallicRoughness || {}; const cor = pbr.baseColorFactor || [1, 1, 1, 1];
  const mapa = imagem(pbr.baseColorTexture?.index, 'cor'), normal = imagem(mat?.normalTexture?.index, 'normal');
  mtl.push(`newmtl ${nomeMat}`, `Kd ${cor.slice(0, 3).map((v) => v.toFixed(4)).join(' ')}`, 'Ka 0 0 0', 'Ks 0 0 0', 'd 1', 'illum 1', ...(mapa ? [`map_Kd ${mapa}`] : []), ...(normal ? [`norm ${normal}`] : []), '');
  linhas.push(`usemtl ${nomeMat}`);
  const n = P.arr.length / 3;
  for (let i = 0; i < n; i++) linhas.push(`v ${P.arr[i * 3]} ${P.arr[i * 3 + 1]} ${P.arr[i * 3 + 2]}`);
  if (UV) for (let i = 0; i < n; i++) linhas.push(`vt ${UV.arr[i * 2]} ${1 - UV.arr[i * 2 + 1]}`);   // OBJ: v cresce para cima
  if (Nn) for (let i = 0; i < n; i++) linhas.push(`vn ${Nn.arr[i * 3]} ${Nn.arr[i * 3 + 1]} ${Nn.arr[i * 3 + 2]}`);
  const v = (i) => { const j = base + i + 1; return UV && Nn ? `${j}/${j}/${j}` : UV ? `${j}/${j}` : Nn ? `${j}//${j}` : `${j}`; };
  for (let t = 0; t < I.length; t += 3) linhas.push(`f ${v(I[t])} ${v(I[t + 1])} ${v(I[t + 2])}`);
  base += n;
}));
fs.writeFileSync(path.join(pasta, `${nome}.obj`), linhas.join('\n') + '\n');
fs.writeFileSync(path.join(pasta, `${nome}.mtl`), mtl.join('\n'));
fs.mkdirSync(path.dirname(path.resolve(saida)), { recursive: true });
if (fs.existsSync(saida)) fs.unlinkSync(saida);
execFileSync('zip', ['-j', '-q', path.resolve(saida), ...fs.readdirSync(pasta).map((f) => path.join(pasta, f))]);
fs.rmSync(pasta, { recursive: true, force: true });
console.log(`${saida}: ${nome}.obj + .mtl + ${Object.keys(imagens).join(', ') || 'sem textura'} — ${(fs.statSync(saida).size / 1048576).toFixed(1)} MB, ${base.toLocaleString('pt-BR')} vértices`);
