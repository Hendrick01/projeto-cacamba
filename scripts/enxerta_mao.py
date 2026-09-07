"""Troca as mãos esculpidas de um personagem pela mão cartoon do elenco (scripts/mao_modelo.py).
Uso: python3 scripts/enxerta_mao.py personagem.glb mao.glb saida.glb [--escala 1.0] [--cor r,g,b]
Corta a mão esculpida no punho (triângulos cuja influência da mão passa de LIMIAR), encaixa a mão
nova no espaço do osso <Lado>Hand (fingers +Y, polegar para a lateral do polegar do rig, palma para
o lado que a mesa dobra), leva os 15 ossos de dedo para as juntas da mão nova e pinta a mão com a cor
de pele amostrada no antebraço da textura. Requer NumPy e Pillow.
"""
import argparse, io, json
import numpy as np
from PIL import Image
from glb_utils import *
from rig_dedos import DEDOS, ANGULOS, eixos_da_mao, grava_eixos_da_mao, quat_eixo, unit

LIMIAR = 0.35       # influência da mão a partir da qual o triângulo esculpido sai
CUFF_DENTRO = 0.10  # fração do comprimento da mão que entra na manga


def rgb_pele(g, prim, W, J, names, lado):
    """Cor mediana (linear) da textura na mão esculpida — o antebraço pode ser manga."""
    j = g.j; im = j['images'][j['textures'][j['materials'][prim['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source']]
    bv = j['bufferViews'][im['bufferView']]; data = bytes(g.bin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
    tex = np.asarray(Image.open(io.BytesIO(data)).convert('RGB'), np.float64) / 255
    uv = g.read(prim['attributes']['TEXCOORD_0'])
    ids = [names.index(lado + 'Hand')] + [names.index(f'{lado}Hand{f}{k}') for f in DEDOS for k in (1, 2, 3)]
    wh = (W * np.isin(J, ids)).sum(1); sel = np.flatnonzero(wh > 0.5)
    px = tex[np.clip((uv[sel, 1] % 1 * tex.shape[0]).astype(int), 0, tex.shape[0] - 1), np.clip((uv[sel, 0] % 1 * tex.shape[1]).astype(int), 0, tex.shape[1] - 1)]
    srgb = np.median(px, 0)
    return np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)


def enxerta(src, mao_src, dst, escala=1.0, cor=None):
    g = GLB(src); j = g.j; s = j['skins'][0]; nodes = j['nodes']; mesh = j['meshes'][0]; prim = mesh['primitives'][0]
    names = [nodes[i]['name'] for i in s['joints']]
    P = g.read(prim['attributes']['POSITION']).astype(np.float64); F = g.read(prim['indices']).ravel().reshape(-1, 3)
    J = g.read(prim['attributes']['JOINTS_0']).astype(np.int64); W = g.read(prim['attributes']['WEIGHTS_0']).astype(np.float64)
    ibm = g.read(s['inverseBindMatrices']).astype(np.float64)
    m = GLB(mao_src); mj = m.j; ms = mj['skins'][0]; mp = mj['meshes'][0]['primitives'][0]
    MP = m.read(mp['attributes']['POSITION']).astype(np.float64); MN = m.read(mp['attributes']['NORMAL']).astype(np.float64)
    MF = m.read(mp['indices']).ravel().reshape(-1, 3); MJ = m.read(mp['attributes']['JOINTS_0']).astype(np.int64); MW = m.read(mp['attributes']['WEIGHTS_0']).astype(np.float64)
    mnames = [mj['nodes'][i]['name'] for i in ms['joints']]; mibm = m.read(ms['inverseBindMatrices']).astype(np.float64)
    juntas_mao = {n: np.linalg.inv(mibm[k].reshape(4, 4).T)[:3, 3] for k, n in enumerate(mnames)}  # posição de cada osso no espaço canônico
    todos_dedos = [f'{lado}Hand{f}{k}' for lado in ('Left', 'Right') for f in DEDOS for k in (1, 2, 3)]
    assert all(n in names for n in todos_dedos), 'o personagem precisa dos 30 ossos de dedo (rig_dedos.py)'
    manter = np.ones(len(F), bool); novos = []; relatorio = {}
    for lado in ('Left', 'Right'):
        hand = names.index(lado + 'Hand'); dedos_ids = {f: [names.index(f'{lado}Hand{f}{k}') for k in (1, 2, 3)] for f in DEDOS}
        na_mao = np.isin(J, [hand] + sum(dedos_ids.values(), [])) & (W > 0); wh = (W * na_mao).sum(1)
        T = ibm[hand].reshape(4, 4).T; Tinv = np.linalg.inv(T)
        h = (np.c_[P, np.ones(len(P))] @ T.T)[:, :3]
        comp = float(np.percentile(h[wh > 0.5, 1], 99)) * escala   # punho → ponta, em cm
        # eixos do espaço da mão como a mesa os vê: lateral para o polegar, palma para onde os dedos dobram
        t1 = np.array(nodes[s['joints'][dedos_ids['Thumb'][0]]]['translation']); m1 = np.array(nodes[s['joints'][dedos_ids['Middle'][0]]]['translation'])
        lateral, palma, _ = eixos_da_mao(lado, t1, m1)
        Fr = np.c_[lateral, [0, 1, 0], palma] * comp                    # canônico → espaço da mão (cm)
        espelho = np.linalg.det(Fr) < 0
        # corta a mão esculpida
        # só o que está à frente do punho: pulseiras e punhos de manga ficam
        tri_mao = (wh[F] > LIMIAR).all(1) & (h[F, 1].mean(1) > 0.5); manter &= ~tri_mao
        # mão nova no espaço da malha (pose de bind)
        ph = MP @ Fr.T; pm = (np.c_[ph, np.ones(len(ph))] @ Tinv.T)[:, :3]
        # a reflexão já leva a normal para fora; só o sentido dos triângulos precisa virar
        Rn = Tinv[:3, :3] @ (np.c_[lateral, [0, 1, 0], palma]); nm = MN @ Rn.T; nm /= np.linalg.norm(nm, axis=1, keepdims=True)
        faces = MF[:, ::-1] if espelho else MF
        # ossos dos dedos nas juntas da mão nova (rotação identidade no espaço da mão, como no rig_dedos)
        for f in DEDOS:
            anterior = np.zeros(3)
            for k, jid in enumerate(dedos_ids[f]):
                loc = Fr @ juntas_mao[f'{f}{k + 1}']; n = nodes[s['joints'][jid]]
                n['translation'] = (loc - anterior).tolist(); n['rotation'] = [0, 0, 0, 1]; n.pop('scale', None)
                M = np.eye(4); M[:3, 3] = -loc; ibm[jid] = (M @ T).T.reshape(-1); anterior = loc
        eixo = grava_eixos_da_mao(nodes, s, names, lado, Fr @ juntas_mao['Thumb1'], Fr @ juntas_mao['Middle1'])
        for f in DEDOS:
            for k, jid in enumerate(dedos_ids[f]):
                n = nodes[s['joints'][jid]]; n['extras'] = {**n.get('extras', {}), 'dedo': True, 'segmento': k, 'eixoFlexao': eixo.tolist(), 'anguloFlexao': (ANGULOS['Thumb'] if f == 'Thumb' else ANGULOS['outros'])[k]}
        # pesos: nomes da mão canônica → ossos do personagem
        mapa = {k: (hand if n == 'Hand' else names.index(lado + 'Hand' + n)) for k, n in enumerate(mnames)}
        Jn = np.vectorize(mapa.get)(MJ); Jn[MW <= 0] = 0
        novos.append((pm, nm, faces, Jn, MW))
        relatorio[lado] = {'comprimentoCm': round(comp, 1), 'triangulosCortados': int(tri_mao.sum()), 'espelhado': bool(espelho)}
    # cor de pele
    pele = np.array([float(x) for x in cor.split(',')]) if cor else rgb_pele(g, prim, W, J, names, 'Left')
    j.setdefault('materials', []).append({'name': 'pele-mao', 'pbrMetallicRoughness': {'baseColorFactor': [*np.clip(pele, 0, 1).tolist(), 1.0], 'metallicFactor': 0.0, 'roughnessFactor': 0.9}})
    # grava: índices do corpo sem a mão velha + um primitivo novo com as duas mãos
    idx_t = 5123 if len(P) < 65536 else 5125
    prim['indices'] = g.add(F[manter].ravel(), 'SCALAR', idx_t)
    pos = np.vstack([n[0] for n in novos]); nor = np.vstack([n[1] for n in novos]); off = np.cumsum([0] + [len(n[0]) for n in novos])
    fac = np.vstack([n[2] + off[k] for k, n in enumerate(novos)]); jn = np.vstack([n[3] for n in novos]); wn = np.vstack([n[4] for n in novos])
    wn = wn / wn.sum(1, keepdims=True)
    mesh['primitives'].append({'attributes': {'POSITION': g.add(pos.astype(np.float32), 'VEC3'), 'NORMAL': g.add(nor.astype(np.float32), 'VEC3'),
                                              'JOINTS_0': g.add(jn, 'VEC4', 5121), 'WEIGHTS_0': g.add(wn.astype(np.float32), 'VEC4')},
                               'indices': g.add(fac.ravel(), 'SCALAR', 5123 if len(pos) < 65536 else 5125), 'material': len(j['materials']) - 1, 'mode': 4})
    g.overwrite(s['inverseBindMatrices'], ibm)
    # clip de teste com o eixo novo
    anim = next((a for a in j.get('animations', []) if a['name'] == 'dedosTeste'), None)
    if anim:
        por_no = {c['target']['node']: c['sampler'] for c in anim['channels']}
        for i, n in enumerate(nodes):
            ex = n.get('extras', {})
            if ex.get('dedo') and i in por_no:
                q = quat_eixo(ex['eixoFlexao'], ex['anguloFlexao'] * .6); g.overwrite(anim['samplers'][por_no[i]]['output'], np.array([[0, 0, 0, 1], q, q, [0, 0, 0, 1]], np.float32))
    j.setdefault('extras', {}).setdefault('rigDedos', {}).update(maoEnxertada={'fonte': 'scripts/mao_modelo.py', 'pele': np.round(pele, 3).tolist(), **relatorio})
    g.write(dst); print(dst, json.dumps(relatorio), 'pele', np.round(pele, 3).tolist())


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('src'); p.add_argument('mao'); p.add_argument('dst'); p.add_argument('--escala', type=float, default=1.0); p.add_argument('--cor')
    a = p.parse_args(); enxerta(a.src, a.mao, a.dst, a.escala, a.cor)
