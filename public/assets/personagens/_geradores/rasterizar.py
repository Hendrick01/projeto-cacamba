# -*- coding: utf-8 -*-
"""SVG -> PNG e as folhas de conjunto do elenco.

Ate a sessao da Lyly os PNGs eram feitos a mao pelo navegador (SVG -> <canvas>
-> PNG), porque esta maquina nao tem rsvg-convert, cairosvg nem ImageMagick.
Tem, porem, o Chrome - e o Chrome em modo headless rasteriza SVG no tamanho que
se pedir. E o que este script usa. Nada aqui desenha: tudo sai dos gen*.py.

    python3 rasterizar.py lyly              # os PNGs de uma personagem
    python3 rasterizar.py --elenco          # as folhas de conjunto e os testes

O SVG e carregado dentro de um <img width height>, e nao direto: um SVG com
width/height proprios abre no tamanho intrinseco e a janela menor recortaria em
vez de reduzir.
"""
import os
import shutil
import subprocess
import sys
import tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ART = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Fundo do jogo: as folhas de conjunto sao vistas sobre o feltro, nao sobre
# branco - e sobre o feltro que a luz de borda quente faz sentido.
FELTRO = (42, 27, 18, 255)
CREME = (245, 241, 230, 255)


def png(svg, w, h, out):
    """Rasteriza um SVG de `ART` (ou caminho absoluto) em w x h."""
    src = svg if os.path.isabs(svg) else os.path.join(ART, svg)
    tmp = tempfile.mkdtemp()
    try:
        nome = os.path.basename(src)
        shutil.copy(src, os.path.join(tmp, nome))
        html = os.path.join(tmp, "moldura.html")
        with open(html, "w", encoding="utf-8") as f:
            f.write('<!doctype html><meta charset="utf-8">'
                    '<style>html,body{margin:0;padding:0;background:transparent}'
                    'img{display:block}</style>'
                    f'<img src="{nome}" width="{w}" height="{h}">')
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox",
                        "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--default-background-color=00000000",
                        f"--window-size={w},{h}", f"--screenshot={out}",
                        "file://" + html], capture_output=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out


def _saida(nome):
    return os.path.join(ART, nome)


def personagem(slug, closes=()):
    """O conjunto padrao de PNGs de quem entra no elenco:
    avatar 48/96/144/256 e figura em 400x800, 800x1600 e 1200x2400."""
    feitos = []
    if os.path.exists(os.path.join(ART, f"{slug}-avatar.svg")):
        for suf, lado in (("@1x", 48), ("@2x", 96), ("@3x", 144), ("-256", 256)):
            feitos.append(png(f"{slug}-avatar.svg", lado, lado,
                              _saida(f"{slug}-avatar{suf}.png")))
    if os.path.exists(os.path.join(ART, f"{slug}-corpo-inteiro.svg")):
        for suf, k in (("@1x", 1), ("@2x", 2), ("@3x", 3)):
            feitos.append(png(f"{slug}-corpo-inteiro.svg", 400 * k, 800 * k,
                              _saida(f"{slug}-corpo-inteiro{suf}.png")))
    for close in closes:
        for suf, lado in (("@1x", 320), ("@2x", 640)):
            feitos.append(png(f"{close}.svg", lado, lado, _saida(f"{close}{suf}.png")))
    return feitos


def teste_tamanho_pequeno(slug, alturas=(64, 96, 128, 192, 288)):
    """A figura encolhendo: e o teste de ate onde cada detalhe aguenta."""
    from PIL import Image, ImageDraw, ImageFont
    fonte = ImageFont.truetype("/System/Library/Fonts/Avenir Next Condensed.ttc", 17, index=0)
    folha = Image.new("RGBA", (700, 340), FELTRO)
    d = ImageDraw.Draw(folha)
    chao, x = 292, 22
    tmp = tempfile.mkdtemp()
    try:
        for a in alturas:
            arq = png(f"{slug}-corpo-inteiro.svg", int(a / 2), a,
                      os.path.join(tmp, f"{a}.png"))
            fig = Image.open(arq)
            folha.paste(fig, (x, chao - a), fig)
            d.text((x, chao + 14), f"{a}px", font=fonte, fill=CREME)
            x += int(a / 2) + 60
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    saida = _saida(f"{slug}-teste-tamanho-pequeno.png")
    folha.save(saida)
    return saida


def _nomes_do_elenco():
    """Le shared/elenco.js: a lista de quem senta a mesa vive la, nao aqui."""
    import re
    js = os.path.join(ART, "..", "..", "..", "shared", "elenco.js")
    texto = open(os.path.abspath(js), encoding="utf-8").read()
    return list(zip(re.findall(r"slug: '([^']+)'", texto),
                    re.findall(r"nome: '([^']+)'", texto)))


def folhas_do_elenco(elenco=None):
    """As duas folhas de conjunto: as figuras lado a lado (que mostra as
    estaturas) e a fila de avatares a 48px (que e o teste que importa)."""
    from PIL import Image, ImageDraw, ImageFont
    elenco = elenco or _nomes_do_elenco()
    n = len(elenco)
    extenso = {3: "tres", 4: "quatro", 5: "cinco", 6: "seis", 7: "sete", 8: "oito"}
    fonte = ImageFont.truetype("/System/Library/Fonts/Avenir Next Condensed.ttc", 26, index=1)
    tmp = tempfile.mkdtemp()
    try:
        # --- figuras inteiras, alinhadas pelo chao
        larg = 332
        folha = Image.new("RGBA", (larg * n, 760), FELTRO)
        d = ImageDraw.Draw(folha)
        for i, (slug, nome) in enumerate(elenco):
            arq = png(f"{slug}-corpo-inteiro.svg", 332, 664, os.path.join(tmp, f"c{i}.png"))
            fig = Image.open(arq)
            folha.paste(fig, (i * larg, 20), fig)
            cx = i * larg + larg // 2
            d.text((cx, 660), nome, font=fonte, fill=CREME, anchor="ma")
        saida1 = _saida(f"elenco-{extenso.get(n, n)}-personagens.png")
        folha.save(saida1)

        # --- a mesma gente a 48px, que e o tamanho de uso na mesa. O avatar e
        # rasterizado A 48px e so depois ampliado em vizinho-mais-proximo: o que
        # se ve aqui e o pixel que o jogador ve, nao um desenho grande reduzido.
        larg, lado = 280, 224
        f_nome = ImageFont.truetype("/System/Library/Fonts/Avenir Next Condensed.ttc", 20, index=7)
        folha = Image.new("RGBA", (larg * n, 300), FELTRO)
        d = ImageDraw.Draw(folha)
        for i, (slug, nome) in enumerate(elenco):
            arq = png(f"{slug}-avatar.svg", 48, 48, os.path.join(tmp, f"a{i}.png"))
            g = Image.open(arq).resize((lado, lado), Image.NEAREST)
            x = i * larg + (larg - lado) // 2
            folha.paste(g, (x, 22), g)
            d.text((x - 6, 262), nome, font=f_nome, fill=CREME)
        saida2 = _saida("elenco-teste-48px.png")
        folha.save(saida2)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return saida1, saida2


def folha_assento(elenco=None, larg=56, alt=58):
    """O SEGUNDO tamanho de uso: o assento da mesa mostra a figura inteira
    cortada na altura das maos, nao o busto. Uma leitura que funciona a 48px no
    avatar pode nao funcionar aqui - o rosto fica menor e a roupa, maior."""
    from PIL import Image, ImageDraw, ImageFont
    elenco = elenco or _nomes_do_elenco()
    n = len(elenco)
    f_nome = ImageFont.truetype("/System/Library/Fonts/Avenir Next Condensed.ttc", 22, index=0)
    f_leg = ImageFont.truetype("/System/Library/Fonts/Avenir Next Condensed.ttc", 16, index=5)
    passo = 190
    folha = Image.new("RGBA", (passo * n, 300), FELTRO)
    d = ImageDraw.Draw(folha)
    tmp = tempfile.mkdtemp()
    try:
        for i, (slug, nome) in enumerate(elenco):
            arq = png(f"{slug}-corpo-inteiro.svg", larg, larg * 2,
                      os.path.join(tmp, f"s{i}.png"))
            corte = Image.open(arq).crop((0, 0, larg, alt))
            g = corte.resize((larg * 3, alt * 3), Image.NEAREST)
            x, y = i * passo + (passo - larg * 3) // 2, 36
            d.rectangle([x - 6, y - 6, x + larg * 3 + 5, y + alt * 3 + 5],
                        outline=(90, 64, 48, 255))
            folha.paste(g, (x, y), g)
            cx = i * passo + passo // 2
            d.text((cx, y + alt * 3 + 18), nome, font=f_nome, fill=CREME, anchor="ma")
            d.text((cx, y + alt * 3 + 44), f"{larg}x{alt} ampliado 3x", font=f_leg,
                   fill=(200, 180, 150, 255), anchor="ma")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    saida = _saida(f"elenco-teste-assento-{alt}px.png")
    folha.save(saida)
    return saida


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "--elenco":
        print("\n".join(folhas_do_elenco()))
        print(folha_assento())
    else:
        slug = args[0]
        closes = args[1:]
        print("\n".join(personagem(slug, closes)))
        print(teste_tamanho_pequeno(slug))
