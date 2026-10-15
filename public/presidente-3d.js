// ============================================================================
// Presidente — a mesa 3D. Como o presidente-mesa.js da 2D, este arquivo só é
// baixado quando a sala é de Presidente: a 3D do Caçamba nunca paga por ele.
//
// Não monta cena nova. Usa a mesa, o elenco, o leque e a pinça do mesa3d.js,
// que chegam pelo `ctx`; o que é daqui: o meio da mesa (a jogada a cobrir,
// deitada no feltro, com as duas de antes por baixo), os botões Jogar /
// Passar / Devolver, os títulos sob o nome de cada um, as placas (PASSOU, 1º)
// e o placar do fim da rodada.
//
// A regra continua em /shared/presidente.js: daqui só se pergunta.
// ============================================================================

import { forca, motivoDaRecusa, TITULOS, rotulo as rotuloDoValor } from '/shared/presidente.js';

const QTD = ['', 'uma carta', 'um par', 'uma trinca', 'uma quadra'];
// a carta do meio é a mais importante da mesa: um pouco maior que a do jogo
// baixado do Caçamba (0,66), que é lida do outro lado do feltro
const ESCALA_MEIO = 0.74;
const PASSO = 0.14;           // entre as cartas de um lance: mostra o índice do canto
// O meio fica um pouco para o lado de lá do centro: no centro exato a jogada
// caía atrás da barra de botões e do topo do leque (medido em 800×600). Sem
// monte nem jogos baixados, essa metade do feltro está livre.
const Z_DO_MEIO = -0.4;

export function criaPresidente3D(ctx) {
  const { THREE, scene, MESA_TOPO, CARTA_L, CARTA_A } = ctx;
  const v = () => ctx.view();
  const me = () => ctx.me();
  const nome = (id) => (id === me() ? 'você' : v()?.players.find((p) => p.id === id)?.name || '…');
  const minhaVez = () => v()?.turnId === me();
  const selecionadas = () => (v()?.you?.hand || []).filter((c) => ctx.selecionadas().has(c.id));
  const tituloDe = (t) => (t && t !== 'neutro' ? TITULOS[t] : '');
  const descreve = (cards) => {
    const n = cards.length;
    const valor = rotuloDoValor(cards[0].rank);
    return n === 1 ? `um ${valor}` : `${QTD[n].replace(/^uma? /, '')} de ${valor}`;
  };

  // O aviso de um lance ("2 na mesa…", "Volta fechada…") fica uns segundos e
  // depois volta o texto da vez. Sem isso o `sincroniza`, que roda logo depois
  // dos eventos, trocava o aviso antes de alguém conseguir lê-lo.
  let avisoDoLance = null;
  function anuncia(texto) {
    const este = { texto, ate: performance.now() + 2600 };
    avisoDoLance = este;
    ctx.aviso(texto, true);
    setTimeout(() => {
      if (avisoDoLance !== este) return;
      avisoDoLance = null;
      const t = api.textoDaVez();
      if (t) ctx.aviso(t, true);
    }, 2600);
  }

  // ---- o meio da mesa ------------------------------------------------------

  const centro = new THREE.Group();
  scene.add(centro);
  const sombra = ctx.sombraDeContato(0.7, 0.5);
  sombra.position.z = Z_DO_MEIO;
  sombra.visible = false;
  scene.add(sombra);
  let chaveDoCentro = null;
  let lanceAgora = null;       // o lance que acabou de sair ({ p, cards }): voa da mão de quem jogou
  let varrerPara = undefined;  // a mesa limpou: as cartas deslizam para quem recomeça
  const saindo = new THREE.Group();   // o que está sendo varrido mora fora do meio
  scene.add(saindo);
  const PONTO_DO_MEIO = () => new THREE.Vector3(0, MESA_TOPO + 0.08, Z_DO_MEIO);

  function soltaGrupo(g) {
    g.traverse((o) => { if (o.isMesh && o.userData.proprio) o.material.dispose(); });
  }

  // Um lance: as cartas deitadas lado a lado, viradas para a câmera (o mesmo
  // gesto dos jogos baixados do Caçamba). `fundo` 0 é o atual; 1 e 2, os que
  // ele cobriu, um pouco para trás, girados e mais apagados.
  function montaLance(lance, fundo) {
    const g = new THREE.Group();
    const n = lance.cards.length;
    const larg = (n - 1) * PASSO + CARTA_L * ESCALA_MEIO;
    if (fundo === 0) {
      // o tapete na cor da cadeira de quem jogou: é o que diz de quem é a mesa
      for (const [dl, dp, cor, op, y] of [
        [larg + 0.12, CARTA_A * ESCALA_MEIO + 0.1, ctx.corDe(lance.p), 0.62, 0.002],
        [larg + 0.085, CARTA_A * ESCALA_MEIO + 0.065, 0x1c120a, 0.8, 0.003],
      ]) {
        const t = new THREE.Mesh(ctx.geoSombra, new THREE.MeshBasicMaterial({ map: ctx.texturaTapete, color: cor, transparent: true, opacity: op, depthWrite: false }));
        t.userData.proprio = true;
        t.rotation.x = -Math.PI / 2;
        t.scale.set(dl, dp, 1);
        t.position.y = y;
        g.add(t);
      }
    }
    lance.cards.forEach((card, i) => {
      let mat = ctx.materialDaCarta(card);
      if (fundo) {
        // o material da carta é compartilhado: apagar é numa cópia
        mat = mat.clone();
        mat.color.multiplyScalar(1 - 0.24 * fundo);
      }
      const m = new THREE.Mesh(ctx.geoCarta, mat);
      if (fundo) m.userData.proprio = true;
      m.castShadow = true;
      m.scale.setScalar(ESCALA_MEIO);
      // deitada (o 0,025 é só a sombra da borda), como manda a casa: carta
      // na mesa não se ergue — quem se move é a câmera
      m.rotation.set(-Math.PI / 2 + 0.025, 0, 0);
      m.position.set(-larg / 2 + (CARTA_L * ESCALA_MEIO) / 2 + i * PASSO, 0.008 + i * 0.001, i * 0.004);
      g.add(m);
    });
    g.position.set(-0.075 * fundo, MESA_TOPO + 0.006 * (2 - fundo), Z_DO_MEIO - 0.075 * fundo);
    g.rotation.y = 0.17 * fundo;
    return g;
  }

  // O lance novo chega: o meu vem pela pinça (a mão leva as cartas e o do meio
  // só aparece quando elas chegam); o dos outros, da mão de quem jogou.
  function chegaLance(g, quem) {
    if (ctx.semMovimento) return;
    if (quem === me()) {
      if (ctx.pincaVaiLevar()) { g.visible = false; setTimeout(() => { g.visible = true; }, 760); }
      return;
    }
    const a = ctx.assentos.get(quem);
    if (!a) return;
    const modelo = a.assento?.modelo;
    if (modelo) ctx.gestoCarta(modelo, 'descartar', PONTO_DO_MEIO());
    ctx.voa(g, ctx.lequeDe(a), g.position.clone(), {
      dur: 340, atraso: ctx.temGesto(a) ? 520 : 90, arco: 0.015,
      deAtual: modelo ? () => ctx.pontoDaMaoAtiva(a) : null,
    });
  }

  // A mesa limpou: o que estava no meio desliza até quem recomeça e some. Se a
  // limpeza veio junto com o lance que a causou (o 2, ou a última ação da
  // volta), o lance assenta por cima primeiro e fica um instante à vista —
  // senão o 2 nunca apareceria na mesa.
  function varre(para, lance) {
    const grupos = [...centro.children];
    for (const g of grupos) { centro.remove(g); saindo.add(g); }
    if (lance) {
      const g = montaLance(lance, 0);
      g.position.y += 0.012;
      saindo.add(g); grupos.push(g);
      chegaLance(g, lance.p);
    }
    if (!grupos.length) return;
    const fim = (g) => { saindo.remove(g); soltaGrupo(g); };
    if (ctx.semMovimento) { grupos.forEach(fim); return; }
    const a = para && para !== me() ? ctx.assentos.get(para) : null;
    const destino = a ? ctx.lequeDe(a).setY(MESA_TOPO + 0.05) : new THREE.Vector3(0, MESA_TOPO + 0.05, 1.05);
    setTimeout(() => {
      for (const g of grupos) ctx.voa(g, g.position.clone(), destino, { dur: 420, arco: 0.03, aoFim: () => fim(g) });
    }, lance ? 1500 : 350);
  }

  function desenhaCentro() {
    const vw = v();
    const lances = vw.phase === 'play' ? (vw.lances || []).slice(-3) : [];
    const chave = `${vw.round}|${lances.map((l) => l.cards.map((c) => c.id).join(',')).join('/')}`;
    if (chave === chaveDoCentro) return;
    chaveDoCentro = chave;

    const novo = lanceAgora;
    lanceAgora = null;
    // o lance novo já está entre os da visão? Então ele chegou sem limpar a mesa.
    const naMesa = novo && lances.at(-1)?.cards.some((c) => c.id === novo.cards[0]?.id);
    if (varrerPara !== undefined) varre(varrerPara, naMesa ? null : novo);
    varrerPara = undefined;
    for (const g of [...centro.children]) { centro.remove(g); soltaGrupo(g); }

    sombra.visible = lances.length > 0;
    lances.forEach((l, i) => {
      const fundo = lances.length - 1 - i;
      const g = montaLance(l, fundo);
      centro.add(g);
      if (fundo === 0 && naMesa && novo.p === l.p) chegaLance(g, l.p);
    });
  }

  // ---- os assentos: título sob o nome, placa de estado ---------------------

  function marcaAssentos() {
    const vw = v();
    for (const [id, a] of ctx.assentos) {
      const p = vw.players.find((x) => x.id === id);
      if (!p) continue;
      const t = tituloDe(p.titulo);
      if (!a.titulo) {
        a.titulo = ctx.rotulo('', 'rgba(27,17,11,0.92)', '#f2c14e');
        a.titulo.scale.set(0.4, 0.11, 1);
        a.grupo.add(a.titulo);
      }
      a.titulo.visible = !!t;
      if (t) ctx.trocaRotulo(a.titulo, t, p.titulo === 'cu' || p.titulo === 'vice-cu' ? 'rgba(70,58,48,0.92)' : 'rgba(27,17,11,0.92)', p.titulo === 'cu' || p.titulo === 'vice-cu' ? '#d8cbb8' : '#f2c14e');
      // o que a placa diz quando não há lance nem vez: quem já saiu e quem já
      // agiu nesta volta (uma ação por volta: jogou OU passou, e a vez não volta)
      const naVolta = vw.phase === 'play';
      a.marca = p.saiu >= 0 ? `SAIU EM ${p.saiu + 1}º` : naVolta && p.passou ? 'PASSOU' : naVolta && p.jogouNaVolta ? 'JOGOU' : null;
    }
  }

  // ---- o que mesa3d.js chama -----------------------------------------------

  const api = {
    sincroniza() {
      const vw = v();
      const eu = vw.players.find((p) => p.id === me());
      const meu = tituloDe(eu?.titulo);
      document.getElementById('rot-rodada').textContent = `Presidente · Rodada ${vw.round + 1}${meu ? ` · ${meu}` : ''}`;
      document.getElementById('rot-contrato').textContent = vw.phase === 'troca' ? 'Troca de cartas'
        : vw.phase === 'roundEnd' ? 'Fim da rodada'
        : vw.mesa ? `Mesa: ${descreve(vw.mesa.cards)}` : 'Mesa limpa';
      marcaAssentos();
      desenhaCentro();
    },

    // o título acompanha o nome, que desce para a cabeça quando o modelo carrega
    quadro() {
      for (const a of ctx.assentos.values()) if (a.titulo) a.titulo.position.set(a.nome.position.x, a.nome.position.y - 0.125, a.nome.position.z);
    },

    // o próximo a jogar pula quem já saiu
    proximoId() {
      const vw = v();
      const n = vw.players.length;
      const i = vw.players.findIndex((p) => p.id === vw.turnId);
      if (i < 0 || vw.phase !== 'play') return null;
      for (let k = 1; k < n; k++) { const p = vw.players[(i + k) % n]; if (p.handCount > 0) return p.id; }
      return null;
    },

    // 3 4 5 … K A 2; no mesmo valor, pelo naipe
    ordena(hand) {
      return hand.sort((a, b) => forca(a) - forca(b) || a.suit - b.suit);
    },

    // O toque na carta, como na 2D: com mesa a cobrir, já separa quantas a
    // mesa pede daquele valor; sem mesa, uma a uma, e outro valor recomeça.
    toca(card) {
      const vw = v(), sel = ctx.selecionadas();
      if (sel.has(card.id)) { sel.delete(card.id); return; }
      if (vw.phase === 'troca') {
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
        for (const c of [card, ...hand.filter((c) => mesmo(c) && c.id !== card.id)].slice(0, vw.mesa.n)) sel.add(c.id);
        return;
      }
      sel.add(card.id);
    },

    botoes(barra) {
      const vw = v();
      if (!minhaVez()) return;
      const limpa = () => { ctx.selecionadas().clear(); ctx.atualizaMao(); };
      if (vw.phase === 'troca' && vw.troca?.de === me()) {
        const n = vw.troca.n, sel = selecionadas();
        const b = ctx.botao(`Devolver ${n === 1 ? '1 carta' : `${n} cartas`} (${sel.length}/${n})`, sel.length === n ? 'primario' : 'normal', () => {
          const agora = selecionadas();
          if (agora.length !== n) { anuncia(`Escolha ${n === 1 ? '1 carta' : `${n} cartas`} para devolver a ${nome(vw.troca.para)}.`); return; }
          ctx.sendAction({ a: 'trocar', cardIds: agora.map((c) => c.id) });
          limpa();
        });
        barra.appendChild(b);
        return;
      }
      if (vw.phase !== 'play') return;
      const sel = selecionadas();
      const ok = sel.length && !motivoDaRecusa(vw.mesa, sel);
      barra.appendChild(ctx.botao(ok ? `Jogar ${descreve(sel)}` : 'Jogar', ok ? 'primario' : 'normal', () => {
        const cartas = selecionadas();
        const motivo = motivoDaRecusa(v().mesa, cartas);
        if (motivo) { anuncia(motivo); return; }
        ctx.sendAction({ a: 'jogar', cardIds: cartas.map((c) => c.id) });
        limpa();
      }));
      if (vw.mesa) barra.appendChild(ctx.botao('Passar', 'normal', () => { ctx.sendAction({ a: 'passar' }); limpa(); }));
    },

    textoDaVez() {
      const vw = v();
      if (avisoDoLance && performance.now() < avisoDoLance.ate) return avisoDoLance.texto;
      if (vw.phase === 'troca') {
        const t = vw.troca;
        if (t?.de === me()) return `Escolha ${t.n === 1 ? '1 carta' : `${t.n} cartas`} para devolver a ${nome(t.para)}.`;
        return t ? `${nome(t.de)} está escolhendo o que devolver…` : 'Troca de cartas…';
      }
      if (vw.phase === 'roundEnd') return 'Fim da rodada.';
      if (vw.phase !== 'play') return '';
      if (!minhaVez()) return `Vez de ${nome(vw.turnId)}…`;
      if (!vw.mesa) return 'Mesa limpa: você abre. Jogue 1 a 4 cartas do mesmo valor.';
      return `Cubra com ${QTD[vw.mesa.n]} acima de ${rotuloDoValor(vw.mesa.cards[0].rank)} — ou passe.`;
    },

    evento(ev) {
      const eu = me();
      switch (ev.e) {
        case 'roundStart':
          chaveDoCentro = null; lanceAgora = null; varrerPara = undefined;
          for (const g of [...centro.children]) { centro.remove(g); soltaGrupo(g); }
          if (ev.round > 0) anuncia(`Rodada ${ev.round + 1}`);
          break;
        case 'jogou':
          lanceAgora = { p: ev.p, cards: ev.cards };
          ctx.verbo(ev.p, ev.cards.length > 1 ? `JOGOU ${QTD[ev.cards.length].replace(/^uma? /, '').toUpperCase()}` : 'JOGOU');
          if (ev.p === eu) ctx.armaPinca(PONTO_DO_MEIO);
          if (ev.cards.length && forca(ev.cards[0]) === 12) ctx.cara(ev.p, 'feliz');
          break;
        case 'passou':
          ctx.verbo(ev.p, 'PASSOU');
          break;
        case 'limpou':
          varrerPara = ev.p;
          if (ev.motivo === 'dois') anuncia(ev.p === eu ? '2 na mesa: ninguém cobre. Você começa de novo.' : `2 na mesa: ninguém cobre. ${nome(ev.p)} começa.`);
          else anuncia(ev.p === eu ? 'Volta fechada: mesa limpa, você começa.' : `Volta fechada: ${nome(ev.p)} começa.`);
          break;
        case 'abre':
          anuncia(ev.p === eu ? 'Você abre a rodada.' : `${nome(ev.p)} abre a rodada.`);
          break;
        case 'entregou':
          ctx.verbo(ev.p, ev.n === 1 ? 'ENTREGOU 1' : `ENTREGOU ${ev.n}`);
          if (ev.p === eu) anuncia(`Você entregou ${ev.n === 1 ? 'a sua carta mais forte' : `as ${ev.n} mais fortes`} a ${nome(ev.para)}.`);
          else if (ev.para === eu) anuncia(`${nome(ev.p)} te entregou ${ev.n === 1 ? 'a mais forte' : `as ${ev.n} mais fortes`}. Agora devolva ${ev.n}.`);
          break;
        case 'devolveu':
          ctx.verbo(ev.p, 'DEVOLVEU');
          if (ev.para === eu) anuncia(`${nome(ev.p)} te devolveu ${ev.n === 1 ? '1 carta' : `${ev.n} cartas`}.`);
          break;
        case 'saiu':
          ctx.verbo(ev.p, ev.pos === 0 ? 'PRESIDENTE!' : `SAIU EM ${ev.pos + 1}º`);
          ctx.cara(ev.p, 'feliz');
          if (ev.pos === 0) anuncia(`${ev.p === eu ? 'Você saiu primeiro' : `${nome(ev.p)} saiu primeiro`}: Presidente!`);
          break;
        case 'roundEnd': {
          const cu = ev.ordem[ev.ordem.length - 1];
          ctx.cara(cu, 'bravo');
          ctx.verbo(cu, 'É O CU');
          break;
        }
      }
    },

    // O placar do fim da rodada, na caixa da 3D (a mesma do Caçamba).
    desenhaPlacar(corpo, acoes) {
      const vw = v();
      const lr = vw.lastRound;
      const jogador = (id) => vw.players.find((p) => p.id === id);
      const tabela = document.createElement('table');
      const n = vw.players.length;
      if (vw.phase === 'roundEnd' && lr) {
        const presidente = jogador(lr.ordem[0]);
        if (presidente) corpo.appendChild(ctx.palcoDe(presidente));
        corpo.append(...ctx.cabecalho(presidente?.id === me() ? 'Você é o Presidente!' : `${presidente?.name || '…'} é o Presidente!`,
          `Presidente · Rodada ${vw.round + 1}`));
        tabela.innerHTML = '<tr><th>Ordem</th><th style="text-align:right">Rodada</th><th style="text-align:right">Total</th></tr>';
        lr.ordem.forEach((id, pos) => {
          const p = jogador(id);
          if (!p) return;
          const t = tituloDe(lr.titulos[id]);
          tabela.appendChild(ctx.linhaDoPlacar(p, `${pos + 1}º ${ctx.nomeDe(p)}${t ? ` · ${t}` : ''}`, pos === 0, `+${n - 1 - pos}`, p.pontos));
        });
        corpo.appendChild(tabela);
        const meu = lr.titulos[me()];
        const dica = {
          cu: 'Você é o Cu: na próxima, entrega as 2 cartas mais fortes ao Presidente — e abre a rodada.',
          presidente: 'Na próxima, o Cu te entrega as 2 mais fortes dele e você devolve 2 à sua escolha.',
          'vice-cu': 'Vice-cu: na próxima, entrega a sua carta mais forte ao Vice.',
          vice: 'Vice: na próxima, recebe a mais forte do Vice-cu e devolve 1.',
        }[meu];
        if (dica) { const p = document.createElement('p'); p.className = 'espera'; p.textContent = dica; corpo.appendChild(p); }
        if (ctx.souAnfitriao()) acoes.appendChild(ctx.acaoDoPlacar('Próxima rodada', true, () => ctx.enviaAoServidor({ t: 'nextRound' })));
        else { const e = document.createElement('p'); e.className = 'espera'; e.textContent = 'Esperando o anfitrião continuar…'; corpo.appendChild(e); }
        return;
      }
      // no meio da rodada: os pontos, do melhor para o pior
      corpo.append(...ctx.cabecalho('Placar', 'O Presidente leva um ponto por jogador atrás dele; o Cu, zero.'));
      tabela.innerHTML = '<tr><th>Jogador</th><th style="text-align:right">Pontos</th></tr>';
      for (const p of [...vw.players].sort((a, b) => b.pontos - a.pontos)) {
        const t = tituloDe(p.titulo);
        tabela.appendChild(ctx.linhaDoPlacar(p, `${ctx.nomeDe(p)}${t ? ` · ${t}` : ''}`, false, p.pontos));
      }
      corpo.appendChild(tabela);
    },
  };
  return api;
}
