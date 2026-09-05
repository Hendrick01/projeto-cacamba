// Senta um modelo rigado: assa o último quadro de um clip de sentar como pose
// de repouso (a personagem passa a ESTAR sentada, na origem), gira os braços
// para as mãos segurarem o leque na frente do peito, apaga os clips de andar
// e cria os três do contrato — `idle` (respiro), `feliz` (aceno com a
// cabeça) e `bravo` (balanço de cabeça) — em cima da pose nova. É bancada:
// roda uma vez por personagem, e o resultado vai para test/modelo-prepara.mjs.
//
// Uso: node test/modelo-senta.mjs <rigado.glb> <saida.glb> [--clip Stand_to_Sit_Transition_M]
//        [--gira LeftArm=ax,ay,az] [--gira RightForeArm=ax,ay,az] ...
//        [--mira LeftForeArm=x,y,z] [--mira LeftHand=x,y,z] ...
//        [--recuo 0.12] [--assento 0.72] [--folga 0.07] [--cintura y]
//   --gira: giro extra de um osso, em graus, em torno dos EIXOS DO MUNDO
//           (x = para a frente/trás, y = para dentro/fora, z = de lado),
//           aplicado por cima da pose assada — serve para endireitar o
//           tronco (Spine02) que o clip deixa torcido.
//   --mira: onde, em METROS no mundo, deve ficar a junta dada (a ponta do
//           osso pai): o pai gira até apontar para lá. Os padrões põem
//           cotovelos e mãos como quem segura um leque na frente do peito.
//           Pais são resolvidos antes dos filhos.
import fs from 'node:fs';

const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--') && !/^[A-Za-z]+=/.test(a));
const [fonte, saida] = pos;
let clipNome = 'Stand_to_Sit_Transition_M';
// giros padrão, em eixos do mundo: o tronco 15° mais ereto (o clip de sentar
// curva para a frente e a pele das costas desce sobre o cós) e os pulsos meio
// virados para dentro (as mãos ficam atrás do leque, dedos acima da borda).
// O endireitar do tronco (torção) depende de cada rig e vai por --gira.
const giros = { Spine02: [-15, 0, 0], LeftHand: [45, 0, 0], RightHand: [-45, 0, 0] };
const miras = { LeftForeArm: [0.20, 0.72, 0.10], RightForeArm: [-0.20, 0.72, 0.10], LeftHand: [0.05, 0.84, 0.26], RightHand: [-0.05, 0.84, 0.26] };
// metros: recuo do quadril (o clip senta na beirada); assento = altura da
// banqueta da mesa (a de balcão, BANQUETA_ASSENTO em modelo3d.js) — o osso do
// quadril fica `folga` acima dele; cintura = de onde para cima a perna não puxa
const opc = { recuo: 0.12, assento: 0.72, folga: 0.07, cintura: null };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--clip') clipNome = args[++i];
  else if (['--recuo', '--assento', '--folga', '--cintura'].includes(args[i])) opc[args[i].slice(2)] = Number(args[++i]);
  else if (args[i] === '--gira') { const [osso, v] = args[++i].split('='); giros[osso] = v.split(',').map(Number); }
  else if (args[i] === '--mira') { const [junta, v] = args[++i].split('='); miras[junta] = v === '-' ? null : v.split(',').map(Number); }
}
if (!fonte || !saida) { console.error('uso: node test/modelo-senta.mjs <rigado.glb> <saida.glb> [--clip nome] [--gira Osso=ax,ay,az]'); process.exit(2); }

// --- .glb ---
const b = fs.readFileSync(fonte);
const jl = b.readUInt32LE(12); const json = JSON.parse(b.toString('utf8', 20, 20 + jl));
let bin = Buffer.from(b.subarray(28 + jl, 28 + jl + b.readUInt32LE(20 + jl)));
const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function le(iAcc) { const a = json.accessors[iAcc]; const bv = json.bufferViews[a.bufferView]; const off = (bv.byteOffset || 0) + (a.byteOffset || 0); const n = N[a.type]; return { arr: new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4)), n, count: a.count }; }
function acessor(arr, tipo) {
  const bytes = Buffer.from(new Float32Array(arr).buffer);
  const pad = (4 - (bin.length % 4)) % 4; bin = Buffer.concat([bin, Buffer.alloc(pad), bytes]);
  json.bufferViews.push({ buffer: 0, byteOffset: bin.length - bytes.length, byteLength: bytes.length });
  const n = N[tipo]; const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity);
  for (let i = 0; i < arr.length; i++) { mn[i % n] = Math.min(mn[i % n], arr[i]); mx[i % n] = Math.max(mx[i % n], arr[i]); }
  json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126, count: arr.length / n, type: tipo, min: mn, max: mx });
  return json.accessors.length - 1;
}

// --- quaternions [x,y,z,w] ---
const qMul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qEixo = (eixo, graus) => { const a = graus * Math.PI / 360; const s = Math.sin(a); return [eixo[0] * s, eixo[1] * s, eixo[2] * s, Math.cos(a)]; };
const qNorm = (q) => { const l = Math.hypot(...q) || 1; return q.map((v) => v / l); };
const qEuler = (ax, ay, az) => qMul(qEixo([0, 1, 0], ay), qMul(qEixo([1, 0, 0], ax), qEixo([0, 0, 1], az)));

// --- 1. o último quadro do clip vira a pose de repouso ---
const pai = {}; json.nodes.forEach((n, i) => (n.children || []).forEach((c) => (pai[c] = i)));
const no = (nome) => json.nodes.findIndex((n) => n.name === nome);
const clip = json.animations.find((a) => a.name === clipNome);
if (!clip) throw new Error(`clip "${clipNome}" não existe; há: ${json.animations.map((a) => a.name).join(', ')}`);
const hips = json.nodes[no('Hips')] || json.nodes[json.skins[0].joints[0]];
const hipsRepouso = (hips.translation || [0, 0, 0]).slice();
for (const ch of clip.channels) {
  const s = clip.samplers[ch.sampler]; const out = le(s.output);
  const ultimo = Array.from(out.arr.slice((out.count - 1) * out.n, out.count * out.n));
  json.nodes[ch.target.node][ch.target.path] = ultimo;
}
// sentada NA ORIGEM: o clip anda até a cadeira; fica só a descida do quadril.
// E recua/desce mais um pouco (--recuo/--desce, em metros): o clip senta na
// beirada, e a banqueta da mesa quer as coxas apoiadas no assento
const escalaRaiz0 = (() => { const r = json.nodes.find((n) => n.name === 'Armature') || json.nodes[json.scenes[0].nodes[0]]; return (r.scale || [1, 1, 1])[1]; })();
const quadrilClip = hips.translation[1];
hips.translation = [hipsRepouso[0], (opc.assento + opc.folga) / escalaRaiz0, hipsRepouso[2] - opc.recuo / escalaRaiz0];
opc.desce = quadrilClip * escalaRaiz0 - (opc.assento + opc.folga);   // quanto o corpo desceu (ou subiu) em relação ao clip; as miras acompanham
console.log(`pose assada de "${clipNome}"; quadril do clip a ${(quadrilClip * escalaRaiz0).toFixed(2)} m → ${(opc.assento + opc.folga).toFixed(2)} m (banqueta de ${opc.assento} m), recuado ${opc.recuo} m`);

// --- 1b. a pele da cintura não desce com a coxa: acima da cintura, os ossos
// da perna perdem o peso (o rigger automático espalha o peso da coxa até a
// barriga; com a coxa a 90°, isso vira uma mancha de pele por cima da calça)
{
  const prim = json.meshes[0].primitives[0];
  const P = le(prim.attributes.POSITION).arr;
  const aJ = json.accessors[prim.attributes.JOINTS_0], aW = json.accessors[prim.attributes.WEIGHTS_0];
  const bvJ = json.bufferViews[aJ.bufferView], bvW = json.bufferViews[aW.bufferView];
  if (aJ.componentType === 5121 && aW.componentType === 5126 && !bvJ.byteStride && !bvW.byteStride) {
    const J = new Uint8Array(bin.buffer, bin.byteOffset + (bvJ.byteOffset || 0) + (aJ.byteOffset || 0), aJ.count * 4);
    const W = new Float32Array(bin.buffer, bin.byteOffset + (bvW.byteOffset || 0) + (aW.byteOffset || 0), aW.count * 4);
    const nomesOssos = json.skins[0].joints.map((i) => json.nodes[i].name);
    const perna = new Set(nomesOssos.map((n, i) => [n, i]).filter(([n]) => /UpLeg|Leg|Foot|ToeBase/.test(n)).map(([, i]) => i));
    const iHips = Math.max(0, nomesOssos.indexOf('Hips'));
    const cintura = opc.cintura ?? (hipsRepouso[1] * escalaRaiz0 - 0.05);
    let mexidos = 0;
    for (let v = 0; v < aJ.count; v++) {
      if (P[v * 3 + 1] < cintura) continue;
      let tirou = 0, resto = 0;
      for (let k = 0; k < 4; k++) { if (perna.has(J[v * 4 + k]) && W[v * 4 + k] > 0) { tirou += W[v * 4 + k]; W[v * 4 + k] = 0; } else resto += W[v * 4 + k]; }
      if (!tirou) continue;
      mexidos++;
      if (resto > 0) { for (let k = 0; k < 4; k++) W[v * 4 + k] /= resto; } else { J[v * 4] = iHips; W[v * 4] = 1; }
    }
    console.log(`cintura em ${cintura.toFixed(2)} m: ${mexidos} vértices deixaram de seguir a perna`);
  } else console.log('aviso: pesos num formato inesperado; a cintura ficou como veio');
}

// --- 2. orientação de cada osso no mundo (pose assada), para girar em eixos do mundo ---
function mundo(i) { const n = json.nodes[i]; const local = n.rotation || [0, 0, 0, 1]; return pai[i] == null ? local : qMul(mundo(pai[i]), local); }
function giraNoMundo(i, delta) {
  // W' = D·W  ⇒  L' = P⁻¹·D·P·L
  const P = pai[i] == null ? [0, 0, 0, 1] : mundo(pai[i]);
  const L = json.nodes[i].rotation || [0, 0, 0, 1];
  return qNorm(qMul(qInv(P), qMul(delta, qMul(P, L))));
}
// pais antes dos filhos: o giro do tronco arrasta os braços, e o giro dos
// braços é medido já com o tronco no lugar
const profundidade = (i) => (pai[i] == null ? 0 : 1 + profundidade(pai[i]));
for (const [osso, [ax, ay, az]] of Object.entries(giros).sort((a, b) => profundidade(no(a[0])) - profundidade(no(b[0])))) {
  const i = no(osso); if (i < 0) { console.log(`aviso: osso ${osso} não existe`); continue; }
  json.nodes[i].rotation = giraNoMundo(i, qEuler(ax, ay, az));
}
if (Object.keys(giros).length) console.log(`giros: ${Object.entries(giros).map(([o, v]) => `${o} ${v.join('/')}°`).join(', ')}`);

// --- 2b. mira: cada osso gira até a junta filha cair no ponto pedido ---
// cinemática direta em unidades do rig; a raiz (Armature) costuma trazer a
// escala para metros (0,01 num rig em centímetros)
const raizEscala = (() => { const r = json.nodes.find((n) => n.name === 'Armature') || json.nodes[json.scenes[0].nodes[0]]; return (r.scale || [1, 1, 1])[1]; })();
const vRot = (q, v) => { const [x, y, z, w] = q; const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
function posMundo(i) { const n = json.nodes[i]; const t = n.translation || [0, 0, 0]; if (pai[i] == null) return t.slice(); const pp = posMundo(pai[i]); const r = vRot(mundo(pai[i]), t); return [pp[0] + r[0], pp[1] + r[1], pp[2] + r[2]]; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const entreVetores = (a, b) => { const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])); const eixo = norm(cruz(a, b)); const ang = Math.acos(d); if (Math.hypot(...cruz(a, b)) < 1e-6) return [0, 0, 0, 1]; const s = Math.sin(ang / 2); return [eixo[0] * s, eixo[1] * s, eixo[2] * s, Math.cos(ang / 2)]; };
const mirasOrdenadas = Object.entries(miras).filter(([, alvo]) => alvo).sort((a, b) => profundidade(no(a[0])) - profundidade(no(b[0])));
for (const [junta, alvoM] of mirasOrdenadas) {
  const iJ = no(junta); if (iJ < 0 || pai[iJ] == null) { console.log(`aviso: junta ${junta} não existe`); continue; }
  const iOsso = pai[iJ];
  // os pontos são dados para o corpo na origem; acompanham o recuo/descida
  const alvo = [alvoM[0], alvoM[1] - opc.desce, alvoM[2] - opc.recuo].map((v) => v / raizEscala);
  const base = posMundo(iOsso), ponta = posMundo(iJ);
  const D = entreVetores(norm(sub(ponta, base)), norm(sub(alvo, base)));
  json.nodes[iOsso].rotation = giraNoMundo(iOsso, D);
  const nova = posMundo(iJ);
  console.log(`mira ${junta}: ${json.nodes[iOsso].name} girou; junta em ${nova.map((v) => (v * raizEscala).toFixed(2)).join(',')} m (pedido ${alvoM.join(',')})`);
}

// --- 3. os clips do contrato, em cima da pose ---
json.animations = [];
function clipDe(nome, faixas) {
  // faixas: [{ osso, eixo:[x,y,z] (mundo), graus:[[t, g], ...] }]
  const samplers = [], channels = [];
  for (const f of faixas) {
    const i = no(f.osso); if (i < 0) continue;
    const tempos = f.graus.map(([t]) => t);
    const quats = f.graus.map(([, g]) => giraNoMundo(i, qEixo(f.eixo, g)));
    samplers.push({ input: acessor(tempos, 'SCALAR'), output: acessor(quats.flat(), 'VEC4'), interpolation: 'LINEAR' });
    channels.push({ sampler: samplers.length - 1, target: { node: i, path: 'rotation' } });
  }
  json.animations.push({ name: nome, samplers, channels });
}
const X = [1, 0, 0], Y = [0, 1, 0];
clipDe('idle', [
  { osso: 'Spine01', eixo: X, graus: [[0, 0], [1.6, 1.4], [3.2, 0]] },
  { osso: 'Head', eixo: Y, graus: [[0, 0], [1.1, 2.5], [2.3, -2.5], [3.2, 0]] },
]);
clipDe('feliz', [
  { osso: 'Head', eixo: X, graus: [[0, 0], [0.18, 14], [0.4, -4], [0.6, 10], [0.9, 0]] },
  { osso: 'Spine01', eixo: X, graus: [[0, 0], [0.3, 5], [0.9, 0]] },
]);
clipDe('bravo', [
  { osso: 'Head', eixo: Y, graus: [[0, 0], [0.15, 16], [0.4, -16], [0.6, 12], [0.8, 0]] },
  { osso: 'Spine01', eixo: X, graus: [[0, 0], [0.2, -4], [0.8, 0]] },
]);
json.buffers = [{ byteLength: bin.length }];
let jsonBuf = Buffer.from(JSON.stringify(json)); const jpad = (4 - (jsonBuf.length % 4)) % 4; jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
const bpad = (4 - (bin.length % 4)) % 4; const binBuf = Buffer.concat([bin, Buffer.alloc(bpad)]);
const cab = Buffer.alloc(12); cab.write('glTF', 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(jsonBuf.length, 0); cj.write('JSON', 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(binBuf.length, 0); cb.write('BIN\0', 4);
fs.writeFileSync(saida, Buffer.concat([cab, cj, jsonBuf, cb, binBuf]));
console.log(`saída: ${saida} — clips ${json.animations.map((a) => a.name).join(', ')}, ${(fs.statSync(saida).size / 1048576).toFixed(1)} MB`);
