"""Pose "segurando cartas" para os braços, igual para todo o elenco (esqueleto de 24 ossos).
Uso: python3 scripts/pose_cartas.py entrada.glb saida.glb
Referência: cotovelos apoiados perto da borda da mesa, antebraços subindo, as duas mãos juntas
na frente do peito com o leque de pé — mão esquerda por trás do leque (palma para o rosto, dedos
para cima), mão direita apoiando a borda direita. Só os ombros/braços/antebraços/mãos mudam;
pernas, quadril e coluna ficam como estão (destorce.py já os deixou de frente).
Espaço da raiz: o personagem olha para +Z, +Y para cima, direita do personagem em -X, metros.
Precisa dos extras lateral/palma no osso da mão (rig_dedos.py) para orientar o punho. Só NumPy.
"""
import argparse, json
import numpy as np
from glb_utils import *
from rig_dedos import quat_mat, unit
from destorce import mat_quat

ALVOS = {   # espaço da raiz (metros): cotovelo, mão, direção dos dedos, direção da palma
    'Left':  {'cotovelo': (0.25, 0.74, 0.15), 'mao': (0.06, 0.84, 0.22), 'dedos': (-0.15, 0.92, 0.35), 'palma': (0.05, 0.28, -0.96)},
    'Right': {'cotovelo': (-0.26, 0.74, 0.15), 'mao': (-0.07, 0.81, 0.23), 'dedos': (0.05, 0.95, 0.30), 'palma': (-0.90, 0.15, -0.40)},
}

def pose(src, dst, alvos=ALVOS):
    g = GLB(src); j = g.j; nodes = j['nodes']; idx = {n['name']: i for i, n in enumerate(nodes)}
    parents = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    def world(i):
        n = nodes[i]; m = np.eye(4); m[:3, :3] = quat_mat(n.get('rotation', [0, 0, 0, 1])) @ np.diag(n.get('scale', [1, 1, 1])); m[:3, 3] = n.get('translation', [0, 0, 0])
        return world(parents[i]) @ m if i in parents else m
    pos = lambda nome: world(idx[nome])[:3, 3]
    def rot(i):
        """Rotação no mundo sem a escala (o Armature tem escala 0,01)."""
        M = world(i)[:3, :3]; return M / np.linalg.norm(M, axis=0, keepdims=True)
    def orienta(nome, filho, alvo):
        """Gira o nó no mundo para o filho apontar para `alvo` (rotação mínima; mantém a torção)."""
        i = idx[nome]; W = world(i); p = W[:3, 3]; de = unit(pos(filho) - p); para = unit(np.asarray(alvo) - p)
        v = np.cross(de, para); s = np.linalg.norm(v); c = np.dot(de, para)
        if s < 1e-9: R = np.eye(3) if c > 0 else -np.eye(3)
        else:
            K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]) / s; ang = np.arctan2(s, c)
            R = np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * K @ K
        Rp = rot(parents[i]); Rl = quat_mat(nodes[i].get('rotation', [0, 0, 0, 1]))
        nodes[i]['rotation'] = mat_quat(Rp.T @ R @ Rp @ Rl)
    rel = {}
    for lado, a in alvos.items():
        ombro, cot, mao = f'{lado}Arm', f'{lado}ForeArm', f'{lado}Hand'
        o = pos(ombro); l1 = np.linalg.norm(pos(cot) - o); l2 = np.linalg.norm(pos(mao) - pos(cot))
        alvo = np.asarray(a['mao'], float); d = np.linalg.norm(alvo - o)
        d = np.clip(d, abs(l1 - l2) + 0.002, (l1 + l2) * 0.985); dirv = unit(alvo - o); alvo = o + dirv * d
        # cotovelo: no círculo possível, o ponto mais perto do cotovelo pedido
        x = (l1 * l1 - l2 * l2 + d * d) / (2 * d); h = np.sqrt(max(0.0, l1 * l1 - x * x))
        polo = np.asarray(a['cotovelo'], float) - o; polo -= dirv * np.dot(polo, dirv); n = unit(polo) if np.linalg.norm(polo) > 1e-6 else unit(np.cross(dirv, [0, 1, 0]))
        cotovelo = o + dirv * x + n * h
        orienta(ombro, cot, cotovelo); orienta(cot, mao, alvo)
        # punho: o quadro da mão no espaço do osso é DEFINIDO pela anatomia (Y = dedos, palma = +Z,
        # polegar = +X na esquerda e -X na direita: polegar × dedos = palma na esquerda) e gravado
        # nos extras para dedos3d.js e enxerta_mao.py; depois o osso gira para os alvos pedidos
        i = idx[mao]; sgn = 1 if lado == 'Left' else -1
        y_l = np.array([0., 1, 0]); palma_l = np.array([0., 0, 1]); lat_l = np.array([1., 0, 0]) * sgn
        nodes[i]['extras'] = {**nodes[i].get('extras', {}), 'lateral': lat_l.tolist(), 'palma': palma_l.tolist()}
        eixo = unit(np.cross(y_l, palma_l))
        for k, n in enumerate(nodes):
            if n['name'].startswith(lado + 'Hand') and n.get('extras', {}).get('dedo'): n['extras']['eixoFlexao'] = eixo.tolist()
        f = unit(np.asarray(a['dedos'], float)); p = unit(np.asarray(a['palma'], float)); p = unit(p - f * np.dot(p, f)); lat_w = np.cross(f, p) * sgn
        R_w = np.c_[lat_w, f, p] @ np.linalg.inv(np.c_[lat_l, y_l, palma_l])
        nodes[i]['rotation'] = mat_quat(rot(parents[i]).T @ R_w)
        lat_final = rot(i) @ lat_l
        rel[lado] = {'mao': np.round(pos(mao), 3).tolist(), 'cotovelo': np.round(pos(cot), 3).tolist(), 'alcance': round(float(d), 3), 'polegarParaDentro': round(float(np.dot(lat_final, [-1 if lado == 'Left' else 1, 0, 0])), 2)}
    j.setdefault('extras', {})['poseCartas'] = rel
    g.write(dst); print(dst, json.dumps(rel))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); a = ap.parse_args(); pose(a.src, a.dst)
