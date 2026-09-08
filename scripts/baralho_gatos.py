"""Monta o baralho de gatos a partir das folhas desenhadas.

Uso: python3 scripts/baralho_gatos.py ~/Downloads

A arte chega em SEIS folhas de 3x3 mais o verso, e sai daqui como 57 arquivos
soltos em public/assets/baralho/ — um por carta, no nome que o cliente usa
(`<naipe>-<valor>.webp`, com o naipe no mesmo índice do motor: 0 espadas,
1 copas, 2 ouros, 3 paus).

Três coisas acontecem no caminho, e nenhuma delas é redesenhar a arte:

1. CORTE. Cada folha é dividida em nove e cada carta é apertada no próprio
   contorno. A moldura impressa é jogada fora: quem desenha a borda arredondada
   e a sombra é o CSS da mesa, e manter duas bordas deixaria a carta com um
   friso duplo.

2. NAIPE VERMELHO. Copas e ouros chegam em preto, como todo o resto. Separar o
   naipe do gato não é questão de cor — os dois usam a mesma tinta — e sim de
   forma; o trabalho está em scripts/naipe_vermelho.py, que explica o método.
   O TRAÇO continua preto: só a massa do naipe vira vermelha.

3. FUNDO TRANSPARENTE. O branco do papel sai e vira alfa. Assim o creme da
   carta do jogo aparece por baixo, o gato fica da cor do papel da mesa (que é
   o certo: o pelo dele é papel) e o arquivo despenca de tamanho, porque o que
   sobra é só tinta.
"""
import os
import sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import naipe_vermelho as nv

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.path.join(RAIZ, "public", "assets", "baralho")

# Espadas 0, copas 1, ouros 2, paus 3 — a mesma ordem de SUITS no motor.
NAIPE = {"s": 0, "h": 1, "d": 2, "c": 3}

# Qual folha traz quais cartas, na ordem de leitura. Foi conferido olhando as
# 54 recortadas lado a lado: o baralho vem em sequência, copas → ouros → paus →
# espadas → dois coringas.
FOLHAS = {
    "cartaa.png":     [("h", r) for r in range(1, 10)],
    "cartaaaa.png":   [("h", r) for r in range(10, 14)] + [("d", r) for r in range(1, 6)],
    "carta.png":      [("d", r) for r in range(6, 14)] + [("c", 1)],
    "cartaaaaa.png":  [("c", r) for r in range(2, 11)],
    "cartaaaaaa.png": [("c", r) for r in range(11, 14)] + [("s", r) for r in range(1, 7)],
    "cartaaa.png":    [("s", r) for r in range(7, 14)] + [("j", 1), ("j", 2)],
}

# A tinta e o vermelho são os do jogo, não o preto e o vermelho do arquivo: a
# carta tem de pertencer à mesa, e a mesa é âmbar sobre madeira.
TINTA = np.array([42, 27, 18], np.float32)      # --ink  #2A1B12
VERMELHO = np.array([201, 58, 58], np.float32)  # --red  #C93A3A

# Correção nomeada, e é UMA só no baralho inteiro.
#
# No Valete de copas o lobo do gorro de bufão é uma gota cheia, do tamanho de um
# coração e quase da mesma forma: passa em todos os testes de forma que reprovam
# os outros impostores. Preferi anotar a exceção a afrouxar o detector — afrouxar
# custaria o manto da Dama e a pinta do Rei, que já estão certos.
EXCECOES = {"h11": [(207, 120), (205, 155), (154, 216)]}


CACHE = os.path.join(os.path.expanduser("~"), ".cache", "cacamba-baralho")

# O papel do jogo, embutido na carta. O alfa foi tentado antes e custava caro:
# WebP grava o canal alfa quase sem perdas, e um baralho de traço antisserrilhado
# em 55 arquivos dava 2,6 MB. Com o papel dentro da imagem, dá 365 KB — e a
# carta fica idêntica à da mesa, porque o degradê aqui é o MESMO do `.card`.
PAPEL = [((255, 253, 246), 0.0), ((245, 241, 230), 0.46), ((222, 214, 195), 1.0)]
PAPEL_CORINGA = [((255, 220, 133), 0.0), ((242, 193, 78), 0.42), ((201, 162, 78), 1.0)]


def degrade(w, h, paradas, angulo=168):
    """O degradê do papel, na mesma inclinação do CSS da carta."""
    import math
    a = math.radians(90 - angulo)
    dx, dy = math.cos(a), -math.sin(a)
    ys, xs = np.mgrid[0:h, 0:w]
    t = (xs / max(1, w - 1) * dx + ys / max(1, h - 1) * dy)
    t = (t - t.min()) / max(1e-6, t.max() - t.min())
    saida = np.zeros((h, w, 3), np.float32)
    for i in range(len(paradas) - 1):
        (c0, p0), (c1, p1) = paradas[i], paradas[i + 1]
        faixa = (t >= p0) & (t <= p1)
        k = ((t - p0) / max(1e-6, p1 - p0))[..., None]
        saida[faixa] = (np.array(c0, np.float32) * (1 - k) + np.array(c1, np.float32) * k)[faixa]
    saida[t < paradas[0][1]] = np.array(paradas[0][0], np.float32)
    saida[t > paradas[-1][1]] = np.array(paradas[-1][0], np.float32)
    return saida


def caixa(mask):
    ys, xs = np.where(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def sem_moldura(cinza):
    """Tira a moldura impressa e devolve o recorte no conteúdo de dentro.

    Não basta apagar o componente grandão: em algumas cartas a borda chega
    partida (o traço encosta na figura, ou o corte da folha a rompeu), e o que
    sobra é um risco reto na base da carta. Então some tudo que ENCOSTA na
    beirada e é fino — moldura é isso, e nada do desenho toca a borda.
    """
    cinza = cinza.copy()
    h, w = cinza.shape
    for _ in range(3):
        tinta = cinza < 140
        rot = nv.rotula(tinta)
        mudou = False
        for i in np.unique(rot):
            if i == 0:
                continue
            m = rot == i
            x0, y0, x1, y1 = caixa(m)
            toca = x0 <= 2 or y0 <= 2 or x1 >= w - 2 or y1 >= h - 2
            magro = m.sum() / max(1, (x1 - x0) * (y1 - y0)) < 0.18
            grande = (x1 - x0) > w * 0.5 or (y1 - y0) > h * 0.5
            if toca and magro and grande:
                cinza[m] = 255
                mudou = True
        if not mudou:
            break
    x0, y0, x1, y1 = caixa(cinza < 140)
    f = 5
    return (max(0, y0 - f), min(h, y1 + f), max(0, x0 - f), min(w, x1 + f)), cinza


def sobre_papel(cinza, vermelho, coringa=False):
    """A tinta sobre o papel do jogo — sem canal alfa."""
    alfa = np.clip((255.0 - cinza.astype(np.float32)) / 255.0, 0, 1)[..., None]
    cor = np.repeat(TINTA[None, None, :], cinza.shape[0], 0).repeat(cinza.shape[1], 1)
    cor[vermelho] = VERMELHO
    fundo = degrade(cinza.shape[1], cinza.shape[0],
                    PAPEL_CORINGA if coringa else PAPEL)
    return Image.fromarray((fundo * (1 - alfa) + cor * alfa).astype("uint8"))


def main(pasta):
    os.makedirs(SAIDA, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    LARG, QUAL = 208, 82
    feitas = []

    def grava(cinza, verm, alvo, coringa=False):
        (y0, y1, x0, x1), limpo = sem_moldura(cinza)
        im = sobre_papel(limpo[y0:y1, x0:x1], verm[y0:y1, x0:x1], coringa)
        im = im.resize((LARG, int(round(LARG * im.height / im.width))), Image.LANCZOS)
        im.save(os.path.join(SAIDA, alvo), "WEBP", quality=QUAL, method=6)
        feitas.append(alvo)

    for arq, cartas in FOLHAS.items():
        folha = np.array(Image.open(os.path.join(pasta, arq)).convert("L"))
        X0, Y0, X1, Y1 = caixa(folha < 140)
        cw, ch = (X1 - X0) / 3, (Y1 - Y0) / 3
        for i, (n, r) in enumerate(cartas):
            cx, cy = i % 3, i // 3
            cel = folha[int(Y0 + cy*ch):int(Y0 + (cy+1)*ch),
                        int(X0 + cx*cw):int(X0 + (cx+1)*cw)]
            bx0, by0, bx1, by1 = caixa(cel < 140)
            carta = cel[by0:by1, bx0:bx1]
            nome = f"{n}{r}"

            if n in ("h", "d"):
                # A detecção é a parte cara (uns seis segundos por carta), e a
                # arte não muda: guarda a máscara para quem só quiser mexer na
                # compressão não pagar de novo.
                guardado = os.path.join(CACHE, f"{nome}.npy")
                if os.path.exists(guardado) and np.load(guardado).shape == carta.shape:
                    verm = np.load(guardado)
                else:
                    verm, _ = nv.mascara_de_naipe(carta)
                    for (ex, ey) in EXCECOES.get(nome, []):
                        rot = nv.rotula(verm)
                        alvo = rot[ey, ex]
                        if alvo:
                            verm &= ~(rot == alvo)
                    np.save(guardado, verm)
            else:
                verm = np.zeros_like(carta, bool)

            if n == "j":
                grava(carta, verm, f"coringa-{r}.webp", coringa=True)
            else:
                grava(carta, verm, f"{NAIPE[n]}-{r}.webp")

    verso = np.array(Image.open(os.path.join(pasta, "costa-da-carta.png")).convert("L"))
    grava(verso, np.zeros_like(verso, bool), "verso.webp")

    total = sum(os.path.getsize(os.path.join(SAIDA, f)) for f in feitas)
    maior = max((os.path.getsize(os.path.join(SAIDA, f)), f) for f in feitas)
    print(f"{len(feitas)} cartas · {total/1024:.0f} KB no total · "
          f"maior: {maior[1]} com {maior[0]/1024:.1f} KB")


if __name__ == "__main__":
    main(os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads"))
