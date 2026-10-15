// ============================================================================
// Bazuca — o quarto modo da casa. Jogo de memória, atenção e reflexo: as
// cartas ficam viradas na mesa, cada um precisa lembrar o que tem (e o que os
// outros têm), e qualquer um pode descartar fora da vez.
//
// Vive separado dos outros motores, como o presidente.js e o domino.js: a
// página só baixa a mesa dele quando alguém entra numa sala de Bazuca.
//
// Regras ditadas e respondidas pelo dono do jogo em 15/10/2026:
//  - 2 a 6 jogadores. Um baralho de 52 com 2 coringas. 4 cartas viradas para
//    cada um, em duas fileiras de duas.
//  - No começo cada um vê as DUAS MAIS PERTO DELE, todos ao mesmo tempo, por
//    5 segundos — e só dessa vez. Sem carta virada no meio; quem começa é
//    sorteado.
//  - Na vez: compra do MONTE (nunca do descarte) e decide — troca por uma das
//    suas, que vai para o descarte, ou descarta a comprada. 35 s por jogada.
//  - Valores: coringa 0, Ás 1, 2 … 10, J 11, Q 12, K 13. Ganha a menor soma.
//  - Poderes, OBRIGATÓRIOS e só do jogador da vez, quando a carta sai da mão
//    dele na vez (descartada direto ou trocada): J olha uma carta sua; Q olha
//    uma carta de outro jogador (todos veem a posição, só ele vê o valor); K
//    troca uma carta sua com uma de outro, às cegas (todos veem as posições,
//    ninguém vê os valores).
//  - Descarte rápido: qualquer um, a qualquer momento, descarta uma carta de
//    mesmo valor da que está em cima, enquanto não cair outra por cima — a
//    própria ou a de outro jogador. Acertou a de outro: dá uma das suas para
//    ele (escolhe a posição, sem ver). Errou: a carta aparece para todos,
//    volta virada, e quem errou leva mais uma carta. Dois atrás da mesma
//    carta: o primeiro leva, o segundo não é punido. Descarte rápido nunca
//    tem poder.
//  - Na sua vez, um par seu sai de uma vez. Errou o par: as duas aparecem,
//    voltam, e você leva mais uma.
//  - Quem fica sem nenhuma carta BATE: vence na hora — até de quem só tem um
//    coringa — e a rodada acaba ali.
//  - BAZUCA (corrigido por ele no mesmo dia): grita-se na SUA vez, a qualquer
//    momento dela, e a rodada acaba na hora — vai direto para a contagem.
//    Soma-se tudo e a menor soma vence, tenha gritado ou não. Não há punição.
//    Quem gritou só vence com a menor soma SOZINHO: empatou com alguém, perde
//    para ele (confirmado por ele em 15/10/2026).
//  - A rodada só acaba quando alguém bate ou grita. O monte acabou, embaralha
//    o descarte (menos a de cima); sem carta nem assim, a vez passa sem compra.
//  - A partida vai até alguém somar 4 vitórias (VITORIAS_PARA_GANHAR), com
//    quantas rodadas forem precisas; aí acaba, e o anfitrião recomeça se a
//    mesa quiser jogar de novo — como no Caçamba.
//  - Nenhuma ajuda: a visão de cada jogador só traz o que ele está vendo
//    agora. Nada marca carta já vista, nada avisa descarte possível.
//
// REGRAS DA CASA que eu decidi e ele ainda não confirmou (ajustáveis aqui):
//  - Estourou os 35 s: a carta comprada é descartada, sem poder; se o poder
//    estava pendente, ele se perde.
//  - O par na vez não substitui a compra.
//  - Carta de punição entra numa posição nova, no fim da fileira.
//  - Toda rodada começa por sorteio.
//  - Bazuca de quem não tinha a menor soma, com dois ou mais dos outros
//    empatados na menor: ninguém leva.
//  - Bazuca com carta comprada na mão: ela vai para o descarte e não conta;
//    com troca de carta pendente (alguém deve uma), espera-se a troca.
//
// O TEMPO. Este é o único motor com relógio: espiada de 5 s, vez de 35 s,
// carta mostrada por um instante. O motor não tem timer — ele guarda prazos
// (Date.now()) e o servidor chama `tick` quando `proximoPrazo` vence.
// ============================================================================

export const MODO = 'bazuca';
export const MIN_JOGADORES = 2;
export const MAX_JOGADORES = 6;
export const NIVEIS_DE_ROBO = ['facil', 'normal', 'dificil'];

export const VITORIAS_PARA_GANHAR = 4;
export const CARTAS_INICIAIS = 4;
export const PERTO = [2, 3];          // as duas posições mais perto do jogador
export const ESPIADA_INICIAL_MS = 5000;
export const VEZ_MS = 35000;
export const PODER_MINIMO_MS = 10000; // chegou ao poder com o relógio quase no fim: ganha fôlego
export const ESPIADA_MS = 4000;       // J e Q: quanto tempo a carta fica à vista de quem olhou
export const REVELADA_MS = 2600;      // descarte errado: quanto tempo a carta fica à vista de todos
export const DIVIDA_MS = 10000;       // quanto tempo para escolher a carta que vai dar

const RANK_LABELS = ['coringa', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const rotulo = (rank) => RANK_LABELS[rank] ?? '';
export const valor = (card) => (card ? card.rank : 0);
const PODERES = { 11: 'J', 12: 'Q', 13: 'K' };

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

function baralho() {
  const cards = [];
  let id = 1;
  for (let suit = 0; suit < 4; suit++) for (let rank = 1; rank <= 13; rank++) cards.push({ id: id++, rank, suit });
  for (let k = 0; k < 2; k++) cards.push({ id: id++, rank: 0, suit: -1, joker: true });
  return cards;
}

function embaralha(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createGame(players, opts = {}) {
  return {
    modo: MODO,
    opts: { nivelRobos: 'normal', ...opts, rnd: undefined },
    players: players.map((p) => ({
      id: p.id, name: p.name, isBot: !!p.isBot,
      slots: [],          // posição → carta ou null (buraco). A posição não muda: é dela que se lembra.
      vitorias: 0,
      memoria: {},        // só os robôs usam: "id:posição" → valor que acham que está lá
    })),
    round: -1,
    phase: 'lobby',       // 'espiar' → 'play' → 'roundEnd' (… → 'gameEnd')
    campeao: null,        // quem chegou a VITORIAS_PARA_GANHAR
    turn: 0,
    turnNo: 0,
    etapa: null,          // na vez: 'comprar' → 'decidir' → ('poder')
    comprada: null,
    poder: null,          // 'J' | 'Q' | 'K' pendente do jogador da vez
    prazo: null,          // fim da espiada inicial ou da vez
    deck: [],
    descarte: [],
    descarteSeq: 0,       // sobe a cada carta que cai no descarte: é a "janela" do descarte rápido
    espiadas: [],         // privadas: [{ quem, p, i, card, ate }]
    reveladas: [],        // públicas:  [{ p, i, card, ate }]
    dividas: [],          // [{ de, para, i, prazo }] — quem acertou carta alheia deve uma das suas
    lastRound: null,
    rnd: opts.rnd || Math.random,
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}
const idxDe = (state, id) => state.players.findIndex((p) => p.id === id);
const cartasDe = (p) => p.slots.filter(Boolean);
const soma = (p) => cartasDe(p).reduce((n, c) => n + valor(c), 0);
const topo = (state) => state.descarte[state.descarte.length - 1] || null;
const ehRobo = (state, p) => p.isBot || (state.controlados || []).includes(p.id);

// ---------------------------------------------------------------------------
// Rodada
// ---------------------------------------------------------------------------

export function startRound(state, agora = Date.now()) {
  const rnd = state.rnd || Math.random;
  state.round++;
  state.deck = embaralha(baralho(), rnd);
  state.descarte = [];
  state.descarteSeq = 0;
  state.espiadas = []; state.reveladas = []; state.dividas = [];
  state.comprada = null; state.poder = null; state.etapa = null;
  state.turnNo = 0;
  for (const p of state.players) {
    p.slots = [];
    p.memoria = {};
  }
  for (let k = 0; k < CARTAS_INICIAIS; k++) for (const p of state.players) p.slots.push(state.deck.pop());

  // a espiada: todos ao mesmo tempo, as duas mais perto, por 5 s
  state.phase = 'espiar';
  state.prazo = agora + ESPIADA_INICIAL_MS;
  for (const p of state.players) {
    for (const i of PERTO) {
      state.espiadas.push({ quem: p.id, p: p.id, i, card: p.slots[i], ate: state.prazo });
      lembra(state, p, p.id, i, p.slots[i]);
    }
  }
  state.turn = Math.floor(rnd() * state.players.length);
  return [{ e: 'roundStart', round: state.round }, { e: 'espiada', ms: ESPIADA_INICIAL_MS }];
}

function comecaAVez(state, agora) {
  state.phase = 'play';
  state.etapa = 'comprar';
  state.comprada = null;
  state.poder = null;
  state.prazo = agora + VEZ_MS;
}

function passaAVez(state, events, agora) {
  state.turn = (state.turn + 1) % state.players.length;
  esquecimento(state, state.players[state.turn]);
  state.turnNo++;
  comecaAVez(state, agora);
  events.push({ e: 'vez', p: state.players[state.turn].id });
  return events;
}

// Tira uma carta do monte; acabou, embaralha o descarte menos a de cima.
function tiraDoMonte(state, events) {
  if (!state.deck.length && state.descarte.length > 1) {
    const cima = state.descarte.pop();
    state.deck = embaralha(state.descarte, state.rnd || Math.random);
    state.descarte = [cima];
    events.push({ e: 'remexeu', n: state.deck.length });
  }
  return state.deck.pop() || null;
}

function poeNoDescarte(state, card) {
  state.descarte.push(card);
  state.descarteSeq++;
}

// Mais uma carta, numa posição nova, virada — nem quem recebe vê.
function punicao(state, p, events) {
  const c = tiraDoMonte(state, events);
  if (!c) return;
  p.slots.push(c);
  events.push({ e: 'punicao', p: p.id, i: p.slots.length - 1 });
}

// Bateu: sem carta nenhuma, e sem carta a caminho (alguém que lhe deve uma).
function confereBatida(state, events) {
  if (state.phase !== 'play') return events;
  for (const p of state.players) {
    if (cartasDe(p).length) continue;
    if (state.dividas.some((d) => d.para === p.id || d.de === p.id)) continue;
    return fimDaRodada(state, events, 'bateu', p.id);
  }
  return events;
}

// Quem leva no bazuca: quem gritou, se tem a menor soma SOZINHO; senão, o de
// menor soma entre os outros — e empatou com quem gritou, leva do mesmo jeito.
// Dois ou mais dos outros empatados na menor: ninguém.
function vencedorDoBazuca(state, somas, gritou) {
  const outros = state.players.filter((p) => p.id !== gritou);
  const menor = Math.min(...outros.map((p) => somas[p.id]));
  if (somas[gritou] < menor) return gritou;
  const com = outros.filter((p) => somas[p.id] === menor);
  return com.length === 1 ? com[0].id : null;
}

// `vencedor` só vem pronto na batida; no bazuca é a conta.
function fimDaRodada(state, events, motivo, vencedor = null, gritou = null) {
  if (state.comprada) poeNoDescarte(state, state.comprada);   // quem estava decidindo larga a carta
  state.comprada = null;
  const somas = Object.fromEntries(state.players.map((p) => [p.id, soma(p)]));
  if (motivo === 'bazuca') vencedor = vencedorDoBazuca(state, somas, gritou);
  const v = vencedor ? playerById(state, vencedor) : null;
  if (v) v.vitorias++;
  if (v && v.vitorias >= VITORIAS_PARA_GANHAR) state.campeao = v.id;
  state.phase = 'roundEnd';
  state.etapa = null; state.poder = null; state.prazo = null;
  state.espiadas = []; state.reveladas = []; state.dividas = [];
  state.lastRound = {
    motivo, vencedor: vencedor || null, somas, gritou,
    campeao: state.campeao,
    maos: Object.fromEntries(state.players.map((p) => [p.id, p.slots.slice()])),
  };
  events.push({ e: 'roundEnd', motivo, vencedor: vencedor || null, round: state.round, campeao: state.campeao });
  return events;
}

// Depois da rodada: a próxima — ou, se alguém chegou às 4 vitórias, o fim da
// partida (o anfitrião recomeça com `playAgain`, no servidor).
export function actNextRound(state, agora = Date.now()) {
  if (state.phase !== 'roundEnd') return [];
  if (state.campeao) {
    state.phase = 'gameEnd';
    return [{ e: 'gameEnd', campeao: state.campeao }];
  }
  return startRound(state, agora);
}

// ---------------------------------------------------------------------------
// A vez
// ---------------------------------------------------------------------------

function exigeVez(state, playerId, etapa) {
  if (state.phase !== 'play') fail(state.phase === 'espiar' ? 'Espere a espiada acabar.' : 'Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  if (etapa && state.etapa !== etapa) {
    fail({ comprar: 'Primeiro compre do monte.', decidir: 'Decida o que fazer com a carta comprada.', poder: 'Use o poder da carta.' }[state.etapa] || 'Agora não.');
  }
  return p;
}

function slotCheio(p, i, dono = 'sua') {
  if (!Number.isInteger(i) || !p.slots[i]) fail(dono === 'sua' ? 'Escolha uma carta sua.' : 'Escolha uma carta que esteja na mesa.');
  return p.slots[i];
}

export function actComprar(state, playerId, agora = Date.now()) {
  exigeVez(state, playerId, 'comprar');
  const events = [];
  const c = tiraDoMonte(state, events);
  // nem monte nem descarte para embaralhar: a vez passa sem compra (a rodada
  // só acaba batendo ou gritando)
  if (!c) return passaAVez(state, [...events, { e: 'semCarta', p: playerId }], agora);
  state.comprada = c;
  state.etapa = 'decidir';
  events.push({ e: 'comprou', p: playerId, monte: state.deck.length });
  return events;
}

// Troca a comprada por uma das suas: a sua vai para o descarte.
export function actTrocar(state, playerId, i, agora = Date.now()) {
  const p = exigeVez(state, playerId, 'decidir');
  const sai = slotCheio(p, i);
  p.slots[i] = state.comprada;
  state.comprada = null;
  poeNoDescarte(state, sai);
  // quem troca sabe o que pôs; os outros só sabem que ali mudou
  for (const r of state.players) if (r.id !== p.id) esquece(r, p.id, i);
  lembra(state, p, p.id, i, p.slots[i]);
  return depoisDoDescarteDaVez(state, p, sai, [{ e: 'trocou', p: p.id, i, card: sai }], agora);
}

export function actDescartarComprada(state, playerId, agora = Date.now()) {
  const p = exigeVez(state, playerId, 'decidir');
  const sai = state.comprada;
  state.comprada = null;
  poeNoDescarte(state, sai);
  return depoisDoDescarteDaVez(state, p, sai, [{ e: 'descartou', p: p.id, card: sai }], agora);
}

function depoisDoDescarteDaVez(state, p, card, events, agora) {
  const poder = PODERES[card.rank];
  if (!poder) return passaAVez(state, events, agora);
  state.poder = poder;
  state.etapa = 'poder';
  state.prazo = Math.max(state.prazo, agora + PODER_MINIMO_MS);
  events.push({ e: 'poder', p: p.id, poder });
  return events;
}

function espia(state, quem, alvo, i, agora) {
  const card = alvo.slots[i];
  state.espiadas = state.espiadas.filter((x) => x.quem !== quem.id);
  state.espiadas.push({ quem: quem.id, p: alvo.id, i, card, ate: agora + ESPIADA_MS });
  lembra(state, quem, alvo.id, i, card);
}

// J: olha uma carta sua.
export function actEspiar(state, playerId, i, agora = Date.now()) {
  const p = exigeVez(state, playerId, 'poder');
  if (state.poder !== 'J') fail('O poder agora é outro.');
  slotCheio(p, i);
  espia(state, p, p, i, agora);
  return passaAVez(state, [{ e: 'espiou', p: p.id, i }], agora);
}

// Q: olha uma carta de outro jogador.
export function actOlhar(state, playerId, alvoId, i, agora = Date.now()) {
  const p = exigeVez(state, playerId, 'poder');
  if (state.poder !== 'Q') fail('O poder agora é outro.');
  const alvo = playerById(state, alvoId);
  if (!alvo || alvo.id === p.id) fail('Com a dama você olha a carta de OUTRO jogador.');
  slotCheio(alvo, i, 'outro');
  espia(state, p, alvo, i, agora);
  return passaAVez(state, [{ e: 'olhou', p: p.id, alvo: alvo.id, i }], agora);
}

// K: troca uma sua com uma de outro, às cegas.
export function actReiTroca(state, playerId, i, alvoId, j, agora = Date.now()) {
  const p = exigeVez(state, playerId, 'poder');
  if (state.poder !== 'K') fail('O poder agora é outro.');
  const alvo = playerById(state, alvoId);
  if (!alvo || alvo.id === p.id) fail('Com o rei você troca com OUTRO jogador.');
  slotCheio(p, i);
  slotCheio(alvo, j, 'outro');
  [p.slots[i], alvo.slots[j]] = [alvo.slots[j], p.slots[i]];
  for (const r of state.players) acompanhaTroca(state, r, p.id, i, alvo.id, j);
  return passaAVez(state, [{ e: 'reiTrocou', p: p.id, i, alvo: alvo.id, j }], agora);
}

// Na vez, um par seu sai de uma vez.
export function actPar(state, playerId, i, j, agora = Date.now()) {
  const p = exigeVez(state, playerId);
  if (i === j) fail('Escolha duas cartas diferentes.');
  const a = slotCheio(p, i), b = slotCheio(p, j);
  const events = [];
  if (a.rank !== b.rank) {
    for (const k of [i, j]) mostra(state, p, k, agora);
    events.push({ e: 'parErrado', p: p.id, i, j, cards: [a, b] });
    punicao(state, p, events);
    return events;
  }
  p.slots[i] = null; p.slots[j] = null;
  poeNoDescarte(state, a); poeNoDescarte(state, b);
  for (const r of state.players) { esquece(r, p.id, i); esquece(r, p.id, j); }
  events.push({ e: 'par', p: p.id, i, j, cards: [a, b] });
  return confereBatida(state, events);
}

// BAZUCA: na sua vez, a qualquer momento dela. A rodada acaba na hora e vai
// para a contagem: a menor soma vence, de quem gritou ou não. `certo` diz se
// quem gritou tinha mesmo a menor (sozinho) — é o que a mesa comemora.
export function actBazuca(state, playerId, agora = Date.now()) {
  const p = exigeVez(state, playerId);
  // carta a caminho de alguém: a soma ainda não fecha
  if (state.dividas.length) fail('Espere a troca de cartas terminar.');
  // `certo`: tinha a menor soma sozinho. Empatou, perde para quem empatou.
  const minha = soma(p);
  const certo = state.players.every((x) => x.id === p.id || soma(x) > minha);
  return fimDaRodada(state, [{ e: 'bazuca', p: p.id, certo }], 'bazuca', null, p.id);
}

// ---------------------------------------------------------------------------
// Fora da vez
// ---------------------------------------------------------------------------

function mostra(state, dono, i, agora) {
  const card = dono.slots[i];
  state.reveladas = state.reveladas.filter((x) => !(x.p === dono.id && x.i === i));
  state.reveladas.push({ p: dono.id, i, card, ate: agora + REVELADA_MS });
  // carta mostrada a todos: todo robô vê
  for (const r of state.players) lembra(state, r, dono.id, i, card);
}

// Descarte rápido: a carta (de qualquer um) que tem o valor da de cima.
export function actDescartar(state, playerId, donoId, i, agora = Date.now()) {
  if (state.phase !== 'play') fail(state.phase === 'espiar' ? 'Espere a espiada acabar.' : 'Não é hora de jogar.');
  const quem = playerById(state, playerId);
  const dono = playerById(state, donoId);
  if (!quem || !dono) fail('Jogador desconhecido.');
  if (state.dividas.some((d) => d.de === quem.id)) fail('Primeiro entregue a carta que você deve.');
  // a carta já foi (alguém foi mais rápido): sem punição
  if (!Number.isInteger(i) || !dono.slots[i]) fail('Essa carta já saiu da mesa.');
  const card = dono.slots[i];
  const cima = topo(state);
  const events = [];
  if (!cima || card.rank !== cima.rank) {
    mostra(state, dono, i, agora);
    events.push({ e: 'errou', quem: quem.id, p: dono.id, i, card });
    punicao(state, quem, events);
    return events;
  }
  dono.slots[i] = null;
  poeNoDescarte(state, card);
  for (const r of state.players) esquece(r, dono.id, i);
  events.push({ e: 'rapido', quem: quem.id, p: dono.id, i, card });
  if (dono.id !== quem.id) {
    state.dividas.push({ de: quem.id, para: dono.id, i, prazo: agora + DIVIDA_MS });
    events.push({ e: 'deve', de: quem.id, para: dono.id, i });
  }
  return confereBatida(state, events);
}

// Quem acertou a carta de outro dá uma das suas, sem ver, para o buraco.
export function actDar(state, playerId, j, agora = Date.now()) {
  if (state.phase !== 'play') fail('Não é hora de jogar.');
  const k = state.dividas.findIndex((d) => d.de === playerId);
  if (k < 0) fail('Você não deve carta a ninguém.');
  const d = state.dividas[k];
  const de = playerById(state, d.de), para = playerById(state, d.para);
  slotCheio(de, j);
  para.slots[d.i] = de.slots[j];
  de.slots[j] = null;
  state.dividas.splice(k, 1);
  for (const r of state.players) moveLembranca(state, r, de.id, j, para.id, d.i);
  return confereBatida(state, [{ e: 'deu', de: de.id, j, para: para.id, i: d.i }]);
}

// ---------------------------------------------------------------------------
// O relógio
// ---------------------------------------------------------------------------

export function proximoPrazo(state) {
  const ts = [];
  if (state.phase === 'espiar' || state.phase === 'play') {
    if (state.prazo) ts.push(state.prazo);
    for (const x of state.espiadas) ts.push(x.ate);
    for (const x of state.reveladas) ts.push(x.ate);
    for (const d of state.dividas) ts.push(d.prazo);
  }
  return ts.length ? Math.min(...ts) : null;
}

export function tick(state, agora = Date.now()) {
  const events = [];
  if (state.phase !== 'espiar' && state.phase !== 'play') return events;
  const antes = state.espiadas.length + state.reveladas.length;
  state.espiadas = state.espiadas.filter((x) => x.ate > agora);
  state.reveladas = state.reveladas.filter((x) => x.ate > agora);
  const mudouVista = state.espiadas.length + state.reveladas.length !== antes;

  if (state.phase === 'espiar') {
    if (agora >= state.prazo) {
      state.espiadas = [];
      comecaAVez(state, agora);
      events.push({ e: 'comeca', p: state.players[state.turn].id });
    } else if (mudouVista) events.push({ e: 'vista' });
    return events;
  }

  // dívida vencida: vai uma carta qualquer de quem deve
  for (const d of state.dividas.slice()) {
    if (d.prazo > agora) continue;
    const de = playerById(state, d.de);
    const cheias = de.slots.map((c, j) => (c ? j : -1)).filter((j) => j >= 0);
    if (!cheias.length) { d.prazo = agora + 1000; continue; }   // a carta dele ainda está a caminho
    const j = cheias[Math.floor((state.rnd || Math.random)() * cheias.length)];
    events.push(...actDar(state, d.de, j, agora));
    if (state.phase !== 'play') return events;
  }

  if (state.prazo && agora >= state.prazo) {
    const p = state.players[state.turn];
    events.push({ e: 'estourou', p: p.id });
    if (state.etapa === 'comprar') {
      const c = tiraDoMonte(state, events);
      if (c) {
        poeNoDescarte(state, c);
        events.push({ e: 'descartou', p: p.id, card: c, semPoder: true });
      } else events.push({ e: 'semCarta', p: p.id });
    } else if (state.etapa === 'decidir') {
      poeNoDescarte(state, state.comprada);
      events.push({ e: 'descartou', p: p.id, card: state.comprada, semPoder: true });
      state.comprada = null;
    } else if (state.etapa === 'poder') {
      events.push({ e: 'poderPerdido', p: p.id, poder: state.poder });
    }
    return passaAVez(state, events, agora);
  }
  if (!events.length && mudouVista) events.push({ e: 'vista' });
  return events;
}

// Depois de um reinício do servidor os prazos já venceram: a vez recomeça.
export function retoma(state, agora = Date.now()) {
  if (state.phase === 'play' || state.phase === 'espiar') state.prazo = agora + (state.phase === 'espiar' ? ESPIADA_INICIAL_MS : VEZ_MS);
  for (const d of state.dividas || []) d.prazo = agora + DIVIDA_MS;
}

// ---------------------------------------------------------------------------

export function applyAction(state, playerId, action, agora = Date.now()) {
  switch (action.a) {
    case 'comprar': return actComprar(state, playerId, agora);
    case 'trocar': return actTrocar(state, playerId, action.i, agora);
    case 'descartarComprada': return actDescartarComprada(state, playerId, agora);
    case 'espiar': return actEspiar(state, playerId, action.i, agora);
    case 'olhar': return actOlhar(state, playerId, action.p, action.i, agora);
    case 'rei': return actReiTroca(state, playerId, action.i, action.p, action.j, agora);
    case 'par': return actPar(state, playerId, action.i, action.j, agora);
    case 'bazuca': return actBazuca(state, playerId, agora);
    case 'descartar': return actDescartar(state, playerId, action.p, action.i, agora);
    case 'dar': return actDar(state, playerId, action.j, agora);
    default: fail('Ação desconhecida.');
  }
}

// O título e a linha do fim de rodada — as duas mesas (2D e 3D) dizem igual.
// `nome(id)` devolve o nome de quem for (já escapado, na 2D); `eu`, quem olha.
export function contaDaRodada(lr, nome, eu) {
  const q = lr.vencedor, g = lr.gritou;
  if (lr.motivo === 'bateu') {
    return { titulo: q === eu ? 'Você bateu!' : `${nome(q)} bateu!`, texto: 'Ficou sem nenhuma carta: vence na hora.' };
  }
  if (lr.motivo === 'bazuca') {
    const gritou = !g ? 'Alguém gritou' : g === eu ? 'Você gritou' : `${nome(g)} gritou`;
    if (q && q === g) return { titulo: q === eu ? 'Bazuca certeiro!' : `Bazuca certeiro de ${nome(q)}!`, texto: `${gritou} BAZUCA e tinha mesmo a menor soma da mesa.` };
    const quemLeva = q === eu ? 'você' : nome(q);
    if (q && g && lr.somas?.[g] === lr.somas?.[q]) {
      return { titulo: q === eu ? 'Você leva no empate!' : `${nome(q)} leva no empate`, texto: `${gritou} BAZUCA, mas empatou com ${quemLeva}: quem grita precisa ter a menor soma sozinho.` };
    }
    if (q) return { titulo: q === eu ? 'Você tinha a menor soma!' : `${nome(q)} tinha a menor soma`, texto: `${gritou} BAZUCA, mas quem tinha menos era ${quemLeva}.` };
    return { titulo: 'Empate na menor soma: ninguém leva', texto: `${gritou} BAZUCA sem ter a menor soma, e os de menor soma empataram.` };
  }
  return { titulo: 'Fim da rodada', texto: '' };
}

// O servidor não agenda vez neste modo: quem cuida do tempo e dos robôs é o
// `tick` e os `planosDosRobos` (ver agendaTempoReal no server.js).
export const FASES_DE_VEZ = [];

// O que cada um vê. Valor de carta só aparece quando ESTÁ à vista: a de cima
// do descarte, a que você comprou, a que você está espiando agora e a que
// foi mostrada a todos por um descarte errado. Nada de "você já viu esta".
export function viewFor(state, playerId, agora = Date.now()) {
  const me = playerById(state, playerId);
  const resta = (t) => Math.max(0, t - agora);
  const fim = state.phase === 'roundEnd' || state.phase === 'gameEnd';
  const minhaVez = state.players[state.turn]?.id === playerId && state.phase === 'play';
  const devo = state.dividas.find((d) => d.de === playerId);
  return {
    modo: MODO,
    round: state.round,
    phase: state.phase,
    turnId: state.phase === 'play' && state.players[state.turn] ? state.players[state.turn].id : null,
    turnNo: state.turnNo,
    etapa: state.phase === 'play' ? state.etapa : null,
    poder: state.phase === 'play' ? state.poder : null,
    prazoMs: state.prazo ? resta(state.prazo) : null,
    topo: topo(state),
    descarteN: state.descarte.length,
    descarteSeq: state.descarteSeq,
    monte: state.deck.length,
    reveladas: state.reveladas.map((x) => ({ p: x.p, i: x.i, card: x.card, ms: resta(x.ate) })),
    dividas: state.dividas.map((d) => ({ de: d.de, para: d.para, i: d.i })),
    lastRound: fim ? state.lastRound : (state.lastRound ? { motivo: state.lastRound.motivo, vencedor: state.lastRound.vencedor } : null),
    meta: VITORIAS_PARA_GANHAR,
    campeao: state.campeao || null,
    // no fim da partida, do mais vitorioso para o menos (o formato do Caçamba)
    ranking: state.phase === 'gameEnd'
      ? [...state.players].sort((a, b) => b.vitorias - a.vitorias).map((p) => ({ id: p.id, name: p.name, score: p.vitorias }))
      : null,
    claims: [], contract: null,
    you: me ? {
      id: me.id,
      comprada: minhaVez && state.etapa === 'decidir' ? state.comprada : null,
      espiadas: state.espiadas.filter((x) => x.quem === me.id).map((x) => ({ p: x.p, i: x.i, card: x.card, ms: resta(x.ate) })),
      devo: devo ? { para: devo.para, i: devo.i } : null,
    } : null,
    players: state.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot,
      slots: p.slots.map((c) => (fim ? c : !!c)),
      handCount: cartasDe(p).length,
      vitorias: p.vitorias, score: p.vitorias,
      baixou: false, baixados: null, melds: [],
    })),
  };
}

// ============================================================================
// Robôs. Eles só "sabem" o que viram: cada um tem uma memória de posições
// ("id:posição" → valor), alimentada pelo motor nos mesmos momentos em que um
// humano veria a carta, e que se apaga com o tempo conforme o nível.
//   fácil: bem esquecido e lento; médio: às vezes acerta; difícil: boa
//   memória, mas também erra.
// ============================================================================

const PERFIL = {
  // esquece: chance de perder cada lembrança a cada vez dele; segueTroca:
  // chance de acompanhar uma carta que mudou de lugar; confunde: chance de
  // errar a posição; tenta: chance de ir no descarte rápido quando lembra;
  // margem: quanto abaixo dos outros ele quer estar para gritar (negativa =
  // afoito); naoSabe: quantas cartas suas ele aceita não saber ao gritar.
  facil: { esquece: 0.22, segueTroca: 0.3, confunde: 0.15, tenta: 0.5, reacao: [2200, 4200], pensa: [1800, 3200], margem: -3, naoSabe: 2, teto: 16 },
  normal: { esquece: 0.1, segueTroca: 0.65, confunde: 0.08, tenta: 0.75, reacao: [1500, 3200], pensa: [1400, 2800], margem: 1, naoSabe: 1, teto: 12 },
  dificil: { esquece: 0.04, segueTroca: 0.9, confunde: 0.04, tenta: 0.92, reacao: [950, 2200], pensa: [1100, 2300], margem: 3, naoSabe: 0, teto: 10 },
};
const perfil = (state) => PERFIL[state.opts?.nivelRobos] || PERFIL.normal;
const chave = (p, i) => `${p}:${i}`;

function lembra(state, r, p, i, card) {
  if (!ehRobo(state, r) || !card) return;
  r.memoria[chave(p, i)] = card.rank;
}
function esquece(r, p, i) { if (r.memoria) delete r.memoria[chave(p, i)]; }
function moveLembranca(state, r, pa, ia, pb, ib) {
  if (!r.memoria) return;
  const v = r.memoria[chave(pa, ia)];
  delete r.memoria[chave(pa, ia)];
  delete r.memoria[chave(pb, ib)];
  if (v !== undefined && ehRobo(state, r) && (state.rnd || Math.random)() < perfil(state).segueTroca) r.memoria[chave(pb, ib)] = v;
}
function acompanhaTroca(state, r, pa, ia, pb, ib) {
  if (!r.memoria || !ehRobo(state, r)) return;
  const a = r.memoria[chave(pa, ia)], b = r.memoria[chave(pb, ib)];
  delete r.memoria[chave(pa, ia)]; delete r.memoria[chave(pb, ib)];
  if ((state.rnd || Math.random)() < perfil(state).segueTroca) {
    if (b !== undefined) r.memoria[chave(pa, ia)] = b;
    if (a !== undefined) r.memoria[chave(pb, ib)] = a;
  }
}
// A cada vez dele, o robô perde um pouco do que lembrava.
function esquecimento(state, r) {
  if (!ehRobo(state, r)) return;
  const rnd = state.rnd || Math.random;
  const pe = perfil(state).esquece;
  for (const k of Object.keys(r.memoria || {})) if (rnd() < pe) delete r.memoria[k];
}

const entre = (rnd, [a, b]) => Math.round(a + rnd() * (b - a));

// O que o robô ACHA que tem em cada posição dele (undefined = não sabe).
function minhasLembrancas(r) {
  return r.slots.map((c, i) => (c ? { i, v: r.memoria[chave(r.id, i)] } : null)).filter(Boolean);
}

// Às vezes a memória troca a posição pela vizinha: é o erro de quem lembra.
function talvezConfunda(state, p, i) {
  const rnd = state.rnd || Math.random;
  if (rnd() >= perfil(state).confunde) return i;
  const cheias = p.slots.map((c, k) => (c && k !== i ? k : -1)).filter((k) => k >= 0);
  return cheias.length ? cheias[Math.floor(rnd() * cheias.length)] : i;
}

// Planos de cada robô para o momento atual. `chave` identifica o momento: o
// servidor sorteia um plano por chave, uma vez só, e o executa depois do
// `atraso` se a chave ainda valer. `action: null` = decidiu não fazer nada.
export function planosDosRobos(state, controlados = [], agora = Date.now()) {
  state.controlados = controlados.slice();
  const planos = [];
  if (state.phase !== 'play') return planos;
  const rnd = state.rnd || Math.random;
  const pf = perfil(state);
  const cima = topo(state);
  const atual = state.players[state.turn];

  for (const r of state.players) {
    if (!ehRobo(state, r)) continue;
    r.memoria ||= {};

    // 1. deve carta: dá a pior que ele lembra (ou uma qualquer)
    const divida = state.dividas.find((d) => d.de === r.id);
    if (divida) {
      const minhas = minhasLembrancas(r);
      if (minhas.length) {
        const conhecidas = minhas.filter((x) => x.v !== undefined).sort((a, b) => b.v - a.v);
        const j = conhecidas.length && conhecidas[0].v >= 5 ? conhecidas[0].i : minhas[Math.floor(rnd() * minhas.length)].i;
        planos.push({ botId: r.id, chave: `dar:${r.id}:${divida.para}:${divida.i}`, action: { a: 'dar', j }, atraso: entre(rnd, [900, 2000]) });
      }
      continue;
    }

    // 2. descarte rápido: lembra de alguma carta com o valor da de cima?
    if (cima) {
      const k = `bate:${r.id}:${state.descarteSeq}`;
      let plano = null;
      if (rnd() < pf.tenta) {
        const alvos = [];
        for (const dono of state.players) {
          dono.slots.forEach((c, i) => {
            if (c && r.memoria[chave(dono.id, i)] === cima.rank) alvos.push({ p: dono.id, i, meu: dono.id === r.id });
          });
        }
        // a própria primeiro: sai sem precisar dar carta
        alvos.sort((a, b) => Number(b.meu) - Number(a.meu));
        if (alvos.length) {
          const a = alvos[0];
          const i = talvezConfunda(state, playerById(state, a.p), a.i);
          plano = { a: 'descartar', p: a.p, i };
        }
      }
      planos.push({ botId: r.id, chave: k, action: plano, atraso: entre(rnd, pf.reacao) });
    }

    // 3. a vez dele
    if (atual?.id !== r.id) continue;
    const k = `vez:${r.id}:${state.turnNo}:${state.etapa}`;
    planos.push({ botId: r.id, chave: k, action: jogadaDaVez(state, r), atraso: entre(rnd, pf.pensa) });
  }
  return planos;
}

function jogadaDaVez(state, r) {
  const rnd = state.rnd || Math.random;
  const pf = perfil(state);
  const minhas = minhasLembrancas(r);
  const conhecidas = minhas.filter((x) => x.v !== undefined);
  const desconhecidas = minhas.filter((x) => x.v === undefined);
  const outros = state.players.filter((p) => p.id !== r.id && cartasDe(p).length);

  if (state.etapa === 'comprar') {
    // par que ele lembra
    const porValor = new Map();
    for (const x of conhecidas) { if (!porValor.has(x.v)) porValor.set(x.v, []); porValor.get(x.v).push(x.i); }
    for (const [, is] of porValor) if (is.length >= 2) return { a: 'par', i: is[0], j: is[1] };
    // bazuca: compara a soma que ele acha que tem com a que acha que cada
    // um dos outros tem (carta que não lembra conta como 6,5). O fácil é
    // afoito e grita sem saber tudo; o difícil quer folga e certeza.
    const estima = (p) => p.slots.reduce((n, c, i) => {
      if (!c) return n;
      const m = r.memoria[chave(p.id, i)];
      return n + (m === undefined ? 6.5 : m);
    }, 0);
    const minha = estima(r);
    const menorDosOutros = Math.min(...outros.map(estima));
    const gritar = state.turnNo >= state.players.length
      && desconhecidas.length <= pf.naoSabe && minha <= pf.teto
      && minha + pf.margem < menorDosOutros;
    if (gritar) return { a: 'bazuca' };
    return { a: 'comprar' };
  }

  if (state.etapa === 'decidir') {
    const v = state.comprada.rank;
    const pior = [...conhecidas].sort((a, b) => b.v - a.v)[0];
    // a comprada tem o valor de uma que ele lembra: descarta e corta a dele em seguida
    if (pf !== PERFIL.facil && conhecidas.some((x) => x.v === v)) return { a: 'descartarComprada' };
    if (pior && pior.v > v) return { a: 'trocar', i: pior.i };
    if (v <= 5 && desconhecidas.length) return { a: 'trocar', i: desconhecidas[Math.floor(rnd() * desconhecidas.length)].i };
    return { a: 'descartarComprada' };
  }

  if (state.etapa === 'poder') {
    const qualquer = (p) => { const cs = p.slots.map((c, i) => (c ? i : -1)).filter((i) => i >= 0); return cs[Math.floor(rnd() * cs.length)]; };
    if (state.poder === 'J') {
      const i = desconhecidas.length ? desconhecidas[0].i : qualquer(r);
      return { a: 'espiar', i };
    }
    const alvo = [...outros].sort((a, b) => cartasDe(a).length - cartasDe(b).length)[0];
    if (!alvo) return null;   // ninguém com carta: o poder se perde no fim do prazo
    if (state.poder === 'Q') {
      const naoSei = alvo.slots.map((c, i) => (c && r.memoria[chave(alvo.id, i)] === undefined ? i : -1)).filter((i) => i >= 0);
      return { a: 'olhar', p: alvo.id, i: naoSei.length ? naoSei[0] : qualquer(alvo) };
    }
    // K: a pior dele pela melhor que ele lembra dos outros
    const pior = [...conhecidas].sort((a, b) => b.v - a.v)[0];
    let melhor = null;
    for (const o of outros) {
      o.slots.forEach((c, j) => {
        const m = c ? r.memoria[chave(o.id, j)] : undefined;
        if (m !== undefined && (!melhor || m < melhor.v)) melhor = { p: o.id, j, v: m };
      });
    }
    const i = pior ? pior.i : qualquer(r);
    if (melhor && (!pior || melhor.v < pior.v)) return { a: 'rei', i, p: melhor.p, j: melhor.j };
    return { a: 'rei', i, p: alvo.id, j: qualquer(alvo) };
  }
  return null;
}

// Compatibilidade com o agendador comum (que este modo não usa).
export function botNextAction() { return null; }
