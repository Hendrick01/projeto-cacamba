import * as T from './vendor/three.module.js';
import { acabamentoMaterial, clamp, contatoVisual, criaTransicaoCamera, faseVisual, graoVisual, pulsoPiscar } from './visual3d-core.js';

// Camada de apresentacao: usa os pontos publicos mesa3d/provador e os callbacks
// documentados da Scene. Nao altera GLB, animation clips, IK, pesos ou dedos.
export function instalaVisual3d(contexto, { modo = 'mesa', animar = modo === 'mesa' } = {}) {
  if (!contexto?.scene || !contexto?.renderer || !contexto?.camera) throw new TypeError('Contexto 3D incompleto');
  if (contexto.visual) return contexto.visual;
  const { scene, renderer, camera } = contexto;
  const preferencia = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduzido = preferencia?.matches ?? false;
  let ultimo = null, encerrado = false;
  const materiais = new WeakMap(), modelos = new WeakMap();
  const temporarios = [];
  const propriedades = ['roughness', 'metalness', 'envMapIntensity', 'bumpMap', 'bumpScale'];
  const texturas = [];
  const transicao = criaTransicaoCamera();
  const ponto = new T.Vector3(), rotacao = new T.Quaternion(), giro = new T.Euler();
  const maxAnisotropia = Math.max(1, Math.min(4, renderer.capabilities?.getMaxAnisotropy?.() || 1));
  const anisotropias = new WeakMap();
  function textura(dados, tamanho) {
    const t = new T.DataTexture(dados, tamanho, tamanho, T.RGBAFormat);
    t.colorSpace = T.NoColorSpace;
    t.minFilter = T.LinearFilter; t.magFilter = T.LinearFilter;
    t.generateMipmaps = false; t.needsUpdate = true;
    texturas.push(t); return t;
  }
  const fibra = textura(graoVisual(), 128);
  fibra.wrapS = fibra.wrapT = T.RepeatWrapping; fibra.repeat.set(24, 24);
  const piso = textura(graoVisual(128, 31), 128);
  piso.wrapS = piso.wrapT = T.RepeatWrapping; piso.repeat.set(36, 32);
  function ajustarMaterial(m, valores) {
    if (!m?.isMeshStandardMaterial && !m?.isMeshPhysicalMaterial) return;
    if (!materiais.has(m)) materiais.set(m, Object.fromEntries(propriedades.map(k => [k, m[k]])));
    const mudouShader = valores.bumpMap && !m.bumpMap;
    Object.assign(m, valores);
    if (m.map && !anisotropias.has(m.map)) {
      anisotropias.set(m.map, m.map.anisotropy);
      if (m.map.anisotropy !== maxAnisotropia) { m.map.anisotropy = maxAnisotropia; m.map.needsUpdate = true; }
    }
    if (mudouShader) m.needsUpdate = true;
  }
  // Mantem a identidade de boteco no fim de tarde, mas nao banha a pele de
  // laranja. Aproveita as luzes e o unico mapa de sombra que ja existem.
  const luzes = [];
  scene.traverse(o => {
    if (!o.isLight) return;
    luzes.push({ o, cor: o.color.clone(), intensidade: o.intensity, chao: o.groundColor?.clone() });
    if (o.isHemisphereLight) { o.color.set(0xe6efff); o.groundColor.set(0x756148); o.intensity = 0.8; }
    else if (o.isDirectionalLight) { o.color.set(0xffe7ca); o.intensity = 1.15; }
    else if (o.isSpotLight && o.castShadow) { o.color.set(0xffedcf); o.intensity = 26; }
  });
  const recorte = new T.DirectionalLight(0xffdfbd, 0.35);
  recorte.name = 'visual-recorte'; recorte.position.set(2.4, 2.8, -3.4);
  recorte.target.position.set(0, 1.05, -0.4);
  recorte.castShadow = false; scene.add(recorte, recorte.target);
  const ambienteAnterior = scene.environmentIntensity;
  scene.environmentIntensity = 0.28;
  const exposicaoAnterior = renderer.toneMappingExposure;
  renderer.toneMappingExposure = 1;

  // Nenhuma geometria de cenario e substituida. Acabamento aplicado apenas
  // ao piso conhecido e ao feltro da mesa; cartas e seus materiais ficam intactos.
  scene.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const p = o.geometry?.parameters || {};
    if (o.geometry?.type === 'PlaneGeometry' && p.width === 10 && p.height === 9 && Math.abs(o.position.y) < 0.01) {
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        ajustarMaterial(m, { roughness: 0.62, envMapIntensity: 0.3, bumpMap: m.bumpMap || piso, bumpScale: m.bumpMap ? m.bumpScale : 0.0007 });
      }
    }
    if (o.geometry?.type === 'CylinderGeometry' && Math.abs(p.radiusTop - 1.15) < 0.001 && Array.isArray(o.material)) {
      const feltro = o.material[1];
      ajustarMaterial(feltro, { roughness: 0.98, metalness: 0, envMapIntensity: 0.12, bumpMap: feltro.bumpMap || fibra, bumpScale: feltro.bumpMap ? feltro.bumpScale : 0.001 });
    }
  });

  const contatoTex = textura(contatoVisual(), 64);
  const contatoMat = new T.MeshBasicMaterial({ map: contatoTex, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
  const contatoGeo = new T.PlaneGeometry(1, 1);
  const contatos = new Map();
  function contato(chave, referencia, largura, profundidade) {
    let o = contatos.get(chave);
    if (!o) {
      o = new T.Mesh(contatoGeo, contatoMat); o.name = 'visual-contato'; o.rotation.x = -Math.PI / 2;
      o.raycast = () => {}; scene.add(o); contatos.set(chave, o);
    }
    referencia.getWorldPosition(ponto);
    o.position.set(ponto.x, 0.003, ponto.z); o.scale.set(largura, profundidade, 1);
    o.visible = true;
    for (let pai = referencia; pai; pai = pai.parent) if (!pai.visible) { o.visible = false; break; }
    // onBeforeRender roda depois da atualizacao inicial das matrizes da cena.
    // O plano novo/movido precisa estar no lugar neste quadro, nao no seguinte.
    o.updateWorldMatrix(true, false);
  }
  const nomeNormal = nome => String(nome).toLowerCase().replace(/[^a-z0-9]/g, '');
  function prepararModelo(m, id) {
    if (modelos.has(m)) return modelos.get(m);
    let cabeca = null;
    const olhos = [];
    const morphAnimado = Object.values(m.acoes || {}).some(a => a.getClip?.().tracks.some(t => t.name.includes('morphTargetInfluences')));
    m.raiz.traverse(o => {
      const nome = nomeNormal(o.name);
      if (!cabeca && o.isBone && ['head', 'cabeca', 'mixamorighead'].includes(nome)) cabeca = o;
      if (!o.isMesh) return;
      for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
        ajustarMaterial(mat, acabamentoMaterial(mat.name, mat.transparent));
      }
      if (!morphAnimado && o.morphTargetDictionary && o.morphTargetInfluences) {
        const d = o.morphTargetDictionary;
        const nomes = Object.keys(d);
        const unificado = nomes.find(n => ['blink', 'eyeblink', 'eyesclosed', 'piscar'].includes(nomeNormal(n)));
        const esquerda = nomes.find(n => ['eyeblinkleft', 'blinkleft', 'blinkl'].includes(nomeNormal(n)));
        const direita = nomes.find(n => ['eyeblinkright', 'blinkright', 'blinkr'].includes(nomeNormal(n)));
        for (const n of (unificado ? [unificado] : esquerda && direita ? [esquerda, direita] : [])) olhos.push({ o, i: d[n] });
      }
    });
    // Um osso ambiguo com bracos como descendentes nao pode receber a adicao.
    if (cabeca) {
      let seguro = true;
      cabeca.traverse(o => { if (o !== cabeca && /hand|finger|thumb|forearm|upperarm|mao|dedo/i.test(o.name)) seguro = false; });
      if (!seguro) cabeca = null;
    }
    const r = { cabeca, olhos, fase: faseVisual(id), base: new T.Quaternion() };
    modelos.set(m, r); return r;
  }
  function restaurarPose() {
    for (let i = temporarios.length - 1; i >= 0; i--) {
      const v = temporarios[i];
      if (v.osso) { v.osso.quaternion.copy(v.q); v.osso.updateWorldMatrix(false, true); }
      else v.o.morphTargetInfluences[v.i] = v.valor;
    }
    temporarios.length = 0;
  }
  function acabamentoModelo(m, id, t, reacao = false) {
    if (!m?.raiz) return;
    const r = prepararModelo(m, id);
    if (!animar || reduzido || reacao) return;
    // Adicao minima apenas a cabeca: pelvis, tronco, bracos, punhos e dedos
    // ficam exatamente na pose calculada pelo jogo. A pose e restaurada apos
    // o desenho, evitando acumulacao e disputa com o mixer/IK do quadro seguinte.
    if (r.cabeca) {
      r.base.copy(r.cabeca.quaternion);
      giro.set(Math.sin(t * 1.25 + r.fase * 9) * 0.003, 0, Math.sin(t * 0.85 + r.fase * 13) * 0.002);
      rotacao.setFromEuler(giro); r.cabeca.quaternion.multiply(rotacao);
      r.cabeca.updateWorldMatrix(false, true);
      temporarios.push({ osso: r.cabeca, q: r.base });
    }
    const fechar = pulsoPiscar(t, r.fase);
    if (fechar > 0) for (const olho of r.olhos) {
      const valor = olho.o.morphTargetInfluences[olho.i];
      temporarios.push({ ...olho, valor }); olho.o.morphTargetInfluences[olho.i] = Math.max(valor, fechar);
    }
  }
  const antes = scene.onBeforeRender, depois = scene.onAfterRender;
  function antesVisual(...args) {
    restaurarPose(); antes?.apply(this, args);
    if (encerrado || (globalThis.document?.hidden ?? false)) { ultimo = null; return; }
    const agora = performance.now(), dt = ultimo === null ? 0 : Math.min(0.1, (agora - ultimo) / 1000);
    ultimo = agora;
    if (modo === 'mesa') {
      const p = transicao({ y: camera.position.y, z: camera.position.z, aspecto: camera.aspect, dt, reduzido });
      camera.position.y = p.y; camera.position.z = p.z;
      camera.position.x = reduzido ? 0 : clamp(camera.position.x, -0.18, 0.18);
      camera.lookAt(camera.position.x * 0.25, 0.88, -0.35); camera.updateMatrixWorld(true);
      const vivos = new Set();
      for (const [id, a] of contexto.assentos || []) {
        if (a.grupo) { vivos.add(id); contato(id, a.grupo, 0.8, 0.75); }
        acabamentoModelo(a.assento?.modelo, id, agora / 1000, a.apagado || a.caraAte > agora);
      }
      for (const [id, o] of contatos) if (!vivos.has(id)) { scene.remove(o); contatos.delete(id); }
    } else {
      const atual = contexto.atual?.();
      acabamentoModelo(atual?.m, atual?.nome || 'provador', agora / 1000);
      // Nao altera a camera orbital, a pose ou a flexao usada no trabalho do rig.
      if (contexto.banqueta?.visible) contato('provador', contexto.banqueta, 0.8, 0.75);
      else if (contatos.has('provador')) contatos.get('provador').visible = false;
    }
  }
  function depoisVisual(...args) {
    try { depois?.apply(this, args); } finally { restaurarPose(); }
  }
  scene.onBeforeRender = antesVisual; scene.onAfterRender = depoisVisual;
  const mudouPreferencia = e => { reduzido = e.matches; };
  const visibilidade = () => { ultimo = null; restaurarPose(); };
  preferencia?.addEventListener?.('change', mudouPreferencia);
  globalThis.document?.addEventListener?.('visibilitychange', visibilidade);
  const api = {
    versao: 1,
    diagnostico: () => ({ modo, animacoesAdicionais: animar && !reduzido, sombrasExtras: 0,
      drawCalls: renderer.info?.render.calls ?? null, triangulos: renderer.info?.render.triangles ?? null,
      texturasGPU: renderer.info?.memory.textures ?? null, contatos: contatos.size }),
    dispose() {
      if (encerrado) return;
      encerrado = true; restaurarPose();
      if (scene.onBeforeRender === antesVisual) scene.onBeforeRender = antes;
      if (scene.onAfterRender === depoisVisual) scene.onAfterRender = depois;
      preferencia?.removeEventListener?.('change', mudouPreferencia);
      globalThis.document?.removeEventListener?.('visibilitychange', visibilidade);
      for (const { o, cor, intensidade, chao } of luzes) {
        o.color.copy(cor); o.intensity = intensidade; if (chao) o.groundColor.copy(chao);
      }
      scene.remove(recorte, recorte.target); scene.environmentIntensity = ambienteAnterior;
      renderer.toneMappingExposure = exposicaoAnterior;
      scene.traverse(o => {
        if (!o.isMesh) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          if (materiais.has(m)) { Object.assign(m, materiais.get(m)); m.needsUpdate = true; }
          if (m.map && anisotropias.has(m.map)) { m.map.anisotropy = anisotropias.get(m.map); m.map.needsUpdate = true; }
        }
      });
      for (const o of contatos.values()) scene.remove(o);
      contatos.clear(); contatoGeo.dispose(); contatoMat.dispose(); texturas.forEach(t => t.dispose());
      if (contexto.visual === api) delete contexto.visual;
    },
  };
  contexto.visual = api; return api;
}
