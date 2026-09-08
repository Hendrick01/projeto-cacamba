"""Rig da cintura para cima, com dedos, num modelo já SENTADO segurando cartas (Meshy, sem rig).
Uso: Blender --background --python scripts/rig_sentado.py -- entrada.glb saida.glb [--altura 1.45] [--blend saida.blend]
O esqueleto usa os nomes que a mesa espera (Hips, Spine02, Spine01, Spine, neck, Head,
<Lado>Shoulder/Arm/ForeArm/Hand e <Lado>Hand<Dedo>1-3) e é posicionado pela geometria: alturas
por fração da altura sentada, ombros e cotovelos pelos extremos laterais, mãos pela pinça (a
saliência mais à frente entre 42 % e 62 % da altura). Pesos: automáticos do Blender (bone heat) —
funcionam porque a malha é fechada (duplicatas de UV unidas antes). Depois: test/modelo-prepara.mjs
(nós Cabeca/MaoEsq/MaoDir, texturas, triângulos) e scripts/rig_sentado_eixos.py (palma/lateral).
Blender: X lateral, Y profundidade (frente = -Y), Z para cima.
"""
import sys, argparse
import numpy as np
import bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('--altura', type=float, default=1.45); ap.add_argument('--blend')
args = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.src)
obs = [o for o in bpy.data.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in obs: o.select_set(True)
bpy.context.view_layer.objects.active = obs[0]
if len(obs) > 1: bpy.ops.object.join()
corpo = bpy.context.object; corpo.name = 'corpo'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = corpo.data
# malha fechada para o heat: une as duplicatas das costuras de UV (as UVs ficam nos loops)
bm = bmesh.new(); bm.from_mesh(me); n0 = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free(); me.validate(); me.update()
# altura sentada, pés no chão, centro em x/y
P = np.array([v.co[:] for v in me.vertices], float); lo, hi = P.min(0), P.max(0)
esc = args.altura / (hi[2] - lo[2]); centro = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]])
for v, co in zip(me.vertices, (P - centro) * esc): v.co = co
me.update(); P = np.array([v.co[:] for v in me.vertices], float); H = args.altura
print('malha: %d -> %d vértices, altura %.2f' % (n0, len(P), H))

def fatia(z0, z1, cond=None):
    f = (P[:, 2] > z0 * H) & (P[:, 2] < z1 * H)
    if cond is not None: f &= cond
    return P[f]
def centro_de(z0, z1, largura=0.08):
    Q = fatia(z0, z1, np.abs(P[:, 0]) < largura * H); return Q.mean(0) if len(Q) else np.array([0, 0, (z0 + z1) / 2 * H])

hips = centro_de(0.43, 0.48); spine02 = centro_de(0.52, 0.57); spine01 = centro_de(0.60, 0.65); spine = centro_de(0.68, 0.72)
neck = centro_de(0.78, 0.82, 0.06); cabeca = fatia(0.86, 1.0).mean(0); topo = cabeca + np.array([0, 0, 0.06 * H])   # osso curto: o nó Cabeca do preparo fica no meio da cabeça
# ombros: extremos laterais da fatia dos ombros, recuados para dentro
ombros = {}
for lado, s in (('Left', 1), ('Right', -1)):
    Q = fatia(0.74, 0.80, np.sign(P[:, 0]) == s); xo = np.percentile(s * Q[:, 0], 97) * s
    ombros[lado] = np.array([xo - s * 0.05 * H, Q[np.abs(Q[:, 0] - xo) < 0.03 * H][:, 1].mean(), 0.77 * H])
# ombros simétricos: a mesa mede a linha dos ombros e corrige qualquer torção a cada quadro
larg_o = (ombros['Left'][0] - ombros['Right'][0]) / 2; y_o = (ombros['Left'][1] + ombros['Right'][1]) / 2
ombros = {'Left': np.array([larg_o, y_o, 0.77 * H]), 'Right': np.array([-larg_o, y_o, 0.77 * H])}
# pernas (sentado): coxa para a frente, canela para baixo, pé no chão
pernas = {}
for lado, s in (('Left', 1), ('Right', -1)):
    joelho = fatia(0.30, 0.42, np.sign(P[:, 0]) == s); joelho = joelho[joelho[:, 1] < np.percentile(joelho[:, 1], 10)].mean(0)
    pe = fatia(0.0, 0.08, np.sign(P[:, 0]) == s).mean(0)
    pernas[lado] = {'coxa': hips + np.array([s * 0.07 * H, 0, -0.02 * H]), 'joelho': joelho, 'tornozelo': np.array([pe[0], pe[1] + 0.03 * H, 0.05 * H]), 'pe': np.array([pe[0], pe[1] - 0.06 * H, 0.02 * H])}
# cotovelos: o ponto mais lateral entre 50 % e 66 %
cotovelos = {}
for lado, s in (('Left', 1), ('Right', -1)):
    Q = fatia(0.50, 0.66, np.sign(P[:, 0]) == s); k = np.argmax(s * Q[:, 0]); cotovelos[lado] = Q[k] - np.array([s * 0.03 * H, 0, 0])
# mãos: a pinça na frente do peito (frente = -Y)
faixa = fatia(0.42, 0.62); frente = faixa[faixa[:, 1] < np.percentile(faixa[:, 1], 5)]
mediana = np.median(frente[:, 0]); maos = {'Left': frente[frente[:, 0] > mediana].mean(0), 'Right': frente[frente[:, 0] <= mediana].mean(0)}
meio = frente[(frente[:, 0] > min(maos['Left'][0], maos['Right'][0]) + 0.3 * abs(maos['Left'][0] - maos['Right'][0])) & (frente[:, 0] < max(maos['Left'][0], maos['Right'][0]) - 0.3 * abs(maos['Left'][0] - maos['Right'][0]))]
pinca = meio.mean(0) if len(meio) >= 5 else (maos['Left'] + maos['Right']) / 2
print('marcos: ombros %s/%s cotovelos %s/%s mãos %s/%s pinça %s' % tuple(np.round(v, 2).tolist() for v in (ombros['Left'], ombros['Right'], cotovelos['Left'], cotovelos['Right'], maos['Left'], maos['Right'], pinca)))

# --- esqueleto ---------------------------------------------------------------------------
arm_data = bpy.data.armatures.new('Armature'); arm = bpy.data.objects.new('Armature', arm_data); bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
def osso(nome, head, tail, pai=None, conecta=False):
    b = arm_data.edit_bones.new(nome); b.head = Vector(head); b.tail = Vector(tail)
    if pai: b.parent = arm_data.edit_bones[pai]; b.use_connect = conecta
    return b
osso('Hips', hips, spine02); osso('Spine02', spine02, spine01, 'Hips', True); osso('Spine01', spine01, spine, 'Spine02', True); osso('Spine', spine, neck, 'Spine01', True)
osso('neck', neck, cabeca, 'Spine', True); osso('Head', cabeca, topo, 'neck', True)
for lado in ('Left', 'Right'):
    pr = pernas[lado]
    osso(f'{lado}UpLeg', pr['coxa'], pr['joelho'], 'Hips'); osso(f'{lado}Leg', pr['joelho'], pr['tornozelo'], f'{lado}UpLeg', True)
    osso(f'{lado}Foot', pr['tornozelo'], pr['pe'], f'{lado}Leg', True)
unit = lambda v: v / max(np.linalg.norm(v), 1e-9)
for lado, s in (('Left', 1), ('Right', -1)):
    o, c, m = ombros[lado], cotovelos[lado], maos[lado]
    punho = m + unit(c - m) * 0.06 * H
    osso(f'{lado}Shoulder', spine + np.array([s * 0.03 * H, 0, 0.02 * H]), o, 'Spine'); osso(f'{lado}Arm', o, c, f'{lado}Shoulder')
    osso(f'{lado}ForeArm', c, punho, f'{lado}Arm', True); osso(f'{lado}Hand', punho, m, f'{lado}ForeArm', True)
    # dedos: empilhados na vertical (indicador em cima), apontando para a pinça; polegar por cima e atrás
    d = unit(pinca - m + np.array([0, 0, 0.01 * H])); comp = 0.055 * H
    for k, f in enumerate(('Index', 'Middle', 'Ring', 'Pinky')):
        base = m + np.array([0, 0, (1.5 - k) * 0.011 * H]) - d * 0.01 * H; pai = f'{lado}Hand'
        for seg, (t0, t1) in enumerate(((0, 0.45), (0.45, 0.76), (0.76, 1.0))):
            osso(f'{lado}Hand{f}{seg + 1}', base + d * comp * t0, base + d * comp * t1, pai, seg > 0); pai = f'{lado}Hand{f}{seg + 1}'
    base = m + np.array([0, 0.02 * H, 0.025 * H]); dp = unit(pinca + np.array([0, 0, 0.02 * H]) - base); pai = f'{lado}Hand'
    for seg, (t0, t1) in enumerate(((0, 0.45), (0.45, 0.76), (0.76, 1.0))):
        osso(f'{lado}HandThumb{seg + 1}', base + dp * 0.045 * H * t0, base + dp * 0.045 * H * t1, pai, seg > 0); pai = f'{lado}HandThumb{seg + 1}'
bpy.ops.object.mode_set(mode='OBJECT')
for pb in arm.pose.bones:
    if 'Hand' in pb.name and pb.name[-1] in '123' and pb.name != 'LeftHand':
        pb['dedo'] = True; pb['segmento'] = int(pb.name[-1]) - 1; arm.data.bones[pb.name]['dedo'] = True; arm.data.bones[pb.name]['segmento'] = int(pb.name[-1]) - 1

# --- pesos automáticos --------------------------------------------------------------------
bpy.ops.object.select_all(action='DESELECT'); corpo.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
vazios = [vg.name for vg in corpo.vertex_groups if not any(g.group == vg.index and g.weight > 0.01 for v in corpo.data.vertices for g in v.groups)]
print('grupos sem peso:', vazios or 'nenhum')
if args.blend: bpy.ops.wm.save_as_mainfile(filepath=args.blend)
bpy.ops.object.select_all(action='DESELECT'); corpo.select_set(True); arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=args.dst, export_format='GLB', use_selection=True, export_skins=True, export_extras=True, export_apply=True, export_animations=False, export_image_format='AUTO')
print('gravado', args.dst)
