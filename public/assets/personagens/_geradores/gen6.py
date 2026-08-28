# -*- coding: utf-8 -*-
"""Lyly - sexta personagem do jogo Cacamba (quarta mulher do elenco).

Mesma construcao do elenco: busto em viewBox 256, corpo em 400x800, cabeca em
coordenadas locais 256 escalada 0.88, linha do chao em y=733, moldura de
contorno 10 + ambar 5.

Identidade: cabelo ROSA CLARO sobre vestido longo escuro de florzinhas. E a
inversao exata da Gabizinsky, a outra personagem de cabelo vermelho-rosa: la o
cabelo e escuro sobre torso claro, aqui o cabelo e claro sobre torso escuro.
Laco escuro preso no alto do cabelo e o segundo sinal, e o vestido longo e a
unica silhueta em coluna do elenco.

Pele: a mais clara do elenco (mulher branca, como pedido na descricao).
Estatura: a mesma da Dri (686 unidades) - tambem pedida na descricao.
PIERCING: bolinha de prata no canto da boca, lado ESQUERDO dela (= direita de
quem olha), como na foto de referencia.

Arte original. Nao reproduz personagem, marca nem obra de terceiros.
"""
import math
import os
import sys

# A boca das expressoes e compartilhada: ver expressoes.py, ao lado.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from expressoes import boca
import random

# Os SVGs ficam um nivel acima: este diretorio guarda so os geradores.
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ------------------------------------------------------- paleta do jogo
INK        = "#2A1B12"   # contorno = fundo escuro do jogo
WOOD       = "#7A4A2B"
WOOD_LIT   = "#8C5733"
WARM       = "#F2C14E"   # ambar do jogo
CREAM      = "#F5F1E6"
RIM        = "#8C6A45"   # mesma luz de borda quente do elenco

# Pele mais clara e mais rosada que a do resto do elenco (#F4CFAA). E a unica
# alteracao de pele desde a EstereX, que foi para o outro lado (mais dourada).
SKIN       = "#F9D8C4"
SKIN_SH    = "#E7BCA4"
BLUSH      = "#E58A8A"

# ---- cabelo ROSA: claro. A cereja da Gabizinsky e #C6335A (L* 44); este e
# L* 66, 22 pontos acima. A 48px uma le como mancha escura quente e a outra
# como mancha clara - e essa distancia de VALOR que separa as duas.
HAIR       = "#EF7F8D"
HAIR_LIT   = "#F8A9AE"
HAIR_SH    = "#C9566E"
BROW       = "#6B4A46"   # sobrancelha nao acompanha o rosa (regra da Gabizinsky)

# ---- vestido longo de florzinhas. Ameixa escuro: L* 25, dois degraus acima
# do preto mais claro da Dri (jaqueta, L* 21) e bem acima do feltro (L* 13).
DRESS      = "#4A3547"
DRESS_SH   = "#382839"
DRESS_LIT  = "#5E4459"
BOW        = "#33242F"   # o laco e o unico preto real dela
BOW_LIT    = "#4C3946"

# ---- as florzinhas da estampa: so a paleta do jogo
BLOOM      = "#F5F1E6"   # creme
BLOOM_WARM = "#F2C14E"   # miolo ambar
BLOOM_ROSE = "#E58AA0"   # algumas rosadas, rimando com o cabelo
LEAF       = "#6E7A5A"   # verde acinzentado, so como pontinho

# ---- prata: uma peca so, a flor do colar (ver divisao de metais no README)
SILVER     = "#C9CDD2"
SILVER_LIT = "#EDEFF2"
SILVER_SH  = "#8D949B"

IRIS       = "#3E2C22"   # castanho escuro
LINER      = "#241C22"   # delineado marcado, com ponta
LIP        = "#5E2433"   # vinho: o batom mais escuro do elenco
LIP_LIT    = "#7A3446"

SHOE       = "#3D2C3B"   # o sapato e a sombra do vestido
SHOE_SH    = "#2E212D"
SHOE_SOLE  = "#C9C3BC"

S = 0.88
TX = 200 - 128 * S
# O chao e o mesmo do elenco (y=733). DY sobe tronco, bracos, maos e cabeca
# juntos: as pernas e que esticam. -8 poe o topo do cabelo na mesma altura da
# Dri (686 unidades do chao ao fio de cima). Ver README.
DY = -3
TY = (132 - 108 * S) + DY
SW = 5 / S


def halo(d, w=9):
    """Luz de borda quente por FORA do contorno: peca escura sobre fundo
    escuro sumiria, porque o contorno e da cor do fundo do jogo."""
    return (f'<path fill="none" stroke="{RIM}" stroke-width="{w}" opacity="0.8" '
            f'stroke-linejoin="round" d="{d}"/>')


# ------------------------------------------------------------------- flor
def flower(cx, cy, r, petal=BLOOM, core=BLOOM_WARM, rot=0.0, n=5):
    """Florzinha de cinco petalas. E a MESMA flor em tres escalas: pontinho na
    estampa, media na barra do vestido, grande no colar. Uma so forma repetida
    e o que faz a estampa e a joia lerem como a mesma personagem."""
    p = []
    for i in range(n):
        a = rot + i * (360.0 / n)
        rad = math.radians(a - 90)
        px, py = cx + 0.58 * r * math.cos(rad), cy + 0.58 * r * math.sin(rad)
        p.append(f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="{0.44*r:.2f}" '
                 f'ry="{0.56*r:.2f}" transform="rotate({a:.0f} {px:.1f} {py:.1f})" '
                 f'fill="{petal}"/>')
    p.append(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{0.28*r:.2f}" fill="{core}"/>')
    return "".join(p)


# ------------------------------------------------- a flor como forma reusavel
#
# A estampa carimbava a flor inteira em cada posicao: sao ~158 flores so na
# saia do corpo inteiro, seis elementos cada, e davam 948 <ellipse> num arquivo
# de 128 KB — seis vezes o de qualquer outra pessoa do elenco. E estampa: o
# proprio comentario de `floral` diz que ela some cedo, que e textura e nao
# sinal. Ninguem ve uma flor de 1 px na mesa, mas o navegador desenha as 948.
#
# Aqui a forma e escrita UMA vez, no tamanho 10 e na origem, e cada carimbo
# vira um <use> com translate/rotate/scale. O desenho e o mesmo: girar a flor
# inteira em torno do centro dela da exatamente o mesmo resultado que somar o
# angulo a cada petala (era `a = rot + i*72`, e a petala girava do mesmo `a`),
# e a escala e uniforme porque todo raio ali e linear em r.

def flor_def(uid, petal, core):
    """A flor de `flower()` normalizada: r=10, centro na origem, sem giro."""
    p = []
    for i in range(5):
        a = i * 72.0
        rad = math.radians(a - 90)
        px, py = 5.8 * math.cos(rad), 5.8 * math.sin(rad)
        p.append(f'<ellipse cx="{px:.2f}" cy="{py:.2f}" rx="4.40" ry="5.60" '
                 f'transform="rotate({a:.0f} {px:.2f} {py:.2f})" fill="{petal}"/>')
    p.append(f'<circle cx="0" cy="0" r="2.80" fill="{core}"/>')
    # `stroke="none"` explicito: <use> herda o stroke de onde e usado, e o
    # grupo da estampa nem sempre e o mesmo.
    return f'<g id="{uid}" stroke="none">{"".join(p)}</g>'


def botao_def(uid):
    """O botao da estampa — dois pontinhos e uma folha —, tambem normalizado."""
    return (f'<g id="{uid}" stroke="none">'
            f'<circle cx="0" cy="0" r="3.00" fill="{BLOOM}"/>'
            f'<ellipse cx="7.00" cy="5.00" rx="5.00" ry="2.40" '
            f'transform="rotate(28 7.00 5.00)" fill="{LEAF}"/></g>')


def floral(x0, y0, x1, y1, step, r, seed):
    """Estampa: grade escalonada com tremida fixa (semente constante, para o
    SVG sair identico a cada rodada). Some cedo - e textura, nao sinal."""
    rnd = random.Random(seed)
    # Os ids carregam a semente: as cinco estampas de um mesmo SVG (avatar,
    # saia, corpete, mangas) sao chamadas independentes, e cada uma leva as
    # proprias definicoes. Sem a semente no id, a segunda sobrescreveria a
    # primeira.
    a_id, b_id, c_id = f"fl{seed}a", f"fl{seed}b", f"fl{seed}c"
    defs = (f'<defs>{flor_def(a_id, BLOOM, BLOOM_WARM)}'
            f'{flor_def(b_id, BLOOM_ROSE, BLOOM)}{botao_def(c_id)}</defs>')
    out, row, y = [], 0, y0
    while y < y1:
        x = x0 + (step * 0.5 if row % 2 else 0.0)
        while x < x1:
            jx = rnd.uniform(-step * 0.18, step * 0.18)
            jy = rnd.uniform(-step * 0.18, step * 0.18)
            k = rnd.random()
            if k < 0.58:
                rr = r * rnd.uniform(0.85, 1.15)
                out.append(f'<use href="#{a_id}" transform="translate({x+jx:.1f} {y+jy:.1f}) '
                           f'rotate({rnd.uniform(0, 72):.0f}) scale({rr/10:.3f})"/>')
            elif k < 0.82:
                out.append(f'<use href="#{b_id}" transform="translate({x+jx:.1f} {y+jy:.1f}) '
                           f'rotate({rnd.uniform(0, 72):.0f}) scale({r*0.82/10:.3f})"/>')
            else:
                # botao: dois pontinhos e uma folha - quebra a regularidade
                out.append(f'<use href="#{c_id}" transform="translate({x+jx:.1f} {y+jy:.1f}) '
                           f'scale({r/10:.3f})"/>')
            x += step
        y += step * 0.84
        row += 1
    return f'{defs}<g stroke="none">{"".join(out)}</g>'


def silver_flower(cx, cy, r, sw):
    """A flor do colar: a mesma flor da estampa, em prata e no tamanho em que
    ainda tem contorno. Unica peca de metal da personagem."""
    p = []
    for i in range(5):
        a = i * 72.0
        rad = math.radians(a - 90)
        px, py = cx + 0.58 * r * math.cos(rad), cy + 0.58 * r * math.sin(rad)
        p.append(f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="{0.46*r:.2f}" '
                 f'ry="{0.58*r:.2f}" transform="rotate({a:.0f} {px:.1f} {py:.1f})" '
                 f'fill="{SILVER}" stroke="{INK}" stroke-width="{sw*0.5:.2f}"/>')
    return (f'<g stroke-linejoin="round">{"".join(p)}'
            f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{0.30*r:.2f}" fill="{SILVER_SH}" '
            f'stroke="{INK}" stroke-width="{sw*0.5:.2f}"/>'
            f'<circle cx="{cx-r*0.30:.1f}" cy="{cy-r*0.34:.1f}" r="{0.12*r:.2f}" '
            f'fill="{SILVER_LIT}" stroke="none"/></g>')


def choker(cx, y, w, r, sw):
    """Colar rente ao pescoco: fita de prata fina + a flor grande no centro.
    A da Dri e o contrario - fita escura larga com uma gota pequena e clara."""
    h = w * 0.13
    return (f'<rect x="{cx-w/2:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            f'rx="{h*0.45:.1f}" fill="{SILVER}" stroke="{INK}" stroke-width="{sw*0.6:.2f}"/>'
            f'<path fill="none" stroke="{SILVER_LIT}" stroke-width="{sw*0.28:.2f}" '
            f'opacity="0.9" d="M {cx-w/2+2:.1f} {y+h*0.34:.1f} L {cx+w/2-2:.1f} {y+h*0.34:.1f}"/>'
            + silver_flower(cx, y + h + r * 0.62, r, sw))


# ------------------------------------------------- cabeca (coords locais 256)
# CALOTA + FRANJA CORTINA num caminho so: a borda de dentro desce dos dois
# lados da risca (x=126) e termina em ponta na altura da boca. A Gabizinsky tem
# risca ao meio lisa, a Dri risca lateral com mechas de mel, o Mafra franja
# fechada. A cortina e a quarta solucao possivel - e a que a foto mostra.
CAP = ("M 70 150 "
       "C 67 132, 71 114, 79 98 "
       "C 89 78, 105 65, 122 58 "
       "L 130 70 "
       "C 151 63, 169 78, 178 99 "
       "C 185 114, 189 132, 186 150 "
       "C 193 128, 197 106, 195 88 "
       "C 191 48, 162 22, 128 22 "
       "C 94 22, 65 48, 61 88 "
       "C 59 106, 63 128, 70 150 Z")

# Massa de tras: ondulada, na altura do ombro. Mais estreita que a da Dri
# (168 contra 180 de largura) e bem mais comprida que o chanel da Gabizinsky.
HAIR_BACK = ("M 128 23 "
             "C 70 23, 44 64, 50 108 "
             "C 43 148, 43 194, 51 234 "
             "C 48 252, 52 266, 57 277 "
             "C 69 283, 82 274, 83 260 "
             "C 78 232, 76 198, 80 168 "
             "C 82 140, 84 120, 85 106 "
             "L 171 106 "
             "C 172 120, 174 140, 176 168 "
             "C 180 198, 178 232, 173 260 "
             "C 174 274, 187 283, 199 277 "
             "C 204 266, 208 252, 205 234 "
             "C 213 194, 213 148, 206 108 "
             "C 212 64, 186 23, 128 23 Z")

# Mechas da frente: caem sobre o peito, por DENTRO da linha dos bracos, e
# afinam ate a ponta. Finas de proposito - rosa claro sobre vestido escuro e o
# contraste mais duro da figura, e mecha grossa ali vira tubo.
FRONT_L = ("M 70 116 C 64 152, 66 194, 73 232 C 76 248, 80 261, 87 272 "
           "C 92 268, 93 259, 91 249 C 86 216, 84 182, 84 150 "
           "C 84 130, 85 120, 86 116 Z")
FRONT_R = ("M 186 116 C 192 152, 190 194, 183 232 C 180 248, 176 261, 169 272 "
           "C 164 268, 163 259, 165 249 C 170 216, 172 182, 172 150 "
           "C 172 130, 171 120, 170 116 Z")


def hair_back(sw):
    """Massa de tras. Vai ATRAS dos ombros: e ela que da volume a silhueta na
    altura da cabeca. Sem halo - rosa claro ja se separa do feltro sozinho."""
    return (f'<g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linejoin="round">'
            f'<path fill="{HAIR}" d="{HAIR_BACK}"/>'
            f'<path fill="{HAIR_LIT}" stroke="none" opacity="0.75" '
            f'd="M 52 104 C 55 62, 80 30, 114 24 C 90 40, 68 68, 62 108 '
            f'C 56 158, 60 214, 68 254 C 58 250, 51 206, 52 152 Z"/>'
            f'<path fill="{HAIR_SH}" stroke="none" opacity="0.55" '
            f'd="M 205 120 C 210 160, 209 208, 202 250 C 206 216, 205 164, 200 122 Z"/>'
            f'</g>')


def bow(cx, cy, s, sw, rot=-16):
    """Laco preso no alto do cabelo, do lado esquerdo de quem olha. Escuro
    sobre rosa claro: e o contraste mais alto da personagem, e o que segura
    ela a 48px junto com a cor do cabelo."""
    k = sw / s
    return f'''<g transform="translate({cx} {cy}) rotate({rot}) scale({s})"
       stroke="{INK}" stroke-width="{k:.2f}" stroke-linejoin="round" stroke-linecap="round">
    <path fill="{BOW}" d="M -5 2 C -14 20, -26 26, -30 20 L -12 8 Z"/>
    <path fill="{BOW}" d="M 5 2 C 12 20, 22 30, 27 24 L 12 8 Z"/>
    <path fill="{BOW}" d="M -4 0 C -13 -13, -32 -17, -39 -9
      C -45 -1, -37 9, -24 10 C -14 11, -7 6, -4 3 Z"/>
    <path fill="{BOW}" d="M 4 0 C 13 -13, 32 -17, 39 -9
      C 45 -1, 37 9, 24 10 C 14 11, 7 6, 4 3 Z"/>
    <path fill="{BOW_LIT}" stroke="none" d="M -8 -3 C -16 -11, -28 -14, -34 -10
      C -29 -13, -18 -11, -10 -4 Z"/>
    <path fill="{BOW_LIT}" stroke="none" d="M 8 -3 C 16 -11, 28 -14, 34 -10
      C 29 -13, 18 -11, 10 -4 Z"/>
    <ellipse cx="0" cy="1" rx="7.5" ry="6.5" fill="{BOW}"/>
    <ellipse cx="-2" cy="-1.5" rx="2.6" ry="2.0" fill="{BOW_LIT}" stroke="none"/>
  </g>'''


def glasses_svg(sw):
    """Alternativa: os oculos da foto de rua. Armacao de acetato ESCURA e
    grossa - a EstereX ja tem os oculos de fio de ouro, e dois pares de oculos
    parecidos a 48px acabariam com o sinal dela."""
    return f'''
    <g fill="none" stroke="{BOW}" stroke-width="{sw*0.86:.2f}" stroke-linejoin="round">
      <rect x="90" y="101" width="36" height="29" rx="9"/>
      <rect x="132" y="101" width="36" height="29" rx="9"/>
      <path d="M 126 111 C 128 108, 130 108, 132 111"/>
      <path d="M 90 108 L 78 111"/>
      <path d="M 168 108 L 180 111"/>
    </g>
    <path fill="{CREAM}" stroke="none" opacity="0.16" d="M 94 126 L 112 104 L 120 104 L 100 128 Z"/>
    <path fill="{CREAM}" stroke="none" opacity="0.16" d="M 136 126 L 154 104 L 162 104 L 142 128 Z"/>'''


def head(sw, pierc_r=2.8, glasses=False, expr=None):
    """Rosto + cortina + laco. Coordenadas locais 256x256, o mesmo oval das
    outras tres mulheres do elenco."""
    # A boca sai de expressoes.py quando ha expressao: a geometria e do JOGO
    # (o mesmo gesto no rosto de todo mundo) e a tinta continua sendo desta
    # personagem. Sem expressao, e a de descanso, palavra por palavra.
    boca_svg = boca(expr, sw, INK, LIP) if expr else (
        f"""<path fill="{LIP}" stroke="{INK}" stroke-width="{sw*0.6:.2f}"
      d="M 111 143 C 117 136, 123 139, 128 142 C 133 139, 139 136, 145 143
         C 141 154, 134 158, 128 158 C 122 158, 115 154, 111 143 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw*0.42:.2f}" stroke-linecap="round"
      d="M 116 145 C 122 148, 134 148, 140 145"/>
    <ellipse cx="134" cy="151" rx="2.8" ry="1.5" fill="{LIP_LIT}" stroke="none" opacity="0.8"/>""")

    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- orelhas (quase escondidas pela cortina) -->
    <ellipse cx="78"  cy="116" rx="9" ry="12" fill="{SKIN}"/>
    <ellipse cx="178" cy="116" rx="9" ry="12" fill="{SKIN}"/>

    <!-- rosto -->
    <path fill="{SKIN}" d="M 76 98
      C 76 60, 98 46, 128 46
      C 158 46, 180 60, 180 98
      C 180 128, 170 152, 152 160
      C 144 164, 112 164, 104 160
      C 86 152, 76 128, 76 98 Z"/>

    <!-- MECHAS DA FRENTE: caem sobre o peito -->
    <path fill="{HAIR}" stroke="none" d="{FRONT_L}"/>
    <path fill="{HAIR}" stroke="none" d="{FRONT_R}"/>
    <path fill="{HAIR_LIT}" stroke="none" opacity="0.7" d="M 74 126
      C 69 160, 71 198, 77 232 C 79 246, 82 256, 86 265
      C 89 262, 90 256, 89 250 C 84 218, 81 186, 81 154
      C 81 136, 81 128, 82 126 Z"/>
    <path fill="{HAIR_SH}" stroke="none" opacity="0.45" d="M 186 116
      C 192 152, 190 194, 183 232 C 181 242, 178 252, 175 259
      C 179 246, 181 230, 183 208 C 186 176, 186 142, 182 118 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round"
      d="M 86 116 C 85 130, 84 150, 84 150 C 84 182, 86 216, 91 249
         C 93 259, 92 268, 87 272"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round"
      d="M 170 116 C 171 130, 172 150, 172 150 C 172 182, 170 216, 165 249
         C 163 259, 164 268, 169 272"/>

    <!-- CALOTA com a FRANJA CORTINA no mesmo caminho -->
    <path fill="{HAIR}" d="{CAP}"/>
    <path fill="{HAIR_LIT}" stroke="none" d="M 92 84 C 104 70, 120 62, 122 60
      L 125 66 C 112 72, 100 84, 92 98 C 88 108, 84 122, 83 134
      C 80 122, 84 100, 92 84 Z"/>
    <path fill="{HAIR_LIT}" stroke="none" opacity="0.8" d="M 146 68
      C 162 76, 173 90, 177 108 C 171 94, 159 80, 142 72 Z"/>
    <path fill="{HAIR_SH}" stroke="none" opacity="0.42" d="M 181 104
      C 186 120, 188 136, 186 150 L 178 148 C 181 134, 180 118, 176 104 Z"/>

    <!-- LACO -->
    {bow(84, 52, 0.66, sw)}

    <!-- sobrancelhas: finas e levantadas, e ficam ESCURAS -->
    <path fill="none" stroke="{BROW}" stroke-width="{sw*1.35:.2f}" d="M 95 94 C 104 88, 116 88, 124 92"/>
    <path fill="none" stroke="{BROW}" stroke-width="{sw*1.35:.2f}" d="M 132 92 C 140 88, 152 88, 161 94"/>

    <!-- olhos: delineado com PONTA (o da Dri e discreto, este e marcado) -->
    <g>
      <ellipse cx="108" cy="115" rx="12" ry="13" fill="{CREAM}"/>
      <circle  cx="109" cy="116" r="8.2" fill="{IRIS}" stroke="none"/>
      <circle  cx="109" cy="116" r="4.0" fill="{INK}"  stroke="none"/>
      <circle  cx="105.5" cy="112" r="2.6" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{LINER}" stroke-width="{sw*1.7:.2f}" d="M 95 109 C 101 100, 116 100, 121 108"/>
      <path fill="{LINER}" stroke="none" d="M 99 107 C 95 104, 91 100, 88 96
        C 90 102, 94 107, 97 110 Z"/>
    </g>
    <g>
      <ellipse cx="150" cy="115" rx="12" ry="13" fill="{CREAM}"/>
      <circle  cx="149" cy="116" r="8.2" fill="{IRIS}" stroke="none"/>
      <circle  cx="149" cy="116" r="4.0" fill="{INK}"  stroke="none"/>
      <circle  cx="145.5" cy="112" r="2.6" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{LINER}" stroke-width="{sw*1.7:.2f}" d="M 137 108 C 142 100, 157 100, 163 109"/>
      <path fill="{LINER}" stroke="none" d="M 159 107 C 163 104, 167 100, 170 96
        C 168 102, 164 107, 161 110 Z"/>
    </g>
    {glasses_svg(sw) if glasses else ''}

    <!-- nariz -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 126 126 C 128 134, 133 136, 137 132"/>

    <!-- BOCA fechada, cheia, batom vinho: o mais escuro do elenco -->
    {boca_svg}

    <!-- PIERCING: bolinha de prata no canto ESQUERDO da boca dela (= direita
         de quem olha). Fica COLADO no canto de proposito: assim, quando some
         no tamanho pequeno, funde com a boca em vez de virar pinta solta - a
         pinta e o sinal da Gabizinsky, e repetir tiraria o dela. -->
    <circle cx="148" cy="146.5" r="{pierc_r:.2f}" fill="{SILVER}"
      stroke="{INK}" stroke-width="{sw*0.5:.2f}"/>
    <circle cx="{148 - pierc_r*0.32:.2f}" cy="{146.5 - pierc_r*0.34:.2f}"
      r="{pierc_r*0.34:.2f}" fill="{SILVER_LIT}" stroke="none"/>

    <!-- blush -->
    <ellipse cx="97"  cy="139" rx="11" ry="6.5" fill="{BLUSH}" opacity="0.3" stroke="none"/>
    <ellipse cx="159" cy="139" rx="11" ry="6.5" fill="{BLUSH}" opacity="0.3" stroke="none"/>
  </g>'''


# ------------------------------------------------------------------ avatar
# Corpete com manga bufante: o ombro sobe em bola e desce reto. Nenhuma outra
# do elenco tem manga - a Gabizinsky e de manga curta reta, a Dri de couro.
AV_YOKE = ("M 12 262 C 14 222, 26 196, 48 186 "
           "C 66 178, 88 180, 100 187 "
           "L 156 187 "
           "C 168 180, 190 178, 208 186 "
           "C 230 196, 242 222, 244 262 Z")


def bust(sw):
    """Pescoco, vestido, decote e colar do busto. O avatar e o close do
    piercing usam o MESMO trecho: o close e um zoom honesto do avatar, nao um
    desenho paralelo que poderia divergir dele."""
    return f'''
      <!-- pescoco -->
      <path fill="{SKIN}" d="M 110 148 L 110 196 C 110 208, 146 208, 146 196 L 146 148 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 150 C 122 172, 136 172, 146 152 L 146 150 L 110 150 Z"/>

      <!-- VESTIDO: ombro bufante -->
      <path fill="{DRESS}" d="{AV_YOKE}"/>
      <g clip-path="url(#ly-av-tecido)">
        <path fill="{DRESS_SH}" stroke="none" d="M 12 262 C 14 224, 26 200, 46 190
          C 30 212, 22 238, 22 262 Z"/>
        <path fill="{DRESS_LIT}" stroke="none" opacity="0.7" d="M 208 186
          C 230 196, 242 222, 244 262 L 230 262 C 228 226, 218 202, 200 192 Z"/>
        <g fill="none" stroke="{DRESS_SH}" stroke-width="{sw*0.6:.2f}">
          <path d="M 52 194 C 46 210, 42 232, 41 258"/>
          <path d="M 70 187 C 62 206, 57 232, 56 260"/>
          <path d="M 204 194 C 210 210, 214 232, 215 258"/>
          <path d="M 186 187 C 194 206, 199 232, 200 260"/>
        </g>
        {floral(2, 180, 254, 268, 24, 6.2, seed=11)}
      </g>
      <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linejoin="round" d="{AV_YOKE}"/>

      <!-- DECOTE CORACAO -->
      <path fill="{SKIN}" d="M 98 187 C 101 218, 118 228, 128 213
        C 138 228, 155 218, 158 187 Z"/>
      <path fill="none" stroke="{DRESS_LIT}" stroke-width="{sw*0.8:.2f}" d="M 102 191
        C 105 215, 118 224, 128 210 C 138 224, 151 215, 154 191"/>

      <!-- COLAR: fita de prata + a flor -->
      {choker(128, 172, 46, 15, sw)}'''


def avatar(glasses=False):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Lyly - avatar">
  <defs>
    <clipPath id="ly-av-clip"><circle cx="128" cy="128" r="120"/></clipPath>
    <clipPath id="ly-av-tecido"><path d="{AV_YOKE}"/></clipPath>
  </defs>

  <g clip-path="url(#ly-av-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    {hair_back(5)}

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
{bust(5)}
    </g>

{head(sw=5, pierc_r=3.3, glasses=glasses)}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
# VESTIDO LONGO com TALHO na frente: a unica silhueta em coluna do elenco -
# todas as outras cinco figuras mostram perna ou calca. O talho existe para o
# meio da figura nao virar um bloco escuro de 400 unidades: a perna clara
# entra por ele, do mesmo jeito que o mel entra na Dri.
SAIA_D = ("M 150 296 "
          "C 141 370, 129 520, 120 704 "
          "C 140 716, 172 721, 202 716 "
          "C 210 640, 218 540, 224 452 "
          "C 234 540, 242 640, 246 714 "
          "C 262 717, 272 712, 281 704 "
          "C 273 520, 260 370, 250 296 Z")
CORPETE_D = ("M 143 244 C 145 226, 160 210, 178 206 "
             "L 222 206 "
             "C 240 210, 255 226, 257 244 "
             "C 259 268, 256 288, 254 304 "
             "L 146 304 "
             "C 144 288, 141 268, 143 244 Z")
BUFANTE_L = ("M 152 226 C 133 232, 122 250, 125 270 "
             "C 136 279, 157 277, 165 266 C 163 249, 158 234, 152 226 Z")
BUFANTE_R = ("M 248 226 C 267 232, 278 250, 275 270 "
             "C 264 279, 243 277, 235 266 C 237 249, 242 234, 248 226 Z")
PERNA_L = ("M 150 300 C 143 380, 150 460, 157 512 C 163 552, 159 600, 162 648 "
           "C 163 668, 164 690, 164 706 L 189 706 "
           "C 189 690, 188 668, 188 648 C 187 600, 186 552, 190 512 "
           "C 197 460, 202 380, 203 300 Z")
PERNA_R = ("M 250 300 C 257 380, 250 460, 243 512 C 237 552, 241 600, 238 648 "
           "C 237 668, 236 690, 236 706 L 211 706 "
           "C 211 690, 212 668, 212 648 C 213 600, 214 552, 210 512 "
           "C 203 460, 198 380, 197 300 Z")
SAPATO_L = ("M 190 700 L 190 719 C 190 728, 181 733, 164 733 "
            "L 129 733 C 121 733, 119 726, 126 722 L 146 711 L 146 700 Z")
SAPATO_R = ("M 210 700 L 210 719 C 210 728, 219 733, 236 733 "
            "L 271 733 C 279 733, 281 726, 274 722 L 254 711 L 254 700 Z")


def hand(mirror=False):
    """Mao aberta ao lado do corpo. Sem anel, sem pulseira: o metal dela e um
    so, e fica no pescoco."""
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


def body(glasses=False, expr=None):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="Lyly - corpo inteiro">
  <defs>
    <clipPath id="ly-saia-clip"><path d="{SAIA_D}"/></clipPath>
    <clipPath id="ly-corpete-clip"><path d="{CORPETE_D}"/></clipPath>
    <clipPath id="ly-buf-l"><path d="{BUFANTE_L}"/></clipPath>
    <clipPath id="ly-buf-r"><path d="{BUFANTE_R}"/></clipPath>
  </defs>

  <!-- cabelo de tras: atras dos ombros -->
  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">{hair_back(SW)}</g>

  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- PERNAS: so aparecem pelo talho e abaixo da barra -->
    <path fill="{SKIN}" d="{PERNA_L}"/>
    <path fill="{SKIN}" d="{PERNA_R}"/>
    <path fill="{SKIN_SH}" stroke="none" d="M 250 300 C 257 380, 250 460, 243 512
      C 237 552, 241 600, 238 648 C 237 668, 236 690, 236 706 L 229 706
      C 229 686, 230 660, 231 640 C 233 596, 230 552, 236 512
      C 243 460, 249 380, 244 300 Z"/>

    <!-- SAPATOS de salto baixo: quase todos escondidos pela barra -->
    <g>
      {halo(SAPATO_L)}
      <path fill="{SHOE}" d="{SAPATO_L}"/>
      <path fill="{SHOE_SH}" stroke="none" d="M 146 711 L 126 722 C 119 726, 121 733, 129 733
        L 148 733 C 142 727, 142 717, 146 711 Z"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 120 724 C 121 728, 126 730, 130 730
        L 164 730 C 179 730, 189 725, 190 717 L 190 724 C 189 730, 179 733, 164 733
        L 129 733 C 122 733, 118 729, 120 724 Z"/>
    </g>
    <g>
      {halo(SAPATO_R)}
      <path fill="{SHOE}" d="{SAPATO_R}"/>
      <path fill="{SHOE_SH}" stroke="none" d="M 254 711 L 274 722 C 281 726, 279 733, 271 733
        L 252 733 C 258 727, 258 717, 254 711 Z"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 280 724 C 279 728, 274 730, 270 730
        L 236 730 C 221 730, 211 725, 210 717 L 210 724 C 211 730, 221 733, 236 733
        L 271 733 C 278 733, 282 729, 280 724 Z"/>
    </g>

    <!-- SAIA LONGA + estampa -->
    {halo(SAIA_D)}
    <path fill="{DRESS}" d="{SAIA_D}"/>
    <g clip-path="url(#ly-saia-clip)">
      <path fill="{DRESS_SH}" stroke="none" d="M 150 296 C 141 370, 129 520, 120 704
        C 128 710, 138 714, 148 716 C 148 600, 152 430, 164 296 Z"/>
      <path fill="{DRESS_LIT}" stroke="none" opacity="0.6" d="M 250 296
        C 260 370, 273 520, 281 704 L 266 710 C 262 540, 252 400, 238 300 Z"/>
      <!-- pregas: variacao longa, nao linha dura -->
      <g fill="none" stroke="{DRESS_SH}" stroke-width="3" opacity="0.8">
        <path d="M 176 310 C 170 420, 164 560, 158 706"/>
        <path d="M 205 310 C 203 380, 201 420, 200 448"/>
        <path d="M 232 310 C 238 400, 246 540, 252 700"/>
      </g>
      {floral(106, 290, 296, 728, 26, 5.8, seed=23)}
    </g>
    <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{SAIA_D}"/>
    <!-- borda do talho: um fio claro so na aba de dentro -->
    <path fill="none" stroke="{DRESS_LIT}" stroke-width="3"
      d="M 206 706 C 213 630, 219 540, 224 462"/>

    <g transform="translate(0 {DY})">
      <!-- BRACOS: por cima da saia, como caem de verdade -->
      <g fill="none" stroke-linecap="round">
        <path stroke="{INK}"  stroke-width="41" d="M 146 236 C 128 292, 122 356, 127 418"/>
        <path stroke="{SKIN}" stroke-width="32" d="M 146 236 C 128 292, 122 356, 127 418"/>
        <path stroke="{INK}"  stroke-width="41" d="M 254 236 C 272 292, 278 356, 273 418"/>
        <path stroke="{SKIN}" stroke-width="32" d="M 254 236 C 272 292, 278 356, 273 418"/>
      </g>

      <!-- pescoco -->
      <path fill="{SKIN}" d="M 184 168 L 184 214 C 184 224, 216 224, 216 214 L 216 168 Z"/>

      <!-- CORPETE -->
      <path fill="{DRESS}" d="{CORPETE_D}"/>
      <g clip-path="url(#ly-corpete-clip)">
        <path fill="{DRESS_SH}" stroke="none" d="M 143 244 C 145 226, 160 210, 176 207
          C 162 226, 156 268, 157 306 L 146 304 C 144 288, 141 268, 143 244 Z"/>
        <path fill="{DRESS_LIT}" stroke="none" opacity="0.6" d="M 224 207
          C 240 211, 255 226, 257 244 C 259 268, 256 288, 254 304 L 244 304
          C 246 274, 244 232, 232 210 Z"/>
        {floral(136, 200, 264, 308, 22, 5.4, seed=5)}
      </g>
      <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{CORPETE_D}"/>

      <!-- MANGAS BUFANTES -->
      <path fill="{DRESS}" d="{BUFANTE_L}"/>
      <g clip-path="url(#ly-buf-l)">
        <path fill="{DRESS_SH}" stroke="none" d="M 152 226 C 133 232, 122 250, 125 270
          C 129 273, 134 275, 139 276 C 133 258, 139 238, 152 226 Z"/>
        {floral(118, 220, 170, 282, 18, 4.6, seed=31)}
        <g fill="none" stroke="{DRESS_SH}" stroke-width="2.6" opacity="0.9">
          <path d="M 140 228 C 133 244, 130 258, 131 274"/>
          <path d="M 152 230 C 147 246, 145 260, 146 276"/>
        </g>
      </g>
      <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{BUFANTE_L}"/>
      <path fill="{DRESS}" d="{BUFANTE_R}"/>
      <g clip-path="url(#ly-buf-r)">
        <path fill="{DRESS_LIT}" stroke="none" opacity="0.55" d="M 248 226
          C 267 232, 278 250, 275 270 C 271 273, 266 275, 261 276
          C 267 258, 261 238, 248 226 Z"/>
        {floral(230, 220, 282, 282, 18, 4.6, seed=37)}
        <g fill="none" stroke="{DRESS_SH}" stroke-width="2.6" opacity="0.9">
          <path d="M 260 228 C 267 244, 270 258, 269 274"/>
          <path d="M 248 230 C 253 246, 255 260, 254 276"/>
        </g>
      </g>
      <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{BUFANTE_R}"/>

      <!-- cintura franzida: a costura que junta corpete e saia -->
      <path fill="{DRESS_SH}" stroke="none" d="M 146 296 L 254 296 C 254 300, 254 302, 254 304
        L 146 304 C 146 302, 146 300, 146 296 Z"/>
      <g fill="none" stroke="{DRESS_SH}" stroke-width="2.6" opacity="0.85">
        <path d="M 162 282 C 166 290, 166 296, 164 302"/>
        <path d="M 182 278 C 186 288, 186 294, 184 302"/>
        <path d="M 218 278 C 214 288, 214 294, 216 302"/>
        <path d="M 238 282 C 234 290, 234 296, 236 302"/>
      </g>

      <!-- DECOTE CORACAO -->
      <path fill="{SKIN}" d="M 173 207 C 176 232, 190 242, 200 228
        C 210 242, 224 232, 227 207 Z"/>
      <path fill="none" stroke="{DRESS_LIT}" stroke-width="3.4" d="M 177 210
        C 180 231, 191 239, 200 226 C 209 239, 220 231, 223 210"/>

      <!-- COLAR -->
      {choker(200, 182, 32, 9.6, 5)}
    </g>
  </g>

  <g transform="translate(0 {DY})">{hand()}{hand(mirror=True)}</g>

  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">
{head(sw=SW, pierc_r=2.8, glasses=glasses, expr=expr)}
  </g>
</svg>
'''


# ------------------------------------- close do piercing (padrao do elenco)
def pierc_detail():
    """Mesmo papel do `matheus-pulso.svg`, do `gabizinsky-anel.svg` e do
    `mafra-kitty-estampa.svg`: o detalhe que some no tamanho de uso, mostrado
    no tamanho em que ele existe de verdade.

    E um zoom do proprio avatar (mesmo `bust()`, mesma `head()`), enquadrado na
    boca. O contorno NAO cresce junto com o zoom: fica em 6 unidades, que e a
    espessura dos outros closes do elenco."""
    k = 4.3
    sw = 6.0 / k
    tx, ty = 160 - k * 134, 160 - k * 158
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Lyly - o piercing no canto esquerdo da boca">
  <defs>
    <clipPath id="ly-pierc-clip"><circle cx="160" cy="160" r="150"/></clipPath>
    <clipPath id="ly-av-tecido"><path d="{AV_YOKE}"/></clipPath>
  </defs>
  <g clip-path="url(#ly-pierc-clip)">
    <circle cx="160" cy="160" r="150" fill="{WOOD}"/>
    <ellipse cx="160" cy="150" rx="132" ry="128" fill="{WOOD_LIT}"/>
    <g transform="translate({tx:.2f} {ty:.2f}) scale({k})">
      <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">
{bust(sw)}
      </g>
{head(sw=sw, pierc_r=3.3)}
    </g>
  </g>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{INK}" stroke-width="12"/>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{WARM}" stroke-width="6"/>
</svg>
'''


files = {
    "lyly-avatar.svg": avatar(),
    "lyly-corpo-inteiro.svg": body(),
    "lyly-piercing.svg": pierc_detail(),
    "lyly-alt-oculos-avatar.svg": avatar(glasses=True),
    "lyly-alt-oculos-corpo-inteiro.svg": body(glasses=True),
}
# As expressoes: a mesma figura, outra boca. O cliente troca o arquivo por
# 1,9 s quando algo acontece com aquele jogador (REACOES, em client.js).
for _e in ("feliz", "bravo"):
    files[f"lyly-corpo-inteiro-{_e}.svg"] = body(expr=_e)

for name, content in files.items():
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
print("ok:", ", ".join(files))
