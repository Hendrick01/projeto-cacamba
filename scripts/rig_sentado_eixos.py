"""Grava nos ossos das mãos de um rig sentado (rig_sentado.py) o quadro que a mesa lê:
extras.lateral/palma no osso <Lado>Hand e extras.dedo/segmento/eixoFlexao/anguloFlexao nas falanges.
Uso: python3 scripts/rig_sentado_eixos.py entrada.glb saida.glb
No espaço da raiz o personagem olha para +Z: a palma da mão que segura o leque fica voltada para o
rosto e um pouco para cima; o eixo Y de cada osso aponta ao longo dele (para os dedos). A lateral
segue a identidade anatômica (polegar × dedos = palma na esquerda). Só NumPy.
"""
import argparse, json
import numpy as np
from glb_utils import *
from rig_dedos import quat_mat, unit, DEDOS, ANGULOS

PALMA_MUNDO = {'Left': np.array([0.15, 0.35, -0.92]), 'Right': np.array([-0.15, 0.35, -0.92])}

def eixos(src, dst):
    g = GLB(src); j = g.j; nodes = j['nodes']; idx = {n['name']: i for i, n in enumerate(nodes)}
    parents = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    for n in nodes:   # rotações unitárias: a mesa compara quaternions com tolerância de 1e-7
        if 'rotation' in n: q = np.array(n['rotation'], float); n['rotation'] = (q / np.linalg.norm(q)).tolist()
    def rot(i):
        n = nodes[i]; R = quat_mat(n.get('rotation', [0, 0, 0, 1])); return (rot(parents[i]) @ R) if i in parents else R
    for lado, s in (('Left', 1), ('Right', -1)):
        i = idx[lado + 'Hand']; R = rot(i)                       # local -> raiz
        palma_l = R.T @ unit(PALMA_MUNDO[lado]); y = np.array([0, 1, 0.]); palma_l = unit(palma_l - y * np.dot(palma_l, y))
        lateral_l = unit(np.cross(y, palma_l)) * s                # esquerda: lateral × Y = palma
        nodes[i]['extras'] = {**nodes[i].get('extras', {}), 'lateral': lateral_l.tolist(), 'palma': palma_l.tolist()}
        eixo = unit(np.cross(y, palma_l))
        for f in DEDOS:
            for k in range(3):
                n = nodes[idx[f'{lado}Hand{f}{k + 1}']]
                n['extras'] = {**n.get('extras', {}), 'dedo': True, 'segmento': k, 'eixoFlexao': eixo.tolist(), 'anguloFlexao': (ANGULOS['Thumb'] if f == 'Thumb' else ANGULOS['outros'])[k]}
        print(lado, 'palma(local)', np.round(palma_l, 2).tolist(), 'lateral', np.round(lateral_l, 2).tolist())
    g.write(dst)

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); a = ap.parse_args(); eixos(a.src, a.dst)
