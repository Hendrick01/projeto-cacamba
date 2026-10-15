# Estrutura do projeto — Caçamba

Jogo de cartas multiplayer para celular: 7 rodadas de contratos (trincas e sequências),
2 a 8 jogadores, salas por código de 4 letras com QR para entrar. Quem faz **menos**
pontos ganha.

**Stack:** Node.js puro em ESM, sem framework e sem build. Duas dependências: `ws`
(WebSocket) e `qrcode`. O front-end é HTML/CSS/JS vanilla servido estaticamente e
importa o motor de regras direto do servidor, em `/shared/engine.js`.

**Rodar:** `npm start`. **Testar:** `npm test` (51 testes do motor). O teste de
integração são separados e exigem o servidor no ar: `node test/e2e.mjs` e
`node test/sair.mjs` e `node test/convite.mjs`.

> As regras vêm de quem joga o jogo, e ainda estão evoluindo. Tudo que é decisão de
> regra está em constantes no topo do [`shared/engine.js`](shared/engine.js) —
> veja [Constantes de regra](#constantes-de-regra).

---

## Árvore

```
projeto-caçamba/
├── .claude/
│   ├── launch.json          # config do servidor de dev (nome, comando, porta 3000)
│   └── settings.json        # allowlist de permissões do Claude Code
├── .gitignore
├── ESTRUTURA.md             # este arquivo
├── package.json
├── package-lock.json
├── server.js                # servidor: estáticos + salas + juiz das regras
├── shared/
│   ├── engine.js            # motor de regras puro (usado por servidor e cliente)
│   └── elenco.js            # o elenco: lista de personagens, validada no servidor
├── public/
│   ├── index.html           # marcação das telas + modais
│   ├── 3d.html              # a mesa em 3D (mesma partida, outra janela)
│   ├── provador.html        # o provador de modelos 3D (abre um .glb e confere o contrato)
│   ├── provador.js
│   ├── modelo3d.js          # o que mesa e provador têm em comum: estilo do elenco, encaixe, conferência
│   ├── mesa3d.js            # a cena: salão, mesa, elenco sentado, sua mão
│   ├── vendor/three.module.js  # three.js vendido (só baixa quem abre o 3D)
│   ├── client.js            # cliente: telas, mesa e conversa com o servidor
│   ├── style.css            # visual mobile-first, tema feltro escuro
│   ├── icon.svg             # ícone do app (também serve de favicon)
│   └── manifest.json        # manifesto PWA
└── test/
    ├── engine.test.js       # 51 testes unitários do motor
    ├── e2e.mjs              # integração: 3 jogadores contra o servidor real
    ├── sair.mjs             # integração: sair da partida no meio e o robô assumir
    └── convite.mjs          # integração: o link da sala atrás de proxy
```

## O que faz cada arquivo

| Arquivo | Linhas | O que faz |
|---|---:|---|
| [`shared/engine.js`](shared/engine.js) | 1314 | Todas as regras do jogo, sem nenhum I/O: baralho com coringas, busca de contratos, encaixes, troca do coringa, pontuação, estado da partida, visão por jogador e a heurística do bot. |
| [`public/client.js`](public/client.js) | 2032 | Cliente: conecta e reconecta, desenha as telas (início, lobby, mesa), monta mão/jogos/descarte, traduz eventos em avisos e envia ações. Reimporta o motor só para **dicas de interface** — nunca reimplementa regra. |
| [`server.js`](server.js) | 656 | Servidor HTTP dos arquivos estáticos + WebSocket. Guarda as salas, é o **juiz autoritativo** (só ele altera o estado) e dá ritmo humano aos bots. |
| [`public/style.css`](public/style.css) | 1123 | O salão, a mesa e as peças: variáveis de luz na `:root`, feltro em perspectiva, assentos, leque e animações. Mobile-first, com a mesa virando coluna centrada em tela grande. |
| [`test/engine.test.js`](test/engine.test.js) | 919 | Testes do motor com `node:test`, incluindo as regras de baixar (jogo extra, carta puxada da mesa) e 30 partidas completas com RNG semeado e a conferência de que cada rodada recomeça com o baralho inteiro. |
| [`test/e2e.mjs`](test/e2e.mjs) | 134 | **Três** jogadores roteirizados jogam 7 rodadas contra o servidor real por WebSocket. Três porque a compra fora da vez precisa de alguém que não seja nem quem está na vez nem quem descartou — e o teste falha se ninguém pedir carta, para essa cobertura não morrer em silêncio. |
| [`test/convite.mjs`](test/convite.mjs) | 64 | O link de convite atrás de proxy: sai em https quando o proxy diz https, continua http sem proxy, e ignora host forjado. |
| [`test/voz.mjs`](test/voz.mjs) | 56 | O repasse da sinalização de voz: direto, para todos, e o que o servidor ignora (robô, sala alheia, dados fora do formato). |
| [`test/sair.mjs`](test/sair.mjs) | 100 | Dois humanos numa sala, um sai no meio da partida: confere o evento, a marca no assento, o robô assumindo, a vez seguindo e o token velho não voltando. |
| [`test/sobra.mjs`](test/sobra.mjs) | 189 | As três portas da sobra pelo fio: **quatro** jogadores roteirizados (com três é um baralho só, e a quarta carta de cada valor é uma), baixando um jogo por vez para abrir a janela dos encaixes — é dos encaixes que as sobras nascem. A Ana leva uma sobra alheia para a mão e descarta outra, conferindo o estado que volta. Sai com código 2 quando o sorteio não gera sobra: rodar de novo. |
| [`test/mesa-qa.mjs`](test/mesa-qa.mjs) | 32 | Ferramenta de QA, não teste: cria uma sala com robôs, começa a partida e imprime a sessão para colar em `localStorage` e abrir `/3d.html`. Sem partida em andamento a mesa 3D não desenha ninguém, e era esse o degrau para conferir o elenco na cena. `node test/mesa-qa.mjs [robôs] [porta]`. |
| [`test/mesa-qa-jogando.mjs`](test/mesa-qa-jogando.mjs) | 45 | O irmão do anterior que também JOGA a minha vez até a mesa encher de jogos baixados: é o degrau para ver a 3D com oito jogadores e todo mundo com jogo na frente, que é onde a leitura das cartas aperta. `node test/mesa-qa-jogando.mjs [robôs] [porta] [turnos]`. |
| [`test/aliados.mjs`](test/aliados.mjs) | 67 | Ferramenta de QA, não teste: entram numa sala que você criou no navegador e jogam gerando sobras rápido, para conferir a TELA com sobra na mesa. `node test/aliados.mjs CODIGO`. |
| [`public/baralho.js`](public/baralho.js) | 33 | O mapa do baralho: qual arquivo é qual carta. Importado pelas duas mesas. |
| [`scripts/baralho_gatos.py`](scripts/baralho_gatos.py) | 233 | Monta as 55 imagens do baralho a partir das folhas desenhadas: corta, tira a moldura impressa, manda pintar o naipe e embute o papel do jogo. |
| [`scripts/naipe_vermelho.py`](scripts/naipe_vermelho.py) | 261 | Acha as massas de naipe numa carta de copas ou ouros por FORMA, já que a cor é a mesma do gato. |
| [`scripts/mao_para_posar.py`](scripts/mao_para_posar.py) | 138 | Monta o `.blend` em que a mão de primeira pessoa é posada, e refaz os pesos do rig por difusão de calor. **Fora de uso**: a mesa 3D não tem mais mãos. |
| [`scripts/mao_pose_segura.py`](scripts/mao_pose_segura.py) | 330 | Acha a pose que segura a carta MEDINDO a malha deformada contra o plano dela. **Fora de uso**, pelo mesmo motivo. |
| [`public/mesa3d.js`](public/mesa3d.js) | 2116 | A cena 3D: conecta com a mesma sessão, desenha salão/mesa/elenco/mão e joga o ciclo básico (puxar, baixar, descartar) pelos mesmos comandos. |
| [`public/index.html`](public/index.html) | 334 | Esqueleto das quatro telas (`screen-home`, `screen-avatar`, `screen-lobby`, `screen-game`) e do modal genérico. |
| [`public/vendor/GLTFLoader.js`](public/vendor/GLTFLoader.js) · `BufferGeometryUtils.js` | — | O carregador glTF do three (r170, MIT), vendido com os imports apontados para o `three.module.js` local. Só a mesa 3D usa. |
| [`public/models/`](public/models/LEIA-ME.md) | — | Os personagens externos, `<slug>.glb`, e o contrato do que cada um precisa ter. `_exemplo.glb` é a prova de caminho. |
| [`test/modelo-exemplo.mjs`](test/modelo-exemplo.mjs) | 95 | Gera o `_exemplo.glb`: GLB válido escrito à mão (JSON + BIN), três caixas, textura PNG, morph `bocaAberta`, clips `idle`/`feliz` e os nós `Cabeca`, `MaoEsq`, `MaoDir`. |
| [`test/modelo-recorta.mjs`](test/modelo-recorta.mjs) | 95 | Bancada: de uma "ficha" com várias vistas numa malha só, recorta a figura que olha para +Z (separa pelos vazios em x, acha a frente pela ponta dos pés). |
| [`test/modelo-prepara.mjs`](test/modelo-prepara.mjs) | 150 | Bancada: aceita `.glb` ou `.fbx`, funde clips de outros arquivos pelo nome dos ossos, solda, reduz para o orçamento (`@gltf-transform/cli` via `npx`), encolhe texturas e pendura `Cabeca`/`MaoEsq`/`MaoDir` nos ossos (ou injeta na raiz). |
| [`test/modelo-obj.mjs`](test/modelo-obj.mjs) | 60 | Bancada: exporta um `.glb` como OBJ + MTL + texturas num `.zip`, o pacote que o rigger automático aceita. |
| [`test/modelo-senta.mjs`](test/modelo-senta.mjs) | 150 | Bancada: assa a pose final de um clip de sentar como repouso, mira braços por cinemática direta e escreve os clips `idle`/`feliz`/`bravo`. |
| [`public/modelo3d.js`](public/modelo3d.js) | 230 | O que mesa e provador têm em comum sobre modelos externos: estilo do elenco (toon + contorno, normal map mantido), `encaixaModelo`, `reage`, `confereModelo`, `criaBanqueta`. |
| [`public/provador.html`](public/provador.html) · `provador.js` | 300 | O provador de modelos: abre um `.glb` do aparelho ou da lista, senta na banqueta com a luz da mesa e confere o contrato item a item. |
| [`public/voz.js`](public/voz.js) | 169 | Chat de voz: microfone, pares WebRTC em malha, sinalização pela mensagem `voz` do WebSocket, e o nível de áudio de cada um (`nivel`/`falando`). Usado pelas duas mesas. |
| [`shared/mao.js`](shared/mao.js) | 53 | A ordem das cartas na sua mão: a ordenação automática e o reordenar do arrasto. Vive em `shared/` para poder ser testada sem navegador — ver `test/mao.test.js`. |
| [`shared/elenco.js`](shared/elenco.js) | 98 | O elenco: slug, nome, traço e tom de pele de cada personagem, mais a validação e o gancho de expressões. Vive em `shared/` porque o servidor precisa validar a escolha antes de repassá-la aos outros jogadores. |
| [`public/icon.svg`](public/icon.svg) | 37 | Ícone: leque de três cartas sobre o feltro, com moldura dourada. Fundo ocupa o quadro todo, então funciona como ícone *maskable*. |
| [`.claude/settings.json`](.claude/settings.json) | 34 | Allowlist de comandos de leitura para reduzir aprovações; `sudo` e `rm -rf` bloqueados. |
| [`public/manifest.json`](public/manifest.json) | 29 | Manifesto PWA: nome, `pt-BR`, `standalone`, retrato, cores casando com o `theme-color` do HTML. |
| [`package.json`](package.json) | 18 | Metadados, scripts `start`/`test`, `engines.node` e as duas dependências. |
| [`.claude/launch.json`](.claude/launch.json) | 12 | Define o servidor de dev para a ferramenta de preview. |

---

## Constantes de regra

Ficam no topo do [`shared/engine.js`](shared/engine.js). Mexer aqui muda o jogo sem
tocar em lógica.

| Constante | Valor | O que decide |
|---|---|---|
| `JOKERS_PER_DECK` | `4` | Coringas por baralho. Com 2 baralhos, **8 no total**. Em rodada cujo contrato não tem sequência (1ª e 4ª), o coringa fica **fora do baralho**. |
| `MAX_JOKERS_PER_SEQ` | `1` | Quantos coringas cabem numa mesma sequência. A sequência tem 4 cartas: com 2 coringas, metade do jogo seria curinga. |
| `SWAP_JOKER_SAME_TURN` | `false` | Ligado, a troca vira atômica e o coringa vai direto para outro jogo sem passar pela mão. Desligado (o valor de hoje), o coringa **vem para a mão** e pode ser guardado. |
| `CORINGA_DESCARTADO_TRANCA` | `true` | Coringa descoberto no topo trava o monte de descarte. |

E em `DEFAULT_OPTS`, as regras da casa ajustáveis por sala:

| Opção | Valor | O que decide |
|---|---|---|
| `decks` | derivado | Baralhos em jogo. Sai de `decksParaJogadores()` no `createGame`; só é lido do padrão se alguém montar opções à mão. |
| `jokersPerDeck` | `JOKERS_PER_DECK` | Coringas por baralho. |
| `maxReshuffles` | `3` | Monte esgotado 3× na rodada → rodada acaba sem vencedor. |
| `maxTurnsPerRound` | `300` | Rede de segurança. Se todos só pegarem do descarte, o monte nunca esgota e `maxReshuffles` nunca é atingido; este teto impede a rodada eterna. Rodadas normais ficam bem abaixo de 60 turnos. |
| `minPlayers` / `maxPlayers` | `2` / `8` | Tamanho da sala. |

---

## Tamanho da mesa e baralhos

A mesa vai de 2 a 8 lugares, e o número de baralhos sai do número de jogadores —
tabela `DECKS_POR_JOGADORES`, no topo do motor:

| Jogadores | Baralhos | Cartas |
|---|---|---|
| 2 a 3 | 1 | 56 |
| 4 a 6 | 2 | 112 |
| 7 a 8 | 3 | 168 |

Os cortes vieram de simulação. O que decide é a **rodada 7**, que distribui 12
cartas por jogador: quando sobra pouco monte, a rodada morre por esgotamento
antes de alguém fechar o contrato. Com 4 jogadores em 1 baralho ela termina sem
vencedor em **97,5%** das vezes; com 8 em 2 baralhos, em **100%**. Com a tabela,
nenhuma configuração de 2 a 8 passa de 1% na rodada 7.

Duas funções sustentam isso, e são o que se deve usar antes de abrir uma mesa:

| Função | O que faz |
|---|---|
| `decksParaJogadores(n)` | Consulta a tabela. |
| `cartasNecessarias(n, round)` | Cartas que a rodada exige: `(6 + round) × n + 1`. |
| `cartasDoBaralho(round, opts)` | Quanto o baralho tem naquela rodada — rodada só de trincas vai sem coringa, então 52 por baralho em vez de 56. |
| `conferirBaralho(n, opts)` | `null` se as 7 rodadas cabem; senão, a rodada mais apertada. O servidor chama antes de começar, para recusar no lobby em vez de quebrar no meio. |

`startRound` confere de novo antes de distribuir e **recusa a rodada** com erro
de regra se o baralho não der. Sem essa guarda, `deck.pop()` num baralho curto
colocava `undefined` na mão e a partida só quebrava lá adiante, na contagem de
pontos, com um `TypeError` sem relação aparente com a causa.

---

## Baixar: contrato, jogo extra e carta da mesa

**Um jogo de cada vez.** Qualquer trinca ou sequência completa desce sozinha.
O que o contrato pede vai para `player.baixados`; `player.baixou` só vira
`true` com o contrato inteiro na mesa — e é ele que libera o encaixe.

**Jogo extra pode descer antes ou depois do contrato — mas só por escolha.**
Trinca ou sequência que o contrato não pediu — uma sequência na rodada de
trincas, uma terceira trinca — desce do mesmo jeito, a qualquer momento, desde
que o jogador **selecione as cartas**. Sem seleção, o automático desce só o que
o contrato pede: baixar a mais expõe jogo para os outros encaixarem carta, e
essa conta é de quem joga, não do botão. É o que decide o teto do planejador:

```js
const tetoT = temSelecao ? Math.floor(pool.length / 3) : remaining.t;
const tetoS = temSelecao ? Math.floor(pool.length / 4) : remaining.s;
```

O extra **não conta** em `baixados`: o crédito no contrato é `min(o que desceu,
o que ele pede)`, e o resto é extra. Sem isso o progresso apareceria como `4/3`.

O bot também joga assim: como o automático não desce extra, ele escolhe as
cartas com `melhorJogoExtra(hand)` depois de cumprir o contrato — vem antes do
encaixe, porque tira 3 ou 4 cartas de uma vez.

**O que o contrato governa é bater.** Só sai da rodada de mão vazia quem já o
cumpriu — e a mão pode zerar por **três portas**, então a trava está nas três:
`actBaixar`, `actLayoff` e `actDiscard`.

Havia um furo aqui: baixando uma trinca das duas da rodada 1 e descartando a
última carta, dava para bater com o contrato pela metade. A trava de então
olhava só a baixada, e só o caso de esvaziar de uma vez.

A consequência é uma regra a mais, que não é arbitrária: **sem o contrato
cumprido, a mão não pode ficar com menos de duas cartas**. Com uma só, o
descarte obrigatório zeraria a mão — e isso é bater sem contrato, que a regra
proíbe. Vale para baixar (`size > hand.length - 2`) e para encaixar.

**Encaixar não exige mais ter baixado.** Antes o encaixe só valia depois do
contrato inteiro; agora vale a qualquer momento, com a trava acima no lugar.

**Resgatar o coringa que sobra.** Uma sequência de 5 cartas com coringa numa
ponta continua válida sem ele — sobram 4. Então quem **estica a sequência pela
ponta oposta** pode levar esse coringa para a mão:

```
J♦ Q♦ K♦ 🃏(=A♦)   +  10♦ pela ponta baixa
10♦ J♦ Q♦ K♦       →  o coringa vem para a sua mão
```

A ponta importa: encaixar por cima de um coringa de ponta o empurraria para o
meio, onde tirar quebraria a sequência — `coringaLiberadoPeloEncaixe` só
devolve o coringa da ponta **oposta** à do encaixe. A conferência é feita
**antes** de mexer no estado: falhar no meio deixaria a carta encaixada e o
coringa onde estava, sem o jogador ter pedido isso.

É a segunda porta de saída do coringa, ao lado da troca pela carta real. As
duas cobram um preço: a troca exige a carta exata; o resgate exige esticar a
sequência de outra pessoa — o que dá a ela uma carta a mais na mesa.

Desde 2026-08-28 existe uma terceira, mais barata: se a sequência já tem carta
a mais e o coringa está **na ponta**, ele é sobra como qualquer outra carta —
pode vir para a mão ou ir para o meio (ver "Carta que está sobrando na mesa").

**Carta que está sobrando na mesa.** Uma carta que sobra num jogo já baixado —
sequência com mais de 4, trinca com mais de 3, as mesmas de `removableCards` —
pode sair dele, **seja o jogo seu ou de qualquer adversário**, por **três
portas**. Foram confirmadas pelo usuário em 2026-08-28; até então só a
primeira existia, e com a condição "só se for para baixar, nunca para ficar na
mão", que caiu:

1. **Baixar com ela na hora** — `actBaixar` com `sobra: { meldId, cardId }`, abaixo.
2. **Trazê-la para a mão** — `actTomarSobra`. Ação livre da fase de jogo, como o
   encaixe: não passa a vez e o descarte continua obrigatório depois. A mão só
   cresce, então a trava das duas cartas não se aplica.
3. **Descartá-la direto** — `actMeldDiscard`, que passa a vez como qualquer
   descarte. Tirar do jogo alheio é jogada de verdade: encurta o jogo do outro
   sem dar nada em troca.

Na tela, o toque numa carta que sobra faz uma das três coisas conforme o que
está escolhido na mão: com cartas escolhidas que fechem um jogo junto com ela,
desce na hora; sem nada escolhido, vem para a mão; no modo "descartar de jogo",
vai para o meio. O botão desse modo aparece se **qualquer** jogo da mesa tem
sobra, não só os seus.

**O coringa da ponta sobra como qualquer carta.** Numa sequência com carta a
mais, o coringa que está na ponta entra na lista — e por isso pode ser trazido
para a mão ou descartado. Descartá-lo põe um coringa no topo do meio, que
**tranca** (`CORINGA_DESCARTADO_TRANCA`): a jogada defensiva de quem tem um
coringa caro na mão passa a existir também com o coringa da mesa. Antes ele era
filtrado de `removableCards` justamente para isso não acontecer; a decisão foi
revista pelo usuário.

A primeira porta vai no mesmo `actBaixar`, no argumento `sobra: { meldId, cardId }`:

```jsonc
{ "t": "action", "action": { "a": "baixar", "cardIds": [12, 34], "sobra": { "meldId": 7, "cardId": 55 } } }
```

O motor monta o bolo (cartas escolhidas + a da mesa), pergunta ao mesmo
planejador se fecha, e **só então** mexe no estado: ou o jogo desce inteiro, ou
nada acontece e a carta fica onde estava. `sobrasNaMesa(state)` lista o que
está sobrando, e `sobraFechaJogo(...)` responde se uma carta específica fecha —
a tela usa **essa mesma função** para acender o alvo, para realce e regra nunca
divergirem.

## As regras do coringa

**Existe:** 4 por baralho, 8 no total. Na tela é uma carta dourada, distinta de relance.

**Só entra em rodada com sequência no contrato.** Como o coringa vale apenas em
sequência, nas rodadas só de trincas (1ª e 4ª) ele seria carta morta de 20 pontos —
então `startRound` monta o baralho dessas rodadas **sem coringa nenhum**.

**Vale só para sequência.** Trinca exige cartas reais. Isso sai de graça da
representação: o coringa é `{ rank: 0, suit: -1, joker: true }`, e as buscas varrem
valores `1..13` e naipes `0..3` — ele nunca casa por acidente, só entra onde há
tratamento explícito.

**No máximo um por sequência** (`MAX_JOKERS_PER_SEQ`).

**Pontua 20** na mão, no fim da rodada.

**Troca pela carta real.** Quem tem a carta que o coringa representa pode resgatá-lo:
a carta real ocupa o lugar dele na sequência e o coringa vem para a mão. Vale para
qualquer sequência da mesa, **própria ou de outro jogador**, e **independe de já ter
baixado** o próprio contrato. A única restrição é **ser a vez do jogador**. A carta
tem que casar valor *e* naipe do que o coringa representa naquela posição — incluindo
o Ás alto, quando o coringa vale 14.

**A carta que você descartou não volta.** Quem descartou fica carimbado na
própria carta (`card.by`), e não no estado: assim a informação viaja com ela e
não se perde quando alguém leva o topo e descobre uma carta mais antiga. Vale
para os dois caminhos — a compra da vez e o pedido fora da vez, que nem chega a
ser registrado. A carta virada do monte no começo da rodada não é descarte de
ninguém, então está livre para todos.

**Consequência em mesa de dois: a compra fora da vez deixa de existir.** O
único jogador que não está na vez é justamente quem acabou de descartar, e a
carta dele não volta. Isso foi levado ao dono do jogo com a alternativa de
abrir exceção para duplas, e ele decidiu **manter a regra como está** — não é
descuido, e não deve ser "consertado". De três jogadores em diante a compra
fora da vez funciona normalmente.

São **duas travas diferentes**, e a tela precisa distinguir: o coringa tranca o
meio para todo mundo (`discardLocked`), enquanto a sua própria carta só está
fora do **seu** alcance (`discardBuyable`, que é por jogador) — os outros pegam
normalmente, e a pilha mostra "sua" em vez de "travado".

**Descartado, trava o meio.** Enquanto um coringa estiver descoberto no topo do
descarte, ninguém compra de lá — nem pela compra da vez, nem pela compra fora da vez.
Assim que alguém descarta por cima, o monte volta ao normal.
É a jogada defensiva de quem tem um coringa caro na mão. A regra está escrita no nível
do monte, não da carta: hoje só o topo é alcançável, então as duas leituras coincidem,
mas assim ela continua valendo se um dia a compra chegar mais fundo.

**Não sai pelo descarte de jogo.** `removableCards` nunca devolve um coringa, então a
troca é a única porta de saída dele de um jogo baixado — e ela cobra o preço de ter a
carta exata.

---

## Modos de jogo: Caçamba e Presidente (15/10/2026)

A página abre na **escolha do modo** (`#screen-modos`): o Caçamba é o jogo da
casa e vem grande, primeiro; o Presidente é a outra mesa. Quem chega por
convite (`?sala=`) pula a escolha — a sala já tem modo, e é ela que manda.

- A sala nasce num modo (`room.modo`, vindo do `create`) e não muda. O servidor
  escolhe o motor por `motorDe(room)`; mensagem ou retrato sem `modo` é Caçamba.
- `shared/presidente.js` é o motor do Presidente, com a mesma interface que o
  servidor usa do `engine.js` (`createGame`, `startRound`, `applyAction`,
  `viewFor`, `botNextAction`, `actNextRound`) e as regras no topo do arquivo.
  Testes em `test/presidente.test.js`.
- `public/presidente-mesa.js` + `public/presidente.css` são a mesa 2D do
  Presidente. São carregados com `import()` só quando alguém escolhe o modo ou
  cai numa sala dele: quem joga Caçamba nunca baixa esses arquivos. A mesa
  reaproveita cenário, assentos, leque da mão, cartas, modais e emotes do
  `client.js` (ver `contextoDaMesa`).
- A mesa 3D ainda é só do Caçamba: `mesa3d.js` manda sala de Presidente de
  volta para a 2D.

## Dominó de ponto (15/10/2026)

O terceiro modo, ao lado do Presidente, no mesmo esquema: `room.modo =
'domino'`, motor em `shared/domino.js` (regras no topo do arquivo, testes em
`test/domino.test.js`), mesa 2D em `public/domino-mesa.js` + `public/domino.css`,
baixadas com `import()` só quando alguém escolhe o modo ou cai numa sala dele.

- **Cadeiras.** O dominó é sempre de 4, em duplas fixas (cadeiras 0+2 contra
  1+3). A sala guarda `room.cadeiras` (ids ou null) à parte de `room.players`,
  que continua na ordem de chegada — é dela que sai o anfitrião, e trocar de
  lugar não pode trocar o dono da sala. `sentaNasCadeiras` arruma a lista a
  cada consulta (quem saiu vaga, quem chegou senta na primeira vaga). O
  anfitrião troca o conteúdo de duas cadeiras com `{ t: 'cadeira', de, para }`;
  no `start`, as vagas viram robô (`jogadoresDaPartida`) e a ordem das cadeiras
  é a ordem da partida. `playAgain` repete a mesma mesa.
- **A cobra.** SVG em "casas" (meia pedra = 1×1), enquadrado por `viewBox`. A
  carroça de saída fica em pé no centro (a cruz); cada ramo segue reto e dobra
  uma vez, sempre para o mesmo lado (esquerda sobe, cima vai para a direita,
  direita desce, baixo vai para a esquerda), e por isso nenhum ramo cruza
  outro. Com pedra que encaixa em mais de uma ponta, as pontas viram alvo de
  toque na mesa, além dos botões.
- Na mesa 2D o parceiro senta à sua frente (`ordemDosAdversarios` em
  client.js) e quem joga depois de você fica à direita.
- A mesa 3D ainda não tem dominó: o botão 3D some nessa sala.
- `npm run test:domino` sobe um servidor próprio com `RITMO_DOS_ROBOS=0.01`
  (só teste: o robô joga 100× mais rápido) e joga uma partida inteira até 240.

## `shared/engine.js` — motor de regras

Módulo puro: recebe estado e devolve estado + lista de eventos. Nunca faz rede,
disco ou timers. É por isso que roda igual no servidor (como juiz) e no cliente
(como dica de interface).

### Cartas e baralho

| Função | O que faz |
|---|---|
| `isJoker(card)` | O único jeito de reconhecer um coringa. |
| `rankLabel` · `cardLabel` | Rótulos legíveis; `cardLabel` devolve 🃏 para coringa. |
| `cardPoints(card)` | **Valor de face**: o 5 vale 5, o 10 vale 10, J=11, Q=12, K=13. O **Ás vale 15** fixo, mesmo tendo jogado como 1 ou como 14. O **coringa vale 20**. |
| `cardValues(card)` | Valores possíveis numa sequência: o Ás vale `[1, 14]` e **nunca vira a esquina** (K-A-2 não vale). O coringa devolve `[]` — quem decide o que ele representa é a sequência em que entra. |
| `buildDecks(numDecks, jokersPerDeck)` | Monta N baralhos de 52 cartas + os coringas. |
| `shuffle(arr, rnd)` · `mulberry32(seed)` | Fisher-Yates com RNG injetável, e RNG semeado para testes reproduzíveis. |

### Busca de contrato

`findContractMelds(cards, needT, needS)` — **coração do motor.** Busca com retrocesso:
as cartas contêm `needT` trincas e `needS` sequências *disjuntas*? Devolve
`{ trincas, seqs }` ou `null`.

O coringa entra só na busca de sequência, tapando buraco. As candidatas **sem coringa
vêm primeiro**, então o solver só queima coringa quando não tem alternativa.

### Jogos na mesa

| Função | O que faz |
|---|---|
| `layoffOption(card, meld, coringasRemovidos = 0, preferredEnd = null)` | A carta encaixa neste jogo? Coringa da mão estica sequência por **qualquer ponta** (respeitando o limite) e é recusado em trinca. `coringasRemovidos` pergunta "e se eu tirasse N coringas daqui antes?" — é o que a troca usa para validar sem mexer no estado. `preferredEnd` (`'lo'`/`'hi'`) escolhe a ponta quando as duas servem; sem ele, coringa vai para a alta. |
| `layoffEnds(card, meld, coringasRemovidos = 0)` | Em quais pontas a carta encaixa (`['lo','hi']`…). A tela usa para perguntar a ponta ao jogador quando as duas valem (coringa, ou o Ás numa sequência de 2 a K). |
| `removableCards(meld)` | As cartas que estão **sobrando** num jogo da mesa (sequência com mais de 4: só as pontas; trinca com mais de 3: qualquer uma que deixe 3 naipes). É a lista em cima da qual as três portas da sobra funcionam. **Devolve o coringa da ponta** desde 2026-08-28 — antes ele era filtrado. |
| `sobrasNaMesa(state)` · `sobraFechaJogo(mão, sobra, alvo, opts)` | O que está sobrando na mesa, e se uma carta dessas fecha jogo com o que está escolhido na mão. A tela acende o alvo com a segunda — mesma função que o juiz usa. |

### Descarte

| Função | O que faz |
|---|---|
| `topoDoDescarte(state)` | A carta de cima, ou `null`. |
| `descarteTravado(state)` | Há coringa descoberto no topo? |
| `podeComprarDoDescarte(state, playerId?)` | Porta única usada pelos **dois** caminhos de compra: a normal da vez e a fora da vez. Sem `playerId`, a pergunta é sobre o monte; com ele, sobre a pessoa — **ninguém compra a carta que ele mesmo descartou**. |

### Estado e consultas

`createGame` · `startRound` · `currentContract` · `playerById` · `allMelds` ·
`meldById` · `finalRanking`.

`startRound` monta um **baralho novo** e zera mãos e jogos, então todas as cartas —
coringas inclusive — voltam a cada rodada. Não há como vazar carta entre rodadas, e há
teste dedicado a isso.

`viewFor(state, playerId)` é a **visão redigida por jogador**: manda a mão de quem
pediu, mas dos outros só a contagem de cartas, e nunca o monte. Campos que a tela usa
para não oferecer gesto que o motor recusaria:

- `discardBuyable` — o topo pode ser comprado? Falso quando o coringa trava o meio.
- `you.podeTrocarCoringa` — resposta pronta do motor, para o cliente não reimplementar a regra.
- `you.remaining` e `players[].baixados` — o que falta do contrato e quantos jogos cada
  um já baixou (baixa-se um por vez; o selo "baixou 1/2" dos oponentes vem daqui).

### Ações

Todas validam a vez e a fase, e lançam erro com `err.gameRule = true` (mensagem já
escrita em português). Devolvem uma lista de eventos.

Fases: `draw` (na vez, precisa puxar) → `play` (baixar / encaixar / trocar /
descartar) → `roundEnd` → próxima rodada → … → `gameEnd`.

| Ação | O que faz |
|---|---|
| `actClaim` / `actUnclaim` | Pede (ou desiste de) a carta do descarte fora da vez. Com o meio travado, o pedido nem é registrado. Só geram evento quando mudam algo — o servidor não rebroadcast (nem reagenda bot) para ação sem efeito. |
| `actDraw(state, playerId, source)` | Puxa do `'deck'` ou do `'discard'`. Ao puxar do monte, **primeiro resolve a compra fora da vez**: a carta vai para **quem pediu primeiro** (`claims` está em ordem de chegada), sem custo nenhum. Puxar do descarte é a preferência de quem está na vez e anula os pedidos. |
| `actBaixar(state, playerId, cardIds?, sobra?)` | Baixa jogos **um de cada vez**: qualquer trinca/sequência completa desce, peça o contrato ou não (jogo extra vale **antes e depois**; só não conta em `baixados`). A única trava é **bater**: não esvazia a mão quem não cumpriu o contrato. `sobra` puxa uma carta que está sobrando num jogo da mesa para fechar o que desce agora — atômico: ou fecha, ou nada muda. Sem `cardIds`, baixa o máximo; com, exatamente a seleção. |
| `planBaixada(hand, remaining, cardIds?, opts?)` | O plano do `actBaixar`, compartilhado com a tela e o bot: quais jogos descem agora, maximizando cartas usadas. O teto de jogos vem do tamanho do bolo, não do contrato — quem usa `remaining` é a flag `completa`, que decide se dá para esvaziar a mão. |
| `actLayoff(state, playerId, cardId, meldId, end?)` | Encaixa uma carta em qualquer jogo da mesa — seu ou dos outros. Só depois de ter baixado. `end` escolhe a ponta quando a carta serve nas duas. |
| `actSwapJoker(state, playerId, meldId, cardId, destMeldId?)` | **Troca o coringa pela carta real.** Só na vez do jogador; não exige ter baixado. `destMeldId` só é usado quando `SWAP_JOKER_SAME_TURN` está ligado. |
| `actDiscard` / `actMeldDiscard` | Descarta da mão, ou a carta que sobra num jogo **de qualquer um** (seu ou de adversário), e passa a vez. |
| `actTomarSobra` | Leva para a mão a carta que sobra num jogo da mesa, de qualquer um. Ação livre da fase de jogo, como o encaixe: não passa a vez. |
| `actNextRound` | Avança do placar para a rodada seguinte. |
| `applyAction(state, playerId, action)` | Despachante genérico que o servidor usa para humanos e bots. |

Auxiliares da troca, exportados porque o cliente também os usa:
`podeTrocarCoringa`, `coringaNaSequencia` (onde está o coringa e que carta ele
representa) e `cardCobreCoringa` (esta carta é exatamente a que ele representa?).

### Bot

| Função | O que faz |
|---|---|
| `botWantsCard` | A carta melhora a cobertura do contrato de verdade, ou encaixa em algum jogo? Vale para o coringa também — querer uma carta que a heurística de descarte depois larga é o que criava pega-e-devolve infinito com o descarte. |
| `botPickDiscard` | Escolhe o descarte pela utilidade de cada carta. Os pesos olham **o que ainda falta** do contrato, não o contrato inteiro, e o coringa só é valioso até a cota que dá para aproveitar. |
| `botFindJokerSwap` | A troca é uma **permuta**, não um avanço: entrega carta real e recebe 20 pontos de coringa. Só compensa se aumentar a cobertura, ou, depois de baixado, se a carta entregue não tinha encaixe e o coringa tiver. |
| `botNextAction` | Devolve **uma** ação por chamada, para o servidor dar ritmo humano. |

Internas que valem conhecer: `melhorCobertura` (mede o progresso *e* diz quais cartas
o sustentam) e `protectedIds` (protege essas cartas). As duas têm que sair da **mesma**
decomposição da mão — se divergirem, o bot descarta uma carta que ele mesmo conta como
progresso e volta a querê-la, travando a rodada.

---

## O lugar

Atrás da mesa há um cenário (SVG no [`index.html`](public/index.html)): parede
de azulejo até a meia altura, porta aberta para a rua com a luz de fora,
engradados empilhados, uma cadeira vazia — e **a lâmpada**, a pino sobre a
mesa. Ela não é enfeite: é a fonte que o resto da tela já supunha (foco no
meio, penumbra na borda, halo em quem está no escuro). Fica atrás de tudo,
esmaecendo para baixo por máscara, para não competir com as cartas.

O **tampo** é uma camada só dele (`.feltro`), inclinada em perspectiva
(`rotateX(17deg)` com a origem na borda de baixo): a borda de trás recua e a
mesa passa a ser vista da sua cadeira. Só ele inclina — assentos, monte e
avisos ficam em pé. Inclinar tudo junto borraria o texto.

**O monte e o meio deitam na mesa.** O tampo já estava inclinado, mas as cartas
ficavam em pé sobre ele — flutuavam em vez de estar apoiadas. Agora as pilhas
giram 30° no eixo X, dentro de uma `perspective` própria, e ganham sombra de
contato: é a sombra que prova o apoio, sem ela a carta deitada continua
parecendo flutuar, só que torta. **30° é o limite**: mais que isso, num celular,
o número do canto começa a fugir.

A etiqueta de cada pilha (`107`, `meio`) fica **em pé** no espaço 3D, por
contra-rotação — ela inclinou junto com a pilha e foi parar atrás da carta.

E a carta que chega ao meio **vira no ar** (`rotateY`) antes de pousar, em vez
de deslizar no plano: é o gesto de quem joga uma carta na mesa.

A **mesa cresce para ocupar a folga da tela** (`flex: 1`). Antes ela tinha
altura de conteúdo e a mão era empurrada para o rodapé por `margin-top: auto`:
sobrava um vão morto entre as duas. E o tampo começa na altura do peito de quem
senta — `top: calc(var(--altura-assentos) - 129px)`, com a altura vindo do JS
que posiciona os assentos. O desconto é maior do que parece porque a inclinação
encurta o tampo: a borda de trás sobe menos do que o CSS pede. Sem ele, o
feltro descolava e os personagens ficavam flutuando no cenário.

### A marca no feltro

O terço de cima do tampo era verde vazio — com 8 jogadores são 135 px de nada
entre a beirada de trás e as pilhas. Numa mesa de verdade é ali que fica a
impressão da casa, e é ela que faz o feltro parecer feltro de salão em vez de um
retângulo verde. São o `::before` e o `::after` do próprio `.feltro`: um fio de
arremate um dedo para dentro da madeira, e o nome do jogo **gravado** — a letra é
a sombra do baixo-relevo e o brilho vem embaixo dela, que é o que a lâmpada de
cima faz num sulco. Marca clara sobre feltro lia como adesivo colado.

As duas herdam a perspectiva do tampo, por serem filhas dele: deitam junto com a
mesa, e é isso que as faz parecer impressas e não coladas por cima. E ficam
baixíssimas de contraste de propósito — são acabamento, não informação, e não
podem competir com as cartas. A marca fica em `top: 22%`, a faixa que sobra vazia
tanto na mesa de dois quanto na de oito: a 9% ela saía atrás dos nomes da fileira
da frente e virava borrão.

### O aro

O feltro existe **só no meio do tampo**. A volta é madeira (`border: 15px` no
próprio `.feltro`, cores `--aro` / `--aro-luz` / `--aro-noite`), e é nela que os
jogadores sentam. Sem o aro, o verde encostava direto no assoalho: a mesa não
tinha espessura e lia como pastilha, não como móvel.

A cor do aro **não** é `--nogueira`. Foi a primeira tentativa, e ela some — o
assoalho do salão já é essa cor, então madeira escura sobre madeira escura não
tem contraste nenhum. O aro sai do `#7A4A2B`/`#8C5733` que é o **fundo dos
avatares** (ver o [README do elenco](public/assets/personagens/README.md)):
avatar e aro passam a ser literalmente o mesmo material, que é o que faz o
jogador e a mesa serem do mesmo mundo.

As três cores são a lâmpada de novo: a aresta de trás mostra o tampo do aro e
clareia (`--aro-luz`), a da frente mostra a face externa, virada para o chão, e
escurece (`--aro-noite`). Por fora ainda vai o halo (`0 0 0 2px` do
`--halo`) — sem ele a madeira encosta no assoalho e some, que é a mesma técnica
que o elenco usa contra o mesmo fundo.

Como o `box-sizing` é `border-box`, a borda come o feltro **por dentro**: a
silhueta da mesa não muda e quem estava por cima da beirada continua por cima —
só que agora da madeira. O que mudou foi o `top`, de `-114px` para `-129px`,
compensando os 15 px que o verde desceu; sem isso abria um vão entre a beirada e
quem senta nela.

**O balcão da fileira de trás** (2026-09-04): com 5 a 7 adversários a fileira
de trás fica acima do tampo e lia como gente em pé no fundo do salão. Agora
ela senta atrás de um **balcão** (`.balcao`): a borda de cima de uma elipse
larga, no material do aro, exatamente na linha em que a figura de trás é
cortada no peito (58 px × 0,8 de escala) — é o que faz o corte ler como gente
sentada. A curva segue o arco em que os assentos de trás estão dispostos
(mais alta no meio, mais baixa nas pontas; a elipse tem 568×220 para a queda
bater com os ~13 px do arco). O miolo é transparente, não recebe toque, e fica
atrás dos assentos: a cadeira colorida e o nome continuam por cima.

### A parede, o azulejo e a hora do dia

O boteco é **caiado**, o azulejo de meia parede é **verde-petróleo** e lá fora é
**hora azul**. Antes era o contrário em tudo: reboco ocre saturado, azulejo
creme e um pôr do sol laranja na porta. Três motivos para a troca:

- parede já colorida some debaixo da luz âmbar, e não sobra contraste para a
  placa preta nem para a lousa — a cor da parede tem de vir da LÂMPADA, não da
  tinta;
- azulejo creme sobre reboco ocre não lê como azulejo, lê como parede listrada;
- e, o principal, **céu laranja e lâmpada âmbar eram a mesma cor**: a porta
  deixava de ser porta e virava um retângulo mais claro na parede. Com a rua
  azul, o contraste dentro/fora é o que dá a hora do dia.

A luz acompanhou: o grosso da iluminação passou a vir de DENTRO (as lâmpadas do
salão quicando no reboco caiado), e o que entra da rua é um contraluz **frio e
fraco** que recorta os ombros de quem senta. Manter o antigo "sol" laranja com
um céu azul seria a incoerência que denuncia cenário montado.

**A mesa normal seguiu junto** — cenário em SVG no `index.html`: a porta agora
tem a hora azul (o comentário dela já prometia "a luz fria de fora contra a
quente de dentro", mas o gradiente era laranja: o código passou a cumprir o que
dizia) e o azulejo virou verde. Lá a parede continua ESCURA, e de propósito: na
mesa 2D a penumbra da borda é regra, e parede clara brigaria com o feltro.

### A voz da casa no cenário 3D

O boteco carrega o que a casa diz, e não só o que ela tem. Três coisas na
parede do fundo, todas em textura de canvas (nada baixado):

- a **lousa** do "AQUI TEM: boa resenha, boa cerveja, boas cartas, melhores
  amigos", pendurada acima da porta;
- o **dizer pintado no reboco** — "jogo · cerveja · resenha · sempre" —, sem
  moldura e com a tinta falhada, porque é tinta na parede e não cartaz;
- a **placa esmaltada** preta com a espada e o nome, que é o único contraponto
  escuro numa parede toda ocre.

A espada dessas peças é a MESMA do naipe do baralho (o `#naipe-0` do
`index.html`, escrito como `Path2D`): a marca do boteco e a carta na mão têm de
ser a mesma espada, senão são duas casas. E, pela porta, a fachada de frente
agora traz o "boa companhia sempre cabe mais uma" pintado — é a primeira coisa
que se lê de fora, e amarra a rua ao salão em vez de deixá-la de pano de fundo.

**Onde cabe é decidido pela tela em pé.** A faixa útil da parede do fundo é
`|x| < 2,7`, e ela já estava cheia: entrar ali significou alguém sair — o
cartaz "CAÇAMBA toda sexta" deu lugar à lousa, que diz a mesma coisa com mais
graça. E prop de CHÃO no meio do salão não adianta: o elenco sentado tapa o
piso, e a lousa, quando era de cavalete ao lado da porta, simplesmente não
existia para quem joga. Texto fora de quadro é trabalho jogado fora.

O par de **mesa e cadeiras de plástico amarelo** — o que diz "boteco" antes de
qualquer letreiro — fica de paisagem: aparece de lado e em tela deitada.

## A mesa em 3D

A carta em 3D é um retângulo de **canto arredondado**, e não um plano seco. O
canto podia sair de um recorte por alfa na textura, mas é justamente o alfa que
fazia o baralho pesar sete vezes mais — então ele sai de geometria
(`geometriaDeCarta`), que custa três dezenas de triângulos e ainda fica limpo em
qualquer ângulo, sem o serrilhado que o `alphaTest` deixa. A UV é montada à mão
porque `ShapeGeometry` mapeia a textura pelas coordenadas do mundo: sem isso a
arte sairia deslocada e cortada.

A textura usa **anisotropia no máximo que a placa dá**. A carta quase sempre é
vista de esguelha — deitada no feltro, ou no leque inclinado — e é exatamente aí
que filtro fraco embola o índice do canto.



O botão **3D** na barra da mesa abre `3d.html`: a MESMA partida, vista da sua
cadeira — o servidor continua sendo o juiz, e a tela 3D é só outra janela para
o mesmo estado. Ela entra com a sessão do `localStorage`, recebe as mesmas
visões e manda as mesmas ações; dá para jogar o ciclo inteiro por ela (puxar,
baixar com o plano do próprio motor, descartar) e, desde 08/09/2026, também
**encaixar e trocar pelo coringa** — pelo visor de jogos, logo abaixo. O botão
de voltar para a mesa normal continua sempre à vista.

O que ela desenha ([`public/mesa3d.js`](public/mesa3d.js)): o salão em neblina
(a penumbra por distância de verdade), a mesa redonda sob a lâmpada, o elenco
sentado em volta **segurando o leque de cartas viradas**, o monte como caixa
com altura proporcional ao baralho, o descarte e os jogos baixados **em pé**
sobre o feltro (a carta que cai gira no ar) e a sua mão em leque — **sem mãos**,
desde 08/09/2026 (logo abaixo). Reações (boca feliz/brava, pulo) respondem aos mesmos eventos da
mesa normal.

**A câmera senta à mesa, inclinada sobre o tampo** (`encaixaTela`,
2026-09-04): em pé, o olho a ~1,8 m acima do tampo e ~3,2 m do centro, olhando
o feltro a **~30°** com 74° de campo — era 1,7 m acima e 4,6 m atrás, a 17°,
com 84°, e a mesa virava um campo vazio com gente miúda na borda. Os 30° não
são gosto: são o mínimo para uma carta DEITADA no feltro ler (a 17° ela vira
uma tira). Subir mais viraria vista de cima e sumiria a sensação de estar
sentado com os outros, que é o que se quer da referência.
Quem paga a conta de caber todo mundo é a **abertura dos assentos**
(`posicaoDoAssento`): ±38° em pé, ±60° em paisagem — com ±60° e a câmera
perto, os assentos das pontas saíam do quadro e os nomes ficavam cortados na
borda. A conta que fecha: a 5,8 m da câmera, um rótulo de 0,66 de largura no
assento a ±38° termina a ~19° do eixo, e a meia-abertura horizontal da câmera
em pé é ~20°. Acima de 4 adversários os assentos ímpares recuam para uma
segunda fileira (raio 3,3 em vez de 2,66), como na mesa 2D — sete bonecos num
arco só viravam um corpo atrás do outro — e a abertura aperta para **±30°**:
a ±38°, com cinco, os das pontas saíam do quadro (visto na tela); cabe porque
as fileiras alternam o raio e na da frente sobram ~0,9 m entre vizinhos.
Conferido na tela com cinco adversários: todos inteiros, dois arcos, nomes
completos.

### Sem mãos na mesa 3D (08/09/2026)

A mesa 3D mostra **o leque e mais nada** — nem mão rigada, nem desenho de
reserva. Foi decisão do usuário depois de um dia inteiro de tentativas: *"não
ficou como a referência enviada"*, *"descarte e remova do arquivo do jogo essas
mãos em primeira pessoa"*, *"deixe apenas as cartas em leque mesmo"*.

Vale registrar o que se aprendeu, porque o custo já foi pago e o problema pode
voltar:

* **posar no jogo não funciona.** Procurar um eixo de pinça entre dois ossos e
  adivinhar o giro que sobra produziu mãos viradas ao contrário e furando o
  leque. O que resolve é um nó de contrato dentro do modelo (`PlanoDaCarta`:
  origem no centro da carta, +Z na normal da palma, +Y na subida) e uma conta
  direta, `M = A · P⁻¹`, sem grau de liberdade para adivinhar;
* **pose se acha por medida.** `scripts/mao_pose_segura.py` mede a malha já
  deformada pelo esqueleto contra o plano da carta e não sai do lugar por
  opinião: o dedo enrola até a última falange apontar ATRAVÉS da carta; a carta
  encosta nos dedos mais meia espessura de leque (12 cartas de 0,3 mm sobre os
  185 mm da mão); o polegar deita na direção em que as cartas sobem; a pinça
  fecha até sobrar entre as pontas exatamente uma espessura de leque;
* **dois defeitos que pareciam de pose e eram de outra coisa:** o rig do
  conversor tinha 1.602 de 2.283 vértices presos a um osso só (difusão de calor
  resolveu, 1.602 → 739), e `getVertexPosition` do three.js devolve no espaço do
  VÍNCULO — multiplicar pela `matrixWorld` de depois dava meio metro de erro, que
  o jogo "corrigia" empurrando a mão para trás;
* **o que nunca fechou** foi a leitura: mesmo com a lateralidade conferida pelos
  ossos e a palma virada para a câmera, a composição não bateu com a referência.
  A diferença estrutural era de onde os braços entram no quadro — pelas bordas
  laterais na referência, subindo do rodapé no jogo — e nem corrigindo isso a
  mesa ficou parecida.

O caminho de volta: `git show ab5aafd` tem o estado final, e os geradores
continuam no repositório (`scripts/mao_para_posar.py`,
`scripts/mao_pose_segura.py`), que são a parte cara de refazer.

### Ler os jogos baixados (08/09/2026)

Queixa do usuário: "as cartas baixadas na mesa também [são um problema] por
falta de visibilidade" e "os jogos estão se misturando quando tem vários".
Duas coisas estavam proibidas: **erguer carta** (flutuar ou inclinar) e mexer
no que já estava bom. O que restou, e é o que a mesa faz hoje:

* **Toda carta baixada vira para a câmera.** Cada fileira acompanha a cadeira
  do dono só até ±35°; a SUA não gira. Antes a fileira girava junto com a
  cadeira e a sua saía de cabeça para baixo — o índice do canto ficava no lado
  escondido pela carta seguinte.
* **A carta do tampo cresceu** para `ESCALA_TAMPO` cheia e o passo abriu de 8
  para 10,5 cm: a fatia visível de cada carta é a do índice.
* **Cada jogador ganha um tapete** na cor da sua banqueta (`CORES_DE_ASSENTO`),
  com o miolo escuro. É o que separa os blocos quando a mesa enche.
* **Quem baixa muito quebra em linhas** em vez de encolher tudo: a segunda vai
  para dentro da mesa, onde há feltro sobrando (`maxLinhas`).
* **A altura do olho segue a distância** (`alturaDoOlho`): o que faz uma carta
  deitada ler é o ângulo com que a vista bate no feltro. Com o olho fixo a
  1,20 m a fileira do outro lado era vista a 11° e virava uma tira; fixando a
  inclinação em ~19° (teto de 1,62 m, que é o limite de continuar sentado), a
  mesa cheia sobe a cabeça junto em vez de piorar.
* **A barra de ações sobe acima dos seus jogos** (`--acao-fundo`), e em janela
  deitada **a mão desce** um sexto da carta pela borda (`layoutMao3D`): o
  índice mora no alto, então ela continua de ler, e o feltro onde ficam os seus
  jogos aparece.

**O visor de jogos** é o que resolve o caso extremo. Numa mesa de oito com
todo mundo baixado são ~60 cartas em 4 m² de feltro: nenhum arranjo as faz
caber legíveis ao mesmo tempo. Então o feltro fica com a visão de conjunto —
quem baixou o quê, de quem é cada bloco — e **o toque num jogo abre a lista
inteira** em tamanho de leitura (a mesma arte da carta, redesenhada do canvas
da textura), agrupada por jogador e com a cor de cada um. Com uma carta
escolhida na mão, cada jogo ganha o botão de **encaixar** (as duas pontas,
quando serve nas duas) e, com um coringa escolhido, cada carta de sequência
baixada ganha **trocar pelo coringa** — as mesmas ações do motor, sem sair da
3D. O botão `🃏 Ver os jogos` na barra abre o mesmo visor.

**Sombra de verdade, da lâmpada** (2026-09-04): o `SpotLight` projeta um mapa
PCF suave de 2048 sobre chão, tampo e aro; cartas da mesa, monte, bonecos e
modelos projetam. O mapa é atualizado **de 4 em 4 quadros** (`autoUpdate`
desligado) — cada atualização é um render extra da cena, e em celular isso
pesa; para o que se move devagar (respiro, carta caindo) não se nota. A
lâmpada saiu um palmo do eixo, para o lado da câmera (`0.45, 4.4, 0.7`):
exatamente a pino, o que está encostado no tampo não projeta nada e a sombra
sumia. Os **discos de contato** (`sombraDeContato`) ficaram, mais leves, para
o que a sombra dura não pega. A do descarte fica FORA do grupo, que é
esvaziado a cada carta nova.

**Materiais com matéria** (2026-09-04): o feltro é `MeshStandardMaterial` com
um mapa de cor de 1024 (o gradiente de antes mais um chuvisco fino de claro e
escuro e duas famílias de fibras quase invisíveis) e um **mapa de relevo** com
o mesmo chuvisco, repetido 8×8 — é a luz rasante da lâmpada sobre o relevo que
faz o tecido parecer tecido. A madeira (aro, lateral do tampo, pé) é veio
gerado em canvas: faixas que ondulam e alternam tons ao longo do anel, com
rugosidade baixa no aro, para a lâmpada deixar um brilho comprido nele — é o
brilho que diz "madeira polida", não a cor. As cartas passam a `Standard` com
rugosidade média: o brilho de verniz da carta plastificada. Tudo gerado na
hora (`texturaFeltro`, `texturaMadeira`, `texturaRelevoFeltro`), nada baixado:
peso em celular, e a regra do projeto é não depender de fora.

**Objetos de escala no tampo** (2026-09-04): um copo com um dedo de bebida
sobre um porta-copos e um porta-copos sobrando, **atrás das pilhas**, um de
cada lado — é o copo que diz o tamanho da carta (referência: os copinhos e
fichas do Capote). Ficam ali e não na beirada porque em pé a meia-abertura
horizontal da câmera é ~20°: a ±1,5 m da lateral saíam do quadro. Vidro
barato, sem passe de transmissão (pesa em celular).

**Voos** (2026-09-04): `voa(obj, de, para)` leva qualquer objeto de um ponto a
outro com aceleração suave e um arco, e `animaVoos` roda no laço. É o que
anima **distribuir** (três cartas viradas por assento saem do monte,
escalonadas — as de verdade não vão, como na 2D), **puxar** (a carta nova da
sua mão voa do monte ou do meio até o lugar dela no leque, convertida para o
espaço da câmera, onde a mão vive; a dos outros é uma carta virada passageira
até o assento) e **baixar** (a fileira inteira do jogo novo voa do assento de
quem baixou). Os eventos armam (`entradaNaMao`, `baixadaDe`) e o `sincroniza`
seguinte dispara; `jogosVistos` diz o que é jogo novo. Tudo desligado em
`prefers-reduced-motion`.

**Mapeamento tonal neutro** (`NeutralToneMapping`, exposição 1,1): a lâmpada
forte estourava o feltro no meio; o Neutral segura o branco sem lavar o âmbar
da paleta (o ACES lava). O que é **desenho** fica fora dele (`toneMapped:
false`) — cartas, rostos, mãos e rótulos —, senão o vermelho dos naipes virava
rosa.

**O leque da mão cabe por conta própria** (`sincronizaMao`): os centros das
cartas ocupam 84% da largura visível e cada carta gira em torno de si mesma
(2,9° por posição), então o giro não empurra as pontas para fora como na mesa
2D. O que parece corte nas pontas são as mãos nos cantos e o recorte de baixo,
que é de propósito.

**A sua vez no tampo** (2026-09-04): o mesmo disco âmbar que pulsa embaixo do
adversário da vez aparece na sua beirada do feltro (`meuFoco`), mais discreto
porque está perto da câmera. Antes a sua vez era só o texto do aviso.

**Vazamentos fechados** (2026-09-04): `trocaRotulo` solta a textura de antes
(cada troca criava um canvas na GPU e nunca liberava — contagem e monte
trocam a cada jogada), e a caixa da pilha do descarte, que nasce com geometria
própria a cada carta, é liberada antes de o grupo ser esvaziado.

**O leque do adversário tem o tamanho da mão** (2026-09-04): até cinco
cartas, a abertura de sempre; acima, o leque reabre no mesmo arco com as
cartas mais juntas, até nove (`LEQUE_MAX`) — mão cheia se vê de longe, e o
selo continua dizendo o número exato. Antes eram cinco costas fixas.

**O corpo vira para quem joga** (2026-09-04): a cada estado a mesa calcula,
para cada assento, o ângulo até quem está na vez (na sua vez, até a sua
cadeira), no espaço do próprio assento, preso a ±0,5 rad, e o quadro a quadro
leva o corpo até lá devagar. O rosto desenhado é um plano que encara a câmera,
então o que vira é a postura, não o olhar — e é isso que lê como atenção. O
leque e, num modelo externo, a boca da fala moram no grupo do assento, não no
corpo: giram em volta do mesmo eixo, a partir de uma base guardada
(`lequeBase`, `bocaBase`). Quem caiu não vira.

**A Gabizinsky esculpida** (2026-09-04): `public/models/gabizinsky.glb`
passou a ser a redução de uma escultura do usuário (1,95 milhão de
triângulos, que na verdade eram as quatro vistas da ficha numa malha só, 487
mil cada) para 29.995 triângulos com cor, normal map e metal/rugosidade em
1024 px. Dois scripts de bancada fazem esse caminho e ficam em `test/`:
`modelo-recorta.mjs` (separa as figuras pelos vazios em x, acha a que olha
para +Z pela ponta dos pés, grava só ela) e `modelo-prepara.mjs` (solda,
reduz com o `@gltf-transform/cli` via `npx`, encolhe texturas, injeta
`Cabeca` e, se pedido, as mãos). O estilo do elenco passou a manter o
**normal map** do material original. A escultura está em pé, sem esqueleto: a
mesa a mostra em pé, com o leque na posição padrão; sentar é trabalho de rig
automático (Mixamo), e o fluxo está pronto dos dois lados: `modelo-obj.mjs`
exporta o `.glb` reduzido como OBJ + MTL + texturas num `.zip` para subir no
rigger, e `modelo-prepara.mjs` aceita o FBX rigado de volta (converte com o
FBX2glTF, instalado uma vez em `~/.cache/cacamba-fbx2gltf`; é binário x86 e
roda sob Rosetta), funde clips de outros arquivos casando os ossos pelo nome
(`--clip feliz=arquivo.fbx`), renomeia o clip da fonte para `idle` e pendura
`Cabeca`/`MaoEsq`/`MaoDir` nos ossos `Head`/`LeftHand`/`RightHand`. A fusão
de clips foi testada com os `.glb` do trio; a conversão de FBX ainda não
passou por um arquivo real do Mixamo (2026-09-04). O preparo também tira o
mapa de metal/rugosidade, converte a cor PNG em JPEG (`jpeg --formats png`
do gltf-transform; sem `--formats` ele só recomprime JPEG) e leva os pés ao
chão quando a origem veio no meio do corpo. **A Dri esculpida** entrou no
mesmo dia: o arquivo já vinha com uma figura e 31 mil triângulos, mas 17,5 MB
de PNG em 4096 px; saiu com 1,6 MB. **A EstereX** chegou com 12 cm de altura
(outra unidade), e o preparo passou a trazer todo arquivo para 1,65 m
(`--altura`), escalando a raiz — a mesa normaliza de qualquer jeito, mas os
arquivos ficam coerentes. Com isso o trio inteiro é escultura; a versão
procedural vive só no histórico. Detalhes em `public/models/LEIA-ME.md`.

**A primeira sentada** (2026-09-05): a EstereX voltou do rigger com esqueleto
de 24 ossos e cinco clips de andar e sentar, não com uma pose. Nasceu
`test/modelo-senta.mjs`: assa o último quadro do clip de sentar como pose de
repouso (na origem; só a descida do quadril fica), endireita o tronco que o
clip deixa torcido 55° (`--gira`, em eixos do mundo), gira braços e
antebraços por cinemática direta até cotovelos e mãos caírem nos pontos de
quem segura um leque (`--mira`, em metros — girar por ângulos falhou porque
o antebraço dela aponta para o lado e um giro em X mal o move), apaga os
clips de andar e escreve `idle`/`feliz`/`bravo` em cima da pose. Três coisas
mudaram para ela caber: `encaixaModelo` **confia na escala** de um arquivo
que traz `Cabeca` (normalizar um sentado para 1,55 m fazia uma gigante de
2 m, com cartas gigantes na proporção); o leque encolhe para 0,55 nas mãos
de um modelo externo (`LEQUE_ESCALA_MODELO`; o selo compensa), porque o
leque do boneco de código é exagerado de propósito; e o preparo pendura
`Cabeca` um comprimento de osso acima do osso da cabeça e `MaoEsq`/`MaoDir`
na ponta dos dedos, nas unidades do rig (centímetros, com a raiz em escala
0,01 — a altura em metros enganava). O que o usuário viu como "mãos nas
pernas" era a pose final do clip, com as mãos nas coxas: rig e textura
estavam certos (UVs idênticas às da escultura, pesos das mãos só em ossos de
mão e antebraço). Segunda rodada, com o olhar do usuário: o clip senta na
beirada, então o quadril recua 12 cm e desce 6 cm (`--recuo`/`--desce`) até
as coxas apoiarem; acima da cintura os ossos da perna perdem o peso
(`--cintura`; 2.081 vértices da barriga e do cós seguiam a coxa e viravam
uma mancha de pele na calça); o tronco fica 15° mais ereto (o clip curva
para a frente, e era isso que fazia a pele das costas descer sobre o cós) e
a personagem desce 9 cm até as coxas afundarem de leve no assento; os pulsos
viram 45° para dentro; e o leque de um modelo fica **à frente** das mãos,
6 cm abaixo da ponta dos dedos, inclinado −0,35 rad — as cartas escondem as
mãos e só os dedos aparecem acima da borda, como no boneco de código. Entre
as mãos, as cartas atravessavam os dedos, e sem ossos de dedo não há como
fechar a mão. Terceira rodada: tudo isso saiu de conferir a versão publicada
pelos ângulos das capturas do usuário. Quarta: na mesa, sentada de verdade
numa banqueta de 55 cm, só a cabeça dela passava da borda — o tampo está a
0,92 m, altura de balcão, e os ombros de quem senta ficam nessa altura. A
banqueta virou **de balcão** (`BANQUETA_ASSENTO` = 0,72 m, com aro para os
pés) e o script senta o quadril pela altura dela (`--assento`, `--folga`),
não mais por um "desce" relativo ao clip. O boneco de código, que flutua com
o tronco a ~0,9 m, também fica mais coerente com a banqueta alta. Quinta:
ainda "muito lá embaixo". A mesa é de **escala de desenho** — cartas de
42 cm no tampo, bonecos com a cabeça a 1,55 m sentados — e uma pessoa de
tamanho real (1,33 m sentada) fica pequena e baixa atrás da borda. Um modelo
rigado e sentado entra agora na escala do elenco (`ESCALA_ELENCO` = 1,2, em
`encaixaModelo`; `m.sentado` diz quando), e a banqueta cresce junto (na mesa
e no provador), para ele continuar sentado nela. Modelo em pé, sem esqueleto,
fica como veio — é provisório. As alternativas descartadas: aproximar os
assentos da borda (deixa maior, não mais alto, e a borda esconde mais) e
baixar a mesa para 0,75 m (mexe em tudo, e as cartas de 42 cm ficariam ainda
mais fora de escala). Sexta: com a escala ×1,2 a banqueta de balcão punha as
coxas ACIMA do tampo; voltou a 55 cm (`BANQUETA_ASSENTO`), que com a escala
deixa as coxas sob o tampo e o peito acima.

**A mesa de jantar** (2026-09-05, à tarde; decisão do usuário a partir da
referência do Capote: "fazer algo referenciado nisso não encaixaria
melhor?"). A mesa antiga tinha o tampo a 0,92 m com 2,55 m de raio, os
assentos a 2,66 m do centro e a câmera a 30° sobre o tampo — boa para ler
cartas deitadas, ruim para ver gente: um modelo em tamanho real ficava
pequeno e baixo atrás da borda, e nenhuma escala consertava sem estragar
outra coisa. Agora: tampo a **0,76 m** com **1,15 m** de raio, assentos a
**1,5 m** do centro (as coxas entram sob o tampo, os cotovelos ficam na
borda; segunda fileira a 2,25 m com cinco ou mais), câmera na altura dos
olhos de quem senta (`OLHO` = 1,2 m, um pouco à frente da própria cadeira,
12° para baixo; 55° de campo em paisagem, 72° em pé), abertura dos assentos
±55° em paisagem e ±33°/±26° em pé (a meia-abertura horizontal em pé é ~18°),
cadeira de 0,45 m, modelos em **tamanho real** (`ESCALA_ELENCO` = 1) e o
boneco de código a 0,8. As cartas do tampo (monte, descarte, jogos) encolhem
para `ESCALA_TAMPO` = 0,55 da carta da mão e se erguem mais para a câmera
(descarte 30°, jogos 34°) — de lado, deitadas de vez viravam lascas; e ficam
foscas (rugosidade 0,88), porque erguidas refletiam a lâmpada e saíam
brancas. O foco da vez de cada um sai do chão (ficaria sob a mesa) e vai para
o tampo, na frente da cadeira. O leque próprio e as suas mãos, presos à
câmera, passaram a ser desenhados por cima de tudo (`depthTest` desligado,
materiais próprios): com o olho na altura da mesa eles ficavam atrás do
tampo. Rótulos de nome menores (a 1,5 m os antigos tampavam o vizinho), aviso
em tela larga na faixa do painel, lâmpada mais baixa, neblina mais rala. O
provador acompanha a geometria (tampo, raio, cadeira a 1,5 m).

**O bar em volta** (2026-09-05, pedido: "maior semelhança à imagem do
Capote"). A sala virou um bar de bairro claro: 5,4 m de raio e 3,2 m de
pé-direito (era um salão de 8,5 m na penumbra), teto creme com três
luminárias fluorescentes (corpo que brilha + ponto de luz cada), ambiente
mais forte e mais quente, neblina rala, piso xadrez creme e marrom, parede
ocre com azulejo creme até a meia altura. Objetos, tudo forma simples e cor
gerada aqui: duas geladeiras de bebida (caixa colorida, porta de vidro,
prateleiras com garrafas), prateleira de garrafas na parede, TV no suporte
com futebol na tela, três cartazes de papel com texto original (nada de
marca), mesa de sinuca ao fundo com bolas e tacos na parede, ventilador de
parede, e dois copinhos de vidro no tampo à direita de cada assento. A
posição de cada coisa é por ângulo em volta da mesa (`noBar`). O monte e o
descarte foram para o seu lado do tampo (z = +0,12): no meio ficavam em
cima dos jogos de quem senta à frente. E o alcance do mapa de sombra da
lâmpada subiu de 9 para 14 m: com a câmera na altura da mesa, a beirada
perto de você ficava fora dele e saía um retângulo escuro no feltro no
celular em pé. O feltro verde e o aro de madeira ficam — são a identidade
da mesa (a do Capote é amarela).

Segunda passada (mesmo dia; pedido: "cartas com visual e alocação melhor,
cenário condizente com os personagens, luz um pouco mais baixa"): as cartas
ganharam cantos de verdade (`alphaTest` no material — o desenho já era
arredondado, mas o canto transparente virava canto cheio) e um fio escuro na
borda; as pilhas voltaram ao **centro** do tampo e os jogos baixados ficam
num **anel** em volta delas, cada um na frente da própria cadeira (fileira
da frente a 0,78 m, a de trás a 0,52, os seus a 0,72), com o conjunto de
cada um encolhendo para caber no vão entre vizinhos (nunca abaixo de 0,45).
O cenário passou ao mesmo sombreamento em degraus dos personagens
(`MeshToonMaterial` em vez de Lambert), com madeira de veio nas tábuas,
sinuca e tacos, cores menos saturadas e um grão fino na parede e no piso —
cor lisa ao lado de textura assada parecia papel. Ambiente de 1,6 para 1,15,
luminárias de 14 para 9, foco 80, exposição 1,0.

Terceira passada (mesmo dia; pedido: "o cenário de fundo no mesmo estilo dos
personagens e da mesa, algo realista"). O que faz realismo é luz e material,
não mais objetos: a cena ganhou um **mapa de ambiente gerado** (uma salinha
de paredes ocre com retângulos de luz no teto, filtrada pelo `PMREMGenerator`
uma vez, `scene.environment` a 0,5) — é ele que dá luz indireta e reflexo ao
verniz do aro, ao vidro da geladeira e das garrafas, ao brilho do azulejo;
os objetos do bar passaram a **materiais físicos** (`MeshStandardMaterial`:
tinta de metal na geladeira e nas calhas, vidro colorido com rótulo de papel
nas garrafas, madeira envernizada, feltro de verdade na sinuca); a parede
virou reboco pintado com grão e manchas de umidade sobre azulejo com variação
de tom e rejunte fundo, e o piso lajota cerâmica com tom por peça, rejunte e
verniz — os dois com **mapa de relevo** que a luz rasante das luminárias
revela. E os personagens passaram a ser mostrados com o **material original
da escultura** (cor + normal map, `estilo: 'original'` em `encaixaModelo`,
também padrão no provador): com o cenário realista, o sombreamento em
degraus deixava o rosto chapado. O boneco de código continua em degraus —
é o reserva, e é desenho.

**Os oito sentados** (2026-09-05): o usuário refez e rigou os oito, mas os
arquivos vieram só com repouso, andar e correr. `modelo-senta.mjs` ganhou
`--pose`: a pose sentada da EstereX do dia anterior viaja para cada um como
**deslocamento de cada osso em relação ao próprio repouso** (lido das
`inverseBindMatrices`). Copiar rotação local ou orientação no mundo torcia
os membros — rigs do mesmo esqueleto têm ossos de repouso orientados de
jeitos diferentes. As miras dos braços passaram a ser relativas ao osso do
quadril (eram absolutas e ficavam no colo quando a banqueta baixou). O
"endireitar automático" pela linha dos ombros foi desligado: no clip de
sentar os ombros não são simétricos, e a correção torcia um tronco reto.
Os três antigos (procedurais e esculturas em pé) foram substituídos; o
boneco de código só entra se um arquivo faltar. A pose transferida trazia a
cabeça virada 59° de lado (todos olhavam para o mesmo canto): o script agora
mede o desvio da cabeça em relação ao próprio repouso, tira só a guinada e
mantém o olhar para baixo. `window.mesa3d` expõe assentos, cena e câmera
para medir do console, como o provador.

**O elenco esculpido sentado, e o que a mesa anima nele** (2026-09-07): o
usuário refez os oito no gerador 3D **já sentados e com as mãos em pinça**,
sem esqueleto, depois de duas tentativas de articular as esculturas anteriores
(rig de dedos por geometria, enxerto de mão modelada à parte). `scripts/
prepara_sentado.py` normaliza cada um para 1,45 m sentado, 32 mil triângulos e
texturas de 1024 px, e mede na malha os três nós do contrato: `Cabeca` (91% da
altura — a 85% caía no pescoço), `MaoEsq`/`MaoDir` na pinça e, novo, `Assento`
— a maior superfície voltada PARA BAIXO entre 25% e 52% da altura, que é onde
o corpo encosta na cadeira. Sem esqueleto não há osso do quadril, e pela caixa
a cadeira caía 15 a 20 cm à frente: o personagem sentava no ar, com a cadeira
atrás dele.

Sem osso, a atuação passou a ser do **corpo inteiro**, em `interacao3d.js`
(`atuaCorpoInteiro`), a partir da gravação de Capote que o usuário mandou como
referência: respiro de ±8 mm, o tronco virando até 0,37 rad para quem está
jogando, e na própria vez o corpo chegando 5,5 cm para a frente com o leque
5 cm mais alto e mais deitado para si — que é o gesto que a referência mostra
quando chega a vez de alguém. Compra e descarte não movem braço (não há
braço): a carta voa da pinça. Com esqueleto no arquivo, o caminho antigo
(braços por cinemática, dedos, cabeça) volta inteiro; `i.estatico` separa os
dois.

**A reação sem cara** (2026-09-07): `reage()` procurava morph e clip, e as
esculturas não têm nenhum dos dois — quem baixava ou batia não respondia nada.
Agora, quando não acha, cai em `reageCorpo`: `feliz` dá dois pulos de 4,5 cm no
assento, `bravo` balança o tronco 0,17 rad e recua 5 cm. As duas nascem e
morrem no repouso (envelope `sin(pi·u)`), e por isso somam-se ao respiro e à
chegada da vez sem tranco. `reage()` devolve `'corpo'` nesse caso, e é o que o
provador mostra ao apertar **feliz**/**bravo**. Com morph ou clip no arquivo, a
cara continua mandando e o corpo não se mexe.

No mesmo dia, um defeito que a pose estática deixou: os voos de descarte e de
baixada esperavam 520 ms e 635 ms antes de sair da mão — atraso calibrado para
a carta partir no meio do gesto do braço. Sem braço, virou tempo parado. O
atraso agora depende de haver gesto (`temGesto`, em `mesa3d.js`): 90 ms e
120 ms para escultura estática.

**As suas mãos passam a ser as do seu personagem** (2026-09-07): nas pontas do
leque havia dois desenhos 2D chapados, do tempo em que o elenco todo era
desenho. `scripts/mao_primeira_pessoa.py` recorta as mãos da própria escultura
— crescendo pela superfície a partir de `MaoEsq`/`MaoDir`, limitado a 11,5 cm
em linha reta (o tamanho de uma mão: nas esculturas em que as duas se tocam a
superfície passa de uma para a outra) — e grava `public/models/<slug>-maos.glb`
com os nós `Esq`/`Dir`, 35 a 95 kB, sem textura: a cor vai em `COLOR_0`, porque
o atlas do gerador espalha os triângulos da mão pelo mapa inteiro. Só o arquivo
do SEU personagem é baixado; sem ele, o desenho continua sendo o reserva.

O primeiro recorte saiu **falhado**: a mão herdava ~800 triângulos de um corpo
decimado a 32 mil e lia como origami, com uma língua pendurada onde a esfera do
corte atravessava o punho de viés. O script ganhou dois acabamentos — aparo das
farpas mais dois anéis de erosão da borda, e refino por subdivisão de Loop até
5.000 triângulos por mão (quem já veio denso não refina). Os arquivos foram de
35–95 kB para 60–160 kB, o que é pouco ao lado de 1,7 MB por adversário.

Isso obrigou a mudar o desenho: **a mão virou um segundo passe**. Ela está a
1,3 m do olho e a beirada do tampo a 48 cm, então pelo mundo a mesa passaria na
frente das cartas; antes isso se resolvia com `depthTest: false`, que serve a
uma carta chapada mas destrói um sólido — a mão saía como um amontoado de
cacos, com as costas desenhadas por cima da palma. Agora `maoGrupo` mora numa
cena própria (`cenaMao`, com luz suave: o holofote âmbar do boteco estouraria
uma mão encostada na câmera), que é desenhada depois do mundo com
`clearDepth()`. Ela deixou de ser filha da câmera, então `segueACamera()` copia
a posição e a rotação a cada quadro — e antes de cada raio de toque.

As mãos entram 2 cm por DENTRO da ponta do leque e são desenhadas POR CIMA das
cartas (`renderOrder` 200, acima do 100+i delas): os dedos cobrem a beirada da
última carta, como quem segura o leque. Para fora — a primeira tentativa —
ficavam soltas no canto e, em pé, metade saía do quadro; para dentro demais,
tampavam os naipes. Para a mão aparecer como na referência — apoiada na mesa,
segurando as cartas de baixo — o leque teria de encolher e sair da faixa de
baixo, o que é mudança de `layoutMao3D` (`interface-core.js`).

Da mesma referência veio a **placa de estado** sobre a cabeça: acima do nome,
diz JOGANDO (âmbar) ou PRÓXIMO, e por 1,8 s o verbo do lance de quem acabou de
jogar (COMPROU, DESCARTOU, BAIXOU, ENCAIXOU, PEGOU A SOBRA, PEDIU O MEIO). Numa
escultura parada é ela que conta o turno.

A roda de cadeiras encolheu de 1,45 m para **1,34 m** (`MESA.assento`): a
barriga na beirada do tampo, joelhos por baixo e o leque por cima da madeira,
como na referência — a 1,45 sobrava um palmo de chão entre a mesa e cada um e
as cartas boiavam fora do tampo. Como isso aproxima todo mundo, `encaixaModelo`
ganhou um **recuo automático**: mede quem alcança a fatia do tampo nesse raio e
empurra o corpo para trás só o necessário (até 10 cm; a Lyly, de vestido
comprido, recua 8 cm, os outros sete, nada). A conta é sobre o feltro e não
sobre o aro de madeira — exigir folga até o aro afastava a Lyly 14 cm, mais
visível que o encosto que evitava. A carta na mão de um modelo caiu de 0,26
para 0,21 da carta da mesa (8,8 × 12,4 cm): a 0,26 o leque tampava o queixo, e
na referência dá para ler a cara de quem joga por cima das cartas.

O que ela **ainda não tem**, conferido no código em 2026-09-04: cartas sem
espessura e de face única (a espessura real seria invisível nesta escala; a
sombra é o que dá volume), e nada de sobras, troca de coringa, encaixe ou
placar — para essas, o botão manda de volta à mesa normal. O `requestAnimationFrame` não para com a aba escondida —
o navegador já o pausa em aba de fundo, então é pouco.

**As cartas da mesa ficam deitadas** — decisão do usuário em 2026-09-04
("deitadas, desde que visíveis"). O que as torna legíveis é o conjunto: a
câmera a ~30°, o descarte um pouco maior que o físico (1,15) e erguido 11°
para a câmera, e os jogos baixados **mais perto do centro do que o assento de
quem baixou** (fator 0,4 em vez de 0,52), maiores (0,85) e erguidos 20° — de
longe e a 0,66, deitados, viravam tiras que ninguém lia. O autor anterior as
tinha posto de pé exatamente por isso, com a câmera a 17°.

A biblioteca (`public/vendor/three.module.js`, ~675 KB, 167 KB com gzip) **só é
baixada quando se abre o 3D** — a mesa normal continua nos 181 KB. Vendida no
repositório para não depender de CDN (a regra do projeto é: sem build, sem
dependência de fora no navegador).

O salão existe em volta da mesa — parede circular de azulejo, a porta aberta
com a luz da rua, engradados —, tudo forma simples: a neblina come o detalhe
que estiver longe. As **mãos** seguem a construção do elenco (silhueta chapada,
contorno uniforme, halo) e recebem a mesma luz da cena, senão brilham como
neon. Os adversários seguram o leque deles na altura das mãos da figura, com
as pontas dos dedos (no tom de pele de cada um) por cima do verso: sem os
dedos, o leque flutua na frente do peito.

**O rosto é o do elenco, o corpo é desenhado** (2026-09-04, pedido do
usuário: "personagens 3D bem desenhados, no nosso estilo"). Três coisas:

- **Sombreamento chapado** (`MeshToonMaterial` com gradiente de três degraus):
  cor lisa e sombra de um tom só, como o elenco tem no 2D — Lambert deixava o
  boneco com cara de plástico.
- **Contorno escuro** em cada peça do corpo (`contornoDe`): uma cópia virada do
  avesso, um pouco maior, no `#2A1B12` do elenco. A espessura é absoluta, não
  proporcional — braço fino e tronco largo ganham o mesmo traço, como no
  desenho. Peças miúdas (olho, aro, guizo) ficam sem. O material do contorno é
  de cada boneco e entra em `materiais`, para esmaecer junto quando o jogador
  cai.
- **O rosto recortado da própria arte do elenco** (`carasDoElenco`): um plano
  sem sombreamento na frente da cabeça com a faixa x 60–340, y 0–250 do SVG de
  corpo inteiro — cabelo, óculos, brinco e o contorno do desenho vêm inteiros,
  e as versões feliz e brava vêm dos SVGs de expressão que já existiam. O plano
  se vira para a câmera a cada quadro (de lado viraria fio). Enquanto as
  texturas carregam, o rosto de primitivas segura a cena; quando chegam, tudo o
  que é cabeça (acima do pescoço, em 1,4 — regra por altura, não por lista)
  some, e a boca da fala passa para a frente do desenho.

Ficou de fora, por ora: pernas no boneco de código. O boneco virar para quem
joga chegou em 2026-09-04 (o corpo, não a cabeça — ver acima). A cadeira
chegou no mesmo dia: uma
**banqueta** de madeira com a almofada na cor do assento (`criaBanqueta`, em
`modelo3d.js`, porque o provador a usa para julgar a pose) — de balcão, 0,72 m,
com aro para os pés, desde 2026-09-05 (ver "A primeira sentada"). Era um disco
colorido no chão — com modelos que têm pernas, o disco os deixava sentados
no ar. Ver **2D×3D** abaixo.

**Personagens vindos de fora** (2026-09-04; decisão do usuário: os oito serão
modelados fora, no estilo do elenco, e a mesa integra). Quando existe
`public/models/<slug>.glb`, a mesa carrega o modelo (`carregaModelo`, com o
`GLTFLoader` vendido em `public/vendor/`, imports apontados para o three
local) e o põe no assento **no lugar** do boneco de código, que fica
invisível; quando não existe, o boneco fica — a mesa nunca depende do modelo.
`encaixaModelo` normaliza a altura (do chão ao topo → 1,55 m sentado), põe os
pés no chão e liga o que o modelo trouxer: os nós `Cabeca` (boca da fala e
rótulo) e `MaoEsq`/`MaoDir` (onde o leque entra), os morphs `feliz`/`bravo`
(reações) e `bocaAberta` (movida pelo nível do microfone), e os clips
`idle`/`feliz`/`bravo` (`AnimationMixer`). O respiro, o pulo e o esmaecer de
quem cai passam a agir sobre o modelo. O contrato completo está em
[`public/models/LEIA-ME.md`](public/models/LEIA-ME.md);
`test/modelo-exemplo.mjs` gera `_exemplo.glb`, um modelo mínimo (três caixas
com os nós nomeados, uma textura PNG embutida, o morph `bocaAberta` e os clips
`idle` e `feliz`) que prova cada caminho — não é arte. Quem tem modelo está em
`public/models/lista.json`: a mesa lê uma vez e só pede os que estão nela
(tentar `<slug>.glb` às cegas era um 404 no console por assento sem modelo); a
lista fica fora do cache da arte, para o modelo recém-posto aparecer na
abertura seguinte.

**O provador e o módulo comum** (2026-09-04). O que mesa e provador têm em
comum sobre modelos mora em `public/modelo3d.js`: o gradiente toon, o
contorno de casca invertida, `encaixaModelo`, `reage` e `confereModelo`.
`encaixaModelo` agora **veste o estilo do elenco** no modelo (`estilo:
'elenco'`, o padrão): cada material PBR do arquivo vira um `MeshToonMaterial`
com a mesma cor e textura e o gradiente de três degraus, e cada malha parada
ganha a casca de contorno — malha com esqueleto ou morph fica sem casca (ela
não acompanharia os ossos, e com morph a casca não abriria a boca). Metal e
rugosidade são ignorados: num desenho não dizem nada. A medida do modelo é
feita vértice a vértice (`Box3.setFromObject(raiz, true)`): a caixa rápida
usa o `boundingBox` da geometria, que com morph targets sai inflado para os
dois lados (o exemplo de 1,55 m media 1,60 e o leque descia junto) — e as
matrizes são atualizadas depois da escala, senão `Cabeca` e as mãos saíam nas
medidas originais do arquivo. `reage(m, nome)` toca o clip de uma vez só
apagando o `idle` no meio (antes os dois somavam meio a meio) e o mixer traz o
`idle` de volta no `finished`; o morph de mesmo nome sobe a 1 e a mesa o zera
quando a cara passa.

**`provador.html`** é a oficina de quem está modelando: abre um `.glb` do
aparelho (`File.arrayBuffer` → `GLTFLoader.parse`; o arquivo não sai do
navegador) ou um da lista, senta o personagem à beira da mesa com a mesma
lâmpada, o mesmo tone mapping e o mesmo encaixe da mesa, e a folha embaixo
lista a conferência do contrato (`confereModelo`): altura no arquivo e
normalização, origem no chão, centro, nós, morphs, clips, triângulos (≤ 15
mil), texturas (≤ 1024 px), materiais com metal, malhas com esqueleto. Botões
tocam `feliz`/`bravo` e seguram a boca (`bocaAberta` ou a elipse escura quando
não há morph), trocam **estilo: elenco/original** e escondem a mesa; arraste
gira o palco, dois dedos ou a roda aproximam. A câmera olha de viés (azimute
0,95) porque de frente o tampo tapava tudo abaixo do peito; o alvo é baixo
(0,6 m) porque a folha toma o pé da tela. Os modelos da lista são pedidos com
`cache: 'reload'`: são arte, com cache longo, e aqui o arquivo é justamente o
recém-trocado. Em tela larga a folha vira coluna à direita. `window.provador`
expõe o modelo atual, o palco e a cena para olhar do console. O modelo senta
na mesma banqueta da mesa, e quando o nome do arquivo é um slug do elenco a
**arte 2D** do personagem aparece na folha, para conferir os sinais de
identidade lado a lado.

**O primeiro trio** (2026-09-04, pacote do usuário `cacamba_trio_patch_jogo_v1`):
`gabizinsky.glb`, `dri.glb` e `esterex.glb` estão em `public/models` e na
lista. São malhas procedurais (gerador trimesh), 25–30 mil triângulos cada,
cor chapada sem textura, sem morphs (a boca da fala é a elipse), com os nós
`Cabeca`/`MaoEsq`/`MaoDir` no lugar e os clips `idle`/`feliz`/`bravo`
girando o nó raiz (o corpo inteiro balança e acena). O provador foi o que
pegou o erro do encaixe: centralizar o modelo pela caixa em x/z empurrava o
corpo 17 cm para trás (as pernas sentadas adiantam a caixa) e o leque caía no
peito — a origem em x/z agora é a do arquivo, e a régua de triângulos subiu
para 30 mil. Os cinco restantes seguem com o boneco de código.

**Os personagens são 3D de verdade** — bonecos montados por código, de
primitivas iluminadas (`montaBoneco` + `ESPEC_BONECO`): cabeça, tronco, braços
que descem até o leque, mãos e polegares segurando as cartas. A identidade de
cada um vem dos **sinais que o README do elenco define como dominantes a
48px** — o cabelo cereja em bob da Gabizinsky, os óculos dourados e a boca
vermelha da EstereX, as listras do Matheus (textura de canvas), as mechas de
mel da Dri, o flattop e o cristal do Junior, o vestido de florzinhas da Lyly,
os cachos e os óculos de prata do Mufasa, a camisa branca e a argola do Mafra
Kitty. O rosto é simples e igual para todos (olhos, sobrancelha, boca em três
estados — neutra, feliz, brava — que são a reação); quem distingue é o resto,
como na mesa 2D. Nenhum asset novo: os bonecos nascem no código.

Duas rasteiras de geometria que valem registro: a calota de cabelo era uma
esfera inteira e **engolia o rosto** (virou gorro + nuca); e olhos a z=0.145
numa cabeça de raio frontal 0.156 ficavam **enterrados dentro da esfera** — o
rosto saía em branco. Tudo do rosto vive em z ≥ 0.15.

As minhas mãos são **os mesmos caminhos SVG da mesa 2D**, rasterizados com o
tom de pele do personagem: o jogo já tinha uma mão desenhada; inventar outra
era o que a deixava incompatível.

**Descarte e jogos baixados ficam DE PÉ**, inclinados para a câmera: deitados
no feltro, do ângulo raso da cadeira, viravam lascas ilegíveis — e o topo do
descarte decide a compra a cada turno. O assento da ponta vira só **meio
caminho** para o centro (`ang * 0.45`): virado por inteiro, a ±60° ele também
era uma lasca. **Arrastar para arrumar a mão** funciona como na mesa 2D, com o
mesmo limiar de 10px entre toque e arrasto — o destino vem da posição do dedo
convertida para o espaço da câmera na distância do leque.

Duas armadilhas que custaram e ficam registradas:

- `canvas` é **elemento substituído**: `inset: 0` não o estica como a uma
  `div` — ele fica no tamanho intrínseco do buffer (2× da tela, pelo
  `pixelRatio`) e vaza, mostrando só um canto da cena. `width/height: 100%`
  explícitos resolvem.
- Em tela **em pé**, um fov vertical fixo vira um túnel (52° verticais numa
  tela 9:19 dão ~26° de largura). O fov e o recuo da câmera saem da proporção
  da tela (`encaixaTela`), e o leque é dimensionado pela largura visível
  calculada da câmera de verdade.

## O baralho

As 56 cartas são **arte pronta**, não desenho de código: 55 imagens em
`public/assets/baralho/` (52 cartas, 2 coringas e o verso), montadas por
[`scripts/baralho_gatos.py`](scripts/baralho_gatos.py) a partir das folhas
originais. O baralho é de gatos em traço de tinta: o bicho é contorno — o papel
é o pelo dele — e o naipe é a única massa cheia da carta.

[`public/baralho.js`](public/baralho.js) é só o mapa de nome de arquivo, e vive
em `public/` porque **as duas mesas leem o mesmo arquivo**: a normal põe a
imagem dentro do `.card`, a 3D usa como textura. Antes cada uma desenhava o
próprio baralho — um em SVG, outro em canvas — e os dois divergiam a cada
ajuste; hoje o que a pessoa vira na mão é exatamente o que ela vê deitado no
feltro. O nome sai do par naipe+valor do próprio motor (`0-13.webp` é o Rei de
espadas), então não há tabela de-para para desatualizar.

**O coringa** é o único com escolha: são quatro por baralho e a arte traz dois
desenhos (o gato na bola e o gato no monociclo). Alternam pelo id da carta, que
é estável na rodada — os dois aparecem na mesa e nenhum troca de figura na sua
mão no meio do jogo.

**A miniatura não usa a arte.** Em 30×42 px o índice impresso fica com 3 px e
some, então o jogo baixado continua com o desenho esquemático de sempre (valor
no canto, um naipe no meio). Carta de mesa é para ler, não para admirar.

### O naipe vermelho

A arte chega toda preta, e copas e ouros precisam do naipe vermelho com o traço
preto. Separar um do outro **não é questão de cor** — os dois usam a mesma
tinta — e sim de forma. O método está em
[`scripts/naipe_vermelho.py`](scripts/naipe_vermelho.py) e foi construído
medindo, não chutando:

- o **molde** sai da própria carta: o naipe do índice, que é limpo e nunca
  encosta em nada. Ele é escolhido pela POSIÇÃO (é o glifo de baixo), e não pelo
  tamanho — no Rei de ouros o "K" é maior que o losango, e escolher pelo maior
  fazia o detector sair pintando a letra de vermelho;
- o molde entra nas **duas rotações**, senão o índice do canto de baixo (que é o
  de cima girado meia volta) fica preto nas 26 cartas;
- a semelhança de forma sozinha **não separa**: numa varredura das 26 cartas o
  coração mais torto marcou 0,685 e a pinta do manto da Dama, 0,679 — não existe
  corte entre os dois. Quem separa é o **tamanho**: todo impostor mede de 8 a 18
  px e todo naipe mede 32 ou mais, e isso é construção da carta, não sorte — o
  naipe do índice é o menor naipe que existe nela;
- o naipe que o gato **segura** não é componente próprio (no Ás de copas, gato e
  coração são uma massa só de 211×227). Para esses vale correlação dentro da
  massa, com prova de forma depois: abre-se a janela para tirar o traço fino e
  compara-se o caroço com o molde **também aberto** — comparar caroço arredondado
  com molde de cantos vivos reprovava justamente OUROS.

Sobrou **uma** exceção anotada no baralho inteiro: o lobo do gorro do Valete de
copas é uma gota cheia, do tamanho de um coração e quase da mesma forma, e passa
em todos os testes que reprovam os outros. Preferi anotar a exceção a afrouxar o
detector — afrouxar custaria o manto da Dama e a pinta do Rei, que já estão
certos.

### A margem e a proporção

A carta sai com **margem de papel** em volta do desenho e **proporção fixa**
(64:90, a mesma do `.card`). As duas coisas vêm do mesmo problema: cortada
rente ao contorno do desenho, a arte encostava na beirada e cada carta saía com
uma proporção um pouco diferente — no leque isso aparece como carta torta. A
moldura impressa que o corte joga fora também servia de respiro, e a margem é o
que devolve esse respiro. Ela é medida em PIXELS iguais nos quatro lados, não em
porcentagem de cada eixo, senão a margem de cima sai mais fina que a da lateral.

Some junto qualquer **risco reto e comprido**: a moldura da folha às vezes chega
partida e sobra um traço de 2 px atravessando meia carta (o Valete de copas
tinha dois na base). Nada do baralho é assim — o bigode é fino mas curto, o
cetro é comprido mas grosso.

### O peso

O baralho inteiro pesa **590 KB** (média de 10,7 KB por carta, a 320 px de
largura). O caminho até esse número foi medido:

| tentativa | peso |
|---|---|
| WebP com alfa, q92 | 2,6 MB |
| WebP com alfa, `alpha_quality=60` | 893 KB |
| folha única 8×7 com alfa | 635 KB |
| sem alfa, papel embutido, 208 px q82 | 381 KB |
| **sem alfa, papel embutido, 320 px q86** | **590 KB** |

O canal alfa é o custo: o WebP o grava quase sem perdas, e traço
antisserrilhado em 55 arquivos não comprime. Tirar o alfa e **embutir o papel**
na imagem resolve — e de quebra a carta fica idêntica à da mesa, porque o
degradê gravado é o MESMO do `.card`. A folha única não compensou: economiza
requisições, mas força baixar as 55 de uma vez, e a carta solta carrega sozinha
quando aparece.

Os 320 px são pela mesa 3D, onde a carta do descarte aparece grande e de perto;
a mesa normal se contentaria com 208. `LARG` e `QUAL` no topo do
`main()` do script são a alavanca, e refazer é barato: a máscara de naipe fica
guardada em `~/.cache/cacamba-baralho/`, então só a compressão roda de novo.

## A mesa no celular

O elenco senta em volta do feltro. A faixa de blocos deu lugar a **assentos
posicionados** (`renderOpponents` + `posicoesDeAssento`), e cada jogador aparece
como a figura dele, cortada na altura do peito — quem está na mesa está
*sentado atrás dela*, não flutuando sobre o feltro.

| Adversários | Arranjo | Por quê |
|---|---|---|
| até 4 | uma fileira em arco | quem está na ponta senta mais perto de quem olha, como numa mesa redonda vista de frente |
| 5 a 7 | **duas fileiras**: metade atrás, metade na frente | sete assentos numa fileira só se sobrepõem numa tela de 375; e quem está atrás aparece menor (escala `0.8`) e mais apagado, que é o que a lâmpada faria |

O limite está em `ASSENTOS_POR_FILEIRA`, no cliente. A altura da caixa vem do
JS (`alturaDaMesa`), porque os assentos são posicionados e não empilham sozinhos.

Cada assento carrega, de relance: a **figura**, o **leque de cartas viradas**
(até 5 — presença, não contagem), o **selo** com o número exato de cartas, a
**cadeira** na cor do assento, o nome e as marcas (`2/3` do contrato, `🛒` de
quem pediu a carta, `fora` de quem caiu). Os jogos baixados não cabem aqui:
estão na fileira de baixo e no toque (`mostraOponente`).

`avisaAssentosApertados` é a rede de segurança, herdeira da que avisava sobre
adversário fora da tela: os assentos ficam dentro da caixa por construção, então
o risco de hoje é assento cortado na borda — nome muito longo, tela muito
estreita. Fica dormente quando tudo cabe.

**Você também senta à mesa** (`#meu-assento`, `renderMeuAssento`): antes o seu
personagem não aparecia em lugar nenhum durante a partida, só o dos outros.

### Os jogos na mesa

`renderMyMelds` mostra **tudo o que já foi baixado, de todo mundo**, agrupado
por dono e etiquetado com a cor do assento — o seu grupo primeiro. Antes só os
seus ficavam à vista, e os dos outros apareciam por um instante, quando davam
encaixe: dava para jogar, mas não para *planejar*. Cada jogo continua acionável
pelo `decorateMeld` quando a jogada é possível agora (encaixe, troca de coringa,
descarte de jogo seu).

### O placar

O botão `Σ` abre o placar da partida em curso. Era uma tabela de nomes e
números; numa partida de 7 rodadas ele é a tela que se abre entre uma rodada e
outra, e precisa responder três coisas de relance: **quem está ganhando, onde eu
estou e quanto falta**. Nome e total sozinhos não respondem nenhuma.

Hoje cada linha traz posição, **rosto** (na mesa você reconhece as pessoas pela
cara, não pelo nome escrito), nome, a distância para o primeiro e o total. O
fundo da linha é uma barra cortada em `--enche`: como aqui **menos é melhor**, a
linha mais cheia é a pior — a barra é o peso que se carrega. Quem lidera fica
âmbar, a mesma cor que marca a vez na mesa; a sua linha ganha contorno, porque
achar a própria linha numa lista de oito ordenada por pontos custa uma leitura
inteira.

Dois casos aparecem justamente na rodada 1, com a mesa toda zerada, e a primeira
versão errava os dois: não existe "na frente" quando todo mundo tem os mesmos
pontos (a linha diz **empatado**), e o primeiro da lista não é pintado de âmbar
só porque a ordenação o pôs ali.

### A sua mão

O leque é leque de verdade: as cartas se sobrepõem e giram em torno de um pivô
abaixo da tela (`transform-origin: 50% 190%`), como quem segura a mão. O passo
entre elas é **calculado** (`montaLeque`), não fixo — a rodada 7 dá 12 cartas e
um passo fixo estouraria a largura do celular; com poucas cartas, o mesmo passo
deixaria o leque frouxo. A carta escolhida sai do leque e sobe, que é o que
devolve o alvo de toque confortável que a sobreposição tira.

O cálculo desconta **o que o giro empurra para fora** (`SOBRA_DO_GIRO`): a
carta da ponta gira 8° em torno de um pivô uns 110 px abaixo do centro, e o
retângulo girado é mais largo que o reto — são ~20 px por lado além do que o
layout mede. Sem o desconto o leque cabia no papel e as pontas saíam pela borda
da tela a partir de 9 cartas (visto em 2026-09-03).

**As suas mãos** (`#maos`) sobem dos cantos de baixo e entram por trás do leque:
o que fica à vista é o antebraço e a ponta dos dedos entre as cartas. São
desenhadas no `index.html`, não geradas em arquivo, porque a única coisa que
muda entre personagens é o **tom de pele** (`peleDe`, em `shared/elenco.js`) — a
construção é a mesma dos geradores do elenco: contorno de 5 na cor do fundo,
dedos em duas camadas (tinta por baixo, pele por cima) e halo quente por fora.
Ficam **absolutas**: não ocupam altura nenhuma do layout, que embaixo é o
espaço mais disputado da tela. Com mão grande a sobra nas pontas encolhe e o
leque cobre as próprias mãos — que é o que acontece de verdade.

E são **cortadas** no eixo Y (`overflow-y: clip` na caixa `.maos`). A mão gira
30° em torno do cotovelo, e o giro joga a ponta do desenho 24 px abaixo da
tela; o `bottom: -24px` da mão põe outros 24. Eram 48 px de rolagem vertical
numa tela que devia ser fixa: a barra de cima saía de quadro assim que alguém
arrastava o dedo. `clip` corta sem criar caixa de rolagem, e só no Y — no X o
antebraço precisa continuar vazando pelo canto. A altura de 190 px na `.maos`
não é layout (a caixa é absoluta), é o alcance do corte.

### Sair da partida

O botão ⏻ na barra de cima pede confirmação e manda `{ t: 'leave' }`.

**Antes de começar**, o assento some da sala. **Com a partida em andamento não
dá para tirar o assento** — mão, jogos baixados e pontuação são todos por
assento, e remover um no meio da rodada quebraria a contagem. Então o assento
fica e o **robô assume na hora**, pelo mesmo caminho de quem cai, sem os 45 s
de espera (`awayActed = true`). Quem saiu recebe `gone`, e o servidor **troca o
token dele**: é isso que separa desistir de cair — cair é reversível, desistir
não. A mesa vê `desistiu` no lugar de `fora`, com a figura apagada e a cadeira
vazia por dentro.

Coberto por [`test/sair.mjs`](test/sair.mjs), que põe dois humanos numa sala,
faz um sair no meio da partida e confere as sete consequências — inclusive que
a vez **passa** pelo assento vago em vez de travar nele.

### Começo e fim de rodada

O **anúncio da rodada** passa por cima da mesa quando ela começa: número,
contrato e quantas cartas. Sai sozinho em 2,4 s e não pede toque. Antes o
placar fechava e a rodada seguinte começava seca — dava para jogar três turnos
sem notar que o contrato tinha mudado.

No **fim da rodada**, quem bateu aparece de corpo inteiro com a cara feliz
(quando o elenco tem a expressão), e cada linha do placar leva o rosto e a cor
do assento: com o elenco na mesa, reconhecer a cara é mais rápido do que ler o
nome e lembrar quem era. O mesmo vale para o placar final.

### Arrumar a mão

O leque sai ordenado por naipe ou por valor (`A↔♠`), e o jogador arruma como
quiser **arrastando a carta** para onde ela deve ficar. Não há modo para
entrar: **toque seleciona, arrasto arruma**, separados por um limiar de 10 px —
sem ele, um dedo que escorrega ao escolher uma carta reordenaria a mão sem
querer.

Duas decisões que fazem o gesto funcionar num leque de cartas sobrepostas:

- **O destino vem da posição do dedo, não de acertar uma carta.** `destinoDoArrasto`
  conta quantas cartas têm o centro à esquerda do dedo — soltar entre a 2ª e a
  3ª quer dizer sempre a mesma coisa, indo para a direita ou para a esquerda.
  A primeira versão (dois toques, escolhendo a carta de destino) tinha um vício
  aqui: mover para a direita largava *depois* do alvo e para a esquerda
  largava *antes*.
- **A fileira vem da estrutura (`.fila`), não da altura da carta.** No leque
  cada carta tem um topo diferente por causa do giro; agrupar por altura fazia
  cada carta virar uma fileira sozinha, e o destino saía errado.

**As duas regras da ordem moram em [`shared/mao.js`](shared/mao.js)**, e não no
cliente: `ordenaMao` diz como a mão aparece na tela e `reordena` move uma carta
de lugar. Estão em `shared/` porque só ali dá para testá-las sem abrir o
navegador e jogar uma partida — e foi exatamente ali que morou um bug que
precisou dessas duas coisas para aparecer.

O bug: **a carta recém-puxada não saía do canto do leque.** Ela seguia o dedo e
voltava para o lugar ao soltar. A causa eram duas fontes de verdade para a
ordem. A tela usava `ordenaMao`, que põe no fim do leque a carta que a
arrumação manual ainda não conhece — por isso a carta nova aparece num canto. O
arrasto, porém, trabalhava sobre a `ordemManual` guardada, que é só a *última*
arrumação e não tem essa carta: `indexOf` devolvia `-1` e a função desistia
antes de mover qualquer coisa. Só acontecia depois de o jogador ter arrumado a
mão à mão pelo menos uma vez, que é quando a `ordemManual` deixa de estar vazia.

Hoje `reordena` recebe a mão **como ela está na tela**, e não a ordem guardada —
uma fonte de verdade só. De quebra, a lista passa a sair sem os ids de cartas
que já não estão na mão. `test/mao.test.js` cobre o caso e as pontas
(soltar no próprio lugar, destino fora da faixa, carta que não está na mão).

Enquanto arrasta, as cartas depois do ponto de queda escorregam 9 px
(`--desloca`) para abrir o vão — é o que mostra onde ela vai cair antes de
soltar. `touch-action: none` nas cartas impede que o arrasto vire rolagem da
página no celular.

**A carta que acabou de chegar fica levantada.** Com a mão ordenada, a carta
nova se enfia no meio do leque e some — e é justamente ela que você precisa
achar para decidir a jogada. Vale para qualquer carta que ENTRE na mão, venha
do monte, do meio, da compra fora da vez ou de um coringa resgatado: a marca
sai da diferença entre a mão de agora e a do estado anterior
(`marcaCartasNovas`), não do tipo de jogada.

Ela sobe menos que a carta escolhida e usa o halo em vez do âmbar — é aviso,
não seleção. Some quando você **arrasta** a carta (já achou e pôs no lugar) ou
quando **chega outra**: só as últimas ficam marcadas, senão a mão inteira
acabaria levantada ao longo da rodada. No começo da rodada nada é marcado — a
mão inteira é nova, e marcar tudo não diria nada.

A ordem escolhida vive em `ordemManual` e só nesta rodada: os ids das cartas
recomeçam a cada uma. Carta puxada depois vai para o fim, sem embaralhar o que
já estava arrumado; e pedir ordenação automática de novo (`A↔♠`) descarta a
arrumação à mão.

### A carta

Cada carta traz os **dois cantos** (valor e naipe, o de baixo de cabeça para
baixo) e um miolo que depende do que ela é:

| Carta | Miolo |
|---|---|
| 2 a 10 | **um naipe por unidade**, no arranjo de baralho (`ARRANJO_PIPS`): duas colunas nas laterais, a do meio entrando conforme o valor sobe, e os de baixo virados. É o que distingue o 3 do 9 de relance, sem ler o canto. |
| Ás | um naipe grande, centrado |
| J, Q, K | o **retrato** de alguém do elenco, no lugar do naipe |
| Coringa | fundo âmbar e o **gorro de bobo** em silhueta |

Nas miniaturas dos jogos baixados (30×42) o arranjo sai e volta o naipe único:
dez naipes nesse tamanho viram mancha.

O **verso** é a madeira do aro com trama âmbar — o mesmo material da mesa, em
três escalas: trama de 5 px na carta inteira, 3 px na carta que voa e 2 px no
leque que os adversários seguram, para a textura ler igual em tamanhos
diferentes.

As **pilhas têm espessura**: as bordas das cartas de baixo aparecem atrás da de
cima (`camadasDaPilha`). No monte isso é informação de jogo — dá para ver o
baralho afinando, e três esgotamentos encerram a rodada.

**Por que os naipes são desenhados.** Eram os glifos `♠♥♦♣` da fonte do sistema:
mudavam de desenho a cada aparelho e, no iOS, o `♥` e o `♦` podiam chegar como
emoji colorido. Eram os únicos elementos da tela que não tinham sido desenhados
para este jogo — e o coringa era pior, o emoji `🃏`, com moldura, cor e traço de
outra obra. Hoje são `<symbol>` no topo do [`index.html`](public/index.html), sem
`fill`: herdam `currentColor`, e é só por isso que `.card.red` continua bastando
para virar copas e ouros de vermelho sem uma regra por naipe.

Os glifos **continuam existindo** em `SUITS`, no motor. Lá eles são *texto* —
avisos, mensagens de erro, leitor de tela —, e texto continua sendo texto. Em
compensação a carta, que perdeu o naipe escrito, ganhou `role="img"` e um
`aria-label` em palavras (`5 de copas`): sem isso o leitor de tela passaria a ler
um retângulo mudo.

**Quem é a figura de cada J, Q e K** (`figuraDaCarta`): são doze casas para oito
personagens, então quatro repetem — e a repetição é uma conta, não uma tabela. As
doze casas desfilam o elenco na ordem e dão a volta **com um passo de duas
casas**. Sem esse passo, as quatro últimas cartas caem exatamente nos rostos das
quatro primeiras, e o mesmo rosto no J e no K do *mesmo* naipe é o único caso que
confunde de verdade: ali a única diferença entre as duas cartas é a letra do
canto. O dia em que o elenco crescer, a repetição diminui sozinha.

O verso perdeu as listras `#274d92` que tinha antes — o único azul do jogo, e a
cor mais saturada da tela quando sete adversários abrem o leque.


### Animações

Todas em CSS, todas desligadas em `prefers-reduced-motion`.

| Gesto | O que faz | Quando |
|---|---|---|
| respiro | a figura sobe e desce 2 px, 4,2 s | sempre, com atraso diferente por assento para não sincronizarem |
| foco da vez | clarão âmbar atrás do assento + respiro maior | de quem é a vez |
| entrada | o assento aparece, escalonado por lugar | só quando o assento é novo |
| pediu | a figura treme duas vezes | no instante em que alguém pede a carta |
| baixou | a cadeira dá um pulso | no instante em que o jogo desce |
| carta cai | a carta nova do descarte cai na pilha | quando o topo do meio muda |
| distribuir | cartas saem do monte e voam para cada assento | no começo de cada rodada |
| reação | gesto (pula, murcha, treme) + balão curto no assento | quando algo acontece com aquele jogador |

**Distribuir** não manda as 6 a 12 cartas de verdade: com 8 jogadores seriam
quase cem elementos na tela. Três por jogador bastam para o gesto ler como
"está distribuindo".

**Reações** (`REACOES`, `reage`) respondem ao que aconteceu com aquele jogador:
baixou, bateu, pediu a carta, levou a carta, perdeu o pedido, trocou o coringa,
saiu. A troca de **rosto** (`trocaCara`) já existe de verdade: quem baixa, bate,
pega a carta ou troca o coringa fica `feliz`; quem pede a carta ou perde o
pedido fica `bravo`. O rosto volta ao de descanso em 1,9 s.

Os gestos de uma vez só (`pediu`, `baixou`, `carta cai`) são disparados por
**mudança de estado**, não pelo estado: o objeto `antes` guarda o que já era
verdade. Sem isso eles se repetiriam a cada estado que o servidor manda — os
bots jogam a cada ~1 s.

E é por isso que a mesa é **atualizada no lugar** em vez de recriada: recriar os
assentos reiniciaria o respiro de todo mundo a cada jogada, e a mesa piscaria
inteira.

### Personagens

Antes de entrar na sala, o jogador **escolhe quem vai ser** (tela
`screen-avatar`): a figura em tamanho grande, o nome, uma linha do que ela tem
de característico, e as miniaturas do elenco para trocar.

A escolha fica no aparelho (`localStorage`) e viaja no `create`/`join`. O
**servidor valida** contra `shared/elenco.js` e carimba `avatar` na visão de
cada jogador, do mesmo jeito que faz com `connected` — é assunto da sala, não
do motor. Sem essa validação, um cliente adulterado mandaria qualquer texto e
ele viraria caminho de arquivo na tela de todo mundo.

Quem não escolhe (os robôs) recebe o rosto do **assento** — determinístico,
então todos veem o mesmo rosto para a mesma pessoa. Enquanto o elenco for menor
que a mesa (que vai a 8), o rosto repete nos últimos lugares; quem continua
distinguindo é a **cor do assento** (`CORES_DE_ASSENTO`, oito cores). O número
de personagens muda a cada sessão, então ele não está escrito aqui: quem manda
é o tamanho de `ELENCO`.

A lista de personagens vive em [`shared/elenco.js`](shared/elenco.js) — e não
no cliente — justamente porque o servidor precisa dela para validar. Para
acrescentar alguém: gere a arte, documente no README do elenco, e ponha o slug
lá.

**A estampa da Lyly não é carimbada, é referenciada.** A florzinha dela aparece
~158 vezes só na saia, e cada carimbo custava seis elementos: davam 948
`<ellipse>` num arquivo de 126 KB — seis vezes o de qualquer outra pessoa do
elenco, para uma textura que o próprio código diz que "some cedo". Hoje a flor é
escrita uma vez em `<defs>` e cada carimbo é um `<use>` com
`translate/rotate/scale`. O desenho é o mesmo: girar a flor inteira em torno do
próprio centro dá exatamente o que dava somar o ângulo a cada pétala (era
`a = rot + i*72`, e a pétala girava desse mesmo `a`), e a escala é uniforme
porque todo raio ali é linear em `r`. **126 KB → 41 KB**, e o elenco inteiro caiu
de 850 KB para 576 KB.

Conferido rasterizando as duas versões a 400×800 e comparando pixel a pixel:
1,3% dos pixels diferem, com delta médio de 6/255 — antisserrilhado nas bordas
das flores. Lado a lado, no tamanho da tela de escolha, são a mesma figura.

**As expressões** são `<slug>-corpo-inteiro-<expr>.svg`, e o que muda de uma
para a outra é **só a boca**. A geometria dela vive num lugar só,
[`_geradores/expressoes.py`](public/assets/personagens/_geradores/expressoes.py),
porque a expressão é do *jogo* — o mesmo gesto no rosto de todo mundo — e não de
cada personagem. O que continua sendo de cada um é a **tinta**: quem tem batom
leva o batom para o contorno da boca, quem não tem usa o próprio contorno.

A `feliz` é uma boca **aberta**, não uma curva mais funda. A boca de descanso já
é um sorriso nos oito: uma curva um pouco mais funda sumiria nos ~28 px que a
cara tem na mesa. Aberta muda a *mancha*, e mancha se enxerga.

Ficaram de fora as **sobrancelhas**, que seriam o outro sinal óbvio. Redesenhar
a sobrancelha exige apagar a de baixo, e a caixa dela é testa — onde a franja de
metade do elenco passa. Apagar ali é apagar cabelo. A boca não tem esse
problema: naquela caixa não há mais nada desenhado em nenhum dos oito.

Acrescentar uma terceira expressão é desenhar a boca em `expressoes.py`, rodar
os oito geradores e listar o nome em `EXPRESSOES`.

Cada personagem sai de um script Python em
[`public/assets/personagens/_geradores/`](public/assets/personagens/_geradores/) —
os SVGs não são desenhados à mão. As decisões de arte (paleta, estaturas, o que
cada rosto tem de sinal dominante a 48 px) estão documentadas em
[`public/assets/personagens/README.md`](public/assets/personagens/README.md).

---

## Chat de voz

Pedido do usuário em 2026-09-04: os jogadores se ouvirem, e no 3D se
**enxergarem falando** — como no Capote, em que cada um é o próprio boneco. Sem
câmera, por escolha dele: o boneco do elenco é a presença.

**O áudio vai direto de um navegador ao outro** (WebRTC, em malha: cada humano
liga com cada humano; oito lugares dão no máximo sete ligações por pessoa, e
áudio é leve). O servidor não vê áudio nenhum: só **repassa a sinalização** —
oferta, resposta e candidatos ICE — pela mesma conexão do jogo, na mensagem
`{ t: 'voz', to, dados }`. `to` é um jogador da sala ou `'*'` (todos os outros
humanos); robô não recebe, ninguém manda para si, sala alheia não vê. O motor
não sabe que isso existe.

**Quem oferece é o id menor.** Quando alguém liga o microfone manda `oi` para a
mesa; quem já está com a voz ligada e tem id menor responde com a oferta, e
quem tem id maior responde `oi` de volta para o outro oferecer. É o que evita
os dois oferecerem ao mesmo tempo. Candidatos ICE que chegam antes da descrição
remota ficam numa fila e entram depois — sem isso os primeiros se perdiam e a
ligação não fechava.

**O caminho entre os navegadores vem do STUN público do Google. Não há TURN.**
Dois jogadores atrás de NAT restritivo (algumas operadoras de celular, redes de
empresa) não vão se ouvir: a ligação fica em `failed` e o resto da mesa segue.
Corrigir isso é um servidor TURN, que o plano free não tem — é a primeira
pendência desta parte.

**O microfone só liga num toque**, porque o navegador exige (e o iOS exige que
o `AudioContext` nasça no toque também). Um botão, três estados: desligado →
ligado → mudo → desligado. Trocar de mesa (2D ↔ 3D) recarrega a página e
desliga a voz — liga-se de novo do outro lado.

**Quem fala aparece.** O módulo mede o nível de cada voz (RMS da forma de onda,
`AnalyserNode`). Na mesa 2D o assento acende em verde — verde porque o âmbar já
é a vez e o laranja já é perigo. Na 3D o boneco ganha uma **quarta boca**, a
da fala: uma elipse escura que abre na proporção do nível e fecha quando a
pessoa para. Feliz e brava continuam sendo as reações do jogo.

Não dá para ouvir dentro do painel de verificação daqui (não há microfone
nele); o que está provado é o repasse (`test/voz.mjs`) e a montagem dos
botões. Ouvir de verdade é teste de gente, com dois celulares.

## `server.js` — salas e juiz

Único dono do estado da partida: o cliente só pede, o servidor decide e reenvia a
visão de cada um. Nenhuma regra é confiada ao navegador.

### Limites e defesas

Uma auditoria de 2026-08-28 achou três jeitos de derrubar o processo de fora
(com todas as salas junto) e um de jogar pelos robôs. Todos eram pequenos:

| Onde | O que era | O que ficou |
|---|---|---|
| `wss.on('connection')` | o socket não tinha ouvinte de `'error'`: um frame malformado (sem máscara, UTF-8 inválido) virava exceção não tratada e matava o processo | `ws.on('error')` que só registra |
| `http.createServer` | `new URL(req.url, …)` lança para alvos como `//[`; dentro do listener, derrubava o processo | `try/catch` → 400 |
| `makeCode` + `create` | `create` em loop criava salas permanentes até acabar a memória; perto dos 331.776 códigos o sorteio virava `while` infinito | `MAX_SALAS` (500) e sorteio que desiste depois de 64 tentativas |
| `attach` | `create`/`join`/`resume` no mesmo socket deixavam o assento antigo `connected: true` para sempre — e a limpeza só apaga sala sem humano conectado | `detach` antes de anexar, o mesmo que o `'close'` faz |
| `resume` | robôs têm token vazio e id público: `resume` com token `""` anexava o socket a um robô — dava para ver a mão dele e jogar por ele | filtro `!isBot && token` |
| `WebSocketServer` | `maxPayload` padrão de 100 MiB, cada mensagem passando por `JSON.parse` | 16 KB |
| `'message'` | sem freio; `claim`/`unclaim` geram broadcast do estado inteiro para a mesa toda | **não feito.** Um contador por segundo (60/s, depois 300/s) fechava os clientes roteirizados do e2e e do sobra.mjs, que agem no mesmo tick do estado, e as partidas estouravam o tempo. O certo é limite de conexões por IP e freio só em `claim`/`unclaim` |

**Feito em 2026-09-04, a segunda leva:**

- **`PUBLIC_URL` no `render.yaml`.** O link de convite e o QR nunca mais
  dependem de `x-forwarded-host` — que um cliente forjado podia tentar pôr num
  clone. E é ele que liga o HSTS no servidor.
- **Cabeçalhos de segurança** em tudo o que sai (`CABECALHOS_SEGUROS`):
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options:
  DENY`, `Permissions-Policy` com o microfone liberado só para esta origem (é o
  chat de voz) e câmera e localização fechadas; HSTS quando `PUBLIC_URL` é
  https. E a **CSP** nas páginas: script, fonte e som só daqui; `data:` para
  imagens (o QR da sala e as figuras do elenco entram como data URL); `blob:`
  para imagem e conexão (as texturas embutidas num `.glb` saem do arquivo como
  blob — no Chrome via `fetch`, no Safari via `<img>`; sem isso o modelo
  chegava sem textura, sem erro visível);
  `unsafe-inline` só para estilo (a mesa põe `style=` pelo JS); `frame-ancestors
  'none'`. Não há script inline em lugar nenhum, então `script-src 'self'`
  fecha a porta da XSS que a auditoria não achou mas não podia descartar.
- **As fontes servidas de `public/fonts/`** (`fontes.css` + quatro `.woff2`
  do próprio Google Fonts, licença OFL ao lado). Era a única dependência
  externa da tela: vazava o IP de quem joga a cada abertura e deixava a mesa
  sem tipografia quando a rede falhava. A Nunito é variável — um arquivo serve
  700, 800 e 900 —, e só entram os subconjuntos latin e latin-ext, que cobrem
  o português; os `unicode-range` são os do Google. `.woff2` ganhou MIME e o
  mesmo cache da arte.

`test/defesas.mjs` confere os cabeçalhos e a fonte (12/12).

**Terceira leva (2026-09-04):** `Origin` conferido no upgrade do WebSocket
quando `PUBLIC_URL` existe (o navegador manda o Origin e não dá para forjá-lo
de outro site — é o que impede um site qualquer de usar este servidor como
cliente; sem `PUBLIC_URL`, desenvolvimento e rede local, aceita tudo); **teto
de 40 conexões por IP** (uma família num mesmo NAT cabe folgada; um script
abrindo centenas, não — a 41ª é recusada no upgrade, `test/defesas.mjs`
prova); e **freio só em `claim`/`unclaim`**, o par que gera broadcast do estado
inteiro: mais de 6 num segundo da mesma conexão cai no chão sem erro. É o
freio que a auditoria pediu e que o contador de todas as mensagens (removido)
não sabia fazer sem fechar os clientes dos testes.

O que ficou **anotado e não feito**: código de sala com 5 letras (4 dá
331.776, varrível em ~1 min — o teto por IP agora limita a varredura, mas não a
impede). O que já estava certo e vale saber: estáticos presos às raízes, só
`err.gameRule` chega ao cliente, tokens por `crypto.randomUUID`, todo
`innerHTML` com nome passa por `escapeHTML`, `npm audit` limpo.

### Variáveis de ambiente

| Variável | Padrão | Para que serve |
|---|---|---|
| `PORT` | `3000` | Porta. As hospedagens injetam esta. |
| `HOST` | `0.0.0.0` | Interface. O padrão é o que as plataformas esperam; use `127.0.0.1` para restringir. |
| `PUBLIC_URL` | — | Endereço público fixo, para o link de convite e o QR. Sem ela, o endereço sai dos cabeçalhos da requisição (funciona atrás de túnel e de proxy) e, em último caso, do IP da rede local. **Em produção, defina-a**: mata a classe inteira de host forjado no convite. |
| `TRUST_PROXY` | — | `1` para honrar `x-forwarded-host`/`x-forwarded-proto` (só atrás de proxy reverso confiável). Sem ela, esses cabeçalhos são ignorados. |
| `ALLOWED_HOSTS` | — | Lista (vírgulas) de hosts aceitos no link/QR quando não há `PUBLIC_URL`. Host fora da lista (ou com sintaxe inválida) cai para o IP da rede local. |

O processo encerra limpo em `SIGTERM`/`SIGINT`, que é como a hospedagem o para.

### Estáticos

Sai daqui **só o que tem tipo conhecido** (a tabela `MIME`): o `octet-stream`
de reserva fazia de `public/` uma pasta aberta, e ao lado da arte moram o
README do elenco e os geradores em Python que a desenham. Não são segredo, mas
também não são para servir. A licença OFL das fontes continua acessível — quem
baixa a fonte tem direito a ela.

Cada resposta leva um **ETag** de tamanho + mtime, e um `If-None-Match` que
bate vira **304 sem corpo**. Sem ele, o `Cache-Control: no-cache` significava
baixar tudo outra vez a cada abertura — e só o elenco são 32 SVGs.

A **arte** (`/assets/`) vai com `private, max-age=300`: ela muda de deploy em
deploy, não durante a partida, e cinco minutos sem nem perguntar cobrem uma
sessão inteira. O **código** (html, js, css) fica em `no-cache` de propósito,
para um deploy aparecer na próxima abertura e não cinco minutos depois.

O `private` é a parte que custou uma surpresa: o Render tem **CDN na frente**, e
com `public` ele guardava a arte na borda. Depois de um deploy, a origem já
servia o arquivo novo e a borda continuava entregando o velho para todo mundo
por até cinco minutos — dava para ver pedindo a mesma URL com um parâmetro
qualquer no fim, que fura a borda e chega na origem. Com `private`, quem guarda
é o navegador de cada um: o ganho de não repetir o download continua, e a janela
de arte velha depois de um deploy deixa de ser coletiva.

Serve `public/` e, como exceção estreita, apenas `shared/` da raiz — para o cliente
poder importar o motor. Normaliza o caminho contra travessia de diretório.

### Peso do que o celular baixa

O servidor **comprime** (gzip, nível 9) tudo que é texto — HTML, CSS, JS, SVG e
JSON — com cache em memória chaveado por caminho + `mtime`: o mesmo arquivo é
pedido por todos da sala, e comprimir a cada pedido seria pagar o mesmo
trabalho várias vezes. O cache invalida sozinho quando o arquivo muda no disco.
PNG e WebP ficam de fora: já vêm comprimidos.

O **SVG é enxugado antes de comprimir** (`svgEnxuto`): saem comentários, o
espaço entre tags e a terceira casa decimal das coordenadas — num quadro de 400
unidades exibido a 56 px, 0,01 unidade é 1/700 de pixel. A limpeza é
conservadora de propósito: só corta entre `>` e `<`, porque espaço dentro de um
atributo `d` quebra o caminho.

Medido numa mesa de 8 jogadores, com todo o elenco na tela:

| | antes | depois |
|---|---:|---:|
| SVG do elenco | 341 KB | **65 KB** |
| JS | 182 KB | **43 KB** |
| CSS | 42 KB | **13 KB** |
| Fontes (Google) | 54 KB | 54 KB |
| **Total** | **~620 KB** | **181 KB** |

**A mesa 3D é outra conta**: os `.glb` do elenco são o download dominante — um
por adversário na tela. Em 08/09/2026 uma varredura achou duas gorduras:

- **`TANGENT`**: o gerador entrega os vértices intercalados com uma base de
  tangentes de 16 bytes, um terço de cada arquivo. Ela só serve para orientar o
  normal map; sem ela o three.js deriva a base na tela, que é o que a mesa já
  fazia em toda malha sem tangente. `scripts/enxuga_modelo.py` a remove, grava
  cada atributo em bloco justo (o intercalado guardava o espaço mesmo depois da
  remoção), passa o índice para 16 bits e copia adiante só as imagens que algum
  material aponta. Os oito foram de 13,3 MB para 10,2 MB — **1,7 MB → 1,3 MB
  por personagem**, sem diferença visível (conferido no provador, lado a lado).
  O `gltf-transform prune` NÃO serve para isso: ele apaga `Cabeca`, `MaoEsq`,
  `MaoDir` e `Assento` por "não referenciados".
- **O rosto 2D montado à toa**: cada assento pedia três SVGs do elenco e
  rasterizava três canvas de 640×520 (uns 4 MB de textura na placa por vizinho)
  para o rosto desenhado — que é o RESERVA e ia para o lixo assim que o `.glb`
  chegava. Hoje os oito têm modelo, então isso era desperdício em toda partida.
  Agora o rosto só é montado quando o modelo falha ou não existe.

O que ainda dá para ganhar, medido e não feito: `gltf-transform quantize` tira
mais 22% (1,34 MB → 1,05 MB), mas grava posição e normal em inteiros, e os
scripts Python do elenco leem esses atributos como float — mexer nisso pede
acertar `glb_utils` junto. E gzip nos `.glb` renderia 14%, ao custo de CPU e de
~9 MB de cache em memória no servidor.

**O que foi medido e NÃO compensou**, para ninguém refazer a conta:

- **Converter o elenco para raster no tamanho de uso.** A figura a 112×224 em
  WebP dá 5,0 KB; a mesma em SVG enxuto e comprimido dá 3,2 KB — e continua
  nítida em qualquer tamanho. Para arte vetorial chapada, o vetor comprimido
  ganha do raster nesses tamanhos. O avatar repete o resultado.
- **Tirar pesos de fonte.** O Nunito do Google vem como **fonte variável**: um
  arquivo só de 38 KB serve todos os pesos, então pedir menos pesos não economiza
  nada. O que valia corrigir era outra coisa: o CSS usava `600`, que não estava
  na lista pedida, e o navegador caía no `700` — agora o CSS pede `700` direto, e
  o `500`, que era baixado sem uso, saiu.

### Salas

`makeCode` (4 letras, sem `I` nem `O`), `newRoom` (gera o QR), `hostOf`,
`sanitizeName`, `lobbyView`, `broadcastLobby`, `broadcastState`.

`comPresenca()` carimba `connected` em cada jogador antes de mandar a visão.
Presença é assunto da sala, não do motor — o `engine.js` não sabe de sockets e
por isso `viewFor` não devolve esse campo. Sem o carimbo, o cliente lia
`undefined` e marcava **todo adversário humano como "fora" o tempo todo**.

Antes de começar, `conferirBaralho()` recusa a partida no lobby quando o baralho
não comporta a mesa, com mensagem, em vez de deixar o motor barrar na rodada
mais apertada. `BOT_NAMES` tem oito nomes distintos, escolhidos pelo primeiro
livre, para não haver dois robôs homônimos numa mesa de 8.

`originFrom(req)` decide o endereço que vai no convite e no QR, nesta ordem:
`PUBLIC_URL` → cabeçalho `x-forwarded-host` (só com `TRUST_PROXY`) → `host` da
requisição → IP da rede local. Cada sala guarda por onde quem a criou chegou.

O **esquema** (http/https) é o único que vem do proxy mesmo sem `TRUST_PROXY`.
O risco que a flag guarda é o **host** forjado, que mandaria o convite para
outro domínio; o esquema não muda de destino — no máximo erra entre http e
https no mesmo endereço. Era exatamente o que acontecia no Render: site em
https, convite e QR saindo em http, porque o TLS termina no proxy e
`socket.encrypted` é falso do lado de cá. Coberto por
[`test/convite.mjs`](test/convite.mjs), que também confere que host forjado
continua ignorado.

`scheduleBots` agenda a próxima jogada de bot. Na vez deles a espera é de ~0,7 s — ou
**2,2 s quando há carta comprável**, para dar tempo do humano pedir. O timer tem uma
**chave de momento** (`gameSeq:rodada:turno:fase:…`): mensagens repetidas de cliente
que não mudam o jogo não o reagendam — sem isso, spam de `claim`/`unclaim` seguraria o
bot para sempre e congelaria a partida. Ação sem evento também não gera rebroadcast.

**Jogador da vez caiu?** O jogo espera `AWAY_TAKEOVER_MS` (45 s) e passa a **jogar por
ele** com a heurística de bot (evento `away` avisa a mesa), em ritmo de bot dali em
diante, até ele reconectar — `attach` desarma a retomada. Sem isso, uma queda
definitiva na vez travaria a sala inteira até o GC de 30 min.

### Protocolo WebSocket

Cliente manda `{ t, … }`; servidor responde com `welcome`, `lobby`, `state`, `error`
ou `gone`.

| Mensagem | O que faz |
|---|---|
| `create` / `join` / `resume` | Cria sala, entra por código, ou reconecta por `playerId` + `token`. |
| `addBot` / `removeBot` / `start` | Só o anfitrião, e só antes de começar. |
| `action` | **Todo lance do jogo passa por aqui**, no formato `{ t: 'action', action: { a: … } }`. |
| `nextRound` / `playAgain` | Controles de sala do anfitrião. |

As jogadas dentro de `action` são `draw`, `claim`, `unclaim`, `baixar`, `layoff`,
**`swapJoker`**, `discard`, `meldDiscard` e `tomarSobra`. A troca do coringa entrou como mais uma
jogada no envelope existente, não como mensagem nova de topo — `nextRound` e
`playAgain` só são mensagens próprias por serem controles de sala, não lances.

```jsonc
{ "t": "action", "action": { "a": "swapJoker", "meldId": 101, "cardId": 42, "destMeldId": null } }
```

### Limpeza

Um `setInterval` apaga salas que passaram **30 minutos** sem nenhum humano conectado.

---

## Hospedar

O projeto já está pronto para subir: respeita `PORT`, escuta em `0.0.0.0`, declara
`engines.node` e encerra limpo em `SIGTERM`. Defina `PUBLIC_URL` com o endereço final
para o QR sair certo desde o primeiro acesso.

Plataformas com plano gratuito que sustentam WebSocket: **Render**, **Fly.io**,
**Railway** e **Koyeb**. Não servem Vercel, Netlify nem Cloudflare Pages — são
serverless e não seguram conexão de longa duração nem o estado das salas em memória.
