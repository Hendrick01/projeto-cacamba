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
| Origem | no **chão, entre os pés** (y = 0). A mesa põe a origem no assento |
| Frente | olhando para **+Z**. A mesa vira o personagem para a mesa |
| Pose | **sentado**, mãos à frente na altura do peito (é onde o leque de cartas entra: ~1,02 m do chão, 0,17 m à frente) |
| Polígonos | até ~15 mil triângulos por personagem; texturas até 1024×1024 |
| Materiais | cor chapada e sombra de um tom, como o elenco. PBR simples (`baseColor`, sem metal) funciona; a mesa aplica o sombreamento dela |

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

## Como conferir

Ponha o arquivo, abra `3d.html` numa partida com esse personagem na mesa e
olhe o console: a mesa avisa `modelo: <slug> carregado (altura X → 1,55)` ou o
motivo de ter caído no boneco de código. `public/models/_exemplo.glb` é um
modelo mínimo (caixas) gerado por `test/modelo-exemplo.mjs`, só para provar o
caminho — não é arte.
