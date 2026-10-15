// ============================================================================
// Dominó de ponto — o terceiro modo da casa, ao lado do Presidente. Mesmo
// elenco e mesma mesa; aqui são pedras, não cartas. Vive separado dos outros
// motores de propósito: não importa nada do engine.js nem do presidente.js.
//
// Regras combinadas com o dono do jogo em 15/10/2026:
//  - 28 pedras (duplo-6), 4 jogadores em DUPLAS FIXAS: assentos 0 e 2 contra
//    1 e 3. Sete pedras para cada um; não sobra dorme.
//  - Toda mão começa com CARROÇA. Na 1ª, quem tem a 6|6 sai com ela; nas
//    seguintes, quem bateu sai com a maior carroça que tiver — se não tiver,
//    sai quem tiver a maior carroça da mesa.
//  - A primeira carroça vira CRUZ: depois que os dois lados dela são cobertos,
//    abre também em cima e embaixo (até 4 pontas). As outras carroças, não.
//  - PONTOS NAS PONTAS: depois de cada pedra (a de saída inclusive), somam-se
//    as pontas abertas; deu múltiplo de 5, quem jogou marca para a dupla. Uma
//    carroça na ponta conta os dois lados (5|5 vale 10).
//  - PASSE: o primeiro passe depois de uma pedra jogada dá 10 à dupla
//    adversária (e só pode passar assim quem não tem jogada). Os passes que
//    vêm em seguida são "no escuro": não pagam e podem ser feitos mesmo tendo
//    pedra. A cobrança volta a valer quando alguém joga.
//  - BATIDA: quem fica sem pedra marca a soma das pedras dos dois
//    adversários (o parceiro não conta), arredondada ao múltiplo de 5 mais
//    perto.
//  - TRANCOU: quem joga a pedra que deixa ninguém com jogada dá 40 à dupla
//    adversária, e a mão é refeita.
//  - A partida vai a 240.
//  - MANO A MANO (1v1, pedido em 15/10/2026): 2 na mesa, 7 pedras cada e 14
//    no DORME. Sem pedra que encaixe, compra do dorme uma a uma até poder
//    jogar; só passa (e o primeiro passe paga os 10) com o dorme vazio. A
//    batida conta a mão do adversário. Mesma meta, 240.
//
// REGRAS DA CASA ainda não confirmadas (ajustáveis aqui):
//  - Os lados de cima e de baixo da cruz só abrem depois de esquerda e direita
//    terem pedra (é a regra mais comum do "all fives").
//  - Quem já passou desde a última pedra não pode passar no escuro de novo:
//    se tem jogada, joga. Sem isso, quatro passes no escuro dariam a volta na
//    mesa para sempre.
//  - A pedra que tranca ainda marca as pontas dela antes dos 40.
//  - Depois de mão trancada, sai quem tiver a maior carroça da mesa.
//  - A partida acaba no instante em que uma dupla chega a 240, mesmo no meio
//    da mão.
//  - Mão com muitas carroças não é refeita.
//  - 1v1: a 1ª mão sai com a maior carroça das mãos (a 6|6 pode estar no
//    dorme); sem carroça nenhuma nas duas mãos, embaralha de novo. Trancou
//    com o dorme no fim: os 40 vão contra quem jogou a última pedra.
// ============================================================================

export const MODO = 'domino';
export const MIN_JOGADORES = 2;   // 1v1
export const MAX_JOGADORES = 4;   // 2v2
export const FORMATOS = { '1v1': 2, '2v2': 4 };
export const NIVEIS_DE_ROBO = ['facil', 'normal'];
export const META = 240;
export const MULTA_DO_PASSE = 10;
export const MULTA_DO_TRANCADO = 40;
export const PEDRAS_NA_MAO = 7;

// Os ramos da mesa. Esquerda e direita existem sempre; cima e baixo só na cruz.
export const RAMOS = ['esq', 'dir', 'cima', 'baixo'];

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

// As 28 pedras, com `a` <= `b`. O id é fixo por pedra (1..28): a mesma pedra
// tem o mesmo id em toda mão, o que facilita o cliente e os testes.
export function jogoDePedras() {
  const pedras = [];
  let id = 1;
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) pedras.push({ id: id++, a, b });
  return pedras;
}

function embaralha(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const ehCarroca = (p) => p.a === p.b;
export const pontosDaPedra = (p) => p.a + p.b;
export const timeDoAssento = (i) => i % 2;

// Ao múltiplo de 5 mais perto: 22 → 20, 23 → 25.
export const arredonda5 = (n) => Math.round(n / 5) * 5;

export function createGame(players, opts = {}) {
  if (players.length !== 2 && players.length !== 4) fail('O dominó é de 2 (mano a mano) ou de 4 (em dupla).');
  return {
    modo: MODO,
    opts: { nivelRobos: 'normal', meta: META, ...opts, rnd: undefined },
    players: players.map((p, i) => ({
      id: p.id, name: p.name, isBot: !!p.isBot,
      time: timeDoAssento(i),
      hand: [],
    })),
    times: [0, 0],      // placar das duplas: [assentos 0 e 2, assentos 1 e 3]
    round: -1,
    phase: 'lobby',
    turn: 0,
    turnNo: 0,
    deck: [],           // o retrato da sala confere que existe; aqui fica vazio
    dorme: [],          // o que sobra fora das mãos (só no 1v1)
    mesa: null,         // { centro, ramos: { esq: [...], dir, cima, baixo } }
    saida: null,        // id da carroça com que a mão tem de abrir
    passes: [],         // quem passou desde a última pedra jogada
    lances: [],         // as últimas jogadas, para o cliente narrar
    lastRound: null,    // { motivo, por, pontos, maos }
    vencedor: null,     // índice da dupla, quando a partida acaba
    rnd: opts.rnd || Math.random,
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}

function idxDe(state, id) {
  return state.players.findIndex((p) => p.id === id);
}

// ----------------------------------------------------------------------------
// A mesa
// ----------------------------------------------------------------------------

function mesaVazia(centro) {
  return { centro, ramos: { esq: [], dir: [], cima: [], baixo: [] } };
}

const ehCruz = (mesa) => !!mesa?.centro && ehCarroca(mesa.centro);

// As pontas em que dá para encostar uma pedra agora: [{ ramo, valor }].
export function pontasAbertas(mesa) {
  if (!mesa?.centro) return [];
  const { centro, ramos } = mesa;
  const pontas = [];
  const lado = (ramo, doCentro) => {
    const r = ramos[ramo];
    pontas.push({ ramo, valor: r.length ? r[r.length - 1].fora : doCentro });
  };
  lado('esq', centro.a);
  lado('dir', centro.b);
  if (ehCruz(mesa) && ramos.esq.length && ramos.dir.length) {
    lado('cima', centro.a);
    lado('baixo', centro.a);
  }
  return pontas;
}

// A soma que vale ponto. Carroça na ponta conta os dois lados; a cruz conta
// enquanto um dos lados dela ainda está descoberto, e deixa de contar quando
// esquerda e direita têm pedra.
export function somaDasPontas(mesa) {
  if (!mesa?.centro) return 0;
  const { centro, ramos } = mesa;
  const ponta = (r) => { const u = r[r.length - 1]; return ehCarroca(u.pedra) ? 2 * u.fora : u.fora; };
  if (!ramos.esq.length && !ramos.dir.length) return centro.a + centro.b;
  let soma = 0;
  for (const [ramo, doCentro] of [['esq', centro.a], ['dir', centro.b]]) {
    const r = ramos[ramo];
    if (r.length) soma += ponta(r);
    else soma += ehCarroca(centro) ? 2 * doCentro : doCentro;
  }
  for (const ramo of ['cima', 'baixo']) if (ramos[ramo].length) soma += ponta(ramos[ramo]);
  return soma;
}

export const pontosDaSoma = (soma) => (soma > 0 && soma % 5 === 0 ? soma : 0);

// Os ramos em que esta pedra encaixa.
export function ramosPara(mesa, pedra) {
  return pontasAbertas(mesa).filter((p) => p.valor === pedra.a || p.valor === pedra.b).map((p) => p.ramo);
}

// Todas as jogadas de uma mão: [{ pedraId, ramo }]. Com a mesa vazia, só a
// carroça de saída (o ramo fica null).
export function jogadasPossiveis(state, hand) {
  if (!state.mesa) {
    return hand.filter((p) => p.id === state.saida).map((p) => ({ pedraId: p.id, ramo: null }));
  }
  const out = [];
  for (const p of hand) for (const ramo of ramosPara(state.mesa, p)) out.push({ pedraId: p.id, ramo });
  return out;
}

const temJogada = (state, hand) => jogadasPossiveis(state, hand).length > 0;

// Encosta a pedra no ramo, virada para o lado certo. Não valida a vez.
function encosta(mesa, pedra, ramo) {
  const valor = pontasAbertas(mesa).find((p) => p.ramo === ramo).valor;
  const fora = pedra.a === valor ? pedra.b : pedra.a;
  mesa.ramos[ramo].push({ pedra, dentro: valor, fora });
}

// ----------------------------------------------------------------------------
// Mão
// ----------------------------------------------------------------------------

const maiorCarroca = (hand) => hand.filter(ehCarroca).sort((x, y) => y.a - x.a)[0] || null;

// Quem sai e com qual carroça. Sempre existe alguém: as 28 pedras estão nas
// mãos e há 7 carroças.
function quemSai(state) {
  const bateu = state.lastRound?.motivo === 'batida' ? idxDe(state, state.lastRound.por) : -1;
  if (bateu >= 0) {
    const c = maiorCarroca(state.players[bateu].hand);
    if (c) return { i: bateu, pedra: c };
  }
  let melhor = null;
  state.players.forEach((p, i) => {
    const c = maiorCarroca(p.hand);
    if (c && (!melhor || c.a > melhor.pedra.a)) melhor = { i, pedra: c };
  });
  return melhor;
}

export function startRound(state) {
  const rnd = state.rnd || Math.random;
  state.round++;
  let sai = null;
  // No 2v2 as 7 carroças estão nas mãos; no 1v1 podem estar todas no dorme,
  // e aí embaralha de novo (acontece uma vez a cada ~300 mãos).
  while (!sai) {
    const pedras = embaralha(jogoDePedras(), rnd);
    state.players.forEach((p, i) => { p.hand = pedras.slice(i * PEDRAS_NA_MAO, (i + 1) * PEDRAS_NA_MAO); });
    state.dorme = pedras.slice(state.players.length * PEDRAS_NA_MAO);
    sai = quemSai(state);
  }
  state.mesa = null; state.passes = []; state.lances = []; state.turnNo = 0;
  const { i, pedra } = sai;
  state.saida = pedra.id;
  state.turn = i;
  state.phase = 'play';
  return [{ e: 'roundStart', round: state.round }, { e: 'abre', p: state.players[i].id, pedraId: pedra.id }];
}

function marca(state, time, pts, motivo, events, p) {
  if (!pts) return false;
  state.times[time] += pts;
  events.push({ e: 'marcou', time, pts, motivo, ...(p ? { p } : {}) });
  if (state.times[time] >= (state.opts?.meta || META)) {
    fimDaPartida(state, time, events);
    return true;
  }
  return false;
}

export function actJogar(state, playerId, pedraId, ramo) {
  if (state.phase !== 'play') fail('Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  const pedra = p.hand.find((x) => x.id === pedraId);
  if (!pedra) fail('Essa pedra não está na sua mão.');

  if (!state.mesa) {
    if (pedra.id !== state.saida) {
      const s = p.hand.find((x) => x.id === state.saida);
      fail(`A mão abre com carroça: saia com a ${s.a}|${s.b}.`);
    }
    state.mesa = mesaVazia(pedra);
    ramo = null;
  } else {
    const cabem = ramosPara(state.mesa, pedra);
    if (!cabem.length) fail(`A ${pedra.a}|${pedra.b} não encaixa em nenhuma ponta.`);
    if (ramo == null) {
      // Sem ramo dito: só serve se não houver o que escolher.
      if (cabem.length > 1) fail('Escolha em qual ponta encostar.');
      ramo = cabem[0];
    }
    if (!cabem.includes(ramo)) fail(`A ${pedra.a}|${pedra.b} não encaixa nessa ponta.`);
    encosta(state.mesa, pedra, ramo);
  }

  p.hand = p.hand.filter((x) => x !== pedra);
  state.passes = [];
  state.turnNo++;
  const soma = somaDasPontas(state.mesa);
  const pts = pontosDaSoma(soma);
  state.lances.push({ p: p.id, pedraId: pedra.id, ramo, pts });
  if (state.lances.length > 8) state.lances.shift();
  const events = [{ e: 'jogou', p: p.id, pedra: { ...pedra }, ramo, soma, pts }];
  if (marca(state, p.time, pts, 'pontas', events, p.id)) return events;

  if (!p.hand.length) return batida(state, p, events);
  if (trancada(state)) return trancou(state, p, events);
  state.turn = (state.turn + 1) % state.players.length;
  return events;
}

// Ninguém tem jogada e não há o que comprar.
const trancada = (state) => !(state.dorme?.length) && state.players.every((x) => !temJogada(state, x.hand));

// 1v1: sem pedra que encaixe, compra uma do dorme. A vez continua com quem
// comprou — compra de novo ou joga.
export function actComprar(state, playerId) {
  if (state.phase !== 'play') fail('Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  if (!state.mesa) fail('A mão abre com carroça: é você quem sai.');
  if (!state.dorme?.length) fail('O dorme acabou.');
  if (temJogada(state, p.hand)) fail('Você tem pedra que encaixa: jogue.');
  const pedra = state.dorme.pop();
  p.hand.push(pedra);
  state.turnNo++;
  const events = [{ e: 'comprou', p: p.id, resta: state.dorme.length }];
  // Comprou a última e ninguém tem jogada: a mesa já estava trancada pela
  // última pedra jogada.
  if (trancada(state)) {
    const ultimo = state.lances[state.lances.length - 1];
    const por = ultimo ? playerById(state, ultimo.p) : p;
    return trancou(state, por, events);
  }
  return events;
}

export function actPassar(state, playerId) {
  if (state.phase !== 'play') fail('Não é hora de jogar.');
  const p = state.players[state.turn];
  if (!p || p.id !== playerId) fail('Não é a sua vez.');
  if (!state.mesa) fail('A mão abre com carroça: é você quem sai.');
  const pode = temJogada(state, p.hand);
  if (!pode && state.dorme?.length) fail('Sem pedra que encaixe: compre do dorme.');
  const primeiro = state.passes.length === 0;
  if (pode && primeiro) fail('Você tem jogada. Só passa no escuro depois que alguém passar.');
  if (pode && state.passes.includes(p.id)) fail('Você já passou nesta volta: agora tem de jogar.');
  state.passes.push(p.id);
  state.turnNo++;
  const events = [{ e: 'passou', p: p.id, escuro: !primeiro, tinha: pode }];
  if (primeiro && marca(state, 1 - p.time, MULTA_DO_PASSE, 'passe', events, p.id)) return events;
  state.turn = (state.turn + 1) % state.players.length;
  return events;
}

function retratoDasMaos(state) {
  return Object.fromEntries(state.players.map((p) => [p.id, p.hand.map((x) => ({ ...x }))]));
}

function batida(state, p, events) {
  const adversarios = state.players.filter((x) => x.time !== p.time);
  const resto = adversarios.reduce((n, x) => n + x.hand.reduce((m, y) => m + pontosDaPedra(y), 0), 0);
  const pts = arredonda5(resto);
  events.push({ e: 'bateu', p: p.id, resto, pts });
  const acabou = marca(state, p.time, pts, 'batida', events, p.id);
  state.lastRound = { motivo: 'batida', por: p.id, time: p.time, resto, pontos: pts, maos: retratoDasMaos(state) };
  if (acabou) return events;
  return fimDaMao(state, events);
}

function trancou(state, p, events) {
  events.push({ e: 'trancou', p: p.id });
  const acabou = marca(state, 1 - p.time, MULTA_DO_TRANCADO, 'trancado', events, p.id);
  state.lastRound = { motivo: 'trancado', por: p.id, time: 1 - p.time, pontos: MULTA_DO_TRANCADO, maos: retratoDasMaos(state) };
  if (acabou) return events;
  return fimDaMao(state, events);
}

function fimDaMao(state, events) {
  state.phase = 'roundEnd';
  events.push({ e: 'roundEnd', round: state.round, motivo: state.lastRound.motivo, times: state.times.slice() });
  return events;
}

function fimDaPartida(state, time, events) {
  state.phase = 'gameEnd';
  state.vencedor = time;
  // Batida e trancado reescrevem isto logo depois, com o que houve na mão.
  state.lastRound = { motivo: 'meta', por: null, time, pontos: 0, maos: retratoDasMaos(state) };
  events.push({ e: 'gameEnd', vencedor: time, times: state.times.slice() });
}

export function actNextRound(state) {
  if (state.phase !== 'roundEnd') return [];
  return startRound(state);
}

export function applyAction(state, playerId, action) {
  switch (action.a) {
    case 'jogar': return actJogar(state, playerId, action.pedraId, action.ramo ?? null);
    case 'passar': return actPassar(state, playerId);
    case 'comprar': return actComprar(state, playerId);
    default: fail('Ação desconhecida.');
  }
}

// Fases em que alguém precisa agir (é onde o servidor agenda robô e cobrança).
export const FASES_DE_VEZ = ['play'];

// As pedras que sobraram em cada mão só aparecem enquanto a mão está fechada.
function resumoDaMao(state) {
  const r = state.lastRound;
  if (!r) return null;
  if (state.phase === 'roundEnd' || state.phase === 'gameEnd') return r;
  const { maos, ...resto } = r;
  return resto;
}

export function viewFor(state, playerId) {
  const me = playerById(state, playerId);
  const daVez = state.players[state.turn];
  const minhaVez = state.phase === 'play' && daVez && me && daVez.id === me.id;
  const mesa = state.mesa
    ? {
      centro: state.mesa.centro,
      cruz: ehCruz(state.mesa),
      ramos: Object.fromEntries(RAMOS.map((r) => [r, state.mesa.ramos[r].map((x) => ({ ...x }))])),
      pontas: pontasAbertas(state.mesa),
      soma: somaDasPontas(state.mesa),
    }
    : null;
  return {
    modo: MODO,
    round: state.round,
    phase: state.phase,
    turnId: daVez ? daVez.id : null,
    turnNo: state.turnNo,
    meta: state.opts?.meta || META,
    times: state.times.slice(),
    vencedor: state.vencedor,
    mesa,
    saida: state.mesa ? null : state.saida,
    passes: state.passes.slice(),
    formato: state.players.length === 2 ? '1v1' : '2v2',
    dorme: state.dorme?.length || 0,
    lances: state.lances.slice(),
    lastRound: resumoDaMao(state),
    you: me
      ? {
        id: me.id, time: me.time, hand: me.hand,
        jogadas: minhaVez ? jogadasPossiveis(state, me.hand) : [],
        podePassar: !!minhaVez && !!state.mesa && (!temJogada(state, me.hand)
          ? !state.dorme?.length : state.passes.length > 0 && !state.passes.includes(me.id)),
        podeComprar: !!minhaVez && !!state.mesa && !!state.dorme?.length && !temJogada(state, me.hand),
        passeCusta: minhaVez && state.passes.length === 0 ? MULTA_DO_PASSE : 0,
      }
      : null,
    players: state.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot,
      time: p.time,
      handCount: p.hand.length,
      score: state.times[p.time],
      passou: state.passes.includes(p.id),
    })),
  };
}

// ============================================================================
// Robô
// ============================================================================

// O que os adversários podem marcar logo depois desta jogada, olhando só as
// pontas (o robô não espia mão). Serve para não deixar a soma "de bandeja".
function riscoDepois(mesa, ramo, pedra) {
  const m = { centro: mesa.centro, ramos: Object.fromEntries(RAMOS.map((r) => [r, mesa.ramos[r].slice()])) };
  encosta(m, pedra, ramo);
  let pior = 0;
  for (const ponta of pontasAbertas(m)) {
    for (let v = 0; v <= 6; v++) {
      const teste = { centro: m.centro, ramos: Object.fromEntries(RAMOS.map((r) => [r, m.ramos[r].slice()])) };
      encosta(teste, { id: -1, a: Math.min(ponta.valor, v), b: Math.max(ponta.valor, v) }, ponta.ramo);
      pior = Math.max(pior, pontosDaSoma(somaDasPontas(teste)));
    }
  }
  return pior;
}

export function botNextAction(state, playerId) {
  const p = state.players[state.turn];
  if (!p || p.id !== playerId || state.phase !== 'play') return null;
  const jogadas = jogadasPossiveis(state, p.hand);
  if (!jogadas.length) return state.mesa && state.dorme?.length ? { a: 'comprar' } : { a: 'passar' };
  const rnd = state.rnd || Math.random;
  if (state.opts?.nivelRobos === 'facil') {
    const j = jogadas[Math.floor(rnd() * jogadas.length)];
    return { a: 'jogar', pedraId: j.pedraId, ramo: j.ramo };
  }
  if (!state.mesa) return { a: 'jogar', pedraId: jogadas[0].pedraId, ramo: null };
  // Normal: marca o que puder agora, não entrega muito ao outro lado e, no
  // empate, livra a pedra mais pesada (é o que conta na batida).
  let melhor = null;
  for (const j of jogadas) {
    const pedra = p.hand.find((x) => x.id === j.pedraId);
    const m = { centro: state.mesa.centro, ramos: Object.fromEntries(RAMOS.map((r) => [r, state.mesa.ramos[r].slice()])) };
    encosta(m, pedra, j.ramo);
    const ganho = pontosDaSoma(somaDasPontas(m));
    const valor = ganho - 0.4 * riscoDepois(state.mesa, j.ramo, pedra) + 0.3 * pontosDaPedra(pedra) + (ehCarroca(pedra) ? 1 : 0);
    if (!melhor || valor > melhor.valor) melhor = { ...j, valor };
  }
  return { a: 'jogar', pedraId: melhor.pedraId, ramo: melhor.ramo };
}
