// Prova dos EMOTES e frases prontas: o que um jogador manda chega aos outros
// humanos da sala — e só a chave de catálogo passa.
//   1. B manda 'joinha' → A recebe `emote` com `from` = B e `k` = 'joinha';
//   2. B não recebe o próprio emote (ele o mostra na hora, sem ida e volta);
//   3. chave fora do contrato ('Bora!', texto livre) é recusada na porta;
//      chave bem formada que não está no catálogo é ignorada sem erro;
//   4. enchente: 12 de uma vez, passam no máximo 4 (orçamento 4 + 0,5/s);
//   5. a conexão sobrevive.
//   node test/emotes.mjs [porta]
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function cliente(nome) {
  const ws = new WebSocket(URL);
  const c = { nome, ws, emotes: [], erros: [], sessao: null, view: null };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'state') c.view = m.view;
    if (m.t === 'emote') c.emotes.push(m);
    if (m.t === 'error') c.erros.push(m.msg);
  });
  return new Promise((res) => ws.on('open', () => res(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}

const A = await cliente('A');
manda(A, { t: 'create', name: 'Quem Ouve', avatar: 'matheus' });
await espera(300);
const B = await cliente('B');
manda(B, { t: 'join', code: A.sessao.code, name: 'Quem Fala', avatar: 'dri' });
await espera(300);
// na sala de espera também vale
manda(B, { t: 'emote', k: 'bora' });
await espera(300);
confere(A.emotes.at(-1)?.k === 'bora', 'no lobby, antes de começar, o emote já chega');
await espera(2200);
manda(A, { t: 'addBot' });
await espera(200);
manda(A, { t: 'start' });
await espera(600);
confere(!!A.view && !!B.view, 'a partida começou para os dois');

manda(B, { t: 'emote', k: 'joinha' });
await espera(300);
const e = A.emotes.at(-1);
confere(!!e && e.from === B.sessao.playerId && e.k === 'joinha', 'A recebeu o joinha de B');
confere(B.emotes.length === 0, 'B não recebe o próprio emote');

const antes = A.emotes.length, errosAntes = B.erros.length;
manda(B, { t: 'emote', k: 'Bora!' });
manda(B, { t: 'emote', k: '<b>oi</b>' });
manda(B, { t: 'emote' });
await espera(300);
confere(A.emotes.length === antes, 'texto livre não chega a A');
confere(B.erros.length - errosAntes === 3, `quem mandou recebe "Mensagem inválida" (${B.erros.length - errosAntes} de 3)`);
manda(B, { t: 'emote', k: 'nao-existe' });
await espera(300);
confere(A.emotes.length === antes, 'chave bem formada fora do catálogo é ignorada');

await espera(2500);   // o balde de B enche de novo
const base = A.emotes.length;
for (let i = 0; i < 12; i++) manda(B, { t: 'emote', k: 'bora' });
await espera(500);
const passaram = A.emotes.length - base;
confere(passaram >= 1 && passaram <= 5, `enchente de 12 emotes: passaram ${passaram} (orçamento 4 + 0,5/s)`);
confere(B.ws.readyState === WebSocket.OPEN, 'a enchente não derrubou a conexão de B');

A.ws.close(); B.ws.close();
console.log(falhou.length ? `\nEMOTES FALHOU: ${falhou.length}` : '\nEMOTES OK: 9/9');
process.exit(falhou.length ? 1 : 0);
