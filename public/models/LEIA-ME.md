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
| Unidade | metros. A mesa tem o tampo a **0,92 m** do chão |
| Altura | qualquer: a mesa **normaliza** para ~1,55 m sentado (do chão ao topo da cabeça). Mas mantenha as proporções entre os oito |
| Origem | no **chão, no eixo do corpo** (y = 0; x e z = 0 no tronco). A mesa põe a origem no assento e só corrige a altura — não centraliza em x/z, porque num modelo sentado as pernas vão para a frente e a caixa engana |
| Frente | olhando para **+Z**. A mesa vira o personagem para a mesa |
| Pose | **sentado**, mãos à frente na altura do peito (é onde o leque de cartas entra: ~1,02 m do chão, 0,17 m à frente) |
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
1024 px e injeta o nó `Cabeca` na fração da altura dada (`--cabeca 0.91` é a
cabeça de alguém em pé; sentado, algo como 0.88). Com `--maos x,y,z` injeta
também `MaoDir`/`MaoEsq` (a esquerda espelhada); sem isso o leque fica na
posição padrão. Depois: abrir no provador e pôr o slug na lista.

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
