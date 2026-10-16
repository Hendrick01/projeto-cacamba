// ============================================================================
// Puxadinho — a mesa 2D. Este arquivo (e o puxadinho.css) só é baixado quando
// alguém escolhe o modo ou entra numa sala dele, como os outros modos.
//
// Usa o cenário, os assentos, os modais e os avisos do Caçamba, que chegam
// pelo `ctx` (ver contextoDaMesa em client.js). O que é daqui: o tabuleiro —
// um loteamento visto de cima, com as quadras separadas pelas ruas onde os
// jogadores constroem —, o material na mão, as cartas de obra, os botões, a
// troca e o placar.
//
// Construir é sempre em dois toques: escolhe o lugar (fica dourado) e
// confirma no botão. Numa tela de celular as esquinas ficam a 30 px uma da
// outra; um toque só levantava casa no lugar errado.
// ============================================================================

import {
  GEO, RECURSOS, NOME_DO_RECURSO, NOME_DO_TERRENO, PRODUZ, CUSTOS, NOME_DA_CARTA, chances, LIMITE_DA_MAO,
  AVENIDA_MINIMA, EQUIPE_MINIMA,
} from '/shared/puxadinho.js';

const SVG = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// A arte (fichas, chão das quadras, cores) mora em puxadinho-arte.js — a
// fonte única dos desenhos, com as regras na skill arte-do-puxadinho.
import {
  COR_DO_TERRENO, fichaHTML, imagemDoMaterial, imagemDaQuadra, chaoDaQuadra, POSICAO_DO_MATERIAL, urlDaPeca,
} from '/puxadinho-arte.js';

// Um desenho da arte (num quadrado de 32) posto no tabuleiro: canto de cima
// à esquerda em (x, y), com `tam` unidades de lado.
function arteNoTabuleiro(markup, x, y, tam, cls = '') {
  const g = el('g', { class: `px-arte ${cls}`.trim(), transform: `translate(${x} ${y}) scale(${tam / 32})` });
  g.innerHTML = markup;
  return g;
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const zerados = () => Object.fromEntries(RECURSOS.map((r) => [r, 0]));
const soma = (rec) => RECURSOS.reduce((s, r) => s + (rec?.[r] || 0), 0);
const temTudo = (rec, custo) => RECURSOS.every((r) => (rec?.[r] || 0) >= (custo[r] || 0));
// "2 pedra e 1 ferro"
function listaDeMaterial(rec) {
  const partes = RECURSOS.filter((r) => rec?.[r]).map((r) => `${rec[r]} ${NOME_DO_RECURSO[r]}`);
  if (partes.length <= 1) return partes[0] || 'nada';
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}
function fichasDe(rec) {
  return RECURSOS.filter((r) => rec?.[r]).map((r) => `<span class="px-par">${rec[r]}${fichaHTML(r, 'mini')}</span>`).join('');
}

// Nome curto de um terreno: "Olaria 6".
const nomeDoLote = (tab, h) => `${NOME_DO_TERRENO[tab[h].t]}${tab[h].n ? ` ${tab[h].n}` : ''}`;
const DESC_DA_CARTA = {
  mestre: 'Mande o fiscal para outro terreno e leve 1 material de um vizinho dele. Conta para a Maior Equipe.',
  mutirao: 'Construa 2 ruas de graça.',
  achado: 'Pegue 2 materiais quaisquer.',
  arremate: 'Escolha um material: todos os outros entregam a você tudo o que têm dele.',
  obra: 'Vale 1 ponto, escondido até o fim da partida.',
};
const NOME_DA_CONSTRUCAO = { rua: 'Rua', casa: 'Casa', predio: 'Prédio', carta: 'Carta de obra' };

// ---------------------------------------------------------------------------
// Medidas do tabuleiro (em raios de hexágono)
// ---------------------------------------------------------------------------
const VB = { x: -5.75, y: -5.45, w: 11.5, h: 10.9 };
const LOTE = 0.83;   // quanto a quadra encolhe: o resto é a rua entre elas
const pos = (v) => GEO.vertices[v];
function cantosDoLote(h, fator = LOTE) {
  const c = GEO.hexes[h];
  return c.vertices.map((v) => [c.x + (pos(v).x - c.x) * fator, c.y + (pos(v).y - c.y) * fator]);
}
const pontosAttr = (pts) => pts.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');
// O contorno do bairro: as esquinas da beira, em volta.
const BEIRA = (() => {
  const vs = [...new Set(GEO.beira.flatMap((e) => GEO.arestas[e].v))];
  return vs.sort((a, b) => Math.atan2(pos(a).y, pos(a).x) - Math.atan2(pos(b).y, pos(b).x));
})();

// A mesa 3D (puxadinho-3d.js) fala igual a esta: os textos, as contas e as
// medidas do tabuleiro vêm daqui (a arte vem de puxadinho-arte.js, para as duas).
export {
  plural, zerados, soma, temTudo, listaDeMaterial, fichasDe, nomeDoLote, DESC_DA_CARTA, NOME_DA_CONSTRUCAO, LOTE, BEIRA,
};

export function criaMesaPuxadinho(ctx) {
  const { $ } = ctx;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/puxadinho.css';
  document.head.appendChild(css);

  // O meio da mesa: a oferta de troca (quando há) em cima, o tabuleiro embaixo.
  const centro = document.createElement('div');
  centro.id = 'px-centro';
  centro.className = 'px-centro';
  const ofertaBox = document.createElement('div');
  ofertaBox.className = 'px-oferta';
  ofertaBox.hidden = true;
  const palco = document.createElement('div');
  palco.className = 'px-palco';
  const svg = el('svg', {
    class: 'px-tabuleiro', role: 'group', 'aria-label': 'Tabuleiro do loteamento',
    viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, preserveAspectRatio: 'xMidYMid meet',
  });
  palco.appendChild(svg);
  centro.append(ofertaBox, palco);
  $('screen-game').querySelector('.table-center').prepend(centro);

  const barra = $('action-bar');
  const botao = (id, texto, cls = '') => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = `btn px-btn ${cls}`.trim(); b.textContent = texto; b.hidden = true;
    barra.insertBefore(b, $('btn-sort'));
    return b;
  };
  const bRolar = botao('px-rolar', 'Rolar os dados', 'btn-primary');
  const bConfirmar = botao('px-confirmar', 'Confirmar', 'btn-primary');
  const bConstruir = botao('px-construir', 'Construir', 'btn-primary');
  const bTrocar = botao('px-trocar', 'Trocar');
  const bDevolver = botao('px-devolver', 'Devolver material', 'btn-primary');
  const bParar = botao('px-parar', 'Parar o mutirão');
  const bCancelar = botao('px-cancelar', 'Cancelar', 'btn-ghost');
  const bPassar = botao('px-passar', 'Passar a vez');

  const v = () => ctx.view;
  const eu = () => ctx.me();
  const nome = (id) => (id === eu() ? 'Você' : ctx.playerName(id));
  const jogador = (id) => v()?.players.find((p) => p.id === id);
  const souEu = (id) => id === eu();
  const agindo = () => v()?.turnId === eu();
  const minhaVez = () => v()?.donoId === eu();

  // modo: o que os toques no tabuleiro escolhem — 'casa' | 'rua' | 'predio' | 'fiscal' | null
  let modoEscolhido = null;    // o que veio do botão Construir
  let escolhido = null;        // índice do lugar escolhido (esquina, lado ou terreno)
  let ganhoRecente = null;     // { rec, ate } — o +n nas fichas depois dos dados
  let ultimoRoubo = 0;
  let modalPx = null;          // qual modal deste arquivo está aberto (e o estado dele)

  function modoAtual() {
    const vw = v();
    if (!vw || !agindo()) return null;
    if (vw.phase === 'colocacao') return vw.colocacao?.falta || null;
    if (vw.phase === 'fiscal') return 'fiscal';
    if (vw.phase === 'mutirao') return 'rua';
    if (vw.phase === 'acoes') return modoEscolhido;
    return null;
  }

  function alvos() {
    const vw = v();
    const m = modoAtual();
    if (!m) return [];
    if (m === 'fiscal') return vw.destinosDoFiscal || [];
    return vw.you?.legais?.[m] || [];
  }

  function escolhe(i) {
    escolhido = escolhido === i ? null : i;
    ctx.render();
  }

  function confirma() {
    const m = modoAtual();
    if (m === null || escolhido === null) return;
    if (m === 'fiscal') { mandaFiscal(escolhido); return; }
    ctx.sendAction({ a: m, alvo: escolhido });
    escolhido = null;
    if (v().phase === 'acoes') modoEscolhido = null;
  }

  function vitimasEm(h) {
    const ids = new Set();
    for (const vert of GEO.hexes[h].vertices) {
      const c = v().construcoes[vert];
      if (c && c.p !== eu()) ids.add(c.p);
    }
    return [...ids];
  }

  function mandaFiscal(h) {
    const vit = vitimasEm(h);
    if (vit.length <= 1) {
      ctx.sendAction({ a: 'fiscal', h, de: vit[0] || null });
      escolhido = null;
      return;
    }
    abre('fiscal', `<h2>De quem levar?</h2>
      <p>O fiscal vai para ${ctx.escapeHTML(nomeDoLote(v().tabuleiro, h))}. Escolha de quem você leva 1 material, ao acaso.</p>
      <div class="px-lista">${vit.map((id) => {
        const p = jogador(id);
        return `<button type="button" class="btn px-vitima" data-px="vitima" data-id="${ctx.escapeHTML(id)}">
          <img class="avatar" src="${ctx.caraDoJogador(id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(id)}">
          <span>${ctx.escapeHTML(p.name)}</span><span class="px-qtd">${plural(p.handCount, 'carta', 'cartas')}</span></button>`;
      }).join('')}</div>`, [{ label: 'Voltar', cls: 'btn-ghost', fn: fecha }], { h });
  }

  bConfirmar.onclick = confirma;
  bRolar.onclick = () => ctx.sendAction({ a: 'rolar' });
  bPassar.onclick = () => { modoEscolhido = null; escolhido = null; ctx.sendAction({ a: 'passar' }); };
  bParar.onclick = () => ctx.sendAction({ a: 'passar' });
  bCancelar.onclick = () => { modoEscolhido = null; escolhido = null; ctx.render(); };
  bConstruir.onclick = () => menuDeConstrucao();
  bTrocar.onclick = () => modalDeTroca();
  bDevolver.onclick = () => { modalPx = null; modalDeDescarte(); };

  // ---- modais deste arquivo ---------------------------------------------------
  // Um clique só no corpo do modal, por delegação: os modais daqui redesenham
  // o próprio conteúdo a cada toque (contadores de troca, descarte…).
  function abre(tipo, html, acoes, estado = {}) {
    modalPx = { tipo, ...estado };
    ctx.showModal(html, acoes, fecha);
  }
  function fecha() { modalPx = null; ctx.closeModal(); }
  $('modal-body').addEventListener('click', (e) => {
    const alvo = e.target.closest('[data-px]');
    if (!alvo || !modalPx) return;
    const acao = alvo.dataset.px;
    const r = alvo.dataset.r;
    const m = modalPx;
    if (m.tipo === 'fiscal' && acao === 'vitima') {
      ctx.sendAction({ a: 'fiscal', h: m.h, de: alvo.dataset.id });
      escolhido = null;
      fecha();
    } else if (m.tipo === 'construir' && acao === 'construir') {
      const t = alvo.dataset.t;
      fecha();
      if (t === 'carta') { ctx.sendAction({ a: 'comprarCarta' }); return; }
      modoEscolhido = t; escolhido = null;
      ctx.render();
    } else if (m.tipo === 'descarte') {
      if (acao === 'mais' && m.dar[r] < v().you.recursos[r] && soma(m.dar) < m.n) m.dar[r]++;
      if (acao === 'menos' && m.dar[r] > 0) m.dar[r]--;
      pintaDescarte();
    } else if (m.tipo === 'troca') {
      if (acao === 'da') m.da = m.da === r ? null : r;
      if (acao === 'quer') m.quer = m.quer === r ? null : r;
      if (acao === 'dou-mais' && m.dou[r] < v().you.recursos[r]) m.dou[r]++;
      if (acao === 'dou-menos' && m.dou[r] > 0) m.dou[r]--;
      if (acao === 'quero-mais' && m.quero[r] < 9) m.quero[r]++;
      if (acao === 'quero-menos' && m.quero[r] > 0) m.quero[r]--;
      if (acao === 'aba') m.aba = alvo.dataset.aba;
      pintaTroca();
    } else if (m.tipo === 'carta') {
      if (m.carta === 'achado') {
        if (acao === 'mais' && soma(m.rec) < 2) m.rec[r]++;
        if (acao === 'menos' && m.rec[r] > 0) m.rec[r]--;
      }
      if (m.carta === 'arremate' && acao === 'um') m.recurso = r;
      pintaCarta();
    }
  });

  function menuDeConstrucao() {
    const vw = v();
    const you = vw.you;
    const linhas = ['rua', 'casa', 'predio', 'carta'].map((t) => {
      const custo = CUSTOS[t];
      const falta = RECURSOS.filter((r) => (custo[r] || 0) > (you.recursos[r] || 0))
        .map((r) => `${custo[r] - you.recursos[r]} ${NOME_DO_RECURSO[r]}`);
      const semPeca = t !== 'carta' && you.pecas[t] <= 0;
      const semLugar = t !== 'carta' && !you.legais[t].length;
      const semCarta = t === 'carta' && !vw.cartasNoMonte;
      const motivo = semPeca ? 'acabaram as peças' : semCarta ? 'acabaram as cartas'
        : falta.length ? `falta ${falta.join(', ')}` : semLugar ? (t === 'predio' ? 'nenhuma casa para subir' : 'nenhum lugar livre') : '';
      const custoHTML = RECURSOS.filter((r) => custo[r]).map((r) => `<span class="px-par">${custo[r]}${fichaHTML(r, 'mini')}</span>`).join('');
      return `<button type="button" class="px-opcao" data-px="construir" data-t="${t}" ${motivo ? 'disabled' : ''}>
        <span class="px-opcao-nome">${NOME_DA_CONSTRUCAO[t]}${t === 'carta' ? '' : ` <small>(restam ${you.pecas[t]})</small>`}</span>
        <span class="px-custo">${custoHTML}</span>
        <span class="px-opcao-motivo">${motivo || (t === 'carta' ? `${vw.cartasNoMonte} no monte` : 'toque no tabuleiro')}</span>
      </button>`;
    }).join('');
    abre('construir', `<h2>Construir</h2><div class="px-opcoes">${linhas}</div>
      <p class="modal-hint">Rua sai de uma rua ou construção sua. Casa vai numa esquina sem vizinha ocupada, na ponta de uma rua sua. O prédio sobe em cima de uma casa sua.</p>`,
    [{ label: 'Fechar', cls: 'btn-ghost', fn: fecha }]);
  }

  // ---- descarte ------------------------------------------------------------------
  function modalDeDescarte() {
    const d = v().descartes?.[0];
    if (!d || d.id !== eu()) return;
    abre('descarte', '', [], { n: d.n, dar: zerados() });
    pintaDescarte();
  }
  function pintaDescarte() {
    const m = modalPx;
    const rec = v().you.recursos;
    const ja = soma(m.dar);
    $('modal-body').innerHTML = `<h2>Dia de fiscalização</h2>
      <p>Você está com ${plural(soma(rec), 'carta', 'cartas')} — mais de ${LIMITE_DA_MAO}. O fiscal apreende a metade: escolha <strong>${m.n}</strong> para devolver.</p>
      ${contadores(m.dar, rec, 'menos', 'mais')}
      <p class="px-conta">${ja} de ${m.n}</p>`;
    pintaAcoes([{ label: `Devolver ${m.n}`, cls: 'btn-primary', off: ja !== m.n, fn: () => { ctx.sendAction({ a: 'descartar', recursos: m.dar }); fecha(); } }]);
  }
  // Os cinco materiais lado a lado, cada um com −/+ (o +/− só muda o
  // contador do modal). Em coluna cabia um por linha e o botão de confirmar
  // ia para baixo da dobra no celular.
  function contadores(valores, tenho, menos, mais) {
    return `<div class="px-grade5">${RECURSOS.map((r) => `<div class="px-col">
      ${fichaHTML(r)}<span class="px-col-n">${valores[r]}</span>
      <span class="px-col-bt">
        <button type="button" class="px-mm" data-px="${menos}" data-r="${r}" aria-label="menos ${NOME_DO_RECURSO[r]}" ${valores[r] ? '' : 'disabled'}>−</button>
        <button type="button" class="px-mm" data-px="${mais}" data-r="${r}" aria-label="mais ${NOME_DO_RECURSO[r]}">+</button>
      </span>
      <small>${tenho ? `tem ${tenho[r] || 0}` : NOME_DO_RECURSO[r]}</small></div>`).join('')}</div>`;
  }
  // Os botões de baixo do modal, refeitos sem fechar o modal.
  function pintaAcoes(acoes) {
    const box = $('modal-actions');
    box.innerHTML = '';
    for (const a of acoes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.cls || ''}${a.off ? ' soft-disabled' : ''}`;
      b.textContent = a.label;
      b.onclick = () => { if (!a.off) a.fn(); };
      box.appendChild(b);
    }
  }

  // ---- troca ---------------------------------------------------------------------
  function modalDeTroca() {
    abre('troca', '', [], { aba: 'fornecedor', da: null, quer: null, dou: zerados(), quero: zerados() });
    pintaTroca();
  }
  function pintaTroca() {
    const m = modalPx;
    const vw = v();
    const you = vw.you;
    const tx = you.taxas;
    let corpo;
    let acoes;
    if (m.aba === 'fornecedor') {
      const da = (r) => `<button type="button" class="px-esc ${m.da === r ? 'sel' : ''}" data-px="da" data-r="${r}" ${you.recursos[r] >= tx[r] ? '' : 'disabled'} aria-pressed="${m.da === r}">
        ${fichaHTML(r)}<span>${tx[r]} por 1</span><small>tem ${you.recursos[r]}</small></button>`;
      const quer = (r) => `<button type="button" class="px-esc ${m.quer === r ? 'sel' : ''}" data-px="quer" data-r="${r}" ${vw.banca[r] > 0 && r !== m.da ? '' : 'disabled'} aria-pressed="${m.quer === r}">
        ${fichaHTML(r)}<span>${NOME_DO_RECURSO[r]}</span></button>`;
      corpo = `<p class="px-rot">Você dá</p><div class="px-escolhas">${RECURSOS.map(da).join('')}</div>
        <p class="px-rot">Você recebe 1</p><div class="px-escolhas">${RECURSOS.map(quer).join('')}</div>
        <p class="modal-hint">O fornecedor troca 4 por 1. Casa ou prédio numa revenda geral baixa para 3 por 1; numa especializada, 2 por 1 daquele material.</p>`;
      const ok = m.da && m.quer && m.da !== m.quer;
      acoes = [{
        label: ok ? `Trocar ${tx[m.da]} ${NOME_DO_RECURSO[m.da]} por 1 ${NOME_DO_RECURSO[m.quer]}` : 'Trocar',
        cls: 'btn-primary', off: !ok,
        fn: () => { ctx.sendAction({ a: 'banca', da: m.da, quer: m.quer }); fecha(); },
      }];
    } else {
      corpo = `<p class="px-rot">Você dá</p>${contadores(m.dou, you.recursos, 'dou-menos', 'dou-mais')}
        <p class="px-rot">Você quer</p>${contadores(m.quero, null, 'quero-menos', 'quero-mais')}
        <p class="modal-hint">A oferta vai para todos. Quem aceitar aparece na mesa, e você escolhe com quem fechar.</p>`;
      const repetido = RECURSOS.some((r) => m.dou[r] && m.quero[r]);
      const ok = soma(m.dou) && soma(m.quero) && !repetido;
      acoes = [{
        label: repetido ? 'Não vale o mesmo material dos dois lados' : 'Oferecer a todos', cls: 'btn-primary', off: !ok,
        fn: () => { ctx.sendAction({ a: 'oferta', da: m.dou, quer: m.quero }); fecha(); },
      }];
    }
    $('modal-body').innerHTML = `<h2>Trocar</h2>
      <div class="px-abas" role="tablist">
        <button type="button" role="tab" class="px-aba ${m.aba === 'fornecedor' ? 'sel' : ''}" data-px="aba" data-aba="fornecedor" aria-selected="${m.aba === 'fornecedor'}">Fornecedor</button>
        <button type="button" role="tab" class="px-aba ${m.aba === 'jogadores' ? 'sel' : ''}" data-px="aba" data-aba="jogadores" aria-selected="${m.aba === 'jogadores'}">Jogadores</button>
      </div>${corpo}`;
    pintaAcoes([...acoes, { label: 'Fechar', cls: 'btn-ghost', fn: fecha }]);
  }

  // ---- cartas de obra --------------------------------------------------------------
  function modalDaCarta(tipo) {
    const vw = v();
    const pode = vw.you.jogaveis.includes(tipo);
    abre('carta', '', [], { carta: tipo, pode, rec: zerados(), recurso: null });
    pintaCarta();
  }
  function pintaCarta() {
    const m = modalPx;
    const vw = v();
    const tipo = m.carta;
    let extra = '';
    let ok = m.pode;
    let porque = '';
    if (!m.pode) {
      const minhas = vw.you.cartas.filter((c) => c.tipo === tipo);
      porque = tipo === 'obra' ? 'Obra Pública não se joga: o ponto conta sozinho.'
        : !minhaVez() ? 'Só na sua vez.'
        : minhas.every((c) => c.nova) ? 'A carta comprada nesta vez só pode ser jogada na próxima.'
        : vw.phase === 'rolar' || vw.phase === 'acoes' ? 'Você já jogou uma carta nesta vez.' : 'Agora não dá.';
    }
    if (m.pode && tipo === 'achado') {
      extra = `${contadores(m.rec, null, 'menos', 'mais')}
        <p class="px-conta">${soma(m.rec)} de 2</p>`;
      ok = soma(m.rec) === 2;
    }
    if (m.pode && tipo === 'arremate') {
      extra = `<div class="px-escolhas">${RECURSOS.map((r) => `<button type="button" class="px-esc ${m.recurso === r ? 'sel' : ''}" data-px="um" data-r="${r}" aria-pressed="${m.recurso === r}">${fichaHTML(r)}<span>${NOME_DO_RECURSO[r]}</span></button>`).join('')}</div>`;
      ok = !!m.recurso;
    }
    $('modal-body').innerHTML = `<div class="px-carta-grande px-c-${tipo}">${NOME_DA_CARTA[tipo]}</div>
      <p>${DESC_DA_CARTA[tipo]}</p>${extra}${porque ? `<p class="modal-hint">${porque}</p>` : ''}`;
    const acoes = [];
    if (m.pode) {
      acoes.push({
        label: 'Jogar', cls: 'btn-primary', off: !ok,
        fn: () => {
          const a = { a: 'carta', tipo };
          if (tipo === 'achado') a.recursos = m.rec;
          if (tipo === 'arremate') a.recurso = m.recurso;
          ctx.sendAction(a);
          fecha();
        },
      });
    }
    acoes.push({ label: 'Fechar', cls: 'btn-ghost', fn: fecha });
    pintaAcoes(acoes);
  }

  // ---- desenho: tabuleiro ---------------------------------------------------------

  function desenhaTabuleiro() {
    const vw = v();
    svg.innerHTML = '';
    if (!vw.tabuleiro?.length) return;
    const m = modoAtual();
    const alv = new Set(alvos());
    if (escolhido !== null && !alv.has(escolhido)) escolhido = null;

    const defs = el('defs');
    const listras = el('pattern', { id: 'pxEmbargo', width: 0.3, height: 0.3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    listras.appendChild(el('rect', { width: 0.15, height: 0.3, fill: '#e2402e', 'fill-opacity': 0.45 }));
    defs.appendChild(listras);
    svg.appendChild(defs);

    // O chão do bairro: a avenida em volta e o calçamento entre as quadras.
    const raio = (k) => pontosAttr(BEIRA.map((x) => { const p = pos(x); const d = Math.hypot(p.x, p.y); return [p.x * (d + k) / d, p.y * (d + k) / d]; }));
    svg.appendChild(el('polygon', { class: 'px-avenida', points: raio(0.95) }));
    svg.appendChild(el('polygon', { class: 'px-faixa', points: raio(0.55) }));
    svg.appendChild(el('polygon', { class: 'px-chao', points: raio(0.16) }));

    // As revendas, na avenida, ligadas às duas esquinas delas.
    for (const rev of vw.revendas || []) {
      const [a, b] = GEO.arestas[rev.e].v;
      const h = GEO.arestas[rev.e].hexes[0];
      const mx = (pos(a).x + pos(b).x) / 2; const my = (pos(a).y + pos(b).y) / 2;
      const cx = GEO.hexes[h].x; const cy = GEO.hexes[h].y;
      const d = Math.hypot(mx - cx, my - cy);
      const tx = mx + ((mx - cx) / d) * 0.78; const ty = my + ((my - cy) / d) * 0.78;
      const g = el('g', { class: `px-revenda px-rev-${rev.tipo}` });
      for (const x of [a, b]) g.appendChild(el('line', { class: 'px-acesso', x1: pos(x).x, y1: pos(x).y, x2: tx, y2: ty }));
      g.appendChild(el('rect', { class: 'px-rev-placa', x: tx - 0.44, y: ty - 0.22, width: 0.88, height: 0.44, rx: 0.1 }));
      if (rev.tipo === 'geral') {
        const t = el('text', { class: 'px-rev-txt', x: tx, y: ty + 0.1, 'text-anchor': 'middle' });
        t.textContent = '3:1';
        g.appendChild(t);
      } else {
        const t = el('text', { class: 'px-rev-txt', x: tx - 0.12, y: ty + 0.1, 'text-anchor': 'middle' });
        t.textContent = '2:1';
        g.appendChild(t);
        g.appendChild(arteNoTabuleiro(imagemDoMaterial(rev.tipo), tx + 0.01, ty - 0.22, 0.44));
      }
      const titulo = el('title');
      titulo.textContent = rev.tipo === 'geral' ? 'Revenda geral: 3 de um material por 1' : `Revenda de ${NOME_DO_RECURSO[rev.tipo]}: 2 por 1`;
      g.appendChild(titulo);
      svg.appendChild(g);
    }

    // As quadras.
    vw.tabuleiro.forEach((casa, h) => {
      const c = GEO.hexes[h];
      const g = el('g', { class: `px-lote px-t-${casa.t}${h === vw.fiscal ? ' embargado' : ''}` });
      const forma = el('polygon', { class: 'px-quadra', points: pontosAttr(cantosDoLote(h)), fill: COR_DO_TERRENO[casa.t] });
      g.appendChild(forma);
      // o chão do lugar (a maquete renderizada no Blender), recortado na quadra:
      // o recorte fica no grupo de fora, sem transform, para valer nas
      // coordenadas do tabuleiro
      const recorte = el('clipPath', { id: `pxLote${h}` });
      recorte.appendChild(el('polygon', { points: pontosAttr(cantosDoLote(h)) }));
      defs.appendChild(recorte);
      const chao = el('g', { class: 'px-textura', 'clip-path': `url(#pxLote${h})` });
      const local = el('g', { transform: `translate(${c.x} ${c.y})` });
      local.innerHTML = chaoDaQuadra(casa.t);
      chao.appendChild(local);
      g.appendChild(chao);
      if (h === vw.fiscal) g.appendChild(el('polygon', { class: 'px-listras', points: pontosAttr(cantosDoLote(h)), fill: 'url(#pxEmbargo)' }));
      // o material que a quadra produz, o mesmo render da ficha
      const pm = casa.n ? POSICAO_DO_MATERIAL.comNumero : POSICAO_DO_MATERIAL.semNumero;
      g.appendChild(arteNoTabuleiro(imagemDaQuadra(casa.t), c.x + pm.x, c.y + pm.y, pm.tam));
      if (casa.n) {
        const quente = casa.n === 6 || casa.n === 8;
        const placa = el('g', { class: `px-placa${quente ? ' quente' : ''}` });
        placa.appendChild(el('rect', { x: c.x - 0.36, y: c.y - 0.05, width: 0.72, height: 0.56, rx: 0.1 }));
        const t = el('text', { class: 'px-num', x: c.x, y: c.y + 0.3, 'text-anchor': 'middle' });
        t.textContent = casa.n;
        placa.appendChild(t);
        // a chance do número em barrinhas: 1 (2 e 12) a 5 (6 e 8)
        const k = chances(casa.n);
        for (let i = 0; i < k; i++) placa.appendChild(el('rect', { class: 'px-chance', x: c.x - (k * 0.1) / 2 + i * 0.1 + 0.015, y: c.y + 0.37, width: 0.07, height: 0.07, rx: 0.02 }));
        g.appendChild(placa);
      } else {
        const t = el('text', { class: 'px-pref-txt', x: c.x, y: c.y + 0.42, 'text-anchor': 'middle' });
        t.textContent = 'Prefeitura';
        g.appendChild(t);
      }
      const titulo = el('title');
      titulo.textContent = `${nomeDoLote(vw.tabuleiro, h)}${PRODUZ[casa.t] ? ` — produz ${NOME_DO_RECURSO[PRODUZ[casa.t]]}` : ''}${h === vw.fiscal ? ' — embargado pelo fiscal' : ''}`;
      g.appendChild(titulo);
      if (m === 'fiscal' && alv.has(h)) alvoDeToque(g, h, `Mandar o fiscal para ${nomeDoLote(vw.tabuleiro, h)}`, 'px-alvo-hex');
      svg.appendChild(g);
    });

    // O fiscal: o cone de obra embargada, em cima do terreno dele.
    {
      const c = GEO.hexes[vw.fiscal];
      const g = el('g', { class: 'px-fiscal', transform: `translate(${c.x + 0.48} ${c.y - 0.18})` });
      g.appendChild(el('ellipse', { cx: 0, cy: 0.24, rx: 0.24, ry: 0.07, class: 'px-sombra' }));
      g.appendChild(el('rect', { x: -0.22, y: 0.16, width: 0.44, height: 0.09, rx: 0.02, class: 'px-cone-base' }));
      g.appendChild(el('path', { d: 'M-0.15 0.17 L-0.03 -0.3 L0.03 -0.3 L0.15 0.17 Z', class: 'px-cone' }));
      g.appendChild(el('path', { d: 'M-0.1 -0.02 L0.1 -0.02 L0.12 0.06 L-0.12 0.06 Z', class: 'px-cone-faixa' }));
      const t = el('title');
      t.textContent = 'O fiscal: o terreno dele está embargado e não produz.';
      g.appendChild(t);
      svg.appendChild(g);
    }

    // As ruas construídas.
    for (const [e, id] of Object.entries(vw.ruas || {})) {
      const [a, b] = GEO.arestas[e].v;
      const [x1, y1, x2, y2] = encurta(pos(a), pos(b), 0.17);
      const g = el('g', { class: 'px-rua' });
      g.appendChild(el('line', { class: 'px-rua-borda', x1, y1, x2, y2 }));
      g.appendChild(el('line', { class: 'px-rua-cor', x1, y1, x2, y2, stroke: ctx.corDoJogador(id) }));
      svg.appendChild(g);
    }
    // Os lados onde a rua pode ir (no modo rua).
    if (m === 'rua') {
      for (const e of alv) {
        const [a, b] = GEO.arestas[e].v;
        const [x1, y1, x2, y2] = encurta(pos(a), pos(b), 0.2);
        const g = el('g', { class: 'px-alvo-rua' });
        g.appendChild(el('line', { class: 'px-alvo-traco', x1, y1, x2, y2 }));
        g.appendChild(el('line', { class: 'px-alvo-toque', x1, y1, x2, y2 }));
        alvoDeToque(g, e, 'Rua neste lado');
        svg.appendChild(g);
      }
    }

    // As construções.
    for (const [vert, c] of Object.entries(vw.construcoes || {})) {
      const p = pos(vert);
      const g = el('g', { class: `px-predio-ou-casa px-${c.tipo}`, transform: `translate(${p.x} ${p.y})` });
      // o anel embaixo da peça: aparece quando ela é alvo de "subir prédio"
      g.appendChild(el('circle', { class: 'px-alvo-anel', r: 0.25, cy: 0.04 }));
      // a peça renderizada no Blender, na cor do assento; o pé fica na esquina
      // (o quadro do render tem folga para o prédio: 0,92 de lado põe a casa com
      // ~0,4, e o pé da peça cai a 73% da altura — é ali que fica a esquina)
      g.appendChild(el('image', { href: urlDaPeca(c.tipo, ctx.corDoJogador(c.p)), x: -0.46, y: -0.67, width: 0.92, height: 0.92 }));
      const t = el('title');
      t.textContent = `${c.tipo === 'casa' ? 'Casa' : 'Prédio'} de ${nome(c.p)}`;
      g.appendChild(t);
      if (m === 'predio' && alv.has(Number(vert))) alvoDeToque(g, Number(vert), 'Subir prédio nesta casa', 'px-alvo-predio');
      svg.appendChild(g);
    }
    // As esquinas onde a casa pode ir (no modo casa).
    if (m === 'casa') {
      for (const vert of alv) {
        const p = pos(vert);
        const g = el('g', { class: 'px-alvo-casa', transform: `translate(${p.x} ${p.y})` });
        g.appendChild(el('circle', { class: 'px-alvo-toque', r: 0.36 }));
        g.appendChild(el('circle', { class: 'px-alvo-circ', r: 0.17 }));
        alvoDeToque(g, vert, 'Casa nesta esquina');
        svg.appendChild(g);
      }
    }

    desenhaDados();
    svg.setAttribute('aria-label', `Tabuleiro do loteamento. ${m ? `${alv.size} lugares possíveis.` : ''}`);
  }

  function encurta(a, b, k) {
    const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy);
    return [a.x + (dx / d) * k, a.y + (dy / d) * k, b.x - (dx / d) * k, b.y - (dy / d) * k];
  }

  // Torna um pedaço do tabuleiro tocável e alcançável pelo teclado.
  function alvoDeToque(g, i, rotulo, cls = '') {
    g.classList.add('px-alvo');
    if (cls) g.classList.add(cls);
    if (escolhido === i) g.classList.add('sel');
    g.setAttribute('role', 'button');
    g.setAttribute('tabindex', '0');
    g.setAttribute('aria-label', rotulo);
    g.setAttribute('aria-pressed', String(escolhido === i));
    g.dataset.alvo = i;
    g.addEventListener('click', () => escolhe(i));
    g.addEventListener('dblclick', () => { escolhido = i; confirma(); });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (escolhido === i) confirma(); else escolhe(i); }
    });
  }

  // Os dois dados da última rolada, no canto de cima.
  const PONTOS_DO_DADO = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  function desenhaDados() {
    const d = v().dados;
    if (!d) return;
    const g = el('g', { class: `px-dados${d[0] + d[1] === 7 ? ' sete' : ''}` });
    d.forEach((n, i) => {
      const x = VB.x + 0.35 + i * 0.85; const y = VB.y + 0.3;
      g.appendChild(el('rect', { class: 'px-dado', x, y, width: 0.7, height: 0.7, rx: 0.13 }));
      for (const [px, py] of PONTOS_DO_DADO[n]) g.appendChild(el('circle', { class: 'px-dado-ponto', cx: x + 0.35 + px * 0.19, cy: y + 0.35 + py * 0.19, r: 0.065 }));
    });
    const t = el('text', { class: 'px-dados-soma', x: VB.x + 2.15, y: VB.y + 0.86 });
    t.textContent = `= ${d[0] + d[1]}`;
    g.appendChild(t);
    const titulo = el('title');
    titulo.textContent = `Últimos dados: ${d[0]} e ${d[1]}`;
    g.appendChild(titulo);
    svg.appendChild(g);
  }

  // ---- desenho: oferta de troca ----------------------------------------------------
  function desenhaOferta() {
    const vw = v();
    const o = vw.oferta;
    ofertaBox.hidden = !o;
    if (!o) { ofertaBox.innerHTML = ''; return; }
    const minha = o.de === eu();
    const cabecalho = `<p class="px-oferta-txt"><strong>${ctx.escapeHTML(minha ? 'Sua oferta' : `${nome(o.de)} oferece`)}:</strong>
      <span class="px-oferta-lado">${fichasDe(o.da)}</span> por <span class="px-oferta-lado">${fichasDe(o.quer)}</span></p>`;
    let corpo = '';
    if (minha) {
      const outros = vw.players.filter((p) => p.id !== eu());
      corpo = `<div class="px-respostas">${outros.map((p) => {
        const r = o.respostas[p.id];
        if (r === true) return `<button type="button" class="btn btn-primary px-fechar" data-com="${ctx.escapeHTML(p.id)}">Fechar com ${ctx.escapeHTML(p.name)}</button>`;
        return `<span class="px-resp ${r === false ? 'nao' : ''}">${ctx.escapeHTML(p.name)}: ${r === false ? 'recusou' : 'pensando…'}</span>`;
      }).join('')}<button type="button" class="btn btn-ghost px-cancela-oferta">Cancelar</button></div>`;
    } else {
      const r = o.respostas[eu()];
      const posso = temTudo(vw.you.recursos, o.quer);
      corpo = `<div class="px-respostas">
        <button type="button" class="btn btn-primary px-aceita${posso ? '' : ' soft-disabled'}" ${r === true ? 'aria-pressed="true"' : ''}>${r === true ? 'Aceitei' : 'Aceitar'}</button>
        <button type="button" class="btn px-recusa" ${r === false ? 'aria-pressed="true"' : ''}>${r === false ? 'Recusei' : 'Recusar'}</button>
        ${posso ? '' : '<span class="px-resp nao">você não tem o que ele pede</span>'}</div>`;
    }
    ofertaBox.innerHTML = cabecalho + corpo;
    ofertaBox.querySelectorAll('.px-fechar').forEach((b) => { b.onclick = () => ctx.sendAction({ a: 'fecharTroca', com: b.dataset.com }); });
    ofertaBox.querySelector('.px-cancela-oferta')?.addEventListener('click', () => ctx.sendAction({ a: 'cancelarOferta' }));
    const aceita = ofertaBox.querySelector('.px-aceita');
    if (aceita) aceita.onclick = () => { if (temTudo(v().you.recursos, o.quer)) ctx.sendAction({ a: 'responder', aceita: true, seq: o.seq }); else ctx.toast('Você não tem o que a oferta pede.'); };
    ofertaBox.querySelector('.px-recusa')?.addEventListener('click', () => ctx.sendAction({ a: 'responder', aceita: false, seq: o.seq }));
  }

  // ---- desenho: a mão (material e cartas de obra) ----------------------------------
  function desenhaMao() {
    const box = $('hand');
    box.innerHTML = '';
    const vw = v();
    const you = vw.you;
    if (!you) return;
    const wrap = document.createElement('div');
    wrap.className = 'px-mao';
    const ganho = ganhoRecente && Date.now() < ganhoRecente.ate ? ganhoRecente.rec : null;
    const recursos = document.createElement('div');
    recursos.className = 'px-recursos';
    recursos.setAttribute('role', 'list');
    recursos.setAttribute('aria-label', `Seu material: ${listaDeMaterial(you.recursos)}`);
    for (const r of RECURSOS) {
      const n = you.recursos[r] || 0;
      const item = document.createElement('div');
      item.className = `px-rec${n ? '' : ' zero'}`;
      item.setAttribute('role', 'listitem');
      item.innerHTML = `${fichaHTML(r)}<span class="px-rec-n">${n}</span><span class="px-rec-nome">${NOME_DO_RECURSO[r]}</span>${ganho?.[r] ? `<span class="px-ganho">+${ganho[r]}</span>` : ''}`;
      recursos.appendChild(item);
    }
    const info = document.createElement('div');
    info.className = 'px-info';
    const meu = jogador(eu());
    info.innerHTML = `<span class="px-pts"><strong>${you.pontos}</strong> de ${vw.meta} pts</span>
      <span>${plural(you.pecas.rua, 'rua', 'ruas')} · ${plural(you.pecas.casa, 'casa', 'casas')} · ${plural(you.pecas.predio, 'prédio', 'prédios')}</span>
      ${meu?.mestres ? `<span>${plural(meu.mestres, 'mestre jogado', 'mestres jogados')}</span>` : ''}`;
    const cartas = document.createElement('div');
    cartas.className = 'px-cartas';
    // agrupa por tipo: "Mestre de Obras ×2"
    const grupos = new Map();
    for (const c of you.cartas) {
      const g = grupos.get(c.tipo) || { n: 0, novas: 0, nomes: [] };
      g.n++; if (c.nova) g.novas++; if (c.nome) g.nomes.push(c.nome);
      grupos.set(c.tipo, g);
    }
    for (const [tipo, g] of grupos) {
      const b = document.createElement('button');
      b.type = 'button';
      const pode = you.jogaveis.includes(tipo);
      b.className = `px-carta px-c-${tipo}${pode ? ' pode' : ''}`;
      b.innerHTML = `<span class="px-carta-nome">${tipo === 'obra' ? `Obra Pública` : NOME_DA_CARTA[tipo]}</span>${g.n > 1 ? `<span class="px-carta-n">×${g.n}</span>` : ''}${g.novas === g.n && tipo !== 'obra' ? '<span class="px-carta-nova">nova</span>' : ''}`;
      b.setAttribute('aria-label', `${NOME_DA_CARTA[tipo]}${g.n > 1 ? `, ${g.n} cartas` : ''}${tipo === 'obra' ? `: ${g.nomes.join(', ')}` : ''}${pode ? '. Toque para jogar.' : ''}`);
      b.onclick = () => modalDaCarta(tipo);
      cartas.appendChild(b);
    }
    wrap.append(recursos, info);
    if (grupos.size) wrap.appendChild(cartas);
    box.appendChild(wrap);
  }

  // ---- botões ------------------------------------------------------------------------
  function botoes() {
    const vw = v();
    for (const id of ['btn-draw-deck', 'btn-draw-discard', 'btn-queimar', 'btn-baixar', 'btn-discard', 'btn-meld-discard', 'btn-cancel-mode']) $(id).hidden = true;
    for (const b of [bRolar, bConfirmar, bConstruir, bTrocar, bDevolver, bParar, bCancelar, bPassar]) b.hidden = true;
    if (vw.phase === 'gameEnd') return;
    const m = modoAtual();
    const age = agindo();
    if (m && escolhido !== null) {
      bConfirmar.hidden = false;
      bConfirmar.textContent = m === 'fiscal' ? 'Mandar o fiscal aqui'
        : m === 'casa' ? (vw.phase === 'colocacao' ? 'Pôr a casa aqui' : 'Levantar a casa aqui')
          : m === 'rua' ? (vw.phase === 'mutirao' ? 'Rua de graça aqui' : vw.phase === 'colocacao' ? 'Pôr a rua aqui' : 'Fazer a rua aqui')
            : 'Subir o prédio aqui';
    }
    if (!age) return;
    if (vw.phase === 'rolar') bRolar.hidden = false;
    if (vw.phase === 'descarte' && vw.descartes?.[0]?.id === eu()) bDevolver.hidden = false;
    if (vw.phase === 'mutirao') bParar.hidden = false;
    if (vw.phase === 'acoes') {
      if (modoEscolhido) bCancelar.hidden = false;
      else { bConstruir.hidden = false; bTrocar.hidden = false; }
      bPassar.hidden = !!modoEscolhido;
    }
  }

  // ---- assentos ----------------------------------------------------------------------
  function marcasDosAssentos() {
    const vw = v();
    for (const [id, elA] of ctx.assentos) {
      const p = jogador(id);
      if (!p) continue;
      const marcas = elA.querySelector('.marcas');
      const nova = (txt, cls) => { const s = document.createElement('span'); s.className = cls; s.textContent = txt; marcas.prepend(s); };
      // (quem aceitou ou recusou a oferta aparece no painel dela, não aqui:
      // a marca a mais empurrava o assento por cima do painel)
      if (vw.descartes?.some((d) => d.id === id)) nova('devolvendo', 'm-off');
      if (vw.equipe?.id === id) nova('Equipe', 'px-m-titulo');
      if (vw.avenida?.id === id) nova('Avenida', 'px-m-titulo');
      nova(`${p.pontos} pts`, 'm-gold');
      elA.setAttribute('aria-label', `${p.name}: ${p.pontos} pontos à vista, ${plural(p.handCount, 'carta', 'cartas')} de material, ${plural(p.cartasDeObra, 'carta', 'cartas')} de obra.`);
    }
  }

  function cabecalho() {
    const vw = v();
    $('round-label').textContent = 'Puxadinho';
    const lider = Math.max(...vw.players.map((p) => p.pontos));
    $('contract-label').textContent = vw.phase === 'colocacao' ? 'Colocação' : vw.phase === 'gameEnd' ? 'Fim da partida' : `até ${vw.meta} · líder ${lider}`;
  }

  // ---- fases que abrem modal -----------------------------------------------------------
  let chaveDoModal = null;
  function modalDeFase() {
    const vw = v();
    let chave = null;
    if (vw.phase === 'gameEnd') chave = `fim:${vw.vencedor}`;
    else if (vw.phase === 'descarte' && vw.descartes?.[0]?.id === eu()) chave = `descarte:${vw.turnNo}`;
    if (chave === chaveDoModal) return;
    const antes = chaveDoModal;
    chaveDoModal = chave;
    if (!chave) {
      // a fase que tinha modal acabou: fecha o dela (não um que a pessoa abriu)
      if (antes && modalPx && (modalPx.tipo === 'descarte' || modalPx.tipo === 'fim')) fecha();
      return;
    }
    if (chave.startsWith('fim')) fimDaPartida();
    else modalDeDescarte();
  }

  function tabelaDePontos(final) {
    const vw = v();
    const ordem = [...vw.players].sort((a, b) => b.pontos - a.pontos);
    const linhas = ordem.map((p) => {
      let casas = 0; let predios = 0;
      for (const c of Object.values(vw.construcoes)) if (c.p === p.id) { if (c.tipo === 'casa') casas++; else predios++; }
      const obras = final ? (p.obras?.length || 0) : 0;
      // títulos e obras vão embaixo do nome: com 5 colunas a tabela não cabia em 375 px
      const extras = [vw.avenida?.id === p.id ? 'Avenida' : '', vw.equipe?.id === p.id ? 'Equipe' : '', obras ? plural(obras, 'obra', 'obras') : '']
        .filter(Boolean).join(' · ');
      return `<tr><td><span class="quem">
          <img class="avatar" src="${ctx.caraDoJogador(p.id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(p.id)}">
          <span>${ctx.escapeHTML(nome(p.id))}${extras ? `<small class="px-sub">${extras}</small>` : ''}</span></span></td>
        <td class="num">${casas}</td><td class="num">${predios}</td>
        <td class="num"><strong>${p.pontos}</strong></td></tr>`;
    }).join('');
    return `<table class="score-table"><thead><tr><th>Jogador</th><th class="num">Casas</th><th class="num">Prédios</th><th class="num">Pts</th></tr></thead><tbody>${linhas}</tbody></table>`;
  }

  function fimDaPartida() {
    const vw = v();
    const ganhei = vw.vencedor === eu();
    const lr = vw.lastRound || {};
    const obras = Object.entries(lr.obras || {}).filter(([, l]) => l.length)
      .map(([id, l]) => `${ctx.escapeHTML(nome(id))}: ${l.map(ctx.escapeHTML).join(', ')}`).join(' · ');
    const acoes = ctx.isHost() ? [{ label: 'Jogar de novo', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'playAgain' }) }] : [];
    acoes.push({ label: 'Sair da sala', cls: 'btn-ghost', fn: ctx.saiDaSala });
    modalPx = { tipo: 'fim' };
    ctx.showModal(
      `<div class="palco-vencedor grande"><img src="${ctx.figuraFeliz(vw.vencedor)}" alt=""></div>
       <h2>${ganhei ? 'Você ganhou!' : `${ctx.escapeHTML(nome(vw.vencedor))} ganhou!`}</h2>
       <p>${lr.motivo === 'teto' ? 'A partida bateu o limite de vezes: ganha quem tinha mais pontos.' : `Chegou a ${lr.pontos?.[vw.vencedor]} pontos na própria vez.`}</p>
       ${tabelaDePontos(true)}
       ${obras ? `<p class="modal-hint">Obras Públicas escondidas — ${obras}.</p>` : ''}
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião decidir…</p>'}`,
      acoes,
    );
  }

  // ---- o que client.js chama -----------------------------------------------------------

  return {
    render() {
      const vw = v();
      if (vw.phase !== 'acoes' || !minhaVez()) modoEscolhido = null;
      cabecalho();
      ctx.renderOpponents();
      marcasDosAssentos();
      desenhaOferta();
      desenhaTabuleiro();
      desenhaMao();
      botoes();
      ctx.atualizaBanner();
      modalDeFase();
    },

    textoDaVez() {
      const vw = v();
      const quem = nome(vw.turnId);
      const minha = agindo();
      switch (vw.phase) {
        case 'colocacao': {
          const c = vw.colocacao;
          const qual = c?.volta ? '2ª' : '1ª';
          if (!minha) return { minha, texto: `${quem} está escolhendo onde pôr a ${c?.falta === 'rua' ? 'rua' : `${qual} casa`}…` };
          return { minha, texto: c.falta === 'casa' ? `Ponha a sua ${qual} casa: toque numa esquina marcada.${c.volta ? ' Ela já rende material.' : ''}` : 'Agora a rua, saindo dessa casa.' };
        }
        case 'rolar': return minha ? { minha, texto: 'Sua vez: role os dados.' } : { minha, texto: `Vez de ${quem}…` };
        case 'descarte': {
          const d = vw.descartes?.[0];
          return minha ? { minha, texto: `Dia de fiscalização: devolva ${d?.n} cartas.` } : { minha, texto: `Dia de fiscalização: ${quem} está devolvendo material…` };
        }
        case 'fiscal': return minha ? { minha, texto: 'Mande o fiscal para outro terreno: toque num terreno marcado.' } : { minha, texto: `${quem} está mandando o fiscal…` };
        case 'mutirao': return minha ? { minha, texto: 'Mutirão: toque num lado marcado para a rua de graça.' } : { minha, texto: `${quem} está no mutirão…` };
        case 'acoes': {
          if (!minha) return { minha, texto: `Vez de ${quem}…` };
          if (modoEscolhido === 'casa') return { minha, texto: 'Toque numa esquina marcada para a casa.' };
          if (modoEscolhido === 'rua') return { minha, texto: 'Toque num lado marcado para a rua.' };
          if (modoEscolhido === 'predio') return { minha, texto: 'Toque numa casa sua para subir o prédio.' };
          return { minha, texto: 'Construa, troque ou passe a vez.' };
        }
        default: return { minha: false, texto: '' };
      }
    },

    anuncia(ev) {
      const vw = v();
      const tab = vw?.tabuleiro || [];
      switch (ev.e) {
        case 'roundStart':
          ctx.novaRodada();
          modoEscolhido = null; escolhido = null; chaveDoModal = null; ultimoRoubo = 0;
          if (modalPx) fecha();
          break;
        case 'inicio':
          ctx.toast(souEu(ev.p) ? 'Você começa: ponha a sua primeira casa.' : `${nome(ev.p)} começa a colocação.`);
          break;
        case 'vez':
          if (souEu(ev.p)) ctx.toast('Sua vez!');
          break;
        case 'rolou': {
          const meu = ev.ganhos?.[eu()];
          if (meu) ganhoRecente = { rec: meu, ate: Date.now() + 1800 };
          if (ev.soma === 7) { ctx.toast(`${nome(ev.p)} tirou 7: dia de fiscalização!`); break; }
          const txt = `${souEu(ev.p) ? 'Você tirou' : `${nome(ev.p)} tirou`} ${ev.soma}`;
          ctx.toast(meu ? `${txt}: você recebe ${listaDeMaterial(meu)}.` : `${txt}.`);
          if (ev.faltou?.length) ctx.toast(`O fornecedor ficou sem ${ev.faltou.map((r) => NOME_DO_RECURSO[r]).join(' e ')}: ninguém recebe.`);
          break;
        }
        case 'fiscalizacao':
          if (ev.quem.some((q) => souEu(q.p))) ctx.toast(`Você tem mais de ${LIMITE_DA_MAO} cartas: devolva a metade.`);
          break;
        case 'descartou':
          if (!souEu(ev.p)) ctx.toast(`${nome(ev.p)} devolveu ${listaDeMaterial(ev.recursos)}${ev.cacamba ? ' na caçamba' : ''}.`);
          break;
        case 'cacambaRecolhida':
          ctx.toast('O caminhão recolheu a caçamba: o material voltou ao fornecedor.');
          break;
        case 'fiscal': {
          const lugar = nomeDoLote(tab, ev.h);
          const roubo = vw?.roubo;
          let txt = `${souEu(ev.p) ? 'Você mandou' : `${nome(ev.p)} mandou`} o fiscal para ${lugar}`;
          if (ev.de && ev.levou && roubo && roubo.seq !== ultimoRoubo) {
            ultimoRoubo = roubo.seq;
            if (souEu(ev.p)) txt += ` e levou 1 ${NOME_DO_RECURSO[roubo.res]} de ${nome(ev.de)}`;
            else if (souEu(ev.de)) txt += ` e levou 1 ${NOME_DO_RECURSO[roubo.res]} seu`;
            else txt += ` e levou 1 material de ${nome(ev.de)}`;
            ctx.reage(ev.de, 'perdeu');
          } else if (ev.de) txt += `, mas ${nome(ev.de)} não tinha material`;
          ctx.toast(`${txt}.`);
          break;
        }
        case 'construiu':
          if (!souEu(ev.p) && !ev.inicial) {
            ctx.toast(ev.tipo === 'rua' ? `${nome(ev.p)} fez uma rua${ev.gratis ? ' (mutirão)' : ''}.`
              : ev.tipo === 'casa' ? `${nome(ev.p)} levantou uma casa.` : `${nome(ev.p)} subiu um prédio!`);
          }
          break;
        case 'comprouCarta':
          ctx.toast(souEu(ev.p) ? 'Você comprou uma carta de obra.' : `${nome(ev.p)} comprou uma carta de obra.`);
          break;
        case 'cartaJogada':
          if (!souEu(ev.p)) ctx.toast(`${nome(ev.p)} jogou ${NOME_DA_CARTA[ev.tipo]}.`);
          break;
        case 'achado':
          ctx.toast(`${souEu(ev.p) ? 'Você achou' : `${nome(ev.p)} achou`} ${listaDeMaterial(ev.recursos)}${ev.daCacamba ? ' na caçamba' : ''}.`);
          break;
        case 'arremate': {
          const meu = ev.de?.[eu()];
          ctx.toast(souEu(ev.p) ? `Arremate: você juntou ${ev.total} ${NOME_DO_RECURSO[ev.recurso]}.`
            : `Arremate de ${nome(ev.p)}: ${ev.total} ${NOME_DO_RECURSO[ev.recurso]}${meu ? ` (${meu} seus)` : ''}.`);
          if (!souEu(ev.p) && meu) ctx.reage(eu(), 'perdeu');
          break;
        }
        case 'banca':
          if (!souEu(ev.p)) ctx.toast(`${nome(ev.p)} trocou ${ev.taxa * ev.n} ${NOME_DO_RECURSO[ev.da]} por ${ev.n} ${NOME_DO_RECURSO[ev.quer]} no fornecedor.`);
          break;
        case 'oferta':
          if (!souEu(ev.p)) ctx.toast(`${nome(ev.p)} quer trocar ${listaDeMaterial(ev.da)} por ${listaDeMaterial(ev.quer)}.`);
          break;
        case 'respondeu':
          if (vw?.oferta?.de === eu() && ev.aceita) ctx.toast(`${nome(ev.p)} aceitou a sua oferta.`);
          break;
        case 'trocou':
          if (souEu(ev.p) || souEu(ev.com)) ctx.toast(`Troca feita com ${nome(souEu(ev.p) ? ev.com : ev.p)}.`);
          else ctx.toast(`${nome(ev.p)} trocou com ${nome(ev.com)}.`);
          break;
        case 'avenida':
          if (ev.p) {
            ctx.toast(`${souEu(ev.p) ? 'Você tem' : `${nome(ev.p)} tem`} a Avenida Principal: ${ev.n} ruas seguidas (+2).`);
            ctx.reage(ev.p, 'levou');
          } else if (ev.de) ctx.toast(`A Avenida Principal de ${nome(ev.de)} foi cortada e ficou sem dono.`);
          break;
        case 'equipe':
          ctx.toast(`${souEu(ev.p) ? 'Você tem' : `${nome(ev.p)} tem`} a Maior Equipe: ${ev.n} mestres de obras (+2).`);
          ctx.reage(ev.p, 'levou');
          break;
        case 'venceu':
          ctx.reage(ev.p, 'bateu');
          break;
        default:
          break;
      }
    },

    mostraJogador(id) {
      const p = jogador(id);
      if (!p) return;
      const vw = v();
      const titulos = [vw.avenida?.id === id ? 'Avenida Principal' : '', vw.equipe?.id === id ? 'Maior Equipe' : ''].filter(Boolean);
      ctx.showModal(
        `<div id="oponente-topo" class="oponente-topo"></div>
         <h3>${ctx.escapeHTML(p.name)}</h3>
         <p><strong>${p.pontos}</strong> pontos à vista${titulos.length ? ` · ${titulos.join(' e ')}` : ''}</p>
         <p>${plural(p.handCount, 'carta', 'cartas')} de material · ${plural(p.cartasDeObra, 'carta', 'cartas')} de obra</p>
         <p>Maior sequência de ruas: ${p.maiorRua} · ${plural(p.mestres, 'mestre jogado', 'mestres jogados')}</p>
         <p class="modal-hint">Ainda tem ${plural(p.pecas.rua, 'rua', 'ruas')}, ${plural(p.pecas.casa, 'casa', 'casas')} e ${plural(p.pecas.predio, 'prédio', 'prédios')} para construir. Obras Públicas ficam escondidas até o fim.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
      $('oponente-topo').appendChild(ctx.avatarEl(p.id, vw.players, 72));
    },

    placar() {
      const vw = v();
      modalPx = null;
      ctx.showModal(
        `<h2>Placar</h2>${tabelaDePontos(vw.phase === 'gameEnd')}
         <p class="modal-hint">Casa 1 ponto, prédio 2, Avenida Principal 2 (${AVENIDA_MINIMA}+ ruas seguidas), Maior Equipe 2 (${EQUIPE_MINIMA}+ mestres jogados), Obra Pública 1 (escondida). Ganha quem chega a ${vw.meta} na própria vez. ${vw.cartasNoMonte} cartas de obra no monte.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },

    regras() {
      modalPx = null;
      ctx.showModal(
        `<h2>Como se joga o Puxadinho</h2>
         <p><strong>Objetivo:</strong> você é mestre de obras num loteamento novo. Ganha quem chegar a <strong>10 pontos</strong> na própria vez.</p>
         <p><strong>O bairro:</strong> 19 terrenos. Pedreira dá pedra, Areal dá areia, Olaria dá tijolo, Cimenteira dá cimento, Ferro-velho dá ferro. A Prefeitura não produz — é lá que o fiscal começa.</p>
         <p><strong>Começo:</strong> cada um põe uma casa numa esquina e uma rua saindo dela; depois, na ordem contrária, a segunda casa e a segunda rua. A segunda casa já rende um material de cada terreno em volta.</p>
         <p><strong>Na vez:</strong> role os dois dados. Todo terreno com aquele número produz para quem tem construção em volta: casa ganha 1, prédio ganha 2. Depois troque e construa à vontade, e passe a vez.</p>
         <p><strong>Custos:</strong> rua = pedra + areia. Casa = pedra + areia + tijolo + cimento. Prédio (sobe em cima da sua casa) = 3 ferro + 2 cimento. Carta de obra = ferro + tijolo + cimento.</p>
         <p><strong>Onde construir:</strong> a rua sai de uma rua ou construção sua. A casa vai numa esquina sem nenhuma vizinha ocupada, na ponta de uma rua sua. A casa de outro jogador corta a sua rua naquela esquina.</p>
         <p><strong>Dia de fiscalização (7 nos dados):</strong> ninguém produz. Quem tem mais de 7 cartas devolve a metade. Quem rolou manda o fiscal para outro terreno — ele fica embargado, sem produzir — e leva 1 material de um vizinho de lá.</p>
         <p><strong>Trocas:</strong> o fornecedor troca 4 por 1. Casa ou prédio numa revenda da avenida baixa para 3 por 1 (geral) ou 2 por 1 (especializada). Entre jogadores, só com quem está na vez.</p>
         <p><strong>Cartas de obra:</strong> Mestre de Obras (manda o fiscal e leva 1 material), Mutirão (2 ruas de graça), Achado na Caçamba (2 materiais quaisquer), Arremate (todos te entregam um material) e Obra Pública (1 ponto escondido). Uma por vez, pode ser antes de rolar — mas nunca a comprada na mesma vez.</p>
         <p><strong>Títulos de 2 pontos:</strong> Avenida Principal para quem tiver 5 ou mais ruas seguidas (perde para uma maior) e Maior Equipe para quem jogar 3 ou mais Mestres de Obras (perde para quem jogar mais).</p>`,
        [{ label: 'Entendi', cls: 'btn-primary', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
  };
}
