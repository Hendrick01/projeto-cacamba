"""Monta a folha de MOLDE da mão de primeira pessoa, para mandar ao gerador 3D.

Uso: python3 scripts/molde_mao.py [saida.png] [--abertura 9]

A mão que o jogo usa hoje é procedural (`scripts/mao_modelo.py`: cilindros,
esferas e um remesh) e de perto parece manequim. O caminho para uma mão de
verdade é mandar modelar fora e trazer de volta — e o gerador precisa saber
POSE, PROPORÇÃO e, principalmente, o que não pode faltar.

Esta folha é isso: três vistas ortográficas da mão canônica (palma, costas e
lado do polegar) mais o texto do que o arquivo devolvido tem de cumprir. Ela
descreve o MOLDE, não o acabamento — a pele, o nó do dedo e a unha são o que se
espera que o gerador acrescente.

Depois, o arquivo que voltar entra no jogo por
`scripts/mao_meshy.py`, que remalha em quads, alinha ao quadro canônico, acha
os dedos pelos vãos, põe os 16 ossos e exporta no formato que
`public/models/mao-fp-<lado>.glb` espera.

Precisa de Blender (para as vistas) e Pillow (para a folha).
"""
import argparse, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'
FUNDO = (250, 248, 244)
TINTA = (32, 28, 24)
SUAVE = (120, 112, 104)

EXIGENCIAS = [
    ('Uma mão só, a ESQUERDA', 'a direita sai espelhada no preparo; duas mãos modeladas à parte nunca batem'),
    ('Dedos SEPARADOS, com vão entre eles', 'é pelos vãos que o rig acha cada dedo. Dedos colados não dobram sem rasgar'),
    ('Palma aberta, pose neutra', 'nada de punho fechado, gesto ou dedo cruzado: a pose de jogo vem do rig'),
    ('Cortada no PUNHO, sem braço', 'o punho entra na manga; um antebraço sobrando atravessa a roupa'),
    ('Proporção destas vistas', 'do punho à ponta do médio = 1; polegar alcançando a falange média do indicador'),
    ('Realista-estilizado, como o elenco', 'sem poro nem veia: some no tamanho em que a mão aparece e só pesa'),
    ('Sem unha comprida nem anel modelado', 'acessório e unha entram depois, por personagem, sobre a mesma malha'),
]


def vistas(tmp, abertura):
    """As três vistas, renderizadas pelo próprio gerador da mão canônica."""
    alvo = tmp / 'vista.png'
    subprocess.run([BLENDER, '--background', '--python', str(RAIZ / 'scripts' / 'mao_modelo.py'), '--',
                    str(tmp / 'mao.glb'), '--tris', '4800', '--lado', 'esq',
                    '--abertura', str(abertura), '--render', str(alvo)],
                   check=True, capture_output=True)
    return [(Image.open(tmp / n), t) for n, t in
            [('vista.png', 'palma (+Z)'), ('vista-costas.png', 'costas'), ('vista-lado.png', 'lado do polegar (+X)')]]


def fonte(tam, negrito=False):
    nome = '/System/Library/Fonts/Avenir Next Condensed.ttc'
    try: return ImageFont.truetype(nome, tam, index=1 if negrito else 0)
    except OSError: return ImageFont.load_default()


def monta(saida, abertura):
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        imgs = vistas(tmp, abertura)
        larg, alt = imgs[0][0].size
        esc = 520 / larg
        cx, cy = int(larg * esc), int(alt * esc)
        folha = Image.new('RGB', (cx * 3 + 80, cy + 500), FUNDO)
        d = ImageDraw.Draw(folha)
        d.text((30, 26), 'MOLDE DA MÃO DE PRIMEIRA PESSOA — Caçamba', font=fonte(38, True), fill=TINTA)
        d.text((30, 74), 'Pose e proporção do que o jogo precisa. O acabamento (pele, nó do dedo, unha) é o que se espera do modelo novo.',
               font=fonte(23), fill=SUAVE)
        for i, (im, titulo) in enumerate(imgs):
            x = 30 + i * (cx + 10)
            folha.paste(im.convert('RGB').resize((cx, cy), Image.LANCZOS), (x, 120))
            d.text((x + 6, 120 + cy + 6), titulo, font=fonte(24, True), fill=TINTA)
        y = 120 + cy + 56
        d.line([(30, y), (folha.width - 30, y)], fill=(224, 218, 210), width=2)
        y += 18
        d.text((30, y), 'O ARQUIVO DEVOLVIDO PRECISA DE:', font=fonte(27, True), fill=TINTA); y += 40
        for titulo, porque in EXIGENCIAS:
            d.text((34, y), '•', font=fonte(24, True), fill=TINTA)
            d.text((56, y), titulo, font=fonte(24, True), fill=TINTA)
            largura_titulo = d.textlength(titulo, font=fonte(24, True))
            d.text((66 + largura_titulo, y + 2), f'— {porque}', font=fonte(21), fill=SUAVE)
            y += 32
        d.text((30, y + 8), 'De volta ao jogo:  Blender --background --python scripts/mao_meshy.py -- <arquivo>.glb public/models/mao-fp-esq.glb',
               font=fonte(21), fill=SUAVE)
        folha.save(saida)
    print(f'{saida}  ({folha.width}×{folha.height})')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('saida', nargs='?', default='molde-mao.png')
    ap.add_argument('--abertura', type=float, default=9.0, help='graus de afastamento entre os dedos nas vistas')
    a = ap.parse_args()
    monta(Path(a.saida).resolve(), a.abertura)
