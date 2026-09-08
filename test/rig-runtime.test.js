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
