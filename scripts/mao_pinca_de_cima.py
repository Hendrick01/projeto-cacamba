"""Posa a mão que PINÇA a carta pela borda de cima — e mede se ela sai da frente.

Uso: Blender --background --python scripts/mao_pinca_de_cima.py -- entrada
     [--glb saida.glb] [--blend saida.blend] [--cartas 12] [--pega 0.02]

A entrada pode ser um `.blend` já montado (como `mao-para-posar.blend`) ou um
`.glb` do próprio jogo: sendo `.glb`, o rig é importado e a pose é ZERADA antes
de posar, o que devolve exatamente a malha de vínculo (conferido: desvio 0,000).

O GESTO, que é o contrato que o dono do jogo deu: a mão desce DE CIMA sobre a
carta e a pinça pela BORDA SUPERIOR — polegar à frente, indicador atrás, as duas
pontas separadas pela espessura do leque. Todo o resto da mão (dorso, punho,
dedos soltos) fica ACIMA da borda de cima, fora do retângulo da carta, para não
tapar o leque que o jogador está lendo.

Por que este script existe em vez de `--pinca` do `mao_pose_segura.py`: lá o
quadro da carta é o da mão que SEGURA o leque — o "para cima" da carta é o eixo
punho→nó do médio, isto é, a direção em que os dedos apontam. Numa mão que
pinça, é justamente por ali que a carta desce: a carta saía pendurada por dentro
da própria mão, e os 831 vértices que caíam dentro do retângulo (de 2.287) eram
o dorso e os três dedos soltos deitados em cima da carta.

Aqui o quadro sai da PINÇA, e em três medidas, nenhuma de opinião:

  +Z  a normal da carta é o eixo da pinça, da ponta do indicador para a ponta do
      polegar. É por isso que +Z é o lado do olho do jogador: é o lado por onde
      o polegar cruza, como manda o contrato do `PlanoDaCarta`.

  +Y  a direção em que a carta sobe é a que deixa o RESTO DA MÃO ACIMA dela.
      Varre-se o círculo de direções perpendiculares a +Z e fica-se com a que
      maximiza a folga do vértice mais baixo (fora as duas pontas da pinça). É
      um problema de plano de apoio: a pinça é a ponta do cone que é a mão, e a
      varredura acha o plano que apoia esse cone.

  0   a origem é o centro da carta: a borda de cima passa `--pega` acima do
      ponto de contato — a fatia da carta que fica presa entre as duas pontas.

E o FECHAMENTO dos dedos é procurado contra essa mesma medida: para cada
combinação de "quanto o indicador enrola" e "quanto os outros três se recolhem",
o polegar é trazido ao encontro do indicador e a folga é medida. Fica a
combinação de maior folga. Dedos esticados perdem porque passam por baixo da
pinça — é a conta que reprova a mão em garra.
"""
import argparse, math, os, sys
import bpy
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
ap = argparse.ArgumentParser()
ap.add_argument('entrada', help='.blend montado ou .glb do jogo (a pose dele é zerada)')
ap.add_argument('--glb'); ap.add_argument('--blend')
ap.add_argument('--pela-base', action='store_true', help='segura o leque pela borda inferior, com o punho abaixo')
ap.add_argument('--cartas', type=int, default=12, help='cartas no leque: é a espessura que passa entre as pontas')
ap.add_argument('--pega', type=float, default=0.02, help='quanto da carta entra na pinça (0,02 = 3,7 mm)')
ap.add_argument('--junta', type=float, default=math.radians(70), help='giro máximo em cada junta do polegar')
ap.add_argument('--passo', type=float, default=math.radians(3), help='resolução da busca do polegar')
ap.add_argument('--indicador', default='30:110:10', help='faixa de enrolamento do indicador, em graus (de:ate:passo)')
ap.add_argument('--soltos', default='40:130:10', help='faixa de recolhimento dos outros três dedos')
ap.add_argument('--folgaMin', type=float, default=0.02, help='folga minima (na escala da mao) para uma direcao valer na escolha do punho')
ap.add_argument('--punho', type=float, default=15.0,
                help='angulo do punho em relacao ao "para cima" da carta, em graus (positivo = para a direita '
                     'do jogador; 15 e o da gravura de referencia e o do arquivo entregue). Com um valor '
                     'negativo grande volta a direcao de maior folga, que deixava o punho a -56 graus, '
                     'saindo pela esquerda numa mao DIREITA (visto no inspetor, 15/09/2026)')
args = ap.parse_args(argv)

LARG, ALT = 63 / 185, 88 / 185          # a carta na escala da mão: 0,3405 × 0,4757
ESPESSURA = args.cartas * 0.3 / 185     # o leque que passa entre as duas pontas
PROP = (1.0, 1.25, 0.9)                 # a falange do meio dobra mais que a base; a ponta, menos


def faixa(txt):
    a, b, p = (float(x) for x in txt.split(':'))
    return [math.radians(v) for v in np.arange(a, b + 1e-9, p)]


# --- carrega -----------------------------------------------------------------
if args.entrada.lower().endswith('.glb') or args.entrada.lower().endswith('.gltf'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=args.entrada)
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.vertices) < 100]:
        bpy.data.objects.remove(o, do_unlink=True)   # o importador cria um Icosphere de widget
else:
    bpy.ops.wm.open_mainfile(filepath=args.entrada)

arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mao = max((o for o in bpy.data.objects if o.type == 'MESH' and o.name != 'CARTA'),
          key=lambda o: len(o.data.vertices))
eixo = bpy.data.objects.get('PlanoDaCarta')
if eixo is None:
    eixo = bpy.data.objects.new('PlanoDaCarta', None)
    eixo.empty_display_type = 'ARROWS'; eixo.empty_display_size = 0.25
    bpy.context.collection.objects.link(eixo)
eixo.parent = None

LADO = 'Right' if any(b.name.startswith('Right') for b in arm.data.bones) else 'Left'
DEDOS = ['Index', 'Middle', 'Ring', 'Pinky']
SOLTOS = ['Middle', 'Ring', 'Pinky']
print('mao "%s" (%d vertices), lado %s, %d ossos' % (mao.name, len(mao.data.vertices), LADO, len(arm.data.bones)))

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
for osso in arm.pose.bones:
    osso.rotation_mode = 'XYZ'
    osso.rotation_euler = (0, 0, 0)
    osso.location = (0, 0, 0); osso.scale = (1, 1, 1)
bpy.context.view_layer.update()

# --- de quem é cada vértice --------------------------------------------------
grupos = {g.index: g.name for g in mao.vertex_groups}
dono = {}
for v in mao.data.vertices:
    melhor, peso = None, -1.0
    for g in v.groups:
        if g.weight > peso: peso, melhor = g.weight, grupos.get(g.group)
    dono.setdefault(melhor or '(sem osso)', []).append(v.index)
DONO = {k: np.array(v, dtype=int) for k, v in dono.items()}
PONTA_POL = DONO[f'{LADO}Thumb3']
PONTA_IND = DONO[f'{LADO}Index3']
VERT_SOLTOS = np.concatenate([DONO[f'{LADO}{d}{k}'] for d in SOLTOS for k in (1, 2, 3)])
# as duas pontas da pinça são as únicas que podem cair dentro do retângulo; todo
# o resto é medido contra a borda de cima
_pontas = set(PONTA_POL.tolist()) | set(PONTA_IND.tolist())
RESTO = np.array([i for i in range(len(mao.data.vertices)) if i not in _pontas], dtype=int)
# a direção "para cima" é procurada sem os três dedos soltos: eles se recolhem
# DEPOIS, contra a folga que a pinça já conseguiu. Deixá-los na conta faria a
# carta girar atrás deles, que é como a pose velha acabou deitada sobre o leque.
_soltos = set(VERT_SOLTOS.tolist())
FIRME = np.array([i for i in RESTO if i not in _soltos], dtype=int)

M = np.array(mao.matrix_world)


def estado():
    """Todos os vértices já deformados pelo esqueleto, em coordenadas de mundo."""
    dg = bpy.context.evaluated_depsgraph_get()
    ob = mao.evaluated_get(dg); me = ob.to_mesh()
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co)
    ob.to_mesh_clear()
    return co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]


def apice(grupo, osso):
    """O vértice mais distante da cabeça do osso: a pontinha do dedo. Fixado na
    posição de repouso para não pular de vértice a cada pose."""
    cabeca = np.array((arm.matrix_world @ arm.data.bones[osso].head_local)[:])
    E = estado()[grupo]
    return int(grupo[np.argmax(np.linalg.norm(E - cabeca, axis=1))])


AP_POL = apice(PONTA_POL, f'{LADO}Thumb3')
AP_IND = apice(PONTA_IND, f'{LADO}Index3')


def polpa(grupo, apice_, raio=0.06):
    """A POLPA do dedo: os vértices a menos de 11 mm da pontinha. Mirar a
    pontinha contra a pontinha (unha contra unha) não fecha — a busca empaca
    com o polegar encostado no LADO do indicador, que é o que a barreira de
    interpenetração impede de atravessar. Pinça de verdade é polpa com polpa."""
    E0 = estado()
    return grupo[np.linalg.norm(E0[grupo] - E0[apice_], axis=1) < raio]


POLPA_POL = polpa(PONTA_POL, AP_POL)
POLPA_IND = polpa(PONTA_IND, AP_IND)
print('polpa: %d vertices no polegar, %d no indicador' % (len(POLPA_POL), len(POLPA_IND)))


def contato_da_pinca(E):
    """O par de vértices mais próximos entre as duas polpas: é ali que a carta
    é presa. Devolve (ponto do polegar, ponto do indicador, distância)."""
    D = np.linalg.norm(E[POLPA_POL][:, None, :] - E[POLPA_IND][None, :, :], axis=2)
    i, j = np.unravel_index(np.argmin(D), D.shape)
    return E[POLPA_POL[i]], E[POLPA_IND[j]], float(D[i, j])

# --- para que lado o dedo enrola: medido, não palpitado ----------------------
def fecha(ossos, ang):
    for k, osso in enumerate(ossos): osso.rotation_euler = (ang * PROP[k], 0, 0)
    bpy.context.view_layer.update()


ossosInd = [arm.pose.bones[f'{LADO}Index{k}'] for k in (1, 2, 3)]
baseDoPolegar = np.array((arm.matrix_world @ arm.data.bones[f'{LADO}Thumb1'].head_local)[:])
d0 = np.linalg.norm(estado()[AP_IND] - baseDoPolegar)
fecha(ossosInd, math.radians(10)); dMais = np.linalg.norm(estado()[AP_IND] - baseDoPolegar)
fecha(ossosInd, math.radians(-10)); dMenos = np.linalg.norm(estado()[AP_IND] - baseDoPolegar)
fecha(ossosInd, 0.0)
SINAL = 1.0 if dMais < dMenos else -1.0
print('enrolamento: sentido %s (a ponta se aproxima da base do polegar: %.4f contra %.4f, aberta %.4f)'
      % ('+X' if SINAL > 0 else '-X', min(dMais, dMenos), max(dMais, dMenos), d0))

# --- o polegar: oposição de verdade é rotação composta -----------------------
pol = [arm.pose.bones[f'{LADO}Thumb{k}'] for k in (1, 2, 3)]
bruto = arm.data.bones[f'{LADO}Thumb1'].get('eixoFlexao')
if bruto is not None:
    # o extra veio do glTF (Y para cima) e o importador não o girou: (x,y,z) → (x,−z,y)
    EIXO_VARRE = (arm.matrix_world.to_3x3() @ Vector((bruto[0], -bruto[2], bruto[1]))).normalized()
else:
    EIXO_VARRE = Vector((0, 0, 1))
print('eixo de varredura do polegar %+.3f %+.3f %+.3f' % tuple(EIXO_VARRE))


# o eixo da própria mão: do punho ao nó do médio. É contra ele que se cobra que
# a pinça seja DE FRENTE — o polegar entra por diante do indicador, não por cima
# nem por baixo dele. Sem essa cobrança a busca fechava a pinça com o polegar
# atravessado no eixo dos dedos, e aí não sobra direção nenhuma perpendicular à
# pinça em que a mão fique acima da carta: a folga dava −27 mm.
_punho = np.array((arm.matrix_world @ arm.data.bones[f'{LADO}Hand'].head_local)[:])
_noMedio = np.array((arm.matrix_world @ arm.data.bones[f'{LADO}Middle1'].head_local)[:])
EIXO_MAO = (_noMedio - _punho) / np.linalg.norm(_noMedio - _punho)


def gira_no_mundo(osso, eixoGiro, ang):
    cabeca = osso.matrix.translation.copy()
    R = Matrix.Translation(cabeca) @ Matrix.Rotation(ang, 4, eixoGiro) @ Matrix.Translation(-cabeca)
    osso.matrix = R @ osso.matrix
    bpy.context.view_layer.update()


def eixos_de(osso):
    R = osso.matrix.to_3x3()
    return [R.col[0].normalized(), R.col[1].normalized(), R.col[2].normalized(), EIXO_VARRE]


def custo_da_pinca():
    """FECHAR: as duas POLPAS se encontram com a espessura do leque entre elas, e
    a carne de uma não atravessa a da outra em canto nenhum."""
    E = estado()
    _, _, d = contato_da_pinca(E)
    perto = float(np.linalg.norm(E[PONTA_POL][:, None, :] - E[PONTA_IND][None, :, :], axis=2).min())
    return 10.0 * abs(d - ESPESSURA) + 20.0 * max(0.0, 0.6 * ESPESSURA - perto)


def custo_de_frente():
    """ENDIREITAR, sem soltar: mesma pinça, agora com o eixo dela perpendicular
    ao eixo da mão. É o que faz o polegar entrar POR DIANTE do indicador — e o
    que deixa sobrar a direção "para cima" em que a mão inteira fica acima da
    carta, já que essa direção tem de ser perpendicular ao eixo da pinça."""
    E = estado()
    a, b, d = contato_da_pinca(E)
    perto = float(np.linalg.norm(E[PONTA_POL][:, None, :] - E[PONTA_IND][None, :, :], axis=2).min())
    n = (a - b) / max(1e-9, float(np.linalg.norm(a - b)))
    return (100.0 * abs(d - ESPESSURA) + 20.0 * max(0.0, 0.6 * ESPESSURA - perto)
            + 2.0 * abs(float(n @ EIXO_MAO)))


def desce(custo, usado=None):
    """Desce o custo girando as três juntas, um passo por vez, sempre na junta e
    no eixo que mais ajudam. Repartir importa: girar tudo na base rasga a pele
    da tenar, e é assim que a mão trabalha."""
    usado = usado or {o.name: 0.0 for o in pol}
    atual = custo()
    while atual > 1e-5:
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
    return usado, atual


def poe_polegar():
    """Duas descidas: primeiro FECHA a pinça, depois a ENDIREITA sem soltar."""
    for osso in pol: osso.rotation_mode = 'QUATERNION'; osso.rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()
    usado, resta = desce(custo_da_pinca)
    if resta <= 0.02:
        usado, _ = desce(custo_de_frente, usado)
        E = estado()
        a, b, d = contato_da_pinca(E)
        resta = 10.0 * abs(d - ESPESSURA)
    return sum(usado.values()), resta


# --- o quadro da carta sai da pinça -----------------------------------------
GIROS = np.radians(np.arange(0.0, 360.0, 0.5))


def quadro(E, contra=None):
    """Contato, normal e a direção em que a carta sobe.

    A normal é o eixo da pinça. O "para cima" é varrido: de todas as direções
    perpendiculares à normal, fica a que deixa o vértice mais baixo do RESTO da
    mão o mais alto possível acima do contato. É o plano de apoio da mão."""
    a, b, _ = contato_da_pinca(E)
    contato = (a + b) / 2.0
    n = a - b
    n = n / np.linalg.norm(n)
    base = np.array([1.0, 0.0, 0.0]) if abs(n[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    p = np.cross(n, base); p /= np.linalg.norm(p)
    q = np.cross(n, p)
    U = np.cos(GIROS)[:, None] * p + np.sin(GIROS)[:, None] * q      # (G,3)
    # SÓ O QUE FICA NA FRENTE DA CARTA CONTA para a folga. O que está atrás do
    # plano (z<0) some atrás da própria carta e das vizinhas do leque — é assim
    # que uma mão de verdade pinça por cima: os dedos curvados ATRÁS da carta.
    # Exigir a mão inteira acima da borda travava o punho na esquerda (a faixa
    # alcançável ia de −50° a −28°), porque eram os dedos de trás que desciam.
    V = E[FIRME if contra is None else contra] - contato
    naFrente = (V @ n) > 0.0
    if naFrente.any(): V = V[naFrente]
    alturas = V @ U.T   # (V,G)
    folgas = alturas.min(axis=0)
    if args.punho is None:
        g = int(np.argmax(folgas))
    else:
        # A rotação em torno do eixo da pinça é livre: entre as direções que
        # deixam o resto da mão acima da carta (folga de pelo menos 5 mm), fica
        # a que põe o PUNHO no ângulo pedido — é o que diz de que mão é. A
        # gravura de referência tem o punho da direita saindo para o alto à
        # direita; a folga máxima sozinha o mandava para a esquerda.
        X = np.cross(U, n)                                    # +X de cada candidato (X = Y × Z)
        w = _punho - contato
        ang = np.degrees(np.arctan2(X @ w, U @ w))
        # 2 cm de folga, não 5 mm: com 5 mm o vértice mais baixo já roçava a
        # borda de cima e o indicador entrava no retângulo (medido: 5 vértices).
        ok = folgas >= args.folgaMin
        cand = np.where(ok)[0] if ok.any() else np.arange(len(folgas))
        desvio = np.abs(((ang[cand] - args.punho + 180.0) % 360.0) - 180.0)
        g = int(cand[int(np.argmin(desvio))])
        if not getattr(quadro, 'avisou', False):
            quadro.avisou = True
            if ok.any():
                print('PUNHO: angulos com folga >= %.3f vao de %+.0f a %+.0f graus; pedido %+.0f, escolhido %+.0f (folga %.4f)'
                      % (args.folgaMin, ang[cand].min(), ang[cand].max(), args.punho, ang[g], folgas[g]))
            else:
                print('PUNHO: nenhuma direcao alcanca folga %.3f; ficou o angulo mais proximo (%+.0f, folga %.4f)' % (args.folgaMin, ang[g], folgas[g]))
    return contato, n, U[g], float(folgas[g])


# --- busca: quanto cada dedo enrola -----------------------------------------
def poe_soltos(ang):
    for dedo in SOLTOS:
        fecha([arm.pose.bones[f'{LADO}{dedo}{k}'] for k in (1, 2, 3)], SINAL * ang)


print('BUSCA DO ENROLAMENTO DO INDICADOR (folga = altura do vertice mais baixo da mao'
      ' — fora as duas pontas e os tres dedos soltos — acima do ponto de contato):')
poe_soltos(math.radians(60))
melhor = None
for ti in faixa(args.indicador):
    fecha(ossosInd, SINAL * ti)
    girado, resta = poe_polegar()
    E = estado()
    _, _, aberto = contato_da_pinca(E)
    if abs(aberto - ESPESSURA) > 0.004:      # 0,7 mm: a pinça não fechou na espessura do leque
        print('  indicador %3.0f graus — pinca aberta em %.4f (leque: %.4f)' % (math.degrees(ti), aberto, ESPESSURA))
        continue
    contato, n, u, folga = quadro(E)
    marca = ''
    if melhor is None or folga > melhor[0]:
        melhor, marca = (folga, ti, [tuple(o.rotation_quaternion) for o in pol], girado), '  <<'
    print('  indicador %3.0f · polegar %3.0f — pinca em %.4f, folga %+.4f (%.1f mm)%s'
          % (math.degrees(ti), math.degrees(girado), aberto, folga, folga * 185, marca))

if melhor is None: raise SystemExit('nenhum enrolamento fechou a pinca na espessura do leque')
folga, ti, quats, girado = melhor
fecha(ossosInd, SINAL * ti)
for osso, q in zip(pol, quats): osso.rotation_quaternion = q
bpy.context.view_layer.update()
print('INDICADOR: %.0f graus, polegar %.0f — folga %+.4f (%.1f mm)'
      % (math.degrees(ti), math.degrees(girado), folga, folga * 185))

# --- os três dedos soltos: o MENOR recolhimento que os tira da FRENTE --------
# Atrás da carta eles podem pender — somem atrás da própria carta e das
# vizinhas do leque, que é onde os dedos curvados de uma pinça de verdade
# ficam. Só conta o que está na frente do plano da pinça (z>0) e desce abaixo
# da folga. Exigir os três acima da borda, em qualquer profundidade, era o que
# prendia o punho na esquerda e abortava a busca com o punho pedido à direita.
print('BUSCA DOS TRES DEDOS SOLTOS (recolhimento minimo que tira da FRENTE da carta o que desce abaixo da folga):')
escolhido = None
for to in faixa(args.soltos):
    poe_soltos(to)
    E = estado()
    contato, n, u, folga = quadro(E)
    V = E[VERT_SOLTOS] - contato
    naFrente = (V @ n) > 0.0
    baixo = float((V[naFrente] @ u).min()) if naFrente.any() else float('inf')
    print('  soltos %3.0f graus — %d vertices na frente, o mais baixo a %+.4f (precisa de %+.4f)'
          % (math.degrees(to), int(naFrente.sum()), baixo if np.isfinite(baixo) else 9.9999, folga))
    if baixo >= folga:
        escolhido = to
        break
if escolhido is None:
    raise SystemExit('nenhum recolhimento tira os tres dedos da frente da carta')
poe_soltos(escolhido)
print('SOLTOS: %.0f graus' % math.degrees(escolhido))

E = estado()
contato, n, u, folga = quadro(E, RESTO)
if args.pela_base:
    u = -u
s = np.cross(u, n)                        # (s, u, n) é destro: s × u = n
_w = _punho - contato
print('PUNHO FINAL: %+.0f graus no quadro exportado (positivo = direita do jogador)'
      % math.degrees(math.atan2(float(s @ _w), float(u @ _w))))
origem = contato + u * (ALT / 2 - args.pega) if args.pela_base else contato + u * (args.pega - ALT / 2)

# --- a conta que vale --------------------------------------------------------
L = (E - origem) @ np.column_stack([s, u, n])
dentro = (np.abs(L[:, 0]) < LARG / 2) & (np.abs(L[:, 1]) < ALT / 2)
frente = L[:, 2] > 0
POLEGAR = np.concatenate([i for nome, i in DONO.items() if 'Thumb' in nome])
NAO_POLEGAR = np.concatenate([i for nome, i in DONO.items() if 'Thumb' not in nome])
print('QUADRO: contato %+.4f %+.4f %+.4f' % tuple(contato))
print('        +X %+.3f %+.3f %+.3f · +Y %+.3f %+.3f %+.3f · +Z %+.3f %+.3f %+.3f'
      % (tuple(s) + tuple(u) + tuple(n)))
print('PINCA: as polpas a %.4f uma da outra (leque de %d cartas: %.4f)'
      % (contato_da_pinca(E)[2], args.cartas, ESPESSURA))
print('A FRENTE DA CARTA (z>0): polegar %d/%d · resto %d/%d'
      % (int(frente[POLEGAR].sum()), len(POLEGAR), int(frente[NAO_POLEGAR].sum()), len(NAO_POLEGAR)))
# O que vale é o que o jogador VÊ: dentro do retângulo E na frente da carta.
# Atrás dela (z<0) a mão some por trás da própria carta e das vizinhas do leque
# — é onde os dedos curvados de uma pinça de verdade ficam.
sobre = dentro & frente
print('DENTRO DO RETANGULO: %d na frente (visiveis) · %d atras (escondidos pelo leque) de %d vertices'
      % (int(sobre.sum()), int((dentro & ~frente).sum()), len(L)))
for nome, idx in sorted(DONO.items()):
    n_ = int(sobre[idx].sum())
    if n_:
        yy = L[idx][sobre[idx]][:, 1]
        print('   %-14s %4d na frente · y de %+.4f a %+.4f (borda de cima em %+.4f)'
              % (nome, n_, yy.min(), yy.max(), ALT / 2))
soDasPontas = int(sobre[RESTO].sum()) == 0
print('CRITERIO: %s (fora das duas pontas, %d vertices na frente da carta dentro do retangulo)'
      % ('CUMPRIDO' if soDasPontas else 'NAO CUMPRIDO', int(sobre[RESTO].sum())))

# --- grava -------------------------------------------------------------------
bpy.ops.object.mode_set(mode='OBJECT')
R = Matrix(((s[0], u[0], n[0], 0), (s[1], u[1], n[1], 0), (s[2], u[2], n[2], 0), (0, 0, 0, 1)))
eixo.matrix_world = Matrix.Translation(Vector(origem)) @ R
carta = bpy.data.objects.get('CARTA')
if carta:
    carta.parent = None
    carta.matrix_world = Matrix.Translation(Vector(origem)) @ R @ Matrix.Diagonal(Vector((LARG, ALT, 1, 1)))
bpy.context.view_layer.update()

if args.blend: bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(args.blend))
if args.glb:
    bpy.ops.object.select_all(action='DESELECT')
    mao.select_set(True); arm.select_set(True); eixo.select_set(True)
    bpy.context.view_layer.objects.active = arm
    # `export_rest_position_armature=False` é o que faz a POSE viajar: com o
    # padrão, o glTF sai na posição de repouso e o jogo recebe a mão espalmada.
    bpy.ops.export_scene.gltf(filepath=args.glb, export_format='GLB', use_selection=True, export_yup=False,
                              export_skins=True, export_apply=False, export_animations=False,
                              export_rest_position_armature=False,
                              export_materials='NONE', export_texcoords=False, export_extras=True)
    print('gravado', args.glb)
