# -*- coding: utf-8 -*-
"""Junior - o homem de preto do elenco do Cacamba (o terceiro homem).

Mesma construcao do elenco: busto em viewBox 256, corpo em 400x800, cabeca em
coordenadas locais 256 escalada 0.88, linha do chao em y=733, moldura de
contorno 10 + ambar 5.

Identidade: preto de cima a baixo, cabelo com as LATERAIS RASPADAS (fade) e
volume ondulado so no alto, barba cheia com linha marcada, e um cristal no
choker — o unico ponto de cor FRIA do elenco inteiro.

O cristal nao inventa cor nenhuma: as tres faixas dele sao cores que a mesa ja
usa nos aneis de assento (#5B8DC9, #C97AB0) e no verde-garrafa do jogo
(#3A7D6E).

Tudo aqui e arte original. A etiqueta do peito e uma marca abstrata desenhada
do zero — nao reproduz logo, marca nem obra de terceiros.

POR QUE gen8 E NAO gen6: o Junior nasceu junto com a Lyly e o Mufasa, em
sessoes paralelas na mesma arvore, e os numeros 6 e 7 ficaram com eles. O que
liga script e personagem e a tabela "Geradores" no README daqui, nao o numero.
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
WARM       = "#F2C14E"
CREAM      = "#F5F1E6"   # a paleta chama isso de "texto claro, solados" —
                         # aqui ele e literalmente o solado
RIM        = "#8C6A45"   # mesma luz de borda quente do elenco

SKIN       = "#F4CFAA"   # pele padrao do elenco
SKIN_SH    = "#E0B189"

# Cabelo: o MAIS ESCURO do elenco (L* 15,5). Matheus 18,6 e Mafra Kitty 24,2.
# Ele pode ser o mais escuro porque encosta em pele dos dois lados — quem
# precisa se separar do fundo do jogo e a camiseta, nao o cabelo.
HAIR       = "#31241C"
HAIR_SH    = "#241A13"
HAIR_LIT   = "#54402F"
IRIS       = "#4A3526"

# Preto QUENTE. A Dri ja e o preto do elenco, e o dela e frio (matiz 258-280).
# O do Junior e de terra (matiz 23) e um degrau mais claro: lado a lado, um le
# como preto azulado e o outro como preto de barro.
TEE        = "#403630"   # L* 23,5
TEE_SH     = "#332B26"
TEE_LIT    = "#4E433B"
CARGO      = "#4E443B"   # L* 29,6 — um degrau acima da camiseta
CARGO_SH   = "#3D352E"
CARGO_LIT  = "#5F544A"
STITCH     = "#C0A075"   # mesmo pesponto quente do elenco

# Tenis de lona escura com solado e biqueira de borracha creme. A lona e mais
# escura que a cargo: o pe se separa da perna que vem por cima.
CANVAS     = "#39332F"   # L* 21,7
CANVAS_SH  = "#2C2724"
RUBBER     = CREAM
RUBBER_SH  = "#D8D2C4"
RUBBER_MID = "#E6E0D0"

# Metal: prata, so prata. (EstereX ouro, Matheus mistura, Mafra quase nada.)
SILVER     = "#C9CDD2"
SILVER_MID = "#A8AEB5"
SILVER_SH  = "#8D949B"

# O cristal — as tres cores vem da propria mesa.
STONE_TOP  = "#C97AB0"   # rosa-violeta: cor do assento 5
STONE_MID  = "#5B8DC9"   # azul: cor do assento 6
STONE_TIP  = "#3A7D6E"   # verde-garrafa do jogo
STONE_LIT  = "#EBE4EE"   # faceta acesa
CORD       = "#241C18"   # cordao do choker

S = 0.88
TX = 200 - 128 * S
# O chao e o mesmo para todo o elenco (y=733). "Mais baixo" quer dizer cabeca
# mais perto do chao: DY desce tronco, bracos e cabeca juntos dentro de um
# translate, e so a cintura da calca e reposicionada a mao. Ver README.
DY = 24
TY = 9.6 + DY
SW = 5 / S


def halo(d, w=9):
    """Luz de borda quente por FORA do contorno. Contorno e fundo do jogo sao a
    mesma cor: sem isso, roupa preta sobre feltro escuro some."""
    return (f'<path fill="none" stroke="{RIM}" stroke-width="{w}" opacity="0.8" '
            f'stroke-linejoin="round" d="{d}"/>')


# ------------------------------------------------------------- o cristal
def crystal(cx, cy, s, sw_eff=3.2):
    """Ponta de cristal no cordao. Desenhada em unidades proprias (~28 de
    largura, ~72 de altura com o cordao) e escalada por `s`.

    Chapado como o resto do elenco: TRES FAIXAS de cor com borda dura, nao um
    degrade. Quando encolhe, as faixas viram um ponto so — e o ponto continua
    sendo a unica cor fria da figura, que e o que precisa sobrar.
    """
    sw = sw_eff / s
    body = "M -13 -15 L 0 -22 L 13 -15 L 13 19 L 0 43 L -13 19 Z"
    return f'''<g transform="translate({cx} {cy}) scale({s})">
    <!-- argola e capa de prata -->
    <circle cx="0" cy="-30" r="5.6" fill="none" stroke="{INK}" stroke-width="{sw*1.5:.2f}"/>
    <circle cx="0" cy="-30" r="5.6" fill="none" stroke="{SILVER}" stroke-width="{sw*0.85:.2f}"/>
    <path fill="{SILVER}" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linejoin="round"
      d="M -15 -14 C -15 -25, 15 -25, 15 -14 C 15 -18, 10 -20, 0 -20 C -10 -20, -15 -18, -15 -14 Z"/>
    <!-- as tres faixas -->
    <path fill="{STONE_TOP}" stroke="none" d="M -13 -15 L 0 -22 L 13 -15 L 13 -1 L -13 -1 Z"/>
    <path fill="{STONE_MID}" stroke="none" d="M -13 -1 L 13 -1 L 13 15 L -13 15 Z"/>
    <path fill="{STONE_TIP}" stroke="none" d="M -13 15 L 13 15 L 13 19 L 0 43 L -13 19 Z"/>
    <!-- faceta acesa: a mesma que corre nas tres faixas, so mais clara -->
    <path fill="{STONE_LIT}" stroke="none" opacity="0.34" d="M -13 -15 L -5 -19 L -5 25 L -13 19 Z"/>
    <path fill="{INK}" stroke="none" opacity="0.20" d="M 6 -18 L 13 -15 L 13 19 L 6 30 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linejoin="round" d="{body}"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw*0.55:.2f}" opacity="0.55" d="M -5 -19 L -5 25 M 6 -18 L 6 30"/>
  </g>'''


def cord(cx, y, half, sw, sag=0.30):
    """Cordao do choker: fio preto fosco, sem elo nenhum. E o contrario da
    corrente — quando encolhe ele ja era so uma linha."""
    return (f'<path fill="none" stroke="{INK}" stroke-width="{sw*1.9:.2f}" stroke-linecap="round" '
            f'd="M {cx-half} {y} Q {cx} {y+half*sag:.1f} {cx+half} {y}"/>'
            f'<path fill="none" stroke="{CORD}" stroke-width="{sw:.2f}" stroke-linecap="round" '
            f'd="M {cx-half} {y} Q {cx} {y+half*sag:.1f} {cx+half} {y}"/>'
            f'<circle cx="{cx-half:.1f}" cy="{y}" r="{sw*0.9:.2f}" fill="{CORD}" stroke="{INK}" stroke-width="{sw*0.4:.2f}"/>'
            f'<circle cx="{cx+half:.1f}" cy="{y}" r="{sw*0.9:.2f}" fill="{CORD}" stroke="{INK}" stroke-width="{sw*0.4:.2f}"/>')


def chain(cx, y, half, thread, link, n=15):
    """Corrente de prata: duas camadas do elenco — fio continuo embaixo, elos
    por cima. Some o elo, sobra a linha; o objeto nunca desaparece."""
    out = [f'<path fill="none" stroke="{INK}" stroke-width="{thread*2.0:.2f}" '
           f'stroke-linecap="round" d="M {cx-half} {y} Q {cx} {y+half*0.52:.1f} {cx+half} {y}"/>',
           f'<path fill="none" stroke="{SILVER_SH}" stroke-width="{thread:.2f}" '
           f'stroke-linecap="round" d="M {cx-half} {y} Q {cx} {y+half*0.52:.1f} {cx+half} {y}"/>']
    for i in range(n + 1):
        t = i / n
        x = (1-t)**2*(cx-half) + 2*(1-t)*t*cx + t**2*(cx+half)
        yy = (1-t)**2*y + 2*(1-t)*t*(y+half*0.52) + t**2*y
        rx, ry, f = ((link*0.62, link, SILVER) if i % 2 == 0
                     else (link*0.92, link*0.62, SILVER_MID))
        out.append(f'<ellipse cx="{x:.1f}" cy="{yy:.1f}" rx="{rx:.2f}" ry="{ry:.2f}" '
                   f'fill="{f}" stroke="{INK}" stroke-width="{link*0.34:.2f}"/>')
    return "".join(out)


def medallion(cx, cy, r, sw):
    """Pingente redondo da corrente. Rima com a etiqueta do peito: as duas sao
    a mesma marca abstrata — um circulo com um ponto —, uma em metal e outra
    em tecido. Nao e logo de ninguem."""
    return (f'<circle cx="{cx}" cy="{cy}" r="{r:.2f}" fill="{SILVER}" stroke="{INK}" stroke-width="{sw:.2f}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.62:.2f}" fill="none" stroke="{SILVER_SH}" stroke-width="{sw*0.75:.2f}"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r*0.22:.2f}" fill="{SILVER_SH}" stroke="none"/>'
            f'<path fill="{CREAM}" stroke="none" opacity="0.5" d="M {cx-r*0.62:.1f} {cy-r*0.30:.1f} '
            f'A {r*0.7:.1f} {r*0.7:.1f} 0 0 1 {cx-r*0.18:.1f} {cy-r*0.66:.1f} '
            f'L {cx-r*0.10:.1f} {cy-r*0.50:.1f} A {r*0.55:.1f} {r*0.55:.1f} 0 0 0 {cx-r*0.48:.1f} {cy-r*0.22:.1f} Z"/>')


def patch(cx, cy, s, sw_eff=2.6):
    """Etiqueta quadrada costurada no peito esquerdo. Marca ABSTRATA original:
    quadrado, circulo, ponto. E o mesmo desenho do medalhao."""
    sw = sw_eff / s
    return f'''<g transform="translate({cx} {cy}) scale({s})" stroke-linejoin="round">
    <rect x="-14" y="-14" width="28" height="28" rx="2.5" fill="{CREAM}" stroke="{INK}" stroke-width="{sw:.2f}"/>
    <rect x="-10.5" y="-10.5" width="21" height="21" rx="1.5" fill="none" stroke="{INK}" stroke-width="{sw*0.5:.2f}" opacity="0.45"/>
    <circle cx="0" cy="0" r="6.6" fill="none" stroke="{INK}" stroke-width="{sw*0.72:.2f}"/>
    <circle cx="0" cy="0" r="2.1" fill="{INK}" stroke="none"/>
  </g>'''


# ------------------------------------------------- cabeca (coords locais 256)
# O FADE e a decisao de silhueta. Matheus tem laterais cheias descendo ate a
# orelha; Mafra Kitty tem franja na testa; este tem as laterais na pele e a
# massa toda no alto. A parte mais larga do cabelo dele fica na coroa, nao nas
# tempas — e o unico do elenco assim.
HAIR_D = ("M 86 92 "
          "C 81 74, 78 54, 92 38 "
          "C 99 27, 110 18, 122 20 "
          "C 131 11, 147 10, 155 21 "
          "C 165 17, 176 26, 178 42 "
          "C 181 58, 180 76, 175 92 "
          "C 173 80, 169 71, 162 66 "
          "C 152 74, 136 77, 122 74 "
          "C 110 71, 98 74, 90 82 "
          "C 88 85, 87 89, 86 92 Z")


def head(sw, expr=None):
    # A boca sai de expressoes.py quando ha expressao: a geometria e do JOGO
    # (o mesmo gesto no rosto de todo mundo) e a tinta continua sendo desta
    # personagem. Sem expressao, e a de descanso, palavra por palavra.
    boca_svg = boca(expr, sw, INK) if expr else (
        f"""<path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 117 147 C 123 152, 134 152, 140 146"/>""")

    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- orelhas: a esquerda dele leva as duas argolas -->
    <ellipse cx="82"  cy="112" rx="8" ry="12" fill="{SKIN}"/>
    <ellipse cx="174" cy="112" rx="8" ry="12" fill="{SKIN}"/>

    <!-- rosto: mandibula masculina, queixo um pouco mais estreito que o do
         Matheus — a barba cheia ja da o peso ali embaixo -->
    <path fill="{SKIN}" d="M 85 100
      C 85 57, 104 43, 128 43
      C 152 43, 171 57, 171 100
      C 171 129, 163 151, 150 162
      C 143 168, 136 170, 128 170
      C 120 170, 113 168, 106 162
      C 93 151, 85 129, 85 100 Z"/>

    <!-- FADE: as laterais nao sao pele lisa, sao pelo rapado. Duas passadas —
         uma fraca larga, uma mais forte colada na borda do cabelo. E o que faz
         a lateral ler como raspada em vez de careca. -->
    <g stroke="none" fill="{HAIR}">
      <path opacity="0.30" d="M 86 92 C 88 104, 90 116, 95 128
        C 90 122, 86 110, 85 98 Z"/>
      <path opacity="0.30" d="M 175 92 C 173 104, 171 116, 166 128
        C 171 122, 175 110, 176 98 Z"/>
      <path opacity="0.54" d="M 86 92 C 90 84, 96 79, 104 76
        C 100 86, 97 98, 96 110 C 91 106, 87 99, 86 92 Z"/>
      <path opacity="0.54" d="M 175 92 C 171 84, 165 79, 157 76
        C 161 86, 164 98, 165 110 C 170 106, 174 99, 175 92 Z"/>
      <!-- costeletas: e por elas que o fade encontra a barba -->
      <path opacity="0.68" d="M 90 103 C 95 105, 98 112, 98 124 L 92 121 Z"/>
      <path opacity="0.68" d="M 171 103 C 166 105, 163 112, 163 124 L 169 121 Z"/>
    </g>

    <!-- BARBA CHEIA, com a linha da bochecha marcada. A do Matheus e rala e
         sem borda; esta tem borda. -->
    <path stroke="none" fill="{HAIR}" opacity="0.72" d="M 89 121
      C 90 138, 96 152, 106 162
      C 113 168, 120 170, 128 170
      C 136 170, 143 168, 150 162
      C 161 152, 167 138, 168 121
      C 164 132, 158 139, 150 143
      C 146 145, 144 146, 143 149
      C 140 153, 134 155, 128 155
      C 122 155, 116 153, 114 147
      C 113 146, 111 145, 107 143
      C 99 139, 92 132, 89 121 Z"/>
    <path stroke="none" fill="{HAIR_SH}" opacity="0.34" d="M 104 156
      C 112 163, 144 163, 152 156
      C 148 166, 139 170, 128 170 C 117 170, 108 166, 104 156 Z"/>
    <!-- bigode cheio, encostando na barba nas pontas -->
    <path stroke="none" fill="{HAIR}" opacity="0.78" d="M 106 134
      C 114 128, 123 130, 128 134 C 133 130, 142 128, 150 134
      C 146 141, 135 139, 128 138.5 C 121 139, 110 141, 106 134 Z"/>

    <!-- ARGOLAS: duas, pequenas, so na orelha esquerda dele. Detalhe de
         tamanho grande — nao e sinal a 48 px. -->
    <g fill="none">
      <circle cx="177" cy="118" r="4.0" stroke="{INK}" stroke-width="{sw*0.85:.2f}"/>
      <circle cx="177" cy="118" r="4.0" stroke="{SILVER}" stroke-width="{sw*0.45:.2f}"/>
      <circle cx="177" cy="128" r="4.6" stroke="{INK}" stroke-width="{sw*0.85:.2f}"/>
      <circle cx="177" cy="128" r="4.6" stroke="{SILVER}" stroke-width="{sw*0.45:.2f}"/>
    </g>

    <!-- CABELO: cap alto e ondulado, laterais raspadas. Halo por fora — e o
         cabelo mais escuro do elenco. -->
    {halo(HAIR_D, w=sw*1.45)}
    <path fill="{HAIR}" d="{HAIR_D}"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 86 92 C 83 80, 82 66, 84 54
      C 89 64, 92 78, 94 90 C 90 90, 88 91, 86 92 Z"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 175 92 C 178 80, 179 66, 177 54
      C 172 64, 169 78, 167 90 C 171 90, 173 91, 175 92 Z"/>
    <!-- ondas do topo: variacao longa da silhueta, sem contorno interno -->
    <g stroke="none" fill="{HAIR_LIT}">
      <path d="M 95 60 C 101 46, 113 34, 128 28 C 116 39, 106 51, 101 66 Z"/>
      <path d="M 104 44 C 113 33, 127 24, 142 22 C 129 28, 117 37, 110 48 Z"/>
      <path d="M 121 27 C 132 20, 146 17, 157 21 C 145 23, 133 27, 126 32 Z"/>
      <path d="M 158 28 C 167 34, 173 44, 176 56 C 171 46, 165 38, 155 33 Z"/>
      <path d="M 90 80 C 93 68, 98 58, 106 50 C 100 62, 96 72, 94 84 Z"/>
    </g>

    <!-- sobrancelhas: grossas, retas e baixas. Sao a marca do rosto dele
         junto com a barba. -->
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.62:.2f}" d="M 93 95 C 103 89, 117 89, 124 93"/>
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.62:.2f}" d="M 132 93 C 139 89, 153 89, 163 95"/>

    <!-- olhos -->
    <g>
      <ellipse cx="108" cy="116" rx="11" ry="11" fill="{CREAM}"/>
      <circle cx="109" cy="117" r="7.6" fill="{IRIS}" stroke="none"/>
      <circle cx="109" cy="117" r="3.4" fill="{INK}" stroke="none"/>
      <circle cx="106" cy="113.5" r="2.5" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.3:.2f}" d="M 98 111 C 103 104, 114 104, 119 111"/>
    </g>
    <g>
      <ellipse cx="150" cy="116" rx="11" ry="11" fill="{CREAM}"/>
      <circle cx="149" cy="117" r="7.6" fill="{IRIS}" stroke="none"/>
      <circle cx="149" cy="117" r="3.4" fill="{INK}" stroke="none"/>
      <circle cx="146" cy="113.5" r="2.5" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.3:.2f}" d="M 139 111 C 144 104, 155 104, 160 111"/>
    </g>

    <!-- nariz -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 125 125 C 127 135, 133 138, 138 133"/>

    <!-- boca: sorriso curto e quase reto. Nas duas fotos ele esta serio; o
         meio-termo mantem o elenco coeso sem inventar um sujeito alegre. -->
    {boca_svg}
  </g>'''


# ------------------------------------------------------------------ avatar
def avatar(tee=None, tee_sh=None, tee_lit=None, name="Junior"):
    tee = tee or TEE
    tee_sh = tee_sh or TEE_SH
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="{name} - avatar">
  <defs>
    <clipPath id="jr-av-clip"><circle cx="128" cy="128" r="120"/></clipPath>
  </defs>

  <g clip-path="url(#jr-av-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- camiseta preta larga, ombro caido -->
      <path fill="{tee}" d="M 14 262 C 18 210, 58 186, 100 178 L 156 178 C 198 186, 238 210, 242 262 Z"/>
      <path fill="{tee_sh}" stroke="none" d="M 14 262 C 18 210, 44 192, 64 185 C 50 204, 42 232, 40 262 Z"/>
      <path fill="{tee_lit or TEE_LIT}" stroke="none" opacity="0.8" d="M 192 185 C 212 192, 238 210, 242 262 L 218 262 C 216 230, 208 204, 192 185 Z"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 14 262 C 18 210, 58 186, 100 178 L 156 178 C 198 186, 238 210, 242 262"/>

      <!-- pescoco -->
      <path fill="{SKIN}" d="M 110 148 L 110 188 C 110 202, 146 202, 146 188 L 146 148 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 150 C 122 174, 134 174, 146 152 L 146 150 L 110 150 Z"/>

      <!-- gola redonda, com friso de costura -->
      <path fill="{SKIN}" d="M 104 179 C 108 208, 148 208, 152 179 Z"/>
      <path fill="none" stroke="{tee_sh}" stroke-width="7" d="M 103 178 C 107 210, 149 210, 153 178"/>
      <path fill="none" stroke="{INK}" stroke-width="4" d="M 103 178 C 107 210, 149 210, 153 178"/>

      <!-- CORRENTE de prata com medalhao, por cima da camiseta -->
      {chain(128, 206, 25, 2.9, 2.7)}
      {medallion(128, 232, 11, 3.2)}
    </g>

    <!-- CHOKER + CRISTAL. No busto ele e ~30% maior que a escala fiel, do
         mesmo jeito que o sinal da Gabizinsky: e o detalhe que precisa
         sobreviver a 48 px. -->
    <g>
      {cord(128, 166, 20, 3.4)}
      {crystal(128, 186, 0.375, sw_eff=2.6)}
    </g>

{head(sw=5)}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
# Camiseta OVERSIZED: ombro caido, corpo reto e barra baixa, cobrindo o quadril.
# E ela que esconde as maos.
TEE_D = ("M 137 228 C 139 202, 154 185, 177 179 L 223 179 "
         "C 246 185, 261 202, 263 228 "
         "C 266 288, 268 350, 266 404 "
         "C 240 416, 160 416, 134 404 "
         "C 132 350, 134 288, 137 228 Z")
CARGO_D = ("M 142 378 C 135 432, 129 522, 133 620 "
           "C 135 664, 137 686, 138 702 L 188 702 "
           "C 189 664, 191 610, 194 540 C 197 482, 199 448, 200 428 "
           "C 201 448, 203 482, 206 540 C 209 610, 211 664, 212 702 "
           "L 262 702 C 263 686, 265 664, 267 620 "
           "C 271 522, 265 432, 258 378 Z")
# Tenis: lona escura, biqueira e solado creme. Desenhado uma vez e espelhado.
SHOE_UP = ("M 138 690 L 191 690 L 192 706 C 192 719, 182 726, 163 726 "
           "L 121 726 C 111 726, 108 716, 117 711 L 138 699 Z")
SHOE_TOE = ("M 146 697 C 151 707, 152 718, 150 726 L 121 726 "
            "C 111 726, 108 716, 117 711 Z")
SHOE_SOLE = ("M 117 711 C 108 716, 111 726, 121 726 L 163 726 "
             "C 182 726, 192 719, 192 706 L 194 706 "
             "C 194 723, 183 733, 163 733 L 120 733 "
             "C 105 733, 104 715, 114 708 Z")


def shoe(mirror=False):
    t = ' transform="translate(400 0) scale(-1 1)"' if mirror else ''
    return f'''
  <g{t} stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path fill="{CANVAS}" d="{SHOE_UP}"/>
    <path fill="{CANVAS_SH}" stroke="none" d="M 165 690 L 191 690 L 192 706 C 192 717, 184 724, 170 726 C 174 714, 172 700, 165 690 Z"/>
    <path fill="{RUBBER}" d="{SHOE_TOE}"/>
    <path fill="{RUBBER}" d="{SHOE_SOLE}"/>
    <path fill="{RUBBER_SH}" stroke="none" d="M 114 708 C 104 715, 105 733, 120 733 L 132 733 C 122 730, 119 718, 124 709 Z"/>
    <path fill="none" stroke="{RUBBER_SH}" stroke-width="3" d="M 194 712 C 191 725, 181 730, 163 730 L 121 730"/>
    <!-- cadarco: dois cruzamentos, so o que sobrevive ao tamanho -->
    <g fill="none" stroke="{RUBBER_MID}" stroke-width="4" stroke-linecap="round">
      <path d="M 158 698 L 176 706"/>
      <path d="M 158 710 L 176 702"/>
      <path d="M 160 716 L 178 712"/>
    </g>
  </g>'''


def body(tee=None, tee_sh=None, tee_lit=None, cargo=None, cargo_sh=None,
         cargo_lit=None, name="Junior", expr=None):
    tee = tee or TEE
    tee_sh = tee_sh or TEE_SH
    tee_lit = tee_lit or TEE_LIT
    cargo = cargo or CARGO
    cargo_sh = cargo_sh or CARGO_SH
    cargo_lit = cargo_lit or CARGO_LIT
    # manga larga: acompanha o comeco do braco
    sl = "M 148 212 C 142 234, 138 256, 136 278"
    sr = "M 252 212 C 258 234, 262 256, 264 278"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="{name} - corpo inteiro">
  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- BRACOS. Os antebracos viram para DENTRO e terminam atras da barra da
         camiseta: as duas maos estao nos bolsos. E o unico do elenco assim. -->
    <g fill="none" stroke-linecap="round" transform="translate(0 {DY})">
      <path stroke="{INK}"  stroke-width="37" d="M 150 213 C 134 272, 134 340, 156 392"/>
      <path stroke="{SKIN}" stroke-width="29" d="M 150 213 C 134 272, 134 340, 156 392"/>
      <path stroke="{INK}"  stroke-width="37" d="M 250 213 C 266 272, 266 340, 244 392"/>
      <path stroke="{SKIN}" stroke-width="29" d="M 250 213 C 266 272, 266 340, 244 392"/>
      <!-- mangas: oversized, barra reta e larga -->
      <path stroke="{INK}" stroke-width="54" d="{sl}"/>
      <path stroke="{tee}" stroke-width="46" d="{sl}"/>
      <path stroke="{INK}" stroke-width="54" d="{sr}"/>
      <path stroke="{tee}" stroke-width="46" d="{sr}"/>
      <path stroke="{tee_sh}" stroke-width="46" stroke-linecap="butt" d="M 136.8 266 L 136 278"/>
      <path stroke="{tee_sh}" stroke-width="46" stroke-linecap="butt" d="M 263.2 266 L 264 278"/>
      <path stroke="{INK}" stroke-width="4" stroke-linecap="round" d="M 114 277 C 125 284, 148 284, 159 275"/>
      <path stroke="{INK}" stroke-width="4" stroke-linecap="round" d="M 286 277 C 275 284, 252 284, 241 275"/>
    </g>

    <!-- TENIS -->
    {shoe()}
    {shoe(mirror=True)}

    <!-- CARGO preta, perna larga, barra empilhando no tenis -->
    {halo(CARGO_D)}
    <path fill="{cargo}" d="{CARGO_D}"/>
    <path fill="{cargo_sh}" stroke="none" d="M 142 378 C 135 432, 132 522, 136 620 C 138 664, 140 686, 141 702 L 154 702 C 151 648, 148 528, 150 448 C 151 410, 153 386, 155 378 Z"/>
    <path fill="{cargo_lit}" stroke="none" opacity="0.5" d="M 248 384 C 254 438, 257 522, 256 620 C 255 664, 254 686, 253 702 L 262 702 C 263 686, 265 664, 267 620 C 271 522, 265 420, 259 358 Z"/>

    <!-- BOLSO CARGO na coxa esquerda de quem olha. E o que faz a calca ler
         como cargo e nao como jeans preta. -->
    <g>
      <path fill="{cargo_lit}" stroke="{INK}" stroke-width="4" d="M 148 472 L 187 470 L 189 534 L 147 536 Z"/>
      <path fill="{cargo}" stroke="{INK}" stroke-width="4" d="M 145 466 L 190 464 L 191 490 L 146 492 Z"/>
      <circle cx="168" cy="500" r="3.6" fill="{cargo_sh}" stroke="{INK}" stroke-width="2.4"/>
      <g fill="none" stroke="{STITCH}" stroke-width="2.2" stroke-dasharray="5 4">
        <path d="M 150 476 L 185 474"/>
        <path d="M 149 528 L 187 526"/>
      </g>
    </g>
    <!-- bolso menor do outro lado: so a aba, para nao virar par identico -->
    <path fill="{cargo}" stroke="{INK}" stroke-width="4" d="M 213 478 L 252 480 L 251 502 L 212 500 Z"/>

    <g fill="none" stroke="{STITCH}" stroke-width="2.4" stroke-dasharray="6 4">
      <path d="M 160 392 C 158 448, 157 556, 159 698"/>
      <path d="M 240 392 C 242 448, 243 556, 241 698"/>
    </g>
    <!-- barra empilhando: duas dobras horizontais em cada perna -->
    <g fill="none" stroke="{cargo_sh}" stroke-width="4">
      <path d="M 136 668 C 152 676, 172 676, 187 670"/>
      <path d="M 137 686 C 153 693, 172 693, 188 688"/>
      <path d="M 264 668 C 248 676, 228 676, 213 670"/>
      <path d="M 263 686 C 247 693, 228 693, 212 688"/>
    </g>

    <!-- TRONCO: pescoco, camiseta, etiqueta e gola descem juntos -->
    <g transform="translate(0 {DY})">
    <path fill="{SKIN}" d="M 184 141 L 184 187 C 184 197, 216 197, 216 187 L 216 141 Z"/>

    <!-- CAMISETA PRETA. Halo obrigatorio: preto sobre feltro preto some. -->
    {halo(TEE_D)}
    <path fill="{tee}" d="{TEE_D}"/>
    <path fill="{tee_sh}" stroke="none" opacity="0.8" d="M 137 228 C 139 202, 154 185, 177 179 C 165 200, 157 250, 156 396 C 147 400, 140 402, 134 404 C 132 350, 134 288, 137 228 Z"/>
    <path fill="{tee_lit}" stroke="none" opacity="0.75" d="M 223 179 C 246 185, 261 202, 263 228 C 265 268, 267 340, 266 404 L 252 402 C 253 312, 248 224, 238 188 Z"/>
    <!-- as duas maos empurram o tecido por dentro: a barra tenta ali -->
    <g fill="none" stroke="{tee_sh}" stroke-width="4" opacity="0.9">
      <path d="M 152 356 C 158 372, 160 390, 158 406"/>
      <path d="M 248 356 C 242 372, 240 390, 242 406"/>
      <path d="M 142 380 C 150 388, 154 396, 156 408"/>
      <path d="M 258 380 C 250 388, 246 396, 244 408"/>
    </g>
    <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{TEE_D}"/>

    <!-- ETIQUETA no peito esquerdo dele -->
    {patch(238, 262, 0.92)}

    <path fill="{SKIN}" d="M 178 180 C 182 211, 218 211, 222 180 Z"/>
    <path fill="none" stroke="{tee_sh}" stroke-width="7" d="M 177 179 C 181 213, 219 213, 223 179"/>
    <path fill="none" stroke="{INK}" stroke-width="4" d="M 177 179 C 181 213, 219 213, 223 179"/>

    <!-- CORRENTE + medalhao por cima da camiseta -->
    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      {chain(200, 206, 21, 2.3, 2.2)}
      {medallion(200, 230, 8.4, 2.6)}
    </g>

    <!-- CHOKER + CRISTAL, no tamanho fiel -->
    {cord(200, 164, 16, 2.6)}
    {crystal(200, 179, 0.29, sw_eff=2.4)}
    </g>
  </g>

  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">
{head(sw=SW, expr=expr)}
  </g>
</svg>
'''


# ---------------------------------------- close do cristal (padrao do elenco)
def crystal_detail():
    """Mesmo papel do `matheus-pulso.svg`, do `gabizinsky-anel.svg` e do
    `mafra-kitty-estampa.svg`: o detalhe que some no tamanho de uso, mostrado
    no tamanho em que ele existe de verdade. Aqui entram os dois metais do
    personagem — o cordao com o cristal e a corrente com o medalhao."""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Junior - o cristal do choker e o medalhao da corrente">
  <defs><clipPath id="jr-cr-clip"><circle cx="160" cy="160" r="150"/></clipPath></defs>
  <g clip-path="url(#jr-cr-clip)">
    <circle cx="160" cy="160" r="150" fill="{WOOD}"/>
    <ellipse cx="160" cy="150" rx="132" ry="128" fill="{WOOD_LIT}"/>

    <!-- pele do peito e a gola da camiseta preta entrando por baixo -->
    <rect x="10" y="10" width="300" height="300" fill="{SKIN}"/>
    <path fill="{SKIN_SH}" stroke="none" opacity="0.55" d="M 10 10 L 78 10 C 62 90, 60 210, 74 310 L 10 310 Z"/>
    <path fill="{TEE}" stroke="{INK}" stroke-width="6" d="M 10 268 C 60 236, 100 232, 160 244
      C 220 256, 268 250, 310 232 L 310 310 L 10 310 Z"/>
    <path fill="{TEE_LIT}" stroke="none" opacity="0.6" d="M 250 246 C 272 244, 292 240, 310 232 L 310 310 L 262 310 C 262 288, 258 264, 250 246 Z"/>

    <g stroke="{INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
      {chain(160, 236, 96, 6.0, 5.6, n=19)}
      {medallion(160, 286, 26, 6.0)}
    </g>

    {cord(160, 96, 104, 8.0, sag=0.16)}
    {crystal(160, 146, 1.55, sw_eff=6.0)}
  </g>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{INK}" stroke-width="12"/>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{WARM}" stroke-width="6"/>
</svg>
'''


# --------------------------------------------------------------- alternativa
# "Quanto preto e preto" e a decisao dele que mais pode mudar depois — como a
# jeans do Mafra Kitty. Fica salva uma versao lavada, um degrau acima.
# Diferente da alternativa do Mafra, esta muda a CAMISETA, que aparece no
# busto: por isso ela tem avatar alternativo tambem.
WASHED = dict(tee="#4E443B", tee_sh="#3E352F", tee_lit="#5E5349",
              cargo="#5D5148", cargo_sh="#4A4038", cargo_lit="#6E6157")


files = {
    "junior-avatar.svg": avatar(),
    "junior-corpo-inteiro.svg": body(),
    "junior-cristal.svg": crystal_detail(),
    "junior-alt-preto-lavado-avatar.svg": avatar(
        tee=WASHED["tee"], tee_sh=WASHED["tee_sh"], tee_lit=WASHED["tee_lit"],
        name="Junior (preto lavado)"),
    "junior-alt-preto-lavado-corpo-inteiro.svg": body(
        name="Junior (preto lavado)", **WASHED),
}
# As expressoes: a mesma figura, outra boca. O cliente troca o arquivo por
# 1,9 s quando algo acontece com aquele jogador (REACOES, em client.js).
for _e in ("feliz", "bravo"):
    files[f"junior-corpo-inteiro-{_e}.svg"] = body(expr=_e)

for fname, content in files.items():
    with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
        f.write(content)
print("ok:", ", ".join(files))
