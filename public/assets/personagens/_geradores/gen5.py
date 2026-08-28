# -*- coding: utf-8 -*-
"""Mafra Kitty - quinto personagem (segundo homem) do jogo Cacamba.

Mesma construcao do elenco: busto em viewBox 256, corpo em 400x800, cabeca em
coordenadas locais 256 escalada 0.88, linha do chao em y=733, moldura de
contorno 10 + ambar 5.

Identidade: o unico torso CLARO do elenco. E o unico com franja caindo na
testa — e o primeiro homem sem barba, o que separa ele do Matheus a 48px.

ESTAMPA: gatinho de desenho ORIGINAL. Focinho de coracao, boca visivel,
coleira ambar com guizo, bochechas coradas. Nao reproduz personagem, marca
nem obra de terceiros.
"""
import os
import sys

# A boca das expressoes e compartilhada: ver expressoes.py, ao lado.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from expressoes import boca

# Os SVGs ficam um nivel acima: este diretorio guarda so os geradores.
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ------------------------------------------------------- paleta do jogo
INK        = "#2A1B12"
WOOD       = "#7A4A2B"
WOOD_LIT   = "#8C5733"
WARM       = "#F2C14E"   # ambar do jogo — vira a coleira do gatinho
CREAM      = "#F5F1E6"
TILE       = "#E4572E"   # laranja-telha do jogo — vira o focinho
RIM        = "#8C6A45"   # mesma luz de borda quente do elenco

SKIN       = "#F4CFAA"   # mesma pele da Gabizinsky, da Dri e do Matheus
SKIN_SH    = "#E0B189"

# Cabelo castanho ESCURO — nao o quase-preto do Matheus (#3A2A20). Dois
# degraus acima, para a franja nao virar mancha contra o fundo do jogo.
HAIR       = "#4A3527"
HAIR_LIT   = "#6B5038"
HAIR_SH    = "#33241A"
IRIS       = "#5A4230"

# Camisa branca: quente e rebaixada. Nunca #FFF — encostaria no branco do
# papel e estouraria contra o feltro escuro.
TEE        = "#EBE4D5"
TEE_SH     = "#D3CAB6"
TEE_LIT    = "#F5F1E6"

# Jeans MEDIO: fica entre o azul escuro do Matheus (#3B4A63) e a jeans
# branca da EstereX (#CDD3DC). Nenhum dos dois some perto do outro.
JEANS      = "#5A7292"
JEANS_SH   = "#42566F"
JEANS_LIT  = "#7B92B0"
STITCH     = "#C0A075"   # mesmo pesponto quente do elenco

# Tenis branco: um grau mais FRIO e mais claro que a camisa, senao camisa e
# calcado viram a mesma mancha na figura inteira.
SHOE       = "#F2EFE7"
SHOE_SH    = "#D8D2C4"
SHOE_SOLE  = "#C9C2B2"
SHOE_LACE  = "#FAF7EF"

# Metal: quase nenhum. Uma argola de prata na orelha esquerda e so isso —
# ele e o oposto do Matheus, que carrega ouro no centro e prata nos pulsos.
SILVER     = "#C9CDD2"
SILVER_SH  = "#8D949B"

# Gatinho da estampa
CAT        = "#F7F3E9"   # pelo, um grau acima da camisa
CAT_EAR    = "#E9A79A"   # orelha por dentro
BLUSH      = "#E9A79A"
BELL       = "#D9A83E"

S = 0.88
TX = 200 - 128 * S
# O chao e o mesmo para todo o elenco (y=733), entao "mais baixo" quer dizer
# cabeca mais perto do chao. DY desce o tronco, os bracos e a cabeca juntos —
# o pescoco nao encurta com isso, so a perna. Ver README.
DY = 12
TY = 9.6 + DY
SW = 5 / S


def halo(d, w=9):
    """Luz de borda quente por FORA do contorno. O contorno e da mesma cor do
    fundo do jogo, entao peca escura sobre fundo escuro sumiria."""
    return (f'<path fill="none" stroke="{RIM}" stroke-width="{w}" opacity="0.8" '
            f'stroke-linejoin="round" d="{d}"/>')


# ---------------------------------------------------------------- estampa
def kitty(cx, cy, s, sw_eff=3.4, whiskers=True):
    """Gatinho ORIGINAL da camisa, desenhado em unidades proprias (~104 de
    largura) e escalado por `s`. `sw_eff` e a espessura de contorno DEPOIS da
    escala, para o traco ter a mesma presenca no avatar e no corpo inteiro.

    Nao e Hello Kitty: cabeca redonda (nao oval), BOCA visivel, focinho de
    coracao, coleira com guizo no lugar do laco.
    """
    sw = sw_eff / s
    w = ""
    if whiskers:
        w = (f'<g fill="none" stroke="{INK}" stroke-width="{sw*0.72:.2f}" stroke-linecap="round">'
             f'<path d="M -46 2 L -70 -4"/><path d="M -46 10 L -72 10"/><path d="M -45 18 L -69 25"/>'
             f'<path d="M 46 2 L 70 -4"/><path d="M 46 10 L 72 10"/><path d="M 45 18 L 69 25"/>'
             f'</g>')
    return f'''<g transform="translate({cx} {cy}) scale({s})" stroke="{INK}"
       stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">
    <!-- orelhas -->
    <path fill="{CAT}" d="M -44 -18 L -40 -60 C -39 -65, -34 -66, -30 -62 L -8 -40 Z"/>
    <path fill="{CAT}" d="M 44 -18 L 40 -60 C 39 -65, 34 -66, 30 -62 L 8 -40 Z"/>
    <path fill="{CAT_EAR}" stroke="none" d="M -37 -26 L -34 -53 C -33.5 -56, -31 -56.5, -29 -54 L -14 -38 Z"/>
    <path fill="{CAT_EAR}" stroke="none" d="M 37 -26 L 34 -53 C 33.5 -56, 31 -56.5, 29 -54 L 14 -38 Z"/>
    <!-- cabeca REDONDA (a da Sanrio e oval e deitada) -->
    <path fill="{CAT}" d="M -48 -4
      C -48 -34, -27 -48, 0 -48
      C 27 -48, 48 -34, 48 -4
      C 48 26, 27 42, 0 42
      C -27 42, -48 26, -48 -4 Z"/>
    {w}
    <!-- olhos -->
    <ellipse cx="-19" cy="-6" rx="6.4" ry="8.2" fill="{INK}" stroke="none"/>
    <ellipse cx="19"  cy="-6" rx="6.4" ry="8.2" fill="{INK}" stroke="none"/>
    <circle cx="-21" cy="-9.5" r="2.1" fill="{CAT}" stroke="none"/>
    <circle cx="17"  cy="-9.5" r="2.1" fill="{CAT}" stroke="none"/>
    <!-- bochechas coradas -->
    <ellipse cx="-33" cy="10" rx="8" ry="5.4" fill="{BLUSH}" stroke="none" opacity="0.85"/>
    <ellipse cx="33"  cy="10" rx="8" ry="5.4" fill="{BLUSH}" stroke="none" opacity="0.85"/>
    <!-- focinho de CORACAO -->
    <path fill="{TILE}" stroke="{INK}" stroke-width="{sw*0.62:.2f}"
      d="M 0 16 C -4 10, -10 9, -10 4 C -10 0.5, -7 -1, -4.4 0.4 C -2.4 1.5, -1 3, 0 4.6
         C 1 3, 2.4 1.5, 4.4 0.4 C 7 -1, 10 0.5, 10 4 C 10 9, 4 10, 0 16 Z"/>
    <!-- BOCA: a Hello Kitty nao tem. Esta tem. -->
    <path fill="none" stroke="{INK}" stroke-width="{sw*0.78:.2f}"
      d="M 0 16 L 0 21 M 0 21 C -3 27, -11 26, -13 20 M 0 21 C 3 27, 11 26, 13 20"/>
    <!-- coleira + guizo (no lugar do laco) -->
    <path fill="{WARM}" d="M -35 30 C -22 42, 22 42, 35 30 C 33 38, 26 45, 18 48
      C 8 51, -8 51, -18 48 C -26 45, -33 38, -35 30 Z"/>
    <circle cx="0" cy="52" r="9" fill="{BELL}"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw*0.7:.2f}" d="M -7.5 50 L 7.5 50 M 0 52 L 0 60"/>
  </g>'''


def paw(cx, cy, s, sw_eff=2.6):
    """Pegadinha de gato: almofada em gota (larga embaixo, estreita em cima) e
    quatro dedos abertos. E enfeite — some cedo e nao faz falta."""
    sw = sw_eff / s
    toes = "".join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{CAT}" '
                   f'transform="rotate({rot} {x} {y})"/>'
                   for x, y, rx, ry, rot in [(-15, -9, 4.2, 5.4, -24), (-5.5, -16, 4.4, 5.6, -8),
                                             (5.5, -16, 4.4, 5.6, 8), (15, -9, 4.2, 5.4, 24)])
    return (f'<g transform="translate({cx} {cy}) scale({s})" stroke="{INK}" '
            f'stroke-width="{sw:.2f}" stroke-linejoin="round">'
            f'<path fill="{CAT}" d="M 0 -7 C 8 -7, 14 -1, 14 6 '
            f'C 14 14, 8 19, 0 19 C -8 19, -14 14, -14 6 '
            f'C -14 -1, -8 -7, 0 -7 Z"/>{toes}</g>')


# ------------------------------------------------- cabeca (coords locais 256)
# FRANJA: a decisao de silhueta do personagem. O Matheus tem o cabelo penteado
# para tras e a testa toda a mostra; este tem a testa quase toda coberta por
# ondas que descem em pontas. E o que separa os dois a 48px.
HAIR_D = ("M 72 120 "
          "C 65 90, 65 42, 92 26 "
          "C 111 13, 149 13, 170 30 "
          "C 189 45, 191 90, 184 120 "
          "C 181 97, 176 76, 169 67 "
          "C 164 80, 154 84, 145 74 "
          "C 140 86, 127 89, 117 76 "
          "C 111 85, 100 85, 93 74 "
          "C 88 79, 80 88, 76 104 "
          "C 74 110, 73 116, 72 120 Z")


def head(sw, expr=None):
    # A boca sai de expressoes.py quando ha expressao: a geometria e do JOGO
    # (o mesmo gesto no rosto de todo mundo) e a tinta continua sendo desta
    # personagem. Sem expressao, e a de descanso, palavra por palavra.
    boca_svg = boca(expr, sw, INK) if expr else (
        f"""<path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 115 146 C 122 154, 135 154, 142 145"/>""")

    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- orelhas: a esquerda dele leva a argola -->
    <ellipse cx="82"  cy="112" rx="8" ry="12" fill="{SKIN}"/>
    <ellipse cx="174" cy="112" rx="8" ry="12" fill="{SKIN}"/>

    <!-- rosto: mandibula masculina, mas o queixo e mais redondo que o do
         Matheus — ele nao tem barba para dar peso ali embaixo -->
    <path fill="{SKIN}" d="M 84 100
      C 84 56, 104 42, 128 42
      C 152 42, 172 56, 172 100
      C 172 130, 164 152, 150 163
      C 143 169, 136 171, 128 171
      C 120 171, 113 169, 106 163
      C 92 152, 84 130, 84 100 Z"/>

    <!-- sombra leve sob o cabelo: da profundidade a franja sem contorno interno -->
    <path fill="{SKIN_SH}" stroke="none" opacity="0.38" d="M 88 82
      C 96 92, 112 96, 128 94 C 144 96, 160 92, 168 82
      C 166 94, 150 101, 128 101 C 106 101, 90 94, 88 82 Z"/>

    <!-- ARGOLA de prata (unico metal do personagem) -->
    <circle cx="176" cy="126" r="5.6" fill="none" stroke="{INK}" stroke-width="{sw*0.9:.2f}"/>
    <circle cx="176" cy="126" r="5.6" fill="none" stroke="{SILVER}" stroke-width="{sw*0.5:.2f}"/>

    <!-- CABELO: franja ondulada, volume no topo, laterais cobrindo o alto da
         orelha. Halo por fora — castanho escuro contra fundo escuro. -->
    {halo(HAIR_D, w=sw*1.45)}
    <path fill="{HAIR}" d="{HAIR_D}"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 72 120 C 68 104, 68 88, 70 76
      C 76 84, 80 98, 82 114 C 78 116, 74 119, 72 120 Z"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 184 120 C 188 104, 188 88, 186 76
      C 180 84, 176 98, 174 114 C 178 116, 182 119, 184 120 Z"/>
    <!-- ondas: variacao longa, sem contorno interno (contorno interno ja virou
         leitura de "cordas" na Dri) -->
    <g stroke="none" fill="{HAIR_LIT}">
      <path d="M 96 38 C 108 26, 128 21, 146 24 C 130 30, 112 38, 100 50 Z"/>
      <path d="M 88 62 C 100 44, 122 32, 144 32 C 124 40, 104 54, 94 72 Z"/>
      <path d="M 152 30 C 166 36, 176 50, 178 66 C 172 52, 162 42, 148 38 Z"/>
      <path d="M 100 86 C 108 72, 122 62, 138 58 C 122 68, 110 80, 105 94 Z"/>
    </g>

    <!-- sobrancelhas GROSSAS e retas: a marca do rosto dele -->
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.6:.2f}" d="M 94 96 C 104 90, 117 90, 124 94"/>
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.6:.2f}" d="M 132 94 C 139 90, 152 90, 162 96"/>

    <!-- olhos -->
    <g>
      <ellipse cx="108" cy="115" rx="11" ry="11.5" fill="{CREAM}"/>
      <circle cx="109" cy="116" r="7.6" fill="{IRIS}" stroke="none"/>
      <circle cx="109" cy="116" r="3.4" fill="{INK}" stroke="none"/>
      <circle cx="106" cy="112.5" r="2.5" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 98 110 C 103 103, 114 103, 119 110"/>
    </g>
    <g>
      <ellipse cx="150" cy="115" rx="11" ry="11.5" fill="{CREAM}"/>
      <circle cx="149" cy="116" r="7.6" fill="{IRIS}" stroke="none"/>
      <circle cx="149" cy="116" r="3.4" fill="{INK}" stroke="none"/>
      <circle cx="146" cy="112.5" r="2.5" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 139 110 C 144 103, 155 103, 160 110"/>
    </g>

    <!-- nariz -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 125 124 C 127 134, 133 137, 138 132"/>

    <!-- sorriso fechado, curto: sem barba nem bigode competindo com ele -->
    {boca_svg}
  </g>'''


# ------------------------------------------------------------------ avatar
def avatar(tee=None, tee_sh=None):
    tee = tee or TEE
    tee_sh = tee_sh or TEE_SH
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Mafra Kitty - avatar">
  <defs>
    <clipPath id="mk-av-clip"><circle cx="128" cy="128" r="120"/></clipPath>
  </defs>

  <g clip-path="url(#mk-av-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- camiseta larga: o unico torso CLARO do elenco -->
      <path fill="{tee}" d="M 18 262 C 22 212, 60 188, 100 180 L 156 180 C 196 188, 234 212, 238 262 Z"/>
      <path fill="{tee_sh}" stroke="none" d="M 18 262 C 22 212, 46 194, 66 187 C 52 206, 44 232, 42 262 Z"/>
      <path fill="{tee_sh}" stroke="none" d="M 238 262 C 234 212, 210 194, 190 187 C 204 206, 212 232, 214 262 Z"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 18 262 C 22 212, 60 188, 100 180 L 156 180 C 196 188, 234 212, 238 262"/>

      <!-- ESTAMPA aumentada: no corpo inteiro o gatinho ocupa ~0.8 do peito;
           aqui ocupa mais, porque o corte circular come a barra da camisa e
           sobraria pouco desenho. Mesmo truque do sinal da Gabizinsky. Desenhada
           ANTES da gola: e tecido, tem de passar POR BAIXO do decote. -->
      {kitty(128, 230, 0.48, sw_eff=3.0, whiskers=False)}

      <!-- pescoco -->
      <path fill="{SKIN}" d="M 110 150 L 110 190 C 110 204, 146 204, 146 190 L 146 150 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 152 C 122 176, 134 176, 146 154 L 146 152 L 110 152 Z"/>

      <!-- gola redonda, com friso de costura -->
      <path fill="{SKIN}" d="M 104 181 C 108 210, 148 210, 152 181 Z"/>
      <path fill="none" stroke="{tee_sh}" stroke-width="7" d="M 103 180 C 107 212, 149 212, 153 180"/>
      <path fill="none" stroke="{INK}" stroke-width="4" d="M 103 180 C 107 212, 149 212, 153 180"/>
    </g>

{head(sw=5)}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
# Camiseta larga e reta, barra 10 unidades mais baixa que a do Matheus (o
# tronco dele e 3 unidades mais curto; o resto da diferenca esta nas pernas).
TEE_D = ("M 140 224 C 142 202, 156 187, 176 181 L 224 181 "
         "C 244 187, 258 202, 260 224 C 263 278, 265 332, 263 380 "
         "C 238 391, 162 391, 137 380 C 135 332, 137 278, 140 224 Z")
JEANS_D = ("M 145 380 C 139 430, 132 512, 136 611 "
           "C 138 655, 140 680, 141 694 L 185 694 "
           "C 186 661, 188 611, 191 542 C 194 484, 197 448, 200 428 "
           "C 203 448, 206 484, 209 542 C 212 611, 214 661, 215 694 "
           "L 259 694 C 260 680, 262 655, 264 611 "
           "C 262 512, 261 430, 255 380 Z")
SHOE_L = ("M 137 682 L 189 682 L 190 706 C 190 720, 180 728, 162 728 "
          "L 120 728 C 110 728, 108 717, 116 712 L 137 700 Z")
SHOE_R = ("M 263 682 L 211 682 L 210 706 C 210 720, 220 728, 238 728 "
          "L 280 728 C 290 728, 292 717, 284 712 L 263 700 Z")


def hand(mirror=False, dy=-1):
    """Mao aberta ao lado do corpo. Sem alianca e sem pulseira: o personagem
    nao usa metal nenhum abaixo do pescoco."""
    t = ' transform="translate(400 0) scale(-1 1)"' if mirror else ''
    fingers = "".join(
        f'<path stroke="{INK}"  stroke-width="12" d="M {x} {444+dy} L {x} {y+dy}"/>'
        f'<path stroke="{SKIN}" stroke-width="8"  d="M {x} {444+dy} L {x} {y+dy}"/>'
        for x, y in [(113, 470), (123, 479), (133, 483), (143, 475)])
    return f'''
  <g{t} stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <g fill="none">{fingers}</g>
    <path fill="none" stroke="{INK}"  stroke-width="14" d="M 148 {434+dy} C 154 {442+dy}, 155 {450+dy}, 152 {456+dy}"/>
    <path fill="none" stroke="{SKIN}" stroke-width="10" d="M 148 {434+dy} C 154 {442+dy}, 155 {450+dy}, 152 {456+dy}"/>
    <path fill="{SKIN}" d="M 109 {418+dy} L 145 {418+dy} C 149 {430+dy}, 149 {442+dy}, 146 {450+dy}
      C 138 {455+dy}, 116 {455+dy}, 109 {450+dy} C 106 {442+dy}, 105 {430+dy}, 109 {418+dy} Z"/>
  </g>'''


def body(jeans=None, jeans_sh=None, jeans_lit=None, expr=None):
    jeans = jeans or JEANS
    jeans_sh = jeans_sh or JEANS_SH
    jeans_lit = jeans_lit or JEANS_LIT
    sl = "M 146 213 C 140.6 231.6, 136.2 251.1, 132.8 271.2"
    sr = "M 254 213 C 259.4 231.6, 263.8 251.1, 267.2 271.2"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="Mafra Kitty - corpo inteiro">
  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- BRACOS (descem com o tronco) -->
    <g fill="none" stroke-linecap="round" transform="translate(0 {DY})">
      <path stroke="{INK}"  stroke-width="37" d="M 148 213 C 132 275, 126 347, 130 417"/>
      <path stroke="{SKIN}" stroke-width="29" d="M 148 213 C 132 275, 126 347, 130 417"/>
      <path stroke="{INK}"  stroke-width="37" d="M 252 213 C 268 275, 274 347, 270 417"/>
      <path stroke="{SKIN}" stroke-width="29" d="M 252 213 C 268 275, 274 347, 270 417"/>
      <!-- mangas: soltas, barra reta -->
      <path stroke="{INK}" stroke-width="48" d="{sl}"/>
      <path stroke="{TEE}" stroke-width="40" d="{sl}"/>
      <path stroke="{INK}" stroke-width="48" d="{sr}"/>
      <path stroke="{TEE}" stroke-width="40" d="{sr}"/>
      <path stroke="{TEE_SH}" stroke-width="40" stroke-linecap="butt" d="M 133.4 263 L 132.8 271.2"/>
      <path stroke="{TEE_SH}" stroke-width="40" stroke-linecap="butt" d="M 266.6 263 L 267.2 271.2"/>
    </g>

    <!-- TENIS BRANCOS -->
    <g>
      <path fill="{SHOE}" d="{SHOE_L}"/>
      <path fill="{SHOE_SH}" stroke="none" d="M 137 700 L 116 712 C 108 717, 110 728, 120 728 L 140 728 C 132 722, 132 710, 137 700 Z"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 109 720 C 110 727, 117 728, 122 728 L 162 728 C 179 728, 189 721, 190 710 L 190 720 C 189 728, 179 733, 162 733 L 120 733 C 111 733, 107 727, 109 720 Z"/>
      <path fill="none" stroke="{SHOE_SH}" stroke-width="4.5" d="M 144 694 L 168 700 M 141 706 L 166 712"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 109 721 C 110 728, 117 733, 122 733 L 162 733 C 180 733, 190 727, 190 718"/>
    </g>
    <g>
      <path fill="{SHOE}" d="{SHOE_R}"/>
      <path fill="{SHOE_SH}" stroke="none" d="M 263 700 L 284 712 C 292 717, 290 728, 280 728 L 260 728 C 268 722, 268 710, 263 700 Z"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 291 720 C 290 727, 283 728, 278 728 L 238 728 C 221 728, 211 721, 210 710 L 210 720 C 211 728, 221 733, 238 733 L 280 733 C 289 733, 293 727, 291 720 Z"/>
      <path fill="none" stroke="{SHOE_SH}" stroke-width="4.5" d="M 256 694 L 232 700 M 259 706 L 234 712"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 291 721 C 290 728, 283 733, 278 733 L 238 733 C 220 733, 210 727, 210 718"/>
    </g>

    <!-- JEANS MEDIA, perna reta, barra um pouco larga -->
    {halo(JEANS_D)}
    <path fill="{jeans}" d="{JEANS_D}"/>
    <path fill="{jeans_sh}" stroke="none" d="M 145 380 C 139 430, 138 512, 142 611 C 144 655, 146 680, 147 694 L 159 694 C 156 644, 153 530, 155 446 C 156 408, 158 388, 160 380 Z"/>
    <path fill="{jeans_lit}" stroke="none" opacity="0.55" d="M 247 386 C 252 438, 255 512, 254 611 C 253 655, 252 680, 251 694 L 259 694 C 260 680, 262 655, 264 611 C 268 512, 267 418, 261 358 Z"/>
    <g fill="none" stroke="{STITCH}" stroke-width="2.4" stroke-dasharray="6 4">
      <path d="M 162 394 C 160 448, 159 552, 161 690"/>
      <path d="M 238 394 C 240 448, 241 552, 239 690"/>
      <path d="M 200 384 L 200 414"/>
    </g>
    <g fill="none" stroke="{jeans_sh}" stroke-width="3">
      <path d="M 145 388 C 155 408, 169 414, 179 412"/>
      <path d="M 255 388 C 245 408, 231 414, 221 412"/>
    </g>
    <path fill="{jeans_sh}" stroke="none" d="M 145 380 L 255 380 C 255 388, 256 394, 256 398 L 144 398 C 144 394, 145 388, 145 380 Z"/>
    <path fill="{jeans_sh}" stroke="none" d="M 138 388 C 163 400, 237 400, 262 388 C 260 396, 258 402, 256 406 C 233 414, 167 414, 144 406 C 142 402, 140 396, 138 388 Z"/>

    <!-- TRONCO: pescoco, camiseta, estampa e gola descem juntos -->
    <g transform="translate(0 {DY})">
    <path fill="{SKIN}" d="M 184 143 L 184 189 C 184 199, 216 199, 216 189 L 216 143 Z"/>

    <!-- CAMISETA BRANCA -->
    <path fill="{TEE}" d="{TEE_D}"/>
    <path fill="{TEE_SH}" stroke="none" opacity="0.75" d="M 140 224 C 142 202, 156 187, 176 181 C 165 200, 158 246, 157 372 C 149 376, 141 378, 137 380 C 135 332, 137 278, 140 224 Z"/>
    <path fill="{TEE_LIT}" stroke="none" opacity="0.7" d="M 224 181 C 244 187, 258 202, 260 224 C 262 262, 264 322, 263 380 L 250 381 C 251 300, 248 224, 240 190 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{TEE_D}"/>

    <!-- ESTAMPA: gatinho grande no peito + duas pegadinhas -->
    {kitty(200, 268, 0.80)}
    {paw(163, 342, 0.62)}
    {paw(238, 349, 0.62)}

    <path fill="{SKIN}" d="M 178 182 C 182 213, 218 213, 222 182 Z"/>
    <path fill="none" stroke="{TEE_SH}" stroke-width="7" d="M 177 181 C 181 215, 219 215, 223 181"/>
    <path fill="none" stroke="{INK}" stroke-width="4" d="M 177 181 C 181 215, 219 215, 223 181"/>
    </g>
  </g>
  <g transform="translate(0 {DY})">{hand()}{hand(mirror=True)}</g>

  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">
{head(sw=SW, expr=expr)}
  </g>
</svg>
'''


# ---------------------------------------- close da estampa (padrao do elenco)
def print_detail():
    """Mesmo papel do `matheus-pulso.svg` e do `gabizinsky-anel.svg`: o detalhe
    que some no tamanho de uso, mostrado no tamanho em que existe."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Mafra Kitty - a estampa de gatinho da camisa">
  <defs><clipPath id="mk-print-clip"><circle cx="160" cy="160" r="150"/></clipPath></defs>
  <g clip-path="url(#mk-print-clip)">
    <circle cx="160" cy="160" r="150" fill="{WOOD}"/>
    <ellipse cx="160" cy="150" rx="132" ry="128" fill="{WOOD_LIT}"/>

    <!-- pedaco do tecido, com a costura da barra e uma dobra -->
    <rect x="10" y="10" width="300" height="300" fill="{TEE}"/>
    <path fill="{TEE_SH}" stroke="none" opacity="0.75" d="M 10 10 L 62 10 C 46 96, 44 216, 58 310 L 10 310 Z"/>
    <path fill="{TEE_LIT}" stroke="none" opacity="0.8" d="M 258 10 L 310 10 L 310 310 L 266 310 C 278 214, 276 98, 258 10 Z"/>
    <g fill="none" stroke="{TEE_SH}" stroke-width="2.6" stroke-dasharray="7 5">
      <path d="M 74 10 C 66 110, 66 214, 76 310"/>
      <path d="M 246 10 C 254 110, 254 214, 244 310"/>
    </g>

    {kitty(160, 150, 2.05, sw_eff=6.0)}
    {paw(64, 268, 1.15)}
    {paw(258, 258, 1.15)}
  </g>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{INK}" stroke-width="12"/>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{WARM}" stroke-width="6"/>
</svg>
'''


# --------------------------------------------------------------- alternativa
# Jeans clara, como na foto de referencia de short. Fica salva porque a jeans
# media e a decisao que mais pode mudar depois.
LIGHT_JEANS = ("#8AA2BE", "#6C86A4", "#A8BCD2")


files = {
    "mafra-kitty-avatar.svg": avatar(),
    "mafra-kitty-corpo-inteiro.svg": body(),
    "mafra-kitty-estampa.svg": print_detail(),
    "mafra-kitty-alt-jeans-clara-corpo-inteiro.svg": body(*LIGHT_JEANS),
}
# As expressoes: a mesma figura, outra boca. O cliente troca o arquivo por
# 1,9 s quando algo acontece com aquele jogador (REACOES, em client.js).
for _e in ("feliz", "bravo"):
    files[f"mafra-kitty-corpo-inteiro-{_e}.svg"] = body(expr=_e)

for name, content in files.items():
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
print("ok:", ", ".join(files))
