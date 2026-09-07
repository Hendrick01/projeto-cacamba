import { VERSAO_INTERFACE } from './interface-core.js';
const $ = id => document.getElementById(id);
export function configuraInterface() {
  document.documentElement.dataset.interface = '2026-09-07-r1';
  for (const el of document.querySelectorAll('[data-interface-version]')) el.textContent = VERSAO_INTERFACE;
  // Balcoes de fundo podem transbordar; apenas assentos reais geram aviso.
  const assentos = $('opponents'), hint = $('opponents-hint');
  if (assentos && hint) {
    let frame = 0;
    const verificar = () => {
      frame = 0;
      const box = assentos.getBoundingClientRect();
      if (!box.width) return;
      let cortados = 0;
      for (const el of assentos.querySelectorAll(':scope > .assento')) {
        const r = el.getBoundingClientRect();
        if (r.left < box.left - 1 || r.right > box.right + 1) cortados++;
      }
      const oculto = cortados === 0;
      if (hint.hidden !== oculto) hint.hidden = oculto;
      if (cortados) {
        const texto = `${cortados} assento(s) na borda - toque para ver os detalhes`;
        if (hint.textContent !== texto) hint.textContent = texto;
      }
    };
    const agendar = () => { if (!frame) frame = requestAnimationFrame(verificar); };
    const observer = new MutationObserver(agendar);
    observer.observe(assentos,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
    observer.observe(hint,{attributes:true,attributeFilter:['hidden']});
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(agendar) : null;
    resize?.observe(assentos);
    window.addEventListener('resize',agendar);
    window.addEventListener('pagehide',()=>{observer.disconnect();resize?.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',agendar);},{once:true});
  }
  const nome = $('name-input'), codigo = $('code-input');
  nome?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-create')?.click(); });
  codigo?.addEventListener('input', () => { codigo.value = codigo.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 4); });
  codigo?.addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join')?.click(); });
  for (const [id, label] of [['btn-score','Placar'],['btn-rules','Regras'],['btn-quit','Sair da partida']]) $(id)?.setAttribute('aria-label', label);
}
export function estadoConexao(estado) {
  for (const el of document.querySelectorAll('[data-connection]')) {
    el.dataset.state = estado;
    el.textContent = estado === 'online' ? 'Conectado' : estado === 'paused' ? 'Conex\u00e3o pausada' : 'Reconectando\u2026';
  }
}
export function ligaControlesVoz(voz, { botao, avisar = () => {} } = {}) {
  if (!botao) return { atualizar() {}, presenca() {} };
  let busy = false;
  const painel = document.createElement('section');
  painel.className = 'voice-panel'; painel.hidden = true; painel.setAttribute('aria-label', 'Controle de voz');
  const titulo = document.createElement('strong'); titulo.textContent = 'Voz da sala';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Reconectar \u00e1udio';
  const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Desligar microfone';
  const fechar = document.createElement('button'); fechar.type = 'button'; fechar.textContent = 'Fechar';
  const nota = document.createElement('small'); nota.textContent = 'Algumas redes precisam de um servidor TURN, ainda n\u00e3o configurado.';
  painel.append(titulo, status, retry, stop, nota, fechar); document.body.appendChild(painel);
  const abrir = document.createElement('button'); abrir.type = 'button'; abrir.className = 'voice-details';
  abrir.textContent = '\u00c1udio'; abrir.setAttribute('aria-expanded', 'false'); botao.after(abrir);
  const alternar = aberto => { painel.hidden = !aberto; abrir.setAttribute('aria-expanded', String(aberto)); };
  abrir.onclick = () => { alternar(painel.hidden); atualizar(); };
  fechar.onclick = () => { alternar(false); abrir.focus(); };
  retry.onclick = () => { voz.desbloquearAudio?.(); voz.reconectar?.(); atualizar(); };
  stop.onclick = () => { voz.desligar(); atualizar(); };
  botao.onclick = async () => {
    if (busy) return;
    busy = true; botao.disabled = true;
    try {
      if (!voz.ligado()) await voz.ligar();
      else { voz.silenciar(!voz.mudo); voz.desbloquearAudio?.(); }
    } catch (e) { avisar(e.message || 'N\u00e3o foi poss\u00edvel ligar a voz.'); }
    finally { busy = false; botao.disabled = false; atualizar(); }
  };
  function atualizar() {
    const ligado = voz.ligado(), mudo = voz.mudo;
    botao.classList.toggle('voz-on', ligado && !mudo); botao.classList.toggle('voz-mudo', ligado && mudo);
    botao.setAttribute('aria-pressed', String(ligado && !mudo));
    botao.title = !ligado ? 'Ligar microfone' : mudo ? 'Voltar a falar' : 'Silenciar microfone';
    botao.setAttribute('aria-label', botao.title); botao.textContent = !ligado ? '\ud83c\udf99' : mudo ? '\ud83d\udd07' : '\ud83c\udf99';
    const pares = voz.diagnostico?.() || [];
    const bloqueado = pares.some(p => p.audioBloqueado), falha = pares.some(p => p.estado === 'failed');
    const conectados = pares.filter(p => p.estado === 'connected' || p.estado === 'completed').length;
    status.textContent = !ligado ? 'Microfone desligado.' : bloqueado ? 'Toque em Reconectar \u00e1udio para liberar o som.' : falha
      ? 'A conex\u00e3o de \u00e1udio falhou com um jogador. Tente reconectar; a rede pode exigir TURN.'
      : `${mudo ? 'Microfone silenciado' : 'Microfone ligado'} \u00b7 ${conectados} conex\u00e3o(\u00f5es) de voz.`;
    abrir.dataset.warning = String(bloqueado || falha);
    stop.disabled = retry.disabled = !ligado;
  }
  function presenca(players) {
    if (!Array.isArray(players)) return;
    const ativos = new Set(players.filter(p => !p.isBot && p.connected !== false && !p.desistiu).map(p => p.id));
    for (const p of voz.diagnostico?.() || []) if (!ativos.has(p.id)) voz.remover(p.id);
    atualizar();
  }
  const timer = setInterval(atualizar, 1000);
  window.addEventListener('pagehide', () => { clearInterval(timer); voz.desligar(); }, { once: true });
  atualizar(); return { atualizar, presenca };
}
