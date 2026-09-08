// Ferramenta de QA, não teste: o irmão do `mesa-qa.mjs` que também JOGA a
// minha vez (puxa do monte, tenta baixar, descarta) até a mesa encher de jogos
// baixados — é o jeito curto de ver a mesa 3D com oito jogadores e todo mundo
// com jogo na frente, que é onde a leitura das cartas aperta.
//
//   node test/mesa-qa-jogando.mjs [robôs=7] [porta=3000] [turnos=300]
//
// Imprime a sessão para colar em `localStorage['cacamba-session']` e abrir
// /3d.html. Ele para assim que houver jogos suficientes na mesa: entre logo,
// senão o servidor assume a minha vez (45 s) e a rodada acaba sozinha.
import WebSocket from 'ws';

const N = Number(process.argv[2] || 7);
const PORT = process.argv[3] || 3000;
const MAX = Number(process.argv[4] || 200);
const ws = new WebSocket(`ws://localhost:${PORT}`);
let sessao = null; let turnos = 0; let ultimaBaixada = 0;

const envia = (o) => ws.send(JSON.stringify(o));
const acao = (action) => envia({ t: 'action', action });

ws.on('open', () => envia({ t: 'create', name: 'Matheus', avatar: 'matheus' }));
ws.on('error', (e) => { console.error('não conectou:', e.message); process.exit(1); });
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'welcome') {
    sessao = { code: m.code, playerId: m.playerId, token: m.token, name: 'Matheus' };
    for (let i = 0; i < N; i++) envia({ t: 'addBot' });
  }
  if (m.t === 'lobby' && sessao && !m.started && m.players.length >= N + 1) envia({ t: 'start' });
  if (m.t === 'state') {
    const v = m.view;
    const jogos = v.players.reduce((s, p) => s + (p.melds?.length || 0), 0);
    if (jogos !== ultimaBaixada) { ultimaBaixada = jogos; console.error(`jogos na mesa: ${jogos} (rodada ${v.round + 1})`); }
    if (jogos >= 4 || turnos > MAX) { console.log(JSON.stringify(sessao)); process.exit(0); }
    if (v.turnId !== sessao.playerId) return;
    turnos++;
    setTimeout(() => {
      if (v.phase === 'draw') return acao({ a: 'draw', source: 'deck' });
      if (v.phase === 'play') {
        // tenta baixar; se o servidor recusar, descarta a primeira carta
        acao({ a: 'baixar' });
        setTimeout(() => acao({ a: 'discard', cardId: v.you.hand[0].id }), 220);
      }
    }, 60);
  }
  if (m.t === 'error' && !/baixar|jogo/i.test(m.msg || '')) console.error('erro:', m.msg);
});
setTimeout(() => { console.error('tempo esgotado'); if (sessao) console.log(JSON.stringify(sessao)); process.exit(0); }, 240000);
