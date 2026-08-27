# Estrutura do projeto — Caçamba

Jogo de cartas multiplayer para celular: 7 rodadas de contratos (trincas e sequências),
2 a 8 jogadores, salas por código de 4 letras com QR para entrar. Quem faz **menos**
pontos ganha.

**Stack:** Node.js puro em ESM, sem framework e sem build. Duas dependências: `ws`
(WebSocket) e `qrcode`. O front-end é HTML/CSS/JS vanilla servido estaticamente e
importa o motor de regras direto do servidor, em `/shared/engine.js`.

**Rodar:** `npm start`. **Testar:** `npm test` (38 testes do motor). O teste de
integração é separado e exige o servidor no ar: `node test/e2e.mjs`.

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
│   └── engine.js            # motor de regras puro (usado por servidor e cliente)
├── public/
│   ├── index.html           # marcação das 3 telas + modais
│   ├── client.js            # cliente: telas, mesa e conversa com o servidor
│   ├── style.css            # visual mobile-first, tema feltro escuro
│   ├── icon.svg             # ícone do app (também serve de favicon)
│   └── manifest.json        # manifesto PWA
└── test/
    ├── engine.test.js       # 38 testes unitários do motor
    └── e2e.mjs              # integração: 2 jogadores contra o servidor real
```

## O que faz cada arquivo

| Arquivo | Linhas | O que faz |
|---|---:|---|
| [`shared/engine.js`](shared/engine.js) | 1143 | Todas as regras do jogo, sem nenhum I/O: baralho com coringas, busca de contratos, encaixes, troca do coringa, pontuação, estado da partida, visão por jogador e a heurística do bot. |
| [`public/client.js`](public/client.js) | 1035 | Cliente: conecta e reconecta, desenha as telas (início, lobby, mesa), monta mão/jogos/descarte, traduz eventos em avisos e envia ações. Reimporta o motor só para **dicas de interface** — nunca reimplementa regra. |
| [`server.js`](server.js) | 480 | Servidor HTTP dos arquivos estáticos + WebSocket. Guarda as salas, é o **juiz autoritativo** (só ele altera o estado) e dá ritmo humano aos bots. |
| [`public/style.css`](public/style.css) | 416 | Tema único de feltro escuro, com variáveis CSS na `:root`; layout pensado para celular em pé. |
| [`test/engine.test.js`](test/engine.test.js) | 576 | Testes do motor com `node:test`, incluindo 30 partidas completas com RNG semeado e a conferência de que cada rodada recomeça com o baralho inteiro. |
| [`test/e2e.mjs`](test/e2e.mjs) | 122 | Dois jogadores roteirizados jogam 7 rodadas contra o servidor real por WebSocket, exercitando compra fora da vez. |
| [`public/index.html`](public/index.html) | 117 | Esqueleto das três telas (`screen-home`, `screen-lobby`, `screen-game`) e do modal genérico. |
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
| `buyPenalty` | `1` | Cartas de castigo de quem compra fora da vez. |
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

**Descartado, trava o meio.** Enquanto um coringa estiver descoberto no topo do
descarte, ninguém compra de lá — nem pela compra da vez, nem pela compra fora da vez
com carta de castigo. Assim que alguém descarta por cima, o monte volta ao normal.
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
| `removableCards(meld)` | Cartas que dá para tirar de um jogo com sobra para descartar. **Nunca devolve coringa.** |

### Descarte

| Função | O que faz |
|---|---|
| `topoDoDescarte(state)` | A carta de cima, ou `null`. |
| `descarteTravado(state)` | Há coringa descoberto no topo? |
| `podeComprarDoDescarte(state)` | Porta única usada pelos **dois** caminhos de compra: a normal da vez e a fora da vez com castigo. |

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
| `actDraw(state, playerId, source)` | Puxa do `'deck'` ou do `'discard'`. Ao puxar do monte, **primeiro resolve a compra fora da vez** de quem pediu. |
| `actBaixar(state, playerId, cardIds?)` | Baixa jogos **um de cada vez**: qualquer trinca/sequência completa que o contrato ainda peça desce sozinha (`player.baixados` acumula; `player.baixou` só vira `true` com o contrato inteiro — e é ele que libera o encaixe). Sem `cardIds`, baixa o máximo; com, exatamente a seleção. Recusa baixada que deixe a mão vazia sem completar o contrato. |
| `planBaixada(hand, remaining, cardIds?, opts?)` | O plano do `actBaixar`, compartilhado com a tela e o bot: quais jogos descem agora, maximizando cartas usadas dentro do que **falta** (`contractRemaining`). |
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

## A mesa no celular

O cliente troca de layout conforme o tamanho da mesa, em `renderOpponents`:

| Adversários | Layout | Por quê |
|---|---|---|
| até 3 | cartão largo, com os jogos baixados à vista | cabe na largura e mostra tudo |
| 4 ou mais | **grade compacta**, todos visíveis, detalhe sob toque | sete cartões largos pedem ~744px numa tela de 375 |

Na grade cabe o essencial de relance — nome, cartas na mão, progresso do
contrato (`2/3`), quem pediu a carta, quem está fora e quantos jogos tem. Os
jogos baixados saem do bloco e vão para o toque (`mostraOponente`), o que não
custa jogabilidade: para encaixar carta, os jogos dos outros já aparecem na
fileira de baixo junto com os seus.

`avisaAdversariosForaDaVista` fica como rede de segurança. Com a grade todos
cabem, mas nome muito longo ou tela muito estreita ainda podem estourar a
largura — e então ela avisa quantos ficaram fora e rola até quem está na vez,
para o aviso "Vez de Fulano" nunca apontar para alguém invisível. Fica dormente
quando tudo cabe.

O limite de quando trocar está em `COMPACTO_A_PARTIR_DE`, no cliente.

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
`PUBLIC_URL` → cabeçalhos `x-forwarded-host` / `x-forwarded-proto` → IP da rede local.
Cada sala guarda por onde quem a criou chegou.

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
