# -*- coding: utf-8 -*-
"""Mufasa - setimo personagem (quarto homem) do jogo Cacamba.

Mesma construcao do elenco: busto em viewBox 256, corpo em 400x800, cabeca em
coordenadas locais 256 escalada 0.88, linha do chao em y=733, moldura de
contorno 10 + ambar 5.

Identidade: CACHOS caindo na testa (silhueta com borda serrilhada), laterais
afiladas, oculos redondos de PRATA, bigode dominante com barba curta no queixo,
e o unico corpo do elenco partido ao meio por valor — preto em cima, BEGE no
quadril, preto de novo nas pernas.

O metal dele e todo ACIMA DO PESCOCO: argola em cada orelha, argola na
sobrancelha direita (a direita dele = a esquerda de quem olha, mesma convencao
do sinal da Gabizinsky) e a armacao dos oculos. Abaixo do pescoco nao ha metal
nenhum — nem corrente, nem relogio, nem anel.

"Mufasa" aqui e apelido de pessoa, como o resto do elenco. Nada no desenho faz
referencia a leao, juba, coroa ou a qualquer personagem de terceiros; e a mesma
regra que ja vale para escudo de time e para a Hello Kitty no README.
"""
import math
import os

# Os SVGs ficam um nivel acima: este diretorio guarda so os geradores.
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ------------------------------------------------------- paleta do jogo
INK        = "#2A1B12"
WOOD       = "#7A4A2B"
WOOD_LIT   = "#8C5733"
WARM       = "#F2C14E"
CREAM      = "#F5F1E6"
RIM        = "#8C6A45"   # mesma luz de borda quente do elenco

SKIN       = "#F4CFAA"   # pele padrao do elenco
SKIN_SH    = "#E0B189"

# Cabelo castanho escuro, na mesma faixa do Matheus. Aqui a cor NAO e o que
# separa os dois: e a franja de cachos (ele) contra a testa a mostra (Matheus).
# O que o cabelo dele tem de proprio e o BRILHO: HAIR_LIT e o realce mais claro
# de cabelo do elenco, porque cacho sem luz vira mancha.
HAIR       = "#372A21"
HAIR_SH    = "#281E18"
HAIR_LIT   = "#6B4F38"
IRIS       = "#4A3526"

# Preto FRIO. O Junior e o preto quente (matiz 22,5); este e neutro-frio
# (matiz 247,5) e um degrau abaixo. Lado a lado, um le como preto de barro e o
# outro como preto de grafite.
TOP        = "#33323A"   # camiseta
TOP_SH     = "#282730"
TOP_LIT    = "#43424C"

# Segunda pele por baixo: manga comprida e gola alta. Mesma cor-familia da
# camiseta, separada por ACABAMENTO e nao por cor — do mesmo jeito que couro e
# tecido se separam na Dri. Tecido de compressao brilha; algodao nao.
SLEEVE     = "#26252D"
SLEEVE_SH  = "#222129"
SLEEVE_LIT = "#4E4D59"   # realce especular de borda dura

# Bermuda de areia. E a mancha clara da figura e o unico bege do elenco.
SAND       = "#CFC1A0"
SAND_SH    = "#B3A585"
SAND_LIT   = "#E0D5B9"

# Legging preta: a massa mais escura da figura, e a que mais precisa de halo.
TIGHT      = "#2B2A31"
TIGHT_SH   = "#212027"
TIGHT_LIT  = "#4C4B57"

# Tenis cinza-chumbo com entressola clara. Cinza (nao preto) para o pe se
# separar da legging; entressola clara para o pe existir contra o feltro.
SHOE       = "#4B4B54"
SHOE_SH    = "#3A3A42"
SHOE_LIT   = "#5F5F6A"
MIDSOLE    = "#E3DED2"
MIDSOLE_SH = "#C4BEAF"

# Metal: prata, so prata, e so no rosto.
SILVER     = "#C9CDD2"
SILVER_MID = "#A8AEB5"

S = 0.88
TX = 200 - 128 * S
# O chao e o mesmo para todo o elenco (y=733). "Mais baixo" quer dizer cabeca
# mais perto do chao. Com DY=3 ele media 716 e praticamente empatava com o
# Matheus (722) — e o elenco ja tem um empate de proposito (Matheus x EstereX);
# um segundo empate tiraria a estatura da lista de coisas que separam gente.
# DY=9 abre a folga: 710, sete acima do Mafra Kitty e doze abaixo do Matheus.
DY = 9
TY = 9.6 + DY
SW = 5 / S

# Fio dos oculos. A EstereX ja mediu isso: 2.0 (fiel ao real) quebra em
# fragmentos a 48 px; 3.1 segura. O numero e emprestado inteiro, so o metal e
# a forma mudam.
GLASS_W = 3.1


def halo(d, w=9):
    """Luz de borda quente por FORA do contorno. Contorno e fundo do jogo sao a
    mesma cor: sem isso, roupa preta sobre feltro escuro some."""
    return (f'<path fill="none" stroke="{RIM}" stroke-width="{w}" opacity="0.8" '
            f'stroke-linejoin="round" d="{d}"/>')


# ----------------------------------------------------------- os cachos
def coil_edge(cx, cy, rx, ry, a0, a1, amps):
    """Borda encaracolada: uma elipse amostrada em len(amps) arcos, cada um
    estufado para fora por um valor da lista.

    As amplitudes sao escritas a mao, nao sorteadas: o SVG precisa sair igual
    byte a byte toda vez que o script roda. Elas alternam grande/pequeno de
    proposito — lobulo do mesmo tamanho le como nuvem, e essa e a mesma regra
    que ja valeu para as ondas da franja do Mafra Kitty.

    Devolve (primeiro ponto, trecho do path, y mais alto que a borda alcanca).
    O apice de uma quadratica fica na METADE do caminho ate o ponto de
    controle: por isso o controle sai a 2k e a conta do topo usa k.
    """
    n = len(amps)
    pts = [(cx + rx * math.cos(a0 + (a1 - a0) * i / n),
            cy + ry * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]
    d, top = [], min(p[1] for p in pts)
    for i, k in enumerate(amps):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        am = a0 + (a1 - a0) * (i + 0.5) / n
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        d.append(f"Q {mx + math.cos(am)*k*2:.1f} {my + math.sin(am)*k*2:.1f} "
                 f"{x1:.1f} {y1:.1f}")
        top = min(top, my + math.sin(am) * k)
    return pts[0], " ".join(d), top


CROWN_AMPS = [5.0, 8.5, 4.5, 9.5, 6.0, 8.0, 4.0, 9.0, 5.5, 7.5, 4.5]
_P0, _CROWN, HAIR_TOP = coil_edge(128, 94, 53, 74, math.pi, 2 * math.pi, CROWN_AMPS)

# A FRANJA e a decisao de silhueta, e ela tambem e serrilhada — e o que separa
# esta cabeca da do Mafra Kitty, que tem franja lisa. Os lobulos param a 6
# unidades da sobrancelha: encostando, as duas massas escuras viram uma faixa
# so sobre os olhos e o rosto le como mascara. O numero 6 nao e novo, e o mesmo
# medido na franja do Mafra Kitty.
FRINGE = ("C 163 79, 157 87, 151 84 "
          "C 147 79, 142 86, 137 83 "
          "C 132 77, 126 88, 121 85 "
          "C 117 81, 113 86, 108 81 "
          "C 104 77, 98 87, 94 85 "
          "C 92 83, 91 88, 90 92 ")

HAIR_D = (f"M 82 114 C 78 106, 76 100, {_P0[0]:.1f} {_P0[1]:.1f} "
          f"{_CROWN} "
          "C 179 100, 176 106, 172 114 "
          "C 173 106, 170 98, 166 92 "
          f"{FRINGE}"
          "C 87 98, 84 106, 82 114 Z")

# Cachos soltos por dentro da massa: arco de ~270 graus, sem contorno. Sao
# LUZ, nao desenho de mecha — contorno interno entre mechas foi o que ja fez o
# cabelo da Dri ler como cordas.
CURL_SPOTS = [(99, 62, 9, 25), (116, 46, 8, -12), (136, 42, 9, 18),
              (156, 58, 8, 32), (108, 80, 7, -18), (146, 76, 7, -34)]


def curls(sw):
    out = []
    for x, y, r, rot in CURL_SPOTS:
        out.append(
            f'<path transform="rotate({rot} {x} {y})" fill="none" '
            f'stroke="{HAIR_LIT}" stroke-width="{sw*0.50:.2f}" stroke-linecap="round" '
            f'opacity="0.45" d="M {x-r} {y} A {r} {r} 0 1 1 {x+r:.1f} {y+r*0.10:.1f}"/>')
    return "".join(out)


# ------------------------------------------------------------ as argolas
def hoop(cx, cy, r, sw, bead=True):
    """Argola de prata: contorno por baixo, prata por cima. Duas camadas, como
    todo metal do elenco — some a prata, sobra o contorno; o objeto nunca
    desaparece de vez, so perde o metal."""
    s = (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{INK}" stroke-width="{sw*0.80:.2f}"/>'
         f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{SILVER}" stroke-width="{sw*0.42:.2f}"/>')
    if bead:
        s += (f'<circle cx="{cx}" cy="{cy-r:.1f}" r="{sw*0.34:.2f}" fill="{SILVER}" '
              f'stroke="{INK}" stroke-width="{sw*0.22:.2f}"/>')
    return s


# ------------------------------------------------------------- os oculos
def glasses(sw, uid):
    """Armacao oval de PRATA. A EstereX e dona dos oculos DOURADOS e QUADRADOS
    do elenco; estes sao frios e ovais de proposito — a 48 px o que chega e
    "tem oculos", entao a diferenca precisa estar no metal e na forma, que sao
    as duas coisas que sobrevivem.

    Construcao copiada dela inteira, porque ja estava medida: fio de 3.1 (2.0
    quebra em fragmentos a 48 px), UM traco de cor sem contorno preto por
    baixo, veu de 9% na lente e reflexo diagonal cortado pela lente — e o
    reflexo que diz "vidro" quando o resto some. A unica coisa que muda e o
    metal, e ele e um degrau mais escuro que a prata das argolas: prata clara
    em fio fino sobre pele clara nao se ve.
    """
    fw = GLASS_W * (sw / 5.0)
    ll = ("M 87 118 C 87 108, 95 103, 106 103 C 117 103, 125 108, 125 118 "
          "C 125 128, 117 133, 106 133 C 95 133, 87 128, 87 118 Z")
    lr = ("M 171 118 C 171 108, 163 103, 152 103 C 141 103, 133 108, 133 118 "
          "C 133 128, 141 133, 152 133 C 163 133, 171 128, 171 118 Z")
    return f'''
    <defs>
      <clipPath id="{uid}-ll"><path d="{ll}"/></clipPath>
      <clipPath id="{uid}-lr"><path d="{lr}"/></clipPath>
    </defs>
    <path d="{ll}" fill="{CREAM}" opacity="0.09" stroke="none"/>
    <path d="{lr}" fill="{CREAM}" opacity="0.09" stroke="none"/>
    <g clip-path="url(#{uid}-ll)" stroke="{CREAM}" fill="none" opacity="0.36" stroke-linecap="round">
      <path stroke-width="{fw*1.5:.2f}" d="M 92 124 L 103 110"/>
    </g>
    <g clip-path="url(#{uid}-lr)" stroke="{CREAM}" fill="none" opacity="0.36" stroke-linecap="round">
      <path stroke-width="{fw*1.5:.2f}" d="M 138 124 L 149 110"/>
    </g>
    <g fill="none" stroke="{SILVER_MID}" stroke-width="{fw:.2f}" stroke-linecap="round" stroke-linejoin="round">
      <path d="{ll}"/>
      <path d="{lr}"/>
      <path d="M 125 114 L 133 114"/>
      <path d="M 87 114 C 83 113, 80 112, 77 113"/>
      <path d="M 171 114 C 175 113, 178 112, 181 113"/>
    </g>
    <g fill="none" stroke="{SILVER}" stroke-width="{fw*0.45:.2f}" stroke-linecap="round">
      <path d="M 93 108 C 99 104, 113 104, 119 108"/>
      <path d="M 165 108 C 159 104, 145 104, 139 108"/>
    </g>
'''


# ------------------------------------------------- cabeca (coords locais 256)
def head(sw, uid):
    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- rosto: mandibula masculina, queixo cheio -->
    <path fill="{SKIN}" d="M 85 100
      C 85 57, 104 43, 128 43
      C 152 43, 171 57, 171 100
      C 171 130, 162 152, 149 163
      C 142 169, 136 171, 128 171
      C 120 171, 114 169, 107 163
      C 94 152, 85 130, 85 100 Z"/>

    <!-- LATERAIS AFILADAS. Nao e o fade do Junior, que vai a pele: aqui o pelo
         continua, so curto. Duas passadas de opacidade baixa e as costeletas,
         que sao por onde a lateral encontra a barba. -->
    <g stroke="none" fill="{HAIR}">
      <path opacity="0.22" d="M 86 96 C 88 108, 90 118, 95 128
        C 90 122, 86 112, 85 100 Z"/>
      <path opacity="0.22" d="M 170 96 C 168 108, 166 118, 161 128
        C 166 122, 170 112, 171 100 Z"/>
      <path opacity="0.30" d="M 85 100 C 88 93, 92 89, 97 87
        C 94 96, 92 106, 91 116 C 88 112, 86 106, 85 100 Z"/>
      <path opacity="0.30" d="M 171 100 C 168 93, 164 89, 159 87
        C 162 96, 164 106, 165 116 C 168 112, 170 106, 171 100 Z"/>
      <path opacity="0.66" d="M 90 108 C 94 110, 97 116, 97 126 L 92 124 Z"/>
      <path opacity="0.66" d="M 166 108 C 162 110, 159 116, 159 126 L 164 124 Z"/>
    </g>

    <!-- BARBA CURTA, densa no queixo e RALA NA BOCHECHA. E o contrario da do
         Junior, que e cheia e com a linha da bochecha marcada. -->
    <path stroke="none" fill="{HAIR}" opacity="0.34" d="M 90 112
      C 94 134, 100 148, 108 157 C 116 162, 140 162, 148 157
      C 156 148, 162 134, 166 112 C 168 138, 160 158, 146 167
      C 140 170, 134 172, 128 172 C 122 172, 116 170, 110 167
      C 96 158, 88 138, 90 112 Z"/>
    <path stroke="none" fill="{HAIR}" opacity="0.92" d="M 93 122
      C 96 140, 101 153, 109 161
      C 116 152, 140 152, 147 161
      C 155 153, 160 140, 163 122
      C 167 142, 162 158, 150 167
      C 143 170, 136 172, 128 172
      C 120 172, 113 170, 106 167
      C 94 158, 89 142, 93 122 Z"/>
    <path stroke="none" fill="{HAIR_SH}" opacity="0.50" d="M 110 160
      C 116 164, 140 164, 146 160 C 144 168, 137 172, 128 172
      C 119 172, 112 168, 110 160 Z"/>
    <!-- BIGODE: o traco dominante do rosto. Mais largo que o do Junior e com
         as pontas caindo abaixo do canto da boca. -->
    <path stroke="none" fill="{HAIR}" opacity="0.95" d="M 108 133
      C 115 128, 122 130, 128 134 C 134 130, 141 128, 148 133
      C 149 141, 143 146, 137 143 C 133 141, 123 141, 119 143
      C 113 146, 107 141, 108 133 Z"/>

    <!-- CABELO: cachos. Halo por fora, como toda massa escura do elenco. -->
    {halo(HAIR_D, w=sw*1.45)}
    <path fill="{HAIR}" d="{HAIR_D}"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 82 114 C 79 102, 77 88, 78 74
      C 84 86, 88 100, 90 114 C 86 113, 84 113, 82 114 Z"/>
    <path fill="{HAIR_SH}" stroke="none" d="M 172 114 C 175 102, 177 88, 176 74
      C 170 86, 166 100, 164 114 C 168 113, 170 113, 172 114 Z"/>
    {curls(sw)}

    <!-- ORELHAS depois do cabelo: sao curtas dos lados, a orelha fica na
         frente. Uma argola em cada uma. -->
    <ellipse cx="81"  cy="115" rx="7.5" ry="11" fill="{SKIN}"/>
    <ellipse cx="175" cy="115" rx="7.5" ry="11" fill="{SKIN}"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw*0.55:.2f}" d="M 80 111 C 83 113, 83 118, 80 121"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw*0.55:.2f}" d="M 176 111 C 173 113, 173 118, 176 121"/>
    {hoop(81, 132, 3.4, sw, bead=False)}
    {hoop(175, 132, 3.4, sw, bead=False)}

    <!-- sobrancelhas: grossas e retas -->
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.8:.2f}" d="M 92 96 C 102 89, 116 89, 124 94"/>
    <path fill="none" stroke="{HAIR_SH}" stroke-width="{sw*1.8:.2f}" d="M 132 94 C 140 89, 154 89, 164 96"/>

    <!-- ARGOLA NA SOBRANCELHA DIREITA (= direita dele, esquerda de quem olha,
         a mesma convencao do sinal da Gabizinsky). Fica na ponta de fora da
         sobrancelha: e o unico vao livre entre a franja em cima e o aro dos
         oculos embaixo — 6 unidades de folga para cada lado. -->
    {hoop(98, 94, 4.6, sw)}

    <!-- olhos -->
    <g>
      <ellipse cx="107" cy="117" rx="11" ry="11" fill="{CREAM}"/>
      <circle cx="108" cy="118" r="7.6" fill="{IRIS}" stroke="none"/>
      <circle cx="108" cy="118" r="3.4" fill="{INK}" stroke="none"/>
      <circle cx="105" cy="114.5" r="2.5" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.3:.2f}" d="M 97 112 C 102 105, 113 105, 118 112"/>
    </g>
    <g>
      <ellipse cx="151" cy="117" rx="11" ry="11" fill="{CREAM}"/>
      <circle cx="150" cy="118" r="7.6" fill="{IRIS}" stroke="none"/>
      <circle cx="150" cy="118" r="3.4" fill="{INK}" stroke="none"/>
      <circle cx="147" cy="114.5" r="2.5" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.3:.2f}" d="M 140 112 C 145 105, 156 105, 161 112"/>
    </g>

    <!-- nariz -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 123 120 C 125 130, 132 133, 137 128"/>

    <!-- boca: o sorriso e dele. Nas tres fotos de referencia ele aparece serio
         numa e rindo largo nas outras duas; o elenco inteiro e serio ou quase,
         entao ele fica com a curva mais aberta da mesa sem virar careta. -->
    <path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 117 147 C 123 153, 134 153, 140 146"/>

    {glasses(sw, uid)}
  </g>'''


# ------------------------------------------------------------------ avatar
def avatar(top=None, top_sh=None, top_lit=None, name="Mufasa"):
    top = top or TOP
    top_sh = top_sh or TOP_SH
    top_lit = top_lit or TOP_LIT
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="{name} - avatar">
  <defs>
    <clipPath id="mf-av-clip"><circle cx="128" cy="128" r="120"/></clipPath>
  </defs>

  <g clip-path="url(#mf-av-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- ombro: camiseta preta de caimento reto -->
      <path fill="{top}" d="M 16 262 C 20 212, 60 188, 102 180 L 154 180 C 196 188, 236 212, 240 262 Z"/>
      <path fill="{top_sh}" stroke="none" d="M 16 262 C 20 212, 46 194, 66 187 C 52 206, 44 234, 42 262 Z"/>
      <path fill="{top_lit}" stroke="none" opacity="0.8" d="M 190 187 C 210 194, 236 212, 240 262 L 216 262 C 214 232, 206 206, 190 187 Z"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 16 262 C 20 212, 60 188, 102 180 L 154 180 C 196 188, 236 212, 240 262"/>

      <!-- pescoco: sobra so uma tira dele. E a GOLA ALTA que come o resto — e
           ela o sinal de busto que separa este rosto do Junior, que mostra
           pescoco, cordao e cristal no mesmo lugar. -->
      <path fill="{SKIN}" d="M 110 150 L 110 190 C 110 204, 146 204, 146 190 L 146 150 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 152 C 122 176, 134 176, 146 154 L 146 152 L 110 152 Z"/>

      <path fill="{SLEEVE}" d="M 108 184 C 113 178, 143 178, 148 184
        L 152 208 C 144 216, 112 216, 104 208 Z"/>
      <path fill="{SLEEVE_LIT}" stroke="none" opacity="0.45" d="M 138 180 C 144 181, 147 182, 148 184
        L 152 208 C 149 211, 145 213, 141 214 C 143 201, 141 189, 138 180 Z"/>
      <g fill="none" stroke="{SLEEVE_SH}" stroke-width="3.4" opacity="0.85">
        <path d="M 107 194 C 116 199, 140 199, 149 194"/>
        <path d="M 106 202 C 115 207, 141 207, 150 202"/>
      </g>
    </g>

{head(sw=5, uid="mf-av")}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
TEE_D = ("M 139 234 C 142 207, 158 189, 178 182 L 222 182 "
         "C 242 189, 258 207, 261 234 "
         "C 261 282, 259 336, 256 380 "
         "C 232 392, 168 392, 144 380 "
         "C 141 336, 139 282, 139 234 Z")

# LEGGING: massa mais escura da figura, perna afilada.
TIGHT_D = ("M 156 392 C 150 438, 147 492, 152 544 "
           "C 156 590, 156 648, 155 700 L 182 700 "
           "C 183 646, 185 592, 189 544 C 194 488, 198 444, 200 426 "
           "C 202 444, 206 488, 211 544 C 215 592, 217 646, 218 700 "
           "L 245 700 C 244 648, 244 590, 248 544 "
           "C 253 492, 250 438, 244 392 Z")

# BERMUDA: larga, barra na metade da coxa. A barra e o unico lugar do elenco
# onde uma peca CLARA fica por cima de uma escura.
SHORTS_D = ("M 146 366 C 140 404, 138 452, 140 502 "
            "L 192 506 C 194 488, 197 472, 200 464 "
            "C 203 472, 206 488, 208 506 "
            "L 260 502 C 262 452, 260 404, 254 366 Z")

# Tenis: desenhado uma vez e espelhado.
SHOE_UP = ("M 140 686 L 190 686 L 192 702 C 192 714, 182 720, 163 720 "
           "L 122 720 C 112 720, 109 711, 118 706 L 140 694 Z")
SHOE_SOLE = ("M 118 706 C 109 711, 112 720, 122 720 L 163 720 "
             "C 182 720, 192 714, 192 702 L 195 702 "
             "C 195 721, 183 733, 163 733 L 120 733 "
             "C 104 733, 104 713, 114 705 Z")


def shoe(mirror=False):
    t = ' transform="translate(400 0) scale(-1 1)"' if mirror else ''
    return f'''
  <g{t} stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path fill="{SHOE}" d="{SHOE_UP}"/>
    <path fill="{SHOE_SH}" stroke="none" d="M 166 686 L 190 686 L 192 702 C 192 712, 184 718, 171 720 C 175 708, 173 695, 166 686 Z"/>
    <path fill="{MIDSOLE}" d="{SHOE_SOLE}"/>
    <path fill="{MIDSOLE_SH}" stroke="none" d="M 114 705 C 104 713, 104 733, 120 733 L 132 733 C 121 730, 118 715, 124 706 Z"/>
    <!-- costura da biqueira: reta, e so uma. Nada de forma curva no
         lado do tenis — curva ali le como marca de fabricante. -->
    <path fill="none" stroke="{SHOE_LIT}" stroke-width="3.2" opacity="0.9" d="M 134 704 C 139 698, 145 695, 152 694"/>
    <g fill="none" stroke="{MIDSOLE}" stroke-width="3.4" stroke-linecap="round" opacity="0.85">
      <path d="M 161 693 L 180 693"/>
      <path d="M 161 701 L 181 701"/>
      <path d="M 162 709 L 182 709"/>
    </g>
  </g>'''


def hand(mirror=False, dy=0):
    """Mao aberta ao lado do corpo. Sem anel e sem relogio: o metal dele e todo
    acima do pescoco. E ela, emoldurada pelo punho preto da manga, que impede o
    bege da bermuda de ler como pele."""
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


def body(top=None, top_sh=None, top_lit=None, sand=None, sand_sh=None,
         sand_lit=None, name="Mufasa"):
    top = top or TOP
    top_sh = top_sh or TOP_SH
    top_lit = top_lit or TOP_LIT
    sand = sand or SAND
    sand_sh = sand_sh or SAND_SH
    sand_lit = sand_lit or SAND_LIT
    al = "M 148 213 C 130 275, 121 347, 124 417"
    ar = "M 252 213 C 270 275, 279 347, 276 417"
    sl = "M 146 213 C 140 233, 136 253, 133 271"
    sr = "M 254 213 C 260 233, 264 253, 267 271"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="{name} - corpo inteiro">
  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- BRACOS: manga comprida ate o punho. Segunda pele por baixo, manga da
         camiseta por cima do ombro. -->
    <g fill="none" stroke-linecap="round" transform="translate(0 {DY})">
      <path stroke="{RIM}"    stroke-width="46" opacity="0.8" d="{al}"/>
      <path stroke="{INK}"    stroke-width="37" d="{al}"/>
      <path stroke="{SLEEVE}" stroke-width="29" d="{al}"/>
      <path stroke="{RIM}"    stroke-width="46" opacity="0.8" d="{ar}"/>
      <path stroke="{INK}"    stroke-width="37" d="{ar}"/>
      <path stroke="{SLEEVE}" stroke-width="29" d="{ar}"/>
      <!-- realce especular: borda dura, so no lado da luz. E o acabamento que
           separa a compressao do algodao — nao a cor. -->
      <path stroke="{SLEEVE_LIT}" stroke-width="6" opacity="0.8" stroke-linecap="butt"
        d="M 134 272 C 130 312, 129 356, 131 396"/>
      <path stroke="{SLEEVE_LIT}" stroke-width="7" opacity="0.8" stroke-linecap="butt"
        d="M 285 272 C 289 312, 290 356, 287 396"/>
      <!-- punho -->
      <path stroke="{SLEEVE_SH}" stroke-width="29" stroke-linecap="butt" d="M 123.4 404 L 124 417"/>
      <path stroke="{SLEEVE_SH}" stroke-width="29" stroke-linecap="butt" d="M 276.6 404 L 276 417"/>
      <!-- mangas curtas da camiseta, por cima -->
      <path stroke="{INK}" stroke-width="50" d="{sl}"/>
      <path stroke="{top}" stroke-width="42" d="{sl}"/>
      <path stroke="{INK}" stroke-width="50" d="{sr}"/>
      <path stroke="{top}" stroke-width="42" d="{sr}"/>
      <path stroke="{top_sh}" stroke-width="42" stroke-linecap="butt" d="M 133.6 263 L 133 271"/>
      <path stroke="{top_sh}" stroke-width="42" stroke-linecap="butt" d="M 266.4 263 L 267 271"/>
    </g>

    <!-- TENIS -->
    {shoe()}
    {shoe(mirror=True)}

    <!-- LEGGING -->
    {halo(TIGHT_D)}
    <path fill="{TIGHT}" d="{TIGHT_D}"/>
    <path fill="{TIGHT_SH}" stroke="none" d="M 156 392 C 150 438, 147 492, 152 544
      C 156 590, 156 648, 155 700 L 164 700 C 164 648, 164 592, 161 546
      C 158 496, 160 436, 164 392 Z"/>
    <path fill="{TIGHT_LIT}" stroke="none" opacity="0.5" d="M 238 398 C 244 442, 247 492, 243 544
      C 239 592, 239 648, 240 700 L 245 700 C 244 648, 244 590, 248 544
      C 253 492, 250 438, 244 392 Z"/>
    <!-- costura de compressao: uma linha por perna, so isso -->
    <g fill="none" stroke="{TIGHT_LIT}" stroke-width="2.4" opacity="0.6">
      <path d="M 168 524 C 170 580, 170 640, 170 692"/>
      <path d="M 232 524 C 230 580, 230 640, 230 692"/>
    </g>

    <!-- BERMUDA BEGE -->
    <path fill="{sand}" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{SHORTS_D}"/>
    <path fill="{sand_sh}" stroke="none" d="M 146 366 C 140 404, 138 452, 140 502 L 154 503
      C 152 456, 153 404, 158 366 Z"/>
    <path fill="{sand_lit}" stroke="none" opacity="0.7" d="M 244 366 C 250 404, 252 452, 250 502
      L 260 502 C 262 452, 260 404, 254 366 Z"/>
    <!-- vinco central e barras -->
    <path fill="none" stroke="{sand_sh}" stroke-width="3.4" d="M 200 436 C 199 462, 198 486, 197 504"/>
    <g fill="none" stroke="{sand_sh}" stroke-width="4.5">
      <path d="M 140 492 C 155 499, 178 500, 191 497"/>
      <path d="M 260 492 C 245 499, 222 500, 209 497"/>
    </g>
    <!-- bolso lateral: uma costura, do lado da luz -->
    <path fill="none" stroke="{sand_sh}" stroke-width="3" d="M 249 396 C 243 412, 241 430, 242 446"/>

    <!-- TRONCO: pescoco, camiseta e gola alta descem juntos -->
    <g transform="translate(0 {DY})">
    <path fill="{SKIN}" d="M 184 141 L 184 187 C 184 197, 216 197, 216 187 L 216 141 Z"/>

    <!-- CAMISETA PRETA. Halo obrigatorio: preto sobre feltro preto some. -->
    {halo(TEE_D)}
    <path fill="{top}" d="{TEE_D}"/>
    <path fill="{top_sh}" stroke="none" opacity="0.7" d="M 139 234 C 142 207, 158 189, 178 182
      C 171 202, 166 250, 165 382 C 156 384, 148 382, 144 380 C 141 336, 139 282, 139 234 Z"/>
    <path fill="{top_lit}" stroke="none" opacity="0.7" d="M 222 182 C 242 189, 258 207, 261 234
      C 261 274, 259 336, 256 380 L 245 383 C 247 308, 244 226, 238 190 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="5" stroke-linejoin="round" d="{TEE_D}"/>

    <!-- GOLA ALTA da segunda pele, saindo por dentro da camiseta -->
    <path fill="{SLEEVE}" stroke="{INK}" stroke-width="5" stroke-linejoin="round"
      d="M 182 178 C 186 172, 214 172, 218 178 L 220 199 C 213 205, 187 205, 180 199 Z"/>
    <path fill="{SLEEVE_LIT}" stroke="none" opacity="0.45" d="M 210 174 C 215 175, 217 176, 218 178
      L 220 199 C 217 201, 214 202, 211 203 C 213 192, 212 181, 210 174 Z"/>
    <g fill="none" stroke="{SLEEVE_SH}" stroke-width="3" opacity="0.85">
      <path d="M 181 188 C 188 192, 212 192, 219 188"/>
      <path d="M 181 195 C 188 199, 212 199, 219 195"/>
    </g>
    </g>
  </g>

  <g transform="translate(-6 {DY})">{hand()}</g>
  <g transform="translate(6 {DY})">{hand(mirror=True)}</g>

  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">
{head(sw=SW, uid="mf-bd")}
  </g>
</svg>
'''


# ------------------------------------------ close dos tres pontos de prata
def face_detail():
    """Mesmo papel do `matheus-pulso.svg`, do `gabizinsky-anel.svg`, do
    `mafra-kitty-estampa.svg` e do `junior-cristal.svg`: o detalhe que some no
    tamanho de uso, mostrado no tamanho em que ele existe de verdade.

    Aqui e o lado esquerdo do rosto de quem olha, que e onde os tres pontos de
    prata dele aparecem juntos: a argola da sobrancelha, o aro dos oculos e a
    argola da orelha. A cabeca nao e redesenhada — e a MESMA funcao head(),
    ampliada 4,2x e com o traco pedido fino o bastante para que, depois da
    ampliacao, ele volte a espessura de um close.
    """
    k = 3.3
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Mufasa - a argola da sobrancelha, o aro dos oculos e a argola da orelha">
  <defs><clipPath id="mf-fc-clip"><circle cx="160" cy="160" r="150"/></clipPath></defs>
  <g clip-path="url(#mf-fc-clip)">
    <circle cx="160" cy="160" r="150" fill="{WOOD}"/>
    <ellipse cx="160" cy="150" rx="132" ry="128" fill="{WOOD_LIT}"/>
    <g transform="translate({160 - 106*k:.1f} {160 - 112*k:.1f}) scale({k})">
{head(sw=6.4/k, uid="mf-fc")}
    </g>
  </g>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{INK}" stroke-width="12"/>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{WARM}" stroke-width="6"/>
</svg>
'''


# --------------------------------------------------------------- alternativa
# "Quanto bege e bege" e a decisao dele que mais pode mudar depois — como a
# jeans do Mafra Kitty. Fica salva uma bermuda preta, que e o que ele veste na
# segunda foto de referencia. A bermuda nao aparece no busto: esta alternativa
# tem so corpo inteiro, igual a do Mafra Kitty.
BLACK_SHORTS = dict(sand="#3B3941", sand_sh="#2E2C34", sand_lit="#4C4A54")


files = {
    "mufasa-avatar.svg": avatar(),
    "mufasa-corpo-inteiro.svg": body(),
    "mufasa-prata.svg": face_detail(),
    "mufasa-alt-bermuda-preta-corpo-inteiro.svg": body(
        name="Mufasa (bermuda preta)", **BLACK_SHORTS),
}
for fname, content in files.items():
    with open(os.path.join(OUT, fname), "w", encoding="utf-8") as f:
        f.write(content)

halo_half = (SW * 1.45) / 2 * S
topo = HAIR_TOP * S + TY - halo_half
print("ok:", ", ".join(files))
print(f"topo do cabelo em y={topo:.1f} -> estatura {733 - topo:.0f} "
      f"(Mafra Kitty 703, Matheus 722)")
