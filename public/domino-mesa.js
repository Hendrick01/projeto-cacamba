// ============================================================================
// Dominó de ponto — a mesa 2D. Este arquivo (e o domino.css) só é baixado
// quando alguém escolhe o modo ou entra numa sala dele, como a do Presidente.
//
// Usa o cenário, os assentos, os modais e os avisos do Caçamba, que chegam
// pelo `ctx` (ver contextoDaMesa em client.js). O que é daqui: a cobra de
// pedras no meio, o placar das duplas, a mão de pedras em pé, os botões de
// jogar e passar e a escolha da ponta.
// ============================================================================

import { META, pontosDaPedra } from '/shared/domino.js';

const NOME_DO_RAMO = { esq: 'na esquerda', dir: 'na direita', cima: 'em cima', baixo: 'embaixo' };
const BOTAO_DO_RAMO = { esq: '← Esquerda', dir: 'Direita →', cima: '↑ Em cima', baixo: '↓ Embaixo' };
const SVG = 'http://www.w3.org/2000/svg';

// ---------------------------------------------------------------------------
// O desenho de uma pedra. Tudo em "casas": meia pedra é um quadrado de 1×1.
// ---------------------------------------------------------------------------

// Onde ficam os pontos numa casa, a partir do centro. `u` corre no sentido do
// comprimento da pedra e `v` na largura — o 6 são duas fileiras de três que
// acompanham o comprimento, como na pedra de verdade.
const K = 0.26;
const PONTOS = {
  0: [],
  1: [[0, 0]],
  2: [[-K, -K], [K, K]],
  3: [[-K, -K], [0, 0], [K, K]],
  4: [[-K, -K], [-K, K], [K, -K], [K, K]],
  5: [[-K, -K], [-K, K], [0, 0], [K, -K], [K, K]],
  6: [[-K, -K], [0, -K], [K, -K], [-K, K], [0, K], [K, K]],
};

function el(tag, attrs = {}) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Uma pedra desenhada num <g>. `casas` são os dois centros [x, y] das metades,
// com o valor de cada uma; `eixo` é o vetor do comprimento ([1,0] deitada,
// [0,1] em pé).
function pedraSvg({ x, y, w, h, casas, eixo, classe = '' }) {
  const g = el('g', { class: `pedra ${classe}`.trim() });
  g.appendChild(el('rect', { class: 'pedra-sombra', x: x + 0.05, y: y + 0.09, width: w, height: h, rx: 0.16 }));
  g.appendChild(el('rect', { class: 'pedra-face', x, y, width: w, height: h, rx: 0.16 }));
  // a risca do meio
  const [c1, c2] = casas;
  const mx = (c1.x + c2.x) / 2, my = (c1.y + c2.y) / 2;
  const meiaLarg = 0.36;
  const [px, py] = [Math.abs(c2.y - c1.y), Math.abs(c2.x - c1.x)];   // perpendicular ao par
  g.appendChild(el('line', {
    class: 'pedra-risca',
    x1: mx - px * meiaLarg, y1: my - py * meiaLarg, x2: mx + px * meiaLarg, y2: my + py * meiaLarg,
  }));
  for (const c of casas) {
    for (const [u, v] of PONTOS[c.valor] || []) {
      // u no sentido do eixo, v na perpendicular
      const cx = c.x + u * eixo[0] - v * eixo[1];
      const cy = c.y + u * eixo[1] + v * eixo[0];
      g.appendChild(el('circle', { class: 'pedra-ponto', cx, cy, r: 0.085 }));
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// A cobra. A carroça de saída fica em pé no centro (é a cruz); esquerda e
// direita saem dos lados dela, cima e baixo das pontas. Cada ramo segue reto
// até um limite e dobra UMA vez, sempre para o mesmo lado (um cata-vento):
// esquerda sobe, cima vai para a direita, direita desce, baixo vai para a
// esquerda. Assim nenhum ramo cruza outro, e o desenho todo cabe na tela por
// escala (viewBox), sem precisar de quebra-cabeça.
// ---------------------------------------------------------------------------

const LIMITE = { esq: 7.5, dir: 7.5, cima: 4.5, baixo: 4.5 };
const PARTIDA = {
  // origem do eixo, direção, direção depois da dobra
  esq: { o: [-0.5, 0], d: [-1, 0], dobra: [0, -1] },
  dir: { o: [0.5, 0], d: [1, 0], dobra: [0, 1] },
  cima: { o: [0, -1], d: [0, -1], dobra: [1, 0] },
  baixo: { o: [0, 1], d: [0, 1], dobra: [-1, 0] },
};

const soma = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

// Um retângulo no eixo de um trecho: de `t` a `t+comp` ao longo de `d`, com
// `larg` de largura em volta do eixo.
function retangulo(o, d, t, comp, larg) {
  const p = [d[1], -d[0]];
  const a = soma(soma(o, d, t), p, -larg / 2);
  const b = soma(soma(o, d, t + comp), p, larg / 2);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
}

// Percorre um ramo e devolve as pedras posicionadas e onde iria a próxima.
function percorre(ramo, lista) {
  const ini = PARTIDA[ramo];
  let o = ini.o, d = ini.d, t = 0, dobrou = false;
  const pecas = [];
  const proxima = (comp) => {
    // passa do limite? então esta pedra já é a da dobra
    const alcance = Math.abs((o[0] + d[0] * (t + comp)) * ini.d[0] + (o[1] + d[1] * (t + comp)) * ini.d[1]);
    if (!dobrou && alcance > LIMITE[ramo]) {
      const frente = soma(o, d, t);
      const d2 = ini.dobra;
      o = soma(soma(frente, d, 0.5), d2, -0.5);
      d = d2; t = 0; dobrou = true;
      return true;
    }
    return false;
  };
  for (const item of lista) {
    const carroca = item.pedra.a === item.pedra.b;
    // a carroça atravessa o caminho, como na mesa; na dobra, vai deitada
    let comp = carroca ? 1 : 2;
    if (proxima(comp) && carroca) comp = 2;
    const atravessada = carroca && comp === 1;
    const larg = atravessada ? 2 : 1;
    const r = retangulo(o, d, t, comp, larg);
    let casas, eixo;
    if (atravessada) {
      const p = [d[1], -d[0]];
      const c = soma(o, d, t + 0.5);
      casas = [{ ...pontoDe(soma(c, p, 0.5)), valor: item.pedra.a }, { ...pontoDe(soma(c, p, -0.5)), valor: item.pedra.b }];
      eixo = [Math.abs(p[0]), Math.abs(p[1])];
    } else {
      casas = [
        { ...pontoDe(soma(o, d, t + 0.5)), valor: item.dentro },
        { ...pontoDe(soma(o, d, t + 1.5)), valor: item.fora },
      ];
      eixo = [Math.abs(d[0]), Math.abs(d[1])];
    }
    pecas.push({ ...r, casas, eixo, pedraId: item.pedra.id });
    t += comp;
  }
  // a próxima vaga: onde uma pedra comum cairia agora
  proxima(2);
  const vaga = pontoDe(soma(o, d, t + 0.5));
  return { pecas, vaga };
}
const pontoDe = ([x, y]) => ({ x, y });

// ---------------------------------------------------------------------------

export function criaMesaDomino(ctx) {
  const { $ } = ctx;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/domino.css';
  document.head.appendChild(css);

  // O meio da mesa: placar das duplas em cima, a cobra embaixo.
  const centro = document.createElement('div');
  centro.id = 'dom-centro';
  centro.className = 'dom-centro';
  const placar = document.createElement('div');
  placar.className = 'dom-placar';
  const palco = document.createElement('div');
  palco.className = 'dom-palco';
  const svg = el('svg', { class: 'dom-cobra', role: 'img', preserveAspectRatio: 'xMidYMid meet' });
  palco.appendChild(svg);
  centro.append(placar, palco);
  $('screen-game').querySelector('.table-center').prepend(centro);

  const barra = $('action-bar');
  const botao = (id, texto, cls) => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = `btn dom-btn ${cls}`; b.textContent = texto; b.hidden = true;
    barra.insertBefore(b, $('btn-sort'));
    return b;
  };
  const bJogar = botao('dom-jogar', 'Jogar', 'btn-primary');
  const bRamos = Object.fromEntries(['esq', 'cima', 'baixo', 'dir'].map((r) => [r, botao(`dom-ramo-${r}`, '', 'btn-primary dom-ramo')]));
  const bPassar = botao('dom-passar', 'Passar', '');

  const v = () => ctx.view;
  const eu = () => ctx.me();
  const minhaVez = () => v()?.phase === 'play' && v()?.turnId === eu();
  const nome = (id) => (id === eu() ? 'Você' : ctx.playerName(id));
  const txt = (p) => `${p.a}|${p.b}`;
  let escolhida = null;      // id da pedra escolhida na mão

  const meuTime = () => v()?.you?.time ?? 0;
  const timeDe = (id) => v()?.players.find((p) => p.id === id)?.time;
  const nomesDaDupla = (time) => v().players.filter((p) => p.time === time).map((p) => (p.id === eu() ? 'você' : p.name));
  const rotuloDoTime = (time) => (time === meuTime() ? 'Nós' : 'Eles');

  const jogadasDa = (pedraId) => (v()?.you?.jogadas || []).filter((j) => j.pedraId === pedraId);

  function joga(pedraId, ramo) {
    ctx.sendAction({ a: 'jogar', pedraId, ramo });
    escolhida = null;
  }

  bJogar.onclick = () => {
    const js = jogadasDa(escolhida);
    if (js.length === 1) joga(js[0].pedraId, js[0].ramo);
    else if (!js.length) ctx.toast('Essa pedra não encaixa em nenhuma ponta.');
  };
  for (const [ramo, b] of Object.entries(bRamos)) b.onclick = () => joga(escolhida, ramo);
  bPassar.onclick = () => { ctx.sendAction({ a: 'passar' }); escolhida = null; };

  // ---- placar -----------------------------------------------------------

  function desenhaPlacar() {
    const vw = v();
    const meu = meuTime();
    placar.innerHTML = '';
    for (const time of [meu, 1 - meu]) {
      const lado = document.createElement('div');
      lado.className = `dom-time${time === meu ? ' nosso' : ''}${vw.vencedor === time ? ' venceu' : ''}`;
      const t = document.createElement('span');
      t.className = 'dom-time-nome';
      t.textContent = rotuloDoTime(time);
      const quem = document.createElement('span');
      quem.className = 'dom-time-quem';
      quem.textContent = nomesDaDupla(time).join(' e ');
      const pts = document.createElement('strong');
      pts.className = 'dom-time-pts';
      pts.textContent = vw.times[time];
      lado.append(t, pts, quem);
      placar.appendChild(lado);
    }
    const meta = document.createElement('span');
    meta.className = 'dom-meta';
    meta.textContent = `até ${vw.meta || META}`;
    placar.insertBefore(meta, placar.lastChild);
  }

  // ---- a cobra ------------------------------------------------------------

  let ultimaPedra = null;
  function desenhaCobra() {
    const vw = v();
    svg.innerHTML = '';
    const mesa = vw.mesa;
    if (!mesa) {
      svg.setAttribute('viewBox', '-7 -4 14 8');
      const g = el('g', { class: 'dom-vazia' });
      g.appendChild(el('rect', { x: -0.5, y: -1, width: 1, height: 2, rx: 0.16 }));
      const t = el('text', { x: 0, y: 2.1, 'text-anchor': 'middle' });
      const s = vw.saida && vw.you?.hand.find((p) => p.id === vw.saida);
      t.textContent = vw.phase !== 'play' ? '' : s ? `você sai com a ${txt(s)}` : `${nome(vw.turnId)} sai com carroça`;
      g.appendChild(t);
      svg.appendChild(g);
      svg.setAttribute('aria-label', 'Mesa vazia: a mão começa com carroça.');
      ultimaPedra = null;
      return;
    }

    const caixa = { x0: -0.5, y0: -1, x1: 0.5, y1: 1 };
    const cabe = (r) => {
      caixa.x0 = Math.min(caixa.x0, r.x); caixa.y0 = Math.min(caixa.y0, r.y);
      caixa.x1 = Math.max(caixa.x1, r.x + r.w); caixa.y1 = Math.max(caixa.y1, r.y + r.h);
    };

    const ultimo = vw.lances?.[vw.lances.length - 1];
    const novaPedra = ultimo ? ultimo.pedraId : null;
    const cai = novaPedra !== ultimaPedra && !ctx.semMovimento();
    ultimaPedra = novaPedra;
    const classeDe = (id) => (id === novaPedra ? `ultima${cai ? ' cai' : ''}` : '');

    const camada = el('g');
    // o centro (a cruz), em pé
    const c = mesa.centro;
    camada.appendChild(pedraSvg({
      x: -0.5, y: -1, w: 1, h: 2, eixo: [0, 1],
      casas: [{ x: 0, y: -0.5, valor: c.a }, { x: 0, y: 0.5, valor: c.b }],
      classe: `cruz ${classeDe(c.id)}`,
    }));
    const vagas = {};
    for (const ramo of ['esq', 'dir', 'cima', 'baixo']) {
      const { pecas, vaga } = percorre(ramo, mesa.ramos[ramo] || []);
      for (const p of pecas) { cabe(p); camada.appendChild(pedraSvg({ ...p, classe: classeDe(p.pedraId) })); }
      vagas[ramo] = vaga;
    }
    svg.appendChild(camada);

    // As pontas abertas: o valor de cada uma, e — com pedra escolhida que
    // encaixa em mais de uma — o alvo de toque para escolher onde encostar.
    const alvos = new Set(escolhida && minhaVez() ? jogadasDa(escolhida).map((j) => j.ramo) : []);
    const escolher = alvos.size > 1;
    for (const ponta of mesa.pontas || []) {
      const vg = vagas[ponta.ramo];
      if (!vg) continue;
      const alvo = escolher && alvos.has(ponta.ramo);
      const g = el('g', { class: `dom-ponta${alvo ? ' alvo' : ''}${alvos.has(ponta.ramo) && !escolher ? ' cabe' : ''}` });
      g.appendChild(el('circle', { cx: vg.x, cy: vg.y, r: alvo ? 0.62 : 0.42 }));
      const t = el('text', { x: vg.x, y: vg.y + 0.2, 'text-anchor': 'middle' });
      t.textContent = ponta.valor;
      g.appendChild(t);
      if (alvo) {
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
        g.setAttribute('aria-label', `Encostar ${NOME_DO_RAMO[ponta.ramo]}`);
        const vai = () => joga(escolhida, ponta.ramo);
        g.addEventListener('click', vai);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); vai(); } });
      }
      cabe({ x: vg.x - 0.7, y: vg.y - 0.7, w: 1.4, h: 1.4 });
      svg.appendChild(g);
    }

    // Enquadra tudo, mas sem deixar a pedra gigante no começo da mão.
    const largura = Math.max(14, caixa.x1 - caixa.x0 + 1);
    const altura = Math.max(8, caixa.y1 - caixa.y0 + 1);
    const cx = (caixa.x0 + caixa.x1) / 2, cy = (caixa.y0 + caixa.y1) / 2;
    svg.setAttribute('viewBox', `${cx - largura / 2} ${cy - altura / 2} ${largura} ${altura}`);
    svg.setAttribute('aria-label', `Mesa: pontas ${(mesa.pontas || []).map((p) => p.valor).join(', ')}; soma ${mesa.soma}.`);
  }

  // ---- a mão ---------------------------------------------------------------

  function desenhaMao() {
    const box = $('hand');
    box.innerHTML = '';
    const vw = v();
    const mao = [...(vw.you?.hand || [])].sort((a, b) => (a.a + a.b) - (b.a + b.b) || a.a - b.a);
    const vez = minhaVez();
    const jogaveis = new Set((vw.you?.jogadas || []).map((j) => j.pedraId));
    if (escolhida && !mao.some((p) => p.id === escolhida)) escolhida = null;
    // Na saída, a carroça já vem escolhida: é a única jogada.
    if (vez && !vw.mesa && vw.saida && !escolhida) escolhida = vw.saida;

    const fila = document.createElement('div');
    fila.className = 'dom-mao';
    for (const p of mao) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dom-pedra-mao';
      if (p.id === escolhida) b.classList.add('sel');
      if (vez && !jogaveis.has(p.id)) b.classList.add('apagada');
      b.setAttribute('aria-label', `Pedra ${txt(p)}${vez && !jogaveis.has(p.id) ? ', não encaixa' : ''}`);
      b.setAttribute('aria-pressed', String(p.id === escolhida));
      const s = el('svg', { viewBox: '-0.08 -0.08 1.16 2.2', 'aria-hidden': 'true' });
      s.appendChild(pedraSvg({
        x: 0, y: 0, w: 1, h: 2, eixo: [0, 1],
        casas: [{ x: 0.5, y: 0.5, valor: p.a }, { x: 0.5, y: 1.5, valor: p.b }],
      }));
      b.appendChild(s);
      b.onclick = () => {
        escolhida = escolhida === p.id ? null : p.id;
        ctx.render();
      };
      // Pedra que só tem um lugar: dois toques rápidos nela já jogam.
      b.ondblclick = () => {
        const js = jogadasDa(p.id);
        if (js.length === 1) joga(js[0].pedraId, js[0].ramo);
      };
      fila.appendChild(b);
    }
    box.appendChild(fila);
  }

  // ---- botões ----------------------------------------------------------------

  function botoes() {
    const vw = v();
    const vez = minhaVez();
    for (const id of ['btn-draw-deck', 'btn-draw-discard', 'btn-queimar', 'btn-baixar', 'btn-discard', 'btn-meld-discard', 'btn-cancel-mode', 'btn-claim']) $(id).hidden = true;
    const js = vez && escolhida ? jogadasDa(escolhida) : [];
    bJogar.hidden = !(vez && escolhida && js.length <= 1);
    if (!bJogar.hidden) {
      const p = vw.you.hand.find((x) => x.id === escolhida);
      bJogar.textContent = js.length ? `Jogar a ${txt(p)}` : `A ${txt(p)} não encaixa`;
      bJogar.classList.toggle('soft-disabled', !js.length);
    }
    const ramos = new Set(js.length > 1 ? js.map((j) => j.ramo) : []);
    const pontas = Object.fromEntries((vw.mesa?.pontas || []).map((p) => [p.ramo, p.valor]));
    for (const [ramo, b] of Object.entries(bRamos)) {
      b.hidden = !ramos.has(ramo);
      b.textContent = `${BOTAO_DO_RAMO[ramo]}${pontas[ramo] != null ? ` (${pontas[ramo]})` : ''}`;
    }
    const pode = vez && vw.you?.podePassar;
    bPassar.hidden = !pode;
    if (pode) {
      bPassar.textContent = vw.you.passeCusta ? `Passar (+${vw.you.passeCusta} para eles)` : 'Passar no escuro';
      bPassar.classList.toggle('btn-danger', !!vw.you.passeCusta);
      bPassar.classList.toggle('btn-ghost', !vw.you.passeCusta);
    }
  }

  // ---- assentos -------------------------------------------------------------

  function marcasDosAssentos() {
    const vw = v();
    const meu = meuTime();
    for (const [id, elA] of ctx.assentos) {
      const p = vw.players.find((x) => x.id === id);
      if (!p) continue;
      const marcas = elA.querySelector('.marcas');
      if (p.passou) marcas.prepend(marca('passou', 'm-off'));
      marcas.prepend(marca(p.time === meu ? 'parceiro' : 'contra', p.time === meu ? 'dom-parceiro' : 'dom-contra'));
      elA.classList.toggle('dom-dupla', p.time === meu);
      elA.setAttribute('aria-label', `${p.name}, ${p.time === meu ? 'seu parceiro' : 'da outra dupla'}, ${p.handCount} pedra${p.handCount === 1 ? '' : 's'}.`);
    }
  }

  function marca(texto, cls) {
    const e = document.createElement('span');
    e.className = cls;
    e.textContent = texto;
    return e;
  }

  function cabecalho() {
    const vw = v();
    $('round-label').textContent = `Dominó · Mão ${vw.round + 1}`;
    $('contract-label').textContent = vw.mesa ? `Pontas: ${vw.mesa.soma}` : 'Sai carroça';
  }

  // ---- fim de mão e de partida ---------------------------------------------

  function linhaDoTime(time) {
    const vw = v();
    const gente = vw.players.filter((p) => p.time === time);
    const caras = gente.map((p) => `<img class="avatar" src="${ctx.caraDoJogador(p.id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(p.id)}">`).join('');
    return `<tr class="${vw.vencedor === time ? 'winner' : ''}"><td><span class="quem">${caras}
        <span>${rotuloDoTime(time)} · ${ctx.escapeHTML(nomesDaDupla(time).join(' e '))}</span></span></td>
      <td class="num">${vw.times[time]}</td></tr>`;
  }

  function tabelaDoPlacar() {
    const meu = meuTime();
    return `<table class="score-table"><thead><tr><th>Dupla</th><th class="num">Pts</th></tr></thead>
      <tbody>${linhaDoTime(meu)}${linhaDoTime(1 - meu)}</tbody></table>`;
  }

  // As pedras que ficaram em cada mão, para conferir a conta da batida.
  function sobras(maos) {
    if (!maos) return '';
    const vw = v();
    const linhas = vw.players.map((p) => {
      const pedras = maos[p.id] || [];
      const total = pedras.reduce((n, x) => n + pontosDaPedra(x), 0);
      const mini = pedras.map((x) => `<span class="dom-mini">${x.a}|${x.b}</span>`).join('') || '<em>bateu</em>';
      return `<li><span class="dom-sobra-nome">${ctx.escapeHTML(nome(p.id))}</span>${mini}${pedras.length ? `<span class="dom-sobra-total">${total}</span>` : ''}</li>`;
    }).join('');
    return `<ul class="dom-sobras">${linhas}</ul>`;
  }

  function contaDaMao(lr) {
    if (!lr) return '';
    if (lr.motivo === 'batida') {
      return `${nome(lr.por)} bateu e marcou ${lr.pontos}: sobraram ${lr.resto} nas mãos da outra dupla.`;
    }
    if (lr.motivo === 'trancado') {
      return `${nome(lr.por)} trancou a mesa: ${lr.pontos} para ${lr.time === meuTime() ? 'nós' : 'eles'}.`;
    }
    return '';
  }

  let modalDaMao = null;
  function modalDeFase() {
    const vw = v();
    const chave = vw.phase === 'roundEnd' || vw.phase === 'gameEnd' ? `${vw.phase}:${vw.round}` : null;
    if (chave) {
      if (modalDaMao === chave) return;
      modalDaMao = chave;
      if (vw.phase === 'gameEnd') fimDaPartida(); else fimDaMao();
    } else if (modalDaMao !== null) {
      modalDaMao = null;
      ctx.closeModal();
    }
  }

  function fimDaMao() {
    const vw = v();
    const lr = vw.lastRound;
    const titulo = lr?.motivo === 'batida' ? (lr.por === eu() ? 'Você bateu!' : `${ctx.escapeHTML(nome(lr.por))} bateu!`)
      : lr?.motivo === 'trancado' ? 'Trancou!' : 'Fim da mão';
    const quem = lr?.motivo === 'batida' ? lr.por : null;
    ctx.showModal(
      `${quem ? `<div class="palco-vencedor"><img src="${ctx.figuraFeliz(quem)}" alt=""></div>` : ''}
       <h2>${titulo}</h2>
       <p>${ctx.escapeHTML(contaDaMao(lr))}</p>
       ${sobras(lr?.maos)}
       ${tabelaDoPlacar()}
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião continuar…</p>'}`,
      ctx.isHost() ? [{ label: 'Próxima mão', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'nextRound' }) }] : [],
    );
  }

  function fimDaPartida() {
    const vw = v();
    const ganhamos = vw.vencedor === meuTime();
    const dupla = vw.players.filter((p) => p.time === vw.vencedor);
    const lr = vw.lastRound;
    const acoes = ctx.isHost() ? [{ label: 'Jogar de novo', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'playAgain' }) }] : [];
    acoes.push({ label: 'Sair da sala', cls: 'btn-ghost', fn: ctx.saiDaSala });
    ctx.showModal(
      `<div class="palco-vencedor grande dom-vencedores">${dupla.map((p) => `<img src="${ctx.figuraFeliz(p.id)}" alt="">`).join('')}</div>
       <h2>${ganhamos ? 'Vocês ganharam!' : `${ctx.escapeHTML(nomesDaDupla(vw.vencedor).join(' e '))} ganharam!`}</h2>
       <p>${ctx.escapeHTML(contaDaMao(lr) || `A partida vai a ${vw.meta || META}.`)}</p>
       ${tabelaDoPlacar()}
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião decidir…</p>'}`,
      acoes,
    );
  }

  // ---- o que client.js chama -------------------------------------------------

  return {
    render() {
      cabecalho();
      ctx.renderOpponents();
      marcasDosAssentos();
      desenhaPlacar();
      desenhaMao();
      desenhaCobra();
      botoes();
      ctx.atualizaBanner();
      modalDeFase();
    },

    textoDaVez() {
      const vw = v();
      if (vw.phase !== 'play') return { minha: false, texto: '' };
      if (!minhaVez()) {
        const p = vw.players.find((x) => x.id === vw.turnId);
        return { minha: false, texto: `Vez de ${ctx.playerName(vw.turnId)}${p && p.time === meuTime() ? ' (parceiro)' : ''}…` };
      }
      const you = vw.you;
      if (!vw.mesa) {
        const s = you.hand.find((p) => p.id === vw.saida);
        return { minha: true, texto: `Você sai: jogue a ${s ? txt(s) : 'carroça'}.` };
      }
      if (!you.jogadas.length) {
        return { minha: true, texto: you.passeCusta ? `Sem pedra que encaixe: passe (+${you.passeCusta} para eles).` : 'Sem pedra que encaixe: passe.' };
      }
      if (escolhida && jogadasDa(escolhida).length > 1) return { minha: true, texto: 'Escolha a ponta: toque nela na mesa.' };
      return { minha: true, texto: you.podePassar ? 'Sua vez: jogue uma pedra — ou passe no escuro.' : 'Sua vez: escolha uma pedra que encaixe.' };
    },

    anuncia(ev) {
      const vw = v();
      switch (ev.e) {
        case 'roundStart':
          ctx.novaRodada();
          escolhida = null;
          modalDaMao = null;
          ultimaPedra = null;
          ctx.closeModal();
          if (ev.round > 0) ctx.toast(`🁫 Mão ${ev.round + 1}`);
          break;
        case 'abre': {
          const p = vw.you?.hand.find((x) => x.id === ev.pedraId);
          ctx.toast(ev.p === eu() ? `Você sai com a ${p ? txt(p) : 'carroça'}.` : `${nome(ev.p)} sai com carroça.`);
          break;
        }
        case 'jogou':
          if (ev.pts) {
            ctx.toast(`${ev.p === eu() ? 'Você marcou' : `${nome(ev.p)} marcou`} ${ev.pts}! (pontas: ${ev.soma})`);
            ctx.reage(ev.p, 'ponto');
          }
          break;
        case 'passou':
          if (!ev.escuro) {
            const quem = timeDe(ev.p) === meuTime() ? 'eles' : 'nós';
            ctx.toast(`${ev.p === eu() ? 'Você passou' : `${nome(ev.p)} passou`}: +10 para ${quem}.`);
          } else ctx.toast(`${ev.p === eu() ? 'Você passou' : `${nome(ev.p)} passou`} no escuro.`);
          ctx.reage(ev.p, 'passo');
          break;
        case 'bateu':
          ctx.toast(`🁫 ${ev.p === eu() ? 'Você bateu' : `${nome(ev.p)} bateu`}! +${ev.pts}`);
          ctx.reage(ev.p, 'bateu');
          break;
        case 'trancou':
          ctx.toast(`🔒 ${ev.p === eu() ? 'Você trancou' : `${nome(ev.p)} trancou`} a mesa: +40 para ${timeDe(ev.p) === meuTime() ? 'eles' : 'nós'}.`);
          ctx.reage(ev.p, 'trancou');
          break;
        default:
          break;
      }
    },

    mostraJogador(id) {
      const vw = v();
      const p = vw.players.find((x) => x.id === id);
      if (!p) return;
      const parceiro = p.time === meuTime();
      ctx.showModal(
        `<div id="oponente-topo" class="oponente-topo"></div>
         <h3>${ctx.escapeHTML(p.name)}${vw.turnId === p.id && vw.phase === 'play' ? ' — é a vez dele' : ''}</h3>
         <p>${parceiro ? 'Seu parceiro' : 'Da outra dupla'} · ${p.handCount} pedra${p.handCount === 1 ? '' : 's'} na mão</p>
         ${p.passou ? '<p>Passou desde a última pedra.</p>' : ''}
         ${p.desistiu ? '<p class="modal-hint">Saiu da partida — o robô joga o resto por ele.</p>' : ''}`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
      $('oponente-topo').appendChild(ctx.avatarEl(p.id, vw.players, 72));
    },

    placar() {
      const vw = v();
      ctx.showModal(
        `<h2>Placar</h2>
         ${tabelaDoPlacar()}
         <p class="modal-hint">A partida vai a ${vw.meta || META}. Marca a dupla de quem deixa as pontas num múltiplo de 5, de quem bate, e a outra dupla quando alguém passa ou tranca.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },

    regras() {
      ctx.showModal(
        `<h2>Como se joga o Dominó de ponto</h2>
         <p><strong>Duplas:</strong> 4 na mesa, quem senta de frente é o seu parceiro. 7 pedras para cada um.</p>
         <p><strong>Saída:</strong> toda mão abre com carroça. Na primeira, quem tem a 6|6; depois, quem bateu sai com a maior carroça que tiver.</p>
         <p><strong>A cruz:</strong> a primeira carroça abre para os quatro lados — em cima e embaixo depois que esquerda e direita têm pedra.</p>
         <p><strong>Pontos:</strong> depois de cada pedra, somam-se as pontas. Deu múltiplo de 5, a sua dupla marca a soma. Carroça na ponta conta dobrado.</p>
         <p><strong>Passe:</strong> sem pedra que encaixe, passe — e o primeiro passe dá <strong>10</strong> à outra dupla. Depois de um passe, os seguintes são no escuro: não pagam e valem mesmo tendo pedra.</p>
         <p><strong>Batida:</strong> quem fica sem pedra marca o que sobrou na mão dos dois adversários, arredondado de 5 em 5.</p>
         <p><strong>Trancou:</strong> quem tranca a mesa (ninguém mais tem jogada) dá <strong>40</strong> à outra dupla.</p>
         <p class="modal-hint">Ganha a dupla que chegar a ${META}.</p>`,
        [{ label: 'Entendi', cls: 'btn-primary', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
  };
}
