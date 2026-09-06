// ============================================================================
// Caçamba — o personagem 3D vindo de fora, no estilo do elenco
//
// Este módulo é o que a mesa 3D e o provador (provador.html) têm em comum
// sobre modelos glTF: o sombreamento chapado do elenco, o contorno de casca
// invertida, o encaixe do modelo no assento (medidas, nós, morphs, clips) e a
// conferência do contrato de public/models/LEIA-ME.md. Não sabe de partida,
// de servidor nem de câmera — recebe o glTF e devolve o que a cena precisa.
// ============================================================================

import * as THREE from './vendor/three.module.js';
import { preparaDedos } from './dedos3d.js';
import { preparaInteracao } from './interacao3d.js';

// Do chão ao topo da cabeça, sentado. Modelo cru é normalizado para isso.
export const ALTURA_SENTADO = 1.55;
// Fator do elenco para um modelo rigado e sentado, em metros de verdade
// (1,33 m sentada × 1,2 ≈ a cabeça do boneco de código). A banqueta escala junto.
export const ESCALA_ELENCO = 1.0;   // era 1,2 na mesa alta; na mesa de jantar, tamanho real

// Sombreamento CHAPADO, em três degraus: é o que o elenco tem no 2D (cor
// lisa + sombra de um tom só), e o que faz o boneco parecer desenhado em vez
// de plástico. Um gradiente de 3 texels serve todos os materiais.
export const GRADIENTE_TOON = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

// O contorno do elenco (5 unidades de #2A1B12) em 3D: uma cópia de cada peça
// virada do avesso (só as faces de trás), um pouco maior — a "casca invertida".
// A espessura é absoluta, não proporcional: um braço fino e um tronco largo
// ganham o mesmo traço, como no desenho.
export const M_CONTORNO = new THREE.MeshBasicMaterial({ color: 0x2a1b12, side: THREE.BackSide });
export function contornoDe(malha) {
  const geo = malha.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const r = geo.boundingSphere.radius;
  if (r < 0.03) return null;   // olho, guizo, aro: sem contorno
  const casca = new THREE.Mesh(geo, M_CONTORNO);
  casca.position.copy(malha.position);
  casca.quaternion.copy(malha.quaternion);
  const fator = Math.min(1.35, Math.max(1.04, 1 + 0.014 / r));
  casca.scale.copy(malha.scale).multiplyScalar(fator);
  casca.userData.contorno = true;
  return casca;
}

// O material que vem do glTF (PBR: baseColor, metal, rugosidade) vira o
// material do elenco: mesma cor e mesma textura, mas sombreado em degraus.
// Metal e rugosidade não têm o que dizer num desenho e são ignorados; o
// normal map, se houver, fica.
function materialDoElenco(m) {
  const toon = new THREE.MeshToonMaterial({
    color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    map: m.map || null,
    // o normal map fica: dobras de roupa e mechas assadas de uma escultura
    // entram nos degraus do sombreamento sem custar triângulos
    normalMap: m.normalMap || null,
    normalScale: m.normalScale ? m.normalScale.clone() : undefined,
    gradientMap: GRADIENTE_TOON,
    transparent: !!m.transparent,
    opacity: m.opacity ?? 1,
    side: m.side ?? THREE.FrontSide,
    alphaTest: m.alphaTest || 0,
    vertexColors: !!m.vertexColors,
  });
  toon.name = m.name || '';
  toon.userData.original = m;
  return toon;
}

// Encaixa o modelo no assento: normaliza a altura (do chão ao topo da cabeça
// → ALTURA_SENTADO), põe os pés no chão, veste o sombreamento e o contorno do
// elenco (`estilo: 'elenco'`; `'original'` deixa o material do arquivo), e
// liga o que o modelo trouxer — nós `Cabeca`/`MaoEsq`/`MaoDir`, morphs
// `feliz`/`bravo`/`bocaAberta`, clips `idle`/`feliz`/`bravo`. Devolve o que a
// cena precisa para animar.
export function encaixaModelo(gltf, slug, { estilo = 'elenco', avisa = true } = {}) {
  const raiz = gltf.scene;
  // `precise`: mede vértice a vértice. A caixa rápida usa o boundingBox da
  // geometria, que com morph targets é inflado para os dois lados (o exemplo
  // de 1,55 m media 1,60) e com esqueleto ignora a pose
  const caixa = new THREE.Box3().setFromObject(raiz, true);
  const alturaOriginal = caixa.max.y - caixa.min.y || 1;
  // Arquivo que traz o nó `Cabeca` passou pelo preparo e está em metros: a
  // escala é a dele. Normalizar pela caixa serve só ao que chega cru — um
  // modelo SENTADO normalizado para 1,55 m viraria uma gigante de 2 m.
  const preparado = !!raiz.getObjectByName('Cabeca');
  // Preserva metros e proporções do elenco preparado. Modelos externos
  // sem o contrato de escala recebem a normalização de altura.
  let temEsqueleto = false; raiz.traverse((o) => { if (o.isSkinnedMesh) temEsqueleto = true; });
  const escala = preparado ? (temEsqueleto ? ESCALA_ELENCO : 1) : ALTURA_SENTADO / alturaOriginal;
  raiz.scale.setScalar(escala);
  // Mantém a origem horizontal e eleva somente pés que atravessam o chão.
  // O banco acompanha a superfície da roupa na pose já deformada.
  raiz.position.set(0, preparado ? Math.max(0, -caixa.min.y * escala + 0.003) : -caixa.min.y * escala, 0);
  // as matrizes ainda são as de antes da escala: sem isto, a cabeça e as mãos
  // sairiam nas medidas originais do arquivo
  raiz.updateMatrixWorld(true);

  const materiais = [];
  const morfos = {};
  const contornos = [];
  raiz.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    if (estilo === 'elenco') {
      o.material = Array.isArray(o.material) ? o.material.map(materialDoElenco) : materialDoElenco(o.material);
    }
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    o.receiveShadow = true;
    for (const m of ms) {
      // O GLB usava a própria textura como lâmpada e metal implícito = 1.
      // Roupa/pele precisam receber luz: cor e textura continuam originais.
      if (estilo === 'original' && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) {
        m.emissiveIntensity = 0; m.metalness = 0; m.roughness = 0.78;
        if ('specularIntensity' in m) m.specularIntensity = 0.3;
        if (m.specularColor) m.specularColor.set(0xffffff);
        m.envMapIntensity = 0.55;
        if (m.map) m.map.anisotropy = 4;
      }
      m.userData.opacityBase = m.opacity;
      m.userData.transparentBase = m.transparent;
      materiais.push(m);
    }
    if (o.morphTargetDictionary) {
      for (const nome of ['feliz', 'bravo', 'bocaAberta']) {
        if (nome in o.morphTargetDictionary && !morfos[nome]) morfos[nome] = { malha: o, indice: o.morphTargetDictionary[nome] };
      }
    }
    // a casca invertida só serve a malha parada: numa malha com esqueleto a
    // casca não acompanharia os ossos
    if (estilo === 'elenco' && !o.isSkinnedMesh && !o.morphTargetDictionary) {
      const c = contornoDe(o);
      if (c) contornos.push([o, c]);
    }
  });
  const mContorno = M_CONTORNO.clone(); mContorno.transparent = true;
  if (contornos.length) materiais.push(mContorno);
  for (const [malha, casca] of contornos) { casca.material = mContorno; malha.parent.add(casca); }

  const no = (nome) => raiz.getObjectByName(nome) || null;
  const cabeca = no('Cabeca');
  // posição de um nó no espaço do assento (o pai da raiz), já na escala nova
  const posDe = (obj, padrao) => {
    if (!obj) return padrao;
    const v = new THREE.Vector3(); obj.getWorldPosition(v); raiz.parent?.worldToLocal(v);
    return v;
  };
  const alturaCabeca = cabeca ? posDe(cabeca).y : ALTURA_SENTADO * 0.88;
  const maoEsq = posDe(no('MaoEsq'), null), maoDir = posDe(no('MaoDir'), null);
  const posLeque = maoEsq && maoDir ? maoEsq.clone().add(maoDir).multiplyScalar(0.5) : new THREE.Vector3(0, 1.02, 0.17);

  let mixer = null; const acoes = {};
  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(raiz);
    for (const clip of gltf.animations) acoes[clip.name] = mixer.clipAction(clip);
    if (acoes.idle) acoes.idle.play();
    // uma reação (clip de uma vez só) apaga o idle enquanto toca e o traz de
    // volta quando acaba — sem isso os dois somavam meio a meio
    mixer.addEventListener('finished', (e) => {
      if (!acoes.idle || e.action === acoes.idle) return;
      e.action.fadeOut(0.25);
      acoes.idle.reset().setEffectiveWeight(1).fadeIn(0.25).play();
    });
  }
  if (avisa) console.info(`modelo: ${slug} carregado (altura ${alturaOriginal.toFixed(2)}${preparado ? ', escala do arquivo' : ` → ${ALTURA_SENTADO}`})`);
  const cabecaAnimada = gltf.animations?.some(a => a.name === 'idle' && a.tracks.some(t => t.name === 'Head.quaternion'));
  const modelo = { dedos: preparaDedos(raiz), raiz, materiais, morfos, mixer, acoes, cabecaAnimada, alturaCabeca, posLeque, alturaOriginal, escala, caixa, sentado: preparado && temEsqueleto };
  if (modelo.dedos.juntas.length) preparaInteracao(modelo);
  return modelo;
}

// A banqueta do assento: madeira escura com a almofada na cor do assento.
// Mora aqui porque o provador precisa dela para julgar a pose (o modelo
// senta nela) — na mesa, é a cadeira de cada personagem.
// Dimensões de construção. ajustaBanqueta calcula altura e recuo do modelo.
export const BANQUETA_ASSENTO = 0.45;   // cadeira de mesa de jantar (tampo a 0,76 m)
export function criaBanqueta(corAlmofada) {
  const g = new THREE.Group();
  const madeira = new THREE.MeshStandardMaterial({ color: 0x5a3720, roughness: 0.6 });
  const A = BANQUETA_ASSENTO;
  const tampo = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.06, 20), madeira);
  tampo.position.y = A - 0.03; tampo.castShadow = true; g.add(tampo);
  const almofada = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.05, 20), new THREE.MeshStandardMaterial({ color: corAlmofada, roughness: 0.92 }));
  almofada.position.y = A + 0.025; almofada.castShadow = true; g.add(almofada);
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) {
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, A - 0.06, 8), madeira);
    pe.position.set(x, (A - 0.06) / 2, z); pe.castShadow = true; g.add(pe);
  }
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.014, 8, 24), madeira);
  aro.rotation.x = Math.PI / 2; aro.position.y = 0.12; g.add(aro);
  g.position.z = -0.04;   // um pouco para trás: as pernas sentadas vão para a frente
  return g;
}

// Toca uma reação no modelo: o clip com esse nome (uma vez, e volta ao idle)
// e/ou o morph com esse nome (sobe até 1). O chamador zera o morph quando a
// reação passa. Devolve true se o modelo tinha algo para mostrar.
export function reage(m, nome) {
  let mostrou = false;
  if (m.acoes[nome] && nome !== 'idle') {
    const acao = m.acoes[nome];
    acao.reset().setLoop(THREE.LoopOnce, 1); acao.clampWhenFinished = true; acao.enabled = true;
    acao.setEffectiveWeight(1).play();
    if (m.acoes.idle) { m.acoes.idle.enabled = true; m.acoes.idle.setEffectiveWeight(1); acao.crossFadeFrom(m.acoes.idle, 0.15, false); }
    mostrou = true;
  }
  if (m.morfos[nome]) { m.morfos[nome].malha.morphTargetInfluences[m.morfos[nome].indice] = 1; mostrou = true; }
  return mostrou;
}

// A conferência do contrato (public/models/LEIA-ME.md), item a item. Cada
// item é { ok: true | false | null, texto }: `false` é o que a mesa não
// consegue corrigir sozinha ou que sai do combinado; `null` é opcional que
// não veio. Recebe o glTF cru e o encaixe já feito.
export function confereModelo(gltf, m) {
  const itens = [];
  const item = (ok, texto) => itens.push({ ok, texto });
  const c = m.caixa; const h = m.alturaOriginal;
  const cm = (v) => `${(v * 100).toFixed(0)} cm`;

  if (m.sentado) item(true, `Altura no arquivo: ${h.toFixed(2)} m sentada, na escala do elenco (×${ESCALA_ELENCO}: ${(h * ESCALA_ELENCO).toFixed(2)} m na mesa)`);
  else if (m.escala === 1) item(h >= 0.8 && h <= 2.2, `Altura no arquivo: ${h.toFixed(2)} m, mantida (tem nó Cabeca: passou pelo preparo)` + (h < 0.8 || h > 2.2 ? ' — fora do esperado para metros' : ''));
  else item(h >= 0.8 && h <= 2.2, `Altura no arquivo: ${h.toFixed(2)} m → normalizada para ${ALTURA_SENTADO} m` + (h < 0.8 || h > 2.2 ? ' (fora de metros? a mesa corrige, mas confira a unidade)' : ''));
  const pes = Math.abs(c.min.y) / h;
  if ((m.escala === 1 || m.sentado) && c.min.y > 0 && c.min.y < 0.3) item(null, `Pés a ${cm(c.min.y)} do chão: apoiados no aro da banqueta`);
  else item(c.min.y * m.escala + m.raiz.position.y >= -0.001, m.raiz.position.y > 0 ? `Pés corrigidos no chão: modelo elevado ${cm(m.raiz.position.y)}` : 'Origem no chão, entre os pés');
  const cx = (c.min.x + c.max.x) / 2 / h, cz = (c.min.z + c.max.z) / 2 / h;
  item(Math.abs(cx) < 0.1 && Math.abs(cz) < 0.3, Math.abs(cx) < 0.1 && Math.abs(cz) < 0.3 ? 'Origem no eixo do corpo (x e z)' : `Deslocado da origem: x ${cm((c.min.x + c.max.x) / 2)}, z ${cm((c.min.z + c.max.z) / 2)} — a mesa NÃO corrige; o corpo sairia do assento`);
  item(null, 'Frente em +Z: confira no palco — o rosto deve olhar para a mesa');

  const no = (nome) => !!m.raiz.getObjectByName(nome);
  item(no('Cabeca') ? true : null, no('Cabeca') ? `Nó Cabeca a ${cm(m.alturaCabeca)} do chão` : `Sem nó Cabeca: a boca da fala e o nome ficam a ${cm(m.alturaCabeca)} (88% da altura)`);
  const maos = no('MaoEsq') && no('MaoDir');
  item(m.interacao ? true : maos ? true : null, m.interacao ? 'Cartas ligadas à pinça da mão; braços acompanham compra, descarte e baixada' : maos ? `Nós MaoEsq/MaoDir: leque a ${cm(m.posLeque.y)} do chão` : 'Sem MaoEsq/MaoDir: o leque fica na posição padrão (1,02 m; 0,17 m à frente)');

  item(m.dedos?.juntas.length ? true : null, m.dedos?.juntas.length ? `${m.dedos.juntas.length} ossos de dedos: use o controle de flexão para conferir as duas mãos` : 'Sem articulação dos dedos');
  for (const nome of ['feliz', 'bravo', 'bocaAberta']) {
    item(m.morfos[nome] ? true : null, (m.morfos[nome] ? 'Morph ' : 'Sem morph ') + nome + (nome === 'bocaAberta' ? (m.morfos[nome] ? ' (a voz move)' : ' (a fala usa a elipse escura)') : ''));
  }
  const clips = (gltf.animations || []).map((a) => a.name);
  for (const nome of ['idle', 'feliz', 'bravo']) item(clips.includes(nome) ? true : null, (clips.includes(nome) ? 'Clip ' : 'Sem clip ') + nome);
  const extras = clips.filter((n) => !['idle', 'feliz', 'bravo'].includes(n));
  if (extras.length) item(null, `Clips que a mesa não usa: ${extras.join(', ')}`);

  let triangulos = 0; const texturas = new Set(); let comOsso = 0; let metal = 0; const mats = new Set();
  m.raiz.traverse((o) => {
    if (!o.isMesh || o.userData.contorno) return;
    const g = o.geometry;
    triangulos += Math.round((g.index ? g.index.count : g.attributes.position?.count || 0) / 3);
    if (o.isSkinnedMesh) comOsso++;
    for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
      mats.add(mat);
      const orig = mat.userData.original || mat;
      if ((orig.metalness ?? 0) > 0.3) metal++;
      for (const t of [orig.map, orig.normalMap, orig.emissiveMap, orig.roughnessMap, orig.metalnessMap]) if (t?.image) texturas.add(t);
    }
  });
  item(triangulos <= 32000, `${triangulos.toLocaleString('pt-BR')} triângulos` + (triangulos > 32000 ? ' — acima dos ~30 mil; pesa no celular' : ''));
  let maior = 0;
  for (const t of texturas) maior = Math.max(maior, t.image.width || 0, t.image.height || 0);
  item(texturas.size === 0 || maior <= 1024, texturas.size ? `${texturas.size} textura(s), a maior com ${maior} px` + (maior > 1024 ? ' — acima de 1024' : '') : 'Sem texturas (cor chapada nos materiais)');
  item(true, `${mats.size} material(is)` + (metal ? `; ${metal} com metal — vira cor chapada no estilo do elenco` : ''));
  if (comOsso) item(null, `${comOsso} malha(s) com esqueleto: sombreamento do elenco entra, o contorno não`);
  return itens;
}
