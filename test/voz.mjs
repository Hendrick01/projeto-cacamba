// O repasse da sinalização de voz, pelo fio (node test/voz.mjs [porta],
// servidor no ar). O servidor não entende WebRTC: só entrega `dados` de um
// humano a outro da mesma sala, ou a todos os outros humanos com `to: '*'`.
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
let falhas = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   · ' : '  FALHOU · ') + msg); if (!cond) falhas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
setTimeout(() => { console.error('VOZ FALHOU: tempo esgotado'); process.exit(1); }, 20_000);

function cliente(nome) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const c = { nome, ws, id: null, code: null, msgs: [], vozes: [] };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw); c.msgs.push(m);
    if (m.t === 'welcome') { c.id = m.playerId; c.code = m.code; }
    if (m.t === 'voz') c.vozes.push(m);
  });
  c.envia = (m) => ws.send(JSON.stringify(m));
  return new Promise((r) => ws.on('open', () => r(c)));
}

const a = await cliente('A'); a.envia({ t: 'create', name: 'A voz' }); await espera(200);
const b = await cliente('B'); b.envia({ t: 'join', code: a.code, name: 'B voz' }); await espera(200);
a.envia({ t: 'addBot' }); await espera(200);
const c = await cliente('C'); c.envia({ t: 'create', name: 'C fora' }); await espera(200);
const lobby = [...a.msgs].reverse().find((m) => m.t === 'lobby');
const bot = lobby.players.find((p) => p.isBot);
ok(a.id && b.id && c.id && bot, `sala ${a.code} com A, B e ${bot?.name}; C numa sala à parte`);

// 1. direto: A -> B
a.envia({ t: 'voz', to: b.id, dados: { tipo: 'oi' } }); await espera(200);
ok(b.vozes.length === 1 && b.vozes[0].from === a.id && b.vozes[0].dados.tipo === 'oi', 'B recebe o "oi" de A, carimbado com o id de A');
ok(a.vozes.length === 0, 'A não recebe a própria mensagem');
ok(c.vozes.length === 0, 'C, em outra sala, não recebe nada');

// 2. para todos: A -> '*'
a.envia({ t: 'voz', to: '*', dados: { tipo: 'oi', x: 1 } }); await espera(200);
ok(b.vozes.length === 2, 'B recebe o "oi" mandado para todos');
ok(a.vozes.length === 0 && c.vozes.length === 0, 'só quem está na sala e não é o remetente');

// 3. para o robô e para gente de fora: nada acontece, e o servidor segue vivo
a.envia({ t: 'voz', to: bot.id, dados: { tipo: 'oi' } });
a.envia({ t: 'voz', to: c.id, dados: { tipo: 'oi' } });
a.envia({ t: 'voz', to: b.id, dados: 'texto solto' });
a.envia({ t: 'voz', to: b.id, dados: [1, 2] });
await espera(250);
ok(b.vozes.length === 2 && c.vozes.length === 0, 'robô, sala alheia e dados fora do formato são ignorados');
ok(!a.msgs.some((m) => m.t === 'error'), 'sem erro para A');
b.envia({ t: 'voz', to: a.id, dados: { tipo: 'resposta', sdp: { type: 'answer', sdp: 'v=0' } } }); await espera(200);
ok(a.vozes.length === 1 && a.vozes[0].from === b.id && a.vozes[0].dados.sdp.type === 'answer', 'B -> A: a resposta chega inteira, com o sdp');

for (const x of [a, b, c]) x.ws.close();
console.log(falhas ? `\nVOZ FALHOU: ${falhas}` : '\nVOZ OK: 9/9');
process.exit(falhas ? 1 : 0);
