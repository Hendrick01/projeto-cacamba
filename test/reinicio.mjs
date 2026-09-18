// A PARTIDA SOBREVIVE AO REINÍCIO DO SERVIDOR — prova ao vivo, matando e subindo
// o processo de verdade (SIGTERM, como o Render faz a cada deploy).
//   1. dois humanos jogam algumas vezes; cada passagem de vez entrega um retrato;
//   2. SIGTERM: os dois recebem o aviso e o último retrato; o processo sai;
//   3. sobe outro processo, com a mesma chave. `resume` responde `gone` com
//      `semSala`; A devolve o retrato → a sala volta com a MESMA mão, vez,
//      monte e placar; B entra com `resume` comum, na mesma sala;
//   4. a partida continua: a jogada seguinte vale;
//   5. segundo reinício: B devolve um retrato VELHO, A chega depois com o mais
//      novo, e antes de qualquer jogada vale o mais novo (ninguém volta a
//      partida no tempo);
//   6. retrato adulterado e retrato de outra chave são recusados.
//   node test/reinicio.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';

const livre = net.createServer(); livre.listen(0, '127.0.0.1'); await once(livre, 'listening');
const port = livre.address().port; await new Promise((r) => livre.close(r));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let servidor = null;
async function sobe(segredo = 'chave-do-teste') {
  servidor = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_URL: '', TRUST_PROXY: '0', SEGREDO_SALAS: segredo, DATABASE_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  servidor.saida = ''; servidor.stdout.on('data', (d) => { servidor.saida += d; }); servidor.stderr.on('data', (d) => { servidor.saida += d; });
  await new Promise((ok, erro) => { servidor.stdout.on('data', (d) => { if (String(d).includes('Caçamba no ar')) ok(); }); servidor.on('exit', () => erro(new Error('o servidor não subiu'))); });
}
async function derruba() { const saiu = once(servidor, 'exit'); servidor.kill('SIGTERM'); await saiu; }
async function cliente() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`); const c = { ws, msgs: [], selos: [], view: null, fechou: false };
  ws.on('message', (raw) => { const m = JSON.parse(raw); c.msgs.push(m); if (m.t === 'selo') c.selos.push(m); if (m.t === 'state') c.view = m.view; });
  ws.on('close', () => { c.fechou = true; }); ws.on('error', () => {});
  await once(ws, 'open'); return c;
}
const manda = (c, m) => c.ws.send(JSON.stringify(m));
async function ate(c, pred, ms = 3000) { const fim = Date.now() + ms; while (Date.now() < fim) { const m = c.msgs.find(pred); if (m) return m; await espera(15); } throw new Error('resposta ausente'); }
const resumo = (v) => ({ rodada: v.round, vez: v.turnId, fase: v.phase, monte: v.deckCount, mao: v.you.hand.map((x) => x.id).sort((a, b) => a - b), placar: v.players.map((p) => p.score) });
const falhou = []; const confere = (ok, texto) => { console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`); if (!ok) falhou.push(texto); };
// joga a vez de quem for: puxa do monte e descarta a carta que acabou de chegar
async function jogaUmaVez(A, B) {
  const daVez = A.view.turnId === A.id ? A : B; const antes = daVez.view.turnNo ?? null; const n0 = daVez.view.you.hand.length;
  manda(daVez, { t: 'action', action: { a: 'draw', source: 'deck' } });
  const fim = Date.now() + 3000; while (Date.now() < fim && daVez.view.you.hand.length === n0) await espera(15);
  const carta = daVez.view.you.hand.at(-1); const outro = daVez === A ? B : A; const vezAntes = daVez.view.turnId;
  manda(daVez, { t: 'action', action: { a: 'discard', cardId: carta.id } });
  const fim2 = Date.now() + 3000; while (Date.now() < fim2 && outro.view.turnId === vezAntes) await espera(15);
  void antes;
}
const prazo = setTimeout(() => { console.error('tempo esgotado'); try { servidor?.kill('SIGKILL'); } catch {} process.exit(1); }, 60000);

try {
  await sobe();
  let A = await cliente(), B = await cliente();
  manda(A, { t: 'create', name: 'Ana', avatar: 'dri' }); const idA = await ate(A, (m) => m.t === 'welcome'); A.id = idA.playerId;
  manda(B, { t: 'join', code: idA.code, name: 'Bia', avatar: 'lyly' }); const idB = await ate(B, (m) => m.t === 'welcome'); B.id = idB.playerId;
  manda(A, { t: 'start' }); await ate(A, (m) => m.t === 'state'); await ate(B, (m) => m.t === 'state');
  confere(A.selos.length > 0 && B.selos.length > 0, 'os dois receberam retrato da sala ao começar');
  const seloVelho = B.selos.at(-1);
  for (let i = 0; i < 3; i++) await jogaUmaVez(A, B);
  await espera(150);
  confere(A.selos.at(-1).seq > seloVelho.seq, `cada passagem de vez entrega retrato novo (de ${seloVelho.seq} para ${A.selos.at(-1).seq})`);
  confere(A.selos.at(-1).selo.length < 15000, `o retrato cabe na mensagem (${A.selos.at(-1).selo.length} caracteres)`);
  confere(!JSON.stringify(A.selos.at(-1)).includes(String(B.view.you.hand[0].id) + ',"rank"'), 'o retrato não mostra carta em claro');
  const antesA = resumo(A.view), antesB = resumo(B.view);

  // ---- reinício 1 ----
  await derruba();
  await espera(200);
  confere(A.msgs.some((m) => m.t === 'reinicio') && B.msgs.some((m) => m.t === 'reinicio'), 'SIGTERM: os dois foram avisados do reinício');
  confere(A.fechou && B.fechou, 'as conexões caíram com o processo');
  const seloA = A.selos.at(-1), seloB = B.selos.at(-1);
  await sobe();
  A = Object.assign(await cliente(), { id: A.id }); B = Object.assign(await cliente(), { id: B.id });
  manda(A, { t: 'resume', code: idA.code, playerId: idA.playerId, token: idA.token });
  const sumiu = await ate(A, (m) => m.t === 'gone');
  confere(sumiu.semSala === true, 'o servidor novo não conhece a sala e diz isso (`gone` com `semSala`)');
  manda(A, { t: 'restaura', selo: seloA.selo, playerId: idA.playerId, token: idA.token });
  await ate(A, (m) => m.t === 'welcome'); await ate(A, (m) => m.t === 'state');
  confere(JSON.stringify(resumo(A.view)) === JSON.stringify(antesA), 'A voltou com a MESMA mão, vez, fase, monte e placar');
  manda(B, { t: 'resume', code: idB.code, playerId: idB.playerId, token: idB.token });
  await ate(B, (m) => m.t === 'welcome'); await ate(B, (m) => m.t === 'state');
  confere(JSON.stringify(resumo(B.view)) === JSON.stringify(antesB), 'B entrou com `resume` comum, na mesma sala, com a mesma mão');
  confere(servidor.saida.includes('restaurada do retrato'), 'o servidor registrou a restauração');
  const vezAntes = A.view.turnId; await jogaUmaVez(A, B); await espera(100);
  confere(A.view.turnId !== vezAntes, 'a partida continua: a jogada seguinte valeu e a vez passou');
  const novoA = resumo(A.view); const seloNovoA = A.selos.at(-1);

  // ---- reinício 2: retrato velho primeiro, o mais novo depois ----
  await derruba(); await sobe();
  A = Object.assign(await cliente(), { id: A.id }); B = Object.assign(await cliente(), { id: B.id });
  manda(B, { t: 'restaura', selo: seloVelho.selo, playerId: idB.playerId, token: idB.token });
  await ate(B, (m) => m.t === 'welcome'); await ate(B, (m) => m.t === 'state');
  confere(B.view.deckCount !== novoA.monte, 'com o retrato velho a sala volta ao começo da partida…');
  manda(A, { t: 'restaura', selo: seloNovoA.selo, playerId: idA.playerId, token: idA.token });
  await ate(A, (m) => m.t === 'welcome'); await espera(200);
  confere(JSON.stringify(resumo(A.view)) === JSON.stringify(novoA), '…mas o retrato MAIS NOVO, chegando antes de qualquer jogada, é o que vale');
  confere(B.view.deckCount === novoA.monte, 'e B foi levada junto para o estado mais novo');
  await jogaUmaVez(A, B); await espera(100);
  const C = await cliente();
  manda(C, { t: 'restaura', selo: seloVelho.selo, playerId: idB.playerId, token: idB.token });
  await ate(C, (m) => m.t === 'welcome'); await ate(C, (m) => m.t === 'state');
  confere(C.view.deckCount !== undefined && C.view.deckCount < novoA.monte + 1 && C.view.turnNo !== 0, 'depois que alguém jogou, retrato velho não volta a partida no tempo');

  // ---- recusas ----
  const D = await cliente(); const s = seloNovoA.selo; const meio = Math.floor(s.length / 2);
  manda(D, { t: 'restaura', selo: s.slice(0, meio) + (s[meio] === 'A' ? 'B' : 'A') + s.slice(meio + 1), playerId: idA.playerId, token: idA.token });
  const recusa = await ate(D, (m) => m.t === 'gone'); confere(!!recusa, 'retrato adulterado é recusado');
  await derruba(); await sobe('outra-chave');
  const E = await cliente(); manda(E, { t: 'restaura', selo: seloNovoA.selo, playerId: idA.playerId, token: idA.token });
  confere(!!(await ate(E, (m) => m.t === 'gone')), 'retrato selado com outra chave é recusado');
  confere(E.msgs.some((m) => m.t === 'versao' && typeof m.v === 'string' && m.v.length >= 6), 'toda conexão recebe a versão do que está no ar');
} catch (e) { falhou.push(String(e?.stack || e)); console.error(e); }
finally { clearTimeout(prazo); try { servidor?.kill('SIGKILL'); } catch {} }
console.log(falhou.length ? `\nREINÍCIO FALHOU: ${falhou.length}` : '\nREINÍCIO OK');
process.exit(falhou.length ? 1 : 0);
