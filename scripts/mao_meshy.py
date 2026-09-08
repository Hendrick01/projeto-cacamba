"""Prepara uma mão modelada de fora (ex. Meshy) para o enxerto: remalha em quads, alinha ao
quadro canônico, acha os dedos na geometria, põe 16 ossos e pesos e exporta como mão canônica.
Uso: Blender --background --python scripts/mao_meshy.py -- entrada.glb saida.glb [--faces 2200]
        [--palma +y|-y] [--polegar +x|-x] [--dedos +z|-z] [--render saida.png]
Quadro canônico (o que enxerta_mao.py espera): punho na origem, dedos para +Y, polegar para +X,
palma para +Z, comprimento punho→ponta do médio = 1 — é uma mão ESQUERDA (polegar × dedos =
palma). Os eixos da entrada são deduzidos da geometria (ponta com vãos = dedos; lado que
sobressai no meio = polegar; face menos abaulada = palma) e podem ser forçados pelas opções.
Se a entrada for uma mão direita, a canônica sai espelhada — o enxerto espelha de novo conforme
o lado.
"""
import sys, argparse, math, heapq
from pathlib import Path
import numpy as np
import bpy, bmesh
from mathutils import Vector, Matrix

for cand in [Path.cwd(), *Path.cwd().parents]:
    if (cand / 'scripts' / 'rig_dedos.py').exists(): sys.path.insert(0, str(cand / 'scripts')); break
from rig_dedos import dijkstra, persistencia, unit, smooth, rampa, DEDOS, JUNTAS

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('--faces', type=int, default=2200)
ap.add_argument('--palma'); ap.add_argument('--polegar'); ap.add_argument('--dedos'); ap.add_argument('--render')
ap.add_argument('--lado', choices=('esq', 'dir'), default='esq',
                help='esq usa a malha como veio; dir ESPELHA a malha ANTES de tudo e riga de novo. '
                     'Espelhar a malha crua é seguro; espelhar um rig já montado, não')
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.src)
obs = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in obs: o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
if len(obs) > 1: bpy.ops.object.join()
mao = bpy.context.object; mao.name = 'mao'
LADO = 'Left' if args.lado == 'esq' else 'Right'
ESP = 1 if args.lado == 'esq' else -1
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# A malha do gerador chega com vértices repetidos na costura de UV e faces de
# área zero. O quadriflow engasga nisso: numa primeira tentativa ele devolveu
# 1.995 de 2.860 vértices em NaN. Soldar e recalcular as normais antes é o que
# lhe dá uma superfície de que ele dá conta.
bm = bmesh.new(); bm.from_mesh(mao.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-6)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
soltos = [v for v in bm.verts if not v.link_faces]
if soltos: bmesh.ops.delete(bm, geom=soltos, context='VERTS')
bm.to_mesh(mao.data); bm.free()
print('limpeza: %d vértices, %d faces' % (len(mao.data.vertices), len(mao.data.polygons)))
# quads uniformes: mantêm anéis ao longo dos dedos
bpy.ops.object.quadriflow_remesh(target_faces=args.faces, use_mesh_symmetry=False, use_preserve_sharp=False, seed=1)
bpy.ops.object.shade_smooth()
# O quadriflow devolve, de vez em quando, vértices em NaN — e é intermitente:
# duas execuções da MESMA malha com a MESMA semente deram 2.871 e 2.877
# vértices, uma limpa e outra com NaN. Um só deles envenena tudo o que vem
# depois: a caixa da malha vira NaN, o eixo mais longo e o mais curto passam a
# ser o mesmo, e o script morre num índice fora da faixa. Some com eles antes
# de medir qualquer coisa.
bm = bmesh.new(); bm.from_mesh(mao.data)
sujos = [v for v in bm.verts if not all(map(math.isfinite, v.co))]
if sujos:
    bmesh.ops.delete(bm, geom=sujos, context='VERTS')
    print('quadriflow devolveu %d vértices NaN: apagados' % len(sujos))
bm.to_mesh(mao.data); bm.free()
me = mao.data; P = np.array([v.co[:] for v in me.vertices], float)
print('remalhada: %d vértices, %d faces' % (len(P), len(me.polygons)))

# --- eixos da entrada ---------------------------------------------------------------
lo, hi = P.min(0), P.max(0); tam = hi - lo
longo = int(np.argmax(tam)); fino = int(np.argmin(tam)); larg = 3 - longo - fino
def fatia(t0, t1):
    z = (P[:, longo] - lo[longo]) / tam[longo]; return P[(z >= t0) & (z < t1)]
def vaos(Q): xs = np.sort(Q[:, larg]); return np.sort(np.diff(xs))[-4:].sum()
sinal_dedos = 1 if vaos(fatia(0.9, 1.0)) > vaos(fatia(0.0, 0.1)) else -1
cx = np.median(fatia(0.0 if sinal_dedos > 0 else 0.85, 0.15 if sinal_dedos > 0 else 1.0)[:, larg])
Q = fatia(0.35, 0.6) if sinal_dedos > 0 else fatia(0.4, 0.65)
sinal_polegar = 1 if Q[:, larg].max() - cx > cx - Q[:, larg].min() else -1
Qp = fatia(0.25, 0.5) if sinal_dedos > 0 else fatia(0.5, 0.75); c = np.median(Qp[:, larg]); w = 0.15 * tam[larg]; abaul = {}
for s in (1, -1):
    face = Qp[np.sign(Qp[:, fino] - np.median(Qp[:, fino])) == s]
    centro = face[np.abs(face[:, larg] - c) < w][:, fino]; borda = face[np.abs(face[:, larg] - c) > 2 * w][:, fino]
    abaul[s] = (np.median(centro) - np.median(borda)) * s
sinal_palma = 1 if abaul[1] < abaul[-1] else -1   # a palma é a face menos abaulada (as costas são a cúpula)
forca = {'+': 1, '-': -1}
if args.dedos: sinal_dedos = forca[args.dedos[0]]; longo = 'xyz'.index(args.dedos[1])
if args.polegar: sinal_polegar = forca[args.polegar[0]]; larg = 'xyz'.index(args.polegar[1])
if args.palma: sinal_palma = forca[args.palma[0]]; fino = 'xyz'.index(args.palma[1])
print('eixos da entrada: dedos %s%s, polegar %s%s, palma %s%s (abaulamento %s)' % ('+' if sinal_dedos > 0 else '-', 'xyz'[longo], '+' if sinal_polegar > 0 else '-', 'xyz'[larg], '+' if sinal_palma > 0 else '-', 'xyz'[fino], {k: round(v, 3) for k, v in abaul.items()}))

# --- para o quadro canônico: X = polegar, Y = dedos, Z = palma -----------------------
# A mão ESQUERDA canônica tem o polegar em +X; a direita, em −X. É só o sinal
# desta linha: espelhar a malha crua antes não adiantava, porque a detecção de
# eixos achava o polegar em −X e o trazia de volta para +X, desfazendo tudo.
# Como a matriz tem determinante negativo no lado direito, as faces saem com a
# orientação invertida — daí a recalculada de normais logo abaixo.
R = np.zeros((3, 3)); R[0, larg] = sinal_polegar * ESP; R[1, longo] = sinal_dedos; R[2, fino] = sinal_palma
C = P @ R.T
# punho na origem: a cintura mais estreita no terço de trás
ys = C[:, 1]; y0 = ys.min() + 0.02 * (ys.max() - ys.min()); melhor = None
for t in np.linspace(0.05, 0.4, 36):
    y = ys.min() + t * (ys.max() - ys.min()); Q = C[np.abs(C[:, 1] - y) < 0.02 * (ys.max() - ys.min())]
    if len(Q) < 8: continue
    larg_y = Q[:, 0].max() - Q[:, 0].min()
    if melhor is None or larg_y < melhor[0]: melhor = (larg_y, y, Q[:, 0].mean(), Q[:, 2].mean())
_, y_punho, x_punho, z_punho = melhor
C = C - np.array([x_punho, y_punho, z_punho])
# escala: punho → ponta mais distante (o médio)
comp = np.percentile(C[:, 1], 99.5); C = C / comp
for v, co in zip(me.vertices, C): v.co = co
me.update()
if ESP < 0:
    bmn = bmesh.new(); bmn.from_mesh(me)
    bmesh.ops.recalc_face_normals(bmn, faces=bmn.faces)
    bmn.to_mesh(me); bmn.free()
print('punho a %.0f%% do comprimento; comprimento original %.3f' % (100 * (y_punho - ys.min()) / (ys.max() - ys.min()), comp))

# --- dedos pela geometria (mesmo método do rig_dedos) ---------------------------------
bm = bmesh.new(); bm.from_mesh(me)
E = np.array([[e.verts[0].index, e.verts[1].index] for e in bm.edges]); bm.free()
L = np.linalg.norm(C[E[:, 0]] - C[E[:, 1]], axis=1); n = len(C)
adj = [[] for _ in range(n)]
for (a, b), l in zip(E, L): adj[a].append((b, l)); adj[b].append((a, l))
fontes = list(np.flatnonzero(C[:, 1] < 0.03))
d, _ = dijkstra(adj, n, [fontes]); alc = np.isfinite(d)
eventos = persistencia(adj, np.where(alc, d, -np.inf)); morte = {}
for l, velho, novo in eventos: morte.setdefault(novo, l)
raizes = {v for _, v, _ in eventos} | {v for _, _, v in eventos}
pers = {r: d[r] - morte.get(r, 0.0) for r in raizes}
ordem = sorted([r for r in raizes if pers[r] > 0.03], key=lambda r: -pers[r]); sel = ordem[:5]
assert len(sel) == 5, 'não achei 5 dedos: persistências %s' % [round(pers[r], 3) for r in ordem[:8]]
conteudo = {r: {r} for r in sel}; contato = {r: {} for r in sel}
for l, velho, novo in eventos:
    cv, cn = conteudo.get(velho, set()), conteudo.get(novo, set())
    for x in cn:
        for y in cv: contato[x].setdefault(y, l); contato[y].setdefault(x, l)
    conteudo[velho] = cv | cn
# uma ponta que nunca se junta a outra selecionada não está em `morte`: o vão
# dela é o começo da mão (0), como já se assume na persistência acima
vao = {r: min(contato[r].values()) if contato[r] else morte.get(r, 0.0) for r in sel}
# no quadro canônico o polegar é a ponta mais a +X; espelhado, a mais a -X
polegar = max(sel, key=lambda r: C[r][0] * ESP)
base = {r: max(vao[r] - 0.08, 0.25 * d[r]) if r == polegar else d[r] * 0.60 for r in sel}
def eixo(r, m):
    X = C[m]; c = X.mean(0); e = np.linalg.svd(X - c, full_matrices=False)[2][0]
    if np.dot(C[r] - c, e) < 0: e = -e
    proj = (X - c) @ e; t0, t1 = np.percentile(proj, 2), np.percentile(proj, 98)
    return {'c': c, 'e': e, 't0': t0, 'total': t1 - t0, 'a': np.clip((proj - t0) / (t1 - t0), 0, 1)}
_, rot = dijkstra(adj, n, [[r] for r in sel])
membro = {r: np.flatnonzero((rot == k) & (d > base[r]) & alc) for k, r in enumerate(sel)}
geo = {r: eixo(r, membro[r]) for r in sel}
base_de = lambda r: geo[r]['c'] + geo[r]['e'] * geo[r]['t0']
def rotula():
    global membro, geo
    cand = np.flatnonzero(alc); D = np.empty((len(cand), 5))
    for k, r in enumerate(sel):
        gd = geo[r]; X = C[cand] - (gd['c'] + gd['e'] * gd['t0']); t = np.clip(X @ gd['e'], 0, gd['total']); D[:, k] = np.linalg.norm(X - t[:, None] * gd['e'], axis=1)
    rot2 = np.where(D.min(1) < 0.08, np.argmin(D, 1), -1)   # longe de todo eixo = palma (dedos finos: 0.08)
    membro = {r: cand[(rot2 == k) & (d[cand] > base[r])] for k, r in enumerate(sel)}; geo = {r: eixo(r, membro[r]) for r in sel}
rotula(); rotula()
# nomes depois da rotulagem: indicador (perto do polegar) → mindinho, pela base
outros = sorted([r for r in sel if r != polegar], key=lambda r: -base_de(r)[0] * ESP)
nomes = dict(zip([polegar] + outros, DEDOS)); base[outros[-1]] = d[outros[-1]] * 0.66
rotula()
# a base do polegar fica fora da palma: onde o eixo dele cruza x = 0.12 (ou mais)
gp = geo[polegar]
if gp['e'][0] * ESP > 1e-3:
    t_min = (0.12 * ESP - gp['c'][0]) / gp['e'][0] - gp['t0']
    if t_min > 0: gp['total'] -= t_min; gp['t0'] += t_min; gp['a'] = np.clip(gp['a'] * (gp['total'] + t_min) / gp['total'] - t_min / gp['total'], 0, 1)
if nomes[polegar] == 'Thumb' and base_de(polegar)[0] * ESP < 0: print('AVISO: polegar do lado errado; a entrada parece ser a outra mão ou o eixo do polegar está trocado')
juntas = {}
for r in sel:
    f = nomes[r]; gd = geo[r]; juntas[f] = [gd['c'] + gd['e'] * (gd['t0'] + t * gd['total']) for t in (*JUNTAS, 1.0)]
    print('  %-6s %3d vértices, %.2f do comprimento, base %s' % (f, len(membro[r]), gd['total'], np.round(juntas[f][0], 2)))

# --- pesos: ao longo do eixo do dedo, com fusão suave no nó e na palma ----------------------
grupos = {nm: mao.vertex_groups.new(name=nm) for nm in [f'{LADO}Hand'] + [f'{LADO}{f}{k}' for f in DEDOS for k in (1, 2, 3)]}
peso_v = [dict() for _ in range(n)]
for r in sel:
    f = nomes[r]; gd = geo[r]
    for v, a in zip(membro[r], gd['a']):
        s2, s3 = rampa(a, JUNTAS[1], 0.11), rampa(a, JUNTAS[2], 0.11); seg = [1 - s2, s2 - s3, s3]; parte_mao = 0.5 * (1 - rampa(a, 0.15, 0.15))
        for k in range(3): peso_v[v][f'{LADO}{f}{k + 1}'] = seg[k] * (1 - parte_mao)
        peso_v[v][f'{LADO}Hand'] = parte_mao
    db, _ = dijkstra(adj, n, [list(membro[r][gd['a'] < 0.08])])
    for v in np.flatnonzero(alc & (db < 0.08) & ~np.isin(np.arange(n), np.concatenate(list(membro.values())))):
        peso_v[v][f'{LADO}{f}1'] = max(peso_v[v].get(f'{LADO}{f}1', 0), 0.45 * (1 - smooth(db[v] / 0.08)))
for v in range(n):
    pv = peso_v[v]; pv[f'{LADO}Hand'] = max(pv.get(f'{LADO}Hand', 0), 1 - sum(w for k, w in pv.items() if k != f'{LADO}Hand')); tot = sum(pv.values())
    for nm, w in pv.items():
        if w > 1e-4: grupos[nm].add([v], w / tot, 'REPLACE')

# --- esqueleto ---------------------------------------------------------------------------
arm_data = bpy.data.armatures.new('Armature'); arm = bpy.data.objects.new('Armature', arm_data); bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
def osso(nome, head, tail, pai=None):
    b = arm_data.edit_bones.new(nome); b.head = Vector(head); b.tail = Vector(tail)
    if pai: b.parent = arm_data.edit_bones[pai]
osso(f'{LADO}Hand', (0, 0, 0), (0, 0.5, 0))
for f, pts in juntas.items():
    pai = f'{LADO}Hand'
    for k in range(3): osso(f'{LADO}{f}{k + 1}', pts[k], pts[k + 1], pai); pai = f'{LADO}{f}{k + 1}'
bpy.ops.object.mode_set(mode='OBJECT')
# OPOSIÇÃO DO POLEGAR: a primeira falange gira num eixo próprio, que a leva por
# cima da palma ao encontro dos dedos. Sem isto o polegar só se afasta da mão e
# a pinça na carta não fecha. O contrato é o `userData.eixoFlexao` que
# primeira-pessoa-maos.js lê; o eixo saiu de uma varredura no rig procedural.
arm_data.bones[f'{LADO}Thumb1']['eixoFlexao'] = [-0.259, 0.0, 0.966 * ESP]
mao.parent = arm; mod = mao.modifiers.new('arm', 'ARMATURE'); mod.object = arm

if args.render:
    cena = bpy.context.scene; cena.render.engine = 'BLENDER_WORKBENCH'; cena.render.resolution_x = 900; cena.render.resolution_y = 600
    cena.display.shading.light = 'STUDIO'; cena.display.shading.color_type = 'SINGLE'; cena.display.shading.single_color = (0.85, 0.6, 0.45)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); cena.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.6; cam.location = (0.1, 0.45, 3.0); cam.rotation_euler = (0, 0, 0)
    cena.render.filepath = args.render; bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action='DESELECT'); mao.select_set(True); arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=args.dst, export_format='GLB', use_selection=True, export_yup=False, export_skins=True,
                          export_apply=True, export_animations=False, export_extras=True, export_materials='NONE', export_texcoords=False)
print('gravado', args.dst)
