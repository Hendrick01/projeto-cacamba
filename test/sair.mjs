// Prova do `leave`: dois humanos numa sala, um sai no meio da partida.
// O que precisa acontecer, do ponto de vista de quem FICOU:
//   1. chega o evento `desistiu` com o id de quem saiu;
//   2. quem saiu aparece marcado (`desistiu: true`) na visão;
//   3. o jogo NÃO trava — o robô assume o assento e os turnos continuam;
//   4. quem saiu não consegue voltar com o token antigo.
// Rodar com o servidor no ar:
//   node test/sair.mjs [porta]
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function cliente(nome) {
  const ws = new WebSocket(URL);
  const c = { nome, ws, eventos: [], estados: [], sessao: null, fechou: false, gone: false };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'gone') c.gone = true;
    if (m.t === 'state') {
      c.view = m.view;
      c.estados.push(m.view);
      for (const e of m.events || []) c.eventos.push(e);
    }
  });
  ws.on('close', () => { c.fechou = true; });
  return new Promise((res) => ws.on('open', () => res(c)));
}

const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}

const A = await cliente('A');
manda(A, { t: 'create', name: 'Quem Sai' });
await espera(300);
const code = A.sessao.code;

const B = await cliente('B');
manda(B, { t: 'join', code, name: 'Quem Fica' });
await espera(300);
manda(A, { t: 'addBot' });
await espera(200);
manda(A, { t: 'start' });
await espera(600);

confere(!!B.view, 'a partida começou e B recebeu a mesa');
const idQueSai = A.sessao.playerId;
const tokenAntigo = A.sessao.token;

// A desiste no meio da partida
manda(A, { t: 'leave' });
await espera(600);

confere(A.gone, 'quem saiu recebeu `gone`');
confere(B.eventos.some((e) => e.e === 'desistiu' && e.p === idQueSai),
  'quem ficou recebeu o evento `desistiu`');
const naVisao = B.view.players.find((p) => p.id === idQueSai);
confere(!!naVisao && naVisao.desistiu === true,
  'quem saiu continua no assento, marcado como desistiu');

// O jogo tem que seguir sozinho: o robô assume o assento vago. B joga a vez
// dele (senão o jogo espera por B, que é humano e está presente), e a gente
// observa a vez PASSAR pelo assento de quem saiu em vez de travar nele.
const vezes = [];
const seguir = setInterval(() => {
  const v = B.view;
  if (!v) return;
  if (v.turnId && vezes[vezes.length - 1] !== v.turnId) vezes.push(v.turnId);
  if (v.turnId !== B.sessao.playerId) return;
  if (v.phase === 'draw') manda(B, { t: 'action', action: { a: 'draw', source: 'deck' } });
  else if (v.phase === 'play' && v.you?.hand?.length) {
    manda(B, { t: 'action', action: { a: 'discard', cardId: v.you.hand[0].id } });
  }
}, 350);
await espera(14000);
clearInterval(seguir);

const passouPorQuemSaiu = vezes.indexOf(idQueSai);
confere(passouPorQuemSaiu >= 0, 'a vez chegou ao assento de quem saiu');
confere(passouPorQuemSaiu >= 0 && vezes.length > passouPorQuemSaiu + 1,
  `o robô jogou por ele e a vez seguiu (${vezes.length} trocas de vez observadas)`);

// E o token antigo não volta mais.
const C = await cliente('C');
manda(C, { t: 'resume', code, playerId: idQueSai, token: tokenAntigo });
await espera(400);
confere(C.gone, 'o token antigo não serve mais para voltar');

for (const c of [A, B, C]) { try { c.ws.close(); } catch { /* ok */ } }
await espera(200);

console.log(falhou.length ? `\nSAIR DA PARTIDA FALHOU: ${falhou.length} de 7` : '\nSAIR DA PARTIDA OK: 7/7');
process.exit(falhou.length ? 1 : 0);
