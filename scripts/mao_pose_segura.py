"""Posa a mão segurando a carta, por MEDIDA — não a olho.

Uso: Blender --background --python scripts/mao_pose_segura.py -- entrada.blend
     [--glb saida.glb] [--blend saida.blend] [--contato 0.005] [--mostra 0.035]

Três coisas saem de medida, nenhuma de opinião:

  1. O QUADRO da carta sai da própria mão. A normal é a do plano que melhor cabe
     nos vértices da palma (SVD), virada para o lado em que está o polegar; o
     "para cima" é o eixo punho→nó do médio, projetado nesse plano. É por isso
     que o `PlanoDaCarta` vale como contrato: o jogo alinha o leque a ele e não
     precisa adivinhar de que lado a mão segura — que é o que hoje faz as mãos
     aparecerem viradas ao contrário.

  2. QUANTO CADA DEDO FECHA. Uma mão espalmada não segura nada: a palma é
     côncava, quem toca a carta são os nós, e a ponta do dedo fica ~11 mm ATRÁS
     desse plano (medido: −0,0817 contra −0,0209 do osso da palma). O critério é
     esse buraco: cada dedo fecha até a PONTA alcançar a profundidade da palma,
     isto é, até encostar na mesma carta em que os nós já encostam. Alvo fixo,
     medido uma vez com a mão aberta, para o dedo não perseguir o próprio nó.

  3. ONDE A CARTA FICA. Na profundidade: no meio da folga entre o ponto mais
     avançado do resto da mão e a ponta do polegar — é a faixa em que o plano
     separa os dois. No próprio plano: alta o bastante para esconder as pontas
     dos dedos, baixa o bastante para a ponta do polegar cair dentro do
     retângulo. As duas condições são desigualdades; o script pega o meio do
     intervalo que sobra e avisa se ele for vazio.

O polegar é o contrário dos outros: tem de CRUZAR para a frente. Procurar nos
três eixos locais do osso não acha (a busca voltava 0 grau) — oposição de
verdade é rotação composta. O eixo certo se calcula: perpendicular à direção do
osso E à normal da carta.

O relatório final conta os vértices de cada lado do plano. É o mesmo número que
`window.mesa3d.maos.medida` mostra no jogo: `resto a frente` tem de ser 0 e
`polegar a frente` maior que zero.
"""
import argparse, math, sys
import bpy
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('entrada')
ap.add_argument('--glb'); ap.add_argument('--blend')
ap.add_argument('--contato', type=float, default=0.005, help='quão perto do plano da palma a ponta do dedo tem de chegar')
ap.add_argument('--margem', type=float, default=0.012, help='folga entre a ponta do dedo e a borda da carta')
ap.add_argument('--cartas', type=int, default=12, help='cartas na mão (o motor distribui 12): é a espessura do leque')
ap.add_argument('--aberta', action='store_true',
                help='não posa: só grava o quadro da mão aberta. É o que a mão que JOGA precisa — '
                     'ela não segura leque, mas o jogo ainda tem de saber para onde a palma dela olha')
ap.add_argument('--junta', type=float, default=math.radians(45), help='rotação máxima em cada junta do polegar')
ap.add_argument('--pele', type=float, default=0.005, help='folga de pele entre a ponta do polegar e a face da frente')
ap.add_argument('--passoDedo', type=float, default=math.radians(6), help='resolução da busca do fechamento')
ap.add_argument('--passo', type=float, default=math.radians(3), help='resolução da busca')
ap.add_argument('--limite', type=float, default=math.radians(80), help='fechamento máximo da falange da base')
args = ap.parse_args(argv)

# Uma carta tem 0,3 mm; a mão, 185 mm do punho à ponta do médio. O leque que o
# polegar tem de atravessar é essa pilha — nada de folga escolhida a esmo.
ESPESSURA = args.cartas * 0.3 / 185

bpy.ops.wm.open_mainfile(filepath=args.entrada)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mao = max((o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'CARTA'),
          key=lambda o: len(o.data.vertices))
carta = bpy.data.objects['CARTA']
eixo = bpy.data.objects.get('PlanoDaCarta')

# o lado sai dos próprios ossos: o mesmo script posa a esquerda e a direita
LADO = 'Right' if any(b.name.startswith('Right') for b in arm.data.bones) else 'Left'
DEDOS = ['Index', 'Middle', 'Ring', 'Pinky']
PROP = (1.0, 1.25, 0.9)   # a falange do meio dobra mais que a base; a ponta, um pouco menos
LARG, ALT = carta.scale.x, carta.scale.y   # o plano tem 1×1, então a escala é o tamanho


def vertices_por_osso():
    """Índices de vértice de cada grupo, pelo osso de maior peso."""
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

# --- o quadro da carta, medido na mão ---------------------------------------
M = np.array(mao.matrix_world)
REPOUSO = np.array([v.co[:] for v in mao.data.vertices]) @ M[:3, :3].T + M[:3, 3]
P = REPOUSO[PALMA]
_, _, Vt = np.linalg.svd(P - P.mean(0))
normal = Vector(Vt[2]).normalized()
if float((REPOUSO[DONO[f'{LADO}Thumb3']].mean(0) - P.mean(0)) @ np.array(normal[:])) < 0:
    normal = -normal                       # a normal aponta para o lado da palma, onde o polegar vive
punho = arm.matrix_world @ arm.data.bones[f'{LADO}Hand'].head_local
noMedio = arm.matrix_world @ arm.data.bones[f'{LADO}Middle1'].head_local
cima = (noMedio - punho); cima -= normal * cima.dot(normal); cima.normalize()
lado = cima.cross(normal)                  # (lado, cima, normal) é destro: lado × cima = normal
EIXOS = np.column_stack([np.array(lado[:]), np.array(cima[:]), np.array(normal[:])])
print('QUADRO DA CARTA (medido na mao):')
print('  normal da palma  %+.3f %+.3f %+.3f' % tuple(normal))
print('  eixo punho→medio %+.3f %+.3f %+.3f' % tuple(cima))

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for osso in arm.pose.bones:
    osso.rotation_mode = 'XYZ'
    osso.rotation_euler = (0, 0, 0)
bpy.context.view_layer.update()


def estado():
    """Todos os vértices já deformados pelo esqueleto, em coordenadas (lado, cima, normal)."""
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


E0 = estado()
ALVO = E0[PALMA][:, 2].max()               # a profundidade em que a carta encosta na mão aberta
buraco = ALVO - max(E0[DONO[f'{LADO}{d}3']][:, 2].max() for d in DEDOS)
print('  a carta encosta na palma em %+.4f; a ponta do dedo mais avancada esta %.4f atras' % (ALVO, buraco))

# de que lado o dedo dobra é medida, não palpite: gira 5° para cada lado e fica
# com o que leva a ponta para a frente
teste = [arm.pose.bones[f'{LADO}Index{k}'] for k in (1, 2, 3)]
pontaTeste = DONO[f'{LADO}Index3']
fecha(teste, math.radians(5)); mais = estado()[pontaTeste][:, 2].max()
fecha(teste, math.radians(-5)); menos = estado()[pontaTeste][:, 2].max()
fecha(teste, 0.0)
SINAL = 1.0 if mais > menos else -1.0
print('  sentido do fechamento: %s (%+.4f contra %+.4f)' % ('+X' if SINAL > 0 else '-X', mais, menos))

# --- o polegar: como ele gira ------------------------------------------------
pol = [arm.pose.bones[f'{LADO}Thumb{k}'] for k in (1, 2, 3)]
for osso in pol: osso.rotation_mode = 'QUATERNION'
bruto = arm.data.bones[f'{LADO}Thumb1'].get('eixoFlexao')
# o extra veio do glTF (Y para cima) e o importador não o girou: (x, y, z) → (x, −z, y)
EIXO_VARRE = (arm.matrix_world.to_3x3() @ Vector((bruto[0], -bruto[2], bruto[1]))).normalized()
print('  eixo de varredura do polegar %+.3f %+.3f %+.3f (gravado no osso)' % tuple(EIXO_VARRE))
PONTA_POL = DONO[f'{LADO}Thumb3']
DEDOS_TODOS = np.concatenate([DONO[f'{LADO}{d}{k}'] for d in DEDOS for k in (1, 2, 3)])
centroU = centroV = 0.0


def gira_no_mundo(osso, eixoGiro, ang):
    cabeca = osso.matrix.translation.copy()
    R = Matrix.Translation(cabeca) @ Matrix.Rotation(ang, 4, eixoGiro) @ Matrix.Translation(-cabeca)
    osso.matrix = R @ osso.matrix
    bpy.context.view_layer.update()


def eixos_de(osso):
    """Os eixos em que faz sentido girar esta junta: os três do próprio osso mais
    o de flexão gravado no rig. Escolher a dedo um eixo de mundo dava rotação
    degenerada quando o polegar chegava a apontar para a frente (o produto
    vetorial ia a zero) — e era isso que travava a busca."""
    R = osso.matrix.to_3x3()
    return [R.col[0].normalized(), R.col[1].normalized(), R.col[2].normalized(), EIXO_VARRE]


def custo_do_polegar():
    """O polegar só tem uma conta a cumprir: PASSAR À FRENTE do leque.

    Antes havia uma segunda — puxar a ponta para dentro do retângulo da carta —
    e era ela que fazia o polegar CRUZAR para o meio do leque, varrendo a palma.
    Um polegar que segura leque fica do lado de fora, deitado junto à borda; é o
    que se vê em qualquer mão com cartas. Sem esse termo, ele sobe pelo próprio
    lado e é o que se quer."""
    E = estado()
    fora = 0.0
    alvo = E[NAO_POLEGAR][:, 2].max() + ESPESSURA + args.pele
    # A última falange INTEIRA, não só a pontinha dela. Medindo o polegar todo,
    # a busca cumpria a conta empurrando a BASE para a frente e deixando a ponta
    # atrás; medindo o vértice mais avançado da ponta, ela parava assim que a
    # unha assomava — e o que aparecia sobre as cartas era um calombo, não um
    # dedão. Pelo vértice mais ATRASADO da falange, ela só para quando a falange
    # toda passou: é o polegar deitado na carta.
    return fora + max(0.0, alvo - E[PONTA_POL][:, 2].min())


def poe_polegar():
    """Desce o custo girando as três juntas, um passo por vez, sempre na junta e
    no eixo que mais ajudam. Repartir importa: 111 graus só na base rasgavam a
    pele da tenar — e é assim que a mão trabalha, a junta do punho faz a maior
    parte da oposição mas não faz sozinha."""
    for osso in pol: osso.rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()
    usado = {o.name: 0.0 for o in pol}
    atual = custo_do_polegar()
    while atual > 0:
        melhor = None
        for osso in pol:
            if usado[osso.name] >= args.junta: continue
            for eixoGiro in eixos_de(osso):
                for sentido in (1.0, -1.0):
                    gira_no_mundo(osso, eixoGiro, sentido * args.passo)
                    d = custo_do_polegar()
                    gira_no_mundo(osso, eixoGiro, -sentido * args.passo)
                    if d < atual - 1e-9 and (melhor is None or d < melhor[0]):
                        melhor = (d, osso, eixoGiro, sentido)
        if melhor is None: break
        atual, osso, eixoGiro, sentido = melhor
        gira_no_mundo(osso, eixoGiro, sentido * args.passo)
        usado[osso.name] += args.passo
    return sum(usado.values()), atual


# --- os dedos enrolam até apontar ATRAVÉS da carta ---------------------------
# Onde parar de fechar não é um ângulo escolhido a dedo, e também não é o que eu
# tentei antes: "até encostar" para com a mão ainda espalmada (12 graus), e "até
# o polegar não cobrir mais" não para nunca — vai ao punho fechado, porque o
# polegar cobre. O que separa uma mão espalmada de uma mão que segura é para
# onde a ponta do dedo aponta: reta, ela aponta AO LONGO da carta, na mesma
# direção em que a carta sobe; enrolada, aponta ATRAVÉS dela. O ângulo reto
# entre as duas direções é o ponto de virada, e é ele que este laço acha.
def poe_dedos(ang):
    for dedo in DEDOS:
        fecha([arm.pose.bones[f'{LADO}{dedo}{k}'] for k in (1, 2, 3)], SINAL * ang)


def aponta_ao_longo(dedo):
    """Quanto a última falange ainda aponta na direção em que a carta sobe."""
    osso = arm.pose.bones[f'{LADO}{dedo}3']
    d = (arm.matrix_world.to_3x3() @ (osso.tail - osso.head)).normalized()
    return d.dot(cima)


fechado = 0.0
while fechado <= args.limite:
    poe_dedos(fechado + args.passoDedo)
    if max(aponta_ao_longo(d) for d in DEDOS) <= 0: break   # já aponta através
    fechado += args.passoDedo
poe_dedos(fechado)
if args.aberta: fechado = 0.0
poe_dedos(fechado)
print('FECHAMENTO: %.0f graus na base de cada dedo (%.0f somando as tres falanges);'
      ' a ultima falange faz %.0f graus com a subida da carta' %
      (math.degrees(fechado), math.degrees(fechado) * sum(PROP),
       math.degrees(math.acos(max(-1, min(1, max(aponta_ao_longo(d) for d in DEDOS)))))))


def carta_no_plano():
    """No plano, a carta sai da própria pegada: a borda de baixo fica na LINHA DOS
    NÓS, onde o canto do leque encosta na mão, e o leque sobe dali — acima da
    mão, não pendurado abaixo dela. Apoiar na junta do meio do dedo levantava a
    carta para fora do alcance do polegar. Na largura, centrada na massa dos
    dedos."""
    global centroU, centroV
    E = estado()
    apoio = arm.matrix_world @ arm.pose.bones[f'{LADO}Index1'].matrix.translation
    centroU = float(E[DEDOS_TODOS][:, 0].mean())
    centroV = float(np.array(apoio[:]) @ EIXOS[:, 1]) + ALT / 2 - args.margem


carta_no_plano()
girado, resta = (0.0, 0.0) if args.aberta else poe_polegar()

E = estado()
restoMax = float(E[NAO_POLEGAR][:, 2].max())
polMax = float(E[PONTA_POL][:, 2].max())
pontaPolegar = E[PONTA_POL]
altoDosDedos = float(E[DEDOS_TODOS][:, 1].max())
uPolegar = (float(pontaPolegar[:, 0].min()), float(pontaPolegar[:, 0].max()))
piso, teto = float(pontaPolegar[:, 1].min()), float(pontaPolegar[:, 1].max())
sobra = (altoDosDedos - piso) - (ALT - 2 * args.margem)
centroN = restoMax + ESPESSURA / 2
centro = Vector((EIXOS @ np.array([centroU, centroV, centroN])))
relatorio = [(d, math.degrees(fechado), None, 0.0) for d in DEDOS]
relatorio.append(('Thumb', math.degrees(girado), resta <= 0, polMax))

bpy.ops.object.mode_set(mode='OBJECT')
R = Matrix(((lado.x, cima.x, normal.x, 0), (lado.y, cima.y, normal.y, 0), (lado.z, cima.z, normal.z, 0), (0, 0, 0, 1)))
carta.matrix_world = Matrix.Translation(centro) @ R @ Matrix.Diagonal(Vector((LARG, ALT, 1.0, 1.0)))
bpy.context.view_layer.update()

print('CARTA:')
print('  profundidade %+.4f — encostada nos dedos (%+.4f) + meia espessura de %d cartas (%.4f); polegar em %+.4f' %
      (centroN, restoMax, args.cartas, ESPESSURA, polMax))
print('  largura: de %+.4f a %+.4f; a ponta do polegar ocupa de %+.4f a %+.4f%s' %
      (centroU - LARG / 2, centroU + LARG / 2, uPolegar[0], uPolegar[1],
       '' if uPolegar[0] >= centroU - LARG / 2 and uPolegar[1] <= centroU + LARG / 2 else '  POLEGAR FORA DA CARTA'))
print('  altura %+.4f — a carta vai de %+.4f a %+.4f; cobre as pontas dos dedos (%+.4f) e alcanca o polegar (%+.4f)%s' %
      (centroV, centroV - ALT / 2, centroV + ALT / 2, altoDosDedos, piso,
       '' if sobra <= 0 else '  NAO CABE por %.4f' % sobra))

# --- a conta final ----------------------------------------------------------
E = estado()
frente = E[:, 2] - centroN
polegarFrente = int((frente[POLEGAR] > 0).sum())
restoFrente = int((frente[NAO_POLEGAR] > 0).sum())
avanco = sorted(((nome, float(E[i][:, 2].max() - centroN)) for nome, i in DONO.items()), key=lambda x: -x[1])
print('AVANCO POR OSSO (positivo = a frente da carta):')
for nome, d in avanco[:6]: print('  %-14s %+.4f' % (nome, d))
print('POSE:')
for nome, graus, ok, d in relatorio:
    print('  %-7s %5.0f graus%s' % (nome, graus,
          '' if ok is None else ('  cruzou para a frente' if ok else '  NAO ALCANCOU a frente')))
print('MEDIDA: polegar a frente %d/%d · resto a frente %d/%d' %
      (polegarFrente, len(POLEGAR), restoFrente, len(NAO_POLEGAR)))
print('CRITERIO: %s' % ('mao aberta: so o quadro, sem pose a cumprir' if args.aberta
                        else 'CUMPRIDO' if restoFrente == 0 and polegarFrente > 0 else 'NAO CUMPRIDO'))

if args.blend: bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(args.blend))
if args.glb:
    # o `PlanoDaCarta` viaja junto, solto do retângulo: é ele o contrato que o
    # jogo lê para alinhar o leque. O retângulo em si não vai — é andaime.
    if eixo:
        # o contrato é o QUADRO da carta, não um ponto qualquer: mesma origem,
        # mesmo giro, sem a escala do retângulo. Preso ao retângulo com o
        # `matrix_parent_inverse` que o montador põe, o eixo saía na identidade —
        # e um contrato na identidade não diz nada ao jogo.
        eixo.parent = None
        eixo.matrix_world = Matrix.Translation(centro) @ R
    bpy.ops.object.select_all(action='DESELECT')
    mao.select_set(True); arm.select_set(True)
    if eixo: eixo.select_set(True)
    # `export_rest_position_armature=False` é o que faz a POSE viajar: com o
    # padrão, o glTF sai na posição de repouso e o jogo receberia a mão aberta
    # de novo. Assim os nós dos ossos levam a pose e as matrizes de vínculo
    # continuam as de repouso, que é como o three.js espera.
    bpy.ops.export_scene.gltf(filepath=args.glb, export_format='GLB', use_selection=True, export_yup=False,
                              export_skins=True, export_apply=False, export_animations=False,
                              export_rest_position_armature=False,
                              export_materials='NONE', export_texcoords=False, export_extras=True)
    print('gravado', args.glb)
