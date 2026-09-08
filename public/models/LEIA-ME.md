# Modelos 3D do elenco — o que a mesa espera

Os personagens da mesa 3D podem vir de **modelos glTF feitos fora** (Blender,
ferramenta de geração 3D, artista). Quando existe `public/models/<slug>.glb`,
a mesa carrega o modelo e o põe no assento no lugar do boneco montado por
código; quando não existe, o boneco de código continua. Os slugs são os do
elenco (`shared/elenco.js`): `gabizinsky`, `dri`, `esterex`, `matheus`,
`mafra-kitty`, `junior`, `lyly`, `mufasa`.

Tudo aqui é arte original do jogo. Nada de modelo, textura ou rig de
terceiros com identidade própria — o critério é o mesmo do elenco em SVG.

## Formato e medidas

| | |
|---|---|
| Arquivo | `public/models/<slug>.glb` (glTF binário, um arquivo só, texturas embutidas) |
| Unidade | metros. A mesa tem o tampo a **0,76 m** do chão (mesa de jantar; era 0,92 até 2026-09-05) |
| Altura | em metros. Um arquivo que traz o nó `Cabeca` (passou pelo preparo) é mostrado na escala dele; se além disso tem esqueleto (rigado e sentado), entra na **escala do elenco**, ×1,2 — a mesa é de desenho (cartas de 42 cm, bonecos com a cabeça a 1,55 m sentados) e uma pessoa de tamanho real ficava pequena e baixa atrás da borda. Sem o nó, a mesa **normaliza** para ~1,55 m. Mantenha as proporções entre os oito |
| Origem | no **chão, no eixo do corpo** (y = 0; x e z = 0 no tronco). A mesa põe a origem no assento e só corrige a altura — não centraliza em x/z, porque num modelo sentado as pernas vão para a frente e a caixa engana |
| Frente | olhando para **+Z**. A mesa vira o personagem para a mesa |
| Pose | **sentado segurando um leque de cartas com as duas mãos**, na altura do peito (é onde o leque da mesa entra). Desde 07/09/2026 é assim que o elenco é esculpido: o modelo já vem posado, sem esqueleto, e a mesa não mexe em braços nem dedos |
| Polígonos | até ~30 mil triângulos por personagem (o trio de teste de 2026-09-04 veio com 25–30 mil e roda; o contorno do elenco desenha cada malha duas vezes, então menos é melhor no celular); texturas até 1024×1024 |
| Materiais | cor chapada, como o elenco. PBR simples (`baseColor`, com ou sem textura, sem metal): a mesa troca pelo sombreamento dela em três degraus, com contorno (veja abaixo). Normal map, se vier, fica: dobras e mechas assadas de uma escultura entram nos degraus sem custar triângulos |

## Nós com nome (opcionais, mas é o que liga as coisas)

| Nó | Para quê |
|---|---|
| `Cabeca` | um nó (pode ser vazio) no centro da cabeça. É onde a mesa pendura a **boca da fala** do chat de voz e o rótulo do nome. Sem ele, a mesa usa 88% da altura |
| `MaoEsq` / `MaoDir` | pontos das mãos. É onde o leque de cartas viradas aparece. Sem eles, a mesa usa a posição padrão |

## Expressões (opcionais)

| Como | O que a mesa faz |
|---|---|
| **Morph targets** com os nomes `feliz`, `bravo`, `bocaAberta` | `feliz`/`bravo` entram nas reações do jogo (baixou, bateu, perdeu a carta); `bocaAberta` é movida pelo nível do microfone de quem fala |
| **Animações** (clips) com os nomes `idle`, `feliz`, `bravo` | `idle` roda em laço; as outras tocam uma vez na reação e voltam ao `idle` |

Sem nada disso, o personagem fica parado e a boca da fala é a elipse escura
da mesa, pendurada no nó `Cabeca` (ou na altura calculada).

## Como ligar um modelo

Ponha o arquivo em `public/models/<slug>.glb` **e** acrescente o slug em
`public/models/lista.json`:

```json
{ "modelos": ["dri", "mufasa"] }
```

A mesa lê essa lista uma vez e só pede os modelos que estão nela — sem a
lista, ela não tenta às cegas (era um erro 404 no console por assento sem
modelo).

## Do arquivo esculpido ao `.glb` da mesa

Uma escultura de milhões de triângulos (ou uma "ficha" com frente, lado e
costas exportada como malha única) vira modelo de jogo com dois scripts, que
usam o `@gltf-transform/cli` pelo `npx` (baixa sozinho na primeira vez):

```bash
node test/modelo-recorta.mjs ficha.glb frente.glb --frente
```

separa as figuras pelos vazios no eixo x, descobre para onde cada uma olha
pela ponta dos pés e grava só a que olha para +Z, recentrada, com material e
texturas. Pule este passo se o arquivo já traz uma figura só.

```bash
node test/modelo-prepara.mjs frente.glb public/models/<slug>.glb --tri 30000 --cabeca 0.91
```

solda vértices, reduz para o orçamento (`--tri`), encolhe as texturas para
1024 px, tira o mapa de metal/rugosidade (o estilo do elenco o ignora, e numa
escultura assada ele pesa mais que a cor), converte a cor PNG em JPEG quando
não há transparência, traz a altura para 1,65 m (`--altura`), leva os pés ao
chão se o arquivo veio com a origem no meio do corpo, e injeta o nó `Cabeca` na fração da altura dada (`--cabeca
0.91` é a cabeça de alguém em pé; sentado, algo como 0.88). Com `--maos x,y,z` injeta
também `MaoDir`/`MaoEsq` (a esquerda espelhada); sem isso o leque fica na
posição padrão. Depois: abrir no provador e pôr o slug na lista.

## Sentar e animar: o rig automático

A escultura chega em pé e sem esqueleto. Para sentar com as mãos à frente e
ter os clips `idle`/`feliz`/`bravo`, o caminho é um **rigger automático** —
o Mixamo (Adobe, gratuito, no navegador) serve: ele cria o esqueleto e tem
dezenas de animações sentadas prontas. Ferramentas de vídeo (Flow, Veo,
Sora) não servem: geram imagens, não malha com esqueleto.

1. Gere o pacote de subida a partir do `.glb` já reduzido:
   ```bash
   node test/modelo-obj.mjs public/models/<slug>.glb ~/Downloads/<slug>-para-rig.zip
   ```
   (OBJ + MTL + texturas, o formato que o rigger aceita).
2. No Mixamo: **Upload character** → o `.zip` → marque queixo, pulsos,
   cotovelos, joelhos e virilha na foto → **Next**. Depois escolha as
   animações: uma sentada e parada para `idle` (busque *Sitting Idle*), uma
   alegre para `feliz` (*Sitting Clap*, *Sitting Laughing*) e uma zangada
   para `bravo` (*Sitting Disapproval*, *Sitting Angry*). Baixe cada uma em
   **FBX Binary, With Skin, 30 fps** (a de `idle` pode ser *In Place*).
3. Junte tudo num `.glb` da mesa:
   ```bash
   node test/modelo-prepara.mjs idle.fbx public/models/<slug>.glb --clip feliz=feliz.fbx --clip bravo=bravo.fbx
   ```
   O script converte os FBX (baixa o FBX2glTF uma vez, para `~/.cache`),
   funde os clips casando os ossos pelo nome, pendura `Cabeca` no osso da
   cabeça e `MaoEsq`/`MaoDir` nos ossos das mãos, e o leque entra entre
   elas. Abra no provador: os botões **feliz** e **bravo** tocam os clips.

**Se o rigger devolveu um clip de sentar em vez de uma pose sentada** (foi o
caso da EstereX: `Stand_to_Sit_Transition_M`, mais andar e correr), há um
passo antes do preparo:

```bash
node test/modelo-senta.mjs esterex-rigged.glb sentada.glb --gira Spine02=-15,-55,0
node test/modelo-prepara.mjs sentada.glb public/models/esterex.glb --tri 32000 --altura 0
```

`modelo-senta` assa o último quadro do clip como pose de repouso (ela passa a
ESTAR sentada, na origem: o andar até a cadeira é descartado, fica só a
descida do quadril), gira os braços até cotovelos e mãos caírem nos pontos
de quem segura um leque na frente do peito (`--mira Junta=x,y,z`, em metros;
os padrões servem a um rig humano), apaga os clips de andar e cria os três
do contrato em cima da pose nova: `idle` (respiro), `feliz` (aceno de
cabeça), `bravo` (balanço de cabeça). `--gira Osso=x,y,z` gira um osso em
graus nos eixos do mundo — serve para endireitar o tronco, que esse clip
deixa torcido. O quadril recua um pouco (`--recuo 0.12`, em metros): o clip senta na
beirada, e a banqueta quer as coxas apoiadas. E acima da cintura (`--cintura`, padrão 5 cm abaixo do osso do
quadril) os ossos da perna perdem o peso: o rigger automático espalha o
peso da coxa até a barriga, e com a coxa a 90° isso virava uma mancha de pele
por cima da calça. O tronco fica 15° mais ereto que no clip (que curva para
a frente) e os pulsos meio virados para dentro. O quadril vai para a altura
da **cadeira** da mesa (`--assento 0.45`, mais `--folga 0.16`, que é a
distância do assento ao osso do quadril para as coxas apoiarem EM CIMA, sem
atravessar). A mesa é de jantar (tampo a 0,76 m) desde 2026-09-05: as coxas
entram sob o tampo e os cotovelos ficam na borda — as miras padrão dos braços
já são essas (cotovelos a 16 cm acima do quadril, mãos a 24 cm, com o leque
logo acima do tampo). Na mesa, o leque de um
modelo fica à frente das mãos, 6 cm abaixo da ponta dos dedos: as cartas
escondem as mãos e só os dedos aparecem acima da borda, como no boneco de
código — o rig não tem dedos para fechar a mão, e com o leque entre as mãos
as cartas atravessavam os dedos. Depois, `--altura 0` no preparo: um modelo sentado não pode
ser medido pela caixa. E como o arquivo traz o nó `Cabeca`, a mesa confia
na escala dele em vez de normalizar (um sentado normalizado para 1,55 m
viraria uma gigante).

**Se o rigger devolveu só repouso, andar e correr** (foi o caso dos oito de
2026-09-05), a pose sentada vem de outro arquivo já assado, com `--pose`:

```bash
node test/modelo-senta.mjs 3D-Junior.glb junior-s.glb --pose pose-esterex-antiga.glb
node test/modelo-prepara.mjs junior-s.glb public/models/junior.glb --tri 32000 --altura 0
```

O que viaja não é a rotação de cada osso (rigs do mesmo esqueleto têm os
ossos de repouso orientados de jeitos diferentes, e copiar torcia os
membros), mas o **deslocamento de cada osso em relação ao próprio repouso**,
lido das `inverseBindMatrices` do skin: `D = pose_fonte · repouso_fonte⁻¹`,
`pose_alvo = D · repouso_alvo`. Braços e mãos são resolvidos depois pelas
miras, que são relativas ao osso do quadril. A pose de referência é a EstereX
sentada do dia 5 (`git show 0d9b0a3:public/models/esterex.glb`).

O que o rig automático não dá: os morphs `feliz`/`bravo`/`bocaAberta` (a
cara continua a mesma; a reação é do corpo, e a fala usa a elipse escura).
Isso é escultura de expressão, na ferramenta de modelagem. E **dedos**: este
rig tem 24 ossos e nenhum de dedo, então a mão não fecha; um rigger com
esqueleto de dedos (Mixamo com o esqueleto de 65 ossos, AccuRIG, Rigify no
Blender) resolve, e aí o script pode fechar os dedos em volta do leque.

A Dri veio diferente: já com uma figura só e 31 mil triângulos, mas 17,5 MB
de PNG assado (cor 6,7 MB e metal 9,6 MB em 4096 px) e a origem no meio do
corpo. Saiu com 30 mil triângulos e 1,6 MB. A EstereX veio parecida, mas com
**12 cm** de altura (outra unidade): por isso o preparo passou a trazer todo
arquivo para 1,65 m (`--altura`; 0 mantém a do arquivo) — a mesa normaliza
de qualquer jeito, mas assim os oito batem entre si.

A Gabizinsky de 2026-09-04 veio assim: ficha de 1,95 milhão de triângulos com
as quatro vistas numa malha só → figura da frente com 510 mil → 29.995
triângulos e 1,4 MB, com cor, normal map e metal/rugosidade em 1024 px. O que
o fluxo NÃO faz: pose. A escultura veio em pé, e a mesa a mostra em pé, com o
leque na posição padrão à frente do peito. Sentar exige esqueleto (rig) e uma
pose ou clip — é o próximo passo na ferramenta de modelagem.

## Como conferir

Abra **`provador.html`** (no site ou local) e toque em **Abrir .glb**: o
arquivo fica no seu navegador (não sobe para lugar nenhum), o personagem
senta à mesa com a luz e o sombreamento da mesa de verdade, e a folha embaixo
confere o contrato item a item — medidas, nós, morphs, clips, triângulos,
texturas. Os botões tocam `feliz`/`bravo`, seguram a boca da fala e trocam
entre o estilo do elenco e o material original do arquivo. Arraste para girar
e confira a frente.

Depois de pôr o arquivo em `public/models` e na lista, o mesmo provador o
mostra no menu **da mesa…**. Na partida, `3d.html` avisa no console
`modelo: <slug> carregado (altura X → 1,55)` ou o motivo de ter caído no
boneco de código.

`public/models/_exemplo.glb` é um modelo mínimo (caixas) gerado por
`test/modelo-exemplo.mjs`, com tudo o que o contrato prevê — textura
embutida, morph `bocaAberta`, clips `idle` e `feliz` — só para provar cada
caminho. Não é arte.

## O que a mesa faz com o material

O material do arquivo (PBR: cor, textura, metal, rugosidade) vira o material
do elenco: mesma cor e textura, sombreado em **três degraus** e com o contorno
escuro de casca invertida — é o que faz o modelo parecer desenhado, como o
elenco em SVG. Metal e rugosidade são ignorados. Numa malha com esqueleto
(skin) o sombreamento entra, mas o contorno não (a casca não acompanharia os
ossos). No provador, **estilo: original** mostra o material do arquivo como
veio, para comparar.
## Atualização de 07/09/2026: o elenco vem esculpido já sentado

Os oito GLBs desta revisão são **malhas estáticas, sem esqueleto**: cada
personagem foi gerado já sentado, cotovelos apoiados, segurando o leque com as
duas mãos — a pose que o jogo mostra. Foi a saída depois de duas tentativas de
articular as esculturas anteriores (rig de dedos por geometria e enxerto de uma
mão modelada à parte): mão esculpida sem vãos entre os dedos não dobra sem
rasgar, e braço movido por cinemática não convence.

Como preparar um modelo novo (imagem do personagem sentado, sem mesa nem banco,
no gerador 3D; exportar GLB sem rig):

```bash
python3 scripts/prepara_sentado.py ~/Downloads/<nome>.glb public/models/<slug>.glb
```

Ele normaliza a altura sentada para 1,45 m, põe os pés no chão, reduz para 32
mil triângulos, encolhe as texturas e mede na malha:

- as **mãos** (a saliência mais à frente entre 58% e 75% da altura — abaixo
  disso os joelhos enganam), para ancorar `MaoEsq`/`MaoDir` na pinça, onde o pé
  do leque encosta;
- o **assento**: a maior superfície voltada para baixo entre 25% e 52% da
  altura (as nádegas e a face de baixo das coxas). Vira o nó `Assento`, e é por
  ele que a mesa põe a cadeira EMBAIXO de quem senta. Pela caixa a cadeira caía
  15 a 20 cm à frente — o personagem sentava no ar, com a cadeira atrás dele.

| Nó | Para quê |
|---|---|
| `Assento` | o plano em que o corpo encosta na cadeira. Sem esqueleto não há osso do quadril; com esqueleto, `Hips` continua mandando |

### O que a mesa anima numa escultura sem esqueleto

Não há osso para mover, então a atuação é do **corpo inteiro** — e é assim que
a referência (Capote) se lê de longe, que é como se joga no celular:

| Quando | O que acontece |
|---|---|
| sempre | respiro de ±8 mm, dessincronizado |
| alguém joga | o tronco vira até 0,37 rad na direção de quem está jogando |
| a vez é dele | chega 5,5 cm para a frente, levanta o leque 6 cm e o deita um pouco mais para si |
| um lance qualquer | a placa sobre a cabeça diz o verbo (COMPROU, DESCARTOU, BAIXOU, ENCAIXOU) por 1,8 s; fora disso diz JOGANDO ou PRÓXIMO |
| baixou, bateu, pegou coringa | **reação `feliz`**: dois pulos no assento (4,5 cm) |
| pediu o meio e não veio | **reação `bravo`**: dois balanços do tronco (0,17 rad) com um palmo de recuo |

As duas últimas só entram **quando o arquivo não traz morph nem clip** com esse
nome — uma escultura não muda de cara. Com morph `feliz`/`bravo` (ou clip de
mesmo nome), a cara manda e o corpo não se mexe. No provador, os botões
**feliz** e **bravo** dizem qual dos dois caminhos aconteceu.

Compra e descarte **não** movem o braço (não há braço): a carta voa da pinça
até o meio da mesa, e **sem espera** — os 520 ms (descarte) e 635 ms (baixada)
de atraso existiam para a carta sair da mão no meio do gesto do braço. Com esqueleto no arquivo, `interacao3d.js` volta a resolver
braços e dedos e o gesto reaparece.

### As suas mãos, na primeira pessoa

Na mesa você vê as SUAS mãos nas pontas do leque. Elas são recortadas da sua
própria escultura:

```bash
python3 scripts/mao_primeira_pessoa.py public/models/<slug>.glb public/models/<slug>-maos.glb
```

O recorte cresce pela **superfície** a partir do nó `MaoEsq`/`MaoDir` (pelo ar
não serve: a outra mão está a 10 cm e o peito a 20) e é limitado a 11,5 cm em
linha reta, que é o tamanho de uma mão — nas esculturas em que as duas mãos se
tocam, a superfície passa de uma para a outra. Sai um `.glb` de 35 a 95 kB com
os nós `Esq` e `Dir`, sem textura: a cor de cada vértice é lida do mapa e
gravada em `COLOR_0`, porque o atlas do gerador espalha os triângulos da mão
pelo mapa inteiro e não haveria o que recortar.

Sem esse arquivo a mesa usa o desenho 2D chapado de antes. **A mesa desenha a
sua mão num segundo passe, com o z-buffer limpo**: ela está a 1,3 m do olho e a
beirada do tampo a 48 cm, então pelo mundo a mesa passaria na frente. Com
`depthTest: false` — que servia à carta chapada — um sólido sai como um
amontoado de cacos, com as costas desenhadas por cima da palma.

### A roda de cadeiras e o tampo

As cadeiras ficam a **1,34 m** do centro (`MESA.assento`), com a barriga na
beirada do tampo (feltro de raio 1,15 m mais o aro): joelhos por baixo, mãos e
leque por cima da madeira, como na referência. A 1,45 m sobrava um palmo de
chão entre a mesa e cada um, e as cartas boiavam fora do tampo.

Como cada escultura senta do seu jeito, `encaixaModelo` mede quem alcança a
**fatia do tampo** nesse raio e **recua** o corpo só o necessário (até 10 cm) —
é o que impede o feltro de passar por dentro de um vestido comprido. O provador
diz quanto recuou. As cartas na mão de um modelo são 0,21 da carta da mesa
(8,8 × 12,4 cm): a 0,26 o leque tampava o queixo.

**Se quiser articular** (braço que compra e descarta, dedos que fecham), há o
caminho pelo Blender: `scripts/sentado.sh <fonte.glb> public/models/<slug>.glb`
monta um esqueleto da cintura para cima com dedos (`scripts/rig_sentado.py`),
grava os eixos da palma e passa pelo preparo. Um rig ajustado à mão no Blender
entra com `--de-blender`. Com esqueleto no arquivo, a mesa volta a mover braços
e dedos sozinha; sem ele, a carta simplesmente voa.

O texto histórico abaixo descreve o fluxo antigo, de esculturas em pé rigadas
por fora.

### Histórico: o rig de dedos das esculturas em pé (06–07/09/2026)

As malhas, a contagem de triângulos e as texturas eram mantidas. O preparo
achava os dedos **na própria malha**: media a distância ao
punho sobre a superfície da mão, toma as cinco pontas mais persistentes, põe
os ossos no eixo central de cada dedo (juntas a 0/45/76 % do comprimento) e
reparte só a influência da mão ao longo dele. Numa mão esculpida sem vãos
entre os dedos ("luva") não há pontas para achar: o script avisa e deixa
aquela mão como estava. Há um clip `dedosTeste` para ferramentas externas. No
jogo, `dedos3d.js` controla a flexão diretamente (ele deriva a normal da
palma de `Thumb1` e `Middle1`, por isso o script põe `Thumb1` no plano das
bases dos outros dedos), mantendo os clips de corpo existentes.

Abra `provador.html`, escolha um personagem em **da mesa…** e mova **Flexão
dos dedos** de 0% a 100%, conferindo ambos os lados. A mesa usa 62% quando há
cartas. Conferir visualmente punhos, eventuais dedos fundidos e contato com o
leque antes de publicar: as verificações numéricas não atestam anatomia ou
ausência de interpenetração.

Para reproduzir (aceita o arquivo de 24 ossos ou um já rigado, que é
refeito; só NumPy):

```bash
python3 scripts/rig_dedos.py original.glb preparado.glb --relatorio
python scripts/verifica_rig.py   # precisa de SciPy
```

O `--relatorio` imprime, por mão, as persistências das pontas (a 6ª mostra a
folga), vértices e comprimento de cada dedo e o estiramento das arestas da
mão na flexão da mesa, antes e depois.
