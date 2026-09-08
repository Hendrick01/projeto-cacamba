import * as T from './vendor/three.module.js';
import {MESA} from './interacao3d.js';
// Boteco de esquina no fim da tarde (referência: Capote): luz âmbar, azulejo
// até meia parede e reboco ocre em cima, piso xadrez, engradados, balcão com
// garrafas, porta aberta para a rua. Tudo é primitiva + textura de canvas —
// nada baixado — e cabe em celular: materiais e geometrias compartilhados,
// o que se repete (garrafa, engradado, perna) é InstancedMesh.
const mat=(color,roughness=.8,extra={})=>new T.MeshStandardMaterial({color,roughness,...extra});
const basico=(extra)=>new T.MeshBasicMaterial(extra);
const CUBO=new T.BoxGeometry(1,1,1),_o=new T.Object3D();
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;}
function repete(t,x,y=1){t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(x,y);return t;}
// Grão determinístico: é o que tira a cara de plástico liso das superfícies.
function chuvisco(c,w,h,forca,semente=7){const img=c.getImageData(0,0,w,h),d=img.data;let s=semente;for(let i=0;i<d.length;i+=4){s=(s*1664525+1013904223)>>>0;const v=(s/4294967296-.5)*2*forca;d[i]+=v;d[i+1]+=v;d[i+2]+=v;}c.putImageData(img,0,0);}
// Caixa com geometria compartilhada (escala faz o tamanho). Só o que está perto da mesa projeta sombra: o mapa é um só.
function caixa(g,w,h,d,x,y,z,m,sombra=false){const o=new T.Mesh(CUBO,m);o.scale.set(w,h,d);o.position.set(x,y,z);o.castShadow=sombra;o.receiveShadow=true;g.add(o);return o;}
// Plano com recorte de UV opcional [u0,u1,v0,v1]: as paredes usam UMA textura, cada pedaço lendo a sua fatia.
function plano(g,w,h,m,x,y,z,ry=0,rx=0,uv){const geo=new T.PlaneGeometry(w,h);if(uv){const a=geo.attributes.uv;for(let i=0;i<a.count;i++)a.setXY(i,uv[0]+a.getX(i)*(uv[1]-uv[0]),uv[2]+a.getY(i)*(uv[3]-uv[2]));}
  const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.rotation.set(rx,ry,0);o.receiveShadow=true;g.add(o);return o;}
// Muitas cópias de uma forma num só desenho: {x,y,z,rx,ry,rz,s:[w,h,d],cor}.
function instancias(geo,m,lista){const im=new T.InstancedMesh(geo,m,lista.length),cor=new T.Color();lista.forEach((it,i)=>{_o.position.set(it.x,it.y,it.z);_o.rotation.set(it.rx||0,it.ry||0,it.rz||0);it.s?_o.scale.set(...it.s):_o.scale.setScalar(1);_o.updateMatrix();im.setMatrixAt(i,_o.matrix);im.setColorAt(i,cor.set(it.cor??0xffffff));});im.receiveShadow=true;return im;}

// ---------------------------------------------------------------------------
// Texturas
// ---------------------------------------------------------------------------
export function texturaMadeira(rep=1){const t=canvasTex(512,128,(c,w,h)=>{c.fillStyle='#6a4223';c.fillRect(0,0,w,h);const tons=['#4d2c15','#7c4d2a','#3e2411','#8a5a32','#5e3a1e'];c.globalAlpha=.55;
  // veios periódicos em w: a textura repete sem emenda
  for(let k=0;k<30;k++){c.strokeStyle=tons[k%5];c.lineWidth=1.5+(k%3);c.beginPath();for(let x=0;x<=w;x+=8){const y=k*4.3+Math.sin(x/w*Math.PI*6+k*1.7)*3+Math.sin(x/w*Math.PI*22+k)*1.2;x?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
  c.globalAlpha=1;chuvisco(c,w,h,7,2);});return repete(t,rep,1);}
// Feltro VERDE: identidade do jogo. Gradiente radial (mais claro sob a lâmpada) + trama fina + grão.
export function texturaFeltro(){return canvasTex(512,512,(c,w,h)=>{const gr=c.createRadialGradient(256,236,40,256,256,270);gr.addColorStop(0,'#2d7250');gr.addColorStop(.6,'#1f5a3d');gr.addColorStop(1,'#123a28');c.fillStyle=gr;c.fillRect(0,0,w,h);
  c.lineWidth=1;for(const [cor,dir] of [['rgba(255,255,255,.04)',1],['rgba(0,0,0,.06)',-1]]){c.strokeStyle=cor;for(let i=-w;i<2*w;i+=5){c.beginPath();c.moveTo(i,0);c.lineTo(i+dir*w,h);c.stroke();}}chuvisco(c,w,h,12,3);});}
// Parede inteira numa textura de 1,2 m x 3,2 m: azulejo 15 cm até 1,2 m, faixa decorativa, reboco ocre acima.
function texturaParede(){return canvasTex(512,1024,(c,w,h)=>{
  // Reboco CLARO em cima e azulejo VERDE embaixo — era ocre saturado com
  // azulejo creme, e é essa a diferença que fazia a sala não parecer a
  // referência: no boteco de esquina a parede é caiada, e quem dá a cor é a
  // lâmpada batendo nela. Parede já colorida some debaixo da luz âmbar e não
  // sobra contraste para a placa preta nem para a lousa.
  const gr=c.createLinearGradient(0,0,0,608);gr.addColorStop(0,'#d9cfba');gr.addColorStop(1,'#efe7d6');c.fillStyle=gr;c.fillRect(0,0,w,608);
  // manchas de caiação: parede caiada nunca é lisa
  c.globalAlpha=.5;for(let i=0;i<90;i++){const x=(i*137)%w,y=(i*271)%608,r=18+((i*53)%60);c.fillStyle=i%2?'#e7dfcd':'#cfc5ae';c.beginPath();c.ellipse(x,y,r,r*.5,i,0,7);c.fill();}c.globalAlpha=1;
  // a faixa decorativa entre o reboco e o azulejo
  c.fillStyle='#1f5f57';c.fillRect(0,606,w,36);c.fillStyle='#e8c66a';for(let x=32;x<w;x+=64){c.beginPath();c.moveTo(x,610);c.lineTo(x+12,624);c.lineTo(x,638);c.lineTo(x-12,624);c.closePath();c.fill();}
  c.fillStyle='#134940';c.fillRect(0,642,w,h-642);
  for(let y=642;y<h;y+=48)for(let x=0;x<w;x+=64){const v=((x/64*5+(y-642)/48*3)%7)/7;c.fillStyle=`hsl(${168+v*8},${34+v*10}%,${30+v*7}%)`;c.fillRect(x+2,y+2,60,44);c.fillStyle='rgba(255,255,255,.16)';c.fillRect(x+2,y+2,60,3);c.fillStyle='rgba(0,0,0,.18)';c.fillRect(x+2,y+42,60,4);}
  const suj=c.createLinearGradient(0,h-60,0,h);suj.addColorStop(0,'rgba(60,40,20,0)');suj.addColorStop(1,'rgba(60,40,20,.35)');c.fillStyle=suj;c.fillRect(0,h-60,w,60);chuvisco(c,w,h,6,5);});}
// Ladrilho xadrez 30 cm: creme e terracota, cada um com o seu tom, rejunte escuro.
function texturaPiso(){return canvasTex(512,512,(c,w,h)=>{c.fillStyle='#8c7454';c.fillRect(0,0,w,h);for(let y=0;y<4;y++)for(let x=0;x<4;x++){const v=((x*5+y*3)%7)/7;c.fillStyle=(x+y)%2?`hsl(18,${50+v*8}%,${44+v*6}%)`:`hsl(38,${40+v*10}%,${80+v*6}%)`;c.fillRect(x*128+3,y*128+3,122,122);}chuvisco(c,w,h,7,3);});}
// Engradado: base branca (a cor vem por instância) com as aberturas escuras da grade.
function texturaEngradado(){return canvasTex(256,256,(c,w,h)=>{c.fillStyle='#f0f0f0';c.fillRect(0,0,w,h);c.fillStyle='rgba(0,0,0,.18)';c.fillRect(0,0,w,14);c.fillRect(0,h-14,w,14);
  for(let i=0;i<5;i++)for(let j=0;j<2;j++){c.fillStyle='#2a2521';c.fillRect(14+i*47,30+j*100,36,74);c.fillStyle='rgba(255,255,255,.22)';c.fillRect(14+i*47,30+j*100,36,6);}});}
// A rua pela porta: céu de fim de tarde, fachada pêssego da casa em frente, calçada. Sem luz (MeshBasic): é o "estourado" de fora.
function texturaRua(){return canvasTex(512,512,(c,w,h)=>{
  // Fim de tarde AZUL, e não pôr do sol laranja. É o contraste que a
  // referência tem e que a sala não tinha: dentro é lâmpada âmbar, fora é a
  // hora azul. Com a rua laranja, dentro e fora viravam a mesma cor e a porta
  // deixava de ser porta — virava um retângulo mais claro na parede.
  const ceu=c.createLinearGradient(0,0,0,220);ceu.addColorStop(0,'#4a5b85');ceu.addColorStop(.55,'#7d7fa0');ceu.addColorStop(1,'#d99a76');c.fillStyle=ceu;c.fillRect(0,0,w,220);
  c.fillStyle='#8a6b58';c.fillRect(0,150,w,300);c.fillStyle='#6d5344';c.fillRect(0,150,w,14);
  // janelas acesas: os únicos pontos quentes lá fora
  c.fillStyle='#2c3346';for(const x of [60,340])c.fillRect(x,210,110,140);c.fillStyle='#1c2333';c.fillRect(215,240,80,210);
  c.fillStyle='#f5c274';for(const [x,y] of [[76,232],[112,232],[356,236],[392,268],[232,262],[262,300]])c.fillRect(x,y,26,30);
  // poste com a luz acesa, que é o que dá escala à rua
  c.fillStyle='#20242e';c.fillRect(462,150,8,270);c.fillStyle='#ffd9a0';c.beginPath();c.arc(466,158,16,0,7);c.fill();
  c.fillStyle='#8f8578';c.fillRect(0,450,w,62);c.fillStyle='#6f6659';c.fillRect(0,504,w,8);
  // O dizer da casa pintado na fachada de frente: é a primeira coisa que se lê
  // pela porta, e amarra o boteco à rua em vez de deixá-la só de pano de fundo.
  c.fillStyle='#e4cba6';c.textAlign='center';c.textBaseline='middle';c.font='700 26px Georgia, serif';
  ['BOA COMPANHIA','SEMPRE CABE','MAIS UMA'].forEach((t,i)=>c.fillText(t,w/2,372+i*30));
  chuvisco(c,w,h,6,9);});}
function texturaVeneziana(){return canvasTex(128,256,(c,w,h)=>{c.fillStyle='#5a3a1e';c.fillRect(0,0,w,h);for(let y=8;y<h-8;y+=20){const gr=c.createLinearGradient(0,y,0,y+14);gr.addColorStop(0,'#fff0c8');gr.addColorStop(1,'#f7b862');c.fillStyle=gr;c.fillRect(8,y,w-16,14);}});}
// A espada da casa. É o MESMO contorno do naipe do baralho (o `#naipe-0` do
// index.html), escrito como Path2D: a marca do boteco e a carta na mão têm de
// ser a mesma espada, senão são duas casas.
const ESPADA=new Path2D('M50 10 C 82 34, 88 50, 88 62 C 88 74, 79 81, 70 81 C 61 81, 54 74, 50 65 C 46 74, 39 81, 30 81 C 21 81, 12 74, 12 62 C 12 50, 18 34, 50 10 Z');
const ESPADA_PE=new Path2D('M44 63 h12 c0 15, 3 24, 8 29 h-28 c5 -5, 8 -14, 8 -29 z');
function espada(c,x,y,s,cor){c.save();c.translate(x,y);c.scale(s/100,s/100);c.fillStyle=cor;c.fill(ESPADA);c.fill(ESPADA_PE);c.restore();}

// A lousa da calçada: "AQUI TEM" e a lista do que a casa promete. Giz é traço
// irregular, então o texto sai com uma leve inclinação por linha — lousa com
// texto alinhado a régua lê como cartaz impresso, não como giz.
function texturaLousa(){return canvasTex(400,540,(c,w,h)=>{c.fillStyle='#1e2420';c.fillRect(0,0,w,h);
  c.strokeStyle='#6b4a2a';c.lineWidth=22;c.strokeRect(11,11,w-22,h-22);
  c.globalAlpha=.06;for(let i=0;i<70;i++){c.strokeStyle='#fff';c.lineWidth=1;c.beginPath();const y=Math.random()*h;c.moveTo(0,y);c.lineTo(w,y+(Math.random()-.5)*20);c.stroke();}c.globalAlpha=1;
  c.fillStyle='#f3ecd8';c.textAlign='left';c.textBaseline='middle';
  c.font='700 46px Georgia, serif';c.fillText('AQUI',46,86);c.fillText('TEM:',46,138);
  c.font='600 30px Georgia, serif';
  [['BOA RESENHA',210],['BOA CERVEJA',262],['BOAS CARTAS',314],['MELHORES',366],['AMIGOS',410]].forEach(([t,y],i)=>{
    c.save();c.translate(56,y);c.rotate((i%2?-1:1)*.012);
    if(t!=='AMIGOS'){c.beginPath();c.arc(-8,-8,4.5,0,7);c.fill();}
    c.fillText(t,10,-8);c.restore();});
  espada(c,168,442,66,'#f3ecd8');chuvisco(c,w,h,5,11);});}

// O texto pintado direto no reboco: sem moldura, sem fundo — é tinta na
// parede, e por isso a textura é transparente e a "tinta" tem falha.
function texturaPintadaParede(){return canvasTex(300,420,(c,w,h)=>{c.clearRect(0,0,w,h);
  c.fillStyle='#efe4cc';c.textAlign='left';c.textBaseline='middle';c.font='700 52px Georgia, serif';
  ['JOGO','CERVEJA','RESENHA','SEMPRE'].forEach((t,i)=>{const y=58+i*98;
    c.beginPath();c.arc(26,y,7,0,7);c.fill();c.save();c.translate(0,0);c.rotate(.008*(i%2?-1:1));c.fillText(t,50,y);c.restore();});
  // a falha da tinta: pinceladas claras raspadas por cima
  c.globalCompositeOperation='destination-out';for(let i=0;i<180;i++){c.globalAlpha=.06+Math.random()*.1;c.fillRect(Math.random()*w,Math.random()*h,2+Math.random()*9,1.5);}
  c.globalAlpha=1;c.globalCompositeOperation='source-over';});}

// A placa esmaltada da casa: espada grande, o nome embaixo. Preta e sem brilho,
// que é o contraponto escuro numa parede toda ocre.
function texturaPlaca(){return canvasTex(300,380,(c,w,h)=>{c.fillStyle='#171412';c.fillRect(0,0,w,h);
  c.strokeStyle='#efe4cc';c.lineWidth=6;c.strokeRect(16,16,w-32,h-32);
  c.fillStyle='#efe4cc';c.textAlign='center';c.font='700 40px Georgia, serif';c.textBaseline='middle';
  c.fillText('CAÇAMBA',w/2,66);
  espada(c,86,110,128,'#efe4cc');
  c.font='600 22px Georgia, serif';c.fillText('CERVEJA',w/2,320);chuvisco(c,w,h,4,13);});}

function texturaCartaz(fundo,linhas,corTexto='#f7eed8'){return canvasTex(256,340,(c,w,h)=>{c.fillStyle=fundo;c.fillRect(0,0,w,h);c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=10;c.strokeRect(5,5,w-10,h-10);c.fillStyle=corTexto;c.textAlign='center';c.textBaseline='middle';
  for(const [t,tam,dy] of linhas){c.font=`900 ${tam}px Nunito, sans-serif`;c.fillText(t,128,dy);}});}
function texturaRelogio(){return canvasTex(256,256,(c)=>{c.fillStyle='#2a2522';c.beginPath();c.arc(128,128,124,0,7);c.fill();c.fillStyle='#f4ecd8';c.beginPath();c.arc(128,128,108,0,7);c.fill();c.strokeStyle='#2a2522';c.lineWidth=5;
  const raio=(a,r0,r1)=>{c.beginPath();c.moveTo(128+Math.cos(a)*r0,128+Math.sin(a)*r0);c.lineTo(128+Math.cos(a)*r1,128+Math.sin(a)*r1);c.stroke();};for(let i=0;i<12;i++)raio(i*Math.PI/6,92,104);
  c.lineWidth=8;raio(-Math.PI/2+(17+40/60)/12*Math.PI*2,0,58);raio(-Math.PI/2+40/60*Math.PI*2,0,88);});} // 17h40: fim de tarde
function texturaTela(){return canvasTex(256,160,(c,w,h)=>{const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#3f9a4a');gr.addColorStop(1,'#2c7a36');c.fillStyle=gr;c.fillRect(0,0,w,h);c.strokeStyle='rgba(255,255,255,.8)';c.lineWidth=3;c.strokeRect(8,8,240,144);
  c.beginPath();c.moveTo(128,8);c.lineTo(128,152);c.stroke();c.beginPath();c.arc(128,80,26,0,7);c.stroke();c.fillStyle='#e8e8e8';c.beginPath();c.arc(150,96,4,0,7);c.fill();});}

// ---------------------------------------------------------------------------
// Luz: sol de fim de tarde + céu quente + a lâmpada da mesa (a única que projeta sombra)
// ---------------------------------------------------------------------------
export function iluminaSala(scene,renderer,{centro=new T.Vector3(),compacto=false}={}){
  // Fundo e neblina da mesma família âmbar: o longe derrete em dourado, não em cinza.
  scene.background=new T.Color(0xd9955a);scene.fog=new T.Fog(0xd9955a,5,19);
  // A luz do salão passa a vir de DENTRO: são as lâmpadas do boteco quicando no
  // reboco caiado. Antes o grosso vinha de um "sol" laranja de fim de tarde —
  // o que fazia sentido com um céu laranja, e deixou de fazer quando a rua
  // virou hora azul. Céu azul com facho laranja no chão é a incoerência que
  // denuncia cenário montado.
  scene.add(new T.HemisphereLight(0xffcf9a,0x7a4a28,.95));
  // O que entra da rua agora é FRIO e fraco, pela frente-esquerda: é o
  // contraluz azulado que recorta os ombros de quem senta, e o contraste dele
  // com o âmbar de dentro é o que dá a hora do dia.
  const rua=new T.DirectionalLight(0xa8bce0,.5);rua.position.copy(centro).add(new T.Vector3(-4,4.5,4));rua.target.position.copy(centro);scene.add(rua,rua.target);
  // E uma lâmpada de teto quente atrás do balcão, para a parede do fundo não
  // apagar sem o antigo sol.
  const salao=new T.DirectionalLight(0xffc07a,.75);salao.position.copy(centro).add(new T.Vector3(1.5,4,-2));salao.target.position.copy(centro);scene.add(salao,salao.target);
  // Um palmo fora do eixo: a pino, o que encosta no tampo não projetava nada.
  const foco=new T.SpotLight(0xffd28c,30,12,.8,.7,2);foco.position.copy(centro).add(new T.Vector3(.3,3.05,.45));foco.target.position.copy(centro).setY(MESA.altura);
  foco.castShadow=true;const n=compacto?1024:2048;foco.shadow.mapSize.set(n,n);foco.shadow.bias=-.0004;foco.shadow.normalBias=.02;foco.shadow.camera.near=1;foco.shadow.camera.far=14;scene.add(foco,foco.target);
  // Ambiente PMREM de uma salinha ocre com uma porta de luz: reflexo quente no verniz, no vidro e no azulejo.
  const pm=new T.PMREMGenerator(renderer),amb=new T.Scene();amb.background=new T.Color(0xb8763c);
  const salinha=new T.Mesh(new T.BoxGeometry(12,6,12),basico({color:0xa8653a,side:T.BackSide}));salinha.position.y=3;amb.add(salinha);
  const porta=new T.Mesh(new T.PlaneGeometry(2.4,3),basico({color:0xffe2b0}));porta.position.set(-5.9,1.8,2);porta.rotation.y=Math.PI/2;amb.add(porta);
  const teto=new T.Mesh(new T.PlaneGeometry(3,1),basico({color:0xfff0d0}));teto.position.set(0,5.9,-1);teto.rotation.x=Math.PI/2;amb.add(teto);
  scene.environment=pm.fromScene(amb,.04).texture;scene.environmentIntensity=.5;
  amb.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pm.dispose();
  return foco;
}

// ---------------------------------------------------------------------------
// A mesa: tampo com feltro verde, aro de madeira envernizada, pé de ferro
// ---------------------------------------------------------------------------
export function criaMesa(){const g=new T.Group(),madeira=mat(0xffffff,.42,{map:texturaMadeira(5)}),ferro=mat(0x2e2a26,.55,{metalness:.3});
  const tampo=new T.Mesh(new T.CylinderGeometry(MESA.raio,MESA.raio,.075,64),[madeira,mat(0xffffff,.95,{map:texturaFeltro()}),madeira]);tampo.position.y=MESA.altura-.0375;tampo.receiveShadow=tampo.castShadow=true;g.add(tampo);
  const aro=new T.Mesh(new T.TorusGeometry(MESA.raio+.025,.04,12,64),madeira);aro.rotation.x=Math.PI/2;aro.position.y=MESA.altura-.01;aro.castShadow=true;g.add(aro);
  const friso=new T.Mesh(new T.TorusGeometry(MESA.raio-.028,.003,6,64),mat(0xd2b070,.4,{metalness:.5}));friso.rotation.x=Math.PI/2;friso.position.y=MESA.altura+.001;g.add(friso);
  const pe=new T.Mesh(new T.CylinderGeometry(.15,.24,.68,16),ferro);pe.position.y=.34;g.add(pe);
  for(const a of [0,Math.PI/2])caixa(g,.72,.06,.1,0,.03,0,ferro).rotation.y=a;
  return g;}

// ---------------------------------------------------------------------------
// O salão. A câmera senta à mesa olhando para -Z: o que pesa é a parede do
// fundo (z=-6), em pé só se vê |x|<2,7 dela — porta, geladeiras, TV e balcão
// ficam nessa faixa; sinuca, janela, cadeiras e cantos são bônus de paisagem.
// ---------------------------------------------------------------------------
export function criaSala(){const g=new T.Group();
  const madeira=mat(0xffffff,.45,{map:texturaMadeira(3)}),madeiraEscura=mat(0x4a2e1a,.6),ferro=mat(0x2b2724,.5,{metalness:.35}),cromo=mat(0xd8d8d8,.3,{metalness:.7});
  const tinta=(c)=>mat(c,.35,{metalness:.3}),plastico=(c)=>mat(c,.5),branco=plastico(0xf2eee4),amarelo=plastico(0xe8b62a);
  const vidro=mat(0xd8ecff,.05,{metalness:.1,transparent:true,opacity:.25,depthWrite:false});
  // --- casca: piso, paredes (com o vão da porta), teto ---
  plano(g,10,9,mat(0xffffff,.45,{map:repete(texturaPiso(),10/1.2,9/1.2)}),0,0,-1.5,0,-Math.PI/2);
  const azulejo=mat(0xffffff,.5,{map:repete(texturaParede(),1,1)});
  const parede=(w,h,x,y,z,ry,u0,v0)=>plano(g,w,h,azulejo,x,y,z,ry,0,[u0/1.2,(u0+w)/1.2,v0/3.2,(v0+h)/3.2]);
  parede(2.35,3.2,-3.825,1.6,-6,0,0,0);parede(1,1.1,-2.15,2.65,-6,0,2.35,2.1);parede(6.65,3.2,1.675,1.6,-6,0,3.35,0);
  parede(9,3.2,-5,1.6,-1.5,Math.PI/2,0,0);parede(9,3.2,5,1.6,-1.5,-Math.PI/2,0,0);
  plano(g,10,9,mat(0xd6ad78,.95),0,3.2,-1.5,0,Math.PI/2);
  // --- porta aberta para a rua: vão de verdade na parede, calçada e fachada atrás, folha verde aberta para dentro ---
  plano(g,4.2,3.2,basico({map:texturaRua()}),-2.15,1.6,-8.2);
  plano(g,3,2.3,basico({color:0xe4c08a}),-2.15,0,-7.15,0,-Math.PI/2);
  for(const [w,h,x,y] of [[.08,2.14,-2.69,1.07],[.08,2.14,-1.61,1.07],[1.16,.08,-2.15,2.14]])caixa(g,w,h,.2,x,y,-6,madeiraEscura);
  caixa(g,1.1,.03,.24,-2.15,.015,-6,mat(0x6e6a62,.6));
  const folha=new T.Group();folha.position.set(-2.66,0,-5.9);folha.rotation.y=-1.75;g.add(folha);caixa(folha,.98,2.08,.04,.49,1.04,0,tinta(0x2f6b4f));
  // A mancha de sol no piso, entrando pela porta: um gradiente aditivo, mais barato que uma luz.
  // A mancha da rua no piso: azulada e discreta, como a luz que ela virou.
  const luzPorta=canvasTex(128,128,(c,w,h)=>{const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(150,178,226,.75)');gr.addColorStop(1,'rgba(150,178,226,0)');c.fillStyle=gr;c.fillRect(0,0,w,h);});
  plano(g,1.15,2.2,basico({map:luzPorta,transparent:true,blending:T.AdditiveBlending,depthWrite:false,opacity:.45,fog:false}),-2.15,.006,-4.9,0,-Math.PI/2);
  // --- engradados vermelhos e amarelos, empilhados nos dois cantos do fundo ---
  const pilhas=[],pilha=(x,z,n,cor,ry=0)=>{for(let i=0;i<n;i++)pilhas.push({x,y:.15+i*.3,z,ry:ry+(i%2)*.06,cor});};
  pilha(-4.72,-5.72,4,0xd23a22);pilha(-4.18,-5.72,3,0xe9b722,.05);pilha(-4.72,-5.3,2,0xe9b722,-.08);
  pilha(4.7,-5.72,4,0xe9b722);pilha(4.7,-5.3,2,0xd23a22,.07);pilha(4.15,-5.72,3,0xd23a22,-.04);
  // e duas pilhas na faixa que o celular em pé enxerga (|x|<2,7): entre a porta e a geladeira, e na ponta do balcão
  pilha(-1.75,-5.3,2,0xd23a22,.1);pilha(3.9,-5.6,3,0xe9b722,-.05);
  g.add(instancias(new T.BoxGeometry(.5,.3,.36),mat(0xffffff,.6,{map:texturaEngradado()}),pilhas));
  // --- geladeiras de bebida: corpo recuado (a cavidade), luz de dentro, moldura, prateleiras cheias, porta de vidro ---
  const CORES=[0x7a3b12,0x2f6b3a,0xd9a441,0xe8e2d0,0xb4312a,0x3f7d9c],garrafas=[],molduras=[],prateleiras=[];
  const geladeira=(x,cor)=>{const z=-5.62;caixa(g,.8,1.95,.46,x,.975,z-.12,tinta(cor));plano(g,.66,1.5,basico({color:0xfff1d2}),x,1.05,z+.115);
    for(const [w,h,dx,y] of [[.8,.32,0,1.79],[.8,.3,0,.15],[.07,1.32,-.365,.97],[.07,1.32,.365,.97]])molduras.push({s:[w,h,.24],x:x+dx,y,z:z+.12,cor});
    for(let p=0;p<4;p++){const y=.34+p*.33;prateleiras.push({x,y,z:z+.14,s:[.66,.02,.26]});for(let i=0;i<5;i++)garrafas.push({x:x-.24+i*.12,y:y+.01,z:z+.16,cor:CORES[(i+p)%6]});}
    plano(g,.68,1.34,vidro,x,.97,z+.25);};
  geladeira(-1,0xb8302a);geladeira(-.15,0xd9a72e);
  g.add(instancias(CUBO,tinta(0xffffff),molduras),instancias(CUBO,cromo,prateleiras));
  // --- balcão de madeira com prateleiras de garrafas atrás ---
  caixa(g,3,.9,.6,2,.45,-5.2,madeira);caixa(g,3.16,.07,.74,2,.935,-5.2,mat(0xffffff,.35,{map:texturaMadeira(4)}));caixa(g,2.9,.08,.55,2,.04,-5.2,ferro);
  for(const y of [1.5,1.9]){caixa(g,2.4,.04,.26,2.3,y,-5.87,madeira);for(let i=0;i<12;i++)garrafas.push({x:1.2+i*.2,y:y+.02,z:-5.87,cor:CORES[(i*5+(y>1.7?2:0))%6],s:[1,.85+((i*7)%3)*.12,1]});}
  // Uma garrafa só (torneada) para todas: vidro opaco com brilho — transparência custaria e não se veria de longe.
  const perfil=[[0,0],[.033,0],[.036,.03],[.036,.15],[.026,.18],[.012,.2],[.012,.26],[.015,.27],[0,.27]].map(([x,y])=>new T.Vector2(x,y));
  g.add(instancias(new T.LatheGeometry(perfil,10),mat(0xffffff,.18),garrafas));
  // --- TV no suporte alto, virada para a mesa ---
  const tv=new T.Group();tv.position.set(.75,2.3,-5.72);tv.rotation.set(.25,-.3,0);g.add(tv);
  caixa(tv,.62,.46,.34,0,0,0,mat(0x2a2624,.45,{metalness:.1}));plano(tv,.52,.38,basico({map:texturaTela()}),0,0,.172);caixa(g,.1,.06,.5,.75,2.0,-5.75,ferro);
  // --- cartazes (texto original, sem marcas) e relógio ---
  const cartaz=(x,y,z,ry,fundo,linhas,cor)=>plano(g,.5,.66,mat(0xffffff,.85,{map:texturaCartaz(fundo,linhas,cor)}),x,y,z,ry);
  cartaz(-.6,2.5,-5.985,0,'#9c3a30',[['CERVEJA',44,110],['GELADA',44,165],['R$ 9,99',40,250]]);
  cartaz(2.5,2.75,-5.985,0,'#3a6b45',[['PETISCOS',40,110],['porção',30,165],['R$ 15',44,250]]);
  cartaz(4.985,2.1,-3.2,-Math.PI/2,'#2f5f8f',[['SINUCA',46,120],['a ficha',30,180],['R$ 5',44,250]]); // depois da janela (que vai de z −5,35 a −3,85)
  plano(g,.42,.42,basico({map:texturaRelogio(),transparent:true}),3.9,2.55,-5.985);
  // --- a marca da casa na parede: placa esmaltada e o dizer pintado no reboco ---
  // A faixa livre da parede do fundo é estreita: o vão da porta come de x −2,69
  // a −1,61, os cartazes moram em −0,6 / 2,5 / 3,9 e a TV em 0,75. O pintado
  // entra na sobra entre o batente e o cartaz da cerveja; a placa, no vazio
  // acima do balcão.
  plano(g,.52,.73,mat(0xffffff,.92,{map:texturaPintadaParede(),transparent:true}),-1.24,2.42,-5.983);
  plano(g,.62,.78,mat(0xffffff,.7,{map:texturaPlaca()}),1.35,2.62,-5.983);

  // --- a lousa do que a casa tem, pendurada acima da porta ---
  // Ela era de cavalete, no chão ao lado da porta — e simplesmente não existia
  // para quem joga: o elenco sentado tapa o piso do meio, e em pé a tela só
  // enxerga a parede acima das cabeças. Lousa é TEXTO, e texto fora de quadro é
  // trabalho jogado fora; na parede ela é lida da cadeira.
  //
  // O lugar era do cartaz "CAÇAMBA toda sexta", que dizia a mesma coisa com
  // menos graça: a faixa visível da parede do fundo já estava cheia, e entrar
  // ali significava alguém sair.
  const lousa=new T.Group();lousa.position.set(-2.15,2.5,-5.975);g.add(lousa);
  caixa(lousa,.64,.88,.03,0,0,0,mat(0xffffff,.88,{map:texturaLousa()}));
  for(const [w,h,x,y] of [[.72,.06,0,.45],[.72,.06,0,-.45],[.06,.94,-.33,0],[.06,.94,.33,0]])caixa(lousa,w,h,.05,x,y,.015,madeiraEscura);

  // --- mesinha de plástico amarela com duas cadeiras, do outro lado do salão ---
  // O par de plástico amarelo é o que diz "boteco" antes de qualquer letreiro.
  // `amarelo` já existe lá em cima (é o dos engradados): o plástico do boteco é
  // o MESMO amarelo, senão a mesa e o engradado brigam de tom.
  const plastSombra=plastico(0xcf9d1f);
  const conjunto=(cx,cz,ry)=>{const p=new T.Group();p.position.set(cx,0,cz);p.rotation.y=ry;g.add(p);
    caixa(p,.72,.05,.72,0,.72,0,amarelo);
    for(const [dx,dz] of [[-.3,-.3],[.3,-.3],[-.3,.3],[.3,.3]])caixa(p,.05,.72,.05,dx,.36,dz,plastSombra);
    for(const [sx,sz,sr] of [[0,.62,Math.PI],[-.66,-.06,Math.PI/2]]){const cad=new T.Group();cad.position.set(sx,0,sz);cad.rotation.y=sr;p.add(cad);
      caixa(cad,.42,.05,.4,0,.44,0,amarelo);
      caixa(cad,.42,.42,.05,0,.66,-.18,amarelo);
      for(const [dx,dz] of [[-.17,-.16],[.17,-.16],[-.17,.16],[.17,.16]])caixa(cad,.04,.44,.04,dx,.22,dz,plastSombra);}};
  conjunto(2.42,-4.02,-.55);

  // --- espada-de-são-jorge no vaso de barro, ao lado da porta ---
  const vaso=new T.Mesh(new T.CylinderGeometry(.16,.12,.3,14),mat(0xb5613a,.9));vaso.position.set(-3.05,.15,-5.55);g.add(vaso);
  g.add(instancias(new T.ConeGeometry(.055,.8,4),mat(0xffffff,.7),[...Array(9)].map((_,i)=>({x:-3.05+Math.cos(i*2.3)*.07,y:.66,z:-5.55+Math.sin(i*2.3)*.07,ry:i*.7,rx:Math.sin(i*1.3)*.22,rz:Math.cos(i*2.1)*.22,s:[1,.8+(i%3)*.15,.28],cor:[0x3f7a3a,0x5f9a44,0x2f6a30][i%3]}))));
  // --- sinuca ao fundo à direita, tacos na parede ---
  const sinuca=new T.Group();sinuca.position.set(3.4,0,-3.6);sinuca.rotation.y=.12;g.add(sinuca);
  caixa(sinuca,2,.12,1.1,0,.8,0,mat(0xc8f0d0,.95,{map:texturaFeltro()}));caixa(sinuca,2.16,.14,1.26,0,.72,0,madeira);
  sinuca.add(instancias(CUBO,madeiraEscura,[[-.95,-.5],[.95,-.5],[-.95,.5],[.95,.5]].map(([x,z])=>({x,y:.33,z,s:[.12,.66,.12]}))));
  sinuca.add(instancias(new T.SphereGeometry(.03,10,8),mat(0xffffff,.15),[0xf2e6c8,0xc23a2a,0x2a4fb4,0xd9a441,0x1c1c1c,0x2f7d3a].map((cor,i)=>({x:-.55+i*.22,y:.89,z:(i%2)*.3-.15,cor}))));
  g.add(instancias(new T.CylinderGeometry(.008,.014,1.45,6),madeira,[0,1,2].map(i=>({x:4.91,y:.72,z:-3.75+i*.1,rz:-.09})))); // entre a janela e o cartaz
  // --- janela com veneziana na parede direita: luz forte entre as réguas ---
  caixa(g,.06,1.3,1.5,4.97,1.9,-4.6,madeiraEscura);plano(g,1.38,1.18,basico({map:texturaVeneziana()}),4.93,1.9,-4.6,-Math.PI/2);
  // --- cadeiras de plástico encostadas e uma mesinha de plástico; as pernas de tudo num só desenho ---
  const pernas=[],cadeira=(x,z,ry,m,cor)=>{const c=new T.Group();c.position.set(x,0,z);c.rotation.y=ry;g.add(c);caixa(c,.44,.04,.44,0,.44,0,m);caixa(c,.44,.44,.04,0,.68,-.2,m);
    for(const [dx,dz] of [[-.19,-.19],[.19,-.19],[-.19,.19],[.19,.19]])pernas.push({x:x+dx*Math.cos(ry)+dz*Math.sin(ry),y:.22,z:z-dx*Math.sin(ry)+dz*Math.cos(ry),cor});};
  cadeira(4.7,-2.3,-Math.PI/2,branco,0xf2eee4);cadeira(4.7,-1.65,-Math.PI/2,amarelo,0xe8b62a);cadeira(-3.6,-5.55,0,amarelo,0xe8b62a);cadeira(-4.6,-4.1,Math.PI/2,branco,0xf2eee4);cadeira(-3.6,-4.1,-Math.PI/2,branco,0xf2eee4);
  const mesinha=new T.Mesh(new T.CylinderGeometry(.4,.4,.035,24),branco);mesinha.position.set(-4.1,.72,-4.1);mesinha.receiveShadow=true;g.add(mesinha);
  for(const [dx,dz] of [[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]])pernas.push({x:-4.1+dx,y:.35,z:-4.1+dz,s:[1,1.6,1],cor:0xf2eee4});
  g.add(instancias(new T.CylinderGeometry(.02,.02,.44,6),plastico(0xffffff),pernas));
  // --- ventilador de teto sobre os adversários e os pendentes (o da mesa é onde mora o foco) ---
  const vent=new T.Group();vent.position.set(.3,3.2,-3.5);g.add(vent);caixa(vent,.03,.3,.03,0,-.15,0,ferro);
  const motor=new T.Mesh(new T.CylinderGeometry(.09,.1,.12,16),ferro);motor.position.y=-.34;vent.add(motor);
  vent.add(instancias(CUBO,plastico(0xe8dcc0),[0,1,2,3].map(i=>({x:Math.cos(i*Math.PI/2)*.32,y:-.38,z:Math.sin(i*Math.PI/2)*.32,ry:-i*Math.PI/2,s:[.5,.012,.11]}))));
  const cupulaMat=(cor)=>mat(cor,.55,{side:T.DoubleSide,emissive:0x4a3416}); // por dentro a cúpula lê acesa
  const pendente=(x,y,z,cor)=>{caixa(g,.012,3.2-y-.22,.012,x,(3.2+y+.22)/2,z,ferro);const cupula=new T.Mesh(new T.ConeGeometry(.26,.22,24,1,true),cupulaMat(cor));cupula.position.set(x,y+.11,z);g.add(cupula);
    const bulbo=new T.Mesh(new T.SphereGeometry(.05,10,8),basico({color:0xffe6b8}));bulbo.position.set(x,y,z);g.add(bulbo);};
  pendente(.3,2.62,.45,0x2f6b4f);pendente(3.4,2.3,-3.6,0xb04a2a);
  return g;}
