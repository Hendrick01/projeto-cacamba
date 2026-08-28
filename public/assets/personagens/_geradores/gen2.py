# -*- coding: utf-8 -*-
"""Dri - segunda personagem do jogo de cartas Cacamba.
Mesma construcao geometrica da Gabizinsky (busto em viewBox 256, corpo em
400x800, cabeca em coordenadas locais), mesma paleta de jogo e mesmos
enquadramentos. A identidade dela e preto sobre preto com mechas cor de mel.
"""
import os
import sys

# A boca das expressoes e compartilhada: ver expressoes.py, ao lado.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from expressoes import boca

# Os SVGs ficam um nivel acima: este diretorio guarda so os geradores.
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ------------------------------------------------------- paleta do jogo
INK        = "#2A1B12"   # contorno = fundo escuro do jogo
WOOD       = "#7A4A2B"
WOOD_LIT   = "#8C5733"
WARM       = "#F2C14E"
CREAM      = "#F5F1E6"
RIM        = "#8C6A45"   # mesma luz de borda quente do elenco

SKIN       = "#F4CFAA"   # mesma pele da Gabizinsky (mesmo elenco)
SKIN_SH    = "#E0B189"
BLUSH      = "#E08A6A"

# ------------------ escada de pretos: cada peca um degrau de valor diferente
TOP        = "#3F383E"   # baby look   L* ~ 23  (o mais claro)
TOP_SH     = "#332D32"
TOP_LIT    = "#544B52"
SKIRT      = "#332D33"   # saia        L* ~ 19
SKIRT_SH   = "#282329"
SKIRT_LIT  = "#473F47"
SHOE       = "#2C2830"   # tenis       L* ~ 16
SHOE_SOLE  = "#C9C3BC"   # off-white FRIO (o da Gabizinsky e creme quente)
HAIR       = "#2A2730"   # cabelo      L* ~ 16, preto levemente frio
HAIR_LIT   = "#3C3945"   # brilho largo das ondas (sopro de tom, nao linha)
CHOKER     = "#211E26"

HONEY      = "#C08A45"   # mechas cor de mel: o ponto focal da figura
HONEY_LIT  = "#DFA757"

IRIS       = "#4A2C1C"   # castanho ESCURO
BROW       = "#2B2733"
LINER      = "#221F2A"
LIP        = "#7A3A4A"   # ameixa, nao preto

SILVER     = "#C9CDD2"   # mesma triade de prata do elenco
SILVER_LIT = "#EDEFF2"
SILVER_SH  = "#8D949B"

S = 0.88                                   # escala da cabeca no corpo inteiro
TX, TY = 200 - 128 * S, 132 - 108 * S
SW = 5 / S

# ---------------------------------------------------------------- cabelo
# ondas: variacao LONGA da silhueta externa (amplitude ~8, periodo ~110),
# pontas convergindo. Sem divisao interna do bloco.
HAIR_BACK = ("M 128 20 C 62 20, 38 66, 42 110 "
             "C 34 162, 38 220, 46 270 "
             "C 41 298, 45 314, 44 330 "
             "C 57 338, 71 329, 75 308 "
             "C 79 260, 85 214, 92 176 "
             "C 87 148, 85 126, 86 106 "
             "L 170 106 "
             "C 171 126, 169 148, 164 176 "
             "C 171 214, 177 260, 181 308 "
             "C 185 329, 199 338, 212 330 "
             "C 211 314, 215 298, 210 270 "
             "C 218 220, 222 162, 214 110 "
             "C 218 66, 194 20, 128 20 Z")

# mechas frontais: caem sobre o peito, POR DENTRO da linha dos bracos
FRONT_L = ("M 64 106 C 58 152, 62 204, 70 250 C 74 282, 80 304, 88 320 "
           "C 98 324, 107 315, 107 301 C 99 258, 94 206, 93 156 "
           "C 92 130, 91 114, 91 106 Z")
FRONT_R = ("M 192 106 C 198 152, 194 204, 186 250 C 182 282, 176 304, 168 320 "
           "C 158 324, 149 315, 149 301 C 157 258, 162 206, 163 156 "
           "C 164 130, 165 114, 165 106 Z")
# so a borda que encosta na pele leva linha
FRONT_L_EDGE = ("M 91 106 C 92 130, 93 156, 93 156 C 94 206, 99 258, 107 301 "
                "C 107 315, 98 324, 88 320")
FRONT_R_EDGE = ("M 165 106 C 164 130, 163 156, 163 156 C 162 206, 157 258, 149 301 "
                "C 149 315, 158 324, 168 320")


def hair_back(sw, halo=False):
    """Massa de tras. Fica ATRAS dos ombros/tronco: e ela que da volume a
    silhueta na altura da cabeca."""
    h = ""
    if halo:
        h = (f'<path fill="none" stroke="{RIM}" stroke-width="{9/S:.2f}" '
             f'opacity="0.8" stroke-linejoin="round" d="{HAIR_BACK}"/>')
    return (h + f'<g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linejoin="round">'
            f'<path fill="{HAIR}" d="{HAIR_BACK}"/>'
            f'<path fill="{HAIR_LIT}" stroke="none" opacity="0.8" '
            f'd="M 48 104 C 52 60, 78 28, 114 22 C 88 38, 64 68, 58 110 '
            f'C 52 164, 58 224, 68 274 C 58 270, 50 222, 48 168 Z"/>'
            f'<path fill="{HAIR_LIT}" stroke="none" opacity="0.45" '
            f'd="M 208 104 C 204 60, 178 28, 142 22 C 168 38, 192 68, 198 110 '
            f'C 204 164, 198 224, 188 274 C 198 270, 206 222, 208 168 Z"/></g>')


def head(sw, expr=None):
    """Rosto + franja reta + mechas frontais. Coordenadas locais 256x256,
    identicas as da Gabizinsky."""
    # A boca sai de expressoes.py quando ha expressao: a geometria e do JOGO
    # (o mesmo gesto no rosto de todo mundo) e a tinta continua sendo desta
    # personagem. Sem expressao, e a de descanso, palavra por palavra.
    boca_svg = boca(expr, sw, INK, LIP) if expr else (
        f"""<path fill="none" stroke="{LIP}" stroke-width="{sw*1.4:.2f}" d="M 113 145 C 121 156, 138 156, 146 144"/>""")

    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- orelhas -->
    <ellipse cx="78"  cy="114" rx="10" ry="12" fill="{SKIN}"/>
    <ellipse cx="178" cy="114" rx="10" ry="12" fill="{SKIN}"/>

    <!-- rosto -->
    <path fill="{SKIN}" d="M 76 98
      C 76 60, 98 46, 128 46
      C 158 46, 180 60, 180 98
      C 180 128, 170 152, 152 160
      C 144 164, 112 164, 104 160
      C 86 152, 76 128, 76 98 Z"/>

    <!-- CABELO REPARTIDO, RISCA LATERAL: pico fora do centro (x~112) -->
    <path fill="{HAIR}" stroke="none" d="M 76 108
      C 80 82, 94 64, 112 58 L 120 70
      C 146 62, 172 78, 180 108
      C 188 52, 160 22, 128 22 C 92 22, 66 52, 76 108 Z"/>
    <path fill="{HONEY}" stroke="none" d="M 92 94
      C 90 80, 95 68, 105 62 L 109 66
      C 101 72, 96 81, 97 95 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 76 108
      C 80 82, 94 64, 112 58 L 120 70
      C 146 62, 172 78, 180 108"/>

    <!-- sobrancelhas retas -->
    <path fill="none" stroke="{BROW}" stroke-width="{sw*1.6:.2f}" d="M 94 95 C 104 90, 116 90, 124 93"/>
    <path fill="none" stroke="{BROW}" stroke-width="{sw*1.6:.2f}" d="M 132 93 C 140 90, 152 90, 162 95"/>

    <!-- olhos castanho ESCURO + delineado gatinho discreto -->
    <g>
      <ellipse cx="108" cy="115" rx="12" ry="13" fill="{CREAM}"/>
      <circle  cx="109" cy="116" r="8.2" fill="{IRIS}" stroke="none"/>
      <circle  cx="109" cy="116" r="4.0" fill="{INK}"  stroke="none"/>
      <circle  cx="105.5" cy="112" r="2.6" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{LINER}" stroke-width="{sw*1.5:.2f}" d="M 96 110 C 101 101, 116 101, 121 109"/>
      <path fill="none" stroke="{LINER}" stroke-width="{sw*1.4:.2f}" d="M 97 109 L 88 101"/>
    </g>
    <g>
      <ellipse cx="150" cy="115" rx="12" ry="13" fill="{CREAM}"/>
      <circle  cx="149" cy="116" r="8.2" fill="{IRIS}" stroke="none"/>
      <circle  cx="149" cy="116" r="4.0" fill="{INK}"  stroke="none"/>
      <circle  cx="145.5" cy="112" r="2.6" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{LINER}" stroke-width="{sw*1.5:.2f}" d="M 137 109 C 142 101, 157 101, 162 110"/>
      <path fill="none" stroke="{LINER}" stroke-width="{sw*1.4:.2f}" d="M 161 109 L 170 101"/>
    </g>

    <!-- nariz -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 126 126 C 128 134, 133 136, 137 132"/>

    <!-- boca: sorriso, batom ameixa -->
    {boca_svg}

    <!-- blush -->
    <ellipse cx="94"  cy="146" rx="11" ry="6" fill="{BLUSH}" opacity="0.24" stroke="none"/>
    <ellipse cx="162" cy="146" rx="11" ry="6" fill="{BLUSH}" opacity="0.24" stroke="none"/>

    <!-- MECHAS FRONTAIS: massas largas, sem contorno interno -->
    <path fill="{HAIR}" stroke="none" d="{FRONT_L}"/>
    <path fill="{HAIR}" stroke="none" d="{FRONT_R}"/>
    <path fill="{HAIR_LIT}" stroke="none" opacity="0.6" d="M 68 122
      C 63 168, 67 216, 74 258 C 78 286, 83 304, 89 316
      C 93 316, 96 313, 96 306 C 88 262, 82 212, 81 160
      C 80 138, 79 128, 79 122 Z"/>
    <!-- cor de mel: DUAS mechas finas por lado (~35% da massa frontal),
         com cabelo escuro de cada lado delas -->
    <path fill="{HONEY}" stroke="none" d="M 76 120 C 71 166, 75 214, 82 258
      C 86 284, 91 300, 96 310 C 97.6 310, 99 308.4, 99 304
      C 92 262, 87 214, 86 160 C 85 138, 84 126, 84 120 Z"/>
    <path fill="{HONEY_LIT}" stroke="none" d="M 77 128 C 73 170, 77 214, 83 254
      C 86 276, 90 291, 94 300 C 95 300, 95.8 298.6, 95.8 295
      C 90 258, 86 212, 85 160 C 84 140, 84 132, 84 128 Z"/>
    <path fill="{HONEY}" stroke="none" d="M 92 132 C 89 172, 92 216, 97 254
      C 99 272, 102 288, 105 298 C 106 298, 107 296.6, 107 293
      C 102 258, 99 214, 99 164 C 99 146, 99 138, 99 132 Z"/>
    <path fill="{HONEY}" stroke="none" d="M 180 120 C 185 166, 181 214, 174 258
      C 170 284, 165 300, 160 310 C 158.4 310, 157 308.4, 157 304
      C 164 262, 169 214, 170 160 C 171 138, 172 126, 172 120 Z"/>
    <path fill="{HONEY_LIT}" stroke="none" d="M 179 128 C 183 170, 179 214, 173 254
      C 170 276, 166 291, 162 300 C 161 300, 160.2 298.6, 160.2 295
      C 166 258, 170 212, 171 160 C 172 140, 172 132, 172 128 Z"/>
    <path fill="{HONEY}" stroke="none" d="M 164 132 C 167 172, 164 216, 159 254
      C 157 272, 154 288, 151 298 C 150 298, 149 296.6, 149 293
      C 154 258, 157 214, 157 164 C 157 146, 157 138, 157 132 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" d="{FRONT_L_EDGE}"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" d="{FRONT_R_EDGE}"/>
  </g>'''


def choker(cx, y, w, sw):
    """Choker de veludo preto com gota de prata. Unico acessorio."""
    h = w * 0.30
    return (f'<rect x="{cx-w/2}" y="{y}" width="{w}" height="{h:.1f}" rx="{h*0.30:.1f}" '
            f'fill="{CHOKER}" stroke="{INK}" stroke-width="{sw*0.7:.2f}"/>'
            f'<path fill="none" stroke="{SILVER_SH}" stroke-width="{sw*0.35:.2f}" '
            f'opacity="0.8" d="M {cx-w/2+2} {y+2.5} L {cx+w/2-2} {y+2.5}"/>'
            f'<path fill="none" stroke="{SILVER_SH}" stroke-width="{sw*0.5:.2f}" '
            f'd="M {cx} {y+h} L {cx} {y+h+w*0.10:.1f}"/>'
            f'<path fill="{SILVER}" stroke="{INK}" stroke-width="{sw*0.45:.2f}" '
            f'd="M {cx} {y+h+w*0.08:.1f} '
            f'C {cx+w*0.10:.1f} {y+h+w*0.20:.1f} {cx+w*0.09:.1f} {y+h+w*0.33:.1f} '
            f'{cx} {y+h+w*0.34:.1f} '
            f'C {cx-w*0.09:.1f} {y+h+w*0.33:.1f} {cx-w*0.10:.1f} {y+h+w*0.20:.1f} '
            f'{cx} {y+h+w*0.08:.1f} Z"/>'
            f'<circle cx="{cx-w*0.03:.1f}" cy="{y+h+w*0.19:.1f}" r="{w*0.024:.1f}" '
            f'fill="{SILVER_LIT}" stroke="none"/>')


# ------------------------------- roupas novas: couro x tecido x salto bordo
# Couro nao ganha gradiente (o jogo e flat). Ganha BRILHO ESPECULAR DE BORDA
# DURA: faixas chapadas de valor alto, com limite reto. Corset e short ficam
# so com sombra chapada e sem nenhum realce -> leem como fosco.
JACKET     = "#35323C"   # couro   L* ~ 21  (o mais claro dos pretos)
JACKET_SH  = "#292630"
JACKET_LIT = "#5C5766"   # faixa especular
JACKET_HI  = "#837D8E"   # fio de luz na quina
SHORT      = "#302C32"   # tecido  L* ~ 18.5, fosco
SHORT_SH   = "#26222A"
SHORT_LIT  = "#453F48"
CORSET     = "#292530"   # tecido  L* ~ 15.5, fosco
CORSET_SH  = "#221E28"
BONE       = "#3E3948"   # barbatanas do corset
HEEL       = "#6B2A36"   # bordo   (vinho, nao tijolo: rima com o mel sem brigar)
HEEL_SH    = "#4E1E28"
HEEL_LIT   = "#8A3B49"
HEEL_SOLE  = "#3A2028"

DY = 22          # salto: ~4 cm na escala da figura (+3,3% de altura)


def halo(d, w=9):
    return (f'<path fill="none" stroke="{RIM}" stroke-width="{w}" opacity="0.8" '
            f'stroke-linejoin="round" d="{d}"/>')


# ------------------------------------------------------------------ avatar
def avatar():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Dri - avatar">
  <defs><clipPath id="dri-avatar-clip"><circle cx="128" cy="128" r="120"/></clipPath></defs>

  <g clip-path="url(#dri-avatar-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    {hair_back(5)}

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- JAQUETA DE COURO: ombros -->
      <path fill="{JACKET}" d="M 10 262
        C 14 210, 54 188, 94 180
        L 162 180
        C 202 188, 242 210, 246 262 Z"/>
      <path fill="{JACKET_SH}" stroke="none" d="M 16 262 C 20 218, 52 196, 86 188 C 56 206, 36 232, 32 262 Z"/>
      <!-- brilho especular de borda dura (couro) -->
      <path fill="{JACKET_LIT}" stroke="none" d="M 96 182 C 62 190, 28 210, 20 250 L 34 250 C 44 216, 70 198, 100 191 Z"/>
      <path fill="{JACKET_HI}" stroke="none" d="M 96 182 C 66 189, 38 205, 27 232 L 32 234 C 46 210, 70 195, 98 188 Z"/>
      <path fill="{JACKET_LIT}" stroke="none" d="M 160 182 C 194 190, 228 210, 236 250 L 222 250 C 212 216, 186 198, 156 191 Z"/>

      <!-- pescoco -->
      <path fill="{SKIN}" d="M 110 148 L 110 196 C 110 208, 146 208, 146 196 L 146 148 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 150 C 122 172, 136 172, 146 152 L 146 150 L 110 150 Z"/>

      <!-- decote: pele -->
      <path fill="{SKIN}" d="M 104 184 L 152 184 C 154 206, 152 218, 148 224 C 136 234, 120 234, 108 224 C 104 218, 102 206, 104 184 Z"/>
      <!-- CORSET (fosco, sem realce; decote coracao discreto) -->
      <path fill="{CORSET}" d="M 102 220 C 112 232, 122 232, 128 224
        C 134 232, 144 232, 154 220
        C 156 240, 156 254, 155 262 L 101 262 C 100 254, 100 240, 102 220 Z"/>
      <g fill="none" stroke="{BONE}" stroke-width="2.6">
        <path d="M 113 234 L 112 262"/><path d="M 128 230 L 128 262"/><path d="M 143 234 L 144 262"/>
      </g>

      <!-- lapelas da jaqueta por cima -->
      <path fill="{JACKET}" d="M 96 183 L 128 240 L 100 258 L 74 196 Z"/>
      <path fill="{JACKET}" d="M 160 183 L 128 240 L 156 258 L 182 196 Z"/>
      <path fill="none" stroke="{JACKET_LIT}" stroke-width="5" d="M 99 189 L 126 238"/>
      <path fill="none" stroke="{JACKET_LIT}" stroke-width="5" d="M 157 189 L 130 238"/>
      <path fill="none" stroke="{HONEY}" stroke-width="2.2" stroke-dasharray="5 4" d="M 104 196 L 126 234"/>
      <path fill="none" stroke="{HONEY}" stroke-width="2.2" stroke-dasharray="5 4" d="M 152 196 L 130 234"/>

      <!-- choker -->
      {choker(128, 176, 44, 5)}
    </g>
{head(sw=5)}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
SHORT_D = ("M 146 336 C 138 374, 136 414, 139 452 L 190 452 "
           "C 192 422, 196 402, 200 390 C 204 402, 208 422, 210 452 "
           "L 261 452 C 264 414, 262 374, 254 336 Z")
CORSET_D = ("M 170 236 C 184 248, 197 248, 200 240 C 203 248, 216 248, 230 236 "
            "C 233 268, 233 296, 231 318 C 212 328, 188 328, 169 318 "
            "C 167 296, 167 268, 170 236 Z")
JKT_L = ("M 135 246 C 137 226, 154 208, 176 204 L 193 250 L 191 300 "
         "L 141 300 C 137 276, 133 264, 135 246 Z")
JKT_R = ("M 265 246 C 263 226, 246 208, 224 204 L 207 250 L 209 300 "
         "L 259 300 C 263 276, 267 264, 265 246 Z")
PUMP_L = ("M 150 686 L 189 678 L 187 712 L 177 712 "
          "C 161 718, 141 726, 125 732 C 119 733, 117 727, 123 722 "
          "C 133 712, 143 696, 150 686 Z")
PUMP_R = ("M 250 686 L 211 678 L 213 712 L 223 712 "
          "C 239 718, 259 726, 275 732 C 281 733, 283 727, 277 722 "
          "C 267 712, 257 696, 250 686 Z")
HEELCOL_L = "M 187 712 L 191 733 L 179 733 L 177 712 Z"
HEELCOL_R = "M 213 712 L 209 733 L 221 733 L 223 712 Z"


def hand(mirror=False):
    t = ' transform="translate(400 0) scale(-1 1)"' if mirror else ''
    fingers = "".join(
        f'<path stroke="{INK}"  stroke-width="12" d="M {x} 444 L {x} {y}"/>'
        f'<path stroke="{SKIN}" stroke-width="8"  d="M {x} 444 L {x} {y}"/>'
        for x, y in [(113, 470), (123, 479), (133, 483), (143, 475)])
    return f'''
  <g{t} stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <g fill="none">{fingers}</g>
    <path fill="none" stroke="{INK}"  stroke-width="14" d="M 148 434 C 154 442, 155 450, 152 456"/>
    <path fill="none" stroke="{SKIN}" stroke-width="10" d="M 148 434 C 154 442, 155 450, 152 456"/>
    <path fill="{SKIN}" d="M 109 418 L 145 418 C 149 430, 149 442, 146 450
      C 138 455, 116 455, 109 450 C 106 442, 105 430, 109 418 Z"/>
  </g>'''


def body(expr=None):
    # manga de couro dobrada no meio do antebraco (curva do braco truncada)
    sl = "M 146 236 C 134.84 270.72, 128.29 308.52, 126.12 347.00"
    sr = "M 254 236 C 265.16 270.72, 271.71 308.52, 273.88 347.00"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="Dri - corpo inteiro">

  <g transform="translate(0 -{DY})">

  <!-- cabelo de tras + halo -->
  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">{hair_back(SW, halo=True)}</g>

  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- BRACOS + manga de couro dobrada -->
    <g fill="none" stroke-linecap="round">
      <path stroke="{INK}"  stroke-width="45" d="M 146 236 C 128 292, 122 356, 127 418"/>
      <path stroke="{SKIN}" stroke-width="36" d="M 146 236 C 128 292, 122 356, 127 418"/>
      <path stroke="{INK}"  stroke-width="45" d="M 254 236 C 272 292, 278 356, 273 418"/>
      <path stroke="{SKIN}" stroke-width="36" d="M 254 236 C 272 292, 278 356, 273 418"/>
      <path stroke="{INK}"    stroke-width="56" d="{sl}"/>
      <path stroke="{JACKET}" stroke-width="47" d="{sl}"/>
      <path stroke="{INK}"    stroke-width="56" d="{sr}"/>
      <path stroke="{JACKET}" stroke-width="47" d="{sr}"/>
      <!-- especular de borda dura na quina da manga -->
      <path stroke="{JACKET_LIT}" stroke-width="9" stroke-linecap="butt" d="M 138 250 C 128 284, 122 314, 120 342"/>
      <path stroke="{JACKET_LIT}" stroke-width="9" stroke-linecap="butt" d="M 262 250 C 272 284, 278 314, 280 342"/>
      <!-- punho dobrado -->
      <path stroke="{JACKET_SH}" stroke-width="47" stroke-linecap="butt" d="M 126.6 336 L 126.12 347"/>
      <path stroke="{JACKET_SH}" stroke-width="47" stroke-linecap="butt" d="M 273.4 336 L 273.88 347"/>
    </g>

    <!-- PERNAS nuas -->
    <path fill="{SKIN}" d="M 146 336
      C 139 400, 146 470, 153 512 C 159 552, 155 600, 158 648
      C 159 668, 160 690, 160 710 L 187 710
      C 187 690, 186 668, 186 648 C 185 600, 184 552, 188 512
      C 195 470, 200 420, 202 336 Z"/>
    <path fill="{SKIN}" d="M 254 336
      C 261 400, 254 470, 247 512 C 241 552, 245 600, 242 648
      C 241 668, 240 690, 240 710 L 213 710
      C 213 690, 214 668, 214 648 C 215 600, 216 552, 212 512
      C 205 470, 200 420, 198 336 Z"/>
    <path fill="{SKIN_SH}" stroke="none" d="M 146 336 C 141 430, 149 500, 154 560 C 160 620, 158 680, 160 710 L 168 710 C 166 670, 166 610, 163 560 C 159 500, 156 430, 160 336 Z"/>

    <!-- pescoco -->
    <path fill="{SKIN}" d="M 184 168 L 184 214 C 184 224, 216 224, 216 214 L 216 168 Z"/>

    <!-- decote (pele) + CORSET fosco -->
    <path fill="{SKIN}" d="M 176 204 L 224 204 C 226 224, 226 236, 224 242 C 212 252, 188 252, 176 242 C 174 236, 174 224, 176 204 Z"/>
    <path fill="{CORSET}" d="{CORSET_D}"/>
    <path fill="{CORSET_SH}" stroke="none" d="M 174 236 C 176 268, 176 296, 178 320 L 174 318 C 172 296, 172 268, 174 236 Z"/>
    <g fill="none" stroke="{BONE}" stroke-width="2.6">
      <path d="M 186 250 L 187 320"/><path d="M 200 246 L 200 324"/><path d="M 214 250 L 213 320"/>
    </g>

    <!-- SHORT PRETO (fosco) -->
    {halo(SHORT_D)}
    <path fill="{SHORT}" d="{SHORT_D}"/>
    <path fill="{SHORT_SH}" stroke="none" d="M 146 336 C 138 374, 136 414, 139 452 L 155 452 C 152 414, 152 374, 158 336 Z"/>
    <path fill="{SHORT_SH}" stroke="none" d="M 146 336 L 254 336 C 255 344, 255 350, 256 356 L 144 356 C 145 350, 145 344, 146 336 Z"/>
    <path fill="none" stroke="{SHORT_LIT}" stroke-width="2.4" stroke-dasharray="6 4" d="M 146 446 L 188 446 M 212 446 L 254 446"/>

    <!-- JAQUETA DE COURO CURTA, aberta -->
    {halo(JKT_L)}{halo(JKT_R)}
    <path fill="{JACKET}" d="{JKT_L}"/>
    <path fill="{JACKET}" d="{JKT_R}"/>
    <path fill="{JACKET_SH}" stroke="none" d="M 143 244 C 145 228, 157 214, 172 208 C 158 228, 152 262, 154 298 L 147 298 C 144 274, 141 262, 143 244 Z"/>
    <!-- especular de borda dura: quina do ombro e da lapela -->
    <path fill="{JACKET_LIT}" stroke="none" d="M 178 206 L 186 206 L 197 245 L 191 249 Z"/>
    <path fill="{JACKET_LIT}" stroke="none" d="M 222 206 L 214 206 L 203 245 L 209 249 Z"/>
    <path fill="{JACKET_HI}" stroke="none" d="M 180 207 L 183 207 L 194 244 L 192 245 Z"/>
    <path fill="{JACKET_LIT}" stroke="none" d="M 147 244 C 149 228, 161 214, 176 208 L 178 214 C 165 220, 155 232, 153 246 Z"/>
    <path fill="{JACKET_LIT}" stroke="none" d="M 253 244 C 251 228, 239 214, 224 208 L 222 214 C 235 220, 245 232, 247 246 Z"/>
    <!-- pespontos cor de mel: devolvem o mel ao meio da figura -->
    <g fill="none" stroke="{HONEY}" stroke-width="2.2" stroke-dasharray="5 4">
      <path d="M 186 214 L 197 248 L 195 296"/>
      <path d="M 214 214 L 203 248 L 205 296"/>
      <path d="M 150 294 L 189 294 M 211 294 L 250 294"/>
    </g>
    <!-- zipper de prata -->
    <path fill="none" stroke="{SILVER_SH}" stroke-width="3" d="M 193 252 L 191 296"/>
    <ellipse cx="192" cy="258" rx="3.4" ry="4.6" fill="{SILVER}" stroke="{INK}" stroke-width="1.4"/>

    {choker(200, 196, 38, 5)}
  </g>
  <!-- SALTO BORDO (fica no chao; o resto do corpo sobe {DY} unidades) -->
  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <g>
      {halo(HEELCOL_L, 8)}{halo(PUMP_L)}
      <path fill="{HEEL}" d="{HEELCOL_L}"/>
      <path fill="{HEEL}" d="{PUMP_L}"/>
      <path fill="{HEEL_LIT}" stroke="none" d="M 150 688 L 160 686 C 150 698, 138 712, 128 722 L 124 722 C 133 711, 143 697, 150 688 Z"/>
      <path fill="{HEEL_SH}" stroke="none" d="M 177 712 C 161 718, 141 726, 125 732 C 122 732.6, 120 731.5, 119.6 730 L 177 707 Z"/>
      <path fill="{HEEL_SOLE}" stroke="none" d="M 187 730 L 191 733 L 179 733 L 179 730 Z"/>
    </g>
    <g>
      {halo(HEELCOL_R, 8)}{halo(PUMP_R)}
      <path fill="{HEEL}" d="{HEELCOL_R}"/>
      <path fill="{HEEL}" d="{PUMP_R}"/>
      <path fill="{HEEL_LIT}" stroke="none" d="M 250 688 L 240 686 C 250 698, 262 712, 272 722 L 276 722 C 267 711, 257 697, 250 688 Z"/>
      <path fill="{HEEL_SH}" stroke="none" d="M 223 712 C 239 718, 259 726, 275 732 C 278 732.6, 280 731.5, 280.4 730 L 223 707 Z"/>
      <path fill="{HEEL_SOLE}" stroke="none" d="M 213 730 L 209 733 L 221 733 L 221 730 Z"/>
    </g>
  </g>

{hand()}
{hand(mirror=True)}

  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">
{head(sw=SW, expr=expr)}
  </g>
  </g>
</svg>
'''


files = {
    "dri-avatar.svg": avatar(),
    "dri-corpo-inteiro.svg": body(),
}
# As expressoes: a mesma figura, outra boca. O cliente troca o arquivo por
# 1,9 s quando algo acontece com aquele jogador (REACOES, em client.js).
for _e in ("feliz", "bravo"):
    files[f"dri-corpo-inteiro-{_e}.svg"] = body(expr=_e)

for name, content in files.items():
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
print("ok:", ", ".join(files))
