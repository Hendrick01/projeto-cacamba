"""Monta o .blend em que a mão de primeira pessoa é posada segurando uma carta.

Uso: Blender --background --python scripts/mao_para_posar.py -- saida.blend
     [--mao public/models/mao-fp-esq.glb]

Por que existe: posicionar a mão por fora nunca fecha. Medindo em execução, com
a pose de dedos quase retos que o jogo usa hoje, a ponta do polegar fica 16,3 cm
ATRÁS do ponto mais avançado do resto da mão — e girar a mão não muda isso (o
giro é em torno do eixo da profundidade, que preserva o z de todo vértice). Quem
tem de mudar é a POSE.

O arquivo traz três coisas:

  `mao`            a malha rigada, com os 15 ossos de dedo;
  `CARTA`          um retângulo do tamanho exato de uma carta NA ESCALA DA MÃO —
                   0,34 × 0,478, porque uma carta tem 63 mm de largura e a mão,
                   do punho à ponta do médio, 185 mm (2,94 larguras). É contra
                   ele que se posa;
  `PlanoDaCarta`   um eixo (empty) preso ao retângulo. É o CONTRATO: o jogo lê a
                   posição e a orientação dele e alinha o leque a ele. Enquanto
                   ele não existir, o jogo tem de adivinhar de que lado a mão
                   segura — e é por isso que hoje ela aparece virada.

O que fazer no Blender, em modo POSE (só rotação de osso; não mexa na malha):

  1. feche os quatro dedos ATRÁS do retângulo — eles sustentam a carta e ficam
     escondidos por ela;
  2. traga o polegar À FRENTE do retângulo, cruzando a carta. Ele é a única
     parte que aparece;
  3. se precisar, mova o `CARTA` (com o `PlanoDaCarta` junto) para onde a mão
     segura de verdade — o jogo se alinha a ele, não o contrário;
  4. File > Export > glTF 2.0, com "Include > Selected Objects" desmarcado,
     "Data > Mesh > Apply Modifiers" ligado.

Como conferir se ficou certo, sem opinião: depois de importar no jogo,
`window.mesa3d.maos.medida` tem de dizer `restoNaFrente: 0` e
`polegarNaFrente` maior que zero.
"""
import argparse, math, sys
import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('saida')
ap.add_argument('--mao', default='public/models/mao-fp-esq.glb')
ap.add_argument('--glb', help='exporta o rig repesado de volta, sem posar (serve para a mão que só joga)')
args = ap.parse_args(argv)

# Uma carta tem 63 × 88 mm; a mão, 185 mm do punho à ponta do médio. Como o
# modelo canônico tem esse comprimento igual a 1, a carta mede 63/185 de largura.
LARGURA = 63 / 185
ALTURA = 88 / 185

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.mao)

# a maior malha é a mão: o importador de glTF ainda cria um `Icosphere` de 42
# vértices como widget de osso, e pegar "a primeira" pegava o widget
malha = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))
malha.name = malha.data.name = 'mao'
for o in [o for o in bpy.data.objects if o.type == 'MESH' and o is not malha]:
    bpy.data.objects.remove(o, do_unlink=True)
arm = next((o for o in bpy.data.objects if o.type == 'ARMATURE'), None)
dedos = [b.name for b in arm.data.bones] if arm else []


def costura():
    """Quantos vértices seguem um osso só. É a medida do problema: onde a pele
    passa de um osso para o outro de uma vez, ela rasga ao dobrar."""
    return sum(1 for v in malha.data.vertices if len([g for g in v.groups if g.weight > 0.01]) < 2)


if arm:
    # O conversor do Meshy pesou por proximidade: 1.518 dos 2.283 vértices
    # ficaram presos a UM osso com peso 1, e a costura entre o polegar e a palma
    # é um degrau seco de 0,5/0,5. Não é defeito de pose — é o rig: qualquer
    # oposição do polegar abre ali uma aba reta de pele esticada, e foi o que
    # apareceu nos primeiros testes. A difusão de calor do Blender resolve
    # porque reparte cada vértice entre os ossos que o alcançam.
    antes = costura()
    for m in list(malha.modifiers):
        if m.type == 'ARMATURE': malha.modifiers.remove(m)
    malha.vertex_groups.clear()
    bpy.ops.object.select_all(action='DESELECT')
    malha.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError as erro:      # a difusão não converge em malha aberta
        print('difusao de calor falhou (%s) — voltando aos pesos de origem' % erro)
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=args.mao)
        malha = next(o for o in bpy.data.objects if o.type == 'MESH')
        malha.name = malha.data.name = 'mao'
        arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    else:
        bpy.ops.object.select_all(action='DESELECT')
        malha.select_set(True); bpy.context.view_layer.objects.active = malha
        bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
        bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=2)
        bpy.ops.object.mode_set(mode='OBJECT')
        print('pesos refeitos: vertices presos a um osso so, %d → %d de %d'
              % (antes, costura(), len(malha.data.vertices)))

# A carta: um retângulo no tamanho certo, de pé (os dedos apontam para +Z no
# Blender, porque o importador de glTF converte Y-up para Z-up), na frente da
# palma. É um ponto de partida — mova-o no Blender se a mão segurar noutro lugar.
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, -0.10, 0.50))
carta = bpy.context.object
carta.name = 'CARTA'
carta.rotation_euler = (math.pi / 2, 0, 0)      # de pé, de frente para -Y (a palma olha para -Y)
carta.scale = (LARGURA, ALTURA, 1)
# SÓLIDA, não arame: é olhando o que ela esconde que se sabe o que ficou atrás.
# Dedo que sumir por trás da carta está no lugar certo; dedo que continuar
# aparecendo está na frente dela.
carta.display_type = 'SOLID'

eixo = bpy.data.objects.new('PlanoDaCarta', None)
eixo.empty_display_type = 'ARROWS'
eixo.empty_display_size = 0.25
bpy.context.collection.objects.link(eixo)
eixo.parent = carta
eixo.matrix_parent_inverse = carta.matrix_world.inverted()

if arm:
    arm.show_in_front = True
    arm.data.display_type = 'OCTAHEDRAL'

if args.glb:
    bpy.ops.object.select_all(action='DESELECT')
    malha.select_set(True); arm.select_set(True)
    bpy.ops.export_scene.gltf(filepath=args.glb, export_format='GLB', use_selection=True, export_yup=False,
                              export_skins=True, export_apply=False, export_animations=False,
                              export_materials='NONE', export_texcoords=False, export_extras=True)
    print('rig repesado gravado em', args.glb)

bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(args.saida))
print('gravado %s — malha "%s", %d ossos, carta de %.3f x %.3f' % (args.saida, malha.name, len(dedos), LARGURA, ALTURA))
