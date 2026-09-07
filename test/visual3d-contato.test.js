import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../public/vendor/three.module.js';
import { instalaVisual3d } from '../public/visual3d.js';

function fixture() {
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(55, 1.7, 0.1, 40);
  camera.position.set(0, 1.2, 1.8);
  const renderer = { capabilities: { getMaxAnisotropy: () => 1 }, toneMappingExposure: 1 };
  const pai = new T.Group(), grupo = new T.Group();
  pai.position.set(1, 0, -2); grupo.position.set(0.5, 0, -0.5);
  pai.add(grupo); scene.add(pai);
  const contexto = { scene, camera, renderer, assentos: new Map([['dri', { grupo }]]) };
  const visual = instalaVisual3d(contexto);
  const quadro = () => {
    // Assim como WebGLRenderer, atualiza a cena ANTES do callback.
    scene.updateMatrixWorld(true);
    scene.onBeforeRender(renderer, scene, camera);
    const contato = scene.getObjectByName('visual-contato');
    scene.onAfterRender(renderer, scene, camera);
    return contato;
  };
  return { visual, grupo, pai, quadro };
}

test('contato tem matriz correta no primeiro quadro e apos mover o assento', () => {
  const f = fixture();
  try {
    const primeiro = f.quadro();
    const p = new T.Vector3().setFromMatrixPosition(primeiro.matrixWorld);
    assert.ok(p.distanceTo(new T.Vector3(1.5, 0.003, -2.5)) < 1e-9);
    const normal = new T.Vector3(0, 0, 1).transformDirection(primeiro.matrixWorld);
    assert.ok(normal.distanceTo(new T.Vector3(0, 1, 0)) < 1e-9);
    f.grupo.position.set(-0.25, 0, 0.75);
    const segundo = f.quadro();
    assert.equal(primeiro, segundo);
    p.setFromMatrixPosition(segundo.matrixWorld);
    assert.ok(p.distanceTo(new T.Vector3(0.75, 0.003, -1.25)) < 1e-9);
  } finally { f.visual.dispose(); }
});

test('contato respeita visibilidade herdada sem ficar solto no piso', () => {
  const f = fixture();
  try {
    assert.equal(f.quadro().visible, true);
    f.pai.visible = false;
    assert.equal(f.quadro().visible, false);
    f.pai.visible = true;
    assert.equal(f.quadro().visible, true);
    f.grupo.visible = false;
    assert.equal(f.quadro().visible, false);
  } finally { f.visual.dispose(); }
});
