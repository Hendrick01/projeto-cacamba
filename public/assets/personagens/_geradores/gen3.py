# -*- coding: utf-8 -*-
"""EstereX - terceira personagem do jogo de cartas Cacamba.
Mesma construcao das outras duas (busto em viewBox 256, corpo em 400x800,
cabeca em coordenadas locais 256), mesma moldura e mesma paleta.
Identidade: claro sobre claro, ancorado por cabelo preto + oculos.
E ~6% mais alta que a Gabizinsky e a Dri.
"""
import os

OUT = os.path.dirname(os.path.abspath(__file__))

# ------------------------------------------------------- paleta do jogo
INK        = "#2A1B12"
WOOD       = "#7A4A2B"
WOOD_LIT   = "#8C5733"
WARM       = "#F2C14E"
CREAM      = "#F5F1E6"
GREEN      = "#3A7D6E"   # verde-garrafa dessaturado do jogo
RIM        = "#8C6A45"   # mesma luz de borda quente do elenco

SKIN       = "#F0C89A"   # subtom mais dourado que o resto do elenco
SKIN_SH    = "#E0B189"
BLUSH      = "#E08A6A"

# ------------- escada de BRANCOS: mesmo metodo da Dri, no sentido inverso.
# Cada peca um degrau de valor E uma temperatura diferente.
BLOUSE     = "#C24A3B"   # cropped vermelho-terracota L* ~ 48 — o foco da figura
BLOUSE_SH  = "#A03A2F"
BLOUSE_LIT = "#D9664F"
SHOE       = "#E6E4DF"   # tenis  L* ~ 90, branco NEUTRO
SHOE_SH    = "#CFCCC5"
SHOE_SOLE  = "#B0ABA2"   # L* ~ 70, ancora a base do calcado
JEANS      = "#CDD3DC"   # jeans  L* ~ 83, branco FRIO (azulado)
JEANS_SH   = "#B2BAC6"
JEANS_LIT  = "#E3E8EE"
STITCH     = "#C0A075"   # pesponto quente: assina "jeans" sem escurecer

HAIR       = "#26242C"   # preto neutro-frio (o da Dri e violeta)
HAIR_LIT   = "#3B3945"   # brilho das ondas
BROW       = "#231F26"   # grossa e bem desenhada
IRIS       = "#2A2630"   # olhos PRETOS
PUPIL      = "#171520"
IRIS_RIM   = "#454050"
LIP        = "#B0303F"   # batom vermelho
LIP_SH     = "#7A2430"
TEETH      = "#F7F3EA"

GOLD       = "#C9A24E"   # ouro: oculos + todos os acessorios dela
GOLD_LIT   = "#E4C378"
GOLD_SH    = "#9A7A34"
FRAME      = GOLD
FRAME_SH   = GOLD_SH
LENS       = "#DCE6EE"

S = 0.88                       # mesma escala de cabeca das outras duas
TX = 200 - 128 * S
TY = -3.4                      # cabeca 40 unidades mais alta (ver README)
SW = 5 / S


# -------------------------------------------------------------- cabelo
# Um unico caminho fechado: linha do cabelo (franja cortina) + silhueta
# externa ondulada. Nada de "tampa" interna que possa vazar.


# ---- volume do cabelo parametrizado -------------------------------------
# spread = quanto a massa passa do rosto de cada lado (rosto = 78..178)
# top    = y da coroa (menor = mais alto = mais armado)
# tip    = y das pontas (menor = cobre menos ombro)
# taper  = quanto as pontas afinam (0 = ponta com a mesma largura do meio)
VOLUMES = {
    "A": dict(spread=46, top=18, tip=324, taper=0.18),   # atual
    "B": dict(spread=34, top=25, tip=302, taper=0.42),   # intermediario
    "C": dict(spread=24, top=31, tip=298, taper=0.60),   # bem reduzido (escolhido)
}
VOL = os.environ.get("EX_VOL", "C")
_v = VOLUMES[VOL]
SPREAD, TOPY, TIPY, TAPER = _v["spread"], _v["top"], _v["tip"], _v["taper"]

L  = 78 - SPREAD
R  = 178 + SPREAD
LT = 78 - SPREAD * (1 - TAPER) - 5
RT = 178 + SPREAD * (1 - TAPER) + 5
LI, RI = 86, 170

HAIR_BACK = (
    f"M 128 {TOPY} "
    f"C 72 {TOPY}, {L+3} {TOPY+38}, {L} 112 "
    f"C {L-5} 166, {L-3} 220, {L+4} 266 "
    f"C {L-1} {TIPY-40}, {LT+1:.0f} {TIPY-20}, {LT+6:.0f} {TIPY} "
    f"C {LT+16:.0f} {TIPY+5}, {LT+27:.0f} {TIPY-6}, {LT+31:.0f} {TIPY-24} "
    f"C {LT+28:.0f} {TIPY-86}, {LI+8} {TIPY-146}, 78 108 "
    f"L 178 108 "
    f"C {RI-8} {TIPY-146}, {RT-28:.0f} {TIPY-86}, {RT-31:.0f} {TIPY-24} "
    f"C {RT-27:.0f} {TIPY-6}, {RT-16:.0f} {TIPY+5}, {RT-6:.0f} {TIPY} "
    f"C {RT-1:.0f} {TIPY-20}, {R+1} {TIPY-40}, {R-4} 266 "
    f"C {R+3} 220, {R+5} 166, {R} 112 "
    f"C {R-3} {TOPY+38}, {184} {TOPY}, 128 {TOPY} Z")

# mechas frontais: abracam o rosto e AFUNILAM ate a ponta
FL_O, FL_OT = L + 12, LT + 8          # borda externa: topo e ponta
FR_O, FR_OT = R - 12, RT - 8
FTIP = TIPY - 10
# a ponta converge para ~7 unidades de largura, com raio pequeno: afunila
# de verdade em vez de terminar num bloco
FRONT_L = (
    f"M {FL_O} 108 C {FL_O-4} 158, {FL_O+2} 214, {FL_OT+3:.0f} 254 "
    f"C {FL_OT+5:.0f} {FTIP-24}, {FL_OT+8:.0f} {FTIP-10}, {FL_OT+13:.0f} {FTIP} "
    f"C {FL_OT+18:.0f} {FTIP-2}, {FL_OT+21:.0f} {FTIP-10}, {FL_OT+20:.0f} {FTIP-22} "
    f"C {FL_OT+17:.0f} 250, 93 196, 92 150 C 91 128, 90 114, 90 108 Z")
FRONT_R = (
    f"M {FR_O} 108 C {FR_O+4} 158, {FR_O-2} 214, {FR_OT-3:.0f} 254 "
    f"C {FR_OT-5:.0f} {FTIP-24}, {FR_OT-8:.0f} {FTIP-10}, {FR_OT-13:.0f} {FTIP} "
    f"C {FR_OT-18:.0f} {FTIP-2}, {FR_OT-21:.0f} {FTIP-10}, {FR_OT-20:.0f} {FTIP-22} "
    f"C {FR_OT-17:.0f} 250, 163 196, 164 150 C 165 128, 166 114, 166 108 Z")
FRONT_L_EDGE = (
    f"M 90 108 C 91 128, 92 150, 92 150 C 93 196, {FL_OT+17:.0f} 250, "
    f"{FL_OT+20:.0f} {FTIP-22} C {FL_OT+21:.0f} {FTIP-10}, {FL_OT+18:.0f} {FTIP-2}, "
    f"{FL_OT+13:.0f} {FTIP}")
FRONT_R_EDGE = (
    f"M 166 108 C 165 128, 164 150, 164 150 C 163 196, {FR_OT-17:.0f} 250, "
    f"{FR_OT-20:.0f} {FTIP-22} C {FR_OT-21:.0f} {FTIP-10}, {FR_OT-18:.0f} {FTIP-2}, "
    f"{FR_OT-13:.0f} {FTIP}")


def hair_back(sw, halo=False):
    h = ""
    if halo:
        h = (f'<path fill="none" stroke="{RIM}" stroke-width="{9/S:.2f}" '
             f'opacity="0.8" stroke-linejoin="round" d="{HAIR_BACK}"/>')
    return (h + f'<g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linejoin="round">'
            f'<path fill="{HAIR}" d="{HAIR_BACK}"/>'
            f'<path fill="{HAIR_LIT}" stroke="none" opacity="0.85" '
            f'd="M {L+10} 104 C {L+14} {TOPY+42}, {L+38} {TOPY+10}, {L+72} {TOPY+4} '
            f'C {L+48} {TOPY+22}, {L+26} {TOPY+50}, {L+22} 110 '
            f'C {L+18} 158, {L+22} 208, {L+30} 252 C {L+22} 250, {L+14} 212, {L+12} 168 Z"/>'
            f'<path fill="{HAIR_LIT}" stroke="none" opacity="0.5" '
            f'd="M {R-10} 104 C {R-14} {TOPY+42}, {R-38} {TOPY+10}, {R-72} {TOPY+4} '
            f'C {R-48} {TOPY+22}, {R-26} {TOPY+50}, {R-22} 110 '
            f'C {R-18} 158, {R-22} 208, {R-30} 252 C {R-22} 250, {R-14} 212, {R-12} 168 Z"/></g>')


def gold_chain(cx, y, half, thread, link, n=13):
    out = [f'<path fill="none" stroke="{INK}" stroke-width="{thread*2:.2f}" stroke-linecap="round" '
           f'd="M {cx-half} {y} Q {cx} {y+half*0.42:.1f} {cx+half} {y}"/>',
           f'<path fill="none" stroke="{GOLD_SH}" stroke-width="{thread:.2f}" stroke-linecap="round" '
           f'd="M {cx-half} {y} Q {cx} {y+half*0.42:.1f} {cx+half} {y}"/>']
    for i in range(n + 1):
        t = i / n
        x = (1-t)**2*(cx-half) + 2*(1-t)*t*cx + t**2*(cx+half)
        yy = (1-t)**2*y + 2*(1-t)*t*(y+half*0.42) + t**2*y
        rx, ry, f = ((link*0.62, link, GOLD) if i % 2 == 0 else (link*0.92, link*0.62, GOLD_LIT))
        out.append(f'<ellipse cx="{x:.1f}" cy="{yy:.1f}" rx="{rx:.2f}" ry="{ry:.2f}" '
                   f'fill="{f}" stroke="{INK}" stroke-width="{link*0.34:.2f}"/>')
    return "".join(out)


def snake(cx, cy, s=1.0):
    """Bracelete de serpente no antebraco: tres voltas + cabeca com olho.
    Acessorio mais identitario dela."""
    return f'''<g transform="translate({cx} {cy}) scale({s})" stroke="{INK}" stroke-width="{2.2/s:.2f}" stroke-linejoin="round">
      <path fill="{GOLD}" d="M -16 -12 C -6 -18, 6 -18, 16 -12 C 6 -6, -6 -6, -16 -12 Z"/>
      <path fill="{GOLD_SH}" stroke="none" d="M -14 -10 C -5 -6, 5 -6, 14 -10 C 5 -5, -5 -5, -14 -10 Z"/>
      <path fill="{GOLD}" d="M -16 -1 C -6 -7, 6 -7, 16 -1 C 6 5, -6 5, -16 -1 Z"/>
      <path fill="{GOLD_SH}" stroke="none" d="M -14 1 C -5 5, 5 5, 14 1 C 5 6, -5 6, -14 1 Z"/>
      <path fill="{GOLD}" d="M -16 10 C -6 4, 6 4, 16 10 C 6 16, -6 16, -16 10 Z"/>
      <path fill="{GOLD}" d="M 13 8 C 20 8, 24 13, 22 18 C 20 22, 13 22, 11 17 Z"/>
      <circle cx="18" cy="14" r="1.9" fill="{INK}" stroke="none"/>
      <path fill="{GOLD_LIT}" stroke="none" d="M -12 -13 C -5 -16, 4 -16, 11 -13 C 4 -14, -5 -14, -12 -13 Z"/>
    </g>'''


def glasses(sw, uid, fw=3.1):
    """Oculos de grau, armacao feminina levemente gatinho.
    Tres decisoes para nao virar borrao a 48px:
      1. armacao em tartaruga quente (#8A5A3A), NAO no preto do contorno;
      2. traco mais fino que o contorno da personagem;
      3. reflexo diagonal claro na lente — e ele que diz "vidro" quando os
         detalhes somem."""
    lens_l = "M 82 103 C 82 98, 85 96, 90 96 L 121 96 C 125 96, 127 98, 127 102 L 127 125 C 127 130, 124 132, 119 132 L 88 132 C 84 132, 82 129, 82 124 Z"
    lens_r = "M 174 103 C 174 98, 171 96, 166 96 L 135 96 C 131 96, 129 98, 129 102 L 129 125 C 129 130, 132 132, 137 132 L 168 132 C 172 132, 174 129, 174 124 Z"
    return f'''
    <defs>
      <clipPath id="{uid}-ll"><path d="{lens_l}"/></clipPath>
      <clipPath id="{uid}-lr"><path d="{lens_r}"/></clipPath>
    </defs>
    <path d="{lens_l}" fill="{LENS}" opacity="0.09" stroke="none"/>
    <path d="{lens_r}" fill="{LENS}" opacity="0.09" stroke="none"/>
    <g clip-path="url(#{uid}-ll)" stroke="{CREAM}" fill="none" opacity="0.38" stroke-linecap="round">
      <path stroke-width="{fw*1.5:.2f}" d="M 87 110 L 97 98"/>
    </g>
    <g clip-path="url(#{uid}-lr)" stroke="{CREAM}" fill="none" opacity="0.38" stroke-linecap="round">
      <path stroke-width="{fw*1.5:.2f}" d="M 135 110 L 145 98"/>
    </g>
    <g fill="none" stroke="{GOLD}" stroke-width="{fw:.2f}" stroke-linecap="round" stroke-linejoin="round">
      <path d="{lens_l}"/>
      <path d="{lens_r}"/>
      <path d="M 127 104 L 129 104"/>
      <path d="M 82 104 C 78 105, 75 107, 72 110"/>
      <path d="M 174 104 C 178 105, 181 107, 184 110"/>
    </g>
    <g fill="none" stroke="{GOLD_LIT}" stroke-width="{fw*0.45:.2f}" stroke-linecap="round">
      <path d="M 86 99 L 118 98"/>
      <path d="M 170 99 L 138 98"/>
    </g>
'''


def head(sw, uid):
    return f'''
  <g stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" stroke-linejoin="round">

    <!-- orelhas -->
    <ellipse cx="76"  cy="114" rx="9" ry="12" fill="{SKIN}"/>
    <ellipse cx="180" cy="114" rx="9" ry="12" fill="{SKIN}"/>

    <!-- rosto -->
    <path fill="{SKIN}" d="M 78 98
      C 78 60, 99 46, 128 46
      C 157 46, 178 60, 178 98
      C 178 130, 168 155, 150 162
      C 143 165, 113 165, 106 162
      C 88 155, 78 130, 78 98 Z"/>

    <!-- linha do cabelo: RISCA LATERAL (foto) -->
    <path fill="{HAIR}" stroke="none" d="M 76 112
      C 80 82, 94 62, 114 56 L 122 68
      C 148 60, 172 78, 180 112
      C 188 50, 158 18, 128 18 C 92 18, 66 50, 76 112 Z"/>
    <path fill="{HAIR_LIT}" stroke="none" d="M 96 84 C 102 68, 110 60, 120 57
      L 122 62 C 112 68, 104 78, 100 90 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 76 112
      C 80 82, 94 62, 114 56 L 122 68
      C 148 60, 172 78, 180 112"/>

    <!-- sobrancelhas suavemente arqueadas -->
    <path fill="{BROW}" stroke="none" d="M 94 91 C 101 83, 114 82, 123 87
      C 122.5 89.5, 121 90.5, 119 89.8 C 111 86, 102 87, 96.5 93 Z"/>
    <path fill="{BROW}" stroke="none" d="M 162 91 C 155 83, 142 82, 133 87
      C 133.5 89.5, 135 90.5, 137 89.8 C 145 86, 154 87, 159.5 93 Z"/>

    <!-- olhos PRETOS (precisam de brilho grande para nao virarem buraco) -->
    <g>
      <ellipse cx="108" cy="115" rx="12" ry="12.5" fill="{CREAM}"/>
      <circle cx="109" cy="116" r="8.4" fill="{IRIS}" stroke="{IRIS_RIM}" stroke-width="1.3"/>
      <circle cx="109" cy="116" r="3.6" fill="{PUPIL}" stroke="none"/>
      <circle cx="105.6" cy="111.8" r="2.9" fill="{CREAM}" stroke="none"/>
      <circle cx="112.5" cy="119.5" r="1.4" fill="{CREAM}" stroke="none" opacity="0.8"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 97 109 C 102 102, 115 102, 120 110"/>
    </g>
    <g>
      <ellipse cx="150" cy="115" rx="12" ry="12.5" fill="{CREAM}"/>
      <circle cx="149" cy="116" r="8.4" fill="{IRIS}" stroke="{IRIS_RIM}" stroke-width="1.3"/>
      <circle cx="149" cy="116" r="3.6" fill="{PUPIL}" stroke="none"/>
      <circle cx="145.6" cy="111.8" r="2.9" fill="{CREAM}" stroke="none"/>
      <circle cx="152.5" cy="119.5" r="1.4" fill="{CREAM}" stroke="none" opacity="0.8"/>
      <path fill="none" stroke="{INK}" stroke-width="{sw*1.2:.2f}" d="M 138 110 C 143 102, 156 102, 161 109"/>
    </g>

    <!-- nariz -->
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" d="M 126 126 C 128 134, 133 136, 137 132"/>

    <!-- SORRISO LARGO E ABERTO: a expressao mais calorosa do elenco -->
    <path fill="{LIP_SH}" stroke="{INK}" stroke-width="{sw*0.8:.2f}" d="M 112 143
      C 119 139, 137 139, 144 143 C 143 155, 136 161, 128 161
      C 120 161, 113 155, 112 143 Z"/>
    <path fill="{TEETH}" stroke="none" d="M 115 145 C 121 142.5, 135 142.5, 141 145
      C 140.5 149.5, 115.5 149.5, 115 145 Z"/>
    <path fill="none" stroke="{LIP}" stroke-width="{sw*1.0:.2f}" stroke-linecap="round"
      d="M 112 143 C 119 139, 137 139, 144 143"/>
    <path fill="none" stroke="{LIP}" stroke-width="{sw*1.3:.2f}" stroke-linecap="round"
      d="M 114 152 C 120 160, 136 160, 142 152"/>

    <!-- blush -->
    <ellipse cx="92"  cy="132" rx="11" ry="5.5" fill="{BLUSH}" opacity="0.26" stroke="none"/>
    <ellipse cx="164" cy="132" rx="11" ry="5.5" fill="{BLUSH}" opacity="0.26" stroke="none"/>
    <!-- MECHAS FRONTAIS: duas massas largas, SEM contorno interno.
         A separacao e sugerida so por variacao de tom. -->
    <path fill="{HAIR}" stroke="none" d="{FRONT_L}"/>
    <path fill="{HAIR}" stroke="none" d="{FRONT_R}"/>
    <path fill="{HAIR_LIT}" stroke="none" opacity="0.7" d="M {FL_O+5} 126
      C {FL_O+1} 178, {FL_O+7} 230, {FL_OT+13:.0f} 274
      C {FL_OT+8:.0f} {FTIP-26}, {FL_OT+11:.0f} {FTIP-12}, {FL_OT+15:.0f} {FTIP-4}
      C {FL_OT+18:.0f} {FTIP-8}, {FL_OT+19:.0f} {FTIP-14}, {FL_OT+18:.0f} {FTIP-22}
      C {FL_OT+14:.0f} 248, {FL_O+13} 200, {FL_O+13} 156
      C {FL_O+12} 136, {FL_O+11} 130, {FL_O+11} 126 Z"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" d="{FRONT_L_EDGE}"/>
    <path fill="none" stroke="{INK}" stroke-width="{sw:.2f}" stroke-linecap="round" d="{FRONT_R_EDGE}"/>

    <!-- argolas pequenas douradas -->
    <path fill="none" stroke="{GOLD}" stroke-width="{sw*0.55:.2f}" d="M 76 124 C 71 126, 71 133, 76 134"/>
    <path fill="none" stroke="{GOLD}" stroke-width="{sw*0.55:.2f}" d="M 180 124 C 185 126, 185 133, 180 134"/>
{glasses(sw, uid, fw=sw*0.62)}
  </g>'''


# ------------------------------------------------------ estampa original
def star(x, y, r):
    return (f"M {x} {y-r} Q {x+r*0.20:.1f} {y-r*0.20:.1f} {x+r} {y} "
            f"Q {x+r*0.20:.1f} {y+r*0.20:.1f} {x} {y+r} "
            f"Q {x-r*0.20:.1f} {y+r*0.20:.1f} {x-r} {y} "
            f"Q {x-r*0.20:.1f} {y-r*0.20:.1f} {x} {y-r} Z")


def anime_print(cx, cy, sc=1.0):
    """Estampa ORIGINAL no vocabulario visual do genero. Nao cita obra nenhuma:
    e um olho estilizado dentro de um emblema circular, linhas de velocidade
    e brilhos de quatro pontas. Sem texto, sem glifo, sem personagem."""
    return f'''<g transform="translate({cx} {cy}) scale({sc})">
      <!-- linhas de velocidade -->
      <g stroke="{INK}" stroke-linecap="round" fill="none">
        <path stroke-width="4"   d="M -32 -20 L -50 -25"/>
        <path stroke-width="4.5" d="M -34  -4 L -56  -4"/>
        <path stroke-width="3.5" d="M -32  12 L -50  17"/>
        <path stroke-width="3.5" d="M  32 -16 L  46 -20"/>
        <path stroke-width="4"   d="M  34   0 L  52   0"/>
        <path stroke-width="3"   d="M  32  15 L  46  19"/>
      </g>
      <!-- emblema -->
      <circle cx="0" cy="0" r="23" fill="{GREEN}" stroke="{INK}" stroke-width="3.5"/>
      <!-- olho estilizado -->
      <path fill="{CREAM}" stroke="none" d="M -15 1 C -10 -10, 9 -12, 15 -2
        C 10 9, -9 10, -15 1 Z"/>
      <circle cx="1" cy="-1" r="7" fill="{INK}" stroke="none"/>
      <circle cx="-1.6" cy="-3.6" r="2.8" fill="{CREAM}" stroke="none"/>
      <circle cx="3.4" cy="1.8" r="1.4" fill="{CREAM}" stroke="none" opacity="0.85"/>
      <path fill="none" stroke="{INK}" stroke-width="4.4" stroke-linecap="round"
        d="M -16 -1 C -11 -13, 9 -15, 16 -3"/>
      <path fill="none" stroke="{INK}" stroke-width="3.6" stroke-linecap="round"
        d="M 15 -3 L 21 -8"/>
      <path fill="none" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"
        d="M -12 5 C -7 10, 3 10, 9 6"/>
      <!-- brilhos -->
      <path fill="{WARM}" stroke="none" d="{star(28, -27, 9)}"/>
      <path fill="{WARM}" stroke="none" d="{star(-26, 28, 6)}"/>
    </g>'''


# ------------------------------------------------------------------ avatar
def avatar():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="EstereX - avatar">
  <defs><clipPath id="ex-avatar-clip"><circle cx="128" cy="128" r="120"/></clipPath></defs>

  <g clip-path="url(#ex-avatar-clip)">
    <circle cx="128" cy="128" r="120" fill="{WOOD}"/>
    <ellipse cx="128" cy="122" rx="106" ry="102" fill="{WOOD_LIT}"/>

    {hair_back(5)}

    <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <!-- pescoco (mais longo: ela e a mais alta do elenco) -->
      <path fill="{SKIN}" d="M 110 144 L 110 198 C 110 210, 146 210, 146 198 L 146 144 Z"/>
      <path fill="{SKIN_SH}" stroke="none" d="M 110 146 C 122 168, 136 168, 146 148 L 146 146 L 110 146 Z"/>

      <!-- ombros / blusa -->
      <path fill="{BLOUSE}" d="M 18 262
        C 22 214, 62 192, 100 184
        L 156 184
        C 194 192, 234 214, 238 262 Z"/>
      <path fill="{BLOUSE_SH}" stroke="none" d="M 18 262 C 22 218, 54 198, 88 190 C 58 206, 38 232, 34 262 Z"/>
      <path fill="{BLOUSE_LIT}" stroke="none" opacity="0.5" d="M 156 184 C 196 192, 232 214, 238 262 L 226 262 C 218 220, 188 200, 152 192 Z"/>

      <!-- decote em V -->
      <path fill="{SKIN}" d="M 102 184 C 106 228, 150 228, 154 184 Z"/>
      <path fill="none" stroke="{BLOUSE_LIT}" stroke-width="4" d="M 107 188 C 111 223, 145 223, 149 188"/>
      {gold_chain(128, 196, 22, 2.8, 2.5)}
    </g>

{head(sw=5, uid="ex-av")}
  </g>

  <circle cx="128" cy="128" r="120" fill="none" stroke="{INK}" stroke-width="10"/>
  <circle cx="128" cy="128" r="120" fill="none" stroke="{WARM}" stroke-width="5"/>
</svg>
'''


# ------------------------------------------------------------- corpo inteiro
JEANS_D = ("M 146 322 C 140 400, 139 500, 143 604 "
           "C 145 650, 147 678, 148 694 L 185 694 "
           "C 186 660, 188 604, 191 530 C 194 470, 197 430, 200 408 "
           "C 203 430, 206 470, 209 530 C 212 604, 214 660, 215 694 "
           "L 252 694 C 253 678, 255 650, 257 604 "
           "C 261 500, 260 400, 254 322 Z")
TEE_D = ("M 142 210 C 144 190, 158 176, 176 170 L 224 170 "
         "C 242 176, 256 190, 258 210 C 260 240, 256 266, 252 286 "
         "C 232 296, 168 296, 148 286 C 144 266, 140 240, 142 210 Z")
SHOE_L = ("M 139 682 L 189 682 L 190 706 C 190 720, 180 728, 162 728 "
          "L 122 728 C 112 728, 110 717, 118 712 L 139 700 Z")
SHOE_R = ("M 261 682 L 211 682 L 210 706 C 210 720, 220 728, 238 728 "
          "L 278 728 C 288 728, 290 717, 282 712 L 261 700 Z")


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
                f'<rect x="130.5" y="{461+dy}" width="11" height="7" rx="2" fill="{GOLD}"/>'
                f'<path fill="{GOLD_LIT}" stroke="none" d="M 117.5 {460.5+dy} L 128.5 {460.5+dy} L 128.5 {462+dy} L 117.5 {462+dy} Z"/>'
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


def body():
    sl = "M 146 200 C 140.60 218.60, 136.19 238.10, 132.77 258.18"
    sr = "M 254 200 C 259.40 218.60, 263.81 238.10, 267.23 258.18"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800" width="400" height="800" role="img" aria-label="EstereX - corpo inteiro">

  <!-- cabelo de tras: volumoso, com halo quente -->
  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">{hair_back(SW, halo=True)}</g>

  <g stroke="{INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">

    <!-- BRACOS (mais longos: +6% de estatura vai quase todo em membro) -->
    <g fill="none" stroke-linecap="round">
      <path stroke="{INK}"  stroke-width="41" d="M 146 200 C 128 262, 121 334, 125 404"/>
      <path stroke="{SKIN}" stroke-width="32" d="M 146 200 C 128 262, 121 334, 125 404"/>
      <path stroke="{INK}"  stroke-width="41" d="M 254 200 C 272 262, 279 334, 275 404"/>
      <path stroke="{SKIN}" stroke-width="32" d="M 254 200 C 272 262, 279 334, 275 404"/>
      <path stroke="{INK}"    stroke-width="50" d="{sl}"/>
      <path stroke="{BLOUSE}" stroke-width="41" d="{sl}"/>
      <path stroke="{INK}"    stroke-width="50" d="{sr}"/>
      <path stroke="{BLOUSE}" stroke-width="41" d="{sr}"/>
    </g>

    <!-- TENIS BRANCOS -->
    <g>
      <path fill="{SHOE}" d="{SHOE_L}"/>
      <path fill="{SHOE_SH}" stroke="none" d="M 139 700 L 118 712 C 110 717, 112 728, 122 728 L 140 728 C 134 720, 134 710, 139 700 Z"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 111 720 C 112 727, 119 728, 124 728 L 162 728 C 179 728, 189 721, 190 710 L 190 720 C 189 728, 179 733, 162 733 L 122 733 C 113 733, 109 727, 111 720 Z"/>
      <path fill="none" stroke="{FRAME}" stroke-width="4.5" d="M 145 694 L 168 700 M 142 706 L 166 712"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 111 721 C 112 728, 119 733, 124 733 L 162 733 C 180 733, 190 727, 190 718"/>
    </g>
    <g>
      <path fill="{SHOE}" d="{SHOE_R}"/>
      <path fill="{SHOE_SH}" stroke="none" d="M 261 700 L 282 712 C 290 717, 288 728, 278 728 L 260 728 C 266 720, 266 710, 261 700 Z"/>
      <path fill="{SHOE_SOLE}" stroke="none" d="M 289 720 C 288 727, 281 728, 276 728 L 238 728 C 221 728, 211 721, 210 710 L 210 720 C 211 728, 221 733, 238 733 L 278 733 C 287 733, 291 727, 289 720 Z"/>
      <path fill="none" stroke="{FRAME}" stroke-width="4.5" d="M 255 694 L 232 700 M 258 706 L 234 712"/>
      <path fill="none" stroke="{INK}" stroke-width="5" d="M 289 721 C 288 728, 281 733, 276 733 L 238 733 C 220 733, 210 727, 210 718"/>
    </g>

    <!-- barriga (cropped) -->
    <path fill="{SKIN}" d="M 156 262 L 244 262 C 246 290, 246 316, 245 334 L 155 334 C 154 316, 154 290, 156 262 Z"/>

    <!-- CALCA JEANS BRANCA -->
    <path fill="{JEANS}" d="{JEANS_D}"/>
    <path fill="{JEANS_SH}" stroke="none" d="M 146 322 C 140 400, 139 500, 143 604 C 145 650, 147 678, 148 694 L 160 694 C 157 640, 154 520, 156 420 C 157 380, 159 344, 161 322 Z"/>
    <path fill="{JEANS_LIT}" stroke="none" opacity="0.7" d="M 240 330 C 245 400, 248 500, 247 604 C 246 650, 245 678, 244 694 L 252 694 C 253 678, 255 650, 257 604 C 261 500, 260 400, 254 322 Z"/>
    <g fill="none" stroke="{STITCH}" stroke-width="2.4" stroke-dasharray="6 4">
      <path d="M 166 340 C 164 420, 163 540, 165 690"/>
      <path d="M 234 340 C 236 420, 237 540, 235 690"/>
      <path d="M 200 330 L 200 366"/>
    </g>
    <g fill="none" stroke="{JEANS_SH}" stroke-width="3">
      <path d="M 152 336 C 162 356, 176 362, 186 360"/>
      <path d="M 248 336 C 238 356, 224 362, 214 360"/>
      <path d="M 148 676 L 185 676 M 215 676 L 252 676"/>
    </g>
    <!-- cos -->
    <path fill="{JEANS_SH}" stroke="none" d="M 146 322 L 254 322 C 254 330, 255 336, 255 340 L 145 340 C 145 336, 146 330, 146 322 Z"/>

    <!-- pescoco -->
    <path fill="{SKIN}" d="M 184 132 L 184 176 C 184 186, 216 186, 216 176 L 216 132 Z"/>

    <!-- BLUSA (tee solta) -->
    <path fill="{BLOUSE}" d="{TEE_D}"/>
    <path fill="{BLOUSE_SH}" stroke="none" d="M 142 210 C 144 192, 156 178, 172 172 C 158 192, 152 240, 155 290 L 148 286 C 144 266, 140 240, 142 210 Z"/>
    <path fill="{BLOUSE_LIT}" stroke="none" opacity="0.55" d="M 244 182 C 252 192, 257 200, 258 212 C 259 240, 256 266, 252 286 L 244 288 C 248 264, 250 236, 248 210 C 247 198, 245 190, 240 184 Z"/>
    <path fill="none" stroke="{BLOUSE_SH}" stroke-width="4" d="M 152 280 C 174 290, 226 290, 248 280"/>
    <!-- decote em V, moderado -->
    <path fill="{SKIN}" d="M 176 171 C 180 208, 220 208, 224 171 Z"/>
    <path fill="none" stroke="{BLOUSE_LIT}" stroke-width="4" d="M 181 175 C 185 203, 215 203, 219 175"/>
    {gold_chain(200, 182, 20, 2.2, 2.0)}
  </g>

  <!-- ACESSORIOS DOURADOS: bracelete de serpente no antebraco direito dela,
       pulseira no outro pulso -->
  {snake(129, 360, 0.62)}
  <g stroke-linecap="round">{gold_chain(273, 384, 14, 2.6, 2.3)}</g>

{hand(ring=True)}
{hand(mirror=True)}

  <g transform="translate({TX:.2f} {TY:.2f}) scale({S})">
{head(sw=SW, uid="ex-bd")}
  </g>
</svg>
'''


SHORT_BACK = ("M 128 18 C 66 18, 34 60, 40 110 C 36 138, 34 166, 40 196 "
              "C 52 212, 74 212, 84 196 C 82 172, 78 140, 78 108 "
              "L 178 108 C 178 140, 174 172, 172 196 "
              "C 182 212, 204 212, 216 196 C 222 166, 220 138, 216 110 "
              "C 222 60, 190 18, 128 18 Z")
SHORT_L = ("M 74 106 C 70 140, 72 168, 76 194 C 78 208, 80 216, 84 224 "
           "C 94 230, 104 224, 106 212 C 100 186, 94 150, 92 122 "
           "C 91 114, 90 108, 90 106 Z")
SHORT_R = ("M 182 106 C 186 140, 184 168, 180 194 C 178 208, 176 216, 172 224 "
           "C 162 230, 152 224, 150 212 C 156 186, 162 150, 164 122 "
           "C 165 114, 166 108, 166 106 Z")


def to_short(svg):
    return (svg.replace(HAIR_BACK, SHORT_BACK).replace(FRONT_L, SHORT_L)
            .replace(FRONT_R, SHORT_R))


suf = "" if VOL == "C" else f"-vol{VOL}"
files = {
    f"esterex{suf}-avatar.svg": avatar(),
    f"esterex{suf}-corpo-inteiro.svg": body(),
}
if VOL == "C":
    files["esterex-alt-cabelo-curto-avatar.svg"] = to_short(files["esterex-avatar.svg"])
    files["esterex-alt-cabelo-curto-corpo-inteiro.svg"] = to_short(files["esterex-corpo-inteiro.svg"])
for name, content in files.items():
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(content)
print("ok:", ", ".join(files))
