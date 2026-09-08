import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// O elenco 3D é esculpido JÁ SENTADO segurando as cartas (scripts/prepara_sentado.py):
// malha estática, sem esqueleto, com os nós que a mesa procura. Este teste lê o .glb
// como arquivo — não carrega three.js nem simula WebGL.
for (const slug of ['matheus', 'junior', 'dri', 'esterex', 'gabizinsky', 'lyly', 'mafra-kitty', 'mufasa']) {
  test(`${slug}: arquivo no contrato da mesa — sentado, sem esqueleto e leve`, () => {
    const bytes = fs.readFileSync(new URL(`../public/models/${slug}.glb`, import.meta.url));
    const len = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + len));
    assert.ok(!json.skins?.length, 'o arquivo veio com esqueleto');
    assert.ok(!json.animations?.length, 'o arquivo veio com clips');
    const nomes = json.nodes.map((n) => n.name);
    for (const n of ['Cabeca', 'MaoEsq', 'MaoDir']) assert.ok(nomes.includes(n), `sem o nó ${n}`);
    const tris = json.meshes.reduce((t, m) => t + m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0), 0);
    assert.ok(tris <= 33000, `${tris} triângulos — acima do orçamento da mesa`);
    assert.ok(bytes.length < 2.6e6, `${(bytes.length / 1048576).toFixed(2)} MB — pesado para o celular`);
  });
}

// Os enfeites do tampo (copo e pod, scripts/prepara_enfeite.py) são cenário: entram
// em toda partida 3D e não podem custar como um personagem. O contrato é a medida —
// eles são a ESCALA da mesa, e um copo de 3 m mataria a leitura das cartas.
for (const [nome, alturaMin, alturaMax, kbMax] of [['copo', 0.25, 0.35, 600], ['pod', 0.08, 0.15, 300]]) {
  test(`${nome}: enfeite leve, em pé e na medida de mesa`, () => {
    const bytes = fs.readFileSync(new URL(`../public/models/${nome}.glb`, import.meta.url));
    const len = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.toString('utf8', 20, 20 + len));
    assert.ok(!json.skins?.length, 'enfeite com esqueleto');
    assert.ok(!json.animations?.length, 'enfeite com clips');
    const caixas = json.accessors.filter((a) => a.min?.length === 3 && a.max?.length === 3);
    assert.ok(caixas.length, 'sem caixa de posições no arquivo');
    const alto = Math.max(...caixas.map((a) => a.max[1] - a.min[1]));
    const base = Math.min(...caixas.map((a) => a.min[1]));
    assert.ok(alto >= alturaMin && alto <= alturaMax, `${alto.toFixed(3)} m de altura — fora da medida de mesa`);
    assert.ok(Math.abs(base) < 0.01, `apoiado em y=${base.toFixed(3)} em vez do zero`);
    assert.ok(bytes.length < kbMax * 1024, `${(bytes.length / 1024).toFixed(0)} KB — pesado para um enfeite`);
  });
}
