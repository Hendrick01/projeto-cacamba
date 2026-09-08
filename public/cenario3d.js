import * as T from './vendor/three.module.js';
import {MESA} from './interacao3d.js';
// A SALA DE JANTAR DE CASA — que é onde este jogo é jogado de verdade.
//
// Referência: as fotos da casa do dono do jogo. Azulejo branco quadriculado do
// chão ao teto, piso claro, cristaleira com os copos, buffet, geladeira preta,
// bambu e limoeiro nos vasos, a porta de moldura arredondada para o corredor
// escuro, e a janela grande de caixilho de madeira por onde entra o dia.
//
// Isto SUBSTITUIU o boteco de esquina (azulejo até meia parede, balcão,
// engradados, sinuca, hora azul na porta) — e com ele foi o feltro verde da
// mesa, que a documentação chamava de identidade. A mesa passou a ser a de
// casa: tampo de madeira e pernas palito. Se um dia o boteco voltar, ele está
// inteiro no histórico, no commit anterior a este.
//
// Tudo é primitiva + textura de canvas — nada baixado — e cabe em celular:
// materiais e geometrias compartilhados, o que se repete é InstancedMesh.
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
// O tampo da mesa de casa: madeira clara e morna, com o veio correndo no
// comprimento e um clareado no meio, que é a luz de cima batendo no verniz.
export function texturaTampo(){return canvasTex(512,512,(c,w,h)=>{
  c.fillStyle='#a97c47';c.fillRect(0,0,w,h);
  // Veio FINO e de baixo contraste. A primeira versão tinha 44 linhas de 2 a 5
  // px com meia opacidade: de perto virava veludo cotelê, porque num tampo de
  // 2,3 m de diâmetro cada linha dessas mede um centímetro e meio.
  const tons=['#9d7040','#b58a56','#94683a','#c09a6a'];
  c.globalAlpha=.22;
  for(let k=0;k<120;k++){c.strokeStyle=tons[k%4];c.lineWidth=.8+(k%3)*.5;c.beginPath();
    for(let x=0;x<=w;x+=8){const y=k*4.3+Math.sin(x/w*Math.PI*2+k*1.7)*6+Math.sin(x/w*Math.PI*13+k)*1.4;x?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}
  c.globalAlpha=1;
  const gr=c.createRadialGradient(256,236,30,256,256,300);
  gr.addColorStop(0,'rgba(255,238,206,.22)');gr.addColorStop(.62,'rgba(255,232,196,.06)');gr.addColorStop(1,'rgba(58,32,10,.28)');
  c.fillStyle=gr;c.fillRect(0,0,w,h);chuvisco(c,w,h,7,3);});}
// Parede inteira numa textura de 1,2 m x 3,2 m: azulejo 15 cm até 1,2 m, faixa decorativa, reboco ocre acima.
// ---------------------------------------------------------------------------
// Texturas da casa
// ---------------------------------------------------------------------------

// O azulejo da parede: quadrado de 20 cm, branco, com o miolo cinza nublado e
// o rejunte escuro. É ele que dá a casa — parede lisa viraria estúdio.
function texturaAzulejo(){return canvasTex(256,256,(c,w,h)=>{
  c.fillStyle='#31342f';c.fillRect(0,0,w,h);
  c.fillStyle='#eceee9';c.fillRect(4,4,w-8,h-8);
  // o miolo nublado: manchas cinzas de raio variado, sempre as mesmas
  c.save();c.beginPath();c.rect(38,38,180,180);c.clip();
  c.fillStyle='#dcdedb';c.fillRect(38,38,180,180);
  // `>>>` e não `>>`: a semente é um inteiro de 32 bits SEM sinal, e o
  // deslocamento com sinal a jogava para negativo — o raio saía -25 e o canvas
  // recusava a elipse, derrubando a sala inteira na primeira pintura.
  let s=17;for(let i=0;i<26;i++){s=(s*1103515245+12345)>>>0;const x=38+(s%180),y=38+((s>>>7)%180),r=16+((s>>>13)%42);
    c.fillStyle=i%2?'rgba(176,180,175,.55)':'rgba(238,240,236,.6)';c.beginPath();c.ellipse(x,y,r,r*.72,i,0,7);c.fill();}
  c.restore();
  c.strokeStyle='rgba(150,154,148,.5)';c.lineWidth=2;c.strokeRect(38,38,180,180);
  c.fillStyle='rgba(255,255,255,.5)';c.fillRect(4,4,w-8,3);chuvisco(c,w,h,4,5);});}

// O piso: lajota grande e clara, rejunte fino. Reflete a janela, então é o que
// mais clareia a sala por baixo.
function texturaPisoCasa(){return canvasTex(512,512,(c,w,h)=>{
  c.fillStyle='#cfcdc6';c.fillRect(0,0,w,h);
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){const v=((x*5+y*3)%7)/7;
    c.fillStyle=`hsl(40,${5+v*5}%,${88+v*4}%)`;c.fillRect(x*256+3,y*256+3,250,250);
    c.fillStyle='rgba(255,255,255,.5)';c.fillRect(x*256+3,y*256+3,250,6);}
  chuvisco(c,w,h,5,3);});}

// O que se vê pela porta de moldura arredondada: o corredor no escuro, com o
// móvel do fundo pegando um resto de luz. Escuro de propósito — é o contraponto
// da sala clara, e é o que dá profundidade à parede.
function texturaCorredor(){return canvasTex(256,512,(c,w,h)=>{
  const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#1a1418');gr.addColorStop(.7,'#2a2026');gr.addColorStop(1,'#3a3038');
  c.fillStyle=gr;c.fillRect(0,0,w,h);
  c.fillStyle='#4a2c38';c.fillRect(40,250,180,120);          // a penteadeira
  c.fillStyle='#6b4a56';c.fillRect(52,262,156,10);
  c.fillStyle='#c9bcc4';c.fillRect(96,150,72,96);            // o espelho
  c.fillStyle='#241c22';c.fillRect(60,300,44,52);
  c.fillStyle='#8a7a84';for(let i=0;i<7;i++)c.fillRect(52+i*22,206,12,26);  // frascos
  c.fillStyle='#d8d2d6';c.fillRect(0,430,w,82);              // a lajota do corredor
  chuvisco(c,w,h,6,9);});}

// O dia pela janela: o quintal estourado de luz. Sem sombreamento (MeshBasic),
// que é como o olho vê uma janela vista de dentro.
function texturaQuintal(){return canvasTex(256,256,(c,w,h)=>{
  // Fim de tarde: o quintal pega o dourado baixo e as folhas ficam contra a
  // luz. É esta janela que dá a hora da sala — a lâmpada da mesa faz o resto.
  const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#ffe3ac');gr.addColorStop(.5,'#f6c887');gr.addColorStop(1,'#c79a68');
  c.fillStyle=gr;c.fillRect(0,0,w,h);
  c.fillStyle='#7d8a5e';for(let i=0;i<9;i++)c.fillRect(12+i*28,150+((i*37)%40),22,110);
  c.fillStyle='#a89268';c.fillRect(0,214,w,42);chuvisco(c,w,h,5,4);});}

// O quadrinho dos talheres: garfo, colher e faca em branco sobre madeira. É o
// detalhe que diz "sala de jantar" e não "sala de estar".
function texturaTalheres(){return canvasTex(200,240,(c,w,h)=>{
  c.fillStyle='#8a6034';c.fillRect(0,0,w,h);
  c.fillStyle='#f4f1e8';c.fillRect(14,14,w-28,h-28);
  c.fillStyle='#8a6034';
  const haste=(x)=>{c.fillRect(x-5,96,10,110);c.beginPath();c.arc(x,204,5,0,7);c.fill();};
  // garfo
  c.save();c.fillStyle='#8a6034';for(const d of [-15,-5,5,15])c.fillRect(50+d-3,44,6,42);c.fillRect(50-18,80,36,16);haste(50);c.restore();
  // colher
  c.beginPath();c.ellipse(100,64,17,26,0,0,7);c.fill();haste(100);
  // faca
  c.beginPath();c.moveTo(150,40);c.lineTo(160,54);c.lineTo(158,96);c.lineTo(142,96);c.lineTo(142,54);c.closePath();c.fill();haste(150);
  chuvisco(c,w,h,4,7);});}

// Os porta-retratos: foto de fim de tarde com as pessoas em contraluz. Não
// tem rosto de propósito — rosto genérico em 3 cm de parede vira borrão
// estranho, e silhueta contra a luz é o que o olho aceita como "foto de
// família" sem pedir detalhe.
function texturaRetrato(i){return canvasTex(160,200,(c,w,h)=>{
  const gr=c.createLinearGradient(0,0,0,h);
  const ceus=[['#ffd9a0','#e8a86a'],['#cfe0ea','#9db9c8'],['#ffe6bc','#d8a878'],['#e6dcc8','#b9a888']][i%4];
  gr.addColorStop(0,ceus[0]);gr.addColorStop(1,ceus[1]);c.fillStyle=gr;c.fillRect(0,0,w,h);
  c.fillStyle='rgba(60,44,30,.75)';
  const gente=[[2,58],[3,52],[2,64],[4,48]][i%4];
  for(let k=0;k<gente[0];k++){const x=w/2+(k-(gente[0]-1)/2)*34;
    c.beginPath();c.arc(x,h-gente[1]-34,13,0,7);c.fill();
    c.beginPath();c.ellipse(x,h-gente[1]+16,19,32,0,0,7);c.fill();}
  c.fillStyle='rgba(60,44,30,.55)';c.fillRect(0,h-gente[1]+44,w,gente[1]);
  chuvisco(c,w,h,5,i*3+2);});}

// A tela da TV: o campo visto de cima, que é o que sempre está passando.
function texturaTela(){return canvasTex(256,160,(c,w,h)=>{
  const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#3f9a4a');gr.addColorStop(1,'#2c7a36');
  c.fillStyle=gr;c.fillRect(0,0,w,h);
  c.strokeStyle='rgba(255,255,255,.8)';c.lineWidth=3;c.strokeRect(10,10,236,140);
  c.beginPath();c.moveTo(128,10);c.lineTo(128,150);c.stroke();
  c.beginPath();c.arc(128,80,26,0,7);c.stroke();
  c.strokeRect(10,50,26,60);c.strokeRect(220,50,26,60);
  c.fillStyle='#f4f1e8';for(const [x,y] of [[84,54],[150,96],[176,62],[102,110]]){c.beginPath();c.arc(x,y,5,0,7);c.fill();}
  c.fillStyle='#d84a3a';for(const [x,y] of [[64,88],[196,84]]){c.beginPath();c.arc(x,y,5,0,7);c.fill();}
  c.fillStyle='rgba(0,0,0,.55)';c.fillRect(0,0,w,16);
  c.fillStyle='#f4f1e8';c.font='700 11px Georgia, serif';c.textBaseline='middle';c.fillText('2 x 1  ·  72\u2032',8,8);});}

// A espada da casa. É o MESMO contorno do naipe do baralho (o `#naipe-0` do
// index.html, escrito como Path2D): a marca da casa e a carta na mão têm de ser
// a mesma espada, senão são duas casas.
const ESPADA=new Path2D('M50 10 C 82 34, 88 50, 88 62 C 88 74, 79 81, 70 81 C 61 81, 54 74, 50 65 C 46 74, 39 81, 30 81 C 21 81, 12 74, 12 62 C 12 50, 18 34, 50 10 Z');
const ESPADA_PE=new Path2D('M44 63 h12 c0 15, 3 24, 8 29 h-28 c5 -5, 8 -14, 8 -29 z');
function espada(c,x,y,s,cor){c.save();c.translate(x,y);c.scale(s/100,s/100);c.fillStyle=cor;c.fill(ESPADA);c.fill(ESPADA_PE);c.restore();}

// O quadro da casa: o nome do jogo em letra de placa, a espada, e o dizer
// embaixo. Fundo escuro e moldura de madeira — é o único ponto escuro numa
// parede de azulejo branco, e é por isso que ele puxa o olho.
function texturaQuadroCasa(){return canvasTex(430,320,(c,w,h)=>{
  const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#1f3a33');gr.addColorStop(1,'#14261f');
  c.fillStyle=gr;c.fillRect(0,0,w,h);
  c.strokeStyle='#c9a24e';c.lineWidth=3;c.strokeRect(14,14,w-28,h-28);
  c.setLineDash([7,7]);c.lineWidth=1.6;c.strokeRect(24,24,w-48,h-48);c.setLineDash([]);
  c.fillStyle='#f4ecd8';c.textAlign='center';c.textBaseline='middle';
  c.font='700 58px Georgia, serif';c.fillText('CAÇAMBA',w/2,112);
  espada(c,w/2-26,142,52,'#c9a24e');
  c.fillStyle='#c9a24e';c.font='600 20px Georgia, serif';
  c.fillText('a mesa é aqui',w/2,236);
  c.fillStyle='#8fae9c';c.font='600 15px Georgia, serif';
  c.fillText('BOAS CARTAS · MELHORES AMIGOS',w/2,266);
  chuvisco(c,w,h,4,15);});}

// ---------------------------------------------------------------------------
// Luz: o DIA entrando pela janela, mais a luminária sobre a mesa
// ---------------------------------------------------------------------------
export function iluminaSala(scene,renderer,{centro=new T.Vector3(),compacto=false}={}){
  // Sala clara: o longe derrete em cinza-claro, não em dourado. A neblina começa
  // longe, senão a parede de azulejo (que é o assunto) sai lavada.
  // FIM DE TARDE: a sala ainda se lê, mas já baixou o suficiente para a
  // lâmpada da mesa aparecer. Dia cheio deixava tudo chapado e a mesa sem
  // foco; noite fechada sumia com o azulejo e com metade da decoração.
  scene.background=new T.Color(0xc3b49c);scene.fog=new T.Fog(0xc3b49c,8,24);
  scene.add(new T.HemisphereLight(0xffe0bc,0x93826c,.62));
  // A luz da janela é baixa e DOURADA, e entra quase deitada pela esquerda:
  // é o sol de fim de tarde, não o meio-dia difuso de antes.
  const dia=new T.DirectionalLight(0xffcb8a,.98);dia.position.copy(centro).add(new T.Vector3(-5.5,2.2,1.8));dia.target.position.copy(centro);scene.add(dia,dia.target);
  // Um rebatido do lado oposto, para a parede da direita não fechar em preto.
  const rebatido=new T.DirectionalLight(0xdfd6c8,.3);rebatido.position.copy(centro).add(new T.Vector3(4,3,-3));rebatido.target.position.copy(centro);scene.add(rebatido,rebatido.target);
  // E um rebatido DE FRENTE, vindo de onde a câmera está. Sem ele a carta na
  // sua mão fica cinza: ela é vertical e virada para você, então a luz de cima
  // só a lambe de raspão — no boteco quem fazia esse serviço era o "sol"
  // laranja, que entrava pela frente-esquerda e sumiu com a troca.
  const frente=new T.DirectionalLight(0xffeeda,.62);frente.position.copy(centro).add(new T.Vector3(-.6,1.6,4.5));frente.target.position.copy(centro);scene.add(frente,frente.target);
  // A luminária da mesa. Ela sobrevive à troca do boteco pela casa porque não é
  // enfeite: é ela que projeta a sombra das cartas e concentra o olho no jogo.
  // A lâmpada sobe de 26 para 40: a esta hora ela é a luz que manda na mesa, e
  // é o que devolve às cartas o foco que o feltro verde dava por contraste.
  const foco=new T.SpotLight(0xffe0a8,40,12,.85,.7,2);foco.position.copy(centro).add(new T.Vector3(.3,3.05,.45));foco.target.position.copy(centro).setY(MESA.altura);
  foco.castShadow=true;const n=compacto?1024:2048;foco.shadow.mapSize.set(n,n);foco.shadow.bias=-.0004;foco.shadow.normalBias=.02;foco.shadow.camera.near=1;foco.shadow.camera.far=14;scene.add(foco,foco.target);
  // Ambiente PMREM de uma sala clara com uma janela: é o que faz o vidro da
  // cristaleira e o verniz do tampo terem o que refletir.
  const pm=new T.PMREMGenerator(renderer),amb=new T.Scene();amb.background=new T.Color(0xdfe3e0);
  const sala=new T.Mesh(new T.BoxGeometry(12,6,12),basico({color:0xd8cdb8,side:T.BackSide}));sala.position.y=3;amb.add(sala);
  const janela=new T.Mesh(new T.PlaneGeometry(3.2,2.6),basico({color:0xffdda8}));janela.position.set(-5.9,1.9,1);janela.rotation.y=Math.PI/2;amb.add(janela);
  scene.environment=pm.fromScene(amb,.04).texture;scene.environmentIntensity=.55;
  amb.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pm.dispose();
  return foco;
}

// ---------------------------------------------------------------------------
// A mesa de casa: tampo de madeira e pernas palito
//
// Era feltro verde com aro de madeira e pé de ferro. Virou a mesa da foto —
// madeira à vista, borda fina e quatro pernas torneadas abrindo para fora.
// O RAIO e a ALTURA não mudaram (MESA, em interacao3d.js): é deles que saem os
// lugares dos assentos, das cartas e dos jogos baixados, e mexer ali seria
// mexer no jogo, não no visual.
// ---------------------------------------------------------------------------
export function criaMesa(){const g=new T.Group();
  const tampoMat=mat(0xffffff,.34,{map:texturaTampo(),metalness:.02});
  const perfilMat=mat(0xa87a45,.4);
  const perna=mat(0x8f6335,.45);
  const tampo=new T.Mesh(new T.CylinderGeometry(MESA.raio,MESA.raio,.055,64),[perfilMat,tampoMat,perfilMat]);
  tampo.position.y=MESA.altura-.0275;tampo.receiveShadow=tampo.castShadow=true;g.add(tampo);
  // a barriga do tampo: a mesa da foto tem a borda arredondada, não uma chapa
  const bordo=new T.Mesh(new T.TorusGeometry(MESA.raio-.012,.028,10,64),perfilMat);
  bordo.rotation.x=Math.PI/2;bordo.position.y=MESA.altura-.045;g.add(bordo);
  // o travessão que segura as pernas, escondido embaixo
  const aro=new T.Mesh(new T.TorusGeometry(MESA.raio*.52,.035,8,32),perna);
  aro.rotation.x=Math.PI/2;aro.position.y=MESA.altura-.14;g.add(aro);
  // Quatro pernas palito abrindo para fora, como as da foto: grossas em cima,
  // finas no pé. É a inclinação que faz a mesa parecer leve — perna reta lê
  // como banco de escritório.
  for(let i=0;i<4;i++){const a=Math.PI/4+i*Math.PI/2,r=MESA.raio*.52;
    const p=new T.Mesh(new T.CylinderGeometry(.042,.02,MESA.altura-.06,12),perna);
    p.position.set(Math.cos(a)*(r+.09),(MESA.altura-.06)/2,Math.sin(a)*(r+.09));
    p.rotation.z=-Math.cos(a)*.15;p.rotation.x=Math.sin(a)*.15;p.castShadow=true;g.add(p);}
  return g;}

// ---------------------------------------------------------------------------
// A sala. A câmera senta à mesa olhando para -Z: o que pesa é a parede do
// fundo (z=-6), e em pé só se vê |x|<2,7 dela. É por isso que a cristaleira, a
// porta do corredor e o quadro dos talheres ficam nessa faixa — o buffet, a
// geladeira, a janela e os vasos dos cantos são paisagem de tela deitada.
// ---------------------------------------------------------------------------
export function criaSala(){const g=new T.Group();
  const madeiraEscura=mat(0x4a3020,.55),madeiraMel=mat(0x8a5c30,.5);
  const branco=mat(0xf3f1ea,.45),brancoQuente=mat(0xeae5d8,.5),preto=mat(0x1c1c1e,.35,{metalness:.4});
  const puxador=mat(0x2a2724,.4,{metalness:.5});
  const vidro=mat(0xdfeef7,.06,{metalness:.15,transparent:true,opacity:.22,depthWrite:false});

  // --- casca: piso, paredes de azulejo do chão ao teto, teto ---
  plano(g,10,9,mat(0xffffff,.4,{map:repete(texturaPisoCasa(),10/1,9/1)}),0,0,-1.5,0,-Math.PI/2);
  const azulejo=(w,h)=>mat(0xffffff,.35,{map:repete(texturaAzulejo(),w/.2,h/.2),metalness:.04});
  plano(g,10,3.2,azulejo(10,3.2),0,1.6,-6);
  plano(g,9,3.2,azulejo(9,3.2),-5,1.6,-1.5,Math.PI/2);
  plano(g,9,3.2,azulejo(9,3.2),5,1.6,-1.5,-Math.PI/2);
  plano(g,10,9,mat(0xf0eee8,.9),0,3.2,-1.5,0,Math.PI/2);
  // o rodapé de madeira, que é o que impede a parede de flutuar sobre o piso
  caixa(g,10,.09,.03,0,.045,-5.97,madeiraEscura);

  // --- a porta de moldura arredondada para o corredor escuro ---
  const px=-1.95;
  plano(g,.95,2.15,basico({map:texturaCorredor()}),px,1.07,-5.99);
  // a moldura: dois montantes, a verga e os dois cantos redondos
  caixa(g,.09,2.2,.14,px-.52,1.1,-5.96,madeiraMel);caixa(g,.09,2.2,.14,px+.52,1.1,-5.96,madeiraMel);
  caixa(g,1.13,.09,.14,px,2.24,-5.96,madeiraMel);
  for(const s of [-1,1]){const canto=new T.Mesh(new T.TorusGeometry(.12,.045,8,10,Math.PI/2),madeiraMel);
    canto.position.set(px+s*.4,2.12,-5.96);canto.rotation.z=s>0?0:Math.PI/2;g.add(canto);}

  // --- a cristaleira: o móvel-herói da parede do fundo ---
  // Cristaleira, e não armário: o que a define é ver os copos LÁ DENTRO. A
  // primeira versão era uma caixa maciça com as taças escondidas atrás dela —
  // o vidro não adianta nada se o móvel é opaco. Agora a carcaça é fundo,
  // laterais, tampo e base, com o miolo vazado.
  const cris=new T.Group();cris.position.set(.55,0,-5.72);g.add(cris);
  caixa(cris,1.34,2.02,.03,0,1.01,-.2,brancoQuente);            // o fundo
  for(const s2 of [-1,1])caixa(cris,.05,2.02,.44,s2*.645,1.01,0,branco,true);
  caixa(cris,1.34,.05,.44,0,2.0,0,branco);caixa(cris,1.34,.05,.44,0,.13,0,branco);
  caixa(cris,1.44,.1,.5,0,2.06,0,branco);                       // a cimalha
  const fronton=new T.Mesh(new T.CylinderGeometry(.34,.34,.5,20,1,false,0,Math.PI),branco);
  fronton.rotation.set(Math.PI/2,0,0);fronton.position.set(0,2.11,-.02);cris.add(fronton);
  caixa(cris,1.3,.1,.46,0,.06,0,branco);                        // o pé
  // as prateleiras com os copos: taças de pé, que é o que se vê de longe
  const tacas=[];
  for(let p=0;p<4;p++){const y=.62+p*.36;caixa(cris,1.18,.025,.34,0,y,.02,brancoQuente);
    for(let i=0;i<7;i++)tacas.push({x:-.5+i*.167,y:y+.075,z:.02+((i%3)-1)*.07,s:[1,.85+((i*5)%3)*.2,1]});}
  const perfilTaca=[[0,0],[.028,0],[.03,.012],[.008,.02],[.008,.08],[.032,.11],[.036,.15],[.03,.155],[0,.155]].map(([x,y])=>new T.Vector2(x,y));
  cris.add(instancias(new T.LatheGeometry(perfilTaca,8),mat(0xeef6fb,.08,{metalness:.2}),tacas));
  // as duas portas de vidro com o caixilho branco
  for(const s of [-1,1]){caixa(cris,.03,1.5,.03,s*.325,1.25,.225,branco);
    for(const y of [.5,2.0])caixa(cris,.65,.03,.03,s*.325,y,.225,branco);
    plano(cris,.6,1.46,vidro,s*.325,1.25,.23);}
  caixa(cris,.045,.16,.045,-.03,1.3,.245,puxador);caixa(cris,.045,.16,.045,.03,1.3,.245,puxador);

  // --- o quadro dos talheres muda para a esquerda, abaixo do relógio ---
  plano(g,.36,.43,mat(0xffffff,.7,{map:texturaTalheres()}),-3.5,1.62,-5.98);

  // --- os porta-retratos da família, entre a porta e a cristaleira ---
  // Ficam na sobra da faixa que a tela em pé enxerga: o vão da porta come até
  // x −1,39 e a cristaleira começa em −0,12. Cabe um agrupamento de cinco.
  const retratos=[[-1.16,2.52,.19,.24,0],[-.9,2.5,.15,.19,1],[-.66,2.55,.13,.17,2],
                  [-1.02,2.22,.14,.18,3],[-.74,2.2,.17,.21,0]];
  for(const [x,y,rw,rh,i] of retratos){
    caixa(g,rw+.035,rh+.035,.025,x,y,-5.965,madeiraEscura);
    plano(g,rw,rh,mat(0xffffff,.6,{map:texturaRetrato(i)}),x,y,-5.95);}

  // --- as caixas de jogo empilhadas no buffet: é o que se faz nesta mesa ---
  const CAIXAS=[0xc94f3a,0x2f6b8f,0xd8a838,0x4a7c53];
  const pilhaJogos=[...Array(4)].map((_,i)=>({x:3.4+((i%2)*.03),y:.95+i*.075,z:-5.55+((i%2)*.02),
    ry:.18*(i%3)-.15,s:[.36,.07,.36],cor:CAIXAS[i]}));
  g.add(instancias(CUBO,mat(0xffffff,.62),pilhaJogos));
  g.add(instancias(CUBO,mat(0xf4f1e8,.7),pilhaJogos.map(b=>({...b,y:b.y+.005,s:[.3,.062,.3],cor:0xffffff}))));

  // --- a TV ligada ao fundo, acima do buffet ---
  const tv=new T.Group();tv.position.set(3.5,2.28,-5.9);tv.rotation.y=-.16;g.add(tv);
  caixa(tv,.86,.52,.05,0,0,0,mat(0x1a1a1c,.4,{metalness:.3}));
  plano(tv,.8,.46,basico({map:texturaTela()}),0,0,.03);
  caixa(tv,.1,.05,.06,0,-.3,-.02,mat(0x2a2a2c,.5));

  // --- O QUADRO DA CASA. É o que faz esta sala ser a sala DESTE jogo: o resto
  //     do cômodo é a casa de qualquer um, e o quadro é a assinatura. Fica na
  //     faixa que a tela em pé enxerga, acima do aparador. ---
  const quadro=new T.Group();quadro.position.set(2.62,2.28,-5.96);g.add(quadro);
  plano(quadro,.86,.64,mat(0xffffff,.62,{map:texturaQuadroCasa()}),0,0,.03);
  caixa(quadro,.96,.055,.06,0,.345,0,madeiraEscura);caixa(quadro,.96,.055,.06,0,-.345,0,madeiraEscura);
  for(const s2 of [-1,1])caixa(quadro,.055,.75,.06,s2*.4525,0,0,madeiraEscura);

  // --- o buffet branco de gavetas, à direita ---
  const buf=new T.Group();buf.position.set(3.75,0,-5.62);g.add(buf);
  caixa(buf,1.7,.86,.55,0,.43,0,branco,true);
  caixa(buf,1.78,.06,.62,0,.89,0,madeiraMel);                   // o tampo de madeira
  for(let i=0;i<3;i++)for(const s of [-1,1]){caixa(buf,.5,.24,.02,s*.42,.62-i*.3,.28,brancoQuente);
    caixa(buf,.06,.06,.05,s*.42,.62-i*.3,.31,puxador);}
  // a caixa de jogo em cima, que é o que a foto tem e diz o que se faz nesta mesa
  caixa(buf,.34,.07,.34,-.5,.95,.02,mat(0xd8d2c4,.6)).rotation.y=.3;

  // --- a geladeira preta, no canto da direita ---
  caixa(g,.78,1.86,.72,4.5,.93,-5.5,preto,true);
  caixa(g,.03,1.7,.04,4.13,1.0,-5.14,mat(0x8e9296,.3,{metalness:.7}));
  caixa(g,.78,.03,.72,4.5,1.16,-5.5,mat(0x3a3a3c,.4));

  // --- a janela de caixilho, na parede da esquerda: é dela que vem o dia ---
  const jan=new T.Group();jan.position.set(-4.97,1.75,-1.2);jan.rotation.y=Math.PI/2;g.add(jan);
  plano(jan,2.3,2.2,basico({map:texturaQuintal()}),0,0,0);
  caixa(jan,2.5,.12,.1,0,1.16,.02,madeiraEscura);caixa(jan,2.5,.12,.1,0,-1.16,.02,madeiraEscura);
  for(const x of [-1.19,1.19])caixa(jan,.12,2.44,.1,x,0,.02,madeiraEscura);
  for(let i=1;i<4;i++)caixa(jan,.05,2.2,.06,-1.15+i*.575,0,.02,madeiraEscura);
  for(let i=1;i<4;i++)caixa(jan,2.3,.05,.06,0,-1.1+i*.55,.02,madeiraEscura);
  // a mancha de sol que a janela joga no piso — mais barata que uma segunda luz
  const luzJanela=canvasTex(128,128,(c,w,h)=>{const gr=c.createLinearGradient(0,0,0,h);gr.addColorStop(0,'rgba(255,214,142,.9)');gr.addColorStop(1,'rgba(255,214,142,0)');c.fillStyle=gr;c.fillRect(0,0,w,h);});
  plano(g,2.2,3,basico({map:luzJanela,transparent:true,blending:T.AdditiveBlending,depthWrite:false,opacity:.5,fog:false}),-3.3,.006,-1.2,0,-Math.PI/2);

  // --- os vasos: o bambu de um lado, o limoeiro do outro ---
  const canas=[],folhas=[];
  caixa(g,.5,.62,.5,-3.35,.31,-5.5,brancoQuente);               // o cachepô branco quadrado
  for(let i=0;i<7;i++){const a=i*2.1,r=.12;
    canas.push({x:-3.35+Math.cos(a)*r,y:1.35,z:-5.5+Math.sin(a)*r,rz:Math.cos(a)*.05,rx:Math.sin(a)*.05,s:[1,1+(i%3)*.16,1]});
    for(let k=0;k<7;k++)folhas.push({x:-3.35+Math.cos(a)*r+Math.cos(a+k)*.17,y:1.1+k*.19,z:-5.5+Math.sin(a)*r+Math.sin(a+k)*.17,ry:a+k,rz:.5+((k%3)*.2),s:[1,.55,1],cor:[0x4a7a3a,0x649a46,0x39682f][k%3]});}
  g.add(instancias(new T.CylinderGeometry(.016,.02,1.5,6),mat(0x8fae62,.7),canas));
  g.add(instancias(new T.ConeGeometry(.035,.26,4),mat(0xffffff,.65),folhas));
  // o limoeiro: copa redonda com os limões amarelos
  const vasoL=new T.Mesh(new T.CylinderGeometry(.26,.2,.42,16),mat(0xcfc3a8,.85));vasoL.position.set(3.05,.21,-4.6);g.add(vasoL);
  caixa(g,.03,.9,.03,3.05,.85,-4.6,madeiraMel);
  const copa=[],limoes=[];
  for(let i=0;i<26;i++){const a=i*2.4,r=.16+((i*7)%5)*.055,y=1.05+((i*11)%7)*.085;
    copa.push({x:3.05+Math.cos(a)*r,y,z:-4.6+Math.sin(a)*r,s:[1,.8,1],cor:[0x3f7434,0x568c40,0x2f5f2a][i%3]});
    if(i%5===0)limoes.push({x:3.05+Math.cos(a)*(r+.04),y:y-.05,z:-4.6+Math.sin(a)*(r+.04)});}
  g.add(instancias(new T.SphereGeometry(.13,8,6),mat(0xffffff,.75),copa));
  g.add(instancias(new T.SphereGeometry(.035,8,6),mat(0xe8c33a,.5),limoes));

  // --- as cadeiras de casa, ainda com o plástico da loja ---
  // O plástico é meio detalhe e meio piada, e é o que faz qualquer brasileiro
  // reconhecer a sala: cadeira nova que ninguém desembrulhou.
  const plastico=mat(0xf6f4ef,.18,{metalness:.05,transparent:true,opacity:.93});
  const pernasCad=[];
  const cadeira=(x,z,ry)=>{const c=new T.Group();c.position.set(x,0,z);c.rotation.y=ry;g.add(c);
    caixa(c,.5,.09,.48,0,.45,0,plastico);
    caixa(c,.5,.58,.09,0,.78,-.2,plastico);
    for(const [dx,dz] of [[-.21,-.2],[.21,-.2],[-.21,.2],[.21,.2]])
      pernasCad.push({x:x+dx*Math.cos(ry)+dz*Math.sin(ry),y:.22,z:z-dx*Math.sin(ry)+dz*Math.cos(ry)});};
  // Ficam só as duas das pontas, de perfil: as três que estavam atrás do
  // elenco eram cadeiras vazias tapando a parede — e parede é onde mora a
  // decoração que se vê da cadeira de quem joga.
  cadeira(-3.05,-3.6,1.3);cadeira(3.15,-3.5,-1.3);
  g.add(instancias(new T.CylinderGeometry(.022,.018,.44,6),madeiraMel,pernasCad));

  // --- o aparador embaixo do quadro, com o vaso de flores e os porta-retratos ---
  const ap=new T.Group();ap.position.set(2.62,0,-5.68);g.add(ap);
  caixa(ap,1.15,.72,.42,0,.36,0,branco,true);
  caixa(ap,1.22,.05,.48,0,.745,0,madeiraMel);
  for(const s2 of [-1,1]){caixa(ap,.44,.2,.02,s2*.27,.5,.215,brancoQuente);caixa(ap,.05,.05,.04,s2*.27,.5,.235,puxador);}
  const jarra=new T.Mesh(new T.CylinderGeometry(.07,.05,.18,12),mat(0xe8e4da,.25,{metalness:.1}));jarra.position.set(-.3,.86,0);ap.add(jarra);
  ap.add(instancias(new T.SphereGeometry(.045,8,6),mat(0xffffff,.7),
    [...Array(9)].map((_,i)=>({x:-.3+Math.cos(i*2.1)*.09,y:1.0+((i*3)%4)*.045,z:Math.sin(i*2.1)*.09,cor:[0xd9738a,0xe8a0ae,0xc45a72][i%3]}))));
  ap.add(instancias(new T.CylinderGeometry(.006,.006,.2,5),mat(0x5d8a48,.7),
    [...Array(9)].map((_,i)=>({x:-.3+Math.cos(i*2.1)*.05,y:.92,z:Math.sin(i*2.1)*.05,rz:Math.cos(i*2.1)*.25,rx:Math.sin(i*2.1)*.25}))));
  for(const [x,w,h] of [[.22,.16,.2],[.44,.13,.16]]){caixa(ap,w,h,.02,x,.78+h/2,-.02,madeiraMel);caixa(ap,w-.04,h-.04,.01,x,.78+h/2,-.005,brancoQuente);}

  // --- o relógio de parede, à esquerda ---
  const rel=new T.Mesh(new T.CylinderGeometry(.2,.2,.05,24),brancoQuente);
  rel.rotation.x=Math.PI/2;rel.position.set(-3.5,2.35,-5.94);g.add(rel);
  caixa(g,.02,.13,.01,-3.5,2.41,-5.91,puxador);caixa(g,.09,.02,.01,-3.46,2.35,-5.91,puxador);

  // --- a luminária sobre a mesa: cúpula clara, que é onde mora o foco ---
  caixa(g,.014,1.05,.014,.3,2.68,.45,mat(0x9a9a96,.5,{metalness:.4}));
  // A cúpula é vista por DENTRO por quem senta, então o emissivo dela é o que
  // diz que a lâmpada está acesa. Sem isso ela ilumina a mesa mas continua
  // parecendo um cone apagado pendurado no teto.
  const cupula=new T.Mesh(new T.ConeGeometry(.3,.26,24,1,true),mat(0xf6f0e2,.45,{side:T.DoubleSide,emissive:0x8a6428,emissiveIntensity:.3}));
  cupula.position.set(.3,2.28,.45);g.add(cupula);
  const bulbo=new T.Mesh(new T.SphereGeometry(.06,12,10),basico({color:0xfff4dc}));bulbo.position.set(.3,2.17,.45);g.add(bulbo);
  // o halo em volta do bulbo: um plano sempre de frente, aditivo — é o que faz
  // a luz "estourar" um pouco, como numa foto de sala à tardinha
  const halo=canvasTex(64,64,(c,w,h)=>{const gr=c.createRadialGradient(32,32,2,32,32,32);
    gr.addColorStop(0,'rgba(255,226,164,.95)');gr.addColorStop(1,'rgba(255,226,164,0)');c.fillStyle=gr;c.fillRect(0,0,w,h);});
  const brilho=new T.Sprite(new T.SpriteMaterial({map:halo,transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
  brilho.scale.set(.42,.42,1);brilho.position.set(.3,2.19,.45);g.add(brilho);
  return g;}
