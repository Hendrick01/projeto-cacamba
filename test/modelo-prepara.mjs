// Prepara um .glb esculpido (milhões de triângulos, texturas grandes) para a
// mesa 3D: solda vértices, reduz para o orçamento de triângulos, encolhe as
// texturas para 1024 px e injeta os nós que o contrato pede (`Cabeca`, e
// `MaoEsq`/`MaoDir` quando as mãos estão no lugar certo). Usa o
// @gltf-transform/cli pelo npx — é ferramenta de bancada, não parte do jogo.
//
// Uso: node test/modelo-prepara.mjs <fonte.glb> <saida.glb> [--tri 30000]
//        [--cabeca 0.91] [--maos 0.17,1.0,0.22] [--erro 0.02]
//   --cabeca: altura do centro da cabeça como FRAÇÃO da altura do modelo
//             (0.91 = a cabeça de um adulto em pé); --maos: posição das mãos
//             em metros (x, y, z), a esquerda espelhada. Sem --maos, a mesa
//             usa a posição padrão do leque.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opc = { tri: 30000, cabeca: 0.91, maos: null, erro: 0.02 };
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) { const k = args[i].slice(2); opc[k] = k === 'maos' ? args[++i].split(',').map(Number) : Number(args[++i]); }
  else pos.push(args[i]);
}
const [fonte, saida] = pos;
if (!fonte || !saida) { console.error('uso: node test/modelo-prepara.mjs <fonte.glb> <saida.glb> [--tri N] [--cabeca f] [--maos x,y,z]'); process.exit(2); }

function leJson(glb) {
  const b = fs.readFileSync(glb);
  if (b.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${glb}: não é um .glb`);
  const jl = b.readUInt32LE(12);
  return { b, jl, json: JSON.parse(b.toString('utf8', 20, 20 + jl)) };
}
function triangulos(json) {
  let t = 0;
  for (const m of json.meshes || []) for (const p of m.primitives) t += (p.indices != null ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3;
  return Math.round(t);
}
function caixa(json) {
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const world = (n, t = [0, 0, 0], s = [1, 1, 1]) => {
    const node = json.nodes[n]; const tt = node.translation || [0, 0, 0], ss = node.scale || [1, 1, 1];
    const T = [t[0] + tt[0] * s[0], t[1] + tt[1] * s[1], t[2] + tt[2] * s[2]], Sc = [s[0] * ss[0], s[1] * ss[1], s[2] * ss[2]];
    if (node.mesh != null) for (const p of json.meshes[node.mesh].primitives) { const a = json.accessors[p.attributes.POSITION]; if (a.min) for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], T[i] + a.min[i] * Sc[i]); box.max[i] = Math.max(box.max[i], T[i] + a.max[i] * Sc[i]); } }
    for (const c of node.children || []) world(c, T, Sc);
  };
  for (const n of json.scenes[json.scene || 0].nodes) world(n);
  return box;
}
const gt = (...a) => execFileSync('npx', ['-y', '@gltf-transform/cli', ...a], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();

const { json: j0 } = leJson(fonte);
const t0 = triangulos(j0);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cacamba-modelo-'));
const soldado = path.join(tmp, 'soldado.glb'), reduzido = path.join(tmp, 'reduzido.glb'), pequeno = path.join(tmp, 'pequeno.glb');
console.log(`fonte: ${t0.toLocaleString('pt-BR')} triângulos, ${(fs.statSync(fonte).size / 1048576).toFixed(1)} MB`);
gt('weld', fonte, soldado);
const razao = Math.min(1, opc.tri / t0);
if (razao < 1) gt('simplify', '--ratio', String(razao), '--error', String(opc.erro), soldado, reduzido);
else fs.copyFileSync(soldado, reduzido);
gt('resize', '--width', '1024', '--height', '1024', reduzido, pequeno);

// injeta os nós nomeados, no espaço da raiz do modelo
const { b, jl, json } = leJson(pequeno);
const cx = caixa(json);
const altura = cx.max[1] - cx.min[1];
const cena = json.scenes[json.scene || 0];
const novo = (name, translation) => { json.nodes.push({ name, translation }); cena.nodes.push(json.nodes.length - 1); };
if (!json.nodes.some((n) => n.name === 'Cabeca')) novo('Cabeca', [0, cx.min[1] + altura * opc.cabeca, 0]);
if (opc.maos && !json.nodes.some((n) => n.name === 'MaoDir')) { novo('MaoDir', [-Math.abs(opc.maos[0]), opc.maos[1], opc.maos[2]]); novo('MaoEsq', [Math.abs(opc.maos[0]), opc.maos[1], opc.maos[2]]); }
let jsonBuf = Buffer.from(JSON.stringify(json)); const pad = (4 - (jsonBuf.length % 4)) % 4; jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
const resto = b.subarray(20 + jl);   // o chunk BIN, intacto
const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jsonBuf.length + resto.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(jsonBuf.length, 0); cj.write('JSON', 4);
fs.writeFileSync(saida, Buffer.concat([cab, cj, jsonBuf, resto]));
fs.rmSync(tmp, { recursive: true, force: true });
const t1 = triangulos(json);
console.log(`saída: ${saida} — ${t1.toLocaleString('pt-BR')} triângulos, ${(fs.statSync(saida).size / 1048576).toFixed(2)} MB, altura ${altura.toFixed(2)} m, nós: ${json.nodes.map((n) => n.name).join(', ')}`);
if (altura > 1.6 && (cx.max[0] - cx.min[0]) > altura * 0.9) console.log('aviso: braços abertos (pose em T ou A) — a mesa espera sentado, mãos à frente; o leque fica na posição padrão');
