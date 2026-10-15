// ============================================================================
// Presidente — a mesa 2D. Este arquivo (e o presidente.css) só é baixado
// quando alguém escolhe o modo ou entra numa sala dele: quem joga Caçamba
// nunca paga por ele.
//
// Não desenha mesa nova: usa o cenário, os assentos, o leque da mão, as cartas
// e os modais do Caçamba, que chegam pelo `ctx` (ver contextoDaMesa em
// client.js). O que é daqui: o meio da mesa, os botões, os títulos nos
// assentos, os avisos e o placar.
// ============================================================================

import { forca, motivoDaRecusa, TITULOS, rotulo } from '/shared/presidente.js';

const QTD = ['', 'uma carta', 'um par', 'uma trinca', 'uma quadra'];
const SELO = { presidente: '👑', vice: '🎩', neutro: '', 'vice-cu': '🥄', cu: '💩' };

export function criaMesaPresidente(ctx) {
  const { $ } = ctx;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/presidente.css';
  document.head.appendChild(css);

  // O meio da mesa: a jogada a cobrir, com as anteriores da mesma volta por baixo.
  const centro = document.createElement('div');
  centro.id = 'pres-centro';
  centro.className = 'pres-centro';
  $('screen-game').querySelector('.table-center').prepend(centro);

  const barra = $('action-bar');
  const botao = (id, texto, cls) => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = `btn pres-btn ${cls}`; b.textContent = texto; b.hidden = true;
    barra.insertBefore(b, $('btn-sort'));
    return b;
  };
  const bJogar = botao('pres-jogar', 'Jogar', 'btn-primary');
  const bPassar = botao('pres-passar', 'Passar', '');
  const bDevolver = botao('pres-devolver', 'Devolver', 'btn-primary');

  const v = () => ctx.view;
  const minhaVez = () => v()?.turnId === ctx.me();
  const nome = (id) => ctx.playerName(id);
  const selecionadas = () => (v()?.you?.hand || []).filter((c) => ctx.selected.has(c.id));
  const descreve = (cards) => {
    const n = cards.length;
    const valor = rotulo(cards[0].rank);
    return n === 1 ? `um ${valor}` : `${QTD[n].replace('uma ', '').replace('um ', '')} de ${valor}`;
  };

  bJogar.onclick = () => {
    const cartas = selecionadas();
    const motivo = motivoDaRecusa(v().mesa, cartas);
    if (motivo) { ctx.toast(motivo); return; }
    ctx.sendAction({ a: 'jogar', cardIds: cartas.map((c) => c.id) });
    ctx.selected.clear();
  };
  bPassar.onclick = () => { ctx.sendAction({ a: 'passar' }); ctx.selected.clear(); };
  bDevolver.onclick = () => {
    const t = v().troca;
    const cartas = selecionadas();
    if (!t || cartas.length !== t.n) { ctx.toast(`Escolha ${t?.n === 1 ? '1 carta' : `${t?.n} cartas`} para devolver.`); return; }
    ctx.sendAction({ a: 'trocar', cardIds: cartas.map((c) => c.id) });
    ctx.selected.clear();
  };

  // ---- desenho ----------------------------------------------------------

  function cabecalho() {
    const vw = v();
    $('round-label').textContent = `Presidente · Rodada ${vw.round + 1}`;
    let txt = '';
    if (vw.phase === 'troca') txt = 'Troca de cartas';
    else if (vw.phase === 'play') txt = vw.mesa ? `Mesa: ${descreve(vw.mesa.cards)}` : 'Mesa limpa';
    else if (vw.phase === 'roundEnd') txt = 'Fim da rodada';
    $('contract-label').textContent = txt;
  }

  function marcasDosAssentos() {
    const vw = v();
    for (const [id, el] of ctx.assentos) {
      const p = vw.players.find((x) => x.id === id);
      if (!p) continue;
      const marcas = el.querySelector('.marcas');
      if (p.saiu >= 0) marcas.prepend(marca(`${p.saiu + 1}º`, 'm-gold'));
      else if (p.passou) marcas.prepend(marca('passou', 'm-off'));
      if (p.titulo && p.titulo !== 'neutro') marcas.prepend(marca(`${SELO[p.titulo]} ${TITULOS[p.titulo]}`, 'pres-titulo'));
      el.setAttribute('aria-label', `${p.name}, ${p.handCount} cartas${p.titulo ? `, ${TITULOS[p.titulo]}` : ''}.`);
    }
    // o seu título fica no seu assento
    const meu = $('meu-assento');
    if (meu) {
      let t = meu.querySelector('.pres-titulo');
      const eu = vw.players.find((x) => x.id === ctx.me());
      const titulo = eu?.titulo && eu.titulo !== 'neutro' ? `${SELO[eu.titulo]} ${TITULOS[eu.titulo]}` : '';
      if (!t && titulo) { t = marca('', 'pres-titulo'); meu.appendChild(t); }
      if (t) { t.textContent = titulo; t.hidden = !titulo; }
    }
  }

  function marca(texto, cls) {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = texto;
    return el;
  }

  let ultimaMesa = null;
  function desenhaCentro() {
    const vw = v();
    centro.innerHTML = '';
    const lances = vw.lances || [];
    if (!lances.length) {
      const vazio = document.createElement('p');
      vazio.className = 'pres-vazio';
      vazio.textContent = vw.phase === 'troca' ? 'Trocando cartas…' : vw.phase === 'play' ? 'Mesa limpa' : '';
      centro.appendChild(vazio);
      ultimaMesa = null;
      return;
    }
    // As duas jogadas de antes aparecem por baixo, apagadas: dá para ver o que
    // foi coberto sem precisar ler o histórico.
    const mostrar = lances.slice(-3);
    mostrar.forEach((l, i) => {
      const ultima = i === mostrar.length - 1;
      const grupo = document.createElement('div');
      grupo.className = `pres-lance${ultima ? ' atual' : ''}`;
      grupo.style.setProperty('--fundo', mostrar.length - 1 - i);
      for (const c of l.cards) grupo.appendChild(ctx.cardEl(c));
      if (ultima) {
        const quem = document.createElement('span');
        quem.className = 'pres-quem';
        quem.textContent = l.p === ctx.me() ? 'sua jogada' : nome(l.p);
        grupo.appendChild(quem);
        const chave = l.cards.map((c) => c.id).join(',');
        if (chave !== ultimaMesa && !ctx.semMovimento()) grupo.classList.add('cai');
        ultimaMesa = chave;
      }
      centro.appendChild(grupo);
    });
  }

  function botoes() {
    const vw = v();
    const minha = minhaVez();
    const jogando = minha && vw.phase === 'play';
    const trocando = minha && vw.phase === 'troca' && vw.troca?.de === ctx.me();
    for (const id of ['btn-draw-deck', 'btn-draw-discard', 'btn-queimar', 'btn-baixar', 'btn-discard', 'btn-meld-discard', 'btn-cancel-mode']) $(id).hidden = true;
    bJogar.hidden = !jogando;
    bPassar.hidden = !(jogando && vw.mesa);
    bDevolver.hidden = !trocando;
    if (jogando) {
      const sel = selecionadas();
      const ok = sel.length && !motivoDaRecusa(vw.mesa, sel);
      bJogar.classList.toggle('soft-disabled', !ok);
      bJogar.textContent = sel.length && ok ? `Jogar ${descreve(sel)}` : 'Jogar';
    }
    if (trocando) {
      const n = vw.troca.n;
      bDevolver.textContent = `Devolver ${n === 1 ? '1 carta' : `${n} cartas`} (${selecionadas().length}/${n})`;
      bDevolver.classList.toggle('soft-disabled', selecionadas().length !== n);
    }
  }

  let modalDaRodada = null;
  function modalDeFase() {
    const vw = v();
    if (vw.phase === 'roundEnd') {
      if (modalDaRodada === vw.round) return;
      modalDaRodada = vw.round;
      fimDaRodada();
    } else if (modalDaRodada !== null) {
      modalDaRodada = null;
      ctx.closeModal();
    }
  }

  function linha(id, direita) {
    const vw = v();
    const p = vw.players.find((x) => x.id === id);
    return `<tr><td><span class="quem">
        <img class="avatar" src="${ctx.caraDoJogador(id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(id)}">
        <span>${ctx.escapeHTML(nome(id))}</span></span></td>
      <td>${p?.titulo ? `${SELO[p.titulo]} ${TITULOS[p.titulo]}` : ''}</td>
      <td class="num">${direita}</td></tr>`;
  }

  function fimDaRodada() {
    const vw = v();
    const lr = vw.lastRound;
    if (!lr) return;
    const n = vw.players.length;
    const presidente = lr.ordem[0];
    const linhas = lr.ordem.map((id, pos) => linha(id, `+${n - 1 - pos}`)).join('');
    const eu = lr.titulos[ctx.me()];
    const dica = eu === 'cu' ? '<p class="modal-hint">Você é o Cu: na próxima, entrega as 2 cartas mais fortes ao Presidente.</p>'
      : eu === 'presidente' ? '<p class="modal-hint">Na próxima, o Cu te entrega as 2 mais fortes dele e você devolve 2 à sua escolha.</p>'
      : eu === 'vice-cu' ? '<p class="modal-hint">Vice-cu: na próxima, entrega a sua carta mais forte ao Vice.</p>'
      : eu === 'vice' ? '<p class="modal-hint">Vice: na próxima, recebe a mais forte do Vice-cu e devolve 1.</p>' : '';
    ctx.showModal(
      `<div class="palco-vencedor"><img src="${ctx.figuraFeliz(presidente)}" alt=""></div>
       <h2>${presidente === ctx.me() ? 'Você é o Presidente!' : `${ctx.escapeHTML(nome(presidente))} é o Presidente!`}</h2>
       <table class="score-table"><thead><tr><th>Ordem</th><th>Título</th><th class="num">Pts</th></tr></thead><tbody>${linhas}</tbody></table>
       ${dica}
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião continuar…</p>'}`,
      ctx.isHost() ? [{ label: 'Próxima rodada', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'nextRound' }) }] : [],
    );
  }

  // ---- o que client.js chama ------------------------------------------------

  return {
    render() {
      cabecalho();
      ctx.renderOpponents();
      marcasDosAssentos();
      desenhaCentro();
      ctx.renderHand();
      botoes();
      ctx.atualizaBanner();
      modalDeFase();
    },

    // 3 4 5 … K A 2; no mesmo valor, pelo naipe
    ordena(hand) {
      return [...hand].sort((a, b) => forca(a) - forca(b) || a.suit - b.suit);
    },

    // Tocar numa carta: com mesa a cobrir, já separa quantas a mesa pede
    // daquele valor (tocar num 9 com um par na mesa escolhe dois 9). Sem mesa,
    // vai uma a uma, e tocar noutro valor recomeça a escolha.
    toca(card, sel) {
      const vw = v();
      if (sel.has(card.id)) { sel.delete(card.id); return; }
      if (vw.phase === 'troca') {
        // na troca vale qualquer carta, até o tanto que se devolve: a mais
        // antiga da escolha sai para a nova entrar
        const n = vw.troca?.n || 1;
        while (sel.size >= n) sel.delete(sel.values().next().value);
        sel.add(card.id);
        return;
      }
      const hand = vw.you?.hand || [];
      const mesmo = (c) => c.rank === card.rank;
      for (const id of [...sel]) { const c = hand.find((x) => x.id === id); if (!c || !mesmo(c)) sel.delete(id); }
      if (vw.mesa && minhaVez()) {
        sel.clear();
        const iguais = [card, ...hand.filter((c) => mesmo(c) && c.id !== card.id)];
        for (const c of iguais.slice(0, vw.mesa.n)) sel.add(c.id);
        return;
      }
      sel.add(card.id);
    },

    textoDaVez() {
      const vw = v();
      if (vw.phase === 'troca') {
        const t = vw.troca;
        if (t?.de === ctx.me()) return { minha: true, texto: `Escolha ${t.n === 1 ? '1 carta' : `${t.n} cartas`} para devolver a ${nome(t.para)}.` };
        return { minha: false, texto: t ? `${nome(t.de)} está escolhendo o que devolver…` : '' };
      }
      if (vw.phase !== 'play') return { minha: false, texto: '' };
      if (!minhaVez()) return { minha: false, texto: `Vez de ${nome(vw.turnId)}…` };
      if (!vw.mesa) return { minha: true, texto: 'Mesa limpa: você abre. Jogue 1 a 4 cartas do mesmo valor.' };
      const pede = QTD[vw.mesa.n];
      return { minha: true, texto: `Cubra com ${pede} acima de ${rotulo(vw.mesa.cards[0].rank)} — ou passe.` };
    },

    anuncia(ev) {
      const eu = ctx.me();
      switch (ev.e) {
        case 'roundStart':
          ctx.novaRodada();
          modalDaRodada = null;
          ctx.closeModal();
          if (ev.round > 0) ctx.toast(`🃏 Rodada ${ev.round + 1}`);
          break;
        case 'entregou':
          if (ev.p === eu) ctx.toast(`Você entregou ${ev.n === 1 ? 'a sua carta mais forte' : `as ${ev.n} mais fortes`} a ${nome(ev.para)}.`);
          else if (ev.para === eu) ctx.toast(`${nome(ev.p)} te entregou ${ev.n === 1 ? 'a mais forte dele' : `as ${ev.n} mais fortes`}. Agora devolva ${ev.n}.`);
          else ctx.toast(`${nome(ev.p)} entregou ${ev.n} a ${nome(ev.para)}.`);
          break;
        case 'devolveu':
          if (ev.para === eu) ctx.toast(`${nome(ev.p)} te devolveu ${ev.n === 1 ? '1 carta' : `${ev.n} cartas`}.`);
          break;
        case 'abre':
          ctx.toast(ev.p === eu ? 'Você abre a rodada.' : `${nome(ev.p)} abre a rodada.`);
          break;
        case 'jogou':
          if (ev.cards.length && forca(ev.cards[0]) === 12) ctx.reage(ev.p, 'levou');
          break;
        case 'limpou':
          ctx.toast(ev.p === eu ? 'Ninguém cobriu: mesa limpa, você começa.' : `Mesa limpa: ${nome(ev.p)} começa.`);
          break;
        case 'saiu':
          ctx.toast(ev.pos === 0
            ? `👑 ${ev.p === eu ? 'Você saiu primeiro' : `${nome(ev.p)} saiu primeiro`}: Presidente!`
            : `${nome(ev.p)} saiu em ${ev.pos + 1}º.`);
          ctx.reage(ev.p, ev.pos === 0 ? 'presidente' : 'livre');
          break;
        case 'roundEnd': {
          const cu = ev.ordem[ev.ordem.length - 1];
          ctx.toast(cu === eu ? '💩 Você ficou por último: é o Cu.' : `💩 ${nome(cu)} ficou por último: é o Cu.`);
          ctx.reage(cu, 'cu');
          break;
        }
      }
    },

    mostraJogador(id) {
      const p = v().players.find((x) => x.id === id);
      if (!p) return;
      const vezes = Object.entries(p.vezes || {}).filter(([, n]) => n)
        .map(([t, n]) => `${SELO[t]} ${TITULOS[t]} ${n}×`).join(' · ');
      ctx.showModal(
        `<div id="oponente-topo" class="oponente-topo"></div>
         <h3>${ctx.escapeHTML(p.name)}</h3>
         <p>${p.handCount} carta${p.handCount === 1 ? '' : 's'} na mão${p.titulo ? ` · ${SELO[p.titulo]} ${TITULOS[p.titulo]}` : ''}</p>
         <p>${p.pontos} ponto${p.pontos === 1 ? '' : 's'}${vezes ? ` · ${vezes}` : ''}</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
      $('oponente-topo').appendChild(ctx.avatarEl(p.id, v().players, 72));
    },

    placar() {
      const vw = v();
      const ordem = [...vw.players].sort((a, b) => b.pontos - a.pontos);
      const linhas = ordem.map((p) => linha(p.id, p.pontos)).join('');
      ctx.showModal(
        `<h2>Placar</h2>
         <table class="score-table"><thead><tr><th>Jogador</th><th>Título</th><th class="num">Pts</th></tr></thead><tbody>${linhas}</tbody></table>
         <p class="modal-hint">A cada rodada: o Presidente leva um ponto por jogador que ficou atrás dele; o Cu leva zero. A partida não tem fim — joga-se quanto quiser.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },

    regras() {
      ctx.showModal(
        `<h2>Como se joga o Presidente</h2>
         <p><strong>Objetivo:</strong> ficar sem cartas primeiro. O baralho inteiro é distribuído.</p>
         <p><strong>Força:</strong> 3 4 5 6 7 8 9 10 J Q K A <strong>2</strong> — o 2 é a mais forte. Naipe não conta.</p>
         <p><strong>Na vez:</strong> jogue 1, 2, 3 ou 4 cartas do mesmo valor. Para cobrir, a mesma quantidade e de valor mais alto. Não quer ou não pode? Passe.</p>
         <p><strong>Mesa limpa:</strong> quando todos passam, quem jogou por último recolhe e começa de novo, com o que quiser.</p>
         <p><strong>Títulos:</strong> quem sai primeiro é o <strong>Presidente</strong>, o segundo é o <strong>Vice</strong>; o penúltimo é o <strong>Vice-cu</strong> e o último, o <strong>Cu</strong>. Com 3 na mesa não há vices.</p>
         <p><strong>Troca:</strong> na rodada seguinte, o Cu entrega as 2 cartas mais fortes ao Presidente, que devolve 2 à escolha dele. O Vice-cu entrega a mais forte ao Vice, que devolve 1. O Cu abre a rodada.</p>
         <p class="modal-hint">A primeira rodada abre quem tem o 3 de paus.</p>`,
        [{ label: 'Entendi', cls: 'btn-primary', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
  };
}
