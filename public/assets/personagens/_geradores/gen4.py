# -*- coding: utf-8 -*-
"""Matheus - quarto personagem (primeiro homem) do jogo Cacamba.
Mesma construcao do elenco. Adaptacoes masculinas: mandibula mais larga e
reta, pescoco e ombros mais largos, sobrancelhas mais baixas e grossas,
olhos ligeiramente menores. Camisa tricolor (listras verticais) SEM escudo,
nome, numero ou patrocinador. Prata no rosto: piercing na sobrancelha direita
DELE e brinco ponto de luz na orelha direita — os dois do mesmo lado, que na
imagem e o lado esquerdo.
"""
import os
import sys

# A boca das expressoes e compartilhada: ver expressoes.py, ao lado.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from expressoes import boca

# Os SVGs ficam um nivel acima: este diretorio guarda so os geradores.
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INK        = "#2A1B12"
WOOD       = "#7A4A2B"
WOOD_LIT   = "#8C5733"
WARM       = "#F2C14E"
CREAM      = "#F5F1E6"
RIM        = "#8C6A45"

SKIN       = "#F4CFAA"
SKIN_SH    = "#E0B189"

HAIR       = "#3A2A20"   # castanho MUITO escuro (foto). Quente, nao e o preto frio das mulheres
HAIR_LIT   = "#57422F"
HAIR_SH    = "#281C15"
IRIS       = "#4A3323"   # olhos no mesmo tom do cabelo

# camisa tricolor: azul / preto / branco
BLUE       = "#2E6094"   # azul do jogo: profundo mas dessaturado
BLUE_SH    = "#234B75"
BLK        = "#26232A"   # preto levantado (nunca #000)
WHT        = "#EFEAE0"   # branco quente
COLLAR     = "#EFEAE0"

JEANS      = "#3B4A63"   # jeans azul ESCURO
JEANS_SH   = "#2E3A4E"
JEANS_LIT  = "#4E607C"
STITCH     = "#C0A075"

SHOE       = "#26232A"
SHOE_SOLE  = "#D6D0C4"
SHOE_LACE  = "#EFEAE0"

GOLD       = "#C8A24E"   # alianca (a Gabizinsky usa prata: contraste de elenco)
GOLD_SH    = "#9A7A34"
GOLD_LIT   = "#E4C378"
PEARL      = "#EDE6D6"   # perola: FOSCA, so um ponto de luz seco
PEARL_SH   = "#CBC0A8"
SILVER     = "#C9CDD2"
SILVER_MID = "#A9AFB5"
SILVER_SH  = "#8D949B"

S = 0.88
TX = 200 - 128 * S
TY = -3.4                 # mesma estatura da EstereX
SW = 5 / S


def halo(d, w=9):
    return (f'<path fill="none" stroke="{RIM}" stroke-width="{w}" opacity="0.8" '
            f'stroke-linejoin="round" d="{d}"/>')


def stripes(uid, x0, x1, y0, y1, w):
    """Listras verticais azul/preto/branco. Sem escudo, nome, numero ou marca."""
    cols = [BLUE, BLK, WHT]
    out, x, i = [], x0, 0
    while x < x1:
        out.append(f'<rect x="{x}" y="{y0}" width="{w+0.6}" height="{y1-y0}" '
                   f'fill="{cols[i % 3]}"/>')
        x += w
        i += 1
    return f'<g clip-path="url(#{uid})" stroke="none">' + "".join(out) + "</g>"


def chain_band(cx, y, half, sw, n=9):
    """Pulseira de corrente: fio continuo + elos por cima (mesma tecnica do
    cinto da Gabizinsky) — vira uma linha clara quando encolhe."""
    out = [f'<path fill="none" stroke="{INK}" stroke-width="{sw*1.5:.1f}" '
           f'stroke-linecap="round" d="M {cx-half} {y} Q {cx} {y+2.5} {cx+half} {y}"/>',
           f'<path fill="none" stroke="{SILVER_SH}" stroke-width="{sw:.1f}" '
           f'stroke-linecap="round" d="M {cx-half} {y} Q {cx} {y+2.5} {cx+half} {y}"/>']
    for i in range(n + 1):
        t = i / n
        x = (1-t)**2*(cx-half) + 2*(1-t)*t*cx + t**2*(cx+half)
        yy = (1-t)**2*y + 2*(1-t)*t*(y+2.5) + t**2*y
        rx, ry, f = (1.5, 2.4, SILVER) if i % 2 == 0 else (2.2, 1.6, SILVER_MID)
        out.append(f'<ellipse cx="{x:.1f}" cy="{yy:.1f}" rx="{rx}" ry="{ry}" '
                   f'fill="{f}" stroke="{INK}" stroke-width="0.8"/>')
    return "".join(out)


def neck_chain(cx, y, half, thread, link, n=15):
    """Colar de corrente FINA. Mesma tecnica de duas camadas: fio continuo
    embaixo, elos por cima. Quando os elos somem, sobra a linha dourada."""
    out = [f'<path fill="none" stroke="{INK}" stroke-width="{thread*2.0:.2f}" '
           f'stroke-linecap="round" d="M {cx-half} {y} Q {cx} {y+half*0.46:.1f} {cx+half} {y}"/>',
           f'<path fill="none" stroke="{GOLD_SH}" stroke-width="{thread:.2f}" '
           f'stroke-linecap="round" d="M {cx-half} {y} Q {cx} {y+half*0.46:.1f} {cx+half} {y}"/>']
    for i in range(n + 1):
        t = i / n
        x = (1-t)**2*(cx-half) + 2*(1-t)*t*cx + t**2*(cx+half)
        yy = (1-t)**2*y + 2*(1-t)*t*(y+half*0.46) + t**2*y
        rx, ry, f = ((link*0.62, link, GOLD) if i % 2 == 0
                     else (link*0.92, link*0.62, GOLD_LIT))
        out.append(f'<ellipse cx="{x:.1f}" cy="{yy:.1f}" rx="{rx:.2f}" ry="{ry:.2f}" '
                   f'fill="{f}" stroke="{INK}" stroke-width="{link*0.34:.2f}"/>')
    return "".join(out)


def pearl_band(cx, y, half, n=8):
    """Perolas: fosca. Sem gradiente — so um ponto de luz seco fora de centro."""
    out = []
    for i in range(n + 1):
        x = cx - half + (2*half) * i / n
        out.append(f'<circle cx="{x:.1f}" cy="{y}" r="3.1" fill="{PEARL}" '
                   f'stroke="{INK}" stroke-width="1.1"/>')
        out.append(f'<circle cx="{x-0.9:.1f}" cy="{y-1.0}" r="0.9" fill="{CREAM}" '
                   f'stroke="none"/>')
    return "".join(out)


# ------------------------------------------------- cabeca (coords locais 256)
HAIR_D = ("M 78 112 C 73 84, 72 46, 96 30 C 113 18, 149 18, 166 34 "
          "C 181 49, 183 84, 178 112 "
          "C 175 92, 168 78, 158 70 C 137 82, 110 84, 92 74 "
          "C 85 82, 80 98, 78 112 Z")


def head(sw, expr=None):
    # A boca sai de expressoes.py quando ha expressao: a geometria e do JOGO
    # (o mesmo gesto no rosto de todo mundo) e a tinta continua sendo desta
    # personagem. Sem expressao, e a de descanso, palavra por palavra.
    boca_svg = boca(expr, sw, INK) if expr else (
        f"""<path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 114 146 C 121 155, 136 155, 143 145"/>""")

    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- orelhas (mais altas e retas que as das personagens) -->
    <ellipse cx="82"  cy="112" rx="8" ry="12" fill="{SKIN}"/>
    <ellipse cx="174" cy="112" rx="8" ry="12" fill="{SKIN}"/>

    <!-- rosto: mandibula MAIS LARGA E MAIS RETA (adaptacao masculina) -->
    <path fill="{SKIN}" d="M 84 100
      C 84 58, 103 44, 128 44
      C 153 44, 172 58, 172 100
      C 172 128, 165 150, 152 161
      C 145 167, 138 169, 128 169
      C 118 169, 111 167, 104 161
      C 91 150, 84 128, 84 100 Z"/>

    <!-- BARBA RALA: mesmo tom do cabelo, opacidade baixa -->
    <!-- maxilar: pelo mais presente -->
    <g stroke="none" fill="{HAIR}" opacity="0.52">
      <path d="M 88 124 C 90 142, 97 155, 107 162 C 115 167, 141 167, 149 162
        C 159 155, 166 142, 168 124 C 167 140, 160 150, 149 155
        C 140 159, 116 159, 107 155 C 96 150, 89 140, 88 124 Z"/>
      <path d="M 108 146 C 115 157, 141 157, 148 146 C 147 162, 139 169, 128 169
        C 117 169, 109 162, 108 146 Z"/>
    </g>
    <!-- bochechas: falhado, bem mais ralo -->
    <g stroke="none" fill="{HAIR}" opacity="0.22">
      <path d="M 93 132 C 97 143, 104 151, 113 156 C 105 155, 96 146, 93 138 Z"/>
      <path d="M 163 132 C 159 143, 152 151, 143 156 C 151 155, 160 146, 163 138 Z"/>
      <path d="M 89 108 C 92 108, 93 110, 93 114 L 93 126 C 90 122, 89 114, 89 108 Z"/>
      <path d="M 167 108 C 164 108, 163 110, 163 114 L 163 126 C 166 122, 167 114, 167 108 Z"/>
    </g>
    <!-- bigode (cheio o bastante para sobreviver) -->
    <path stroke="none" fill="{HAIR}" d="M 112 133 C 117 129, 123 130, 128 133
      C 133 130, 139 129, 144 133 C 140 138, 134 137, 128 136.5
      C 122 137, 116 138, 112 133 Z"/>

    <!-- CABELO old money: risca lateral, laterais curtas, volume no topo -->
    <path fill="{HAIR}" d="{HAIR_D}"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 78 112 C 74 98, 74 84, 76 72
      C 82 80, 86 92, 88 108 C 84 110, 80 112, 78 112 Z"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 178 112 C 182 98, 182 84, 180 72
      C 174 80, 170 92, 168 108 C 172 110, 176 112, 178 112 Z"/>
    <g stroke="none" fill="{HAIR_LIT}">
      <path d="M 98 40 C 110 28, 130 23, 148 26 C 130 29, 112 37, 101 49 Z"/>
      <path d="M 104 60 C 116 44, 136 34, 156 34 C 138 39, 119 50, 108 66 Z"/>
      <path d="M 112 76 C 124 58, 144 47, 164 46 C 146 53, 128 64, 117 80 Z"/>
    </g>

    <!-- BRINCO ponto de luz: um so, no lobo da orelha DIREITA dele — que e a
         esquerda da imagem. Entra depois do cabelo porque a costeleta escura
         desce ate y=112 desse lado e cobriria o lobo. Mesma receita da perola:
         circulo chapado de prata com UM ponto claro seco fora de centro — nao
         e pedra, a pedra do elenco e a do cordao do Junior. O raio e o centro
         sao medidos: da orelha so fica visivel uma folha de pele de 6,3 x 10,6
         unidades, e o maior circulo que cabe inteiro nela tem raio 2,58. -->
    <g>
      <circle cx="79.7" cy="116.4" r="1.95" fill="{SILVER}" stroke="{INK}" stroke-width="{sw*0.22:.2f}"/>
      <circle cx="79.1" cy="115.8" r="0.68" fill="{CREAM}" stroke="none"/>
    </g>

    <!-- PIERCING de prata na sobrancelha DIREITA dele — mesmo lado do brinco,
         terco externo da sobrancelha. A haste vem ANTES da sobrancelha, para o
         pelo cobrir o meio dela; as esferas vem DEPOIS, por cima. Desenhado
         tudo junto, a barra atravessaria o pelo e leria como risco. -->
    <path fill="none" stroke="{SILVER_MID}" stroke-width="{sw*0.58:.2f}"
      stroke-linecap="round" d="M 99.3 86.4 L 100.5 100.2"/>

    <!-- sobrancelhas mais grossas e mais baixas -->
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.55:.2f}" d="M 94 96 C 103 90, 116 90, 123 94"/>
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.55:.2f}" d="M 133 94 C 140 90, 153 90, 162 96"/>

    <!-- esferas do piercing: a de cima na testa, a de baixo no vao entre a
         sobrancelha e a palpebra -->
    <g>
      <circle cx="99.3" cy="85.7" r="2.7" fill="{SILVER}" stroke="{INK}" stroke-width="{sw*0.4:.2f}"/>
      <circle cx="98.4" cy="84.8" r="0.9" fill="{CREAM}" stroke="none"/>
      <circle cx="100.5" cy="100.6" r="2.3" fill="{SILVER}" stroke="{INK}" stroke-width="{sw*0.4:.2f}"/>
    </g>

    <!-- olhos (um pouco menores) -->
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

    <!-- nariz um pouco maior -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 125 124 C 127 134, 133 137, 138 132"/>

    <!-- sorriso -->
    {boca_svg}
  </g>'''


# ------------------------------------------------------------------ avatar
def avatar():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Matheus - avatar">
  <defs>
    <clipPath id="mt-av-clip"><circle cx="128" cy="128" r="120"/></clipPath>
    <clipPath id="mt-av-shirt"><path d="M 20 262 C 24 214, 62 190, 100 182 L 156 182 C 194 190, 232 214, 236 262 Z"/></clipPath>
  </defs>

  <g clip-path="url(#mt-av-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- ombros mais largos (adaptacao masculina) -->
      <path fill="{BLUE}" d="M 20 262 C 24 214, 62 190, 100 182 L 156 182 C 194 190, 232 214, 236 262 Z"/>
      {stripes("mt-av-shirt", 16, 242, 180, 264, 17)}
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 20 262 C 24 214, 62 190, 100 182 L 156 182 C 194 190, 232 214, 236 262"/>

      <!-- pescoco mais largo -->
      <path fill="{SKIN}" d="M 110 148 L 110 192 C 110 206, 146 206, 146 192 L 146 148 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 150 C 122 174, 134 174, 146 152 L 146 150 L 110 150 Z"/>

      <!-- gola redonda com friso claro -->
      <path fill="{SKIN}" d="M 104 183 C 108 212, 148 212, 152 183 Z"/>
      <path fill="none" stroke="{COLLAR}" stroke-width="7" d="M 103 182 C 107 214, 149 214, 153 182"/>
      <path fill="none" stroke="{INK}" stroke-width="4" d="M 103 182 C 107 214, 149 214, 153 182"/>
      {neck_chain(128, 198, 23, 2.8, 2.6)}
    </g>
{head(sw=5)}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
SHIRT_D = ("M 143 210 C 145 190, 158 176, 176 170 L 224 170 "
           "C 242 176, 255 190, 257 210 C 260 262, 262 318, 260 368 "
           "C 236 378, 164 378, 140 368 C 138 318, 140 262, 143 210 Z")
JEANS_D = ("M 148 358 C 142 412, 135 500, 139 604 "
           "C 141 650, 143 678, 144 694 L 185 694 "
           "C 186 660, 188 604, 191 530 C 194 470, 197 430, 200 408 "
           "C 203 430, 206 470, 209 530 C 212 604, 214 660, 215 694 "
           "L 256 694 C 257 678, 259 650, 261 604 "
           "C 259 500, 258 412, 252 358 Z")
SHOE_L = ("M 137 682 L 189 682 L 190 706 C 190 720, 180 728, 162 728 "
          "L 120 728 C 110 728, 108 717, 116 712 L 137 700 Z")
SHOE_R = ("M 263 682 L 211 682 L 210 706 C 210 720, 220 728, 238 728 "
          "L 280 728 C 290 728, 292 717, 284 712 L 263 700 Z")


def hand(mirror=False, dy=-14, ring=False):
    t = ' transform="translate(400 0) scale(-1 1)"' if mirror else ''
    fingers = "".join(
        f'<path stroke="{INK}"  stroke-width="12" d="M {x} {444+dy} L {x} {y+dy}"/>'
        f'<path stroke="{SKIN}" stroke-width="8"  d="M {x} {444+dy} L {x} {y+dy}"/>'
        for x, y in [(113, 470), (123, 479), (133, 483), (143, 475)])
    band = ""
    if ring:
        band = (f'<g stroke="{INK}" stroke-width="1.6">'
                f'<rect x="116.5" y="{459+dy}" width="13" height="8" rx="2" fill="{GOLD}"/>'
                f'<path fill="{GOLD_LIT}" stroke="none" d="M 117.5 {460.5+dy} L 128.5 {460.5+dy} L 128.5 {462+dy} L 117.5 {462+dy} Z"/>'
                f'<path fill="{GOLD_SH}" stroke="none" d="M 117.5 {465+dy} L 128.5 {465+dy} L 128.5 {466.5+dy} L 117.5 {466.5+dy} Z"/>'
                f'</g>')
    return f'''
  <g{t} stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <g fill="none">{fingers}</g>
    <path fill="none" stroke="{INK}"  stroke-width="14" d="M 148 {434+dy} C 154 {442+dy}, 155 {450+dy}, 152 {456+dy}"/>
    <path fill="none" stroke="{SKIN}" stroke-width="10" d="M 148 {434+dy} C 154 {442+dy}, 155 {450+dy}, 152 {456+dy}"/>
    <path fill="{SKIN}" d="M 109 {418+dy} L 145 {418+dy} C 149 {430+dy}, 149 {442+dy}, 146 {450+dy}
      C 138 {455+dy}, 116 {455+dy}, 109 {450+dy} C 106 {442+dy}, 105 {430+dy}, 109 {418+dy} Z"/>
    {band}
  </g>'''


def body(expr=None):
    sl = "M 146 200 C 140.60 218.60, 136.19 238.10, 132.77 258.18"
    sr = "M 254 200 C 259.40 218.60, 263.81 238.10, 267.23 258.18"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="Matheus - corpo inteiro">
  <defs><clipPath id="mt-shirt"><path d="{SHIRT_D}"/></clipPath></defs>

  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- BRACOS -->
    <g fill="none" stroke-linecap="round">
      <path stroke="{INK}"  stroke-width="37" d="M 148 200 C 132 262, 126 334, 130 404"/>
      <path stroke="{SKIN}" stroke-width="29" d="M 148 200 C 132 262, 126 334, 130 404"/>
      <path stroke="{INK}"  stroke-width="37" d="M 252 200 C 268 262, 274 334, 270 404"/>
      <path stroke="{SKIN}" stroke-width="29" d="M 252 200 C 268 262, 274 334, 270 404"/>
      <path stroke="{INK}"  stroke-width="46" d="{sl}"/>
      <path stroke="{BLUE}" stroke-width="38" d="{sl}"/>
      <path stroke="{INK}"  stroke-width="46" d="{sr}"/>
      <path stroke="{BLUE}" stroke-width="38" d="{sr}"/>
      <path stroke="{BLUE_SH}" stroke-width="38" stroke-linecap="butt" d="M 133.4 250 L 132.77 258.18"/>
      <path stroke="{BLUE_SH}" stroke-width="38" stroke-linecap="butt" d="M 266.6 250 L 267.23 258.18"/>
    </g>

    <!-- TENIS PRETOS -->
    <g>
      {halo(SHOE_L)}
      <path fill="{SHOE}" d="{SHOE_L}"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 109 720 C 110 727, 117 728, 122 728 L 162 728 C 179 728, 189 721, 190 710 L 190 720 C 189 728, 179 733, 162 733 L 120 733 C 111 733, 107 727, 109 720 Z"/>
      <path fill="none" stroke="{SHOE_LACE}" stroke-width="4.5" d="M 144 694 L 168 700 M 141 706 L 166 712"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 109 721 C 110 728, 117 733, 122 733 L 162 733 C 180 733, 190 727, 190 718"/>
    </g>
    <g>
      {halo(SHOE_R)}
      <path fill="{SHOE}" d="{SHOE_R}"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 291 720 C 290 727, 283 728, 278 728 L 238 728 C 221 728, 211 721, 210 710 L 210 720 C 211 728, 221 733, 238 733 L 280 733 C 289 733, 293 727, 291 720 Z"/>
      <path fill="none" stroke="{SHOE_LACE}" stroke-width="4.5" d="M 256 694 L 232 700 M 259 706 L 234 712"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 291 721 C 290 728, 283 733, 278 733 L 238 733 C 220 733, 210 727, 210 718"/>
    </g>

    <!-- JEANS AZUL ESCURO -->
    {halo(JEANS_D)}
    <path fill="{JEANS}" d="{JEANS_D}"/>
    <path fill="{JEANS_SH}" stroke="none" d="M 148 358 C 142 412, 141 500, 145 604 C 147 650, 149 678, 150 694 L 162 694 C 159 640, 156 520, 158 430 C 159 392, 161 366, 163 358 Z"/>
    <path fill="{JEANS_LIT}" stroke="none" opacity="0.6" d="M 244 364 C 249 420, 252 500, 251 604 C 250 650, 249 678, 248 694 L 256 694 C 257 678, 259 650, 261 604 C 265 500, 264 400, 258 336 Z"/>
    <g fill="none" stroke="{STITCH}" stroke-width="2.4" stroke-dasharray="6 4">
      <path d="M 164 372 C 162 430, 161 540, 163 690"/>
      <path d="M 236 372 C 238 430, 239 540, 237 690"/>
      <path d="M 200 362 L 200 392"/>
    </g>
    <g fill="none" stroke="{JEANS_SH}" stroke-width="3">
      <path d="M 148 366 C 158 386, 172 392, 182 390"/>
      <path d="M 252 366 C 242 386, 228 392, 218 390"/>
    </g>
    <path fill="{JEANS_SH}" stroke="none" d="M 148 358 L 252 358 C 252 366, 253 372, 253 376 L 147 376 C 147 372, 148 366, 148 358 Z"/>

    <path fill="{JEANS_SH}" stroke="none" d="M 141 366 C 165 378, 235 378, 259 366 C 257 374, 255 380, 253 384 C 231 392, 169 392, 147 384 C 145 380, 143 374, 141 366 Z"/>

    <!-- pescoco -->
    <path fill="{SKIN}" d="M 184 130 L 184 178 C 184 188, 216 188, 216 178 L 216 130 Z"/>

    <!-- CAMISA TRICOLOR (listras verticais; sem escudo/nome/numero/patrocinio) -->
    {halo(SHIRT_D)}
    <path fill="{BLUE}" d="{SHIRT_D}"/>
    {stripes("mt-shirt", 136, 264, 168, 382, 16)}
    <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{SHIRT_D}"/>
    <path fill="{SKIN}" d="M 178 171 C 182 202, 218 202, 222 171 Z"/>
    <path fill="none" stroke="{COLLAR}" stroke-width="7" d="M 177 170 C 181 204, 219 204, 223 170"/>
    <path fill="none" stroke="{INK}" stroke-width="4" d="M 177 170 C 181 204, 219 204, 223 170"/>

    <!-- COLAR: corrente fina de ouro (rima com a alianca; nao entra no
         amontoado de prata dos pulsos) -->
    {neck_chain(200, 182, 21, 2.2, 2.1)}

    <!-- PULSEIRAS -->
    <g stroke-linecap="round">
      {pearl_band(127, 392, 17)}
      {chain_band(127, 378, 17, 3.2)}
      {chain_band(273, 386, 17, 3.2)}
    </g>
  </g>
{hand(ring=True)}
{hand(mirror=True)}

  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">
{head(sw=SW, expr=expr)}
  </g>
</svg>
'''


# ------------------------------------ close do pulso direito (padrao do anel)
def wrist_detail():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Matheus - alianca, perolas e corrente na mao direita">
  <defs><clipPath id="mt-wrist-clip"><circle cx="160" cy="160" r="150"/></clipPath></defs>
  <g clip-path="url(#mt-wrist-clip)">
    <circle cx="160" cy="160" r="150" fill="{WOOD}"/>
    <ellipse cx="160" cy="150" rx="132" ry="128" fill="{WOOD_LIT}"/>

    <g stroke="{INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      <!-- antebraco + manga -->
      <path fill="none" stroke="{INK}"  stroke-width="84" d="M 152 -20 C 150 16, 152 44, 156 66"/>
      <path fill="none" stroke="{SKIN}" stroke-width="74" d="M 152 -20 C 150 16, 152 44, 156 66"/>
      <path fill="none" stroke="{INK}"  stroke-width="96" d="M 152 -30 C 151 -14, 150 -6, 150 2"/>
      <path fill="none" stroke="{BLUE}" stroke-width="86" d="M 152 -30 C 151 -14, 150 -6, 150 2"/>

      <!-- dedos: mindinho, ANELAR, medio, indicador -->
      <g fill="none">
        <path stroke="{INK}"  stroke-width="36" d="M 116 168 C 111 200, 110 224, 113 242"/>
        <path stroke="{SKIN}" stroke-width="28" d="M 116 168 C 111 200, 110 224, 113 242"/>
        <path stroke="{INK}"  stroke-width="38" d="M 147 170 C 145 204, 145 238, 148 262"/>
        <path stroke="{SKIN}" stroke-width="30" d="M 147 170 C 145 204, 145 238, 148 262"/>
        <path stroke="{INK}"  stroke-width="38" d="M 178 170 C 179 206, 181 242, 178 268"/>
        <path stroke="{SKIN}" stroke-width="30" d="M 178 170 C 179 206, 181 242, 178 268"/>
        <path stroke="{INK}"  stroke-width="36" d="M 208 168 C 213 198, 214 226, 209 248"/>
        <path stroke="{SKIN}" stroke-width="28" d="M 208 168 C 213 198, 214 226, 209 248"/>
      </g>
      <path fill="none" stroke="{INK}"  stroke-width="44" d="M 216 120 C 240 132, 256 150, 262 172"/>
      <path fill="none" stroke="{SKIN}" stroke-width="36" d="M 216 120 C 240 132, 256 150, 262 172"/>

      <!-- dorso da mao -->
      <path fill="{SKIN}" d="M 106 108
        C 100 130, 100 158, 106 176
        C 132 190, 190 190, 216 174
        C 222 152, 222 126, 214 106
        C 190 92, 130 92, 106 108 Z"/>
      <g fill="none" stroke="{SKIN_SH}" stroke-width="5">
        <path d="M 122 126 L 120 168"/><path d="M 152 122 L 151 172"/><path d="M 182 122 L 184 172"/>
      </g>

      <!-- ALIANCA de ouro no ANELAR da mao DIREITA -->
      <g>
        <rect x="125" y="198" width="44" height="26" rx="6" fill="{GOLD}"/>
        <path fill="{GOLD_LIT}" stroke="none" d="M 128 202 L 166 202 L 166 208 L 128 208 Z"/>
        <path fill="{GOLD_SH}" stroke="none" d="M 127 216 L 167 216 L 167 221 C 167 223, 165 224, 162 224 L 132 224 C 129 224, 127 223, 127 221 Z"/>
      </g>
    </g>

    <!-- PULSEIRA DE PEROLAS (fosca) e CORRENTE (metalica) no pulso -->
    <g stroke-linecap="round">
      <g transform="translate(0 26) scale(1)">
        {"".join(f'<circle cx="{112+9.5*i}" cy="{66+ (0 if i in (0,8) else (2 if i in (1,7) else (3 if i in (2,6) else 3.5)))}" r="9" fill="{PEARL}" stroke="{INK}" stroke-width="3"/><circle cx="{109+9.5*i}" cy="{63+ (0 if i in (0,8) else 2)}" r="2.6" fill="{CREAM}" stroke="none"/>' for i in range(9))}
      </g>
      <path fill="none" stroke="{INK}" stroke-width="11" stroke-linecap="round" d="M 110 46 Q 160 54 208 46"/>
      <path fill="none" stroke="{SILVER_SH}" stroke-width="7" stroke-linecap="round" d="M 110 46 Q 160 54 208 46"/>
      {"".join((lambda t: (lambda x, y: f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{4.2 if i%2==0 else 6}" ry="{6.4 if i%2==0 else 4.4}" fill="{SILVER if i%2==0 else SILVER_MID}" stroke="{INK}" stroke-width="2"/>')((1-t)**2*110+2*(1-t)*t*160+t**2*208, (1-t)**2*46+2*(1-t)*t*54+t**2*46))(i/10) for i in range(11))}
    </g>
  </g>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{INK}" stroke-width="12"/>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{WARM}" stroke-width="6"/>
</svg>
'''


LIGHT = {HAIR: "#A07A4A", HAIR_LIT: "#BF9A66", HAIR_SH: "#7E5C34", IRIS: "#946C3C"}


def to_light(svg):
    for k, v in LIGHT.items():
        svg = svg.replace(k, v)
    return svg


files = {
    "matheus-avatar.svg": avatar(),
    "matheus-corpo-inteiro.svg": body(),
    "matheus-pulso.svg": wrist_detail(),
    "matheus-alt-cabelo-claro-avatar.svg": to_light(avatar()),
    "matheus-alt-cabelo-claro-corpo-inteiro.svg": to_light(body()),
}
# As expressoes: a mesma figura, outra boca. O cliente troca o arquivo por
# 1,9 s quando algo acontece com aquele jogador (REACOES, em client.js).
for _e in ("feliz", "bravo"):
    files[f"matheus-corpo-inteiro-{_e}.svg"] = body(expr=_e)

for name, content in files.items():
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
print("ok:", ", ".join(files))
