// Prova do Mexe-Mexe pelo fio: dois humanos e um robô numa sala de Mexe-Mexe.
// O juiz recusa jogada errada (carta da mesa voltando para a mão, jogo que não
// vale, carta de outro); a vez parada estoura sozinha e quem estava nela
// compra; ninguém vê carta alheia nem no evento da compra; a partida vai até
// alguém bater (ou o monte acabar), e a seguinte abre com quem ganhou.
//   node test/mexemexe.mjs           sobe um servidor próprio, vez de 1,5 s
//   node test/mexemexe.mjs 3041      usa um servidor que já está no ar
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';
import { planejaJogada, jogoVale } from '../shared/mexemexe.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const VEZ = 1500;
let PORT = process.argv.slice(2).find((a) => /^\d+$/.test(a));
let servidor = null, saida = '';
if (!PORT) {
  const livre = net.createServer(); livre.listen(0, '127.0.0.1'); await once(livre, 'listening');
  PORT = livre.address().port; await new Promise((r) => livre.close(r));
  servidor = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PUBLIC_URL: '', TRUST_PROXY: '0', SEGREDO_SALAS: 'chave-do-teste', DATABASE_URL: '', RITMO_DOS_ROBOS: '0.05', MEXE_VEZ_MS: String(VEZ) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stderr.on('data', (d) => { saida += d; });
  await new Promise((ok, erro) => {
    servidor.stdout.on('data', (d) => { saida += d; if (String(d).includes('Caçamba no ar')) ok(); });
    servidor.on('exit', () => erro(new Error(`o servidor não subiu:\n${saida}`)));
  });
}
const HOST = servidor ? '127.0.0.1' : 'localhost';
const URL = `ws://${HOST}:${PORT}`;

function cliente(nome) {
  const ws = new WebSocket(URL, { headers: { origin: `http://${HOST}:${PORT}` } });
  const c = { nome, ws, eventos: [], erros: [], sessao: null, brutos: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'state') { c.view = m.view; c.brutos.push(String(raw)); for (const e of m.events || []) c.eventos.push(e); }
  });
  return new Promise((res) => ws.on('open', () => res(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}
const ids = (cards) => cards.map((x) => x.id);
async function ateMudar(c, antes, ms = 1500) {
  for (let k = 0; k < ms / 15 && c.view.turnNo === antes && c.view.phase === 'play'; k++) await espera(15);
}

const A = await cliente('A');
manda(A, { t: 'create', name: 'Ana', modo: 'mexemexe' });
await espera(300);
confere(A.lobby?.modo === 'mexemexe', 'sala criada no modo Mexe-Mexe');
const code = A.sessao.code;
manda(A, { t: 'start' });
await espera(250);
confere(A.erros.some((e) => /pelo menos/.test(e)), 'Mexe-Mexe não começa sozinho');
const B = await cliente('B'); manda(B, { t: 'join', code, name: 'Bia' });
await espera(250);
manda(A, { t: 'addBot' });
await espera(250);
manda(A, { t: 'start' });
await espera(400);
const humanos = [A, B];
confere(humanos.every((c) => c.view?.modo === 'mexemexe' && c.view.you.hand.length === 11), 'cada humano recebeu 11 cartas');
confere(A.view.monte === 104 - 33 && A.view.mesa.length === 0, 'o resto dos dois baralhos (71) é o monte');
confere(A.view.turnId === A.sessao.playerId, 'a primeira partida abre o anfitrião');
confere(A.view.restaMs > 0 && A.view.restaMs <= VEZ, 'a visão diz quanto falta da vez');

// as recusas do juiz, na vez de Ana
const errosAntes = A.erros.length;
const mao = A.view.you.hand;
manda(A, { t: 'action', action: { a: 'jogar', mesa: [ids(mao.slice(0, 2))] } });
manda(A, { t: 'action', action: { a: 'jogar', mesa: [[...ids(B.view.you.hand.slice(0, 3))]] } });
manda(B, { t: 'action', action: { a: 'comprar' } });
await espera(250);
confere(A.erros.length - errosAntes === 2, `jogo de 2 cartas e carta de outro são recusados (${A.erros.slice(errosAntes).join(' | ')})`);
confere(B.erros.some((e) => /sua vez/.test(e)), 'fora da vez não compra');
confere(A.view.you.hand.length === 11 && A.view.mesa.length === 0, 'nada mudou com as recusas');

// a vez de Ana estoura: compra 1 sozinha e passa
const vezDaAna = A.view.turnNo;
await espera(VEZ + 400);
confere(A.eventos.some((e) => e.e === 'estourou' && e.p === A.sessao.playerId), 'a vez parada estourou');
confere(A.view.you.hand.length === 12 && A.view.turnNo > vezDaAna, 'quem deixou o tempo acabar comprou 1 e a vez passou');
const compra = B.eventos.find((e) => e.e === 'comprou' && e.p === A.sessao.playerId);
confere(compra && !('ids' in compra) && !('cards' in compra), 'o evento da compra não diz qual carta foi');
// a mesa ainda está vazia: nenhuma carta da mão de Ana pode ter chegado a Bia
const cartaNoFio = (r, c) => r.includes(`{"id":${c.id},"rank":${c.rank},"suit":${c.suit}}`);
confere(B.brutos.every((r) => !A.view.you.hand.some((c) => cartaNoFio(r, c))), 'nenhuma carta da mão de Ana viajou para Bia');
const vazou = B.brutos.some((r) => { const v = JSON.parse(r).view; return v.players.some((p) => p.hand); });
confere(!vazou, 'a visão de Bia não traz a mão de ninguém');

const errosDoComeco = humanos.map((c) => c.erros.length);
// Joga como o robô normal, pelos dois humanos, até a partida acabar. Cada
// jogada é a mesa inteira, como a tela manda.
async function jogaAteAcabar() {
  for (let i = 0; i < 600; i++) {
    const v = A.view;
    if (v.phase !== 'play') return v.phase;
    const daVez = humanos.find((c) => c.sessao.playerId === v.turnId);
    const antes = v.turnNo;
    if (daVez) {
      const plano = planejaJogada(daVez.view.mesa.map((j) => j.cards), daVez.view.you.hand);
      if (plano.usadas) manda(daVez, { t: 'action', action: { a: 'jogar', mesa: plano.mesa.map(ids) } });
      else manda(daVez, { t: 'action', action: { a: 'comprar' } });
    }
    await ateMudar(A, antes, daVez ? 1500 : 3000);
    if (!A.view.mesa.every((j) => jogoVale(j.cards))) return 'mesa inválida';
  }
  return 'travou';
}
const fim = await jogaAteAcabar();
confere(fim === 'roundEnd', `a partida chegou ao fim (${fim})`);
const lr = A.view.lastRound;
confere(lr && lr.vencedores.length >= 1, `motivo: ${lr?.motivo}, ganhou: ${lr?.vencedores.map((id) => A.view.players.find((p) => p.id === id)?.name).join(', ')}`);
if (lr?.motivo === 'bateu') confere(lr.maos.find((m) => m.id === lr.vencedores[0]).n === 0, 'quem bateu ficou sem cartas');
const total = A.view.monte + A.view.players.reduce((s, p) => s + p.handCount, 0) + A.view.mesa.reduce((s, j) => s + j.cards.length, 0);
confere(total === 104, 'nenhuma carta sumiu nem duplicou');
const recusas = humanos.flatMap((c, i) => c.erros.slice(errosDoComeco[i]));
confere(recusas.length === 0, `nenhuma jogada de verdade recusada pelo juiz${recusas.length ? `: ${recusas.join(' | ')}` : ''}`);

manda(B, { t: 'nextRound' });
await espera(200);
confere(B.erros.some((e) => /Só quem criou/.test(e)), 'só o anfitrião começa outra partida');
manda(A, { t: 'nextRound' });
await espera(400);
confere(A.view.phase === 'play' && A.view.round === 1, 'a segunda partida começou');
// pelo evento, não pela vez: se quem ganhou é o robô, ele já jogou
const comeco = A.eventos.find((e) => e.e === 'roundStart' && e.round === 1);
confere(comeco?.first === lr.vencedores[0], 'quem ganhou abre a seguinte');
const vencedor = A.view.players.find((p) => p.id === lr.vencedores[0]);
confere(vencedor.vitorias === 1, 'a vitória ficou contada para o placar');

for (const c of humanos) c.ws.close();
servidor?.kill();
console.log(falhou.length ? `\nMEXE-MEXE FALHOU: ${falhou.length}` : '\nMEXE-MEXE OK');
process.exit(falhou.length ? 1 : 0);
