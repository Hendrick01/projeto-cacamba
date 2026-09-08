"""Prepara um enfeite de mesa (copo, pod) vindo do Meshy para a mesa 3D.

O que chega do gerador é pesado demais para um objeto de cenário: ~39 mil
triângulos e três texturas de 2 MB (cor, relevo, metal/rugosidade). Na mesa ele
ocupa uns poucos centímetros de tela — vale o mesmo que o copo de cilindro que
havia antes, e não pode custar mais que uma carta. Aqui ele:

  * fica em pé (glTF é Y para cima), apoiado em y=0 e centrado no chão;
  * ganha a altura real em metros (o copo tem 30 cm com canudo; o pod, 11);
  * perde a maior parte dos triângulos (o silhueta é o que se vê);
  * fica só com a cor, reduzida — relevo e metal/rugosidade viram números
    fixos no material, que a essa distância ninguém distingue.

Uso:
  blender --background --python scripts/prepara_enfeite.py -- \
      entrada.glb public/models/copo.glb --altura 0.30 --triangulos 3000
"""

import bpy
import sys
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
entrada, saida = args[0], args[1]
altura_alvo = float(args[args.index('--altura') + 1]) if '--altura' in args else 0.30
tri_alvo = int(args[args.index('--triangulos') + 1]) if '--triangulos' in args else 3000
tex_px = int(args[args.index('--textura') + 1]) if '--textura' in args else 512

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=entrada)

malhas = [o for o in bpy.data.objects if o.type == 'MESH']
if not malhas:
    raise SystemExit('sem malha em ' + entrada)

# junta tudo numa peça só: um objeto de cenário é um desenho de chamada
bpy.ops.object.select_all(action='DESELECT')
for o in malhas:
    o.select_set(True)
bpy.context.view_layer.objects.active = malhas[0]
if len(malhas) > 1:
    bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# As normais gravadas pelo gerador descrevem a malha CHEIA: se sobreviverem à
# decimação, cada triângulo novo fica com a normal de um vizinho que já não
# existe e o copo sai estilhaçado, como vidro quebrado. Fora elas — o ângulo
# de suavização faz o mesmo serviço numa malha simples.
bpy.ops.mesh.customdata_custom_splitnormals_clear()

# em pé, apoiado no zero, centrado, na altura real em metros
pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
escala = altura_alvo / max(1e-6, hi.z - lo.z)
ob.scale = (escala, escala, escala)
bpy.ops.object.transform_apply(scale=True)
pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
ob.location -= Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
bpy.ops.object.transform_apply(location=True)

# O gerador entrega a casca partida nas costuras de UV: vértices no mesmo
# ponto, sem aresta entre eles. Sem costurar, a decimação não tem por onde
# colapsar e o que sai é um monte de lascas. Depois disso, menos triângulos —
# a essa distância o que se vê é a silhueta.
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0006)
bpy.ops.object.mode_set(mode='OBJECT')
tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
if tris > tri_alvo:
    dec = ob.modifiers.new('decima', 'DECIMATE')
    dec.ratio = tri_alvo / tris
    bpy.ops.object.modifier_apply(modifier=dec.name)
if hasattr(bpy.ops.object, 'shade_smooth_by_angle'):
    bpy.ops.object.shade_smooth_by_angle(angle=0.7)
else:
    bpy.ops.object.shade_smooth()

# só a cor, e pequena: relevo e metal/rugosidade viram constantes
for mat in list(bpy.data.materials):
    if not mat.use_nodes:
        continue
    principled = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not principled:
        continue
    guardar = set()
    for nome, valor in (('Roughness', 0.35), ('Metallic', 0.0)):
        ent = principled.inputs.get(nome)
        if ent and ent.is_linked:
            mat.node_tree.links.remove(ent.links[0])
        if ent:
            ent.default_value = valor
    normal = principled.inputs.get('Normal')
    if normal and normal.is_linked:
        mat.node_tree.links.remove(normal.links[0])
    cor = principled.inputs.get('Base Color')
    if cor and cor.is_linked:
        no = cor.links[0].from_node
        if no.type == 'TEX_IMAGE' and no.image:
            guardar.add(no.image.name)
    # o que não alimenta mais nada sai do arquivo
    for no in list(mat.node_tree.nodes):
        if no.type == 'TEX_IMAGE' and no.image and no.image.name not in guardar:
            mat.node_tree.nodes.remove(no)

for img in bpy.data.images:
    if img.users and max(img.size) > tex_px:
        lado = max(img.size)
        img.scale(int(img.size[0] * tex_px / lado), int(img.size[1] * tex_px / lado))

bpy.ops.export_scene.gltf(
    filepath=saida,
    export_format='GLB',
    export_image_format='JPEG',
    export_jpeg_quality=82,
    export_apply=True,
    export_yup=True,
)
tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
print('ENFEITE', saida, 'triangulos', tris, 'altura', round(altura_alvo, 3))
