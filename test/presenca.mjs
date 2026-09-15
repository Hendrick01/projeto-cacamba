// Prova da PRESENÇA: o que um jogador faz entre as jogadas (carta escolhida,
// para onde olha) chega aos outros humanos da sala — e só a eles.
//   1. B escolhe uma carta → A recebe `presenca` com `from` = B, `sel` = 2;
//   2. payload fora do contrato (texto, índice negativo) é recusado na
//      porta (`Mensagem inválida`) e A não recebe nada;
//   3. enchente: 30 mensagens de uma vez, A recebe no máximo o orçamento
//      (12 de capacidade + 6 por segundo);
//   4. o próprio B não recebe o que mandou.
// Rodar com o servidor no ar:
//   node test/presenca.mjs [porta]
import WebSocket from 'ws';

const PORT = process.argv[2] || process.env.PORT || 3000;
const URL = `ws://localhost:${PORT}`;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function cliente(nome) {
  const ws = new WebSocket(URL);
  const c = { nome, ws, presencas: [], erros: [], sessao: null, view: null };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'state') c.view = m.view;
    if (m.t === 'presenca') c.presencas.push(m);
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
manda(A, { t: 'create', name: 'Quem Olha', avatar: 'matheus' });
await espera(300);
const code = A.sessao.code;
const B = await cliente('B');
manda(B, { t: 'join', code, name: 'Quem Escolhe', avatar: 'dri' });
await espera(300);
manda(A, { t: 'addBot' });
await espera(200);
manda(A, { t: 'start' });
await espera(600);
confere(!!A.view && !!B.view, 'a partida começou para os dois');

// 1. B escolhe a terceira carta e olha para a cadeira 0 (a de A)
manda(B, { t: 'presenca', sel: 2, olha: 0 });
await espera(300);
const p = A.presencas.at(-1);
confere(!!p && p.from === B.sessao.playerId && p.sel === 2 && p.olha === 0, 'A recebeu a presença de B: carta 2, olhando a cadeira 0');
confere(B.presencas.length === 0, 'B não recebe a própria presença');

// 2. lixo é recusado na porta
const antes = A.presencas.length, errosAntes = B.erros.length;
manda(B, { t: 'presenca', sel: 'tres' });
manda(B, { t: 'presenca', sel: -1 });
manda(B, { t: 'presenca', olha: 99 });
await espera(300);
confere(A.presencas.length === antes, 'payload fora do contrato não chega a A');
confere(B.erros.length === errosAntes + 3, `quem mandou recebe "Mensagem inválida" (${B.erros.length - errosAntes} de 3)`);

// 3. enchente: só o orçamento passa
const antesEnchente = A.presencas.length;
for (let k = 0; k < 30; k++) manda(B, { t: 'presenca', sel: k % 5, olha: null });
await espera(500);
const passaram = A.presencas.length - antesEnchente;
confere(passaram > 0 && passaram <= 14, `enchente de 30 mensagens: passaram ${passaram} (orçamento 12 + 6/s)`);
confere(B.ws.readyState === WebSocket.OPEN, 'a enchente não derrubou a conexão de B');

// 4. limpar a escolha também chega
manda(B, { t: 'presenca', sel: null, olha: null });
await espera(1500);
const ultima = A.presencas.at(-1);
confere(ultima && ultima.sel === null, 'B soltou a carta: A recebeu sel nulo');

console.log(falhou.length ? `\nPRESENÇA FALHOU: ${falhou.length} de 8` : '\nPRESENÇA OK: 8/8');
A.ws.close(); B.ws.close();
process.exit(falhou.length ? 1 : 0);
