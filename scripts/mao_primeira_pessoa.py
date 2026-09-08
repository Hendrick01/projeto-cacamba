"""Recorta as MÃOS do personagem para a primeira pessoa da mesa 3D.

Uso: python3 scripts/mao_primeira_pessoa.py public/models/<slug>.glb public/models/<slug>-maos.glb

Na mesa você vê as suas próprias mãos nas pontas do leque. Elas eram dois
desenhos 2D chapados, do tempo em que o elenco todo era desenho; com o elenco
esculpido, a mão que você vê passa a ser a MÃO DO SEU PERSONAGEM, recortada da
própria escultura — mesma pele, mesma pulseira, e ela recebe a luz do boteco.

O recorte cresce pela SUPERFÍCIE a partir do vértice mais perto do nó `MaoEsq`/
`MaoDir`, até `--alcance` metros de distância medida sobre a malha. Pelo ar não
serve: a outra mão está a 10 cm e o peito a 20, e uma esfera traria os dois.
A malha chega partida em ~mil pedaços no índice (costuras de UV), mas a
superfície é uma só — por isso a vizinhança é montada sobre os vértices
soldados por posição.

A cor não vem de textura: o atlas do gerador espalha os triângulos da mão pelo
mapa inteiro, então recortá-lo não economizaria nada e carregar 1 MB de textura
para uma mão de 50 px na tela seria desperdício. A cor de cada vértice é lida
do mapa na hora e gravada em COLOR_0 (em linear, que é o que o glTF espera).
Cada arquivo sai com ~60 kB.

Só NumPy e Pillow.
"""
import argparse, heapq, io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image
from glb_utils import GLB


def carrega(path):
    """Malha em metros, no espaço do assento (o nó da malha traz escala e deslocamento)."""
    g = GLB(path); j = g.j
    P, F, UV, N, base = [], [], [], [], 0
    no = next(n for n in j['nodes'] if 'mesh' in n)
    esc = np.array(no.get('scale', [1, 1, 1]), float); desl = np.array(no.get('translation', [0, 0, 0]), float)
    for pr in j['meshes'][no['mesh']]['primitives']:
        pos = g.read(pr['attributes']['POSITION']).astype(float) * esc + desl
        P.append(pos)
        UV.append(g.read(pr['attributes']['TEXCOORD_0']).astype(float) if 'TEXCOORD_0' in pr['attributes'] else np.zeros((len(pos), 2)))
        N.append(g.read(pr['attributes']['NORMAL']).astype(float) if 'NORMAL' in pr['attributes'] else np.zeros((len(pos), 3)))
        F.append(g.read(pr['indices']).astype(int).reshape(-1, 3) + base); base += len(pos)
    nos = {n['name']: np.array(n['translation'], float) for n in j['nodes'] if 'translation' in n and 'mesh' not in n}
    return g, np.vstack(P), np.vstack(F), np.vstack(UV), np.vstack(N), nos


def cor_base(g):
    """A textura de cor do material, como array RGB."""
    j = g.j
    for m in j.get('materials', []):
        ti = m.get('pbrMetallicRoughness', {}).get('baseColorTexture')
        if not ti: continue
        im = j['images'][j['textures'][ti['index']]['source']]
        bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
        return np.array(Image.open(io.BytesIO(bytes(g.bin[o:o + bv['byteLength']]))).convert('RGB'))
    return None


def recorta(P, F, UV, N, alvo, alcance, raio):
    """Os triângulos a até `alcance` metros de `alvo` medidos SOBRE a malha e
    dentro de `raio` em linha reta. O alcance sobre a malha é o que impede o
    recorte de pular para o peito, que está a 20 cm de distância no ar; o raio é
    o que o mantém do TAMANHO DE UMA MÃO nas esculturas em que as duas mãos se
    tocam (o Mufasa é uma) e a superfície passa de uma para a outra."""
    _, inv = np.unique(np.round(P, 5), axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    viz = {}
    for t in inv[F]:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            viz.setdefault(int(a), set()).add(int(b)); viz.setdefault(int(b), set()).add(int(a))
    pos = np.zeros((inv.max() + 1, 3)); pos[inv] = P
    perto = np.linalg.norm(pos - alvo, axis=1) <= raio
    semente = int(inv[int(np.argmin(np.linalg.norm(P - alvo, axis=1)))])
    d = {semente: 0.0}; fila = [(0.0, semente)]
    while fila:
        dist, v = heapq.heappop(fila)
        if dist > d.get(v, 1e9) + 1e-12: continue
        for w in viz.get(v, ()):
            if not perto[w]: continue
            nd = dist + float(np.linalg.norm(pos[w] - pos[v]))
            if nd < d.get(w, 1e9) and nd <= alcance: d[w] = nd; heapq.heappush(fila, (nd, w))
    dentro = np.isin(inv, np.fromiter(d.keys(), int))
    manter = dentro[F].all(1)
    idx = np.unique(F[manter]); remap = -np.ones(len(P), int); remap[idx] = np.arange(len(idx))
    return P[idx], remap[F[manter]], UV[idx], N[idx]


def para_linear(c):
    """sRGB (0..1) para linear: é assim que o glTF lê COLOR_0."""
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def cores(tex, uv):
    if tex is None: return np.ones((len(uv), 3))
    h, w = tex.shape[:2]
    x = np.clip((uv[:, 0] % 1.0 * w).astype(int), 0, w - 1)
    y = np.clip((uv[:, 1] % 1.0 * h).astype(int), 0, h - 1)
    return para_linear(tex[y, x].astype(float) / 255.0)


def monta(src, dst, alcance, raio):
    g, P, F, UV, N, nos = carrega(src)
    for n in ('MaoEsq', 'MaoDir'):
        if n not in nos: raise SystemExit(f'{src}: sem o nó {n} — passe pelo prepara_sentado.py antes')
    tex = cor_base(g)
    novo = GLB.__new__(GLB)
    novo.bin = bytearray()
    novo.j = {'asset': {'version': '2.0', 'generator': 'cacamba/mao_primeira_pessoa'},
              'buffers': [{'byteLength': 0}], 'bufferViews': [], 'accessors': [],
              'materials': [{'name': 'pele', 'pbrMetallicRoughness': {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.72}}],
              'meshes': [], 'nodes': [], 'scenes': [{'nodes': [0, 1]}], 'scene': 0}
    total = 0
    for lado in ('Esq', 'Dir'):
        p, f, uv, n = recorta(P, F, UV, N, nos['Mao' + lado], alcance, raio)
        p = p - nos['Mao' + lado]          # o punho da mão fica na origem do nó
        ap = novo.add(p.astype(np.float32), 'VEC3')
        an = novo.add(n.astype(np.float32), 'VEC3')
        ac = novo.add(cores(tex, uv).astype(np.float32), 'VEC3')
        ai = novo.add(f.astype(np.uint32).reshape(-1, 1), 'SCALAR', 5125)
        novo.j['accessors'][ai].pop('min', None); novo.j['accessors'][ai].pop('max', None)
        novo.j['meshes'].append({'primitives': [{'attributes': {'POSITION': ap, 'NORMAL': an, 'COLOR_0': ac}, 'indices': ai, 'material': 0}]})
        novo.j['nodes'].append({'name': lado, 'mesh': len(novo.j['meshes']) - 1})
        total += len(f)
    novo.write(dst)
    print('%s: %d triângulos nas duas mãos, %d kB' % (Path(dst).name, total, Path(dst).stat().st_size // 1024))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--alcance', type=float, default=0.24, help='metros sobre a malha a partir do nó da mão')
    ap.add_argument('--raio', type=float, default=0.115, help='metros em linha reta: o tamanho de uma mão')
    a = ap.parse_args(); monta(a.src, a.dst, a.alcance, a.raio)
