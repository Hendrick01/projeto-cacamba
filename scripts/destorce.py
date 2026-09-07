"""Destorce o tronco da pose sentada: alinha a linha dos ombros com a dos quadris.
Uso: python3 scripts/destorce.py entrada.glb saida.glb [--cabeca 0]
A pose sentada mora nas rotações dos nós (os vértices ficam na pose de bind), então basta
girar a coluna. O giro é repartido por Spine02/Spine01/Spine em torno do eixo vertical da
raiz; braços e pescoço recebem o giro inverso para manter mãos e rosto onde estavam.
--cabeca é a guinada final desejada do rosto em graus (0 = de frente, +Z). Só NumPy.
"""
import argparse, json
import numpy as np
from glb_utils import *
from rig_dedos import quat_mat, unit

def mat_quat(R):
    t = np.trace(R)
    if t > 0: s = 0.5 / np.sqrt(t + 1); return [(R[2, 1] - R[1, 2]) * s, (R[0, 2] - R[2, 0]) * s, (R[1, 0] - R[0, 1]) * s, 0.25 / s]
    i = int(np.argmax(np.diag(R))); j, k = (i + 1) % 3, (i + 2) % 3
    s = 2 * np.sqrt(1 + R[i, i] - R[j, j] - R[k, k]); q = [0, 0, 0, 0]
    q[i] = 0.25 * s; q[j] = (R[j, i] + R[i, j]) / s; q[k] = (R[k, i] + R[i, k]) / s; q[3] = (R[k, j] - R[j, k]) / s
    return q

def yaw_mat(graus):
    c, s = np.cos(np.radians(graus)), np.sin(np.radians(graus)); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])

def destorce(src, dst, cabeca=0.0):
    g = GLB(src); j = g.j; nodes = j['nodes']; idx = {n['name']: i for i, n in enumerate(nodes)}
    parents = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    def world(i):
        n = nodes[i]; m = np.eye(4); m[:3, :3] = quat_mat(n.get('rotation', [0, 0, 0, 1])) @ np.diag(n.get('scale', [1, 1, 1])); m[:3, 3] = n.get('translation', [0, 0, 0])
        return world(parents[i]) @ m if i in parents else m
    pos = lambda nome: world(idx[nome])[:3, 3]
    yaw = lambda v: np.degrees(np.arctan2(v[2], v[0]))
    def gira_no_mundo(nome, graus):
        """Aplica uma guinada (eixo vertical do mundo) à rotação local do nó, sem mudar a posição."""
        i = idx[nome]; Rp = world(parents[i])[:3, :3] if i in parents else np.eye(3)
        Rl = quat_mat(nodes[i].get('rotation', [0, 0, 0, 1])); Rn = np.linalg.inv(Rp) @ yaw_mat(graus) @ Rp @ Rl
        nodes[i]['rotation'] = mat_quat(Rn)
    pos_antes = {n: pos(n) for n in ('LeftHand', 'RightHand')}
    quadris = yaw(pos('LeftUpLeg') - pos('RightUpLeg')); ombros = yaw(pos('LeftShoulder') - pos('RightShoulder'))
    rosto = world(idx['Head'])[:3, :3] @ np.array([0, 0, 1]); rosto_yaw = np.degrees(np.arctan2(rosto[0], rosto[2]))
    # yaw_mat(t) reduz a guinada medida por yaw() em t
    torcao = ombros - quadris
    for nome in ('Spine02', 'Spine01', 'Spine'): gira_no_mundo(nome, torcao / 3)
    assert abs(yaw(pos('LeftShoulder') - pos('RightShoulder')) - quadris) < 1, 'ombros não alinharam'
    for nome in ('LeftArm', 'RightArm'): gira_no_mundo(nome, -torcao)          # braços mantêm a orientação no mundo
    # rosto: yaw medido por atan2(x, z) cresce no sentido oposto ao de yaw(); zera pela guinada final pedida
    rosto2 = world(idx['Head'])[:3, :3] @ np.array([0, 0, 1]); rosto2_yaw = np.degrees(np.arctan2(rosto2[0], rosto2[2]))
    gira_no_mundo('neck', rosto2_yaw - cabeca)
    rosto3 = world(idx['Head'])[:3, :3] @ np.array([0, 0, 1]); rosto3_yaw = np.degrees(np.arctan2(rosto3[0], rosto3[2]))
    if abs(rosto3_yaw - cabeca) > 1: gira_no_mundo('neck', -2 * (rosto2_yaw - cabeca))
    rel = {'quadrisYaw': round(quadris, 1), 'ombrosAntes': round(ombros, 1), 'ombrosDepois': round(yaw(pos('LeftShoulder') - pos('RightShoulder')), 1),
           'rostoAntes': round(rosto_yaw, 1), 'rostoDepois': round(np.degrees(np.arctan2(*(world(idx['Head'])[:3, :3] @ np.array([0, 0, 1]))[[0, 2]])), 1),
           'maoEsqDeslocouCm': round(float(np.linalg.norm(pos('LeftHand') - pos_antes['LeftHand'])) * 100, 1), 'maoDirDeslocouCm': round(float(np.linalg.norm(pos('RightHand') - pos_antes['RightHand'])) * 100, 1)}
    j.setdefault('extras', {})['destorcido'] = rel
    g.write(dst); print(dst, json.dumps(rel))

if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('src'); p.add_argument('dst'); p.add_argument('--cabeca', type=float, default=0.0)
    a = p.parse_args(); destorce(a.src, a.dst, a.cabeca)
