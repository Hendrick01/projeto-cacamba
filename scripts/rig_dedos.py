"""Rig dos dedos a partir da geometria da mão (v2).
Uso: python3 scripts/rig_dedos.py entrada.glb saida.glb [--relatorio]
Aceita o GLB de 24 ossos (cria os 30 nós de dedo) ou um já rigado (reposiciona os nós
e refaz os pesos). Só NumPy. Malha, texturas e clips do corpo não mudam; a pose neutra é
preservada.

Como acha os dedos: distância geodésica a partir do punho sobre a superfície da mão;
os dedos são as pontas mais persistentes dessa distância (nascem na ponta, morrem no vão
entre dedos). Cada dedo ganha os ossos no eixo central (centroides das fatias) e os pesos
seguem a posição ao longo do dedo, com fusão suave no nó e na palma.

Contrato com public/dedos3d.js: nós <Lado>Hand<Dedo><1-3> com extras.dedo/segmento,
rotação de repouso identidade no espaço da mão e juntas a 0/45/76 % do dedo
(interacao3d.pontaDedo projeta a ponta com 0.24/0.31).
"""
import argparse, heapq, json
import numpy as np
from glb_utils import *

DEDOS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']
JUNTAS = (0.0, 0.45, 0.76)
ANGULOS = {'Thumb': [0.90, 0.45, 0.25], 'outros': [1.10, 1.45, 0.80]}  # radianos, os mesmos de dedos3d.js
MCP_ABAIXO = 1.5        # cm: a articulação do polegar fica abaixo da membrana com o indicador
DEDO_FRACAO = 0.40      # comprimento do dedo como fração da distância punho→ponta (indicador, médio, anular)
MINDINHO_FRACAO = 0.34  # idem para o mindinho
BLEND_SEG = 0.11        # meia-largura da transição entre falanges (fração do dedo)
PALMA_CM = 1.5          # alcance, na palma, da influência da 1ª falange
PERSISTENCIA_MIN = 0.3  # cm: relevo mais raso que isso não é dedo (o 6º valor no relatório mostra a folga)


def smooth(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)
def rampa(a, centro, meia): return smooth((a - centro + meia) / (2 * meia))
def quat_mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def quat_eixo(eixo, ang):
    e = np.asarray(eixo, float); e = e / np.linalg.norm(e); return [*(e * np.sin(ang / 2)), np.cos(ang / 2)]
def unit(v): return v / max(np.linalg.norm(v), 1e-9)


def dijkstra(adj, n, fontes):
    d = np.full(n, np.inf); rot = np.full(n, -1); heap = []
    for r, f in enumerate(fontes):
        for v in f: d[v] = 0; rot[v] = r; heap.append((0.0, v))
    heapq.heapify(heap)
    while heap:
        dv, v = heapq.heappop(heap)
        if dv > d[v]: continue
        for u, w in adj[v]:
            if dv + w < d[u]: d[u] = dv + w; rot[u] = rot[v]; heapq.heappush(heap, (d[u], u))
    return d, rot


def persistencia(adj, d):
    """Varredura por superníveis de d: cada componente nasce num máximo local (a ponta) e
    morre ao encostar num componente mais antigo. Devolve nascimento por raiz e os eventos."""
    pai, eventos = {}, []
    def raiz(v):
        while pai[v] != v: pai[v] = pai[pai[v]]; v = pai[v]
        return v
    for v in np.argsort(-d):
        if not np.isfinite(d[v]): break
        pai[v] = v
        for u, _ in adj[v]:
            if u not in pai: continue
            ru, rv = raiz(u), raiz(v)
            if ru == rv: continue
            velho, novo = (ru, rv) if d[ru] >= d[rv] else (rv, ru)
            pai[novo] = velho; eventos.append((float(d[v]), velho, novo))
    return eventos


def eixos_da_mao(lado, thumb1, middle1):
    """Lateral (para o polegar), palma e eixo de flexão no espaço da mão (Y = para os dedos).
    Nestes esqueletos a palma fica do lado OPOSTO ao que a fórmula antiga de dedos3d.js
    supunha (na pose de bind, braços caídos, o polegar aponta para o meio do corpo: palma
    para trás); o arquivo grava os vetores e a mesa passa a lê-los."""
    lateral = np.array(thumb1) - np.array(middle1); lateral[1] = 0; lateral = unit(lateral)
    palma = unit(np.cross(lateral, [0, 1, 0]) * (-1 if lado == 'Left' else 1))
    return lateral, palma, unit(np.cross([0, 1, 0], palma))


def eixo_runtime(lado, thumb1, middle1): return eixos_da_mao(lado, thumb1, middle1)[2]


def grava_eixos_da_mao(nodes, s, names, lado, thumb1, middle1):
    lateral, palma, eixo = eixos_da_mao(lado, thumb1, middle1)
    n = nodes[s['joints'][names.index(lado + 'Hand')]]
    n['extras'] = {**n.get('extras', {}), 'lateral': lateral.tolist(), 'palma': palma.tolist()}
    return eixo


def pose_dedos(j, s, P, J, W, ibm, amount):
    """Posição dos vértices com os dedos flexionados como a mesa faz (LBS), para medir estiramento."""
    nodes = j['nodes']; parents = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    eixos = {}
    for lado in ('Left', 'Right'):
        idx = {n['name']: n for n in nodes}
        t1, m1 = idx.get(lado + 'HandThumb1'), idx.get(lado + 'HandMiddle1')
        if t1 and m1: eixos[lado] = eixo_runtime(lado, t1.get('translation', [0, 0, 0]), m1.get('translation', [0, 0, 0]))
    cache = {}
    def world(i):
        if i in cache: return cache[i]
        n = nodes[i]; R = quat_mat(n.get('rotation', [0, 0, 0, 1])); ex = n.get('extras', {})
        if ex.get('dedo') and amount:
            lado = 'Left' if n['name'].startswith('Left') else 'Right'
            ang = (ANGULOS['Thumb'] if 'Thumb' in n['name'] else ANGULOS['outros'])[ex.get('segmento', 0)]
            R = R @ quat_mat(quat_eixo(eixos[lado], ang * amount))
        m = np.eye(4); m[:3, :3] = R @ np.diag(n.get('scale', [1, 1, 1])); m[:3, 3] = n.get('translation', [0, 0, 0])
        cache[i] = world(parents[i]) @ m if i in parents else m; return cache[i]
    B = ibm.reshape(-1, 4, 4).transpose(0, 2, 1)
    M = np.array([world(i) for i in s['joints']]) @ B; pts = np.c_[P, np.ones(len(P))]; out = np.zeros((len(P), 4))
    for k in range(4): out += np.einsum('nij,nj->ni', M[J[:, k]], pts) * W[:, k, None]
    return out[:, :3]


FLEXAO_MESA = 0.62  # o mesmo valor padrão de interacao3d.atualizaInteracao


def estiramento(j, s, P, J, W, F, ibm, regiao, flexao=FLEXAO_MESA):
    """Razão entre o comprimento das arestas da mão com os dedos na flexão da mesa e abertos (1 = sem
    deformação). A pose de repouso dos nós é a sentada; os vértices estão na pose de bind, por isso as duas
    vêm do LBS."""
    E = np.unique(np.sort(np.r_[F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]], 1), axis=0)
    E = E[regiao[E[:, 0]] & regiao[E[:, 1]]]
    Q0 = pose_dedos(j, s, P, J, W, ibm, 0.0); rest = np.linalg.norm(Q0[E[:, 0]] - Q0[E[:, 1]], axis=1); ok = rest > 0.002  # arestas < 2 mm só fazem ruído
    Q = pose_dedos(j, s, P, J, W, ibm, flexao); comp = np.linalg.norm(Q[E[:, 0]] - Q[E[:, 1]], axis=1)[ok]; r = comp / rest[ok]
    return {'flexao': flexao, 'p99': round(float(np.percentile(r, 99)), 2), 'max': round(float(r.max()), 2), 'rasgadas': int((r > 2).sum()), 'alongamentoMaxMm': round(float((comp - rest[ok]).max() * 1000), 1), 'arestas': int(ok.sum())}


def rig(src, dst, relatorio=False):
    g = GLB(src); j = g.j; s = j['skins'][0]; nodes = j['nodes']
    prim = j['meshes'][0]['primitives'][0]
    P = g.read(prim['attributes']['POSITION']).astype(np.float64); F = g.read(prim['indices']).ravel().reshape(-1, 3)
    J = g.read(prim['attributes']['JOINTS_0']).astype(np.int64); W = g.read(prim['attributes']['WEIGHTS_0']).astype(np.float64)
    ibm = g.read(s['inverseBindMatrices']).astype(np.float64)
    names = [nodes[i]['name'] for i in s['joints']]
    criar = 'LeftHandThumb1' not in names
    if criar: ibm = np.vstack([ibm, np.zeros((30, 16))])
    Jn, Wn = J.copy(), W.copy(); saida = {}
    regiao_total = np.zeros(len(P), bool)

    # vértices duplicados nas costuras de UV viram um só nó do grafo
    _, canon, inv = np.unique(np.round(P * 1e5).astype(np.int64), axis=0, return_index=True, return_inverse=True)
    canon_pos = P[canon]; nC = len(canon); inv = inv.ravel()

    for lado in ('Left', 'Right'):
        hand = names.index(lado + 'Hand'); handnode = s['joints'][hand]
        if criar:
            for f in DEDOS:
                parent = handnode
                for seg in range(3):
                    nodes.append({'name': f'{lado}Hand{f}{seg + 1}', 'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1]})
                    nodes[parent].setdefault('children', []).append(len(nodes) - 1); s['joints'].append(len(nodes) - 1)
                    names.append(nodes[-1]['name']); parent = len(nodes) - 1
        dedo_ids = {f: [names.index(f'{lado}Hand{f}{k}') for k in (1, 2, 3)] for f in DEDOS}
        todos = np.array([hand] + sum(dedo_ids.values(), []))
        na_mao = np.isin(J, todos) & (W > 0); wh = (W * na_mao).sum(1)
        regiao = wh > 0; regiao_total |= regiao
        T = ibm[hand].reshape(4, 4).T; h = (np.c_[canon_pos, np.ones(nC)] @ T.T)[:, :3]  # espaço da mão, cm
        whc = np.zeros(nC); np.maximum.at(whc, inv, wh)
        # grafo da região da mão (arestas em cm, no espaço da mão)
        Fm = F[regiao[F].all(1)]; E = np.unique(np.sort(inv[np.r_[Fm[:, [0, 1]], Fm[:, [1, 2]], Fm[:, [2, 0]]]], 1), axis=0)
        E = E[E[:, 0] != E[:, 1]]; L = np.linalg.norm(h[E[:, 0]] - h[E[:, 1]], axis=1)
        adj = [[] for _ in range(nC)]
        for (a, b), l in zip(E, L): adj[a].append((b, l)); adj[b].append((a, l))
        cand = np.flatnonzero(whc > 0)
        fontes = cand[whc[cand] < 0.5]
        if len(fontes) < 5: fontes = cand[h[cand, 1] <= np.percentile(h[cand, 1], 3)]
        d, _ = dijkstra(adj, nC, [list(fontes)])
        alc = np.isfinite(d) & (whc > 0)
        # pontas dos dedos por persistência
        eventos = persistencia(adj, np.where(alc, d, -np.inf))
        morte = {}
        for l, velho, novo in eventos: morte.setdefault(novo, l)
        raizes = {v for _, v, _ in eventos} | {v for _, _, v in eventos}
        pers = {r: d[r] - morte.get(r, 0.0) for r in raizes}  # quem nunca morre vai até o punho (nível 0)
        ordem = sorted([r for r in raizes if pers[r] > PERSISTENCIA_MIN], key=lambda r: -pers[r])
        sel = ordem[:5]
        persistencias = [round(pers[r], 2) for r in ordem[:6]]
        if len(sel) < 5:
            # escultura com os dedos colados: sem pontas separadas não há como achar os dedos
            if criar: raise ValueError(f'{lado}: só {len(sel)} dedos encontrados (persistências {persistencias})')
            saida[lado] = {'mantido': f'dedos colados na escultura ({len(sel)} pontas): rig anterior mantido nesta mão', 'persistenciasCm': persistencias}
            # mesmo mantendo os ossos, a palma e o eixo de cada falange passam a ser os corretos
            t1 = nodes[s['joints'][dedo_ids['Thumb'][0]]].get('translation', [0, 0, 0]); m1 = nodes[s['joints'][dedo_ids['Middle'][0]]].get('translation', [0, 0, 0])
            eixo = grava_eixos_da_mao(nodes, s, names, lado, t1, m1)
            for f in DEDOS:
                for seg, jid in enumerate(dedo_ids[f]):
                    n = nodes[s['joints'][jid]]; n['extras'] = {**n.get('extras', {}), 'dedo': True, 'segmento': seg, 'eixoFlexao': eixo.tolist(), 'anguloFlexao': (ANGULOS['Thumb'] if f == 'Thumb' else ANGULOS['outros'])[seg]}
            continue
        # base de cada dedo = nível em que ele encosta pela primeira vez em outro dedo (o vão mais alto)
        conteudo = {r: {r} for r in sel}; contato = {r: {} for r in sel}
        for l, velho, novo in eventos:
            cv, cn = conteudo.get(velho, set()), conteudo.get(novo, set())
            for x in cn:
                for y in cv: contato[x].setdefault(y, l); contato[y].setdefault(x, l)
            conteudo[velho] = cv | cn
        # polegar = o de membrana mais baixa; sua articulação fica um pouco abaixo da membrana com o indicador.
        # Nos outros dedos a membrana engana (alta quando dois dedos estão colados, baixa no lado do polegar):
        # a articulação do nó vem da proporção anatômica, dedo = fração da distância punho→ponta.
        vao = {r: min(contato[r].values()) if contato[r] else morte[r] for r in sel}
        polegar = min(sel, key=lambda r: vao[r])
        base = {r: max(vao[r] - MCP_ABAIXO, 0.25 * d[r]) if r == polegar else d[r] * (1 - DEDO_FRACAO) for r in sel}
        def eixo(r, m):
            """Eixo central do dedo (componente principal dos vértices), orientado para a ponta."""
            if len(m) < 12: raise ValueError(f'{lado}: dedo com poucos vértices ({len(m)})')
            X = h[m]; c = X.mean(0); e = np.linalg.svd(X - c, full_matrices=False)[2][0]
            if np.dot(h[r] - c, e) < 0: e = -e
            proj = (X - c) @ e; t0, t1 = np.percentile(proj, 2), np.percentile(proj, 98); total = t1 - t0
            return {'c': c, 'e': e, 't0': t0, 'total': total, 'a': np.clip((proj - t0) / total, 0, 1)}
        # 1ª passada: cada vértice vai para a ponta geodesicamente mais próxima (dá um eixo aproximado)
        _, rot = dijkstra(adj, nC, [[r] for r in sel])
        membro = {r: np.flatnonzero((rot == k) & (d > base[r]) & alc) for k, r in enumerate(sel)}
        geo = {r: eixo(r, membro[r]) for r in sel}
        # os outros dedos em ordem de distância entre as bases, a partir do polegar
        base_de = lambda r: geo[r]['c'] + geo[r]['e'] * geo[r]['t0']
        outros = sorted([r for r in sel if r != polegar], key=lambda r: np.linalg.norm(base_de(r) - base_de(polegar)))
        nomes = dict(zip([polegar] + outros, DEDOS))
        base[outros[-1]] = d[outros[-1]] * (1 - MINDINHO_FRACAO)
        # 2ª passada: com dedos colados a geodésica atravessa a costura; o eixo central mais próximo decide
        for _ in range(2):
            cand = np.flatnonzero(alc); D = np.empty((len(cand), len(sel)))
            for k, r in enumerate(sel):
                gd = geo[r]; X = h[cand] - (gd['c'] + gd['e'] * gd['t0']); t = np.clip(X @ gd['e'], 0, gd['total'])
                D[:, k] = np.linalg.norm(X - t[:, None] * gd['e'], axis=1)
            rot2 = np.argmin(D, 1)
            membro = {r: cand[(rot2 == k) & (d[cand] > base[r])] for k, r in enumerate(sel)}
            geo = {r: eixo(r, membro[r]) for r in sel}
        share = np.zeros((nC, 16))  # colunas: 0 = mão, 1..15 = dedos (3 por dedo)
        info = {}; juntas_lado = {}
        for r in sel:
            f = nomes[r]; m = membro[r]; gd = geo[r]; c, e, t0, total, a = gd['c'], gd['e'], gd['t0'], gd['total'], gd['a']
            ponto = lambda t: c + e * (t0 + t * total)
            locs = [ponto(t) for t in JUNTAS]; juntas_lado[f] = locs
            col = 1 + DEDOS.index(f) * 3
            s2, s3 = rampa(a, JUNTAS[1], BLEND_SEG), rampa(a, JUNTAS[2], BLEND_SEG)
            seg = np.c_[1 - s2, s2 - s3, s3]; mao = 0.5 * (1 - rampa(a, 0.15, 0.15))
            share[m, col:col + 3] = seg * (1 - mao)[:, None]; share[m, 0] = mao
            # a palma perto do nó acompanha um pouco a 1ª falange
            db, _ = dijkstra(adj, nC, [list(m[a < 0.08])])
            palma = np.flatnonzero(alc & (db < PALMA_CM) & ~np.isin(np.arange(nC), np.concatenate(list(membro.values()))))
            share[palma, col] = np.maximum(share[palma, col], 0.45 * (1 - smooth(db[palma] / PALMA_CM)))
            info[f] = {'vertices': int(len(m)), 'comprimentoCm': round(float(total), 2), 'persistenciaCm': round(float(pers[r]), 2)}
        # dedos3d.js tira a lateral de Thumb1 − Middle1 (com Y zerado) e supõe os dois no plano da
        # palma: a base do polegar vai para a profundidade média das bases dos outros dedos
        bases = np.array([juntas_lado[f][0] for f in DEDOS[1:]])
        lateral = bases[0] - bases[3]; lateral[1] = 0; prof = unit(np.cross(unit(lateral), [0, 1, 0]))
        t1 = juntas_lado['Thumb'][0]; juntas_lado['Thumb'][0] = t1 + prof * np.dot(bases.mean(0) - t1, prof)
        resto = alc & (share.sum(1) == 0); share[resto, 0] = 1
        share[:, 0] = np.maximum(share[:, 0], 1 - share[:, 1:].sum(1)); share[~alc, :] = 0; share[~alc, 0] = 1
        share /= share.sum(1, keepdims=True)
        # nós, IBMs, extras: rotação identidade no espaço da mão; a mesa calcula o eixo por Thumb1/Middle1
        eixo = grava_eixos_da_mao(nodes, s, names, lado, juntas_lado['Thumb'][0], juntas_lado['Middle'][0])
        for f in DEDOS:
            anterior = np.zeros(3)
            for seg, (jid, loc) in enumerate(zip(dedo_ids[f], juntas_lado[f])):
                n = nodes[s['joints'][jid]]; n['translation'] = (loc - anterior).tolist(); n['rotation'] = [0, 0, 0, 1]; n.pop('scale', None)
                ang = (ANGULOS['Thumb'] if f == 'Thumb' else ANGULOS['outros'])[seg]
                n['extras'] = {**n.get('extras', {}), 'dedo': True, 'segmento': seg, 'eixoFlexao': eixo.tolist(), 'anguloFlexao': ang}
                M = np.eye(4); M[:3, 3] = -loc; inv_ = M @ T; ibm[jid] = inv_.T.reshape(-1); anterior = loc
                fwd = np.eye(4); fwd[:3, 3] = loc; assert np.max(np.abs(fwd @ inv_ - T)) < 1e-4
        # pesos finais: o que não é mão fica; a massa da mão se reparte pelas partes
        colunas = todos
        for v in np.flatnonzero(regiao):
            sh = share[inv[v]]; outros_ = [(int(jo), float(we)) for jo, we, nm in zip(J[v], W[v], na_mao[v]) if not nm and we > 0]
            partes = sorted([(int(colunas[k]), float(sh[k] * wh[v])) for k in range(16) if sh[k] > 1e-4], key=lambda t: -t[1])
            top = outros_ + partes[:4 - len(outros_)]; tot = sum(t[1] for t in top)
            Jn[v] = 0; Wn[v] = 0
            for k, (jo, we) in enumerate(top): Jn[v, k] = jo; Wn[v, k] = we / tot
        saida[lado] = {'dedos': info, 'persistenciasCm': persistencias, 'foraDoGrafo': int((~alc & (whc > 0)).sum())}

    assert np.max(np.abs(Wn.sum(1) - 1)) < 1e-5 and Jn.max() < len(s['joints'])
    if criar: s['inverseBindMatrices'] = g.add(ibm, 'MAT4')
    else: g.overwrite(s['inverseBindMatrices'], ibm)
    if Jn.max() > 255 and j['accessors'][prim['attributes']['JOINTS_0']]['componentType'] == 5121: raise ValueError('JOINTS_0 de 8 bits não comporta 54 ossos')
    g.overwrite(prim['attributes']['JOINTS_0'], Jn); g.overwrite(prim['attributes']['WEIGHTS_0'], Wn)
    # clip de teste: fecha e abre os dedos com o mesmo eixo da mesa
    anim = next((a for a in j.get('animations', []) if a['name'] == 'dedosTeste'), None)
    if anim is None:
        anim = {'name': 'dedosTeste', 'samplers': [], 'channels': []}; j.setdefault('animations', []).append(anim)
    tempo = next((sm['input'] for sm in anim['samplers']), None) or g.add([[0], [.7], [1.4], [2.1]], 'SCALAR')
    por_no = {c['target']['node']: c['sampler'] for c in anim['channels']}
    for i, n in enumerate(nodes):
        ex = n.get('extras', {})
        if not ex.get('dedo'): continue
        q = quat_eixo(ex['eixoFlexao'], ex['anguloFlexao'] * .6); quadros = [[0, 0, 0, 1], q, q, [0, 0, 0, 1]]
        if i in por_no: g.overwrite(anim['samplers'][por_no[i]]['output'], np.array(quadros, np.float32))
        else:
            anim['samplers'].append({'input': tempo, 'output': g.add(quadros, 'VEC4'), 'interpolation': 'LINEAR'})
            anim['channels'].append({'sampler': len(anim['samplers']) - 1, 'target': {'node': i, 'path': 'rotation'}})
    j.setdefault('extras', {})['rigDedos'] = {'version': 2, 'method': 'geometria: geodésica do punho, dedos por persistência, ossos no eixo central', 'lados': saida}
    g.write(dst)
    if relatorio:
        antes = GLB(src); ja, sa = antes.j, antes.j['skins'][0]
        ea = estiramento(ja, sa, P, J, W, F, antes.read(sa['inverseBindMatrices']).astype(np.float64), regiao_total) if not criar else None
        ed = estiramento(j, s, P, Jn, Wn, F, ibm, regiao_total)
        print(json.dumps({'arquivo': dst, 'estiramentoAntes': ea, 'estiramentoDepois': ed, **saida}, ensure_ascii=False, indent=1))
    else:
        print(dst, json.dumps(saida, ensure_ascii=False))


if __name__ == '__main__':
    p = argparse.ArgumentParser(); p.add_argument('src'); p.add_argument('dst'); p.add_argument('--relatorio', action='store_true')
    a = p.parse_args(); rig(a.src, a.dst, a.relatorio)
