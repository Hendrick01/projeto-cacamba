import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ler=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Home nova preserva IDs unicos exigidos pelo cliente',()=>{
 const html=ler('public/index.html'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const id of ['persona-figura','persona-cara','persona-nome','btn-personagem','name-input','code-input','btn-create','btn-join','btn-rules-home','home-error','screen-lobby','screen-game','hand'])assert.equal(ids.filter(x=>x===id).length,1,id);
 assert.match(html,/class="ui-entry"/);assert.match(html,/href="interface.css"/);assert.match(html,/data-interface-version/);
});
test('Home e 3D carregam interface sem scripts inline',()=>{
 for(const p of ['public/index.html','public/3d.html']){
  const html=ler(p);assert.match(html,/href="interface.css"/);assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!html.includes('user-scalable=no'));
 }
});
test('clientes 2D e 3D integram reconexao e controles de voz',()=>{
 for(const p of ['public/client.js','public/mesa3d.js']){
  const js=ler(p);assert.match(js,/ligaControlesVoz\(voz/);assert.match(js,/controlesVoz.presenca\(view.players\)/);assert.match(js,/voz.reconectar\?\.\(\)/);
 }
});
test('leque 3D usa prioridade visual para selecionar carta e dispose individual',()=>{
 const js=ler('public/mesa3d.js');assert.match(js,/b.object.renderOrder - a.object.renderOrder/);assert.match(js,/mesh.material.dispose\(\)/);assert.match(js,/indiceInsercao3D\(semEla.map/);
});
