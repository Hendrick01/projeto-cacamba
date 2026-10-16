// ============================================================================
// Canastra — a convencional e a "do 3". Vive separada do engine.js do Caçamba,
// como os outros modos: um não importa nada do outro, e a página só baixa este
// arquivo quando alguém entra numa sala de Canastra.
//
// O que as duas têm em comum (combinado com o dono em 15–16/10/2026):
//  - 1 contra 1 ou 2 contra 2 (cadeiras 0+2 contra 1+3). Cada baralho tem 2
//    jokers.
//  - Coringa é o 2 e o joker, no máximo 1 por jogo. O 2 do mesmo naipe na casa
//    do 2 (A-2-3♠) é carta normal: não conta como coringa.
//  - Jogo é SEQUÊNCIA do mesmo naipe ou TRINCA do mesmo valor, sempre com pelo
//    menos 3 cartas. O Ás vale embaixo (A-2-3) e em cima (Q-K-A); K-A-2 não
//    vale. A trinca nasce com naipes diferentes; depois entra qualquer carta do
//    mesmo valor. Cada lado só mexe nos próprios jogos.
//  - CANASTRA é o jogo com 7 cartas ou mais. A do Ás ao Ás, limpa, vale 1.000.
//  - Na vez: compra 1 do monte OU pega o LIXO inteiro (o "bagaço") — e a carta
//    de cima tem que ir para um jogo na hora. Depois baixa o que quiser e
//    descarta 1. Para ABRIR o lado, a primeira baixada soma um mínimo de pontos.
//  - Para BATER (esvaziar a mão de vez) o lado precisa de canastra limpa. A
//    mesa soma, a mão desconta. Partida até 3.000.
//
// CONVENCIONAL (as perguntas de 15–16/10): 11 cartas e um MORTO de 11 para
// cada jogador (3 baralhos no 2v2). Quem esvazia a mão pega o seu morto — se
// foi baixando, segue jogando; se foi no descarte, joga com ele na próxima vez
// — e só bate quem já pegou o próprio morto; morto na mesa custa 100. Cartas:
// 3 a 7 valem 5, 8 a K 10, o 2 10, o Ás 15, o joker 20. Canastra limpa (sem
// coringa nenhum) 300, suja 200, do Ás ao K 500. Batida 100. Abertura 50 até
// 1.495 no placar, 90 de 1.500 em diante. O 3 é carta comum.
//
// DO 3 (os áudios que o dono mandou em 16/10, com as dúvidas tiradas com ele):
// 15 cartas, sem morto, 2 baralhos também no 2v2. O 3 nunca entra em jogo (na
// sequência, depois do 2 vem o 4); o 3 vermelho vai para a mesa na hora em que
// chega, vale +100, e quem o recebe compra outra; o 3 preto, o 2 e o joker
// descartados trancam o lixo para o seguinte. Cartas: 4 a 7 valem 5, 8 a K
// 10, o Ás 20, o 2 20, o joker 50, o 3 nada. Abertura: 75, sempre, e o
// coringa não conta para ela — o joker e o 2 fora da casa dele; o 2 na casa
// dele (A-2-4♠) é carta normal, não suja e conta. O joker não suja a canastra
// ("com bezzigue" ela continua limpa): só o 2 suja. Limpa 500, suja 250. A
// trinca pode nascer com
// um coringa (dois ases de naipes diferentes e um 2). Só pega o lixo quem já
// abriu, e a carta de cima tem que formar um jogo NOVO. Batida 200. No fim da
// rodada (batida ou monte), o lado sem canastra limpa fica com −500 cravado.
//
// Regras da casa (propostas por nós, aceitas pelo dono): o monte que acaba
// sem batida fecha a rodada — inclusive quando falta carta para repor um 3
// vermelho; quem abre a rodada vai em rodízio; na convencional a de 500
// aceita coringa. As faixas da abertura da convencional são as da canastra
// clássica: a nossa primeira proposta (90 a partir de 1.000, 120 a partir de
// 2.000) travava o fim da partida — com 11 cartas, 120 de uma vez quase nunca
// sai (em partidas de robôs, 1 abertura em 9 tentativas).
// ============================================================================

export const MODO = 'canastra';
export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 4;
export const FORMATOS = { '1v1': 2, '2v2': 4 };
export const VARIANTES = ['convencional', 'do3'];
export const NOME_DA_VARIANTE = { convencional: 'Canastra', do3: 'Canastra do 3' };
export const NIVEIS_DE_ROBO = ['facil', 'normal'];
export const CORINGAS_POR_BARALHO = 2;
export const MINIMO_DO_JOGO = 3;
export const TAMANHO_DA_CANASTRA = 7;
export const CORINGAS_POR_JOGO = 1;
export const META = 3000;
export const BONUS_DO_TRES_VERMELHO = 100;

// O que muda de uma variante para a outra.
//   valor     — quanto cada carta vale na conta (baixa = 4 a 7, alta = 8 a K)
//   abertura  — o mínimo da primeira baixada do lado, conforme o placar dele
//   doisAbre / jokerAbre — se o 2 que faz papel de coringa e o joker contam
//               para esse mínimo (o 2 na casa dele é carta normal e sempre conta)
//   jokerSuja — se o joker deixa a canastra suja (o 2 fora da casa sempre suja)
//   semLimpa  — o que o lado sem canastra limpa leva no fim da rodada, cravado
//   lixo      — soDepoisDeAbrir: só pega quem já abriu; soJogoNovo: a de cima
//               forma jogo novo (não vale encaixar)
export const REGRAS = {
  convencional: {
    cartasNaMao: 11, cartasNoMorto: 11, baralhos: { '1v1': 2, '2v2': 3 },
    valor: { joker: 20, as: 15, dois: 10, tres: 5, baixa: 5, alta: 10 },
    bonus: { limpa: 300, suja: 200, 500: 500, mil: 1000 },
    batida: 100, multaDoMorto: 100, semLimpa: null,
    abertura: [
      { abaixoDe: 1500, minimo: 50 },
      { abaixoDe: 3000, minimo: 90 },
      { abaixoDe: Infinity, minimo: 120 },
    ],
    doisAbre: true, jokerAbre: true, jokerSuja: true,
    trincaNasceComCoringa: false,
    lixo: { soDepoisDeAbrir: false, soJogoNovo: false },
  },
  do3: {
    cartasNaMao: 15, cartasNoMorto: 0, baralhos: { '1v1': 2, '2v2': 2 },
    valor: { joker: 50, as: 20, dois: 20, tres: 0, baixa: 5, alta: 10 },
    bonus: { limpa: 500, suja: 250, mil: 1000 },
    batida: 200, multaDoMorto: 0, semLimpa: -500,
    abertura: [{ abaixoDe: Infinity, minimo: 75 }],
    doisAbre: false, jokerAbre: false, jokerSuja: false,
    trincaNasceComCoringa: true,
    lixo: { soDepoisDeAbrir: true, soJogoNovo: true },
  },
};
export const regrasDa = (variante) => REGRAS[variante] || REGRAS.convencional;

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rotulo = (rank) => RANK_LABELS[rank - 1] || '';
const NAIPES = ['♠', '♥', '♦', '♣'];   // a mesma ordem do engine.js
export const nomeCurto = (c) => (c.joker ? 'coringa' : `${rotulo(c.rank)}${NAIPES[c.suit] || ''}`);

export const ehJoker = (c) => !!c && c.joker === true;
export const ehDois = (c) => !!c && !c.joker && c.rank === 2;
// Coringa "de nascença". O 2 do naipe na casa dele vira carta normal, mas isso
// só a análise do jogo sabe dizer.
export const ehCoringa = (c) => ehJoker(c) || ehDois(c);
export const ehTresVermelho = (c) => !!c && !c.joker && c.rank === 3 && (c.suit === 1 || c.suit === 2);
export const ehTresPreto = (c) => !!c && !c.joker && c.rank === 3 && (c.suit === 0 || c.suit === 3);

export function valorDaCarta(c, variante = 'convencional') {
  const v = regrasDa(variante).valor;
  if (ehJoker(c)) return v.joker;
  if (c.rank === 1) return v.as;
  if (c.rank === 2) return v.dois;
  if (c.rank === 3) return v.tres;
  return c.rank <= 7 ? v.baixa : v.alta;
}
export const somaDe = (cards, variante) => cards.reduce((s, c) => s + valorDaCarta(c, variante), 0);
// O que a carta vale para ABRIR o lado quando entra como coringa: na do 3, o
// joker e o 2 fazendo papel de coringa não contam.
export function valorNaAbertura(c, variante = 'convencional') {
  const r = regrasDa(variante);
  if ((ehJoker(c) && !r.jokerAbre) || (ehDois(c) && !r.doisAbre)) return 0;
  return valorDaCarta(c, variante);
}
// O que os jogos novos somam para abrir. Quem diz se o 2 é coringa ou carta
// normal (na casa dele, A-2-4♠) é a análise do jogo: o normal sempre conta.
export function somaNaAbertura(jogos, variante = 'convencional') {
  let soma = 0;
  for (const cards of jogos) {
    const a = analisaJogo(cards, variante, { formacao: true });
    const fazCoringa = new Set(a.ok ? a.coringasIds : cards.filter(ehCoringa).map((c) => c.id));
    for (const c of cards) soma += fazCoringa.has(c.id) ? valorNaAbertura(c, variante) : valorDaCarta(c, variante);
  }
  return soma;
}

// Na do 3, descartar o 3 preto ou um coringa tranca o lixo para o seguinte.
export const trancaOLixo = (c, variante) => variante === 'do3' && (ehTresPreto(c) || ehCoringa(c));

// A ESCADA da sequência: a ordem dos valores, com o Ás nas duas pontas. Na do 3
// o 3 não existe, e depois do 2 vem o 4.
const ESCADA = {
  convencional: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1],
  do3: [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1],
};
export const escadaDa = (variante) => ESCADA[variante] || ESCADA.convencional;

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

function baralhos(n) {
  const cards = [];
  let id = 1;
  for (let b = 0; b < n; b++) {
    for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) cards.push({ id: id++, rank, suit });
    for (let j = 0; j < CORINGAS_POR_BARALHO; j++) cards.push({ id: id++, rank: 0, suit: -1, joker: true });
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
const ordemNeutra = (cards) => [...cards].sort((a, b) => (a.joker - b.joker) || a.suit - b.suit || a.rank - b.rank || a.id - b.id);
const ruim = (tipo, cards, motivo, falta) => ({ ok: false, tipo, cards, motivo, ...(falta ? { falta } : {}) });

// O jogo vale: diz se é limpo e, com 7 ou mais, qual canastra é. Limpo é o
// jogo sem coringa que suje — na do 3 o joker não suja, só o 2. A de mil é a
// sequência limpa do Ás de baixo ao Ás de cima; a de 500 (só na convencional),
// a que vai do Ás ao K.
function fecha(tipo, cards, coringas, variante, lo = null, hi = null, ultimo = null) {
  const r = regrasDa(variante);
  const limpa = !coringas.some((w) => r.jokerSuja || ehDois(w));
  let canastra = null;
  if (cards.length >= TAMANHO_DA_CANASTRA) {
    if (tipo === 's' && lo === 0 && hi === ultimo && limpa && r.bonus.mil) canastra = 'mil';
    else if (tipo === 's' && lo === 0 && hi >= ultimo - 1 && r.bonus[500]) canastra = '500';
    else canastra = limpa ? 'limpa' : 'suja';
  }
  return { ok: true, tipo, cards, motivo: null, coringas: coringas.length, coringasIds: coringas.map((w) => w.id), limpa, canastra };
}

// Analisa um grupo de cartas. Sempre devolve as cartas na ordem de mostrar e,
// quando não vale, o motivo — o mesmo texto que a mesa mostra e que o servidor
// manda de volta ao recusar.
//   { ok, tipo: 's' | 't' | null, cards, motivo, falta, coringas, limpa, canastra }
// `formacao`: o jogo está nascendo agora (a trinca precisa dos naipes).
export function analisaJogo(cartas, variante = 'convencional', { formacao = false } = {}) {
  const cards = [...cartas];
  if (!cards.length) return ruim(null, [], 'Jogo vazio.', MINIMO_DO_JOGO);
  if (variante === 'do3' && cards.some((c) => !c.joker && c.rank === 3)) {
    return ruim(null, ordemNeutra(cards), 'Na Canastra do 3, o 3 não entra em jogo.');
  }
  const firmes = cards.filter((c) => !ehCoringa(c));
  if (!firmes.length) {
    return ruim(null, ordemNeutra(cards), cards.length < MINIMO_DO_JOGO ? 'Escolha as cartas do jogo junto com o coringa.' : 'Jogo só de coringa não vale.');
  }
  const mesmoValor = firmes.every((c) => c.rank === firmes[0].rank);
  const mesmoNaipe = firmes.every((c) => c.suit === firmes[0].suit);
  if (mesmoValor && firmes.length >= 2) return analisaTrinca(cards, firmes, formacao, variante);
  if (mesmoNaipe) return analisaSequencia(cards, firmes, variante);
  return ruim(null, ordemNeutra(cards), 'Misturou valores e naipes: jogo é sequência do mesmo naipe ou trinca do mesmo valor.');
}

// A trinca nasce com naipes diferentes: 3 na convencional; na do 3 um coringa
// pode tomar o lugar do terceiro (dois ases de naipes diferentes e um 2).
function analisaTrinca(cards, firmes, formacao, variante) {
  const coringas = cards.filter(ehCoringa);
  const ordenadas = [...firmes].sort((a, b) => a.suit - b.suit || a.id - b.id).concat(coringas);
  if (coringas.length > CORINGAS_POR_JOGO) return ruim('t', ordenadas, 'Só cabe 1 coringa por jogo.');
  if (formacao) {
    const comCoringa = regrasDa(variante).trincaNasceComCoringa;
    const naipes = new Set(firmes.map((c) => c.suit)).size + (comCoringa ? coringas.length : 0);
    if (naipes < 3) {
      const q = 3 - naipes;
      return ruim('t', ordenadas, comCoringa
        ? `A trinca nasce com naipes diferentes: falta${q > 1 ? 'm' : ''} ${q}.`
        : `Para formar a trinca são 3 naipes diferentes: falta${q > 1 ? 'm' : ''} ${q}.`, q);
    }
  }
  if (cards.length < MINIMO_DO_JOGO) return ruim('t', ordenadas, `${faltaTexto(MINIMO_DO_JOGO - cards.length)}.`, MINIMO_DO_JOGO - cards.length);
  return fecha('t', ordenadas, coringas, variante);
}

function analisaSequencia(cards, firmes, variante) {
  const escada = escadaDa(variante);
  const ultimo = escada.length - 1;
  const naipe = firmes[0].suit;
  const nomeDe = (i) => `o ${rotulo(escada[i])}${NAIPES[naipe]}`;
  // O 2 do naipe pode ser carta normal (na casa dele) ou coringa: tenta os
  // dois jeitos e fica com o mais limpo que valer.
  const doisDoNaipe = cards.find((c) => ehDois(c) && c.suit === naipe);
  let melhor = null;
  let erro = null;   // o motivo do jeito que chegou mais perto
  const anota = (motivo, falta = 0) => { if (!erro || (falta && (!erro.falta || falta < erro.falta))) erro = { motivo, falta }; };

  for (const natural2 of doisDoNaipe ? [doisDoNaipe, null] : [null]) {
    const naturais = natural2 ? [...firmes, natural2] : firmes;
    const coringas = cards.filter((c) => ehCoringa(c) && c !== natural2);
    if (coringas.length > CORINGAS_POR_JOGO) { anota('Só cabe 1 coringa por jogo.'); continue; }
    const ases = naturais.filter((c) => c.rank === 1);
    if (ases.length > 2) { anota('Ás demais: a sequência só tem o Ás de baixo e o de cima.'); continue; }
    const pos = new Map();
    let repetida = false;
    for (const c of naturais) {
      if (c.rank === 1) continue;
      const i = escada.indexOf(c.rank);
      if (pos.has(i)) repetida = true;
      pos.set(i, c);
    }
    if (repetida) { anota('Carta repetida na sequência.'); continue; }
    const jeitos = ases.length === 2 ? [[0, ultimo]] : ases.length === 1 ? [[0], [ultimo]] : [[]];
    for (const jeito of jeitos) {
      const p = new Map(pos);
      jeito.forEach((i, k) => p.set(i, ases[k]));
      const idx = [...p.keys()];
      const min = Math.min(...idx), max = Math.max(...idx);
      const buracos = max - min + 1 - p.size;
      if (buracos > coringas.length) {
        const faltam = [];
        for (let i = min + 1; i < max; i++) if (!p.has(i)) faltam.push(i);
        const q = buracos - coringas.length;
        if (ases.length && p.has(escada.indexOf(13)) && p.has(1)) anota('K-A-2 não vale: o Ás fica embaixo (A-2-3) ou depois do K (Q-K-A).');
        else anota(faltam.length <= 2 ? `Falta ${faltam.map(nomeDe).join(' e ')} no meio da sequência.` : `A sequência tem buraco: faltam ${q} cartas no meio.`, q);
        continue;
      }
      const sobra = coringas.length - buracos;
      if (max - min + 1 + sobra > escada.length) { anota('A sequência não cabe: vai só do Ás ao Ás.'); continue; }
      const livres = [...coringas];
      const ordem = [];
      for (let i = min; i <= max; i++) ordem.push(p.get(i) || livres.shift());
      let lo = min, hi = max;
      // coringa que sobra estica a sequência: para cima, se ainda couber
      if (livres.length) {
        if (max < ultimo) { ordem.push(livres.shift()); hi++; } else { ordem.unshift(livres.shift()); lo--; }
      }
      const cand = { ordem, lo, hi, coringas };
      if (!melhor || cand.coringas.length < melhor.coringas.length) melhor = cand;
    }
  }
  if (!melhor) return ruim('s', ordemNeutra(cards), erro?.motivo || 'Essa sequência não vale.', erro?.falta || undefined);
  if (cards.length < MINIMO_DO_JOGO) {
    const q = MINIMO_DO_JOGO - cards.length;
    return ruim('s', melhor.ordem, `${faltaTexto(q)}.`, q);
  }
  return fecha('s', melhor.ordem, melhor.coringas, variante, melhor.lo, melhor.hi, ultimo);
}

export const jogoVale = (cards, variante, formacao = false) => analisaJogo(cards, variante, { formacao }).ok;
export const bonusDe = (canastra, variante) => (canastra ? regrasDa(variante).bonus[canastra] || 0 : 0);

// ============================================================================
// Partida
// ============================================================================

export function createGame(players, opts = {}) {
  if (players.length !== 2 && players.length !== 4) fail('A canastra é de 2 (mano a mano) ou de 4 (em dupla).');
  const variante = VARIANTES.includes(opts.variante) ? opts.variante : 'convencional';
  return {
    modo: MODO,
    variante,
    formato: players.length === 4 ? '2v2' : '1v1',
    opts: { nivelRobos: 'normal', ...opts, rnd: undefined },
    players: players.map((p, i) => ({
      id: p.id, name: p.name, isBot: !!p.isBot,
      lado: i % 2,          // no 2v2, cadeiras 0+2 contra 1+3
      hand: [],
      morto: [],
      pegouMorto: false,
    })),
    lados: [0, 1].map(() => ({ jogos: [], tresVermelhos: [], pontos: 0 })),
    round: -1,
    phase: 'lobby',
    turn: 0,
    turnNo: 0,
    deck: [],
    lixo: [],
    proximoJogo: 1,
    lastRound: null,
    vencedor: null,       // índice do lado, quando a partida acaba
    rnd: opts.rnd || Math.random,
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

export function minimoDaAbertura(state, lado) {
  const pontos = state.lados[lado]?.pontos || 0;
  return regrasDa(state.variante).abertura.find((f) => pontos < f.abaixoDe).minimo;
}

export const ladoAbriu = (state, lado) => state.lados[lado].jogos.length > 0;

const analisa = (state, j) => analisaJogo(j.cards, state.variante);
const temCanastraLimpa = (state, jogos) => jogos.some((j) => {
  const a = Array.isArray(j) ? analisaJogo(j, state.variante) : analisa(state, j);
  return a.ok && a.canastra && a.limpa;
});

export function lixoTrancado(state) {
  const topo = state.lixo[state.lixo.length - 1];
  return !!topo && trancaOLixo(topo, state.variante);
}

// Na do 3, o 3 vermelho que chega à mão vai direto para a mesa do lado e quem o
// recebeu compra outra no lugar (que também pode ser 3 vermelho). Devolve
// false quando o monte acabou antes de repor tudo.
function baixaTresVermelhos(state, p, events) {
  if (state.variante !== 'do3') return true;
  let repos = true;
  let achou = p.hand.filter(ehTresVermelho);
  while (achou.length) {
    const ids = new Set(achou.map((c) => c.id));
    p.hand = p.hand.filter((c) => !ids.has(c.id));
    state.lados[p.lado].tresVermelhos.push(...achou);
    const repoe = [];
    for (let k = 0; k < achou.length && state.deck.length; k++) repoe.push(state.deck.pop());
    if (repoe.length < achou.length) repos = false;
    p.hand.push(...repoe);
    events.push({ e: 'tresVermelho', p: p.id, n: achou.length });
    achou = repoe.filter(ehTresVermelho);
  }
  return repos;
}

export function startRound(state) {
  const rnd = state.rnd || Math.random;
  state.round++;
  const r = regrasDa(state.variante);
  state.deck = embaralha(baralhos(r.baralhos[state.formato]), rnd);
  state.lixo = [];
  for (const l of state.lados) { l.jogos = []; l.tresVermelhos = []; }
  // Sem morto (a do 3), é como se cada um já o tivesse pego: esvaziar a mão é
  // bater, e a mesma regra de guardar 2 cartas vale desde o começo.
  for (const p of state.players) { p.hand = []; p.morto = []; p.pegouMorto = !r.cartasNoMorto; }
  for (let k = 0; k < r.cartasNaMao; k++) for (const p of state.players) p.hand.push(state.deck.pop());
  for (let k = 0; k < r.cartasNoMorto; k++) for (const p of state.players) p.morto.push(state.deck.pop());
  state.proximoJogo = 1;
  state.turnNo = 0;
  state.phase = 'draw';
  // rodízio: a primeira rodada abre o anfitrião (cadeira 0), depois o seguinte
  state.turn = state.round % state.players.length;
  const events = [{ e: 'roundStart', round: state.round, first: state.players[state.turn].id }];
  const n = state.players.length;
  for (let k = 0; k < n; k++) baixaTresVermelhos(state, state.players[(state.turn + k) % n], events);
  return events;
}

function daVez(state, playerId, fase) {
  if (state.phase !== 'draw' && state.phase !== 'play') fail('Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  if (state.phase !== fase) fail(fase === 'draw' ? 'Você já comprou nesta vez.' : 'Primeiro compre do monte ou pegue o lixo.');
  return p;
}

function passaVez(state, events) {
  state.turn = (state.turn + 1) % state.players.length;
  state.turnNo++;
  state.phase = 'draw';
  return events;
}

// Confere uma baixada inteira — jogos novos e encaixes nos jogos do lado — sem
// mexer em nada. `extra` é a carta de cima do lixo, que entra como se fosse da
// mão (e tem que entrar; na do 3, num jogo novo). Devolve o plano que
// aplicaBaixada executa.
function preparaBaixada(state, p, jogos, encaixes, extra = null) {
  const novosIds = Array.isArray(jogos) ? jogos : [];
  const encs = Array.isArray(encaixes) ? encaixes : [];
  if (novosIds.length > 30 || encs.length > 60) fail('Jogada inválida.');
  const naMao = new Map(p.hand.map((c) => [c.id, c]));
  if (extra) naMao.set(extra.id, extra);
  const usadas = new Set();
  const pega = (id) => {
    if (!Number.isInteger(id)) fail('Jogada inválida.');
    if (usadas.has(id)) fail('A mesma carta apareceu duas vezes.');
    const c = naMao.get(id);
    if (!c) fail('Essa carta não está na sua mão.');
    usadas.add(id);
    return c;
  };
  const lado = state.lados[p.lado];
  const novos = novosIds.map((ids) => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 15) fail('Jogada inválida.');
    const a = analisaJogo(ids.map(pega), state.variante, { formacao: true });
    if (!a.ok) fail(`${a.motivo} (${a.cards.map(nomeCurto).join(' ')})`);
    return a;
  });
  const porJogo = new Map();
  for (const enc of encs) {
    const j = lado.jogos.find((x) => x.id === enc?.jogo);
    if (!j) fail('Esse jogo não é do seu lado da mesa.');
    if (!Array.isArray(enc.ids) || !enc.ids.length || enc.ids.length > 15) fail('Jogada inválida.');
    porJogo.set(j.id, [...(porJogo.get(j.id) || j.cards), ...enc.ids.map(pega)]);
  }
  const mexidos = [...porJogo].map(([id, cards]) => {
    const antes = analisa(state, lado.jogos.find((x) => x.id === id));
    const a = analisaJogo(cards, state.variante);
    if (!a.ok) fail(`${a.motivo} (${a.cards.map(nomeCurto).join(' ')})`);
    if (a.tipo !== antes.tipo) fail('Sequência continua sequência, e trinca continua trinca.');
    return { id, a, antes };
  });
  if (!usadas.size) fail('Escolha as cartas para baixar.');
  if (extra && !usadas.has(extra.id)) fail('Para pegar o lixo, a carta de cima tem que ir para um jogo agora.');
  if (extra && regrasDa(state.variante).lixo.soJogoNovo && !novos.some((a) => a.cards.some((c) => c.id === extra.id))) {
    fail('Na do 3, a carta de cima do lixo tem que formar um jogo novo com cartas da sua mão.');
  }

  // abrir: só há jogos novos (o lado ainda não tem onde encaixar)
  const soma = somaNaAbertura(novos.map((a) => a.cards), state.variante);
  if (!lado.jogos.length) {
    const minimo = minimoDaAbertura(state, p.lado);
    const naoContam = regrasDa(state.variante).doisAbre ? '' : ' (o coringa não conta)';
    if (soma < minimo) fail(`Para abrir o seu lado são ${minimo} pontos de uma vez; esses jogos somam ${soma}${naoContam}.`);
  }
  // Como a mão fica: quem pega o lixo leva o resto dele para a mão.
  const fica = p.hand.filter((c) => !usadas.has(c.id)).length + (extra ? state.lixo.length - 1 : 0);
  const mexidosIds = new Set(mexidos.map((m) => m.id));
  const depois = [
    ...lado.jogos.filter((j) => !mexidosIds.has(j.id)).map((j) => j.cards),
    ...mexidos.map((m) => m.a.cards),
    ...novos.map((a) => a.cards),
  ];
  const limpaDepois = temCanastraLimpa(state, depois);
  if (p.pegouMorto && !limpaDepois) {
    if (fica === 0) fail('Para bater falta canastra limpa no seu lado.');
    if (fica === 1) fail('Sem canastra limpa você ainda não bate: deixe 2 cartas na mão, uma para descartar.');
  }
  return { novos, mexidos, usadas, soma };
}

function aplicaBaixada(state, p, plano, events) {
  const lado = state.lados[p.lado];
  const canastras = [];
  for (const m of plano.mexidos) {
    const j = lado.jogos.find((x) => x.id === m.id);
    j.cards = m.a.cards;
    if (m.a.canastra && m.a.canastra !== m.antes.canastra) canastras.push({ jogo: j.id, tipo: m.a.canastra });
  }
  for (const a of plano.novos) {
    const j = { id: state.proximoJogo++, cards: a.cards };
    lado.jogos.push(j);
    if (a.canastra) canastras.push({ jogo: j.id, tipo: a.canastra });
  }
  p.hand = p.hand.filter((c) => !plano.usadas.has(c.id));
  events.push({ e: 'baixou', p: p.id, n: plano.usadas.size, novos: plano.novos.length, encaixes: plano.mexidos.length });
  for (const c of canastras) events.push({ e: 'canastra', p: p.id, lado: p.lado, ...c });
}

function pegaMorto(state, p, events, direta) {
  p.hand = p.morto;
  p.morto = [];
  p.pegouMorto = true;
  events.push({ e: 'morto', p: p.id, direta });
  baixaTresVermelhos(state, p, events);
}

// Esvaziou a mão baixando: pega o morto e segue, ou bate.
function depoisDaBaixada(state, p, events) {
  if (p.hand.length) return events;
  if (!p.pegouMorto) { pegaMorto(state, p, events, true); return events; }
  events.push({ e: 'bateu', p: p.id });
  return fimDaRodada(state, events, 'bateu', p);
}

export function actComprar(state, playerId) {
  const p = daVez(state, playerId, 'draw');
  const events = [];
  if (!state.deck.length) {
    events.push({ e: 'semMonte', p: p.id });
    return fimDaRodada(state, events, 'monte', null);
  }
  p.hand.push(state.deck.pop());
  // O evento vai para a mesa toda: nada da carta nele.
  events.push({ e: 'comprou', p: p.id });
  // comprou 3 vermelho e o monte não tinha outra para repor: é o monte que
  // acabou na mão de quem precisava comprar
  if (!baixaTresVermelhos(state, p, events)) {
    events.push({ e: 'semMonte', p: p.id });
    return fimDaRodada(state, events, 'monte', null);
  }
  state.phase = 'play';
  return events;
}

export function actPegarLixo(state, playerId, jogos, encaixes) {
  const p = daVez(state, playerId, 'draw');
  if (!state.lixo.length) fail('O lixo está vazio.');
  if (lixoTrancado(state)) fail('O lixo está trancado: compre do monte.');
  if (regrasDa(state.variante).lixo.soDepoisDeAbrir && !ladoAbriu(state, p.lado)) {
    fail(`Na do 3, só pega o lixo quem já abriu com ${minimoDaAbertura(state, p.lado)} pontos.`);
  }
  const topo = state.lixo[state.lixo.length - 1];
  const plano = preparaBaixada(state, p, jogos, encaixes, topo);
  const resto = state.lixo.slice(0, -1);
  state.lixo = [];
  const events = [{ e: 'pegouLixo', p: p.id, n: resto.length + 1, topo }];
  aplicaBaixada(state, p, plano, events);
  p.hand.push(...resto);
  state.phase = 'play';
  return depoisDaBaixada(state, p, events);
}

export function actBaixar(state, playerId, jogos, encaixes) {
  const p = daVez(state, playerId, 'play');
  const plano = preparaBaixada(state, p, jogos, encaixes);
  const events = [];
  aplicaBaixada(state, p, plano, events);
  return depoisDaBaixada(state, p, events);
}

export function actDescartar(state, playerId, id) {
  const p = daVez(state, playerId, 'play');
  const c = p.hand.find((x) => x.id === id);
  if (!c) fail('Essa carta não está na sua mão.');
  if (p.hand.length === 1 && p.pegouMorto && !temCanastraLimpa(state, state.lados[p.lado].jogos)) {
    fail('Para bater falta canastra limpa no seu lado.');
  }
  p.hand = p.hand.filter((x) => x.id !== id);
  state.lixo.push(c);
  const events = [{ e: 'descartou', p: p.id, card: c, tranca: trancaOLixo(c, state.variante) }];
  if (!p.hand.length) {
    if (p.pegouMorto) {
      events.push({ e: 'bateu', p: p.id });
      return fimDaRodada(state, events, 'bateu', p);
    }
    pegaMorto(state, p, events, false);
  }
  return passaVez(state, events);
}

// A conta de um lado no fim da rodada. Na do 3, o lado que termina sem
// canastra limpa (na batida dos outros ou no fim do monte) fica com −500
// cravado: a mesa, os 3 vermelhos e a mão dele não contam (`cravado`).
function contaDoLado(state, i, quemBateu) {
  const r = regrasDa(state.variante);
  const l = state.lados[i];
  const jogadores = state.players.filter((p) => p.lado === i);
  const analises = l.jogos.map((j) => analisa(state, j));
  const mesa = l.jogos.reduce((s, j) => s + somaDe(j.cards, state.variante), 0);
  const canastras = analises.reduce((s, a) => s + bonusDe(a.canastra, state.variante), 0);
  const batida = quemBateu && quemBateu.lado === i ? r.batida : 0;
  const tres = l.tresVermelhos.length * BONUS_DO_TRES_VERMELHO;
  const mao = -jogadores.reduce((s, p) => s + somaDe(p.hand, state.variante), 0);
  const mortos = -r.multaDoMorto * jogadores.filter((p) => !p.pegouMorto).length;
  const cravado = r.semLimpa != null && !temCanastraLimpa(state, l.jogos);
  return {
    lado: i,
    mesa, canastras, nCanastras: analises.filter((a) => a.canastra).length,
    batida, tres, mao, mortos, cravado,
    total: cravado ? r.semLimpa : mesa + canastras + batida + tres + mao + mortos,
  };
}

function fimDaRodada(state, events, motivo, quemBateu) {
  const contas = [0, 1].map((i) => contaDoLado(state, i, quemBateu));
  for (const c of contas) {
    state.lados[c.lado].pontos += c.total;
    c.pontos = state.lados[c.lado].pontos;
  }
  state.turnNo++;
  // No fim, as mãos se abrem: dá para ver o que cada um ficou devendo.
  state.lastRound = {
    round: state.round, motivo, por: quemBateu ? quemBateu.id : null, lados: contas,
    maos: state.players.map((p) => ({ id: p.id, cards: p.hand.slice(), pegouMorto: p.pegouMorto })),
  };
  events.push({ e: 'roundEnd', round: state.round, motivo, por: quemBateu ? quemBateu.id : null });
  const pts = state.lados.map((l) => l.pontos);
  const maior = Math.max(...pts);
  // passou da meta e não empatou no topo: acabou; empatou, joga-se outra
  if (maior >= (state.opts?.meta || META) && pts.filter((x) => x === maior).length === 1) {
    state.phase = 'gameEnd';
    state.vencedor = pts.indexOf(maior);
    events.push({ e: 'gameEnd', vencedor: state.vencedor, pontos: pts });
  } else {
    state.phase = 'roundEnd';
  }
  return events;
}

export function actNextRound(state) {
  if (state.phase !== 'roundEnd') return [];
  return startRound(state);
}

export function applyAction(state, playerId, action) {
  switch (action?.a) {
    case 'comprar': return actComprar(state, playerId);
    case 'pegarLixo': return actPegarLixo(state, playerId, action.jogos, action.encaixes);
    case 'baixar': return actBaixar(state, playerId, action.jogos, action.encaixes);
    case 'descartar': return actDescartar(state, playerId, action.id);
    default: fail('Ação desconhecida.');
  }
}

// Fases em que alguém precisa agir (é onde o servidor agenda robô e cobrança).
export const FASES_DE_VEZ = ['draw', 'play'];

export function viewFor(state, playerId) {
  const me = playerById(state, playerId);
  const meuLado = me ? me.lado : 0;
  return {
    modo: MODO,
    variante: state.variante,
    formato: state.formato,
    round: state.round,
    phase: state.phase,
    turnId: state.players[state.turn] ? state.players[state.turn].id : null,
    turnNo: state.turnNo,
    monte: state.deck.length,
    lixo: state.lixo,
    lixoTrancado: lixoTrancado(state),
    meta: state.opts?.meta || META,
    minimoDaAbertura: minimoDaAbertura(state, meuLado),
    semMorto: !regrasDa(state.variante).cartasNoMorto,
    vencedor: state.vencedor,
    lados: state.lados.map((l, i) => ({
      lado: i,
      jogadores: state.players.filter((p) => p.lado === i).map((p) => p.id),
      pontos: l.pontos,
      tresVermelhos: l.tresVermelhos,
      jogos: l.jogos.map((j) => {
        const a = analisa(state, j);
        return { id: j.id, cards: j.cards, tipo: a.tipo, canastra: a.canastra, limpa: a.limpa };
      }),
    })),
    lastRound: state.lastRound,
    // o que a mesa do Caçamba lê nos assentos, vazio aqui
    claims: [], contract: null,
    you: me ? { id: me.id, hand: me.hand, lado: me.lado, pegouMorto: me.pegouMorto } : null,
    players: state.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot,
      lado: p.lado,
      handCount: p.hand.length,
      pegouMorto: p.pegouMorto,
      score: state.lados[p.lado].pontos,
      baixou: false, baixados: null, melds: [],
    })),
  };
}

// ============================================================================
// Robô
//
// O robô joga em passos, como gente: compra (ou pega o lixo quando a carta de
// cima fecha um jogo), baixa o que tem e descarta. Ele guarda os coringas — a
// batida pede canastra limpa — e só os gasta para fechar canastra quando o
// lado já tem uma limpa, ou para abrir o lado (na do 3 o joker não suja, e
// ele o usa à vontade para fechar canastra). O fácil nunca pega o lixo e
// descarta à toa de vez em quando. Toda jogada passa antes pela mesma
// conferência do motor numa cópia: robô nunca manda jogada que o juiz recuse.
// ============================================================================

// Os jogos novos que dá para fazer só com cartas firmes (sem coringa), sem
// repetir carta: o mais comprido primeiro.
export function jogosFirmesDe(cartas, variante) {
  let resto = cartas.filter((c) => !ehJoker(c));
  const jogos = [];
  for (let volta = 0; volta < 20; volta++) {
    const j = melhorJogoFirme(resto, variante);
    if (!j) break;
    jogos.push(j);
    const ids = new Set(j.map((c) => c.id));
    resto = resto.filter((c) => !ids.has(c.id));
  }
  return jogos;
}

function melhorJogoFirme(cartas, variante) {
  let melhor = null;
  const considera = (cards) => {
    if (cards.length < MINIMO_DO_JOGO) return;
    if (melhor && (cards.length < melhor.length || (cards.length === melhor.length && somaDe(cards, variante) <= somaDe(melhor, variante)))) return;
    const a = analisaJogo(cards, variante, { formacao: true });
    if (a.ok && !a.coringas) melhor = cards;
  };
  const escada = escadaDa(variante);
  const ultimo = escada.length - 1;
  for (let suit = 0; suit < 4; suit++) {
    const doNaipe = cartas.filter((c) => c.suit === suit && !(variante === 'do3' && c.rank === 3));
    const ases = doNaipe.filter((c) => c.rank === 1);
    const porPos = new Map();
    for (const c of doNaipe) if (c.rank !== 1 && !porPos.has(escada.indexOf(c.rank))) porPos.set(escada.indexOf(c.rank), c);
    // o Ás embaixo, em cima, ou os dois (dois Ases do naipe)
    const jeitos = [[]];
    if (ases.length >= 1) jeitos.push([[0, ases[0]]], [[ultimo, ases[0]]]);
    if (ases.length >= 2) jeitos.push([[0, ases[0]], [ultimo, ases[1]]]);
    for (const jeito of jeitos) {
      const p = new Map(porPos);
      for (const [i, c] of jeito) p.set(i, c);
      let trecho = [];
      for (let i = 0; i <= ultimo; i++) {
        if (p.has(i)) { trecho.push(p.get(i)); continue; }
        considera(trecho); trecho = [];
      }
      considera(trecho);
    }
  }
  for (let rank = 1; rank <= 13; rank++) {
    if (rank === 2 || (variante === 'do3' && rank === 3)) continue;
    const doValor = cartas.filter((c) => !c.joker && c.rank === rank);
    if (new Set(doValor.map((c) => c.suit)).size >= 3) considera(doValor);
  }
  return melhor;
}

// Cabe a carta `c` no jogo (lista de cartas)? Para um 2, só se entrar como
// carta normal (na casa dele) — senão seria gastar coringa sem querer.
function cabe(cards, c, variante, aceitaCoringa = false) {
  const antes = analisaJogo(cards, variante);
  const a = analisaJogo([...cards, c], variante);
  if (!a.ok || a.tipo !== antes.tipo) return false;
  return aceitaCoringa || a.coringas <= antes.coringas;
}

// O plano de baixada do robô a partir da mão (e, se for o caso, da carta do
// lixo): { jogos: [[cards]], encaixes: Map(jogoId → [cards]), usadas: Set }.
function planoDoRobo(state, p, { extra = null } = {}) {
  const variante = state.variante;
  const regras = regrasDa(variante);
  const lado = state.lados[p.lado];
  const mao = extra ? [...p.hand, extra] : [...p.hand];
  const abriu = lado.jogos.length > 0;
  const novos = jogosFirmesDe(mao, variante);
  const usadas = new Set(novos.flat().map((c) => c.id));
  const encaixes = new Map();
  const atual = new Map(lado.jogos.map((j) => [j.id, [...j.cards]]));
  // carta firme que encaixa num jogo do lado (ou num jogo novo deste plano)
  for (let volta = 0; volta < 40; volta++) {
    let mexeu = false;
    for (const c of mao) {
      if (usadas.has(c.id) || ehJoker(c)) continue;
      // na do 3 a carta do lixo não encaixa: forma jogo novo
      const soNovo = c === extra && regras.lixo.soJogoNovo;
      for (const [id, cards] of atual) {
        if (soNovo || !cabe(cards, c, variante)) continue;
        cards.push(c); usadas.add(c.id);
        encaixes.set(id, [...(encaixes.get(id) || []), c]);
        mexeu = true; break;
      }
      if (usadas.has(c.id)) continue;
      for (const j of novos) {
        if (!cabe(j, c, variante)) continue;
        j.push(c); usadas.add(c.id); mexeu = true; break;
      }
    }
    if (!mexeu) break;
  }
  {
    // coringa só para fechar canastra (suja) quando o lado já tem uma limpa
    const jaTemLimpa = temCanastraLimpa(state, [...atual.values(), ...novos]);
    const coringas = () => mao.filter((c) => ehCoringa(c) && !usadas.has(c.id));
    // um jogo novo de duas cartas e um coringa (o 2 do naipe vale como carta)
    const doisEUmCoringa = (w) => {
      const livres = mao.filter((c) => !usadas.has(c.id) && !ehJoker(c) && c.id !== w.id);
      for (let a = 0; a < livres.length; a++) {
        for (let b = a + 1; b < livres.length; b++) {
          const a3 = analisaJogo([livres[a], livres[b], w], variante, { formacao: true });
          if (a3.ok && a3.coringas === 1) return [livres[a], livres[b], w];
        }
      }
      return null;
    };
    const fazComCoringa = (ate) => {
      for (const w of coringas()) {
        if (usadas.has(w.id)) continue;
        const j = doisEUmCoringa(w);
        if (!j) break;
        novos.push(j);
        for (const c of j) usadas.add(c.id);
        if (ate && ate()) break;
      }
    };
    // na reta final (morto pego e limpa no lado) o coringa vira jogo novo:
    // é o que esvazia a mão
    if (jaTemLimpa && p.pegouMorto) fazComCoringa();
    // a carta do lixo que não fechou jogo firme: com uma carta da mão e um
    // coringa que não suje (o joker, na do 3), ela forma o jogo que leva o lixo
    const naoSuja = (w) => ehJoker(w) && !regras.jokerSuja;
    if (extra && !usadas.has(extra.id)) {
      const w = coringas().find((x) => naoSuja(x) || jaTemLimpa);
      const par = w && mao.find((c) => c !== extra && c !== w && !usadas.has(c.id) && !ehJoker(c)
        && analisaJogo([extra, c, w], variante, { formacao: true }).ok);
      if (par) { novos.push([extra, par, w]); for (const c of [extra, par, w]) usadas.add(c.id); }
    }
    // Fechar canastra: coringa no jogo de 6 sem coringa. Com limpa no lado,
    // qualquer um; sem, só o que não suja (o joker, na do 3). Com o morto pego
    // e só coringa sobrando na mão, eles vão todos para a mesa: é o que deixa
    // bater.
    // (o joker que não suja vai já no jogo de 5: é o que o leva mais perto)
    const soCoringa = jaTemLimpa && p.pegouMorto && mao.every((c) => usadas.has(c.id) || ehCoringa(c));
    for (const [id, cards] of atual) {
      const w = coringas().find((x) => jaTemLimpa || naoSuja(x));
      if (!w) break;
      const a = analisaJogo(cards, variante);
      const perto = cards.length === TAMANHO_DA_CANASTRA - 1 || (naoSuja(w) && cards.length >= TAMANHO_DA_CANASTRA - 2);
      if (a.coringas || (!soCoringa && !perto) || !cabe(cards, w, variante, true)) continue;
      cards.push(w); usadas.add(w.id);
      encaixes.set(id, [...(encaixes.get(id) || []), w]);
    }
    // abrir o lado: se os jogos firmes não chegam ao mínimo, um coringa fecha
    // uma sequência de duas cartas
    if (!abriu) {
      const soma = () => somaNaAbertura(novos, variante);
      const minimo = minimoDaAbertura(state, p.lado);
      if (soma() < minimo) fazComCoringa(() => soma() >= minimo);
      // ainda falta: um coringa em cada jogo novo, o que mais vale primeiro (na
      // do 3 o coringa não conta para abrir, e isto não acontece)
      if (soma() < minimo) {
        const porValor = () => coringas().filter((w) => valorNaAbertura(w, variante) > 0)
          .sort((a, b) => valorDaCarta(b, variante) - valorDaCarta(a, variante));
        for (const j of novos) {
          const w = porValor()[0];
          if (!w || soma() >= minimo) break;
          if (analisaJogo(j, variante).coringas || !cabe(j, w, variante, true)) continue;
          j.push(w); usadas.add(w.id);
        }
      }
    }
  }
  return { jogos: novos, encaixes, usadas, mao };
}

// Tira do plano o que for preciso para a mão não ficar num beco: sem canastra
// limpa e com o morto já pego, sobram pelo menos 2 cartas.
function aparaPlano(state, p, plano, restoDoLixo = 0) {
  const fica = () => plano.mao.length - plano.usadas.size + restoDoLixo;
  if (!p.pegouMorto) return plano;
  const lado = state.lados[p.lado];
  const limpa = () => temCanastraLimpa(state, [
    ...lado.jogos.map((j) => [...j.cards, ...(plano.encaixes.get(j.id) || [])]),
    ...plano.jogos,
  ]);
  if (fica() >= 2 || limpa()) return plano;
  for (const [id, cards] of [...plano.encaixes]) {
    while (cards.length && fica() < 2) plano.usadas.delete(cards.pop().id);
    if (!cards.length) plano.encaixes.delete(id);
    if (fica() >= 2) return plano;
  }
  while (fica() < 2 && plano.jogos.length) {
    for (const c of plano.jogos.pop()) plano.usadas.delete(c.id);
  }
  return plano;
}

// Sem morto (a do 3), mão vazia não traz cartas novas: o robô que despeja
// tudo na mesa fica com 1 carta e nunca mais pega o lixo (a carta de cima
// precisa de um par na mão), e os jogos param em 4 ou 5. Até o lado ter
// canastra limpa ele guarda uma reserva: deixa de baixar jogo novo e de
// encaixar em jogo pequeno — o encaixe que leva um jogo perto da canastra
// continua.
const RESERVA_SEM_MORTO = 6;
function guardaReserva(state, p, plano) {
  if (regrasDa(state.variante).cartasNoMorto) return plano;
  const lado = state.lados[p.lado];
  if (!lado.jogos.length || temCanastraLimpa(state, lado.jogos)) return plano;
  const fica = () => plano.mao.length - plano.usadas.size;
  plano.jogos.sort((x, y) => y.length - x.length);
  while (fica() < RESERVA_SEM_MORTO && plano.jogos.length) {
    for (const c of plano.jogos.pop()) plano.usadas.delete(c.id);
  }
  for (const [id, cards] of [...plano.encaixes]) {
    if (fica() >= RESERVA_SEM_MORTO) break;
    const j = lado.jogos.find((x) => x.id === id);
    if (j.cards.length >= 5) continue;
    for (const c of cards) plano.usadas.delete(c.id);
    plano.encaixes.delete(id);
  }
  return plano;
}

const comoAcao = (plano) => ({
  jogos: plano.jogos.map((j) => j.map((c) => c.id)),
  encaixes: [...plano.encaixes].filter(([, cs]) => cs.length).map(([jogo, cs]) => ({ jogo, ids: cs.map((c) => c.id) })),
});

// A mesma conferência do motor, numa cópia do estado.
function passaNoJuiz(state, playerId, acao) {
  try {
    const copia = JSON.parse(JSON.stringify({ ...state, rnd: undefined }));
    copia.rnd = () => 0.5;
    applyAction(copia, playerId, acao);
    return true;
  } catch {
    return false;
  }
}

// O que cada carta vale para ficar na mão: par/trinca à vista, vizinha de
// naipe, e se ela serve para o outro lado (aí descartar é dar presente).
function escolheDescarte(state, p, facil) {
  const variante = state.variante;
  const mao = p.hand;
  // o fácil descarta à toa uma vez a cada três
  if (facil && (state.rnd || Math.random)() < 1 / 3) {
    const firmes = mao.filter((c) => !ehCoringa(c));
    const pool = firmes.length ? firmes : mao;
    return pool[Math.floor((state.rnd || Math.random)() * pool.length)];
  }
  if (variante === 'do3') {
    const tres = mao.find(ehTresPreto);
    if (tres) return tres;
  }
  const escada = escadaDa(variante);
  const posDe = (c) => (c.rank === 1 ? [0, escada.length - 1] : [escada.indexOf(c.rank)]);
  const doOutro = state.lados[1 - p.lado].jogos;
  const meus = state.lados[p.lado].jogos;
  let melhor = null;
  for (const c of mao) {
    let fica = 0;
    if (ehCoringa(c)) fica += 100;
    for (const o of mao) {
      if (o.id === c.id || ehCoringa(o)) continue;
      if (o.rank === c.rank && o.suit !== c.suit) fica += 3;
      if (o.suit === c.suit && o.rank !== c.rank) {
        const perto = posDe(c).some((i) => posDe(o).some((k) => Math.abs(i - k) <= 2));
        if (perto) fica += 2;
      }
    }
    if (meus.some((j) => cabe(j.cards, c, variante))) fica += 6;
    if (!ehCoringa(c) && doOutro.some((j) => cabe(j.cards, c, variante))) fica += 8;
    fica -= valorDaCarta(c, variante) / 10;   // empatou, sai a que mais pesa na mão
    if (!melhor || fica < melhor.fica) melhor = { c, fica };
  }
  return melhor.c;
}

export function botNextAction(state, playerId) {
  if (state.phase !== 'draw' && state.phase !== 'play') return null;
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) return null;
  const facil = state.opts?.nivelRobos === 'facil';

  if (state.phase === 'draw') {
    const topo = state.lixo[state.lixo.length - 1];
    // na reta final (morto pego e limpa no lado) lixo grande só atrasa a batida
    const retaFinal = p.pegouMorto && temCanastraLimpa(state, state.lados[p.lado].jogos);
    const podeLixo = !regrasDa(state.variante).lixo.soDepoisDeAbrir || ladoAbriu(state, p.lado);
    if (!facil && podeLixo && topo && !lixoTrancado(state) && !ehCoringa(topo) && !(retaFinal && state.lixo.length > 3)) {
      const plano = aparaPlano(state, p, planoDoRobo(state, p, { extra: topo }), state.lixo.length - 1);
      if (plano.usadas.has(topo.id)) {
        const acao = { a: 'pegarLixo', ...comoAcao(plano) };
        if (passaNoJuiz(state, playerId, acao)) return acao;
      }
    }
    return { a: 'comprar' };
  }

  const plano = guardaReserva(state, p, aparaPlano(state, p, planoDoRobo(state, p)));
  if (plano.usadas.size) {
    const acao = { a: 'baixar', ...comoAcao(plano) };
    if (passaNoJuiz(state, playerId, acao)) return acao;
    // sem os encaixes, só os jogos novos (ou o contrário)
    for (const parte of [{ ...acao, encaixes: [] }, { ...acao, jogos: [] }]) {
      if ((parte.jogos.length || parte.encaixes.length) && passaNoJuiz(state, playerId, parte)) return parte;
    }
  }
  const c = escolheDescarte(state, p, facil);
  const acao = { a: 'descartar', id: c.id };
  if (passaNoJuiz(state, playerId, acao)) return acao;
  for (const o of p.hand) {
    const a = { a: 'descartar', id: o.id };
    if (passaNoJuiz(state, playerId, a)) return a;
  }
  return acao;
}
