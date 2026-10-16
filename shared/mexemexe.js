// ============================================================================
// Mexe-Mexe — a mesa é de todo mundo. Vive separado do engine.js do Caçamba,
// como os outros modos: um não importa nada do outro, e a página só baixa este
// arquivo quando alguém entra numa sala de Mexe-Mexe.
//
// Regras combinadas com o dono do jogo em 16/10/2026, uma por pergunta:
//  - Dois baralhos SEM coringa (104 cartas), 11 cartas para cada um, o resto
//    é o monte. De 2 a 6 jogadores.
//  - Jogo é SEQUÊNCIA do mesmo naipe ou TRINCA do mesmo valor, sempre com
//    pelo menos 3 cartas. O Ás vale 1 (A-2-3) ou vem depois do K (Q-K-A),
//    nunca os dois: K-A-2 não vale.
//  - Trinca de 3 cartas tem os 3 naipes diferentes. Com 4 ou mais, pode haver
//    UM naipe repetido (um par), nunca dois — por isso o máximo é 5 cartas.
//  - A mesa é de todos: na vez, o jogador divide, junta e rearruma qualquer
//    jogo, desde que ponha pelo menos 1 carta da mão e que, no fim, todos os
//    jogos da mesa estejam valendo. Carta da mesa nunca volta para a mão.
//  - Sem descarte. Na vez joga OU compra 1 do monte (a carta comprada só
//    joga na vez seguinte). Comprar é livre: pode comprar mesmo tendo jogada.
//  - Sem abertura mínima e sem pontuação: quem bate ganha, e acabou. Uma
//    rodada por partida.
//  - O monte zerou e o jogo segue; a rodada acaba quando alguém precisar
//    comprar e não houver carta. Ganha quem tem MENOS CARTAS na mão; empatou,
//    a menor soma (A=1 … K=13); empatou de novo, todos os empatados ganham.
//  - A vez dura 90 s. Estourou sem jogada confirmada: a mexida não vale (ela
//    nunca saiu do aparelho do jogador) e ele compra 1.
//  - A primeira partida abre o anfitrião; as seguintes, quem ganhou a anterior.
//
// A JOGADA É A MESA INTEIRA. O jogador mexe à vontade no aparelho dele (a vez
// é um rascunho) e manda, ao confirmar, como a mesa fica: a lista de jogos com
// os ids das cartas. O motor confere tudo de uma vez — que nenhuma carta da
// mesa sumiu, que as novas vieram da mão, que todo jogo vale. Assim não existe
// mesa pela metade no servidor, e "desfazer" é só não mandar.
// ============================================================================

export const MODO = 'mexemexe';
export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 6;
export const NIVEIS_DE_ROBO = ['facil', 'normal'];
export const BARALHOS = 2;
export const CARTAS_NA_MAO = 11;
export const MINIMO_DO_JOGO = 3;
export const VEZ_MS = 90_000;
// Quantas cartas compra quem deixa o tempo da vez acabar.
export const CASTIGO_DO_TEMPO = 1;
// O tempo da vez desta mesa: os testes de integração encurtam (opts.vezMs).
const vezMs = (state) => state.opts?.vezMs || VEZ_MS;

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rotulo = (rank) => RANK_LABELS[rank - 1] || '';
const NAIPES = ['♠', '♥', '♦', '♣'];   // a mesma ordem do engine.js
export const nomeCurto = (c) => `${rotulo(c.rank)}${NAIPES[c.suit] || ''}`;
// Para desempatar o fim pelo monte: cada carta vale o seu número (Ás 1, K 13).
export const valorDaCarta = (c) => c.rank;

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

function baralhos() {
  const cards = [];
  let id = 1;
  for (let b = 0; b < BARALHOS; b++) {
    for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) cards.push({ id: id++, rank, suit });
  }
  return cards;
}

function embaralha(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================================================
// O que é jogo
// ============================================================================

const faltaTexto = (q) => `Falta${q > 1 ? 'm' : ''} ${q} carta${q > 1 ? 's' : ''}`;

// Analisa um grupo de cartas. Sempre devolve as cartas na ordem de mostrar
// (sequência pelo valor, trinca pelo naipe) e, quando não vale, o motivo — é
// o mesmo texto que o rascunho mostra embaixo do jogo e que o servidor manda
// de volta ao recusar.
//   { ok, tipo: 's' | 't' | null, cards, motivo, falta }
// `falta` é quantas cartas faltam quando o que há até aqui ainda pode virar
// jogo (dois 7 de naipes diferentes: falta 1; 3♠ e 5♠: falta o 4♠).
export function analisaJogo(cartas) {
  const cards = [...cartas];
  const n = cards.length;
  if (!n) return { ok: false, tipo: null, cards: [], motivo: 'Jogo vazio.', falta: MINIMO_DO_JOGO };

  const mesmoValor = cards.every((c) => c.rank === cards[0].rank);
  const mesmoNaipe = cards.every((c) => c.suit === cards[0].suit);

  // Uma carta sozinha cai na sequência, que diz o mesmo "faltam 2".
  if (mesmoValor && n > 1) {
    const porNaipe = [0, 0, 0, 0];
    for (const c of cards) porNaipe[c.suit]++;
    const ordenadas = [...cards].sort((a, b) => a.suit - b.suit || a.id - b.id);
    const repetidos = porNaipe.filter((q) => q >= 2).length;
    if (porNaipe.some((q) => q > 2)) return { ok: false, tipo: 't', cards: ordenadas, motivo: 'Trinca não pode ter o mesmo naipe três vezes.' };
    if (repetidos > 1) return { ok: false, tipo: 't', cards: ordenadas, motivo: 'Trinca só pode repetir um naipe.' };
    // com naipe repetido a trinca precisa de 4: com 3, são 3 naipes diferentes
    const minimo = repetidos ? MINIMO_DO_JOGO + 1 : MINIMO_DO_JOGO;
    if (n < minimo) {
      const q = minimo - n;
      return {
        ok: false, tipo: 't', cards: ordenadas, falta: q,
        motivo: repetidos ? `${faltaTexto(q)}: com naipe repetido, a trinca precisa de 4.` : `${faltaTexto(q)}.`,
      };
    }
    return { ok: true, tipo: 't', cards: ordenadas, motivo: null };
  }

  if (mesmoNaipe) {
    const ranks = cards.map((c) => c.rank);
    const porValor = [...cards].sort((a, b) => a.rank - b.rank || a.id - b.id);
    if (new Set(ranks).size !== n) return { ok: false, tipo: 's', cards: porValor, motivo: 'Carta repetida na sequência.' };
    // O Ás embaixo (1) ou em cima (14): fica o jeito que deixa menos buraco.
    let melhor = null;
    for (const asEmCima of [false, true]) {
      if (asEmCima && !ranks.includes(1)) continue;
      const v = ranks.map((r) => (r === 1 && asEmCima ? 14 : r));
      const min = Math.min(...v), max = Math.max(...v);
      const buracos = max - min + 1 - n;
      if (!melhor || buracos < melhor.buracos) melhor = { v, min, max, buracos };
    }
    const ordenadas = cards.map((c, i) => [c, melhor.v[i]]).sort((a, b) => a[1] - b[1]).map(([c]) => c);
    if (melhor.buracos > 0) {
      if (ranks.includes(1) && ranks.includes(13) && ranks.includes(2)) {
        return { ok: false, tipo: 's', cards: ordenadas, motivo: 'K-A-2 não vale: o Ás fica embaixo (A-2-3) ou depois do K (Q-K-A).' };
      }
      const faltam = [];
      for (let x = melhor.min + 1; x < melhor.max; x++) if (!melhor.v.includes(x)) faltam.push(x);
      const naipe = NAIPES[cards[0].suit];
      const nomes = faltam.map((x) => `o ${rotulo(x === 14 ? 1 : x)}${naipe}`);
      const motivo = faltam.length <= 2
        ? `Falta ${nomes.join(' e ')} no meio da sequência.`
        : `A sequência tem buraco: faltam ${faltam.length} cartas no meio.`;
      return { ok: false, tipo: 's', cards: ordenadas, motivo, falta: Math.max(faltam.length, MINIMO_DO_JOGO - n) };
    }
    if (n < MINIMO_DO_JOGO) {
      return { ok: false, tipo: 's', cards: ordenadas, motivo: `${faltaTexto(MINIMO_DO_JOGO - n)}.`, falta: MINIMO_DO_JOGO - n };
    }
    return { ok: true, tipo: 's', cards: ordenadas, motivo: null };
  }

  return {
    ok: false, tipo: null,
    cards: [...cards].sort((a, b) => a.suit - b.suit || a.rank - b.rank || a.id - b.id),
    motivo: 'Misturou valores e naipes: jogo é sequência do mesmo naipe ou trinca do mesmo valor.',
  };
}

export const jogoVale = (cards) => analisaJogo(cards).ok;

// ============================================================================
// Partida
// ============================================================================

export function createGame(players, opts = {}) {
  return {
    modo: MODO,
    opts: { nivelRobos: 'normal', ...opts, rnd: undefined },
    players: players.map((p) => ({
      id: p.id, name: p.name, isBot: !!p.isBot,
      hand: [],
      vitorias: 0,        // partidas ganhas nesta sala (não é pontuação: é só para o placar)
    })),
    round: -1,
    phase: 'lobby',
    turn: 0,
    turnNo: 0,
    deck: [],
    mesa: [],             // [{ id, cards }] — os jogos, já na ordem de mostrar
    proximoJogo: 1,
    prazo: null,          // quando a vez atual estoura (ms desde a época)
    lastRound: null,      // { round, motivo: 'bateu' | 'monte', vencedores, maos }
    rnd: opts.rnd || Math.random,
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

function idxDe(state, id) {
  return state.players.findIndex((p) => p.id === id);
}

// A primeira partida abre o anfitrião (o primeiro da sala); as seguintes,
// quem ganhou a anterior. Empate no monte com mais de um vencedor: o primeiro
// deles na ordem da mesa.
function quemAbre(state) {
  const lr = state.lastRound;
  if (lr) {
    for (const id of lr.vencedores || []) {
      const i = idxDe(state, id);
      if (i >= 0) return i;
    }
    return state.round % state.players.length;
  }
  return 0;
}

export function startRound(state, agora = Date.now()) {
  const rnd = state.rnd || Math.random;
  state.round++;
  state.deck = embaralha(baralhos(), rnd);
  for (const p of state.players) p.hand = [];
  for (let k = 0; k < CARTAS_NA_MAO; k++) for (const p of state.players) p.hand.push(state.deck.pop());
  state.mesa = [];
  state.proximoJogo = 1;
  state.turnNo = 0;
  state.phase = 'play';
  state.turn = quemAbre(state);
  state.prazo = agora + vezMs(state);
  return [{ e: 'roundStart', round: state.round, first: state.players[state.turn].id }];
}

function passaVez(state, events, agora) {
  state.turn = (state.turn + 1) % state.players.length;
  state.turnNo++;
  state.prazo = agora + vezMs(state);
  return events;
}

const chaveDoJogo = (cards) => cards.map((c) => c.id).sort((a, b) => a - b).join(',');

// A JOGADA: `grupos` é a mesa como fica, uma lista de jogos, cada um uma lista
// de ids de carta. Ordem dentro do jogo não importa: o motor arruma.
export function actJogar(state, playerId, grupos, agora = Date.now()) {
  if (state.phase !== 'play') fail('Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  if (!Array.isArray(grupos) || grupos.length > 120) fail('Jogada inválida.');

  const naMesa = new Map();
  for (const j of state.mesa) for (const c of j.cards) naMesa.set(c.id, c);
  const naMao = new Map(p.hand.map((c) => [c.id, c]));
  const vistas = new Set();
  const daMao = [];
  const jogos = [];
  for (const ids of grupos) {
    if (!Array.isArray(ids) || ids.length > 13) fail('Jogada inválida.');
    if (!ids.length) continue;
    const cards = ids.map((id) => {
      if (!Number.isInteger(id)) fail('Jogada inválida.');
      if (vistas.has(id)) fail('A mesma carta apareceu em dois jogos.');
      vistas.add(id);
      const c = naMesa.get(id) || naMao.get(id);
      if (!c) fail('Essa carta não está na mesa nem na sua mão.');
      if (!naMesa.has(id)) daMao.push(c);
      return c;
    });
    jogos.push(cards);
  }
  for (const id of naMesa.keys()) {
    if (!vistas.has(id)) fail('Carta da mesa não volta para a mão: todas precisam continuar em algum jogo.');
  }
  if (!daMao.length) fail('Ponha pelo menos uma carta da sua mão na mesa.');
  const analisados = jogos.map(analisaJogo);
  const ruim = analisados.find((a) => !a.ok);
  if (ruim) fail(`${ruim.motivo} (${ruim.cards.map(nomeCurto).join(' ')})`);

  // Jogo que não mudou guarda o id: é o que deixa a tela saber o que é novo.
  const antigos = new Map(state.mesa.map((j) => [chaveDoJogo(j.cards), j.id]));
  const novasChaves = new Set(analisados.map((a) => chaveDoJogo(a.cards)));
  const mexeu = [...antigos.keys()].some((k) => !novasChaves.has(k));
  state.mesa = analisados.map((a) => {
    const id = antigos.get(chaveDoJogo(a.cards));
    return { id: id ?? state.proximoJogo++, cards: a.cards };
  });
  const saem = new Set(daMao.map((c) => c.id));
  p.hand = p.hand.filter((c) => !saem.has(c.id));

  const events = [{ e: 'jogou', p: p.id, cards: daMao, mexeu, restam: p.hand.length }];
  if (!p.hand.length) {
    events.push({ e: 'bateu', p: p.id });
    return fimDaRodada(state, events, 'bateu', [p.id]);
  }
  return passaVez(state, events, agora);
}

export function actComprar(state, playerId, agora = Date.now(), porTempo = false) {
  if (state.phase !== 'play') fail('Não é hora de comprar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  const events = [];
  if (porTempo) events.push({ e: 'estourou', p: p.id });
  if (!state.deck.length) {
    events.push({ e: 'semMonte', p: p.id });
    return fimPeloMonte(state, events);
  }
  const compradas = [];
  const qtd = porTempo ? CASTIGO_DO_TEMPO : 1;
  for (let k = 0; k < qtd && state.deck.length; k++) compradas.push(state.deck.pop());
  p.hand.push(...compradas);
  // O evento vai para a mesa toda: nada de id da carta nele. O id diz qual é
  // a carta (o baralho é montado em ordem), e quem comprou já a vê na mão.
  events.push({ e: 'comprou', p: p.id, n: compradas.length, porTempo });
  return passaVez(state, events, agora);
}

const somaDaMao = (hand) => hand.reduce((s, c) => s + valorDaCarta(c), 0);

function fimPeloMonte(state, events) {
  const menor = Math.min(...state.players.map((p) => p.hand.length));
  let quem = state.players.filter((p) => p.hand.length === menor);
  const menorSoma = Math.min(...quem.map((p) => somaDaMao(p.hand)));
  quem = quem.filter((p) => somaDaMao(p.hand) === menorSoma);
  return fimDaRodada(state, events, 'monte', quem.map((p) => p.id));
}

function fimDaRodada(state, events, motivo, vencedores) {
  for (const id of vencedores) playerById(state, id).vitorias++;
  state.phase = 'roundEnd';
  state.prazo = null;
  state.turnNo++;
  // No fim, as mãos se abrem: dá para ver o que cada um tinha.
  state.lastRound = {
    round: state.round, motivo, vencedores,
    maos: state.players.map((p) => ({ id: p.id, n: p.hand.length, soma: somaDaMao(p.hand), cards: p.hand.slice() })),
  };
  events.push({ e: 'roundEnd', round: state.round, motivo, vencedores });
  return events;
}

export function actNextRound(state, agora = Date.now()) {
  if (state.phase !== 'roundEnd') return [];
  return startRound(state, agora);
}

export function applyAction(state, playerId, action, agora = Date.now()) {
  switch (action?.a) {
    case 'jogar': return actJogar(state, playerId, action.mesa, agora);
    case 'comprar': return actComprar(state, playerId, agora);
    default: fail('Ação desconhecida.');
  }
}

// Fases em que alguém precisa agir (é onde o servidor agenda robô e cobrança).
export const FASES_DE_VEZ = ['play'];

// O RELÓGIO DA VEZ. O servidor pergunta quando é o próximo prazo e, nessa
// hora, chama `tick`: se a vez ainda é a mesma, ela estoura e o jogador compra.
export function proximoPrazo(state) {
  return state.phase === 'play' && state.prazo ? state.prazo : null;
}

export function tick(state, agora = Date.now()) {
  if (state.phase !== 'play' || !state.prazo || agora < state.prazo) return [];
  return actComprar(state, state.players[state.turn].id, agora, true);
}

// Depois de um reinício do servidor o prazo do retrato já venceu: a vez
// recomeça inteira.
export function retoma(state, agora = Date.now()) {
  if (state.phase === 'play') state.prazo = agora + vezMs(state);
}

export function viewFor(state, playerId, agora = Date.now()) {
  const me = playerById(state, playerId);
  return {
    modo: MODO,
    round: state.round,
    phase: state.phase,
    turnId: state.players[state.turn] ? state.players[state.turn].id : null,
    turnNo: state.turnNo,
    monte: state.deck.length,
    mesa: state.mesa.map((j) => ({ id: j.id, cards: j.cards })),
    restaMs: proximoPrazo(state) ? Math.max(0, state.prazo - agora) : null,
    vezMs: vezMs(state),
    lastRound: state.lastRound,
    // o que a mesa do Caçamba lê nos assentos, vazio aqui
    claims: [], contract: null,
    you: me ? { id: me.id, hand: me.hand } : null,
    players: state.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot,
      handCount: p.hand.length,
      vitorias: p.vitorias, score: p.vitorias,
      baixou: false, baixados: null, melds: [],
    })),
  };
}

// ============================================================================
// Robô
//
// O robô monta a mesa nova do mesmo jeito que o jogador: parte da mesa como
// está e da mão dele, e vai fazendo mexidas pequenas enquanto alguma couber.
// O fácil só baixa jogos inteiros da mão e encaixa cartas soltas; o normal
// também desmonta: tira carta que sobra de um jogo para fechar um novo com a
// mão, e parte uma sequência ao meio quando tem a carta repetida.
// No fim, a mesa inteira passa pela mesma conferência do motor; se algo não
// fechar, ele compra — robô nunca pode mandar jogada que o motor recuse, ou
// a sala ficaria parada esperando por ele.
// ============================================================================

// O jogo mais comprido que dá para fazer só com estas cartas.
function melhorJogoDe(cartas) {
  let melhor = null;
  const considera = (cards) => {
    if (cards.length >= MINIMO_DO_JOGO && (!melhor || cards.length > melhor.length) && jogoVale(cards)) melhor = cards;
  };
  for (let suit = 0; suit < 4; suit++) {
    const doNaipe = cartas.filter((c) => c.suit === suit);
    const porValor = new Map();
    for (const c of doNaipe) if (!porValor.has(c.rank)) porValor.set(c.rank, c);
    // trechos seguidos, com o Ás embaixo e depois com o Ás em cima
    for (const asEmCima of [false, true]) {
      const valores = asEmCima ? [...Array(13)].map((_, i) => i + 2) : [...Array(13)].map((_, i) => i + 1);
      let trecho = [];
      for (const v of valores) {
        const c = porValor.get(v === 14 ? 1 : v);
        if (c) { trecho.push(c); continue; }
        considera(trecho); trecho = [];
      }
      considera(trecho);
    }
  }
  for (let rank = 1; rank <= 13; rank++) {
    const doValor = cartas.filter((c) => c.rank === rank);
    const umDeCada = [];
    const sobra = [];
    for (const c of doValor) (umDeCada.some((x) => x.suit === c.suit) ? sobra : umDeCada).push(c);
    if (umDeCada.length >= MINIMO_DO_JOGO) {
      considera(sobra.length ? [...umDeCada, sobra[0]] : umDeCada);
      considera(umDeCada);
    }
  }
  return melhor;
}

// Tirar a carta `c` do jogo `j` deixa o que sobra valendo? Devolve os jogos
// que ficam no lugar dele (um, ou dois se a sequência partir ao meio), ou null.
function semACarta(j, c) {
  const resto = j.filter((x) => x.id !== c.id);
  if (!resto.length) return [];
  if (jogoVale(resto)) return [resto];
  const a = analisaJogo(j);
  if (a.tipo !== 's' || !a.ok) return null;
  const i = a.cards.findIndex((x) => x.id === c.id);
  const esq = a.cards.slice(0, i), dir = a.cards.slice(i + 1);
  if (jogoVale(esq) && jogoVale(dir)) return [esq, dir];
  return null;
}

export function planejaJogada(mesa, mao, { facil = false } = {}) {
  let jogos = mesa.map((cards) => [...cards]);
  let resto = [...mao];
  const tira = (cards) => { const ids = new Set(cards.map((c) => c.id)); resto = resto.filter((c) => !ids.has(c.id)); };

  for (let volta = 0; volta < 60; volta++) {
    // 1. um jogo inteiro da mão
    const novo = melhorJogoDe(resto);
    if (novo) { jogos.push(novo); tira(novo); continue; }

    // 2. carta da mão que encaixa num jogo da mesa
    let encaixou = false;
    for (const c of resto) {
      const j = jogos.findIndex((g) => jogoVale([...g, c]));
      if (j >= 0) { jogos[j] = [...jogos[j], c]; tira([c]); encaixou = true; break; }
    }
    if (encaixou) continue;
    if (facil) break;

    // 3. sequência partida ao meio pela carta repetida: 3-4-5-6-7 com um 5
    //    na mão vira 3-4-5 e 5-6-7
    let partiu = false;
    for (const c of resto) {
      for (let j = 0; j < jogos.length && !partiu; j++) {
        const a = analisaJogo(jogos[j]);
        if (a.tipo !== 's' || !a.ok) continue;
        const i = a.cards.findIndex((x) => x.rank === c.rank && x.suit === c.suit);
        if (i < 0) continue;
        const esq = a.cards.slice(0, i + 1), dir = [c, ...a.cards.slice(i + 1)];
        if (jogoVale(esq) && jogoVale(dir)) {
          jogos.splice(j, 1, esq, dir); tira([c]); partiu = true;
        }
      }
      if (partiu) break;
    }
    if (partiu) continue;

    // 4. duas da mão + uma que sobra num jogo da mesa (ou uma da mão + duas)
    const plano = emprestimo(jogos, resto);
    if (plano) { jogos = plano.jogos; tira(plano.daMao); continue; }
    break;
  }
  return { mesa: jogos, usadas: mao.length - resto.length, resto };
}

// Procura um jogo novo de 3 cartas que use 2 da mão e 1 emprestada da mesa,
// ou 1 da mão e 2 emprestadas — emprestada só a carta cuja saída deixa o jogo
// de onde veio valendo.
function emprestimo(jogos, mao) {
  const sobras = [];
  jogos.forEach((g, j) => { for (const c of g) if (semACarta(g, c)) sobras.push({ j, c }); });
  if (!sobras.length) return null;
  const aplica = (tiradas, novo) => {
    // tira em ordem, refazendo a conferência a cada carta (duas do mesmo jogo)
    let gs = jogos.map((g) => [...g]);
    for (const { c } of tiradas) {
      const j = gs.findIndex((g) => g.some((x) => x.id === c.id));
      const fica = semACarta(gs[j], c);
      if (!fica) return null;
      gs.splice(j, 1, ...fica);
    }
    return [...gs.filter((g) => g.length), novo];
  };
  for (let a = 0; a < mao.length; a++) {
    for (let b = a + 1; b < mao.length; b++) {
      for (const s of sobras) {
        const novo = [mao[a], mao[b], s.c];
        if (!jogoVale(novo)) continue;
        const gs = aplica([s], novo);
        if (gs) return { jogos: gs, daMao: [mao[a], mao[b]] };
      }
    }
  }
  for (const m of mao) {
    for (let x = 0; x < sobras.length; x++) {
      for (let y = x + 1; y < sobras.length; y++) {
        const novo = [m, sobras[x].c, sobras[y].c];
        if (!jogoVale(novo)) continue;
        const gs = aplica([sobras[x], sobras[y]], novo);
        if (gs) return { jogos: gs, daMao: [m] };
      }
    }
  }
  return null;
}

export function botNextAction(state, playerId) {
  if (state.phase !== 'play') return null;
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) return null;
  const facil = state.opts?.nivelRobos === 'facil';
  const plano = planejaJogada(state.mesa.map((j) => j.cards), p.hand, { facil });
  if (plano.usadas > 0) {
    const mesa = plano.mesa.map((g) => g.map((c) => c.id));
    // a mesma conferência do motor, numa cópia: se falhar, compra
    try {
      const copia = JSON.parse(JSON.stringify({ ...state, rnd: undefined }));
      actJogar(copia, playerId, mesa);
      return { a: 'jogar', mesa };
    } catch { /* cai para a compra */ }
  }
  return { a: 'comprar' };
}
