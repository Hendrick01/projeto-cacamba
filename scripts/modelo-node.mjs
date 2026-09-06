// Carregamento da malha/esqueleto reais em CPU para testes e inspeção.
import fs from 'node:fs';
import { GLTFLoader } from '../public/vendor/GLTFLoader.js';
globalThis.ProgressEvent ||= class extends Event { constructor(t, p) { super(t); Object.assign(this, p); } };
export async function carregaCPU(slug) {
  const bytes = fs.readFileSync(new URL(`../public/models/${slug}.glb`, import.meta.url));
  const len = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8', 20, 20 + len));
  delete json.images; delete json.textures; delete json.materials;
  for (const m of json.meshes) for (const p of m.primitives) delete p.material;
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + len).toString('base64')}`;
  return new Promise((ok, fail) => new GLTFLoader().parse(JSON.stringify(json), '', ok, fail));
}
