// Ferramenta de QA, não teste: abre uma sala com robôs, começa a partida e
// imprime a sessão para colar no navegador — é o caminho mais curto para VER a
// mesa 3D, que sem partida em andamento não desenha ninguém.
//
//   node test/mesa-qa.mjs [robôs=3] [porta=3000] [modo=cacamba|presidente|bazuca]
//
// Depois, no console da página (ou pelo painel do navegador):
//   localStorage.setItem('cacamba-session', '<a linha impressa aqui>')
// e recarregue /3d.html. A sala morre quando o servidor reinicia — rode de novo.
import WebSocket from 'ws';

const N = Number(process.argv[2] || 3);
const PORT = process.argv[3] || 3000;
const ws = new WebSocket(`ws://localhost:${PORT}`);
let sessao = null;

const MODO = process.argv[4] || 'cacamba';   // 'presidente' ou 'bazuca' abrem a 3D deles
ws.on('open', () => ws.send(JSON.stringify({ t: 'create', name: 'Matheus', avatar: 'matheus', modo: MODO })));
ws.on('error', (e) => { console.error('não conectou:', e.message); process.exit(1); });
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.t === 'welcome') {
    sessao = { code: m.code, playerId: m.playerId, token: m.token, name: 'Matheus' };
    for (let i = 0; i < N; i++) ws.send(JSON.stringify({ t: 'addBot' }));
  }
  // o lobby volta a cada robô; começa quando todos entraram
  if (m.t === 'lobby' && sessao && !m.started && m.players.length >= N + 1) ws.send(JSON.stringify({ t: 'start' }));
  // `state` é o primeiro quadro da partida: daí a sessão serve para o navegador
  if (m.t === 'state') { console.log(JSON.stringify(sessao)); ws.close(); process.exit(0); }
  if (m.t === 'error') { console.error('erro:', m.msg); process.exit(1); }
});
setTimeout(() => { console.error('tempo esgotado — o servidor está no ar?'); process.exit(1); }, 8000);
