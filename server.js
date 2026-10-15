// ============================================================================
// Caçamba — servidor: salas por código + juiz das regras (WebSocket)
// Rodar: npm start  →  celulares na mesma rede acessam http://IP-DO-PC:3000
// ============================================================================

import http from 'node:http';
import { consume, clientIp, validOrigin, validMessage } from './lib/security.js';
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
  botNextAction, botWantsCard, actClaim, DEFAULT_OPTS, conferirBaralho, NIVEIS_DE_ROBO,
  podeComprarDoDescarte, topoDoDescarte,
} from './shared/engine.js';
import * as Presidente from './shared/presidente.js';
import * as Domino from './shared/domino.js';
import { personagemValido } from './shared/elenco.js';
import { emoteDe } from './shared/emotes.js';
import { chaveDasSalas, sela, abre } from './lib/selo-sala.js';
import { codigoPix, normalizaChave } from './lib/pix.js';
import { rotaDeConta, ehRotaDeConta } from './lib/rotas-conta.js';
import { rotaDeWebhook, ehWebhook } from './lib/rotas-webhook.js';
import { contaDaSessao } from './lib/contas.js';
import { migra, temBanco } from './lib/banco.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MODOS DE JOGO. A sala nasce num modo e não muda. Cada modo tem o seu motor
// em shared/; o servidor só escolhe qual chamar. O Caçamba é o principal e o
// padrão: mensagem sem `modo`, retrato antigo sem `modo`, tudo vira Caçamba.
const MODOS = {
  cacamba: {
    createGame, startRound, applyAction, actNextRound, viewFor, botNextAction,
    FASES_DE_VEZ: ['draw', 'play'], MIN: DEFAULT_OPTS.minPlayers, MAX: DEFAULT_OPTS.maxPlayers,
  },
  presidente: {
    createGame: Presidente.createGame, startRound: Presidente.startRound, applyAction: Presidente.applyAction,
    actNextRound: Presidente.actNextRound, viewFor: Presidente.viewFor, botNextAction: Presidente.botNextAction,
    FASES_DE_VEZ: Presidente.FASES_DE_VEZ, MIN: Presidente.MIN_JOGADORES, MAX: Presidente.MAX_JOGADORES,
  },
  // Dominó de ponto: 2v2 em duplas fixas (cadeiras 0+2 contra 1+3) ou 1v1,
  // à escolha do anfitrião. A sala tem CADEIRAS: o anfitrião arruma quem senta
  // onde, e as vazias viram robô na hora de começar.
  domino: {
    createGame: Domino.createGame, startRound: Domino.startRound, applyAction: Domino.applyAction,
    actNextRound: Domino.actNextRound, viewFor: Domino.viewFor, botNextAction: Domino.botNextAction,
    FASES_DE_VEZ: Domino.FASES_DE_VEZ, MIN: Domino.MIN_JOGADORES, MAX: Domino.MAX_JOGADORES,
    cadeiras: true,
    lugares: (room) => Domino.FORMATOS[room.formato] || Domino.MAX_JOGADORES,
  },
};
const modoValido = (m) => (Object.hasOwn(MODOS, m) ? m : 'cacamba');
const motorDe = (room) => MODOS[modoValido(room.modo)];
// Quantos sentam: o máximo do modo, ou o do formato escolhido (dominó 1v1).
const lugaresDe = (room) => { const m = motorDe(room); return m.lugares ? m.lugares(room) : m.MAX; };
const formatoValido = (f) => (Object.hasOwn(Domino.FORMATOS, f) ? f : '2v2');
const cliValue = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const PORT = Number(process.env.PORT || cliValue('--port')) || 3000;
// Hospedagens injetam a porta e esperam que o processo escute em todas as
// interfaces. HOST permite restringir de novo (ex.: 127.0.0.1) se precisar.
const HOST = process.env.HOST || cliValue('--host') || '0.0.0.0';
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1' || (process.env.RENDER === 'true' && process.env.TRUST_PROXY !== '0');

// A caixinha do Pix. A chave é do dono do jogo e não entra no repositório: sem
// PIX_CHAVE no ambiente, `codigoPix` devolve null, a rota some e o botão nem
// aparece — que é o certo em desenvolvimento e no clone de qualquer pessoa.
const PIX = codigoPix({
  chave: process.env.PIX_CHAVE,
  nome: process.env.PIX_NOME || 'Cacamba',
  cidade: process.env.PIX_CIDADE || 'Brasil',
  tipo: process.env.PIX_TIPO,
});
// Diz em voz alta como leu a chave. Um QR de Pix errado nasce com cara de
// certo — desenha, o CRC bate, e só quem tenta pagar descobre. Uma linha no
// log da subida transforma isso em erro visível no primeiro deploy.
if (PIX) {
  const { chave, tipo } = normalizaChave(process.env.PIX_CHAVE, process.env.PIX_TIPO);
  console.log(`Caixinha do Pix ligada — chave lida como ${tipo}: ${chave}`);
}

// O esquema do banco, aplicado na subida. Todo CREATE tem IF NOT EXISTS, então
// isto é idempotente e rodar de novo não custa nada — e a alternativa é alguém
// lembrar de migrar à mão depois de cada deploy. O modo de falhar disso é feio e
// silencioso: rota no ar, banco vazio, e a primeira compra da vida morrendo na
// hora de gravar, com o dinheiro já cobrado do outro lado.
//
// Falhar aqui NÃO derruba o servidor. O jogo nunca precisou de banco, e não vai
// passar a precisar por causa da loja.
if (temBanco) {
  migra()
    .then(() => console.log('Esquema da loja conferido no banco.'))
    .catch((erro) => console.error('Não deu para aplicar o esquema da loja:', erro?.message || erro));
}
// O QR é sempre o mesmo desenho, então desenha uma vez na subida. Fica em
// promessa para a subida não esperar por ele.
const pixQr = PIX
  ? QRCode.toDataURL(PIX, { margin: 1, width: 240 }).catch(() => null)
  : Promise.resolve(null);

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
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  // a licença OFL acompanha as fontes: quem baixa a fonte tem direito a ela
  '.txt': 'text/plain; charset=utf-8',
};

// Cabeçalhos de segurança do que sai daqui. A CSP diz ao navegador de onde a
// página pode carregar cada coisa: só daqui (script, fonte, som), mais `data:`
// para imagens (o QR da sala e as figuras do elenco entram como data URL),
// `blob:` para imagem e conexão (as texturas embutidas num .glb saem do
// arquivo como blob — sem isso o modelo 3D chega sem textura) e
// `unsafe-inline` para estilo (a mesa põe `style=` em elementos pelo JS). Sem
// script inline em lugar nenhum, `script-src 'self'` fecha a porta da XSS que
// a auditoria não achou mas também não podia descartar. `frame-ancestors
// 'none'` impede que outro site embuta o jogo. O microfone fica liberado só
// para esta origem — é o chat de voz; câmera e localização, fechadas.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws: wss: blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const CABECALHOS_SEGUROS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
  // HSTS só faz sentido onde há TLS, e só o deploy sabe que há: PUBLIC_URL.
  ...(/^https:/.test(PUBLIC_URL) ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
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
  // Leitura e gzip fora do event loop: carregar a arte não pausa as jogadas.
  // Guardar a Promise também evita comprimir o mesmo arquivo simultaneamente.
  const tarefa = fs.promises.readFile(full).then((cru) => {
    const fonte = ext === '.svg' ? Buffer.from(svgEnxuto(cru.toString('utf8'))) : cru;
    return new Promise((resolve, reject) => zlib.gzip(fonte, { level: 6 }, (erro, buf) => erro ? reject(erro) : resolve(buf)));
  }).catch((erro) => { cacheGzip.delete(chave); throw erro; });
  cacheGzip.set(chave, tarefa);
  if (cacheGzip.size > 200) cacheGzip.delete(cacheGzip.keys().next().value);
  return tarefa;
}

function politicaDaPagina(req) {
  let host = req.headers.host;
  try { if (PUBLIC_URL) host = new URL(PUBLIC_URL).host; } catch { host = ''; }
  const destinos = hostValido(host) ? ` ws://${host} wss://${host}` : '';
  return CSP.replace("connect-src 'self' ws: wss: blob:", `connect-src 'self' blob:${destinos}`);
}

const STATIC_ROOTS = [path.join(__dirname, 'public'), __dirname];

const server = http.createServer((req, res) => {
  for (const [key, value] of Object.entries(CABECALHOS_SEGUROS)) res.setHeader(key, value);
  // O webhook vem antes porque é a exceção: gateway não manda Origin, e quem
  // autentica ali é a assinatura do corpo. Ver o cabeçalho de rotas-webhook.js.
  if (ehWebhook(req)) {
    rotaDeWebhook(req, res, { avisa: avisaDono })
      .catch((erro) => {
        console.error('webhook falhou:', erro?.message || erro);
        // 500 de propósito: erro NOSSO merece reenvio da Kiwify, ao contrário
        // de evento repetido ou irrelevante, que respondem 200.
        if (!res.headersSent && !res.destroyed) { res.writeHead(500); res.end('erro interno'); }
      });
    return;
  }

  // As rotas de conta são as ÚNICAS que aceitam POST, e elas mesmas conferem
  // origem, tamanho de corpo e balde por IP. Todo o resto do servidor continua
  // só GET e HEAD, como sempre foi.
  if (ehRotaDeConta(req)) {
    rotaDeConta(req, res, { publicUrl: PUBLIC_URL, trustProxy: TRUST_PROXY })
      .then((tratou) => {
        if (tratou || res.headersSent || res.destroyed) return;
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Não encontrado');
      })
      .catch((erro) => {
        // Banco fora do ar não pode derrubar o processo: ele segura todas as
        // salas em memória, e uma partida não tem nada a ver com a loja.
        console.error('rota de conta falhou:', erro?.message || erro);
        if (res.headersSent || res.destroyed) return;
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end('{"erro":"Falha ao falar com o banco."}');
      });
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch {
    // `//[` e afins fazem o construtor lançar (visto em Node 22). Dentro do
    // listener de `request`, uma exceção derruba o processo inteiro — com todas
    // as salas. É só um pedido ruim: 400 e segue.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Pedido inválido');
    return;
  }
  // A caixinha. Responde 404 quando não há chave configurada: o cliente usa
  // esse 404 para decidir se mostra o botão, então "não configurado" e "não
  // existe" são a mesma resposta de propósito.
  // TURN PARA A VOZ. Só com STUN, quem está atrás de NAT fechado (rede de
  // operadora, Wi‑Fi de empresa) não se ouve — pendência anotada desde
  // 04/09/2026. Um servidor TURN resolve, e é serviço de fora: configure
  // TURN_URLS ("turn:host:3478,turns:host:5349") e OU TURN_SEGREDO (coturn com
  // `use-auth-secret`: a credencial sai daqui, vale 6 h e nunca é fixa no JS)
  // OU TURN_USUARIO + TURN_SENHA (provedor com credencial estática). Sem isso a
  // rota some e a voz segue só com STUN, como sempre.
  if (url.pathname === '/voz.json') {
    const ice = servidoresDeVoz();
    if (!ice) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    const corpo = Buffer.from(JSON.stringify({ iceServers: ice }));
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': corpo.length });
    res.end(req.method === 'HEAD' ? undefined : corpo);
    return;
  }
  if (url.pathname === '/apoio.json') {
    if (!PIX) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{}'); return; }
    pixQr.then((qr) => {
      if (res.destroyed) return;
      const corpo = Buffer.from(JSON.stringify({ codigo: PIX, qr, nome: process.env.PIX_NOME || 'Cacamba' }));
      // Sem cache: a chave pode mudar no painel do Render sem novo deploy.
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': corpo.length });
      res.end(req.method === 'HEAD' ? undefined : corpo);
    });
    return;
  }

  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  for (const root of STATIC_ROOTS) {
    const full = path.join(root, file);
    if (!full.startsWith(root + path.sep)) continue;
    if (file.split(/[\\/]/).some((part) => part.startsWith('.'))) continue;
    if (root === __dirname && !full.startsWith(path.join(__dirname, 'shared') + path.sep)) continue;
    if (fs.existsSync(full) && fs.statSync(full).isFile() && fs.realpathSync(full).startsWith(root + path.sep)) {
      const ext = path.extname(full);
      // Só sai daqui o que o jogo serve de verdade. `public/` guarda, ao lado
      // da arte, o README do elenco e os geradores em Python que a desenham —
      // e com o octet-stream de reserva eles eram baixáveis por quem pedisse o
      // caminho. Não é segredo, mas também não é para servir.
      if (!MIME[ext]) continue;
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
      // A lista de modelos fica fora do cache da arte: quem acabou de pôr um
      // modelo e o listou precisa vê-lo na abertura seguinte, não cinco
      // minutos depois.
      const arte = file.startsWith('/assets/') || file.startsWith('/fonts/')
        || (file.startsWith('/models/') && !file.endsWith('lista.json'));
      const cabecalho = {
        'Content-Type': MIME[ext],
        'Cache-Control': arte ? 'private, max-age=300, must-revalidate' : 'no-cache',
        ETag: etag,
        Vary: 'Accept-Encoding',
        ...CABECALHOS_SEGUROS,
        ...(ext === '.html' ? { 'Content-Security-Policy': politicaDaPagina(req) } : {}),
      };
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, cabecalho);
        res.end();
        return;
      }
      const aceitaGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      if (aceitaGzip && COMPRIMIVEL.has(ext)) {
        corpoComprimido(full, stat, ext).then((corpo) => {
          if (res.destroyed) return;
          res.writeHead(200, { ...cabecalho, 'Content-Encoding': 'gzip', 'Content-Length': corpo.length });
          res.end(req.method === 'HEAD' ? undefined : corpo);
        }).catch(() => { if (!res.destroyed) { res.writeHead(500); res.end('Falha ao ler arquivo'); } });
        return;
      }
      res.writeHead(200, { ...cabecalho, 'Content-Length': stat.size });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(full);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
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

const TURN_URLS = (process.env.TURN_URLS || '').split(',').map((s) => s.trim()).filter((s) => /^turns?:[^\s]+$/.test(s));
function servidoresDeVoz() {
  if (!TURN_URLS.length) return null;
  if (process.env.TURN_SEGREDO) {
    const usuario = `${Math.floor(Date.now() / 1000) + 6 * 3600}:cacamba`;
    const credencial = crypto.createHmac('sha1', process.env.TURN_SEGREDO).update(usuario).digest('base64');
    return [{ urls: TURN_URLS, username: usuario, credential: credencial }];
  }
  if (process.env.TURN_USUARIO && process.env.TURN_SENHA) return [{ urls: TURN_URLS, username: process.env.TURN_USUARIO, credential: process.env.TURN_SENHA }];
  return null;
}

// ---- A sala sobrevive ao reinício (ver lib/selo-sala.js) --------------------
const CHAVE_SALAS = chaveDasSalas();
const SELO_MAXIMO = 15000;            // o que cabe numa mensagem do cliente (maxPayload 16 KiB)
const SELO_VALIDADE_MS = 12 * 60 * 60 * 1000;

// A VERSÃO do que está no ar: o commit do deploy no Render; fora dele, um
// resumo do tamanho e da data dos arquivos servidos. Vai a cada conexão — e é
// como a página aberta descobre que ficou velha ("ainda não alterou no site").
const VERSAO = (() => {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT.slice(0, 12);
  const h = crypto.createHash('sha1');
  const anda = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name.startsWith('.') || f.name === 'models' || f.name === 'vendor') continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) anda(p);
      else if (/\.(js|css|html|json)$/.test(f.name)) { const st = fs.statSync(p); h.update(`${p}:${st.size}:${Math.round(st.mtimeMs)};`); }
    }
  };
  try { for (const d of ['public', 'shared']) anda(path.join(path.dirname(fileURLToPath(import.meta.url)), d)); } catch { /* fica o resumo do que deu */ }
  return h.digest('hex').slice(0, 12);
})();

function retratoDaSala(room) {
  return {
    v: 1, seq: room.seloSeq, em: Date.now(),
    code: room.code, origin: room.origin, gameSeq: room.gameSeq, createdAt: room.createdAt, nivelRobos: room.nivelRobos || 'normal',
    modo: modoValido(room.modo),
    ...(room.cadeiras ? { cadeiras: room.cadeiras, formato: formatoValido(room.formato) } : {}),
    players: room.players.map(({ ws, ...p }) => p),   // sem o socket
    game: room.game,                                   // `rnd` é função: some no JSON, volta na restauração
  };
}
function retratoValido(d) {
  return !!d && d.v === 1 && typeof d.code === 'string' && /^[A-Z]{4}$/.test(d.code)
    && Number.isFinite(d.em) && Date.now() - d.em < SELO_VALIDADE_MS && d.em <= Date.now() + 60000
    && Array.isArray(d.players) && d.players.length >= 1 && d.players.length <= DEFAULT_OPTS.maxPlayers
    && d.players.every((p) => p && typeof p.id === 'string' && typeof p.name === 'string')
    && (d.game === null || (typeof d.game === 'object' && Array.isArray(d.game.players) && Array.isArray(d.game.deck)));
}
// Manda o retrato a todos os humanos ligados (ou a um só, que acabou de chegar).
function enviaSelo(room, so = null) {
  const para = so ? [so] : room.players.filter((p) => !p.isBot && p.ws);
  if (!para.length) return;
  if (!so) room.seloSeq = (room.seloSeq || 0) + 1;
  let selo;
  try { selo = sela(retratoDaSala(room), CHAVE_SALAS); } catch (e) { console.error('selo da sala:', e?.message || e); return; }
  if (selo.length > SELO_MAXIMO) return;   // o cliente não conseguiria devolver
  for (const p of para) send(p.ws, { t: 'selo', code: room.code, seq: room.seloSeq || 0, selo });
}
function recriaSala(d, origin) {
  const room = {
    code: d.code,
    players: d.players.map((p) => ({ ...p, ws: null, connected: !!p.isBot, lastSeen: Date.now(), awayActed: false, awayNotified: false })),
    game: d.game || null,
    gameSeq: d.gameSeq || 0,
    botTimer: null, botTimerKey: null, qr: null,
    origin: origin || d.origin || LAN_HOST,
    createdAt: d.createdAt || Date.now(),
    seloSeq: d.seq || 0, restauradaEm: Date.now(), mexeu: false,
    nivelRobos: NIVEIS_DE_ROBO.includes(d.nivelRobos) ? d.nivelRobos : 'normal',
    modo: modoValido(d.modo),
    cadeiras: Array.isArray(d.cadeiras) ? d.cadeiras.slice(0, 8) : undefined,
    formato: formatoValido(d.formato),
  };
  if (room.game) room.game.rnd = Math.random;
  rooms.set(room.code, room);
  QRCode.toDataURL(`${room.origin}/?sala=${room.code}`, { margin: 1, width: 220 })
    .then((dataUrl) => { room.qr = dataUrl; broadcastLobby(room); })
    .catch(() => {});
  return room;
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I e O (confundem com 1 e 0)
// Teto de salas vivas ao mesmo tempo. Sem ele, um socket mandando `create` em
// loop enchia a memória do plano free com salas permanentes (cada uma guarda
// um QR de alguns KB), e perto dos 331.776 códigos possíveis o sorteio de
// código virava um `while` infinito que travava o event loop.
const MAX_SALAS = 500;
// Oito nomes distintos: a mesa vai até 8 lugares, então nenhum robô repete
// nome com outro na mesma sala.
const BOT_NAMES = [
  'Robô Zé', 'Robô Lia', 'Robô Gui', 'Robô Nina',
  'Robô Téo', 'Robô Vera', 'Robô Bento', 'Robô Cacá',
];

function makeCode() {
  for (let tentativa = 0; tentativa < 64; tentativa++) {
    const code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    if (!rooms.has(code)) return code;
  }
  // 64 sorteios sem código livre só acontece com a tabela quase cheia — e aí a
  // resposta certa é dizer que não dá, não insistir para sempre.
  const e = new Error('O servidor está lotado de salas agora. Tente daqui a pouco.'); e.gameRule = true; throw e;
}

function lanAddress() {
  let interfaces;
  try { interfaces = os.networkInterfaces(); } catch { return 'localhost'; }
  for (const list of Object.values(interfaces)) {
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
  if (PUBLIC_URL) return PUBLIC_URL.replace(/\/+$/, '');
  const trustProxy = TRUST_PROXY;
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

function newRoom(origin = LAN_HOST, modo = 'cacamba') {
  const room = {
    code: makeCode(),
    modo: modoValido(modo),
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

// AS CADEIRAS (modos de mesa fixa, como o dominó). `room.players` continua na
// ordem de chegada — é dela que sai o anfitrião, e trocar alguém de lugar não
// pode trocar o dono da sala. As cadeiras são outra lista, de ids ou null, que
// é arrumada aqui a cada consulta: quem saiu deixa a cadeira vaga, quem chegou
// senta na primeira vaga. É também a ordem da partida, e no dominó a ordem é
// a dupla (cadeiras 0+2 contra 1+3).
function sentaNasCadeiras(room) {
  const motor = motorDe(room);
  if (!motor.cadeiras) return null;
  const ids = new Set(room.players.map((p) => p.id));
  const sentados = new Set();
  const c = Array.from({ length: lugaresDe(room) }, (_, i) => {
    const id = room.cadeiras?.[i];
    if (typeof id !== 'string' || !ids.has(id) || sentados.has(id)) return null;
    sentados.add(id);
    return id;
  });
  for (const p of room.players) {
    if (sentados.has(p.id)) continue;
    const vaga = c.indexOf(null);
    if (vaga < 0) break;
    c[vaga] = p.id; sentados.add(p.id);
  }
  room.cadeiras = c;
  return c;
}

function novoRobo(room) {
  const emUso = new Set(room.players.map((p) => p.name));
  const nome = BOT_NAMES.find((n) => !emUso.has(n)) || `Robô ${room.players.length + 1}`;
  const robo = {
    id: `bot-${crypto.randomUUID()}`, name: nome, token: '',
    isBot: true, ws: null, connected: true, lastSeen: Date.now(),
  };
  room.players.push(robo);
  return robo;
}

// Quem joga, na ordem da mesa. Nos modos de cadeira, as vagas viram robô aqui,
// no começo da partida: o dominó é sempre de 4.
function jogadoresDaPartida(room) {
  const c = sentaNasCadeiras(room);
  if (!c) return room.players;
  for (let i = 0; i < c.length; i++) if (!c[i]) c[i] = novoRobo(room).id;
  return c.map((id) => room.players.find((p) => p.id === id));
}

function send(ws, msg) {
  if (!ws || ws.readyState !== 1) return;
  if (ws.bufferedAmount > 256 * 1024) { ws.terminate(); return; }
  ws.send(JSON.stringify(msg));
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
    modo: modoValido(room.modo),
    ...(motorDe(room).cadeiras ? { cadeiras: sentaNasCadeiras(room), formato: formatoValido(room.formato) } : {}),
    nivelRobos: room.nivelRobos || 'normal',
    players: room.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot, connected: p.isBot || p.connected,
      avatar: p.avatar || null, desistiu: !!p.desistiu,
    })),
  };
}

function broadcastLobby(room) {
  for (const p of room.players) if (!p.isBot) send(p.ws, lobbyView(room));
  // antes de a partida começar, quem entra e sai da sala também vale um retrato
  if (!room.game) enviaSelo(room);
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
    if (!p.isBot) send(p.ws, { t: 'state', view: comPresenca(room, motorDe(room).viewFor(room.game, p.id)), events });
  }
  if (events.length) { room.mexeu = true; robosReagem(room, events); }
  // O RETRATO vai a cada passagem de vez, começo e fim de rodada — não a cada
  // jogada: é o que pesa no plano de dados de quem joga no celular. Reiniciar
  // no meio de uma vez devolve a vez ao começo dela, com o mesmo monte.
  const g = room.game;
  const marca = `${room.gameSeq}/${g.round}/${g.turnNo}/${g.phase === 'roundEnd' || g.phase === 'gameEnd' ? g.phase : ''}`;
  if (marca !== room.seloMarca) { room.seloMarca = marca; enviaSelo(room); }
}

// ---------------------------------------------------------------------------
// Bots: agem com ritmo humano; dão janela para compra fora da vez
// ---------------------------------------------------------------------------

// OS ROBÔS FALAM (18/09/2026): com os emotes na mesa, robô mudo parece
// caixa eletrônico. Eles usam as mesmas chaves do catálogo, pelo mesmo canal —
// e pouco: no máximo uma fala a cada 5 s por sala, e quase sempre por sorteio.
function roboFala(room, k, quem = null) {
  const robos = room.players.filter((p) => p.isBot && !p.desistiu && (!quem || p.id === quem));
  if (!robos.length || !emoteDe(k)) return;
  const agora = Date.now();
  if (agora - (room.falouEm || 0) < 5000) return;
  room.falouEm = agora;
  const robo = robos[Math.floor(Math.random() * robos.length)];
  for (const p of room.players) if (!p.isBot && p.ws) send(p.ws, { t: 'emote', from: robo.id, k });
}
function robosReagem(room, events) {
  const ehRobo = (id) => !!room.players.find((p) => p.id === id && p.isBot);
  for (const ev of events) {
    if (ev.e === 'roundEnd' && ev.reason === 'bateu') {
      if (ehRobo(ev.winnerId)) roboFala(room, Math.random() < 0.5 ? 'joinha' : 'muito-bem', ev.winnerId);
      else if (Math.random() < 0.7) roboFala(room, Math.random() < 0.5 ? 'palmas' : 'nojo');
    } else if (ev.e === 'claimVoid' && ehRobo(ev.p) && Math.random() < 0.5) roboFala(room, 'perdao', ev.p);
    else if (ev.e === 'baixou' && ev.completa && !ehRobo(ev.p) && Math.random() < 0.35) roboFala(room, 'quer-tudo');
    else if (ev.e === 'buy' && ehRobo(ev.p) && Math.random() < 0.25) roboFala(room, 'pisca', ev.p);
    else if (ev.e === 'bateu') {
      if (ehRobo(ev.p)) roboFala(room, 'muito-bem', ev.p);
      else if (Math.random() < 0.6) roboFala(room, Math.random() < 0.5 ? 'palmas' : 'nojo');
    } else if (ev.e === 'saiu' && ev.pos === 0) {
      if (ehRobo(ev.p)) roboFala(room, 'muito-bem', ev.p);
      else if (Math.random() < 0.6) roboFala(room, Math.random() < 0.5 ? 'palmas' : 'nojo');
    }
  }
}
// humano presente demorando na vez: depois de meio minuto, um robô cobra
function armaCobranca(room, game, atual) {
  const chave = `${room.gameSeq}:${game.round}:${game.turnNo}:${atual.id}`;
  if (room.cobrancaChave === chave) return;
  clearTimeout(room.cobrancaTimer); room.cobrancaChave = chave;
  room.cobrancaTimer = setTimeout(() => {
    if (room.game !== game || game.players[game.turn]?.id !== atual.id) return;
    if (!motorDe(room).FASES_DE_VEZ.includes(game.phase)) return;
    roboFala(room, Math.random() < 0.6 ? 'demora' : 'bora');
  }, 28000 + Math.random() * 9000);
  room.cobrancaTimer.unref?.();
}

// Quanto tempo um humano da vez pode ficar caído antes de o jogo jogar por
// ele (até ele reconectar). Sem isso, uma queda definitiva travaria a sala.
const AWAY_TAKEOVER_MS = 45_000;
// Só para teste: RITMO_DOS_ROBOS=0.02 faz o robô jogar 50× mais rápido (uma
// partida de dominó até 240 tem uns 250 lances). Nunca deixa mais lento.
const RITMO_DOS_ROBOS = Math.min(1, Math.max(0.01, Number(process.env.RITMO_DOS_ROBOS) || 1));

function scheduleBots(room) {
  const game = room.game;
  const motor = motorDe(room);
  if (!game || !motor.FASES_DE_VEZ.includes(game.phase)) {
    if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; room.botTimerKey = null; }
    return;
  }

  const current = game.players[game.turn];
  const currentPlayer = room.players.find((p) => p.id === current.id);

  // Bots fora da vez pedem a carta recém-descartada (se ela ajuda e se ela
  // está comprável — coringa descartado tranca o meio)
  if (motor === MODOS.cacamba && game.phase === 'draw' && game.discardFresh && podeComprarDoDescarte(game)) {
    const top = topoDoDescarte(game);
    let claimed = false;
    for (const gp of game.players) {
      if (gp.id === current.id || !gp.isBot) continue;
      if (game.opts?.nivelRobos === 'facil') continue;   // o robô fácil não pede carta fora da vez
      if (!game.claims.includes(gp.id) && botWantsCard(game, gp, top)) {
        try { actClaim(game, gp.id); claimed = true; } catch { /* fase mudou */ }
      }
    }
    if (claimed) broadcastState(room, [{ e: 'claimUpdate' }]);
  }

  // Vez de humano presente: nada a agendar (o jogo espera por ele) — só a
  // cobrança de um robô, se ele demorar.
  const away = currentPlayer && !currentPlayer.isBot && !currentPlayer.connected;
  if (currentPlayer && !currentPlayer.isBot && !away) armaCobranca(room, game, current);
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
  const buyWindow = motor === MODOS.cacamba && game.phase === 'draw' && game.discardFresh && podeComprarDoDescarte(game);
  // Ritmo do robô: rápido demais a mesa parecia um caixa eletrônico, com as
  // jogadas dos outros acontecendo antes de dar tempo de ler o que houve.
  const delay = away
    ? (currentPlayer.awayActed ? 1400 : AWAY_TAKEOVER_MS)
    : (buyWindow ? 3200 : 1500 + Math.random() * 1300) * RITMO_DOS_ROBOS;

  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    room.botTimerKey = null;
    if (!room.game || room.game !== game) return;
    if (!motor.FASES_DE_VEZ.includes(game.phase)) return;
    if (game.players[game.turn].id !== current.id) return;
    const actor = room.players.find((p) => p.id === current.id);
    if (!actor) return;
    if (!actor.isBot) {
      if (actor.connected) return; // voltou a tempo: a vez é dele de verdade
      actor.awayActed = true;
    }
    try {
      const action = motor.botNextAction(game, current.id);
      if (!action) return;
      let events = motor.applyAction(game, current.id, action);
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

// `maxPayload`: o padrão do `ws` é 100 MiB por mensagem — e cada mensagem
// passa por `JSON.parse`. Nada que o jogo manda passa de algumas centenas de
// bytes; 16 KB é folga de sobra.
// Quem pode abrir o WebSocket. Com PUBLIC_URL definido, só páginas servidas
// dele (o navegador manda o Origin, e não dá para forjar de outro site): é o
// que impede um site qualquer de usar este servidor como cliente. Sem
// PUBLIC_URL (desenvolvimento, rede local), compara Origin com Host. Um teto de
// conexões por IP: uma família num mesmo NAT cabe folgada em 40; um script
// abrindo centenas, não.
const MAX_CONEXOES_POR_IP = 40;
const conexoesPorIp = new Map();
const ipDe = (req) => clientIp(req, TRUST_PROXY);
const entradasPorIp = new Map();
const wss = new WebSocketServer({
  server,
  maxPayload: 16 * 1024,
  verifyClient: ({ req, origin }) => {
    if (!validOrigin(req, PUBLIC_URL)) return false;
    if (req.url !== '/' || wss.clients.size >= 800) return false;
    if ((conexoesPorIp.get(ipDe(req)) || 0) >= MAX_CONEXOES_POR_IP) return false;
    return true;
  },
});

// Quem está com qual conta aberta, para a compra chegar sem a pessoa recarregar
// nada. É isto que faz o desvio até o checkout da Kiwify valer a pena: ela sai
// para pagar noutra aba e a skin destrava sozinha nesta, que ficou aberta.
//
// Um mesmo login pode ter várias abas, daí o Set. Falha aqui não pode atrapalhar
// partida: quem não recebe o aviso vê a skin no próximo /eu.json, e ninguém
// perde nada.
const socketsPorConta = new Map();

function avisaDono(contaId, sku, o_que) {
  const sockets = socketsPorConta.get(contaId);
  if (!sockets) return;
  for (const ws of sockets) {
    try { send(ws, { t: 'inventario', sku, situacao: o_que }); } catch { /* aba morta */ }
  }
}

wss.on('connection', (ws, req) => {
  ws.roomCode = null;
  ws.playerId = null;
  ws.ip = ipDe(req);

  // O aperto de mão do WebSocket é um pedido HTTP, então ele traz o cookie de
  // sessão. É de graça saber de quem é esta aba — e sem isso não haveria para
  // onde empurrar a compra. Assíncrono e sem `await`: uma partida jamais espera
  // pelo banco para começar.
  const cru = String(req.headers.cookie || '').match(/cacamba_sessao=([^;]+)/)?.[1] ?? '';
  let doCookie = ''; try { doCookie = decodeURIComponent(cru); } catch { doCookie = cru; }
  contaDaSessao(doCookie)
    .then((conta) => {
      if (!conta || ws.readyState !== ws.OPEN) return;
      ws.contaId = conta.id;
      if (!socketsPorConta.has(conta.id)) socketsPorConta.set(conta.id, new Set());
      socketsPorConta.get(conta.id).add(ws);
    })
    .catch(() => { /* sem banco, ou sessão inválida: a aba segue anônima */ });

  conexoesPorIp.set(ws.ip, (conexoesPorIp.get(ws.ip) || 0) + 1);
  ws.alive = true; ws.on('pong', () => { ws.alive = true; });
  ws.budget = {};
  ws.origin = originFrom(req); // endereço por onde ESTE jogador chegou
  // a versão do que está no ar: a página aberta compara com a que carregou e
  // oferece atualizar (o cliente antigo ignora mensagem que não conhece)
  send(ws, { t: 'versao', v: VERSAO });

  // Sem este ouvinte, um frame malformado (sem máscara, UTF-8 inválido) faz o
  // `ws` emitir 'error' sem ninguém escutando — e o EventEmitter transforma
  // isso numa exceção não tratada que derruba o processo com todas as salas.
  ws.on('error', (err) => console.error('ws:', err.message));

  ws.on('message', (raw, binary) => {
    if (!consume(ws.budget, 120, 45)) { ws.close(1008, 'Muitas mensagens'); return; }
    if (binary) { ws.close(1003, 'Somente JSON'); return; }
    let msg;
    try { msg = JSON.parse(raw); } catch { send(ws, { t: 'error', msg: 'Mensagem inválida.' }); return; }
    if (!validMessage(msg)) { send(ws, { t: 'error', msg: 'Mensagem inválida.' }); return; }
    if (['create', 'join', 'resume'].includes(msg.t)) {
      let bucket = entradasPorIp.get(ws.ip);
      if (!bucket) { bucket = {}; entradasPorIp.set(ws.ip, bucket); }
      if (!consume(bucket, 40, 1)) { ws.close(1008, 'Muitas entradas'); return; }
    }
    try { handle(ws, msg); } catch (err) {
      send(ws, { t: 'error', msg: err.gameRule ? err.message : 'Algo deu errado. Tente de novo.' });
      if (!err.gameRule) console.error(err);
    }
  });

  ws.on('close', () => {
    const n = (conexoesPorIp.get(ws.ip) || 1) - 1;
    if (n <= 0) conexoesPorIp.delete(ws.ip); else conexoesPorIp.set(ws.ip, n);
    // Sem isto o mapa cresceria para sempre com sockets mortos, e o processo
    // que segura todas as salas iria junto.
    if (ws.contaId) {
      const abas = socketsPorConta.get(ws.contaId);
      abas?.delete(ws);
      if (abas && abas.size === 0) socketsPorConta.delete(ws.contaId);
    }
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
  if (!p || p.ws !== ws || !p.connected) { const e = new Error('Você não está nesta sala.'); e.gameRule = true; throw e; }
  return p;
}

// Solta o socket do assento que ele ocupava antes, se ocupava algum. É o mesmo
// que o 'close' faz — e precisa acontecer também quando o MESMO socket manda
// outro `create`/`join`/`resume`: sem isto o jogador antigo ficava
// `connected: true` para sempre numa sala que ninguém mais via, e a limpeza
// (que só apaga sala sem humano conectado) nunca a apagava.
function detach(ws) {
  const antiga = rooms.get(ws.roomCode);
  if (!antiga) return;
  const p = antiga.players.find((x) => x.id === ws.playerId);
  if (p && p.ws === ws) {
    p.ws = null;
    p.connected = false;
    p.lastSeen = Date.now();
    broadcastLobby(antiga);
    if (antiga.game) { broadcastState(antiga, [{ e: 'presence' }]); scheduleBots(antiga); }
  }
}

function attach(ws, room, player) {
  if (ws.roomCode && (ws.roomCode !== room.code || ws.playerId !== player.id)) detach(ws);
  if (player.ws && player.ws !== ws) {
    const anterior = player.ws;
    anterior.roomCode = null; anterior.playerId = null;
    anterior.close(4001, 'Sessão retomada em outra janela');
  }
  ws.roomCode = room.code;
  ws.playerId = player.id;
  player.ws = ws;
  player.connected = true;
  player.lastSeen = Date.now();
  player.awayActed = false;    // reconectou: o jogo para de jogar por ele
  player.awayNotified = false;
  send(ws, { t: 'welcome', playerId: player.id, token: player.token, code: room.code });
  broadcastLobby(room);
  if (room.game) {
    send(ws, { t: 'state', view: comPresenca(room, motorDe(room).viewFor(room.game, player.id)), events: [] });
    enviaSelo(room, player);
  }
}

function handle(ws, msg) {
  if (!['create', 'join', 'resume', 'restaura'].includes(msg.t)) currentPlayer(ws, currentRoom(ws));
  switch (msg.t) {
    case 'create': {
      if (rooms.size >= MAX_SALAS) { const e = new Error('O servidor está lotado de salas agora. Tente daqui a pouco.'); e.gameRule = true; throw e; }
      const room = newRoom(ws.origin, msg.modo);
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
      const max = lugaresDe(room);
      if (room.players.length >= max) { const e = new Error(`A sala está cheia (${max} jogadores).`); e.gameRule = true; throw e; }
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
      // `semSala`: o servidor não conhece a sala — reiniciou, ou ela expirou.
      // O cliente que tiver o retrato dela responde com `restaura`; o cliente
      // antigo lê só o `gone` e volta para o começo, como sempre.
      if (!room) { send(ws, { t: 'gone', semSala: true }); return; }
      // Robôs têm token vazio e id público (a visão do lobby mostra os ids):
      // sem o filtro, um `resume` com token "" anexava o socket a um robô — e
      // dava para ver a mão dele e jogar por ele.
      const player = room.players.find((p) => !p.isBot && p.token && p.id === msg.playerId && p.token === msg.token);
      if (!player) { send(ws, { t: 'gone' }); return; }
      attach(ws, room, player);
      break;
    }
    // A SALA VOLTA DO RETRATO (lib/selo-sala.js). Só abre o que ESTE servidor
    // selou, com a chave dele; e quem devolve o retrato ainda tem de ser um
    // jogador daquela sala, com o token dele.
    case 'restaura': {
      const d = abre(msg.selo, CHAVE_SALAS);
      if (!retratoValido(d)) { send(ws, { t: 'gone' }); return; }
      let room = rooms.get(d.code);
      // o mesmo código sorteado de novo para OUTRA sala: não é esta
      if (room && room.createdAt !== d.createdAt) { send(ws, { t: 'gone' }); return; }
      if (!room) {
        if (rooms.size >= MAX_SALAS) { const e = new Error('O servidor está lotado de salas agora. Tente daqui a pouco.'); e.gameRule = true; throw e; }
        room = recriaSala(d, ws.origin);
        console.log(`sala ${room.code} restaurada do retrato ${d.seq} (${room.players.length} jogadores${room.game ? `, rodada ${room.game.round + 1}` : ', no lobby'})`);
      } else if (room.restauradaEm && !room.mexeu && d.seq > (room.seloSeq || 0)) {
        // outro jogador chegou com um retrato MAIS NOVO e ninguém jogou ainda
        // desde a volta: vale o mais novo (é o que impede voltar a partida no
        // tempo devolvendo de propósito um retrato velho)
        room.game = d.game || null;
        if (room.game) room.game.rnd = Math.random;
        room.gameSeq = d.gameSeq || 0; room.seloSeq = d.seq; room.seloMarca = null;
        for (const p of room.players) { const n = d.players.find((x) => x.id === p.id); if (n) { p.desistiu = !!n.desistiu; p.token = n.token; } }
        if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; room.botTimerKey = null; }
        console.log(`sala ${room.code}: adotado o retrato mais novo (${d.seq})`);
        broadcastState(room, []);
      }
      const player = room.players.find((p) => !p.isBot && p.token && p.id === msg.playerId && p.token === msg.token);
      if (!player) { send(ws, { t: 'gone' }); return; }
      attach(ws, room, player);
      scheduleBots(room);
      break;
    }
    case 'addBot': {
      const room = currentRoom(ws);
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode mexer nos robôs.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('A partida já começou.'); e.gameRule = true; throw e; }
      const max = lugaresDe(room);
      if (room.players.length >= max) { const e = new Error(`A sala está cheia (${max} jogadores).`); e.gameRule = true; throw e; }
      novoRobo(room);
      broadcastLobby(room);
      break;
    }
    // Formato do dominó: 2v2 (em dupla) ou 1v1 (mano a mano). Só antes de
    // começar, e só se quem já está na sala couber.
    case 'formato': {
      const room = currentRoom(ws);
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala escolhe o formato.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('A partida já começou.'); e.gameRule = true; throw e; }
      if (!motorDe(room).cadeiras || !Object.hasOwn(Domino.FORMATOS, msg.f)) return;
      if (room.players.length > Domino.FORMATOS[msg.f]) {
        const e = new Error(`Tem gente demais na sala para o ${msg.f}.`); e.gameRule = true; throw e;
      }
      room.formato = msg.f;
      broadcastLobby(room);
      break;
    }
    // Trocar de cadeira (dominó): o anfitrião troca o que há em duas cadeiras
    // — gente, robô ou vaga. É assim que se escolhe a dupla antes de começar.
    case 'cadeira': {
      const room = currentRoom(ws);
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala troca os lugares.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('A partida já começou.'); e.gameRule = true; throw e; }
      const c = sentaNasCadeiras(room);
      const de = Number(msg.de), para = Number(msg.para);
      if (!c || !Number.isInteger(de) || !Number.isInteger(para) || de === para
        || de < 0 || para < 0 || de >= c.length || para >= c.length) return;
      [c[de], c[para]] = [c[para], c[de]];
      broadcastLobby(room);
      break;
    }
    case 'nivelRobos': {
      const room = currentRoom(ws);
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode mexer nos robôs.'); e.gameRule = true; throw e; }
      if (room.game) { const e = new Error('A partida já começou.'); e.gameRule = true; throw e; }
      room.nivelRobos = NIVEIS_DE_ROBO.includes(msg.nivel) ? msg.nivel : 'normal';
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
      const motor = motorDe(room);
      if (!motor.cadeiras && room.players.length < motor.MIN) {
        const faltam = motor.MIN - room.players.length;
        const e = new Error(`Chame pelo menos mais ${faltam} jogador${faltam > 1 ? 'es' : ''} (ou adicione robô).`); e.gameRule = true; throw e;
      }
      // O motor recusaria na hora de distribuir; conferir aqui dá uma mensagem
      // no lobby em vez de derrubar a partida na rodada mais apertada.
      const aperto = motor === MODOS.cacamba && conferirBaralho(room.players.length);
      if (aperto) {
        const e = new Error(`Não dá para jogar com ${room.players.length} jogadores: a rodada ${aperto.round + 1} precisaria de ${aperto.precisa} cartas e o baralho tem ${aperto.total}.`);
        e.gameRule = true; throw e;
      }
      room.game = motor.createGame(jogadoresDaPartida(room).map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })), { nivelRobos: room.nivelRobos || 'normal' });
      room.gameSeq++;
      const events = motor.startRound(room.game);
      broadcastLobby(room);
      broadcastState(room, events);
      scheduleBots(room);
      break;
    }
    case 'action': {
      const room = currentRoom(ws);
      const player = currentPlayer(ws, room);
      if (!room.game) { const e = new Error('A partida ainda não começou.'); e.gameRule = true; throw e; }
      // `claim`/`unclaim` geram broadcast do estado inteiro para a mesa toda:
      // mais de 6 num segundo, da mesma conexão, é script — e cai no chão sem
      // erro (o freio por contagem de TODAS as mensagens fechava os clientes
      // roteirizados dos testes; este só pega o par que amplifica).
      const a = msg.action && msg.action.a;
      if (a === 'claim' || a === 'unclaim') {
        const agora = Date.now();
        if (agora - (ws.pedidosDesde || 0) > 1000) { ws.pedidosDesde = agora; ws.pedidos = 0; }
        if (++ws.pedidos > 6) return;
      }
      const events = motorDe(room).applyAction(room.game, player.id, msg.action || {});
      // Ação sem efeito (ex.: pedido de compra atrasado) não gera rebroadcast:
      // junto com a chave do timer em scheduleBots, isso impede que spam de
      // mensagens inofensivas congele os bots ou inunde os outros clientes.
      if (events.length > 0) broadcastState(room, events);
      scheduleBots(room);
      break;
    }
    // Chat de voz: o servidor só REPASSA a sinalização do WebRTC (oferta,
    // resposta, candidatos ICE) entre os humanos da mesma sala — o áudio em si
    // vai direto de um navegador ao outro e nunca passa por aqui. `to` é o id
    // de um jogador da sala ou '*' (todos os outros humanos). Robô não recebe,
    // ninguém manda para si mesmo, e nada disso toca o motor.
    case 'voz': {
      const room = currentRoom(ws);
      const player = currentPlayer(ws, room);
      const dados = msg.dados;
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return;
      if (!consume(ws.voiceBudget ||= {}, 100, 30)) return;
      const alvos = room.players.filter((p) => !p.isBot && p.id !== player.id
        && (msg.to === '*' || p.id === msg.to));
      for (const p of alvos) send(p.ws, { t: 'voz', from: player.id, dados });
      break;
    }
    // PRESENÇA: o que o jogador está fazendo ENTRE as jogadas — qual carta da
    // mão está escolhendo (`sel`, índice na mão como ELE a vê; nunca a carta) e
    // para qual cadeira olha (`olha`, índice em players). É o que faz o modelo
    // dele, na mesa 3D dos outros, levar a mão à carta e virar a cabeça — o
    // "quando eu mexo, os outros veem" da referência. O servidor só
    // retransmite, como a voz: não toca no motor, não guarda, não vai para
    // robô nem para quem mandou. Orçamento próprio e curto: isto chega a
    // cada toque e não precisa de mais de meia dúzia por segundo.
    case 'presenca': {
      const room = currentRoom(ws);
      const player = currentPlayer(ws, room);
      if (!room.game) return;
      if (!consume(ws.presencaBudget ||= {}, 12, 6)) return;
      const sel = Number.isInteger(msg.sel) ? msg.sel : null;
      const olha = Number.isInteger(msg.olha) ? msg.olha : null;
      for (const p of room.players) {
        if (p.isBot || p.id === player.id || !p.ws) continue;
        send(p.ws, { t: 'presenca', from: player.id, sel, olha });
      }
      break;
    }
    // EMOTES e frases prontas: para quem está sem microfone ou sem áudio. Só a
    // chave de um catálogo fechado viaja; o servidor confere que ela existe,
    // freia (4 de saída, 1 a cada 2 s) e retransmite aos outros humanos.
    case 'emote': {
      const room = currentRoom(ws);
      const player = currentPlayer(ws, room);
      if (!emoteDe(msg.k)) return;   // vale no lobby também: é onde se espera, e onde se diz "bora"
      if (!consume(ws.emoteBudget ||= {}, 4, 0.5)) return;
      for (const p of room.players) {
        if (p.isBot || p.id === player.id || !p.ws) continue;
        send(p.ws, { t: 'emote', from: player.id, k: msg.k });
      }
      break;
    }
    case 'nextRound': {
      const room = currentRoom(ws);
      currentPlayer(ws, room);
      if (!room.game) return;
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode avançar a rodada.'); e.gameRule = true; throw e; }
      const events = motorDe(room).actNextRound(room.game);
      broadcastState(room, events);
      scheduleBots(room);
      break;
    }
    case 'playAgain': {
      const room = currentRoom(ws);
      currentPlayer(ws, room);
      if (!room.game || room.game.phase !== 'gameEnd') return;
      if (ws.playerId !== hostOf(room)) { const e = new Error('Só quem criou a sala pode recomeçar.'); e.gameRule = true; throw e; }
      // Mesma mesa, mesmos lugares: no dominó, as mesmas duplas.
      const motor = motorDe(room);
      const mesa = room.game.players.map((gp) => room.players.find((p) => p.id === gp.id)).filter(Boolean);
      room.game = motor.createGame(mesa.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot })), { nivelRobos: room.nivelRobos || 'normal' });
      room.gameSeq++;
      const events = motor.startRound(room.game);
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

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
  for (const [ip, bucket] of entradasPorIp) if (Date.now() - bucket.at > 120000) entradasPorIp.delete(ip);
}, 30000);
heartbeat.unref();
server.headersTimeout = 10000;
server.requestTimeout = 15000;
server.maxHeadersCount = 60;
server.listen(PORT, HOST, () => {
  console.log('🃏 Caçamba no ar!');
  console.log(`   Neste computador:  http://localhost:${PORT}`);
  console.log(`   Celulares (mesmo Wi-Fi):  ${LAN_HOST}`);
  if (PUBLIC_URL) console.log(`   Endereço público:  ${PUBLIC_URL}`);
});

// Hospedagens param o processo com SIGTERM e esperam que ele saia sozinho.
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    console.log(`\n${sinal} recebido, encerrando…`);
    // Para os robôs, entrega a cada jogador o ÚLTIMO retrato da sala dele e
    // avisa do reinício — só então fecha. É com esse retrato que a sala renasce
    // no processo que vem depois (ver lib/selo-sala.js).
    for (const room of rooms.values()) {
      if (room.botTimer) clearTimeout(room.botTimer);
      try { enviaSelo(room); for (const p of room.players) if (!p.isBot) send(p.ws, { t: 'reinicio' }); } catch { /* fechar é mais importante */ }
    }
    setTimeout(() => { for (const c of wss.clients) { try { c.close(1012, 'reinicio'); } catch { /* já foi */ } } wss.close(); server.close(() => process.exit(0)); }, 350);
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
