# Estrutura do projeto — Caçamba

Jogo de cartas multiplayer para celular: 7 rodadas de contratos (trincas e sequências),
2 a 4 jogadores, salas por código de 4 letras com QR para entrar pelo Wi-Fi local.
Quem faz **menos** pontos ganha.

**Stack:** Node.js puro em ESM, sem framework e sem build. Duas dependências: `ws`
(WebSocket) e `qrcode`. O front-end é HTML/CSS/JS vanilla servido estaticamente e
importa o motor de regras direto do servidor, em `/shared/engine.js`.

**Rodar:** `npm start` (sobe em `http://localhost:3000` e no IP da rede local).
**Testar:** `npm test` (22 testes do motor). O teste de integração é separado e exige
o servidor no ar: `node test/e2e.mjs`.

---

## Árvore

```
projeto-caçamba/
├── .claude/
│   └── launch.json          # config do servidor de dev (nome, comando, porta 3000)
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
    ├── engine.test.js       # 22 testes unitários do motor
    └── e2e.mjs              # integração: 2 jogadores contra o servidor real
```

## O que faz cada arquivo

| Arquivo | Linhas | O que faz |
|---|---:|---|
| [`shared/engine.js`](shared/engine.js) | 676 | Todas as regras do jogo, sem nenhum I/O: baralho, busca de contratos, encaixes, pontuação, estado da partida, visão por jogador e a heurística do bot. |
| [`server.js`](server.js) | 365 | Servidor HTTP dos arquivos estáticos + WebSocket. Guarda as salas, é o **juiz autoritativo** (só ele altera o estado) e dá ritmo humano aos bots. |
| [`public/client.js`](public/client.js) | 658 | Cliente: conecta e reconecta, desenha as telas (início, lobby, mesa), monta mão/jogos/descarte, traduz eventos em avisos e envia ações. Reimporta o motor só para **dicas de interface** (o que dá para baixar, o que encaixa). |
| [`public/index.html`](public/index.html) | 116 | Esqueleto das três telas (`screen-home`, `screen-lobby`, `screen-game`) e do modal genérico. |
| [`public/style.css`](public/style.css) | 340 | Tema único de feltro escuro, com variáveis CSS na `:root`; layout pensado para celular em pé. |
| [`public/icon.svg`](public/icon.svg) | 37 | Ícone: leque de três cartas sobre o feltro, com moldura dourada. Fundo ocupa o quadro todo, então funciona como ícone *maskable*. |
| [`public/manifest.json`](public/manifest.json) | 29 | Manifesto PWA: nome, `pt-BR`, `standalone`, retrato, cores casando com o `theme-color` do HTML. |
| [`test/engine.test.js`](test/engine.test.js) | 315 | Testes do motor com `node:test`, incluindo 30 partidas completas com RNG semeado (verifica que terminam, conservam as cartas e pontuam). |
| [`test/e2e.mjs`](test/e2e.mjs) | 122 | Dois jogadores roteirizados jogam 7 rodadas contra o servidor real por WebSocket, exercitando compra fora da vez. |
| [`package.json`](package.json) | 15 | Metadados, scripts `start`/`test` e as duas dependências. |
| [`.claude/launch.json`](.claude/launch.json) | 12 | Define o servidor de dev para a ferramenta de preview. |

---

## `shared/engine.js` — motor de regras

Módulo puro: recebe estado e devolve estado + lista de eventos. Nunca faz rede,
disco ou timers. É por isso que roda igual no servidor (como juiz) e no cliente
(como dica de interface).

### Constantes

| Export | O que é |
|---|---|
| `SUITS`, `SUIT_NAMES`, `SUIT_RED` | Naipes `♠ ♥ ♦ ♣`, nomes em português e quais são vermelhos. |
| `RANK_LABELS` | Rótulos `A, 2…10, J, Q, K`. |
| `CONTRACTS` | Os 7 contratos, de `2 trincas` até `3 sequências`. Cada um com `{ t, s, label }`. |
| `TOTAL_ROUNDS` | 7. |
| `DEFAULT_OPTS` | Regras da casa: 2 baralhos, castigo de 1 carta na compra fora da vez, máximo de 3 reembaralhamentos, 2 a 4 jogadores. |

### Cartas e baralho

| Função | O que faz |
|---|---|
| `rankLabel(rank)` · `suitLabel(suit)` · `cardLabel(card)` | Rótulos legíveis de valor, naipe e carta. |
| `cardPoints(card)` | Pontos da carta que sobra na mão: **A = 15**, **10/J/Q/K = 10**, demais **5**. |
| `cardValues(card)` | Valores possíveis: o Ás vale `[1, 14]` (A-2-3-4 ou J-Q-K-A) e **nunca vira a esquina** (K-A-2 não vale). |
| `buildDecks(numDecks)` | Monta N baralhos de 52 cartas, sem coringa, com `id` único por carta. |
| `shuffle(arr, rnd)` | Fisher-Yates, aceitando um RNG injetado. |
| `mulberry32(seed)` | RNG com semente, para testes reproduzíveis. |

### Busca de contrato

| Função | O que faz |
|---|---|
| `findContractMelds(cards, needT, needS)` | **Coração do motor.** Busca com retrocesso: as cartas contêm `needT` trincas e `needS` sequências *disjuntas*? Trinca = 3 cartas de mesmo valor em naipes diferentes; sequência = exatamente 4 cartas seguidas do mesmo naipe. Devolve `{ trincas, seqs }` ou `null`. Poda por `minRank`/`minKey` para não repetir combinações equivalentes. |

### Jogos na mesa

| Função | O que faz |
|---|---|
| `layoffOption(card, meld)` | A carta encaixa neste jogo? Em trinca exige naipe novo até fechar os 4; em sequência, só nas pontas. Devolve a descrição do encaixe ou `null`. |
| `removableCards(meld)` | Cartas que dá para tirar de um jogo com sobra para descartar: sequência com mais de 4 → só as pontas; trinca com mais de 3 → qualquer uma, desde que sobrem 3+ cartas com 3+ naipes. |

### Estado e consultas

| Função | O que faz |
|---|---|
| `createGame(players, opts)` | Cria o estado inicial: jogadores, `round: -1`, `phase: 'lobby'`. |
| `startRound(state)` | Começa a rodada: distribui `6 + round` cartas, vira o descarte, define quem abre. Ao passar da 7ª, muda para `gameEnd`. |
| `currentContract(state)` · `playerById` · `allMelds` · `meldById` | Consultas auxiliares. |
| `finalRanking(state)` | Ranking final, ordenado do menor para o maior número de pontos. |
| `viewFor(state, playerId)` | **Visão redigida por jogador**: manda a mão de quem pediu, mas dos outros só a contagem de cartas — e nunca o monte. É o que impede vazar informação pelo WebSocket. |

### Ações

Todas validam a vez e a fase, e lançam erro com `err.gameRule = true` (mensagem
já escrita em português, pronta para mostrar ao jogador). Devolvem uma lista de eventos.

Fases: `draw` (na vez, precisa puxar) → `play` (baixar / encaixar / descartar) →
`roundEnd` → próxima rodada → … → `gameEnd`.

| Ação | O que faz |
|---|---|
| `actClaim(state, playerId)` | Pede a carta do descarte fora da vez. Só vale enquanto o topo está "fresco". |
| `actUnclaim(state, playerId)` | Desiste do pedido. |
| `actDraw(state, playerId, source)` | Puxa do `'deck'` ou do `'discard'`. Ao puxar do monte, **primeiro resolve a compra fora da vez** de quem pediu (prioridade por assento após quem está na vez), entregando a carta + o castigo. |
| `actBaixar(state, playerId, cardIds?)` | Baixa o contrato inteiro de uma vez. Sem `cardIds`, o motor escolhe as cartas; com eles, valida a escolha manual. |
| `actLayoff(state, playerId, cardId, meldId)` | Encaixa uma carta em qualquer jogo da mesa — seu ou dos outros. Só depois de ter baixado. |
| `actDiscard(state, playerId, cardId)` | Descarta da mão e passa a vez. Mão vazia encerra a rodada ("bateu"). |
| `actMeldDiscard(state, playerId, meldId, cardId)` | Descarta tirando carta de um jogo **seu** com sobra, em vez da mão. |
| `actNextRound(state)` | Avança da tela de placar para a rodada seguinte. |
| `applyAction(state, playerId, action)` | Despachante genérico (`{ a: 'draw' \| 'baixar' \| … }`) que o servidor usa tanto para humanos quanto para bots. |

Internas relevantes: `ensureDeck` (reembaralha o descarte quando o monte acaba, até o
limite de 3, senão encerra a rodada sem vencedor), `endRound` / `endRoundDead`
(contam a mão de todo mundo), `advanceTurn`, `claimPriority`.

### Bot

| Função | O que faz |
|---|---|
| `botWantsCard(state, player, card)` | A carta avança o contrato de verdade (compara a cobertura antes e depois) ou encaixa em algum jogo da mesa? |
| `botPickDiscard(state, player)` | Escolhe o descarte pela utilidade de cada carta, protegendo jogos já formados. Depois de baixar, passa a largar as cartas mais caras. |
| `botNextAction(state, playerId)` | Devolve **uma** ação por chamada, para o servidor conseguir dar ritmo humano. |

---

## `server.js` — salas e juiz

Único dono do estado da partida: o cliente só pede, o servidor decide e reenvia a
visão de cada um. Nenhuma regra é confiada ao navegador.

### Estáticos

Serve `public/` e, como exceção estreita, apenas `shared/` da raiz — para o cliente
poder importar o motor. Normaliza o caminho contra travessia de diretório
(`../`) e responde com `Cache-Control: no-cache`.

### Salas

| Função | O que faz |
|---|---|
| `makeCode()` | Código de 4 letras, sem `I` nem `O` (confundem com 1 e 0). |
| `lanAddress()` | Descobre o IP IPv4 da rede local, para os celulares acharem o servidor. |
| `newRoom()` | Cria a sala e gera o QR code (`data:` URL) apontando para `/?sala=CÓDIGO`. |
| `hostOf(room)` | Quem manda na sala: o primeiro humano conectado. |
| `sanitizeName(name)` | Limpa e corta o nome em 16 caracteres. |
| `lobbyView` · `broadcastLobby` · `broadcastState` | Montam e distribuem as visões; `broadcastState` chama `viewFor` **uma vez por jogador**, então ninguém recebe a mão alheia. |

### Bots

| Função | O que faz |
|---|---|
| `scheduleBots(room)` | Agenda a próxima jogada de bot. Bots fora da vez pedem a carta recém-descartada quando ela ajuda; na vez deles, esperam ~0,7 s — ou **2,2 s quando há carta comprável**, para dar tempo do humano pedir. Reagenda a si mesma após cada ação. |

### Protocolo WebSocket

Cliente manda `{ t, … }`; servidor responde com `welcome`, `lobby`, `state`,
`error` ou `gone`.

| Mensagem | O que faz |
|---|---|
| `create` | Cria sala e entra como anfitrião. |
| `join` | Entra por código. Recusa sala cheia ou partida já começada. |
| `resume` | Reconecta por `playerId` + `token` (guardados no `localStorage`), sem perder o lugar. |
| `addBot` / `removeBot` | Só o anfitrião, e só antes de começar. |
| `start` | Cria a partida e começa a rodada 1. |
| `action` | Encaminha a jogada para `applyAction` e reemite o estado. |
| `nextRound` | Anfitrião avança do placar para a próxima rodada. |
| `playAgain` | Anfitrião recomeça a partida depois do `gameEnd`. |

Auxiliares: `attach` (liga o socket ao jogador e já manda o estado atual),
`currentRoom` / `currentPlayer` (validação), `send`.

Erros de regra viram mensagem amigável para o jogador; os demais são registrados no
console e viram um genérico *"Algo deu errado."*.

### Limpeza

Um `setInterval` de 10 em 10 minutos apaga salas que passaram **30 minutos** sem
nenhum humano conectado, cancelando o timer dos bots.
