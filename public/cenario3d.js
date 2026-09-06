import * as T from './vendor/three.module.js';
import {MESA} from './interacao3d.js';
// Uma única direção de arte e luz para jogo e provador.
const mat=(color,roughness=.8,extra={})=>new T.MeshStandardMaterial({color,roughness,...extra});
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;}
export function texturaMadeira(rep=1){const t=canvasTex(512,128,(c,w,h)=>{c.fillStyle='#594333';c.fillRect(0,0,w,h);for(let i=0;i<64;i++){c.strokeStyle=i%3?'#72523a':'#423326';c.globalAlpha=.26;c.beginPath();for(let x=0;x<=w;x+=8){const y=i*2+Math.sin(x/65+i)*2.6;if(!x)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();}});t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rep,1);return t;}
export function texturaFeltro(){return canvasTex(512,512,(c,w,h)=>{c.fillStyle='#284e49';c.fillRect(0,0,w,h);c.lineWidth=.5;for(let i=0;i<w;i+=3){c.strokeStyle=i%2?'#315952':'#22443f';c.beginPath();c.moveTo(i,0);c.lineTo(i,h);c.stroke();c.globalAlpha=.28;c.beginPath();c.moveTo(0,i);c.lineTo(w,i);c.stroke();c.globalAlpha=1;}});}
function box(g,w,h,d,x,y,z,m){const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;}
export function iluminaSala(scene,renderer,{centro=new T.Vector3(),compacto=false}={}) {
  scene.background=new T.Color(0x626c6b);scene.fog=new T.Fog(0x7e8680,12,28);
  scene.add(new T.HemisphereLight(0xe3efff,0x5e5143,1.45));
  const janela=new T.DirectionalLight(0xe7f1ff,2.1);janela.position.copy(centro).add(new T.Vector3(-3,3.4,2.4));scene.add(janela);
  const foco=new T.SpotLight(0xffe5c4,34,12,.9,.9,2);foco.position.copy(centro).add(new T.Vector3(.25,3.05,.25));foco.target.position.copy(centro).setY(MESA.altura);
  foco.castShadow=true;foco.shadow.mapSize.set(compacto?1024:2048,compacto?1024:2048);foco.shadow.normalBias=.003;foco.shadow.bias=-.00015;scene.add(foco,foco.target);
  const pm=new T.PMREMGenerator(renderer),amb=new T.Scene();amb.background=new T.Color(0xa4aaa7);
  const room=new T.Mesh(new T.BoxGeometry(10,6,10),new T.MeshBasicMaterial({color:0xa6aaa3,side:T.BackSide}));room.position.y=3;amb.add(room);
  const painel=new T.Mesh(new T.PlaneGeometry(3,2),new T.MeshBasicMaterial({color:0xffffff}));painel.position.set(-4.8,2,0);painel.rotation.y=Math.PI/2;amb.add(painel);
  scene.environment=pm.fromScene(amb,.04).texture;scene.environmentIntensity=.45;
  amb.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pm.dispose();
  return foco;
}
export function criaMesa(){const g=new T.Group(),wood=mat(0xffffff,.47,{map:texturaMadeira(5)});
  const top=new T.Mesh(new T.CylinderGeometry(MESA.raio,MESA.raio,.075,64),[wood,mat(0xffffff,.96,{map:texturaFeltro()}),wood]);top.position.y=MESA.altura-.0375;top.receiveShadow=true;top.castShadow=true;g.add(top);
  const rail=new T.Mesh(new T.TorusGeometry(MESA.raio+.025,.038,12,64),wood);rail.rotation.x=Math.PI/2;rail.position.y=MESA.altura-.009;rail.castShadow=true;g.add(rail);
  const trim=new T.Mesh(new T.TorusGeometry(MESA.raio-.028,.003,6,64),mat(0xc6b083,.5));trim.rotation.x=Math.PI/2;trim.position.y=MESA.altura+.001;g.add(trim);
  const leg=new T.Mesh(new T.CylinderGeometry(.16,.25,.67,16),mat(0x333a37,.58));leg.position.y=.335;g.add(leg);
  for(const a of [0,Math.PI/2]){const foot=box(g,.72,.06,.1,0,.03,0,mat(0x333a37,.58));foot.rotation.y=a;}
  return g;
}
export function criaSala(){const g=new T.Group(),plaster=mat(0xd6d2c2,.97),green=mat(0x385c55,.83),wood=mat(0xffffff,.57,{map:texturaMadeira(2)}),dark=mat(0x303b38,.6),brass=mat(0xa58c54,.4,{metalness:.55});
  const floorTex=canvasTex(512,512,(c,w,h)=>{c.fillStyle='#726f64';c.fillRect(0,0,w,h);for(let y=0;y<4;y++)for(let x=0;x<4;x++){c.fillStyle=(x+y)%2?'#b1ab9c':'#cbc5b5';c.fillRect(x*128+2,y*128+2,124,124);}});floorTex.wrapS=floorTex.wrapT=T.RepeatWrapping;floorTex.repeat.set(5,5);
  const floor=new T.Mesh(new T.PlaneGeometry(12,12),mat(0xffffff,.82,{map:floorTex}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;g.add(floor);
  box(g,10,3.3,.15,0,1.65,-4.7,plaster);box(g,.15,3.3,10,-5,1.65,0,plaster);box(g,.15,3.3,10,5,1.65,0,plaster);
  box(g,10,1.05,.04,0,.525,-4.59,green);box(g,10,.05,.06,0,1.075,-4.54,wood);box(g,10,.09,.06,0,.045,-4.53,wood);
  for(let x=-4.8;x<=5;x+=.8)box(g,.025,.96,.025,x,.54,-4.55,wood);
  // Janelas fundas, caixilho e luz de fim de tarde; dão escala ao ambiente.
  const vista=canvasTex(256,256,(c,w,h)=>{const sky=c.createLinearGradient(0,0,0,h);sky.addColorStop(0,'#acc9cb');sky.addColorStop(1,'#edd8ac');c.fillStyle=sky;c.fillRect(0,0,w,h);c.fillStyle='#557362';for(let i=0;i<9;i++){c.beginPath();c.ellipse(i*35,185+(i%3)*10,40,42,0,0,7);c.fill();}c.fillStyle='#928471';c.fillRect(0,218,256,38);});
  for(const x of [-3.5,-1.7]){box(g,1.52,1.72,.12,x,2.02,-4.5,wood);const pane=box(g,1.37,1.55,.025,x,2.02,-4.41,new T.MeshBasicMaterial({map:vista}));pane.castShadow=false;box(g,.045,1.55,.05,x,2.02,-4.37,wood);box(g,1.4,.045,.05,x,2.08,-4.37,wood);box(g,1.68,.075,.28,x,1.19,-4.32,wood);}
  // Balcão com volume, rodapé, portas e prateleiras; distante dos jogadores.
  box(g,2.75,.94,.72,2.2,.47,-3.7,green);box(g,2.9,.075,.86,2.2,.98,-3.7,wood);box(g,2.8,.07,.76,2.2,.035,-3.7,dark);
  for(let x=1.1;x<3.6;x+=.8){box(g,.012,.8,.02,x,.5,-3.325,brass);box(g,.09,.015,.025,x+.25,.77,-3.31,brass);}
  for(const y of [1.6,2.2]){box(g,2.65,.055,.3,2.2,y,-4.36,wood);for(let k=0;k<7;k++){const col=[0x345c43,0x815631,0x54644a][k%3];const bottle=new T.Mesh(new T.CylinderGeometry(.04,.045,.22,8),mat(col,.34));bottle.position.set(1.1+k*.36,y+.137,-4.31);g.add(bottle);box(g,.027,.08,.027,1.1+k*.36,y+.28,-4.31,mat(col,.4));box(g,.066,.07,.012,1.1+k*.36,y+.14,-4.263,mat(0xe6d8b5,.9));}}
  // Vigas e pendentes ancorados no teto, com proporção de sala real.
  box(g,10,.1,10,0,3.35,0,plaster);
  for(const z of [-3.4,-.2,3])box(g,10,.16,.14,0,3.2,z,wood);
  for(const x of [-1.8,1.8]){box(g,.016,.56,.016,x,2.97,-2.2,dark);const shade=new T.Mesh(new T.ConeGeometry(.23,.21,24,1,true),mat(0x3d514b,.6,{side:T.DoubleSide}));shade.position.set(x,2.63,-2.2);g.add(shade);const bulb=new T.Mesh(new T.SphereGeometry(.055,10,8),new T.MeshBasicMaterial({color:0xffe8b4}));bulb.position.set(x,2.55,-2.2);g.add(bulb);}
  const plaque=canvasTex(512,256,(c,w,h)=>{c.fillStyle='#223b35';c.fillRect(0,0,w,h);c.strokeStyle='#c7b27b';c.lineWidth=5;c.strokeRect(10,10,w-20,h-20);c.textAlign='center';c.fillStyle='#efe7d3';c.font='bold 60px Georgia';c.fillText('CAÇAMBA',w/2,105);c.font='24px Georgia';c.fillText('BAR • CARTAS • AMIGOS',w/2,163);});
  const sign=new T.Mesh(new T.PlaneGeometry(1.5,.75),mat(0xffffff,.9,{map:plaque}));sign.position.set(.15,2.35,-4.5);g.add(sign);
  return g;
}
