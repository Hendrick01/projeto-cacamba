// ============================================================================
// Caçamba — motor de regras (puro, sem I/O)
// Usado pelo servidor (juiz autoritativo) e pelo cliente (dicas de interface).
// ============================================================================

export const SUITS = ['♠', '♥', '♦', '♣']; // ♠ ♥ ♦ ♣
export const SUIT_NAMES = ['espadas', 'copas', 'ouros', 'paus'];
export const SUIT_RED = [false, true, true, false];
export const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

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
  decks: 2,          // 2 baralhos, sem coringa
  buyPenalty: 1,     // quem compra fora da vez leva +1 carta do monte
  maxReshuffles: 3,  // monte esgotado 3x na rodada → rodada termina sem vencedor
  minPlayers: 2,
  maxPlayers: 4,
};

export function rankLabel(rank) { return RANK_LABELS[rank - 1]; }
export function suitLabel(suit) { return SUITS[suit]; }
export function cardLabel(card) { return rankLabel(card.rank) + SUITS[card.suit]; }

// Pontos das cartas que sobram na mão: A=15, 10/J/Q/K=10, demais=5
export function cardPoints(card) {
  if (card.rank === 1) return 15;
  if (card.rank >= 10) return 10;
  return 5;
}

// Ás vale 1 (A-2-3-4) ou 14 (J-Q-K-A); nunca "vira a esquina" (K-A-2 não vale)
export function cardValues(card) {
  return card.rank === 1 ? [1, 14] : [card.rank];
}

export function buildDecks(numDecks) {
  const cards = [];
  let id = 1;
  for (let d = 0; d < numDecks; d++) {
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) {
        cards.push({ id: id++, rank, suit });
      }
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

  function seqCandidates(minKey) {
    const out = [];
    for (let s = 0; s < 4; s++) {
      const byVal = {};
      for (const c of cards) {
        if (c.suit !== s || used.has(c.id)) continue;
        for (const v of cardValues(c)) if (!byVal[v]) byVal[v] = c;
      }
      for (let start = 1; start <= 11; start++) {
        const key = s * 16 + start;
        if (key < minKey) continue;
        const run = [];
        let ok = true;
        for (let v = start; v < start + 4; v++) {
          if (byVal[v]) run.push(byVal[v]);
          else { ok = false; break; }
        }
        if (ok) out.push({ key, suit: s, start, cards: run });
      }
    }
    return out;
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

// ============================================================================
// Jogos na mesa (melds) e encaixes
// ============================================================================

let meldSeq = 1;

function makeTrincaMeld(cards, ownerId) {
  return { id: meldSeq++, type: 't', rank: cards[0].rank, cards: cards.slice(), ownerId };
}

function makeSeqMeld(cards, start, ownerId) {
  const values = cards.map((_, i) => start + i);
  return { id: meldSeq++, type: 's', suit: cards[0].suit, cards: cards.slice(), values, ownerId };
}

// Uma carta encaixa neste jogo? Retorna descrição do encaixe ou null.
export function layoffOption(card, meld) {
  if (meld.type === 't') {
    if (card.rank !== meld.rank) return null;
    const suits = new Set(meld.cards.map((c) => c.suit));
    // Mantém naipes diferentes até completar os 4; depois libera repetição
    if (suits.has(card.suit) && suits.size < 4) return null;
    return { kind: 't' };
  }
  if (card.suit !== meld.suit) return null;
  const lo = meld.values[0];
  const hi = meld.values[meld.values.length - 1];
  for (const v of cardValues(card)) {
    if (v === lo - 1 && v >= 1) return { kind: 's', end: 'lo', v };
    if (v === hi + 1 && v <= 14) return { kind: 's', end: 'hi', v };
  }
  return null;
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
    return [meld.cards[0], meld.cards[meld.cards.length - 1]];
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
      baixou: false,
      score: 0,
    })),
    round: -1,          // índice 0..6 (rodada 1..7)
    deck: [],
    discard: [],
    turn: 0,
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
  state.deck = shuffle(buildDecks(state.opts.decks), state.rnd);
  for (const p of state.players) {
    p.hand = [];
    p.melds = [];
    p.baixou = false;
  }
  for (let i = 0; i < cardsEach; i++) {
    for (const p of state.players) p.hand.push(state.deck.pop());
  }
  state.discard = [state.deck.pop()];
  state.turn = state.round % state.players.length;
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
  if (state.players[state.turn].id === playerId) return [];
  if (state.claims.includes(playerId)) return [];
  if (!playerById(state, playerId)) fail('Jogador desconhecido.');
  state.claims.push(playerId);
  return [{ e: 'claim', p: playerId }];
}

export function actUnclaim(state, playerId) {
  state.claims = state.claims.filter((id) => id !== playerId);
  return [];
}

// Puxar carta (obrigatório na vez): 'deck' = monte, 'discard' = meio/descarte
export function actDraw(state, playerId, source) {
  if (state.phase !== 'draw') fail('Não é hora de puxar carta.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  const events = [];

  if (source === 'discard') {
    if (state.discard.length === 0) fail('O descarte está vazio.');
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
    if (buyers.length > 0 && state.discardFresh && state.discard.length > 0) {
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

// Baixar o contrato da rodada (tudo de uma vez). cardIds opcional: escolha manual.
export function actBaixar(state, playerId, cardIds = null) {
  if (state.phase !== 'play') fail('Puxe uma carta antes de baixar.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  if (player.baixou) fail('Você já baixou o jogo nesta rodada.');

  const ct = currentContract(state);
  let pool = player.hand;
  if (cardIds && cardIds.length > 0) {
    const need = ct.t * 3 + ct.s * 4;
    if (cardIds.length !== need) fail(`O contrato desta rodada usa exatamente ${need} cartas (${ct.label}).`);
    pool = player.hand.filter((c) => cardIds.includes(c.id));
    if (pool.length !== cardIds.length) fail('Alguma carta selecionada não está na sua mão.');
  }
  const res = findContractMelds(pool, ct.t, ct.s);
  if (!res) fail(`Essas cartas não formam o contrato da rodada (${ct.label}).`);

  const usedIds = new Set();
  for (const cards of res.trincas) {
    player.melds.push(makeTrincaMeld(cards, playerId));
    cards.forEach((c) => usedIds.add(c.id));
  }
  for (const { cards, start } of res.seqs) {
    player.melds.push(makeSeqMeld(cards, start, playerId));
    cards.forEach((c) => usedIds.add(c.id));
  }
  player.hand = player.hand.filter((c) => !usedIds.has(c.id));
  player.baixou = true;

  const events = [{ e: 'baixou', p: playerId }];
  if (player.hand.length === 0) return endRound(state, playerId, 'bateu', events);
  return events;
}

// Encaixar uma carta da mão em qualquer jogo da mesa (só depois de baixar)
export function actLayoff(state, playerId, cardId, meldId) {
  if (state.phase !== 'play') fail('Puxe uma carta antes de encaixar.');
  const player = state.players[state.turn];
  if (player.id !== playerId) fail('Não é a sua vez.');
  if (!player.baixou) fail('Você precisa baixar o jogo antes de encaixar cartas.');
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) fail('Essa carta não está na sua mão.');
  const meld = meldById(state, meldId);
  if (!meld) fail('Jogo não encontrado na mesa.');
  const opt = layoffOption(card, meld);
  if (!opt) fail('Essa carta não encaixa nesse jogo.');

  applyLayoff(meld, card, opt);
  player.hand = player.hand.filter((c) => c.id !== cardId);

  const events = [{ e: 'layoff', p: playerId, card: { ...card }, meldId }];
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
  return events;
}

function advanceTurn(state) {
  state.turn = (state.turn + 1) % state.players.length;
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
    claims: state.claims.slice(),
    lastRound: state.lastRound,
    ranking: state.phase === 'gameEnd' ? finalRanking(state) : null,
    you: me ? { id: me.id, hand: me.hand, baixou: me.baixou } : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      handCount: p.hand.length,
      baixou: p.baixou,
      score: p.score,
      melds: p.melds,
    })),
  };
}

// ============================================================================
// Bot: heurística simples
// ============================================================================

// Melhor cobertura do contrato que estas cartas alcançam (nº de cartas casadas)
function bestCover(cards, ct) {
  let best = 0;
  for (let a = ct.t; a >= 0; a--) {
    for (let b = ct.s; b >= 0; b--) {
      const score = a * 3 + b * 4;
      if (score <= best) continue;
      if (findContractMelds(cards, a, b)) best = score;
    }
  }
  return best;
}

// A carta avança o contrato de verdade, ou encaixa em algum jogo da mesa?
export function botWantsCard(state, player, card) {
  if (player.baixou) {
    return allMelds(state).some((m) => layoffOption(card, m));
  }
  const ct = currentContract(state);
  const before = bestCover(player.hand, ct);
  if (before >= ct.t * 3 + ct.s * 4) return false; // contrato já fechado
  return bestCover([...player.hand, card], ct) > before;
}

// Utilidade de manter uma carta na mão (para escolher descarte)
function cardUsefulness(state, player, card) {
  const ct = currentContract(state);
  const tW = ct.t > 0 ? 1 : 0.15;
  const sW = ct.s > 0 ? 1 : 0.15;
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

// Protege cartas que já formam jogos completos exigidos pelo contrato
function protectedIds(state, player) {
  const ct = currentContract(state);
  const res = findContractMelds(player.hand, ct.t, ct.s);
  const ids = new Set();
  if (res) {
    for (const cards of res.trincas) cards.forEach((c) => ids.add(c.id));
    for (const { cards } of res.seqs) cards.forEach((c) => ids.add(c.id));
    return ids;
  }
  // Contrato incompleto: protege ao menos os jogos completos avulsos
  for (let k = Math.min(ct.t, 3); k >= 1; k--) {
    const partial = findContractMelds(player.hand, k, 0);
    if (partial) { partial.trincas.forEach((cs) => cs.forEach((c) => ids.add(c.id))); break; }
  }
  for (let k = Math.min(ct.s, 3); k >= 1; k--) {
    const partial = findContractMelds(player.hand, 0, k);
    if (partial) { partial.seqs.forEach(({ cards }) => cards.forEach((c) => ids.add(c.id))); break; }
  }
  return ids;
}

export function botPickDiscard(state, player) {
  const safe = protectedIds(state, player);
  let candidates = player.hand.filter((c) => !safe.has(c.id));
  if (candidates.length === 0) candidates = player.hand;
  let worst = candidates[0];
  let worstScore = Infinity;
  for (const c of candidates) {
    const u = player.baixou ? -cardPoints(c) : cardUsefulness(state, player, c) - cardPoints(c) * 0.01;
    if (u < worstScore) { worstScore = u; worst = c; }
  }
  return worst;
}

// Próxima ação do bot na vez dele (uma por chamada, para o servidor dar ritmo)
export function botNextAction(state, playerId) {
  const player = state.players[state.turn];
  if (!player || player.id !== playerId) return null;

  if (state.phase === 'draw') {
    const top = state.discard.length ? state.discard[state.discard.length - 1] : null;
    if (top && botWantsCard(state, player, top)) return { a: 'draw', source: 'discard' };
    return { a: 'draw', source: 'deck' };
  }

  if (state.phase === 'play') {
    const ct = currentContract(state);
    if (!player.baixou && findContractMelds(player.hand, ct.t, ct.s)) return { a: 'baixar' };
    if (player.baixou) {
      for (const card of player.hand) {
        for (const meld of allMelds(state)) {
          if (layoffOption(card, meld)) return { a: 'layoff', cardId: card.id, meldId: meld.id };
        }
      }
    }
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
    case 'layoff': return actLayoff(state, playerId, action.cardId, action.meldId);
    case 'discard': return actDiscard(state, playerId, action.cardId);
    case 'meldDiscard': return actMeldDiscard(state, playerId, action.meldId, action.cardId);
    default: fail('Ação desconhecida.');
  }
}
