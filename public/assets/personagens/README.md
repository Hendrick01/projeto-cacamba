# Elenco do Caçamba — personagens

Quatro personagens em SVG achatado (flat), pensadas para aparecerem como avatar
circular de 48 px na mesa e como figura inteira em telas maiores.

Tudo aqui é arte original. Nada reproduz personagem, escudo, logo, obra ou marca
de terceiros.

---

## 1 · Construção compartilhada

Todas as quatro usam a mesma base geométrica, o que é o que faz elas lerem como
um elenco e não como quatro desenhos avulsos.

| | valor |
|---|---|
| Avatar | `viewBox 0 0 256 256`, círculo `r=120`, moldura contorno 10 + âmbar 5 |
| Corpo inteiro | `viewBox 0 0 400 800`, linha do chão em `y=733` |
| Cabeça | coordenadas locais 256×256, escala `0.88` no corpo inteiro |
| Contorno | uniforme, 5 unidades, cor `#2A1B12` |
| Fundo do avatar | madeira `#7A4A2B` + clarão `#8C5733` |

### Paleta do jogo

| hex | uso |
|---|---|
| `#2A1B12` | contorno **e** fundo escuro do jogo (são a mesma cor — ver "halo") |
| `#7A4A2B` / `#8C5733` | madeira do avatar |
| `#F2C14E` | âmbar — anel da moldura, acentos quentes |
| `#F5F1E6` | creme — texto claro, solados |
| `#3A7D6E` | verde-garrafa dessaturado |
| `#E4572E` | laranja-telha |
| `#8C6A45` | **luz de borda quente** (halo) |
| `#F4CFAA` | pele do elenco (EstereX usa `#F0C89A`, mais dourada) |

### Duas técnicas que se repetem

**Halo quente.** O contorno é a mesma cor do fundo do jogo. Peça escura sobre
fundo escuro some. Solução: um traço `#8C6A45` de 9 unidades, opacidade 0.8,
desenhado **por fora** do contorno. Usado na saia da Gabizinsky, em toda a Dri,
no cabelo da EstereX e nos tênis do Matheus.

**Duas camadas em corrente/pérola.** Fio contínuo desenhado primeiro, elos por
cima. Quando a arte encolhe e os elos somem, sobra a linha — o objeto nunca
desaparece, só perde detalhe. Usado no cinto da Gabizinsky, nas pulseiras e no
colar do Matheus, no colar da EstereX.

### Estaturas (topo do cabelo → chão)

| | unidades | vs. base |
|---|---|---|
| Gabizinsky | ~677 | base |
| Dri | ~699 | +3,3% (salto bloco de ~22 un ≈ 4 cm) |
| EstereX | ~716 | +6% |
| Matheus | ~716 | +6% (empata com EstereX de propósito) |

A diferença foi distribuída de forma anatomicamente crível: cabeça do mesmo
tamanho, ganho quase todo em pernas, um pouco em tronco e pescoço.

### Divisão de metais

| | metal |
|---|---|
| Gabizinsky | prata |
| Dri | prata |
| EstereX | **ouro integral** |
| Matheus | ouro no centro (colar + aliança), prata nos pulsos — o único que mistura |

---

## 2 · Gabizinsky

Body azul claro, saia preta rodada, corrente de prata na cintura, tênis branco.

| elemento | hex |
|---|---|
| cabelo cereja | `#C6335A` |
| brilho | `#DE5C7C` |
| sobrancelha | `#7A2438` |
| body azul | `#93BCD1` |
| saia (preto quente levantado) | `#3B3330` |
| tênis branco quente | `#F5F1E6` |
| batom vermelho | `#B03048` |
| o sinal | `#5C2F1E` |

**Decisões.** Azul dessaturado (sat ~35%) para não vibrar contra o âmbar.
Cabelo cereja puxado para o magenta (matiz 342°) para não colidir com o cropped
terracota da EstereX (matiz 7°). Saia com barra ondulada e cós marcado por
corrente. Tênis branco porque o preto sumia contra o fundo.

**O sinal abaixo do olho direito** (= direita dela, esquerda de quem olha) é
proporcionalmente ~30% maior no avatar que no corpo inteiro, com halo sutil da
cor da pele por trás.

**Limiares medidos**

| | resultado |
|---|---|
| o sinal | legível a 48 px · some abaixo de ~40 px |
| corrente da cintura | elos ≥300 px de altura · linha texturizada 150–300 · linha lisa ≤120 |
| anel de coração | forma ≥800 px · ponto vermelho ≥400 px · some ≤250 px |

**Alternativas:** `gabizinsky-alt-vinho-*` (cabelo vinho da descrição original),
`gabizinsky-cropped-*` (variante de blusa), `*-alt-tenis-preto` (tênis preto).

---

## 3 · Dri

Corset preto, jaqueta de couro preta curta, short preto, salto bordô, choker
com gota de prata. Preto sobre preto.

| elemento | hex | L\* |
|---|---|---|
| jaqueta (couro) | `#35323C` | 21 |
| short | `#302C32` | 18,5 |
| corset | `#292530` | 15,5 |
| cabelo | `#2A2730` | 16 |
| salto bordô | `#6B2A36` | 30 |
| mechas de mel | `#C08A45` | 62 |
| *fundo do jogo* | `#2A1B12` | *13* |

**Decisões.** Escada de valor: cada peça um degrau, nenhuma encosta na vizinha.
Couro × tecido resolvido por **acabamento**, não por cor — o couro leva faixas
especulares de borda dura (`#5C5766`), corset e short não levam realce nenhum.
Bordô e mel são análogos quentes separados por 32 pontos de L\*: rimam. Pespontos
cor de mel na jaqueta devolvem o mel ao meio da figura.

**Cabelo:** risca lateral (pico em x≈112), volume, ondas como variação longa da
silhueta externa, pontas convergindo, mel em dois fios finos por lado (~35% da
massa frontal). Sem contorno interno entre mechas — foi ele que já causou
leitura de "cordas" antes.

---

## 4 · EstereX

Cropped vermelho, jeans branca, tênis branco, óculos dourados. A mais alta.

| elemento | hex |
|---|---|
| cropped terracota | `#C24A3B` |
| tênis branco neutro | `#E6E4DF` |
| pele (mais dourada) | `#F0C89A` |
| jeans branca fria | `#CDD3DC` |
| cabelo | `#26242C` |
| ouro (óculos e acessórios) | `#C9A24E` |
| batom vermelho | `#B0303F` |

**Óculos — a decisão mais disputada.** Armação metálica fina, dourada, quadrada
de cantos suaves. Testado: fio de **2.0** unidades (fiel ao real) **quebra em
fragmentos a 48 px** — pior que sumir, lê como sujeira. Fio de **3.1** (≈1,5× o
real) segura o retângulo a 48 px e continua lendo como metal fino no tamanho
grande. **3.1 é o valor em uso.**

**Cabelo.** Volume parametrizado no gerador (`VOLUMES = A / B / C`). Em uso: **C**
(passa 24 unidades do rosto, coroa em y31, pontas em y298, afunilamento 0,60).
A e B ficam salvos como `esterex-volA-*` e `esterex-volB-*`.

A 48 px a informação de "ondulado" se perde e vira bloco — é esperado; o que
carrega no pequeno é o volume da silhueta + os óculos dourados + a boca vermelha.

**Acessórios:** bracelete de serpente no antebraço direito, pulseira, anéis,
argolas, corrente fina. Todos dourados.

**Alternativa:** `esterex-alt-cabelo-curto-*` (altura do ombro, descrição original).

---

## 5 · Matheus

Camisa tricolor listrada, jeans azul escuro de cós baixo com a camisa por fora,
tênis preto, colar de ouro, aliança, pulseiras.

| elemento | hex |
|---|---|
| listra branca | `#EFEAE0` |
| listra azul | `#2E6094` |
| listra preta | `#26232A` |
| jeans azul escuro | `#3B4A63` |
| cabelo / olhos / barba | `#3A2A20` |
| ouro (colar + aliança) | `#C8A24E` |
| pérolas (fosca) | `#EDE6D6` |

**A camisa.** Apenas o **padrão** de listras verticais azul/preto/branco. **Sem
escudo, sem nome, sem número, sem patrocinador, sem mascote.** O padrão não é
propriedade de ninguém; o escudo é.

**Construção masculina.** Ombros de 116 unidades — **mais estreitos que os das
mulheres em proporção à altura dele**. A diferenciação masculina vem de proporção
(tronco longo, membros finos) e do rosto, não de largura.

**Limiares medidos**

| | resultado |
|---|---|
| listras | legíveis ≥96 px de altura da figura (≈2 px por listra) · abaixo vira mancha, sem moiré |
| bigode | ≥48 px |
| barba rala | ≥64 px |
| colar de ouro | elos ≥600 px · linha texturizada 250–600 · linha lisa ≤250 |
| aliança | some abaixo de ~800 px — por isso existe o close `matheus-pulso.svg` |

**Pérola × corrente sem gradiente.** Pérola é círculo chapado com um único ponto
de luz seco fora de centro. Corrente é elos alternando de eixo em duas pratas.

**Alternativa:** `matheus-alt-cabelo-claro-*` (castanho claro da descrição original).

---

## 6 · Distinguibilidade a 48 px

É o teste que importa num jogo. Ver `elenco-teste-48px.png`.

| | sinal dominante |
|---|---|
| Gabizinsky | **cabelo cereja** — o único claro do elenco |
| Dri | massa escura larga com **dois fios de mel** flanqueando o rosto |
| EstereX | **óculos dourados** + boca vermelha + torso vermelho |
| Matheus | cabelo curto castanho + **camisa listrada** |

As quatro leituras são distintas. O par que já foi apertado (Dri × EstereX)
separou depois que a Dri ganhou volume e a EstereX perdeu: hoje uma é massa
larga e a outra é enxuta.

---

## 7 · Arquivos

Para cada personagem:

```
<nome>-avatar.svg                    master do busto
<nome>-avatar@1x.png                 48 px   (tamanho de uso na mesa)
<nome>-avatar@2x.png                 96 px
<nome>-avatar@3x.png                 144 px
<nome>-avatar-256.png                master rasterizado
<nome>-corpo-inteiro.svg             master da figura
<nome>-corpo-inteiro@1x/@2x/@3x.png  400×800 / 800×1600 / 1200×2400
<nome>-previa.png                    folha de decisões e testes
<nome>-teste-tamanho-pequeno.png     figura em 64/96/128/192/288 px
```

Closes: `gabizinsky-anel.svg`, `matheus-pulso.svg`.

Conjunto: `elenco-quatro-personagens.png`, `elenco-teste-48px.png`.

Testes específicos: `esterex-teste-oculos.png`, `esterex-teste-volume-cabelo.png`,
`matheus-teste-barba.png`, `matheus-teste-escala-colar.png`,
`gabizinsky-teste-escala-anel.png`.

> **Nota:** `elenco-tres-personagens.png` contém a mesma imagem de quatro. O nome
> ficou obsoleto e não foi possível apagar o arquivo nesta sessão.

### Geradores

Os SVGs não são desenhados à mão: saem de quatro scripts Python em
`_geradores/`. Alterar cor, volume de cabelo ou proporção é mudar uma variável e
rodar de novo.

| script | personagem |
|---|---|
| `gen.py` | Gabizinsky |
| `gen2.py` | Dri |
| `gen3.py` | EstereX |
| `gen4.py` | Matheus |

```bash
python3 gen.py            # regenera os SVGs da Gabizinsky
EX_VOL=B python3 gen3.py  # regenera a EstereX com outro volume de cabelo
```
