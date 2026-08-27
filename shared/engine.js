// ============================================================================
// Caçamba — motor de regras (puro, sem I/O)
// Usado pelo servidor (juiz autoritativo) e pelo cliente (dicas de interface).
// ============================================================================

export const SUITS = ['♠', '♥', '♦', '♣']; // ♠ ♥ ♦ ♣
export const SUIT_NAMES = ['espadas', 'copas', 'ouros', 'paus'];
export const SUIT_RED = [false, true, true, false];
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Coringa. Quatro por baralho (52 cartas + 4 coringas = 56).
// O coringa é representado com rank 0 e suit -1 justamente para nunca casar
// com as buscas por valor (1..13) ou naipe (0..3): ele só entra onde houver
// tratamento explícito. Vale APENAS em sequência — trinca exige cartas reais.
export const JOKERS_PER_DECK = 4;
export const JOKER_LABEL = '🃏';
// Quantos coringas uma mesma sequência pode conter. A sequência tem exatamente
// 4 cartas: com 2 coringas metade do jogo seria curinga, o que esvazia a
// dificuldade do contrato. Regra da casa, fácil de afrouxar aqui.
export const MAX_JOKERS_PER_SEQ = 1;
// Troca do coringa pela carta real: quem tem a carta que o coringa representa
// pode resgatá-lo, e o coringa VEM PARA A MÃO — pode ser guardado para depois.
// Ligando esta constante, a troca vira atômica: o coringa sai da sequência e
// já tem de ser encaixado na mesma ação, sem passar pela mão.
export const SWAP_JOKER_SAME_TURN = false;
// Coringa descartado trava o monte de descarte enquanto estiver descoberto no
// topo: ninguém compra do meio até alguém descartar por cima. É a jogada
// defensiva de quem está com um coringa caro na mão e quer se livrar dele sem
// presentear ninguém.
export const CORINGA_DESCARTADO_TRANCA = true;

export function isJoker(card) { return !!card && card.joker === true; }

// Contratos das 7 rodadas: t = trincas, s = sequências. Cartas da rodada = 6 + índice.
export const CONTRACTS = [
  { t: 2, s: 0, label: '2 trincas' },
  { t: 1, s: 1, label: '1 trinca + 1 sequência' },
  { t: 0, s: 2, label: '2 sequências' },
  { t: 3, s: 0, label: '3 trincas' },
  { t: 2, s: 1, label: '2 trincas + 1 sequência' },
  { t: 1, s: 2, label: '2 sequências + 1 trinca' },
  { t: 0, s: 3, label: '3 sequências' },
];

export const TOTAL_ROUNDS = CONTRACTS.length;

// Regras da casa ajustáveis (o dono da sala poderá mudar no futuro)
export const DEFAULT_OPTS = {
  decks: 2,          // 2 baralhos
  jokersPerDeck: JOKERS_PER_DECK, // coringas por baralho
  buyPenalty: 1,     // quem compra fora da vez leva +1 carta do monte
  maxReshuffles: 3,  // monte esgotado 3x na rodada → rodada termina sem vencedor
  // Rede de segurança: se todo mundo só pegar do descarte, o monte nunca
  // esgota e maxReshuffles nunca é atingido. Rodadas normais ficam bem abaixo
  // de 60 turnos; este teto só existe para a rodada não poder ficar eterna.
  maxTurnsPerRound: 300,
  minPlayers: 2,
  maxPlayers: 4,
};

export function rankLabel(rank) { return RANK_LABELS[rank - 1] || ''; }
export function suitLabel(suit) { return SUITS[suit] || ''; }
export function cardLabel(card) {
  return isJoker(card) ? JOKER_LABEL : rankLabel(card.rank) + SUITS[card.suit];
}

// Pontos das cartas que sobram na mão: valor de face. 2 vale 2, 10 vale 10,
// J=11, Q=12, K=13. O Ás vale 15 fixo, mesmo tendo jogado como 1 ou como 14.
// O coringa vale 20.
export function cardPoints(card) {
  if (isJoker(card)) return 20;
  if (card.rank === 1) return 15;
  return card.rank;
}

// Ás vale 1 (A-2-3-4) ou 14 (J-Q-K-A); nunca "vira a esquina" (K-A-2 não vale).
// O coringa não tem valor próprio: quem decide o que ele representa é a
// sequência em que ele entra, então aqui ele não casa com nada.
export function cardValues(card) {
  if (isJoker(card)) return [];
  return card.rank === 1 ? [1, 14] : [card.rank];
}

export function buildDecks(numDecks, jokersPerDeck = JOKERS_PER_DECK) {
  const cards = [];
  let id = 1;
  for (let d = 0; d < numDecks; d++) {
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) {
        cards.push({ id: id++, rank, suit });
      }
    }
    for (let j = 0; j < jokersPerDeck; j++) {
      cards.push({ id: id++, rank: 0, suit: -1, joker: true });
    }
  }
  return cards;
}

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// RNG com semente (para testes reproduzíveis)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// Busca de contrato: a mão contém `needT` trincas e `needS` sequências
// disjuntas? (trinca = 3 cartas de mesmo valor e naipes diferentes;
// sequência = exatamente 4 cartas seguidas do mesmo naipe)
// Busca com retrocesso; mãos têm no máximo ~15 cartas, é rápido.
// ============================================================================

export function findContractMelds(cards, needT, needS) {
  const used = new Set();
  const resT = [];
  const resS = [];

  function trincaCandidates(minRank) {
    const out = [];
    for (let r = minRank; r <= 13; r++) {
      const bySuit = [null, null, null, null];
      for (const c of cards) {
        if (c.rank === r && !used.has(c.id) && !bySuit[c.suit]) bySuit[c.suit] = c;
      }
      const present = [0, 1, 2, 3].filter((s) => bySuit[s]);
      if (present.length < 3) continue;
      for (let i = 0; i < present.length; i++)
        for (let j = i + 1; j < present.length; j++)
          for (let k = j + 1; k < present.length; k++)
            out.push({ rank: r, cards: [bySuit[present[i]], bySuit[present[j]], bySuit[present[k]]] });
    }
    return out;
  }

  // Coringas livres no momento. Só servem para sequência: a trinca acima
  // percorre ranks 1..13 e o coringa tem rank 0, então nunca casa lá.
  function freeJokers() {
    const out = [];
    for (const c of cards) if (isJoker(c) && !used.has(c.id)) out.push(c);
    return out;
  }

  function seqCandidates(minKey) {
    const puras = [];   // sequências só com cartas reais
    const comJoker = []; // sequências que gastam coringa
    const jokers = freeJokers();
    const maxJokers = Math.min(jokers.length, MAX_JOKERS_PER_SEQ);
    // Máscaras de posições cobertas por coringa (bit i = posição i da janela).
    // O coringa também pode cobrir um valor que EXISTE como carta real: a
    // carta liberada pode ser exatamente a que outra sequência precisa (ex.:
    // 3♥ 4♥ 5♥ 5♥ 6♥ 6♥ + 2 coringas fecha duas sequências de copas). Por
    // isso geramos todas as variantes, não só a gulosa que tapa buraco.
    const masks = [0];
    for (let m = 1; m < 16; m++) {
      let bits = 0;
      for (let b = 0; b < 4; b++) if (m & (1 << b)) bits++;
      if (bits <= maxJokers) masks.push(m);
    }
    for (let s = 0; s < 4; s++) {
      const byVal = {};
      for (const c of cards) {
        if (isJoker(c) || c.suit !== s || used.has(c.id)) continue;
        for (const v of cardValues(c)) if (!byVal[v]) byVal[v] = c;
      }
      for (let start = 1; start <= 11; start++) {
        const key = s * 16 + start;
        if (key < minKey) continue;
        for (const mask of masks) {
          const run = [];
          let usados = 0;
          let ok = true;
          for (let i = 0; i < 4; i++) {
            const v = start + i;
            if (mask & (1 << i)) { run.push(jokers[usados]); usados++; continue; }
            if (byVal[v]) run.push(byVal[v]);
            else { ok = false; break; }
          }
          if (!ok) continue;
          (usados === 0 ? puras : comJoker).push({ key, suit: s, start, cards: run });
        }
      }
    }
    // Primeiro as puras: assim o solver só queima coringa quando precisa.
    return puras.concat(comJoker);
  }

  function solve(tLeft, sLeft, minRank, minKey) {
    if (tLeft === 0 && sLeft === 0) return true;
    if (tLeft > 0) {
      for (const t of trincaCandidates(minRank)) {
        t.cards.forEach((c) => used.add(c.id));
        resT.push(t.cards);
        if (solve(tLeft - 1, sLeft, t.rank, minKey)) return true;
        resT.pop();
        t.cards.forEach((c) => used.delete(c.id));
      }
      return false;
    }
    for (const q of seqCandidates(minKey)) {
      q.cards.forEach((c) => used.add(c.id));
      resS.push({ cards: q.cards, start: q.start });
      if (solve(0, sLeft - 1, 1, q.key)) return true;
      resS.pop();
      q.cards.forEach((c) => used.delete(c.id));
    }
    return false;
  }

  return solve(needT, needS, 1, 0) ? { trincas: resT, seqs: resS } : null;
}

// O que dá para baixar AGORA? Baixa-se um jogo de cada vez: qualquer conjunto
// de trincas/sequências completas que caiba no que ainda falta do contrato.
// Sem `cardIds`, propõe o máximo que a mão alcança; com `cardIds`, a seleção
// tem que ser usada inteira. Nunca propõe baixada que deixe a mão vazia sem
// completar o contrato — sem descarte possível e sem poder bater, o jogador
// ficaria preso (a menos que `permitirMaoVazia` seja ligado, usado pela tela
// só para explicar o porquê ao jogador).
// Devolve { trincas, seqs, a, b, completa } ou null.
export function planBaixada(hand, remaining, cardIds = null, { permitirMaoVazia = false } = {}) {
  const temSelecao = !!(cardIds && cardIds.length);
  const pool = temSelecao ? hand.filter((c) => cardIds.includes(c.id)) : hand;
  if (temSelecao && pool.length !== cardIds.length) return null; // carta fora da mão
  const planos = [];
  for (let a = remaining.t; a >= 0; a--) {
    for (let b = remaining.s; b >= 0; b--) {
      if (a === 0 && b === 0) continue;
      const size = a * 3 + b * 4;
      if (temSelecao ? size !== pool.length : size > pool.length) continue;
      planos.push({ a, b, size });
    }
  }
  planos.sort((x, y) => y.size - x.size); // baixa o máximo possível primeiro
  for (const { a, b, size } of planos) {
    const completa = a === remaining.t && b === remaining.s;
    if (!completa && !permitirMaoVazia && size === hand.length) continue;
    const res = findContractMelds(pool, a, b);
    if (!res) continue;
    return { ...res, a, b, completa };
  }
  return null;
}

// ============================================================================
// Jogos na mesa (melds) e encaixes
// ============================================================================

let meldSeq = 1;

function makeTrincaMeld(cards, ownerId) {
  return { id: meldSeq++, type: 't', rank: cards[0].rank, cards: cards.slice(), ownerId };
}

function makeSeqMeld(cards, start, ownerId) {
  const values = cards.map((_, i) => start + i);
  // O naipe vem da primeira carta REAL: se o coringa abrir a sequência,
  // cards[0].suit seria -1 e nenhuma carta conseguiria mais encaixar aqui.
  const real = cards.find((c) => !isJoker(c));
  return { id: meldSeq++, type: 's', suit: real ? real.suit : -1, cards: cards.slice(), values, ownerId };
}

// Uma carta encaixa neste jogo? Retorna descrição do encaixe ou null.
// `coringasRemovidos` permite perguntar "e se eu tirasse N coringas daqui
// antes?" — é o que a troca precisa para saber se o coringa resgatado cabe de
// volta na própria sequência de onde saiu, sem ter que mexer no estado antes
// de validar.
// `preferredEnd` ('lo'/'hi') escolhe a ponta quando as duas servem — o coringa
// entra em qualquer ponta, e até uma carta real pode servir nas duas (um Ás
// numa sequência de 2 a K). Sem preferência, mantém o padrão de sempre:
// coringa vai para a ponta alta, carta real para a primeira que couber.
export function layoffOption(card, meld, coringasRemovidos = 0, preferredEnd = null) {
  if (meld.type === 't') {
    // Trinca é só com carta real: o coringa vale apenas para sequência.
    if (isJoker(card) || card.rank !== meld.rank) return null;
    const suits = new Set(meld.cards.map((c) => c.suit));
    // Mantém naipes diferentes até completar os 4; depois libera repetição
    if (suits.has(card.suit) && suits.size < 4) return null;
    return { kind: 't' };
  }
  const lo = meld.values[0];
  const hi = meld.values[meld.values.length - 1];
  const opcoes = [];
  // Coringa da mão estica a sequência pela ponta, respeitando o limite do jogo.
  // Vem antes da checagem de naipe porque o coringa não tem naipe próprio.
  if (isJoker(card)) {
    if (meld.cards.filter(isJoker).length - coringasRemovidos >= MAX_JOKERS_PER_SEQ) return null;
    if (hi + 1 <= 14) opcoes.push({ kind: 's', end: 'hi', v: hi + 1 });
    if (lo - 1 >= 1) opcoes.push({ kind: 's', end: 'lo', v: lo - 1 });
  } else {
    if (card.suit !== meld.suit) return null;
    for (const v of cardValues(card)) {
      if (v === lo - 1 && v >= 1) opcoes.push({ kind: 's', end: 'lo', v });
      if (v === hi + 1 && v <= 14) opcoes.push({ kind: 's', end: 'hi', v });
    }
  }
  if (opcoes.length === 0) return null;
  if (preferredEnd) return opcoes.find((o) => o.end === preferredEnd) || null;
  return opcoes[0];
}

// Em quais pontas desta sequência a carta encaixa? ([], ['hi'], ['lo','hi']…)
// A tela usa para saber quando precisa perguntar a ponta ao jogador.
export function layoffEnds(card, meld, coringasRemovidos = 0) {
  if (meld.type !== 's') return [];
  return ['lo', 'hi'].filter((end) => layoffOption(card, meld, coringasRemovidos, end));
}

function applyLayoff(meld, card, opt) {
  if (opt.kind === 't') {
    meld.cards.push(card);
    return;
  }
  if (opt.end === 'lo') {
    meld.cards.unshift(card);
    meld.values.unshift(opt.v);
  } else {
    meld.cards.push(card);
    meld.values.push(opt.v);
  }
}

// Cartas que podem ser retiradas de um jogo com sobra para descarte:
// sequência com mais de 4 cartas → só as pontas; trinca com mais de 3 →
// qualquer uma, desde que sobrem 3+ cartas com 3+ naipes distintos.
export function removableCards(meld) {
  if (meld.type === 's') {
    if (meld.cards.length <= 4) return [];
    // O coringa nunca sai por aqui: a única porta de saída dele é a troca pela
    // carta real. Descartá-lo da ponta jogaria fora uma carta escassa e, pior,
    // colocaria um coringa no lixo para qualquer um comprar — furando a
    // exigência de ter exatamente a carta que ele representa.
    return [meld.cards[0], meld.cards[meld.cards.length - 1]].filter((c) => !isJoker(c));
  }
  if (meld.cards.length <= 3) return [];
  return meld.cards.filter((card) => {
    const rest = meld.cards.filter((c) => c.id !== card.id);
    return rest.length >= 3 && new Set(rest.map((c) => c.suit)).size >= 3;
  });
}

function removeFromMeld(meld, cardId) {
  const idx = meld.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) return null;
  const [card] = meld.cards.splice(idx, 1);
  if (meld.type === 's') meld.values.splice(idx, 1);
  return card;
}

// ============================================================================
// Estado da partida e ações
// Fases: 'draw' (na vez, precisa puxar) → 'play' (baixar/encaixar/descartar)
//        'roundEnd' → próxima rodada → ... → 'gameEnd'
// ============================================================================

export function createGame(players, opts = {}) {
  return {
    opts: { ...DEFAULT_OPTS, ...opts },
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: !!p.isBot,
      hand: [],
      melds: [],
      baixou: false,               // contrato COMPLETO na mesa
      baixados: { t: 0, s: 0 },    // jogos já baixados nesta rodada
      score: 0,
    })),
    round: -1,          // índice 0..6 (rodada 1..7)
    deck: [],
    discard: [],
    turn: 0,
    turnNo: 0,          // turnos já jogados na rodada; sobe a cada passagem de vez
    phase: 'lobby',
    discardFresh: false, // o topo do descarte acabou de ser descartado (comprável)
    claims: [],          // ids de quem pediu para comprar fora da vez
    reshuffles: 0,
    lastRound: null,     // { winnerId|null, scores: {pid: pts}, reason }
    rnd: opts.rnd || Math.random,
  };
}

export function currentContract(state) {
  return CONTRACTS[Math.max(0, state.round)];
}

// O que AINDA falta do contrato para este jogador (baixa-se um jogo por vez)
export function contractRemaining(state, player) {
  const ct = currentContract(state);
  if (!ct) return { t: 0, s: 0 }; // fim de jogo: não há contrato corrente
  return {
    t: Math.max(0, ct.t - player.baixados.t),
    s: Math.max(0, ct.s - player.baixados.s),
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

export function allMelds(state) {
  return state.players.flatMap((p) => p.melds);
}

export function meldById(state, meldId) {
  return allMelds(state).find((m) => m.id === meldId) || null;
}

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

export function startRound(state) {
  state.round++;
  if (state.round >= TOTAL_ROUNDS) {
    state.phase = 'gameEnd';
    return [{ e: 'gameEnd', ranking: finalRanking(state) }];
  }
  const cardsEach = 6 + state.round;
  // Rodada só de trincas (1ª e 4ª) não usa coringa: ele só vale em sequência,
  // então num contrato sem sequência seria carta morta de 20 pontos na mão.
  const ct = CONTRACTS[state.round];
  const jokers = ct.s > 0 ? state.opts.jokersPerDeck : 0;
  state.deck = shuffle(buildDecks(state.opts.decks, jokers), state.rnd);
  for (const p of state.players) {
    p.hand = [];
    p.melds = [];
    p.baixou = false;
    p.baixados = { t: 0, s: 0 };
  }
  for (let i = 0; i < cardsEach; i++) {
    for (const p of state.players) p.hand.push(state.deck.pop());
  }
  state.discard = [state.deck.pop()];
  state.turn = state.round % state.players.length;
  state.turnNo = 0;
  state.phase = 'draw';
  state.discardFresh = false; // carta virada do monte não é "comprável" fora da vez
  state.claims = [];
  state.reshuffles = 0;
  state.lastRound = null;
  return [{ e: 'roundStart', round: state.round, first: state.players[state.turn].id }];
}

function ensureDeck(state, events) {
  if (state.deck.length > 0) return true;
  if (state.discard.length <= 1) return false;
  if (state.reshuffles >= state.opts.maxReshuffles) return false;
  const top = state.discard.pop();
  state.deck = shuffle(state.discard, state.rnd);
  state.discard = [top];
  state.discardFresh = false;
  state.reshuffles++;
  events.push({ e: 'reshuffle' });
  return state.deck.length > 0;
}

function endRound(state, winnerId, reason, events) {
  const scores = {};
  for (const p of state.players) {
    const pts = p.hand.reduce((sum, c) => sum + cardPoints(c), 0);
    scores[p.id] = pts;
    p.score += pts;
  }
  state.phase = 'roundEnd';
  state.claims = [];
  state.discardFresh = false;
  state.lastRound = { winnerId, scores, reason };
  events.push({ e: 'roundEnd', winnerId, scores, reason, round: state.round });
  return events;
}

function endRoundDead(state, events) {
  // Monte e descarte esgotados sem vencedor: todos contam a mão
  return endRound(state, null, 'esgotado', events);
}

export function finalRanking(state) {
  return state.players
    .map((p) => ({ id: p.id, name: p.name, score: p.score }))
    .sort((a, b) => a.score - b.score);
}

export function topoDoDescarte(state) {
  return state.discard.length ? state.discard[state.discard.length - 1] : null;
}

// O MONTE DE DESCARTE INTEIRO fica travado enquanto um coringa estiver
// descoberto no topo: ninguém compra nada de lá — nem a carta do topo, nem as
// de baixo. Assim que alguém descarta por cima, o monte volta ao normal.
// Hoje só o topo é alcançável, então a distinção não muda o jogo; a regra está
// escrita no nível do monte para continuar valendo se um dia a compra chegar
// mais fundo.
export function descarteTravado(state) {
  const topo = topoDoDescarte(state);
  return CORINGA_DESCARTADO_TRANCA && !!topo && isJoker(topo);
}

// Vale para os DOIS caminhos de compra: a normal da vez e a fora da vez com
// carta de castigo.
export function podeComprarDoDescarte(state) {
  if (state.discard.length === 0) return false;
  return !descarteTravado(state);
}

// Ordem de prioridade para compra fora da vez: assentos após quem está na vez
function claimPriority(state) {
  const n = state.players.length;
  const order = [];
  for (let i = 1; i < n; i++) order.push(state.players[(state.turn + i) % n].id);
  return order.filter((id) => state.claims.includes(id));
}

// --- Ações -----------------------------------------------------------------

// Pedir para comprar o descarte fora da vez (quem está na vez tem preferência).
// Pedido que chega tarde demais — a vez já andou, ou até chegou em quem pediu —
// é ignorado sem erro: essas corridas são normais com toques simultâneos.
export function actClaim(state, playerId) {
  if (state.phase !== 'draw' || !state.discardFresh) return [];
  // Monte travado por coringa descoberto: nem vale registrar o pedido.
  if (!podeComprarDoDescarte(state)) return [];
  if (state.players[state.turn].id === playerId) return [];
  if (state.claims.includes(playerId)) return [];
  if (!playerById(state, playerId)) fail('Jogador desconhecido.');
  state.claims.push(playerId);
  return [{ e: 'claim', p: playerId }];
}

// Desistir do pedido. Só gera evento quando havia pedido de verdade — assim o
// servidor não é obrigado a rebroadcast (nem a reagendar bots) por spam de
// unclaim sem efeito.
export function actUnclaim(state, playerId) {
  if (!state.claims.includes(playerId)) return [];
  state.claims = state.claims.filter((id) => id !== playerId);
  return [{ e: 'unclaim', p: playerId }];
}

// Puxar carta (obrigatório na vez): 'deck' = monte, 'discard' = meio/descarte
export function actDraw(state, playerId, source) {
  if (state.phase !== 'draw') fail('Não é hora de puxar carta.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  const events = [];

  if (source === 'discard') {
    if (state.discard.length === 0) fail('O descarte está vazio.');
    if (!podeComprarDoDescarte(state)) fail('Tem coringa descoberto no meio: o monte está travado até alguém descartar por cima.');
    const card = state.discard.pop();
    player.hand.push(card);
    if (state.claims.length > 0) {
      events.push({ e: 'claimVoid', card: { ...card }, by: playerId, losers: state.claims.slice() });
    }
    state.claims = [];
    state.discardFresh = false;
    events.push({ e: 'draw', p: playerId, source: 'discard', card: { ...card } });
  } else {
    // Antes de puxar do monte, resolve a compra fora da vez (se houver pedido)
    const buyers = claimPriority(state);
    if (buyers.length > 0 && state.discardFresh && podeComprarDoDescarte(state)) {
      const buyerId = buyers[0];
      const buyer = playerById(state, buyerId);
      const card = state.discard.pop();
      buyer.hand.push(card);
      state.discardFresh = false;
      const penalty = [];
      for (let i = 0; i < state.opts.buyPenalty; i++) {
        if (ensureDeck(state, events)) penalty.push(state.deck.pop());
      }
      buyer.hand.push(...penalty);
      events.push({ e: 'buy', p: buyerId, card: { ...card }, penalty: penalty.length, losers: buyers.slice(1) });
    }
    state.claims = [];
    state.discardFresh = false;
    if (!ensureDeck(state, events)) return endRoundDead(state, events);
    const card = state.deck.pop();
    player.hand.push(card);
    events.push({ e: 'draw', p: playerId, source: 'deck' });
  }

  state.phase = 'play';
  return events;
}

// Baixar jogos — UM DE CADA VEZ, se quiser: qualquer trinca/sequência completa
// que o contrato ainda peça pode descer sozinha (na 1ª rodada, uma trinca já
// pode ser baixada antes da outra). O direito de encaixar nos jogos da mesa
// só vem quando o contrato INTEIRO estiver baixado (player.baixou).
// cardIds opcional: baixa exatamente a seleção; sem ele, baixa o máximo.
export function actBaixar(state, playerId, cardIds = null) {
  if (state.phase !== 'play') fail('Puxe uma carta antes de baixar.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  const ct = currentContract(state);
  const remaining = contractRemaining(state, player);
  if (remaining.t === 0 && remaining.s === 0) fail('Você já baixou o contrato inteiro desta rodada.');

  const plan = planBaixada(player.hand, remaining, cardIds);
  if (!plan) {
    // Distingue "não forma jogo" de "formaria, mas te deixaria preso"
    const preso = planBaixada(player.hand, remaining, cardIds, { permitirMaoVazia: true });
    if (preso) fail('Baixar isso agora te deixaria sem nenhuma carta sem completar o contrato — guarde pelo menos uma para descartar.');
    if (cardIds && cardIds.length) fail(`Essas cartas não formam jogos que o contrato ainda pede (${ct.label}).`);
    fail(`Você ainda não tem nenhum jogo completo para baixar (${ct.label}).`);
  }

  const usedIds = new Set();
  for (const cards of plan.trincas) {
    player.melds.push(makeTrincaMeld(cards, playerId));
    cards.forEach((c) => usedIds.add(c.id));
  }
  for (const { cards, start } of plan.seqs) {
    player.melds.push(makeSeqMeld(cards, start, playerId));
    cards.forEach((c) => usedIds.add(c.id));
  }
  player.hand = player.hand.filter((c) => !usedIds.has(c.id));
  player.baixados.t += plan.a;
  player.baixados.s += plan.b;
  player.baixou = player.baixados.t >= ct.t && player.baixados.s >= ct.s;

  const events = [{ e: 'baixou', p: playerId, t: plan.a, s: plan.b, completa: player.baixou }];
  if (player.hand.length === 0) return endRound(state, playerId, 'bateu', events);
  return events;
}

// Encaixar uma carta da mão em qualquer jogo da mesa (só depois de baixar).
// `end` ('lo'/'hi') escolhe a ponta quando a carta serve nas duas.
export function actLayoff(state, playerId, cardId, meldId, end = null) {
  if (state.phase !== 'play') fail('Puxe uma carta antes de encaixar.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  if (!player.baixou) fail('Você precisa baixar o jogo antes de encaixar cartas.');
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) fail('Essa carta não está na sua mão.');
  const meld = meldById(state, meldId);
  if (!meld) fail('Jogo não encontrado na mesa.');
  const opt = layoffOption(card, meld, 0, end || null);
  if (!opt) fail(end ? 'Essa carta não encaixa nesse jogo por essa ponta.' : 'Essa carta não encaixa nesse jogo.');

  applyLayoff(meld, card, opt);
  player.hand = player.hand.filter((c) => c.id !== cardId);

  const events = [{ e: 'layoff', p: playerId, card: { ...card }, meldId }];
  if (player.hand.length === 0) return endRound(state, playerId, 'bateu', events);
  return events;
}

// Já pode trocar coringa? A ÚNICA restrição do jogo é ser a vez do jogador,
// checada em actSwapJoker junto com as demais jogadas. Não precisa ter baixado
// o próprio contrato: quem ainda está montando a mão também pode resgatar o
// coringa da mesa entregando a carta que ele representa.
export function podeTrocarCoringa(state, player) {
  return !!player;
}

// Onde, na sequência, está o coringa e que carta ele representa.
export function coringaNaSequencia(meld) {
  if (!meld || meld.type !== 's') return null;
  const idx = meld.cards.findIndex(isJoker);
  if (idx < 0) return null;
  return { idx, joker: meld.cards[idx], valor: meld.values[idx], suit: meld.suit };
}

// A carta da mão é exatamente a que o coringa representa (valor E naipe)?
export function cardCobreCoringa(card, meld) {
  const info = coringaNaSequencia(meld);
  if (!info || isJoker(card)) return false;
  if (card.suit !== info.suit) return false;
  return cardValues(card).includes(info.valor);
}

// Trocar o coringa de uma sequência pela carta real que ele representa. Vale
// para qualquer sequência da mesa, própria ou de outro jogador, tendo baixado
// o próprio contrato ou não, e o coringa vem para a mão de quem trocou.
// Única restrição: ser a vez do jogador. Com SWAP_JOKER_SAME_TURN ligado a
// troca vira atômica e o coringa vai direto para `destMeldId`.
export function actSwapJoker(state, playerId, meldId, cardId, destMeldId = null) {
  if (state.phase !== 'play') fail('Puxe uma carta antes de trocar o coringa.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');

  const meld = meldById(state, meldId);
  if (!meld) fail('Jogo não encontrado na mesa.');
  if (meld.type !== 's') fail('Só existe coringa em sequência.');
  const info = coringaNaSequencia(meld);
  if (!info) fail('Esse jogo não tem coringa.');

  const card = player.hand.find((c) => c.id === cardId);
  if (!card) fail('Essa carta não está na sua mão.');
  if (!cardCobreCoringa(card, meld)) {
    fail(`O coringa aí faz ${rankLabel(info.valor > 13 ? 1 : info.valor)}${SUITS[info.suit]}: precisa ser essa carta exata.`);
  }

  // Valida o destino ANTES de mexer em qualquer coisa. O `1` diz ao
  // layoffOption para considerar a sequência já sem este coringa, no caso de
  // ele voltar para a própria sequência de onde saiu.
  let dest = null;
  let opt = null;
  if (SWAP_JOKER_SAME_TURN) {
    if (!destMeldId) fail('Escolha onde encaixar o coringa: ele tem que ser usado neste turno.');
    dest = meldById(state, destMeldId);
    if (!dest) fail('Jogo de destino não encontrado.');
    opt = layoffOption(info.joker, dest, dest === meld ? 1 : 0);
    if (!opt) fail('O coringa não encaixa nesse jogo, e ele precisa ser usado neste turno.');
  }

  // Daqui para baixo nada mais falha: o estado só muda depois de tudo validado.
  meld.cards[info.idx] = card;
  player.hand = player.hand.filter((c) => c.id !== cardId);

  if (SWAP_JOKER_SAME_TURN) {
    applyLayoff(dest, info.joker, opt);
  } else {
    player.hand.push(info.joker);
  }

  const events = [{
    e: 'swapJoker',
    p: playerId,
    meldId: meld.id,
    card: { ...card },
    destMeldId: dest ? dest.id : null,
  }];
  if (player.hand.length === 0) return endRound(state, playerId, 'bateu', events);
  return events;
}

// Descartar da mão (obrigatório para encerrar a vez)
export function actDiscard(state, playerId, cardId) {
  if (state.phase !== 'play') fail('Puxe uma carta antes de descartar.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) fail('Essa carta não está na sua mão.');

  player.hand = player.hand.filter((c) => c.id !== cardId);
  state.discard.push(card);
  const events = [{ e: 'discard', p: playerId, card: { ...card } }];
  if (player.hand.length === 0) return endRound(state, playerId, 'bateu', events);
  advanceTurn(state);
  if (state.turnNo > state.opts.maxTurnsPerRound) return endRoundDead(state, events);
  return events;
}

// Descartar tirando carta de um jogo próprio com sobra (em vez da mão)
export function actMeldDiscard(state, playerId, meldId, cardId) {
  if (state.phase !== 'play') fail('Puxe uma carta antes de descartar.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  const meld = player.melds.find((m) => m.id === meldId);
  if (!meld) fail('Você só pode descartar de um jogo seu.');
  const allowed = removableCards(meld);
  if (!allowed.some((c) => c.id === cardId)) {
    fail('Só dá para tirar carta de sequência com mais de 4 cartas (pelas pontas) ou trinca com mais de 3.');
  }
  const card = removeFromMeld(meld, cardId);
  state.discard.push(card);
  const events = [{ e: 'meldDiscard', p: playerId, card: { ...card }, meldId }];
  advanceTurn(state);
  if (state.turnNo > state.opts.maxTurnsPerRound) return endRoundDead(state, events);
  return events;
}

function advanceTurn(state) {
  state.turn = (state.turn + 1) % state.players.length;
  state.turnNo++;
  state.phase = 'draw';
  state.discardFresh = true;
  state.claims = [];
}

// Avança para a próxima rodada (chamado pelo anfitrião na tela de placar)
export function actNextRound(state) {
  if (state.phase !== 'roundEnd') fail('A rodada ainda não terminou.');
  return startRound(state);
}

// ============================================================================
// Visão redigida por jogador (não vaza a mão dos outros nem o monte)
// ============================================================================

export function viewFor(state, playerId) {
  const me = playerById(state, playerId);
  return {
    round: state.round,
    totalRounds: TOTAL_ROUNDS,
    contract: state.round >= 0 ? currentContract(state) : null,
    phase: state.phase,
    turnId: state.players[state.turn] ? state.players[state.turn].id : null,
    deckCount: state.deck.length,
    discardTop: state.discard.length ? state.discard[state.discard.length - 1] : null,
    discardCount: state.discard.length,
    discardFresh: state.discardFresh,
    // O topo pode ser comprado? Falso quando um coringa tranca o meio — a tela
    // precisa disso para não oferecer um toque que o motor vai recusar.
    discardBuyable: podeComprarDoDescarte(state),
    claims: state.claims.slice(),
    lastRound: state.lastRound,
    ranking: state.phase === 'gameEnd' ? finalRanking(state) : null,
    // `podeTrocarCoringa` vai pronto do motor: o cliente não reimplementa a
    // regra de "baixou em turno anterior", só reflete o que o juiz respondeu.
    you: me
      ? {
          id: me.id,
          hand: me.hand,
          baixou: me.baixou,
          baixados: me.baixados,
          remaining: state.round >= 0 ? contractRemaining(state, me) : null,
          podeTrocarCoringa: podeTrocarCoringa(state, me),
        }
      : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      handCount: p.hand.length,
      baixou: p.baixou,
      baixados: p.baixados,
      score: p.score,
      melds: p.melds,
    })),
  };
}

// ============================================================================
// Bot: heurística simples
// ============================================================================

// Melhor cobertura do contrato que estas cartas alcançam: devolve quantas
// cartas ela casa E quais são elas. Medir o progresso e proteger as cartas
// tem que sair da MESMA decomposição — se divergirem, o bot descarta uma carta
// que ele mesmo conta como progresso e volta a querê-la na jogada seguinte,
// o que trava a rodada num ciclo de pega-e-devolve com o descarte.
function melhorCobertura(cards, ct) {
  const combinacoes = [];
  for (let a = ct.t; a >= 0; a--) {
    for (let b = ct.s; b >= 0; b--) combinacoes.push({ a, b, score: a * 3 + b * 4 });
  }
  combinacoes.sort((x, y) => y.score - x.score); // da melhor para a pior
  for (const { a, b, score } of combinacoes) {
    if (a === 0 && b === 0) break;
    const res = findContractMelds(cards, a, b);
    if (res) return { score, res };
  }
  return { score: 0, res: null };
}

function bestCover(cards, ct) {
  return melhorCobertura(cards, ct).score;
}

// A carta avança o que FALTA do contrato, ou encaixa em algum jogo da mesa?
export function botWantsCard(state, player, card) {
  if (player.baixou) {
    return allMelds(state).some((m) => layoffOption(card, m));
  }
  const rem = contractRemaining(state, player);
  const before = bestCover(player.hand, rem);
  if (before >= rem.t * 3 + rem.s * 4) return false; // o que falta já está na mão
  // Vale para o coringa também: só pega se a cobertura melhorar de verdade.
  // Querer uma carta que a heurística de descarte depois larga é o que criava
  // o pega-e-devolve infinito com o descarte.
  return bestCover([...player.hand, card], rem) > before;
}

// Utilidade de manter uma carta na mão (para escolher descarte).
// `faltam` = quantas trincas e sequências o contrato ainda pede depois do que
// a mão já forma. Os pesos olham o que FALTA, não o contrato inteiro: sem
// isso, um bot que já tem a sequência pronta continua achando ótimas as
// cartas do mesmo naipe (que não servem mais para nada) e descarta na hora as
// de outro naipe, que valeriam 0 — e assim nunca começa a trinca que falta.
function cardUsefulness(state, player, card, faltam) {
  const tW = faltam.t > 0 ? 1 : 0.15;
  const sW = faltam.s > 0 ? 1 : 0.15;
  // Coringa: tapa qualquer buraco de sequência, então vale muito — mas só até
  // a cota que ainda dá para aproveitar (cada sequência aceita no máximo
  // MAX_JOKERS_PER_SEQ). Coringa excedente é 20 pontos mortos; sem esta cota o
  // bot acumulava os quatro coringas do baralho e nunca fechava o contrato.
  if (isJoker(card)) {
    const cota = faltam.s * MAX_JOKERS_PER_SEQ;
    const posicao = player.hand.filter(isJoker).findIndex((c) => c.id === card.id);
    return posicao >= 0 && posicao < cota ? 7 : 0;
  }
  let score = 0;
  const mates = new Set(
    player.hand.filter((c) => c.id !== card.id && c.rank === card.rank && c.suit !== card.suit).map((c) => c.suit)
  );
  score += Math.min(mates.size, 2) * 2.2 * tW;
  for (const c of player.hand) {
    if (c.id === card.id || c.suit !== card.suit) continue;
    let best = 99;
    for (const v of cardValues(card)) for (const w of cardValues(c)) best = Math.min(best, Math.abs(v - w));
    if (best >= 1 && best <= 3) score += (4 - best) * 0.8 * sW;
  }
  return score;
}

// Protege exatamente as cartas da melhor cobertura — a mesma que bestCover
// mede. Assim a cobertura nunca regride: o bot só pega carta do descarte que
// a aumenta e nunca descarta carta que a sustenta, então ele converge para o
// contrato em vez de ficar rodando em círculo com o monte de descarte.
function protectedIds(state, player) {
  const rem = contractRemaining(state, player);
  const ids = new Set();
  const guarda = (res) => {
    if (!res) return;
    for (const cards of res.trincas) cards.forEach((c) => ids.add(c.id));
    for (const { cards } of res.seqs) cards.forEach((c) => ids.add(c.id));
  };
  // 1) A melhor cobertura do que FALTA — obrigatória, é a que bestCover mede.
  guarda(melhorCobertura(player.hand, rem).res);
  // 2) Mais os jogos completos avulsos. Uma trinca e uma sequência podem
  //    disputar a mesma carta e não caber na mesma cobertura; ainda assim as
  //    duas são progresso e nenhuma delas deve virar descarte. Proteger a
  //    união é sempre seguro: continua contendo tudo que a cobertura conta.
  for (let k = Math.min(rem.t, 3); k >= 1; k--) {
    const parcial = findContractMelds(player.hand, k, 0);
    if (parcial) { guarda(parcial); break; }
  }
  for (let k = Math.min(rem.s, 3); k >= 1; k--) {
    const parcial = findContractMelds(player.hand, 0, k);
    if (parcial) { guarda(parcial); break; }
  }
  return ids;
}

export function botPickDiscard(state, player) {
  const rem = contractRemaining(state, player);
  const cobertura = melhorCobertura(player.hand, rem).res;
  const faltam = {
    t: rem.t - (cobertura ? cobertura.trincas.length : 0),
    s: rem.s - (cobertura ? cobertura.seqs.length : 0),
  };
  const safe = protectedIds(state, player);
  let candidates = player.hand.filter((c) => !safe.has(c.id));
  if (candidates.length === 0) candidates = player.hand;
  // O coringa não precisa de regra especial aqui: se ele está sustentando a
  // melhor cobertura, protectedIds já o tirou dos candidatos; se não está, ele
  // é 20 pontos parados na mão e largá-lo é jogada legítima — ninguém pega
  // coringa do meio.
  let worst = candidates[0];
  let worstScore = Infinity;
  for (const c of candidates) {
    const u = player.baixou ? -cardPoints(c) : cardUsefulness(state, player, c, faltam) - cardPoints(c) * 0.01;
    if (u < worstScore) { worstScore = u; worst = c; }
  }
  return worst;
}

// Troca de coringa que valha a pena.
// Com o coringa vindo para a MÃO a troca não diminui a mão: é uma permuta —
// entrega uma carta real e recebe 20 pontos de coringa. Só compensa quando o
// coringa rende mais do que a carta entregue, senão o bot ficaria juntando
// coringa sem destino, que é exatamente o que travava as rodadas.
export function botFindJokerSwap(state, player) {
  if (!podeTrocarCoringa(state, player)) return null;
  const melds = allMelds(state);
  const ct = currentContract(state);
  const coberturaAtual = bestCover(player.hand, ct);
  // Carta mais cara primeiro: entre trocas equivalentes, larga o peso morto.
  const mao = [...player.hand].sort((a, b) => cardPoints(b) - cardPoints(a));

  for (const meld of melds) {
    const info = coringaNaSequencia(meld);
    if (!info) continue;
    for (const card of mao) {
      if (!cardCobreCoringa(card, meld)) continue;

      if (SWAP_JOKER_SAME_TURN) {
        // Atômica: o coringa tem de ir direto para algum jogo.
        for (const dest of melds) {
          if (layoffOption(info.joker, dest, dest.id === meld.id ? 1 : 0)) {
            return { meldId: meld.id, cardId: card.id, destMeldId: dest.id };
          }
        }
        continue;
      }

      if (player.baixou) {
        // Já baixou: o objetivo é esvaziar a mão. A troca só ajuda se a carta
        // entregue não tinha encaixe nenhum e o coringa tiver — aí ele sai da
        // mão na jogada seguinte. Sem isso a permuta seria pura perda.
        const cartaEncaixa = melds.some((m) => layoffOption(card, m));
        const coringaEncaixa = melds.some((m) => layoffOption(info.joker, m, m.id === meld.id ? 1 : 0));
        if (!cartaEncaixa && coringaEncaixa) {
          return { meldId: meld.id, cardId: card.id, destMeldId: null };
        }
        continue;
      }

      // Ainda não baixou: só troca se o coringa fizer a cobertura crescer.
      const maoDepois = player.hand.filter((c) => c.id !== card.id).concat(info.joker);
      if (bestCover(maoDepois, ct) > coberturaAtual) {
        return { meldId: meld.id, cardId: card.id, destMeldId: null };
      }
    }
  }
  return null;
}

// Qual ponta aproveita melhor a carta (importa para o coringa, que entra nas
// duas)? Prefere a ponta que abre encaixe para outra carta da mão — é o que
// destrava o "bateu" (ex.: mesa 5♥6♥7♥8♥, mão [coringa, 3♥]: coringa como 4♥
// embaixo deixa o 3♥ entrar em seguida).
function melhorPonta(player, card, meld) {
  const ends = layoffEnds(card, meld);
  if (ends.length <= 1) return ends[0] || null;
  for (const end of ends) {
    const opt = layoffOption(card, meld, 0, end);
    const proximoValor = opt.end === 'lo' ? opt.v - 1 : opt.v + 1;
    if (proximoValor < 1 || proximoValor > 14) continue;
    const abreEncaixe = player.hand.some((c) =>
      c.id !== card.id && !isJoker(c) && c.suit === meld.suit && cardValues(c).includes(proximoValor));
    if (abreEncaixe) return end;
  }
  return ends[0];
}

// Próxima ação do bot na vez dele (uma por chamada, para o servidor dar ritmo)
export function botNextAction(state, playerId) {
  const player = state.players[state.turn];
  if (!player || player.id !== playerId) return null;

  if (state.phase === 'draw') {
    const top = topoDoDescarte(state);
    if (top && podeComprarDoDescarte(state) && botWantsCard(state, player, top)) {
      return { a: 'draw', source: 'discard' };
    }
    return { a: 'draw', source: 'deck' };
  }

  if (state.phase === 'play') {
    // Baixa o que der, assim que der (um jogo por vez conta): menos pontos na
    // mão se alguém bater. planBaixada já evita a baixada que deixaria a mão
    // vazia sem completar o contrato, então a ação nunca é recusada.
    if (!player.baixou && planBaixada(player.hand, contractRemaining(state, player))) {
      return { a: 'baixar' };
    }
    if (player.baixou) {
      for (const card of player.hand) {
        for (const meld of allMelds(state)) {
          if (!layoffOption(card, meld)) continue;
          const end = melhorPonta(player, card, meld);
          return { a: 'layoff', cardId: card.id, meldId: meld.id, end };
        }
      }
    }
    // A troca vale para quem já baixou (segunda saída, depois do encaixe) e
    // também para quem ainda não baixou: pegar o coringa da mesa pode ser o
    // que faltava para fechar o contrato. Se fechar, o `baixar` acima pega na
    // chamada seguinte, ainda neste turno.
    const troca = botFindJokerSwap(state, player);
    if (troca) return { a: 'swapJoker', ...troca };

    const card = botPickDiscard(state, player);
    return { a: 'discard', cardId: card.id };
  }

  return null;
}

// Aplica uma ação genérica (usada pelo servidor para humanos e bots)
export function applyAction(state, playerId, action) {
  switch (action.a) {
    case 'draw': return actDraw(state, playerId, action.source);
    case 'claim': return actClaim(state, playerId);
    case 'unclaim': return actUnclaim(state, playerId);
    case 'baixar': return actBaixar(state, playerId, action.cardIds || null);
    case 'layoff': return actLayoff(state, playerId, action.cardId, action.meldId, action.end || null);
    case 'swapJoker': return actSwapJoker(state, playerId, action.meldId, action.cardId, action.destMeldId || null);
    case 'discard': return actDiscard(state, playerId, action.cardId);
    case 'meldDiscard': return actMeldDiscard(state, playerId, action.meldId, action.cardId);
    default: fail('Ação desconhecida.');
  }
}
