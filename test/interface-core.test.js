import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutMao2D,layoutMao3D,indiceInsercao3D} from '../public/interface-core.js';
for (const width of [280,320,375,390,620,1440]) {
 test(`2D: indices e largura preservados em ${width}px`, () => {
  for(let n=0;n<=48;n++) {
   const l=layoutMao2D(n,width);
   assert.ok(l.passo>=0);
   assert.ok((l.itensPorFila-1)*l.passo+l.carta<=width-32);
   if(l.itensPorFila>1)assert.ok(l.passo>=26);
   assert.ok(l.fileiras*l.itensPorFila>=n);
  }
 });
}
for (const [width,height,fov] of [[320,568,72],[390,844,72],[844,390,55],[1440,900,55]]) {
 test(`3D: leque na tela ${width}x${height}`, () => {
  for(let n=1;n<=24;n++) {
   const l=layoutMao3D({quantidade:n,largura:width,altura:height,fov});
   for(const p of l.posicoes) {
    const halfWidth=(0.42*Math.cos(p.giro)+0.59*Math.abs(Math.sin(p.giro)))*p.escala/2;
    assert.ok(Math.abs(p.x)+halfWidth<l.larguraVisivel/2);
    assert.ok(p.y-0.59*p.escala/2>-l.alturaVisivel/2);
    assert.ok(Number.isFinite(p.y)); assert.ok(l.passo>=0);
   }
   assert.equal(l.posicoes.length,n);
  }
 });
}
test('dois leques calculam insercao pela fileira antes do X',()=>{
 const c=[{fila:0,x:-1,y:2},{fila:0,x:1,y:2},{fila:1,x:-1,y:0},{fila:1,x:1,y:0}];
 assert.equal(indiceInsercao3D(c,0,2),1);assert.equal(indiceInsercao3D(c,0,0),3);assert.equal(indiceInsercao3D([],0,0),0);
});
test('entrada invalida nao gera NaN',()=>{
 for(const n of [NaN,Infinity,-1]) {assert.ok(Number.isFinite(layoutMao2D(n).passo));assert.ok(Number.isFinite(layoutMao3D({quantidade:n}).escala));}
});
test('3D landscape uses available width instead of stacking 14-24 cards', () => {
 for(const n of [14,20,24]) {
  const p=layoutMao3D({quantidade:n,largura:844,altura:390,fov:55});
  assert.equal(p.fileiras,1);assert.ok(p.passo/p.unidade>=28);
 }
});
