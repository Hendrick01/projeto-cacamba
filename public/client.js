// ============================================================================
// Caçamba — cliente (celular): telas, mesa e interação com o servidor
// ============================================================================

import {
  findContractMelds, layoffOption, removableCards, SUITS, SUIT_RED, rankLabel,
  isJoker, JOKER_LABEL,
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
    case 'lobby':
      lobby = msg;
      if (!msg.started) showScreen('lobby');
      renderLobby();
      break;
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

  $('btn-add-bot').hidden = !isHost() || lobby.players.length >= 4;
  $('btn-start').hidden = !isHost();
  $('btn-start').disabled = lobby.players.length < 2;
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
    if (p.baixou) badges.appendChild(badge('baixou', 'gold'));
    if (view.claims.includes(p.id)) badges.appendChild(badge('🛒 quer a carta', 'cart'));
    if (!p.isBot && !p.connected) badges.appendChild(badge('fora', 'off'));
    el.appendChild(badges);

    if (p.melds.length) {
      const melds = document.createElement('div');
      melds.className = 'opp-melds';
      for (const m of p.melds) melds.appendChild(meldEl(m, true));
      el.appendChild(melds);
    }
    box.appendChild(el);
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
  $('deck-pile').classList.toggle('glow', canDraw);
  $('discard-pile').classList.toggle('glow', canDraw && !!view.discardTop);

  // Compra fora da vez
  const claimable = view.phase === 'draw' && !myTurn() && view.discardFresh && view.discardTop
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
        selected.clear();
        sendAction({ a: 'layoff', cardId: card.id, meldId: meld.id });
      };
    }
  }
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

function contractPlayable() {
  if (!view.you || view.you.baixou || !view.contract) return null;
  const ct = view.contract;
  const need = ct.t * 3 + ct.s * 4;
  if (selected.size > 0) {
    if (selected.size !== need) return null;
    const pool = view.you.hand.filter((c) => selected.has(c.id));
    return findContractMelds(pool, ct.t, ct.s) ? [...selected] : null;
  }
  return findContractMelds(view.you.hand, ct.t, ct.s) ? [] : null;
}

function renderActions() {
  const my = myTurn();
  const drawing = my && view.phase === 'draw';
  const playing = my && view.phase === 'play';

  $('btn-draw-deck').hidden = !drawing;
  $('btn-draw-discard').hidden = !(drawing && view.discardTop);

  const playable = playing ? contractPlayable() : null;
  $('btn-baixar').hidden = !(playing && !view.you.baixou && !meldDiscardMode);
  $('btn-baixar').disabled = playable === null;

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
  if (myTurn() && view.phase === 'draw' && view.discardTop) sendAction({ a: 'draw', source: 'discard' });
};
$('btn-draw-deck').onclick = () => sendAction({ a: 'draw', source: 'deck' });
$('btn-draw-discard').onclick = () => sendAction({ a: 'draw', source: 'discard' });
$('btn-claim').onclick = () => {
  const claimed = view.claims.includes(me());
  sendAction({ a: claimed ? 'unclaim' : 'claim' });
};
$('btn-baixar').onclick = () => {
  const ids = contractPlayable();
  if (ids === null) return;
  sendAction({ a: 'baixar', cardIds: ids });
  selected.clear();
};
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
    case 'baixou':
      toast(`🔻 ${playerName(ev.p)} baixou o jogo!`);
      break;
    case 'layoff':
      if (ev.p !== me()) toast(`${playerName(ev.p)} encaixou ${cardText(ev.card)}.`);
      break;
    case 'meldDiscard':
      toast(`${playerName(ev.p)} descartou ${cardText(ev.card)} de um jogo da mesa.`);
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

function showModal(bodyHTML, actions = [], onclose = null) {
  $('modal-body').innerHTML = bodyHTML;
  const box = $('modal-actions');
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
    modalPhaseShown = null;
    closeModal();
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
     <p>Menos pontos ganha. A = 15 · K/Q/J/10 = 10 · demais = 5 · coringa = 20.</p>
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
     <h3>Na sua vez</h3>
     <ol>
       <li><strong>Puxe uma carta</strong> (obrigatório): do monte ou do meio (descarte).</li>
       <li><strong>Baixe o contrato</strong> quando tiver tudo; depois de baixar, pode <strong>encaixar</strong> cartas nos jogos da mesa (seus e dos outros).</li>
       <li><strong>Descarte uma carta</strong> (obrigatório). Se não quiser descartar da mão, pode tirar de um jogo seu com sobra: sequência com mais de 4 cartas (pelas pontas) ou trinca com mais de 3.</li>
     </ol>
     <h3>Compra fora da vez</h3>
     <p>Quando alguém descarta, outro jogador pode pedir a carta — mas <strong>quem está na vez tem preferência</strong>. Quem compra fora da vez leva a carta <strong>+ 1 carta de castigo</strong> do monte e não descarta.</p>
     <h3>Pontos</h3>
     <p>Cartas que sobram na mão: <strong>Ás = 15</strong> · <strong>K, Q, J e 10 = 10</strong> · demais = 5 · <strong>coringa = 20</strong>. Se o monte esgotar 3 vezes na mesma rodada, a rodada acaba sem vencedor e todos contam a mão.</p>`,
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
