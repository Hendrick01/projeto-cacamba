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


def solda(P, extras):
    """Junta os vértices repetidos por posição (as costuras de UV partem a malha
    no índice). Sem isso a subdivisão abriria rachaduras nas costuras: cada lado
    seria suavizado por conta própria."""
    chave, inv = np.unique(np.round(P, 5), axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    n = inv.max() + 1
    saida = []
    for e in extras:
        soma = np.zeros((n, e.shape[1])); conta = np.zeros(n)
        np.add.at(soma, inv, e); np.add.at(conta, inv, 1)
        saida.append(soma / conta[:, None])
    return chave.astype(float), inv, saida


TETO_TRIANGULOS = 5000   # por mão. Só o arquivo do SEU personagem é baixado (~250 kB),
                         # ao lado de ~1,7 MB por adversário: dá para refinar todos.


def apara(P, F, erosao=2):
    """Limpa a borda do corte. O corte é uma esfera em volta da pinça: ela
    atravessa o punho de viés e deixa uma tira fina de antebraço pendurada, que
    o refino transforma numa língua. Primeiro caem os triângulos com duas
    arestas livres (as farpas), depois `erosao` anéis inteiros a partir da
    borda — é isso que come a tira. Devolve só o pedaço maior."""
    def borda_de(F):
        conta = {}
        for t in F:
            for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
                k = (min(a, b), max(a, b)); conta[k] = conta.get(k, 0) + 1
        return conta
    for _ in range(6):
        conta = borda_de(F)
        fica = np.array([sum(conta[(min(a, b), max(a, b))] == 1 for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0]))) < 2 for t in F])
        if fica.all(): break
        F = F[fica]
    for _ in range(erosao):
        conta = borda_de(F)
        livre = {v for (a, b), c in conta.items() if c == 1 for v in (a, b)}
        fica = np.array([not (t[0] in livre or t[1] in livre or t[2] in livre) for t in F])
        if not fica.any(): break
        F = F[fica]
    # o pedaço maior: o corte pode soltar lascas
    pai = np.arange(len(P))
    def acha(a):
        while pai[a] != a: pai[a] = pai[pai[a]]; a = pai[a]
        return a
    for t in F:
        for a, b in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])):
            ra, rb = acha(int(a)), acha(int(b))
            if ra != rb: pai[ra] = rb
    raiz = np.array([acha(int(t[0])) for t in F])
    u, c = np.unique(raiz, return_counts=True)
    F = F[raiz == u[c.argmax()]]
    idx = np.unique(F); remap = -np.ones(len(P), int); remap[idx] = np.arange(len(idx))
    return idx, remap[F]


def subdivide(P, F, C):
    """Um passo de Loop: cada triângulo vira quatro e a malha se aproxima da
    superfície limite — é o que tira a cara de origami de uma mão que herdou
    ~800 triângulos de um corpo decimado a 32 mil. As bordas (o corte no punho)
    seguem a regra de fronteira, para não encolherem para dentro."""
    # para cada aresta, os vértices OPOSTOS a ela (um por triângulo que a usa):
    # dois numa aresta interna, um só numa de borda
    op = {}
    for t in F:
        for a, b, c in ((t[0], t[1], t[2]), (t[1], t[2], t[0]), (t[2], t[0], t[1])):
            op.setdefault((min(a, b), max(a, b)), []).append(c)
    viz = {}
    for a, b in op:
        viz.setdefault(a, set()).add(b); viz.setdefault(b, set()).add(a)
    borda = {i: set() for i in range(len(P))}
    for k, o in op.items():
        if len(o) == 1: borda[k[0]].add(k[1]); borda[k[1]].add(k[0])

    novos, novoC, meio = [], [], {}
    for k, o in op.items():
        a, b = k
        if len(o) == 2: p = 3 / 8 * (P[a] + P[b]) + 1 / 8 * (P[o[0]] + P[o[1]])
        else: p = (P[a] + P[b]) / 2
        meio[k] = len(P) + len(novos); novos.append(p); novoC.append((C[a] + C[b]) / 2)

    P2 = P.copy()
    for v in range(len(P)):
        if borda[v]:
            if len(borda[v]) == 2:
                a, b = tuple(borda[v]); P2[v] = 3 / 4 * P[v] + 1 / 8 * (P[a] + P[b])
        else:
            viz_v = viz.get(v, ())
            n = len(viz_v)
            if n < 3: continue
            beta = (5 / 8 - (3 / 8 + np.cos(2 * np.pi / n) / 4) ** 2) / n
            P2[v] = (1 - n * beta) * P[v] + beta * sum(P[w] for w in viz_v)

    P3 = np.vstack([P2, np.array(novos)]); C3 = np.vstack([C, np.array(novoC)])
    F3 = []
    for t in F:
        a, b, c = t
        ab, bc, ca = meio[(min(a, b), max(a, b))], meio[(min(b, c), max(b, c))], meio[(min(c, a), max(c, a))]
        F3 += [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]
    return P3, np.array(F3), C3


def normais(P, F):
    """Normais lisas, da malha já refinada: as do arquivo eram do corpo inteiro
    antes do corte e do refino."""
    N = np.zeros_like(P)
    A, B, C = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    fn = np.cross(B - A, C - A)
    for k in range(3): np.add.at(N, F[:, k], fn)
    return N / np.maximum(1e-12, np.linalg.norm(N, axis=1))[:, None]


def para_linear(c):
    """sRGB (0..1) para linear: é assim que o glTF lê COLOR_0."""
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def cores(tex, uv):
    if tex is None: return np.ones((len(uv), 3))
    h, w = tex.shape[:2]
    x = np.clip((uv[:, 0] % 1.0 * w).astype(int), 0, w - 1)
    y = np.clip((uv[:, 1] % 1.0 * h).astype(int), 0, h - 1)
    return para_linear(tex[y, x].astype(float) / 255.0)


def monta(src, dst, alcance, raio, refino, erosao):
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
        c = cores(tex, uv)
        # solda antes de refinar: as costuras de UV partem a malha no índice, e
        # subdividir os dois lados por conta própria abriria rachaduras
        p, inv, (c,) = solda(p, [c])
        f = inv[f]
        idx, f = apara(p, f, erosao); p, c = p[idx], c[idx]
        # refina até o orçamento, olhando o resultado do passo (ele multiplica
        # por quatro): quem já veio denso — o Mufasa tem o dobro do Junior — não
        # precisa de um passo que quadruplicaria o arquivo
        for _ in range(refino):
            if len(f) * 4 > TETO_TRIANGULOS: break
            p, f, c = subdivide(p, f, c)
        n = normais(p, f)
        p = p - nos['Mao' + lado]          # a pinça da mão fica na origem do nó
        ap = novo.add(p.astype(np.float32), 'VEC3')
        an = novo.add(n.astype(np.float32), 'VEC3')
        ac = novo.add(c.astype(np.float32), 'VEC3')
        # índice de 16 bits: são poucos milhares de vértices, e isso tira 40 kB
        ai = novo.add(f.astype(np.uint16).reshape(-1, 1), 'SCALAR', 5123)
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
    ap.add_argument('--refino', type=int, default=1, help='no máximo tantos passos de subdivisão de Loop; para ao chegar em ~2.600 triângulos por mão')
    ap.add_argument('--erosao', type=int, default=2, help='anéis de triângulos a comer a partir da borda do corte')
    a = ap.parse_args(); monta(a.src, a.dst, a.alcance, a.raio, a.refino, a.erosao)
