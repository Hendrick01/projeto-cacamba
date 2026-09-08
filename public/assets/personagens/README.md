# Elenco do Caçamba — personagens

Oito personagens em SVG achatado (flat), pensadas para aparecerem como avatar
circular de 48 px na mesa e como figura inteira em telas maiores. A mesa vai a
oito jogadores, e o elenco chegou a oito: já dá um rosto por lugar. Nada impede
duas pessoas de escolherem a mesma, e aí quem continua distinguindo é o anel de
cor do assento.

Tudo aqui é arte original. Nada reproduz personagem, escudo, logo, obra ou marca
de terceiros.

---

## 1 · Construção compartilhada

Todas as seis usam a mesma base geométrica, o que é o que faz elas lerem como
um elenco e não como seis desenhos avulsos.

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
| `#F5F1E6` | creme — texto claro, solados (o do Junior é literalmente isso) |
| `#3A7D6E` | verde-garrafa dessaturado — e a ponta do cristal do Junior |
| `#E4572E` | laranja-telha |
| `#8C6A45` | **luz de borda quente** (halo) |
| `#F4CFAA` | pele do elenco (a EstereX puxa para `#F0C89A`, mais dourada; a Lyly para `#F9D8C4`, a mais clara) |
| `#EBE4D5` | branco quente da camisa do Mafra Kitty — o único torso claro |
| `#403630` | preto quente da roupa do Junior — o único preto de terra |

### Duas técnicas que se repetem

**Halo quente.** O contorno é a mesma cor do fundo do jogo. Peça escura sobre
fundo escuro some. Solução: um traço `#8C6A45` de 9 unidades, opacidade 0.8,
desenhado **por fora** do contorno. Usado na saia da Gabizinsky, em toda a Dri,
no cabelo da EstereX, nos tênis do Matheus, no cabelo e na jeans do Mafra
Kitty e na camiseta, na cargo e no cabelo do Junior — nele o halo não é
enfeite: sem ele a figura inteira encosta no fundo. No cabelo dele o halo é mais fino — 7,25 em vez de 9 —, porque o castanho
dele já é claro o bastante para se separar do fundo quase sozinho; a jeans usa
os 9 de sempre.

**Duas camadas em corrente/pérola.** Fio contínuo desenhado primeiro, elos por
cima. Quando a arte encolhe e os elos somem, sobra a linha — o objeto nunca
desaparece, só perde detalhe. Usado no cinto da Gabizinsky, nas pulseiras e no
colar do Matheus, no colar da EstereX e na corrente do Junior.

### Estaturas (topo do cabelo → chão)

Medidas no PNG `@2x`, do primeiro ao último pixel opaco (o halo entra na conta).

| | unidades | vs. base |
|---|---|---|
| Gabizinsky | 678 | base |
| Dri | 686 | +1,2% |
| **Lyly** | **687** | **+1,3% — a mesma estatura da Dri, que foi o pedido** |
| **Junior** | **694** | **+2,4%** |
| **Mafra Kitty** | **703** | **+3,7%** |
| Mufasa | 710 | +4,7% |
| Matheus | 722 | +6,5% |
| EstereX | 723 | +6,6% (empata com o Matheus de propósito) |

Com seis, o meio deixou de ser um só: **o Junior e o Mafra Kitty dividem o
centro da tabela** (o terceiro e o quarto valores). Os dois foram pedidos como
estatura média, e é isso que estatura média quer dizer numa lista par.

O Mufasa entra acima dos dois e abaixo do Matheus, e o número dele foi mexido de
propósito: medido, o desenho dava **716**, o que na prática é empatar com o
Matheus (722). O elenco já tem um empate de propósito — Matheus × EstereX —, e um
segundo empate tiraria a estatura da lista de coisas que separam gente. Baixar o
`DY` de 3 para 9 levou ele a 710, com sete unidades de folga para cada lado.

A diferença foi distribuída de forma anatomicamente crível: cabeça do mesmo
tamanho, ganho quase todo em pernas, um pouco em tronco e pescoço.

A Dri está na tabela como 686 desde a sessão dela; medindo hoje o `@2x` das
duas, as duas dão os mesmos 1374 px, ou seja 687. A diferença é de
arredondamento — para efeito de leitura elas têm a mesma altura, do mesmo jeito
que o Matheus e a EstereX.

**Como se encurta alguém aqui.** O chão é o mesmo para todo mundo (`y=733`),
então "mais baixo" quer dizer cabeça mais perto do chão, não figura menor. No
`gen5.py` e no `gen8.py` isso é uma constante só, `DY`: tronco, braços, mãos e
cabeça descem juntos dentro de um `translate(0 DY)`, e só a cintura da calça é
reposicionada à mão. O pescoço não encurta de tabela — quem encurta é a perna.
No Junior nem a cintura precisou de ajuste: a camiseta é longa e cobre o cós
inteiro de qualquer jeito.

### Divisão de metais

| | metal |
|---|---|
| Gabizinsky | prata |
| Dri | prata |
| EstereX | **ouro integral** |
| Matheus | ouro no centro (colar + aliança), prata nos pulsos e no rosto (piercing + brinco) — o único que mistura |
| Mafra Kitty | **quase nenhum**: uma argola de prata na orelha esquerda, e nada abaixo do pescoço |
| Junior | **prata, e só prata** — e a única pedra do elenco |
| Mufasa | prata **toda acima do pescoço**: argola em cada orelha, argola na sobrancelha e a armação dos óculos — nada abaixo do queixo |
| Lyly | prata **numa peça só**: a flor do colar. O piercing é da mesma prata, mas no rosto |

O Mafra Kitty existe como contrapeso do Matheus nessa tabela. Os dois são os
homens do elenco; um carrega ouro e prata ao mesmo tempo, o outro não usa
praticamente nada. É mais uma diferença que não depende de cor.

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
tênis preto, colar de ouro, aliança, pulseiras. Piercing de prata na sobrancelha
**direita** e brinco ponto de luz na orelha **direita** — os dois do lado direito
dele, que na imagem é o lado esquerdo.

| elemento | hex |
|---|---|
| listra branca | `#EFEAE0` |
| listra azul | `#2E6094` |
| listra preta | `#26232A` |
| jeans azul escuro | `#3B4A63` |
| cabelo / olhos / barba | `#3A2A20` |
| ouro (colar + aliança) | `#C8A24E` |
| prata (pulseiras, esferas do piercing, brinco) | `#C9CDD2` |
| prata média (haste do piercing) | `#A9AFB5` |
| pérolas (fosca) | `#EDE6D6` |

**A camisa.** Apenas o **padrão** de listras verticais azul/preto/branco. **Sem
escudo, sem nome, sem número, sem patrocinador, sem mascote.** O padrão não é
propriedade de ninguém; o escudo é.

**Construção masculina.** Ombros de 116 unidades — **mais estreitos que os das
mulheres em proporção à altura dele**. A diferenciação masculina vem de proporção
(tronco longo, membros finos) e do rosto, não de largura.

**Prata no rosto.** Piercing e brinco ficam **do lado direito dele** — na imagem,
o lado esquerdo, porque a figura está de frente. É a mesma convenção das argolas
do Mafra Kitty e do Junior, que são da orelha esquerda deles e por isso aparecem
à direita da imagem. Como três homens do elenco passam a usar prata na orelha,
vale deixar explícito o que separa cada um: **Mafra Kitty**, uma argola, orelha
esquerda; **Junior**, duas argolas, orelha esquerda; **Matheus**, um ponto de
luz, orelha **direita**. Lado oposto e formato oposto — furo cheio contra aro
vazado.

**O ponto de luz é metal com brilho, não pedra.** Vale a mesma receita da pérola
descrita abaixo: círculo chapado de prata com um único ponto claro seco fora de
centro. Foi de propósito — a pedra do cordão do Junior continua sendo a única
pedra do elenco.

**O piercing é desenhado em três tempos.** A haste entra **antes** da
sobrancelha; as duas esferas, **depois**. Desenhado de uma vez só, a barra
cruzaria o pelo por cima e leria como um risco na testa. Como está, o pelo cobre
o meio da haste e sobram as duas esferas — que é exatamente o que se vê num
piercing de sobrancelha.

**O brinco cabe num espaço medido.** A orelha é uma elipse de 8×12 unidades, mas
o que fica *visível* dela é bem menos: a costeleta escura cobre por cima até
`y=112` e o contorno de 5 unidades come 2,5 por dentro. Sobra uma folha de pele
de 6,3 × 10,6 unidades. O maior círculo que cabe inteiro nela tem raio 2,58; o
brinco tem raio 1,95 mais contorno e está centrado nesse ponto — `(79,7 · 116,4)`.
Maior que isso ele engole a orelha; deslocado dali ele encosta no escuro e
desgruda do rosto.

**Limiares medidos**

| | resultado |
|---|---|
| listras | legíveis ≥96 px de altura da figura (≈2 px por listra) · abaixo vira mancha, sem moiré |
| bigode | ≥48 px |
| barba rala | ≥64 px |
| colar de ouro | elos ≥600 px · linha texturizada 250–600 · linha lisa ≤250 |
| aliança | some abaixo de ~800 px — por isso existe o close `matheus-pulso.svg` |
| piercing da sobrancelha | as duas esferas separadas ≥460 px · entre ~210 e 460 viram um brilho só · some abaixo disso |
| brinco ponto de luz | ≥460 px — detalhe, não sinal, como as argolas do Mafra Kitty e do Junior |

Medidos em `matheus-teste-prata.png`, que mostra o recorte ampliado em seis
tamanhos. Nenhum dos dois entra na conta da seção 9: a 48 px e no assento de
58 px não sobra nada de nenhum dos dois.

**Pérola × corrente sem gradiente.** Pérola é círculo chapado com um único ponto
de luz seco fora de centro. Corrente é elos alternando de eixo em duas pratas.

**Alternativa:** `matheus-alt-cabelo-claro-*` (castanho claro da descrição original).

---

## 6 · Mafra Kitty

Camiseta branca larga com gatinho estampado, jeans média de perna reta, tênis
branco, franja na testa, argola de prata na orelha esquerda. Sem barba.
**O único torso claro do elenco** e o segundo homem.

| elemento | hex |
|---|---|
| camisa branca quente | `#EBE4D5` |
| sombra da camisa | `#D3CAB6` |
| jeans média | `#5A7292` |
| tênis (branco mais frio que a camisa) | `#F2EFE7` |
| cabelo castanho escuro | `#4A3527` |
| brilho das ondas | `#6B5038` |
| pelo do gatinho | `#F7F3E9` |
| orelha e bochecha do gatinho | `#E9A79A` |
| coleira (âmbar do jogo) | `#F2C14E` |
| focinho (laranja-telha do jogo) | `#E4572E` |

**A estampa é desenho original.** Foi pedida "algo que lembre a Hello Kitty ou um
gatinho", e Hello Kitty é personagem registrado da Sanrio — a regra do topo deste
arquivo vale aqui como vale para escudo de time. O gatinho foi desenhado do zero e
se afasta de propósito nos pontos que identificam o personagem da Sanrio: cabeça
**redonda** (a de lá é oval e deitada), **boca visível** (a de lá não tem boca),
focinho em **coração** vermelho-telha (a de lá é um oval amarelo) e **coleira com
guizo** no lugar do laço. Cor: só a paleta do jogo.

Além do rosto grande no peito, duas pegadinhas menores logo abaixo. Elas são
enfeite: somem cedo e não fazem falta.

**Três decisões de cor.**

*Camisa.* `#EBE4D5`, não branco puro. Um `#FFF` estouraria contra o feltro
`#2A1B12` e roubaria a leitura do rosto. Mesmo rebaixado, é a mancha mais clara do
elenco inteiro — e é ela que carrega a 48 px.

*Jeans.* `#5A7292` cai exatamente entre a jeans escura do Matheus (`#3B4A63`) e a
jeans branca da EstereX (`#CDD3DC`). Nenhuma das três encosta na outra.

*Cabelo.* `#4A3527`, dois degraus acima do quase-preto do Matheus (`#3A2A20`). Com
franja, uma massa escura desce até perto dos olhos; no tom do Matheus ela viraria
borrão contra o fundo.

**A franja é a decisão de silhueta.** O Matheus tem o cabelo penteado para trás e a
testa toda à mostra; este tem a testa quase toda coberta. É o que separa os dois no
tamanho pequeno, onde cor de camisa e cor de cabelo já não bastam.

A franja para **6 unidades acima da sobrancelha**. Encostando — e foi assim na
primeira versão — as duas massas escuras se fundem numa faixa só sobre os olhos, e
o rosto lê como máscara. As ondas são três, de larguras diferentes: quatro lóbulos
iguais liam como nuvem, não como cabelo.

**O que ele não tem, e por quê**

| ausência | motivo |
|---|---|
| barba e bigode | é o que o Matheus tem; sem isso os dois rostos se separam a 48 px |
| sinal no rosto | é o sinal dominante da Gabizinsky a 48 px — repetir tiraria o dela |
| metal no corpo | ver "divisão de metais": ele é o contrapeso do Matheus |

**Limiares medidos**

| | resultado |
|---|---|
| rosto do gatinho (olhos, focinho, boca) | legível ≥192 px de altura da figura |
| cabeça do gatinho com as duas orelhas | ≥128 px |
| estampa como mancha clara no peito | ≥96 px · some a 64 px |
| pegadinhas | ≥192 px |
| argola da orelha | ≥400 px — por isso ela é detalhe, não sinal |
| franja como silhueta | lê até 48 px, que é o tamanho de uso |

**No assento da mesa** (112 px de figura, cortada nos 58 px de cima) a estampa cai
no meio da escada: a cabeça do gatinho lê como mancha clara com dois pontos
escuros, e as orelhas empastam. Não faz mal — ali ela é o **segundo** sinal, e
quem carrega é o valor do torso.

**Alternativa:** `mafra-kitty-alt-jeans-clara-*` (jeans clara, como na foto de
referência de short). A jeans é a decisão que mais pode mudar depois, então a
variante fica salva.

**Close:** `mafra-kitty-estampa.svg` mostra o gatinho no tamanho em que ele existe
de verdade — mesmo papel do `matheus-pulso.svg` e do `gabizinsky-anel.svg`.

---

## 7 · Junior

Camiseta preta larga com etiqueta no peito, calça cargo preta de perna larga,
tênis de lona escura com solado creme. Cabelo com as **laterais raspadas** e
volume ondulado no alto, barba cheia, duas argolas de prata na orelha esquerda,
cordão com cristal e corrente de prata com medalhão. Preto de cima a baixo — e
o terceiro homem.

| elemento | hex | L\* |
|---|---|---|
| camiseta (preto quente) | `#403630` | 23,5 |
| cargo, um degrau acima | `#4E443B` | 29,6 |
| lona do tênis | `#39332F` | 21,7 |
| cabelo | `#31241C` | 15,5 |
| solado e biqueira (creme da paleta) | `#F5F1E6` | 95 |
| prata | `#C9CDD2` | 82 |
| cristal — três faixas | `#C97AB0` `#5B8DC9` `#3A7D6E` | 61 · 58 · 48 |

**O preto dele não disputa com o da Dri.** A Dri já é o preto sobre preto do
elenco, e o dela é **frio** (matiz 258–280°, L\* 15,5 a 21,4). O do Junior é
**quente** (matiz 23°, L\* 23,5 e 29,6): preto de terra, um degrau mais claro.
Lado a lado eles não brigam — separam por temperatura, que é uma diferença que
sobrevive quando o valor já não separa mais. É a mesma lógica que separou o
cabelo cereja da Gabizinsky do cropped da EstereX por matiz.

**Por que o cabelo é o mais escuro do elenco** (15,5, contra 18,6 do Matheus e
24,2 do Mafra Kitty). Parece o contrário do que se faria — mas o cabelo dele
encosta em **pele** dos dois lados e por cima da testa, então tem contraste de
sobra. Quem precisa se separar do fundo do jogo é a **camiseta**, e é ela que
foi levantada. Com franja, como no Mafra Kitty, a decisão teria de ser a
inversa: lá a massa escura desce até perto dos olhos.

**O fade é a decisão de silhueta.** O Matheus tem as laterais cheias descendo
até a orelha; o Mafra Kitty tem franja cobrindo a testa; este tem as laterais
**na pele** e a massa toda no alto. Ele é o único do elenco cuja parte mais
larga do cabelo fica na coroa, e não nas tempas. O fade não é pele lisa: são
duas passadas de pelo rapado (0,30 larga e 0,54 colada na borda do cabelo) mais
a costeleta, que é por onde o fade encontra a barba. Sem essas passadas a
lateral lia como calvície.

**A barba.** Cheia, com a linha da bochecha **marcada** — uma diagonal da
costeleta ao canto da boca. A do Matheus é rala (opacidade 0,52 e 0,22, sem
borda); esta é uma massa só, a 0,72, com recorte em volta da boca. A primeira
versão tinha essa linha na altura do olho: o rosto lia como máscara. Ela desceu
até a diagonal da referência, e sobrou bochecha clara no meio — que é o que
mantém o rosto legível.

**O cristal.** Ponta chapada em **três faixas de borda dura**, não em degradê —
mesma regra da pérola e da corrente do Matheus. E não inventa cor nenhuma: o
rosa-violeta e o azul são duas das oito cores de assento (`#C97AB0`, `#5B8DC9`)
e a ponta é o verde-garrafa do jogo (`#3A7D6E`). É **o único ponto de cor fria
do elenco** — todo o resto é âmbar, telha, ouro, cereja, mel. No busto ele é
~30% maior que a escala fiel, pelo mesmo motivo do sinal da Gabizinsky.

**As mãos nos bolsos.** Os antebraços viram para dentro e terminam atrás da
barra da camiseta; a barra tenta onde a mão empurra o tecido por dentro. É o
único do elenco sem mão visível, e é de propósito: veio das fotos e é mais uma
diferença de silhueta que não depende de cor nem de detalhe fino.

**A etiqueta e o medalhão são o mesmo desenho** — quadrado, círculo, ponto —,
um em tecido e outro em metal. É **marca abstrata original**: não reproduz logo,
marca nem obra de terceiros, do mesmo jeito que a camisa do Matheus tem o padrão
de listras e nenhum escudo.

**Limiares medidos**

| | resultado |
|---|---|
| solado creme | lê até **64 px** — é a última coisa da figura a sobreviver |
| barba e fade | leem a 48 px no busto; na figura, ≥96 px |
| cristal | três faixas ≥288 px · ponto de cor ≥192 px · marca escura no pescoço ≥96 px · nada a 64 px |
| etiqueta do peito | quadrado ≥288 px · ponto claro 128–192 px · some a 96 px |
| bolso cargo | aba e pesponto ≥192 px · a 128 px vira sombra |
| as duas argolas | ≥400 px — detalhe, não sinal (como a do Mafra Kitty) |

**No assento (56×58).** Testado no segundo tamanho de uso, junto com o resto
do elenco: ver `elenco-teste-assento-58px.png`. Ele é a figura mais escura da fila e
depende do halo para ter borda — mas contra o mesmo fundo a camiseta dele está a
L\* 23,5 e o corset da Dri, a 15,5: são **8 pontos a mais de folga** que a peça
mais escura do elenco, que já vivia bem ali. Passa.

**Alternativa:** `junior-alt-preto-lavado-*` — "quanto preto é preto" é a decisão
dele que mais pode mudar, como a jeans do Mafra Kitty. Diferente da dele, esta
alternativa muda a **camiseta**, que aparece no busto: por isso ela tem avatar
próprio também.

**Close:** `junior-cristal.svg`, com os dois metais no tamanho em que existem —
mesmo papel do `matheus-pulso.svg`, do `gabizinsky-anel.svg` e do
`mafra-kitty-estampa.svg`.

---

## 8 · Lyly

Cabelo rosa claro, vestido longo de florzinhas com talho na frente, manga
bufante, colar de prata com uma flor e uma bolinha de piercing no canto da boca.
**A única silhueta em coluna do elenco** — todo o resto mostra perna ou calça.

| elemento | hex | L\* |
|---|---|---|
| cabelo rosa | `#EF7F8D` | 66 |
| brilho | `#F8A9AE` | 76 |
| sombra | `#C9566E` | 50 |
| sobrancelha (não acompanha o rosa) | `#6B4A46` | 34 |
| vestido ameixa | `#4A3547` | 25 |
| sombra do vestido | `#382839` | 18 |
| laço | `#33242F` | 16 |
| pele — a mais clara do elenco | `#F9D8C4` | 88 |
| batom vinho | `#5E2433` | 23 |
| *fundo do jogo* | `#2A1B12` | *13* |

Florzinhas: creme `#F5F1E6`, miolo âmbar `#F2C14E`, algumas rosadas `#E58AA0`,
folha `#6E7A5A`. Prata do colar e do piercing: `#C9CDD2`.

**O problema desta personagem era a Gabizinsky.** As duas são de cabelo
vermelho-rosa, e o cabelo da Gabizinsky é o sinal dominante dela a 48 px. Rosa
perto do cereja e quem perde é ela. A separação foi feita em duas frentes ao
mesmo tempo, nenhuma dependendo de detalhe fino:

*Valor do cabelo.* Cereja `#C6335A` está em L\* 44; o rosa `#EF7F8D`, em L\* 66.
São 22 pontos: a 48 px uma lê como mancha escura quente, a outra como mancha
clara.

*Valor do torso, invertido.* A Gabizinsky é cabelo escuro sobre body azul claro.
A Lyly é o contrário — cabelo claro sobre vestido escuro. O par cabelo/torso
troca de lado inteiro, e isso continua verdade mesmo quando a cor se perde.

**O vestido.** Ameixa `#4A3547`, L\* 25, de propósito **acima** da faixa da Dri
(15 a 23). Dois pretos na mesma faixa brigariam; este fica um degrau acima e
ainda é o único roxo do elenco. A saia leva o halo quente de sempre — continua
sendo peça escura sobre fundo escuro.

**O talho** existe pela mesma razão que pôs mel na Dri: coluna escura de 400
unidades vira bloco. Ele abre a frente da saia e deixa a perna clara entrar no
meio da figura. É também o que impede o vestido longo de virar mancha única na
janela de 58 px do assento.

**A estampa é uma flor só, em três escalas.** Cinco pétalas: pontinho na saia,
média na manga, grande e de prata no colar. Uma forma repetida é o que faz joia
e tecido lerem como a mesma pessoa — mesmo raciocínio do gatinho do Mafra Kitty.

**A pele.** `#F9D8C4`, subtom rosado. A descrição pedia mulher branca; a EstereX
já tinha puxado a pele para o dourado, então esta puxa para o outro lado. O
campo `pele` de `shared/elenco.js` precisa desse valor: as mãos que seguram as
cartas são desenhadas na hora, com o tom de quem está jogando.

**O piercing.** Bolinha de prata com contorno, no canto **esquerdo** da boca dela
(= direita de quem olha), colada no canto de propósito. Solta, ela viraria um
ponto escuro no rosto no tamanho pequeno — que é exatamente o sinal da
Gabizinsky, a pinta. Colada, funde com a boca e some sem deixar sósia. Pelo
mesmo motivo ela fica do lado oposto ao da pinta dela.

**A franja cortina.** Duas mechas saem da risca (x≈126) e descem abertas até a
altura da boca. É a quarta solução de cabelo do elenco, e nenhuma repete outra:
risca ao meio lisa (Gabizinsky), risca lateral com mel (Dri), franja fechada
(Mafra Kitty), cortina (Lyly). Calota e cortina são **um caminho só**: desenhadas
separadas, o contorno da calota cruzava a mecha e lia como arranhão no rosto.

**O laço.** Preso no alto do cabelo, do lado esquerdo de quem olha, em `#33242F`
— o único preto de verdade dela. Escuro sobre rosa claro é o contraste mais alto
da personagem, e é o segundo sinal a 48 px, depois da cor do cabelo. É também o
único acessório de cabelo do elenco.

**Estatura.** 687 unidades, o mesmo número da Dri: era o pedido. O ganho veio de
perna — `DY = -3` sobe tronco, braços, mãos e cabeça juntos, e o chão continua
em `y=733`.

**Limiares medidos**

| | resultado |
|---|---|
| piercing | bolinha com contorno ≥288 px de figura · ponto claro a 192 px · um pixel a 128 px · some abaixo |
| florzinha com pétalas | ≥288 px · pontinho claro de 96 a 192 px · textura sem forma a 64 px |
| flor do colar | ≥96 px de figura · no avatar a 48 px é uma mancha clara no pescoço, e é o suficiente |
| laço | lê a 48 px no avatar, que é onde ele trabalha · na figura inteira some abaixo de ~128 px |
| talho da saia | lê até 96 px · a 64 px vira um fio |

**Alternativa:** `lyly-alt-oculos-*` (os óculos da foto de rua). Fora do
canônico porque óculos são o sinal da EstereX a 48 px; na alternativa a armação
é de acetato escuro e grosso, para não virar o par dela.

**Close:** `lyly-piercing.svg` — mesmo papel do `matheus-pulso.svg`. É um zoom do
próprio avatar (mesmo `bust()`, mesma `head()`), e não um desenho paralelo que
pudesse divergir dele; o contorno fica em 6 unidades em vez de crescer junto com
o zoom.

---

## 9 · Mufasa

Camiseta preta de gola alta sobre uma segunda pele de manga comprida, bermuda
bege, legging preta, tênis cinza-chumbo. Cachos caindo na testa, óculos ovais de
prata, bigode cheio e barba curta. Argola em cada orelha e argola na sobrancelha
direita. **O único do elenco partido ao meio por valor**: preto em cima, bege no
quadril, preto de novo embaixo.

| elemento | hex | L\* |
|---|---|---|
| camiseta (preto frio, matiz 248) | `#33323A` | 21,2 |
| legging | `#2B2A31` | 17,4 |
| segunda pele (gola alta e mangas) | `#26252D` | 15,1 |
| realce especular da segunda pele | `#4E4D59` | 33,2 |
| bermuda bege | `#CFC1A0` | 78,4 |
| tênis | `#4B4B54` | 32,2 |
| entressola clara | `#E3DED2` | 88,6 |
| cabelo | `#372A21` | 18,3 |
| brilho dos cachos | `#6B4F38` | 36,0 |
| armação dos óculos | `#A8AEB5` | 70,8 |
| argolas (prata do elenco) | `#C9CDD2` | 82,2 |

As três peças escuras dele são uma escada limpa de três degraus: segunda pele
15,1 · legging 17,4 · camiseta 21,2. A peça que fica por baixo é sempre a mais
escura, e é a legging — não a camiseta — que precisa do halo, porque é ela que
encosta no chão.

**Qual das três fotos.** Vieram três referências: a da academia (camiseta preta,
bermuda bege, legging, tênis), uma social (camisa preta de cetim, calça preta,
sapato preto) e um retrato de camiseta branca com corrente. Ficou a primeira, por
eliminação: a social bate de frente com o Junior, que já é preto de cima a baixo;
a branca bate com o Mafra Kitty, que é o único torso claro do elenco. A da
academia é a única que não repete ninguém — e ainda traz o que faltava na mesa,
um **bloco claro na altura do quadril**.

**O bege só existe por causa da manga comprida.** `#CFC1A0` contra a pele
`#F4CFAA` são 7 pontos de L\* e bem menos croma, o que ajuda mas não bastaria. O
que resolve é a manga: abaixo do pescoço a única pele da figura são as mãos, e
elas chegam emolduradas pelo punho preto. Fosse manga curta, dois antebraços cor
de pele encostariam no bege dos dois lados e a leitura cairia.

**Óculos.** Ovais e de prata porque os quadrados e dourados são da EstereX — a 48
px o que chega é "tem óculos", então a diferença tem de estar no metal e na
forma, que são as duas coisas que sobrevivem ao tamanho. O fio é **3.1**, o número
que ela mediu (2.0 quebra em fragmentos), emprestado inteiro. A construção também
é a dela: **um traço só de cor, sem contorno preto por baixo**, véu de 9% na lente
e reflexo diagonal cortado pela lente. A primeira versão daqui desenhou contorno
preto com prata por cima, que é como o resto do elenco faz metal — e virou óculos
de mergulho. A armação usa `#A8AEB5`, um degrau mais escuro que a prata das
argolas: fio fino de prata clara sobre pele clara não se vê.

**Os cachos são gerados, não desenhados.** `coil_edge()` amostra uma elipse em 11
arcos e estufa cada um para fora por um valor de uma lista escrita à mão — nunca
sorteada, porque o SVG tem de sair igual byte a byte toda vez que o script roda.
As amplitudes alternam grande/pequeno pela mesma razão que as ondas do Mafra
Kitty: lóbulo do mesmo tamanho lê como nuvem, não como cabelo. A franja também é
serrilhada e **para 6 unidades acima da sobrancelha** — esse número é dele, medido
no Mafra Kitty; encostando, as duas massas escuras viram uma faixa só sobre os
olhos e o rosto lê como máscara.

Por dentro da massa os cachos são **meios-arcos de luz** (`#6B4F38`), sem contorno
interno nenhum — a lição de "cordas" que veio do cabelo da Dri. A primeira versão
tinha onze voltas quase fechadas e lia como macarrão; ficaram seis meios-arcos a
45% de opacidade.

**Cabelo `#372A21` — praticamente o do Matheus** (`#3A2A20`). Aqui a cor não é o
separador, e isso é deliberado: quem separa os dois é a franja de cachos contra a
testa à mostra. O que o cabelo dele tem de próprio é o realce mais claro de cabelo
do elenco, porque cacho sem luz vira mancha.

**A gola alta.** É o único do elenco com o pescoço coberto, e é ela que separa o
busto dele do busto do Junior — que mostra pescoço, cordão e cristal exatamente no
mesmo lugar da moldura.

**Halo nos braços.** É também o único de manga comprida preta, ou seja: braço
escuro contra feltro escuro, que é exatamente o caso que o halo existe para
resolver. Os braços levam `#8C6A45` de 46 unidades por fora, além do halo de
sempre na camiseta e na legging. Nos outros o braço é pele e não precisa.

**O que ficou de fora, e por quê.** A corrente com pingente do retrato: o Matheus
e o Junior já carregam corrente no peito, e é o peito vazio dele que faz o bege
ser a única coisa clara da figura. O relógio e o anel da foto social: não aparecem
na foto da academia, o anel é do Matheus, e "metal todo acima do pescoço" é o
lugar dele na tabela de metais.

**O nome.** "Mufasa" aqui é apelido de pessoa, como o resto do elenco. Nada no
desenho faz referência a leão, juba ou coroa — a regra do topo deste arquivo vale
aqui como valeu para escudo de time e para a Hello Kitty.

**Limiares medidos** (as tiras estão no `mufasa-previa.png`)

| | resultado |
|---|---|
| bloco bege da bermuda | lê até **64 px** de figura — é a última coisa a sobreviver |
| óculos | leem a 48 px de avatar, que é o tamanho de uso · a 32 viram faixa cinza · a 24, nada |
| cachos como silhueta | leem a 48 px |
| bigode | ≥48 px de avatar |
| argolas (orelha e sobrancelha) | detalhe: só a partir de ~96 px de avatar |

**Alternativa:** `mufasa-alt-bermuda-preta-corpo-inteiro.svg` — "quanto bege é
bege" é a decisão dele que mais pode mudar depois, como a jeans do Mafra Kitty.
Como a bermuda não aparece no busto, a alternativa não tem avatar próprio.

**Close:** `mufasa-prata.svg`, com os três pontos de prata no tamanho em que
existem de verdade. Diferente dos outros closes, este não redesenha nada: é a
mesma função `head()` do gerador, ampliada 3,3× e chamada com o traço fino o
bastante para que, depois da ampliação, ele volte à espessura de um close.

---

## 10 · Distinguibilidade a 48 px

É o teste que importa num jogo. Ver `elenco-teste-48px.png`.

| | sinal dominante |
|---|---|
| Gabizinsky | **cabelo cereja escuro** sobre torso azul claro |
| Dri | massa escura larga com **dois fios de mel** flanqueando o rosto |
| EstereX | **óculos dourados** + boca vermelha + torso vermelho |
| Matheus | testa à mostra + **camisa listrada** + barba |
| Mafra Kitty | **torso claro** + franja cobrindo a testa + sem barba |
| Junior | **torso preto** + cap alto com as laterais na pele + barba cheia |
| Lyly | **cabelo rosa claro** sobre torso escuro de florzinhas, mais o laço |
| Mufasa | **massa de cachos** + óculos de prata + torso preto |

As oito leituras são distintas. Cinco pares já foram apertados:

**Dri × EstereX** separou depois que a Dri ganhou volume de cabelo e a EstereX
perdeu: hoje uma é massa larga e a outra é enxuta.

**Matheus × Mafra Kitty** separa por **duas** coisas nos tamanhos de uso, e por
três só no tamanho grande. Nos dois pequenos (48 px e a janela de 58 px do
assento) trabalham o **valor do torso** — listrado médio-escuro × claro, o mais
forte dos dois, que sozinho já resolveria — e a **silhueta do cabelo**, testa à
mostra × franja, que é o que segura se um dia aparecer alguém de listrado claro.

O **pelo no rosto** (barba e bigode × nada) **não** entra nessa conta, e a tabela
de limiares do Matheus já dizia isso antes de alguém conferir: *barba rala
≥64 px*. A 48 px sobra uma sombra fraca no queixo, que ninguém usaria para
decidir; no assento some de vez. Ele volta a ser separador de 64 px para cima —
na figura inteira, na tela de escolha e nos closes.

A frase antiga dizia "as três juntas seguram" e contradizia o limiar medido duas
seções acima. Fica a regra que a correção da linha da Gabizinsky já tinha
ensinado, agora aplicada ao contrário: **não some separadores, diga quais valem
em cada tamanho de uso.** Somar dá uma sensação de folga que o tamanho pequeno
não tem.

**Matheus × Junior** é o par novo, e é o mais apertado de todos: dois homens de
cabelo escuro **com barba**. A regra das três separações valeu de novo, e o
resultado é uma tabela em que nenhum dos três homens repete nenhuma coluna:

| | torso | cabelo | pelo no rosto |
|---|---|---|---|
| Matheus | listrado, valor médio | penteado para trás, laterais cheias | barba **rala** |
| Mafra Kitty | claro | franja cobrindo a testa | **nada** |
| Junior | preto | cap alto, laterais **raspadas** | barba **cheia** |

Isso valeu enquanto eram três homens.

**Junior × Mufasa** é o par mais apertado que o elenco já teve, e o primeiro em
que uma coluna **repete**: os dois têm torso preto, e as fotos de referência não
davam outra saída. Quando uma coluna repete, as outras têm de trabalhar mais — e
aqui são três, nenhuma dependendo de detalhe fino:

| | torso | cabelo | pescoço | rosto |
|---|---|---|---|---|
| Junior | preto | cap alto, laterais raspadas | pele + cordão + **cristal** | sem óculos |
| Mufasa | preto | **cachos**, franja serrilhada | **gola alta**, pele nenhuma | **óculos de prata** |

Sobre os dois pretos: eles ficam a 2,3 pontos de L\* um do outro (23,5 × 21,2),
então **o valor não separa**. Quem separa é a **temperatura** — barro (matiz 23) ×
grafite (matiz 248) —, que é exatamente o que já resolvia Dri × Junior. E ela não
é teórica: na janela do assento, onde o torso é a maior mancha da moldura, um lê
marrom-escuro e o outro lê azul-escuro. Conferido em rasterização nativa a 56×58,
não em redução de PNG grande, que suavizaria a favor.

No corpo inteiro entra ainda uma quarta diferença, que é a maior de todas: o
Junior é preto até o chão e o Mufasa tem o bloco bege no quadril. Ela **não** foi
contada entre as separadoras de propósito, porque na janela do assento o corte
para no peito e ela simplesmente não aparece.

**Gabizinsky × Lyly** é o par das duas de cabelo vermelho-rosa. São 22 pontos
de L\* entre o cereja (44) e o rosa (66), e o valor do torso se inverte junto:
escuro sobre claro × claro sobre escuro. O laço é o terceiro separador, e é o
único que não depende de cor.

Este par obrigou a **reescrever o sinal dominante da Gabizinsky** na tabela
acima. Até aqui ele era "o único cabelo claro do elenco" — verdade enquanto
eram quatro, e falsa no minuto em que entrou um rosa mais claro que o cereja
dela. Um sinal que se define por exclusão (*o único que…*) envelhece toda vez
que alguém novo senta à mesa; um que se define pelo próprio desenho (cereja
escuro **sobre** torso claro) continua valendo. As duas linhas hoje se explicam
uma à outra, que é o que uma tabela de distinguibilidade deveria fazer.

**Dri × Junior** é o par de roupa preta, e não chegou a apertar: a Dri é massa
de cabelo larga descendo até o quadril, o Junior é cabeça compacta com barba.
Além disso os pretos são de temperaturas opostas — ver a seção dele.

### O segundo tamanho de uso: o assento

A mesa passou a mostrar **o corpo inteiro**, e não o busto, em cada assento: a
figura desenhada a `56×112` px numa janela de `56×58` — ou seja, a metade de
cima, cabeça e peito, com o resto cortado. Os avatares circulares continuam no
lobby e no detalhe.

Isso quer dizer que `<slug>-corpo-inteiro.svg` tem **dois** tamanhos de uso, não
um: a figura grande e esses 58 px. Os cinco foram conferidos aí, em renderização
nativa (não em redução de PNG grande), e as leituras seguem distintas — inclusive
porque o corte pega exatamente a faixa onde moram os sinais dominantes: cabelo,
rosto e torso. Quem for desenhar o próximo: teste nesse tamanho também, e
não só a 48 px — a Lyly foi conferida aí antes de fechar, e é o tamanho em que o
talho da saia dela justifica existir.

---

## 11 · Arquivos

**O que é versionado e o que é derivado.** Só os **SVG** (os masters) e as
folhas de **evidência** que este README cita ficam no repositório. Toda
rasterização — `@1x/@2x/@3x`, `-256`, `-teste-tamanho-pequeno` e as folhas de
conjunto do elenco — sai do SVG em um comando e está no `.gitignore` desde
08/09/2026: eram 10,7 MB parados no repositório e em todo deploy, e o jogo
nunca as pede (ele usa o SVG). Para tê-las de volta na sua máquina:

```bash
python3 _geradores/rasterizar.py <nome>     # os PNGs de uma personagem
python3 _geradores/rasterizar.py --elenco   # as folhas de conjunto
```

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

Dos que estão nessa lista, só os `.svg` e o `-previa.png` estão no repositório;
o resto é gerado (veja acima).

Closes: `gabizinsky-anel.svg`, `matheus-pulso.svg`, `mafra-kitty-estampa.svg`,
`junior-cristal.svg`, `lyly-piercing.svg`, `mufasa-prata.svg` (os quatro últimos
com `@1x`/`@2x` em PNG, como o `matheus-pulso`).

Conjunto: `elenco-<n>-personagens.png`, onde o `n` é o tamanho do elenco na
hora. Só a folha mais nova fica — as de três, quatro, cinco e seis já saíram —,
então **não escreva o número dela em texto**: quem escreveu (eu, duas vezes)
ficou com referência quebrada em menos de uma hora. As outras duas,
`elenco-teste-48px.png` e `elenco-teste-assento-58px.png` (as figuras na janela
de 56×58 do assento), têm nome fixo justamente por isso.

Testes específicos: `esterex-teste-oculos.png`, `esterex-teste-volume-cabelo.png`,
`matheus-teste-barba.png`, `matheus-teste-escala-colar.png`,
`matheus-teste-prata.png`, `gabizinsky-teste-escala-anel.png`. O teste do Mafra Kitty (até onde a estampa
lê) mora dentro do `mafra-kitty-previa.png`, não em arquivo separado.

O Mafra Kitty não tem `-avatar` alternativo: a variante dele muda só a calça, que
não aparece no busto. O Mufasa também não, pela mesma razão — a dele muda só a
bermuda. O Junior tem: a dele muda a camiseta.

### Geradores

Os SVGs não são desenhados à mão: saem de scripts Python em `_geradores/`,
um por personagem. Alterar cor, volume de cabelo ou proporção é mudar uma
variável e rodar de novo.

| script | personagem |
|---|---|
| `gen.py` | Gabizinsky |
| `gen2.py` | Dri |
| `gen3.py` | EstereX |
| `gen4.py` | Matheus |
| `gen5.py` | Mafra Kitty |
| `gen6.py` | Lyly |
| `gen7.py` | Mufasa |
| `gen8.py` | Junior |

**O número do script não é a ordem do elenco.** O Junior é o `gen8` porque
nasceu em paralelo com outras personagens, na mesma árvore, e o 6 e o 7 já
tinham dono quando ele foi salvo. Quem liga script a personagem é esta tabela —
não o número, e não a ordem das seções aqui.

```bash
cd _geradores
python3 gen.py            # regenera os SVGs da Gabizinsky
EX_VOL=B python3 gen3.py  # regenera a EstereX com outro volume de cabelo
```

Todos escrevem no diretório **acima** do `_geradores/`, que é onde os SVGs
moram. (Até a sessão do Mafra Kitty os quatro primeiros escreviam ao lado de si
mesmos — os SVGs tinham sido movidos para cá depois, e o `OUT` ficou para trás.
Rodar qualquer um deles hoje reproduz os SVGs versionados byte a byte.)

### E os PNGs?

Os geradores só escrevem SVG. Os PNGs (`@1x`/`@2x`/`@3x`/`-256`, as prévias e as
folhas de conjunto) são rasterizados fora deles — nesta máquina não há
`rsvg-convert`, `cairosvg` nem ImageMagick, então quem rasteriza é o navegador
(SVG → PNG) e quem monta as folhas é o Pillow.

Desde a sessão da Lyly isso está num script, `_geradores/rasterizar.py`, que usa
o **Chrome em modo headless** — que existe nesta máquina e aceita o tamanho de
saída na linha de comando:

```bash
cd _geradores
python3 rasterizar.py lyly lyly-piercing   # PNGs de alguém, mais os closes
python3 rasterizar.py --elenco             # as folhas de conjunto e os dois testes
```

Ele lê `shared/elenco.js` para saber quem está na mesa, então as folhas de
conjunto saem sempre com o elenco do momento. O SVG é carregado dentro de um
`<img width height>` e não direto: um SVG com `width`/`height` próprios abre no
tamanho intrínseco, e a janela menor recortaria em vez de reduzir.

### Três rasterizadores moram nesta pasta

Os PNGs versionados não saíram todos da mesma ferramenta. Isso foi medido, não
deduzido: para cada personagem, rerasterizar o SVG **que não mudou** e comparar
com o PNG em disco.

| origem | quem | reproduz hoje? |
|---|---|---|
| desconhecida | Gabizinsky, Dri, EstereX e o Matheus original | **não** — ninguém tem mais essa ferramenta |
| navegador embutido do Claude Code (`<canvas>`) | Mafra Kitty, Junior | **sim, byte a byte** |
| Chrome headless (`rasterizar.py`) | Lyly, Mufasa, Matheus | **sim** — é o caminho de hoje |

O corte é limpo no relógio: tudo que foi rasterizado de manhã (07:50–08:56) caiu
no primeiro grupo, tudo à tarde (17:28 em diante) no segundo.

**O navegador embutido é determinístico.** Reproduz byte a byte entre sessões
diferentes, horas depois, e mesmo trocando a técnica — desenhar o SVG com
`drawImage` escalando ou com `width`/`height` explícitos no `<img>` dá o mesmo
arquivo. Foi conferido nos dois sentidos, inclusive no caso mais duro, o avatar
de 48×48. Então quando um PNG do primeiro grupo não reproduz, não é acaso nem
técnica: é outra ferramenta.

**A diferença é sempre antialiasing de borda, nunca conteúdo.** Medido entre o
navegador embutido e o Chrome headless, com o mesmo SVG:

| | pixels idênticos | delta máx. |
|---|---|---|
| `-avatar@1x` (48×48) | 58% | 78 |
| `-avatar-256` (256×256) | 88% | 101 |
| `-corpo-inteiro@3x` (1200×2400) | 98% | 116 |

**Daí a armadilha, e ela é ao contrário do que se espera: quanto menor o
arquivo, mais assustador o diff.** Num avatar de 48 px quase todo pixel é borda,
então um `@1x` com 42% dos pixels diferentes e um `@3x` com 2% podem ser
exatamente a mesma imagem. Antes de condenar arte que mudou, olhe *onde* o diff
cai: se for só contorno, é o rasterizador. Um diff de PNG não prova nada
sozinho.

**Se a homogeneidade importar, rerasterize tudo de uma vez** com o
`rasterizar.py` e nunca mais misture. Caso a caso é o que espalha a
heterogeneidade em vez de resolvê-la. Falta o primeiro grupo e o segundo.

E vale a proporção: o jogo carrega os SVGs (`figuraDe`/`caraDe` no `client.js`).
Os PNGs são material de documentação, e nada disso chega ao jogo.
