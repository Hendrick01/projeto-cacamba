// Prova do Puxadinho pelo fio, com servidor próprio (robôs no ritmo de teste):
//   1. a sala nasce no modo Puxadinho; sala sem modo continua Caçamba;
//   2. não começa com menos de 3 e não passa de 4;
//   3. começa com 2 humanos e 2 robôs, na colocação em cobra;
//   4. a partida vai até 10 pontos — os humanos jogam pelo que a visão
//      mostra (constroem, trocam com o fornecedor, oferecem troca um ao
//      outro, devolvem material no 7, mandam o fiscal) — sem nenhuma jogada
//      recusada pelo juiz;
//   5. o retrato da sala (sobrevive ao reinício) cabe e chega a cada um;
//   6. "jogar de novo" recomeça com a mesma mesa.
//   node test/puxadinho.mjs
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import WebSocket from 'ws';
import { GEO, CUSTOS, RECURSOS } from '../shared/puxadinho.js';

const livre = net.createServer(); livre.listen(0, '127.0.0.1'); await once(livre, 'listening');
const port = livre.address().port; await new Promise((r) => livre.close(r));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', PUBLIC_URL: '', TRUST_PROXY: '0', SEGREDO_SALAS: 'chave-do-teste', DATABASE_URL: '', RITMO_DOS_ROBOS: '0.01' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let saida = '';
servidor.stderr.on('data', (d) => { saida += d; });
await new Promise((ok, erro) => {
  servidor.stdout.on('data', (d) => { saida += d; if (String(d).includes('Caçamba no ar')) ok(); });
  servidor.on('exit', () => erro(new Error(`o servidor não subiu:\n${saida}`)));
});

function cliente(nome) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin: `http://127.0.0.1:${port}` } });
  const c = { nome, ws, erros: [], eventos: [], sessao: null, lobby: null, view: null, estados: 0, selos: 0 };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.t === 'welcome') c.sessao = m;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'error') c.erros.push(m.msg);
    if (m.t === 'selo') c.selos++;
    if (m.t === 'state') { c.view = m.view; c.estados++; for (const e of m.events || []) c.eventos.push(e); }
  });
  ws.on('error', () => {});
  return new Promise((res) => ws.on('open', () => res(c)));
}
const manda = (c, msg) => c.ws.send(JSON.stringify(msg));
const id = (c) => c.sessao?.playerId;
const falhou = [];
function confere(ok, texto) {
  console.log(`${ok ? '  ok  ' : ' FALHA'} · ${texto}`);
  if (!ok) falhou.push(texto);
}
async function ate(pred, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (pred()) return true; await espera(10); }
  return false;
}

const temTudo = (rec, custo) => RECURSOS.every((r) => (rec[r] || 0) >= (custo[r] || 0));

// O lance de um humano simples, só pelo que a visão dele mostra.
function lance(c) {
  const v = c.view;
  const you = v.you;
  const eu = id(c);
  switch (v.phase) {
    case 'colocacao':
      return v.colocacao.falta === 'casa' ? { a: 'casa', alvo: you.legais.casa[0] } : { a: 'rua', alvo: you.legais.rua[0] };
    case 'rolar':
      return { a: 'rolar' };
    case 'descarte': {
      const n = v.descartes[0].n;
      const dar = Object.fromEntries(RECURSOS.map((r) => [r, 0]));
      let k = n;
      const rec = { ...you.recursos };
      while (k > 0) { const r = RECURSOS.reduce((a, b) => (rec[b] > rec[a] ? b : a)); rec[r]--; dar[r]++; k--; }
      return { a: 'descartar', recursos: dar };
    }
    case 'fiscal': {
      const h = v.destinosDoFiscal[0];
      const vit = [...new Set(GEO.hexes[h].vertices.map((x) => v.construcoes[x]?.p).filter((p) => p && p !== eu))];
      return { a: 'fiscal', h, de: vit[0] || null };
    }
    case 'mutirao':
      return you.legais.rua.length ? { a: 'rua', alvo: you.legais.rua[0] } : { a: 'passar' };
    case 'acoes': {
      if (v.oferta?.de === eu) {
        const quem = Object.entries(v.oferta.respostas).find(([, sim]) => sim);
        return quem ? { a: 'fecharTroca', com: quem[0] } : { a: 'cancelarOferta' };
      }
      if (you.legais.predio.length && temTudo(you.recursos, CUSTOS.predio)) return { a: 'predio', alvo: you.legais.predio[0] };
      if (you.legais.casa.length && temTudo(you.recursos, CUSTOS.casa)) return { a: 'casa', alvo: you.legais.casa[0] };
      if (!you.legais.casa.length && you.legais.rua.length && temTudo(you.recursos, CUSTOS.rua)) return { a: 'rua', alvo: you.legais.rua[0] };
      if (you.jogaveis.includes('mestre')) return { a: 'carta', tipo: 'mestre' };
      if (v.cartasNoMonte && temTudo(you.recursos, CUSTOS.carta)) return { a: 'comprarCarta' };
      // uma oferta por vez, de vez em quando: 1 do que mais tem pelo que não tem
      const mais = RECURSOS.reduce((a, b) => (you.recursos[b] > you.recursos[a] ? b : a));
      const falta = RECURSOS.find((r) => !you.recursos[r] && r !== mais);
      if (!c.ofereceuNaVez && you.recursos[mais] >= 2 && falta && Math.random() < 0.3) {
        c.ofereceuNaVez = true;
        return { a: 'oferta', da: { [mais]: 1 }, quer: { [falta]: 1 } };
      }
      const troca = RECURSOS.find((r) => you.recursos[r] >= you.taxas[r] + 1);
      const quero = RECURSOS.find((r) => r !== troca && you.recursos[r] === 0 && v.banca[r] > 0);
      if (troca && quero) return { a: 'banca', da: troca, quer: quero };
      return { a: 'passar' };
    }
    default:
      return null;
  }
}

try {
  // 1. Caçamba continua sendo o padrão
  const K = await cliente('K');
  manda(K, { t: 'create', name: 'Caçambeiro' });
  await ate(() => K.lobby);
  confere(K.lobby?.modo === 'cacamba', 'sala sem modo nasce Caçamba');
  K.ws.close();

  const A = await cliente('A');
  manda(A, { t: 'create', name: 'Ana', modo: 'puxadinho' });
  await ate(() => A.lobby);
  confere(A.lobby?.modo === 'puxadinho', 'sala criada no modo Puxadinho');

  // 2. mínimo de 3, máximo de 4
  manda(A, { t: 'start' });
  await ate(() => A.erros.length);
  confere(A.erros.some((e) => /pelo menos mais 2/.test(e)), 'sozinho não começa: precisa de 3');
  const B = await cliente('B');
  manda(B, { t: 'join', code: A.sessao.code, name: 'Bia' });
  await ate(() => A.lobby.players.length === 2);
  confere(B.lobby?.modo === 'puxadinho', 'quem entra pelo código vê o modo da sala');
  manda(A, { t: 'addBot' }); manda(A, { t: 'addBot' });
  await ate(() => A.lobby.players.length === 4);
  const E = await cliente('E'); manda(E, { t: 'join', code: A.sessao.code, name: 'Edu' });
  await ate(() => E.erros.length);
  confere(E.erros.some((e) => /cheia \(4/.test(e)), 'o quinto não entra: a mesa é de 4');
  manda(A, { t: 'addBot' });
  await ate(() => A.erros.length > 1);
  confere(A.lobby.players.length === 4, 'nem robô passa de 4');
  E.ws.close();
  A.erros.length = 0;

  // 3. começa na colocação
  manda(A, { t: 'start' });
  await ate(() => A.view && B.view);
  const v0 = A.view;
  confere(v0?.modo === 'puxadinho' && v0.players.length === 4 && v0.phase === 'colocacao', 'a partida começa na colocação, com 4 na mesa');
  confere(v0?.tabuleiro.length === 19 && v0.revendas.length === 9, 'tabuleiro de 19 terrenos e 9 revendas');
  confere(v0?.colocacao.total === 8, 'colocação em cobra: 8 passos (ida e volta)');

  // 4. até o fim
  const humanos = [A, B];
  const inicio = Date.now();
  let travou = false;
  let donoAntes = null;
  while (A.view.phase !== 'gameEnd') {
    if (Date.now() - inicio > 180000) { travou = true; break; }
    const v = A.view;
    if (v.donoId !== donoAntes) { donoAntes = v.donoId; for (const c of humanos) c.ofereceuNaVez = false; }
    // oferta de um humano para o outro: o outro responde
    if (v.oferta) {
      const outro = humanos.find((c) => id(c) !== v.oferta.de && !(id(c) in v.oferta.respostas));
      if (outro && outro.view.oferta?.seq === v.oferta.seq) {
        const tem = temTudo(outro.view.you.recursos, v.oferta.quer);
        const antes = outro.estados;
        manda(outro, { t: 'action', action: { a: 'responder', aceita: tem, seq: v.oferta.seq } });
        await ate(() => outro.estados > antes, 2000);
        continue;
      }
    }
    const daVez = humanos.find((c) => id(c) === v.turnId);
    if (!daVez) { await espera(5); continue; }
    if (daVez.view.turnId !== id(daVez) || daVez.view.turnNo !== v.turnNo) { await espera(5); continue; }
    const acao = lance(daVez);
    if (!acao) { await espera(5); continue; }
    const antes = daVez.estados;
    manda(daVez, { t: 'action', action: acao });
    const ok = await ate(() => daVez.estados > antes || daVez.erros.length, 3000);
    if (!ok) { console.log('sem resposta para', JSON.stringify(acao)); }
    if (daVez.erros.length) { console.log('recusada:', JSON.stringify(acao), daVez.erros.at(-1)); break; }
    await ate(() => A.estados >= daVez.estados - 1, 500);
  }
  const vf = A.view;
  const seg = Math.round((Date.now() - inicio) / 1000);
  confere(!travou && vf.phase === 'gameEnd', `a partida chegou ao fim (${seg} s, ${vf.turnNo} passagens de vez)`);
  confere(vf.vencedor && vf.lastRound.pontos[vf.vencedor] >= 10, `alguém chegou a 10: ${Object.values(vf.lastRound?.pontos || {}).join(' × ')}`);
  confere(humanos.every((c) => c.erros.length === 0), `nenhuma jogada recusada pelo juiz${humanos.flatMap((c) => c.erros).length ? `: ${humanos.flatMap((c) => c.erros).join(' | ')}` : ''}`);
  const tipos = new Set(A.eventos.map((e) => e.e));
  for (const t of ['inicio', 'rolou', 'construiu', 'recebeu', 'passou', 'venceu']) confere(tipos.has(t), `houve o evento ${t}`);
  confere(tipos.has('banca') || tipos.has('trocou') || tipos.has('oferta'), 'houve troca (fornecedor ou oferta)');
  confere(tipos.has('fiscal'), 'o fiscal andou pelo menos uma vez');
  const conta = (t) => A.eventos.filter((e) => e.e === t).length;
  confere(conta('oferta') > 0 && conta('respondeu') > 0, `houve oferta entre jogadores e resposta (${conta('oferta')} ofertas, ${conta('trocou')} fechadas, ${conta('banca')} no fornecedor)`);
  await ate(() => B.view.phase === 'gameEnd');
  confere(B.view.vencedor === vf.vencedor, 'a outra humana vê o mesmo vencedor');
  confere(B.view.players.every((p) => typeof p.pontos === 'number') && vf.players.find((p) => p.id === vf.vencedor).pontos >= 10, 'no fim os pontos escondidos aparecem para todos');

  // 5. o retrato
  confere(A.selos > 0 && B.selos > 0, `o retrato da sala chegou aos humanos (${A.selos} e ${B.selos})`);

  // 6. jogar de novo
  const ordem = vf.players.map((p) => p.id).join();
  manda(B, { t: 'playAgain' });
  await espera(150);
  confere(B.view.phase === 'gameEnd', 'só o anfitrião recomeça');
  manda(A, { t: 'playAgain' });
  await ate(() => A.view.phase === 'colocacao');
  confere(A.view.phase === 'colocacao' && A.view.players.every((p) => p.pontos === 0), 'partida nova, tabuleiro vazio');
  confere(A.view.players.map((p) => p.id).join() === ordem, 'a mesma mesa');
  for (const c of [A, B]) c.ws.close();
} catch (e) {
  console.error(e);
  falhou.push(String(e?.message || e));
} finally {
  servidor.kill('SIGTERM');
}
console.log(falhou.length ? `\nPUXADINHO FALHOU: ${falhou.length}` : '\nPUXADINHO OK');
process.exit(falhou.length ? 1 : 0);
