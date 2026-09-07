// Usa o Three.js ja versionado pelo projeto; nao baixa dependencias novas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { instalaVisual3d } from '../public/visual3d.js';

function fixture() {
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(55, 1.7, 0.1, 40);
  camera.position.set(0.3, 1.2, 1.8);
  const luz = new T.HemisphereLight(0xffc98f, 0x8a4a22, 0.55); scene.add(luz);
  scene.environmentIntensity = 0.5;
  const renderer = { capabilities: { getMaxAnisotropy: () => 2 }, toneMappingExposure: 1,
    info: { render: { calls: 12, triangles: 40 }, memory: { textures: 2 } } };
  const raiz = new T.Group(), grupo = new T.Group(); grupo.add(raiz); scene.add(grupo);
  const head = new T.Bone(); head.name = 'Head'; head.rotation.set(0.2, 0.3, 0.1); raiz.add(head);
  const hand = new T.Bone(); hand.name = 'LeftHand'; hand.rotation.set(0.4, -0.1, 0.2); raiz.add(hand);
  const finger = new T.Bone(); finger.name = 'LeftHandIndex1'; finger.rotation.x = 0.68; hand.add(finger);
  const material = new T.MeshStandardMaterial({ color: 0x806344, roughness: 0.55 });
  material.name = 'tecido'; material.map = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); material.map.anisotropy = 4;
  const mesh = new T.Mesh(new T.BoxGeometry(0.2, 0.2, 0.2), material); raiz.add(mesh);
  mesh.morphTargetDictionary = { eyeBlinkLeft: 0, eyeBlinkRight: 1 }; mesh.morphTargetInfluences = [0.1, 0.2];
  const modelo = { raiz, acoes: {} }, assentos = new Map([['dri', { grupo, assento: { modelo } }]]);
  const contexto = { scene, camera, renderer, assentos };
  const render = () => { scene.updateMatrixWorld(true); scene.onBeforeRender(renderer, scene, camera); scene.onAfterRender(renderer, scene, camera); };
  return { contexto, scene, camera, renderer, luz, raiz, head, hand, finger, mesh, material, modelo, assentos, grupo, render };
}

test('instalar duas vezes nao duplica luz, callbacks ou recursos', () => {
  const f = fixture(), a = instalaVisual3d(f.contexto);
  assert.equal(a, instalaVisual3d(f.contexto));
  assert.equal(f.scene.children.filter(o => o.name === 'visual-recorte').length, 1);
  assert.equal(f.scene.getObjectByName('visual-recorte').castShadow, false);
  a.dispose();
});
test('pose de dedos, maos, raiz e cabeca e preservada entre quadros', () => {
  const f = fixture(), a = instalaVisual3d(f.contexto);
  const h = f.head.quaternion.clone(), mao = f.hand.quaternion.clone(), dedo = f.finger.quaternion.clone(), pos = f.raiz.position.clone();
  for (let i = 0; i < 120; i++) {
    f.scene.updateMatrixWorld(true); f.scene.onBeforeRender(f.renderer, f.scene, f.camera);
    assert.ok(f.hand.quaternion.equals(mao)); assert.ok(f.finger.quaternion.equals(dedo)); assert.ok(f.raiz.position.equals(pos));
    f.scene.onAfterRender(f.renderer, f.scene, f.camera); assert.ok(f.head.quaternion.equals(h));
    assert.deepEqual(f.mesh.morphTargetInfluences, [0.1, 0.2]);
  }
  assert.equal(a.diagnostico().contatos, 1); a.dispose();
});
test('provador nunca recebe micromovimento nem alteracao da camera orbital', () => {
  const f = fixture(); f.contexto.atual = () => ({ m: f.modelo, nome: 'dri' });
  const a = instalaVisual3d(f.contexto, { modo: 'provador', animar: false });
  const h = f.head.quaternion.clone(), c = f.camera.position.clone();
  f.scene.onBeforeRender(f.renderer, f.scene, f.camera);
  assert.ok(f.head.quaternion.equals(h)); assert.ok(f.camera.position.equals(c));
  f.scene.onAfterRender(f.renderer, f.scene, f.camera); a.dispose();
});
test('osso de cabeca com maos descendentes nao e animado', () => {
  const f = fixture(); f.head.add(f.hand);
  const h = f.head.quaternion.clone(), a = instalaVisual3d(f.contexto);
  f.scene.onBeforeRender(f.renderer, f.scene, f.camera); assert.ok(f.head.quaternion.equals(h));
  f.scene.onAfterRender(f.renderer, f.scene, f.camera); a.dispose();
});
test('reacoes do jogo nao recebem micromovimento adicional', () => {
  const f = fixture(); f.assentos.get('dri').caraAte = Infinity;
  const h = f.head.quaternion.clone(), a = instalaVisual3d(f.contexto);
  f.scene.onBeforeRender(f.renderer, f.scene, f.camera); assert.ok(f.head.quaternion.equals(h));
  f.scene.onAfterRender(f.renderer, f.scene, f.camera); a.dispose();
});
test('textura, cor, geometria e transparencias originais nao sao substituidas', () => {
  const f = fixture(), cor = f.material.color.clone(), mapa = f.material.map, geo = f.mesh.geometry;
  const a = instalaVisual3d(f.contexto); f.render();
  assert.equal(f.material.map, mapa); assert.ok(f.material.color.equals(cor)); assert.equal(f.mesh.geometry, geo);
  assert.equal(f.material.transparent, false); assert.equal(f.material.roughness, 0.9); assert.equal(mapa.anisotropy, 2);
  a.dispose(); assert.equal(f.material.roughness, 0.55); assert.equal(mapa.anisotropy, 4);
});
test('contatos sao reutilizados e removidos quando o assento sai', () => {
  const f = fixture(), a = instalaVisual3d(f.contexto); f.render();
  const contato = f.scene.getObjectByName('visual-contato'); f.render();
  assert.equal(f.scene.getObjectByName('visual-contato'), contato);
  f.assentos.clear(); f.render(); assert.equal(a.diagnostico().contatos, 0); a.dispose();
});
test('desinstalar restaura luz e encadeamento dos callbacks', () => {
  const f = fixture(); let antes = 0, depois = 0;
  const b = () => { antes++; }, d = () => { depois++; }; f.scene.onBeforeRender = b; f.scene.onAfterRender = d;
  const cor = f.luz.color.clone(), a = instalaVisual3d(f.contexto); f.render();
  assert.equal(antes, 1); assert.equal(depois, 1); a.dispose(); a.dispose();
  assert.equal(f.scene.onBeforeRender, b); assert.equal(f.scene.onAfterRender, d);
  assert.ok(f.luz.color.equals(cor)); assert.equal(f.luz.intensity, 0.55); assert.equal(f.scene.environmentIntensity, 0.5);
  assert.equal(f.contexto.visual, undefined);
});
test('piso e feltro recebem relevo pequeno sem novo mapa de sombra', () => {
  const f = fixture();
  const piso = new T.Mesh(new T.PlaneGeometry(10, 9), new T.MeshStandardMaterial()); piso.rotation.x = -Math.PI / 2; f.scene.add(piso);
  const feltro = new T.MeshStandardMaterial(), mesa = new T.Mesh(new T.CylinderGeometry(1.15, 1.15, 0.075), [new T.MeshStandardMaterial(), feltro, new T.MeshStandardMaterial()]); f.scene.add(mesa);
  const a = instalaVisual3d(f.contexto);
  assert.equal(piso.material.bumpScale, 0.0007); assert.equal(feltro.bumpScale, 0.001);
  assert.equal(feltro.roughness, 0.98); assert.equal(feltro.bumpMap.colorSpace, T.NoColorSpace);
  assert.equal(a.diagnostico().sombrasExtras, 0); a.dispose();
});
