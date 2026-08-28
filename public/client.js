// ============================================================================
// Caçamba — cliente (celular): telas, mesa e interação com o servidor
// ============================================================================

import {
  planBaixada, layoffOption, layoffEnds, removableCards, SUITS, SUIT_RED, rankLabel,
  isJoker, JOKER_LABEL, coringaNaSequencia, cardCobreCoringa, SWAP_JOKER_SAME_TURN,
  DEFAULT_OPTS, sobraFechaJogo, coringaLiberadoPeloEncaixe,
} from '/shared/engine.js';
import {
  ELENCO, SLUGS, personagemValido, personagemDoAssento, peleDe, temExpressao,
} from '/shared/elenco.js';

const $ = (id) => document.getElementById(id);

// ---------------- Estado local ----------------

let ws = null;
let view = null;          // última visão do jogo enviada pelo servidor
let lobby = null;         // última visão da sala
let session = loadJSON('cacamba-session');
let selected = new Set(); // cartas da mão selecionadas (ids)
let sortMode = localStorage.getItem('cacamba-sort') || 'suit';
// Ordem escolhida à mão pelo jogador. Vazia = ordenação automática. Vive só
// nesta rodada: os ids das cartas recomeçam a cada uma.
let ordemManual = [];
// Arrasto em curso: { id, x0, y0, el, ativo }. Enquanto não passa do limiar,
// o gesto ainda pode virar toque (que seleciona a carta).
let arrasto = null;
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
      // Depois do render: a distribuição precisa dos assentos já no lugar para
      // saber para onde as cartas voam.
      if (distribuirPendente) { distribuirPendente = false; animaDistribuicao(); }
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
  for (const s of ['home', 'avatar', 'lobby', 'game']) $(`screen-${s}`).hidden = s !== name;
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
  if (name) { saveSession(null); sendMsg({ t: 'create', name, avatar: meuPersonagem }); }
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
  sendMsg({ t: 'join', code, name, avatar: meuPersonagem });
};

// ---------------- Escolha do personagem ----------------

// A escolha fica no aparelho e vai junto no `create`/`join`; o servidor valida
// e repassa aos outros, senão só você veria o seu personagem.
const guardado = localStorage.getItem('cacamba-personagem');
let meuPersonagem = personagemValido(guardado) ? guardado : SLUGS[0];
let noPalco = SLUGS.indexOf(meuPersonagem);

const figuraDe = (slug) => `/assets/personagens/${slug}-corpo-inteiro.svg`;
const caraDe = (slug) => `/assets/personagens/${slug}-avatar.svg`;

function pintaEscolha() {
  const p = ELENCO[noPalco];
  $('avatar-figura').src = figuraDe(p.slug);
  $('avatar-figura').alt = p.nome;
  $('avatar-nome').textContent = p.nome;
  $('avatar-traco').textContent = p.traco;
  for (const b of $('avatar-miniaturas').children) {
    b.classList.toggle('escolhida', Number(b.dataset.i) === noPalco);
  }
}

function montaMiniaturas() {
  const box = $('avatar-miniaturas');
  box.innerHTML = '';
  ELENCO.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'miniatura';
    b.dataset.i = i;
    b.setAttribute('aria-label', p.nome);
    const img = document.createElement('img');
    img.src = caraDe(p.slug);
    img.alt = '';
    b.appendChild(img);
    b.onclick = () => { noPalco = i; pintaEscolha(); };
    box.appendChild(b);
  });
}

function pintaBotaoPersonagem() {
  const p = ELENCO[SLUGS.indexOf(meuPersonagem)] || ELENCO[0];
  $('persona-cara').src = caraDe(p.slug);
  $('persona-nome').textContent = p.nome;
}

function passaPersonagem(passo) {
  noPalco = (noPalco + passo + ELENCO.length) % ELENCO.length;
  pintaEscolha();
}

$('btn-personagem').onclick = () => {
  noPalco = Math.max(0, SLUGS.indexOf(meuPersonagem));
  pintaEscolha();
  showScreen('avatar');
};
$('btn-avatar-ant').onclick = () => passaPersonagem(-1);
$('btn-avatar-prox').onclick = () => passaPersonagem(1);
$('btn-avatar-voltar').onclick = () => showScreen('home');
$('btn-avatar-ok').onclick = () => {
  meuPersonagem = SLUGS[noPalco];
  try { localStorage.setItem('cacamba-personagem', meuPersonagem); } catch { /* ok */ }
  pintaBotaoPersonagem();
  showScreen('home');
};

montaMiniaturas();
pintaBotaoPersonagem();
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
    li.appendChild(avatarEl(p.id, lobby.players, 30));
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
  sendMsg({ t: 'leave' });   // avisa a sala, senão fica assento fantasma nela
  saveSession(null);
  history.replaceState(null, '', location.pathname);
  location.reload();
};

// ---------------- Avatares ----------------

// A lista de personagens vive em shared/elenco.js: o servidor precisa dela
// para validar a escolha antes de repassá-la, então não pode ser só do
// cliente. Para acrescentar alguém, é lá.
// Uma cor por assento, na paleta do jogo. Oito, que é o tamanho máximo da mesa.
const CORES_DE_ASSENTO = [
  '#F2C14E', '#3A7D6E', '#E4572E', '#8C6A45',
  '#C97AB0', '#5B8DC9', '#7FB069', '#B0605D',
];

// Assento do jogador na lista — é dele que saem o rosto e a cor, então todo
// mundo vê o mesmo avatar para a mesma pessoa.
function assentoDe(playerId, lista) {
  const i = (lista || []).findIndex((p) => p.id === playerId);
  return i < 0 ? 0 : i;
}

// Quem o jogador escolheu ser. Sem escolha, o rosto sai do assento — que é
// determinístico, então todos veem o mesmo rosto para a mesma pessoa (é o caso
// dos robôs, que não escolhem).
function personagemDe(playerId, lista) {
  const i = (lista || []).findIndex((p) => p.id === playerId);
  const escolhido = i >= 0 ? lista[i].avatar : null;
  return personagemValido(escolhido) ? escolhido : personagemDoAssento(Math.max(0, i));
}

function avatarEl(playerId, lista, tamanho = 24) {
  const assento = assentoDe(playerId, lista);
  const el = document.createElement('img');
  el.className = 'avatar';
  el.src = caraDe(personagemDe(playerId, lista));
  el.alt = '';
  el.width = tamanho;
  el.height = tamanho;
  el.style.setProperty('--anel', CORES_DE_ASSENTO[assento % CORES_DE_ASSENTO.length]);
  return el;
}

// A figura inteira do personagem, para o assento. O corte fica com o CSS: a
// caixa mostra só a metade de cima, então a pessoa aparece sentada atrás da
// mesa em vez de flutuando inteira sobre o feltro.
function figuraEl(playerId, lista) {
  const el = document.createElement('img');
  el.className = 'personagem';
  el.src = figuraDe(personagemDe(playerId, lista));
  el.alt = '';
  return el;
}

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
  if (ordemManual.length) {
    // Carta que ainda não tem lugar escolhido (acabou de ser puxada) vai para
    // o fim, sem embaralhar o que o jogador já arrumou.
    const pos = new Map(ordemManual.map((id, i) => [id, i]));
    return hand.sort((a, b) => (pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6));
  }
  if (sortMode === 'suit') hand.sort((a, b) => a.suit - b.suit || a.rank - b.rank);
  else hand.sort((a, b) => a.rank - b.rank || a.suit - b.suit);
  return hand;
}

// Põe a carta numa posição da fila, empurrando o resto. `destino` é o índice
// na ordem JÁ SEM a carta arrastada — é o que faz "soltar entre a 2ª e a 3ª"
// significar sempre a mesma coisa, indo para a direita ou para a esquerda.
function poeNaPosicao(id, destino) {
  const ordem = ordemManual.length ? [...ordemManual] : sortedHand().map((c) => c.id);
  const de = ordem.indexOf(id);
  if (de < 0) return false;
  ordem.splice(de, 1);
  const alvo = Math.max(0, Math.min(ordem.length, destino));
  if (alvo === de) return false;
  ordem.splice(alvo, 0, id);
  ordemManual = ordem;
  return true;
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


function naVez(p) {
  return view.turnId === p.id && view.phase !== 'roundEnd';
}

// Progresso do contrato: "baixou" quando completo, "2/3" quando parcial.
function progressoDoContrato(p) {
  const total = view.contract ? view.contract.t + view.contract.s : 0;
  const feitos = p.baixados ? p.baixados.t + p.baixados.s : 0;
  if (p.baixou) return { texto: 'baixou', completo: true };
  if (feitos > 0) return { texto: `${feitos}/${total}`, completo: false };
  return null;
}

// A mesa é desenhada uma vez e depois atualizada no lugar. Recriar os assentos
// a cada estado reiniciaria as animações — o respiro voltaria ao começo a cada
// jogada de robô, e a mesa piscaria inteira.
const assentos = new Map();

function renderOpponents() {
  const box = $('opponents');
  const adversarios = view.players.filter((p) => p.id !== me());
  const lugares = posicoesDeAssento(adversarios.length);
  const alturaAssentos = alturaDaMesa(adversarios.length);
  box.style.height = `${alturaAssentos}px`;
  // O tampo precisa começar logo abaixo de quem senta, senão o feltro descola
  // dos assentos e eles ficam flutuando no cenário.
  box.parentElement?.style.setProperty('--altura-assentos', `${alturaAssentos}px`);

  for (const [id, el] of assentos) {
    if (!adversarios.some((p) => p.id === id)) { el.remove(); assentos.delete(id); }
  }
  adversarios.forEach((p, i) => {
    let el = assentos.get(p.id);
    if (!el) {
      el = criaAssento(p);
      assentos.set(p.id, el);
      box.appendChild(el);
      el.classList.add('entra');
      el.style.setProperty('--i', i);
    }
    atualizaAssento(el, p, lugares[i]);
  });

  renderMeuAssento();
  avisaAssentosApertados(box);
}

// Onde cada um senta. Até 4 adversários cabem numa fileira só, em arco: quem
// está na ponta senta mais perto de quem olha, como numa mesa redonda vista de
// frente. Acima disso abre a fileira de trás — e quem está atrás aparece menor
// e menos iluminado, que é o que a lâmpada faria de verdade.
const ASSENTOS_POR_FILEIRA = 4;

function posicoesDeAssento(n) {
  const arco = (x, amp) => amp * ((x - 50) / 38) ** 2;
  const espalha = (qtd, de, ate) => (qtd === 1
    ? [50]
    : Array.from({ length: qtd }, (_, i) => de + (i * (ate - de)) / (qtd - 1)));

  if (n <= ASSENTOS_POR_FILEIRA) {
    return espalha(n, 12, 88).map((x) => ({ x, y: arco(x, 20), escala: 1, fundo: false }));
  }
  const atras = Math.ceil(n / 2);
  return [
    ...espalha(atras, 11, 89).map((x) => ({ x, y: arco(x, 12), escala: 0.8, fundo: true })),
    ...espalha(n - atras, 24, 76).map((x) => ({ x, y: 104 + arco(x, 8), escala: 1, fundo: false })),
  ];
}

function alturaDaMesa(n) {
  return n <= ASSENTOS_POR_FILEIRA ? 108 : 196;
}

// O esqueleto de um assento. Só é montado uma vez por jogador.
function criaAssento(p) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'assento';

  const figura = document.createElement('span');
  figura.className = 'figura';
  figura.appendChild(figuraEl(p.id, view.players));
  const leque = document.createElement('span');
  leque.className = 'leque';
  const cartas = document.createElement('span');
  cartas.className = 'cartas';
  figura.append(leque, cartas);
  el.append(figura, cadeiraEl(), nomeEl(p.name), marcasEl());

  el.onclick = () => mostraOponente(p.id);
  return el;
}

function cadeiraEl() {
  const el = document.createElement('span');
  el.className = 'cadeira';
  return el;
}

function nomeEl(nome) {
  const el = document.createElement('span');
  el.className = 'nome';
  el.textContent = nome;
  return el;
}

function marcasEl() {
  const el = document.createElement('span');
  el.className = 'marcas';
  return el;
}

// Estado anterior de cada jogador, só para saber o que MUDOU: pedir carta e
// baixar merecem um gesto de uma vez só, e sem isso a animação se repetiria a
// cada estado que o servidor manda.
const antes = { pedidos: new Set(), baixados: new Map(), topo: null };

function atualizaAssento(el, p, lugar) {
  el.style.setProperty('--x', `${lugar.x}%`);
  el.style.setProperty('--y', `${lugar.y}px`);
  el.style.setProperty('--escala', lugar.escala);
  el.style.setProperty('--anel', CORES_DE_ASSENTO[assentoDe(p.id, view.players) % CORES_DE_ASSENTO.length]);
  el.classList.toggle('fundo', lugar.fundo);
  el.classList.toggle('vez', naVez(p));
  el.classList.toggle('fora', !p.isBot && !p.connected);
  el.classList.toggle('saiu', !!p.desistiu);
  el.setAttribute('aria-label', `${p.name}, ${p.handCount} cartas. Toque para ver os jogos dele.`);

  el.querySelector('.cartas').textContent = p.handCount;
  el.querySelector('.nome').textContent = p.name;
  desenhaLeque(el.querySelector('.leque'), p.handCount);

  const marcas = el.querySelector('.marcas');
  marcas.innerHTML = '';
  const prog = progressoDoContrato(p);
  if (prog) marcas.appendChild(marca(prog.completo ? '✔' : prog.texto, 'm-gold'));
  if (view.claims.includes(p.id)) marcas.appendChild(marca('🛒', 'm-cart'));
  if (p.desistiu) marcas.appendChild(marca('saiu', 'm-off'));
  else if (!p.isBot && !p.connected) marcas.appendChild(marca('fora', 'm-off'));

  // Gestos de uma vez só, disparados pela mudança e não pelo estado
  const feitos = p.baixados ? p.baixados.t + p.baixados.s : 0;
  if (view.claims.includes(p.id) && !antes.pedidos.has(p.id)) repete(el, 'pediu');
  if (feitos > (antes.baixados.get(p.id) || 0)) repete(el, 'baixou-agora');
  antes.baixados.set(p.id, feitos);
  if (naVez(p)) el.dataset.daVez = '1'; else delete el.dataset.daVez;
}

// O leque na mão do adversário: as cartas dele, viradas para baixo. Não é a
// contagem — para isso existe o selo, que dá o número exato. É presença: dá
// para ver de relance quem está carregando mão grande.
const LEQUE_MAXIMO = 5;

function desenhaLeque(el, quantas) {
  const mostrar = Math.max(0, Math.min(LEQUE_MAXIMO, quantas));
  while (el.children.length > mostrar) el.lastChild.remove();
  while (el.children.length < mostrar) {
    const c = document.createElement('span');
    c.className = 'carta-virada';
    el.appendChild(c);
  }
  [...el.children].forEach((c, i) => {
    const meio = (mostrar - 1) / 2;
    c.style.setProperty('--giro', `${(i - meio) * 9}deg`);
    c.style.setProperty('--sobe', `${Math.abs(i - meio) * 1.6}px`);
  });
}

function marca(texto, cls) {
  const el = document.createElement('span');
  el.className = cls;
  el.textContent = texto;
  return el;
}

// Reinicia uma animação de uma vez só: sem o reflow no meio, o navegador não
// vê mudança de classe nenhuma e não toca a animação de novo.
function repete(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// Você também senta à mesa. Antes o seu personagem não aparecia em lugar
// nenhum durante a partida — só o dos outros.
function renderMeuAssento() {
  const caixa = $('meu-assento');
  if (!caixa) return;
  const eu = view.players.find((p) => p.id === me());
  if (!eu) { caixa.hidden = true; return; }
  caixa.hidden = false;
  if (!caixa.firstChild) {
    const figura = document.createElement('span');
    figura.className = 'figura';
    figura.appendChild(figuraEl(eu.id, view.players));
    caixa.append(figura, cadeiraEl(), nomeEl('você'));
  }
  caixa.style.setProperty('--anel', CORES_DE_ASSENTO[assentoDe(eu.id, view.players) % CORES_DE_ASSENTO.length]);
  caixa.classList.toggle('vez', naVez(eu));
}

// Detalhe de um adversário: é aqui que os jogos baixados dele aparecem. Eles
// não cabem no assento — com 7 adversários numa tela de 375 não há largura — e
// para encaixar carta os jogos dos outros já aparecem na fileira de baixo.
function mostraOponente(playerId) {
  const p = view.players.find((x) => x.id === playerId);
  if (!p) return;
  const prog = progressoDoContrato(p);
  const situacao = prog
    ? (prog.completo ? 'contrato baixado' : `baixou ${prog.texto} do contrato`)
    : 'ainda não baixou';
  const linhas = [
    '<div id="oponente-topo" class="oponente-topo"></div>',
    `<h3>${escapeHTML(p.name)}${naVez(p) ? ' — é a vez dele' : ''}</h3>`,
    `<p>${p.handCount} carta${p.handCount === 1 ? '' : 's'} na mão · ${situacao}</p>`,
  ];
  if (view.claims.includes(p.id)) linhas.push('<p>🛒 Pediu a carta do meio.</p>');
  if (p.desistiu) linhas.push('<p class="modal-hint">Saiu da partida — o robô joga o resto por ele.</p>');
  else if (!p.isBot && !p.connected) linhas.push('<p class="modal-hint">Está fora no momento — se demorar, o jogo segue por ele.</p>');
  showModal(
    `${linhas.join('')}<div id="oponente-jogos" class="oponente-jogos"></div>`,
    [{ label: 'Fechar', fn: closeModal }],
    closeModal,
  );
  $('oponente-topo').appendChild(avatarEl(p.id, view.players, 72));
  const caixa = $('oponente-jogos');
  if (p.melds.length) {
    for (const m of p.melds) caixa.appendChild(meldEl(m, true));
  } else {
    caixa.textContent = 'Nenhum jogo na mesa ainda.';
    caixa.classList.add('vazio');
  }
}

// Rede de segurança: ninguém pode sumir em silêncio. Os assentos são
// posicionados dentro da caixa, então o caso de hoje não é mais alguém fora da
// tela, e sim assento espremido ou cortado na borda — nome muito longo, tela
// muito estreita. Fica dormente quando tudo cabe.
function avisaAssentosApertados(box) {
  const hint = $('opponents-hint');
  if (!hint) return;
  const caixa = box.getBoundingClientRect();
  if (!caixa.width || !box.children.length) { hint.hidden = true; return; }
  let cortados = 0;
  for (const el of box.children) {
    const r = el.getBoundingClientRect();
    if (r.left < caixa.left - 1 || r.right > caixa.right + 1) cortados++;
  }
  if (!cortados) { hint.hidden = true; return; }
  hint.textContent = `${cortados} assento${cortados > 1 ? 's' : ''} apertado${cortados > 1 ? 's' : ''} na borda — toque para ver quem é`;
  hint.hidden = false;
}

function renderCenter() {
  $('deck-count').textContent = view.deckCount;
  const dc = $('discard-card');
  const nova = Object.assign(
    view.discardTop ? cardEl(view.discardTop) : emptyCard(),
    { id: 'discard-card' },
  );
  // Carta nova no topo cai na pilha. Só quando MUDA: sem isso ela recairia a
  // cada estado que o servidor manda, inclusive nos que não mexem no meio.
  const topo = view.discardTop ? view.discardTop.id : null;
  if (topo !== antes.topo) nova.classList.add('cai');
  antes.topo = topo;
  dc.replaceWith(nova);

  const canDraw = myTurn() && view.phase === 'draw';
  const trancado = !!view.discardTop && view.discardLocked;
  $('deck-pile').classList.toggle('glow', canDraw);
  $('discard-pile').classList.toggle('glow', canDraw && !!view.discardTop && !trancado);
  $('discard-pile').classList.toggle('trancado', trancado);
  const minha = !!view.discardTop && view.discardTop.by === me();
  $('discard-pile').classList.toggle('minha', minha && !trancado);
  $('discard-pile').querySelector('.pile-count').textContent =
    trancado ? '🔒 trancado' : (minha ? 'sua' : 'meio');

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

  // Carta sobrando neste jogo que fecha um jogo meu agora: vira alvo de toque.
  // Ela nunca vem para a mão — ou desce na hora, ou fica onde está.
  if (selected.size > 0) {
    for (const sobra of removableCards(meld)) {
      if (!sobraAcende(sobra)) continue;
      const ce = [...el.children].find((x) => Number(x.dataset.cardId) === sobra.id);
      if (!ce) continue;
      ce.classList.add('puxavel');
      ce.onclick = (e) => {
        e.stopPropagation();
        sendAction({ a: 'baixar', cardIds: [...selected], sobra: { meldId: meld.id, cardId: sobra.id } });
        selected.clear();
      };
    }
  }

  // Encaixar não exige mais ter baixado o contrato.
  if (selected.size === 1) {
    const card = view.you.hand.find((c) => c.id === [...selected][0]);
    if (card && layoffOption(card, meld)) {
      el.classList.add('droppable');
      el.onclick = () => {
        // Coringa entra nas duas pontas (e um Ás pode servir nas duas também):
        // quando as duas valem, quem escolhe é o jogador.
        const ends = layoffEnds(card, meld);
        if (ends.length > 1) return escolherPonta(card, meld, ends);
        encaixa(card, meld, null);
      };
    }
  }
}

// Toda saída de encaixe passa por aqui: é onde se descobre se a jogada deixa
// um coringa sobrando na outra ponta — e aí quem decide é o jogador.
function encaixa(card, meld, end) {
  const opt = layoffOption(card, meld, 0, end || null);
  // Passa o dono: o resgate só vale em sequência dos outros.
  const coringa = opt ? coringaLiberadoPeloEncaixe(meld, opt, me()) : null;
  if (!coringa) {
    selected.clear();
    sendAction({ a: 'layoff', cardId: card.id, meldId: meld.id, ...(end ? { end } : {}) });
    return;
  }
  showModal(
    `<h3>Pegar o coringa?</h3>
     <p>Com <strong>${cardText(card)}</strong> ${noJogoDe(meld)}, a sequência fica com uma carta a mais — e o
     ${JOKER_LABEL} da outra ponta passa a sobrar. Dá para trazer ele para a sua mão.</p>
     <p class="modal-hint">Ele vale 20 pontos na mão no fim da rodada: só compensa se você for usar.</p>`,
    [
      {
        label: `${JOKER_LABEL} Encaixar e pegar o coringa`,
        cls: 'btn-primary',
        fn: () => {
          closeModal();
          selected.clear();
          sendAction({ a: 'layoff', cardId: card.id, meldId: meld.id, ...(end ? { end } : {}), pegarCoringa: true });
        },
      },
      {
        label: 'Só encaixar',
        fn: () => {
          closeModal();
          selected.clear();
          sendAction({ a: 'layoff', cardId: card.id, meldId: meld.id, ...(end ? { end } : {}) });
        },
      },
      { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    ],
    closeModal,
    true,
  );
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
          encaixa(card, meld, end);
        },
      })),
      { label: 'Cancelar', fn: closeModal, cls: 'btn-ghost' },
    ],
    closeModal,
    true,
  );
}

// Tudo o que já foi baixado na mesa, agrupado por dono: o seu primeiro, os
// outros na ordem dos assentos. Antes só os seus ficavam à vista e os dos
// outros apareciam por um instante, quando davam encaixe — dava para jogar,
// mas não para PLANEJAR, que é metade do jogo. Cada jogo continua acionável
// pelo decorateMeld quando a jogada é possível agora (encaixe, troca de
// coringa, descarte de jogo seu).
function renderMyMelds() {
  const box = $('my-melds');
  box.innerHTML = '';
  const eu = view.players.filter((p) => p.id === me());
  const outros = view.players.filter((p) => p.id !== me());
  for (const p of [...eu, ...outros]) {
    if (!p.melds.length) continue;
    box.appendChild(grupoDeJogos(p));
  }
}

function grupoDeJogos(p) {
  const el = document.createElement('div');
  el.className = 'grupo-jogos';
  el.style.setProperty('--anel', CORES_DE_ASSENTO[assentoDe(p.id, view.players) % CORES_DE_ASSENTO.length]);

  const dono = document.createElement('span');
  dono.className = 'dono';
  dono.textContent = p.id === me() ? 'Você' : p.name;

  const jogos = document.createElement('div');
  jogos.className = 'jogos';
  for (const m of p.melds) jogos.appendChild(meldEl(m, false));

  el.append(dono, jogos);
  return el;
}

// O leque da sua mão. O passo entre as cartas é calculado, não fixo: a rodada
// 7 dá 12 cartas e um passo fixo estouraria a largura do celular; com poucas
// cartas, o mesmo passo deixaria o leque frouxo demais.
const CARTA_LARGURA = 56;
const PASSO_MAXIMO = 40;
const PASSO_MINIMO = 20;
const ABERTURA = 16;          // graus de ponta a ponta
// Acima disto o leque vira dois. A rodada 7 dá 12 cartas, mas cada compra fora
// da vez soma carta de castigo — mão de 20 acontece, e num leque só ela vira
// uma parede de tiras de 13 px que ninguém lê nem acerta com o dedo.
const CARTAS_POR_FILEIRA = 13;

function renderHand() {
  const box = $('hand');
  box.innerHTML = '';
  const cartas = sortedHand();
  const fileiras = cartas.length > CARTAS_POR_FILEIRA ? 2 : 1;
  const porFileira = Math.ceil(cartas.length / fileiras);

  for (let f = 0; f < fileiras; f++) {
    const fila = document.createElement('div');
    fila.className = 'fila';
    montaLeque(fila, cartas.slice(f * porFileira, (f + 1) * porFileira), box.clientWidth);
    box.appendChild(fila);
  }

  pintaMaos();
}

function montaLeque(fila, cartas, largura) {
  const n = cartas.length;
  // Sobra nas pontas para as mãos aparecerem. Com mão grande a sobra encolhe:
  // aí o leque precisa da largura, e mão cheia cobrindo as próprias mãos é o
  // que acontece de verdade.
  const espaco = Math.max(180, (largura || 355) - (n > 8 ? 44 : 120));
  const passo = n > 1
    ? Math.min(PASSO_MAXIMO, Math.max(PASSO_MINIMO, (espaco - CARTA_LARGURA) / (n - 1)))
    : CARTA_LARGURA;
  const meio = (n - 1) / 2;

  cartas.forEach((card, i) => {
    const el = cardEl(card);
    el.dataset.cardId = card.id;
    el.style.setProperty('--passo', `${passo - CARTA_LARGURA}px`);
    el.style.setProperty('--giro', n > 1 ? `${(i - meio) * (ABERTURA / (n - 1))}deg` : '0deg');
    if (selected.has(card.id)) el.classList.add('sel');
    el.onclick = () => {
      // Se o dedo arrastou, o gesto foi de arrumar: não seleciona.
      if (el.dataset.arrastou === '1') { delete el.dataset.arrastou; return; }
      if (selected.has(card.id)) selected.delete(card.id);
      else selected.add(card.id);
      render();
    };
    el.addEventListener('pointerdown', (e) => comecaArrasto(e, el, card.id));
    fila.appendChild(el);
  });
}

// ---------------- Arrastar para arrumar a mão ----------------

// Quanto o dedo precisa andar para o gesto deixar de ser toque e virar
// arrasto. Sem esse limiar, um dedo que escorrega um pouco ao escolher uma
// carta arrumaria a mão sem querer.
const LIMIAR_ARRASTO = 10;

function comecaArrasto(e, el, id) {
  if (e.button !== undefined && e.button !== 0) return;
  arrasto = { id, el, x0: e.clientX, y0: e.clientY, ativo: false, destino: null };
  el.setPointerCapture?.(e.pointerId);
  el.addEventListener('pointermove', moveArrasto);
  el.addEventListener('pointerup', soltaArrasto);
  el.addEventListener('pointercancel', cancelaArrasto);
}

function moveArrasto(e) {
  if (!arrasto) return;
  const dx = e.clientX - arrasto.x0;
  const dy = e.clientY - arrasto.y0;
  if (!arrasto.ativo) {
    if (Math.hypot(dx, dy) < LIMIAR_ARRASTO) return;
    arrasto.ativo = true;
    arrasto.el.classList.add('arrastando');
    arrasto.el.dataset.arrastou = '1';
  }
  // A carta segue o dedo; o resto abre espaço no lugar onde ela vai cair.
  arrasto.el.style.transform = `translate(${dx}px, ${dy - 18}px) scale(1.06)`;
  arrasto.destino = destinoDoArrasto(e.clientX, e.clientY);
  mostraEspaco(arrasto.destino);
}

// Onde a carta cai: conta quantas cartas (fora a arrastada) têm o centro à
// esquerda do dedo. O alvo vem da POSIÇÃO, não de acertar uma carta com o
// dedo — que é o que torna o destino difícil num leque de cartas sobrepostas.
function destinoDoArrasto(x, y) {
  const outras = cartasDaMao().filter((c) => c.id !== arrasto.id);
  if (!outras.length) return 0;
  // Com a mão em duas fileiras, primeiro escolhe a fileira mais perto do dedo.
  // A fileira vem da estrutura (`.fila`), não da altura de cada carta: no
  // leque cada carta tem um topo diferente por causa do giro, e agrupar por
  // altura fazia cada carta virar uma "fileira" sozinha.
  const fileiras = [...new Set(outras.map((c) => c.fila))];
  const alvo = fileiras.reduce((a, b) => {
    const ca = outras.find((c) => c.fila === a).cy;
    const cb = outras.find((c) => c.fila === b).cy;
    return Math.abs(cb - y) < Math.abs(ca - y) ? b : a;
  });
  const antes = outras.filter((c) => c.fila < alvo).length;
  const naFila = outras.filter((c) => c.fila === alvo);
  return antes + naFila.filter((c) => c.cx < x).length;
}

// Cada carta da mão com centro e fileira, na ordem em que estão na tela.
function cartasDaMao() {
  const lista = [];
  [...$('hand').querySelectorAll('.fila')].forEach((fila, f) => {
    const rf = fila.getBoundingClientRect();
    for (const el of fila.querySelectorAll('.card')) {
      const r = el.getBoundingClientRect();
      lista.push({
        el,
        id: Number(el.dataset.cardId),
        cx: r.left + r.width / 2,
        fila: f,
        cy: rf.top + rf.height / 2,
      });
    }
  });
  return lista;
}

// Abre um vão onde a carta vai cair: as que ficam depois do ponto escorregam
// um pouco para a direita. É o que mostra o destino antes de soltar.
function mostraEspaco(destino) {
  const outras = cartasDaMao().filter((c) => c.id !== arrasto.id);
  outras.forEach((c, i) => {
    c.el.style.setProperty('--desloca', i >= destino ? '9px' : '-9px');
  });
}

function limpaEspaco() {
  for (const c of cartasDaMao()) c.el.style.removeProperty('--desloca');
}

function soltaArrasto(e) {
  if (!arrasto) return;
  const { el, id, ativo, destino } = arrasto;
  desmontaArrasto(e);
  if (!ativo) return;
  el.classList.remove('arrastando');
  el.style.transform = '';
  limpaEspaco();
  if (destino !== null && poeNaPosicao(id, destino)) render();
  else render();
}

function cancelaArrasto(e) {
  if (!arrasto) return;
  const { el } = arrasto;
  desmontaArrasto(e);
  el.classList.remove('arrastando');
  el.style.transform = '';
  limpaEspaco();
}

function desmontaArrasto(e) {
  const { el } = arrasto;
  el.releasePointerCapture?.(e.pointerId);
  el.removeEventListener('pointermove', moveArrasto);
  el.removeEventListener('pointerup', soltaArrasto);
  el.removeEventListener('pointercancel', cancelaArrasto);
  arrasto = null;
}

// As suas mãos, atrás do leque, com o tom de pele de quem você escolheu ser.
function pintaMaos() {
  const box = $('maos');
  if (!box) return;
  box.style.setProperty('--pele', peleDe(personagemDe(me(), view.players)));
}

// O contrato já está inteiro na mesa? Daí em diante todo jogo é extra — muda
// só o rótulo do botão, porque baixar a mais já valia antes.
function contratoCumprido() {
  const rem = view?.you?.remaining;
  return !!rem && rem.t === 0 && rem.s === 0;
}

// O que dá para baixar agora: devolve os cardIds a enviar, ou null. O alvo é
// sempre o que o contrato ainda pede — o planejador aceita jogo a mais por
// conta própria, e é ele que decide se dá para esvaziar a mão.
function contractPlayable() {
  if (!view?.you || !view.contract || !view.you.remaining) return null;
  const ids = selected.size > 0 ? [...selected] : null;
  const plan = planBaixada(view.you.hand, view.you.remaining, ids);
  return plan ? (ids || []) : null;
}

// As cartas que estão SOBRANDO nos jogos da mesa (sequência com mais de 4,
// trinca com mais de 3). Espelha `sobrasNaMesa` do motor, sobre a visão.
function sobrasDaMesa() {
  const fora = [];
  for (const p of view.players || []) {
    for (const m of p.melds || []) {
      for (const card of removableCards(m)) fora.push({ meldId: m.id, ownerId: p.id, card });
    }
  }
  return fora;
}

// Acende o alvo com a MESMA função que o juiz usa para decidir, para realce e
// regra nunca divergirem.
function sobraAcende(card) {
  if (!view.you?.remaining || !selected.size) return false;
  const daMao = view.you.hand.filter((c) => selected.has(c.id));
  return sobraFechaJogo(daMao, card, view.you.remaining);
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
  $('btn-baixar').hidden = !(playing && !meldDiscardMode);
  $('btn-baixar').textContent = contratoCumprido() ? 'Baixar jogo extra' : 'Baixar jogo';
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
    toast(view.discardTop.by === me()
      ? '↩️ Essa carta foi você que descartou: ela não volta para a sua mão.'
      : '🔒 Coringa descoberto: o meio está travado até alguém descartar por cima.');
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
  if (contratoCumprido()) {
    toast(selected.size > 0
      ? 'Essa seleção não forma uma trinca (3 iguais de naipes diferentes) nem uma sequência (4 seguidas do mesmo naipe).'
      : 'O contrato já está na mesa. Para baixar jogo a mais, toque nas cartas dele na sua mão e depois aqui — se a mão esvaziar, você bate.');
    return;
  }
  const partes = [];
  if (rem.t > 0) partes.push(`${rem.t} trinca${rem.t > 1 ? 's' : ''}`);
  if (rem.s > 0) partes.push(`${rem.s} sequência${rem.s > 1 ? 's' : ''}`);
  const falta = partes.join(' + ') || 'nada';
  // Formaria jogo, mas esvaziaria a mão antes de cumprir o contrato?
  const ids = selected.size > 0 ? [...selected] : null;
  const preso = planBaixada(view.you.hand, rem, ids, { permitirMaoVazia: true });
  if (preso) {
    toast(`Isso baixaria a mão inteira, e só dá para bater com o contrato cumprido (falta: ${falta}) — guarde pelo menos uma carta para descartar.`);
    return;
  }
  if (selected.size > 0) {
    toast('Essa seleção não forma uma trinca (3 iguais de naipes diferentes) nem uma sequência (4 seguidas do mesmo naipe).');
  } else {
    toast(`Você ainda não tem nenhum jogo completo do contrato para baixar (falta: ${falta}). Jogo a mais também desce antes disso — mas aí escolha as cartas dele na mão primeiro.`);
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
  ordemManual = [];   // pediu ordenação automática: a arrumação à mão sai de cena
  try { localStorage.setItem('cacamba-sort', sortMode); } catch { /* ok */ }
  render();
};

$('btn-rules').onclick = () => showRules();
$('btn-score').onclick = () => showScore();

// Sair da partida. Pede confirmação porque é irreversível: o assento não pode
// sumir no meio da rodada (mão, jogos e pontos são por assento), então quem
// sai deixa o robô no lugar e não volta — o servidor troca o token.
$('btn-quit').onclick = () => {
  const emJogo = view && view.phase !== 'gameEnd';
  showModal(
    `<h2>Sair da partida?</h2>
     <p>${emJogo
       ? 'O robô assume o seu lugar até o fim, com a sua mão e os seus pontos. <strong>Não dá para voltar</strong> depois.'
       : 'Você volta para a tela inicial.'}</p>`,
    [
      { label: 'Sair da partida', cls: 'btn-danger', fn: () => { closeModal(); sendMsg({ t: 'leave' }); } },
      { label: 'Continuar jogando', cls: 'btn-ghost', fn: closeModal },
    ],
    closeModal,
    true,
  );
};

// ---------------- Movimento ----------------

const semMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let distribuirPendente = false;

// Distribuir: as cartas saem do monte e voam para cada assento. Não são as 6 a
// 12 cartas de verdade — com 8 jogadores seriam quase cem elementos na tela.
// Três por jogador bastam para o gesto ler como "está distribuindo".
const CARTAS_POR_JOGADOR_NA_ANIMACAO = 3;

function animaDistribuicao() {
  if (semMovimento() || !view) return;
  const monte = $('deck-pile');
  const mao = $('hand');
  if (!monte || !mao) return;
  const origem = monte.getBoundingClientRect();
  if (!origem.width) return;

  const destinos = [];
  for (const el of assentos.values()) {
    const r = el.getBoundingClientRect();
    destinos.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  const rm = mao.getBoundingClientRect();
  destinos.push({ x: rm.left + rm.width / 2, y: rm.top + 40 });
  if (!destinos.length) return;

  let i = 0;
  for (let volta = 0; volta < CARTAS_POR_JOGADOR_NA_ANIMACAO; volta++) {
    for (const d of destinos) voaCarta(origem, d, (i++) * 52);
  }
}

function voaCarta(origem, destino, atraso) {
  const x0 = origem.left + origem.width / 2;
  const y0 = origem.top + 22;
  const el = document.createElement('div');
  el.className = 'carta-voando';
  el.style.left = `${x0 - 15}px`;
  el.style.top = `${y0 - 21}px`;
  el.style.setProperty('--dx', `${destino.x - x0}px`);
  el.style.setProperty('--dy', `${destino.y - y0}px`);
  el.style.animationDelay = `${atraso}ms`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
  // Rede: em aba de segundo plano a animação não dispara e o `animationend`
  // nunca vem — sem isto a carta ficaria parada na tela para sempre.
  setTimeout(() => el.remove(), atraso + 1600);
}

// Reações: o assento responde ao que acabou de acontecer com ele. Gesto do
// corpo + um balão curto. A troca de ROSTO já está ligada, para quando o
// elenco tiver expressões (ver EXPRESSOES em shared/elenco.js); enquanto não
// tiver, a figura continua a mesma e quem carrega a reação é o gesto.
const REACOES = {
  baixou:  { texto: 'baixei!',    gesto: 'pula',   cara: 'feliz' },
  bateu:   { texto: 'bati!',      gesto: 'pula',   cara: 'feliz' },
  pediu:   { texto: 'quero essa', gesto: 'treme',  cara: 'bravo' },
  levou:   { texto: 'peguei!',    gesto: 'pula',   cara: 'feliz' },
  perdeu:  { texto: 'ah, não…',   gesto: 'murcha', cara: 'bravo' },
  coringa: { texto: '🃏 troquei', gesto: 'pula',   cara: 'feliz' },
  saiu:    { texto: 'fui',        gesto: 'murcha', cara: null },
};

function reage(playerId, chave) {
  const r = REACOES[chave];
  const el = playerId === me() ? $('meu-assento') : assentos.get(playerId);
  if (!r || !el || semMovimento()) return;

  let balao = el.querySelector('.balao');
  if (!balao) {
    balao = document.createElement('span');
    balao.className = 'balao';
    el.appendChild(balao);
  }
  balao.textContent = r.texto;
  repete(balao, 'fala');
  repete(el, r.gesto);
  trocaCara(el, playerId, r.cara);
}

// Se o personagem tiver a expressão, o rosto muda enquanto a reação dura.
function trocaCara(el, playerId, expressao) {
  const img = el.querySelector('.personagem');
  const slug = personagemDe(playerId, view.players);
  if (!img || !expressao || !temExpressao(slug, expressao)) return;
  img.src = `/assets/personagens/${slug}-corpo-inteiro-${expressao}.svg`;
  clearTimeout(Number(img.dataset.voltaCara));
  img.dataset.voltaCara = String(setTimeout(() => { img.src = figuraDe(slug); }, 1900));
}

// ---------------- Avisos de eventos ----------------

let lastTurnWasMine = false;

function announce(ev) {
  switch (ev.e) {
    case 'roundStart':
      distribuirPendente = true;
      toast(`🎴 Rodada ${ev.round + 1}: ${playerName(ev.first)} começa.`);
      meldDiscardMode = false;
      // Os ids das cartas recomeçam a cada rodada: seleção antiga poderia
      // "grudar" numa carta nova por coincidência de id e armar um descarte
      // que o jogador nunca escolheu.
      selected.clear();
      ordemManual = [];
      break;
    case 'draw':
      if (ev.source === 'discard') {
        toast(`${playerName(ev.p)} pegou ${cardText(ev.card)} do meio.`);
        reage(ev.p, 'levou');
      }
      break;
    case 'claim':
      if (ev.p !== me()) toast(`🛒 ${playerName(ev.p)} quer a carta do meio.`);
      reage(ev.p, 'pediu');
      break;
    case 'claimVoid':
      if (ev.losers.includes(me())) toast(`😅 ${playerName(ev.by)} estava na vez e ficou com ${cardText(ev.card)}.`);
      for (const perdedor of ev.losers || []) reage(perdedor, 'perdeu');
      break;
    case 'buy':
      toast(`🛒 ${playerName(ev.p)} pediu primeiro e levou ${cardText(ev.card)}.`);
      reage(ev.p, 'levou');
      break;
    case 'baixou': {
      const conta = (n, um, muitos) => `${n} ${n > 1 ? muitos : um}`;
      const pedacos = [];
      if (ev.t) pedacos.push(conta(ev.t, 'trinca', 'trincas'));
      if (ev.s) pedacos.push(conta(ev.s, 'sequência', 'sequências'));
      const extras = [];
      if (ev.extraT) extras.push(conta(ev.extraT, 'trinca', 'trincas'));
      if (ev.extraS) extras.push(conta(ev.extraS, 'sequência', 'sequências'));
      const nome = playerName(ev.p);
      if (ev.completa && !pedacos.length && extras.length) {
        toast(`🔻 ${nome} baixou ${extras.join(' e ')} a mais.`);
      } else if (ev.completa) {
        toast(`🔻 ${nome} baixou o jogo!${extras.length ? ` E ${extras.join(' e ')} a mais.` : ''}`);
      } else if (pedacos.length || extras.length) {
        const tudo = [...pedacos, ...(extras.length ? [`${extras.join(' e ')} a mais`] : [])];
        toast(`🔻 ${nome} baixou ${tudo.join(' e ')}.`);
      } else {
        toast(`🔻 ${nome} baixou o jogo!`);
      }
      if (ev.daMesa) {
        toast(`🤏 ${playerName(ev.p)} puxou ${cardText(ev.daMesa)} que sobrava ${ev.deQuem === me() ? 'de um jogo seu' : 'da mesa'} e baixou com ela.`);
      }
      reage(ev.p, 'baixou');
      break;
    }
    case 'layoff':
      if (ev.p !== me()) toast(`${playerName(ev.p)} encaixou ${cardText(ev.card)}.`);
      break;
    case 'pegouCoringa':
      toast(`${JOKER_LABEL} ${playerName(ev.p)} esticou a sequência e levou o coringa que sobrou.`);
      reage(ev.p, 'coringa');
      break;
    case 'meldDiscard':
      toast(`${playerName(ev.p)} descartou ${cardText(ev.card)} de um jogo da mesa.`);
      break;
    case 'swapJoker':
      toast(`${JOKER_LABEL} ${playerName(ev.p)} pôs ${cardText(ev.card)} no lugar do coringa.`);
      reage(ev.p, 'coringa');
      break;
    case 'desistiu':
      toast(`🚪 ${playerName(ev.p)} saiu da partida — o robô assume o lugar.`);
      reage(ev.p, 'saiu');
      break;
    case 'away':
      toast(`📴 ${playerName(ev.p)} caiu — o jogo joga por ${ev.p === me() ? 'você' : 'ele'} até voltar.`);
      break;
    case 'reshuffle':
      toast('🔄 O monte acabou — o meio foi embaralhado de volta.');
      break;
    case 'roundEnd':
      if (ev.reason === 'bateu') { toast(`🏆 ${playerName(ev.winnerId)} bateu!`); reage(ev.winnerId, 'bateu'); }
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
     <p>Quando alguém descarta, os outros jogadores podem pedir a carta: leva <strong>quem apertar primeiro</strong>, e ele fica só com a carta pedida (não puxa nem descarta). Mas <strong>quem está na vez tem preferência</strong> sobre todos — se ele também quiser a carta, ela é dele.</p>
     <p><strong>Quem descartou não pede de volta:</strong> a carta que saiu da sua mão não volta para ela, nem pela compra da vez nem pelo pedido. Numa mesa de dois isso quer dizer que a compra fora da vez não acontece — o único que não está na vez é justamente quem acabou de descartar.</p>
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
