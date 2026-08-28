# -*- coding: utf-8 -*-
"""Gabizinsky - personagem do jogo de cartas Cacamba. Estilo flat / cartoon.
Gera: avatar circular (busto), corpo inteiro e close da mao direita com o anel.
"""
import os
import sys

# A boca das expressoes e compartilhada: ver expressoes.py, ao lado.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from expressoes import boca

# Os SVGs ficam um nivel acima: este diretorio guarda so os geradores.
OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------- paleta
INK        = "#2A1B12"   # contorno / fundo escuro do jogo
WOOD       = "#7A4A2B"
WOOD_LIT   = "#8C5733"
WARM       = "#F2C14E"
CREAM      = "#F5F1E6"

SKIN       = "#F4CFAA"
SKIN_SH    = "#E0B189"
BLUSH      = "#E08A6A"

HAIR       = "#C6335A"   # vermelho vivo, cereja (foto). O mais ESCURO dos dois
                         # vermelhos do elenco: o rosa da Lyly esta 22 pontos de L* acima
HAIR_LIT   = "#DE5C7C"
BROW       = "#7A2438"   # sobrancelha fica escura, nao acompanha o cereja

SHIRT      = "#93BCD1"   # azul claro dessaturado
SHIRT_SH   = "#7099B1"
SHIRT_LIT  = "#AFCFDF"

SKIRT      = "#3B3330"   # preto quente "levantado" (nao #000)
SKIRT_SH   = "#2F2926"
SKIRT_LIT  = "#4E443C"
RIM        = "#8C6A45"   # luz de borda quente, separa do fundo escuro
SOCK       = "#E6DCC8"
BELT       = "#7A4A2B"
BELT_SH    = "#5E3A22"

SHOE       = "#23201E"
SHOE_W     = "#F5F1E6"   # branco quente (nao #FFF)
SHOE_W_SH  = "#CFC5B2"
SHOE_SOLE  = "#D9CDBA"

IRIS       = "#6B4227"   # castanho medio
MOLE       = "#5C2F1E"
LIP        = "#B03048"   # batom vermelho (Dri=ameixa, EstereX=rosa)

SILVER     = "#C9CDD2"
SILVER_LIT = "#EDEFF2"
SILVER_SH  = "#8D949B"
SILVER_MID = "#A9AFB5"
RUBY       = "#C6362F"
RUBY_LIT   = "#E4572E"
RUBY_SH    = "#95221E"


def heart(cx, cy, w):
    h = w
    return (f"M {cx} {cy+h*0.44} "
            f"C {cx-w*0.66} {cy+h*0.02} {cx-w*0.52} {cy-h*0.50} {cx} {cy-h*0.13} "
            f"C {cx+w*0.52} {cy-h*0.50} {cx+w*0.66} {cy+h*0.02} {cx} {cy+h*0.44} Z")


def chain_svg(x0, y0, x1, y1, sag, n):
    """Corrente de prata. Desenha primeiro um fio continuo e SO DEPOIS os elos:
    quando a arte encolhe e os elos somem, sobra a linha clara — a corrente
    continua cumprindo a funcao de cinto."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + sag
    base = (f'<path fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round" '
            f'd="M {x0} {y0} Q {cx} {cy} {x1} {y1}"/>'
            f'<path fill="none" stroke="{SILVER_SH}" stroke-width="6" stroke-linecap="round" '
            f'd="M {x0} {y0} Q {cx} {cy} {x1} {y1}"/>')
    links = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1
        if i % 2 == 0:                      # elo "de pe"
            rx, ry, fill = 2.7, 4.4, SILVER
        else:                               # elo "deitado"
            rx, ry, fill = 4.0, 2.8, SILVER_MID
        links.append(f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{rx}" ry="{ry}" '
                     f'fill="{fill}" stroke="{INK}" stroke-width="1.2"/>')
        if i % 6 == 0:                      # brilho pontual, nao em todo elo
            links.append(f'<ellipse cx="{x-0.7:.1f}" cy="{y-1.3:.1f}" rx="0.8" ry="1.4" '
                         f'fill="{SILVER_LIT}" stroke="none"/>')
    # berloque de coracao: devolve o unico ponto quente que o cinto de couro dava
    # e amarra a corrente ao anel dela
    charm = (f'<path fill="none" stroke="{SILVER_SH}" stroke-width="1.8" '
             f'd="M {cx} {cy+2} L {cx} {cy+6}"/>'
             f'<path fill="{RUBY}" stroke="{INK}" stroke-width="1.4" '
             f'd="{heart(cx, cy + 11, 10)}"/>'
             f'<circle cx="{cx-2.2:.1f}" cy="{cy+8.6:.1f}" r="1.1" fill="{CREAM}" '
             f'stroke="none" opacity="0.9"/>')
    return base + "".join(links) + charm


# ------------------------------------------------------- cabeca (partilhada)
def head(sw, mole_r, mole_ring=False, expr=None):
    """Cabeca+cabelo no sistema de coordenadas do avatar (256x256).
    sw = stroke-width ja compensado pela escala do grupo."""
    ring = ""
    if mole_ring:
        ring = f'<circle cx="100" cy="138" r="{mole_r+1.4:.2f}" fill="{SKIN}" stroke="none"/>'
    # A boca sai de expressoes.py quando ha expressao: a geometria e do JOGO
    # (o mesmo gesto no rosto de todo mundo) e a tinta continua sendo desta
    # personagem. Sem expressao, e a de descanso, palavra por palavra.
    boca_svg = boca(expr, sw, INK, LIP) if expr else (
        f"""<path fill="none" stroke="{LIP}" stroke-width="{sw*1.7:.2f}" stroke-linecap="round" d="M 113 145 C 121 157, 138 157, 146 144"/>""")

    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- cabelo: massa de tras (corte chanel na altura do queixo) -->
    <path fill="{HAIR}" d="M 128 26
      C 74 26, 56 66, 62 108
      C 64 140, 52 172, 49 208
      C 60 221, 84 221, 94 207
      C 89 176, 84 140, 86 110
      L 170 110
      C 172 140, 167 176, 162 207
      C 172 221, 196 221, 207 208
      C 204 172, 192 140, 194 108
      C 200 66, 182 26, 128 26 Z"/>

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

    <!-- RISCA AO MEIO (foto): testa a mostra, mechas emoldurando o rosto -->
    <path fill="{HAIR}" stroke="none" d="M 78 108
      C 84 80, 102 62, 122 58 L 128 66 L 134 58
      C 154 62, 172 80, 178 108
      C 186 52, 160 24, 128 24 C 96 24, 70 52, 78 108 Z"/>
    <path fill="{HAIR_LIT}" stroke="none" d="M 96 94
      C 102 76, 112 66, 124 61 L 127 65
      C 114 72, 105 82, 100 98 Z"/>
    <path fill="{HAIR_LIT}" stroke="none" d="M 160 94
      C 154 76, 144 66, 132 61 L 129 65
      C 142 72, 151 82, 156 98 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 78 108
      C 84 80, 102 62, 122 58 L 128 66 L 134 58
      C 154 62, 172 80, 178 108"/>

    <!-- sobrancelhas -->
    <path fill="none" stroke="{BROW}" stroke-width="{sw*1.25:.2f}" d="M 95 94 C 103 88, 116 88, 123 92"/>
    <path fill="none" stroke="{BROW}" stroke-width="{sw*1.25:.2f}" d="M 133 92 C 140 88, 153 88, 161 94"/>

    <!-- olhos (medios, castanhos) -->
    <g>
      <ellipse cx="108" cy="115" rx="12" ry="13" fill="{CREAM}"/>
      <circle  cx="109" cy="116" r="8.2" fill="{IRIS}" stroke="none"/>
      <circle  cx="109" cy="116" r="4.0" fill="{INK}"  stroke="none"/>
      <circle  cx="105.5" cy="112" r="2.6" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.7:.2f}" d="M 96 110 C 101 101, 116 101, 121 109"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.1:.2f}" stroke-linecap="round" d="M 97 109 L 90 103"/>
    </g>
    <g>
      <ellipse cx="150" cy="115" rx="12" ry="13" fill="{CREAM}"/>
      <circle  cx="149" cy="116" r="8.2" fill="{IRIS}" stroke="none"/>
      <circle  cx="149" cy="116" r="4.0" fill="{INK}"  stroke="none"/>
      <circle  cx="145.5" cy="112" r="2.6" fill="{CREAM}" stroke="none"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.7:.2f}" d="M 137 109 C 142 101, 157 101, 162 110"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.1:.2f}" stroke-linecap="round" d="M 161 109 L 168 103"/>
    </g>

    <!-- nariz -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 126 126 C 128 134, 133 136, 137 132"/>

    <!-- boca sorrindo -->
    {boca_svg}

    <!-- blush -->
    <ellipse cx="92"  cy="145" rx="12" ry="6.5" fill="{BLUSH}" opacity="0.28" stroke="none"/>
    <ellipse cx="164" cy="145" rx="12" ry="6.5" fill="{BLUSH}" opacity="0.28" stroke="none"/>

    <!-- SINAL / PINTA: olho DIREITO dela = esquerda de quem olha -->
    {ring}
    <circle cx="100" cy="138" r="{mole_r:.2f}" fill="{MOLE}" stroke="none"/>
  </g>'''


# --------------------------------------------------------------- mao (corpo)
def hand_right(sw):
    """Mao DIREITA dela = lado esquerdo de quem olha. Dorso da mao a vista,
    polegar do lado interno (direita, virado para o corpo).
    Dedos, da esquerda p/ direita: mindinho, anelar, medio, indicador."""
    return f'''
    <g stroke="{INK}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">
      <!-- dedos -->
      <g fill="none">
        <path stroke="{INK}"  stroke-width="12" d="M 113 444 L 113 470"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 113 444 L 113 470"/>
        <path stroke="{INK}"  stroke-width="12" d="M 123 444 L 123 479"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 123 444 L 123 479"/>
        <path stroke="{INK}"  stroke-width="12" d="M 133 444 L 133 483"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 133 444 L 133 483"/>
        <path stroke="{INK}"  stroke-width="12" d="M 143 444 L 143 475"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 143 444 L 143 475"/>
      </g>
      <!-- polegar (lado interno) -->
      <path fill="none" stroke="{INK}"  stroke-width="14" d="M 148 434 C 154 442, 155 450, 152 456"/>
      <path fill="none" stroke="{SKIN}" stroke-width="10" d="M 148 434 C 154 442, 155 450, 152 456"/>
      <!-- dorso da mao -->
      <path fill="{SKIN}" d="M 109 418 L 145 418 C 149 430, 149 442, 146 450
        C 138 455, 116 455, 109 450 C 106 442, 105 430, 109 418 Z"/>
      <!-- ANEL: dedo anelar (2o a partir da esquerda), mao direita.
           Escala anatomicamente honesta: ~13 x 9 unidades num quadro de 400. -->
      <g stroke="{INK}" stroke-width="1.6">
        <rect x="116.5" y="461" width="13" height="9" rx="2" fill="{SILVER}"/>
        <path fill="{SILVER_SH}" stroke="none" d="M 117.5 467.5 L 128.5 467.5 L 128.5 469 L 117.5 469 Z"/>
        <path fill="{RUBY}" d="{heart(123, 458, 10)}"/>
        <circle cx="120.6" cy="456.2" r="1.1" fill="{CREAM}" stroke="none" opacity="0.9"/>
      </g>
    </g>'''


def hand_left(sw):
    """Mao esquerda dela (direita de quem olha), sem anel. Espelhada."""
    return f'''
    <g transform="translate(400 0) scale(-1 1)" stroke="{INK}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">
      <g fill="none">
        <path stroke="{INK}"  stroke-width="12" d="M 113 444 L 113 470"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 113 444 L 113 470"/>
        <path stroke="{INK}"  stroke-width="12" d="M 123 444 L 123 479"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 123 444 L 123 479"/>
        <path stroke="{INK}"  stroke-width="12" d="M 133 444 L 133 483"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 133 444 L 133 483"/>
        <path stroke="{INK}"  stroke-width="12" d="M 143 444 L 143 475"/>
        <path stroke="{SKIN}" stroke-width="8"  d="M 143 444 L 143 475"/>
      </g>
      <path fill="none" stroke="{INK}"  stroke-width="14" d="M 148 434 C 154 442, 155 450, 152 456"/>
      <path fill="none" stroke="{SKIN}" stroke-width="10" d="M 148 434 C 154 442, 155 450, 152 456"/>
      <path fill="{SKIN}" d="M 109 418 L 145 418 C 149 430, 149 442, 146 450
        C 138 455, 116 455, 109 450 C 106 442, 105 430, 109 418 Z"/>
    </g>'''


# ------------------------------------------------------------------ avatar
def avatar(variant):
    if variant == "cropped":
        # ombro caido, decote canoa (mais largo e mais raso)
        yoke = ('M 20 262 C 24 218, 62 198, 92 190 L 164 190 '
                'C 194 198, 232 218, 236 262 Z')
        neck = 'M 98 191 C 100 216, 156 216, 158 191 Z'
        rim  = 'M 102 195 C 106 212, 150 212, 154 195'
        extra = (f'<path fill="none" stroke="{SHIRT_SH}" stroke-width="4" '
                 f'd="M 74 200 C 68 222, 64 242, 63 262 M 182 200 '
                 f'C 188 222, 192 242, 193 262"/>')
    else:
        # body: justo, ombro no lugar, decote redondo (mais fechado e fundo)
        yoke = ('M 20 262 C 24 216, 64 194, 100 186 L 156 186 '
                'C 192 194, 232 216, 236 262 Z')
        neck = 'M 107 187 C 109 222, 147 222, 149 187 Z'
        rim  = 'M 111 191 C 114 218, 142 218, 145 191'
        extra = ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="Gabizinsky - avatar ({variant})">
  <defs><clipPath id="gabizinsky-avatar-clip"><circle cx="128" cy="128" r="120"/></clipPath></defs>

  <g clip-path="url(#gabizinsky-avatar-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- pescoco -->
      <path fill="{SKIN}" d="M 110 148 L 110 196 C 110 208, 146 208, 146 196 L 146 148 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 150 C 122 172, 136 172, 146 152 L 146 150 L 110 150 Z"/>

      <!-- ombros / peca de cima -->
      <path fill="{SHIRT}" d="{yoke}"/>
      <path fill="{SHIRT_SH}" stroke="none" d="M 20 262 C 24 220, 56 200, 88 192 C 60 208, 40 232, 36 262 Z"/>
      {extra}

      <!-- decote -->
      <path fill="{SKIN}" d="{neck}"/>
      <path fill="none" stroke="{SHIRT_LIT}" stroke-width="4" d="{rim}"/>
    </g>
{head(sw=5, mole_r=4.3, mole_ring=True)}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
HEM = ("C 130 508, 146 502, 158 508 "
       "C 172 514, 186 506, 200 510 "
       "C 214 514, 228 514, 242 508 "
       "C 254 502, 270 508, 282 494")


def body(variant, shoe="preto", expr=None):
    if shoe == "branco":
        sh_f, sh_sole, sh_line, sh_rim = SHOE_W, SHOE_W_SH, INK, None
    else:
        sh_f, sh_sole, sh_line, sh_rim = SHOE, SHOE_SOLE, CREAM, RIM
    s = 0.88
    tx = 200 - 128 * s
    ty = 132 - 108 * s
    sw = 5 / s

    # manga curta: mesma curva do braco, truncada (de Casteljau) -> veste o
    # braco em vez de virar um balao solto na ponta
    if variant == "cropped":
        sl = "M 146 236 C 139.88 255.04, 135.15 275.00, 131.76 295.50"
        sr = "M 254 236 C 260.12 255.04, 264.85 275.00, 268.24 295.50"
        sleeve_w = 41
        midriff = (f'<path fill="{SKIN}" d="M 154 292 L 246 292 '
                   f'C 248 320, 248 344, 247 362 L 153 362 '
                   f'C 152 344, 152 320, 154 292 Z"/>')
        skirt_d = ("M 152 352 C 146 400, 134 450, 118 494 " + HEM +
                   " C 266 450, 254 400, 248 352 Z")
        skirt_sh = ("M 152 352 C 146 400, 134 450, 118 494 "
                    "C 128 508, 140 503, 148 506 "
                    "C 154 455, 162 400, 166 352 Z")
        skirt_lit = ("M 248 352 C 254 400, 266 450, 282 494 "
                     "C 272 502, 262 505, 254 505 "
                     "C 248 455, 240 400, 236 352 Z")
        pleats = ("M 172 360 L 152 504 M 190 360 L 184 508 "
                  "M 210 360 L 216 508 M 228 360 L 248 504")
        rim_r = "M 245 360 C 254 404, 264 452, 278 490"
        rim_l = "M 155 360 C 146 404, 136 452, 122 490"
        # cos alto, sem cinto: pesponto quente quebra o preto
        waist = (f'<path fill="{SKIRT_SH}" stroke="none" d="M 152 352 L 248 352 '
                 f'C 249 362, 249 370, 250 376 L 150 376 '
                 f'C 151 370, 151 362, 152 352 Z"/>'
                 f'<path fill="none" stroke="{RIM}" stroke-width="2.5" '
                 f'stroke-dasharray="7 5" d="M 157 370 L 243 370"/>')
        torso = f'''<path fill="{SHIRT}" d="M 143 244
      C 145 226, 160 210, 178 206
      L 222 206
      C 240 210, 255 226, 257 244
      C 259 274, 254 300, 250 318
      C 232 328, 168 328, 150 318
      C 146 300, 141 274, 143 244 Z"/>
    <path fill="{SHIRT_SH}" stroke="none" d="M 143 244 C 145 228, 158 212, 174 207 C 160 226, 154 266, 157 322 L 150 318 C 146 300, 141 274, 143 244 Z"/>
    <path fill="none" stroke="{SHIRT_LIT}" stroke-width="4" d="M 157 311 C 175 320, 225 320, 243 311"/>
    <!-- decote canoa -->
    <path fill="{SKIN}" d="M 172 207 C 174 233, 226 233, 228 207 Z"/>
    <path fill="none" stroke="{SHIRT_LIT}" stroke-width="4" d="M 177 211 C 182 228, 218 228, 223 211"/>'''
    else:
        sl = "M 146 236 C 140.96 251.68, 136.86 268.00, 133.68 284.71"
        sr = "M 254 236 C 259.04 251.68, 263.14 268.00, 266.32 284.71"
        sleeve_w = 38
        midriff = ""
        skirt_d = ("M 148 372 C 142 406, 132 448, 118 494 " + HEM +
                   " C 273 448, 263 406, 254 372 Z")
        skirt_sh = ("M 148 372 C 142 406, 132 448, 118 494 "
                    "C 128 508, 140 503, 148 506 "
                    "C 152 460, 157 410, 160 372 Z")
        skirt_lit = ("M 252 372 C 258 406, 268 448, 282 494 "
                     "C 272 502, 262 505, 254 505 "
                     "C 250 460, 245 410, 244 372 Z")
        pleats = ("M 170 380 L 152 504 M 190 380 L 184 508 "
                  "M 210 380 L 216 508 M 230 380 L 248 504")
        rim_r = "M 249 380 C 256 416, 266 456, 278 490"
        rim_l = "M 151 380 C 144 416, 134 456, 122 490"
        # cinto de couro quente + fivela ambar: unico ponto quente da metade
        # de baixo e quebra horizontal da massa preta
        waist = chain_svg(150, 374, 250, 374, sag=9, n=17)
        torso = f'''<path fill="{SHIRT}" d="M 143 244
      C 145 226, 160 210, 178 206
      L 222 206
      C 240 210, 255 226, 257 244
      C 259 272, 250 296, 246 320
      C 245 348, 249 370, 251 390
      L 149 390
      C 151 370, 155 348, 154 320
      C 150 296, 141 272, 143 244 Z"/>
    <path fill="{SHIRT_SH}" stroke="none" d="M 143 244 C 145 228, 158 212, 174 207 C 160 226, 154 262, 155 320 C 154 350, 158 372, 160 390 L 149 390 C 151 370, 155 348, 154 320 C 150 296, 141 272, 143 244 Z"/>
    <!-- decote redondo -->
    <path fill="{SKIN}" d="M 180 207 C 182 241, 218 241, 220 207 Z"/>
    <path fill="none" stroke="{SHIRT_LIT}" stroke-width="4" d="M 185 211 C 188 236, 212 236, 215 211"/>'''

    socks = (f'<path fill="{SOCK}" d="M 157 662 L 189 662 L 189 690 L 157 690 Z"/>'
             f'<path fill="{SOCK}" d="M 243 662 L 211 662 L 211 690 L 243 690 Z"/>'
             if shoe != "branco" else '')
    rimL = (f'<path fill="none" stroke="{RIM}" stroke-width="3.5" d="M 186 688 C 187 700, 187 710, 186 716"/>'
            if sh_rim else '')
    rimR = (f'<path fill="none" stroke="{RIM}" stroke-width="3.5" d="M 258 688 C 262 698, 272 708, 280 713"/>'
            if sh_rim else '')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="Gabizinsky - corpo inteiro ({variant})">
  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- BRACOS (atras do tronco) -->
    <g fill="none" stroke-linecap="round">
      <path stroke="{INK}"  stroke-width="41" d="M 146 236 C 128 292, 122 356, 127 418"/>
      <path stroke="{SKIN}" stroke-width="32" d="M 146 236 C 128 292, 122 356, 127 418"/>
      <path stroke="{INK}"  stroke-width="41" d="M 254 236 C 272 292, 278 356, 273 418"/>
      <path stroke="{SKIN}" stroke-width="32" d="M 254 236 C 272 292, 278 356, 273 418"/>
      <!-- manga curta -->
      <path stroke="{INK}"   stroke-width="{sleeve_w+9}" d="{sl}"/>
      <path stroke="{SHIRT}" stroke-width="{sleeve_w}"   d="{sl}"/>
      <path stroke="{INK}"   stroke-width="{sleeve_w+9}" d="{sr}"/>
      <path stroke="{SHIRT}" stroke-width="{sleeve_w}"   d="{sr}"/>
    </g>

    <!-- barriga (so no cropped) -->
    {midriff}

    <!-- PERNAS nuas (a saia para acima do joelho) -->
    <path fill="{SKIN}" d="M 152 376
      C 146 420, 150 470, 155 512
      C 160 552, 156 600, 158 648
      C 159 668, 160 680, 160 692
      L 187 692
      C 187 680, 186 668, 186 648
      C 185 600, 184 552, 188 512
      C 193 470, 196 420, 196 376 Z"/>
    <path fill="{SKIN}" d="M 248 376
      C 254 420, 250 470, 245 512
      C 240 552, 244 600, 242 648
      C 241 668, 240 680, 240 692
      L 213 692
      C 213 680, 214 668, 214 648
      C 215 600, 216 552, 212 512
      C 207 470, 204 420, 204 376 Z"/>
    <path fill="{SKIN_SH}" stroke="none" d="M 152 376 C 147 430, 151 500, 156 560 C 160 620, 158 670, 160 692 L 168 692 C 166 660, 166 610, 163 560 C 159 500, 156 430, 160 376 Z"/>

    <!-- MEIA SOQUETE: so no tenis preto -->
    {socks}

    <!-- TENIS PRETOS -->
    <g>
      <path fill="{sh_f}" d="M 139 682 L 189 682 L 190 706
        C 190 720, 180 728, 162 728
        L 122 728 C 112 728, 110 717, 118 712 L 139 700 Z"/>
      <path fill="{sh_sole}" stroke="none" d="M 111 720 C 112 727, 119 728, 124 728 L 162 728 C 179 728, 189 721, 190 710 L 190 720 C 189 728, 179 733, 162 733 L 122 733 C 113 733, 109 727, 111 720 Z"/>
      <path fill="none" stroke="{sh_line}" stroke-width="4" d="M 146 694 L 168 700 M 143 706 L 166 712"/>
      {rimL}
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 111 721 C 112 728, 119 733, 124 733 L 162 733 C 180 733, 190 727, 190 718"/>
    </g>
    <g>
      <path fill="{sh_f}" d="M 261 682 L 211 682 L 210 706
        C 210 720, 220 728, 238 728
        L 278 728 C 288 728, 290 717, 282 712 L 261 700 Z"/>
      <path fill="{sh_sole}" stroke="none" d="M 289 720 C 288 727, 281 728, 276 728 L 238 728 C 221 728, 211 721, 210 710 L 210 720 C 211 728, 221 733, 238 733 L 278 733 C 287 733, 291 727, 289 720 Z"/>
      <path fill="none" stroke="{sh_line}" stroke-width="4" d="M 254 694 L 232 700 M 257 706 L 234 712"/>
      {rimR}
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 289 721 C 288 728, 281 733, 276 733 L 238 733 C 220 733, 210 727, 210 718"/>
    </g>

    <!-- pescoco -->
    <path fill="{SKIN}" d="M 184 168 L 184 214 C 184 224, 216 224, 216 214 L 216 168 Z"/>

    <!-- TRONCO / PECA DE CIMA -->
    {torso}

    <!-- SAIA PRETA (eva se, logo acima do joelho) -->
    <path fill="none" stroke="{RIM}" stroke-width="9" stroke-linejoin="round" opacity="0.8" d="{skirt_d}"/>
    <path fill="{SKIRT}" d="{skirt_d}"/>
    <path fill="{SKIRT_SH}" stroke="none" d="{skirt_sh}"/>
    <path fill="{SKIRT_LIT}" stroke="none" opacity="0.55" d="{skirt_lit}"/>
    <path fill="none" stroke="{SKIRT_SH}" stroke-width="3" d="{pleats}"/>
    <path fill="{SKIRT_LIT}" stroke="none" d="M 118 494 {HEM} L 281 486 C 269 500, 254 494, 242 500 C 228 506, 214 506, 200 502 C 186 498, 172 506, 158 500 C 146 494, 130 500, 119 486 Z"/>


    <!-- cos / cinto -->
    {waist}
  </g>
{hand_right(5)}
{hand_left(5)}

  <g transform="translate({tx:.2f} {ty:.2f}) scale({s})">
{head(sw=sw, mole_r=3.2, mole_ring=False, expr=expr)}
  </g>
</svg>
'''


# --------------------------------------------------- close da mao com o anel
def ring_detail():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320" role="img" aria-label="Gabizinsky - anel de prata com coracao vermelho, mao direita">
  <defs><clipPath id="gabizinsky-anel-clip"><circle cx="160" cy="160" r="150"/></clipPath></defs>

  <g clip-path="url(#gabizinsky-anel-clip)">
    <circle cx="160" cy="160" r="150" fill="{WOOD}"/>
    <ellipse cx="160" cy="150" rx="132" ry="128" fill="{WOOD_LIT}"/>

    <g stroke="{INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">

      <!-- antebraco nu (a peca de cima e de manga curta) -->
      <path fill="none" stroke="{INK}"   stroke-width="80" d="M 152 -20 C 150 20, 152 56, 156 86"/>
      <path fill="none" stroke="{SKIN}"  stroke-width="70" d="M 152 -20 C 150 20, 152 56, 156 86"/>

      <!-- dedos: mindinho, ANELAR, medio, indicador (esq -> dir) -->
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

      <!-- polegar, lado interno (direita, virado para o corpo) -->
      <path fill="none" stroke="{INK}"  stroke-width="44" d="M 216 120 C 240 132, 256 150, 262 172"/>
      <path fill="none" stroke="{SKIN}" stroke-width="36" d="M 216 120 C 240 132, 256 150, 262 172"/>

      <!-- dorso da mao -->
      <path fill="{SKIN}" d="M 106 108
        C 100 130, 100 158, 106 176
        C 132 190, 190 190, 216 174
        C 222 152, 222 126, 214 106
        C 190 92, 130 92, 106 108 Z"/>
      <!-- tendoes -->
      <g fill="none" stroke="{SKIN_SH}" stroke-width="5">
        <path d="M 122 126 L 120 168"/>
        <path d="M 152 122 L 151 172"/>
        <path d="M 182 122 L 184 172"/>
      </g>

      <!-- ANEL DE PRATA - dedo ANELAR da mao DIREITA -->
      <g stroke-width="4">
        <rect x="125" y="200" width="44" height="30" rx="7" fill="{SILVER}"/>
        <path fill="{SILVER_SH}" stroke="none" d="M 127 220 L 167 220 L 167 224 C 167 227, 164 229, 161 229 L 133 229 C 129 229, 127 227, 127 224 Z"/>
        <path fill="{SILVER_LIT}" stroke="none" d="M 131 204 L 137 204 L 137 226 L 131 226 Z" opacity="0.7"/>
        <!-- pedra em coracao -->
        <path fill="{RUBY}" d="{heart(147, 184, 50)}"/>
        <path fill="{RUBY_SH}" stroke="none" d="M 147 206 C 156 197, 166 188, 169 178 C 168 192, 159 202, 147 206 Z"/>
        <path fill="{CREAM}" stroke="none" opacity="0.8" d="M 136 172 C 131 177, 130 184, 133 189 C 131 182, 133 177, 139 174 Z"/>
      </g>
    </g>

    <!-- brilhos -->
    <g fill="{WARM}" stroke="none">
      <path d="M 92 172 L 96 186 L 110 190 L 96 194 L 92 208 L 88 194 L 74 190 L 88 186 Z" opacity="0.9"/>
      <path d="M 198 140 L 200 148 L 208 150 L 200 152 L 198 160 L 196 152 L 188 150 L 196 148 Z" opacity="0.7"/>
    </g>
  </g>

  <circle cx="160" cy="160" r="150" fill="none" stroke="{INK}" stroke-width="12"/>
  <circle cx="160" cy="160" r="150" fill="none" stroke="{WARM}" stroke-width="6"/>
</svg>
'''


# Tenis BRANCO e a versao canonica (le melhor contra o fundo escuro do jogo).
# A versao de tenis preto fica ao lado como alternativa.
files = {"gabizinsky-anel.svg": ring_detail()}
for v in ("body", "cropped"):
    files[f"gabizinsky-{v}-avatar.svg"] = avatar(v)
    files[f"gabizinsky-{v}-corpo-inteiro.svg"] = body(v, "branco")
    files[f"gabizinsky-{v}-corpo-inteiro-alt-tenis-preto.svg"] = body(v, "preto")
files["gabizinsky-avatar.svg"] = files["gabizinsky-body-avatar.svg"]
files["gabizinsky-corpo-inteiro.svg"] = files["gabizinsky-body-corpo-inteiro.svg"]

# alternativa: vermelho VINHO da descricao original
WINE = {HAIR: "#7C2434", HAIR_LIT: "#93303F", BROW: "#5E1A28"}


def to_wine(svg):
    for k, v in WINE.items():
        svg = svg.replace(k, v)
    return svg


files["gabizinsky-alt-vinho-avatar.svg"] = to_wine(files["gabizinsky-body-avatar.svg"])
files["gabizinsky-alt-vinho-corpo-inteiro.svg"] = to_wine(files["gabizinsky-body-corpo-inteiro.svg"])

# As expressoes: a mesma figura, outra boca. O cliente troca o arquivo por
# 1,9 s quando algo acontece com aquele jogador (REACOES, em client.js).
for _e in ("feliz", "bravo"):
    files[f"gabizinsky-corpo-inteiro-{_e}.svg"] = body("body", "branco", expr=_e)

for name, content in files.items():
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
print("ok:", ", ".join(files))
