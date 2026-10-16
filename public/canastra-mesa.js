// ============================================================================
// Canastra — a mesa 2D. Este arquivo (e o canastra.css) só é baixado quando
// alguém escolhe o modo ou entra numa sala dele: quem joga Caçamba nunca paga
// por ele.
//
// Não desenha mesa nova: usa o cenário, os assentos, o leque da mão, as cartas
// e os modais do Caçamba, que chegam pelo `ctx` (ver contextoDaMesa em
// client.js). O que é daqui: o monte, o lixo, os jogos dos dois lados, o
// RASCUNHO da baixada, os botões, os avisos e o placar.
//
// O RASCUNHO. Depois que o seu lado abriu, cada jogo vai direto para a mesa:
// escolha as cartas e toque em "Baixar jogo novo" ou no ＋ de um jogo seu. Mas
// há duas baixadas que só valem inteiras, e essas se montam aqui antes de
// confirmar: a ABERTURA (os jogos somam o mínimo de uma vez) e o LIXO (a carta
// de cima entra na sua mão de mentira, já escolhida, e tem que ir para um
// jogo). Nada disso sai do aparelho até você confirmar.
// ============================================================================

import { analisaJogo, nomeCurto, somaDe, somaNaAbertura, regrasDa, NOME_DA_VARIANTE, META } from '/shared/canastra.js';

const cartas = (n) => `${n} carta${n === 1 ? '' : 's'}`;
const pts = (n) => Number(n || 0).toLocaleString('pt-BR');
const NOME_DA_CANASTRA = { limpa: 'canastra limpa', suja: 'canastra suja', 500: 'canastra de 500', mil: 'canastra de mil' };
const SELO_DA_CANASTRA = { limpa: 'limpa', suja: 'suja', 500: '500', mil: 'mil' };

export function criaMesaCanastra(ctx) {
  const { $ } = ctx;

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/canastra.css';
  document.head.appendChild(css);

  // ---- o meio da mesa: monte, lixo e os jogos dos dois lados ----------------
  const centro = document.createElement('div');
  centro.id = 'cn-centro';
  centro.className = 'cn-centro';
  const topo = document.createElement('div');
  topo.className = 'cn-topo';
  const monte = document.createElement('button');
  monte.type = 'button';
  monte.className = 'cn-monte';
  monte.innerHTML = '<span class="card back mini" aria-hidden="true"></span><span class="cn-monte-txt"></span>';
  const lixo = document.createElement('button');
  lixo.type = 'button';
  lixo.className = 'cn-lixo';
  lixo.innerHTML = '<span class="cn-lixo-carta"></span><span class="cn-lixo-txt"></span>';
  const info = document.createElement('span');
  info.className = 'cn-info';
  topo.append(monte, lixo, info);
  const ladoEl = (cls) => {
    const sec = document.createElement('section');
    sec.className = `cn-lado ${cls}`;
    const h = document.createElement('header');
    h.className = 'cn-lado-cab';
    const jogos = document.createElement('div');
    jogos.className = 'cn-jogos';
    sec.append(h, jogos);
    return sec;
  };
  const eles = ladoEl('eles');
  const nos = ladoEl('nos');
  centro.append(topo, eles, nos);
  $('screen-game').querySelector('.table-center').prepend(centro);

  const barra = $('action-bar');
  const botao = (id, texto, cls = '') => {
    const b = document.createElement('button');
    b.id = id; b.type = 'button'; b.className = `btn cn-btn ${cls}`; b.textContent = texto; b.hidden = true;
    barra.insertBefore(b, $('btn-sort'));
    return b;
  };
  const bComprar = botao('cn-comprar', 'Comprar do monte', 'btn-primary');
  const bLixo = botao('cn-lixo', 'Pegar o lixo');
  const bNovo = botao('cn-novo', 'Baixar jogo novo', 'btn-primary');
  const bConfirmar = botao('cn-confirmar', 'Confirmar', 'btn-primary');
  const bDesfazer = botao('cn-desfazer', 'Desfazer', 'btn-ghost');
  const bCancelar = botao('cn-cancelar', 'Cancelar', 'btn-ghost');
  const bDescartar = botao('cn-descartar', 'Descartar', 'btn-danger');

  const v = () => ctx.view;
  const nome = (id) => ctx.playerName(id);
  const sel = () => ctx.selected;
  const naVez = () => v()?.phase === 'draw' || v()?.phase === 'play';
  const minhaVez = () => naVez() && v()?.turnId === ctx.me();
  const meuLado = () => v()?.you?.lado ?? 0;
  const mano = () => v()?.formato === '1v1';
  const abriu = () => v().lados[meuLado()].jogos.length > 0;
  const topoDoLixo = () => { const l = v()?.lixo || []; return l.length ? l[l.length - 1] : null; };
  const variante = () => v()?.variante || 'convencional';
  const maoDeVerdade = () => v()?.you?.hand || [];
  const rotuloDoLado = (i) => (i === meuLado() ? (mano() ? 'Você' : 'Nós') : (mano() ? 'Rival' : 'Eles'));
  const parceiro = (id) => !mano() && id !== ctx.me() && v().players.find((p) => p.id === id)?.lado === meuLado();

  // ---- o rascunho -------------------------------------------------------------
  // { chave, lixo: carta | null, novos: [[cards]], encaixes: Map(id → [cards]), passos }
  let rasc = null;
  let enviadoEm = 0;
  const chaveDaVez = () => `${v().round}/${v().turnNo}/${v().phase}`;
  const abreRascunho = (cartaDoLixo = null) => {
    rasc = { chave: chaveDaVez(), lixo: cartaDoLixo, novos: [], encaixes: new Map(), passos: [] };
  };
  // A baixada se monta antes (abertura e lixo) ou vai direto para a mesa?
  const acumula = () => !!rasc?.lixo || (v().phase === 'play' && !abriu());
  const noRascunho = () => new Set(rasc ? [...rasc.novos.flat(), ...[...rasc.encaixes.values()].flat()].map((c) => c.id) : []);
  const pendente = () => !!rasc && (rasc.novos.length > 0 || rasc.encaixes.size > 0);

  function garanteRascunho() {
    if (!minhaVez() || (rasc && rasc.chave !== chaveDaVez())) { rasc = null; return; }
    // a baixada foi aceita: as cartas dela saíram da mão de verdade
    if (pendente() && !rasc.lixo) {
      const mao = new Set(maoDeVerdade().map((c) => c.id));
      if ([...noRascunho()].some((id) => !mao.has(id))) rasc = null;
    }
  }

  function maoDoRascunho() {
    const mao = maoDeVerdade();
    if (!rasc) return mao;
    const fora = noRascunho();
    const lista = mao.filter((c) => !fora.has(c.id));
    if (rasc.lixo && !fora.has(rasc.lixo.id)) lista.push(rasc.lixo);
    return lista;
  }
  const escolhidas = () => maoDoRascunho().filter((c) => sel().has(c.id));

  // O que a baixada montada soma (é o que conta para abrir).
  // o que conta para abrir: os jogos novos (na do 3, o coringa não conta; o 2
  // na casa dele é carta normal e conta)
  const somaDoRascunho = () => (rasc ? somaNaAbertura(rasc.novos, variante()) : 0);
  const regras = () => regrasDa(variante());
  const semMorto = () => !!v()?.semMorto;
  const usouOLixo = () => !!rasc?.lixo && noRascunho().has(rasc.lixo.id);

  const foto = () => ({ novos: rasc.novos.map((j) => [...j]), encaixes: new Map([...rasc.encaixes].map(([k, cs]) => [k, [...cs]])) });
  function passo(fn) {
    rasc.passos.push(foto());
    fn();
    sel().clear();
    ctx.render();
  }

  // Dedo nervoso: a mesma tela não manda duas jogadas seguidas. Chegou estado
  // novo do servidor (comprou, baixou), a trava solta na hora.
  let enviadoNaVisao = null;
  function envia(acao) {
    if (v() === enviadoNaVisao && Date.now() - enviadoEm < 1500) return;
    enviadoEm = Date.now();
    enviadoNaVisao = v();
    ctx.sendAction(acao);
  }
  const idsDe = (cs) => cs.map((c) => c.id);

  function novoJogo() {
    const cs = escolhidas();
    if (!cs.length) { ctx.toast('Escolha na mão as cartas do jogo.'); return; }
    const a = analisaJogo(cs, variante(), { formacao: true });
    if (!a.ok) { ctx.toast(a.motivo); return; }
    if (!acumula()) { sel().clear(); envia({ a: 'baixar', jogos: [idsDe(cs)] }); return; }
    if (!rasc) abreRascunho();
    passo(() => rasc.novos.push(a.cards));
  }

  // alvo: { id } é um jogo do seu lado na mesa; { novo: i } é um do rascunho
  function poeNoJogo(alvo) {
    const cs = escolhidas();
    if (!cs.length) return;
    if (alvo.novo != null) {
      const a = analisaJogo([...rasc.novos[alvo.novo], ...cs], variante(), { formacao: true });
      if (!a.ok) { ctx.toast(a.motivo); return; }
      passo(() => { rasc.novos[alvo.novo] = a.cards; });
      return;
    }
    const j = v().lados[meuLado()].jogos.find((x) => x.id === alvo.id);
    if (!j) return;
    if (rasc?.lixo && regras().lixo.soJogoNovo && cs.some((c) => c.id === rasc.lixo.id)) {
      ctx.toast('Na do 3, a carta do lixo forma um jogo novo: junte cartas da mão e toque em “Baixar jogo novo”.');
      return;
    }
    const a = analisaJogo([...j.cards, ...(rasc?.encaixes.get(j.id) || []), ...cs], variante());
    if (!a.ok) { ctx.toast(a.motivo); return; }
    if (!acumula()) { sel().clear(); envia({ a: 'baixar', encaixes: [{ jogo: j.id, ids: idsDe(cs) }] }); return; }
    if (!rasc) abreRascunho();
    passo(() => rasc.encaixes.set(j.id, [...(rasc.encaixes.get(j.id) || []), ...cs]));
  }

  function confirma() {
    if (!pendente()) return;
    const jogos = rasc.novos.map(idsDe);
    const encaixes = [...rasc.encaixes].map(([jogo, cs]) => ({ jogo, ids: idsDe(cs) }));
    if (rasc.lixo) {
      if (!usouOLixo()) { ctx.toast('A carta de cima do lixo tem que ir para um jogo.'); return; }
      envia({ a: 'pegarLixo', jogos, encaixes });
    } else {
      envia({ a: 'baixar', jogos, encaixes });
    }
  }

  function pegaLixo() {
    if (!minhaVez() || v().phase !== 'draw') { mostraLixo(); return; }
    const t = topoDoLixo();
    if (!t) { ctx.toast('O lixo está vazio: compre do monte.'); return; }
    if (v().lixoTrancado) { ctx.toast('O lixo está trancado: compre do monte.'); return; }
    if (regras().lixo.soDepoisDeAbrir && !abriu()) {
      ctx.toast(`Na do 3, só pega o lixo quem já abriu com ${v().minimoDaAbertura} pontos.`);
      return;
    }
    abreRascunho(t);
    sel().clear();
    sel().add(t.id);   // a carta do lixo já vem escolhida: junte as da mão
    ctx.render();
  }
  function cancela() {
    rasc = null;
    sel().clear();
    ctx.render();
  }
  function desfaz() {
    const f = rasc?.passos.pop();
    if (!f) return;
    rasc.novos = f.novos; rasc.encaixes = f.encaixes;
    sel().clear();
    ctx.render();
  }
  function compra() {
    if (!minhaVez() || v().phase !== 'draw') return;
    rasc = null;
    sel().clear();
    envia({ a: 'comprar' });
  }
  function descarta() {
    const cs = escolhidas();
    if (cs.length !== 1) { ctx.toast('Escolha uma carta só para descartar.'); return; }
    if (pendente()) { ctx.toast('Confirme ou cancele a baixada antes de descartar.'); return; }
    sel().clear();
    envia({ a: 'descartar', id: cs[0].id });
  }

  bComprar.onclick = compra;
  monte.onclick = compra;
  bLixo.onclick = pegaLixo;
  lixo.onclick = pegaLixo;
  bNovo.onclick = novoJogo;
  bConfirmar.onclick = confirma;
  bDesfazer.onclick = desfaz;
  bCancelar.onclick = cancela;
  bDescartar.onclick = descarta;

  // ---- desenho ----------------------------------------------------------------

  function cabecalho() {
    const vw = v();
    $('round-label').textContent = `${NOME_DA_VARIANTE[vw.variante] || 'Canastra'} · Rodada ${vw.round + 1}`;
    const eu = meuLado();
    $('contract-label').textContent = `${rotuloDoLado(eu)} ${pts(vw.lados[eu].pontos)} × ${pts(vw.lados[1 - eu].pontos)} ${rotuloDoLado(1 - eu)}`;
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
      if (naVez() && p.handCount <= 2) marcas.prepend(marca(p.handCount === 1 ? 'última carta' : '2 cartas', 'm-gold'));
      if (p.pegouMorto && !semMorto()) marcas.prepend(marca('pegou o morto', 'cn-marca-morto'));
      el.classList.toggle('cn-parceiro', parceiro(id));
      const quem = parceiro(id) ? 'seu parceiro' : mano() ? 'seu rival' : 'da outra dupla';
      el.setAttribute('aria-label', `${p.name}, ${quem}, ${cartas(p.handCount)}${p.pegouMorto && !semMorto() ? ', já pegou o morto' : ''}.`);
    }
  }

  function desenhaTopo() {
    const vw = v();
    const n = vw.monte;
    monte.querySelector('.cn-monte-txt').textContent = n ? `${n} no monte` : 'monte vazio';
    monte.classList.toggle('vazio', !n);
    const posso = minhaVez() && vw.phase === 'draw' && !rasc;
    monte.disabled = !posso;
    monte.setAttribute('aria-label', posso ? (n ? `Comprar uma carta. ${n} no monte.` : 'Monte vazio: comprar fecha a rodada.') : `${n} cartas no monte.`);

    const t = topoDoLixo();
    const slot = lixo.querySelector('.cn-lixo-carta');
    slot.innerHTML = '';
    if (t) slot.appendChild(ctx.cardEl(t, true));
    else slot.innerHTML = '<span class="card empty mini" aria-hidden="true"></span>';
    const qtd = vw.lixo.length;
    lixo.querySelector('.cn-lixo-txt').textContent = !qtd ? 'lixo vazio' : vw.lixoTrancado ? `trancado · ${qtd}` : `lixo · ${qtd}`;
    lixo.classList.toggle('trancado', !!vw.lixoTrancado);
    lixo.classList.toggle('escolhido', !!rasc?.lixo);
    lixo.setAttribute('aria-label', `Lixo com ${cartas(qtd)}${t ? `, em cima ${nomeCurto(t)}` : ''}${vw.lixoTrancado ? ', trancado' : ''}. ${minhaVez() && vw.phase === 'draw' ? 'Toque para pegar.' : 'Toque para ver.'}`);

    // a linha de informação: o que falta para abrir, ou o morto
    const eu = vw.you;
    let txt = '';
    if (eu && naVez()) {
      if (!abriu()) txt = `Para abrir: ${vw.minimoDaAbertura} pts`;
      else if (!eu.pegouMorto && !vw.semMorto) txt = 'Seu morto espera';
      else txt = vw.lados[meuLado()].jogos.some((j) => j.canastra && j.limpa) ? 'Pode bater' : 'Falta canastra limpa';
    }
    info.textContent = txt;
    info.hidden = !txt;
  }

  function cartaDaMesa(c, cls = '') {
    const el = ctx.cardEl(c, true);
    if (cls) el.classList.add(cls);
    return el;
  }

  // O ＋ diz, pela cor, se as escolhidas cabem no jogo.
  function alvo(cabe, rotulo, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cn-por${cabe ? ' cabe' : ''}`;
    b.textContent = '＋';
    b.setAttribute('aria-label', rotulo);
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    return b;
  }

  function jogoEl(cards, { canastra = null, limpa = false, pendentes = [], extra = '' } = {}) {
    const el = document.createElement('div');
    el.className = `cn-jogo${canastra ? ` canastra ${limpa ? 'limpa' : 'suja'}` : ''}${cards.length + pendentes.length > 9 ? ' longo' : ''} ${extra}`;
    for (const c of cards) el.appendChild(cartaDaMesa(c));
    for (const c of pendentes) el.appendChild(cartaDaMesa(c, 'pendente'));
    if (canastra) {
      const s = document.createElement('span');
      s.className = 'cn-selo';
      s.textContent = SELO_DA_CANASTRA[canastra];
      el.appendChild(s);
    }
    el.setAttribute('aria-label', `${canastra ? `${NOME_DA_CANASTRA[canastra]}: ` : ''}${[...cards, ...pendentes].map(nomeCurto).join(' ')}`);
    return el;
  }

  function desenhaLado(sec, i) {
    const vw = v();
    const L = vw.lados[i];
    const meu = i === meuLado();
    const cab = sec.querySelector('.cn-lado-cab');
    const box = sec.querySelector('.cn-jogos');
    const rolagem = box.scrollTop;
    cab.innerHTML = '';
    const titulo = document.createElement('strong');
    titulo.textContent = rotuloDoLado(i);
    const placar = document.createElement('span');
    placar.className = 'cn-pontos';
    placar.textContent = `${pts(L.pontos)} pts`;
    cab.append(titulo, placar);
    if (L.tresVermelhos.length) {
      const tres = document.createElement('span');
      tres.className = 'cn-tres';
      tres.title = `${L.tresVermelhos.length} × 3 vermelho: +${L.tresVermelhos.length * 100}`;
      for (const c of L.tresVermelhos) tres.appendChild(cartaDaMesa(c));
      cab.appendChild(tres);
    }
    const nCan = L.jogos.filter((j) => j.canastra).length;
    if (nCan) cab.appendChild(marca(`${nCan} canastra${nCan === 1 ? '' : 's'}`, 'cn-ncan'));

    box.innerHTML = '';
    const escolhidasAgora = meu && minhaVez() ? escolhidas() : [];
    const podeMexer = meu && minhaVez() && (vw.phase === 'play' || !!rasc?.lixo);
    for (const j of L.jogos) {
      const pend = meu && rasc ? (rasc.encaixes.get(j.id) || []) : [];
      const a = pend.length ? analisaJogo([...j.cards, ...pend], vw.variante) : null;
      const el = jogoEl(j.cards, { canastra: a ? a.canastra : j.canastra, limpa: a ? a.limpa : j.limpa, pendentes: pend, extra: pend.length ? 'mexido' : '' });
      if (podeMexer && escolhidasAgora.length) {
        const cabe = analisaJogo([...j.cards, ...pend, ...escolhidasAgora], vw.variante).ok;
        el.appendChild(alvo(cabe, `Pôr ${escolhidasAgora.map(nomeCurto).join(' ')} neste jogo${cabe ? ' (cabe)' : ''}`, () => poeNoJogo({ id: j.id })));
        el.classList.add('alvo');
        el.onclick = () => poeNoJogo({ id: j.id });
      }
      box.appendChild(el);
    }
    if (meu && rasc) {
      rasc.novos.forEach((cards, k) => {
        const a = analisaJogo(cards, vw.variante, { formacao: true });
        const el = jogoEl(a.cards, { canastra: a.canastra, limpa: a.limpa, extra: 'rascunho' });
        if (escolhidasAgora.length) {
          const cabe = analisaJogo([...cards, ...escolhidasAgora], vw.variante, { formacao: true }).ok;
          el.appendChild(alvo(cabe, `Pôr ${escolhidasAgora.map(nomeCurto).join(' ')} neste jogo novo`, () => poeNoJogo({ novo: k })));
          el.onclick = () => poeNoJogo({ novo: k });
        }
        box.appendChild(el);
      });
    }
    if (!box.children.length) {
      const vazio = document.createElement('p');
      vazio.className = 'cn-vazio';
      vazio.textContent = meu
        ? (naVez() ? `Ainda não abriu: a primeira baixada soma ${vw.minimoDaAbertura} pontos.` : '')
        : (naVez() ? 'Ainda não abriu.' : '');
      box.appendChild(vazio);
    }
    box.scrollTop = rolagem;
  }

  function botoes() {
    for (const id of ['btn-draw-deck', 'btn-draw-discard', 'btn-queimar', 'btn-baixar', 'btn-discard', 'btn-meld-discard', 'btn-cancel-mode']) $(id).hidden = true;
    for (const b of [bComprar, bLixo, bNovo, bConfirmar, bDesfazer, bCancelar, bDescartar]) b.hidden = true;
    if (!minhaVez()) return;
    const vw = v();
    const n = escolhidas().length;
    if (vw.phase === 'draw' && !rasc) {
      bComprar.hidden = false;
      bComprar.textContent = vw.monte ? 'Comprar do monte' : 'Monte vazio: fechar a rodada';
      bLixo.hidden = false;
      bLixo.classList.toggle('soft-disabled', !vw.lixo.length || vw.lixoTrancado || (regras().lixo.soDepoisDeAbrir && !abriu()));
      return;
    }
    bNovo.hidden = !n;
    bNovo.classList.toggle('soft-disabled', !analisaJogo(escolhidas(), vw.variante, { formacao: true }).ok);
    if (rasc?.lixo || pendente()) {
      bConfirmar.hidden = false;
      const soma = somaDoRascunho();
      const falta = !abriu() ? Math.max(0, vw.minimoDaAbertura - soma) : 0;
      bConfirmar.textContent = rasc.lixo
        ? `Levar o lixo (${cartas(vw.lixo.length)})`
        : `Abrir com ${soma} de ${vw.minimoDaAbertura}`;
      bConfirmar.classList.toggle('soft-disabled', !pendente() || falta > 0 || (rasc.lixo && !usouOLixo()));
      bDesfazer.hidden = !rasc.passos.length;
      bCancelar.hidden = false;
      bCancelar.textContent = rasc.lixo ? 'Não pegar o lixo' : 'Recomeçar';
      return;
    }
    if (vw.phase === 'play') {
      bDescartar.hidden = n !== 1;
    }
  }

  // ---- fim de rodada e fim de partida ------------------------------------------

  function quem(id) {
    return `<span class="quem">
        <img class="avatar" src="${ctx.caraDoJogador(id)}" alt="" width="26" height="26" style="--anel:${ctx.corDoJogador(id)}">
        <span>${ctx.escapeHTML(nome(id))}</span></span>`;
  }

  // A conta da rodada, lado a lado: o seu lado sempre na primeira coluna.
  function tabelaDaConta(lr) {
    const eu = meuLado();
    const ordem = [eu, 1 - eu].map((i) => lr.lados.find((l) => l.lado === i));
    const do3 = v().variante === 'do3';
    // o lado que ficou sem canastra limpa na do 3 leva −500 cravado: as outras
    // linhas dele não contam, e aparecem riscadas
    const celula = (l, n) => `<td class="num${l.cravado ? ' cn-riscado' : ''}">${n > 0 ? '+' : ''}${pts(n)}</td>`;
    const linha = (rotulo, campo, sempre = false) => {
      if (!sempre && ordem.every((l) => !l[campo])) return '';
      return `<tr><td>${rotulo}</td>${ordem.map((l) => celula(l, l[campo])).join('')}</tr>`;
    };
    const semLimpa = ordem.some((l) => l.cravado)
      ? `<tr class="cn-cravado"><td>Sem canastra limpa</td>${ordem.map((l) => `<td class="num">${l.cravado ? pts(l.total) : ''}</td>`).join('')}</tr>`
      : '';
    return `<table class="score-table cn-conta"><thead><tr><th></th>${ordem.map((l) => `<th class="num">${rotuloDoLado(l.lado)}</th>`).join('')}</tr></thead><tbody>
      ${linha('Cartas na mesa', 'mesa', true)}
      ${linha('Canastras', 'canastras')}
      ${linha('Batida', 'batida')}
      ${do3 ? linha('3 vermelho', 'tres') : ''}
      ${linha('Cartas na mão', 'mao', true)}
      ${linha('Morto na mesa', 'mortos')}
      ${semLimpa}
      <tr class="cn-total"><td>Na rodada</td>${ordem.map((l) => `<td class="num">${l.total > 0 ? '+' : ''}${pts(l.total)}</td>`).join('')}</tr>
      <tr class="cn-placar"><td>Placar</td>${ordem.map((l) => `<td class="num">${pts(l.pontos)}</td>`).join('')}</tr>
    </tbody></table>`;
  }

  function sobras(lr) {
    const linhas = lr.maos.filter((m) => m.cards.length || (!m.pegouMorto && !semMorto())).map((m) => {
      // o ︎ pede o naipe como LETRA: sem ele o celular troca ♥ por emoji
      const mini = m.cards.map((c) => `<span class="cn-sobra${c.suit === 1 || c.suit === 2 ? ' red' : ''}">${ctx.escapeHTML(nomeCurto(c))}︎</span>`).join('');
      return `<tr><td>${quem(m.id)}</td><td class="cn-sobras">${mini || '<em>nada</em>'}${m.pegouMorto || semMorto() ? '' : ' <em class="cn-sem-morto">morto na mesa</em>'}</td></tr>`;
    }).join('');
    return linhas ? `<table class="score-table"><thead><tr><th>Ficou na mão</th><th></th></tr></thead><tbody>${linhas}</tbody></table>` : '';
  }

  function fimDaRodada() {
    const vw = v();
    const lr = vw.lastRound;
    if (!lr) return;
    const eu = ctx.me();
    const titulo = lr.motivo === 'bateu'
      ? (lr.por === eu ? 'Você bateu!' : `${ctx.escapeHTML(nome(lr.por))} bateu!`)
      : 'O monte acabou';
    ctx.showModal(
      `${lr.por ? `<div class="palco-vencedor"><img src="${ctx.figuraFeliz(lr.por)}" alt=""></div>` : ''}
       <h2>${titulo}</h2>
       ${tabelaDaConta(lr)}
       ${sobras(lr)}
       <p class="modal-hint">A partida vai a ${pts(vw.meta || META)}.</p>
       ${ctx.isHost() ? '' : '<p style="margin-top:10px">Esperando o anfitrião começar a próxima rodada…</p>'}`,
      ctx.isHost() ? [{ label: 'Próxima rodada', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'nextRound' }) }] : [],
    );
  }

  function fimDaPartida() {
    const vw = v();
    const lr = vw.lastRound;
    const ganhou = vw.vencedor === meuLado();
    const vencedores = vw.players.filter((p) => p.lado === vw.vencedor);
    const titulo = mano()
      ? (ganhou ? 'Você ganhou a partida!' : `${ctx.escapeHTML(vencedores[0]?.name || '')} ganhou a partida`)
      : (ganhou ? 'Nós ganhamos a partida!' : 'Eles ganharam a partida');
    const acoes = ctx.isHost() ? [{ label: 'Jogar de novo', cls: 'btn-primary', fn: () => ctx.sendMsg({ t: 'playAgain' }) }] : [];
    acoes.push({ label: 'Sair da sala', cls: 'btn-ghost', fn: ctx.saiDaSala });
    ctx.showModal(
      `<div class="palco-vencedor grande cn-vencedores">${vencedores.map((p) => `<img src="${ctx.figuraFeliz(p.id)}" alt="">`).join('')}</div>
       <h2>${titulo}</h2>
       ${lr ? tabelaDaConta(lr) : ''}`,
      acoes,
    );
  }

  let modalDaFase = null;
  function modalDeFase() {
    const vw = v();
    const chave = vw.phase === 'roundEnd' || vw.phase === 'gameEnd' ? `${vw.phase}:${vw.round}` : null;
    if (chave) {
      if (modalDaFase === chave) return;
      modalDaFase = chave;
      if (vw.phase === 'gameEnd') fimDaPartida(); else fimDaRodada();
    } else if (modalDaFase !== null) {
      modalDaFase = null;
      ctx.closeModal();
    }
  }

  function mostraLixo() {
    const l = v()?.lixo || [];
    if (!l.length) { ctx.toast('O lixo está vazio.'); return; }
    ctx.showModal(
      `<h3>Lixo · ${cartas(l.length)}</h3>
       <div id="cn-lixo-todo" class="cn-lixo-todo"></div>
       <p class="modal-hint">A de cima é a última. Quem pega leva o bolo inteiro${v().variante === 'do3' ? ', e o 3 preto, o 2 ou o coringa em cima trancam o lixo para o seguinte' : ''}.</p>`,
      [{ label: 'Fechar', fn: ctx.closeModal }],
      ctx.closeModal,
    );
    const box = $('cn-lixo-todo');
    for (const c of l) box.appendChild(ctx.cardEl(c, true));
  }

  // ---- o que client.js chama ------------------------------------------------

  return {
    render() {
      garanteRascunho();
      // escolha que não existe mais (carta foi para a mesa, rodada nova)
      const existem = new Set(maoDoRascunho().map((c) => c.id));
      for (const id of [...sel()]) if (!existem.has(id)) sel().delete(id);
      cabecalho();
      ctx.renderOpponents();
      marcasDosAssentos();
      desenhaTopo();
      const eu = meuLado();
      desenhaLado(eles, 1 - eu);
      desenhaLado(nos, eu);
      ctx.renderHand();
      botoes();
      ctx.atualizaBanner();
      modalDeFase();
    },

    // a mão como ela aparece: sem o que já está no rascunho, e com a carta do
    // lixo enquanto você monta o jogo que a leva
    maoDoRascunho,

    tocaNaMao(card) {
      const s = sel();
      if (s.has(card.id)) s.delete(card.id); else s.add(card.id);
      ctx.render();
    },

    textoDaVez() {
      const vw = v();
      if (!naVez()) return { minha: false, texto: '' };
      if (!minhaVez()) {
        return { minha: false, texto: parceiro(vw.turnId) ? `Vez do seu parceiro, ${nome(vw.turnId)}…` : `Vez de ${nome(vw.turnId)}…` };
      }
      if (vw.phase === 'draw' && !rasc) {
        if (vw.lixoTrancado) return { minha: true, texto: 'Sua vez: o lixo está trancado, compre do monte.' };
        if (regras().lixo.soDepoisDeAbrir && !abriu()) return { minha: true, texto: `Sua vez: compre do monte (o lixo é de quem já abriu com ${vw.minimoDaAbertura}).` };
        return { minha: true, texto: 'Sua vez: compre do monte ou pegue o lixo.' };
      }
      if (rasc?.lixo) {
        if (!usouOLixo()) {
          return { minha: true, texto: regras().lixo.soJogoNovo
            ? 'Junte cartas da mão à do lixo e toque em “Baixar jogo novo”: ela forma um jogo novo.'
            : 'Junte cartas da mão à do lixo e toque em “Baixar jogo novo” — ou no ＋ de um jogo seu.' };
        }
        if (!abriu() && somaDoRascunho() < vw.minimoDaAbertura) return { minha: true, texto: `Para abrir com o lixo: ${somaDoRascunho()} de ${vw.minimoDaAbertura} pontos.` };
        return { minha: true, texto: 'Tudo certo: confirme para levar o lixo.' };
      }
      if (!abriu()) {
        const soma = somaDoRascunho();
        return { minha: true, texto: pendente()
          ? `Abertura: ${soma} de ${vw.minimoDaAbertura} pontos.${soma >= vw.minimoDaAbertura ? ' Pode confirmar.' : ''}`
          : `Abra com ${vw.minimoDaAbertura} pontos de uma vez, ou descarte uma carta.` };
      }
      const n = escolhidas().length;
      if (n) return { minha: true, texto: n === 1 ? 'Descarte essa carta ou leve-a ao ＋ de um jogo seu.' : 'Baixe como jogo novo ou toque no ＋ de um jogo seu.' };
      return { minha: true, texto: 'Baixe o que quiser e descarte uma carta para passar a vez.' };
    },

    anuncia(ev) {
      const eu = ctx.me();
      const quemFez = (id) => (id === eu ? 'Você' : nome(id));
      switch (ev.e) {
        case 'roundStart':
          rasc = null;
          ctx.novaRodada();
          modalDaFase = null;
          ctx.closeModal();
          ctx.toast(ev.first === eu ? 'Você abre a rodada.' : `${nome(ev.first)} abre a rodada.`);
          break;
        case 'pegouLixo':
          if (ev.p !== eu) ctx.toast(`${nome(ev.p)} levou o lixo (${cartas(ev.n)}).`);
          ctx.reage(ev.p, 'lixo');
          break;
        case 'baixou':
          if (ev.p !== eu) ctx.toast(`${nome(ev.p)} baixou ${cartas(ev.n)}.`);
          ctx.reage(ev.p, 'baixou');
          break;
        case 'canastra':
          ctx.toast(`${quemFez(ev.p)} fechou ${NOME_DA_CANASTRA[ev.tipo]}!`);
          ctx.reage(ev.p, 'canastra');
          break;
        case 'morto':
          ctx.toast(ev.p === eu
            ? (ev.direta ? 'Você pegou o morto: siga jogando.' : 'Você pegou o morto: ele é a sua mão na próxima vez.')
            : `${nome(ev.p)} pegou o morto.`);
          ctx.reage(ev.p, 'morto');
          break;
        case 'tresVermelho':
          ctx.toast(`${quemFez(ev.p)} baixou ${ev.n > 1 ? `${ev.n} 3 vermelhos` : 'um 3 vermelho'}: +${ev.n * 100}.`);
          break;
        case 'descartou':
          if (ev.tranca && ev.p !== eu) ctx.toast(`${nome(ev.p)} trancou o lixo.`);
          break;
        case 'bateu':
          ctx.toast(ev.p === eu ? 'Você bateu!' : `${nome(ev.p)} bateu!`);
          ctx.reage(ev.p, 'bateu');
          break;
        case 'semMonte':
          ctx.toast('O monte acabou: fim da rodada.');
          break;
      }
    },

    mostraJogador(id) {
      const vw = v();
      const p = vw.players.find((x) => x.id === id);
      if (!p) return;
      const quemE = parceiro(id) ? 'Seu parceiro' : mano() ? 'Seu rival' : 'Da outra dupla';
      ctx.showModal(
        `<div id="oponente-topo" class="oponente-topo"></div>
         <h3>${ctx.escapeHTML(p.name)}${vw.turnId === id && naVez() ? ' — é a vez dele' : ''}</h3>
         <p>${quemE} · ${cartas(p.handCount)} na mão</p>
         ${vw.semMorto ? '' : `<p>${p.pegouMorto ? 'Já pegou o morto.' : 'O morto dele ainda está na mesa.'}</p>`}`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
      $('oponente-topo').appendChild(ctx.avatarEl(p.id, vw.players, 72));
    },

    placar() {
      const vw = v();
      const eu = meuLado();
      const linhas = [eu, 1 - eu].map((i) => {
        const L = vw.lados[i];
        const quemSao = vw.players.filter((p) => p.lado === i).map((p) => quem(p.id)).join('');
        const nCan = L.jogos.filter((j) => j.canastra).length;
        const naMesa = L.jogos.reduce((s, j) => s + somaDe(j.cards, vw.variante), 0);
        return `<tr><td><strong>${rotuloDoLado(i)}</strong><div class="cn-quem">${quemSao}</div></td>
          <td class="num">${nCan}</td><td class="num">${pts(naMesa)}</td><td class="num"><strong>${pts(L.pontos)}</strong></td></tr>`;
      }).join('');
      ctx.showModal(
        `<h2>Placar</h2>
         <table class="score-table"><thead><tr><th></th><th class="num">Canastras</th><th class="num">Na mesa</th><th class="num">Placar</th></tr></thead><tbody>${linhas}</tbody></table>
         <p class="modal-hint">A partida vai a ${pts(vw.meta || META)}. "Na mesa" é o que as cartas baixadas nesta rodada já valem, sem as canastras.</p>`,
        [{ label: 'Fechar', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },

    regras() {
      // Da sala, mostra a variante dela; da tela inicial, as duas.
      const vari = v()?.variante;
      const conv = `<h3>Convencional</h3>
         <p><strong>Mesa:</strong> 11 cartas e um <strong>morto</strong> de 11 para cada um (2 baralhos no 1 contra 1, 3 no 2 contra 2).</p>
         <p><strong>Abrir:</strong> a primeira baixada do lado soma 50 pontos de uma vez (90 a partir de 1.500 no placar).</p>
         <p><strong>Morto e batida:</strong> esvaziou a mão, pega o morto — se foi baixando, segue jogando; se foi no descarte, joga com ele na próxima vez. Esvaziar de novo é <strong>bater</strong>: só bate quem já pegou o próprio morto e tem canastra limpa no lado.</p>
         <p><strong>Pontos:</strong> 3 a 7 valem 5, 8 a K 10, o 2 10, o Ás 15, o joker 20. Canastra limpa (sem coringa) 300, suja 200, do Ás ao K 500, do Ás ao Ás 1.000. Batida +100; morto que ficou na mesa −100.</p>`;
      const do3 = `<h3>Do 3</h3>
         <p><strong>Mesa:</strong> 15 cartas para cada um, <strong>sem morto</strong>, 2 baralhos.</p>
         <p><strong>O 3:</strong> não entra em jogo — na sequência, depois do 2 vem o 4. O <strong>3 vermelho</strong> vai para a mesa na hora (+100) e você compra outra. O <strong>3 preto</strong>, o 2 e o joker descartados <strong>trancam o lixo</strong> para o seguinte.</p>
         <p><strong>Abrir:</strong> 75 pontos de uma vez; o coringa não conta (o joker e o 2 fora da casa dele). O 2 na casa dele (A-2-4♠) é carta normal: não suja e conta 20. Só pega o lixo (o bagaço) quem já abriu, e a carta de cima forma um <strong>jogo novo</strong> com cartas da mão.</p>
         <p><strong>Coringa:</strong> o joker não suja — canastra com joker continua limpa. Só o 2 suja. A trinca pode nascer com coringa: dois ases de naipes diferentes e um 2.</p>
         <p><strong>Batida:</strong> esvaziar a mão, com canastra limpa no lado.</p>
         <p><strong>Pontos:</strong> 4 a 7 valem 5, 8 a K 10, o Ás 20, o 2 20, o joker 50, o 3 nada. Canastra limpa 500, suja 250, do Ás ao Ás 1.000. Batida +200. Fim da rodada (batida ou monte): quem não tem canastra limpa fica com <strong>−500</strong>, e o resto dele não conta.</p>`;
      ctx.showModal(
        `<h2>Como se joga a Canastra</h2>
         <p><strong>Jogos:</strong> <strong>sequência</strong> do mesmo naipe (o Ás vale embaixo, A-2-3, e em cima, Q-K-A) ou <strong>trinca</strong> do mesmo valor, que nasce com naipes diferentes. Todo jogo tem pelo menos 3 cartas, e cada lado só mexe nos seus. 1 contra 1 ou 2 contra 2, com os parceiros frente a frente.</p>
         <p><strong>Coringa:</strong> o 2 e o joker, <em>um</em> por jogo. O 2 do mesmo naipe na casa dele (A-2-3♠) é carta normal.</p>
         <p><strong>Canastra:</strong> jogo com 7 cartas ou mais.</p>
         <p><strong>Na vez:</strong> compre do monte <em>ou</em> leve o <strong>lixo inteiro</strong> — a carta de cima tem que ir para um jogo na hora. Baixe o que quiser e descarte 1. As cartas da mesa somam, as da mão descontam. A partida vai a 3.000.</p>
         ${vari === 'do3' ? do3 : vari === 'convencional' ? conv : conv + do3}
         <p class="modal-hint">Como baixar aqui: escolha as cartas na mão e toque em “Baixar jogo novo”, ou no <strong>＋</strong> de um jogo seu. Para descartar, escolha uma carta só.</p>`,
        [{ label: 'Entendi', cls: 'btn-primary', fn: ctx.closeModal }],
        ctx.closeModal,
      );
    },
  };
}
