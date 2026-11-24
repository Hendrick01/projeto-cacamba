// ============================================================================
// Caçamba — cliente (celular): telas, mesa e interação com o servidor
// ============================================================================

import { arteDaCarta } from './baralho.js';
import {
  planBaixada, layoffOption, layoffEnds, removableCards, SUITS, SUIT_NAMES, SUIT_RED, rankLabel,
  isJoker, coringaNaSequencia, cardCobreCoringa, SWAP_JOKER_SAME_TURN,
  DEFAULT_OPTS, sobraFechaJogo, coringaLiberadoPeloEncaixe, trocasNaTrinca,
  CONTRACTS as CONTRATOS, TOTAL_ROUNDS,
} from '/shared/engine.js';
import { emoteDe, textoDoEmote } from '/shared/emotes.js';
import { montaEmotes } from './emotes-ui.js';
import {
  ELENCO, SLUGS, personagemValido, personagemDoAssento, peleDe, temExpressao,
} from '/shared/elenco.js';
import { prateleira, precoEmReais } from '/shared/catalogo.js';
import { ordenaMao, reordena } from '/shared/mao.js';
import { criaVoz } from '/voz.js';
import { layoutMao2D } from '/interface-core.js';
import { configuraInterface, estadoConexao, ligaControlesVoz } from '/interface.js';
configuraInterface();

const $ = (id) => document.getElementById(id);

// ---------------- Estado local ----------------

let ws = null;
let view = null;          // última visão do jogo enviada pelo servidor
let lobby = null;         // última visão da sala
let session = loadJSON('cacamba-session');
let selected = new Set(); // cartas da mão selecionadas (ids)
let sortMode = localStorage.getItem('cacamba-sort') || 'suit';
let ordemPresidente = 'forca';
// Ordem escolhida à mão pelo jogador. Vazia = ordenação automática. Vive só
// nesta rodada: os ids das cartas recomeçam a cada uma.
let ordemManual = [];
// Arrasto em curso: { id, x0, y0, el, ativo }. Enquanto não passa do limiar,
// o gesto ainda pode virar toque (que seleciona a carta).
let arrasto = null;
// Carta que acabou de chegar na mão. Fica levantada no leque até você mexer
// nela ou até chegar outra: com a mão ordenada, a carta nova se enfia no meio
// e some — e é justamente ela que você precisa achar para decidir a jogada.
let cartasNovas = new Set();
let maoAnterior = null;
let meldDiscardMode = false;
let reconnectDelay = 500;
// O RETRATO DA SALA (lib/selo-sala.js): cifrado, o cliente só guarda e devolve.
// É com ele que a partida volta depois que o servidor reinicia.
let seloDaSala = loadJSONCedo('cacamba-selo');
let tentouRestaurar = false;
let versaoCarregada = null;
function loadJSONCedo(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }

function loadJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveSession(s) {
  session = s;
  try {
    if (s) localStorage.setItem('cacamba-session', JSON.stringify(s));
    else { localStorage.removeItem('cacamba-session'); localStorage.removeItem('cacamba-selo'); seloDaSala = null; }
  } catch { /* modo privado */ }
}

// ---------------- Conexão ----------------

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}`);
  ws.onopen = () => {
    estadoConexao('online');
    reconnectDelay = 500;
    if (session) ws.send(JSON.stringify({ t: 'resume', ...session }));
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMessage(msg);
  };
  ws.onclose = (event) => {
    estadoConexao([4001,1008].includes(event.code) ? 'paused' : 'offline');
    if (event.code === 4001 || event.code === 1008) {
      voz.desligar();
      toast(event.code === 4001 ? 'Partida aberta em outra janela. Recarregue para voltar aqui.' : 'Conexão pausada por excesso de mensagens. Aguarde e recarregue.');
      if (!$('screen-retomando').hidden) showScreen(telaInicial());
      return;
    }
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.6, 6000);
  };
}

function sendMsg(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function sendAction(action) { sendMsg({ t: 'action', action }); }

// ---------------- Chat de voz ----------------
// O módulo mede e conecta; aqui só se decide o botão e quem acende no assento.
const voz = criaVoz({ meuId: () => me(), enviar: (to, dados) => sendMsg({ t: 'voz', to, dados }) });

// Um botão, três estados: desligado → ligado → mudo → desligado. Ligar pede o
// microfone ao navegador, e isso só pode acontecer num toque de verdade.
const controlesVoz = ligaControlesVoz(voz, { botao: $('btn-voz'), avisar: toast });
// Quem está falando acende no assento — inclusive você, no seu.
setInterval(() => {
  if (!voz.ligado() && !voz.quantos) return;
  for (const [id, el] of assentos) el.classList.toggle('falando', voz.falando(id));
  $('meu-assento')?.classList.toggle('falando', voz.falando(me()));
}, 120);

function handleMessage(msg) {
  switch (msg.t) {
    case 'versao':
      // a primeira que chega é a desta página; outra diferente = saiu versão nova
      if (versaoCarregada === null) versaoCarregada = msg.v;
      else if (msg.v !== versaoCarregada) avisaVersaoNova();
      break;
    case 'selo':
      if (session && msg.code === session.code) {
        seloDaSala = { code: msg.code, seq: msg.seq, selo: msg.selo };
        try { localStorage.setItem('cacamba-selo', JSON.stringify(seloDaSala)); } catch { /* modo privado */ }
      }
      break;
    case 'reinicio':
      toast('O servidor está reiniciando. A partida volta em instantes.');
      break;
    case 'welcome':
      tentouRestaurar = false;
      saveSession({ code: msg.code, playerId: msg.playerId, token: msg.token });
      voz.reconectar?.();
      break;
    case 'lobby': {
      // Anfitrião pode mudar no meio (o antigo caiu): quem foi promovido
      // precisa re-renderizar o modal de fim de rodada/jogo para ganhar o
      // botão de continuar — senão a sala fica presa em "esperando…".
      const hostMudou = lobby && msg.hostId !== lobby.hostId;
      lobby = msg;
      controlesVoz.presenca(msg.players);
      if (!msg.started) showScreen('lobby');
      renderLobby();
      if (hostMudou && view) { modalPhaseShown = null; render(); }
      break;
    }
    case 'state':
      // A mesa do Presidente só é baixada quando a primeira visão dela chega.
      // Enquanto baixa, as visões seguintes esperam na fila, em ordem.
      if (msg.view?.modo === 'presidente' && !mesaPresidente) {
        filaPresidente.push(msg);
        if (filaPresidente.length === 1) {
          carregaPresidente()
            .then(() => { const fila = filaPresidente.splice(0); for (const m of fila) handleMessage(m); })
            .catch(() => { filaPresidente.length = 0; toast('Não deu para abrir a mesa do Presidente. Recarregue a página.'); });
        }
        break;
      }
      if (msg.view?.modo === 'bazuca' && !mesaBazuca) {
        filaBazuca.push(msg);
        if (filaBazuca.length === 1) {
          carregaBazuca()
            .then(() => { const fila = filaBazuca.splice(0); for (const m of fila) handleMessage(m); })
            .catch(() => { filaBazuca.length = 0; toast('Não deu para abrir a mesa do Bazuca. Recarregue a página.'); });
        }
        break;
      }
      if (msg.view?.modo === 'domino' && !mesaDomino) {
        filaDomino.push(msg);
        if (filaDomino.length === 1) {
          carregaDomino()
            .then(() => { const fila = filaDomino.splice(0); for (const m of fila) handleMessage(m); })
            .catch(() => { filaDomino.length = 0; toast('Não deu para abrir a mesa do Dominó. Recarregue a página.'); });
        }
        break;
      }
      if (msg.view?.modo === 'poker' && !mesaPoker) {
        filaPoker.push(msg);
        if (filaPoker.length === 1) {
          carregaPoker()
            .then(() => { const fila = filaPoker.splice(0); for (const m of fila) handleMessage(m); })
            .catch(() => { filaPoker.length = 0; toast('Não deu para abrir a mesa do Poker. Recarregue a página.'); });
        }
        break;
      }
      if (msg.view?.modo === 'puxadinho' && !mesaPuxadinho) {
        filaPuxadinho.push(msg);
        if (filaPuxadinho.length === 1) {
          carregaPuxadinho()
            .then(() => { const fila = filaPuxadinho.splice(0); for (const m of fila) handleMessage(m); })
            .catch(() => { filaPuxadinho.length = 0; toast('Não deu para abrir a mesa do Puxadinho. Recarregue a página.'); });
        }
        break;
      }
      if (msg.view?.modo === 'canastra' && !mesaCanastra) {
        filaCanastra.push(msg);
        if (filaCanastra.length === 1) {
          carregaCanastra()
            .then(() => { const fila = filaCanastra.splice(0); for (const m of fila) handleMessage(m); })
            .catch(() => { filaCanastra.length = 0; toast('Não deu para abrir a mesa da Canastra. Recarregue a página.'); });
        }
        break;
      }
      if (msg.view?.modo === 'mexemexe' && !mesaMexe) {
        filaMexe.push(msg);
        if (filaMexe.length === 1) {
          carregaMexe()
            .then(() => { const fila = filaMexe.splice(0); for (const m of fila) handleMessage(m); })
            .catch(() => { filaMexe.length = 0; toast('Não deu para abrir a mesa do Mexe-Mexe. Recarregue a página.'); });
        }
        break;
      }
      view = msg.view;
      viewChegouEm = performance.now();   // o relógio da vez desconta a partir daqui
      controlesVoz.presenca(view.players);
      showScreen('game');
      for (const ev of msg.events || []) announce(ev);
      render();
      // Depois do render: a distribuição precisa dos assentos já no lugar para
      // saber para onde as cartas voam.
      if (distribuirPendente) { distribuirPendente = false; animaDistribuicao(); }
      break;
    case 'voz':
      voz.receber(msg);
      break;
    case 'emote':
      mostraEmote(msg.from, msg.k);
      break;
    case 'error':
      toast(msg.msg);
      break;
    case 'gone':
      // o servidor reiniciou e não conhece a sala: devolve o retrato que ele
      // mesmo entregou, uma vez só — se não servir, aí sim acabou
      if (msg.semSala && session && seloDaSala?.code === session.code && !tentouRestaurar) {
        tentouRestaurar = true;
        sendMsg({ t: 'restaura', selo: seloDaSala.selo, playerId: session.playerId, token: session.token });
        break;
      }
      voz.desligar();
      saveSession(null);
      showScreen(telaInicial());
      break;
  }
}

// VERSÃO NOVA NO AR: a página aberta fica com o código velho até recarregar
// (foi o "ainda não alterou no site" de 15/09/2026). Uma faixa fixa, que não
// some sozinha e não interrompe a jogada: quem decide a hora é o jogador. A
// sessão está guardada, então recarregar volta direto para a mesa.
function avisaVersaoNova() {
  if (document.getElementById('faixa-versao')) return;
  const b = document.createElement('button');
  b.id = 'faixa-versao'; b.type = 'button'; b.className = 'faixa-versao';
  b.textContent = 'Saiu versão nova do jogo. Toque para atualizar.';
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}

// ---------------- Telas ----------------

function showScreen(name) {
  for (const s of ['modos', 'home', 'retomando', 'avatar', 'loja', 'lobby', 'game']) $(`screen-${s}`).hidden = s !== name;
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

// ---------------- Modos de jogo ----------------
// A porta da casa mostra os modos; o Caçamba é o principal. Quem chega por
// convite (?sala=) vai direto ao formulário: a sala já tem modo, e é ela que
// manda. O modo escolhido aqui só vale para CRIAR sala.
const MODOS = {
  cacamba: {
    nome: 'Caçamba',
    titulo: 'Caçamba<br><em>tradicional do muquifão</em>',
    fatos: '<span><strong>2–8</strong>jogadores</span><span><strong>7</strong>rodadas</span><span><strong>Menos pontos</strong>mais perto da vitória</span>',
    min: DEFAULT_OPTS.minPlayers,
  },
  presidente: {
    nome: 'Presidente',
    titulo: 'Presidente<br><em>quem sai primeiro manda</em>',
    fatos: '<span><strong>3–8</strong>jogadores</span><span><strong>3 … A, 2</strong>a mais forte</span><span><strong>Cu</strong>entrega as melhores</span>',
    min: 3,
  },
  domino: {
    nome: 'Dominó',
    titulo: 'Dominó<br><em>de ponto, mano a mano ou em dupla</em>',
    fatos: '<span><strong>1v1 ou 2v2</strong>à escolha da sala</span><span><strong>Múltiplo de 5</strong>nas pontas marca</span><span><strong>240</strong>fecha a partida</span>',
    min: 1,   // as cadeiras vazias viram robô na hora de começar
  },
  bazuca: {
    nome: 'Bazuca',
    titulo: 'Bazuca<br><em>memória, reflexo e coragem de gritar</em>',
    fatos: '<span><strong>2–6</strong>jogadores</span><span><strong>Menor soma</strong>leva a rodada</span><span><strong>4 vitórias</strong>fecham a partida</span>',
    min: 2, max: 6,
    niveis: ['facil', 'normal', 'dificil'],
  },
  poker: {
    nome: 'Poker',
    titulo: 'Poker<br><em>Texas Hold\'em valendo fichas</em>',
    fatos: '<span><strong>2–8</strong>jogadores</span><span><strong>1.000</strong>em fichas para cada um</span><span><strong>Leva tudo</strong>quem ficar com todas</span>',
    min: 2,
  },
  puxadinho: {
    nome: 'Puxadinho',
    titulo: 'Puxadinho<br><em>levante o bairro antes do fiscal</em>',
    fatos: '<span><strong>3–4</strong>jogadores</span><span><strong>Troca</strong>material com a mesa</span><span><strong>10 pontos</strong>na sua vez ganha</span>',
    min: 3, max: 4,
  },
  mexemexe: {
    nome: 'Mexe-Mexe',
    titulo: 'Mexe-Mexe<br><em>a mesa é de todo mundo</em>',
    fatos: '<span><strong>2–6</strong>jogadores</span><span><strong>11</strong>cartas na mão</span><span><strong>Bateu</strong>ganhou</span>',
    min: 2, max: 6,
  },
  canastra: {
    nome: 'Canastra',
    titulo: 'Canastra<br><em>a convencional e a do 3</em>',
    fatos: '<span><strong>1v1 ou 2v2</strong>à escolha da sala</span><span><strong>2 tipos</strong>convencional e do 3</span><span><strong>3.000</strong>fecha a partida</span>',
    min: 1,   // as cadeiras vazias viram robô na hora de começar
  },
};
let modoDaCasa = 'cacamba';
function telaInicial() { return params.get('sala') ? 'home' : 'modos'; }
function escolheModo(modo) {
  modoDaCasa = MODOS[modo] ? modo : 'cacamba';
  const m = MODOS[modoDaCasa];
  $('home-marca').textContent = m.nome;
  $('home-titulo').innerHTML = m.titulo;
  $('home-fatos').innerHTML = m.fatos;
  showScreen('home');
}
$('modo-cacamba').onclick = () => escolheModo('cacamba');
$('modo-presidente').onclick = () => {
  escolheModo('presidente');
  carregaPresidente().catch(() => {});   // já vai baixando enquanto a pessoa digita o nome
};
$('modo-domino').onclick = () => {
  escolheModo('domino');
  carregaDomino().catch(() => {});
};
$('modo-bazuca').onclick = () => {
  escolheModo('bazuca');
  carregaBazuca().catch(() => {});
};
$('modo-poker').onclick = () => {
  escolheModo('poker');
  carregaPoker().catch(() => {});
};
$('modo-puxadinho').onclick = () => {
  escolheModo('puxadinho');
  carregaPuxadinho().catch(() => {});
};
$('modo-mexemexe').onclick = () => {
  escolheModo('mexemexe');
  carregaMexe().catch(() => {});
};
$('modo-canastra').onclick = () => {
  escolheModo('canastra');
  carregaCanastra().catch(() => {});
};
$('btn-modos').onclick = () => showScreen('modos');

// A MESA DO PRESIDENTE. Só é baixada quando alguém escolhe o modo ou cai numa
// sala dele: quem joga Caçamba nunca paga por ela.
let mesaPresidente = null;
let carregandoPresidente = null;
const filaPresidente = [];
function carregaPresidente() {
  carregandoPresidente ||= import('./presidente-mesa.js').then((mod) => {
    mesaPresidente = mod.criaMesaPresidente(contextoDaMesa());
    return mesaPresidente;
  });
  return carregandoPresidente;
}
const ehPresidente = () => view?.modo === 'presidente';

// A MESA DO DOMINÓ, no mesmo esquema: só vem com o modo.
let mesaDomino = null;
let carregandoDomino = null;
const filaDomino = [];
function carregaDomino() {
  carregandoDomino ||= import('./domino-mesa.js').then((mod) => {
    mesaDomino = mod.criaMesaDomino(contextoDaMesa());
    return mesaDomino;
  });
  return carregandoDomino;
}
const ehDomino = () => view?.modo === 'domino';

// A MESA DO BAZUCA, no mesmo esquema.
let mesaBazuca = null;
let carregandoBazuca = null;
const filaBazuca = [];
function carregaBazuca() {
  carregandoBazuca ||= import('./bazuca-mesa.js').then((mod) => {
    mesaBazuca = mod.criaMesaBazuca(contextoDaMesa());
    return mesaBazuca;
  });
  return carregandoBazuca;
}
const ehBazuca = () => view?.modo === 'bazuca';

// A MESA DO POKER, no mesmo esquema.
let mesaPoker = null;
let carregandoPoker = null;
const filaPoker = [];
function carregaPoker() {
  carregandoPoker ||= import('./poker-mesa.js').then((mod) => {
    mesaPoker = mod.criaMesaPoker(contextoDaMesa());
    return mesaPoker;
  });
  return carregandoPoker;
}
const ehPoker = () => view?.modo === 'poker';

// A MESA DO PUXADINHO, no mesmo esquema: o tabuleiro só vem com o modo.
let mesaPuxadinho = null;
let carregandoPuxadinho = null;
const filaPuxadinho = [];
function carregaPuxadinho() {
  carregandoPuxadinho ||= import('./puxadinho-mesa.js').then((mod) => {
    mesaPuxadinho = mod.criaMesaPuxadinho(contextoDaMesa());
    return mesaPuxadinho;
  });
  return carregandoPuxadinho;
}
const ehPuxadinho = () => view?.modo === 'puxadinho';

// A MESA DO MEXE-MEXE, no mesmo esquema. Ela também guarda o rascunho da vez:
// as cartas da mão que já foram para a mesa saem do leque (ver sortedHand).
let mesaMexe = null;
let carregandoMexe = null;
const filaMexe = [];
function carregaMexe() {
  carregandoMexe ||= import('./mexemexe-mesa.js').then((mod) => {
    mesaMexe = mod.criaMesaMexe(contextoDaMesa());
    return mesaMexe;
  });
  return carregandoMexe;
}
const ehMexe = () => view?.modo === 'mexemexe';

// A MESA DA CANASTRA, no mesmo esquema. Ela também guarda o rascunho da
// baixada: as cartas que já foram para um jogo saem do leque, e a carta de
// cima do lixo entra nele enquanto você monta o jogo que a leva.
let mesaCanastra = null;
let carregandoCanastra = null;
const filaCanastra = [];
function carregaCanastra() {
  carregandoCanastra ||= import('./canastra-mesa.js').then((mod) => {
    mesaCanastra = mod.criaMesaCanastra(contextoDaMesa());
    return mesaCanastra;
  });
  return carregandoCanastra;
}
const ehCanastra = () => view?.modo === 'canastra';
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
  if (name) { saveSession(null); sendMsg({ t: 'create', name, avatar: meuPersonagem, modo: modoDaCasa }); }
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
  // O personagem escolhido é a cara da tela inicial, não uma miniatura dentro
  // de um botão: é ele que vai sentar à mesa.
  $('persona-figura').src = figuraDe(p.slug);
  $('persona-figura').alt = p.nome;
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
$('btn-rules-home').onclick = () => {
  if (modoDaCasa === 'presidente') carregaPresidente().then((m) => m.regras()).catch(() => {});
  else if (modoDaCasa === 'domino') carregaDomino().then((m) => m.regras()).catch(() => {});
  else if (modoDaCasa === 'bazuca') carregaBazuca().then((m) => m.regras()).catch(() => {});
  else if (modoDaCasa === 'poker') carregaPoker().then((m) => m.regras()).catch(() => {});
  else if (modoDaCasa === 'puxadinho') carregaPuxadinho().then((m) => m.regras()).catch(() => {});
  else if (modoDaCasa === 'mexemexe') carregaMexe().then((m) => m.regras()).catch(() => {});
  else if (modoDaCasa === 'canastra') carregaCanastra().then((m) => m.regras()).catch(() => {});
  else showRules();
};

// ---------------- A loja ----------------
// A prateleira é desenhada a partir de shared/catalogo.js, o mesmo arquivo que
// o servidor usa para decidir se alguém pode USAR o que escolheu. Uma fonte só:
// se a loja mostrasse uma lista própria, ela e o servidor discordariam no dia
// em que um preço mudasse.
//
// Ainda não há compra: falta escolher a plataforma que vende (ela é quem emite
// a nota e absorve o estorno). Então tudo entra como "em breve" — e é de
// propósito que a prateleira já exista assim, porque quem clica em "Loja" e
// não acha nada responde a pergunta que a Fase 0 está fazendo.
function desenhaLoja() {
  const lista = $('loja-prateleira');
  lista.innerHTML = prateleira().map((item) => {
    const preco = item.estado === 'a-venda'
      ? `<span class="loja-preco">${precoEmReais(item.centavos)}</span>`
      : '<span class="loja-breve">Em breve</span>';
    // Verso tem desenho e o desenho É o produto; cenário se mostra na mesa, e
    // uma miniatura mentirosa vende pior que nenhuma.
    // "Em breve" é literal: a arte ainda NÃO existe no disco. Apontar para ela
    // renderiza o ícone de imagem quebrada, que faz a loja parecer defeito em
    // vez de promessa. Enquanto não estiver à venda, o item mostra o símbolo.
    const arte = item.arquivo && item.estado === 'a-venda'
      ? `<img class="loja-arte" src="${item.arquivo}" alt="" loading="lazy">`
      : `<span class="loja-arte loja-arte-vazia" aria-hidden="true"></span>`;
    return `<li class="loja-item ${item.estado}">
      ${arte}
      <div class="loja-texto">
        <strong>${escapeHTML(item.nome)}</strong>
        <small>${escapeHTML(item.descricao)}</small>
      </div>
      ${preco}
    </li>`;
  }).join('');
}

// A conta só existe por causa da loja: quem só quer jogar nunca vê isto. Por
// isso o formulário mora AQUI dentro, e não numa tela de login na entrada do
// jogo — pedir cadastro antes de jogar espantaria mais gente do que a loja
// jamais traria.
let conta = null;

async function carregaConta() {
  const alvo = $('loja-conta');
  try {
    const r = await fetch('/eu.json');
    // 503 é a loja desligada (sem banco), e não erro: mostra a prateleira sem
    // formulário, em vez de um aviso vermelho que assusta à toa.
    if (r.status === 503) { alvo.innerHTML = ''; return; }
    conta = await r.json();
  } catch { alvo.innerHTML = ''; return; }

  if (conta.entrou) {
    alvo.innerHTML = `<div class="conta-dentro">
        <span>Você está em <strong>${escapeHTML(conta.email)}</strong></span>
        <button id="btn-sair-conta" type="button" class="btn btn-ghost">Sair</button>
        <button id="btn-apagar-conta" type="button" class="btn btn-ghost btn-apagar">Apagar minha conta</button>
      </div>`;
    $('btn-sair-conta').onclick = async () => { await fetch('/sair', { method: 'POST' }); carregaConta(); };
    $('btn-apagar-conta').onclick = apagaConta;
    return;
  }

  alvo.innerHTML = `<form id="form-entrar" class="conta-form">
      <p class="conta-chamada">Para guardar o que você comprar, o Caçamba precisa saber quem é você. <strong>Não tem senha</strong> — a gente manda um link no seu e-mail.</p>
      <label class="field"><span>Seu e-mail</span><input id="conta-email" type="email" autocomplete="email" required placeholder="voce@exemplo.com"></label>
      <label class="field"><span>Data de nascimento</span><input id="conta-nascimento" type="date" required></label>
      <button type="submit" class="btn btn-primary">Receber o link</button>
      <p id="conta-aviso" class="conta-aviso" role="status"></p>
    </form>`;
  $('form-entrar').onsubmit = pedeLink;
}

async function pedeLink(evento) {
  evento.preventDefault();
  const aviso = $('conta-aviso');
  aviso.className = 'conta-aviso';
  aviso.textContent = 'Mandando…';
  try {
    const r = await fetch('/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('conta-email').value, nascimento: $('conta-nascimento').value }),
    });
    const dados = await r.json();
    if (!r.ok) { aviso.className = 'conta-aviso ruim'; aviso.textContent = dados.erro || 'Não deu certo.'; return; }
    aviso.textContent = dados.enviado
      ? 'Pronto! Olhe seu e-mail — o link vale por 15 minutos.'
      : 'Link gerado (o envio de e-mail ainda não está configurado neste servidor).';
  } catch {
    aviso.className = 'conta-aviso ruim';
    aviso.textContent = 'Sem conexão com o servidor.';
  }
}

// Apagar é irreversível e some com o que a pessoa comprou. Duas confirmações,
// e a segunda dizendo em voz alta o que se perde — não é atrito por atrito, é
// a diferença entre exercer um direito e escorregar num botão.
async function apagaConta() {
  if (!confirm('Apagar sua conta? Isso é definitivo.')) return;
  if (!confirm('Só confirmando: o que você comprou vai junto, e não dá para voltar atrás.')) return;
  await fetch('/apagar-conta', { method: 'POST' });
  conta = null;
  carregaConta();
}

$('btn-loja').onclick = () => { desenhaLoja(); carregaConta(); showScreen('loja'); };
$('btn-loja-voltar').onclick = () => showScreen('home');

// Quem clica no link do e-mail volta em /?entrada=ok. Abrir a loja já dentro
// fecha o ciclo: a pessoa saiu do jogo para o e-mail e volta exatamente onde
// estava. A URL é limpa em seguida para um F5 não repetir o recado.
{
  const veio = new URLSearchParams(location.search).get('entrada');
  if (veio) {
    history.replaceState(null, '', location.pathname);
    if (veio === 'ok') { desenhaLoja(); carregaConta(); showScreen('loja'); }
    else alert('Esse link já foi usado ou passou dos 15 minutos. Peça outro.');
  }
}

// ---------------- A caixinha ----------------
// O botão nasce escondido e só aparece quando o servidor responde a rota com
// uma chave configurada. Assim o clone de qualquer pessoa, e o `npm start` de
// desenvolvimento, não oferecem um Pix que cairia na conta de ninguém.
let apoio = null;
fetch('/apoio.json')
  .then((r) => (r.ok ? r.json() : null))
  .then((dados) => {
    if (!dados || !dados.codigo) return;
    apoio = dados;
    $('btn-apoiar').hidden = false;
  })
  .catch(() => { /* sem caixinha, sem botão */ });

$('btn-apoiar').onclick = () => {
  if (!apoio) return;
  showModal(
    `<h2>Apoiar o Caçamba</h2>
     <p>O jogo é de graça e continua sendo. Se ele rendeu boas noites, a caixinha ajuda a pagar o servidor.</p>
     ${apoio.qr ? `<img class="pix-qr" src="${apoio.qr}" alt="QR do Pix para apoiar o Caçamba">` : ''}
     <p class="pix-dica">Aponte a câmera do banco, ou copie o código:</p>
     <code class="pix-codigo">${escapeHTML(apoio.codigo)}</code>
     <p id="pix-aviso" class="pix-aviso" role="status"></p>`,
    [
      { label: 'Copiar código Pix', cls: 'btn-primary', fn: copiaPix },
      { label: 'Fechar', cls: 'btn-ghost', fn: closeModal },
    ],
    closeModal,
    true,
  );
};

async function copiaPix() {
  const aviso = $('pix-aviso');
  try {
    await navigator.clipboard.writeText(apoio.codigo);
    aviso.textContent = 'Copiado! Cole no aplicativo do banco.';
  } catch {
    // A área de transferência é negada em http:// e em navegador antigo. Em vez
    // de um erro sem saída, seleciono o código: aí o "copiar" fica no toque
    // longo de quem está lendo, que todo celular sabe fazer.
    const alvo = document.querySelector('.pix-codigo');
    const faixa = document.createRange();
    faixa.selectNodeContents(alvo);
    const selecao = getSelection();
    selecao.removeAllRanges();
    selecao.addRange(faixa);
    aviso.textContent = 'Selecionei o código — toque e segure para copiar.';
  }
}

// ---------------- Lobby ----------------

function renderLobby() {
  if (!lobby) return;
  $('lobby-code').textContent = lobby.code;
  const modoDaSala = MODOS[lobby.modo] ? lobby.modo : 'cacamba';
  $('lobby-modo').textContent = `Mesa de ${MODOS[modoDaSala].nome}`;
  $('lobby-url').textContent = lobby.joinUrl;
  if (lobby.qr) { $('lobby-qr').src = lobby.qr; $('lobby-qr').hidden = false; }

  const list = $('lobby-players');
  list.innerHTML = '';
  const cadeiras = (modoDaSala === 'domino' || modoDaSala === 'canastra') && Array.isArray(lobby.cadeiras) ? lobby.cadeiras : null;
  list.hidden = !!cadeiras;
  desenhaDuplas(cadeiras);
  for (const p of cadeiras ? [] : lobby.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot' + (p.connected ? '' : ' off');
    li.appendChild(dot);
    li.dataset.playerId = p.id;
    li.appendChild(avatarEl(p.id, lobby.players, 30));
    li.appendChild(document.createTextNode(p.id === me() ? `${p.name} (você)` : p.name));
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = p.isBot ? 'robô' : (p.id === lobby.hostId ? 'anfitrião' : '');
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

  $('btn-add-bot').hidden = !isHost() || !!cadeiras || lobby.players.length >= (MODOS[modoDaSala].max || DEFAULT_OPTS.maxPlayers);
  // o nível dos robôs: quem criou a sala escolhe; os outros só leem. No
  // dominó sempre há robô a caminho (as vagas), então o botão fica à vista.
  const temRobo = !!cadeiras || lobby.players.some((p) => p.isBot), facil = lobby.nivelRobos === 'facil';
  $('btn-nivel-robos').hidden = !temRobo;
  $('btn-nivel-robos').disabled = !isHost();
  if (modoDaSala === 'bazuca') {
    // três níveis, e o do meio se chama "médio": no Bazuca o robô é memória
    const rotulos = { facil: 'fáceis', normal: 'médios', dificil: 'difíceis' };
    $('btn-nivel-robos').textContent = `Robôs: ${rotulos[lobby.nivelRobos] || 'médios'}`;
    $('btn-nivel-robos').title = isHost() ? 'Toque para trocar. Fácil esquece quase tudo; médio às vezes acerta; difícil tem boa memória, mas também erra.' : 'Quem criou a sala escolhe o nível dos robôs.';
  } else {
    $('btn-nivel-robos').textContent = facil ? 'Robôs: fáceis' : 'Robôs: normais';
    const comoEFacil = modoDaSala === 'poker'
      ? 'Fácil: o robô lê mal a própria mão, paga demais e quase não aumenta.'
      : modoDaSala === 'mexemexe'
        ? 'Fácil: o robô só baixa jogos da mão e encaixa cartas; não desmonta os jogos da mesa.'
        : modoDaSala === 'canastra'
          ? 'Fácil: o robô nunca pega o lixo e às vezes descarta mal.'
          : 'Fácil: o robô não pega do meio, só encaixa nos próprios jogos e às vezes descarta mal.';
    $('btn-nivel-robos').title = isHost() ? `Toque para trocar. ${comoEFacil}` : 'Quem criou a sala escolhe o nível dos robôs.';
  }
  // o relógio da vez (só o Caçamba tem: o servidor manda `relogios` só nele)
  const prazos = Array.isArray(lobby.relogios) ? lobby.relogios : null;
  $('btn-relogio').hidden = !prazos;
  $('btn-relogio').disabled = !isHost();
  if (prazos) {
    $('btn-relogio').textContent = lobby.relogio > 0 ? `Relógio: ${lobby.relogio} s` : 'Relógio: sem';
    $('btn-relogio').title = isHost()
      ? 'Toque para trocar. Com relógio, quem estoura o tempo da vez tem a vez jogada no mínimo: puxa do monte e descarta.'
      : 'Quem criou a sala escolhe o relógio da vez.';
  }
  $('btn-start').hidden = !isHost();
  const faltam = MODOS[modoDaSala].min - lobby.players.length;
  $('btn-start').disabled = faltam > 0;
  $('lobby-wait').hidden = isHost();
  // Botão apagado sem dizer por quê parecia defeito: o motivo fica escrito.
  let motivo = '';
  if (isHost() && faltam > 0) {
    motivo = `${MODOS[modoDaSala].nome} precisa de pelo menos ${MODOS[modoDaSala].min} jogadores: `
      + `falta${faltam > 1 ? 'm' : ''} ${faltam}. Adicione um robô ou mande o convite.`;
  } else if (!isHost() && temRobo) {
    motivo = 'Quem criou a sala escolhe o nível dos robôs.';
  }
  $('lobby-motivo').textContent = motivo;
  $('lobby-motivo').hidden = !motivo;
}

// As cadeiras do dominó. No 2v2 são duas duplas, cadeiras 1 e 3 contra 2 e 4;
// no 1v1, uma contra a outra. O anfitrião escolhe o formato e toca numa
// cadeira e depois noutra para trocar o que há nelas (gente, robô ou vaga);
// os outros só veem. Vaga vira robô quando a partida começa.
let cadeiraEscolhida = null;
function desenhaDuplas(cadeiras) {
  const box = $('lobby-duplas');
  box.hidden = !cadeiras;
  box.innerHTML = '';
  if (!cadeiras) { cadeiraEscolhida = null; return; }
  const anfitriao = isHost();
  if (!anfitriao || cadeiraEscolhida >= cadeiras.length) cadeiraEscolhida = null;
  const mano = lobby.formato === '1v1';

  const formato = document.createElement('div');
  formato.className = 'lobby-formato';
  formato.setAttribute('role', 'group');
  formato.setAttribute('aria-label', 'Formato da partida');
  for (const [f, texto] of [['2v2', '2 contra 2'], ['1v1', '1 contra 1']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.className = (lobby.formato || '2v2') === f ? 'ativo' : '';
    b.setAttribute('aria-pressed', String((lobby.formato || '2v2') === f));
    b.disabled = !anfitriao;
    b.onclick = () => { cadeiraEscolhida = null; sendMsg({ t: 'formato', f }); };
    formato.appendChild(b);
  }
  box.appendChild(formato);

  // Canastra: a variante também é escolha do anfitrião, logo abaixo do formato
  if (lobby.modo === 'canastra') {
    const variante = document.createElement('div');
    variante.className = 'lobby-formato lobby-variante';
    variante.setAttribute('role', 'group');
    variante.setAttribute('aria-label', 'Tipo de canastra');
    for (const [v, texto] of [['convencional', 'Convencional'], ['do3', 'Do 3']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = texto;
      const ativo = (lobby.variante || 'convencional') === v;
      b.className = ativo ? 'ativo' : '';
      b.setAttribute('aria-pressed', String(ativo));
      b.disabled = !anfitriao;
      b.onclick = () => sendMsg({ t: 'variante', v });
      variante.appendChild(b);
    }
    box.appendChild(variante);
  }

  (mano ? [[0], [1]] : [[0, 2], [1, 3]]).forEach((par, d) => {
    const dupla = document.createElement('div');
    dupla.className = 'lobby-dupla';
    const h = document.createElement('h4');
    h.textContent = mano ? `Lado ${d + 1}` : `Dupla ${d + 1}`;
    dupla.appendChild(h);
    for (const i of par) {
      const p = lobby.players.find((x) => x.id === cadeiras[i]);
      const el = document.createElement(anfitriao ? 'button' : 'div');
      if (anfitriao) el.type = 'button';
      el.className = `lobby-cadeira${p ? '' : ' vaga'}${cadeiraEscolhida === i ? ' escolhida' : ''}`;
      if (p) {
        el.dataset.playerId = p.id;
        el.appendChild(avatarEl(p.id, lobby.players, 28));
        const nome = p.id === me() ? `${p.name} (você)` : p.name;
        el.appendChild(document.createTextNode(p.isBot ? `${nome} (robô)` : nome));
        if (!p.connected && !p.isBot) el.classList.add('fora');
      } else {
        el.textContent = `Cadeira ${i + 1} · vaga, entra robô`;
      }
      if (anfitriao) {
        el.setAttribute('aria-pressed', String(cadeiraEscolhida === i));
        el.onclick = () => {
          if (cadeiraEscolhida === null) { cadeiraEscolhida = i; renderLobby(); return; }
          if (cadeiraEscolhida !== i) sendMsg({ t: 'cadeira', de: cadeiraEscolhida, para: i });
          cadeiraEscolhida = null;
          renderLobby();
        };
      }
      dupla.appendChild(el);
    }
    box.appendChild(dupla);
  });
  const dica = document.createElement('p');
  dica.className = 'lobby-duplas-dica';
  dica.textContent = anfitriao
    ? (cadeiraEscolhida === null ? 'Toque em duas cadeiras para trocar quem senta onde.' : 'Agora toque na cadeira para onde vai.')
    : (mano ? 'Quem criou a sala escolhe o formato.' : 'Quem criou a sala arruma as duplas.');
  box.appendChild(dica);
}

$('btn-add-bot').onclick = () => sendMsg({ t: 'addBot' });
$('btn-nivel-robos').onclick = () => {
  const niveis = MODOS[lobby?.modo]?.niveis || ['facil', 'normal'];
  const k = niveis.indexOf(lobby?.nivelRobos);
  sendMsg({ t: 'nivelRobos', nivel: niveis[(k + 1) % niveis.length] });
};
// o relógio da vez: cada toque passa para o próximo prazo que o servidor oferece
$('btn-relogio').onclick = () => {
  const prazos = Array.isArray(lobby?.relogios) ? lobby.relogios : [];
  if (!prazos.length) return;
  const k = prazos.indexOf(lobby.relogio);
  sendMsg({ t: 'relogio', s: prazos[(k + 1) % prazos.length] });
};
$('btn-start').onclick = () => sendMsg({ t: 'start' });

// O convite. O endereço comprido quebrava em duas linhas na sala; virou um
// botão. No celular abre o compartilhar do aparelho (WhatsApp e cia.); no
// computador copia. Sem área de transferência (http://, navegador antigo), o
// endereço aparece selecionado para o toque longo.
const podeCompartilhar = !!navigator.share && matchMedia('(pointer: coarse)').matches;
$('convite-rotulo').textContent = podeCompartilhar ? 'Mandar convite' : 'Copiar convite';
$('btn-convite').onclick = async () => {
  const url = lobby?.joinUrl;
  if (!url) return;
  const rotulo = $('convite-rotulo');
  const original = rotulo.textContent;
  if (podeCompartilhar) {
    try {
      await navigator.share({ title: 'Caçamba', text: `Bora jogar ${MODOS[lobby.modo]?.nome || 'Caçamba'}? Sala ${lobby.code}`, url });
      return;
    } catch (e) { if (e?.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    rotulo.textContent = 'Convite copiado';
  } catch {
    const alvo = $('lobby-url');
    alvo.classList.add('visivel');
    const faixa = document.createRange();
    faixa.selectNodeContents(alvo);
    getSelection().removeAllRanges();
    getSelection().addRange(faixa);
    rotulo.textContent = 'Toque e segure para copiar';
  }
  setTimeout(() => { rotulo.textContent = original; }, 2200);
};
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

const SVG_NS = 'http://www.w3.org/2000/svg';

// O naipe desenhado (símbolos no topo do index.html). Sem `fill`: o desenho
// herda `currentColor`, e é só por isso que `.card.red` continua bastando para
// virar copas e ouros de vermelho sem uma regra por naipe.
function naipeSvg(card, classe) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', isJoker(card) ? '#naipe-coringa' : `#naipe-${card.suit}`);
  svg.append(use);
  return svg;
}

// O canto: valor em cima, naipe embaixo. É o único pedaço da carta que fica à
// vista quando ela está no meio do leque, então é ele que carrega a leitura —
// o naipe do meio é para a carta que está sozinha na mesa.
function cantoEl(card) {
  const canto = document.createElement('span');
  canto.className = 'idx';
  const valor = document.createElement('b');
  valor.textContent = isJoker(card) ? 'C' : rankLabel(card.rank);
  canto.append(valor, naipeSvg(card, 'naipe-min'));
  return canto;
}

function cardEl(card, mini = false) {
  const el = document.createElement('div');
  const joker = isJoker(card);
  el.className = 'card'
    + (joker ? ' joker' : '')
    + (!joker && SUIT_RED[card.suit] ? ' red' : '')
    + (mini ? ' mini' : '');
  // O naipe deixou de ser texto, então a carta precisa dizer em palavras o que
  // é: sem isto o leitor de tela passava a ler um retângulo mudo.
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', cartaFalada(card));
  // Os dois cantos são o mesmo desenho; o de baixo é o de cima girado meia
  // volta, como em qualquer baralho — é o que faz a carta ler como carta e
  // não como etiqueta.
  // A carta inteira é a arte: papel, índice do canto e cena já vêm desenhados
  // no arquivo. A MINIATURA também usa a arte (08/09/2026 — "não foi feito a
  // mudança do baralho": os jogos baixados eram o último lugar com o desenho
  // esquemático antigo, e ficavam de outro baralho). O que ela ganha por cima
  // é o índice do canto DESENHADO, em cima do impresso: a 42 px de largura o
  // índice da arte sai com uns 7 px, e é ele que se lê num jogo baixado, onde
  // as cartas se sobrepõem e sobra a tira da esquerda.
  const arte = document.createElement('img');
  arte.className = 'arte';
  arte.src = arteDaCarta(card);
  arte.alt = '';
  arte.decoding = 'async';
  el.append(arte);
  if (mini) el.append(cantoEl(card));
  return el;
}

// A carta em palavras, para o leitor de tela: "7 de copas", e não "7♥".
function cartaFalada(card) {
  return isJoker(card) ? 'coringa' : `${rankLabel(card.rank)} de ${SUIT_NAMES[card.suit]}`;
}

function cardText(card) {
  return isJoker(card) ? 'coringa' : rankLabel(card.rank) + SUITS[card.suit];
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

// Na listagem de um jogo o coringa é só a palavra: "5♠ 6♠ coringa 8♠".
function cartasDoJogo(meld) {
  return meld.cards.map((c) => cardText(c)).join(' ');
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

// A mão como ela aparece na tela, e o arrasto que a reordena. As duas regras
// moram em shared/mao.js, onde dá para testá-las sem navegador — foi ali que
// morou o bug da carta nova presa no canto do leque.
function sortedHand() {
  // No Presidente o que importa é a força (3 … A, 2), não o valor de face.
  // Tem ordem própria (começa pela força) para não herdar a do Caçamba.
  if (ehPresidente() && !ordemManual.length) {
    return ordemPresidente === 'suit' ? ordenaMao(view?.you?.hand || [], [], 'suit') : mesaPresidente.ordena(view?.you?.hand || []);
  }
  // No Mexe-Mexe, durante a vez, a mão é a do rascunho: o que já foi para a
  // mesa sai do leque, e o que voltou entra de novo.
  if (ehMexe()) return ordenaMao(mesaMexe.maoDoRascunho(), ordemManual, sortMode);
  if (ehCanastra()) return ordenaMao(mesaCanastra.maoDoRascunho(), ordemManual, sortMode);
  return ordenaMao(view?.you?.hand || [], ordemManual, sortMode);
}

function poeNaPosicao(id, destino) {
  // A ordem entra como está NA TELA: é isso que faz a carta recém-puxada, que
  // a `ordemManual` ainda não conhece, poder ser arrastada como as outras.
  const nova = reordena(sortedHand(), id, destino);
  if (!nova) return false;
  ordemManual = nova;
  return true;
}

// ---------------- Mesa ----------------

function myTurn() { return view && view.turnId === me(); }

// A MINHA PRESENÇA, para quem vê a mesa em 3D: o índice da carta escolhida na
// ordem em que eu vejo a mão (nunca a carta). Freio de 150 ms, só quando muda.
let presencaEnviada = null, presencaTimer = null;
function mandaPresenca() {
  if (!view?.you || (view.phase !== 'draw' && view.phase !== 'play')) return;
  const sel = sortedHand().findIndex((c) => selected.has(c.id));
  const chave = String(sel >= 0 ? sel : null);
  clearTimeout(presencaTimer);
  if (chave === presencaEnviada) return;
  presencaTimer = setTimeout(() => { presencaEnviada = chave; sendMsg({ t: 'presenca', sel: sel >= 0 ? sel : null, olha: null }); }, 150);
}

// Cada estado novo redesenha a mesa, e o elemento com foco some junto: quem
// joga pelo teclado voltava para o começo da página a cada jogada de robô.
// Antes de redesenhar anota-se QUEM tinha o foco (id, ou carta/jogo dentro
// de que caixa); depois o foco volta para o equivalente, se ele ainda existir.
function anotaFoco() {
  const a = document.activeElement;
  if (!a || a === document.body || !$('screen-game').contains(a)) return null;
  if (a.id) return `#${CSS.escape(a.id)}`;
  const caixa = a.parentElement?.closest('[id]');
  if (!caixa) return null;
  if (a.dataset.cardId) return `#${CSS.escape(caixa.id)} [data-card-id="${a.dataset.cardId}"]`;
  if (a.dataset.meldId) return `#${CSS.escape(caixa.id)} [data-meld-id="${a.dataset.meldId}"]`;
  return null;
}
function devolveFoco(seletor) {
  if (!seletor || !$('modal-backdrop').hidden) return;
  if (document.activeElement && document.activeElement !== document.body) return;
  // a carta que tinha o foco pode ter saído dela (veio para a mão, foi
  // descartada): o foco cai na mão, que é de onde sai a próxima jogada
  const alvo = document.querySelector(seletor);
  const destino = alvo && alvo.tabIndex >= 0 && !alvo.disabled ? alvo : document.querySelector('#hand [tabindex="0"]');
  destino?.focus({ preventScroll: true });
}

function render() {
  const foco = anotaFoco();
  renderMesa();
  devolveFoco(foco);
}

function renderMesa() {
  if (!view) return;
  $('screen-game').classList.toggle('modo-presidente', ehPresidente());
  $('screen-game').classList.toggle('modo-domino', ehDomino());
  $('screen-game').classList.toggle('modo-bazuca', ehBazuca());
  $('screen-game').classList.toggle('modo-poker', ehPoker());
  $('screen-game').classList.toggle('modo-puxadinho', ehPuxadinho());
  $('screen-game').classList.toggle('modo-mexemexe', ehMexe());
  $('screen-game').classList.toggle('modo-canastra', ehCanastra());
  if (ehCanastra()) {
    marcaCartasNovas();
    mesaCanastra.render();
    notifyTurn();
    return;
  }
  if (ehMexe()) {
    marcaCartasNovas();
    mesaMexe.render();
    notifyTurn();
    return;
  }
  if (ehPoker()) {
    mesaPoker.render();
    notifyTurn();
    return;
  }
  if (ehPuxadinho()) {
    mesaPuxadinho.render();
    notifyTurn();
    return;
  }
  if (ehBazuca()) {
    mesaBazuca.render();
    notifyTurn();
    return;
  }
  if (ehDomino()) {
    mesaDomino.render();
    notifyTurn();
    return;
  }
  if (ehPresidente()) {
    marcaCartasNovas();
    selected = new Set([...selected].filter((id) => (view.you?.hand || []).some((c) => c.id === id)));
    mesaPresidente.render();
    notifyTurn();
    return;
  }
  marcaCartasNovas();
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
  mandaPresenca();
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

// No dominó a mesa é de dupla: o parceiro senta à sua frente, no meio, e quem
// joga depois de você fica à sua direita (a vez corre pela direita).
function ordemDosAdversarios() {
  const outros = view.players.filter((p) => p.id !== me());
  const eu = view.players.findIndex((p) => p.id === me());
  if (!(ehDomino() || ehCanastra()) || eu < 0 || view.players.length !== 4) return outros;
  return [3, 2, 1].map((k) => view.players[(eu + k) % 4]);
}

function renderOpponents() {
  const box = $('opponents');
  const adversarios = ordemDosAdversarios();
  const lugares = posicoesDeAssento(adversarios.length);
  const alturaAssentos = alturaDaMesa(adversarios.length);
  box.style.height = `${alturaAssentos}px`;
  // Com duas fileiras, a de trás fica acima do tampo e flutuava no assoalho.
  // O balcão é uma faixa de madeira curva, no material do aro, exatamente na
  // linha em que a figura de trás é cortada no peito (58 px × 0,8 de escala):
  // é o que faz o corte ler como gente sentada atrás de um balcão, e não
  // gente em pé no fundo do salão.
  let balcao = box.querySelector('.balcao');
  if (!balcao) { balcao = document.createElement('div'); balcao.className = 'balcao'; box.prepend(balcao); }
  balcao.hidden = adversarios.length <= ASSENTOS_POR_FILEIRA;
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
  if (prog) marcas.appendChild(marca(prog.completo ? '✓' : prog.texto, 'm-gold'));
  if (view.claims?.includes(p.id)) {
    // o carrinho desenhado (#i-carrinho), como no botão de pedir
    const carrinho = marca('', 'm-cart');
    carrinho.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-carrinho"/></svg>';
    carrinho.title = 'Pediu a carta do meio';
    marcas.appendChild(carrinho);
  }
  if (p.desistiu) marcas.appendChild(marca('saiu', 'm-off'));
  else if (!p.isBot && !p.connected) marcas.appendChild(marca('fora', 'm-off'));

  // Gestos de uma vez só, disparados pela mudança e não pelo estado
  const feitos = p.baixados ? p.baixados.t + p.baixados.s : 0;
  if (view.claims?.includes(p.id) && !antes.pedidos.has(p.id)) repete(el, 'pediu');
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
  if (ehPresidente()) { mesaPresidente.mostraJogador(playerId); return; }
  if (ehDomino()) { mesaDomino.mostraJogador(playerId); return; }
  if (ehBazuca()) { mesaBazuca.mostraJogador(playerId); return; }
  if (ehPoker()) { mesaPoker.mostraJogador(playerId); return; }
  if (ehPuxadinho()) { mesaPuxadinho.mostraJogador(playerId); return; }
  if (ehMexe()) { mesaMexe.mostraJogador(playerId); return; }
  if (ehCanastra()) { mesaCanastra.mostraJogador(playerId); return; }
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
  if (view.claims.includes(p.id)) linhas.push('<p>Pediu a carta do meio.</p>');
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

// Espessura das pilhas: quantas bordas aparecem por baixo da carta de cima.
// No monte ela também é informação de jogo — dá para ver o baralho afinando, e
// três esgotamentos encerram a rodada.
function camadasDaPilha(quantas) {
  if (quantas > 40) return 3;
  if (quantas > 18) return 2;
  if (quantas > 6) return 1;
  return 0;
}

function renderCenter() {
  $('deck-count').textContent = view.deckCount;
  $('deck-pile').dataset.camadas = camadasDaPilha(view.deckCount);
  $('discard-pile').dataset.camadas = camadasDaPilha(view.discardCount * 4);
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
    trancado ? 'trancado' : (minha ? 'sua' : 'meio');
  // o leitor de tela lia só "55" e "meio": os dois montes ganham nome de verdade
  $('deck-pile').setAttribute('aria-label', `Puxar do monte, ${view.deckCount} cartas`);
  $('discard-pile').setAttribute('aria-label', !view.discardTop ? 'Meio vazio'
    : `Carta do meio: ${cardText(view.discardTop)}${trancado ? ', trancada' : ''}`);

  // Compra fora da vez — coringa no topo não é comprável por ninguém
  const claimable = view.phase === 'draw' && !myTurn() && view.discardFresh && view.discardBuyable
    && view.phase !== 'roundEnd' && view.you;
  const claimed = view.claims.includes(me());
  $('btn-claim').hidden = !claimable;
  if (claimable) {
    $('btn-claim').classList.toggle('claimed', claimed);
    // o carrinho é desenhado (index.html, #i-carrinho), não emoji
    $('btn-claim').innerHTML = claimed ? '' : '<svg class="ico" aria-hidden="true"><use href="#i-carrinho"/></svg>';
    $('btn-claim').append(claimed
      ? '✓ Pedido feito — quem está na vez tem preferência'
      : `Quero o ${cardText(view.discardTop)}!`);
  }

  atualizaBanner();
}

// A LINHA DA VEZ, e também a linha dos acontecimentos. Os avisos de jogada
// ("fulano pegou do meio", "baixou o jogo") eram pop-ups no meio do feltro:
// a 34% da altura, que no celular é exatamente a faixa das pilhas — com dois
// empilhados, tapavam o monte e o descarte ("os pop-up dificultam a visão",
// usuário, 15/09/2026). Aqui eles passam pela linha do banner, que já tem o
// lugar dela reservado abaixo das pilhas: nada novo cobre nada. Cada aviso
// fica 2,2 s e o próximo espera o seu; a fila guarda só os três últimos.
const filaDeEventos = [];
let eventoNoBanner = null;
// O RELÓGIO DA VEZ do Caçamba (11/11/2026): opcional, ligado pelo anfitrião no
// lobby. A visão traz `restaMs` (o que faltava quando o servidor mandou); daqui
// em diante é só descontar o tempo desde que ela chegou.
let viewChegouEm = 0;
function segundosDaVez() {
  if (!view || !(view.vezMs > 0) || typeof view.restaMs !== 'number') return null;
  return Math.max(0, Math.ceil((view.restaMs - (performance.now() - viewChegouEm)) / 1000));
}
setInterval(() => { if (!eventoNoBanner && segundosDaVez() != null) atualizaBanner(); }, 500);
function atualizaBanner() {
  const banner = $('turn-banner');
  if (!banner || !view) return;
  if (eventoNoBanner) {
    banner.textContent = eventoNoBanner;
    banner.className = 'turn-banner evento';
    return;
  }
  if (ehPresidente() || ehDomino() || ehBazuca() || ehPoker() || ehPuxadinho() || ehMexe() || ehCanastra()) {
    const t = (ehCanastra() ? mesaCanastra : ehMexe() ? mesaMexe : ehPuxadinho() ? mesaPuxadinho : ehPoker() ? mesaPoker : ehBazuca() ? mesaBazuca : ehDomino() ? mesaDomino : mesaPresidente).textoDaVez();
    banner.textContent = t.texto;
    banner.className = `turn-banner${t.minha ? ' me' : ''}`;
    return;
  }
  if (view.phase === 'draw' || view.phase === 'play') {
    // o relógio da vez, quando a sala tem (o anfitrião liga no lobby)
    const s = segundosDaVez();
    const relogio = s == null ? '' : ` · ${s} s`;
    if (myTurn()) {
      banner.textContent = (dicaDaVez() || (view.phase === 'draw' ? 'Sua vez! Puxe do monte ou pegue do meio.' : 'Baixe, encaixe ou descarte uma carta.')) + relogio;
      banner.className = `turn-banner me${s != null && s <= 10 ? ' pouco-tempo' : ''}`;
    } else {
      banner.textContent = `Vez de ${playerName(view.turnId)}…${relogio}`;
      banner.className = 'turn-banner';
    }
  } else {
    banner.textContent = '';
    banner.className = 'turn-banner';
  }
}
// DICAS DA PRIMEIRA PARTIDA. As regras são da casa, e quem chega novo só tinha
// a janela do "?". Nas duas primeiras partidas deste aparelho a faixa da vez
// diz o que FAZER agora, olhando a mão de verdade — depois volta ao normal.
function dicaDaVez() {
  let jogadas = 0; try { jogadas = Number(localStorage.getItem('cacamba-partidas') || 0); } catch { /* modo privado */ }
  if (jogadas >= 2 || !view?.you) return null;
  if (view.phase === 'draw') return 'Sua vez! Toque no MONTE para puxar — ou na carta do meio, se ela te serve.';
  const eu = view.you;
  if (!eu.baixou && eu.remaining && planBaixada(eu.hand, eu.remaining)) return 'Você tem jogo pronto! Toque em “Baixar”.';
  if (selected.size === 1) return 'Agora toque em “Descartar” — ou num jogo da mesa onde a carta encaixe.';
  if (eu.baixou) return 'Contrato na mesa! Encaixe o que der nos jogos e descarte para passar a vez.';
  return 'Toque numa carta da sua mão para escolher, e depois em “Descartar”.';
}
function proximoEventoNoBanner() {
  eventoNoBanner = filaDeEventos.shift() || null;
  atualizaBanner();
  if (eventoNoBanner) setTimeout(proximoEventoNoBanner, 2200);
}

function emptyCard() {
  const el = document.createElement('div');
  el.className = 'card empty';
  return el;
}

// Carta mini (ou jogo inteiro) que virou alvo de toque: o teclado tem de
// chegar nela como chega nas cartas da mão — Tab, e Enter ou Espaço aciona.
// O rótulo diz o que o toque FAZ, não só que carta é.
function acionavel(el, rotulo) {
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  if (rotulo) el.setAttribute('aria-label', rotulo);
  el.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation(); // a carta dentro do jogo não aciona o jogo também
    el.click();
  };
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
      acionavel(ce, `Trocar o coringa deste jogo`);
      ce.onclick = (e) => {
        e.stopPropagation();
        abrirTrocaCoringa(meld.id);
      };
    }
  }

  if (meldDiscardMode) {
    // De qualquer jogo, seu ou de adversário — regra da casa de 2026-08-28.
    const rem = removableCards(meld).map((c) => c.id);
    for (const ce of el.children) {
      if (rem.includes(Number(ce.dataset.cardId))) {
        ce.classList.add('removable');
        acionavel(ce, `Descartar ${cartaFalada(meld.cards.find((c) => c.id === Number(ce.dataset.cardId)))} deste jogo`);
        ce.onclick = () => {
          meldDiscardMode = false;
          sendAction({ a: 'meldDiscard', meldId: meld.id, cardId: Number(ce.dataset.cardId) });
        };
      }
    }
    return;
  }

  // A carta que sobra neste jogo vira alvo de toque, e o que o toque faz
  // depende do que está escolhido na mão:
  //   - com cartas escolhidas que fecham um jogo junto com ela: desce na hora;
  //   - sem nada escolhido: ela VEM PARA A MÃO (regra da casa de 2026-08-28 —
  //     antes só saía da mesa se fosse para baixar no mesmo gesto).
  if (selected.size > 0) {
    for (const sobra of removableCards(meld)) {
      if (!sobraAcende(sobra)) continue;
      const ce = [...el.children].find((x) => Number(x.dataset.cardId) === sobra.id);
      if (!ce) continue;
      ce.classList.add('puxavel');
      ce.title = `Baixar com ${cardText(sobra)}`;
      acionavel(ce, `Baixar com ${cartaFalada(sobra)}`);
      ce.onclick = (e) => {
        e.stopPropagation();
        sendAction({ a: 'baixar', cardIds: [...selected], sobra: { meldId: meld.id, cardId: sobra.id } });
        selected.clear();
      };
    }
  } else if (myTurn() && view.phase === 'play') {
    for (const sobra of removableCards(meld)) {
      const ce = [...el.children].find((x) => Number(x.dataset.cardId) === sobra.id);
      if (!ce) continue;
      ce.classList.add('puxavel', 'para-mao');
      ce.title = `Trazer ${cardText(sobra)} para a mão`;
      acionavel(ce, `Trazer ${cartaFalada(sobra)} para a mão`);
      ce.onclick = (e) => {
        e.stopPropagation();
        sendAction({ a: 'tomarSobra', meldId: meld.id, cardId: sobra.id });
      };
    }
  }

  // Coringa escolhido na mão: ele pode ocupar o lugar de QUALQUER carta de uma
  // sequência já baixada — não só das pontas — e a carta sai para a mão. Quem
  // escolhe qual é o toque na carta; o toque no jogo inteiro continua sendo o
  // encaixe pela ponta.
  if (selected.size === 1) {
    const escolhida = view.you.hand.find((c) => c.id === [...selected][0]);
    if (escolhida && isJoker(escolhida) && meld.type === 's' && !meld.cards.some(isJoker)) {
      for (const ce of el.children) {
        const alvo = meld.cards.find((x) => x.id === Number(ce.dataset.cardId));
        if (!alvo || isJoker(alvo)) continue;
        ce.classList.add('puxavel');
        ce.title = `Trocar ${cardText(alvo)} pelo seu coringa`;
        acionavel(ce, `Trocar ${cartaFalada(alvo)} pelo seu coringa`);
        ce.onclick = (e) => {
          e.stopPropagation();
          sendAction({ a: 'trocarPorCoringa', meldId: meld.id, cardId: alvo.id, coringaId: escolhida.id });
          selected.clear();
        };
      }
    }
  }

  // Encaixar não exige mais ter baixado o contrato.
  if (selected.size === 1) {
    const card = view.you.hand.find((c) => c.id === [...selected][0]);
    if (card && layoffOption(card, meld)) {
      el.classList.add('droppable');
      acionavel(el, `Encaixar ${cartaFalada(card)} neste jogo`);
      el.onclick = () => {
        // Coringa entra nas duas pontas (e um Ás pode servir nas duas também):
        // quando as duas valem, quem escolhe é o jogador.
        const ends = layoffEnds(card, meld);
        if (ends.length > 1) return escolherPonta(card, meld, ends);
        encaixa(card, meld, null);
      };
    }
    // TROCA NA TRINCA (regra da casa, 16/09/2026): a carta escolhida, do mesmo
    // valor, entra no lugar de uma carta da trinca, que vem para a mão. Cada
    // carta que pode sair vira alvo de toque — mesmo quando a escolhida também
    // encaixaria como quarta: o toque no jogo encaixa, o toque na carta troca.
    if (card) {
      for (const sai of trocasNaTrinca(card, meld)) {
        const ce = [...el.children].find((x) => Number(x.dataset.cardId) === sai.id);
        if (!ce) continue;
        ce.classList.add('trocavel');
        ce.title = `Pôr ${cardText(card)} no lugar de ${cardText(sai)} e trazer ${cardText(sai)} para a mão`;
        acionavel(ce, `Pôr ${cartaFalada(card)} no lugar de ${cartaFalada(sai)} e trazer ${cartaFalada(sai)} para a mão`);
        ce.onclick = (e) => {
          e.stopPropagation();
          selected.clear();
          sendAction({ a: 'trocarNaTrinca', meldId: meld.id, cardId: card.id, saiId: sai.id });
        };
      }
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
     coringa da outra ponta passa a sobrar. Dá para trazer ele para a sua mão.</p>
     <p class="modal-hint">Ele vale 20 pontos na mão no fim da rodada: só compensa se você for usar.</p>`,
    [
      {
        label: 'Encaixar e pegar o coringa',
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

// Quem chegou na mão desde o último estado. Só as últimas ficam marcadas: a
// cada carta nova as anteriores deixam de ser novidade, senão a mão inteira
// acabaria levantada ao longo da rodada.
function marcaCartasNovas() {
  const agora = new Set((view.you?.hand || []).map((c) => c.id));
  if (maoAnterior) {
    const chegaram = [...agora].filter((id) => !maoAnterior.has(id));
    if (chegaram.length) {
      cartasNovas = new Set(chegaram);
    } else {
      for (const id of [...cartasNovas]) if (!agora.has(id)) cartasNovas.delete(id);
    }
  }
  maoAnterior = agora;
}

// O leque da sua mão. O passo entre as cartas é calculado, não fixo: a rodada
// 7 dá 12 cartas e um passo fixo estouraria a largura do celular; com poucas
// cartas, o mesmo passo deixaria o leque frouxo demais.
const CARTA_LARGURA = 66;
const CARTA_ALTURA = 92;
const PASSO_MAXIMO = 40;
const PASSO_MINIMO = 20;
const ABERTURA = 16;          // graus de ponta a ponta
// O giro empurra as pontas para FORA do que o layout mede. A carta da ponta
// gira ABERTURA/2 em torno de um pivô bem abaixo dela (`transform-origin:
// 50% 190%` — uns 110 px abaixo do centro), e o retângulo girado ainda fica
// mais largo que o reto. São ~20 px por lado que o passo não descontava: no
// papel o leque cabia, e na tela as pontas saíam pela borda — com 9 cartas já
// cortava, e a 7ª rodada dá 12.
const RAIO_DO_GIRO = CARTA_ALTURA * 1.9 - CARTA_ALTURA / 2;
const GIRO_DA_PONTA = (ABERTURA / 2) * Math.PI / 180;
const SOBRA_DO_GIRO = RAIO_DO_GIRO * Math.sin(GIRO_DA_PONTA)
  + (CARTA_LARGURA * Math.cos(GIRO_DA_PONTA) + CARTA_ALTURA * Math.sin(GIRO_DA_PONTA) - CARTA_LARGURA) / 2;
// Acima disto o leque vira dois. A rodada 7 dá 12 cartas, mas cada compra fora
// da vez soma carta de castigo — mão de 20 acontece, e num leque só ela vira
// uma parede de tiras de 13 px que ninguém lê nem acerta com o dedo.
const CARTAS_POR_FILEIRA = 13;

function renderHand() {
  const box = $('hand');
  box.innerHTML = '';
  const cartas = sortedHand();
  const planoMao = layoutMao2D(cartas.length, box.clientWidth || 355);
  const fileiras = planoMao.fileiras;
  const porFileira = planoMao.itensPorFila;

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
  // Folga VISUAL entre a ponta do leque e a borda da tela, por lado: 40 px
  // para as mãos aparecerem. Com mão grande a folga encolhe para 22: aí o
  // leque precisa da largura, e mão cheia cobrindo as próprias mãos é o que
  // acontece de verdade. O que o giro empurra para fora entra na conta uma
  // vez, aqui — é isso que faz a folga ser a da tela e não a do papel.
  const { passo, carta } = layoutMao2D(n, largura || 355);
  const meio = (n - 1) / 2;

  cartas.forEach((card, i) => {
    const el = cardEl(card);
    el.dataset.cardId = card.id;
    el.style.setProperty('--passo', `${passo - carta}px`);
    el.style.setProperty('--giro', n > 1 ? `${(i - meio) * (8 / (n - 1))}deg` : '0deg');
    el.setAttribute('role','button'); el.tabIndex = 0;
    el.setAttribute('aria-label', cartaFalada(card));
    el.setAttribute('aria-pressed', String(selected.has(card.id)));
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    if (cartasNovas.has(card.id)) el.classList.add('nova');
    if (selected.has(card.id)) el.classList.add('sel');
    el.onclick = () => {
      // Se o dedo arrastou, o gesto foi de arrumar: não seleciona.
      if (el.dataset.arrastou === '1') { delete el.dataset.arrastou; return; }
      if (ehPoker()) return;   // no poker as duas cartas não se escolhem: a aposta é nos botões
      if (ehMexe()) { mesaMexe.tocaNaMao(card); return; }
      if (ehCanastra()) { mesaCanastra.tocaNaMao(card); return; }
      if (ehPresidente()) mesaPresidente.toca(card, selected);
      else if (selected.has(card.id)) selected.delete(card.id);
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
  cartasNovas.delete(id);
  if (destino !== null) poeNaPosicao(id, destino);
  render();
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
  // Queimar: só para quem abriu a rodada, na primeira jogada, e só a carta que
  // acabou de vir do monte — quem responde é o motor.
  $('btn-queimar').hidden = !(view.you?.podeQueimar && !meldDiscardMode);
  $('btn-baixar').hidden = !(playing && !meldDiscardMode);
  $('btn-baixar').textContent = contratoCumprido() ? 'Baixar jogo extra' : 'Baixar jogo';
  $('btn-baixar').classList.toggle('soft-disabled', playable === null);

  $('btn-discard').hidden = !(playing && !meldDiscardMode);
  $('btn-discard').disabled = selected.size !== 1;

  const mine = view.players.find((p) => p.id === me());
  // Qualquer jogo da mesa com sobra, não só os meus (regra da casa de 2026-08-28).
  const hasOversized = (view.players || []).some((p) => (p.melds || []).some((m) => removableCards(m).length > 0));
  $('btn-meld-discard').hidden = !(playing && hasOversized && !meldDiscardMode);
  $('btn-cancel-mode').hidden = !meldDiscardMode;
}

// Ações dos botões da mesa
$('deck-pile').onclick = () => { if (myTurn() && view.phase === 'draw') sendAction({ a: 'draw', source: 'deck' }); };
$('discard-pile').onclick = () => {
  if (!myTurn() || view.phase !== 'draw' || !view.discardTop) return;
  if (!view.discardBuyable) {
    toast(view.discardTop.by === me()
      ? 'Essa carta foi você que descartou: ela não volta para a sua mão.'
      : 'Coringa descoberto: o meio está travado até alguém descartar por cima.');
    return;
  }
  sendAction({ a: 'draw', source: 'discard' });
};
$('btn-draw-deck').onclick = () => sendAction({ a: 'draw', source: 'deck' });
$('btn-queimar').onclick = () => sendAction({ a: 'queimar' });
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
montaEmotes({ botao: $('btn-emote'), envia: (k) => { sendMsg({ t: 'emote', k }); mostraEmote(me(), k); } });
montaEmotes({ botao: $('btn-emote-lobby'), envia: (k) => { sendMsg({ t: 'emote', k }); mostraEmote(me(), k); } });
$('btn-sort').onclick = () => {
  if (ehPresidente()) { ordemPresidente = ordemPresidente === 'suit' ? 'forca' : 'suit'; ordemManual = []; render(); return; }
  sortMode = sortMode === 'suit' ? 'rank' : 'suit';
  ordemManual = [];   // pediu ordenação automática: a arrumação à mão sai de cena
  try { localStorage.setItem('cacamba-sort', sortMode); } catch { /* ok */ }
  render();
};

$('btn-rules').onclick = () => (ehCanastra() ? mesaCanastra.regras() : ehMexe() ? mesaMexe.regras() : ehPuxadinho() ? mesaPuxadinho.regras() : ehPoker() ? mesaPoker.regras() : ehBazuca() ? mesaBazuca.regras() : ehDomino() ? mesaDomino.regras() : ehPresidente() ? mesaPresidente.regras() : showRules());
$('btn-score').onclick = () => (ehCanastra() ? mesaCanastra.placar() : ehMexe() ? mesaMexe.placar() : ehPuxadinho() ? mesaPuxadinho.placar() : ehPoker() ? mesaPoker.placar() : ehBazuca() ? mesaBazuca.placar() : ehDomino() ? mesaDomino.placar() : ehPresidente() ? mesaPresidente.placar() : showScore());
// A mesa em 3D é outra janela para a MESMA partida: entra com a sessão
// guardada e conversa com o mesmo servidor. A biblioteca dela (three.js) só é
// baixada quando se abre — a mesa normal continua leve.
$('btn-3d').onclick = () => { location.href = '3d.html'; };

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
  coringa: { texto: 'coringa!',  gesto: 'pula',   cara: 'feliz' },
  saiu:    { texto: 'fui',        gesto: 'murcha', cara: null },
  // Presidente
  presidente: { texto: 'sou o presidente!', gesto: 'pula', cara: 'feliz' },
  livre:      { texto: 'tô fora!',          gesto: 'pula', cara: 'feliz' },
  cu:         { texto: 'ah, não…',          gesto: 'murcha', cara: 'bravo' },
  // Dominó
  ponto:      { texto: 'na conta!',         gesto: 'pula', cara: 'feliz' },
  passo:      { texto: 'passo…',            gesto: 'murcha', cara: null },
  trancou:    { texto: 'tranquei…',         gesto: 'murcha', cara: 'bravo' },
  // Mexe-Mexe
  mexeu:      { texto: 'mexi na mesa!',     gesto: 'pula', cara: 'feliz' },
  // Canastra
  canastra:   { texto: 'canastra!',         gesto: 'pula', cara: 'feliz' },
  lixo:       { texto: 'levei o lixo!',     gesto: 'pula', cara: 'feliz' },
  morto:      { texto: 'peguei o morto!',   gesto: 'pula', cara: 'feliz' },
};

// EMOTES e frases prontas (17/09/2026): o mesmo balão das reações, maior e
// por mais tempo, em cima de quem mandou. Vale com movimento reduzido — é
// conversa, não enfeite: aí o balão aparece parado e some no tempo.
function mostraEmote(playerId, k) {
  const e = emoteDe(k);
  if (!e) return;
  // na sala de espera o balão sai ao lado do nome de quem falou
  if (!$('screen-lobby').hidden) {
    const li = [...document.querySelectorAll('#lobby-players li, #lobby-duplas .lobby-cadeira')].find((x) => x.dataset.playerId === playerId);
    if (li) {
      let b = li.querySelector('.balao-lobby');
      if (!b) { b = document.createElement('span'); b.className = 'balao-lobby'; li.appendChild(b); }
      b.textContent = textoDoEmote(e); b.hidden = false;
      clearTimeout(Number(b.dataset.some)); b.dataset.some = String(setTimeout(() => { b.hidden = true; }, 3000));
    }
    return;
  }
  const el = playerId === me() ? $('meu-assento') : assentos.get(playerId);
  if (!el) { toast(`${playerName(playerId)}: ${textoDoEmote(e)}`); return; }
  let balao = el.querySelector('.balao');
  if (!balao) {
    balao = document.createElement('span');
    balao.className = 'balao';
    el.appendChild(balao);
  }
  balao.textContent = textoDoEmote(e);
  balao.classList.add('emote');
  repete(balao, 'fala');
  clearTimeout(Number(balao.dataset.some));
  balao.dataset.some = String(setTimeout(() => balao.classList.remove('emote', 'fala'), 3000));
  if (e.humor && !semMovimento()) {
    repete(el, e.humor === 'feliz' ? 'pula' : 'treme');
    trocaCara(el, playerId, e.humor);
  }
}

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

// O anúncio da rodada: o contrato muda a cada uma e é o que decide a mão
// inteira. Antes o placar fechava e a rodada seguinte começava seca — dava
// para passar três turnos sem notar que o contrato tinha mudado.
function anunciaRodada(round) {
  const el = $('anuncio-rodada');
  const ct = CONTRATOS[round];
  if (!el || !ct) return;
  el.innerHTML = `<span class="rodada">Rodada ${round + 1} de ${TOTAL_ROUNDS}</span>
    <strong>${ct.label}</strong>
    <span class="cartas">${6 + round} cartas</span>`;
  el.hidden = false;
  if (semMovimento()) {
    setTimeout(() => { el.hidden = true; }, 2200);
    return;
  }
  repete(el, 'entra');
  setTimeout(() => { el.hidden = true; el.classList.remove('entra'); }, 2400);
}

// ---------------- Avisos de eventos ----------------

let lastTurnWasMine = false;

function announce(ev) {
  if (ehPresidente() && ev.e !== 'desistiu' && ev.e !== 'away') { mesaPresidente.anuncia(ev); return; }
  if (ehDomino() && ev.e !== 'desistiu' && ev.e !== 'away') { mesaDomino.anuncia(ev); return; }
  if (ehBazuca() && ev.e !== 'desistiu' && ev.e !== 'away') { mesaBazuca.anuncia(ev); return; }
  if (ehPoker() && ev.e !== 'desistiu' && ev.e !== 'away') { mesaPoker.anuncia(ev); return; }
  if (ehPuxadinho() && ev.e !== 'desistiu' && ev.e !== 'away') { mesaPuxadinho.anuncia(ev); return; }
  if (ehMexe() && ev.e !== 'desistiu' && ev.e !== 'away') { mesaMexe.anuncia(ev); return; }
  if (ehCanastra() && ev.e !== 'desistiu' && ev.e !== 'away') { mesaCanastra.anuncia(ev); return; }
  switch (ev.e) {
    case 'roundStart':
      distribuirPendente = true;
      // O anúncio já diz a rodada e o contrato; o aviso fica só com o que ele
      // não diz — de quem é a primeira vez.
      anunciaRodada(ev.round);
      toast(`${playerName(ev.first)} começa.`);
      meldDiscardMode = false;
      // Os ids das cartas recomeçam a cada rodada: seleção antiga poderia
      // "grudar" numa carta nova por coincidência de id e armar um descarte
      // que o jogador nunca escolheu.
      selected.clear();
      ordemManual = [];
      cartasNovas.clear();
      maoAnterior = null;   // a mão inteira é nova no começo da rodada: não marca nada
      break;
    case 'draw':
      if (ev.source === 'discard') {
        toast(`${playerName(ev.p)} pegou ${cardText(ev.card)} do meio.`);
        reage(ev.p, 'levou');
      }
      break;
    case 'claim':
      if (ev.p !== me()) toast(`${playerName(ev.p)} quer a carta do meio.`);
      reage(ev.p, 'pediu');
      break;
    case 'claimVoid':
      if (ev.losers.includes(me())) toast(`${playerName(ev.by)} estava na vez e ficou com ${cardText(ev.card)}.`);
      for (const perdedor of ev.losers || []) reage(perdedor, 'perdeu');
      break;
    case 'buy':
      toast(`${playerName(ev.p)} pediu primeiro e levou ${cardText(ev.card)}.`);
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
        toast(`${nome} baixou ${extras.join(' e ')} a mais.`);
      } else if (ev.completa) {
        toast(`${nome} baixou o jogo!${extras.length ? ` E ${extras.join(' e ')} a mais.` : ''}`);
      } else if (pedacos.length || extras.length) {
        const tudo = [...pedacos, ...(extras.length ? [`${extras.join(' e ')} a mais`] : [])];
        toast(`${nome} baixou ${tudo.join(' e ')}.`);
      } else {
        toast(`${nome} baixou o jogo!`);
      }
      if (ev.daMesa) {
        toast(`${playerName(ev.p)} puxou ${cardText(ev.daMesa)} que sobrava ${ev.deQuem === me() ? 'de um jogo seu' : 'da mesa'} e baixou com ela.`);
      }
      reage(ev.p, 'baixou');
      break;
    }
    case 'layoff':
      if (ev.p !== me()) toast(`${playerName(ev.p)} encaixou ${cardText(ev.card)}${ev.coringaMudouDePonta ? ' — e o coringa mudou de ponta' : ''}.`);
      else if (ev.coringaMudouDePonta) toast('O coringa mudou de ponta para a sua carta caber.');
      break;
    case 'pegouCoringa':
      toast(`${playerName(ev.p)} esticou a sequência e levou o coringa que sobrou.`);
      reage(ev.p, 'coringa');
      break;
    case 'meldDiscard': {
      const dono = ev.deQuem === me() ? 'de um jogo SEU' : (ev.deQuem === ev.p ? 'de um jogo próprio' : `de um jogo de ${playerName(ev.deQuem)}`);
      toast(`${playerName(ev.p)} descartou ${cardText(ev.card)} ${dono}.`);
      if (ev.deQuem === me() && ev.p !== me()) reage(me(), 'perdeu');
      break;
    }
    case 'trocouNaTrinca': {
      const dono = ev.deQuem === me() ? 'numa trinca SUA' : (ev.deQuem === ev.p ? 'na própria trinca' : `numa trinca de ${playerName(ev.deQuem)}`);
      toast(`${playerName(ev.p)} pôs ${cardText(ev.entra)} no lugar de ${cardText(ev.sai)} ${dono} e levou ${cardText(ev.sai)} para a mão.`);
      break;
    }
    case 'tomouSobra': {
      const dono = ev.deQuem === me() ? 'de um jogo SEU' : (ev.deQuem === ev.p ? 'de um jogo próprio' : `de um jogo de ${playerName(ev.deQuem)}`);
      toast(`${playerName(ev.p)} levou ${cardText(ev.card)} ${dono} para a mão.`);
      if (ev.deQuem === me() && ev.p !== me()) reage(me(), 'perdeu');
      break;
    }
    case 'swapJoker':
      toast(`${playerName(ev.p)} pôs ${cardText(ev.card)} no lugar do coringa.`);
      reage(ev.p, 'coringa');
      break;
    case 'desistiu':
      voz.remover(ev.p);
      toast(`${playerName(ev.p)} saiu da partida — o robô assume o lugar.`);
      reage(ev.p, 'saiu');
      break;
    case 'away':
      toast(`${playerName(ev.p)} caiu — o jogo joga por ${ev.p === me() ? 'você' : 'ele'} até voltar.`);
      break;
    case 'tempo':
      toast(ev.p === me() ? 'Seu tempo acabou: o jogo puxou e descartou por você.' : `O tempo de ${playerName(ev.p)} acabou: o jogo jogou a vez.`);
      break;
    case 'reshuffle':
      toast('O monte acabou — o meio foi embaralhado de volta.');
      break;
    case 'roundEnd':
      if (ev.reason === 'bateu') { toast(`${playerName(ev.winnerId)} bateu!`); reage(ev.winnerId, 'bateu'); }
      else toast('O monte esgotou — a rodada terminou sem vencedor.');
      break;
  }
}

function toast(text) {
  // Na mesa, o aviso vai para a linha da vez (veja `atualizaBanner`); o
  // pop-up fica só para onde não há banner — saguão, placar, avisos de sistema.
  const naMesa = view && (['draw', 'play', 'troca'].includes(view.phase) || (ehPuxadinho() && view.phase !== 'gameEnd'))
    && $('screen-game') && !$('screen-game').hidden;
  if (naMesa && $('turn-banner')) {
    filaDeEventos.push(text);
    while (filaDeEventos.length > 3) filaDeEventos.shift();
    if (!eventoNoBanner) proximoEventoNoBanner();
    return;
  }
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
  const mine = myTurn() && ['draw', 'play', 'troca'].includes(view.phase);
  if (mine && !lastTurnWasMine) {
    // Só depois de um toque de verdade: antes disso o Chrome recusa e registra
    // um erro no console a cada chamada (77 numa partida dirigida por script).
    try { if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(80); } catch { /* ok */ }
    document.title = 'Sua vez! — Caçamba';
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
  const fundo = $('modal-backdrop');
  // Quem abriu guarda o foco para recebê-lo de volta; um modal que troca de
  // conteúdo aberto (placar sobre placar) não esquece quem o abriu.
  if (fundo.hidden) focoAntesDoModal = document.activeElement;
  modalAoFechar = onclose;
  const titulo = $('modal-body').querySelector('h1, h2, h3');
  if (titulo) { titulo.id = 'modal-titulo'; $('modal').setAttribute('aria-labelledby', 'modal-titulo'); }
  else $('modal').removeAttribute('aria-labelledby');
  fundo.hidden = false;
  fundo.onclick = (e) => {
    if (e.target === fundo && modalAoFechar) modalAoFechar();
  };
  // O foco entra no primeiro controle — menos no de perigo ("Sair da
  // partida"), para um Enter distraído não confirmar o que não se quis. Sem
  // rolar: num texto longo (as regras) o "Fechar" fica no fim, e a leitura
  // começa do começo.
  const controles = focaveisDoModal();
  (controles.find((c) => !c.classList.contains('btn-danger')) || controles[0] || $('modal')).focus({ preventScroll: true });
}
function closeModal() {
  const fundo = $('modal-backdrop');
  if (fundo.hidden) return;
  fundo.hidden = true;
  modalAoFechar = null;
  const volta = focoAntesDoModal;
  focoAntesDoModal = null;
  if (volta?.isConnected && !volta.disabled) volta.focus();
}

let modalAoFechar = null;
let focoAntesDoModal = null;
function focaveisDoModal() {
  return [...$('modal').querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((c) => !c.disabled && !c.hidden && c.getClientRects().length);
}
// Esc fecha (quando o modal se deixa fechar pelo fundo) e o Tab dá a volta
// dentro dele: com o modal aberto, a mesa por trás não é lugar para o foco.
document.addEventListener('keydown', (e) => {
  if ($('modal-backdrop').hidden) return;
  if (e.key === 'Escape') {
    if (modalAoFechar) { e.preventDefault(); modalAoFechar(); }
    return;
  }
  if (e.key !== 'Tab') return;
  const controles = focaveisDoModal();
  if (!controles.length) { e.preventDefault(); $('modal').focus(); return; }
  const primeiro = controles[0], ultimo = controles[controles.length - 1];
  const dentro = $('modal').contains(document.activeElement);
  if (e.shiftKey && (!dentro || document.activeElement === primeiro || document.activeElement === $('modal'))) {
    e.preventDefault(); ultimo.focus();
  } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
    e.preventDefault(); primeiro.focus();
  }
});

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
    // uma partida inteira jogada: as dicas da primeira partida contam até duas
    try { localStorage.setItem('cacamba-partidas', String(Number(localStorage.getItem('cacamba-partidas') || 0) + 1)); } catch { /* modo privado */ }
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

// Cada linha do placar leva o rosto e a cor do assento: com o elenco na mesa,
// ler "Robô Téo" e procurar quem era custa mais do que reconhecer a cara.
function linhaDoPlacar(p, pts, total, venceu) {
  const cor = CORES_DE_ASSENTO[assentoDe(p.id, view.players) % CORES_DE_ASSENTO.length];
  return `<tr class="${venceu ? 'winner' : ''}">
    <td><span class="quem">
      <img class="avatar" src="${caraDe(personagemDe(p.id, view.players))}" alt="" width="26" height="26" style="--anel:${cor}">
      <span>${escapeHTML(playerName(p.id))}</span>
    </span></td>
    <td class="num">${pts === null ? '' : `+${pts}`}</td>
    <td class="num">${total}</td>
  </tr>`;
}

function showRoundEnd() {
  const lr = view.lastRound;
  const rows = view.players
    .map((p) => linhaDoPlacar(p, lr.scores[p.id], p.score, lr.winnerId === p.id))
    .join('');
  const venceu = lr.winnerId ? view.players.find((p) => p.id === lr.winnerId) : null;
  const title = venceu
    ? `${escapeHTML(playerName(venceu.id))} bateu!`
    : 'Monte esgotado — ninguém bateu';
  const last = view.round + 1 >= view.totalRounds;
  const actions = isHost()
    ? [{ label: last ? 'Ver resultado final' : 'Próxima rodada', cls: 'btn-primary', fn: () => sendMsg({ t: 'nextRound' }) }]
    : [];
  // Quem bateu aparece de corpo inteiro, com a cara de quem bateu.
  const retrato = venceu
    ? `<div class="palco-vencedor"><img src="${figuraFeliz(venceu.id)}" alt=""></div>`
    : '';
  showModal(
    `${retrato}
     <h2>${title}</h2>
     <p>Rodada ${view.round + 1} de ${view.totalRounds} · ${view.contract.label}</p>
     <table class="score-table">
       <tr><th>Jogador</th><th style="text-align:right">Rodada</th><th style="text-align:right">Total</th></tr>
       ${rows}
     </table>
     ${isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião continuar…</p>'}`,
    actions,
  );
}

// A figura de quem bateu, com a cara feliz se o elenco tiver essa expressão.
function figuraFeliz(playerId) {
  const slug = personagemDe(playerId, view.players);
  return temExpressao(slug, 'feliz')
    ? `/assets/personagens/${slug}-corpo-inteiro-feliz.svg`
    : figuraDe(slug);
}

function showGameEnd() {
  const rows = view.ranking.map((r, i) => {
    const cor = CORES_DE_ASSENTO[assentoDe(r.id, view.players) % CORES_DE_ASSENTO.length];
    return `<tr class="${i === 0 ? 'winner' : ''}"><td><span class="quem">
      <img class="avatar" src="${caraDe(personagemDe(r.id, view.players))}" alt="" width="26" height="26" style="--anel:${cor}">
      <span>${i + 1}º ${escapeHTML(r.id === me() ? 'Você' : r.name)}</span>
    </span></td><td class="num">${r.score}</td></tr>`;
  }).join('');
  const campeao = view.ranking[0];
  const actions = isHost()
    ? [{ label: 'Jogar de novo', cls: 'btn-primary', fn: () => sendMsg({ t: 'playAgain' }) }]
    : [];
  actions.push({ label: 'Sair da sala', cls: 'btn-ghost', fn: () => { saveSession(null); location.reload(); } });
  showModal(
    `<div class="palco-vencedor grande"><img src="${figuraFeliz(campeao.id)}" alt=""></div>
     <h2>Fim de jogo!</h2>
     <p>Menos pontos ganha — cartas na mão contam contra você.</p>
     <table class="score-table">
       <tr><th>Jogador</th><th style="text-align:right">Pontos</th></tr>
       ${rows}
     </table>`,
    actions,
  );
}

function showScore() {
  // Era uma tabela de nomes e números. Numa partida de 7 rodadas o placar é a
  // tela que se abre entre uma e outra, e ela precisa responder três coisas de
  // relance: quem está ganhando, onde eu estou, e quanto falta. Nome e total
  // sozinhos não respondem nenhuma das três.
  const ord = [...view.players].sort((a, b) => a.score - b.score);
  const lider = ord.length ? ord[0].score : 0;
  // A barra é relativa ao PIOR da mesa, não a um teto fixo: no começo todo
  // mundo tem zero e a régua tem de nascer junto com a partida. O mínimo de 1
  // evita a divisão por zero da primeira rodada.
  const pior = Math.max(1, ...ord.map((p) => p.score));
  // Na primeira rodada todo mundo está zerado: dizer que o primeiro da lista
  // está "na frente" seria mentira, e é justamente a hora em que o placar é
  // mais aberto.
  const empatadoNoTopo = ord.length > 1 && ord[1].score === lider;
  const linhas = ord.map((p, i) => {
    const atras = p.score - lider;
    const classes = ['pl-linha'];
    if (p.id === me()) classes.push('eu');
    // Só há líder se alguém estiver mesmo na frente: com a mesa toda zerada,
    // pintar o primeiro da lista de âmbar seria inventar uma liderança que a
    // ordenação criou sozinha.
    if (i === 0 && !empatadoNoTopo) classes.push('lider');
    return `<li class="${classes.join(' ')}" style="--enche: ${Math.round((p.score / pior) * 100)}%">
      <span class="pl-pos">${i + 1}</span>
      <img class="pl-cara" src="${caraDe(personagemDe(p.id, view.players))}" alt="" loading="lazy">
      <span class="pl-quem">
        <b>${escapeHTML(playerName(p.id))}</b>
        <small>${atras > 0 ? `+${atras} atrás` : (empatadoNoTopo ? 'empatado' : 'na frente')}</small>
      </span>
      <span class="pl-pts">${p.score}</span>
    </li>`;
  }).join('');
  showModal(
    `<h2>Placar</h2>
     <p class="modal-hint">Menos pontos ganha. Cada carta vale o número dela · J = 11 · Q = 12 · K = 13 · Ás = 15 · coringa = 20.</p>
     <ol class="placar">${linhas}</ol>`,
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
       <li><strong>Quarta carta na trinca:</strong> só de um <strong>naipe que já está nela</strong>. Numa trinca de ♠ ♥ ♣ entra outro ♠, ♥ ou ♣ — nunca o ♦.</li>
       <li><strong>Troca na trinca:</strong> uma carta da mão do <strong>mesmo valor</strong> pode entrar <strong>no lugar</strong> de uma carta da trinca, que vem para a sua mão — sem passar a vez, e em trinca de qualquer jogador. A trinca tem de continuar com 3 naipes diferentes. É assim que o 5♦ entra numa trinca de ♠ ♥ ♣: no lugar do 5♠, que sai para você usar em outro jogo. Escolha a carta na mão e toque na carta da trinca marcada em azul.</li>
     </ul>
     <h3>Coringa</h3>
     <ul>
       <li>Vale <strong>só em sequência</strong> (nunca em trinca), no máximo <strong>1 por sequência</strong>.</li>
       <li>Nas rodadas só de trincas (1ª e 4ª) ele <strong>fica fora do baralho</strong>.</li>
       <li>Na sua vez, quem tem a <strong>carta exata</strong> que o coringa representa pode trocá-lo em qualquer sequência da mesa: a carta entra no lugar e o coringa <strong>vem para a mão</strong>.</li>
       <li>O coringa da mão também pode entrar <strong>no lugar de qualquer carta</strong> de uma sequência já baixada: a carta sai para a sua mão e a sequência não muda.</li>
       <li>Coringa <strong>na ponta muda de ponta</strong>: em coringa‑8‑9‑10 o coringa vale 7, mas se você tem o Q ele passa para o outro lado (8‑9‑10‑coringa) e o Q encaixa. Só acontece quando a sua carta não cabe de outro jeito.</li>
       <li>Coringa descartado <strong>tranca o meio</strong>: ninguém compra do descarte até alguém descartar por cima.</li>
       <li>Na mão ao fim da rodada, custa <strong>20 pontos</strong>.</li>
     </ul>
     <h3>Na sua vez</h3>
     <ol>
       <li><strong>Puxe uma carta</strong> (obrigatório): do monte ou do meio (descarte).</li>
       <li><strong>Baixe seus jogos</strong> — pode ser <strong>um de cada vez</strong>: qualquer trinca ou sequência completa que o contrato ainda peça já pode descer (na 1ª rodada, uma trinca sozinha desce). <strong>Encaixar</strong> cartas nos jogos da mesa (seus e dos outros) vale a qualquer momento. E nunca baixe ou encaixe a ponto de ficar com menos de duas cartas sem completar o contrato — só bate quem já o cumpriu.</li>
       <li><strong>Carta que sobra na mesa</strong>: sequência com mais de 4 cartas (só as pontas, coringa incluído) ou trinca com mais de 3 (qualquer carta, desde que sobrem 3 naipes). Ela pode sair de <strong>qualquer jogo, seu ou de adversário</strong>, para três coisas: <strong>baixar</strong> um jogo seu com ela na hora, <strong>trazê-la para a mão</strong>, ou <strong>descartá-la</strong> direto.</li>
       <li><strong>Descarte uma carta</strong> (obrigatório): da mão, ou a que sobra num jogo da mesa.</li>
     </ol>
     <h3>Compra fora da vez</h3>
     <p>Quando alguém descarta, os outros jogadores podem pedir a carta: leva <strong>quem apertar primeiro</strong>, e ele fica só com a carta pedida (não puxa nem descarta). Mas <strong>quem está na vez tem preferência</strong> sobre todos — se ele também quiser a carta, ela é dele.</p>
     <p><strong>Quem descartou não pede de volta:</strong> a carta que saiu da sua mão não volta para ela, nem pela compra da vez nem pelo pedido. Numa mesa de dois isso quer dizer que a compra fora da vez não acontece — o único que não está na vez é justamente quem acabou de descartar.</p>
     <h3>Falar sem microfone</h3>
     <p>O botão do balão <svg class="ico" aria-hidden="true"><use href="#i-fala"/></svg> abre emotes e frases prontas (“Bora!”, “Demora demais…”, “Nojo!”). O balão aparece em cima de você para todo mundo da mesa. O do microfone liga o chat de voz.</p>
     <h3>Na mesa 3D</h3>
     <p><strong>Toque num jogador</strong> para virar e olhar para ele; toque de novo, ou no tampo, para voltar à mesa. <strong>Arraste o fundo</strong> e a cabeça segue o dedo. Os outros veem a sua cabeça virar. Toque num jogo do tampo para ver as cartas de perto e encaixar.</p>
     <h3>Se a conexão cair</h3>
     <p>O jogo guarda o seu lugar: abra de novo e você volta para a mesma mão. Se ficar fora mais de 45 segundos na sua vez, o jogo joga por você até voltar. A partida também <strong>sobrevive a uma atualização do jogo</strong> — e quando sai versão nova, aparece um aviso para atualizar na hora que você quiser.</p>
     <h3>Pontos</h3>
     <p>Cartas que sobram na mão contam pelo <strong>valor de face</strong>: o 5 vale 5, o 10 vale 10, e assim por diante. <strong>J = 11</strong> · <strong>Q = 12</strong> · <strong>K = 13</strong> · <strong>Ás = 15</strong> (mesmo tendo jogado como 1) · <strong>coringa = 20</strong>. Se o monte esgotar 3 vezes na mesma rodada, a rodada acaba sem vencedor e todos contam a mão.</p>`,
    [{ label: 'Fechar', fn: closeModal }],
    closeModal,
  );
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// O que a mesa do Presidente usa daqui: assentos, leque da mão, cartas,
// avisos e modais são os MESMOS do Caçamba — só a regra muda.
function contextoDaMesa() {
  return {
    $, me, isHost, sendAction, sendMsg, toast, showModal, closeModal, escapeHTML, playerName,
    cardEl, avatarEl, assentos, reage, repete, semMovimento, figuraFeliz, render,
    renderOpponents, renderHand, atualizaBanner,
    caraDoJogador: (id) => caraDe(personagemDe(id, view.players)),
    corDoJogador: (id) => CORES_DE_ASSENTO[assentoDe(id, view.players) % CORES_DE_ASSENTO.length],
    get view() { return view; },
    get selected() { return selected; },
    adversarios: ordemDosAdversarios,
    saiDaSala() { saveSession(null); location.reload(); },
    novaRodada() { selected.clear(); ordemManual = []; cartasNovas.clear(); maoAnterior = null; },
  };
}

// ---------------- Início ----------------

// Com sessão guardada a página abre na ESPERA, não na tela inicial: quem volta
// da mesa 3D (ou recarrega) via o formulário de início piscar até a partida
// chegar pela conexão — "jogado para a tela de início" (usuário, 08/10/2026).
// Se a partida não vier em 8 s, aí sim a tela inicial.
showScreen(session ? 'retomando' : telaInicial());
connect();
if (session) setTimeout(() => { if (!$('screen-retomando').hidden) showScreen(telaInicial()); }, 8000);

// interface-2026-09-07-r1
