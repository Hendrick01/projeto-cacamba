import * as T from './vendor/three.module.js';
import { atualizaDedos } from './dedos3d.js';
export const MESA = Object.freeze({ altura: 0.76, raio: 1.15, assento: 1.68 });
const v = () => new T.Vector3();
const wp = (o) => o.getWorldPosition(v());
const q = () => new T.Quaternion();
const smooth = (t) => { t = T.MathUtils.clamp(t, 0, 1); return t*t*(3-2*t); };
function orientaOsso(osso, filho, alvo) {
  osso.updateWorldMatrix(true, true);
  const p=wp(osso), de=wp(filho).sub(p).normalize(), para=alvo.clone().sub(p).normalize();
  if (para.lengthSq()<0.5) return;
  const rot=q().setFromUnitVectors(de,para).multiply(osso.getWorldQuaternion(q()));
  osso.quaternion.copy(osso.parent.getWorldQuaternion(q()).invert().multiply(rot));
  osso.updateWorldMatrix(false,true);
}
// Dois segmentos de comprimento fixo; cotovelo para fora e para baixo.
export function resolveBraco(b, alvo, polo, rotMao) {
  const {ombro,cotovelo,mao,baseO,baseC}=b;
  ombro.quaternion.copy(baseO);cotovelo.quaternion.copy(baseC);ombro.updateWorldMatrix(true,true);
  const a=wp(ombro), e=wp(cotovelo), c=wp(mao), l1=a.distanceTo(e),l2=e.distanceTo(c);
  const dir=alvo.clone().sub(a), d=T.MathUtils.clamp(dir.length(),Math.abs(l1-l2)+.002,(l1+l2)*.985);dir.normalize();
  const fim=a.clone().addScaledVector(dir,d), x=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-x*x));
  const n=polo.clone().sub(a).addScaledVector(dir,-polo.clone().sub(a).dot(dir)).normalize();
  orientaOsso(ombro,cotovelo,a.clone().addScaledVector(dir,x).addScaledVector(n,h));
  orientaOsso(cotovelo,mao,fim);
  mao.quaternion.copy(mao.parent.getWorldQuaternion(q()).invert().multiply(rotMao));mao.updateWorldMatrix(false,true);
  return fim;
}
export function preparaInteracao(m) {
  // A pose importada trazia o tórax torcido: um ombro ficava 25 cm atrás
  // do outro, fora do alcance da carta. Alinha só o tórax, mantendo a pelve.
  const spine=m.raiz.getObjectByName('Spine01'), left=m.raiz.getObjectByName('LeftArm'),right=m.raiz.getObjectByName('RightArm');
  let spineBase=null;
  if(spine&&left&&right) {
    m.raiz.updateWorldMatrix(true,true);
    const line=m.raiz.worldToLocal(wp(left)).sub(m.raiz.worldToLocal(wp(right)));
    const axis=new T.Vector3(0,1,0).applyQuaternion(m.raiz.getWorldQuaternion(q()));
    const rot=q().setFromAxisAngle(axis,Math.atan2(line.z,line.x)).multiply(spine.getWorldQuaternion(q()));
    spine.quaternion.copy(spine.parent.getWorldQuaternion(q()).invert().multiply(rot));spineBase=spine.quaternion.clone();
    spine.updateWorldMatrix(false,true);
  }
  const bracos={};
  for(const lado of ['Left','Right']) {
    const ombro=m.raiz.getObjectByName(`${lado}Arm`),cotovelo=m.raiz.getObjectByName(`${lado}ForeArm`),mao=m.dedos.maos[lado];
    if(!ombro||!cotovelo||!mao)continue;
    const sinal=lado==='Left'?1:-1;
    const local=new T.Matrix4().makeBasis(mao.lateral,new T.Vector3(0,1,0),mao.lateral.clone().cross(new T.Vector3(0,1,0)));
    const x=new T.Vector3(-sinal,0,0),y=new T.Vector3(-sinal*.2,1,0).normalize(),z=x.clone().cross(y).normalize();x.copy(y).cross(z).normalize();
    const rot=q().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z)).multiply(q().setFromRotationMatrix(local).invert());
    bracos[lado]={ombro,cotovelo,mao:mao.osso,baseO:ombro.quaternion.clone(),baseC:cotovelo.quaternion.clone(),rot,sinal};
  }
  const dedos={};for(const lado of ['Left','Right'])for(const nome of ['Thumb','Index']){
    const ossos=[3,2,1].map(n=>m.raiz.getObjectByName(`${lado}Hand${nome}${n}`));
    if(ossos.every(Boolean))dedos[lado+nome]=ossos;
  }
  m.interacao={bracos,dedos,spine,spineBase,headBase:m.raiz.getObjectByName('Head')?.quaternion.clone(),evento:null,fila:[],tempo:0,leque:null,carta:null,ancora:new T.Object3D()};
  m.raiz.add(m.interacao.ancora);return m.interacao;
}
export function conectaLeque(m,leque,carta=null) {
  const i=m.interacao||preparaInteracao(m);i.leque=leque;i.carta=carta;
  leque.removeFromParent();i.ancora.add(leque);leque.position.set(0,.052,0);leque.rotation.set(-.04,0,0);leque.scale.setScalar(1);
  if(!i.bracos.Left){const p=m.posLeque.clone();m.raiz.parent?.localToWorld(p);i.ancora.position.copy(m.raiz.worldToLocal(p));}
  if(carta){carta.visible=false;carta.removeFromParent();m.raiz.add(carta);}
}
// As falanges do arquivo terminam a 76% do dedo. Projeta a ponta restante
// e aproxima o polegar do indicador, em vez de deixar os dois só arqueados.
export function pontaDedo(m,lado,dedo) {
  const b=m.interacao?.dedos[lado+dedo]?.[0];if(!b)return null;
  return b.localToWorld(b.position.clone().multiplyScalar(.24/.31));
}
function aproximaPonta(m,lado,dedo,alvo) {
  const ossos=m.interacao.dedos[lado+dedo];
  for(let k=0;k<10;k++)for(const b of ossos){
    const origem=wp(b),a=pontaDedo(m,lado,dedo).sub(origem).normalize(),c=alvo.clone().sub(origem).normalize();
    const delta=q().setFromUnitVectors(a,c),angle=2*Math.acos(T.MathUtils.clamp(delta.w,-1,1));
    if(angle>.22)delta.slerp(q(),1-.22/angle);
    const rot=delta.multiply(b.getWorldQuaternion(q()));
    b.quaternion.copy(b.parent.getWorldQuaternion(q()).invert().multiply(rot));b.updateWorldMatrix(false,true);
  }
}
function pinca(m,lado,aperto) {
  if(aperto<.2)return;
  const h=m.dedos.maos[lado];if(!h)return;
  const ossos=[...(m.interacao.dedos[lado+'Thumb']||[]),...(m.interacao.dedos[lado+'Index']||[])];
  if(ossos.length!==6)return;
  // A solução depende da flexão local, não da posição do braço. Reutiliza
  // a pegada parada para não executar cinemática de seis juntas a cada frame.
  const chave=Math.round(h.valor*500);
  if(h.pinca?.chave===chave){ossos.forEach((b,n)=>b.quaternion.copy(h.pinca.rots[n]));h.osso.updateWorldMatrix(false,true);return;}
  const palma=h.palma.clone().applyQuaternion(h.osso.getWorldQuaternion(q()));
  aproximaPonta(m,lado,'Thumb',pontaDedo(m,lado,'Index').addScaledVector(palma,.005));
  aproximaPonta(m,lado,'Index',pontaDedo(m,lado,'Thumb').addScaledVector(palma,-.005));
  h.pinca={chave,rots:ossos.map(b=>b.quaternion.clone())};
}
// Todas as cartas abrem ao redor da mesma pegada; 8 × 11 cm.
export function arrumaLeque(leque,n,max=9) {
  n=Math.min(max,n);
  for(let k=0;k<max;k++) {
    const c=leque.children[k];if(!c?.isMesh)continue;c.visible=k<n;if(!c.visible)continue;
    const a=(k-(n-1)/2)*(n>1?Math.min(.16,.8/(n-1)):0);
    c.scale.setScalar(.19);c.position.set(Math.sin(a)*.07,(Math.cos(a)-1)*.07,k*.00065);c.rotation.set(0,0,-a);c.material.side=T.DoubleSide;
  }
}
export function gestoCarta(m,tipo,destino) {
  const i=m.interacao;if(!i||!destino)return false;
  m.raiz.updateWorldMatrix(true,true);const p=m.raiz.worldToLocal(destino.clone());
  p.y=Math.max(.86-m.raiz.position.y,p.y);p.z=T.MathUtils.clamp(p.z,.36,.57);p.x=T.MathUtils.clamp(p.x,-.28,.18);
  const e={tipo,alvo:p,t:0,dur:tipo==='baixar'?1.3:1.05};
  if(i.evento){if(i.fila.length<4)i.fila.push(e);}else i.evento=e;return true;
}
export function atualizaInteracao(m,dt,{flexao=.68,parado=false,olhar=0}={}) {
  const i=m.interacao;if(!i){m.dedos.alvo=flexao;atualizaDedos(m.dedos,dt,parado);return;}
  i.tempo+=parado?0:dt;if(i.spineBase)i.spine.quaternion.copy(i.spineBase);m.raiz.updateWorldMatrix(true,true);
  const breathe=parado?0:Math.sin(i.tempo*1.7)*.002;
  const esquerda=new T.Vector3(.105,.865+breathe-m.raiz.position.y,.37),direita=new T.Vector3(-.02,.890+breathe-m.raiz.position.y,.37);
  let mover=0,aperto=flexao;const e=i.evento;
  if(e&&!parado) {
    e.t+=dt;const t=e.t/e.dur;mover=t<.4?smooth(t/.4):t<.57?1:1-smooth((t-.57)/.43);
    direita.lerp(e.alvo,mover);direita.y+=Math.sin(mover*Math.PI)*.06;
    aperto=e.tipo==='comprar'?(t<.4?.16:flexao):(t>.4&&t<.6?.12:flexao);
    if(t>=1)i.evento=i.fila.shift()||null;
  }else if(parado){i.evento=null;i.fila.length=0;}
  const rootRot=m.raiz.getWorldQuaternion(q());
  for(const lado of ['Left','Right']) {
    const b=i.bracos[lado];if(!b)continue;
    const target=m.raiz.localToWorld((lado==='Left'?esquerda:direita).clone());
    const polo=m.raiz.localToWorld(new T.Vector3(b.sinal*.38,.8-m.raiz.position.y,.16));
    resolveBraco(b,target,polo,rootRot.clone().multiply(b.rot));
  }
  m.dedos.alvo=flexao;m.dedos.alvos={Left:flexao,Right:aperto};atualizaDedos(m.dedos,dt,parado);m.raiz.updateWorldMatrix(true,true);
  pinca(m,'Left',flexao);pinca(m,'Right',aperto);
  const grip=pontaDedo(m,'Left','Index'),thumb=pontaDedo(m,'Left','Thumb');
  if(grip&&thumb){i.ancora.position.copy(m.raiz.worldToLocal(grip.add(thumb).multiplyScalar(.5)));}
  if(i.carta) {
    i.carta.visible=!!e&&!parado&&(e.tipo==='comprar'?e.t/e.dur>.42:e.t/e.dur<.49);
    i.carta.rotation.set(-mover*.9,0,-.12);
    const h=pontaDedo(m,'Right','Index'),polegar=pontaDedo(m,'Right','Thumb');
    if(h){if(polegar&&aperto>=.2)h.add(polegar).multiplyScalar(.5);i.carta.position.copy(m.raiz.worldToLocal(h)).add(new T.Vector3(0,.050,0).applyQuaternion(i.carta.quaternion));}
  }
  const head=m.raiz.getObjectByName('Head');
  if(head){if(parado||!m.cabecaAnimada)head.quaternion.copy(i.headBase);head.quaternion.multiply(q().setFromAxisAngle(new T.Vector3(0,1,0),T.MathUtils.clamp(olhar,-.22,.22)));}
}
export function ajustaBanqueta(m,banco) {
  const hips=m.raiz.getObjectByName('Hips');if(!hips)return;
  m.raiz.updateWorldMatrix(true,true);const h=m.raiz.worldToLocal(wp(hips));
  banco.position.set(h.x,0,h.z-.045);
  let altura=h.y+m.raiz.position.y-.17;
  // Assenta a almofada sob a superfície da roupa/pelve, medida na malha
  // deformada. Uma altura única atravessava saias, shorts e a parte traseira.
  const ponto=new T.Vector3();
  m.raiz.traverse(o=>{
    if(!o.isSkinnedMesh)return;o.skeleton.update();
    for(let n=0;n<o.geometry.attributes.position.count;n++) {
      o.getVertexPosition(n,ponto).applyMatrix4(o.matrixWorld);m.raiz.worldToLocal(ponto);ponto.y+=m.raiz.position.y;
      const dentro=((ponto.x-banco.position.x)/.185)**2+((ponto.z-banco.position.z)/.17)**2<1;
      if(dentro&&ponto.y>.25&&ponto.y<h.y+m.raiz.position.y-.06)altura=Math.min(altura,ponto.y-.007);
    }
  });
  banco.scale.set(.72,Math.max(.48,altura/.5),.64);
}
