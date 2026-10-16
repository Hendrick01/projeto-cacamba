# Proposta — um jogo de construir e trocar, com a mecânica do Catan e cara própria

Pesquisa de 15/10/2026. **Documento interno**: fica na raiz do repositório (que é
privado), fora de `public/`, e não deve virar texto do jogo nem de divulgação. A
tabela de correspondência abaixo existe para nós; o jogo publicado não fala em
Catan em lugar nenhum.

> Não sou advogado. A parte jurídica abaixo é um resumo do que a lei e alguns
> casos conhecidos dizem, para orientar o desenho. Antes de lançar com loja e
> skins, vale uma consulta rápida com advogado de propriedade intelectual e uma
> busca do nome escolhido no INPI.

---

## 1. O que pode e o que não pode ser aproveitado

| Pode usar (é regra, não é obra) | Não pode copiar (é obra ou marca) |
|---|---|
| Tabuleiro de hexágonos, 2 dados, produção por número sorteado | O nome **Catan** e derivados (Colonos, Colonizadores, Descobridores, Settlers) — no nome, na descrição, nas palavras-chave da loja e em anúncio do tipo "parecido com Catan" |
| Cinco recursos, custos de construção, troca 4:1 / 3:1 / 2:1 | A arte: ilustração das peças, desenho das cartas, ícones de recurso, as fichas numeradas como elas são |
| O ladrão, o descarte no 7, as cartas de desenvolvimento e suas quantidades | O texto do manual e do almanaque (nem traduzido) |
| Estrada mais longa, maior exército, 10 pontos | Os nomes das cartas e títulos: Cavaleiro, Construção de Estradas, Ano de Fartura, Monopólio (também é marca da Hasbro), Ladrão, Estrada Mais Longa, Maior Exército, e as traduções brasileiras deles |
| Colocação inicial em "cobra", regra de distância | O "conjunto-imagem": ilha cercada de mar, peças de madeira com aquele formato, aquele jogo de cores dos jogadores |

**Por quê:**

- **Brasil.** A Lei 9.610/98, art. 8º, II, tira da proteção de direito autoral
  "os esquemas, planos ou regras para realizar atos mentais, jogos ou negócios".
  A regra é livre; a expressão (arte, texto, desenho) é protegida.
- **Marca e conjunto-imagem.** "Catan" é marca, licenciada no Brasil pela Devir.
  Imitar a aparência a ponto de confundir o jogador cai em concorrência desleal
  (Lei 9.279/96, art. 195, III). O STJ pede que o dono prove que a aparência é
  distintiva e que houve confusão — quanto mais longe a nossa cara estiver da
  deles, menor o risco.
- **EUA (se o app for para as lojas de fora).** Em *DaVinci v. Ziko* (2016) um
  jogo mecanicamente idêntico ao Bang!, com tema e arte próprios, foi julgado
  legal. Em *Tetris v. Xio* (2012) o clone perdeu porque copiou o visual — e a
  própria intenção declarada de "copiar o máximo que a lei permitisse" pesou
  contra. *Spry Fox v. 6waves* (2012): clone próximo demais em tudo pode infringir
  mesmo com outro nome.
- **Na prática.** Em 2011 os advogados do Catan pressionaram um app Android de fã
  (Island Settlers) até o autor desistir, mesmo com a alegação sendo discutível.
  O colonist.io, que roda há anos, usa nome, arte e símbolos próprios. Ou seja: o
  problema real não é a regra, é o nome, a arte e a divulgação — e como o projeto
  vende skins, vale ser mais cuidadoso que um projeto de fã.

---

## 2. A ideia: **Puxadinho**

Tema de obra, de bairro. Cada jogador é um mestre de obras levantando casas e
prédios num loteamento novo. Combina com a casa (o jogo-mãe já se chama
**Caçamba**), é brasileiro, tem humor, e foge da cara de "ilha sendo
colonizada", que é justamente a identidade do Catan.

Não achei jogo publicado com esse nome, mas a busca precisa ser feita no INPI
antes de fechar. Nomes reserva: **Loteamento**, **Mãos à Obra**, **Bairro Novo**.

### Tabela de correspondência (só para nós)

Os nomes do Catan na primeira coluna estão em tradução livre; servem para
identificar a peça, não para conferir com a edição brasileira.

**O tabuleiro**

| No Catan | No Puxadinho | Qtd. | Produz |
|---|---|---:|---|
| Colinas | **Pedreira** | 3 | Pedra |
| Floresta | **Areal** | 4 | Areia |
| Pasto | **Olaria** | 4 | Tijolo |
| Campo | **Cimenteira** | 4 | Cimento |
| Montanha | **Ferro-velho** | 3 | Ferro |
| Deserto | **Prefeitura** (não produz; o fiscal começa lá) | 1 | — |
| Mar com portos | **Avenida em volta do bairro**, com revendas | — | — |
| Porto 3:1 (4) | **Revenda geral** — 3 de um material por 1 de outro | 4 | |
| Porto 2:1 (5) | **Revenda especializada** — 2 daquele material por 1 | 5 | |
| Banco 4:1 | **Fornecedor** — 4 por 1, sempre | | |

A troca de nomes dos recursos foi feita **pela função**, não pela aparência, para
o equilíbrio continuar idêntico:

| Recurso no Catan | Onde ele entra | No Puxadinho | Por que encaixa |
|---|---|---|---|
| Tijolo | rua, casa | **Pedra** | calçamento e alicerce |
| Madeira | rua, casa | **Areia** | calçamento e reboco |
| Lã | casa, carta | **Tijolo** | parede |
| Trigo | casa, prédio (2), carta | **Cimento** | vai em tudo |
| Minério | prédio (3), carta | **Ferro** | vergalhão de prédio |

Assim os custos ficam com sentido de obra de verdade:

| Construção | Custo | Pontos | Peças por jogador |
|---|---|---:|---:|
| **Rua** (estrada) | Pedra + Areia | — | 15 |
| **Casa** (aldeia) | Pedra + Areia + Tijolo + Cimento | 1 | 5 |
| **Prédio** (cidade; sobe em cima de uma casa) | 3 Ferro + 2 Cimento | 2 | 4 |
| **Carta de Obra** (desenvolvimento) | Ferro + Tijolo + Cimento | — | — |

**O fiscal (o ladrão)**

- **Dia de fiscalização** (tirar 7 nos dados): ninguém produz; quem tem mais de 7
  cartas na mão perde metade, arredondado para baixo ("material apreendido").
- Quem tirou o 7 manda o **fiscal** para outro terreno. O terreno fica
  **embargado** (não produz enquanto ele estiver lá), e o jogador pega 1 material
  ao acaso de um vizinho que tenha casa ou prédio naquele terreno.

**As 25 Cartas de Obra (cartas de desenvolvimento)**

| No Catan | No Puxadinho | Qtd. | Efeito (igual) |
|---|---|---:|---|
| Cavaleiro | **Mestre de Obras** | 14 | move o fiscal e pega 1 material de um vizinho do terreno |
| Construção de Estradas | **Mutirão** | 2 | constrói 2 ruas de graça |
| Ano de Fartura | **Achado na Caçamba** | 2 | pega 2 materiais quaisquer do fornecedor |
| Monopólio | **Arremate** | 2 | escolhe um material; todos entregam todo o que têm dele |
| Ponto de Vitória | **Obra Pública**: Praça, Escola, Posto de Saúde, Quadra, Creche | 5 | 1 ponto escondido |

**Títulos de 2 pontos**

| No Catan | No Puxadinho | Como ganha |
|---|---|---|
| Estrada Mais Longa | **Avenida Principal** | 5+ ruas seguidas; perde para quem fizer uma maior |
| Maior Exército | **Maior Equipe** | 3+ Mestres de Obras jogados; perde para quem jogar mais |

---

## 3. As regras, inteiras, já com os nomes novos

Este é o comportamento que o motor tem de reproduzir. Foi conferido com o manual
da 5ª/6ª edição (ver fontes).

**Montagem.** 19 terrenos sorteados em forma de hexágono (3-4-5-4-3), Prefeitura
incluída. 18 plaquinhas de número nos terrenos que produzem: um 2, um 12, dois de
cada um de 3, 4, 5, 6, 8, 9, 10 e 11. Nunca há 7. As 9 revendas na avenida em
volta. O fiscal começa na Prefeitura.

**Colocação inicial ("cobra").** Sorteia quem começa. Na ida, cada um põe 1 casa e
1 rua encostada, em ordem. Na volta, na ordem contrária, cada um põe a 2ª casa e
a 2ª rua (não precisa ligar com a 1ª). Cada um recebe 1 material de cada terreno
em volta da **2ª** casa. Quem pôs a última casa joga primeiro.

**Regra de distância.** Casa só em esquina livre cujas 3 esquinas vizinhas
estejam vazias (de qualquer jogador, inclusive o próprio). Depois da colocação
inicial, a casa tem de encostar numa rua sua.

**A vez.** (1) Rola os dois dados: todo terreno com aquele número produz — 1
material por casa, 2 por prédio — para todo mundo, menos o terreno embargado.
(2) Troca. (3) Constrói. Troca e construção podem se misturar na mesma vez.

- **Troca entre jogadores:** só na vez de alguém, e só com o jogador da vez. Não
  vale trocar material igual por igual (3 ferros por 1 ferro). Carta de Obra não
  se troca nem se dá.
- **Troca com o fornecedor:** 4:1 sempre; 3:1 com casa/prédio numa revenda
  geral; 2:1 do material da revenda especializada onde se tem casa/prédio.
- **Fornecedor sem estoque:** se não der para pagar todo mundo de um material,
  ninguém recebe aquele material (a não ser que só um jogador tenha direito a
  ele — esse leva o que sobrou).
- **Prédio** sobe em cima de uma casa; a casa volta para o estoque do jogador.

**Cartas de Obra.** Uma por vez, em qualquer momento da própria vez, **inclusive
antes de rolar os dados**. Não se joga a carta comprada na mesma vez — menos a
Obra Pública, que nunca é "jogada": fica escondida e só aparece para fechar os
pontos.

**Avenida Principal.** Conta a maior sequência contínua de ruas do jogador. Uma
casa ou prédio de **outro** jogador numa esquina corta a sequência. Se ao cortar
houver empate na maior, o título fica sem dono até alguém voltar a ter a maior
sozinho.

**Vitória.** 10 pontos, contados **na própria vez**. Casa 1, prédio 2, Avenida
Principal 2, Maior Equipe 2, cada Obra Pública 1. Todo mundo começa com 2 pontos
(as duas casas).

---

## 4. Além dos nomes: o que faz ser nosso

Trocar só os nomes deixa o jogo legalmente defensável, mas parecendo cópia. O que
eu faria, em ordem de importância:

**Obrigatório (não muda regra nenhuma):**

1. **Cara de mapa de bairro visto de cima**, não de ilha. Os hexágonos viram
   quadras com rua em volta; a borda é uma avenida, não o mar. Cores de jogador
   próprias da casa, não o vermelho/azul/laranja/branco das peças de lá.
2. **Plaquinha de número com a nossa linguagem.** A chance de cada número
   (2 e 12 = 1 de 36, … 6 e 8 = 5 de 36) mostrada como barrinha ou "placa de
   lote", não como o disco bege com bolinhas e números vermelhos.
3. **Manual escrito do zero**, no tom das regras do Caçamba — nunca traduzido
   nem parafraseado do oficial.
4. **Divulgação sem "Catan".** Nada de "o Catan brasileiro", "igual Catan",
   nem palavra-chave de loja com o nome.

**Recomendado (aproveita o que a casa já tem):**

5. **Relógio por vez**, como no Bazuca — no celular, a partida de Catan cansa
   porque alguém sempre demora.
6. **Robôs preenchendo cadeira vazia**, com os três níveis que já existem. O
   jogo original pede 3 ou 4 pessoas; com robô dá para começar com 1 humano.
7. **Proposta de troca na tela**, para todos verem e aceitarem com um toque (a
   regra continua: só com o jogador da vez).

**Opcional (aí já é regra da casa — escolha sua):**

8. **Fiscal camarada:** não pode embargar terreno de quem tem 2 pontos ou menos.
   É uma regra da casa muito usada, deixa o começo menos cruel.
9. **Partida curta:** vitória com 8 pontos em vez de 10, para sessão de celular.
10. **Dado sem azar:** um baralho de 36 cartas com todas as somas dos dois dados,
    embaralhado — tira as sequências absurdas de "ninguém tira 8 há 20 vezes".
11. **A caçamba de verdade:** o material perdido no Dia de Fiscalização vai para
    uma pilha "caçamba" no canto da mesa, e o **Achado na Caçamba** tira dela em
    vez do fornecedor (o que faltar, do fornecedor). A cada novo 7 o caminhão
    recolhe a caçamba anterior e o material volta ao fornecedor — sem isso ele
    saía de circulação e 11 de 80 partidas de teste travaram. Liga o nome do
    jogo à casa; muda pouco o equilíbrio, mas muda — por isso é opcional.

---

## 5. Como entraria no projeto

Encaixa no mesmo esquema dos outros modos (`MODOS` em `server.js`):

- `shared/puxadinho.js` — o motor puro, com a mesma interface dos outros
  (`createGame`, `startRound`, `applyAction`, `viewFor`, `botNextAction`,
  `FASES_DE_VEZ`, `MIN`, `MAX`). O que dá trabalho de verdade: coordenadas de
  hexágono com esquinas e lados, o cálculo da Avenida Principal (busca em
  profundidade, cortada por casa alheia), a fase de descarte do 7 que é de vários
  jogadores ao mesmo tempo, e a informação escondida (cartas de obra, e qual
  material foi roubado).
- `public/puxadinho-mesa.js` + `puxadinho.css` — o tabuleiro 2D em SVG, toque na
  esquina para casa, no lado para rua; painel de troca.
- `test/puxadinho.test.js` e `test/puxadinho.mjs`.
- A 3D depois, como nos outros modos.

É bem maior que os modos de carta. Por etapas: motor e testes → mesa 2D → robôs
→ troca entre jogadores → 3D.

## 6. O que precisa da sua decisão

1. O tema e o nome (Puxadinho, ou um dos reservas, ou outro tema).
2. Quantos jogadores: 3–4 como o original, ou já pensar em 5–6 (mapa maior).
3. Quais dos itens 8 a 11 entram.
4. Se a troca entre jogadores fica livre (negociação aberta) ou só com o
   fornecedor no começo, para sair mais rápido.

---

## Fontes

- Regras e componentes: [RulesPal — Catan](https://rulespal.com/catan/rulebook),
  [Catan 5ª edição (PDF)](https://world-of-board-games.com.sg/docs/Catan-5ed.pdf),
  [GameRules — Catan](https://gamerules.com/rules/catan-rules/)
- Lei 9.610/98: [texto na Câmara](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.pdf)
- Conjunto-imagem no Brasil: [Migalhas](https://www.migalhas.com.br/depeso/53523/a-protecao-juridica-do-conjunto-imagem-ou-trade-dress),
  [STJ exige perícia (Jus)](https://jus.com.br/artigos/72085/trade-dress-e-preciso-pericia-para-verificar-imitacao-decide-quarta-turma-do-stj)
- DaVinci v. Ziko: [TechRaptor](https://techraptor.net/content/game-mechanics-arent-protected-copyright-according-texas-court-ruling),
  [Games Law Summit (PDF)](https://fkks.com/uploads/news/Games-Law-Summit-Journal_Issue-1_2017.04.27_KANE.pdf)
- Tetris v. Xio e Spry Fox: [Wikipedia — Tetris v. Xio](https://en.wikipedia.org/wiki/Tetris_Holding,_LLC_v._Xio_Interactive,_Inc.),
  [Wikipedia — Spry Fox v. Lolapps](https://en.wikipedia.org/wiki/Spry_Fox,_LLC_v._Lolapps,_Inc.)
- Clones e fiscalização: [IP Bytes (Loyola) — colonist.io](https://blogs.luc.edu/ipbytes/stealing-settlers-how-ip-factors-into-online-games/),
  [Techdirt — Island Settlers (2011)](https://www.techdirt.com/2011/02/22/how-lawyers-settlers-catan-abuse-ip-law-to-take-down-perfectly-legal-competitors/),
  [Pioneers (ex-Gnocatan)](https://pio.sourceforge.net/manual/pr01.html)
- Catan no Brasil (Devir): [catálogo Devir (PDF)](https://devir.com.br/wp-content/uploads/2026/04/Novo-Catalogo-Essenciais.pdf),
  [+4 a gente não esquece](https://maisquatro.substack.com/p/um-4-a-gente-nao-esquece)
