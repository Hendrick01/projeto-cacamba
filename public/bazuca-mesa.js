// ============================================================================
// Bazuca — a mesa 2D. Este arquivo (e o bazuca.css) só é baixado quando
// alguém escolhe o modo ou entra numa sala dele, como os do Presidente e do
// Dominó.
//
// O jogo é de memória: a tela mostra valor de carta SÓ quando ela está à
// vista de verdade (a de cima do descarte, a que você comprou, a que você
// está espiando, a que um descarte errado mostrou a todos). Nada aqui marca
// carta já vista, nem acende carta que daria para descartar — o dono do jogo
// pediu explicitamente que não houvesse assistência.
//
// Toque numa carta para escolhê-la (de qualquer um); os botões de baixo dizem
// o que dá para fazer com ela. Dois toques rápidos numa carta = descartar em
// cima, que é a jogada de reflexo.
// ============================================================================

import { rotulo, contaDaRodada } from '/shared/bazuca.js';

const NOME_DO_PODER = { J: 'valete', Q: 'dama', K: 'rei' };

// Ordem das posições na grade de duas fileiras: 0 e 1 em cima, 2 e 3 embaixo
// (as duas de perto), e as cartas de punição seguem em colunas novas.
function ordemDasPosicoes(n) {
  const base = [0, 2, 1, 3].filter((i) => i < n);
  for (let i = 4; i < n; i++) base.push(i);
  return base;
}

export function criaMesaBazuca(ctx) {
  const { $ } = ctx;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/bazuca.css';
  document.head.appendChild(css);

  // ---- o meio da mesa ------------------------------------------------------
  const mesa = document.createElement('div');
  mesa.id = 'bz-mesa';
  mesa.className = 'bz-mesa';
  const outros = document.createElement('div');
  outros.className = 'bz-outros';
  const meio = document.createElement('div');
  meio.className = 'bz-meio';
  const monte = document.createElement('button');
  monte.type = 'button';
  monte.className = 'bz-monte';
  const descarte = document.createElement('div');
  descarte.className = 'bz-descarte';
  const comprada = document.createElement('div');
  comprada.className = 'bz-comprada';
  const relogio = document.createElement('div');
  relogio.className = 'bz-relogio';
  relogio.setAttribute('aria-hidden', 'true');
  meio.append(monte, descarte, comprada, relogio);
  mesa.append(outros, meio);
  $('screen-game').querySelector('.table-center').prepend(mesa);

  const grito = document.createElement('div');
  grito.className = 'bz-grito';
  grito.hidden = true;
  grito.setAttribute('aria-hidden', 'true');
  grito.innerHTML = '<div class="bz-grito-raios"></div><div class="bz-grito-texto">BAZUCA!</div><div class="bz-grito-quem"></div>';
  $('screen-game').appendChild(grito);

  // A LUPA: carta de adversário à vista (a dama, ou um descarte errado) sai
  // grande no meio da tela. Na grade dele a carta tem 30 px e em celular
  // pequeno não se lê — e é justamente a carta que você precisa decorar.
  // Vem com o nome do dono e um mapinha da grade dele, com a posição acesa.
  const lupa = document.createElement('div');
  lupa.className = 'bz-lupa';
  lupa.hidden = true;
  lupa.setAttribute('role', 'status');
  lupa.setAttribute('aria-live', 'polite');
  $('screen-game').appendChild(lupa);
  let lupaChave = '';

  // ---- botões ----------------------------------------------------------------
  const barra = $('action-bar');
  const botao = (id, texto, cls) => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = `btn bz-btn ${cls}`; b.textContent = texto; b.hidden = true;
    barra.insertBefore(b, $('btn-sort'));
    return b;
  };
  const bComprar = botao('bz-comprar', 'Comprar do monte', 'btn-primary');
  const bBazuca = botao('bz-bazuca', 'BAZUCA!', 'btn-danger bz-btn-bazuca');
  const bTrocar = botao('bz-trocar', 'Trocar', 'btn-primary');
  const bJogaFora = botao('bz-jogafora', 'Descartar a comprada', '');
  const bPoder = botao('bz-poder', '', 'btn-primary');
  const bDar = botao('bz-dar', '', 'btn-primary');
  const bPar = botao('bz-par', 'Descartar o par', '');
  const bRapido = botao('bz-rapido', 'Descartar em cima', 'bz-btn-rapido');

  const v = () => ctx.view;
  const eu = () => ctx.me();
  const nome = (id) => (id === eu() ? 'Você' : ctx.playerName(id));
  const doNome = (id) => (id === eu() ? 'sua' : `de ${ctx.playerName(id)}`);
  const minhaVez = () => v()?.phase === 'play' && v()?.turnId === eu();
  const jogando = () => v()?.phase === 'play';

  let sel = [];                 // [{ p, i }] — no máximo duas
  const destaques = new Map();  // "p:i" → { tipo, ate }
  let ultimoSeq = null;
  let prazoLocal = null;        // Date.now() em que a vez (ou a espiada) acaba
  // cartas que já viraram: a mesa é redesenhada a cada jogada, e sem isto a
  // carta à vista refazia o giro (e piscava) a cada lance dos robôs
  const jaVirou = new Set();

  const ehSel = (p, i) => sel.some((s) => s.p === p && s.i === i);
  const minhas = () => sel.filter((s) => s.p === eu());
  const alheias = () => sel.filter((s) => s.p !== eu());

  function escolhe(p, i) {
    if (ehSel(p, i)) sel = sel.filter((s) => !(s.p === p && s.i === i));
    else {
      sel.push({ p, i });
      if (sel.length > 2) sel.shift();
    }
    ctx.render();
  }
  function manda(action) {
    ctx.sendAction(action);
    sel = [];
    ctx.render();
  }

  bComprar.onclick = () => manda({ a: 'comprar' });
  monte.onclick = () => { if (minhaVez() && v().etapa === 'comprar') manda({ a: 'comprar' }); };
  bBazuca.onclick = () => manda({ a: 'bazuca' });
  bTrocar.onclick = () => { const m = minhas()[0]; if (m) manda({ a: 'trocar', i: m.i }); };
  bJogaFora.onclick = () => manda({ a: 'descartarComprada' });
  bPar.onclick = () => { const [a, b] = minhas(); if (a && b) manda({ a: 'par', i: a.i, j: b.i }); };
  bRapido.onclick = () => { const s = sel[0]; if (s) manda({ a: 'descartar', p: s.p, i: s.i }); };
  bDar.onclick = () => { const m = minhas()[0]; if (m) manda({ a: 'dar', j: m.i }); };
  bPoder.onclick = () => {
    const pd = v().poder;
    if (pd === 'J') { const m = minhas()[0]; if (m) manda({ a: 'espiar', i: m.i }); }
    if (pd === 'Q') { const o = alheias()[0]; if (o) manda({ a: 'olhar', p: o.p, i: o.i }); }
    if (pd === 'K') { const m = minhas()[0], o = alheias()[0]; if (m && o) manda({ a: 'rei', i: m.i, p: o.p, j: o.i }); }
  };

  // ---- o que está à vista ----------------------------------------------------

  // A carta que ESTÁ à vista agora nesta posição, ou null.
  function aVista(p, i) {
    const vw = v();
    if (vw.phase === 'roundEnd' || vw.phase === 'gameEnd') {
      const c = vw.players.find((x) => x.id === p)?.slots[i];
      return c && typeof c === 'object' ? { card: c, tipo: 'fim' } : null;
    }
    const r = vw.reveladas.find((x) => x.p === p && x.i === i);
    if (r) return { card: r.card, tipo: 'revelada' };
    const e = vw.you?.espiadas.find((x) => x.p === p && x.i === i);
    if (e) return { card: e.card, tipo: 'espiada' };
    return null;
  }

  function marcaDestaque(p, i, tipo, ms = 2200) {
    destaques.set(`${p}:${i}`, { tipo, ate: Date.now() + ms });
    setTimeout(() => ctx.render(), ms + 30);
  }

  function slotEl(p, i, cheio) {
    if (!cheio) {
      const b = document.createElement('span');
      b.className = 'bz-slot bz-buraco';
      b.setAttribute('aria-hidden', 'true');
      return b;
    }
    const vista = aVista(p, i);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bz-slot';
    b.dataset.p = p; b.dataset.i = String(i);
    const carta = vista ? ctx.cardEl(vista.card) : Object.assign(document.createElement('div'), { className: 'card back' });
    b.appendChild(carta);
    if (vista) {
      b.classList.add(`bz-${vista.tipo}`);
      const k = `${vista.tipo}:${p}:${i}:${vista.card.id}`;
      if (!jaVirou.has(k)) { jaVirou.add(k); b.classList.add('vira'); }
    }
    if (ehSel(p, i)) b.classList.add('sel');
    const d = destaques.get(`${p}:${i}`);
    if (d && d.ate > Date.now()) b.classList.add(`bz-d-${d.tipo}`);
    const dono = p === eu() ? 'sua' : `de ${ctx.playerName(p)}`;
    b.setAttribute('aria-label', vista ? `Carta ${dono}: ${vista.card.joker ? 'coringa' : rotulo(vista.card.rank)}` : `Carta virada ${dono}`);
    b.setAttribute('aria-pressed', String(ehSel(p, i)));
    b.disabled = v().phase !== 'play';
    b.onclick = () => escolhe(p, i);
    // dois toques = descartar em cima (ou dar, quando você deve uma carta)
    b.ondblclick = (e) => {
      e.preventDefault();
      if (!jogando()) return;
      if (v().you?.devo) { if (p === eu()) manda({ a: 'dar', j: i }); return; }
      manda({ a: 'descartar', p, i });
    };
    return b;
  }

  function grade(jogador, classe) {
    const g = document.createElement('div');
    g.className = `bz-grade ${classe}`;
    const slots = jogador.slots;
    for (const i of ordemDasPosicoes(slots.length)) g.appendChild(slotEl(jogador.id, i, !!slots[i]));
    return g;
  }

  // ---- desenho ---------------------------------------------------------------

  function desenhaOutros() {
    const vw = v();
    const k = vw.players.findIndex((p) => p.id === eu());
    const ordem = vw.players.map((_, j) => vw.players[(k + 1 + j) % vw.players.length]).filter((p) => p.id !== eu());
    outros.innerHTML = '';
    outros.dataset.n = String(ordem.length);
    const colunas = ordem.reduce((n, p) => n + Math.ceil(p.slots.length / 2), 0);
    outros.dataset.folga = ordem.length <= 3 && colunas <= 6 ? '1' : '0';
    for (const p of ordem) {
      const lugar = document.createElement('div');
      lugar.className = 'bz-lugar';
      lugar.style.setProperty('--anel', ctx.corDoJogador(p.id));
      if (vw.turnId === p.id) lugar.classList.add('vez');
      if (!p.isBot && p.connected === false) lugar.classList.add('fora');
      if (vw.lastRound && vw.phase !== 'play' && vw.lastRound.vencedor === p.id) lugar.classList.add('venceu');
      const topo = document.createElement('div');
      topo.className = 'bz-lugar-topo';
      topo.appendChild(ctx.avatarEl(p.id, vw.players, 24));
      const n = document.createElement('span');
      n.className = 'bz-lugar-nome';
      n.textContent = p.name;
      topo.appendChild(n);
      if (vw.dividas.some((d) => d.de === p.id)) topo.appendChild(marca('dando carta', 'bz-m-deve'));
      lugar.append(topo, grade(p, 'pequena'));
      outros.appendChild(lugar);
    }
  }

  function desenhaMeu() {
    const vw = v();
    const box = $('hand');
    box.innerHTML = '';
    const p = vw.players.find((x) => x.id === eu());
    if (!p) return;
    const meu = document.createElement('div');
    meu.className = 'bz-meu';
    if (minhaVez()) meu.classList.add('vez');
    meu.style.setProperty('--anel', ctx.corDoJogador(p.id));
    meu.appendChild(grade(p, 'grande'));
    box.appendChild(meu);
  }

  function mapinha(jogador, i) {
    const g = document.createElement('div');
    g.className = 'bz-mapinha';
    for (const k of ordemDasPosicoes(jogador.slots.length)) {
      const c = document.createElement('span');
      c.className = `bz-mapinha-c${jogador.slots[k] ? '' : ' vazio'}${k === i ? ' aqui' : ''}`;
      g.appendChild(c);
    }
    return g;
  }

  function desenhaLupa() {
    const vw = v();
    const itens = vw.phase !== 'play' ? [] : [
      ...(vw.you?.espiadas || []).filter((x) => x.p !== eu()).map((x) => ({ ...x, tipo: 'espiada' })),
      ...vw.reveladas.map((x) => ({ ...x, tipo: 'revelada' })),
    ];
    const chave = itens.map((x) => `${x.tipo}:${x.p}:${x.i}:${x.card.id}`).join('|');
    if (chave === lupaChave) return;
    lupaChave = chave;
    lupa.innerHTML = '';
    lupa.hidden = !itens.length;
    if (!itens.length) return;
    for (const x of itens.slice(0, 3)) {
      const dono = vw.players.find((p) => p.id === x.p);
      if (!dono) continue;
      const bloco = document.createElement('div');
      bloco.className = `bz-lupa-bloco ${x.tipo}`;
      const titulo = document.createElement('div');
      titulo.className = 'bz-lupa-titulo';
      titulo.textContent = x.tipo === 'espiada'
        ? `Carta de ${ctx.playerName(x.p)}`
        : `${x.p === eu() ? 'Sua carta' : `Carta de ${ctx.playerName(x.p)}`} (errou)`;
      const carta = ctx.cardEl(x.card);
      carta.classList.add('bz-lupa-carta');
      bloco.append(titulo, carta, mapinha(dono, x.i));
      bloco.setAttribute('aria-label', `${titulo.textContent}: ${x.card.joker ? 'coringa' : rotulo(x.card.rank)}`);
      lupa.appendChild(bloco);
    }
    // um toque fecha antes da hora (a carta continua à vista na grade)
    lupa.onclick = () => { lupa.hidden = true; };
    ctx.repete(lupa, 'entra');
  }

  function desenhaMeio() {
    const vw = v();
    // o monte
    monte.innerHTML = '<div class="card back"></div>';
    const cont = document.createElement('span');
    cont.className = 'bz-conta';
    cont.textContent = vw.monte;
    monte.appendChild(cont);
    const posso = minhaVez() && vw.etapa === 'comprar';
    monte.classList.toggle('glow', posso);
    monte.disabled = !posso;
    monte.setAttribute('aria-label', `Monte, ${vw.monte} cartas${posso ? '. Toque para comprar.' : ''}`);

    // o descarte: só a de cima
    descarte.innerHTML = '';
    const c = vw.topo ? ctx.cardEl(vw.topo) : Object.assign(document.createElement('div'), { className: 'card empty' });
    if (vw.descarteSeq !== ultimoSeq && vw.topo && ultimoSeq !== null && !ctx.semMovimento()) c.classList.add('cai');
    ultimoSeq = vw.descarteSeq;
    descarte.appendChild(c);
    const legenda = document.createElement('span');
    legenda.className = 'bz-conta';
    legenda.textContent = 'descarte';
    descarte.appendChild(legenda);
    descarte.setAttribute('role', 'img');
    descarte.setAttribute('aria-label', vw.topo ? `Em cima do descarte: ${vw.topo.joker ? 'coringa' : rotulo(vw.topo.rank)}` : 'Descarte vazio');

    // a comprada: você vê a sua; dos outros, só que há uma na mão
    comprada.innerHTML = '';
    const minha = vw.you?.comprada;
    const outro = !minha && vw.phase === 'play' && vw.etapa === 'decidir' && vw.turnId !== eu();
    comprada.hidden = !minha && !outro;
    if (minha) {
      comprada.appendChild(ctx.cardEl(minha));
      comprada.appendChild(Object.assign(document.createElement('span'), { className: 'bz-conta', textContent: 'comprada' }));
    } else if (outro) {
      comprada.appendChild(Object.assign(document.createElement('div'), { className: 'card back' }));
      comprada.appendChild(Object.assign(document.createElement('span'), { className: 'bz-conta', textContent: 'na mão dele' }));
    }
    comprada.classList.toggle('minha', !!minha);

    // o relógio
    prazoLocal = vw.prazoMs != null ? Date.now() + vw.prazoMs : null;
    tique();
  }

  function tique() {
    const vw = v();
    if (!vw || prazoLocal == null || (vw.phase !== 'play' && vw.phase !== 'espiar')) { relogio.hidden = true; return; }
    const s = Math.max(0, Math.ceil((prazoLocal - Date.now()) / 1000));
    relogio.hidden = false;
    relogio.textContent = `${s}s`;
    relogio.classList.toggle('apertado', s <= 8);
    relogio.classList.toggle('meu', minhaVez() || vw.phase === 'espiar');
  }
  setInterval(() => { if (v()?.modo === 'bazuca') { tique(); ctx.atualizaBanner(); } }, 500);

  function marca(texto, cls) {
    const e = document.createElement('span');
    e.className = cls;
    e.textContent = texto;
    return e;
  }

  function botoes() {
    const vw = v();
    for (const id of ['btn-draw-deck', 'btn-draw-discard', 'btn-queimar', 'btn-baixar', 'btn-discard', 'btn-meld-discard', 'btn-cancel-mode', 'btn-claim']) $(id).hidden = true;
    for (const b of [bComprar, bBazuca, bTrocar, bJogaFora, bPoder, bDar, bPar, bRapido]) b.hidden = true;
    if (!jogando()) return;
    const vez = minhaVez();
    const devo = vw.you?.devo;
    const m = minhas(), o = alheias();

    if (devo) {
      bDar.hidden = m.length !== 1;
      bDar.textContent = `Dar esta carta a ${ctx.playerName(devo.para)}`;
      return;
    }
    if (vez && vw.etapa === 'comprar') bComprar.hidden = false;
    // o grito vale a vez inteira: antes de comprar, decidindo ou no poder
    if (vez) bBazuca.hidden = false;
    if (vez && vw.etapa === 'decidir') {
      bJogaFora.hidden = false;
      bTrocar.hidden = !(m.length === 1 && sel.length === 1);
    }
    if (vez && vw.etapa === 'poder') {
      const pd = vw.poder;
      const pronto = pd === 'J' ? (m.length === 1 && sel.length === 1)
        : pd === 'Q' ? (o.length === 1 && sel.length === 1)
          : (m.length === 1 && o.length === 1);
      bPoder.hidden = !pronto;
      bPoder.textContent = pd === 'K' ? 'Trocar estas duas (rei)' : `Olhar esta carta (${NOME_DO_PODER[pd]})`;
    }
    if (vez && m.length === 2) bPar.hidden = false;
    // o descarte rápido vale para qualquer carta, a qualquer hora — e o botão
    // aparece igual, combine ou não: quem sabe é a sua memória
    if (sel.length === 1) bRapido.hidden = false;
  }

  function cabecalho() {
    const vw = v();
    $('round-label').textContent = `Bazuca · Rodada ${vw.round + 1}`;
    const minhas = vw.players.find((p) => p.id === eu())?.vitorias || 0;
    $('contract-label').textContent = `${minhas} de ${vw.meta || 4} vitórias`;
  }

  // ---- fim de rodada ---------------------------------------------------------

  function linhasDoPlacar() {
    const vw = v();
    return [...vw.players].sort((a, b) => b.vitorias - a.vitorias).map((p) => `<tr class="${vw.lastRound?.vencedor === p.id && vw.phase === 'roundEnd' ? 'winner' : ''}"><td><span class="quem">
        <img class="avatar" src="${ctx.caraDoJogador(p.id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(p.id)}">
        <span>${ctx.escapeHTML(nome(p.id))}</span></span></td><td class="num">${p.vitorias}</td></tr>`).join('');
  }
  const tabela = () => `<table class="score-table"><thead><tr><th>Jogador</th><th class="num">Vitórias</th></tr></thead><tbody>${linhasDoPlacar()}</tbody></table>`;

  function maosReveladas(lr) {
    const vw = v();
    return `<ul class="bz-maos">${vw.players.map((p) => {
      const cartas = (lr.maos?.[p.id] || []).filter(Boolean);
      const mini = cartas.map((c) => `<span class="bz-mini${c.joker ? ' coringa' : ''}">${c.joker ? 'C' : rotulo(c.rank)}</span>`).join('') || '<em>bateu</em>';
      return `<li class="${lr.vencedor === p.id ? 'venceu' : ''}"><span class="bz-maos-nome">${ctx.escapeHTML(nome(p.id))}</span><span class="bz-maos-cartas">${mini}</span><span class="bz-maos-soma">${lr.somas?.[p.id] ?? ''}</span></li>`;
    }).join('')}</ul>`;
  }

  let modalDaRodada = null;
  function modalDeFase() {
    const vw = v();
    const chave = vw.phase === 'roundEnd' || vw.phase === 'gameEnd' ? `${vw.phase}:${vw.round}` : null;
    if (chave) {
      if (modalDaRodada === chave) return;
      modalDaRodada = chave;
      if (vw.phase === 'gameEnd') { fimDaPartida(); return; }
      // um instante para a última carta cair antes de cobrir a mesa
      setTimeout(() => { if (v()?.phase === 'roundEnd' && modalDaRodada === chave) fimDaRodada(); }, 900);
    } else if (modalDaRodada !== null) {
      modalDaRodada = null;
      ctx.closeModal();
    }
  }

  function fimDaRodada() {
    const vw = v();
    const lr = vw.lastRound;
    if (!lr) return;
    const { titulo, texto } = contaDaRodada(lr, (id) => ctx.escapeHTML(nome(id)), eu());
    const q = lr.vencedor;
    const fechou = !!lr.campeao;   // alguém chegou às 4: o próximo passo é o resultado final
    ctx.showModal(
      `${q ? `<div class="palco-vencedor"><img src="${ctx.figuraFeliz(q)}" alt=""></div>` : ''}
       <h2>${titulo}</h2>
       <p>${texto}</p>
       ${maosReveladas(lr)}
       ${tabela()}
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião continuar…</p>'}`,
      ctx.isHost() ? [{ label: fechou ? 'Ver resultado final' : 'Próxima rodada', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'nextRound' }) }] : [],
    );
  }

  // Quem chegou às 4 vitórias leva a partida; o anfitrião decide se a mesa
  // joga de novo, como no Caçamba.
  function fimDaPartida() {
    const vw = v();
    const q = vw.campeao;
    const acoes = ctx.isHost() ? [{ label: 'Jogar de novo', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'playAgain' }) }] : [];
    acoes.push({ label: 'Sair da sala', cls: 'btn-ghost', fn: ctx.saiDaSala });
    ctx.showModal(
      `${q ? `<div class="palco-vencedor grande"><img src="${ctx.figuraFeliz(q)}" alt=""></div>` : ''}
       <h2>${q === eu() ? 'Você venceu a partida!' : `${ctx.escapeHTML(nome(q))} venceu a partida!`}</h2>
       <p>Chegou a ${vw.meta || 4} vitórias.</p>
       ${tabela()}
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião decidir…</p>'}`,
      acoes,
    );
  }

  // ---- o grito ---------------------------------------------------------------

  let audio = null;
  function som(tipo) {
    try {
      if (!navigator.userActivation?.hasBeenActive) return;
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const ac = audio;
      const t = ac.currentTime;
      const saida = ac.createGain();
      saida.connect(ac.destination);
      if (tipo === 'bazuca') {
        // o estouro: ruído grave abafando + uma descida de tom
        const n = ac.sampleRate * 1.2;
        const buf = ac.createBuffer(1, n, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let k = 0; k < n; k++) d[k] = (Math.random() * 2 - 1) * (1 - k / n) ** 2.4;
        const ruido = ac.createBufferSource();
        ruido.buffer = buf;
        const filtro = ac.createBiquadFilter();
        filtro.type = 'lowpass';
        filtro.frequency.setValueAtTime(2400, t);
        filtro.frequency.exponentialRampToValueAtTime(120, t + 1.1);
        ruido.connect(filtro).connect(saida);
        const grave = ac.createOscillator();
        grave.type = 'sine';
        grave.frequency.setValueAtTime(150, t);
        grave.frequency.exponentialRampToValueAtTime(36, t + 0.9);
        const gg = ac.createGain();
        gg.gain.setValueAtTime(0.9, t);
        gg.gain.exponentialRampToValueAtTime(0.001, t + 1);
        grave.connect(gg).connect(saida);
        saida.gain.setValueAtTime(0.55, t);
        ruido.start(t); grave.start(t); grave.stop(t + 1.05);
        return;
      }
      const o = ac.createOscillator();
      o.type = tipo === 'erro' ? 'square' : 'triangle';
      o.frequency.setValueAtTime(tipo === 'erro' ? 150 : 880, t);
      if (tipo === 'erro') o.frequency.linearRampToValueAtTime(110, t + 0.28);
      saida.gain.setValueAtTime(tipo === 'erro' ? 0.12 : 0.16, t);
      saida.gain.exponentialRampToValueAtTime(0.001, t + (tipo === 'erro' ? 0.32 : 0.12));
      o.connect(saida);
      o.start(t); o.stop(t + 0.35);
    } catch { /* sem áudio, segue o jogo */ }
  }

  function gritaBazuca(id) {
    som('bazuca');
    try { navigator.vibrate?.([60, 40, 140]); } catch { /* ok */ }
    grito.querySelector('.bz-grito-quem').textContent = id === eu() ? 'você gritou' : `${ctx.playerName(id)} gritou`;
    grito.hidden = false;
    $('screen-game').classList.remove('bz-treme');
    void grito.offsetWidth;
    ctx.repete(grito, 'entra');
    if (!ctx.semMovimento()) ctx.repete($('screen-game'), 'bz-treme');
    clearTimeout(grito.dataset.t);
    grito.dataset.t = String(setTimeout(() => { grito.hidden = true; }, 1700));
  }

  // ---- o que client.js chama -------------------------------------------------

  return {
    render() {
      const vw = v();
      // seleção que já não existe (carta saiu, rodada mudou) cai fora
      sel = sel.filter((s) => vw.players.find((p) => p.id === s.p)?.slots[s.i]);
      if (vw.phase !== 'play') sel = [];
      cabecalho();
      desenhaOutros();
      desenhaMeio();
      desenhaMeu();
      desenhaLupa();
      botoes();
      ctx.atualizaBanner();
      modalDeFase();
    },

    textoDaVez() {
      const vw = v();
      const s = prazoLocal != null ? Math.max(0, Math.ceil((prazoLocal - Date.now()) / 1000)) : null;
      if (vw.phase === 'espiar') return { minha: true, texto: `Decore as suas duas cartas de baixo! (${s ?? ''}s)` };
      if (vw.phase !== 'play') return { minha: false, texto: '' };
      const devo = vw.you?.devo;
      if (devo) return { minha: true, texto: `Acertou! Escolha uma carta sua para dar a ${ctx.playerName(devo.para)}.` };
      if (!minhaVez()) {
        const pd = vw.etapa === 'poder' ? ` (usando o ${NOME_DO_PODER[vw.poder]})` : '';
        return { minha: false, texto: `Vez de ${ctx.playerName(vw.turnId)}${pd}…` };
      }
      if (vw.etapa === 'comprar') return { minha: true, texto: 'Sua vez: compre do monte — ou grite BAZUCA!' };
      if (vw.etapa === 'decidir') return { minha: true, texto: 'Troque por uma das suas (escolha a carta) ou descarte a comprada.' };
      if (vw.poder === 'J') return { minha: true, texto: 'Valete: escolha uma carta SUA para olhar.' };
      if (vw.poder === 'Q') return { minha: true, texto: 'Dama: escolha uma carta de OUTRO jogador para olhar.' };
      return { minha: true, texto: 'Rei: escolha uma carta sua e uma de outro jogador para trocar.' };
    },

    anuncia(ev) {
      const vw = v();
      const rot = (c) => (c?.joker ? 'coringa' : rotulo(c?.rank));
      switch (ev.e) {
        case 'roundStart':
          ctx.novaRodada();
          sel = []; destaques.clear(); ultimoSeq = null; jaVirou.clear();
          modalDaRodada = null;
          ctx.closeModal();
          break;
        case 'espiada':   // a faixa da vez já diz, com a contagem
          break;
        case 'comeca':
          ctx.toast(ev.p === eu() ? 'Sorteado: você começa.' : `Sorteado: ${nome(ev.p)} começa.`);
          break;
        case 'comprou':
          if (ev.p !== eu()) ctx.toast(`${nome(ev.p)} comprou.`);
          break;
        case 'trocou':
          marcaDestaque(ev.p, ev.i, 'mudou');
          ctx.toast(`${nome(ev.p)} trocou uma carta: foi ${rot(ev.card)} para o descarte.`);
          break;
        case 'descartou':
          ctx.toast(`${nome(ev.p)} descartou ${rot(ev.card)}${ev.semPoder ? ' (sem poder)' : ''}.`);
          break;
        case 'poder':
          if (ev.p !== eu()) ctx.toast(`${nome(ev.p)} vai usar o ${NOME_DO_PODER[ev.poder]}.`);
          break;
        case 'espiou':
          marcaDestaque(ev.p, ev.i, 'olho');
          if (ev.p !== eu()) ctx.toast(`${nome(ev.p)} olhou uma carta dele.`);
          break;
        case 'olhou':
          marcaDestaque(ev.alvo, ev.i, 'olho');
          ctx.toast(ev.alvo === eu() ? `${nome(ev.p)} olhou uma carta sua.` : `${nome(ev.p)} olhou uma carta ${doNome(ev.alvo)}.`);
          break;
        case 'reiTrocou':
          marcaDestaque(ev.p, ev.i, 'troca', 2600);
          marcaDestaque(ev.alvo, ev.j, 'troca', 2600);
          ctx.toast(`${nome(ev.p)} trocou uma carta ${ev.p === eu() ? 'sua' : 'dele'} com uma ${doNome(ev.alvo)}.`);
          break;
        case 'rapido':
          som('rapido');
          ctx.toast(`${nome(ev.quem)} descartou em cima: ${rot(ev.card)}${ev.p === ev.quem ? '' : ` ${doNome(ev.p)}`}!`);
          if (ev.quem !== eu()) ctx.reage(ev.quem, 'baixou');
          break;
        case 'deve':
          if (ev.de === eu()) ctx.toast(`Acertou! Agora escolha uma carta sua para dar a ${nome(ev.para)}.`);
          break;
        case 'deu':
          marcaDestaque(ev.para, ev.i, 'chegou');
          if (ev.para === eu()) ctx.toast(`${nome(ev.de)} deu uma carta para você.`);
          break;
        case 'errou':
          som('erro');
          ctx.toast(`${nome(ev.quem)} errou: era ${rot(ev.card)}. Leva mais uma carta.`);
          break;
        case 'punicao':
          marcaDestaque(ev.p, ev.i, 'nova', 2600);
          break;
        case 'par':
          som('rapido');
          ctx.toast(`${nome(ev.p)} descartou um par de ${rot(ev.cards[0])}!`);
          break;
        case 'parErrado':
          som('erro');
          ctx.toast(`${nome(ev.p)} errou o par (${rot(ev.cards[0])} e ${rot(ev.cards[1])}). Leva mais uma.`);
          break;
        case 'bazuca':
          // a rodada acaba aqui; o fim dela conta quem tinha a menor soma
          gritaBazuca(ev.p);
          break;
        case 'estourou':
          ctx.toast(ev.p === eu() ? 'Seu tempo acabou.' : `O tempo de ${nome(ev.p)} acabou.`);
          break;
        case 'poderPerdido':
          ctx.toast(`${nome(ev.p)} perdeu o poder do ${NOME_DO_PODER[ev.poder]}.`);
          break;
        case 'remexeu':
          ctx.toast('O monte acabou: o descarte foi embaralhado.');
          break;
        case 'roundEnd':
          if (ev.motivo === 'bateu' && ev.vencedor) ctx.reage(ev.vencedor, 'bateu');
          break;
        default:
          break;
      }
      void vw;
    },

    mostraJogador(id) {
      const vw = v();
      const p = vw.players.find((x) => x.id === id);
      if (!p) return;
      ctx.showModal(
        `<div id="oponente-topo" class="oponente-topo"></div>
         <h3>${ctx.escapeHTML(p.name)}</h3>
         <p>${p.handCount} carta${p.handCount === 1 ? '' : 's'} na mesa · ${p.vitorias} vitória${p.vitorias === 1 ? '' : 's'}</p>
         ${p.desistiu ? '<p class="modal-hint">Saiu da partida — o robô joga o resto por ele.</p>' : ''}`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
      $('oponente-topo').appendChild(ctx.avatarEl(p.id, vw.players, 72));
    },

    placar() {
      ctx.showModal(
        `<h2>Placar</h2>${tabela()}
         <p class="modal-hint">Cada rodada vale uma vitória para quem bate ou tem a menor soma na contagem. A partida vai até alguém chegar a ${v().meta || 4} vitórias.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },

    regras() {
      ctx.showModal(
        `<h2>Como se joga o Bazuca</h2>
         <p><strong>Objetivo:</strong> ter a menor soma, ou ficar sem cartas. Coringa vale 0, Ás 1, do 2 ao 10 o número, J 11, Q 12, K 13.</p>
         <p><strong>Começo:</strong> 4 cartas viradas para cada um. Você vê as duas de baixo por 5 segundos, só dessa vez — decore.</p>
         <p><strong>Na vez:</strong> compre do monte e troque por uma das suas (a sua vai para o descarte) ou descarte a comprada. 35 segundos por jogada.</p>
         <p><strong>Poderes</strong> (obrigatórios, só para quem está na vez, quando a carta sai da mão dele): <strong>J</strong> olha uma carta sua; <strong>Q</strong> olha uma carta de outro jogador; <strong>K</strong> troca uma sua com uma de outro, sem ninguém ver.</p>
         <p><strong>Descarte em cima:</strong> a qualquer momento, qualquer um descarta uma carta de mesmo valor da que está em cima — a sua ou a de outro jogador. Pegou a de outro? Dê uma das suas para ele. Errou? A carta aparece para todos e você leva mais uma. Dois toques numa carta descartam na hora.</p>
         <p><strong>Par:</strong> na sua vez, dá para descartar um par seu de uma vez.</p>
         <p><strong>Bateu:</strong> quem fica sem nenhuma carta vence na hora.</p>
         <p><strong>BAZUCA!</strong> Na sua vez, a qualquer momento dela. A rodada acaba na hora e vai para a contagem: soma-se tudo e quem tiver a menor soma vence — tenha gritado ou não. Empate na menor soma: ninguém leva.</p>
         <p><strong>Partida:</strong> cada rodada vale uma vitória; quem chegar a 4 vitórias ganha, com quantas rodadas forem precisas.</p>
         <p class="modal-hint">O jogo não ajuda: nada marca carta já vista nem avisa descarte possível. A memória é sua.</p>`,
        [{ label: 'Entendi', cls: 'btn-primary', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
  };
}
