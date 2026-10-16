// Prova da Canastra pelo fio: dois humanos e dois robôs numa sala 2v2 da
// Canastra do 3. O anfitrião escolhe a variante e arruma as duplas; o juiz
// recusa jogada fora da vez e fora da fase; ninguém vê a mão nem o morto
// alheio; os humanos jogam de verdade (compram, pegam o lixo, baixam,
// descartam) até a rodada acabar, e a seguinte abre com o próximo da mesa.
//   node test/canastra.mjs           sobe um servidor próprio
//   node test/canastra.mjs 3051      usa um servidor que já está no ar
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';
import { jogosFirmesDe, analisaJogo, ehCoringa, somaNaAbertura, regrasDa, CORINGAS_POR_BARALHO } from '../shared/canastra.js';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let PORT = process.argv.slice(2).find((a) => /^\d+$/.test(a));
let servidor = null, saida = '';
if (!PORT) {
  const livre = net.createServer(); livre.listen(0, '127.0.0.1'); await once(livre, 'listening');
  PORT = livre.address().port; await new Promise((r) => livre.close(r));
  servidor = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', PUBLIC_URL: '', TRUST_PROXY: '0', SEGREDO_SALAS: 'chave-do-teste', DATABASE_URL: '', RITMO_DOS_ROBOS: '0.05' },
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
const momento = (v) => `${v.round}/${v.turnNo}/${v.phase}/${v.you.hand.length}`;
async function ateMudar(c, antes, ms = 3000) {
  for (let k = 0; k < ms / 15 && momento(c.view) === antes; k++) await espera(15);
}

const A = await cliente('A');
manda(A, { t: 'create', name: 'Ana', modo: 'canastra' });
await espera(300);
confere(A.lobby?.modo === 'canastra', 'sala criada no modo Canastra');
confere(A.lobby?.formato === '2v2' && A.lobby?.variante === 'convencional', 'começa em 2v2, convencional');
const code = A.sessao.code;
const B = await cliente('B'); manda(B, { t: 'join', code, name: 'Bia' });
await espera(250);
manda(B, { t: 'variante', v: 'do3' });
await espera(150);
confere(B.erros.some((e) => /Só quem criou/.test(e)) && A.lobby.variante === 'convencional', 'só o anfitrião escolhe a variante');
manda(A, { t: 'variante', v: 'nenhuma' });
manda(A, { t: 'variante', v: 'do3' });
await espera(200);
confere(A.lobby.variante === 'do3' && B.lobby.variante === 'do3', 'a variante do 3 chegou aos dois');
// Bia sentou na cadeira 2 (adversária): o anfitrião a põe na 3, à sua frente
confere(A.lobby.cadeiras[1] === B.sessao.playerId, 'Bia sentou na segunda cadeira');
manda(A, { t: 'cadeira', de: 1, para: 2 });
await espera(200);
confere(A.lobby.cadeiras[2] === B.sessao.playerId, 'o anfitrião pôs Bia de parceira');
manda(A, { t: 'start' });
await espera(500);

const humanos = [A, B];
const v0 = A.view;
confere(v0?.modo === 'canastra' && v0.variante === 'do3' && v0.formato === '2v2', 'a partida é a Canastra do 3 em 2v2');
confere(v0.players.length === 4 && v0.players.filter((p) => p.isBot).length === 2, 'as cadeiras vagas viraram robô');
confere(A.view.you.lado === B.view.you.lado, 'Ana e Bia estão do mesmo lado');
const R = regrasDa('do3');
const TOTAL = R.baralhos['2v2'] * (52 + CORINGAS_POR_BARALHO);
confere(humanos.every((c) => c.view.you.hand.length === R.cartasNaMao), `cada humano tem ${R.cartasNaMao} cartas`);
confere(humanos.every((c) => !c.view.you.hand.some((x) => x.rank === 3 && (x.suit === 1 || x.suit === 2))), 'nenhum 3 vermelho ficou na mão');
confere(v0.semMorto === true && v0.minimoDaAbertura === 75, 'na do 3 não tem morto e a abertura é 75');
const tres = v0.lados.reduce((s, l) => s + l.tresVermelhos.length, 0);
confere(v0.monte === TOTAL - 4 * R.cartasNaMao - tres, `${R.baralhos['2v2']} baralhos: o monte tem ${v0.monte} (${TOTAL} − ${4 * R.cartasNaMao} nas mãos − ${tres} reposições)`);
confere(v0.turnId === A.sessao.playerId && v0.phase === 'draw', 'a primeira rodada abre o anfitrião, comprando');

// as recusas do juiz
const errosAntes = A.erros.length;
manda(B, { t: 'action', action: { a: 'comprar' } });
manda(A, { t: 'action', action: { a: 'descartar', id: A.view.you.hand[0].id } });
manda(A, { t: 'action', action: { a: 'pegarLixo', jogos: [] } });
await espera(250);
confere(B.erros.some((e) => /sua vez/.test(e)), 'fora da vez não compra');
confere(A.erros.slice(errosAntes).some((e) => /Primeiro compre/.test(e)), 'não descarta antes de comprar');
confere(A.erros.slice(errosAntes).some((e) => /lixo está vazio/.test(e)), 'não pega lixo vazio');

// ninguém vê a mão nem o morto de ninguém
const cartaNoFio = (r, c) => r.includes(`{"id":${c.id},"rank":${c.rank},"suit":${c.suit}}`);
confere(B.brutos.every((r) => !A.view.you.hand.some((c) => cartaNoFio(r, c))), 'nenhuma carta da mão de Ana viajou para Bia');
confere(B.brutos.every((r) => !r.includes('"morto":[')), 'o morto de ninguém viaja');

// Os humanos jogam de verdade, sempre dentro da regra: compram (ou levam o
// lixo quando a carta de cima fecha um jogo), baixam jogos firmes quando o
// lado já abriu ou quando eles somam a abertura, e descartam.
let pegouLixo = 0, baixou = 0;
function jogada(v) {
  const eu = v.you;
  const lado = v.lados[eu.lado];
  const limpa = lado.jogos.some((j) => j.canastra && j.limpa);
  const preso = eu.pegouMorto && !limpa;   // sem poder bater: guarda 2 cartas
  if (v.phase === 'draw') {
    const topo = v.lixo[v.lixo.length - 1];
    // na do 3 só pega o lixo quem já abriu, e a de cima forma jogo novo
    if (topo && !v.lixoTrancado && !ehCoringa(topo) && lado.jogos.length) {
      const jogo = jogosFirmesDe([...eu.hand, topo], v.variante).find((j) => j.some((x) => x.id === topo.id));
      const fica = eu.hand.length - (jogo ? jogo.length - 1 : 0) + v.lixo.length - 1;
      if (jogo && (!preso || fica >= 2)) { pegouLixo++; return { a: 'pegarLixo', jogos: [ids(jogo)] }; }
    }
    return { a: 'comprar' };
  }
  const jogos = jogosFirmesDe(eu.hand, v.variante);
  const soma = somaNaAbertura(jogos, v.variante);
  const usadas = jogos.flat().length;
  if (jogos.length && (lado.jogos.length || soma >= v.minimoDaAbertura) && (!preso || eu.hand.length - usadas >= 2)) {
    baixou++;
    return { a: 'baixar', jogos: jogos.map(ids) };
  }
  if (preso && eu.hand.length === 1) return null;   // não acontece: guardamos 2
  const c = eu.hand.find((x) => x.rank === 3) || eu.hand.find((x) => !ehCoringa(x)) || eu.hand[0];
  return { a: 'descartar', id: c.id };
}

const errosDoComeco = humanos.map((c) => c.erros.length);
async function jogaAteAcabar() {
  for (let i = 0; i < 3000; i++) {
    const v = A.view;
    if (v.phase !== 'draw' && v.phase !== 'play') return v.phase;
    const daVez = humanos.find((c) => c.sessao.playerId === v.turnId);
    // a visão de quem joga pode chegar um instante depois da de Ana
    if (daVez) for (let k = 0; k < 100 && (daVez.view.turnNo !== v.turnNo || daVez.view.phase !== v.phase); k++) await espera(10);
    const antes = momento(A.view);
    if (daVez) {
      const acao = jogada(daVez.view);
      if (!acao) return 'humano sem jogada';
      manda(daVez, { t: 'action', action: acao });
    }
    await ateMudar(A, antes, daVez ? 2000 : 4000);
    for (const l of A.view.lados) if (!l.jogos.every((j) => analisaJogo(j.cards, A.view.variante).ok)) return 'mesa inválida';
  }
  return 'travou';
}
const fim = await jogaAteAcabar();
confere(fim === 'roundEnd' || fim === 'gameEnd', `a rodada chegou ao fim (${fim}); os humanos levaram o lixo ${pegouLixo}× e baixaram ${baixou}×`);
const recusas = humanos.flatMap((c, i) => c.erros.slice(errosDoComeco[i]));
confere(recusas.length === 0, `nenhuma jogada de verdade recusada pelo juiz${recusas.length ? `: ${recusas.join(' | ')}` : ''}`);
const lr = A.view.lastRound;
confere(lr && lr.lados.length === 2, `motivo: ${lr?.motivo}; conta: ${lr?.lados.map((l) => `${l.total} (placar ${l.pontos})`).join(' × ')}`);
confere(lr.lados.every((l) => l.cravado || l.total === l.mesa + l.canastras + l.batida + l.tres + l.mao + l.mortos), 'a conta de cada lado fecha');
if (lr.motivo === 'bateu') confere(lr.maos.find((m) => m.id === lr.por).cards.length === 0, 'quem bateu ficou sem cartas');
const vf = A.view;
const naMesa = vf.lados.reduce((s, l) => s + l.tresVermelhos.length + l.jogos.reduce((u, j) => u + j.cards.length, 0), 0);
const nasMaos = lr.maos.reduce((s, m) => s + m.cards.length, 0);
const mortos = lr.maos.filter((m) => !m.pegouMorto).length * R.cartasNoMorto;
confere(vf.monte + vf.lixo.length + naMesa + nasMaos + mortos === TOTAL, 'nenhuma carta sumiu nem duplicou');
confere(lr.lados.every((l) => !l.cravado || l.total === -500), 'quem ficou sem canastra limpa levou −500 cravado');

if (fim === 'roundEnd') {
  manda(B, { t: 'nextRound' });
  await espera(200);
  confere(B.erros.some((e) => /Só quem criou/.test(e)), 'só o anfitrião começa a próxima rodada');
  manda(A, { t: 'nextRound' });
  await espera(400);
  const comeco = A.eventos.find((e) => e.e === 'roundStart' && e.round === 1);
  confere(A.view.round === 1 && comeco?.first === A.view.players[1].id, 'a segunda rodada abre o próximo da mesa');
  confere(A.view.lados.every((l, i) => l.pontos === lr.lados[i].pontos), 'o placar passou para a rodada seguinte');
}

for (const c of humanos) c.ws.close();
servidor?.kill();
console.log(falhou.length ? `\nCANASTRA FALHOU: ${falhou.length}` : '\nCANASTRA OK');
process.exit(falhou.length ? 1 : 0);
