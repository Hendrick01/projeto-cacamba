import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import {carregaCPU} from '../scripts/modelo-node.mjs';
import {encaixaModelo,criaBanqueta} from '../public/modelo3d.js';
import {MESA,atualizaInteracao,conectaLeque,arrumaLeque,gestoCarta,ajustaBanqueta,pontaDedo} from '../public/interacao3d.js';
const world=(o)=>o.getWorldPosition(new T.Vector3());
for(const slug of ['matheus','junior','dri','esterex','gabizinsky','lyly','mafra-kitty','mufasa']) {
 test(`${slug}: pegada, alcance, chão e mesa em movimento`,async()=>{
  const m=encaixaModelo(await carregaCPU(slug),slug,{estilo:'original',avisa:false});
  const leque=new T.Group();for(let i=0;i<9;i++)leque.add(new T.Mesh(new T.PlaneGeometry(.42,.59),new T.MeshStandardMaterial()));
  const card=new T.Mesh(new T.PlaneGeometry(.08,.112),new T.MeshStandardMaterial());
  conectaLeque(m,leque,card);arrumaLeque(leque,9);atualizaInteracao(m,0,{parado:true,flexao:0});
  const legs=['LeftUpLeg','RightUpLeg','LeftFoot','RightFoot'].map(n=>world(m.raiz.getObjectByName(n)));
  const tips=Object.entries(m.dedos.maos).map(([side,h])=>({side,h,start:world(m.raiz.getObjectByName(side+'HandMiddle3'))}));
  atualizaInteracao(m,0,{parado:true,flexao:1});
  for(const {side,h,start} of tips){
   const palm=h.palma.clone().applyQuaternion(h.osso.getWorldQuaternion(new T.Quaternion()));
   assert.ok(palm.z<-.95,`${side}: palma orientada para o leque`);
   const end=world(m.raiz.getObjectByName(side+'HandMiddle3'));
   assert.ok(end.sub(start).dot(palm)>.015,`${side}: dedos fecham para a palma, nunca para fora`);
  }
  atualizaInteracao(m,0,{parado:true,flexao:.68});
  for(const side of ['Left','Right'])assert.ok(pontaDedo(m,side,'Thumb').distanceTo(pontaDedo(m,side,'Index'))<.007,`${side}: pinça deixa a carta sem contato`);
  const grip=pontaDedo(m,'Left','Thumb').add(pontaDedo(m,'Left','Index')).multiplyScalar(.5);
  assert.ok(world(m.interacao.ancora).distanceTo(grip)<1e-6,'leque acompanha o contato, não um ponto fixo no corpo');
  const banco=criaBanqueta(0x405c50);ajustaBanqueta(m,banco);const top=banco.scale.y*.5;
  let mesh;m.raiz.traverse(o=>{if(o.isSkinnedMesh)mesh=o});
  for(const kind of ['comprar','descartar','baixar']) {
   assert.ok(gestoCarta(m,kind,new T.Vector3(.1,.86,1.2)));
   for(let f=0;f<90;f++){
    atualizaInteracao(m,1/60);if(f%10)continue;
    m.raiz.updateMatrixWorld(true);mesh.skeleton.update();
    if(card.visible)assert.ok(new T.Box3().setFromObject(card,true).min.y>MESA.altura+.003,`${kind}: carta na mão atravessa o tampo`);
    const p=new T.Vector3();let inTable=0;
    for(let v=0;v<mesh.geometry.attributes.position.count;v++){
     mesh.getVertexPosition(v,p).applyMatrix4(mesh.matrixWorld);
     assert.ok(Number.isFinite(p.x+p.y+p.z));assert.ok(p.y>=-.002,`pé abaixo do chão: ${p.y}`);
     if(p.y>.675&&p.y<.80&&p.x*p.x+(p.z-MESA.assento)**2<1.18**2)inTable++;
     const noBanco=((p.x-banco.position.x)/.18)**2+((p.z-banco.position.z)/.16)**2<1;
     if(noBanco&&p.y>.25)assert.ok(p.y>=top-.001,`${kind}: roupa atravessa o assento`);
    }
    assert.equal(inTable,0,`${kind}: corpo atravessa o tampo`);
   }
  }
  ['LeftUpLeg','RightUpLeg','LeftFoot','RightFoot'].forEach((n,i)=>assert.ok(world(m.raiz.getObjectByName(n)).distanceTo(legs[i])<1e-6,'gesto não arrasta as pernas'));
  assert.equal(m.interacao.evento,null);assert.equal(card.visible,false);
  assert.equal(leque.parent,m.interacao.ancora);
  assert.ok(new T.Box3().setFromObject(leque,true).getSize(new T.Vector3()).x<.23,'baralho em escala humana');
  m.mixer?.stopAllAction();
 });
}
test('importação sem ossos de dedos mantém leque na posição de apoio',()=>{
 const g={scene:new T.Group(),animations:[]};g.scene.add(new T.Mesh(new T.BoxGeometry(.3,1,.2),new T.MeshStandardMaterial()));
 const m=encaixaModelo(g,'externo',{estilo:'original',avisa:false}),leque=new T.Group();
 conectaLeque(m,leque);atualizaInteracao(m,0,{parado:true});
 assert.ok(world(m.interacao.ancora).distanceTo(m.posLeque)<1e-6);
});
