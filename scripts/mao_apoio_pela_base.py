"""Espelha a pose de pinça da mão existente para apoiar o leque pela base.

Uso: Blender --background --python scripts/mao_apoio_pela_base.py -- entrada.blend saida.blend saida.glb
Mantém malha e pesos; troca somente lateralidade, pose de apoio e quadro da carta.
"""
import bpy, sys
from mathutils import Matrix, Vector
entrada, blend, glb = sys.argv[sys.argv.index('--')+1:]
bpy.ops.wm.open_mainfile(filepath=entrada)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
mao = max((o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name != 'CARTA'), key=lambda o:len(o.data.vertices))
eixo = bpy.data.objects['PlanoDaCarta']
reflexao = Matrix.Diagonal(Vector((-1,1,1,1)))
originais = {o:o.matrix_world.copy() for o in (arm,mao,eixo)}
for o in (arm,mao,eixo): o.matrix_world = reflexao @ originais[o]
for b in arm.data.bones: b.name = b.name.replace('Right','Left')
for g in mao.vertex_groups: g.name = g.name.replace('Right','Left')
# A carta sobe a partir da pinça. O quadro continua destro: x = y × z.
p = eixo.matrix_world.copy()
y = -p.col[1].xyz.normalized(); z = p.col[2].xyz.normalized(); x = y.cross(z)
contato = p.translation + p.col[1].xyz * (88/185/2 - .02)
origem = contato + y * (88/185/2 - .02)
eixo.matrix_world = Matrix.Translation(origem) @ Matrix((x,y,z)).transposed().to_4x4()
carta = bpy.data.objects.get('CARTA')
if carta: carta.matrix_world = eixo.matrix_world @ Matrix.Diagonal(Vector((63/185,88/185,1,1)))
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
for o in (arm,mao,eixo): o.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(blend))
bpy.ops.export_scene.gltf(filepath=glb,export_format='GLB',use_selection=True,export_yup=False,
    export_skins=True,export_apply=False,export_animations=False,export_rest_position_armature=False,
    export_materials='NONE',export_texcoords=False,export_extras=True)
print('APOIO_PELA_BASE',glb)
