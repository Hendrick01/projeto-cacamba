// Prepara um modelo para a mesa 3D: aceita .glb ou .fbx (o FBX rigado do
// Mixamo, por exemplo), funde clips vindos de outros arquivos (`--clip
// feliz=arquivo.fbx`, casados pelo NOME dos ossos), solda vértices, reduz
// para o orçamento de triângulos, encolhe as texturas para 1024 px e injeta
// os nós do contrato: `Cabeca` (filho do osso da cabeça, se houver esqueleto;
// senão numa fração da altura) e `MaoEsq`/`MaoDir` (filhos dos ossos das
// mãos, ou em `--maos x,y,z`). Usa o @gltf-transform/cli pelo npx e, para
// FBX, o FBX2glTF instalado numa pasta de cache — ferramentas de bancada, não
// parte do jogo.
//
// Uso: node test/modelo-prepara.mjs <fonte.glb|fbx> <saida.glb> [--tri 30000]
//        [--cabeca 0.91] [--maos 0.17,1.0,0.22] [--erro 0.02]
//        [--clip idle=a.fbx] [--clip feliz=b.fbx] [--clip bravo=c.fbx]
//   --cabeca: sem esqueleto, altura do centro da cabeça como FRAÇÃO da altura
//             (0.91 em pé, ~0.88 sentado). --clip: o primeiro clip do arquivo
//             entra com esse nome. O clip que já vem na fonte vira `idle` se
//             não tiver nome de contrato.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opc = { tri: 30000, cabeca: 0.91, maos: null, erro: 0.02, clips: [] };
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) { pos.push(args[i]); continue; }
  const k = args[i].slice(2), v = args[++i];
  if (k === 'maos') opc.maos = v.split(',').map(Number);
  else if (k === 'clip') { const [nome, arq] = v.split('='); opc.clips.push({ nome, arq }); }
  else opc[k] = Number(v);
}
const [fonte, saida] = pos;
if (!fonte || !saida) { console.error('uso: node test/modelo-prepara.mjs <fonte.glb|fbx> <saida.glb> [--tri N] [--cabeca f] [--maos x,y,z] [--clip nome=arquivo]'); process.exit(2); }

// --- leitura e escrita de .glb (JSON + BIN) ---
function leGlb(arq) {
  const b = fs.readFileSync(arq);
  if (b.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${arq}: não é um .glb`);
  const jl = b.readUInt32LE(12); const json = JSON.parse(b.toString('utf8', 20, 20 + jl));
  const bl = b.length > 28 + jl ? b.readUInt32LE(20 + jl) : 0;
  return { json, bin: Buffer.from(b.subarray(28 + jl, 28 + jl + bl)) };
}
function escreveGlb({ json, bin }, arq) {
  json.buffers = [{ byteLength: bin.length }];
  let jsonBuf = Buffer.from(JSON.stringify(json)); const jpad = (4 - (jsonBuf.length % 4)) % 4; jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
  const bpad = (4 - (bin.length % 4)) % 4; const binBuf = Buffer.concat([bin, Buffer.alloc(bpad)]);
  const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(jsonBuf.length, 0); cj.write('JSON', 4);
  const cb = Buffer.alloc(8); cb.writeUInt32LE(binBuf.length, 0); cb.write('BIN\0', 4);
  fs.writeFileSync(arq, Buffer.concat([cab, cj, jsonBuf, cb, binBuf]));
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

// --- ferramentas externas ---
const gt = (...a) => execFileSync('npx', ['-y', '@gltf-transform/cli', ...a], { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
function fbxParaGlb(arqFbx, arqGlb) {
  const cache = path.join(os.homedir(), '.cache', 'cacamba-fbx2gltf');
  const so = { darwin: 'Darwin', linux: 'Linux', win32: 'Windows_NT' }[process.platform];
  const bin = path.join(cache, 'node_modules', 'fbx2gltf', 'bin', so, process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF');
  if (!fs.existsSync(bin)) {
    console.log('baixando o FBX2glTF (uma vez) para', cache);
    fs.mkdirSync(cache, { recursive: true });
    execFileSync('npm', ['i', 'fbx2gltf@0.9.7-p1', '--prefix', cache, '--no-audit', '--no-fund', '--silent'], { stdio: 'inherit' });
  }
  execFileSync(bin, ['--binary', '--input', arqFbx, '--output', arqGlb.replace(/\.glb$/, '')], { stdio: ['ignore', 'pipe', 'inherit'] });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cacamba-modelo-'));
let nTmp = 0;
function comoGlb(arq) {
  if (!/\.fbx$/i.test(arq)) return arq;
  const alvo = path.join(tmp, `conv${nTmp++}.glb`);
  fbxParaGlb(arq, alvo);
  return alvo;
}

// --- 1. a fonte, como .glb ---
const g = leGlb(comoGlb(fonte));
const t0 = triangulos(g.json);
console.log(`fonte: ${t0.toLocaleString('pt-BR')} triângulos, ${(fs.statSync(fonte).size / 1048576).toFixed(1)} MB, ${(g.json.skins || []).length ? 'com esqueleto' : 'sem esqueleto'}, clips: ${(g.json.animations || []).map((a) => a.name || '(sem nome)').join(', ') || 'nenhum'}`);

// --- 2. clips de outros arquivos, casados pelo nome dos nós ---
const CONTRATO = ['idle', 'feliz', 'bravo'];
g.json.animations = g.json.animations || [];
if (g.json.animations.length && !CONTRATO.includes(g.json.animations[0].name) && !opc.clips.some((c) => c.nome === 'idle')) {
  console.log(`clip "${g.json.animations[0].name || '(sem nome)'}" da fonte passa a se chamar idle`);
  g.json.animations[0].name = 'idle';
}
function mesclaClip(nome, arq) {
  const o = leGlb(comoGlb(arq));
  const anim = o.json.animations?.[0];
  if (!anim) { console.log(`aviso: ${arq} não tem clip; ${nome} ficou de fora`); return; }
  const porNome = new Map(g.json.nodes.map((n, i) => [n.name, i]));
  const copiaAcessor = (iAcc) => {
    const a = o.json.accessors[iAcc]; const bv = o.json.bufferViews[a.bufferView];
    const bytes = o.bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
    const pad = (4 - (g.bin.length % 4)) % 4;
    g.bin = Buffer.concat([g.bin, Buffer.alloc(pad), bytes]);
    g.json.bufferViews.push({ buffer: 0, byteOffset: g.bin.length - bytes.length, byteLength: bytes.length });
    g.json.accessors.push({ ...a, bufferView: g.json.bufferViews.length - 1 });
    return g.json.accessors.length - 1;
  };
  const samplers = []; const channels = []; let perdidos = 0;
  for (const ch of anim.channels) {
    const nomeNo = o.json.nodes[ch.target.node].name;
    const alvo = porNome.get(nomeNo);
    if (alvo == null) { perdidos++; continue; }
    const s = anim.samplers[ch.sampler];
    samplers.push({ input: copiaAcessor(s.input), output: copiaAcessor(s.output), interpolation: s.interpolation || 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: alvo, path: ch.target.path } });
  }
  g.json.animations = g.json.animations.filter((a) => a.name !== nome);
  g.json.animations.push({ name: nome, samplers, channels });
  console.log(`clip ${nome}: ${channels.length} canais de ${arq}${perdidos ? ` (${perdidos} sem nó correspondente)` : ''}`);
}
for (const c of opc.clips) mesclaClip(c.nome, c.arq);
const fundido = path.join(tmp, 'fundido.glb'); escreveGlb(g, fundido);

// --- 3. solda, reduz, encolhe ---
const soldado = path.join(tmp, 'soldado.glb'), reduzido = path.join(tmp, 'reduzido.glb'), pequeno = path.join(tmp, 'pequeno.glb');
gt('weld', fundido, soldado);
const razao = Math.min(1, opc.tri / t0);
if (razao < 1) gt('simplify', '--ratio', String(razao), '--error', String(opc.erro), soldado, reduzido);
else fs.copyFileSync(soldado, reduzido);
gt('resize', '--width', '1024', '--height', '1024', reduzido, pequeno);

// --- 4. os nós do contrato ---
const p = leGlb(pequeno);
const cx = caixa(p.json); const altura = cx.max[1] - cx.min[1];
const cena = p.json.scenes[p.json.scene || 0];
const acha = (re) => p.json.nodes.findIndex((n) => re.test(n.name || ''));
const tem = (nome) => p.json.nodes.some((n) => n.name === nome);
const filhoDe = (iPai, name, translation) => { p.json.nodes.push({ name, translation }); const i = p.json.nodes.length - 1; (p.json.nodes[iPai].children ||= []).push(i); return i; };
const naRaiz = (name, translation) => { p.json.nodes.push({ name, translation }); cena.nodes.push(p.json.nodes.length - 1); };
const iCabeca = acha(/(^|[:_])head$/i), iEsq = acha(/(^|[:_])(left|l)_?hand$/i), iDir = acha(/(^|[:_])(right|r)_?hand$/i);
if (!tem('Cabeca')) {
  if (iCabeca >= 0) { filhoDe(iCabeca, 'Cabeca', [0, altura * 0.06, altura * 0.01]); console.log(`Cabeca pendurada no osso "${p.json.nodes[iCabeca].name}"`); }
  else naRaiz('Cabeca', [0, cx.min[1] + altura * opc.cabeca, 0]);
}
if (!tem('MaoEsq') && !tem('MaoDir')) {
  if (iEsq >= 0 && iDir >= 0) { filhoDe(iEsq, 'MaoEsq', [0, 0, 0]); filhoDe(iDir, 'MaoDir', [0, 0, 0]); console.log(`mãos penduradas nos ossos "${p.json.nodes[iEsq].name}" e "${p.json.nodes[iDir].name}"`); }
  else if (opc.maos) { naRaiz('MaoDir', [-Math.abs(opc.maos[0]), opc.maos[1], opc.maos[2]]); naRaiz('MaoEsq', [Math.abs(opc.maos[0]), opc.maos[1], opc.maos[2]]); }
}
escreveGlb(p, saida);
fs.rmSync(tmp, { recursive: true, force: true });
const t1 = triangulos(p.json);
console.log(`saída: ${saida} — ${t1.toLocaleString('pt-BR')} triângulos, ${(fs.statSync(saida).size / 1048576).toFixed(2)} MB, altura ${altura.toFixed(2)}, clips: ${(p.json.animations || []).map((a) => a.name).join(', ') || 'nenhum'}, nós do contrato: ${['Cabeca', 'MaoEsq', 'MaoDir'].filter(tem).join(', ') || 'nenhum'}`);
if (!(p.json.skins || []).length && altura > 1.6 && (cx.max[0] - cx.min[0]) > altura * 0.9) console.log('aviso: braços abertos (pose em T ou A) — a mesa espera sentado, mãos à frente');
