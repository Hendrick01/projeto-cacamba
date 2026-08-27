// ============================================================================
// Caçamba — servidor: salas por código + juiz das regras (WebSocket)
// Rodar: npm start  →  celulares na mesma rede acessam http://IP-DO-PC:3000
// ============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import {
  createGame, startRound, applyAction, actNextRound, viewFor,
  botNextAction, botWantsCard, actClaim, DEFAULT_OPTS,
} from './shared/engine.js';

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
};

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
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
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
const BOT_NAMES = ['Robô Zé', 'Robô Lia', 'Robô Gui'];

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
function originFrom(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const host = req && (req.headers['x-forwarded-host'] || req.headers.host);
  if (!host) return LAN_HOST;
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwarded || (req.socket && req.socket.encrypted ? 'https' : 'http');
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
    botTimer: null,
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
    })),
  };
}

function broadcastLobby(room) {
  for (const p of room.players) if (!p.isBot) send(p.ws, lobbyView(room));
}

function broadcastState(room, events = []) {
  if (!room.game) return;
  for (const p of room.players) {
    if (!p.isBot) send(p.ws, { t: 'state', view: viewFor(room.game, p.id), events });
  }
}

// ---------------------------------------------------------------------------
// Bots: agem com ritmo humano; dão janela para compra fora da vez
// ---------------------------------------------------------------------------

function scheduleBots(room) {
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
  const game = room.game;
  if (!game || (game.phase !== 'draw' && game.phase !== 'play')) return;

  const current = game.players[game.turn];
  const currentPlayer = room.players.find((p) => p.id === current.id);

  // Bots fora da vez pedem a carta recém-descartada (se ela ajuda)
  if (game.phase === 'draw' && game.discardFresh && game.discard.length) {
    const top = game.discard[game.discard.length - 1];
    let claimed = false;
    for (const gp of game.players) {
      if (gp.id === current.id || !gp.isBot) continue;
      if (!game.claims.includes(gp.id) && botWantsCard(game, gp, top)) {
        try { actClaim(game, gp.id); claimed = true; } catch { /* fase mudou */ }
      }
    }
    if (claimed) broadcastState(room, [{ e: 'claimUpdate' }]);
  }

  if (!currentPlayer || !currentPlayer.isBot) return; // vez de humano: só esperamos

  // Janela maior quando há carta comprável (dá tempo do humano pedir)
  const buyWindow = game.phase === 'draw' && game.discardFresh;
  const delay = buyWindow ? 2200 : 700 + Math.random() * 500;

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.game || room.game !== game) return;
    if (game.phase !== 'draw' && game.phase !== 'play') return;
    if (game.players[game.turn].id !== current.id) return;
    try {
      const action = botNextAction(game, current.id);
      if (!action) return;
      const events = applyAction(game, current.id, action);
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
  send(ws, { t: 'welcome', playerId: player.id, token: player.token, code: room.code });
  broadcastLobby(room);
  if (room.game) send(ws, { t: 'state', view: viewFor(room.game, player.id), events: [] });
}

function handle(ws, msg) {
  switch (msg.t) {
    case 'create': {
      const room = newRoom(ws.origin);
      const player = {
        id: crypto.randomUUID(), name: sanitizeName(msg.name), token: crypto.randomUUID(),
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
      if (room.players.length >= DEFAULT_OPTS.maxPlayers) { const e = new Error('A sala está cheia (4 jogadores).'); e.gameRule = true; throw e; }
      const player = {
        id: crypto.randomUUID(), name: sanitizeName(msg.name), token: crypto.randomUUID(),
        isBot: false, ws: null, connected: false, lastSeen: Date.now(),
      };
      room.players.push(player);
      attach(ws, room, player);
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
      if (room.players.length >= DEFAULT_OPTS.maxPlayers) { const e = new Error('A sala está cheia (4 jogadores).'); e.gameRule = true; throw e; }
      const used = room.players.filter((p) => p.isBot).length;
      room.players.push({
        id: `bot-${crypto.randomUUID()}`, name: BOT_NAMES[used % BOT_NAMES.length], token: '',
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
      room.game = createGame(room.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })));
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
      broadcastState(room, events);
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
