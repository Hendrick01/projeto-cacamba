# -*- coding: utf-8 -*-
"""A boca das expressoes do elenco.

Mora aqui, e nao dentro de cada gerador, porque a expressao e do JOGO e nao do
personagem: quando alguem baixa um jogo, o gesto e o mesmo no rosto de todo
mundo. O que continua sendo de cada um e a TINTA — quem tem batom leva o batom
para o contorno da boca, quem nao tem usa o proprio contorno.

Todas as bocas estao no sistema 256x256 da cabeca, que e o mesmo nos oito
geradores: olhos em cx 108 e 150, nariz por volta de 126, boca entre 111 e 146.
O cliente pede duas (ver REACOES em public/client.js): `feliz` e `bravo`.
"""

# O escuro de dentro da boca aberta. Nao e o contorno: o contorno e a borda dos
# labios, e num rosto com batom os dois precisam continuar sendo cores
# diferentes. Vem da familia do #5C2F1E que ja e a pinta da Gabizinsky.
INTERIOR = "#4A241F"


def boca(expr, sw, ink, lip=None):
    """O SVG da boca de `expr`. `lip` e opcional: metade do elenco nao tem
    batom e usa o proprio contorno."""
    borda = lip or ink

    if expr == "feliz":
        # ABERTA, de proposito. A boca de descanso ja e um sorriso nos oito: se
        # a alegre fosse so uma curva mais funda, a diferenca sumiria nos ~28 px
        # que a cara tem na mesa. Aberta muda a MANCHA, e mancha se enxerga.
        return (f'<path fill="{INTERIOR}" stroke="{borda}" stroke-width="{sw * 1.0:.2f}" '
                f'stroke-linejoin="round" d="M 110 141 C 119 137, 137 137, 146 141 '
                f'C 144 156, 137 164, 128 164 C 119 164, 112 156, 110 141 Z"/>')

    if expr == "bravo":
        # Uma curva so, virada para baixo, e mais grossa que a de descanso: e o
        # unico jeito de a contrariedade sobreviver ao tamanho pequeno.
        return (f'<path fill="none" stroke="{borda}" stroke-width="{sw * 1.5:.2f}" '
                f'stroke-linecap="round" d="M 112 156 C 120 145, 136 145, 144 155"/>')

    raise ValueError(f"expressao desconhecida: {expr!r}")
