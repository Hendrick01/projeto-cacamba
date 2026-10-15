// ============================================================================
// Poker — a mesa 2D. Este arquivo (e o poker.css) só é baixado quando alguém
// escolhe o modo ou entra numa sala dele, como os do Presidente e do Bazuca.
//
// Usa o cenário, os assentos, o leque da mão e os modais do Caçamba, que
// chegam pelo `ctx` (ver contextoDaMesa em client.js). O que é daqui: as cinco
// cartas da mesa, o pote e as apostas em FICHAS DE VERDADE (cada cor um
// valor), a bandeja de montar a aposta tocando nas fichas, o resultado de cada
// mão e o placar.
//
// A mão seguinte começa sozinha no servidor. Para dar tempo de ver quem levou,
// o resultado SEGURA o meio da mesa e a sua mão uns segundos (ou até um
// toque); o servidor segura os robôs no mesmo tanto (pausaDoRobo).
//
// A mesa 3D (poker-3d.js) usa a mesma lógica: o que é regra de tela (textos,
// botões da vez, o resultado, a bandeja de fichas) está exportado aqui em
// cima, fora de criaMesaPoker, e as duas mesas chamam as mesmas funções.
// ============================================================================

import { emFichas, FICHAS, NOME_DA_ETAPA } from '/shared/poker.js';

export const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
export const SEGURA_MS = { semShowdown: 2200, showdown: 5200, corrida: 6800 };
// quanto o resultado de uma mão segura a mesa: numa corrida (todos all-in) as
// ruas ainda vão cair uma a uma
export const msDaSegura = (ev, corrida) => (ev.semShowdown ? SEGURA_MS.semShowdown : corrida ? SEGURA_MS.corrida : SEGURA_MS.showdown);

const el = (tag, cls, txt) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
};

// ---- regras de tela, as mesmas nas duas mesas ---------------------------------

// D, SB, BB (ou D·SB no mano a mano) de quem está na mão
export function posicaoDe(vw, id) {
  if (vw.phase !== 'play') return '';
  if (id === vw.botao) return id === vw.sb ? 'D·SB' : 'D';
  if (id === vw.sb) return 'SB';
  if (id === vw.bb) return 'BB';
  return '';
}

// O que cada um fez, curto: o balão da 2D e a placa da 3D.
export function falaDoLance(ev) {
  switch (ev.e) {
    case 'mesa': return { texto: 'mesa' };
    case 'correu': return { texto: 'corro' };
    case 'pagou': return { texto: ev.allIn ? 'all-in!' : `pago ${fmt(ev.valor)}`, gesto: ev.allIn ? 'treme' : null };
    case 'apostou': return { texto: ev.allIn ? 'all-in!' : `aposto ${fmt(ev.para)}`, gesto: ev.allIn ? 'treme' : null };
    case 'aumentou': return { texto: ev.allIn ? 'all-in!' : `aumento p/ ${fmt(ev.para)}`, gesto: ev.allIn ? 'treme' : 'pula' };
    default: return null;
  }
}

// O texto da vez (o banner da 2D, o aviso da 3D).
export function textoDaVez(vw, eu, nome, segurando) {
  if (segurando) return { minha: false, texto: 'Fim da mão. Toque no resultado para seguir.' };
  if (vw.phase === 'gameEnd') return { minha: false, texto: 'Fim de jogo.' };
  if (vw.phase !== 'play') return { minha: false, texto: '' };
  const meu = vw.players.find((p) => p.id === eu);
  if (meu?.fora) return { minha: false, texto: `Você está fora. Vez de ${nome(vw.turnId)}…` };
  if (vw.turnId !== eu) return { minha: false, texto: meu?.foldou ? `Você correu. Vez de ${nome(vw.turnId)}…` : `Vez de ${nome(vw.turnId)}…` };
  const y = vw.you;
  if (y.podeMesa) return { minha: true, texto: vw.apostaAtual === 0 ? 'Sua vez: dê mesa ou aposte.' : 'Sua vez: dê mesa ou aumente.' };
  return { minha: true, texto: `Sua vez: pague ${fmt(y.paraPagar)}${y.podeAumentar ? ', aumente' : ''} ou corra.` };
}

// Os botões da vez: quais aparecem e o que dizem. Null quando não é hora de
// agir (não é a sua vez, ou o resultado da mão anterior ainda está na mesa).
export function botoesDaVez(vw, eu, segurando) {
  const y = vw.you;
  if (!y || segurando || vw.phase !== 'play' || vw.turnId !== eu) return null;
  const tudo = y.paraPagar >= y.fichas;
  return {
    correr: !y.podeMesa, mesa: y.podeMesa, pagar: !y.podeMesa, aumentar: y.podeAumentar,
    textoPagar: tudo ? `Pagar all-in (${fmt(y.paraPagar)})` : `Pagar ${fmt(y.paraPagar)}`,
    textoAumentar: vw.apostaAtual === 0 ? 'Apostar' : 'Aumentar',
  };
}

// O resultado de uma mão, em linhas: potes que foram para os mesmos
// vencedores viram uma linha só. `antes` é o texto até o valor ("Pote
// paralelo: Ana e Você dividem"), sem HTML — quem desenha escapa.
export function linhasDoResultado(ev, eu, nome) {
  let disputados = ev.potes.filter((x) => !x.devolvido);
  const chave = (pt) => pt.vencedores.join(',');
  if (disputados.length > 1 && disputados.every((pt) => chave(pt) === chave(disputados[0]))) {
    disputados = [{ ...disputados[0], valor: disputados.reduce((s, pt) => s + pt.valor, 0) }];
  }
  return disputados.map((pt, k) => {
    const quem = pt.vencedores.map((id) => (id === eu ? 'Você' : nome(id))).join(' e ');
    const verbo = pt.vencedores.length > 1 ? 'dividem' : 'leva';
    const qual = disputados.length > 1 ? (k === 0 ? 'Pote principal: ' : `Pote paralelo${disputados.length > 2 ? ` ${k}` : ''}: `) : '';
    return { antes: `${qual}${quem} ${verbo}`, valor: pt.valor, mao: pt.mao, meu: pt.vencedores.includes(eu), vencedores: pt.vencedores };
  });
}

// As cinco que ganharam (as do primeiro pote disputado), para acender na mesa.
export function cartasVencedoras(ev) {
  const acesas = new Set();
  if (ev.semShowdown) return acesas;
  const ganhou = ev.potes.find((x) => !x.devolvido)?.vencedores || [];
  for (const m of ev.mostradas) if (ganhou.includes(m.p)) for (const id of m.cinco) acesas.add(id);
  return acesas;
}

// Quem ainda joga, do mais rico ao mais pobre; depois os que saíram, pela colocação.
export const classificacao = (players) => [...players].sort((a, b) => (a.fora === b.fora ? 0 : a.fora ? 1 : -1)
  || (a.fora ? a.lugar - b.lugar : b.fichas - a.fichas));

// ---- as fichas em HTML ----------------------------------------------------------

// Um valor em pilhas de fichas coloridas, uma pilha por cor. Pilha alta
// demais é cortada no desenho (o número ao lado diz o valor certo).
export function pilhas(valor, alturaMax = 6) {
  const box = el('span', 'pk-pilhas');
  box.setAttribute('aria-hidden', 'true');
  for (const f of emFichas(valor)) {
    const pilha = el('span', `pk-pilha f-${f.cor}`);
    pilha.title = `${f.n} × ${fmt(f.valor)}`;
    for (let i = 0; i < Math.min(f.n, alturaMax); i++) pilha.appendChild(el('i', 'pk-ficha'));
    box.appendChild(pilha);
  }
  return box;
}

// Ficha grande, com o valor escrito: é o botão da bandeja.
function fichaGrande(f) {
  const b = el('button', `pk-ficha-btn f-${f.cor}`);
  b.type = 'button';
  b.innerHTML = `<span class="pk-ficha-valor">${fmt(f.valor)}</span>`;
  b.setAttribute('aria-label', `Somar uma ficha ${f.cor} de ${fmt(f.valor)}`);
  return b;
}

// ---- a bandeja de montar a aposta -------------------------------------------------
// "Aumentar" abre a bandeja: toca-se nas fichas para somar, com atalhos
// (mínimo, ½ pote, pote, all-in) e desfazer. `v()` dá a visão atual,
// `aoMudar` redesenha quem a hospeda quando ela abre ou fecha, `avisa` mostra
// o recado de aposta abaixo do mínimo.
export function criaBandeja({ v, sendAction, avisa, aoMudar }) {
  const bandeja = el('div', 'pk-bandeja');
  bandeja.hidden = true;
  bandeja.setAttribute('role', 'group');
  bandeja.setAttribute('aria-label', 'Montar a aposta');

  let alvo = 0;           // "aumentar PARA" (a aposta total desta rua)
  let historico = [];
  const bandTopo = el('div', 'pk-band-topo');
  const bandFichas = el('div', 'pk-band-fichas');
  const bandAtalhos = el('div', 'pk-band-atalhos');
  const bandAcoes = el('div', 'pk-band-acoes');
  bandeja.append(bandTopo, bandFichas, bandAtalhos, bandAcoes);

  const limites = () => {
    const y = v().you;
    return { min: y.minPara, max: y.maxPara };
  };
  const fichasDaBandeja = [...FICHAS].reverse().map((f) => {
    const b = fichaGrande(f);
    b.onclick = () => { historico.push(alvo); alvo = Math.min(limites().max, alvo + f.valor); desenha(); };
    bandFichas.appendChild(b);
    return { b, f };
  });
  const atalho = (texto, fn) => {
    const b = el('button', 'btn btn-ghost pk-atalho', texto);
    b.type = 'button';
    b.onclick = () => { historico.push(alvo); alvo = fn(); desenha(); };
    bandAtalhos.appendChild(b);
    return b;
  };
  const fracaoDoPote = (fr) => {
    const vw = v();
    const { min, max } = limites();
    const para = vw.apostaAtual + Math.round(((vw.pote + vw.you.paraPagar) * fr) / 5) * 5;
    return Math.max(min, Math.min(max, para));
  };
  const aMin = atalho('Mínimo', () => limites().min);
  atalho('½ pote', () => fracaoDoPote(0.5));
  atalho('Pote', () => fracaoDoPote(1));
  const aTudo = atalho('All-in', () => limites().max);
  const bDesfaz = el('button', 'btn btn-ghost pk-desfaz', 'Desfazer');
  bDesfaz.type = 'button';
  bDesfaz.onclick = () => { if (historico.length) alvo = historico.pop(); desenha(); };
  const bVolta = el('button', 'btn btn-ghost pk-volta', 'Voltar');
  bVolta.type = 'button';
  bVolta.onclick = () => fecha();
  const bConfirma = el('button', 'btn btn-primary pk-confirma', 'Aumentar');
  bConfirma.type = 'button';
  bConfirma.onclick = () => {
    const { min, max } = limites();
    if (alvo < min && alvo !== max) { avisa(`O mínimo é ${fmt(min)}.`); return; }
    sendAction({ a: 'aumentar', para: alvo });
    fecha();
  };
  bandAcoes.append(bVolta, bDesfaz, bConfirma);

  function abre() {
    alvo = limites().min;
    historico = [];
    bandeja.hidden = false;
    aoMudar();
    bConfirma.focus({ preventScroll: true });
  }
  function fecha() {
    if (bandeja.hidden) return;
    bandeja.hidden = true;
    aoMudar();
  }

  function desenha() {
    const vw = v();
    const { min, max } = limites();
    const tudo = alvo >= max;
    const abreAposta = vw.apostaAtual === 0;
    bandTopo.innerHTML = '';
    bandTopo.append(
      el('span', 'pk-band-rotulo', abreAposta ? 'Apostar' : 'Aumentar para'),
      el('strong', 'pk-band-valor', fmt(alvo)),
      pilhas(alvo - (vw.you.aposta || 0), 5),
      el('span', 'pk-band-dica', `mín. ${fmt(min)} · você tem ${fmt(max)}`),
    );
    for (const { b, f } of fichasDaBandeja) b.disabled = alvo + f.valor > max;
    aMin.disabled = alvo === min;
    aTudo.disabled = tudo;
    bDesfaz.disabled = !historico.length;
    bConfirma.textContent = tudo ? `All-in (${fmt(max)})` : `${abreAposta ? 'Apostar' : 'Aumentar para'} ${fmt(alvo)}`;
    bConfirma.classList.toggle('soft-disabled', alvo < min && !tudo);
  }

  return { el: bandeja, abre, fecha, desenha, get aberta() { return !bandeja.hidden; } };
}

export function criaMesaPoker(ctx) {
  const { $ } = ctx;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/poker.css';
  document.head.appendChild(css);

  // ---- o meio da mesa: as cinco da mesa e o pote -----------------------------
  const centro = el('div', 'pk-centro');
  centro.id = 'pk-centro';
  const etapaEl = el('p', 'pk-etapa');
  const board = el('div', 'pk-board');
  const pote = el('div', 'pk-pote');
  const resultado = el('button', 'pk-resultado');
  resultado.type = 'button';
  resultado.hidden = true;
  resultado.setAttribute('aria-live', 'polite');
  centro.append(etapaEl, board, pote, resultado);
  $('screen-game').querySelector('.table-center').prepend(centro);

  const v = () => ctx.view;
  const me = () => ctx.me();
  const nome = (id) => ctx.playerName(id);

  // ---- as suas fichas, e a bandeja de apostar -------------------------------
  const eu = el('div', 'pk-eu');
  const bandeja = criaBandeja({ v, sendAction: ctx.sendAction, avisa: ctx.toast, aoMudar: () => ctx.render() });
  $('screen-game').insertBefore(eu, $('action-bar'));
  $('screen-game').insertBefore(bandeja.el, $('action-bar'));

  const barra = $('action-bar');
  const botao = (id, texto, cls) => {
    const b = el('button', `btn pk-btn ${cls}`, texto);
    b.id = id; b.type = 'button'; b.hidden = true;
    barra.insertBefore(b, $('btn-sort'));
    return b;
  };
  const bCorrer = botao('pk-correr', 'Correr', '');
  const bMesa = botao('pk-mesa', 'Mesa', 'btn-primary');
  const bPagar = botao('pk-pagar', 'Pagar', 'btn-primary');
  const bAumentar = botao('pk-aumentar', 'Aumentar', 'pk-btn-ouro');

  bCorrer.onclick = () => ctx.sendAction({ a: 'correr' });
  bMesa.onclick = () => ctx.sendAction({ a: 'mesa' });
  bPagar.onclick = () => ctx.sendAction({ a: 'pagar' });
  bAumentar.onclick = () => bandeja.abre();

  // ---- o resultado da mão (segura a mesa uns segundos) --------------------------
  let segura = null;          // { ev, ate, corrida: [{ etapa, n }] }
  let timerSegura = null;
  let corridaPendente = [];   // as ruas abertas sozinhas (todos all-in) nesta leva
  const segurando = () => !!segura && Date.now() < segura.ate;
  function soltaResultado() {
    clearTimeout(timerSegura);
    segura = null;
    if (v()) ctx.render();
  }
  resultado.onclick = soltaResultado;

  // ---- desenho --------------------------------------------------------------------

  function cabecalho() {
    const vw = v();
    $('round-label').textContent = `Poker · Mão ${vw.round + 1}`;
    const [sb, bb] = vw.blinds;
    const sobe = vw.proximosBlinds && vw.phase === 'play'
      ? ` · sobem ${vw.maosParaSubir === 1 ? 'na próxima' : `em ${vw.maosParaSubir} mãos`}` : '';
    $('contract-label').textContent = vw.phase === 'gameEnd' ? 'Fim de jogo' : `Blinds ${fmt(sb)}/${fmt(bb)}${sobe}`;
  }

  // A aposta desta rua na frente do assento: fichas e valor.
  function apostaNaFrente(caixa, valor) {
    let a = caixa.querySelector('.pk-aposta');
    if (!a) { a = el('span', 'pk-aposta'); caixa.appendChild(a); }
    a.hidden = !(valor > 0);
    a.innerHTML = '';
    if (valor > 0) a.append(pilhas(valor, 4), el('b', null, fmt(valor)));
  }

  function marcasDosAssentos() {
    const vw = v();
    for (const [id, caixa] of ctx.assentos) {
      const p = vw.players.find((x) => x.id === id);
      if (!p) continue;
      const marcas = caixa.querySelector('.marcas');
      const pos = posicaoDe(vw, id);
      if (pos) marcas.appendChild(el('span', `pk-pos${pos.startsWith('D') ? ' botao' : ''}`, pos));
      marcas.appendChild(p.fora ? el('span', 'm-off', `${p.lugar}º`) : p.allIn && vw.phase === 'play' ? el('span', 'm-gold', 'all-in') : el('span', 'pk-pilha-num', fmt(p.fichas)));
      caixa.classList.toggle('pk-correu', vw.phase === 'play' && p.foldou);
      caixa.classList.toggle('pk-eliminado', !!p.fora);
      apostaNaFrente(caixa, segurando() ? 0 : p.aposta);
      const situacao = p.fora ? `fora, ${p.lugar}º lugar` : p.foldou ? 'correu' : p.allIn ? 'all-in' : `${fmt(p.fichas)} em fichas`;
      caixa.setAttribute('aria-label', `${p.name}, ${situacao}${pos ? `, ${pos}` : ''}${p.aposta ? `, apostou ${fmt(p.aposta)}` : ''}.`);
    }
    // o seu assento: posição e aposta
    const meu = $('meu-assento');
    const eu_ = vw.players.find((x) => x.id === me());
    if (meu && eu_) {
      let m = meu.querySelector('.marcas');
      if (!m) { m = el('span', 'marcas'); meu.appendChild(m); }
      m.innerHTML = '';
      const pos = posicaoDe(vw, me());
      if (pos) m.appendChild(el('span', `pk-pos${pos.startsWith('D') ? ' botao' : ''}`, pos));
      meu.classList.toggle('pk-correu', vw.phase === 'play' && eu_.foldou);
      apostaNaFrente(meu, segurando() ? 0 : eu_.aposta);
    }
  }

  function minhasFichas() {
    const vw = v();
    const p = vw.players.find((x) => x.id === me());
    eu.innerHTML = '';
    if (!p) return;
    const rotulo = el('span', 'pk-eu-rotulo', p.fora ? `Você está fora · ${p.lugar}º lugar` : 'Suas fichas');
    const valor = el('strong', 'pk-eu-valor', p.fora ? '' : fmt(p.fichas));
    const texto = el('span', 'pk-eu-texto');
    texto.append(rotulo, valor);
    eu.append(pilhas(p.fichas, 8), texto);
    if (vw.phase === 'play' && p.foldou && !segurando()) eu.appendChild(el('span', 'pk-eu-nota', 'você correu nesta mão'));
    else if (vw.phase === 'play' && p.allIn && !segurando()) eu.appendChild(el('span', 'pk-eu-nota ouro', 'all-in'));
  }

  // As cinco cartas da mesa. Durante o resultado, as da mão que acabou, com as
  // cinco que ganharam acesas; numa corrida (todos all-in), as que abriram
  // sozinhas caem uma rua de cada vez.
  let mesaChave = '';
  let vistasDaMao = null;
  const vistas = new Set();   // cartas da mesa já mostradas nesta mão: não caem de novo
  function desenhaBoard() {
    const vw = v();
    const s = segurando() ? segura : null;
    const cartas = s ? s.ev.board : vw.board;
    const n = s ? s.ev.n : vw.round;
    const chave = `${s ? 'r' : 'm'}${n}:${cartas.map((c) => c.id).join(',')}`;
    if (chave === mesaChave) return;
    mesaChave = chave;
    if (vistasDaMao !== n) { vistas.clear(); vistasDaMao = n; }
    const vencedoras = s ? cartasVencedoras(s.ev) : new Set();
    // numa corrida, flop, turn e river caem um de cada vez
    const primeiraRua = s && s.corrida.length ? 3 - s.corrida.length : 0;
    const rua = (i) => (i < 3 ? 0 : i - 2);
    board.innerHTML = '';
    let novas = 0;
    for (let i = 0; i < 5; i++) {
      const c = cartas[i];
      if (!c) { board.appendChild(el('span', 'pk-vaga')); continue; }
      const carta = ctx.cardEl(c, true);
      if (vencedoras.size) carta.classList.add(vencedoras.has(c.id) ? 'pk-acesa' : 'pk-apagada');
      if (!vistas.has(c.id) && !ctx.semMovimento()) {
        carta.classList.add('pk-cai');
        const atraso = s && s.corrida.length ? (rua(i) - primeiraRua) * 0.9 + (i < 3 ? i * 0.08 : 0) : novas * 0.08;
        carta.style.animationDelay = `${atraso}s`;
        novas++;
      }
      vistas.add(c.id);
      board.appendChild(carta);
    }
  }

  function desenhaPote() {
    const vw = v();
    pote.innerHTML = '';
    const valor = segurando() ? segura.ev.pote : vw.pote;
    pote.hidden = segurando() || !(valor > 0);
    if (pote.hidden) return;
    pote.append(pilhas(valor, 7), el('span', 'pk-pote-valor', `Pote ${fmt(valor)}`));
  }

  function desenhaEtapa() {
    const vw = v();
    etapaEl.textContent = segurando() ? `Mão ${segura.ev.n + 1}` : vw.phase === 'play' ? NOME_DA_ETAPA[vw.etapa] : '';
  }

  function desenhaResultado() {
    resultado.hidden = !segurando();
    if (resultado.hidden) { resultado.innerHTML = ''; return; }
    if (resultado.dataset.mao === String(segura.ev.n)) return;
    resultado.dataset.mao = String(segura.ev.n);
    const ev = segura.ev;
    const atraso = segura.corrida.length ? segura.corrida.length * 0.9 + 0.2 : 0;
    resultado.style.setProperty('--atraso', `${ctx.semMovimento() ? 0 : atraso}s`);
    const potes = linhasDoResultado(ev, me(), nome);
    const linhas = potes.map((l) => `<p class="pk-res-titulo${l.meu ? ' meu' : ''}">${ctx.escapeHTML(l.antes)} <b>${fmt(l.valor)}</b>${l.mao ? ` <span>com ${ctx.escapeHTML(l.mao)}</span>` : ''}</p>`);
    const vencedores = new Set(potes.flatMap((x) => x.vencedores));
    const mostradas = ev.mostradas.map((m) => {
      const cartas = m.cards.map((c) => ctx.cardEl(c, true).outerHTML).join('');
      return `<li class="${vencedores.has(m.p) ? 'venceu' : ''}">
        <img class="avatar" src="${ctx.caraDoJogador(m.p)}" alt="" width="22" height="22" style="--anel:${ctx.corDoJogador(m.p)}">
        <span class="pk-res-nome">${m.p === me() ? 'Você' : ctx.escapeHTML(nome(m.p))}</span>
        <span class="pk-res-cartas">${cartas}</span>
        <span class="pk-res-mao">${ctx.escapeHTML(m.mao)}</span></li>`;
    }).join('');
    resultado.innerHTML = `<div class="pk-res-dentro">${linhas.join('')}${mostradas ? `<ul class="pk-res-maos">${mostradas}</ul>` : ''}
      <span class="pk-res-dica">toque para continuar</span></div>`;
  }

  function botoes() {
    const vw = v();
    const b = botoesDaVez(vw, me(), segurando());
    for (const id of ['btn-draw-deck', 'btn-draw-discard', 'btn-queimar', 'btn-baixar', 'btn-discard', 'btn-meld-discard', 'btn-cancel-mode']) $(id).hidden = true;
    const comBandeja = !!b && bandeja.aberta && b.aumentar;
    if (!comBandeja) bandeja.el.hidden = true;
    bCorrer.hidden = !b || comBandeja || !b.correr;
    bMesa.hidden = !b || comBandeja || !b.mesa;
    bPagar.hidden = !b || comBandeja || !b.pagar;
    bAumentar.hidden = !b || comBandeja || !b.aumentar;
    if (!b) return;
    bPagar.textContent = b.textoPagar;
    bAumentar.textContent = b.textoAumentar;
    if (comBandeja) bandeja.desenha();
  }

  let modalDoFim = null;
  function modalDeFase() {
    const vw = v();
    if (vw.phase === 'gameEnd' && !segurando()) {
      if (modalDoFim === vw.round) return;
      modalDoFim = vw.round;
      fimDeJogo();
    } else if (vw.phase !== 'gameEnd' && modalDoFim !== null) {
      modalDoFim = null;
      ctx.closeModal();
    }
  }

  function linha(p, direita) {
    return `<tr><td><span class="quem">
        <img class="avatar" src="${ctx.caraDoJogador(p.id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(p.id)}">
        <span>${ctx.escapeHTML(p.id === me() ? `${p.name} (você)` : p.name)}</span></span></td>
      <td class="num">${p.maos}</td>
      <td class="num">${direita}</td></tr>`;
  }

  function fimDeJogo() {
    const vw = v();
    const campeao = vw.vencedor;
    const linhas = classificacao(vw.players).map((p) => linha(p, `${p.lugar || 1}º`)).join('');
    ctx.showModal(
      `<div class="palco-vencedor"><img src="${ctx.figuraFeliz(campeao)}" alt=""></div>
       <h2>${campeao === me() ? 'Você ficou com todas as fichas!' : `${ctx.escapeHTML(nome(campeao))} ficou com todas as fichas!`}</h2>
       <table class="score-table"><thead><tr><th>Jogador</th><th class="num">Mãos</th><th class="num">Lugar</th></tr></thead><tbody>${linhas}</tbody></table>
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião…</p>'}`,
      ctx.isHost() ? [{ label: 'Jogar de novo', cls: 'btn-primary', fn: () => { ctx.closeModal(); ctx.sendMsg({ t: 'playAgain' }); } }] : [],
    );
  }

  // O balão curto do que cada um fez: o mesmo das reações, sem o gesto.
  function fala(id, texto, gesto = null) {
    const caixa = id === me() ? $('meu-assento') : ctx.assentos.get(id);
    if (!caixa) return;
    let balao = caixa.querySelector('.balao');
    if (!balao) { balao = el('span', 'balao'); caixa.appendChild(balao); }
    balao.classList.remove('emote');
    balao.textContent = texto;
    if (ctx.semMovimento()) return;
    ctx.repete(balao, 'fala');
    if (gesto) ctx.repete(caixa, gesto);
  }

  // ---- o que client.js chama ----------------------------------------------------

  return {
    render() {
      cabecalho();
      ctx.renderOpponents();
      marcasDosAssentos();
      desenhaEtapa();
      desenhaBoard();
      desenhaPote();
      desenhaResultado();
      minhasFichas();
      // segurando o resultado, a sua mão continua a da mão que acabou
      if (!segurando()) ctx.renderHand();
      $('hand').classList.toggle('pk-correu', v().phase === 'play' && !!v().players.find((p) => p.id === me())?.foldou && !segurando());
      botoes();
      ctx.atualizaBanner();
      modalDeFase();
    },

    textoDaVez() {
      return textoDaVez(v(), me(), nome, segurando());
    },

    anuncia(ev) {
      const eu_ = me();
      switch (ev.e) {
        case 'roundStart':
          ctx.novaRodada();
          bandeja.el.hidden = true;
          if (ev.subiu) ctx.toast(`Os blinds subiram: ${fmt(ev.blinds[0])}/${fmt(ev.blinds[1])}.`);
          break;
        case 'mesa': case 'correu': case 'pagou': case 'apostou': case 'aumentou': {
          const f = falaDoLance(ev);
          fala(ev.p, f.texto, f.gesto);
          break;
        }
        case 'etapa':
          if (ev.corrida) corridaPendente.push({ etapa: ev.etapa, n: ev.cards.length });
          break;
        case 'maoFim': {
          const corrida = corridaPendente.splice(0);
          const ms = msDaSegura(ev, corrida.length);
          segura = { ev, ate: Date.now() + ms, corrida };
          resultado.dataset.mao = '';
          clearTimeout(timerSegura);
          timerSegura = setTimeout(soltaResultado, ms + 30);
          const ganhou = ev.potes.find((x) => !x.devolvido)?.vencedores || [];
          for (const id of ganhou) setTimeout(() => ctx.reage(id, 'levou'), corrida.length ? corrida.length * 900 : 0);
          break;
        }
        case 'eliminado':
          ctx.toast(ev.p === eu_ ? `Suas fichas acabaram: ${ev.lugar}º lugar.` : `${nome(ev.p)} ficou sem fichas (${ev.lugar}º).`);
          setTimeout(() => ctx.reage(ev.p, 'perdeu'), 400);
          break;
      }
    },

    mostraJogador(id) {
      const vw = v();
      const p = vw.players.find((x) => x.id === id);
      if (!p) return;
      const situacao = p.fora ? `Fora da mesa · ${p.lugar}º lugar` : `${fmt(p.fichas)} em fichas${p.foldou && vw.phase === 'play' ? ' · correu nesta mão' : p.allIn ? ' · all-in' : ''}`;
      ctx.showModal(
        `<div id="oponente-topo" class="oponente-topo"></div>
         <h3>${ctx.escapeHTML(p.name)}</h3>
         <p>${situacao}</p>
         ${p.aposta ? `<p>Apostou ${fmt(p.aposta)} nesta rodada de apostas.</p>` : ''}
         <p>${p.maos} mão${p.maos === 1 ? '' : 's'} ganha${p.maos === 1 ? '' : 's'}</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
      $('oponente-topo').appendChild(ctx.avatarEl(p.id, vw.players, 72));
    },

    placar() {
      const vw = v();
      const linhas = classificacao(vw.players).map((p) => linha(p, p.fora ? `fora (${p.lugar}º)` : fmt(p.fichas))).join('');
      const [sb, bb] = vw.blinds;
      ctx.showModal(
        `<h2>Fichas na mesa</h2>
         <table class="score-table"><thead><tr><th>Jogador</th><th class="num">Mãos</th><th class="num">Fichas</th></tr></thead><tbody>${linhas}</tbody></table>
         <p class="modal-hint">Mão ${vw.round + 1} · blinds ${fmt(sb)}/${fmt(bb)}${vw.proximosBlinds ? `, sobem para ${fmt(vw.proximosBlinds[0])}/${fmt(vw.proximosBlinds[1])} em ${vw.maosParaSubir} mão${vw.maosParaSubir === 1 ? '' : 's'}` : ''}. A partida acaba quando um jogador fica com todas as fichas.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
    regras() {
      const fichas = [...FICHAS].reverse().map((f) => `<span class="pk-regra-ficha f-${f.cor}"><i class="pk-ficha"></i>${fmt(f.valor)}</span>`).join('');
      ctx.showModal(
        `<h2>Como se joga o Poker</h2>
         <p class="modal-hint">Texas Hold'em sem limite, valendo fichas.</p>
         <p><strong>As cartas:</strong> cada um recebe 2 fechadas. Na mesa abrem 5, para todos: o <strong>flop</strong> (3), o <strong>turn</strong> (1) e o <strong>river</strong> (1). Vale a melhor combinação de 5 entre as suas 2 e as 5 da mesa.</p>
         <p><strong>As fichas:</strong> cada cor tem um valor. Todos começam com 1.000.</p>
         <p class="pk-regra-fichas">${fichas}</p>
         <p><strong>Blinds:</strong> antes das cartas, os dois à esquerda do botão (D) põem a aposta obrigatória: o small blind (SB) e o big blind (BB). Começam em 10/20 e sobem a cada 6 mãos. O botão anda uma cadeira por mão.</p>
         <p><strong>Na sua vez:</strong> <em>mesa</em> (passa sem apostar, se ninguém apostou), <em>pagar</em> (iguala a aposta), <em>apostar</em> ou <em>aumentar</em> (toque nas fichas para montar o valor), ou <em>correr</em> (larga a mão e o que já apostou). O aumento mínimo é o tamanho do último aumento. <em>All-in</em> é apostar tudo.</p>
         <p><strong>Quem ganha:</strong> se todos correm, o último leva o pote sem mostrar. Senão, no fim as mãos são mostradas e a melhor leva. Empate divide. Quem foi all-in só disputa o que cobriu: o resto vira pote paralelo.</p>
         <p><strong>Ordem das mãos</strong>, da mais fraca para a mais forte: carta alta · par · dois pares · trinca · sequência (o Ás vale também como 1) · flush (5 do mesmo naipe) · full house (trinca + par) · quadra · straight flush (sequência do mesmo naipe). Naipe não desempata.</p>
         <p><strong>Fim:</strong> quem fica sem fichas sai; ganha quem ficar com todas.</p>`,
        [{ label: 'Entendi', cls: 'btn-primary', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
  };
}
