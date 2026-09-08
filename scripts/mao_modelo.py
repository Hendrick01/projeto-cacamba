"""Gera a mão cartoon do elenco (malha única e fechada, 16 ossos, pesos por bone heat).
Uso: Blender --background --python scripts/mao_modelo.py -- saida.glb [--tris 2400] [--lado esq|dir]
Espaço canônico da mão ESQUERDA, em unidades de "comprimento da mão" (punho → ponta do
médio = 1): dedos para +Y, polegar para +X, palma voltada para +Z, punho na origem, com
um punho de 0.12 entrando em −Y para esconder a costura na manga. Ossos: Hand e
<Dedo><1-3> com juntas a 0/45/76 % de cada dedo (contrato de dedos3d.js/pontaDedo).
"""
import sys, argparse, math
import bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser(); ap.add_argument('saida'); ap.add_argument('--tris', type=int, default=2400); ap.add_argument('--render', default=None)
ap.add_argument('--lado', choices=('esq', 'dir'), default='esq',
                help='esq (o espaço canônico) ou dir, que espelha em x. Espelhar aqui, e não com '
                     'escala negativa na cena, é o que mantém as normais e o sentido das faces')
args = ap.parse_args(argv)

# `Left`/`Right` no nome do osso: é por `<lado>Hand` que o controlador da primeira
# pessoa (public/primeira-pessoa-maos.js) acha a mão, e os dois lados convivem na
# mesma cena. Os dedos levam o prefixo junto para não colidirem entre si.
LADO = 'Left' if args.lado == 'esq' else 'Right'
ESP = 1 if args.lado == 'esq' else -1

# dedo: (x da base, y da base, comprimento, raio); polegar com direção própria
DEDOS = {
    'Index':  (-0.175 * ESP, 0.50, 0.42, 0.048),
    'Middle': (-0.058 * ESP, 0.53, 0.47, 0.050),
    'Ring':   ( 0.060 * ESP, 0.51, 0.43, 0.047),
    'Pinky':  ( 0.175 * ESP, 0.45, 0.33, 0.042),
}
# Polegar mais longo e nascendo mais alto que o desenho original: com a base
# baixa e apontando para fora, nem no giro máximo a ponta alcançava o indicador
# (0,78 → 0,55 no melhor caso) e a pinça na carta não fechava.
POLEGAR = {'base': Vector((0.185 * ESP, 0.21, 0.02)), 'dir': Vector((0.52 * ESP, 0.80, 0.30)).normalized(), 'comp': 0.46, 'raio': 0.058}
JUNTAS = (0.0, 0.45, 0.76)

bpy.ops.wm.read_factory_settings(use_empty=True)
partes = []

def cilindro(base, direcao, comp, raio, nome):
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=raio, depth=comp)
    o = bpy.context.object; o.name = nome
    # ponta arredondada: esfera na extremidade
    bpy.ops.mesh.primitive_uv_sphere_add(segments=14, ring_count=8, radius=raio)
    p = bpy.context.object; p.location = (0, 0, comp / 2)
    o.select_set(True); p.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.join()
    rot = Vector((0, 0, 1)).rotation_difference(direcao)
    o.matrix_world = Matrix.Translation(base + direcao * comp / 2) @ rot.to_matrix().to_4x4()
    partes.append(o); return o

# palma: caixa arredondada, mais grossa perto do punho
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1.0)
for v in bm.verts:
    v.co.x *= 0.44; v.co.y = v.co.y * 0.56 + 0.28; v.co.z *= 0.13
    if v.co.y > 0.4: v.co.x *= 1.05
bmesh.ops.bevel(bm, geom=bm.verts[:] + bm.edges[:], offset=0.05, segments=4, affect='EDGES')
me = bpy.data.meshes.new('palma'); bm.to_mesh(me); bm.free()
palma = bpy.data.objects.new('palma', me); bpy.context.collection.objects.link(palma); partes.append(palma)
# punho entrando na manga
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.10, depth=0.30, location=(0, -0.02, 0))
punho = bpy.context.object; punho.name = 'punho'; punho.rotation_euler = (math.pi / 2, 0, 0); punho.scale = (1.55, 1.0, 0.75)
partes.append(punho)
# monte do polegar
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.11, location=(0.17 * ESP, 0.14, 0.0))
monte = bpy.context.object; monte.name = 'monte'; monte.scale = (1.1, 1.3, 0.8); partes.append(monte)

for nome, (x, y, comp, raio) in DEDOS.items():
    cilindro(Vector((x, y - 0.06, 0.0)), Vector((0, 1, 0)), comp + 0.06, raio, nome)
cilindro(POLEGAR['base'], POLEGAR['dir'], POLEGAR['comp'], POLEGAR['raio'], 'Thumb')

# funde tudo numa malha fechada e reduz
bpy.ops.object.select_all(action='DESELECT')
for o in partes: o.select_set(True)
bpy.context.view_layer.objects.active = partes[0]; bpy.ops.object.join(); mao = bpy.context.object; mao.name = 'mao'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
rm = mao.modifiers.new('remesh', 'REMESH'); rm.mode = 'VOXEL'; rm.voxel_size = 0.014; rm.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier='remesh')
sm = mao.modifiers.new('suave', 'SMOOTH'); sm.factor = 0.5; sm.iterations = 3; bpy.ops.object.modifier_apply(modifier='suave')
# quads uniformes: mantêm anéis ao longo dos dedos (o Decimate colapsaria os cilindros retos
# em triângulos da base à ponta e a falange do meio ficaria sem vértices para dobrar)
bpy.ops.object.quadriflow_remesh(target_faces=max(400, args.tris // 2), use_mesh_symmetry=False, use_preserve_sharp=False, seed=1)
bpy.ops.object.shade_smooth()
print('mão: %d vértices, %d faces' % (len(mao.data.vertices), len(mao.data.polygons)))

# esqueleto
arm_data = bpy.data.armatures.new('Armature'); arm = bpy.data.objects.new('Armature', arm_data); bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
def osso(nome, head, tail, pai=None):
    b = arm_data.edit_bones.new(nome); b.head = head; b.tail = tail
    if pai: b.parent = arm_data.edit_bones[pai]
    return b
osso(f'{LADO}Hand', Vector((0, 0, 0)), Vector((0, 0.5, 0)))
def cadeia(nome, base, direcao, comp):
    pontos = [base + direcao * (comp * t) for t in (*JUNTAS, 1.0)]
    pai = f'{LADO}Hand'
    for k in range(3):
        osso(f'{LADO}{nome}{k + 1}', pontos[k], pontos[k + 1], pai); pai = f'{LADO}{nome}{k + 1}'
for nome, (x, y, comp, raio) in DEDOS.items(): cadeia(nome, Vector((x, y, 0)), Vector((0, 1, 0)), comp)
cadeia('Thumb', POLEGAR['base'], POLEGAR['dir'], POLEGAR['comp'])
bpy.ops.object.mode_set(mode='OBJECT')

# OPOSIÇÃO DO POLEGAR. Os outros dedos dobram em torno do X local do osso, que é
# o padrão do controlador. O polegar não: flexioná-lo no mesmo eixo só o afasta
# da mão. A primeira falange precisa girar em torno de um eixo que o leve POR
# CIMA da palma, ao encontro dos dedos — é o que fecha a pinça na carta.
# O eixo saiu de uma varredura: entre 288 direções, esta é a que mais aproxima
# a ponta do polegar da ponta do indicador (0,78 → 0,55 em unidades de mão).
# Vai no `extras` do osso, que o GLTFLoader entrega em `userData.eixoFlexao` —
# o contrato que primeira-pessoa-maos.js já lê.
arm_data.bones[f'{LADO}Thumb1']['eixoFlexao'] = [-0.259, 0.0, 0.966 * ESP]

# pesos: como a geometria é nossa, cada vértice vai para o eixo de dedo mais próximo,
# repartido pelas falanges conforme a posição ao longo dele (mesmo esquema do rig_dedos)
mao.data.validate(); mao.data.update()
def smooth(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)
def rampa(a, centro, meia): return smooth((a - centro + meia) / (2 * meia))
eixos = {nome: (Vector((x, y, 0)), Vector((0, 1, 0)), comp, raio) for nome, (x, y, comp, raio) in DEDOS.items()}
eixos['Thumb'] = (POLEGAR['base'], POLEGAR['dir'], POLEGAR['comp'], POLEGAR['raio'])
grupos = {n: mao.vertex_groups.new(name=n) for n in [f'{LADO}Hand'] + [f'{LADO}{d}{k}' for d in eixos for k in (1, 2, 3)]}
for v in mao.data.vertices:
    p = v.co; melhor = None
    for nome, (base, dirv, comp, raio) in eixos.items():
        t = (p - base).dot(dirv); dist = (p - base - dirv * max(0.0, min(comp, t))).length
        a = t / comp
        if melhor is None or dist - raio < melhor[0]: melhor = (dist - raio, nome, a, dist)
    folga, nome, a, dist = melhor
    pesos = {}
    if a >= -0.15 and folga < 0.12:          # dentro/junto do dedo
        s2, s3 = rampa(a, JUNTAS[1], 0.11), rampa(a, JUNTAS[2], 0.11)
        seg = [1 - s2, s2 - s3, s3]; parte_mao = 0.5 * (1 - rampa(a, 0.15, 0.15))
        if folga > 0.03: parte_mao = max(parte_mao, min(1.0, (folga - 0.03) / 0.09))  # pele da palma perto da base
        for k in range(3): pesos[f'{LADO}{nome}{k + 1}'] = seg[k] * (1 - parte_mao)
        pesos[f'{LADO}Hand'] = parte_mao
    else:
        pesos[f'{LADO}Hand'] = 1.0
    tot = sum(pesos.values())
    for n, w in pesos.items():
        if w > 1e-4: grupos[n].add([v.index], w / tot, 'REPLACE')
mao.parent = arm; mod = mao.modifiers.new('arm', 'ARMATURE'); mod.object = arm
vazios = [n for n, g in grupos.items() if not any(gr.group == g.index and gr.weight > 0 for v in mao.data.vertices for gr in v.groups)]
print('grupos sem peso:', vazios)

if args.render:
    cena = bpy.context.scene; cena.render.engine = 'BLENDER_WORKBENCH'; cena.render.resolution_x = 900; cena.render.resolution_y = 600
    cena.display.shading.light = 'STUDIO'; cena.display.shading.color_type = 'SINGLE'; cena.display.shading.single_color = (0.85, 0.6, 0.45)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); cena.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 1.6
    cam.location = (0.1, 0.45, 3.0); cam.rotation_euler = (0, 0, 0)          # de frente para a palma (+Z)
    cena.render.filepath = args.render; bpy.ops.render.render(write_still=True)
    cam.location = (0.1, 0.45, -3.0); cam.rotation_euler = (math.pi, 0, 0)  # costas da mão
    cena.render.filepath = args.render.replace('.png', '-costas.png'); bpy.ops.render.render(write_still=True)
    cam.location = (3.0, 0.45, 0.0); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)  # de lado (do polegar)
    cena.render.filepath = args.render.replace('.png', '-lado.png'); bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action='DESELECT'); mao.select_set(True); arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=args.saida, export_format='GLB', use_selection=True, export_yup=False, export_skins=True,
                          export_apply=True, export_animations=False, export_materials='NONE', export_texcoords=False,
                          export_extras=True)   # leva o `eixoFlexao` do polegar para o nó
print('gravado', args.saida)
