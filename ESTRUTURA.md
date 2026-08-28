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
│   ├── index.html           # marcação das 3 telas + modais
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
| [`public/client.js`](public/client.js) | 1743 | Cliente: conecta e reconecta, desenha as telas (início, lobby, mesa), monta mão/jogos/descarte, traduz eventos em avisos e envia ações. Reimporta o motor só para **dicas de interface** — nunca reimplementa regra. |
| [`server.js`](server.js) | 526 | Servidor HTTP dos arquivos estáticos + WebSocket. Guarda as salas, é o **juiz autoritativo** (só ele altera o estado) e dá ritmo humano aos bots. |
| [`public/style.css`](public/style.css) | 961 | O salão, a mesa e as peças: variáveis de luz na `:root`, feltro em perspectiva, assentos, leque e animações. Mobile-first, com a mesa virando coluna centrada em tela grande. |
| [`test/engine.test.js`](test/engine.test.js) | 919 | Testes do motor com `node:test`, incluindo as regras de baixar (jogo extra, carta puxada da mesa) e 30 partidas completas com RNG semeado e a conferência de que cada rodada recomeça com o baralho inteiro. |
| [`test/e2e.mjs`](test/e2e.mjs) | 134 | **Três** jogadores roteirizados jogam 7 rodadas contra o servidor real por WebSocket. Três porque a compra fora da vez precisa de alguém que não seja nem quem está na vez nem quem descartou — e o teste falha se ninguém pedir carta, para essa cobertura não morrer em silêncio. |
| [`test/convite.mjs`](test/convite.mjs) | 64 | O link de convite atrás de proxy: sai em https quando o proxy diz https, continua http sem proxy, e ignora host forjado. |
| [`test/sair.mjs`](test/sair.mjs) | 100 | Dois humanos numa sala, um sai no meio da partida: confere o evento, a marca no assento, o robô assumindo, a vez seguindo e o token velho não voltando. |
| [`public/index.html`](public/index.html) | 284 | Esqueleto das quatro telas (`screen-home`, `screen-avatar`, `screen-lobby`, `screen-game`) e do modal genérico. |
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

**Carta que está sobrando na mesa.** Uma carta que sobra num jogo já baixado —
sequência com mais de 4, trinca com mais de 3, as mesmas de `removableCards` —
pode ser puxada para **fechar um jogo que desce na hora**, seu ou de qualquer
um. A regra do usuário é a condição: **só se for para baixar**, nunca para
ficar na mão. Vai no mesmo `actBaixar`, no argumento `sobra: { meldId, cardId }`:

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

## `shared/engine.js` — motor de regras

Módulo puro: recebe estado e devolve estado + lista de eventos. Nunca faz rede,
disco ou timers. É por isso que roda igual no servidor (como juiz) e no cliente
(como dica de interface).

### Cartas e baralho

| Função | O que faz |
|---|---|
| `isJoker(card)` | O único jeito de reconhecer um coringa. |
| `rankLabel` · `suitLabel` · `cardLabel` | Rótulos legíveis; `cardLabel` devolve 🃏 para coringa. |
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
| `removableCards(meld)` | Cartas que dá para tirar de um jogo com sobra: para descartar, ou para puxar e baixar na hora. **Nunca devolve coringa.** |
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
| `actDiscard` / `actMeldDiscard` | Descarta da mão, ou de um jogo seu com sobra, e passa a vez. |
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

A **mesa cresce para ocupar a folga da tela** (`flex: 1`). Antes ela tinha
altura de conteúdo e a mão era empurrada para o rodapé por `margin-top: auto`:
sobrava um vão morto entre as duas. E o tampo começa na altura do peito de quem
senta — `top: calc(var(--altura-assentos) - 114px)`, com a altura vindo do JS
que posiciona os assentos. O desconto é maior do que parece porque a inclinação
encurta o tampo: a borda de trás sobe menos do que o CSS pede. Sem ele, o
feltro descolava e os personagens ficavam flutuando no cenário.

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

### A sua mão

O leque é leque de verdade: as cartas se sobrepõem e giram em torno de um pivô
abaixo da tela (`transform-origin: 50% 190%`), como quem segura a mão. O passo
entre elas é **calculado** (`renderHand`), não fixo — a rodada 7 dá 12 cartas e
um passo fixo estouraria a largura do celular; com poucas cartas, o mesmo passo
deixaria o leque frouxo. A carta escolhida sai do leque e sobe, que é o que
devolve o alvo de toque confortável que a sobreposição tira.

**As suas mãos** (`#maos`) sobem dos cantos de baixo e entram por trás do leque:
o que fica à vista é o antebraço e a ponta dos dedos entre as cartas. São
desenhadas no `index.html`, não geradas em arquivo, porque a única coisa que
muda entre personagens é o **tom de pele** (`peleDe`, em `shared/elenco.js`) — a
construção é a mesma dos geradores do elenco: contorno de 5 na cor do fundo,
dedos em duas camadas (tinta por baixo, pele por cima) e halo quente por fora.
Ficam **absolutas**: não ocupam altura nenhuma do layout, que embaixo é o
espaço mais disputado da tela. Com mão grande a sobra nas pontas encolhe e o
leque cobre as próprias mãos — que é o que acontece de verdade.

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
saiu. A troca de **rosto** já está ligada (`trocaCara`) e espera a arte: quando
o elenco tiver expressões, basta listá-las em `EXPRESSOES`, no
[`shared/elenco.js`](shared/elenco.js), e o rosto passa a mudar junto com o
gesto. Enquanto não tiver, quem carrega a reação é o corpo e o balão.

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

Cada personagem sai de um script Python em
[`public/assets/personagens/_geradores/`](public/assets/personagens/_geradores/) —
os SVGs não são desenhados à mão. As decisões de arte (paleta, estaturas, o que
cada rosto tem de sinal dominante a 48 px) estão documentadas em
[`public/assets/personagens/README.md`](public/assets/personagens/README.md).

---

## `server.js` — salas e juiz

Único dono do estado da partida: o cliente só pede, o servidor decide e reenvia a
visão de cada um. Nenhuma regra é confiada ao navegador.

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

Serve `public/` e, como exceção estreita, apenas `shared/` da raiz — para o cliente
poder importar o motor. Normaliza o caminho contra travessia de diretório.

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
**`swapJoker`**, `discard` e `meldDiscard`. A troca do coringa entrou como mais uma
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
