// ============================================================================
// Caçamba — servidor: salas por código + juiz das regras (WebSocket)
// Rodar: npm start  →  celulares na mesma rede acessam http://IP-DO-PC:3000
// ============================================================================

import http from 'node:http';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import {
  createGame, startRound, applyAction, actNextRound, viewFor,
  botNextAction, botWantsCard, actClaim, DEFAULT_OPTS, conferirBaralho,
  podeComprarDoDescarte, topoDoDescarte,
} from './shared/engine.js';
import { personagemValido } from './shared/elenco.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
// Hospedagens injetam a porta e esperam que o processo escute em todas as
// interfaces. HOST permite restringir de novo (ex.: 127.0.0.1) se precisar.
const HOST = process.env.HOST || '0.0.0.0';

// ---------------------------------------------------------------------------
// Arquivos estáticos
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

// O que vale comprimir: texto. SVG é texto, e é o grosso do peso do jogo — as
// figuras do elenco somam centenas de KB de caminhos vetoriais, e gzip corta
// isso para perto de um quinto. PNG e WebP já vêm comprimidos: passar zlib
// neles gasta CPU e às vezes cresce.
const COMPRIMIVEL = new Set(['.html', '.js', '.css', '.svg', '.json']);

// Cache do comprimido em memória, chaveado por caminho + mtime: o mesmo
// arquivo é pedido por todos os jogadores da sala, e comprimir a cada pedido
// seria pagar o mesmo trabalho várias vezes. Invalida sozinho quando o arquivo
// muda no disco, então não atrapalha o desenvolvimento.
const cacheGzip = new Map();

// SVG sai dos geradores identado e comentado, para ser lido por gente. O
// navegador não precisa disso: comentários, espaço entre tags e a terceira
// casa decimal de cada coordenada são peso puro. Num quadro de 400 unidades
// exibido a 56 px, 0,01 unidade é 1/700 de pixel.
//
// A minificação é conservadora de propósito: NÃO mexe em espaço dentro de
// atributo (um `d="M 10 20"` sem espaço vira caminho inválido) nem em texto
// entre tags. É por isso que só se corta entre `>` e `<`.
function svgEnxuto(texto) {
  return texto
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/(\d+\.\d{3,})/g, (n) => String(Math.round(Number(n) * 100) / 100))
    .trim();
}

function corpoComprimido(full, stat, ext) {
  const chave = `${full}:${stat.mtimeMs}`;
  const guardado = cacheGzip.get(chave);
  if (guardado) return guardado;
  const cru = fs.readFileSync(full);
  const fonte = ext === '.svg' ? Buffer.from(svgEnxuto(cru.toString('utf8'))) : cru;
  const buf = zlib.gzipSync(fonte, { level: 9 });
  cacheGzip.set(chave, buf);
  if (cacheGzip.size > 200) cacheGzip.delete(cacheGzip.keys().next().value);
  return buf;
}

const STATIC_ROOTS = [path.join(__dirname, 'public'), __dirname];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  for (const root of STATIC_ROOTS) {
    const full = path.join(root, file);
    if (!full.startsWith(root)) continue;
    if (root === __dirname && !full.startsWith(path.join(__dirname, 'shared'))) continue;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      const ext = path.extname(full);
      const stat = fs.statSync(full);
      // ETag de tamanho + mtime. Sem ele, `no-cache` significava baixar tudo de
      // novo a cada abertura: o elenco sozinho são 32 SVGs e ~850 KB de disco.
      // Com ele, a segunda visita troca o corpo inteiro por um 304 vazio.
      const etag = `W/"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}"`;
      // A arte muda de deploy em deploy, não durante a partida: cinco minutos
      // sem nem perguntar. O código (html/js/css) continua em `no-cache`, para
      // um deploy aparecer na próxima abertura e não cinco minutos depois.
      //
      // `private` e não `public`: o Render tem CDN na frente, e com `public` ele
      // guardava a arte na borda — depois de um deploy, o CDN continuava
      // servindo o SVG antigo para TODO MUNDO por até cinco minutos (visto
      // acontecer: a Lyly nova já estava na origem e a borda entregava a
      // velha). Com `private`, quem guarda é o navegador de cada um: o ganho de
      // não repetir o download continua, e a janela de arte velha depois de um
      // deploy deixa de ser coletiva.
      const arte = file.startsWith('/assets/');
      const cabecalho = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': arte ? 'private, max-age=300, must-revalidate' : 'no-cache',
        ETag: etag,
        Vary: 'Accept-Encoding',
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, cabecalho);
        res.end();
        return;
      }
      const aceitaGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      if (aceitaGzip && COMPRIMIVEL.has(ext)) {
        const corpo = corpoComprimido(full, stat, ext);
        res.writeHead(200, { ...cabecalho, 'Content-Encoding': 'gzip', 'Content-Length': corpo.length });
        res.end(req.method === 'HEAD' ? undefined : corpo);
        return;
      }
      res.writeHead(200, cabecalho);
      fs.createReadStream(full).pipe(res);
      return;
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Não encontrado');
});

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------

const rooms = new Map(); // code → room
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O (confundem com 1 e 0)
// Oito nomes distintos: a mesa vai até 8 lugares, então nenhum robô repete
// nome com outro na mesma sala.
const BOT_NAMES = [
  'Robô Zé', 'Robô Lia', 'Robô Gui', 'Robô Nina',
  'Robô Téo', 'Robô Vera', 'Robô Bento', 'Robô Cacá',
];

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

const LAN_HOST = `http://${lanAddress()}:${PORT}`;

// De onde o jogador acessou a sala: é isso que vai no link de convite e no QR.
// Ordem: PUBLIC_URL (fixa, para deploy) → cabeçalhos da requisição (funciona
// atrás de túnel e de proxy reverso) → IP da rede local (uso caseiro).
// Cabeçalho é entrada do cliente: um criador malicioso poderia forjar o host e
// fazer o QR mostrado aos convidados apontar para um clone. Por isso:
// x-forwarded-* só vale atrás de proxy declarado (TRUST_PROXY=1), o host tem
// que ter cara de host, e ALLOWED_HOSTS (lista separada por vírgula) fecha de
// vez quando definida. Em produção, prefira simplesmente PUBLIC_URL.
function hostValido(h) {
  return typeof h === 'string' && h.length <= 260 && /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i.test(h);
}
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS || '')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

function originFrom(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const trustProxy = process.env.TRUST_PROXY === '1';
  const fwdHost = trustProxy ? String(req?.headers['x-forwarded-host'] || '').split(',')[0].trim() : '';
  const host = fwdHost || (req && req.headers.host);
  if (!hostValido(host)) return LAN_HOST;
  if (ALLOWED_HOSTS.length && !ALLOWED_HOSTS.includes(host.toLowerCase())) return LAN_HOST;
  // O esquema pode vir do proxy mesmo sem TRUST_PROXY. O risco que a flag
  // guarda é o HOST forjado, que mandaria o convite para outro domínio; o
  // esquema não muda de destino — no máximo erra entre http e https no mesmo
  // endereço, e é isso que acontecia no Render: site em https, convite e QR
  // saindo em http porque o TLS termina no proxy e `socket.encrypted` é falso.
  const fwdProto = String(req?.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = /^https?$/.test(fwdProto) ? fwdProto : (req.socket && req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${host}`;
}

function sanitizeName(name) {
  const clean = String(name || '').replace(/[<>\n\r\t]/g, '').trim().slice(0, 16);
  return clean || 'Jogador';
}

function newRoom(origin = LAN_HOST) {
  const room = {
    code: makeCode(),
    players: [], // { id, name, token, isBot, ws, connected, lastSeen }
    game: null,
    gameSeq: 0,     // sobe a cada partida nova: invalida chave de timer antiga
    botTimer: null,
    botTimerKey: null,
    qr: null,
    origin,
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  QRCode.toDataURL(`${room.origin}/?sala=${room.code}`, { margin: 1, width: 220 })
    .then((dataUrl) => { room.qr = dataUrl; broadcastLobby(room); })
    .catch(() => {});
  return room;
}

function hostOf(room) {
  const human = room.players.find((p) => !p.isBot && p.connected) || room.players.find((p) => !p.isBot);
  return human ? human.id : null;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// Personagem escolhido pelo jogador. Fora da lista vira `null`, e aí o rosto
// volta a sair do assento — nunca o texto cru do cliente, que acabaria virando
// caminho de arquivo na tela dos outros.
function personagemEscolhido(slug) {
  return personagemValido(slug) ? slug : null;
}

function lobbyView(room) {
  return {
    t: 'lobby',
    code: room.code,
    hostId: hostOf(room),
    joinUrl: `${room.origin}/?sala=${room.code}`,
    qr: room.qr,
    started: !!room.game,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot, connected: p.isBot || p.connected,
      avatar: p.avatar || null, desistiu: !!p.desistiu,
    })),
  };
}

function broadcastLobby(room) {
  for (const p of room.players) if (!p.isBot) send(p.ws, lobbyView(room));
}

// Presença é assunto da sala, não do motor — o engine não sabe de sockets, e
// por isso viewFor não devolve `connected`. Sem carimbar aqui, o cliente lia
// `undefined` e marcava TODO adversário humano como "fora" o tempo todo.
function comPresenca(room, view) {
  for (const vp of view.players) {
    const rp = room.players.find((x) => x.id === vp.id);
    vp.connected = rp ? (rp.isBot || rp.connected) : true;
    vp.avatar = rp ? (rp.avatar || null) : null;
    vp.desistiu = rp ? !!rp.desistiu : false;
  }
  return view;
}

function broadcastState(room, events = []) {
  if (!room.game) return;
  for (const p of room.players) {
    if (!p.isBot) send(p.ws, { t: 'state', view: comPresenca(room, viewFor(room.game, p.id)), events });
  }
}

// ---------------------------------------------------------------------------
// Bots: agem com ritmo humano; dão janela para compra fora da vez
// ---------------------------------------------------------------------------

// Quanto tempo um humano da vez pode ficar caído antes de o jogo jogar por
// ele (até ele reconectar). Sem isso, uma queda definitiva travaria a sala.
const AWAY_TAKEOVER_MS = 45_000;

function scheduleBots(room) {
  const game = room.game;
  if (!game || (game.phase !== 'draw' && game.phase !== 'play')) {
    if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; room.botTimerKey = null; }
    return;
  }

  const current = game.players[game.turn];
  const currentPlayer = room.players.find((p) => p.id === current.id);

  // Bots fora da vez pedem a carta recém-descartada (se ela ajuda e se ela
  // está comprável — coringa descartado tranca o meio)
  if (game.phase === 'draw' && game.discardFresh && podeComprarDoDescarte(game)) {
    const top = topoDoDescarte(game);
    let claimed = false;
    for (const gp of game.players) {
      if (gp.id === current.id || !gp.isBot) continue;
      if (!game.claims.includes(gp.id) && botWantsCard(game, gp, top)) {
        try { actClaim(game, gp.id); claimed = true; } catch { /* fase mudou */ }
      }
    }
    if (claimed) broadcastState(room, [{ e: 'claimUpdate' }]);
  }

  // Vez de humano presente: nada a agendar (o jogo espera por ele).
  const away = currentPlayer && !currentPlayer.isBot && !currentPlayer.connected;
  if (!currentPlayer || (!currentPlayer.isBot && !away)) {
    if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; room.botTimerKey = null; }
    return;
  }

  // O timer só é reagendado quando o MOMENTO do jogo muda (vez, fase, carta
  // fresca…). Sem esta chave, qualquer mensagem repetida de um cliente
  // (ex.: spam de claim/unclaim) limparia e recriaria o timer para sempre e o
  // bot nunca jogaria — a partida inteira congelaria.
  const key = `${room.gameSeq}:${game.round}:${game.turnNo}:${game.phase}:${game.discardFresh}:${current.id}:${away ? 'away' : 'bot'}`;
  if (room.botTimer && room.botTimerKey === key) return;
  if (room.botTimer) clearTimeout(room.botTimer);
  room.botTimerKey = key;

  // Janela maior quando há carta comprável (dá tempo do humano pedir).
  // Humano caído: espera generosa na primeira ação; depois ritmo de bot.
  const buyWindow = game.phase === 'draw' && game.discardFresh && podeComprarDoDescarte(game);
  const delay = away
    ? (currentPlayer.awayActed ? 1000 : AWAY_TAKEOVER_MS)
    : (buyWindow ? 2200 : 700 + Math.random() * 500);

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    room.botTimerKey = null;
    if (!room.game || room.game !== game) return;
    if (game.phase !== 'draw' && game.phase !== 'play') return;
    if (game.players[game.turn].id !== current.id) return;
    const actor = room.players.find((p) => p.id === current.id);
    if (!actor) return;
    if (!actor.isBot) {
      if (actor.connected) return; // voltou a tempo: a vez é dele de verdade
      actor.awayActed = true;
    }
    try {
      const action = botNextAction(game, current.id);
      if (!action) return;
      let events = applyAction(game, current.id, action);
      if (!actor.isBot && !actor.awayNotified) {
        actor.awayNotified = true;
        events = [{ e: 'away', p: current.id }, ...events];
      }
      broadcastState(room, events);
      scheduleBots(room);
    } catch (err) {
      console.error('erro de bot:', err);
    }
  }, delay);
}

// ---------------------------------------------------------------------------
// Protocolo WebSocket
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  ws.roomCode = null;
  ws.playerId = null;
  ws.origin = originFrom(req); // endereço por onde ESTE jogador chegou

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { handle(ws, msg); } catch (err) {
      send(ws, { t: 'error', msg: err.gameRule ? err.message : 'Algo deu errado. Tente de novo.' });
      if (!err.gameRule) console.error(err);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const player = room.players.find((p) => p.id === ws.playerId);
    if (player && player.ws === ws) {
      player.ws = null;
      player.connected = false;
      player.lastSeen = Date.now();
      broadcastLobby(room);
      if (room.game) broadcastState(room, [{ e: 'presence' }]);
      // Se ele caiu na própria vez, arma a retomada (o jogo joga por ele
      // depois de AWAY_TAKEOVER_MS até ele reconectar)
      scheduleBots(room);
    }
  });
});

function currentRoom(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) { const e = new Error('Sala não encontrada.'); e.gameRule = true; throw e; }
  return room;
}

function currentPlayer(ws, room) {
  const p = room.players.find((x) => x.id === ws.playerId);
  if (!p) { const e = new Error('Você não está nesta sala.'); e.gameRule = true; throw e; }
  return p;
}

function attach(ws, room, player) {
  ws.roomCode = room.code;
  ws.playerId = player.id;
  player.ws = ws;
  player.connected = true;
  player.lastSeen = Date.now();
  player.awayActed = false;    // reconectou: o jogo para de jogar por ele
  player.awayNotified = false;
  send(ws, { t: 'welcome', playerId: player.id, token: player.token, code: room.code });
  broadcastLobby(room);
  if (room.game) send(ws, { t: 'state', view: comPresenca(room, viewFor(room.game, player.id)), events: [] });
}

function handle(ws, msg) {
  switch (msg.t) {
    case 'create': {
      const room = newRoom(ws.origin);
      const player = {
        id: crypto.randomUUID(), name: sanitizeName(msg.name), token: crypto.randomUUID(),
        avatar: personagemEscolhido(msg.avatar),
        isBot: false, ws: null, connected: false, lastSeen: Date.now(),
      };
      room.players.push(player);
      attach(ws, room, player);
      break;
    }
    case 'join': {
      const room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) { const e = new Error('Sala não encontrada. Confira o código.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('Essa partida já começou.'); e.gameRule = true; throw e; }
      if (room.players.length >= DEFAULT_OPTS.maxPlayers) { const e = new Error(`A sala está cheia (${DEFAULT_OPTS.maxPlayers} jogadores).`); e.gameRule = true; throw e; }
      const player = {
        id: crypto.randomUUID(), name: sanitizeName(msg.name), token: crypto.randomUUID(),
        avatar: personagemEscolhido(msg.avatar),
        isBot: false, ws: null, connected: false, lastSeen: Date.now(),
      };
      room.players.push(player);
      attach(ws, room, player);
      break;
    }
    // Sair da partida de vez. Antes de começar, o assento some. Com a partida
    // em andamento não dá para tirar o assento sem quebrar a rodada — mão,
    // jogos e pontuação são todos por assento —, então o assento fica e o robô
    // assume NA HORA, pelo mesmo caminho de quem cai, sem os 45 s de espera.
    case 'leave': {
      const room = currentRoom(ws);
      const player = currentPlayer(ws, room);
      if (!room.game) {
        room.players = room.players.filter((p) => p.id !== player.id);
        send(ws, { t: 'gone' });
        try { ws.close(); } catch { /* já fechou */ }
        broadcastLobby(room);
        break;
      }
      player.desistiu = true;
      player.connected = false;
      player.awayActed = true;     // sem a espera generosa da primeira ação
      player.awayNotified = true;  // o aviso de "caiu" não é este caso
      player.ws = null;
      // Token novo: quem desistiu não volta com o link antigo. É o que
      // distingue desistir de cair — cair é reversível, desistir não.
      player.token = crypto.randomUUID();
      send(ws, { t: 'gone' });
      try { ws.close(); } catch { /* já fechou */ }
      broadcastState(room, [{ e: 'desistiu', p: player.id }]);
      scheduleBots(room);
      break;
    }
    case 'resume': {
      const room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) { send(ws, { t: 'gone' }); return; }
      const player = room.players.find((p) => p.id === msg.playerId && p.token === msg.token);
      if (!player) { send(ws, { t: 'gone' }); return; }
      attach(ws, room, player);
      break;
    }
    case 'addBot': {
      const room = currentRoom(ws);
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode mexer nos robôs.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('A partida já começou.'); e.gameRule = true; throw e; }
      if (room.players.length >= DEFAULT_OPTS.maxPlayers) { const e = new Error(`A sala está cheia (${DEFAULT_OPTS.maxPlayers} jogadores).`); e.gameRule = true; throw e; }
      const emUso = new Set(room.players.map((p) => p.name));
      const nome = BOT_NAMES.find((n) => !emUso.has(n)) || `Robô ${room.players.length + 1}`;
      room.players.push({
        id: `bot-${crypto.randomUUID()}`, name: nome, token: '',
        isBot: true, ws: null, connected: true, lastSeen: Date.now(),
      });
      broadcastLobby(room);
      break;
    }
    case 'removeBot': {
      const room = currentRoom(ws);
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode mexer nos robôs.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('A partida já começou.'); e.gameRule = true; throw e; }
      const idx = room.players.findIndex((p) => p.isBot && p.id === msg.botId);
      if (idx >= 0) room.players.splice(idx, 1);
      broadcastLobby(room);
      break;
    }
    case 'start': {
      const room = currentRoom(ws);
      currentPlayer(ws, room);
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode começar.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('A partida já começou.'); e.gameRule = true; throw e; }
      if (room.players.length < DEFAULT_OPTS.minPlayers) { const e = new Error('Chame pelo menos mais 1 jogador (ou adicione um robô).'); e.gameRule = true; throw e; }
      // O motor recusaria na hora de distribuir; conferir aqui dá uma mensagem
      // no lobby em vez de derrubar a partida na rodada mais apertada.
      const aperto = conferirBaralho(room.players.length);
      if (aperto) {
        const e = new Error(`Não dá para jogar com ${room.players.length} jogadores: a rodada ${aperto.round + 1} precisaria de ${aperto.precisa} cartas e o baralho tem ${aperto.total}.`);
        e.gameRule = true; throw e;
      }
      room.game = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })));
      room.gameSeq++;
      const events = startRound(room.game);
      broadcastLobby(room);
      broadcastState(room, events);
      scheduleBots(room);
      break;
    }
    case 'action': {
      const room = currentRoom(ws);
      const player = currentPlayer(ws, room);
      if (!room.game) { const e = new Error('A partida ainda não começou.'); e.gameRule = true; throw e; }
      const events = applyAction(room.game, player.id, msg.action || {});
      // Ação sem efeito (ex.: pedido de compra atrasado) não gera rebroadcast:
      // junto com a chave do timer em scheduleBots, isso impede que spam de
      // mensagens inofensivas congele os bots ou inunde os outros clientes.
      if (events.length > 0) broadcastState(room, events);
      scheduleBots(room);
      break;
    }
    case 'nextRound': {
      const room = currentRoom(ws);
      currentPlayer(ws, room);
      if (!room.game) return;
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode avançar a rodada.'); e.gameRule = true; throw e; }
      const events = actNextRound(room.game);
      broadcastState(room, events);
      scheduleBots(room);
      break;
    }
    case 'playAgain': {
      const room = currentRoom(ws);
      currentPlayer(ws, room);
      if (!room.game || room.game.phase !== 'gameEnd') return;
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode recomeçar.'); e.gameRule = true; throw e; }
      room.game = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })));
      room.gameSeq++;
      const events = startRound(room.game);
      broadcastState(room, events);
      scheduleBots(room);
      break;
    }
    default:
      break;
  }
}

// Limpeza: sala some depois de 30 min sem nenhum humano conectado
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const humans = room.players.filter((p) => !p.isBot);
    const active = humans.some((p) => p.connected);
    const lastSeen = Math.max(room.createdAt, ...humans.map((p) => p.lastSeen || 0));
    if (!active && now - lastSeen > 30 * 60 * 1000) {
      if (room.botTimer) clearTimeout(room.botTimer);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000);

server.listen(PORT, HOST, () => {
  console.log('🃏 Caçamba no ar!');
  console.log(`   Neste computador:  http://localhost:${PORT}`);
  console.log(`   Celulares (mesmo Wi-Fi):  ${LAN_HOST}`);
  if (process.env.PUBLIC_URL) console.log(`   Endereço público:  ${process.env.PUBLIC_URL}`);
});

// Hospedagens param o processo com SIGTERM e esperam que ele saia sozinho.
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    console.log(`\n${sinal} recebido, encerrando…`);
    for (const room of rooms.values()) if (room.botTimer) clearTimeout(room.botTimer);
    wss.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
