// Os robôs: nível escolhido por quem cria a sala, e robô que fala.
//   1. só o anfitrião troca o nível, e só antes de a partida começar;
//   2. o nível aparece no lobby de todo mundo;
//   3. humano presente demorando na vez: em ~30 s um robô cobra com um emote.
//   node test/robos.mjs [porta]
import WebSocket from 'ws';
const PORT = process.argv[2] || process.env.PORT || 3000;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
function cliente() { const ws = new WebSocket(`ws://localhost:${PORT}`); const c = { ws, msgs: [] }; ws.on('message', (raw) => c.msgs.push(JSON.parse(raw))); return new Promise((ok) => ws.on('open', () => ok(c))); }
const manda = (c, m) => c.ws.send(JSON.stringify(m));
const ultimo = (c, t) => c.msgs.filter((m) => m.t === t).at(-1);
const falhou = []; const confere = (ok, texto) => { console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`); if (!ok) falhou.push(texto); };

const A = await cliente(); manda(A, { t: 'create', name: 'Anfitriã', avatar: 'dri' }); await espera(300);
const B = await cliente(); manda(B, { t: 'join', code: ultimo(A, 'welcome').code, name: 'Convidada', avatar: 'lyly' }); await espera(300);
manda(A, { t: 'addBot' }); await espera(200);
confere(ultimo(A, 'lobby').nivelRobos === 'normal', 'o nível nasce normal');
manda(B, { t: 'nivelRobos', nivel: 'facil' }); await espera(250);
confere(ultimo(A, 'lobby').nivelRobos === 'normal' && B.msgs.some((m) => m.t === 'error'), 'convidada não troca o nível');
manda(A, { t: 'nivelRobos', nivel: 'facil' }); await espera(250);
confere(ultimo(A, 'lobby').nivelRobos === 'facil' && ultimo(B, 'lobby').nivelRobos === 'facil', 'a anfitriã troca, e todo mundo vê');
manda(A, { t: 'nivelRobos', nivel: 'impossivel' }); await espera(250);
confere(ultimo(A, 'lobby').nivelRobos === 'facil', 'nível que não existe é recusado na porta');
manda(A, { t: 'start' }); await espera(500);
manda(A, { t: 'nivelRobos', nivel: 'normal' }); await espera(250);
confere(ultimo(A, 'lobby').nivelRobos === 'facil', 'com a partida começada o nível não muda mais');
// a vez é de um humano (A abre): ninguém joga, e um robô tem de cobrar
console.log('        (esperando até 45 s pela cobrança do robô…)');
let fala = null; for (let i = 0; i < 180 && !fala; i++) { await espera(250); fala = A.msgs.find((m) => m.t === 'emote'); }
const vez = ultimo(A, 'state')?.view; const humanoNaVez = vez && [ultimo(A, 'welcome').playerId, ultimo(B, 'welcome').playerId].includes(vez.turnId);
confere(!!fala && String(fala.from).startsWith('bot-') && ['demora', 'bora'].includes(fala.k), `o robô cobrou: ${fala ? fala.k : 'nada'}${humanoNaVez ? '' : ' (a vez não era de humano)'}`);
confere(!!B.msgs.find((m) => m.t === 'emote'), 'a outra humana também recebeu a fala do robô');
A.ws.close(); B.ws.close();
console.log(falhou.length ? `\nROBÔS FALHOU: ${falhou.length}` : '\nROBÔS OK');
process.exit(falhou.length ? 1 : 0);
