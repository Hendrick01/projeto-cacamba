"""Posa a mão que SEGURA o leque, pela referência: pegada no pé das cartas.

Uso: Blender --background --python scripts/mao_segura_leque.py -- entrada.blend
     [--glb saida.glb] [--blend saida.blend] [--pegada 0.22] [--cartas 12]

POR QUE ESTE SCRIPT EXISTE, e não mais o `mao_pose_segura.py` para esta mão.
Medindo o arquivo que estava sendo entregue (10/09/2026, `scripts/olha_mao.py`):

    polegar sobre a carta   0 vertices      <- o gesto simplesmente não existia
    resto sobre a carta    82 vertices      <- e a mão tapava a face da carta
    altura da pegada      0.86              <- agarrada pelo TOPO, não pelo pé

O `mao_pose_segura.py` dava "CRITERIO: CUMPRIDO" nisso, e estava certo dentro da
própria conta: ele mede um PLANO INFINITO — "quantos vértices estão à frente do
plano da carta". O polegar estava à frente do plano, sim, e 23 cm AO LADO do
retângulo, sem cruzar nada. Estar à frente do plano não é estar sobre a carta.

O segundo erro vem do ancoramento: lá a carta nasce com a BORDA DE BAIXO na base
do polegar, e sobe. Como a carta tem 0,478 e a mão esticada é mais comprida que
isso, as pontas dos dedos passavam do topo — e um laço as enrolava até 60° "para
não espiarem por cima do leque". É esse laço que fabrica o punho fechado.

O QUE MUDA AQUI, lido nas duas referências que o usuário mandou (a foto da mão
com o leque de ases e a gravura das duas mãos):

  1. A PEGADA É NO PÉ DO LEQUE. A carta não nasce da mão: a mão é que se coloca
     no terço de baixo da carta, e a carta sobe dali. `--pegada` é a altura da
     pegada em fração da carta (0 = borda de baixo, 1 = topo); 0,22 é o terço de
     baixo. Com a mão embaixo, dedo esticado NÃO espia por cima — o laço que
     fazia o punho deixa de ser necessário e some.
  2. OS QUATRO DEDOS FICAM ATRÁS, quase retos. Fecham só até a ponta alcançar a
     profundidade em que a palma toca o leque — é a mão que sustenta as cartas,
     não a que as agarra. Atrás da carta eles não aparecem, então não há nada a
     esconder enrolando.
  3. O POLEGAR TEM DE POUSAR SOBRE A CARTA, e é isto que passa a ser medido. Em
     vez de "passe à frente do plano", o alvo é um PONTO no retângulo, na face
     da frente: o polegar deitado no terço de baixo, como na foto. A busca é a
     mesma descida gulosa de sempre (ela funciona); o que muda é para onde.
  4. O QUADRO DA CARTA E A POSE SE RESOLVEM JUNTOS. Onde a carta fica depende de
     onde a mão agarra, e onde o polegar alcança depende de onde a carta está.
     São dois lados da mesma equação: o laço externo alterna os dois até o
     polegar cair dentro do retângulo. Fixar um e depois o outro, como antes,
     é o que deixava o polegar do lado de fora.

O critério de aceitação também muda, e agora é o do olho: no retângulo da carta,
`polegar sobre a carta` > 0 e `resto sobre a carta` == 0. Confira com
`scripts/olha_mao.py`, que mede e ainda desenha as três vistas.
"""
import argparse, math, sys
import bpy
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('entrada')
ap.add_argument('--glb'); ap.add_argument('--blend')
ap.add_argument('--cartas', type=int, default=12, help='cartas na mão: é a espessura do leque')
ap.add_argument('--pegada', type=float, default=0.22,
                help='altura da pegada em fração da carta (0 = borda de baixo, 1 = topo)')
ap.add_argument('--margem', type=float, default=0.012, help='folga entre a ponta do dedo e a borda de cima')
ap.add_argument('--contato', type=float, default=0.005, help='quão perto do plano da palma a ponta do dedo chega')
ap.add_argument('--pele', type=float, default=0.005, help='folga de pele entre o polegar e a face da frente')
ap.add_argument('--fundoU', type=float, default=0.22,
                help='onde o polegar pousa na largura, em fração da largura da carta a partir do centro')
ap.add_argument('--fundoV', type=float, default=0.28,
                help='onde o polegar pousa na altura, em fração da altura abaixo do centro')
ap.add_argument('--junta', type=float, default=math.radians(60), help='rotação máxima em cada junta do polegar')
ap.add_argument('--passo', type=float, default=math.radians(3), help='resolução da busca do polegar')
ap.add_argument('--passoDedo', type=float, default=math.radians(3), help='resolução da busca dos dedos')
ap.add_argument('--limite', type=float, default=math.radians(45), help='fechamento máximo da falange da base')
ap.add_argument('--voltas', type=int, default=5, help='alternâncias entre o quadro da carta e a pose do polegar')
ap.add_argument('--polegarFora', type=float, default=0.0,
                help='quanto o vertice mais atrasado da falange do polegar passa da face da frente')
ap.add_argument('--deitado', type=float, default=0.05,
                help='peso de manter a falange do polegar deitada na direcao em que a carta sobe')
args = ap.parse_args(argv)

ESPESSURA = args.cartas * 0.3 / 185        # 12 cartas de 0,3 mm, na escala da mão (185 mm)

bpy.ops.wm.open_mainfile(filepath=args.entrada)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mao = max((o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'CARTA'),
          key=lambda o: len(o.data.vertices))
carta = bpy.data.objects['CARTA']
eixo = bpy.data.objects.get('PlanoDaCarta')

LADO = 'Right' if any(b.name.startswith('Right') for b in arm.data.bones) else 'Left'
DEDOS = ['Index', 'Middle', 'Ring', 'Pinky']
PROP = (1.0, 1.25, 0.9)                    # a falange do meio dobra mais que a base
LARG, ALT = carta.scale.x, carta.scale.y


def vertices_por_osso():
    grupos = {g.index: g.name for g in mao.vertex_groups}
    dono = {}
    for v in mao.data.vertices:
        melhor, peso = None, -1
        for g in v.groups:
            if g.weight > peso: peso, melhor = g.weight, grupos.get(g.group)
        dono.setdefault(melhor or '(sem osso)', []).append(v.index)
    return {k: np.array(v, dtype=int) for k, v in dono.items()}


DONO = vertices_por_osso()
PALMA = DONO.get(f'{LADO}Hand', np.array([], dtype=int))
NAO_POLEGAR = np.concatenate([i for nome, i in DONO.items() if 'Thumb' not in nome])
POLEGAR = np.concatenate([i for nome, i in DONO.items() if 'Thumb' in nome])
PONTA_POL = DONO[f'{LADO}Thumb3']
DEDOS_TODOS = np.concatenate([DONO[f'{LADO}{d}{k}'] for d in DEDOS for k in (1, 2, 3)])

# --- o quadro em que tudo é medido: (lado, cima, normal) da própria mão -------
M = np.array(mao.matrix_world)
REPOUSO = np.array([v.co[:] for v in mao.data.vertices]) @ M[:3, :3].T + M[:3, 3]
P = REPOUSO[PALMA]
_, _, Vt = np.linalg.svd(P - P.mean(0))
normal = Vector(Vt[2]).normalized()
if float((REPOUSO[DONO[f'{LADO}Thumb3']].mean(0) - P.mean(0)) @ np.array(normal[:])) < 0:
    normal = -normal
punho = arm.matrix_world @ arm.data.bones[f'{LADO}Hand'].head_local
noMedio = arm.matrix_world @ arm.data.bones[f'{LADO}Middle1'].head_local
cima = (noMedio - punho); cima -= normal * cima.dot(normal); cima.normalize()
lado = cima.cross(normal)
EIXOS = np.column_stack([np.array(lado[:]), np.array(cima[:]), np.array(normal[:])])
print('QUADRO DA MAO: normal %+.3f %+.3f %+.3f · punho→medio %+.3f %+.3f %+.3f' % (*normal, *cima))

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for osso in arm.pose.bones:
    osso.rotation_mode = 'XYZ'
    osso.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()


def estado():
    dg = bpy.context.evaluated_depsgraph_get()
    ob = mao.evaluated_get(dg); me = ob.to_mesh()
    plano = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', plano)
    mundo = plano.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    ob.to_mesh_clear()
    return mundo @ EIXOS


def fecha(ossos, ang):
    for k, osso in enumerate(ossos): osso.rotation_euler = (ang * PROP[k], 0, 0)
    bpy.context.view_layer.update()


def poe_dedos(ang):
    for d in DEDOS:
        fecha([arm.pose.bones[f'{LADO}{d}{k}'] for k in (1, 2, 3)], SINAL * ang)


E0 = estado()
ALVO = float(E0[PALMA][:, 2].max())        # a profundidade em que o leque encosta na mão aberta

# de que lado o dedo dobra é medida, não palpite
teste = [arm.pose.bones[f'{LADO}Index{k}'] for k in (1, 2, 3)]
pontaTeste = DONO[f'{LADO}Index3']
fecha(teste, math.radians(5)); mais = estado()[pontaTeste][:, 2].max()
fecha(teste, math.radians(-5)); menos = estado()[pontaTeste][:, 2].max()
fecha(teste, 0.0)
SINAL = 1.0 if mais > menos else -1.0

# --- 1. OS QUATRO DEDOS: atrás do leque, fechando só até TOCAR ---------------
# Nada de enrolar para esconder ponta de dedo: com a pegada no pé do leque não
# há ponta espiando por cima. Eles fecham até alcançar a profundidade em que a
# palma toca as cartas — é a mão que sustenta o leque, e mais que isso é punho.
fechado = 0.0
while fechado <= args.limite:
    poe_dedos(fechado)
    E = estado()
    falta = max(ALVO - float(E[DONO[f'{LADO}{d}3']][:, 2].max()) for d in DEDOS)
    if falta <= args.contato: break
    fechado += args.passoDedo
poe_dedos(fechado)
print('DEDOS: %.0f graus na base (%.0f somando as tres falanges) — atras do leque, sustentando'
      % (math.degrees(fechado), math.degrees(fechado) * sum(PROP)))

# --- 2. O POLEGAR: como ele gira --------------------------------------------
pol = [arm.pose.bones[f'{LADO}Thumb{k}'] for k in (1, 2, 3)]
for osso in pol: osso.rotation_mode = 'QUATERNION'
bruto = arm.data.bones[f'{LADO}Thumb1'].get('eixoFlexao')
# o extra veio do glTF (Y para cima) e o importador não o girou: (x, y, z) → (x, −z, y)
EIXO_VARRE = (arm.matrix_world.to_3x3() @ Vector((bruto[0], -bruto[2], bruto[1]))).normalized()


def gira_no_mundo(osso, eixoGiro, ang):
    cabeca = osso.matrix.translation.copy()
    R = Matrix.Translation(cabeca) @ Matrix.Rotation(ang, 4, eixoGiro) @ Matrix.Translation(-cabeca)
    osso.matrix = R @ osso.matrix
    bpy.context.view_layer.update()


def eixos_de(osso):
    R = osso.matrix.to_3x3()
    return [R.col[0].normalized(), R.col[1].normalized(), R.col[2].normalized(), EIXO_VARRE]


def poe_polegar(custo):
    """Descida gulosa: um passo por vez, sempre na junta e no eixo que mais ajudam.
    Repartir entre as três juntas importa — 111 graus só na base rasgavam a pele
    da tenar, e é assim que a mão trabalha."""
    for osso in pol: osso.rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()
    usado = {o.name: 0.0 for o in pol}
    atual = custo()
    while atual > 1e-4:
        melhor = None
        for osso in pol:
            if usado[osso.name] >= args.junta: continue
            for eixoGiro in eixos_de(osso):
                for sentido in (1.0, -1.0):
                    gira_no_mundo(osso, eixoGiro, sentido * args.passo)
                    d = custo()
                    gira_no_mundo(osso, eixoGiro, -sentido * args.passo)
                    if d < atual - 1e-9 and (melhor is None or d < melhor[0]):
                        melhor = (d, osso, eixoGiro, sentido)
        if melhor is None: break
        atual, osso, eixoGiro, sentido = melhor
        gira_no_mundo(osso, eixoGiro, sentido * args.passo)
        usado[osso.name] += args.passo
    return sum(usado.values()), atual


# --- 3. O LAÇO: o quadro da carta e o polegar se resolvem juntos -------------
E = estado()
# de que lado da mão o polegar vive, na largura: sai da medida, não do rótulo
SENTIDO_POL = 1.0 if E[POLEGAR][:, 0].mean() > E[DEDOS_TODOS][:, 0].mean() else -1.0
centroU = float(E[DEDOS_TODOS][:, 0].mean())
alvoPol = None

for volta in range(args.voltas):
    E = estado()
    # ONDE A CARTA FICA. Na altura: a mão agarra no pé do leque, então o centro
    # da carta sobe acima da massa dos dedos. Na profundidade: rente ao ponto
    # mais avançado do resto da mão, mais meio leque.
    centroV = float(E[DEDOS_TODOS][:, 1].mean()) + (0.5 - args.pegada) * ALT
    # e sobe mais, se algum dedo ainda passar do topo: quem cede é a CARTA, não
    # o dedo. Enrolar o dedo para caber é o que fabricava o punho.
    alto = float(E[DEDOS_TODOS][:, 1].max())
    centroV = max(centroV, alto + args.margem - ALT / 2)
    centroN = float(E[NAO_POLEGAR][:, 2].max()) + ESPESSURA / 2

    # O ALVO DO POLEGAR: um ponto NO retângulo, na face da frente. É a foto: o
    # polegar deitado no terço de baixo do leque, cruzando as cartas.
    alvoPol = np.array([centroU + SENTIDO_POL * args.fundoU * LARG,
                        centroV - args.fundoV * ALT,
                        centroN + ESPESSURA / 2 + args.pele])

    def custo_do_polegar():
        """Duas contas. A que manda: a distância da última falange ao ponto onde
        ela tem de pousar — a falange INTEIRA, pela média, porque medindo só a
        pontinha a busca para assim que a unha assoma e o que aparece sobre as
        cartas é um calombo, não um dedão.

        A segunda, que decide entre as poses que já pousam: a falange fica
        DEITADA na direção em que as cartas sobem. É o que se vê na foto que o
        usuário mandou — o polegar acompanha o leque, não o espeta. Vale pouco
        (0,05 contra a distância inteira) de propósito: é desempate, não alvo."""
        E = estado()
        osso = arm.pose.bones[f'{LADO}Thumb3']
        direcao = (arm.matrix_world.to_3x3() @ (osso.tail - osso.head)).normalized()
        subida = float(np.array(direcao[:]) @ EIXOS[:, 1])
        # Na largura e na altura, a média da falange vai ao ponto de pouso. Na
        # PROFUNDIDADE, não: é o vértice mais ATRASADO da falange que tem de
        # passar da face da frente — senão a busca para com a falange metade
        # dentro, metade fora, e o que aparece sobre as cartas é a pontinha
        # (32 de 297 vértices, visto na mesa em 14/09/2026): um calombo, não um
        # dedão. Com a falange inteira na frente, ela cruza o leque como na foto.
        ponta = E[PONTA_POL]
        noPlano = float(np.linalg.norm(ponta.mean(0)[:2] - alvoPol[:2]))
        fundo = max(0.0, float(alvoPol[2] + args.polegarFora - ponta[:, 2].min()))
        return noPlano + 3.0 * fundo + args.deitado * (1.0 - subida)

    girado, resta = poe_polegar(custo_do_polegar)

    E = estado()
    uPol = E[PONTA_POL][:, 0]
    dentro = (abs(float(uPol.mean()) - centroU) <= LARG / 2)
    print('  volta %d: polegar a %.0f graus, sobra %.4f do alvo; carta em u=%+.4f v=%+.4f%s'
          % (volta + 1, math.degrees(girado), resta, centroU, centroV,
             '  polegar DENTRO' if dentro else '  polegar fora, puxando a carta'))
    if dentro and resta < 0.02: break
    # não alcançou: a carta anda na direção do polegar. Meio caminho por volta,
    # para não passar do ponto e ficar oscilando.
    centroU += 0.6 * (float(uPol.mean()) - (centroU + SENTIDO_POL * args.fundoU * LARG))

# --- 4. o quadro final e a conta que o olho confere -------------------------
E = estado()
centroV = float(E[DEDOS_TODOS][:, 1].mean()) + (0.5 - args.pegada) * ALT
centroV = max(centroV, float(E[DEDOS_TODOS][:, 1].max()) + args.margem - ALT / 2)
centroN = float(E[NAO_POLEGAR][:, 2].max()) + ESPESSURA / 2
centro = Vector((EIXOS @ np.array([centroU, centroV, centroN])))

bpy.ops.object.mode_set(mode='OBJECT')
R = Matrix(((lado.x, cima.x, normal.x, 0), (lado.y, cima.y, normal.y, 0),
            (lado.z, cima.z, normal.z, 0), (0, 0, 0, 1)))
carta.matrix_world = Matrix.Translation(centro) @ R @ Matrix.Diagonal(Vector((LARG, ALT, 1.0, 1.0)))
bpy.context.view_layer.update()

local = E - np.array([centroU, centroV, centroN])
dentroRet = (np.abs(local[:, 0]) <= LARG / 2) & (np.abs(local[:, 1]) <= ALT / 2)
sobre = dentroRet & (local[:, 2] > 0)
ehPolegar = np.zeros(len(local), dtype=bool); ehPolegar[POLEGAR] = True
polegarSobre = int((sobre & ehPolegar).sum())
restoSobre = int((sobre & ~ehPolegar).sum())
pegadaReal = (float(local[DEDOS_TODOS][:, 1].mean()) + ALT / 2) / ALT

print('CARTA: u de %+.4f a %+.4f · v de %+.4f a %+.4f · profundidade %+.4f'
      % (centroU - LARG / 2, centroU + LARG / 2, centroV - ALT / 2, centroV + ALT / 2, centroN))
print('MEDIDA NO RETANGULO:')
print('  polegar sobre a carta   %d' % polegarSobre)
print('  resto sobre a carta     %d   <- tem de ser 0' % restoSobre)
print('  altura da pegada        %.2f  (pedida: %.2f)' % (pegadaReal, args.pegada))
print('CRITERIO: %s' % ('CUMPRIDO' if polegarSobre > 0 and restoSobre == 0 else 'NAO CUMPRIDO'))

if args.blend: bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(args.blend))
if args.glb:
    if eixo:
        # o contrato é o QUADRO da carta: mesma origem, mesmo giro, sem a escala
        # do retângulo — preso ao retângulo, ele sairia na identidade.
        eixo.parent = None
        eixo.matrix_world = Matrix.Translation(centro) @ R
    bpy.ops.object.select_all(action='DESELECT')
    mao.select_set(True); arm.select_set(True)
    if eixo: eixo.select_set(True)
    # `export_rest_position_armature=False` é o que faz a POSE viajar: com o
    # padrão o glTF sai em repouso e o jogo recebe a mão espalmada de novo.
    bpy.ops.export_scene.gltf(filepath=args.glb, export_format='GLB', use_selection=True, export_yup=False,
                              export_skins=True, export_apply=False, export_animations=False,
                              export_rest_position_armature=False,
                              export_materials='NONE', export_texcoords=False, export_extras=True)
    print('gravado', args.glb)
