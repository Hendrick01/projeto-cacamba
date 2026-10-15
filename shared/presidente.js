// ============================================================================
// Presidente — o segundo modo da casa. Mesmo baralho, mesma mesa, mesmo
// elenco; só as regras mudam. Vive separado do engine.js do Caçamba de
// propósito: um não importa nada do outro, e a página só baixa este arquivo
// quando alguém entra numa sala de Presidente.
//
// Regras combinadas com o dono do jogo em 15/10/2026:
//  - Um baralho de 52, sem coringa, distribuído inteiro.
//  - Força: 3 4 5 6 7 8 9 10 J Q K A 2 (o 2 é a mais forte). Naipe não conta.
//  - Joga-se 1, 2, 3 ou 4 cartas do MESMO valor. Para cobrir, a mesma
//    quantidade e de valor MAIS ALTO. Quem não quer ou não pode, passa.
//  - UMA ação por volta (dono do jogo, 15/10/2026): cada um joga OU passa uma
//    vez só; quem já jogou não joga de novo até a mesa limpar, e a vez não
//    volta para ninguém. Quando todos agiram, a mesa limpa e começa quem
//    jogou por último (se ele já saiu, o próximo que tem carta).
//  - O 2, de qualquer naipe, limpa a mesa NA HORA — nada cobre o 2 — e quem
//    jogou o 2 começa de novo.
//  - Quem esvazia a mão sai; a ordem de saída dá o título: Presidente, Vice,
//    Neutro(s), Vice-cu e Cu. Com 3 jogadores não há vices.
//  - Da 2ª rodada em diante: o Cu entrega as 2 cartas mais fortes ao
//    Presidente, que devolve 2 à escolha dele; o Vice-cu entrega a mais forte
//    ao Vice, que devolve 1. A partida não tem fim fixo.
//
// REGRAS DA CASA ainda não confirmadas (ajustáveis aqui):
//  - Quem abre a 1ª rodada é quem tem o 3 de paus; as seguintes, o Cu.
// ============================================================================

export const MODO = 'presidente';
export const MIN_JOGADORES = 3;
export const MAX_JOGADORES = 8;
export const NIVEIS_DE_ROBO = ['facil', 'normal'];
export const PAUS = 3;   // índice do naipe em engine.js: ♠ ♥ ♦ ♣

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rotulo = (rank) => RANK_LABELS[rank - 1] || '';

// 3 vale 0, K vale 10, A vale 11, 2 vale 12.
export function forca(card) { return (card.rank + 10) % 13; }

export const TITULOS = {
  presidente: 'Presidente', vice: 'Vice', neutro: 'Neutro', 'vice-cu': 'Vice-cu', cu: 'Cu',
};

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

function baralho() {
  const cards = [];
  let id = 1;
  for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) cards.push({ id: id++, rank, suit });
  return cards;
}

function embaralha(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const porForca = (a, b) => forca(a) - forca(b) || a.suit - b.suit;

// O título de cada posição de saída, para uma mesa de n.
export function tituloDaPosicao(pos, n) {
  if (pos === 0) return 'presidente';
  if (pos === n - 1) return 'cu';
  if (n >= 4 && pos === 1) return 'vice';
  if (n >= 4 && pos === n - 2) return 'vice-cu';
  return 'neutro';
}

export function createGame(players, opts = {}) {
  return {
    modo: MODO,
    opts: { nivelRobos: 'normal', ...opts, rnd: undefined },
    players: players.map((p) => ({
      id: p.id, name: p.name, isBot: !!p.isBot,
      hand: [],
      titulo: null,       // da rodada anterior; vale para a troca desta
      pontos: 0,          // por posição: o Presidente leva n-1, o Cu leva 0
      vezes: {},          // quantas vezes teve cada título
    })),
    round: -1,
    phase: 'lobby',
    turn: 0,
    turnNo: 0,
    deck: [],           // o retrato da sala confere que existe; aqui fica vazio
    mesa: null,         // { n, forca, cards, by } — a jogada a cobrir
    lances: [],         // jogadas desde a última limpeza: [{ p, cards }]
    passes: [],         // quem passou nesta volta
    jogaram: [],        // quem jogou nesta volta (não joga de novo até limpar)
    saidas: [],         // ids na ordem em que esvaziaram a mão
    trocas: [],         // pendentes: [{ de, para, n }] — quem devolve escolhe
    lastRound: null,    // { ordem: [ids], titulos: { id: titulo } }
    rnd: opts.rnd || Math.random,
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

function idxDe(state, id) {
  return state.players.findIndex((p) => p.id === id);
}

function ativos(state) {
  return state.players.filter((p) => p.hand.length > 0);
}

// O próximo depois de `i` que ainda tem carta.
function proximoAtivo(state, i) {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (state.players[j].hand.length > 0) return j;
  }
  return -1;
}

export function startRound(state) {
  const rnd = state.rnd || Math.random;
  state.round++;
  const deck = embaralha(baralho(), rnd);
  for (const p of state.players) p.hand = [];
  // Distribui a partir de um assento que gira a cada rodada: com mesa que não
  // divide 52, quem leva carta a mais muda.
  const n = state.players.length;
  for (let i = 0; deck.length; i++) state.players[(state.round + i) % n].hand.push(deck.pop());

  state.mesa = null; state.lances = []; state.passes = []; state.jogaram = []; state.saidas = [];
  state.trocas = []; state.turnNo = 0;
  const events = [{ e: 'roundStart', round: state.round }];

  const anterior = state.lastRound;
  if (anterior) {
    const com = (t) => state.players.find((p) => anterior.titulos[p.id] === t);
    const pares = [['presidente', 'cu', 2], ['vice', 'vice-cu', 1]];
    for (const [alto, baixo, qtd] of pares) {
      const a = com(alto), b = com(baixo);
      if (!a || !b) continue;
      // O de baixo não escolhe: entrega as mais fortes, e pronto.
      const melhores = [...b.hand].sort(porForca).slice(-qtd);
      b.hand = b.hand.filter((c) => !melhores.includes(c));
      a.hand.push(...melhores);
      state.trocas.push({ de: a.id, para: b.id, n: qtd });
      events.push({ e: 'entregou', p: b.id, para: a.id, n: qtd });
    }
  }

  if (state.trocas.length) {
    state.phase = 'troca';
    state.turn = idxDe(state, state.trocas[0].de);
  } else {
    comecaAJogar(state, events);
  }
  return events;
}

function quemAbre(state) {
  if (state.lastRound) {
    const cu = state.players.findIndex((p) => state.lastRound.titulos[p.id] === 'cu');
    if (cu >= 0) return cu;
  }
  const comTres = state.players.findIndex((p) => p.hand.some((c) => c.rank === 3 && c.suit === PAUS));
  return comTres >= 0 ? comTres : 0;
}

function comecaAJogar(state, events) {
  state.phase = 'play';
  state.turn = quemAbre(state);
  events.push({ e: 'abre', p: state.players[state.turn].id });
}

// Quem devolve escolhe as cartas. A vez é dele enquanto a troca não fecha.
export function actTrocar(state, playerId, cardIds) {
  if (state.phase !== 'troca') fail('Não é hora de trocar cartas.');
  const t = state.trocas[0];
  if (!t || t.de !== playerId) fail('Não é a sua vez de devolver cartas.');
  const ids = [...new Set(Array.isArray(cardIds) ? cardIds : [])];
  if (ids.length !== t.n) fail(`Escolha ${t.n === 1 ? '1 carta' : `${t.n} cartas`} para devolver.`);
  const de = playerById(state, t.de), para = playerById(state, t.para);
  const cartas = ids.map((id) => de.hand.find((c) => c.id === id));
  if (cartas.some((c) => !c)) fail('Essa carta não está na sua mão.');
  de.hand = de.hand.filter((c) => !cartas.includes(c));
  para.hand.push(...cartas);
  state.trocas.shift();
  const events = [{ e: 'devolveu', p: de.id, para: para.id, n: t.n }];
  if (state.trocas.length) state.turn = idxDe(state, state.trocas[0].de);
  else comecaAJogar(state, events);
  state.turnNo++;
  return events;
}

// Pode jogar estas cartas agora? Devolve null quando pode, ou o motivo.
export function motivoDaRecusa(mesa, cartas) {
  if (!cartas.length) return 'Escolha as cartas que vai jogar.';
  if (cartas.length > 4) return 'No máximo 4 cartas de uma vez.';
  if (cartas.some((c) => c.rank !== cartas[0].rank)) return 'Só dá para jogar cartas do mesmo valor juntas.';
  if (!mesa) return null;
  if (cartas.length !== mesa.n) {
    const q = ['', 'uma carta', 'um par', 'uma trinca', 'uma quadra'][mesa.n];
    return `A mesa pede ${q}: jogue ${mesa.n === 1 ? '1 carta' : `${mesa.n} cartas`} do mesmo valor.`;
  }
  // a força sai das cartas da mesa, não de um campo: a visão do cliente e o
  // estado do servidor respondem igual
  if (forca(cartas[0]) <= forca(mesa.cards[0])) return `Precisa ser mais alto que ${rotulo(mesa.cards[0].rank)}.`;
  return null;
}

export function actJogar(state, playerId, cardIds) {
  if (state.phase !== 'play') fail('Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  const ids = [...new Set(Array.isArray(cardIds) ? cardIds : [])];
  const cartas = ids.map((id) => p.hand.find((c) => c.id === id));
  if (cartas.some((c) => !c)) fail('Essa carta não está na sua mão.');
  const motivo = motivoDaRecusa(state.mesa, cartas);
  if (motivo) fail(motivo);

  p.hand = p.hand.filter((c) => !cartas.includes(c));
  state.mesa = { n: cartas.length, forca: forca(cartas[0]), cards: cartas, by: p.id };
  state.lances.push({ p: p.id, cards: cartas });
  (state.jogaram ||= []).push(p.id);
  state.turnNo++;
  const events = [{ e: 'jogou', p: p.id, cards: cartas }];

  if (p.hand.length === 0) {
    state.saidas.push(p.id);
    events.push({ e: 'saiu', p: p.id, pos: state.saidas.length - 1 });
    if (ativos(state).length <= 1) return fimDaRodada(state, events);
  }
  // nada cobre o 2: a mesa limpa na hora, e quem jogou começa de novo
  if (forca(cartas[0]) === FORCA_DO_DOIS) return limpa(state, events, 'dois');
  return proximaVez(state, events);
}

const FORCA_DO_DOIS = 12;

// Quem já agiu nesta volta (jogou ou passou) não tem outra vez. Sem ninguém
// para agir, a volta acabou e a mesa limpa.
function proximaVez(state, events) {
  const agiu = new Set([...(state.jogaram || []), ...state.passes]);
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (state.turn + k) % n;
    const x = state.players[j];
    if (x.hand.length > 0 && !agiu.has(x.id)) { state.turn = j; return events; }
  }
  return limpa(state, events, 'volta');
}

export function actPassar(state, playerId) {
  if (state.phase !== 'play') fail('Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  if (!state.mesa) fail('A mesa está limpa: você abre, jogue alguma carta.');
  if (!state.passes.includes(p.id)) state.passes.push(p.id);
  state.turnNo++;
  return proximaVez(state, [{ e: 'passou', p: p.id }]);
}

// `motivo`: 'volta' (todos agiram) ou 'dois' (o 2 fecha a mesa).
function limpa(state, events, motivo) {
  const dono = idxDe(state, state.mesa.by);
  state.turn = state.players[dono].hand.length > 0 ? dono : proximoAtivo(state, dono);
  state.mesa = null; state.lances = []; state.passes = []; state.jogaram = [];
  events.push({ e: 'limpou', p: state.players[state.turn].id, motivo });
  return events;
}

function fimDaRodada(state, events) {
  for (const x of ativos(state)) state.saidas.push(x.id);   // o último que sobrou
  const n = state.players.length;
  const titulos = {};
  state.saidas.forEach((id, pos) => {
    const t = tituloDaPosicao(pos, n);
    titulos[id] = t;
    const p = playerById(state, id);
    p.titulo = t;
    p.pontos += n - 1 - pos;
    p.vezes[t] = (p.vezes[t] || 0) + 1;
  });
  state.phase = 'roundEnd';
  state.mesa = null; state.lances = []; state.passes = []; state.jogaram = [];
  state.lastRound = { ordem: state.saidas.slice(), titulos };
  events.push({ e: 'roundEnd', ordem: state.saidas.slice(), titulos, round: state.round });
  return events;
}

export function actNextRound(state) {
  if (state.phase !== 'roundEnd') return [];
  return startRound(state);
}

export function applyAction(state, playerId, action) {
  switch (action.a) {
    case 'jogar': return actJogar(state, playerId, action.cardIds);
    case 'passar': return actPassar(state, playerId);
    case 'trocar': return actTrocar(state, playerId, action.cardIds);
    default: fail('Ação desconhecida.');
  }
}

// Fases em que alguém precisa agir (é onde o servidor agenda robô e cobrança).
export const FASES_DE_VEZ = ['troca', 'play'];

export function viewFor(state, playerId) {
  const me = playerById(state, playerId);
  const troca = state.phase === 'troca' ? state.trocas[0] : null;
  return {
    modo: MODO,
    round: state.round,
    phase: state.phase,
    turnId: state.players[state.turn] ? state.players[state.turn].id : null,
    turnNo: state.turnNo,
    mesa: state.mesa ? { n: state.mesa.n, cards: state.mesa.cards, by: state.mesa.by } : null,
    lances: state.lances.slice(-6),
    passes: state.passes.slice(),
    saidas: state.saidas.slice(),
    troca: troca ? { de: troca.de, para: troca.para, n: troca.n } : null,
    lastRound: state.lastRound,
    // o que a mesa do Caçamba lê nos assentos, vazio aqui
    claims: [], contract: null,
    you: me ? { id: me.id, hand: me.hand, titulo: me.titulo } : null,
    players: state.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot,
      handCount: p.hand.length,
      titulo: p.titulo,
      pontos: p.pontos, score: p.pontos,
      vezes: p.vezes,
      saiu: state.saidas.indexOf(p.id),
      passou: state.passes.includes(p.id),
      jogouNaVolta: (state.jogaram || []).includes(p.id),
      baixou: false, baixados: null, melds: [],
    })),
  };
}

// ============================================================================
// Robô
// ============================================================================

function grupos(hand) {
  const m = new Map();
  for (const c of hand) { if (!m.has(c.rank)) m.set(c.rank, []); m.get(c.rank).push(c); }
  return [...m.values()].sort((a, b) => forca(a[0]) - forca(b[0]));
}

export function botNextAction(state, playerId) {
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) return null;
  const facil = state.opts?.nivelRobos === 'facil';
  const rnd = state.rnd || Math.random;

  if (state.phase === 'troca') {
    // Devolve as mais fracas.
    const n = state.trocas[0].n;
    return { a: 'trocar', cardIds: [...p.hand].sort(porForca).slice(0, n).map((c) => c.id) };
  }
  if (state.phase !== 'play') return null;

  const gs = grupos(p.hand);
  if (!state.mesa) {
    // Abre com o grupo mais fraco, inteiro: livra mais carta ruim de uma vez.
    return { a: 'jogar', cardIds: gs[0].map((c) => c.id) };
  }
  const { n, forca: f } = state.mesa;
  const cabem = gs.filter((g) => g.length >= n && forca(g[0]) > f);
  if (!cabem.length) return { a: 'passar' };
  if (facil && rnd() < 0.25) return { a: 'passar' };
  // Prefere não quebrar par/trinca; e guarda o 2 enquanto a mão está grande.
  const exato = cabem.find((g) => g.length === n);
  let g = exato || cabem[0];
  if (!facil && forca(g[0]) === 12 && p.hand.length > 5 && rnd() < 0.7) return { a: 'passar' };
  return { a: 'jogar', cardIds: g.slice(0, n).map((c) => c.id) };
}
