"""Tira do .glb o que o jogo não usa e reescreve o binário justo.

Uso: python3 scripts/enxuga_modelo.py public/models/<slug>.glb [--saida arquivo.glb]

O gerador 3D entrega os vértices INTERCALADOS com um atributo `TANGENT` de 16
bytes — um terço de cada arquivo. Ele só serve para orientar o normal map com
uma base de tangentes assada; sem ele, o three.js deriva a base na tela
(`getTangentFrame`), que é o que a mesa já faz em toda malha sem tangente. O
relevo continua lá; o arquivo perde ~390 kB.

O que mais o script faz: grava cada atributo em bloco próprio e justo (o
intercalado guarda o espaço da tangente mesmo depois de removida), passa o
índice para 16 bits quando cabe, e copia adiante só as imagens que algum
material aponta. Nós, materiais, texturas, morphs e clips ficam como estão —
`Cabeca`, `MaoEsq`, `MaoDir` e `Assento` são o contrato da mesa, e é por isso
que o `gltf-transform prune` não serve aqui: ele os apaga por "não
referenciados".

Idempotente: rodar duas vezes não muda nada. Só NumPy.
"""
import argparse, sys
from pathlib import Path
import numpy as np
from glb_utils import GLB, TYPES, SIZES

FORA = {'TANGENT'}   # o que não vai adiante


def enxuga(src, dst):
    g = GLB(src); j = g.j
    antes = Path(src).stat().st_size

    # lê tudo o que fica ANTES de mexer no binário
    malhas = []
    for m in j.get('meshes', []):
        prims = []
        for pr in m['primitives']:
            # guarda o tipo de componente junto: JOINTS_0 é índice inteiro e
            # WEIGHTS_0 pode vir normalizado. Reescrever tudo como float32
            # gerava um arquivo MAIOR e um JOINTS_0 inválido.
            attrs = {k: (g.read(v), j['accessors'][v]) for k, v in pr['attributes'].items() if k not in FORA}
            idx = g.read(pr['indices']) if 'indices' in pr else None
            alvos = [{k: g.read(v) for k, v in t.items() if k not in FORA} for t in pr.get('targets', [])]
            prims.append((pr, attrs, idx, alvos))
        malhas.append(prims)
    # só as imagens que algum material aponta
    usadas = set()
    for m in j.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        for ti in [pbr.get('baseColorTexture'), pbr.get('metallicRoughnessTexture'),
                   m.get('normalTexture'), m.get('occlusionTexture'), m.get('emissiveTexture')]:
            if ti: usadas.add(j['textures'][ti['index']]['source'])
    imagens = {}
    for i, im in enumerate(j.get('images', [])):
        if i not in usadas or 'bufferView' not in im: continue
        bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
        imagens[i] = (bytes(g.bin[o:o + bv['byteLength']]), im.get('mimeType'))
    # o esqueleto guarda as matrizes de repouso no binário
    peles = [(s, g.read(s['inverseBindMatrices'])) for s in j.get('skins', []) if 'inverseBindMatrices' in s]
    # clips: cada amostrador tem tempo e valor
    amostras = [(sp, g.read(sp['input']), g.read(sp['output'])) for a in j.get('animations', []) for sp in a['samplers']]

    # binário novo, do zero
    g.bin = bytearray(); j['bufferViews'] = []; j['accessors'] = []
    def poe(arr, tipo, comp, alvo=None, normalizado=None):
        i = g.add(arr, tipo, comp)
        if alvo: j['bufferViews'][j['accessors'][i]['bufferView']]['target'] = alvo
        if normalizado: j['accessors'][i]['normalized'] = True
        return i
    for prims in malhas:
        for pr, attrs, idx, alvos in prims:
            pr['attributes'] = {k: poe(v, a0['type'], a0['componentType'], 34962, a0.get('normalized'))
                                for k, (v, a0) in attrs.items()}
            if idx is not None:
                # 16 bits quando o maior índice cabe: metade do espaço
                curto = int(idx.max()) < 65536
                pr['indices'] = poe(idx.astype(np.uint16 if curto else np.uint32), 'SCALAR', 5123 if curto else 5125, 34963)
                j['accessors'][pr['indices']].pop('min', None); j['accessors'][pr['indices']].pop('max', None)
            if alvos:
                pr['targets'] = [{k: poe(v, 'VEC3', 5126, 34962) for k, v in t.items()} for t in alvos]
            del attrs
    for i, (dados, mime) in imagens.items():
        g.bin.extend(b'\0' * ((-len(g.bin)) % 4)); off = len(g.bin); g.bin.extend(dados)
        j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(dados)})
        j['images'][i] = {'bufferView': len(j['bufferViews']) - 1, **({'mimeType': mime} if mime else {})}
    for s, mats in peles:
        s['inverseBindMatrices'] = poe(mats, 'MAT4', 5126)
    for sp, entrada, saida in amostras:
        sp['input'] = poe(entrada, 'SCALAR', 5126)
        sp['output'] = poe(saida, 'VEC3' if saida.shape[1] == 3 else 'VEC4' if saida.shape[1] == 4 else 'SCALAR', 5126)

    g.write(dst)
    depois = Path(dst).stat().st_size
    print('%s: %d kB → %d kB (−%.0f%%)' % (Path(dst).name, antes // 1024, depois // 1024, 100 * (1 - depois / antes)))


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('--saida')
    a = ap.parse_args(); enxuga(a.src, a.saida or a.src)
