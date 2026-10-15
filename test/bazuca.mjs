// Prova do Bazuca pelo fio, com servidor próprio (robôs no ritmo de teste):
//   1. a sala nasce no modo Bazuca e aceita o nível difícil;
//   2. não passa de 6 na mesa;
//   3. na espiada, cada um vê só as DUAS de perto, e só as dele;
//   4. nenhuma visão traz valor de carta virada (o jogo não ajuda);
//   5. o descarte rápido fora da vez é aceito (certo ou errado, com punição);
//   6. duas rodadas inteiras com 2 humanos e robôs difíceis, sem jogada
//      recusada pelo juiz, e a contagem de vitórias fecha;
//   7. BAZUCA gritado na vez acaba a rodada na hora, sem punição.
//   node test/bazuca.mjs
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';

const livre = net.createServer(); livre.listen(0, '127.0.0.1'); await once(livre, 'listening');
const port = livre.address().port; await new Promise((r) => livre.close(r));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_URL: '', TRUST_PROXY: '0', SEGREDO_SALAS: 'chave-do-teste', DATABASE_URL: '', RITMO_DOS_ROBOS: '0.05' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let saida = '';
servidor.stderr.on('data', (d) => { saida += d; });
await new Promise((ok, erro) => {
  servidor.stdout.on('data', (d) => { saida += d; if (String(d).includes('Caçamba no ar')) ok(); });
  servidor.on('exit', () => erro(new Error(`o servidor não subiu:\n${saida}`)));
});

const vazamentos = [];
function cliente(nome) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: `http://127.0.0.1:${port}` } });
  const c = { nome, ws, erros: [], eventos: [], sessao: null, lobby: null, view: null, views: 0 };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'state') {
      c.view = m.view; c.views++;
      for (const e of m.events || []) c.eventos.push(e);
      // 4. carta virada nunca chega com valor, fora do fim da rodada (ou da partida)
      if (m.view.phase !== 'roundEnd' && m.view.phase !== 'gameEnd' && m.view.players.some((p) => p.slots.some((x) => x !== true && x !== false))) vazamentos.push(`${nome}: slot com valor`);
      if (m.view.you?.espiadas.some((e) => m.view.phase === 'espiar' && e.p !== m.view.you.id)) vazamentos.push(`${nome}: espiada de outro na abertura`);
    }
  });
  ws.on('error', () => {});
  return new Promise((res) => ws.on('open', () => res(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const id = (c) => c.sessao?.playerId;
const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}
async function ate(pred, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (pred()) return true; await espera(10); }
  return false;
}
const cheias = (p) => p.slots.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);

// Um humano simples: compra e descarta a comprada; usa o poder na primeira
// carta que der; entrega a primeira carta quando deve.
function lance(c) {
  const v = c.view;
  if (!v || v.phase !== 'play') return null;
  const eu = v.players.find((p) => p.id === id(c));
  if (v.you.devo) return { a: 'dar', j: cheias(eu)[0] };
  if (v.turnId !== id(c)) return null;
  if (v.etapa === 'comprar') return { a: 'comprar' };
  if (v.etapa === 'decidir') return { a: 'descartarComprada' };
  const outro = v.players.find((p) => p.id !== id(c) && cheias(p).length);
  if (v.poder === 'J') return { a: 'espiar', i: cheias(eu)[0] };
  if (v.poder === 'Q') return { a: 'olhar', p: outro.id, i: cheias(outro)[0] };
  return { a: 'rei', i: cheias(eu)[0], p: outro.id, j: cheias(outro)[0] };
}

try {
  // 1. sala de bazuca, nível difícil
  const A = await cliente('A');
  manda(A, { t: 'create', name: 'Ana', modo: 'bazuca' });
  await ate(() => A.lobby);
  confere(A.lobby?.modo === 'bazuca', 'sala criada no modo Bazuca');
  manda(A, { t: 'nivelRobos', nivel: 'dificil' });
  await ate(() => A.lobby?.nivelRobos === 'dificil');
  confere(A.lobby?.nivelRobos === 'dificil', 'aceita robôs difíceis');

  // 2. teto de 6
  const B = await cliente('B');
  manda(B, { t: 'join', code: A.lobby.code, name: 'Beto' });
  await ate(() => B.lobby);
  for (let k = 0; k < 5; k++) manda(A, { t: 'addBot' });
  await espera(300);
  confere(A.lobby.players.length === 6, `para em 6 na mesa (${A.lobby.players.length})`);
  confere(A.erros.some((e) => /cheia/.test(e)), 'o 7º é recusado: sala cheia');
  A.erros.length = 0;
  manda(A, { t: 'removeBot', botId: A.lobby.players.filter((p) => p.isBot).at(-1).id });
  manda(A, { t: 'removeBot', botId: A.lobby.players.filter((p) => p.isBot).at(-2).id });
  await ate(() => A.lobby.players.length === 4);

  // 3. a espiada
  manda(A, { t: 'start' });
  await ate(() => A.view && B.view);
  confere(A.view?.phase === 'espiar', 'começa na espiada');
  confere(JSON.stringify(A.view.you.espiadas.map((e) => e.i).sort()) === '[2,3]', 'vê as duas de perto (posições 2 e 3)');
  confere(A.view.you.espiadas.every((e) => e.p === id(A) && e.card), '…e só as dele');
  confere(A.view.prazoMs > 3000 && A.view.prazoMs <= 5000, `por 5 s (${A.view.prazoMs} ms)`);
  confere(A.view.topo === null, 'sem carta virada no meio');
  const tentou = await ate(() => A.view.phase === 'play', 7000);
  confere(tentou, 'depois de 5 s o jogo começa');
  confere(A.view.you.espiadas.length === 0, 'e as cartas viram de volta');

  // 5 e 6. duas rodadas
  let rodadas = 0, tentouRapido = false, gritou = false;
  const fim = Date.now() + 150000;
  while (rodadas < 2 && Date.now() < fim) {
    // 7. na segunda rodada a Ana grita na primeira vez dela
    if (!gritou && A.view?.round === 1 && A.view.phase === 'play' && A.view.turnId === id(A) && !A.view.you.devo && !A.view.dividas.length) {
      gritou = true;
      manda(A, { t: 'action', action: { a: 'bazuca' } });
      await ate(() => A.view.phase !== 'play', 2000);
    }
    for (const c of [A, B]) {
      const a = lance(c);
      if (a && c.ultimo !== JSON.stringify([c.view.turnNo, c.view.etapa, c.views, a])) {
        c.ultimo = JSON.stringify([c.view.turnNo, c.view.etapa, c.views, a]);
        manda(c, { t: 'action', action: a });
      }
    }
    // B tenta um descarte rápido fora da vez numa carta da Ana, uma vez
    if (!tentouRapido && B.view?.phase === 'play' && B.view.topo && B.view.turnId !== id(B) && !B.view.you.devo) {
      tentouRapido = true;
      const ana = B.view.players.find((p) => p.id === id(A));
      manda(B, { t: 'action', action: { a: 'descartar', p: id(A), i: cheias(ana)[0] } });
    }
    if (A.view?.phase === 'roundEnd') {
      rodadas++;
      const r = A.view.round;
      if (rodadas < 2) { manda(A, { t: 'nextRound' }); await ate(() => A.view.round > r, 3000); }
    }
    await espera(20);
  }
  confere(rodadas === 2, `duas rodadas inteiras (${rodadas})`);
  const rapido = B.eventos.find((e) => (e.e === 'rapido' || e.e === 'errou') && e.quem === id(B));
  confere(!!rapido, `o descarte rápido fora da vez foi julgado (${rapido?.e})`);
  if (rapido?.e === 'errou') confere(B.eventos.some((e) => e.e === 'punicao' && e.p === id(B)), 'errou: leva mais uma');
  const fins = A.eventos.filter((e) => e.e === 'roundEnd');
  const vit = A.view.players.reduce((n, p) => n + p.vitorias, 0);
  confere(vit === fins.filter((f) => f.vencedor).length, `vitórias batem com as rodadas (${vit})`);
  confere(fins.every((f) => ['bateu', 'bazuca', 'monte'].includes(f.motivo)), `motivos: ${fins.map((f) => f.motivo).join(', ')}`);
  confere(A.eventos.some((e) => e.e === 'rapido' || e.e === 'errou'), 'houve descarte rápido na mesa');
  const iGrito = A.eventos.findIndex((e) => e.e === 'bazuca' && e.p === id(A));
  if (gritou) {
    const depois = A.eventos.slice(iGrito + 1);
    confere(iGrito >= 0 && depois[0]?.e === 'roundEnd' && depois[0].motivo === 'bazuca', 'bazuca na vez acaba a rodada na hora');
    confere(!depois.slice(0, 1).some((e) => e.e === 'punicao'), 'e sem carta de punição');
    confere(A.view.lastRound?.gritou === id(A), 'o fim da rodada diz quem gritou');
  } else confere(rodadas < 2 || A.view.round > 1, 'a Ana não pegou a vez na 2ª rodada (bateram antes)');
  confere(vazamentos.length === 0, `nenhuma visão vazou carta virada ${vazamentos.slice(0, 3).join(' | ')}`);
  const recusas = [...A.erros, ...B.erros];
  confere(recusas.length === 0, `nenhuma jogada recusada (${recusas.slice(0, 3).join(' | ')})`);
} catch (e) {
  console.error(e);
  falhou.push(String(e));
} finally {
  servidor.kill();
}
if (/erro no relógio|erro de bot/.test(saida)) { console.log(saida); falhou.push('erro no servidor'); }
console.log(falhou.length ? `\n${falhou.length} falha(s)` : '\ntudo certo');
process.exit(falhou.length ? 1 : 0);
