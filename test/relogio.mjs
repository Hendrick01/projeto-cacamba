// Prova do RELÓGIO DA VEZ do Caçamba (opcional, ligado pelo anfitrião no lobby).
// Do ponto de vista de quem está na mesa:
//   1. a sala nasce SEM relógio e o lobby diz quais prazos existem;
//   2. só o anfitrião liga, e só antes de começar;
//   3. na vez de um humano a visão leva `vezMs` e `restaMs` (e some na de robô);
//   4. puxar a carta NÃO devolve tempo — o prazo é da vez inteira;
//   5. quando o prazo vence, chega o evento `tempo`, o jogo puxa e descarta por
//      ele (a mão fica do mesmo tamanho, nada é baixado) e a vez passa;
//   6. na vez seguinte dele o relógio volta inteiro: a vez é dele de novo.
// Rodar com o servidor no ar e o prazo encurtado:
//   CACAMBA_VEZ_MS=1500 RITMO_DOS_ROBOS=0.05 PORT=3055 node server.js
//   node test/relogio.mjs 3055
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (cond, ms = 6000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return true; await espera(40); }
  return false;
};

function cliente(nome) {
  const ws = new WebSocket(URL);
  const c = { nome, ws, eventos: [], erros: [], sessao: null };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'state') { c.view = m.view; for (const e of m.events || []) c.eventos.push(e); }
  });
  return new Promise((res) => ws.on('open', () => res(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
let total = 0;
const falhou = [];
function confere(ok, texto) {
  total++;
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}

const A = await cliente('A');
manda(A, { t: 'create', name: 'Anfitriã' });
await ate(() => A.lobby);
confere(A.lobby.relogio === 0, 'a sala nasce sem relógio');
confere(Array.isArray(A.lobby.relogios) && A.lobby.relogios.includes(60), 'o lobby diz os prazos que existem');

const B = await cliente('B');
manda(B, { t: 'join', code: A.sessao.code, name: 'Visita' });
await ate(() => B.lobby);
manda(B, { t: 'relogio', s: 60 });
await espera(250);
confere(A.lobby.relogio === 0 && B.erros.length === 1, 'quem não criou a sala não liga o relógio');

manda(A, { t: 'relogio', s: 7 });
await espera(250);
confere(A.lobby.relogio === 0, 'prazo fora da lista é recusado (fica sem relógio)');
manda(A, { t: 'relogio', s: 60 });
await ate(() => A.lobby.relogio === 60 && B.lobby.relogio === 60, 2000);
confere(A.lobby.relogio === 60 && B.lobby.relogio === 60, 'o anfitrião liga e o lobby de todos mostra');

manda(A, { t: 'addBot' });
await espera(200);
manda(A, { t: 'start' });
await ate(() => A.view && B.view);
manda(A, { t: 'relogio', s: 0 });
await espera(200);
confere(A.lobby.relogio === 60, 'com a partida andando o relógio não muda mais');

const humanos = { [A.sessao.playerId]: A, [B.sessao.playerId]: B };
const daVez = () => humanos[A.view.turnId];

// espera a vez chegar num humano (o robô joga sozinho, rápido)
confere(await ate(() => daVez() && A.view.phase === 'draw', 15000), 'a vez chegou num humano');
const quem = daVez();
const outro = quem === A ? B : A;
const v0 = quem.view;
confere(v0.vezMs > 0 && v0.restaMs > 0 && v0.restaMs <= v0.vezMs, `a visão leva o prazo (${v0.restaMs} de ${v0.vezMs} ms)`);
confere(outro.view.vezMs === v0.vezMs && outro.view.restaMs > 0, 'quem espera vê o mesmo relógio');
const maoAntes = v0.you.hand.length;
const jogosAntes = v0.players.reduce((n, p) => n + p.melds.length, 0);

// puxa a carta e para: o prazo continua correndo
await espera(Math.min(500, v0.vezMs / 3));
manda(quem, { t: 'action', action: { a: 'draw', source: 'deck' } });
await ate(() => quem.view.phase === 'play', 2000);
confere(quem.view.restaMs < v0.restaMs, `puxar a carta não devolve tempo (${v0.restaMs} → ${quem.view.restaMs} ms)`);

// deixa estourar
const idDeQuem = quem.sessao.playerId;
confere(await ate(() => outro.eventos.some((e) => e.e === 'tempo' && e.p === idDeQuem), v0.vezMs + 3000),
  'quando o prazo vence, a mesa recebe o evento `tempo`');
confere(await ate(() => A.view.turnId !== idDeQuem, 5000), 'o jogo descartou por ele e a vez passou');
confere(quem.view.you.hand.length === maoAntes, `a mão ficou do mesmo tamanho (${maoAntes} cartas)`);
confere(quem.view.players.reduce((n, p) => n + p.melds.length, 0) === jogosAntes, 'nada foi baixado por ele');
confere(!quem.eventos.some((e) => e.e === 'away'), 'não é tratado como quem caiu');

// a vez dele de novo: relógio inteiro, e desta vez ele joga a tempo
const jogaSeForAVez = setInterval(() => {
  const c = daVez();
  if (!c || c === quem) return;
  if (c.view.phase === 'draw') manda(c, { t: 'action', action: { a: 'draw', source: 'deck' } });
  else if (c.view.phase === 'play' && c.view.you?.hand?.length) manda(c, { t: 'action', action: { a: 'discard', cardId: c.view.you.hand[0].id } });
}, 150);
const voltou = await ate(() => A.view.turnId === idDeQuem && A.view.phase === 'draw', 20000);
clearInterval(jogaSeForAVez);
confere(voltou, 'a vez voltou para ele');
confere(quem.view.restaMs > quem.view.vezMs * 0.5, `com o relógio de novo inteiro (${quem.view.restaMs} ms)`);
const tempoAntes = quem.eventos.filter((e) => e.e === 'tempo').length;
manda(quem, { t: 'action', action: { a: 'draw', source: 'deck' } });
await ate(() => quem.view.phase === 'play', 2000);
manda(quem, { t: 'action', action: { a: 'discard', cardId: quem.view.you.hand[0].id } });
await ate(() => A.view.turnId !== idDeQuem, 3000);
await espera(Math.min(2500, v0.vezMs + 600));
confere(quem.eventos.filter((e) => e.e === 'tempo' && e.p === idDeQuem).length === tempoAntes,
  'quem joga a tempo não leva o aviso de tempo esgotado');

for (const c of [A, B]) { try { c.ws.close(); } catch { /* ok */ } }
await espera(200);
console.log(falhou.length ? `\nRELÓGIO DA VEZ FALHOU: ${falhou.length} de ${total}` : `\nRELÓGIO DA VEZ OK: ${total}/${total}`);
process.exit(falhou.length ? 1 : 0);
