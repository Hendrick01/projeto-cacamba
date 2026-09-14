"""OLHA a mão de primeira pessoa: desenha a carta do contrato no lugar dela e
renderiza do olho do jogador — mais o medidor que faltava.

CUIDADO — ESTE SCRIPT NÃO SERVE PARA CONFERIR O ARQUIVO ENTREGUE. Ele reimporta
o .glb no Blender, e o importador de glTF converte eixos de forma INCONSISTENTE
entre a malha e o empty: o contrato volta num quadro e a mão em outro. Medido em
10/09/2026 no mesmo arquivo — aqui dava "resto sobre a carta 154, pegada 0,90" e
o motor do jogo dava "0 e 0,22". Quem manda é `scripts/mede_mao.mjs`, que lê o
.glb com o three.js, o mesmo motor que desenha o jogo; para OLHAR, use
`public/inspetor-mao.html`. Isto aqui vale para inspecionar cena de Blender.

Uso: Blender --background --python scripts/olha_mao.py -- mao.glb [--saida pasta]
     [--nome prefixo] [--largura 700]

Por que existe: o critério de `mao_pose_segura.py` mede um PLANO INFINITO — "quantos
vértices estão à frente do plano da carta". A pose entregue passava nele e mesmo
assim era um punho fechado com o polegar 23 cm AO LADO da carta, sem cruzar nada
(medido em 10/09/2026: polegar de +0,2336 a +0,3435, carta de -0,2127 a +0,1279).
Estar à frente do plano não é estar SOBRE a carta.

Este script mede o que interessa, no retângulo:

  `polegar_sobre_a_carta`  vértices do polegar dentro do retângulo E à frente.
                           É o gesto: numa mão que segura um leque, o polegar é a
                           única coisa que o jogador vê cruzando as cartas.
  `resto_sobre_a_carta`    vértices que não são do polegar, dentro do retângulo e à
                           frente. TEM DE SER ZERO — é o "as mãos estão por cima
                           das cartas" do usuário, contado.
  `altura_da_pegada`       onde a mão agarra, em fração da altura da carta (0 = borda
                           de baixo, 1 = borda de cima). A referência que o usuário
                           mandou é uma mão que segura pelo CANTO DE BAIXO: quanto
                           mais perto de 0, melhor; perto de 1 é a mão agarrando o
                           leque pelo topo, tapando a face das cartas.

Uma carta na escala da mão mede 0,34 × 0,478 (63 mm contra 185 mm do punho à ponta
do médio). O `PlanoDaCarta` é o contrato: origem no centro da carta, +Z a normal da
palma — o lado do olho do jogador — e +Y a direção em que a carta sobe.
"""
import argparse, os, sys
import bpy
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('glb')
ap.add_argument('--saida', default='/tmp')
ap.add_argument('--nome', default='mao')
ap.add_argument('--largura', type=int, default=700)
ap.add_argument('--distancia', type=float, default=0.95)
args = ap.parse_args(argv)

LARG, ALT = 0.34, 0.478          # a carta, na escala da mão

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=args.glb)

plano = bpy.data.objects['PlanoDaCarta']
mao = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.vertices))

# --- o medidor ---------------------------------------------------------------
# A malha DEFORMADA (com o esqueleto aplicado), levada para o espaço do contrato.
dg = bpy.context.evaluated_depsgraph_get()
ev = mao.evaluated_get(dg)
me = ev.to_mesh()
P = np.array(plano.matrix_world.inverted() @ mao.matrix_world)
co = np.ones((len(me.vertices), 4))
co[:, :3] = [v.co[:] for v in me.vertices]
local = (P @ co.T).T[:, :3]

# de que osso é cada vértice: o grupo de maior peso
grupos = {g.index: g.name for g in mao.vertex_groups}
do_polegar = np.zeros(len(me.vertices), dtype=bool)
for i, v in enumerate(me.vertices):
    if v.groups:
        melhor = max(v.groups, key=lambda g: g.weight)
        do_polegar[i] = 'Thumb' in grupos.get(melhor.group, '')
ev.to_mesh_clear()

dentro = (np.abs(local[:, 0]) <= LARG / 2) & (np.abs(local[:, 1]) <= ALT / 2)
frente = local[:, 2] > 0
sobre = dentro & frente

# onde a mão agarra: a altura média dos dedos, em fração da carta
dedos = ~do_polegar
altura = (local[dedos, 1].mean() + ALT / 2) / ALT if dedos.any() else float('nan')

print('MEDIDA NO RETANGULO DA CARTA (%s):' % os.path.basename(args.glb))
print('  vertices                %d' % len(local))
print('  polegar sobre a carta   %d' % int((sobre & do_polegar).sum()))
print('  resto sobre a carta     %d   <- tem de ser 0' % int((sobre & dedos).sum()))
print('  polegar dentro do retangulo (qualquer profundidade)  %d' % int((dentro & do_polegar).sum()))
print('  altura da pegada        %.2f  (0 = borda de baixo, 1 = borda de cima)' % altura)
print('  polegar em x de %+.4f a %+.4f   (a carta vai de %+.4f a %+.4f)'
      % (local[do_polegar, 0].min(), local[do_polegar, 0].max(), -LARG / 2, LARG / 2))
print('  mao em y de %+.4f a %+.4f       (a carta vai de %+.4f a %+.4f)'
      % (local[:, 1].min(), local[:, 1].max(), -ALT / 2, ALT / 2))

# --- as vistas ---------------------------------------------------------------
me2 = bpy.data.meshes.new('CARTA')
me2.from_pydata([(-LARG / 2, -ALT / 2, 0), (LARG / 2, -ALT / 2, 0),
                 (LARG / 2, ALT / 2, 0), (-LARG / 2, ALT / 2, 0)], [], [(0, 1, 2, 3)])
me2.update()
carta = bpy.data.objects.new('CARTA', me2)
bpy.context.collection.objects.link(carta)
carta.matrix_world = plano.matrix_world
carta.color = (0.82, 0.16, 0.16, 1)
mao.color = (0.93, 0.78, 0.66, 1)

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'OBJECT'
sc.display.shading.light = 'STUDIO'
sc.render.resolution_x = sc.render.resolution_y = args.largura
sc.render.film_transparent = False

cd = bpy.data.cameras.new('Cam'); cd.lens = 50
cam = bpy.data.objects.new('Cam', cd)
bpy.context.collection.objects.link(cam); sc.camera = cam

loc, rot, _ = plano.matrix_world.decompose()
ex, ey, ez = (rot @ Vector(v) for v in ((1, 0, 0), (0, 1, 0), (0, 0, 1)))


def olha(pos, alvo, cima):
    d = (pos - alvo).normalized(); r = cima.cross(d).normalized(); u = d.cross(r)
    return Matrix(((r.x, u.x, d.x, pos.x), (r.y, u.y, d.y, pos.y), (r.z, u.z, d.z, pos.z), (0, 0, 0, 1)))


d = args.distancia
for nome, (pos, cima) in {
    'frente': (loc + ez * d, ey),     # o olho do jogador
    'lado':   (loc + ex * d, ey),
    'cima':   (loc + ey * d, -ez),
}.items():
    cam.matrix_world = olha(pos, loc, cima)
    sc.render.filepath = os.path.join(args.saida, f'{args.nome}_{nome}.png')
    bpy.ops.render.render(write_still=True)
    print('vista', nome, '->', sc.render.filepath)
