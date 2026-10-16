# ============================================================================
# Puxadinho — as peças em 3D, feitas no Blender por script.
#
# Uma fonte só para as duas mesas: cada peça é modelada aqui, do zero, e sai
#  - em GLB (public/models/puxadinho/), para a mesa 3D;
#  - renderizada em WebP (public/assets/puxadinho/), para a mesa 2D: as fichas
#    dos materiais em 3/4 e o chão de cada quadra visto de cima.
#
# Rodar (o Blender sem janela; leva ~1 min com a placa de vídeo):
#   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#     --python scripts/puxadinho_blender.py -- [--so pedra,olaria] [--sem-glb] [--previa DIR]
#
# Medidas: 1 unidade = o raio do hexágono do tabuleiro (o mesmo da GEO em
# shared/puxadinho.js). Peças com o pé em z = 0. Nas quadras, a ponta do
# hexágono aponta para +Y no Blender (que vira −Z no glTF): é o "para cima" da
# mesa 2D. As regras de arte (o que pode e o que não pode) estão na skill
# .claude/skills/arte-do-puxadinho.
# ============================================================================

import bpy
import bmesh
import math
import os
import random
import sys
import time
from mathutils import Vector

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTE = os.path.join(RAIZ, 'public', 'assets', 'puxadinho')
MODELOS = os.path.join(RAIZ, 'public', 'models', 'puxadinho')

# ---------------------------------------------------------------------------
# Cores (as mesmas famílias da arte 2D: puxadinho-arte.js)
# ---------------------------------------------------------------------------

TINTA = '#231c17'


def linear(hexa):
    h = hexa.lstrip('#')
    def canal(c):
        c = int(c, 16) / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (canal(h[0:2]), canal(h[2:4]), canal(h[4:6]), 1.0)


# ---------------------------------------------------------------------------
# O palco: cena vazia, render, luz, contorno
# ---------------------------------------------------------------------------

def novo_palco(tam, amostras=96):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()   # os materiais da cena anterior sumiram com ela
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        sc.cycles.device = 'GPU'
    except Exception:   # sem placa: vai na CPU, só mais devagar
        pass
    sc.cycles.samples = amostras
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = tam
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'   # cor de paleta, sem o "filme"
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 92

    mundo = bpy.data.worlds.new('mundo')
    sc.world = mundo
    mundo.use_nodes = True
    fundo = mundo.node_tree.nodes['Background']
    fundo.inputs['Color'].default_value = linear('#a7a59c')
    fundo.inputs['Strength'].default_value = 0.75

    # contorno na tinta da casa (o mesmo traço dos desenhos 2D e do elenco)
    sc.render.use_freestyle = True
    sc.render.line_thickness_mode = 'ABSOLUTE'
    fs = sc.view_layers[0].freestyle_settings
    fs.crease_angle = math.radians(128)
    ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('contorno')
    ls.select_by_visibility = True
    ls.select_by_edge_types = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_external_contour = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('tinta')
    ls.linestyle.color = linear(TINTA)[:3]
    ls.linestyle.thickness = max(1.2, tam / 96)
    return sc


def sol(direcao, forca=3.2, angulo=12):
    luz = bpy.data.lights.new('sol', 'SUN')
    luz.energy = forca
    luz.angle = math.radians(angulo)
    ob = bpy.data.objects.new('sol', luz)
    bpy.context.scene.collection.objects.link(ob)
    ob.rotation_euler = Vector(direcao).normalized().to_track_quat('-Z', 'Y').to_euler()
    return ob


def camera_orto(local, alvo, escala):
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = escala
    ob = bpy.data.objects.new('cam', cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = local
    frente = (Vector(alvo) - Vector(local)).normalized()
    ob.rotation_euler = frente.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = ob
    return ob


def chao_de_sombra():
    bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
    p = bpy.context.active_object
    p.name = 'chao-sombra'
    p.is_shadow_catcher = True
    return p


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------

_mats = {}


def mat(nome, cor, rug=0.75, metal=0.0, cor2=None, escala=9.0, mistura=0.5, relevo=0.0, brilho=0.25, limiar=0.5):
    """Principled com ruído opcional (cor2) e relevo. Só a cor-base vai para o GLB."""
    chave = (nome, cor, cor2)
    if chave in _mats:
        return _mats[chave]
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = linear(cor)
    m['cor_base'] = linear(cor)   # o GLB leva só esta (ver cor_para_o_glb)
    bsdf.inputs['Roughness'].default_value = rug
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = brilho
    if cor2 or relevo:
        ruido = nt.nodes.new('ShaderNodeTexNoise')
        ruido.inputs['Scale'].default_value = escala
        ruido.inputs['Detail'].default_value = 6
        if cor2:
            rampa = nt.nodes.new('ShaderNodeValToRGB')
            rampa.color_ramp.elements[0].position = max(0.0, limiar - mistura / 2)
            rampa.color_ramp.elements[0].color = linear(cor)
            rampa.color_ramp.elements[1].position = min(1.0, limiar + mistura / 2)
            rampa.color_ramp.elements[1].color = linear(cor2)
            nt.links.new(ruido.outputs['Fac'], rampa.inputs['Fac'])
            nt.links.new(rampa.outputs['Color'], bsdf.inputs['Base Color'])
        if relevo:
            bump = nt.nodes.new('ShaderNodeBump')
            bump.inputs['Strength'].default_value = relevo
            nt.links.new(ruido.outputs['Fac'], bump.inputs['Height'])
            nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    _mats[chave] = m
    return m


def pinta(ob, m):
    ob.data.materials.clear()
    ob.data.materials.append(m)
    return ob


# ---------------------------------------------------------------------------
# Formas
# ---------------------------------------------------------------------------

def suave(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def chanfro(ob, largura=0.03, segmentos=3):
    b = ob.modifiers.new('chanfro', 'BEVEL')
    b.width = largura
    b.segments = segmentos
    b.limit_method = 'ANGLE'
    return ob


def caixa(dims, local, m, rot=(0, 0, 0), bisel=0.02, nome='caixa'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=local, rotation=rot)
    ob = bpy.context.active_object
    ob.name = nome
    ob.scale = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bisel:
        chanfro(ob, bisel)
    return pinta(ob, m)


def cilindro(r, h, local, m, rot=(0, 0, 0), lados=24, bisel=0.0, nome='cil', liso=True):
    bpy.ops.mesh.primitive_cylinder_add(vertices=lados, radius=r, depth=h, location=local, rotation=rot)
    ob = bpy.context.active_object
    ob.name = nome
    if bisel:
        chanfro(ob, bisel, 2)
    if liso:   # disco chato fica chapado: sombreado suave nele vira uma bola
        suave(ob)
    return pinta(ob, m)


def cone(r1, r2, h, local, m, lados=24, rot=(0, 0, 0), nome='cone', liso=True):
    bpy.ops.mesh.primitive_cone_add(vertices=lados, radius1=r1, radius2=r2, depth=h, location=local, rotation=rot)
    ob = bpy.context.active_object
    ob.name = nome
    if liso:
        suave(ob)
    return pinta(ob, m)


def esfera(r, local, m, escala=(1, 1, 1), nome='esfera', anel=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=anel, ring_count=anel // 2, radius=r, location=local)
    ob = bpy.context.active_object
    ob.name = nome
    ob.scale = escala
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    suave(ob)
    return pinta(ob, m)


def toro(R, r, local, m, rot=(0, 0, 0), nome='toro', seg=32):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=12, location=local, rotation=rot)
    ob = bpy.context.active_object
    ob.name = nome
    suave(ob)
    return pinta(ob, m)


def corta_abaixo(ob, z=0.0):
    """Tira tudo abaixo de z (o monte de areia e as cúpulas nascem do chão)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z - ob.location.z),
                           plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(me)
    bm.free()
    return ob


def prisma_hex(raio, altura, z0, m, nome='lote'):
    """Hexágono de ponta para +Y (o 'para cima' da mesa 2D)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=raio, depth=altura, location=(0, 0, z0 + altura / 2),
                                        rotation=(0, 0, math.radians(30)))
    ob = bpy.context.active_object
    ob.name = nome
    chanfro(ob, 0.015, 2)
    return pinta(ob, m)


def agrupa(nome, obs):
    vazio = bpy.data.objects.new(nome, None)
    bpy.context.scene.collection.objects.link(vazio)
    for o in obs:
        o.parent = vazio
    return vazio


def dentro_do_hex(x, y, raio):
    # hexágono de ponta para +Y: |x| ≤ r·√3/2 e |y| + |x|/√3 ≤ r
    return abs(x) <= raio * math.sqrt(3) / 2 and abs(y) + abs(x) / math.sqrt(3) <= raio


# ---------------------------------------------------------------------------
# Os materiais de obra (fichas, topo das quadras e peças da 3D)
# ---------------------------------------------------------------------------

def granito():
    return mat('granito', '#8e949b', cor2='#b3b8bf', escala=28, mistura=0.25, relevo=0.25)


def m_pedra():
    random.seed(11)
    g = granito()
    obs = []
    for (x, y, z, rz) in [(-0.34, 0.02, 0.21, 6), (0.33, -0.04, 0.21, -9), (0.0, 0.0, 0.63, 4)]:
        d = (0.6 + random.uniform(-0.03, 0.03), 0.5, 0.42)
        obs.append(caixa(d, (x, y, z), g, rot=(0, 0, math.radians(rz)), bisel=0.07, nome='paralelepipedo'))
    return obs


def m_areia():
    areia = mat('areia', '#deb96f', cor2='#c9a35b', escala=40, mistura=0.4, relevo=0.35)
    # monte de obra: meio cone, meio cúpula (a esfera nasce abaixo do chão)
    monte = esfera(0.85, (0, 0, -0.3), areia, escala=(1, 0.92, 1.35), nome='monte', anel=48)
    d = monte.modifiers.new('ondula', 'DISPLACE')
    tx = bpy.data.textures.new('nuvem', 'CLOUDS')
    tx.noise_scale = 0.3
    d.texture = tx
    d.strength = 0.07
    corta_abaixo(monte, 0.0)
    madeira = mat('cabo', '#a0693a', cor2='#7d4f26', escala=12, mistura=0.5)
    aco = mat('aco', '#a7adb3', rug=0.35, metal=0.7)
    # a pá fincada no flanco: cabo grosso, punho em D, lâmina larga meio para fora
    ang = math.radians(24)
    base = Vector((0.32, -0.2, 0.62))
    eixo = Vector((math.sin(ang), 0, math.cos(ang)))
    cabo = cilindro(0.07, 0.9, base + eixo * 0.45, madeira, rot=(0, ang, 0), lados=14, nome='cabo')
    punho = toro(0.12, 0.038, base + eixo * 0.95, madeira, rot=(math.radians(90), ang, 0), nome='punho', seg=20)
    lamina = caixa((0.44, 0.04, 0.42), base - eixo * 0.1, aco, rot=(0, ang, 0), bisel=0.02, nome='lamina')
    return [monte, cabo, punho, lamina]


def m_tijolo():
    barro = mat('barro', '#c7623a', cor2='#b5552f', escala=18, mistura=0.4, relevo=0.15)
    corpo = caixa((1.3, 1.3, 0.62), (0, 0, 0.31), barro, bisel=0.03, nome='tijolo')
    # os 8 furos atravessam de frente para trás (eixo Y)
    furos = []
    for linha in range(2):
        for col in range(4):
            x = -0.48 + col * 0.32
            z = 0.17 + linha * 0.28
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, z))
            f = bpy.context.active_object
            f.scale = (0.22, 1.6, 0.18)
            furos.append(f)
    bpy.ops.object.select_all(action='DESELECT')
    for f in furos:
        f.select_set(True)
    bpy.context.view_layer.objects.active = furos[0]
    bpy.ops.object.join()
    cortador = bpy.context.active_object
    cortador.name = 'furos'
    bo = corpo.modifiers.new('furos', 'BOOLEAN')
    bo.operation = 'DIFFERENCE'
    bo.object = cortador
    # o chanfro vem depois do furo
    corpo.modifiers.move(corpo.modifiers.find('furos'), 0)
    bpy.context.view_layer.objects.active = corpo
    for nome in ('furos', 'chanfro'):
        bpy.ops.object.modifier_apply(modifier=nome)
    bpy.data.objects.remove(cortador, do_unlink=True)
    return [corpo]


def saco_deitado(local, rot_z, papel, faixa, etiqueta, nome='saco'):
    """Saco de 50 kg deitado: almofada com as pontas franzidas e a faixa impressa no meio."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=10, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z   # −0,5…0,5
        meio = max(0.0, 1 - (2 * x) ** 2) ** 0.45
        larg = max(0.0, 1 - (2 * y) ** 2) ** 0.35
        v.co.z = z * (0.25 + 0.75 * meio * larg)          # estufa no meio, murcha nas pontas
        v.co.y = y * (0.72 + 0.28 * meio)                 # a ponta franze
    bm.faces.ensure_lookup_table()
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(papel)
    ob.data.materials.append(faixa)
    ob.data.materials.append(etiqueta)
    for f in ob.data.polygons:   # a faixa e a etiqueta são pintura no próprio papel
        cx, cz = f.center.x, f.center.z
        if abs(cx) < 0.11:
            f.material_index = 1
        elif 0.17 < cx < 0.36 and cz > 0.05:
            f.material_index = 2
    ob.scale = (1.05, 0.62, 0.4)
    ob.location = local
    ob.rotation_euler = (0, 0, rot_z)
    sub = ob.modifiers.new('macio', 'SUBSURF')
    sub.levels = 1          # o GLB sai da avaliação de "viewport": malha leve para o celular
    sub.render_levels = 2   # o render da 2D usa a malha cheia
    return suave(ob)


def m_cimento():
    papel = mat('papel', '#d8d4c9', cor2='#c7c2b5', escala=60, mistura=0.3, relevo=0.08)
    faixa = mat('faixa', '#3f6f86', rug=0.6)
    etiqueta = mat('etiqueta', '#2a3e49', rug=0.6)
    return [saco_deitado((0, 0.02, 0.2), math.radians(-6), papel, faixa, etiqueta, 'saco-baixo'),
            saco_deitado((0.04, -0.03, 0.55), math.radians(9), papel, faixa, etiqueta, 'saco-cima')]


def m_ferro():
    aco = mat('vergalhao', '#b9b7b1', cor2='#b36a42', escala=9, mistura=0.12, limiar=0.62, relevo=0.25, rug=0.5, metal=0.15)
    corte = mat('corte', '#c9cdd2', rug=0.35, metal=0.8)
    arame = mat('arame', '#2e2a27', rug=0.4, metal=0.6)
    obs = []
    comp = 1.7
    r = 0.085
    for (y, z) in [(-0.2, 0.09), (0.0, 0.09), (0.2, 0.09), (-0.1, 0.26), (0.1, 0.26), (0.0, 0.43)]:
        obs.append(cilindro(r, comp, (0, y, z), aco, rot=(0, math.radians(90), 0), lados=12, nome='barra'))
        for i in range(14):   # as nervuras do vergalhão
            x = -comp / 2 + 0.1 + i * (comp - 0.2) / 13
            obs.append(toro(r, 0.016, (x, y, z), aco, rot=(0, math.radians(90), 0), nome='nervura', seg=12))
        obs.append(cilindro(r * 0.98, 0.008, (comp / 2 + 0.002, y, z), corte, rot=(0, math.radians(90), 0), lados=12, nome='ponta'))
    for x in (-0.42, 0.42):
        amarra = toro(0.3, 0.022, (x, 0, 0.24), arame, rot=(0, math.radians(90), 0), nome='amarra', seg=28)
        amarra.scale = (1, 1.0, 0.85)
        obs.append(amarra)
    grupo = agrupa('feixe', obs)
    grupo.rotation_euler = (0, 0, math.radians(-30))
    return obs + [grupo]


def m_prefeitura():
    parede = mat('parede', '#dfe2d6', rug=0.8)
    frontao = mat('frontao', '#eef0e8', rug=0.8)
    coluna = mat('coluna', '#f4f5ef', rug=0.7)
    degrau = mat('degrau', '#bfc2b5', rug=0.9)
    bandeira = mat('bandeira', '#f2c14e', rug=0.6)
    mastro = mat('mastro', '#5c5a55', metal=0.5, rug=0.4)
    obs = [
        caixa((1.3, 0.8, 0.1), (0, 0, 0.05), degrau, bisel=0.01, nome='degrau'),
        caixa((1.1, 0.5, 0.62), (0, 0.08, 0.41), parede, bisel=0.01, nome='corpo'),
    ]
    for x in (-0.42, -0.14, 0.14, 0.42):
        obs.append(cilindro(0.05, 0.6, (x, -0.24, 0.4), coluna, lados=14, nome='coluna'))
    obs.append(caixa((1.22, 0.62, 0.08), (0, 0.02, 0.74), frontao, bisel=0.01, nome='cornija'))
    # o frontão triangular
    bm = bmesh.new()
    a, b, c = (-0.62, -0.3, 0.78), (0.62, -0.3, 0.78), (0, -0.3, 1.05)
    vs = [bm.verts.new(p) for p in (a, b, c)] + [bm.verts.new((p[0], p[1] + 0.62, p[2])) for p in (a, b, c)]
    bm.faces.new(vs[0:3]); bm.faces.new(vs[3:6][::-1])
    for i, j in ((0, 1), (1, 2), (2, 0)):
        bm.faces.new((vs[i], vs[j], vs[j + 3], vs[i + 3]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('frontao')
    bm.to_mesh(me)
    bm.free()
    fr = bpy.data.objects.new('frontao', me)
    bpy.context.scene.collection.objects.link(fr)
    obs.append(pinta(fr, frontao))
    obs.append(cilindro(0.015, 0.55, (0, 0.1, 1.3), mastro, lados=8, nome='mastro'))
    obs.append(caixa((0.3, 0.02, 0.18), (0.16, 0.1, 1.46), bandeira, bisel=0.0, nome='bandeira'))
    return obs


MATERIAIS = {'pedra': m_pedra, 'areia': m_areia, 'tijolo': m_tijolo, 'cimento': m_cimento, 'ferro': m_ferro, 'prefeitura': m_prefeitura}

# ---------------------------------------------------------------------------
# As peças dos jogadores (só GLB; a 3D pinta "jogador" com a cor de cada um)
# ---------------------------------------------------------------------------


def p_casa():
    jog = mat('jogador', '#f5f1e6', rug=0.6)
    det = mat('detalhe', '#2a2420', rug=0.8)
    obs = [caixa((0.34, 0.28, 0.2), (0, 0, 0.1), jog, bisel=0.01, nome='paredes')]
    bm = bmesh.new()
    pts = [(-0.2, -0.17, 0.2), (0.2, -0.17, 0.2), (0, -0.17, 0.36)]
    vs = [bm.verts.new(p) for p in pts] + [bm.verts.new((p[0], p[1] + 0.34, p[2])) for p in pts]
    bm.faces.new(vs[0:3]); bm.faces.new(vs[3:6][::-1])
    for i, j in ((0, 1), (1, 2), (2, 0)):
        bm.faces.new((vs[i], vs[j], vs[j + 3], vs[i + 3]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new('telhado')
    bm.to_mesh(me)
    bm.free()
    tel = bpy.data.objects.new('telhado', me)
    bpy.context.scene.collection.objects.link(tel)
    obs.append(pinta(tel, jog))
    obs.append(caixa((0.07, 0.01, 0.12), (0, -0.141, 0.06), det, bisel=0, nome='porta'))
    return obs


def p_predio():
    jog = mat('jogador', '#f5f1e6', rug=0.6)
    det = mat('detalhe', '#2a2420', rug=0.8)
    obs = [caixa((0.36, 0.3, 0.62), (0, 0, 0.31), jog, bisel=0.012, nome='corpo'),
           caixa((0.4, 0.34, 0.04), (0, 0, 0.64), jog, bisel=0.008, nome='laje')]
    for andar in range(3):
        for x in (-0.09, 0.09):
            obs.append(caixa((0.08, 0.01, 0.1), (x, -0.151, 0.16 + andar * 0.17), det, bisel=0, nome='janela'))
    return obs


def p_cone():
    laranja = mat('laranja', '#f07c1f', rug=0.5)
    branco = mat('faixa-branca', '#fff6e6', rug=0.5)
    base = mat('base', '#2a2622', rug=0.8)
    return [caixa((0.36, 0.36, 0.04), (0, 0, 0.02), base, bisel=0.01, nome='base'),
            cone(0.14, 0.025, 0.48, (0, 0, 0.28), laranja, nome='cone'),
            cone(0.098, 0.078, 0.07, (0, 0, 0.29), branco, nome='faixa')]


PECAS = {'casa': p_casa, 'predio': p_predio, 'cone': p_cone}

# ---------------------------------------------------------------------------
# As quadras: o chão e o cenário (o material do alto e a placa ficam por conta
# da mesa). Zonas calmas, em coordenadas do Blender (y para cima = topo da
# mesa 2D): material no alto em x ±0,32, y 0,1…0,75; placa no meio de baixo em
# x ±0,38, y −0,52…0,06. O cenário mora nas laterais.
# ---------------------------------------------------------------------------

RAIO_LOTE = 0.86


def calmo(x, y):
    return (abs(x) < 0.34 and 0.08 < y < 0.78) or (abs(x) < 0.4 and -0.55 < y < 0.08)


def pontos_livres(n, raio, sem=calmo, margem=0.08, semente=1, tentativas=4000):
    random.seed(semente)
    pts = []
    for _ in range(tentativas):
        if len(pts) >= n:
            break
        x = random.uniform(-raio, raio)
        y = random.uniform(-raio, raio)
        if not dentro_do_hex(x, y, raio - margem) or sem(x, y):
            continue
        if any((x - a) ** 2 + (y - b) ** 2 < 0.12 ** 2 for a, b in pts):
            continue
        pts.append((x, y))
    return pts


def cores_dos_terrenos():
    """O chão de cada quadra tem a cor de COR_DO_TERRENO em public/puxadinho-arte.js
    (fonte única: o fundo da quadra na 2D, a reserva da 3D e o render daqui)."""
    import re
    with open(os.path.join(RAIZ, 'public', 'puxadinho-arte.js'), encoding='utf-8') as f:
        texto = f.read()
    bloco = re.search(r'COR_DO_TERRENO\s*=\s*\{(.*?)\}', texto, re.S).group(1)
    cores = {k: '#' + v for k, v in re.findall(r"""(\w+):\s*['"]#([0-9A-Fa-f]{6})['"]""", bloco)}
    assert set(cores) >= set(QUADRAS), f'COR_DO_TERRENO incompleto: {sorted(cores)}'
    return cores


def tom(hexa, k):
    """Clareia (k > 0) ou escurece (k < 0) uma cor: o segundo tom do ruído do chão."""
    h = hexa.lstrip('#')
    rgb = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    alvo = 255 if k > 0 else 0
    return '#' + ''.join(f'{round(c + (alvo - c) * abs(k)):02x}' for c in rgb)


def chao(terreno, escala=12, relevo=0.25, variacao=-0.1):
    cor = cores_dos_terrenos()[terreno]
    return prisma_hex(RAIO_LOTE, 0.1, -0.1, mat('chao', cor, cor2=tom(cor, variacao), escala=escala, mistura=0.5, relevo=relevo))


def rocha(raio, local, m, semente):
    random.seed(semente)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=raio, location=local)
    ob = bpy.context.active_object
    ob.name = 'rocha'
    ob.scale = (random.uniform(0.9, 1.3), random.uniform(0.8, 1.2), random.uniform(0.45, 0.7))
    ob.rotation_euler = (0, 0, random.uniform(0, 3.1))
    d = ob.modifiers.new('lasca', 'DISPLACE')
    tx = bpy.data.textures.new('lasca', 'VORONOI')
    tx.noise_scale = 0.08
    d.texture = tx
    d.strength = raio * 0.35
    return pinta(ob, m)


def q_pedreira():
    obs = [chao('pedreira', escala=20)]
    g = granito()
    escuro = mat('rocha', '#6a7178', cor2='#8a9097', escala=12, mistura=0.6, relevo=0.4)
    # a frente de lavra: rochas grandes na borda, menores descendo para o meio
    n = 0
    for lado in (-1, 1):
        for k, (dist, r) in enumerate([(0.62, 0.13), (0.47, 0.09), (0.36, 0.06)]):
            for t in range(3 - (k == 2)):
                y = -0.32 + t * 0.32 + (k % 2) * 0.12
                x = lado * dist
                if dentro_do_hex(x, y, RAIO_LOTE - 0.08) and not calmo(x, y):
                    n += 1
                    obs.append(rocha(r, (x, y, r * 0.35), escuro if k == 0 else g, n))
    random.seed(4)
    for (x, y) in pontos_livres(4, RAIO_LOTE, semente=3):
        obs.append(caixa((0.09, 0.07, 0.06), (x, y, 0.03), g, rot=(0, 0, random.uniform(0, 1.5)), bisel=0.01, nome='bloco'))
    return obs


def q_areal():
    obs = [chao('areal', escala=30, relevo=0.4)]
    agua = mat('agua', '#4f8590', rug=0.15, brilho=0.6)
    # a cava alagada do porto de areia: uma lagoa inteira dentro da quadra, à esquerda
    borda = mat('borda', '#b8955a', rug=0.9)
    obs.append(cilindro(0.17, 0.012, (-0.58, -0.1, 0.002), borda, lados=40, nome='margem', liso=False))
    obs.append(cilindro(0.14, 0.012, (-0.58, -0.1, 0.006), agua, lados=40, nome='lagoa', liso=False))
    areia = mat('areia-monte', '#deb96f', cor2='#c9a35b', escala=40, mistura=0.4, relevo=0.3)
    for (x, y, r) in [(0.55, 0.05, 0.16), (0.48, -0.32, 0.12), (-0.55, 0.32, 0.13), (0.6, 0.38, 0.1)]:
        m = esfera(r, (x, y, -r * 0.25), areia, escala=(1, 1, 0.9), nome='montinho')
        corta_abaixo(m, 0.0)
        obs.append(m)
    return obs


def q_olaria():
    obs = [chao('olaria', escala=16)]
    tijolo = mat('tijolinho', '#d7865c', rug=0.8)
    forno = mat('forno', '#7a3420', cor2='#5e2616', escala=10, mistura=0.5, relevo=0.3)
    boca = mat('boca', '#1c0d07', rug=1.0)
    # tijolos secando em fileiras nas duas laterais
    for lado in (-1, 1):
        for i in range(5):
            for j in range(2):
                x = lado * (0.47 + j * 0.13)
                y = -0.5 + i * 0.13
                if dentro_do_hex(x, y, RAIO_LOTE - 0.06):
                    obs.append(caixa((0.09, 0.045, 0.035), (x, y, 0.018), tijolo, bisel=0, nome='tijolinho'))
    # o forno: cúpula com boca e chaminé, no alto à direita
    cup = esfera(0.14, (0.55, 0.36, 0), forno, escala=(1, 1, 0.8), nome='forno')
    corta_abaixo(cup, 0.0)
    obs.append(cup)
    obs.append(caixa((0.07, 0.02, 0.06), (0.55, 0.225, 0.03), boca, bisel=0, nome='boca'))
    obs.append(cilindro(0.035, 0.3, (0.64, 0.45, 0.15), forno, lados=12, nome='chamine'))
    return obs


def q_cimenteira():
    obs = [chao('cimenteira', escala=24, relevo=0.15, variacao=-0.07)]
    silo = mat('silo', '#e2dfd6', rug=0.45, metal=0.3)
    topo = mat('silo-topo', '#b9b5aa', rug=0.5, metal=0.3)
    esteira = mat('esteira', '#7d796f', rug=0.6)
    for (x, y) in [(-0.55, 0.22), (-0.5, -0.14), (0.55, 0.28)]:
        obs.append(cilindro(0.12, 0.42, (x, y, 0.21), silo, lados=32, nome='silo'))
        obs.append(cone(0.12, 0.03, 0.1, (x, y, 0.47), topo, lados=16, nome='silo-topo', liso=False))
    telha = mat('galpao', '#8c8e8f', rug=0.5, metal=0.4)
    obs.append(caixa((0.26, 0.2, 0.14), (0.56, -0.14, 0.07), mat('galpao-parede', '#d9d3c4', rug=0.8), bisel=0.008, nome='galpao'))
    obs.append(caixa((0.3, 0.24, 0.02), (0.56, -0.14, 0.15), telha, bisel=0.005, nome='telhado'))
    obs.append(caixa((0.42, 0.05, 0.03), (0.3, -0.38, 0.12), esteira, rot=(0, math.radians(-12), math.radians(30)), bisel=0.005, nome='esteira'))
    return obs


def q_ferrovelho():
    obs = [chao('ferrovelho', escala=14, relevo=0.3, variacao=0.1)]
    pneu = mat('pneu', '#1f1c1a', rug=0.85)
    carro = mat('carro', '#6d8794', cor2='#8a6a52', escala=6, mistura=0.6, relevo=0.2, rug=0.6)
    vidro = mat('vidro', '#2e3a40', rug=0.2)
    sucata = [mat('sucata1', '#9b6a4f', rug=0.7), mat('sucata2', '#8a7d70', rug=0.6, metal=0.4), mat('sucata3', '#4f3a2f', rug=0.8)]
    for (x, y, n) in [(-0.55, -0.15, 3), (-0.45, 0.32, 2), (0.56, -0.3, 2)]:
        for k in range(n):
            obs.append(toro(0.09, 0.035, (x + k * 0.01, y, 0.035 + k * 0.065), pneu, nome='pneu', seg=24))
    # o carro velho, de lado, no alto à direita
    obs.append(caixa((0.34, 0.17, 0.09), (0.47, 0.34, 0.07), carro, rot=(0, 0, math.radians(25)), bisel=0.03, nome='carro'))
    obs.append(caixa((0.18, 0.15, 0.07), (0.45, 0.33, 0.14), vidro, rot=(0, 0, math.radians(25)), bisel=0.025, nome='cabine'))
    random.seed(9)
    for (x, y) in pontos_livres(7, RAIO_LOTE, semente=5):
        obs.append(caixa((random.uniform(0.05, 0.11), random.uniform(0.03, 0.06), 0.03), (x, y, 0.015), random.choice(sucata),
                         rot=(0, 0, random.uniform(0, 3)), bisel=0.005, nome='caco'))
    return obs


def q_prefeitura():
    obs = [chao('prefeitura', escala=10, relevo=0.2, variacao=0.12)]
    pedra = mat('caminho', '#c8bf9f', cor2='#b6ad8c', escala=30, mistura=0.4, relevo=0.2)
    copa = mat('copa', '#355a47', cor2='#4f7d60', escala=8, mistura=0.6, relevo=0.4)
    tronco = mat('tronco', '#5a3d27', rug=0.9)
    for k, a in enumerate((30, -30)):
        c = caixa((1.9, 0.11, 0.01), (0, 0, 0.005 + k * 0.002), pedra, rot=(0, 0, math.radians(a)), bisel=0, nome='caminho')
        corta_hex(c)
        obs.append(c)
    for (x, y) in [(-0.52, -0.05), (0.52, -0.05), (-0.36, 0.5), (0.36, 0.5), (-0.36, -0.55), (0.36, -0.55)]:
        obs.append(cilindro(0.02, 0.08, (x, y, 0.04), tronco, lados=8, nome='tronco'))
        obs.append(esfera(0.11, (x, y, 0.15), copa, escala=(1, 1, 0.85), nome='copa'))
    return obs


QUADRAS = {'pedreira': q_pedreira, 'areal': q_areal, 'olaria': q_olaria, 'cimenteira': q_cimenteira,
           'ferrovelho': q_ferrovelho, 'prefeitura': q_prefeitura}


def corta_hex(ob):
    """Recorta um objeto plano no hexágono do lote (rio e caminhos não vazam)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.transform(bm, matrix=ob.matrix_world, verts=bm.verts)
    for i in range(6):
        a = math.radians(60 * i)   # normais das 6 faces (ponta para +Y: faces em 0°, 60°…)
        n = Vector((math.cos(a), math.sin(a), 0))
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=n * (RAIO_LOTE * math.sqrt(3) / 2 - 0.01),
                               plane_no=n, clear_outer=True)
    ob.matrix_world.identity()
    bm.to_mesh(me)
    bm.free()
    return ob


# ---------------------------------------------------------------------------
# Render e exportação
# ---------------------------------------------------------------------------

def caixa_de(obs):
    pts = []
    for o in obs:
        if o.type != 'MESH':
            continue
        dg = bpy.context.evaluated_depsgraph_get()
        oe = o.evaluated_get(dg)
        pts += [oe.matrix_world @ Vector(c) for c in oe.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def enquadra(cam, obs, folga=1.1):
    """Ajusta a câmera ortográfica à silhueta projetada das peças (a diagonal
    3D da caixa sobrava muito: o objeto ficava pequeno dentro da ficha)."""
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    dg = bpy.context.evaluated_depsgraph_get()
    xs, ys = [], []
    for o in obs:
        if o.type != 'MESH':
            continue
        oe = o.evaluated_get(dg)
        for v in oe.data.vertices:
            p = inv @ (oe.matrix_world @ v.co)
            xs.append(p.x)
            ys.append(p.y)
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    lado = max(max(xs) - min(xs), max(ys) - min(ys)) * folga
    cam.data.ortho_scale = lado
    cam.location = cam.matrix_world @ Vector((cx, cy, 0))


def render(caminho):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    bpy.context.scene.render.filepath = caminho
    bpy.ops.render.render(write_still=True)


# Detalhe que só existe para o render: na mesa 3D, de longe, não aparece e pesa.
SO_NO_RENDER = ('chao-sombra', 'nervura')


def cor_para_o_glb(obs):
    """O exportador glTF só leva a Base Color direta: com o ruído de cor ligado
    nela, o material chegava BRANCO na mesa 3D. Antes de exportar, solta o nó e
    deixa a cor principal do material (o render já foi feito com o ruído)."""
    for o in obs:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if not m or not m.use_nodes or 'cor_base' not in m:
                continue
            entrada = m.node_tree.nodes['Principled BSDF'].inputs['Base Color']
            for ligacao in list(entrada.links):
                m.node_tree.links.remove(ligacao)
            entrada.default_value = tuple(m['cor_base'])


def exporta(caminho, obs):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    cor_para_o_glb(obs)
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        if o.name.startswith(SO_NO_RENDER):
            continue
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=caminho, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT')


def luz_da_ficha(cam):
    # de cima à esquerda, um pouco de frente — na tela, como nos desenhos 2D
    m = cam.matrix_world.to_3x3()
    direcao = m @ Vector((0.55, -0.75, -0.6))
    sol(direcao, forca=3.4, angulo=10)


def faz_material(chave, saida_arte, saida_modelos, previa=None):
    sc = novo_palco(192, 96)
    obs = MATERIAIS[chave]()
    chao_de_sombra()
    lo, hi = caixa_de(obs)
    centro = (lo + hi) / 2
    az, el = math.radians(-32), math.radians(31)
    d = 6.0
    local = centro + Vector((math.sin(-az) * math.cos(el) * d, -math.cos(az) * math.cos(el) * d, math.sin(el) * d))
    cam = camera_orto(local, centro, 3.0)
    enquadra(cam, obs, folga=1.1)
    luz_da_ficha(cam)
    destino = os.path.join(previa or saida_arte, f'material-{chave}.webp')
    render(destino)
    if saida_modelos and chave != 'prefeitura':
        sc.render.use_freestyle = False
        exporta(os.path.join(saida_modelos, f'material-{chave}.glb'), [o for o in bpy.context.scene.objects if o.type in ('MESH', 'EMPTY')])
    return destino


def faz_quadra(chave, saida_arte, saida_modelos, previa=None):
    sc = novo_palco(384, 128)
    sc.render.line_thickness_mode = 'ABSOLUTE'
    sc.view_layers[0].freestyle_settings.linesets[0].linestyle.thickness = 1.6
    obs = QUADRAS[chave]()
    # de cima, recortada no hexágono: o quadrado da imagem cobre o lote (1,72 de lado)
    camera_orto((0, 0, 10), (0, 0, 0), RAIO_LOTE * 2)
    sol((0.6, -0.72, -0.62), forca=3.8, angulo=10)   # de cima à esquerda da tela, baixo: sombra comprida
    destino = os.path.join(previa or saida_arte, f'quadra-{chave}.webp')
    render(destino)
    if saida_modelos:
        exporta(os.path.join(saida_modelos, f'quadra-{chave}.glb'), [o for o in bpy.context.scene.objects if o.type == 'MESH'])
    return destino


def cores_dos_assentos():
    """As cores dos jogadores vêm de CORES_DE_ASSENTO em public/client.js (fonte
    única): mudou lá, rode este script de novo para ter as peças nas cores novas."""
    import re
    with open(os.path.join(RAIZ, 'public', 'client.js'), encoding='utf-8') as f:
        texto = f.read()
    bloco = re.search(r'CORES_DE_ASSENTO\s*=\s*\[(.*?)\]', texto, re.S).group(1)
    cores = re.findall(r"""['"]#([0-9A-Fa-f]{6})['"]""", bloco)
    assert cores, 'CORES_DE_ASSENTO sem cor nenhuma em public/client.js'
    return cores


def faz_peca_colorida(chave, cor, saida_arte, previa=None):
    """Casa ou prédio na cor de um assento, em 3/4 de cima, para o tabuleiro 2D.
    Câmera e escala iguais para as duas peças: o prédio sai maior que a casa."""
    novo_palco(112, 64)
    obs = PECAS[chave]()
    for o in obs:
        for m in o.data.materials:
            if m and m.name.startswith('jogador'):
                m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = linear('#' + cor)
    chao_de_sombra()
    alvo = Vector((0, 0, 0.3))
    az, el = math.radians(-32), math.radians(42)
    d = 6.0
    local = alvo + Vector((math.sin(-az) * math.cos(el) * d, -math.cos(az) * math.cos(el) * d, math.sin(el) * d))
    cam = camera_orto(local, alvo, 0.95)
    luz_da_ficha(cam)
    destino = os.path.join(previa or saida_arte, f'peca-{chave}-{cor.lower()}.webp')
    render(destino)
    return destino


def faz_peca(chave, saida_modelos):
    novo_palco(64, 8)
    obs = PECAS[chave]()
    exporta(os.path.join(saida_modelos, f'{chave}.glb'), obs)


def argumentos():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    so = None
    previa = None
    glb = True
    i = 0
    while i < len(args):
        if args[i] == '--so':
            so = set(args[i + 1].split(','))
            i += 1
        elif args[i] == '--previa':
            previa = args[i + 1]
            i += 1
        elif args[i] == '--sem-glb':
            glb = False
        i += 1
    return so, previa, glb


if __name__ == '__main__':
    so, previa, glb = argumentos()
    t0 = time.time()
    saida_modelos = (os.path.join(previa, 'modelos') if previa else MODELOS) if glb else None
    for k in MATERIAIS:
        if not so or k in so:
            print('material', k, faz_material(k, ARTE, saida_modelos, previa))
    for k in QUADRAS:
        if not so or k in so:
            print('quadra', k, faz_quadra(k, ARTE, saida_modelos, previa))
    for k in PECAS:
        if k == 'cone' or (so and k not in so):
            continue
        for cor in cores_dos_assentos():
            faz_peca_colorida(k, cor, ARTE, previa)
        print('peca colorida', k)
    if saida_modelos:
        for k in PECAS:
            if not so or k in so:
                faz_peca(k, saida_modelos)
                print('peca', k)
    print(f'pronto em {time.time() - t0:.1f} s')
