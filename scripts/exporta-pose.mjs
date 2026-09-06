import fs from 'node:fs';
import * as T from '../public/vendor/three.module.js';
import {carregaCPU} from './modelo-node.mjs';
import {encaixaModelo,criaBanqueta} from '../public/modelo3d.js';
import {atualizaInteracao,conectaLeque,arrumaLeque,ajustaBanqueta,gestoCarta} from '../public/interacao3d.js';
const slug=process.argv[2]||'gabizinsky', flex=Number(process.argv[3]||'.68');
const g=await carregaCPU(slug),m=encaixaModelo(g,slug,{estilo:'original',avisa:false});
const scene=new T.Group();scene.add(m.raiz);
const banco=criaBanqueta(0x405c50);ajustaBanqueta(m,banco);scene.add(banco);
const leque=new T.Group();for(let i=0;i<5;i++)leque.add(new T.Mesh(new T.PlaneGeometry(.42,.59),new T.MeshStandardMaterial({color:0x923d34,side:T.DoubleSide})));
const carta=new T.Mesh(new T.PlaneGeometry(.08,.112),new T.MeshStandardMaterial({color:0xf7ecda,side:T.DoubleSide}));
arrumaLeque(leque,5,5);conectaLeque(m,leque,carta);atualizaInteracao(m,0,{flexao:flex,parado:true});
if(process.argv[4]){gestoCarta(m,process.argv[4],new T.Vector3(-.1,.9,.6));for(let i=0;i<25;i++)atualizaInteracao(m,.016,{flexao:flex});}
scene.updateMatrixWorld(true);
let out=[];scene.traverse(o=>{if(!o.isMesh||!o.visible)return;let par=o.parent;while(par){if(!par.visible)return;par=par.parent;} if(o.isSkinnedMesh)o.skeleton.update();let pos=[],uv=o.geometry.attributes.uv,v=new T.Vector3();for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);pos.push(v.toArray());}out.push({pos,uv:uv?Array.from({length:uv.count},(_,i)=>[uv.getX(i),uv.getY(i)]).flat():null,indices:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:pos.length},(_,i)=>i),skin:!!o.isSkinnedMesh,color:o.material.color?.toArray()||[.5,.4,.3]});});
const folder=process.env.QA_DIR||'/tmp';fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(folder+'/cacamba-pose.json',JSON.stringify(out));
console.log('ancora',m.interacao.ancora.position.toArray(),'banco',banco.position.toArray(),banco.scale.toArray());
for(let side of ['Left','Right'])for(let name of ['Hand','HandThumb3','HandMiddle3'])console.log(side+name,m.raiz.getObjectByName(side+name).getWorldPosition(new T.Vector3()).toArray());
