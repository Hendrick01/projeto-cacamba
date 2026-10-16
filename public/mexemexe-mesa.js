// ============================================================================
// Mexe-Mexe — a mesa 2D. Este arquivo (e o mexemexe.css) só é baixado quando
// alguém escolhe o modo ou entra numa sala dele: quem joga Caçamba nunca paga
// por ele.
//
// Não desenha mesa nova: usa o cenário, os assentos, o leque da mão, as cartas
// e os modais do Caçamba, que chegam pelo `ctx` (ver contextoDaMesa em
// client.js). O que é daqui: os jogos no meio da mesa, o RASCUNHO da vez, o
// relógio, os botões, os avisos e o placar.
//
// O RASCUNHO. Na sua vez a mesa vira uma cópia sua: você escolhe cartas (da
// mão ou de qualquer jogo) e toca no ＋ de um jogo para levá-las para lá, ou no
// "＋ Novo jogo". Nada sai do aparelho até você confirmar: o servidor recebe a
// mesa inteira e confere de uma vez. Desfazer volta um passo; Recomeçar volta
// à mesa de verdade. Se o tempo acaba, o rascunho morre aqui mesmo — o
// servidor nunca soube dele — e você compra uma carta.
// ============================================================================

import { analisaJogo, nomeCurto } from '/shared/mexemexe.js';

const cartas = (n) => `${n} carta${n === 1 ? '' : 's'}`;
const chaveDoJogo = (cards) => cards.map((c) => c.id).sort((a, b) => a - b).join(',');

export function criaMesaMexe(ctx) {
  const { $ } = ctx;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/mexemexe.css';
  document.head.appendChild(css);

  // ---- o meio da mesa: o monte, o relógio e os jogos ------------------------
  const centro = document.createElement('div');
  centro.id = 'mm-centro';
  centro.className = 'mm-centro';
  const topo = document.createElement('div');
  topo.className = 'mm-topo';
  const monte = document.createElement('button');
  monte.type = 'button';
  monte.className = 'mm-monte';
  monte.innerHTML = '<span class="card back mini" aria-hidden="true"></span><span class="mm-monte-txt"></span>';
  const relogio = document.createElement('span');
  relogio.className = 'mm-relogio';
  relogio.setAttribute('role', 'timer');
  topo.append(monte, relogio);
  const mesaEl = document.createElement('div');
  mesaEl.className = 'mm-mesa';
  mesaEl.setAttribute('role', 'group');
  mesaEl.setAttribute('aria-label', 'Jogos na mesa');
  centro.append(topo, mesaEl);
  $('screen-game').querySelector('.table-center').prepend(centro);

  const barra = $('action-bar');
  const botao = (id, texto, cls = '') => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = `btn mm-btn ${cls}`; b.textContent = texto; b.hidden = true;
    barra.insertBefore(b, $('btn-sort'));
    return b;
  };
  const bConfirmar = botao('mm-confirmar', 'Confirmar jogada', 'btn-primary');
  const bMao = botao('mm-mao', 'Voltar para a mão');
  const bDesfazer = botao('mm-desfazer', 'Desfazer', 'btn-ghost');
  const bRecomecar = botao('mm-recomecar', 'Recomeçar', 'btn-ghost');
  const bComprar = botao('mm-comprar', 'Comprar');

  const v = () => ctx.view;
  const minhaVez = () => v()?.phase === 'play' && v()?.turnId === ctx.me();
  const nome = (id) => ctx.playerName(id);
  const sel = () => ctx.selected;

  // ---- o rascunho -------------------------------------------------------------
  // { chave, jogos: [{ k, id?, cards }], mao: [cards], passos: [fotos] }
  let rasc = null;
  let seqNovo = 0;
  let enviadoEm = 0;

  const chaveDaVez = () => `${v().round}/${v().turnNo}`;
  const maoDeVerdade = () => v()?.you?.hand || [];
  const idsDaMao = () => new Set(maoDeVerdade().map((c) => c.id));

  function garanteRascunho() {
    if (!minhaVez()) { rasc = null; return; }
    const ch = chaveDaVez();
    if (rasc?.chave === ch) return;
    rasc = {
      chave: ch,
      jogos: v().mesa.map((j) => ({ k: `m${j.id}`, id: j.id, cards: [...j.cards] })),
      mao: [...maoDeVerdade()],
      passos: [],
    };
    enviadoEm = 0;
  }

  // O que o rascunho já mudou em relação à mesa de verdade.
  function resumo() {
    if (!rasc) return { usadas: 0, mudou: false, ruins: [] };
    const reais = new Map(v().mesa.map((j) => [j.id, chaveDoJogo(j.cards)]));
    const usadas = maoDeVerdade().length - rasc.mao.length;
    const mexidos = rasc.jogos.filter((j) => j.id == null || reais.get(j.id) !== chaveDoJogo(j.cards));
    const sumiu = rasc.jogos.filter((j) => j.id != null).length !== reais.size;
    const ruins = rasc.jogos.map((j) => analisaJogo(j.cards)).filter((a) => !a.ok);
    return { usadas, mudou: usadas > 0 || mexidos.length > 0 || sumiu, ruins, mexidos: new Set(mexidos.map((j) => j.k)) };
  }

  const foto = () => ({ jogos: rasc.jogos.map((j) => ({ ...j, cards: [...j.cards] })), mao: [...rasc.mao] });
  function passo(fn) {
    rasc.passos.push(foto());
    fn();
    rasc.jogos = rasc.jogos.filter((j) => j.cards.length);
    sel().clear();
    ctx.render();
  }

  // Tira as cartas escolhidas de onde estiverem (mão e jogos), na ordem.
  function tiraEscolhidas() {
    const s = sel();
    const tiradas = [];
    const fica = (c) => { if (s.has(c.id)) { tiradas.push(c); return false; } return true; };
    rasc.mao = rasc.mao.filter(fica);
    for (const j of rasc.jogos) j.cards = j.cards.filter(fica);
    return tiradas;
  }
  function escolhidasNoRascunho() {
    if (!rasc) return [];
    const s = sel();
    return [...rasc.mao, ...rasc.jogos.flatMap((j) => j.cards)].filter((c) => s.has(c.id));
  }

  function poeNoJogo(k) {
    if (!rasc || !sel().size) return;
    passo(() => {
      const tiradas = tiraEscolhidas();
      const alvo = rasc.jogos.find((j) => j.k === k);
      if (alvo) alvo.cards.push(...tiradas);
      else rasc.jogos.push({ k: `n${++seqNovo}`, cards: tiradas });
    });
  }
  function novoJogo() {
    if (!rasc || !sel().size) return;
    passo(() => { rasc.jogos.push({ k: `n${++seqNovo}`, cards: tiraEscolhidas() }); });
  }
  // Só a carta que veio da SUA mão nesta vez volta para ela.
  function voltaParaMao() {
    if (!rasc) return;
    const daMao = idsDaMao();
    passo(() => {
      for (const j of rasc.jogos) {
        j.cards = j.cards.filter((c) => {
          if (sel().has(c.id) && daMao.has(c.id)) { rasc.mao.push(c); return false; }
          return true;
        });
      }
    });
  }
  function desfaz() {
    const f = rasc?.passos.pop();
    if (!f) return;
    rasc.jogos = f.jogos; rasc.mao = f.mao;
    sel().clear();
    ctx.render();
  }
  function recomeca() {
    rasc = null;
    sel().clear();
    garanteRascunho();
    ctx.render();
  }
  function alterna(id) {
    const s = sel();
    if (s.has(id)) s.delete(id); else s.add(id);
    ctx.render();
  }

  bConfirmar.onclick = () => {
    if (!rasc) return;
    const r = resumo();
    if (!r.usadas) { ctx.toast('Ponha pelo menos uma carta da sua mão na mesa.'); return; }
    if (r.ruins.length) { ctx.toast(r.ruins[0].motivo); return; }
    if (Date.now() - enviadoEm < 2500) return;   // dedo nervoso: um envio só
    enviadoEm = Date.now();
    ctx.sendAction({ a: 'jogar', mesa: rasc.jogos.map((j) => j.cards.map((c) => c.id)) });
  };
  const compra = () => {
    if (!minhaVez()) return;
    rasc = null;
    sel().clear();
    ctx.sendAction({ a: 'comprar' });
  };
  bComprar.onclick = compra;
  monte.onclick = compra;
  bMao.onclick = voltaParaMao;
  bDesfazer.onclick = desfaz;
  bRecomecar.onclick = recomeca;

  // ---- o relógio --------------------------------------------------------------
  // O servidor manda quanto resta (não a hora): o relógio do celular pode estar
  // adiantado, e o que vale é o tempo que passou desde que a visão chegou.
  let visaoVista = null;
  let restaNaChegada = null;
  let chegouEm = 0;
  function anotaRelogio() {
    const vw = v();
    if (vw === visaoVista) return;
    visaoVista = vw;
    restaNaChegada = vw.restaMs;
    chegouEm = performance.now();
  }
  const restaMs = () => (restaNaChegada == null ? null : Math.max(0, restaNaChegada - (performance.now() - chegouEm)));
  function pintaRelogio() {
    const r = restaMs();
    if (r == null || v()?.phase !== 'play') { relogio.hidden = true; return; }
    const s = Math.ceil(r / 1000);
    relogio.hidden = false;
    relogio.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    relogio.classList.toggle('pouco', s <= 15);
    relogio.classList.toggle('meu', minhaVez());
    relogio.setAttribute('aria-label', `${minhaVez() ? 'Seu tempo' : `Tempo de ${nome(v().turnId)}`}: ${s} segundos`);
  }
  setInterval(() => { if (v()?.modo === 'mexemexe') pintaRelogio(); }, 500);

  // ---- desenho ----------------------------------------------------------------

  function cabecalho() {
    const vw = v();
    $('round-label').textContent = `Mexe-Mexe · Partida ${vw.round + 1}`;
    const n = vw.mesa.length;
    $('contract-label').textContent = vw.phase === 'roundEnd' ? 'Fim da partida'
      : n ? `${n} jogo${n === 1 ? '' : 's'} na mesa` : 'Mesa vazia';
  }

  function marca(texto, cls) {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = texto;
    return el;
  }

  function marcasDosAssentos() {
    const vw = v();
    for (const [id, el] of ctx.assentos) {
      const p = vw.players.find((x) => x.id === id);
      if (!p) continue;
      const marcas = el.querySelector('.marcas');
      if (vw.phase === 'play' && p.handCount <= 2) marcas.prepend(marca(p.handCount === 1 ? 'última carta' : '2 cartas', 'm-gold'));
      if (p.vitorias) marcas.prepend(marca(`${p.vitorias}× ganhou`, 'mm-vitorias'));
      el.setAttribute('aria-label', `${p.name}, ${cartas(p.handCount)}${p.vitorias ? `, ganhou ${p.vitorias}` : ''}.`);
    }
  }

  // Os jogos que acabaram de chegar à mesa piscam um instante: é como se vê o
  // que o outro mexeu sem ter de comparar a mesa de cabeça.
  let idsVistos = null;
  const destaque = new Map();   // id do jogo → até quando
  function anotaJogosNovos() {
    const vw = v();
    const agora = Date.now();
    const ids = new Set(vw.mesa.map((j) => j.id));
    if (idsVistos) for (const id of ids) if (!idsVistos.has(id)) destaque.set(id, agora + 2600);
    idsVistos = ids;
    for (const [id, ate] of destaque) if (ate < agora || !ids.has(id)) destaque.delete(id);
  }

  function cartaDaMesa(c, editando, daMao) {
    const el = ctx.cardEl(c, true);
    el.dataset.cardId = c.id;
    if (daMao.has(c.id)) el.classList.add('minha');
    if (editando) {
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      const escolhida = sel().has(c.id);
      el.classList.toggle('sel', escolhida);
      el.setAttribute('aria-pressed', String(escolhida));
      el.onclick = (e) => { e.stopPropagation(); alterna(c.id); };
      el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(c.id); } };
    }
    return el;
  }

  function desenhaMesa() {
    const vw = v();
    const rolagem = mesaEl.scrollTop;
    mesaEl.innerHTML = '';
    const editando = !!rasc;
    const jogos = editando ? rasc.jogos : vw.mesa.map((j) => ({ k: `m${j.id}`, id: j.id, cards: j.cards }));
    const daMao = editando ? idsDaMao() : new Set();
    const escolhidas = escolhidasNoRascunho();
    const r = resumo();
    mesaEl.classList.toggle('editando', editando);

    if (!jogos.length && !escolhidas.length) {
      const vazio = document.createElement('p');
      vazio.className = 'mm-vazio';
      vazio.textContent = vw.phase !== 'play' ? '' : editando
        ? 'Mesa vazia. Escolha 3 cartas da mão que formem jogo e toque em “＋ Novo jogo”.'
        : 'Ninguém baixou nada ainda.';
      mesaEl.appendChild(vazio);
    }

    for (const j of jogos) {
      const a = analisaJogo(j.cards);
      const el = document.createElement('div');
      el.className = 'mm-jogo';
      el.dataset.k = j.k;
      if (editando && !a.ok) el.classList.add('ruim');
      if (editando && r.mexidos?.has(j.k)) el.classList.add('mexido');
      if (!editando && destaque.has(j.id) && !ctx.semMovimento()) el.classList.add('chegou');
      for (const c of a.cards) el.appendChild(cartaDaMesa(c, editando, daMao));
      if (editando && !a.ok) {
        const aviso = document.createElement('span');
        aviso.className = 'mm-aviso';
        aviso.textContent = '!';
        aviso.title = a.motivo;
        el.appendChild(aviso);
        el.setAttribute('aria-label', `Jogo com problema: ${a.motivo}`);
      }
      if (editando && escolhidas.length) {
        // o ＋ diz, pela cor, se o jogo continua valendo com as escolhidas
        const ficam = j.cards.filter((c) => !sel().has(c.id));
        const junto = analisaJogo([...ficam, ...escolhidas]);
        const por = document.createElement('button');
        por.type = 'button';
        por.className = `mm-por${junto.ok ? ' cabe' : ''}`;
        por.textContent = '＋';
        por.setAttribute('aria-label', `Pôr ${escolhidas.map(nomeCurto).join(' ')} neste jogo${junto.ok ? ' (fica valendo)' : ''}`);
        por.onclick = (e) => { e.stopPropagation(); poeNoJogo(j.k); };
        el.appendChild(por);
        el.onclick = () => poeNoJogo(j.k);
      }
      mesaEl.appendChild(el);
    }

    if (editando && escolhidas.length) {
      const ok = analisaJogo(escolhidas).ok;
      const novo = document.createElement('button');
      novo.type = 'button';
      novo.className = `mm-novo${ok ? ' cabe' : ''}`;
      novo.textContent = '＋ Novo jogo';
      novo.setAttribute('aria-label', `Fazer um jogo novo com ${escolhidas.map(nomeCurto).join(' ')}`);
      novo.onclick = novoJogo;
      mesaEl.appendChild(novo);
    }
    mesaEl.scrollTop = rolagem;
  }

  function desenhaMonte() {
    const vw = v();
    const n = vw.monte;
    monte.querySelector('.mm-monte-txt').textContent = n ? `${n} no monte` : 'monte vazio';
    monte.classList.toggle('vazio', !n);
    monte.disabled = !minhaVez();
    monte.setAttribute('aria-label', minhaVez()
      ? (n ? `Comprar uma carta. ${n} no monte.` : 'Monte vazio: comprar encerra a partida.')
      : `${n} cartas no monte.`);
  }

  function botoes() {
    for (const id of ['btn-draw-deck', 'btn-draw-discard', 'btn-queimar', 'btn-baixar', 'btn-discard', 'btn-meld-discard', 'btn-cancel-mode']) $(id).hidden = true;
    const minha = minhaVez() && !!rasc;
    for (const b of [bConfirmar, bMao, bDesfazer, bRecomecar, bComprar]) b.hidden = !minha;
    if (!minha) return;
    const r = resumo();
    const pronta = r.usadas > 0 && !r.ruins.length;
    bConfirmar.classList.toggle('soft-disabled', !pronta);
    bConfirmar.textContent = r.usadas ? `Confirmar (${cartas(r.usadas)})` : 'Confirmar jogada';
    bDesfazer.hidden = !rasc.passos.length;
    bRecomecar.hidden = !r.mudou;
    const daMao = idsDaMao();
    bMao.hidden = !rasc.jogos.some((j) => j.cards.some((c) => sel().has(c.id) && daMao.has(c.id)));
    bComprar.textContent = !v().monte ? 'Monte vazio: encerrar' : r.mudou ? 'Desfazer e comprar' : 'Comprar';
  }

  let modalDaPartida = null;
  function modalDeFase() {
    const vw = v();
    if (vw.phase === 'roundEnd') {
      if (modalDaPartida === vw.round) return;
      modalDaPartida = vw.round;
      fimDaPartida();
    } else if (modalDaPartida !== null) {
      modalDaPartida = null;
      ctx.closeModal();
    }
  }

  function quem(id) {
    return `<span class="quem">
        <img class="avatar" src="${ctx.caraDoJogador(id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(id)}">
        <span>${ctx.escapeHTML(nome(id))}</span></span>`;
  }

  function fimDaPartida() {
    const vw = v();
    const lr = vw.lastRound;
    if (!lr) return;
    const vence = new Set(lr.vencedores);
    const primeiro = lr.vencedores[0];
    const euGanhei = vence.has(ctx.me());
    let titulo;
    if (lr.motivo === 'bateu') titulo = euGanhei ? 'Você bateu!' : `${ctx.escapeHTML(nome(primeiro))} bateu!`;
    else if (lr.vencedores.length > 1) titulo = 'Empate no monte!';
    else titulo = euGanhei ? 'Você ganhou no monte!' : `${ctx.escapeHTML(nome(primeiro))} ganhou no monte!`;
    const explica = lr.motivo === 'bateu' ? ''
      : `<p class="modal-hint">O monte acabou: ganha quem ficou com menos cartas na mão${lr.vencedores.length > 1 ? ' — empataram também na soma, e os dois levam' : ''}.</p>`;
    const ordem = [...lr.maos].sort((a, b) => a.n - b.n || a.soma - b.soma);
    const linhas = ordem.map((m) => {
      // o ︎ pede o naipe como LETRA: sem ele o celular troca ♥ por emoji
      const mini = m.cards.map((c) => `<span class="mm-sobra${c.suit === 1 || c.suit === 2 ? ' red' : ''}">${ctx.escapeHTML(nomeCurto(c))}︎</span>`).join('');
      return `<tr${vence.has(m.id) ? ' class="mm-ganhou"' : ''}><td>${quem(m.id)}</td>
        <td class="mm-sobras">${mini || '<em>bateu</em>'}</td><td class="num">${m.n}</td></tr>`;
    }).join('');
    ctx.showModal(
      `<div class="palco-vencedor"><img src="${ctx.figuraFeliz(primeiro)}" alt=""></div>
       <h2>${titulo}</h2>
       ${explica}
       <table class="score-table"><thead><tr><th>Jogador</th><th>Ficou na mão</th><th class="num">Cartas</th></tr></thead><tbody>${linhas}</tbody></table>
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião começar outra…</p>'}`,
      ctx.isHost() ? [{ label: 'Jogar outra', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'nextRound' }) }] : [],
    );
  }

  // ---- o que client.js chama ------------------------------------------------

  return {
    render() {
      garanteRascunho();
      anotaRelogio();
      anotaJogosNovos();
      // escolha que não existe mais (carta foi para a mesa de verdade, rodada nova)
      const existem = new Set([...(rasc ? rasc.mao : maoDeVerdade()), ...(rasc ? rasc.jogos.flatMap((j) => j.cards) : [])].map((c) => c.id));
      for (const id of [...sel()]) if (!existem.has(id)) sel().delete(id);
      cabecalho();
      ctx.renderOpponents();
      marcasDosAssentos();
      desenhaMonte();
      pintaRelogio();
      desenhaMesa();
      ctx.renderHand();
      botoes();
      ctx.atualizaBanner();
      modalDeFase();
    },

    // a mão como ela aparece: na vez, a do rascunho
    maoDoRascunho() {
      return rasc ? rasc.mao : maoDeVerdade();
    },

    tocaNaMao(card) {
      alterna(card.id);
    },

    textoDaVez() {
      const vw = v();
      if (vw.phase !== 'play') return { minha: false, texto: '' };
      if (!minhaVez()) return { minha: false, texto: `Vez de ${nome(vw.turnId)}…` };
      const r = resumo();
      if (!r.mudou) {
        return { minha: true, texto: sel().size
          ? 'Toque no ＋ de um jogo ou em “＋ Novo jogo”.'
          : 'Sua vez: escolha cartas e leve a um jogo — ou compre.' };
      }
      if (r.ruins.length) return { minha: true, texto: r.ruins[0].motivo };
      if (!r.usadas) return { minha: true, texto: 'Falta pôr uma carta da sua mão.' };
      return { minha: true, texto: `Tudo valendo: confirme e baixe ${cartas(r.usadas)}.` };
    },

    anuncia(ev) {
      const eu = ctx.me();
      switch (ev.e) {
        case 'roundStart':
          rasc = null;
          idsVistos = null;
          ctx.novaRodada();
          modalDaPartida = null;
          ctx.closeModal();
          ctx.toast(ev.first === eu ? 'Você abre a partida.' : `${nome(ev.first)} abre a partida.`);
          break;
        case 'jogou':
          if (ev.p !== eu) {
            ctx.toast(`${nome(ev.p)} ${ev.mexeu ? 'mexeu na mesa e ' : ''}baixou ${cartas(ev.cards.length)}.`);
          }
          ctx.reage(ev.p, ev.mexeu ? 'mexeu' : 'baixou');
          break;
        case 'estourou':
          ctx.toast(ev.p === eu
            ? 'O tempo acabou: a mexida não valeu e você comprou 1 carta.'
            : `O tempo de ${nome(ev.p)} acabou: comprou 1 carta.`);
          break;
        case 'semMonte':
          ctx.toast(`Monte vazio e ${ev.p === eu ? 'você precisava' : `${nome(ev.p)} precisava`} comprar: fim da partida!`);
          break;
        case 'bateu':
          ctx.toast(ev.p === eu ? 'Você bateu!' : `${nome(ev.p)} bateu!`);
          ctx.reage(ev.p, 'bateu');
          break;
      }
    },

    mostraJogador(id) {
      const p = v().players.find((x) => x.id === id);
      if (!p) return;
      ctx.showModal(
        `<div id="oponente-topo" class="oponente-topo"></div>
         <h3>${ctx.escapeHTML(p.name)}${v().turnId === id && v().phase === 'play' ? ' — é a vez dele' : ''}</h3>
         <p>${cartas(p.handCount)} na mão</p>
         <p>${p.vitorias ? `Ganhou ${p.vitorias} partida${p.vitorias === 1 ? '' : 's'} nesta sala.` : 'Ainda não ganhou nesta sala.'}</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
      $('oponente-topo').appendChild(ctx.avatarEl(p.id, v().players, 72));
    },

    placar() {
      const vw = v();
      const ordem = [...vw.players].sort((a, b) => b.vitorias - a.vitorias || a.handCount - b.handCount);
      const linhas = ordem.map((p) => `<tr><td>${quem(p.id)}</td><td class="num">${p.handCount}</td><td class="num">${p.vitorias}</td></tr>`).join('');
      ctx.showModal(
        `<h2>Mesa</h2>
         <table class="score-table"><thead><tr><th>Jogador</th><th class="num">Na mão</th><th class="num">Ganhou</th></tr></thead><tbody>${linhas}</tbody></table>
         <p class="modal-hint">No Mexe-Mexe não tem pontos: quem bate ganha a partida. A coluna “Ganhou” só conta as partidas desta sala.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },

    regras() {
      ctx.showModal(
        `<h2>Como se joga o Mexe-Mexe</h2>
         <p><strong>Objetivo:</strong> ficar sem cartas primeiro. São dois baralhos sem coringa; cada um recebe 11 cartas e o resto vira o monte.</p>
         <p><strong>Jogos:</strong> <strong>sequência</strong> de cartas seguidas do mesmo naipe (o Ás vale embaixo, A-2-3, ou depois do K, Q-K-A — K-A-2 não vale) ou <strong>trinca</strong> do mesmo valor. Todo jogo tem pelo menos 3 cartas.</p>
         <p><strong>Trinca:</strong> com 3 cartas, os 3 naipes são diferentes. Com 4 ou mais, pode repetir <em>um</em> naipe — por isso a trinca vai até 5 cartas.</p>
         <p><strong>A mesa é de todo mundo:</strong> na sua vez, desmonte, junte e remonte qualquer jogo, de qualquer um. Vale tudo, desde que você ponha pelo menos 1 carta da mão e que, no fim, todos os jogos da mesa estejam certos. Carta da mesa nunca volta para a mão.</p>
         <p><strong>Na vez:</strong> jogue <em>ou</em> compre 1 carta do monte. Não tem descarte. Comprar é livre, mesmo tendo jogada; a carta comprada só joga na próxima vez.</p>
         <p><strong>Como mexer aqui:</strong> toque nas cartas (da mão ou de qualquer jogo) e depois no <strong>＋</strong> do jogo para onde elas vão, ou em <strong>＋ Novo jogo</strong>. O ＋ fica dourado quando o jogo continua valendo. Jogo errado fica vermelho. Nada vale até você tocar em <strong>Confirmar</strong>.</p>
         <p><strong>Tempo:</strong> 90 segundos por vez. Acabou o tempo sem confirmar, a mexida não vale e você compra 1 carta.</p>
         <p><strong>Fim:</strong> quem bate ganha. Se o monte acabou e alguém precisa comprar, a partida termina: ganha quem tem menos cartas na mão (empatou, a menor soma — Ás 1 até K 13).</p>
         <p class="modal-hint">A primeira partida abre o anfitrião; as seguintes, quem ganhou a anterior.</p>`,
        [{ label: 'Entendi', cls: 'btn-primary', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
  };
}
