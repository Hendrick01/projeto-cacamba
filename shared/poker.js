// ============================================================================
// Poker — o quinto modo da casa: Texas Hold'em sem limite, valendo fichas.
// Mesmo baralho, mesma mesa, mesmo elenco; vive separado dos outros motores,
// como o presidente.js e o bazuca.js: a página só baixa a mesa dele quando
// alguém entra numa sala de Poker.
//
// Pedido do dono do jogo em 15/10/2026: "fichas com valores e as regras de
// poker". As regras são as do Texas Hold'em de torneio:
//  - Cada um recebe 2 cartas fechadas. Na mesa abrem 5 comunitárias: o flop
//    (3), o turn (1) e o river (1), com uma rodada de apostas antes do flop e
//    depois de cada abertura. Vale a melhor mão de 5 entre as 7 cartas.
//  - Botão do dealer, small blind e big blind giram uma cadeira por mão. No
//    mano a mano o botão é o small blind, fala primeiro antes do flop e por
//    último depois dele.
//  - Sem limite: aposta-se qualquer valor até todas as fichas (all-in). O
//    aumento mínimo é o tamanho do último aumento (no mínimo o big blind).
//    All-in que não completa um aumento NÃO reabre a aposta para quem já
//    falou: esse só paga ou corre.
//  - Quem fica sem fichas está fora; a partida acaba quando um só tem tudo.
//  - Potes paralelos: quem foi all-in só disputa o que conseguiu cobrir.
//    Empate divide o pote; a ficha que não divide vai para o primeiro
//    vencedor à esquerda do botão.
//  - Ordem das mãos: carta alta, par, dois pares, trinca, sequência (o Ás
//    também vale 1 na A-2-3-4-5), flush, full house, quadra, straight flush.
//    Naipe não desempata.
//
// AS FICHAS. Cada cor tem um valor (FICHAS); toda aposta é múltiplo da menor,
// e a pilha de cada um é desenhada com as cores certas (emFichas).
//
// REGRAS DA CASA que eu decidi e ele ainda não confirmou (ajustáveis aqui):
//  - 1.000 em fichas para cada um; blinds começam em 10/20 e sobem a cada
//    6 mãos (BLINDS, MAOS_POR_NIVEL). Sem ante.
//  - O botão da primeira mão é sorteado.
//  - No showdown todos os que chegaram mostram as cartas (sem esconder a mão
//    perdedora).
//  - A mão seguinte começa sozinha: o resultado fica à vista na mesa por uns
//    segundos, e os robôs esperam (pausaDoRobo) antes de agir.
//  - Quem sai da partida (ou cai e não volta) vai dando mesa ou correndo —
//    nunca aposta por ele — até as fichas acabarem nos blinds.
// ============================================================================

export const MODO = 'poker';
export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 8;
export const NIVEIS_DE_ROBO = ['facil', 'normal'];

// As fichas da casa, da maior para a menor. A menor é a unidade da mesa.
export const FICHAS = [
  { valor: 1000, cor: 'amarela' },
  { valor: 500, cor: 'roxa' },
  { valor: 100, cor: 'preta' },
  { valor: 25, cor: 'verde' },
  { valor: 5, cor: 'vermelha' },
];
export const FICHA_MINIMA = 5;
export const FICHAS_INICIAIS = 1000;
export const MAOS_POR_NIVEL = 6;
export const BLINDS = [
  [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
  [200, 400], [300, 600], [400, 800], [500, 1000], [750, 1500], [1000, 2000],
];

export const ETAPAS = ['preflop', 'flop', 'turn', 'river'];
export const NOME_DA_ETAPA = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River' };

// Fases em que alguém precisa agir (é onde o servidor agenda robô e cobrança).
export const FASES_DE_VEZ = ['play'];

const NAIPES = ['espadas', 'copas', 'ouros', 'paus'];   // índice do naipe em engine.js: ♠ ♥ ♦ ♣
const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rotulo = (rank) => RANK_LABELS[rank - 1] || '';

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

// O id da carta é fixo por carta (naipe × 13 + valor): o robô usa isso para
// saber o que ainda pode sair do baralho.
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

// Um valor em fichas, da maior para a menor: [{ valor, cor, n }]. Não é o
// menor número de fichas: é a pilha como ela fica na mesa, um pouco de cada
// cor, como no começo de um torneio (1.000 = 1×500, 4×100, 3×25, 5×5). Cada
// cor guarda pelo menos 4 da cor de baixo, para ter troco.
export function emFichas(total) {
  let resto = Math.max(0, Math.floor(Number(total) || 0));
  const pilhas = [];
  FICHAS.forEach((f, i) => {
    const menor = FICHAS[i + 1];
    const n = menor ? Math.max(0, Math.floor((resto - 4 * menor.valor) / f.valor)) : Math.floor(resto / f.valor);
    if (n > 0) { pilhas.push({ ...f, n }); resto -= n * f.valor; }
  });
  return pilhas;
}

// ============================================================================
// A força das mãos
// ============================================================================

const valorDe = (c) => (c.rank === 1 ? 14 : c.rank);
export const CATEGORIAS = ['Carta alta', 'Par', 'Dois pares', 'Trinca', 'Sequência', 'Flush', 'Full house', 'Quadra', 'Straight flush'];

// Cinco cartas → [categoria, desempates…]. Maior vence, comparado na ordem.
export function avaliaCinco(cards) {
  const vs = cards.map(valorDe).sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  let seq = 0;
  if (new Set(vs).size === 5) {
    if (vs[0] - vs[4] === 4) seq = vs[0];
    else if (vs[0] === 14 && vs[1] === 5) seq = 5;   // A-2-3-4-5: o Ás vale 1
  }
  const conta = new Map();
  for (const v of vs) conta.set(v, (conta.get(v) || 0) + 1);
  const g = [...conta].map(([v, n]) => ({ v, n })).sort((a, b) => b.n - a.n || b.v - a.v);
  if (seq && flush) return [8, seq];
  if (g[0].n === 4) return [7, g[0].v, g[1].v];
  if (g[0].n === 3 && g[1].n === 2) return [6, g[0].v, g[1].v];
  if (flush) return [5, ...vs];
  if (seq) return [4, seq];
  if (g[0].n === 3) return [3, g[0].v, ...g.slice(1).map((x) => x.v)];
  if (g[0].n === 2 && g[1].n === 2) return [2, g[0].v, g[1].v, g[2].v];
  if (g[0].n === 2) return [1, g[0].v, ...g.slice(1).map((x) => x.v)];
  return [0, ...vs];
}

export function compara(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1);
    if (d) return d;
  }
  return 0;
}

// A melhor mão de 5 entre 5, 6 ou 7 cartas.
export function melhorMao(cards) {
  const n = cards.length;
  if (n < 5) return { score: [-1], cards: [], nome: '', descricao: '' };
  let melhor = null, quais = null;
  const testa = (cinco) => {
    const s = avaliaCinco(cinco);
    if (!melhor || compara(s, melhor) > 0) { melhor = s; quais = cinco; }
  };
  // com 6 cartas sai uma; com 7, saem duas (21 combinações)
  if (n === 5) testa(cards);
  else if (n === 6) for (let a = 0; a < 6; a++) testa(cards.filter((_, i) => i !== a));
  else for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) testa(cards.filter((_, i) => i !== a && i !== b));
  return { score: melhor, cards: quais, nome: CATEGORIAS[melhor[0]], descricao: descreve(melhor, quais) };
}

const NOME = { 14: 'Ás', 13: 'Rei', 12: 'Dama', 11: 'Valete' };
const PLURAL = { 14: 'Ases', 13: 'Reis', 12: 'Damas', 11: 'Valetes' };
const nomeDe = (v) => NOME[v] || String(v);
const pluralDe = (v) => PLURAL[v] || String(v);
const ateO = (v) => (v === 12 ? 'a Dama' : `o ${nomeDe(v)}`);

export function descreve(score, cinco = []) {
  const [cat, a, b] = score;
  switch (cat) {
    case 0: return `Carta alta: ${nomeDe(a)}`;
    case 1: return `Par de ${pluralDe(a)}`;
    case 2: return `Dois pares: ${pluralDe(a)} e ${pluralDe(b)}`;
    case 3: return `Trinca de ${pluralDe(a)}`;
    case 4: return `Sequência até ${ateO(a)}`;
    case 5: return `Flush de ${NAIPES[cinco[0]?.suit] || ''}`.trim();
    case 6: return `Full house: ${pluralDe(a)} com ${pluralDe(b)}`;
    case 7: return `Quadra de ${pluralDe(a)}`;
    case 8: return a === 14 ? 'Royal flush' : `Straight flush até ${ateO(a)}`;
    default: return '';
  }
}

// ============================================================================
// A partida
// ============================================================================

export function createGame(players, opts = {}) {
  const fichas = Number.isInteger(opts.fichasIniciais) && opts.fichasIniciais > 0 ? opts.fichasIniciais : FICHAS_INICIAIS;
  return {
    modo: MODO,
    opts: { nivelRobos: 'normal', ...opts, rnd: undefined },
    players: players.map((p) => ({
      id: p.id, name: p.name, isBot: !!p.isBot,
      fichas,
      hand: [],
      aposta: 0,        // nesta rodada de apostas (a "rua")
      investido: 0,     // nesta mão, somando as ruas: é dele que saem os potes
      naMao: false,     // tinha ficha quando a mão começou
      foldou: false,
      allIn: false,
      agiu: false,      // já falou nesta rua (e ninguém reabriu depois)
      viuAoAgir: 0,     // a aposta da mesa quando ele falou: decide se pode reaumentar
      fora: false,      // sem fichas: assiste ao resto
      lugar: null,      // posição final (1 = campeão)
      maos: 0,          // mãos ganhas
    })),
    round: -1,          // número da mão
    phase: 'lobby',
    turn: 0,
    turnNo: 0,
    deck: [],
    board: [],
    etapa: 'preflop',
    botao: null, sb: null, bb: null,   // índices em players
    nivel: 0,
    apostaAtual: 0,
    ultimoAumento: 0,
    inicioDaRua: 0,     // turnNo em que a rua começou (pausa dos robôs)
    eliminados: [],     // ids, na ordem em que saíram
    ultimaMao: null,    // o resultado da mão anterior, para a mesa mostrar
    vencedor: null,
    rnd: opts.rnd || Math.random,
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

const maosPorNivel = (state) => (Number.isInteger(state.opts?.maosPorNivel) && state.opts.maosPorNivel > 0 ? state.opts.maosPorNivel : MAOS_POR_NIVEL);
export function blindsDaMao(state, round = state.round) {
  return BLINDS[Math.min(BLINDS.length - 1, Math.floor(Math.max(0, round) / maosPorNivel(state)))];
}

const ativo = (p) => p.naMao && !p.foldou;
const podeAgir = (p) => ativo(p) && !p.allIn;

// O próximo índice depois de `i` (na ordem da mesa) que satisfaz `pred`.
function proximo(state, i, pred) {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const j = (((i + k) % n) + n) % n;
    if (pred(state.players[j])) return j;
  }
  return -1;
}

function poe(p, valor) {
  const x = Math.max(0, Math.min(valor, p.fichas));
  p.fichas -= x; p.aposta += x; p.investido += x;
  if (p.fichas === 0) p.allIn = true;
  return x;
}

export const poteDe = (state) => state.players.reduce((s, p) => s + p.investido, 0);

export function startRound(state) {
  const rnd = state.rnd || Math.random;
  state.round++;
  const vivos = state.players.filter((p) => p.fichas > 0);
  for (const p of state.players) {
    Object.assign(p, { hand: [], aposta: 0, investido: 0, naMao: p.fichas > 0, foldou: false, allIn: false, agiu: false, viuAoAgir: 0 });
  }
  if (state.botao == null) {
    const sorteado = vivos[Math.floor(rnd() * vivos.length)];
    state.botao = state.players.indexOf(sorteado);
  } else {
    state.botao = proximo(state, state.botao, (p) => p.naMao);
  }

  const anteriores = blindsDaMao(state, state.round - 1);
  const [sbV, bbV] = blindsDaMao(state);
  state.nivel = BLINDS.indexOf(blindsDaMao(state));

  state.deck = embaralha(baralho(), rnd);
  state.board = [];
  state.etapa = 'preflop';
  state.corridaNaMao = false;
  // duas cartas para cada um, uma por vez, começando à esquerda do botão
  for (let r = 0; r < 2; r++) {
    let i = state.botao;
    for (let k = 0; k < vivos.length; k++) {
      i = proximo(state, i, (p) => p.naMao);
      state.players[i].hand.push(state.deck.pop());
    }
  }

  // No mano a mano o botão é o small blind.
  state.sb = vivos.length === 2 ? state.botao : proximo(state, state.botao, (p) => p.naMao);
  state.bb = proximo(state, state.sb, (p) => p.naMao);
  const sbP = state.players[state.sb], bbP = state.players[state.bb];
  const sbPos = poe(sbP, sbV);
  const bbPos = poe(bbP, bbV);
  // mesmo com o big blind curto, quem entra paga o big blind inteiro
  state.apostaAtual = bbV;
  state.ultimoAumento = bbV;
  state.inicioDaRua = state.turnNo;

  const events = [{
    e: 'roundStart', round: state.round,
    botao: state.players[state.botao].id, sb: sbP.id, bb: bbP.id,
    blinds: [sbV, bbV], subiu: state.round > 0 && bbV !== anteriores[1],
  }];
  events.push({ e: 'blinds', sb: sbP.id, bb: bbP.id, valores: [sbPos, bbPos] });
  state.phase = 'play';
  state.turn = state.bb;
  return proximaVez(state, events);
}

// Precisa falar: ainda pode apostar e não falou, ou falou e alguém aumentou.
const precisaAgir = (state, p) => podeAgir(p) && (!p.agiu || p.aposta < state.apostaAtual);

// Pode reaumentar: não falou nesta rua, ou alguém reabriu (um aumento
// completo, ou all-ins que somados dão um) desde que ele falou.
export function podeAumentar(state, p) {
  if (!podeAgir(p) || p.fichas + p.aposta <= state.apostaAtual) return false;
  return !p.agiu || state.apostaAtual - p.viuAoAgir >= state.ultimoAumento;
}

export const minimoParaAumentar = (state) => state.apostaAtual + state.ultimoAumento;

// Depois de cada ação (e no começo da mão): a mão acabou, a rua fechou, ou é
// a vez do próximo que precisa falar.
function proximaVez(state, events) {
  const ativos = state.players.filter(ativo);
  if (ativos.length === 1) return ganhaSemMostrar(state, events, ativos[0]);
  const agem = state.players.filter(podeAgir);
  const fechou = agem.length === 0
    || (agem.length === 1 && agem[0].aposta >= state.apostaAtual)
    || agem.every((p) => p.agiu && p.aposta === state.apostaAtual);
  if (!fechou) {
    const i = proximo(state, state.turn, (p) => precisaAgir(state, p));
    if (i >= 0) { state.turn = i; return events; }
  }
  return proximaEtapa(state, events);
}

// Recolhe as apostas da rua e abre a próxima carta. Sem ninguém para apostar
// (todos all-in, ou só um com fichas), abre tudo de uma vez até o showdown.
function proximaEtapa(state, events) {
  const [, bbV] = blindsDaMao(state);
  for (const p of state.players) { p.aposta = 0; p.agiu = false; p.viuAoAgir = 0; }
  state.apostaAtual = 0;
  state.ultimoAumento = bbV;
  const corrida = state.players.filter(podeAgir).length <= 1;
  while (state.etapa !== 'river') {
    state.etapa = ETAPAS[ETAPAS.indexOf(state.etapa) + 1];
    state.deck.pop();   // queima uma
    const novas = [];
    for (let k = 0; k < (state.etapa === 'flop' ? 3 : 1); k++) novas.push(state.deck.pop());
    state.board.push(...novas);
    events.push({ e: 'etapa', etapa: state.etapa, cards: novas, corrida });
    if (corrida) state.corridaNaMao = true;
    if (!corrida) {
      state.inicioDaRua = state.turnNo;
      // depois do flop fala primeiro quem está à esquerda do botão
      state.turn = proximo(state, state.botao, podeAgir);
      return events;
    }
  }
  return showdown(state, events);
}

// Os potes: um nível por all-in de quem ainda disputa. Cada pote leva de
// cada um o que ele pôs até aquele nível; disputa quem cobriu o nível.
export function montaPotes(state) {
  const niveis = [...new Set(state.players.filter(ativo).map((p) => p.investido))].sort((a, b) => a - b);
  const potes = [];
  let antes = 0;
  for (const nivel of niveis) {
    let valor = 0, pagantes = 0;
    for (const p of state.players) {
      const x = Math.max(0, Math.min(p.investido, nivel) - antes);
      valor += x;
      if (x > 0) pagantes++;
    }
    const elegiveis = state.players.filter((p) => ativo(p) && p.investido >= nivel).map((p) => p.id);
    const ultimo = potes[potes.length - 1];
    if (valor > 0) {
      if (ultimo && ultimo.elegiveis.length === elegiveis.length && ultimo.elegiveis.every((id) => elegiveis.includes(id))) {
        ultimo.valor += valor; ultimo.pagantes = Math.max(ultimo.pagantes, pagantes);
      } else potes.push({ valor, elegiveis, pagantes });
    }
    antes = nivel;
  }
  // o que quem correu pôs acima do maior nível ainda em disputa vai para o último pote
  const total = poteDe(state);
  const somado = potes.reduce((s, x) => s + x.valor, 0);
  if (potes.length && total > somado) potes[potes.length - 1].valor += total - somado;
  return potes;
}

// A ordem de quem recebe a ficha que não divide: à esquerda do botão.
function ordemAPartirDoBotao(state, ids) {
  const n = state.players.length;
  const pos = (id) => (state.players.findIndex((p) => p.id === id) - state.botao - 1 + 2 * n) % n;
  return [...ids].sort((a, b) => pos(a) - pos(b));
}

function reparte(state, valor, vencedores, ganhos) {
  const ordem = ordemAPartirDoBotao(state, vencedores);
  const unidades = Math.floor(valor / FICHA_MINIMA);
  const cada = Math.floor(unidades / ordem.length) * FICHA_MINIMA;
  let sobra = valor - cada * ordem.length;
  for (const id of ordem) {
    let leva = cada;
    if (sobra >= FICHA_MINIMA) { leva += FICHA_MINIMA; sobra -= FICHA_MINIMA; }
    ganhos[id] = (ganhos[id] || 0) + leva;
  }
  // o que nem chega a uma ficha (blind curto de all-in) vai ao primeiro
  if (sobra > 0) ganhos[ordem[0]] += sobra;
}

function showdown(state, events) {
  const ativos = state.players.filter(ativo);
  const avaliacao = new Map(ativos.map((p) => [p.id, melhorMao([...p.hand, ...state.board])]));
  const potes = montaPotes(state);
  const ganhos = {};
  const resumo = [];
  for (const pote of potes) {
    let vencedores;
    if (pote.elegiveis.length === 1) vencedores = pote.elegiveis.slice();
    else {
      let melhor = null;
      for (const id of pote.elegiveis) {
        const s = avaliacao.get(id).score;
        if (!melhor || compara(s, melhor) > 0) melhor = s;
      }
      vencedores = pote.elegiveis.filter((id) => compara(avaliacao.get(id).score, melhor) === 0);
    }
    reparte(state, pote.valor, vencedores, ganhos);
    // Só um disputando: se mais alguém pôs ficha ali (e correu), ele GANHOU
    // esse pote; se só ele pôs, é a aposta que ninguém cobriu voltando.
    resumo.push({
      valor: pote.valor, vencedores: ordemAPartirDoBotao(state, vencedores),
      devolvido: pote.elegiveis.length === 1 && pote.pagantes <= 1,
      mao: pote.elegiveis.length === 1 ? null : avaliacao.get(vencedores[0]).descricao,
    });
  }
  const mostradas = ativos.map((p) => {
    const a = avaliacao.get(p.id);
    return { p: p.id, cards: p.hand.slice(), mao: a.descricao, nome: a.nome, cinco: a.cards.map((c) => c.id) };
  });
  return fimDaMao(state, events, { ganhos, potes: resumo, mostradas, semShowdown: false });
}

function ganhaSemMostrar(state, events, vencedor) {
  const total = poteDe(state);
  const ganhos = { [vencedor.id]: total };
  return fimDaMao(state, events, {
    ganhos, potes: [{ valor: total, vencedores: [vencedor.id], devolvido: false, mao: null }],
    mostradas: [], semShowdown: true,
  });
}

function fimDaMao(state, events, r) {
  const inicio = new Map(state.players.map((p) => [p.id, p.fichas + p.investido]));
  for (const [id, valor] of Object.entries(r.ganhos)) playerById(state, id).fichas += valor;
  const levaram = new Set(r.potes.filter((x) => !x.devolvido).flatMap((x) => x.vencedores));
  for (const id of levaram) playerById(state, id).maos++;

  // Quem zerou está fora. Saindo dois na mesma mão, fica mais bem colocado
  // quem começou a mão com mais fichas.
  const zerados = state.players.filter((p) => p.naMao && p.fichas === 0)
    .sort((a, b) => inicio.get(a.id) - inicio.get(b.id));
  const vivos = state.players.filter((p) => p.fichas > 0).length;
  zerados.forEach((p, k) => {
    p.fora = true;
    p.lugar = vivos + zerados.length - k;
    state.eliminados.push(p.id);
  });

  state.ultimaMao = {
    n: state.round,
    board: state.board.slice(),
    etapa: state.etapa,
    pote: poteDe(state),
    corrida: !!state.corridaNaMao,   // a mesa abriu sozinha (todos all-in)
    ...r,
    eliminados: zerados.map((p) => p.id),
  };
  // As fichas já foram para quem ganhou: a mão deixa de ter apostas na mesa.
  for (const p of state.players) { p.aposta = 0; p.investido = 0; }
  events.push({ e: 'maoFim', ...state.ultimaMao });
  for (const p of zerados) events.push({ e: 'eliminado', p: p.id, lugar: p.lugar });

  if (vivos <= 1) {
    const campeao = state.players.find((p) => p.fichas > 0) || state.players[0];
    campeao.lugar = 1;
    state.vencedor = campeao.id;
    state.phase = 'gameEnd';
    events.push({ e: 'gameEnd', vencedor: campeao.id });
    return events;
  }
  state.turnNo++;
  return [...events, ...startRound(state)];
}

// ---- as ações ---------------------------------------------------------------

function daVez(state, playerId) {
  if (state.phase !== 'play') fail('Não é hora de apostar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  return p;
}

function falou(state, p) {
  p.agiu = true;
  p.viuAoAgir = state.apostaAtual;
  state.turnNo++;
}

export function actCorrer(state, playerId) {
  const p = daVez(state, playerId);
  p.foldou = true;
  falou(state, p);
  return proximaVez(state, [{ e: 'correu', p: p.id }]);
}

export function actMesa(state, playerId) {
  const p = daVez(state, playerId);
  if (p.aposta < state.apostaAtual) fail(`Tem aposta de ${state.apostaAtual} na mesa: pague, aumente ou corra.`);
  falou(state, p);
  return proximaVez(state, [{ e: 'mesa', p: p.id }]);
}

export function actPagar(state, playerId) {
  const p = daVez(state, playerId);
  if (p.aposta >= state.apostaAtual) fail('Não há aposta para pagar: dê mesa.');
  const valor = poe(p, state.apostaAtual - p.aposta);
  falou(state, p);
  return proximaVez(state, [{ e: 'pagou', p: p.id, valor, allIn: p.allIn }]);
}

// `para`: a aposta total dele nesta rua depois de aumentar (não o acréscimo).
export function actAumentar(state, playerId, para) {
  const p = daVez(state, playerId);
  para = Math.floor(Number(para));
  if (!Number.isFinite(para)) fail('Diga quanto quer apostar.');
  const max = p.aposta + p.fichas;
  if (para > max) fail('Você não tem fichas para tanto.');
  if (para <= state.apostaAtual) {
    fail(state.apostaAtual ? `Para aumentar, vá acima de ${state.apostaAtual}.` : 'Escolha quanto apostar.');
  }
  if (!podeAumentar(state, p)) fail('O aumento não reabriu a aposta para você: pague ou corra.');
  const allIn = para === max;
  if (!allIn) {
    const min = minimoParaAumentar(state);
    if (para < min) fail(`O mínimo é ${min}${state.apostaAtual ? ' (o último aumento de novo)' : ' (o big blind)'}.`);
    if (para % FICHA_MINIMA) fail(`Aposte em múltiplos de ${FICHA_MINIMA}: é a menor ficha da mesa.`);
  }
  const abriu = state.apostaAtual === 0;
  const aumento = para - state.apostaAtual;
  poe(p, para - p.aposta);
  if (aumento >= state.ultimoAumento) {
    state.ultimoAumento = aumento;
    for (const o of state.players) if (o !== p) o.agiu = false;   // reabre para todo mundo
  }
  state.apostaAtual = para;
  falou(state, p);
  return proximaVez(state, [{ e: abriu ? 'apostou' : 'aumentou', p: p.id, para, allIn: p.allIn }]);
}

export function actAllIn(state, playerId) {
  const p = daVez(state, playerId);
  if (p.fichas + p.aposta <= state.apostaAtual) return actPagar(state, playerId);
  return actAumentar(state, playerId, p.fichas + p.aposta);
}

export function actNextRound() { return []; }   // a mão seguinte começa sozinha

export function applyAction(state, playerId, action) {
  switch (action.a) {
    case 'correr': return actCorrer(state, playerId);
    case 'mesa': return actMesa(state, playerId);
    case 'pagar': return actPagar(state, playerId);
    case 'aumentar': return actAumentar(state, playerId, action.para);
    case 'allin': return actAllIn(state, playerId);
    default: fail('Ação desconhecida.');
  }
}

// Quanto o robô espera antes de agir, além do ritmo normal: o resultado da mão
// anterior e a carta que acabou de abrir precisam de tempo para serem lidos.
export function pausaDoRobo(state) {
  if (state.phase !== 'play' || state.turnNo !== state.inicioDaRua) return 0;
  if (state.etapa !== 'preflop') return 700;
  const u = state.ultimaMao;
  if (!u) return 600;
  return u.semShowdown ? 1800 : u.corrida ? 6000 : 4500;
}

export function viewFor(state, playerId) {
  const me = playerById(state, playerId);
  const vez = state.phase === 'play' ? state.players[state.turn] : null;
  const [sbV, bbV] = blindsDaMao(state);
  const proximos = BLINDS[Math.min(BLINDS.length - 1, state.nivel + 1)];
  const minhaVez = !!(vez && me && vez.id === me.id);
  const nome = (i) => (i != null && state.players[i] ? state.players[i].id : null);
  return {
    modo: MODO,
    round: state.round,
    phase: state.phase,
    turnId: vez ? vez.id : null,
    turnNo: state.turnNo,
    etapa: state.etapa,
    board: state.board.slice(),
    pote: poteDe(state),
    apostaAtual: state.apostaAtual,
    blinds: [sbV, bbV],
    nivel: state.nivel,
    proximosBlinds: proximos[1] !== bbV ? proximos : null,
    maosParaSubir: maosPorNivel(state) - (Math.max(0, state.round) % maosPorNivel(state)),
    botao: nome(state.botao), sb: nome(state.sb), bb: nome(state.bb),
    ultimaMao: state.ultimaMao,
    vencedor: state.vencedor,
    // o que a mesa do Caçamba lê nos assentos, vazio aqui
    claims: [], contract: null,
    you: me
      ? {
        id: me.id, hand: me.hand.slice(), fichas: me.fichas, aposta: me.aposta,
        paraPagar: Math.min(me.fichas, Math.max(0, state.apostaAtual - me.aposta)),
        podeMesa: minhaVez && me.aposta >= state.apostaAtual,
        podeAumentar: minhaVez && podeAumentar(state, me),
        minPara: Math.min(minimoParaAumentar(state), me.aposta + me.fichas),
        maxPara: me.aposta + me.fichas,
      }
      : null,
    players: state.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot,
      handCount: state.phase === 'play' && ativo(p) ? 2 : 0,
      fichas: p.fichas, aposta: p.aposta, investido: p.investido,
      naMao: p.naMao, foldou: p.foldou, allIn: p.allIn,
      fora: p.fora, lugar: p.lugar, maos: p.maos,
      score: p.fichas,
      baixou: false, baixados: null, melds: [],
    })),
  };
}

// ============================================================================
// Robô
// ============================================================================

// A chance de a mão dele ganhar, sorteando as cartas que ninguém viu: as dos
// outros e as que faltam abrir. Não espia ninguém.
export function equidade(state, p, iteracoes, rnd = state.rnd || Math.random) {
  const oponentes = state.players.filter((o) => o !== p && ativo(o)).length;
  if (!oponentes) return 1;
  const conhecidas = new Set([...p.hand, ...state.board].map((c) => c.id));
  const resto = baralho().filter((c) => !conhecidas.has(c.id));
  const faltam = 5 - state.board.length;
  const precisa = faltam + 2 * oponentes;
  let pontos = 0;
  for (let it = 0; it < iteracoes; it++) {
    for (let i = 0; i < precisa; i++) {
      const j = i + Math.floor(rnd() * (resto.length - i));
      [resto[i], resto[j]] = [resto[j], resto[i]];
    }
    const mesa = [...state.board, ...resto.slice(0, faltam)];
    const minha = melhorMao([...p.hand, ...mesa]).score;
    let melhorOutro = null, empatados = 0, perdeu = false;
    for (let k = 0; k < oponentes; k++) {
      const s = melhorMao([resto[faltam + 2 * k], resto[faltam + 2 * k + 1], ...mesa]).score;
      const d = compara(s, minha);
      if (d > 0) { perdeu = true; break; }
      if (d === 0) empatados++;
      if (!melhorOutro || compara(s, melhorOutro) > 0) melhorOutro = s;
    }
    if (!perdeu) pontos += 1 / (empatados + 1);
  }
  return pontos / iteracoes;
}

const arredonda = (v) => Math.round(v / FICHA_MINIMA) * FICHA_MINIMA;

export function botNextAction(state, playerId) {
  if (state.phase !== 'play') return null;
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) return null;
  const paraPagar = Math.max(0, state.apostaAtual - p.aposta);
  // Gente que caiu ou saiu: o jogo não aposta as fichas de quem não está.
  if (!p.isBot) return paraPagar > 0 ? { a: 'correr' } : { a: 'mesa' };

  const rnd = state.rnd || Math.random;
  const facil = state.opts?.nivelRobos === 'facil';
  const oponentes = state.players.filter((o) => o !== p && ativo(o)).length;
  const iteracoes = Math.max(80, 260 - 25 * oponentes);
  let eq = equidade(state, p, iteracoes, rnd);
  if (facil) eq = eq * 0.6 + rnd() * 0.4;   // o fácil lê mal a própria mão
  // Vantagem: 0 é uma mão média nesta mesa, 1 é ganhar sempre. Com 1
  // adversário a média ganha metade; com 5, um sexto.
  const media = 1 / (oponentes + 1);
  const vant = (eq - media) / (1 - media);
  const pote = poteDe(state);
  const odds = paraPagar / (pote + paraPagar);
  const [, bbV] = blindsDaMao(state);
  const r = rnd();

  // Aumentar (ou abrir aposta)
  const querAumentar = facil
    ? vant > 0.55 && r < 0.6
    : vant > 0.45 || (vant > 0.22 && r < 0.45)
      || (paraPagar === 0 && state.etapa !== 'preflop' && r < 0.07);   // um blefe de vez em quando
  if (querAumentar && podeAumentar(state, p)) {
    const max = p.aposta + p.fichas;
    const min = minimoParaAumentar(state);
    let para = state.apostaAtual + Math.max(state.ultimoAumento, arredonda((pote + paraPagar) * (0.45 + rnd() * 0.55)));
    if (!facil && eq > 0.8 && rnd() < 0.25) para = max;
    para = Math.max(min, arredonda(para));
    if (para >= max || max - para < bbV) para = max;   // sobrar quase nada não vale a pena
    if (para > state.apostaAtual) return { a: 'aumentar', para };
  }
  if (paraPagar === 0) return { a: 'mesa' };
  const vaiTudo = paraPagar >= p.fichas;
  const margem = facil ? -0.06 : (vaiTudo ? 0.08 : 0.03);
  if (eq > odds + margem || (!facil && vant > 0.1 && paraPagar <= bbV * 2)) return { a: 'pagar' };
  return { a: 'correr' };
}
