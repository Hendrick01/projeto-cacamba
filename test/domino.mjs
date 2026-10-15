// Prova do Dominó pelo fio, com servidor próprio (robôs no ritmo de teste):
//   1. a sala nasce no modo Dominó, com quatro cadeiras;
//   2. só o anfitrião troca os lugares, e é assim que se escolhe a dupla;
//   3. a sala não passa de 4;
//   4. começa com 2 humanos e os robôs completam a mesa, nas cadeiras vagas;
//   5. a partida vai até 240 — os humanos jogam, os robôs jogam, o anfitrião
//      chama a próxima mão — sem nenhuma jogada recusada pelo juiz;
//   6. "jogar de novo" mantém as mesmas duplas;
//   7. sala sem modo continua nascendo Caçamba.
//   node test/domino.mjs
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';

const livre = net.createServer(); livre.listen(0, '127.0.0.1'); await once(livre, 'listening');
const port = livre.address().port; await new Promise((r) => livre.close(r));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_URL: '', TRUST_PROXY: '0', SEGREDO_SALAS: 'chave-do-teste', DATABASE_URL: '', RITMO_DOS_ROBOS: '0.01' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let saida = '';
servidor.stderr.on('data', (d) => { saida += d; });
await new Promise((ok, erro) => {
  servidor.stdout.on('data', (d) => { saida += d; if (String(d).includes('Caçamba no ar')) ok(); });
  servidor.on('exit', () => erro(new Error(`o servidor não subiu:\n${saida}`)));
});

function cliente(nome) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: `http://127.0.0.1:${port}` } });
  const c = { nome, ws, erros: [], eventos: [], sessao: null, lobby: null, view: null };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'state') { c.view = m.view; for (const e of m.events || []) c.eventos.push(e); }
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

try {
  // 7. Caçamba continua sendo o padrão
  const K = await cliente('K');
  manda(K, { t: 'create', name: 'Caçambeiro' });
  await ate(() => K.lobby);
  confere(K.lobby?.modo === 'cacamba' && !K.lobby.cadeiras, 'sala sem modo nasce Caçamba, sem cadeiras');
  K.ws.close();

  // 1. sala de dominó
  const A = await cliente('A');
  manda(A, { t: 'create', name: 'Ana', modo: 'domino' });
  await ate(() => A.lobby);
  confere(A.lobby?.modo === 'domino', 'sala criada no modo Dominó');
  confere(JSON.stringify(A.lobby?.cadeiras) === JSON.stringify([id(A), null, null, null]), 'quatro cadeiras, a anfitriã na primeira');

  const B = await cliente('B');
  manda(B, { t: 'join', code: A.sessao.code, name: 'Bia' });
  await ate(() => A.lobby?.cadeiras?.[1] === id(B));
  confere(A.lobby.cadeiras[1] === id(B), 'quem entra senta na primeira vaga');
  confere(B.lobby?.modo === 'domino', 'quem entra pelo código vê o modo da sala');

  // 2. trocar de lugar
  manda(B, { t: 'cadeira', de: 1, para: 2 });
  await ate(() => B.erros.length);
  confere(B.erros.some((e) => /Só quem criou/.test(e)), 'convidada não troca lugares');
  manda(A, { t: 'cadeira', de: 1, para: 2 });
  await ate(() => A.lobby.cadeiras[2] === id(B));
  confere(JSON.stringify(A.lobby.cadeiras) === JSON.stringify([id(A), null, id(B), null]), 'a anfitriã põe a Bia de frente: viram dupla');
  confere(A.lobby.hostId === id(A), 'trocar de lugar não troca o anfitrião');

  // 3. não passa de 4
  const C = await cliente('C'); manda(C, { t: 'join', code: A.sessao.code, name: 'Caio' });
  const D = await cliente('D'); manda(D, { t: 'join', code: A.sessao.code, name: 'Davi' });
  await ate(() => A.lobby.cadeiras.every(Boolean));
  confere(A.lobby.cadeiras[1] === id(C) && A.lobby.cadeiras[3] === id(D), 'os que chegam ocupam as vagas, sem tirar ninguém do lugar');
  const E = await cliente('E'); manda(E, { t: 'join', code: A.sessao.code, name: 'Edu' });
  await ate(() => E.erros.length);
  confere(E.erros.some((e) => /cheia \(4/.test(e)), 'o quinto não entra: a mesa é de 4');
  E.ws.close();
  manda(C, { t: 'leave' }); manda(D, { t: 'leave' });
  await ate(() => A.lobby.players.length === 2);
  confere(JSON.stringify(A.lobby.cadeiras) === JSON.stringify([id(A), null, id(B), null]), 'quem sai deixa a cadeira vaga');

  // 4. começa com robôs completando
  manda(A, { t: 'start' });
  await ate(() => A.view && B.view);
  const v0 = A.view;
  confere(v0?.modo === 'domino' && v0.players.length === 4, 'a partida começa com 4 na mesa');
  confere(v0 && v0.players[0].id === id(A) && v0.players[2].id === id(B), 'a ordem da mesa é a das cadeiras');
  confere(v0 && v0.players[1].isBot && v0.players[3].isBot, 'as cadeiras vagas viraram robô');
  confere(v0 && A.view.you.time === B.view.you.time && v0.players[1].time !== A.view.you.time, 'Ana e Bia são dupla contra os dois robôs');
  confere(v0 && A.view.you.hand.length === 7 && B.view.you.hand.length === 7, 'sete pedras para cada um');

  // 5. até o fim
  const humanos = [A, B];
  let maos = 1;
  const inicio = Date.now();
  let travou = false;
  while (A.view.phase !== 'gameEnd') {
    if (Date.now() - inicio > 120000) { travou = true; break; }
    const v = A.view;
    if (v.phase === 'roundEnd') {
      const r = v.round;
      manda(A, { t: 'nextRound' });
      await ate(() => A.view.round > r || A.view.phase === 'gameEnd');
      maos++;
      continue;
    }
    const daVez = humanos.find((c) => id(c) === v.turnId);
    if (daVez) {
      const meu = daVez.view;
      if (meu.turnNo !== v.turnNo || meu.turnId !== id(daVez)) { await espera(5); continue; }
      const j = meu.you.jogadas[0];
      const antes = v.turnNo;
      manda(daVez, { t: 'action', action: j ? { a: 'jogar', pedraId: j.pedraId, ramo: j.ramo } : { a: 'passar' } });
      await ate(() => A.view.turnNo !== antes || A.view.phase !== 'play' || A.view.round !== v.round);
    } else {
      await espera(10);
    }
  }
  const vf = A.view;
  confere(!travou, `a partida chegou ao fim (${maos} mãos, ${Math.round((Date.now() - inicio) / 1000)} s)`);
  confere(vf.phase === 'gameEnd' && vf.vencedor !== null && vf.times[vf.vencedor] >= 240, `uma dupla chegou a 240: ${vf.times.join(' × ')}`);
  confere(humanos.every((c) => c.erros.every((e) => /Só quem criou|cheia/.test(e))), 'nenhuma jogada recusada pelo juiz');
  const tipos = new Set(A.eventos.map((e) => e.e));
  confere(tipos.has('jogou') && tipos.has('marcou') && (tipos.has('bateu') || tipos.has('trancou')), `houve pedra, ponto e fim de mão (${[...tipos].join(', ')})`);
  confere(B.view.phase === 'gameEnd' && B.view.times.join() === vf.times.join(), 'a parceira vê o mesmo placar final');

  // 6. jogar de novo, mesmas duplas
  const ordem = vf.players.map((p) => p.id).join();
  manda(B, { t: 'playAgain' });
  await espera(150);
  confere(B.view.phase === 'gameEnd', 'só o anfitrião recomeça');
  manda(A, { t: 'playAgain' });
  await ate(() => A.view.phase === 'play' && A.view.round === 0);
  confere(A.view.phase === 'play' && A.view.round === 0 && A.view.times.join() === '0,0', 'partida nova, placar zerado');
  confere(A.view.players.map((p) => p.id).join() === ordem, 'mesmas cadeiras, mesmas duplas');

  for (const c of [A, B]) c.ws.close();
} catch (e) {
  console.error(e);
  falhou.push(String(e?.message || e));
} finally {
  servidor.kill('SIGTERM');
}
console.log(falhou.length ? `\nDOMINÓ FALHOU: ${falhou.length}` : '\nDOMINÓ OK');
process.exit(falhou.length ? 1 : 0);
