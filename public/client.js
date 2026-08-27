// ============================================================================
// Caçamba — cliente (celular): telas, mesa e interação com o servidor
// ============================================================================

import {
  planBaixada, layoffOption, layoffEnds, removableCards, SUITS, SUIT_RED, rankLabel,
  isJoker, JOKER_LABEL, coringaNaSequencia, cardCobreCoringa, SWAP_JOKER_SAME_TURN,
  DEFAULT_OPTS,
} from '/shared/engine.js';

const $ = (id) => document.getElementById(id);

// ---------------- Estado local ----------------

let ws = null;
let view = null;          // última visão do jogo enviada pelo servidor
let lobby = null;         // última visão da sala
let session = loadJSON('cacamba-session');
let selected = new Set(); // cartas da mão selecionadas (ids)
let sortMode = localStorage.getItem('cacamba-sort') || 'suit';
let meldDiscardMode = false;
let reconnectDelay = 500;

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem('cacamba-session', JSON.stringify(s));
    else localStorage.removeItem('cacamba-session');
  } catch { /* modo privado */ }
}

// ---------------- Conexão ----------------

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen = () => {
    reconnectDelay = 500;
    if (session) ws.send(JSON.stringify({ t: 'resume', ...session }));
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMessage(msg);
  };
  ws.onclose = () => {
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.6, 6000);
  };
}

function sendMsg(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function sendAction(action) { sendMsg({ t: 'action', action }); }

function handleMessage(msg) {
  switch (msg.t) {
    case 'welcome':
      saveSession({ code: msg.code, playerId: msg.playerId, token: msg.token });
      break;
    case 'lobby': {
      // Anfitrião pode mudar no meio (o antigo caiu): quem foi promovido
      // precisa re-renderizar o modal de fim de rodada/jogo para ganhar o
      // botão de continuar — senão a sala fica presa em "esperando…".
      const hostMudou = lobby && msg.hostId !== lobby.hostId;
      lobby = msg;
      if (!msg.started) showScreen('lobby');
      renderLobby();
      if (hostMudou && view) { modalPhaseShown = null; render(); }
      break;
    }
    case 'state':
      view = msg.view;
      showScreen('game');
      for (const ev of msg.events || []) announce(ev);
      render();
      break;
    case 'error':
      toast(`⚠️ ${msg.msg}`);
      break;
    case 'gone':
      saveSession(null);
      showScreen('home');
      break;
  }
}

// ---------------- Telas ----------------

function showScreen(name) {
  for (const s of ['home', 'lobby', 'game']) $(`screen-${s}`).hidden = s !== name;
}

const me = () => session?.playerId;
const isHost = () => lobby && lobby.hostId === me();

function playerName(id) {
  const p = (view?.players || lobby?.players || []).find((x) => x.id === id);
  if (!p) return '???';
  return id === me() ? 'Você' : p.name;
}

// ---------------- Tela inicial ----------------

const params = new URLSearchParams(location.search);
if (params.get('sala')) $('code-input').value = params.get('sala').toUpperCase();
$('name-input').value = localStorage.getItem('cacamba-name') || '';

function myNameInput() {
  const name = $('name-input').value.trim();
  if (!name) {
    $('home-error').textContent = 'Escreva seu nome primeiro.';
    $('home-error').hidden = false;
    return null;
  }
  $('home-error').hidden = true;
  try { localStorage.setItem('cacamba-name', name); } catch { /* ok */ }
  return name;
}

$('btn-create').onclick = () => {
  const name = myNameInput();
  if (name) { saveSession(null); sendMsg({ t: 'create', name }); }
};
$('btn-join').onclick = () => {
  const name = myNameInput();
  const code = $('code-input').value.trim().toUpperCase();
  if (!name) return;
  if (code.length !== 4) {
    $('home-error').textContent = 'O código da sala tem 4 letras.';
    $('home-error').hidden = false;
    return;
  }
  saveSession(null);
  sendMsg({ t: 'join', code, name });
};
$('btn-rules-home').onclick = () => showRules();

// ---------------- Lobby ----------------

function renderLobby() {
  if (!lobby) return;
  $('lobby-code').textContent = lobby.code;
  $('lobby-url').textContent = lobby.joinUrl;
  if (lobby.qr) { $('lobby-qr').src = lobby.qr; $('lobby-qr').hidden = false; }

  const list = $('lobby-players');
  list.innerHTML = '';
  for (const p of lobby.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot' + (p.connected ? '' : ' off');
    li.appendChild(dot);
    li.appendChild(document.createTextNode(p.id === me() ? `${p.name} (você)` : p.name));
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = p.isBot ? '🤖 robô' : (p.id === lobby.hostId ? 'anfitrião' : '');
    li.appendChild(tag);
    if (p.isBot && isHost()) {
      const x = document.createElement('button');
      x.className = 'bot-x';
      x.textContent = '✕';
      x.setAttribute('aria-label', `Remover ${p.name}`);
      x.onclick = () => sendMsg({ t: 'removeBot', botId: p.id });
      li.appendChild(x);
    }
    list.appendChild(li);
  }

  $('btn-add-bot').hidden = !isHost() || lobby.players.length >= DEFAULT_OPTS.maxPlayers;
  $('btn-start').hidden = !isHost();
  $('btn-start').disabled = lobby.players.length < DEFAULT_OPTS.minPlayers;
  $('lobby-wait').hidden = isHost();
}

$('btn-add-bot').onclick = () => sendMsg({ t: 'addBot' });
$('btn-start').onclick = () => sendMsg({ t: 'start' });
$('btn-leave-lobby').onclick = () => {
  saveSession(null);
  history.replaceState(null, '', location.pathname);
  location.reload();
};

// ---------------- Cartas (DOM) ----------------

function cardEl(card, mini = false) {
  const el = document.createElement('div');
  const joker = isJoker(card);
  el.className = 'card'
    + (joker ? ' joker' : '')
    + (!joker && SUIT_RED[card.suit] ? ' red' : '')
    + (mini ? ' mini' : '');
  const idx = document.createElement('span');
  idx.className = 'idx';
  idx.textContent = joker ? 'C' : rankLabel(card.rank) + SUITS[card.suit];
  const pip = document.createElement('span');
  pip.className = 'pip';
  pip.textContent = joker ? JOKER_LABEL : SUITS[card.suit];
  el.append(idx, pip);
  return el;
}

function cardText(card) {
  return isJoker(card) ? `${JOKER_LABEL} coringa` : rankLabel(card.rank) + SUITS[card.suit];
}

// Rótulo de um valor de sequência (14 = Ás alto) com o naipe do jogo
function valorText(v, suit) {
  return rankLabel(v === 14 ? 1 : v) + SUITS[suit];
}

// ---------------- Troca de coringa ----------------
// Tudo aqui usa as mesmas funções do motor que o servidor usa, então a tela só
// oferece o que o juiz aceitaria. Nada de regra reimplementada no cliente.

function todosOsJogos() {
  return view ? view.players.flatMap((p) => p.melds) : [];
}

// Trocas possíveis agora, já com os destinos válidos de cada uma.
function trocasDisponiveis() {
  if (!view || !view.you || !view.you.podeTrocarCoringa) return [];
  if (!myTurn() || view.phase !== 'play' || meldDiscardMode) return [];
  const jogos = todosOsJogos();
  const out = [];
  for (const meld of jogos) {
    const info = coringaNaSequencia(meld);
    if (!info) continue;
    const card = view.you.hand.find((c) => cardCobreCoringa(c, meld));
    if (!card) continue;
    // Só quando a troca é atômica é que existe destino a escolher; no modo
    // normal o coringa simplesmente vem para a mão.
    if (!SWAP_JOKER_SAME_TURN) { out.push({ meld, info, card, destinos: [] }); continue; }
    const destinos = [];
    for (const dest of jogos) {
      const opt = layoffOption(info.joker, dest, dest.id === meld.id ? 1 : 0);
      if (opt) destinos.push({ meld: dest, opt });
    }
    if (destinos.length) out.push({ meld, info, card, destinos });
  }
  return out;
}

function trocaDoJogo(meldId) {
  return trocasDisponiveis().find((t) => t.meld.id === meldId) || null;
}

// "no seu jogo" / "no jogo de Fulano"
function noJogoDe(meld) {
  const dono = view.players.find((p) => p.melds.some((m) => m.id === meld.id));
  if (!dono) return 'no jogo da mesa';
  return dono.id === me() ? 'no seu jogo' : `no jogo de ${escapeHTML(dono.name)}`;
}

// Na listagem de um jogo o coringa é só o símbolo: "5♠ 6♠ 🃏 8♠" lê melhor
// que "5♠ 6♠ 🃏 coringa 8♠".
function cartasDoJogo(meld) {
  return meld.cards.map((c) => (isJoker(c) ? JOKER_LABEL : cardText(c))).join(' ');
}

function descreveDestino({ meld, opt }) {
  const ponta = opt.end === 'lo' ? 'embaixo' : 'em cima';
  return `${ponta}, valendo <strong>${valorText(opt.v, meld.suit)}</strong> — ${noJogoDe(meld)}: ${cartasDoJogo(meld)}`;
}

// Passo 1: escolher destino — só existe quando a troca é atômica.
function abrirTrocaCoringa(meldId) {
  const troca = trocaDoJogo(meldId);
  if (!troca) return; // a visão mudou no meio do caminho
  if (!SWAP_JOKER_SAME_TURN) return confirmarTroca(troca, null);
  if (troca.destinos.length === 1) return confirmarTroca(troca, troca.destinos[0]);

  const cabecalho = `
    <h3>Trocar o coringa</h3>
    <p>Este coringa vale <strong>${valorText(troca.info.valor, troca.info.suit)}</strong>, ${noJogoDe(troca.meld)}:<br>${cartasDoJogo(troca.meld)}</p>
    <p>Entra no lugar dele a sua carta <strong>${cardText(troca.card)}</strong>.</p>
    <p class="modal-hint">Onde o coringa vai ficar? Ele precisa ser usado agora, neste turno.</p>`;
  showModal(
    cabecalho,
    [
      ...troca.destinos.map((d) => ({
        label: `${valorText(d.opt.v, d.meld.suit)} ${d.opt.end === 'lo' ? 'embaixo' : 'em cima'} · ${noJogoDe(d.meld)}`,
        fn: () => confirmarTroca(troca, d),
      })),
      { label: 'Cancelar', fn: closeModal, cls: 'btn-ghost' },
    ],
    closeModal,
    true,
  );
}

// Passo 2: confirmação final — a jogada não tem volta
function confirmarTroca(troca, destino) {
  const destinoHTML = destino
    ? `<p>O coringa vai para ${descreveDestino(destino)}.</p>`
    : `<p>O coringa <strong>vem para a sua mão</strong> — dá para guardar e usar depois.</p>
       <p class="modal-hint">Atenção: na mão ele vale 20 pontos se a rodada acabar com ele lá.</p>`;
  showModal(
    `<h3>Confirmar a troca</h3>
     <p>Você entrega <strong>${cardText(troca.card)}</strong> e ela ocupa o lugar do coringa ${noJogoDe(troca.meld)}:<br>${cartasDoJogo(troca.meld)}</p>
     ${destinoHTML}
     <p class="modal-hint">Não dá para desfazer.</p>`,
    [
      {
        label: 'Trocar',
        cls: 'btn-primary',
        fn: () => {
          closeModal();
          sendAction({
            a: 'swapJoker',
            meldId: troca.meld.id,
            cardId: troca.card.id,
            destMeldId: destino ? destino.meld.id : null,
          });
        },
      },
      { label: 'Cancelar', fn: closeModal, cls: 'btn-ghost' },
    ],
    closeModal,
  );
}

function sortedHand() {
  const hand = [...(view?.you?.hand || [])];
  if (sortMode === 'suit') hand.sort((a, b) => a.suit - b.suit || a.rank - b.rank);
  else hand.sort((a, b) => a.rank - b.rank || a.suit - b.suit);
  return hand;
}

// ---------------- Mesa ----------------

function myTurn() { return view && view.turnId === me(); }

function render() {
  if (!view) return;
  selected = new Set([...selected].filter((id) => (view.you?.hand || []).some((c) => c.id === id)));

  // Cabeçalho
  $('round-label').textContent = `Rodada ${view.round + 1}/${view.totalRounds} · ${6 + view.round} cartas`;
  $('contract-label').textContent = view.contract ? view.contract.label : '';

  renderOpponents();
  renderCenter();
  renderMyMelds();
  renderHand();
  renderActions();
  renderPhaseModal();
}

function renderOpponents() {
  const box = $('opponents');
  box.innerHTML = '';
  for (const p of view.players) {
    if (p.id === me()) continue;
    const el = document.createElement('div');
    el.className = 'opponent' + (view.turnId === p.id && view.phase !== 'roundEnd' ? ' turn' : '');

    const head = document.createElement('div');
    head.className = 'opp-head';
    const name = document.createElement('span');
    name.className = 'opp-name';
    name.textContent = p.name;
    const count = document.createElement('span');
    count.className = 'opp-count';
    count.textContent = `🂠${p.handCount}`;
    head.append(name, count);
    el.appendChild(head);

    const badges = document.createElement('div');
    badges.className = 'opp-badges';
    const totalJogos = view.contract ? view.contract.t + view.contract.s : 0;
    const jogosFeitos = p.baixados ? p.baixados.t + p.baixados.s : 0;
    if (p.baixou) badges.appendChild(badge('baixou', 'gold'));
    else if (jogosFeitos > 0) badges.appendChild(badge(`baixou ${jogosFeitos}/${totalJogos}`, 'gold'));
    if (view.claims.includes(p.id)) badges.appendChild(badge('🛒 quer a carta', 'cart'));
    if (!p.isBot && !p.connected) badges.appendChild(badge('fora', 'off'));
    el.appendChild(badges);

    if (p.melds.length) {
      const melds = document.createElement('div');
      melds.className = 'opp-melds';
      for (const m of p.melds) melds.appendChild(meldEl(m, true));
      el.appendChild(melds);
    }
    if (view.turnId === p.id) el.dataset.daVez = '1';
    box.appendChild(el);
  }
  avisaAdversariosForaDaVista(box);
}

// PROVISÓRIO — ver o comentário em style.css. Enquanto a faixa de adversários
// não couber na tela, ela não pode esconder ninguém em silêncio: avisa quantos
// estão fora do enquadramento e rola até quem está na vez.
function avisaAdversariosForaDaVista(box) {
  const hint = $('opponents-hint');
  if (!hint) return;
  const sobra = box.scrollWidth - box.clientWidth;
  if (sobra <= 4 || box.children.length === 0) {
    hint.hidden = true;
    return;
  }
  const larguraMedia = box.scrollWidth / box.children.length;
  const cabem = Math.max(1, Math.floor(box.clientWidth / larguraMedia));
  const fora = Math.max(0, box.children.length - cabem);
  hint.textContent = `⇄ ${box.children.length} adversários · ${fora} fora da tela — arraste para o lado`;
  hint.hidden = false;
  // Traz quem está na vez para o centro: sem isso o aviso "Vez de Fulano"
  // aponta para alguém invisível.
  const daVez = box.querySelector('[data-da-vez="1"]');
  if (daVez) {
    box.scrollLeft = Math.max(0, daVez.offsetLeft - (box.clientWidth - daVez.offsetWidth) / 2);
  }
}

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = 'badge' + (cls ? ` ${cls}` : '');
  b.textContent = text;
  return b;
}

function renderCenter() {
  $('deck-count').textContent = view.deckCount;
  const dc = $('discard-card');
  dc.replaceWith(Object.assign(
    view.discardTop ? cardEl(view.discardTop) : emptyCard(),
    { id: 'discard-card' },
  ));

  const canDraw = myTurn() && view.phase === 'draw';
  const trancado = !!view.discardTop && !view.discardBuyable;
  $('deck-pile').classList.toggle('glow', canDraw);
  $('discard-pile').classList.toggle('glow', canDraw && !!view.discardTop && !trancado);
  $('discard-pile').classList.toggle('trancado', trancado);
  $('discard-pile').querySelector('.pile-count').textContent = trancado ? '🔒 trancado' : 'meio';

  // Compra fora da vez — coringa no topo não é comprável por ninguém
  const claimable = view.phase === 'draw' && !myTurn() && view.discardFresh && view.discardBuyable
    && view.phase !== 'roundEnd' && view.you;
  const claimed = view.claims.includes(me());
  $('btn-claim').hidden = !claimable;
  if (claimable) {
    $('btn-claim').classList.toggle('claimed', claimed);
    $('btn-claim').textContent = claimed
      ? '✓ Pedido feito — quem está na vez tem preferência'
      : `🛒 Quero o ${cardText(view.discardTop)}!`;
  }

  // Aviso da vez
  const banner = $('turn-banner');
  if (view.phase === 'draw' || view.phase === 'play') {
    if (myTurn()) {
      banner.textContent = view.phase === 'draw' ? 'Sua vez! Puxe do monte ou pegue do meio.' : 'Baixe, encaixe ou descarte uma carta.';
      banner.className = 'turn-banner me';
    } else {
      banner.textContent = `Vez de ${playerName(view.turnId)}…`;
      banner.className = 'turn-banner';
    }
  } else {
    banner.textContent = '';
  }
}

function emptyCard() {
  const el = document.createElement('div');
  el.className = 'card empty';
  return el;
}

function meldEl(meld, mini) {
  const el = document.createElement('div');
  el.className = 'meld';
  el.dataset.meldId = meld.id;
  for (const c of meld.cards) {
    const ce = cardEl(c, true);
    ce.dataset.cardId = c.id;
    el.appendChild(ce);
  }
  if (!mini) decorateMeld(el, meld);
  return el;
}

// Realces de encaixe/descarte de jogo nos meus jogos e nos da mesa
function decorateMeld(el, meld) {
  const my = myTurn() && view.phase === 'play';
  if (!my) return;

  // Coringa acionável só quando a troca realmente é possível para mim agora:
  // já baixei em turno anterior, é minha vez, e tenho a carta exata na mão.
  const troca = trocaDoJogo(meld.id);
  if (troca && !meldDiscardMode) {
    el.classList.add('swappable');
    for (const ce of el.children) {
      if (Number(ce.dataset.cardId) !== troca.info.joker.id) continue;
      ce.classList.add('swappable');
      ce.onclick = (e) => {
        e.stopPropagation();
        abrirTrocaCoringa(meld.id);
      };
    }
  }

  if (meldDiscardMode) {
    if (meld.ownerId !== me()) return;
    const rem = removableCards(meld).map((c) => c.id);
    for (const ce of el.children) {
      if (rem.includes(Number(ce.dataset.cardId))) {
        ce.classList.add('removable');
        ce.onclick = () => {
          meldDiscardMode = false;
          sendAction({ a: 'meldDiscard', meldId: meld.id, cardId: Number(ce.dataset.cardId) });
        };
      }
    }
    return;
  }

  if (view.you.baixou && selected.size === 1) {
    const card = view.you.hand.find((c) => c.id === [...selected][0]);
    if (card && layoffOption(card, meld)) {
      el.classList.add('droppable');
      el.onclick = () => {
        // Coringa entra nas duas pontas (e um Ás pode servir nas duas também):
        // quando as duas valem, quem escolhe é o jogador.
        const ends = layoffEnds(card, meld);
        if (ends.length > 1) return escolherPonta(card, meld, ends);
        selected.clear();
        sendAction({ a: 'layoff', cardId: card.id, meldId: meld.id });
      };
    }
  }
}

// A carta serve nas duas pontas da sequência: pergunta onde ela entra.
function escolherPonta(card, meld, ends) {
  const opcoes = ends.map((end) => ({ end, opt: layoffOption(card, meld, 0, end) }));
  showModal(
    `<h3>Em qual ponta?</h3>
     <p><strong>${cardText(card)}</strong> pode entrar nas duas pontas ${noJogoDe(meld)}:<br>${cartasDoJogo(meld)}</p>`,
    [
      ...opcoes.map(({ end, opt }) => ({
        label: `${valorText(opt.v, meld.suit)} ${end === 'lo' ? 'embaixo' : 'em cima'}`,
        cls: 'btn-primary',
        fn: () => {
          closeModal();
          selected.clear();
          sendAction({ a: 'layoff', cardId: card.id, meldId: meld.id, end });
        },
      })),
      { label: 'Cancelar', fn: closeModal, cls: 'btn-ghost' },
    ],
    closeModal,
    true,
  );
}

function renderMyMelds() {
  const box = $('my-melds');
  box.innerHTML = '';
  const mine = view.players.find((p) => p.id === me());
  const meldsToShow = [];
  if (mine) meldsToShow.push(...mine.melds.map((m) => ({ m, own: true })));
  // No modo de encaixe, mostra também os jogos dos outros aqui (dá para encaixar em todos)
  if (myTurn() && view.phase === 'play' && view.you?.baixou && selected.size === 1 && !meldDiscardMode) {
    for (const p of view.players) {
      if (p.id === me()) continue;
      const card = view.you.hand.find((c) => c.id === [...selected][0]);
      for (const m of p.melds) if (card && layoffOption(card, m)) meldsToShow.push({ m, own: false });
    }
  }
  // Jogo alheio com coringa que eu posso trocar também vem para cá: nos
  // adversários os jogos são só miniatura, sem gesto.
  for (const t of trocasDisponiveis()) {
    if (meldsToShow.some(({ m }) => m.id === t.meld.id)) continue;
    meldsToShow.push({ m: t.meld, own: false });
  }
  for (const { m } of meldsToShow) box.appendChild(meldEl(m, false));
}

function renderHand() {
  const box = $('hand');
  box.innerHTML = '';
  for (const card of sortedHand()) {
    const el = cardEl(card);
    if (selected.has(card.id)) el.classList.add('sel');
    el.onclick = () => {
      if (selected.has(card.id)) selected.delete(card.id);
      else selected.add(card.id);
      render();
    };
    box.appendChild(el);
  }
}

// O que dá para baixar agora (um jogo por vez!): devolve os cardIds a enviar,
// ou null. Usa o mesmo planBaixada do juiz, sobre o que AINDA falta.
function contractPlayable() {
  if (!view.you || view.you.baixou || !view.contract || !view.you.remaining) return null;
  const ids = selected.size > 0 ? [...selected] : null;
  const plan = planBaixada(view.you.hand, view.you.remaining, ids);
  return plan ? (ids || []) : null;
}

function renderActions() {
  const my = myTurn();
  const drawing = my && view.phase === 'draw';
  const playing = my && view.phase === 'play';

  $('btn-draw-deck').hidden = !drawing;
  $('btn-draw-discard').hidden = !(drawing && view.discardTop && view.discardBuyable);

  // O botão fica sempre clicável: sem o contrato pronto, o toque explica o que
  // falta em vez de morrer num botão desabilitado e mudo.
  const playable = playing ? contractPlayable() : null;
  $('btn-baixar').hidden = !(playing && !view.you.baixou && !meldDiscardMode);
  $('btn-baixar').classList.toggle('soft-disabled', playable === null);

  $('btn-discard').hidden = !(playing && !meldDiscardMode);
  $('btn-discard').disabled = selected.size !== 1;

  const mine = view.players.find((p) => p.id === me());
  const hasOversized = mine && mine.melds.some((m) => removableCards(m).length > 0);
  $('btn-meld-discard').hidden = !(playing && hasOversized && !meldDiscardMode);
  $('btn-cancel-mode').hidden = !meldDiscardMode;
}

// Ações dos botões da mesa
$('deck-pile').onclick = () => { if (myTurn() && view.phase === 'draw') sendAction({ a: 'draw', source: 'deck' }); };
$('discard-pile').onclick = () => {
  if (!myTurn() || view.phase !== 'draw' || !view.discardTop) return;
  if (!view.discardBuyable) {
    toast('🔒 Coringa descoberto: o meio está travado até alguém descartar por cima.');
    return;
  }
  sendAction({ a: 'draw', source: 'discard' });
};
$('btn-draw-deck').onclick = () => sendAction({ a: 'draw', source: 'deck' });
$('btn-draw-discard').onclick = () => sendAction({ a: 'draw', source: 'discard' });
$('btn-claim').onclick = () => {
  const claimed = view.claims.includes(me());
  sendAction({ a: claimed ? 'unclaim' : 'claim' });
};
$('btn-baixar').onclick = () => {
  const ids = contractPlayable();
  if (ids === null) { explicaBaixar(); return; }
  sendAction({ a: 'baixar', cardIds: ids });
  selected.clear();
};

// Por que o "Baixar jogo" não foi? Explica em termos do que ainda falta.
function explicaBaixar() {
  const ct = view?.contract;
  const rem = view?.you?.remaining;
  if (!ct || !rem) return;
  const partes = [];
  if (rem.t > 0) partes.push(`${rem.t} trinca${rem.t > 1 ? 's' : ''}`);
  if (rem.s > 0) partes.push(`${rem.s} sequência${rem.s > 1 ? 's' : ''}`);
  const falta = partes.join(' + ') || 'nada';
  // Formaria jogo, mas deixaria a mão vazia sem completar o contrato?
  const ids = selected.size > 0 ? [...selected] : null;
  const preso = planBaixada(view.you.hand, rem, ids, { permitirMaoVazia: true });
  if (preso) {
    toast('Baixar isso agora te deixaria sem nenhuma carta sem completar o contrato — guarde pelo menos uma para descartar.');
    return;
  }
  if (selected.size > 0) {
    toast(`Essa seleção não forma um jogo que ainda falta (${falta}). Dá para baixar um jogo de cada vez: 3 iguais de naipes diferentes, ou 4 seguidas do mesmo naipe.`);
  } else {
    toast(`Você ainda não tem nenhum jogo completo para baixar (falta: ${falta}). Pode baixar um de cada vez, quando ficar pronto.`);
  }
}
$('btn-discard').onclick = () => {
  if (selected.size !== 1) return;
  sendAction({ a: 'discard', cardId: [...selected][0] });
  selected.clear();
};
$('btn-meld-discard').onclick = () => { meldDiscardMode = true; selected.clear(); render(); };
$('btn-cancel-mode').onclick = () => { meldDiscardMode = false; render(); };
$('btn-sort').onclick = () => {
  sortMode = sortMode === 'suit' ? 'rank' : 'suit';
  try { localStorage.setItem('cacamba-sort', sortMode); } catch { /* ok */ }
  render();
};
$('btn-rules').onclick = () => showRules();
$('btn-score').onclick = () => showScore();

// ---------------- Avisos de eventos ----------------

let lastTurnWasMine = false;

function announce(ev) {
  switch (ev.e) {
    case 'roundStart':
      toast(`🎴 Rodada ${ev.round + 1}: ${playerName(ev.first)} começa.`);
      meldDiscardMode = false;
      // Os ids das cartas recomeçam a cada rodada: seleção antiga poderia
      // "grudar" numa carta nova por coincidência de id e armar um descarte
      // que o jogador nunca escolheu.
      selected.clear();
      break;
    case 'draw':
      if (ev.source === 'discard') toast(`${playerName(ev.p)} pegou ${cardText(ev.card)} do meio.`);
      break;
    case 'claim':
      if (ev.p !== me()) toast(`🛒 ${playerName(ev.p)} quer a carta do meio.`);
      break;
    case 'claimVoid':
      if (ev.losers.includes(me())) toast(`😅 ${playerName(ev.by)} estava na vez e ficou com ${cardText(ev.card)}.`);
      break;
    case 'buy':
      toast(`🛒 ${playerName(ev.p)} comprou ${cardText(ev.card)} fora da vez (+${ev.penalty} de castigo).`);
      break;
    case 'baixou': {
      if (ev.completa || ev.t === undefined) {
        toast(`🔻 ${playerName(ev.p)} baixou o jogo!`);
      } else {
        const pedacos = [];
        if (ev.t) pedacos.push(`${ev.t} trinca${ev.t > 1 ? 's' : ''}`);
        if (ev.s) pedacos.push(`${ev.s} sequência${ev.s > 1 ? 's' : ''}`);
        toast(`🔻 ${playerName(ev.p)} baixou ${pedacos.join(' e ')}.`);
      }
      break;
    }
    case 'layoff':
      if (ev.p !== me()) toast(`${playerName(ev.p)} encaixou ${cardText(ev.card)}.`);
      break;
    case 'meldDiscard':
      toast(`${playerName(ev.p)} descartou ${cardText(ev.card)} de um jogo da mesa.`);
      break;
    case 'swapJoker':
      toast(`${JOKER_LABEL} ${playerName(ev.p)} pôs ${cardText(ev.card)} no lugar do coringa.`);
      break;
    case 'away':
      toast(`📴 ${playerName(ev.p)} caiu — o jogo joga por ${ev.p === me() ? 'você' : 'ele'} até voltar.`);
      break;
    case 'reshuffle':
      toast('🔄 O monte acabou — o meio foi embaralhado de volta.');
      break;
    case 'roundEnd':
      if (ev.reason === 'bateu') toast(`🏆 ${playerName(ev.winnerId)} bateu!`);
      else toast('🪦 O monte esgotou — a rodada terminou sem vencedor.');
      break;
  }
}

function toast(text) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.remove(), 3600);
}

// Vibra e avisa quando a vez chega
function notifyTurn() {
  const mine = myTurn() && (view.phase === 'draw' || view.phase === 'play');
  if (mine && !lastTurnWasMine) {
    try { navigator.vibrate?.(80); } catch { /* ok */ }
    document.title = '🟡 Sua vez! — Caçamba';
  } else if (!mine) {
    document.title = 'Caçamba';
  }
  lastTurnWasMine = mine;
}

// ---------------- Modais ----------------

function showModal(bodyHTML, actions = [], onclose = null, empilhado = false) {
  $('modal-body').innerHTML = bodyHTML;
  const box = $('modal-actions');
  box.className = `modal-actions${empilhado ? ' empilhado' : ''}`;
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.className = `btn ${a.cls || ''}`;
    b.textContent = a.label;
    b.onclick = a.fn;
    box.appendChild(b);
  }
  $('modal-backdrop').hidden = false;
  $('modal-backdrop').onclick = (e) => {
    if (e.target === $('modal-backdrop') && onclose) onclose();
  };
}
function closeModal() { $('modal-backdrop').hidden = true; }

let modalPhaseShown = null;

function renderPhaseModal() {
  notifyTurn();
  if (view.phase === 'roundEnd') {
    if (modalPhaseShown === `round-${view.round}`) return;
    modalPhaseShown = `round-${view.round}`;
    showRoundEnd();
  } else if (view.phase === 'gameEnd') {
    if (modalPhaseShown === 'gameEnd') return;
    modalPhaseShown = 'gameEnd';
    showGameEnd();
  } else {
    // Só os modais de FASE (fim de rodada/jogo) fecham sozinhos. Placar,
    // Regras e a troca de coringa ficam abertos — cada broadcast de estado
    // (bots jogam a cada ~1s) fechava o modal no meio da leitura.
    if (modalPhaseShown) {
      modalPhaseShown = null;
      closeModal();
    }
  }
}

function showRoundEnd() {
  const lr = view.lastRound;
  const rows = view.players.map((p) => {
    const pts = lr.scores[p.id];
    const win = lr.winnerId === p.id;
    return `<tr class="${win ? 'winner' : ''}"><td>${win ? '🏆 ' : ''}${escapeHTML(playerName(p.id))}</td>` +
      `<td class="num">+${pts}</td><td class="num">${p.score}</td></tr>`;
  }).join('');
  const title = lr.winnerId
    ? `${escapeHTML(playerName(lr.winnerId))} bateu!`
    : 'Monte esgotado — ninguém bateu';
  const last = view.round + 1 >= view.totalRounds;
  const actions = isHost()
    ? [{ label: last ? 'Ver resultado final' : 'Próxima rodada', cls: 'btn-primary', fn: () => sendMsg({ t: 'nextRound' }) }]
    : [];
  showModal(
    `<h2>${title}</h2>
     <p>Rodada ${view.round + 1} de ${view.totalRounds} · ${view.contract.label}</p>
     <table class="score-table">
       <tr><th>Jogador</th><th style="text-align:right">Rodada</th><th style="text-align:right">Total</th></tr>
       ${rows}
     </table>
     ${isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião continuar…</p>'}`,
    actions,
  );
}

function showGameEnd() {
  const medals = ['🥇', '🥈', '🥉', '🏳️'];
  const rows = view.ranking.map((r, i) =>
    `<tr class="${i === 0 ? 'winner' : ''}"><td>${medals[i] || ''} ${escapeHTML(r.id === me() ? 'Você' : r.name)}</td>` +
    `<td class="num">${r.score}</td></tr>`).join('');
  const actions = isHost()
    ? [{ label: 'Jogar de novo', cls: 'btn-primary', fn: () => sendMsg({ t: 'playAgain' }) }]
    : [];
  actions.push({ label: 'Sair da sala', cls: 'btn-ghost', fn: () => { saveSession(null); location.reload(); } });
  showModal(
    `<h2>Fim de jogo!</h2>
     <p>Menos pontos ganha — cartas na mão contam contra você.</p>
     <table class="score-table">
       <tr><th>Jogador</th><th style="text-align:right">Pontos</th></tr>
       ${rows}
     </table>`,
    actions,
  );
}

function showScore() {
  const rows = [...view.players]
    .sort((a, b) => a.score - b.score)
    .map((p) => `<tr><td>${escapeHTML(playerName(p.id))}</td><td class="num">${p.score}</td></tr>`)
    .join('');
  showModal(
    `<h2>Placar</h2>
     <p>Menos pontos ganha. Cada carta vale o número dela · J = 11 · Q = 12 · K = 13 · Ás = 15 · coringa = 20.</p>
     <table class="score-table"><tr><th>Jogador</th><th style="text-align:right">Total</th></tr>${rows}</table>`,
    [{ label: 'Fechar', fn: closeModal }],
    closeModal,
  );
  $('modal-backdrop').onclick = (e) => { if (e.target === $('modal-backdrop')) closeModal(); };
}

function showRules() {
  showModal(
    `<h2>Como se joga Caçamba</h2>
     <p>São <strong>7 rodadas</strong>. Em cada uma você precisa montar o <strong>contrato</strong> da rodada para poder baixar o jogo. Quem ficar sem cartas na mão “bate” e vence a rodada; os outros somam os pontos das cartas que sobraram. <strong>No fim, ganha quem tiver MENOS pontos.</strong></p>
     <h3>Contratos</h3>
     <ul class="contract-list">
       <li><span class="rn">1ª · 6c</span> 2 trincas</li>
       <li><span class="rn">2ª · 7c</span> 1 trinca + 1 sequência</li>
       <li><span class="rn">3ª · 8c</span> 2 sequências</li>
       <li><span class="rn">4ª · 9c</span> 3 trincas</li>
       <li><span class="rn">5ª · 10c</span> 2 trincas + 1 sequência</li>
       <li><span class="rn">6ª · 11c</span> 2 sequências + 1 trinca</li>
       <li><span class="rn">7ª · 12c</span> 3 sequências</li>
     </ul>
     <h3>Trinca e sequência</h3>
     <ul>
       <li><strong>Trinca:</strong> 3 cartas de mesmo valor com naipes diferentes.</li>
       <li><strong>Sequência:</strong> 4 cartas seguidas do mesmo naipe. Ás vale 1 (A-2-3-4) ou 14 (J-Q-K-A), mas não “vira a esquina”.</li>
     </ul>
     <h3>Coringa ${JOKER_LABEL}</h3>
     <ul>
       <li>Vale <strong>só em sequência</strong> (nunca em trinca), no máximo <strong>1 por sequência</strong>.</li>
       <li>Nas rodadas só de trincas (1ª e 4ª) ele <strong>fica fora do baralho</strong>.</li>
       <li>Na sua vez, quem tem a <strong>carta exata</strong> que o coringa representa pode trocá-lo em qualquer sequência da mesa: a carta entra no lugar e o coringa <strong>vem para a mão</strong>.</li>
       <li>Coringa descartado <strong>tranca o meio</strong>: ninguém compra do descarte até alguém descartar por cima.</li>
       <li>Na mão ao fim da rodada, custa <strong>20 pontos</strong>.</li>
     </ul>
     <h3>Na sua vez</h3>
     <ol>
       <li><strong>Puxe uma carta</strong> (obrigatório): do monte ou do meio (descarte).</li>
       <li><strong>Baixe seus jogos</strong> — pode ser <strong>um de cada vez</strong>: qualquer trinca ou sequência completa que o contrato ainda peça já pode descer (na 1ª rodada, uma trinca sozinha desce). <strong>Encaixar</strong> cartas nos jogos da mesa (seus e dos outros), só depois de baixar o contrato <strong>inteiro</strong>. E nunca baixe tudo a ponto de ficar de mão vazia sem completar o contrato.</li>
       <li><strong>Descarte uma carta</strong> (obrigatório). Se não quiser descartar da mão, pode tirar de um jogo seu com sobra: sequência com mais de 4 cartas (pelas pontas) ou trinca com mais de 3.</li>
     </ol>
     <h3>Compra fora da vez</h3>
     <p>Quando alguém descarta, outro jogador pode pedir a carta — mas <strong>quem está na vez tem preferência</strong>. Quem compra fora da vez leva a carta <strong>+ 1 carta de castigo</strong> do monte e não descarta.</p>
     <h3>Pontos</h3>
     <p>Cartas que sobram na mão contam pelo <strong>valor de face</strong>: o 5 vale 5, o 10 vale 10, e assim por diante. <strong>J = 11</strong> · <strong>Q = 12</strong> · <strong>K = 13</strong> · <strong>Ás = 15</strong> (mesmo tendo jogado como 1) · <strong>coringa = 20</strong>. Se o monte esgotar 3 vezes na mesma rodada, a rodada acaba sem vencedor e todos contam a mão.</p>`,
    [{ label: 'Fechar', fn: closeModal }],
    closeModal,
  );
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------------- Início ----------------

showScreen('home');
connect();
