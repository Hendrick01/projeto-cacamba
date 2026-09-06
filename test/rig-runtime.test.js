import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from '../public/vendor/GLTFLoader.js';
import { encaixaModelo } from '../public/modelo3d.js';
import { atualizaDedos } from '../public/dedos3d.js';

// Compatibilidade do carregador de arquivos com Node; não simula WebGL.
globalThis.ProgressEvent ||= class ProgressEvent extends Event {
 constructor(type, values = {}) { super(type); Object.assign(this, values); }
};

for (const slug of ['matheus','junior','dri','esterex','gabizinsky','lyly','mafra-kitty','mufasa']) {
 test(`${slug}: GLTFLoader reconhece os 30 dedos e anima sem mover ossos do corpo`, async () => {
  const bytes=fs.readFileSync(new URL(`../public/models/${slug}.glb`,import.meta.url));
  const len=bytes.readUInt32LE(12);const json=JSON.parse(bytes.toString('utf8',20,20+len));
  // Teste em Node não decodifica imagens; mantém malha, skin e clips reais.
  delete json.images;delete json.textures;delete json.materials;
  for(const mesh of json.meshes)for(const p of mesh.primitives)delete p.material;
  const binary=bytes.subarray(28+len);json.buffers[0].uri=`data:application/octet-stream;base64,${binary.toString('base64')}`;
  const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(JSON.stringify(json),'',resolve,reject));
  const m=encaixaModelo(gltf,slug,{estilo:'original',avisa:false});
  assert.equal(m.dedos.juntas.length,30);assert.equal(m.sentado,true);
  const arm=m.raiz.getObjectByName('RightForeArm');const before=arm.quaternion.clone();
  m.dedos.alvo=.6;atualizaDedos(m.dedos,.016,true);
  assert.ok(m.dedos.juntas.every(({osso,base})=>osso.quaternion.angleTo(base)>.05));
  assert.ok(arm.quaternion.angleTo(before)<1e-7);
  m.dedos.alvo=0;atualizaDedos(m.dedos,.016,true);
  assert.ok(m.dedos.juntas.every(({osso,base})=>osso.quaternion.angleTo(base)<1e-7));
  assert.ok(m.materiais.every(mat=>!mat.transparent));
  m.mixer?.stopAllAction();
 });
}
