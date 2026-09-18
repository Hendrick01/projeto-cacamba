// Cacamba: voz P2P. O servidor do jogo transporta apenas sinalizacao.
// STUN nao substitui TURN em redes restritivas. iceServers aceita uma lista
// obtida de um provedor autenticado; nunca colocar segredo TURN fixo no JS.
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const LIMIAR_FALA = 0.08;
const MAX_PARES = 8;
const MAX_CANDIDATOS = 128;
const MAX_REINICIOS = 3;
const tokenValido = (s) => typeof s === 'string' && s.length > 0 && s.length <= 128;
const nonce = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

// A lista de verdade: STUN sempre, e o TURN que o servidor do jogo entregar em
// /voz.json (credencial de vida curta, nunca fixa aqui). É o MESMO array que as
// conexões usam, então o que chegar depois vale para a próxima ligação.
// (sem `export`: o teste do módulo o carrega num sandbox que só conhece
// `criaVoz`; quem precisar destes dois os acha em `criaVoz.ICE`/`.carregaIce`)
const ICE = [...STUN];
function carregaIce(buscar = globalThis.fetch) {
  if (typeof buscar !== 'function') return Promise.resolve(ICE);
  return buscar('/voz.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!Array.isArray(j?.iceServers)) return ICE;
    ICE.length = STUN.length;
    for (const s of j.iceServers) if (s && s.urls) ICE.push({ urls: s.urls, username: s.username, credential: s.credential });
    return ICE;
  }).catch(() => ICE);
}
if (typeof location !== 'undefined' && typeof fetch === 'function') {
  carregaIce();
  setInterval(carregaIce, 30 * 60 * 1000);   // a credencial vence em horas
}

export function criaVoz({ meuId, enviar, iceServers = ICE }) {
  const eu = () => (typeof meuId === 'function' ? meuId() : meuId);
  const pares = new Map();
  const encerradas = new Map();
  let local = null, ctx = null, medidorLocal = null, mudo = false;
  let geracao = 0, iniciando = null, dono = null, sessao = null, pulso = null;

  function sinal(id, dados) {
    const remota = pares.get(id)?.remota;
    try { enviar(id, { ...dados, sessao, ...(remota && dados.tipo !== 'oi' ? { para: remota } : {}) }); } catch { /* WebSocket em reconexao. */ }
  }
  function ativa() {
    if (local && eu() !== dono) { desligar(false); return false; }
    return !!local;
  }
  const atual = (par) => ativa() && pares.get(par.id) === par && par.geracao === geracao;
  const lider = (id) => String(eu()) < String(id);
  const conectado = (pc) => pc.connectionState === 'connected'
    || (!pc.connectionState && ['connected', 'completed'].includes(pc.iceConnectionState));

  function analisador(stream) {
    if (!ctx || ctx.state === 'closed') return null;
    try {
      const fonte = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256; an.smoothingTimeConstant = 0.5;
      fonte.connect(an);
      return { fonte, an, dados: new Uint8Array(an.fftSize) };
    } catch { return null; } // Medidor e opcional; falhar nao desliga o som.
  }
  function liberaMedidor(m) {
    try { m?.fonte.disconnect(); } catch { /* ja liberado */ }
    try { m?.an.disconnect(); } catch { /* ja liberado */ }
  }
  function mede(m) {
    if (!m) return 0;
    m.an.getByteTimeDomainData(m.dados);
    let soma = 0;
    for (const n of m.dados) soma += ((n - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(soma / m.dados.length) * 4);
  }
  function tocar(par) {
    if (!par.audio || !atual(par)) return;
    try {
      Promise.resolve(par.audio.play()).then(() => {
        if (atual(par)) par.bloqueado = false;
      }, () => { if (atual(par)) par.bloqueado = true; });
    } catch { par.bloqueado = true; }
  }
  function desbloquearAudio() {
    if (!ativa()) return;
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') {
      try { Promise.resolve(ctx.resume()).catch(() => {}); } catch { /* proximo toque */ }
    }
    for (const par of pares.values()) {
      if (par.bloqueado || par.audio?.paused) tocar(par);
    }
  }
  function eventos(adicionar) {
    const metodo = adicionar ? 'addEventListener' : 'removeEventListener';
    for (const tipo of ['pointerdown', 'touchend', 'keydown']) {
      document[metodo](tipo, desbloquearAudio);
    }
    document[metodo]('visibilitychange', visibilidade);
    window[metodo]('online', reconectar);
    window[metodo]('pagehide', aoSair);
  }
  function visibilidade() {
    if (document.visibilityState === 'visible') { desbloquearAudio(); reconectar(); }
  }
  function aoSair() { desligar(); }

  function ligar() {
    if (iniciando) return iniciando;
    if (ativa()) { desbloquearAudio(); return Promise.resolve(); }
    if (!tokenValido(eu())) return Promise.reject(new Error('Entre em uma sala antes de ligar o microfone.'));
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection !== 'function') {
      return Promise.reject(new Error('Este navegador n\u00e3o permite voz. Use HTTPS e um navegador com WebRTC.'));
    }
    const vez = ++geracao;
    dono = eu();
    // Criar e retomar dentro do toque, ANTES de aguardar a permissao do mic.
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        ctx = new Audio();
        Promise.resolve(ctx.resume()).catch(() => {});
      }
    } catch { ctx = null; }
    const tarefa = (async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
        });
        if (vez !== geracao || eu() !== dono) {
          stream.getTracks().forEach((t) => t.stop());
          if (vez === geracao) desligar(false);
          return;
        }
        if (!stream.getAudioTracks().some((t) => t.readyState !== 'ended')) throw new Error('Sem trilha de audio');
        local = stream;
        sessao = nonce();
        local.getAudioTracks().forEach((t) => {
          t.enabled = !mudo;
          t.onended = () => { if (local === stream) desligar(); };
        });
        medidorLocal = analisador(local);
        eventos(true);
        pulso = setInterval(() => { if (ativa()) sinal('*', { tipo: 'oi' }); }, 15000);
        sinal('*', { tipo: 'oi' });
      } catch (e) {
        stream?.getTracks().forEach((t) => t.stop());
        if (vez !== geracao) return;
        desligar(false);
        const mensagens = {
          NotAllowedError: 'Permita o microfone para este site e tente novamente.',
          SecurityError: 'O navegador bloqueou o microfone. Verifique a permiss\u00e3o e o HTTPS.',
          NotFoundError: 'Nenhum microfone encontrado neste aparelho.',
          OverconstrainedError: 'Nenhum microfone compat\u00edvel encontrado.',
          NotReadableError: 'N\u00e3o foi poss\u00edvel acessar o microfone; verifique outros aplicativos.',
        };
        throw new Error(mensagens[e?.name] || 'N\u00e3o deu para ligar o microfone.');
      }
    })();
    iniciando = tarefa;
    tarefa.then(() => { if (iniciando === tarefa) iniciando = null; },
      () => { if (iniciando === tarefa) iniciando = null; });
    return tarefa;
  }

  function desligar(avisar = true) {
    if (avisar && local && eu() === dono) sinal('*', { tipo: 'tchau' });
    ++geracao; iniciando = null;
    const stream = local; local = null;
    clearInterval(pulso); pulso = null;
    eventos(false);
    for (const id of [...pares.keys()]) remover(id);
    stream?.getTracks().forEach((t) => { t.onended = null; t.stop(); });
    liberaMedidor(medidorLocal); medidorLocal = null;
    const antigo = ctx; ctx = null;
    try { Promise.resolve(antigo?.close()).catch(() => {}); } catch { /* ja fechado */ }
    mudo = false; dono = null; sessao = null; encerradas.clear();
  }
  function silenciar(sim) {
    mudo = !!sim;
    if (ativa()) local.getAudioTracks().forEach((t) => { t.enabled = !mudo; });
  }
  function aposentar(id, anterior) {
    if (!anterior) return;
    const antigas = encerradas.get(id) || new Set();
    antigas.add(anterior);
    if (antigas.size > 8) antigas.delete(antigas.values().next().value);
    encerradas.set(id, antigas);
    if (encerradas.size > MAX_PARES * 2) encerradas.delete(encerradas.keys().next().value);
  }
  function remover(id) {
    const par = pares.get(id);
    if (!par) return;
    pares.delete(id);
    clearTimeout(par.timer);
    par.pc.onicecandidate = par.pc.ontrack = par.pc.onconnectionstatechange = par.pc.oniceconnectionstatechange = null;
    try { par.pc.close(); } catch { /* ja fechado */ }
    liberaMedidor(par.medidor);
    if (par.audio) {
      try { par.audio.pause(); } catch { /* nao tocou */ }
      par.audio.srcObject = null; par.audio.remove();
    }
    par.fila.length = 0;
  }
  // Toda operacao SDP/ICE do mesmo par passa por esta fila. Uma falha nao
  // rejeita sem tratamento no cliente nem bloqueia as proximas mensagens.
  function serial(par, operacao) {
    if (par.pendentes >= 256) return par.trabalho;
    par.pendentes++;
    par.trabalho = par.trabalho.then(async () => {
      if (atual(par)) await operacao();
    }).catch(() => {
      if (atual(par)) { par.erro = 'sinalizacao'; agenda(par); }
    }).finally(() => { par.pendentes--; });
    return par.trabalho;
  }
  function novoPar(id, remota = null) {
    if (!ativa() || pares.size >= MAX_PARES) return null;
    const pc = new RTCPeerConnection({ iceServers });
    const par = { id, pc, geracao, remota, audio: null, medidor: null, fila: [],
      trabalho: Promise.resolve(), pendentes: 0, negociacao: null, bloqueado: false, timer: null, tentativas: 0,
      ultimoReinicio: -Infinity, erro: null, ignorarOferta: false, ecoEnviado: false };
    pares.set(id, par);
    try { for (const t of local.getAudioTracks()) pc.addTrack(t, local); }
    catch (e) { remover(id); throw e; }
    pc.onicecandidate = (e) => {
      if (!atual(par)) return;
      sinal(id, { tipo: 'candidato', candidato: e.candidate
        ? (e.candidate.toJSON?.() || e.candidate) : { candidate: '' } });
    };
    pc.ontrack = (e) => {
      if (!atual(par)) return;
      const stream = e.streams?.[0] || new MediaStream([e.track]);
      if (!par.audio) {
        par.audio = document.createElement('audio');
        par.audio.autoplay = true; par.audio.hidden = true;
        par.audio.setAttribute('playsinline', '');
        document.body.appendChild(par.audio);
      }
      par.audio.srcObject = stream;
      tocar(par);
      liberaMedidor(par.medidor); par.medidor = analisador(stream);
    };
    const mudou = () => {
      if (!atual(par)) return;
      if (conectado(pc)) {
        clearTimeout(par.timer); par.timer = null; par.tentativas = 0; par.erro = null;
      } else if ([pc.connectionState, pc.iceConnectionState].includes('failed')) {
        agenda(par, 1000);
      } else if ([pc.connectionState, pc.iceConnectionState].includes('disconnected')) {
        agenda(par, 5000); // Tolerar interrupcoes breves sem recriar tudo.
      }
    };
    pc.onconnectionstatechange = pc.oniceconnectionstatechange = mudou;
    agenda(par);
    return par;
  }
  function agenda(par, atraso = 8000) {
    if (!atual(par) || par.timer !== null || par.tentativas >= MAX_REINICIOS) return;
    par.timer = setTimeout(() => {
      par.timer = null;
      if (!atual(par) || conectado(par.pc)) return;
      par.tentativas++;
      if (lider(par.id)) reiniciar(par);
      else sinal(par.id, { tipo: 'oi', reconectar: true });
      agenda(par, 8000 * par.tentativas);
    }, atraso);
  }
  async function oferta(par, reinicio = false) {
    const pc = par.pc;
    if (reinicio && pc.signalingState === 'have-local-offer') {
      await pc.setLocalDescription({ type: 'rollback' });
      if (!atual(par)) return;
    }
    if (pc.signalingState !== 'stable') return;
    const sdp = await pc.createOffer(reinicio ? { iceRestart: true } : undefined);
    if (!atual(par)) return;
    par.negociacao = nonce();
    await pc.setLocalDescription(sdp);
    if (atual(par)) sinal(par.id, { tipo: 'oferta', sdp: pc.localDescription.toJSON?.() || pc.localDescription, negociacao: par.negociacao });
  }
  function reiniciar(par) {
    if (Date.now() - par.ultimoReinicio < 5000) return par.trabalho;
    par.ultimoReinicio = Date.now();
    return serial(par, () => oferta(par, true));
  }
  function reconectar() {
    if (!ativa()) return;
    sinal('*', { tipo: 'oi' });
    for (const par of pares.values()) {
      if (!conectado(par.pc)) { par.tentativas = 0; agenda(par, 1000); }
    }
  }
  function guarda(par, c) {
    if (par.fila.length < MAX_CANDIDATOS) par.fila.push(c);
  }
  function compativel(pc, c) {
    if (!c.usernameFragment) return true;
    const ufrags = [...(pc.remoteDescription?.sdp || '').matchAll(/^a=ice-ufrag:([^\r\n]+)/gm)];
    return ufrags.some((m) => m[1] === c.usernameFragment);
  }
  async function candidato(par, c) {
    if (!par.pc.remoteDescription || !compativel(par.pc, c)) { guarda(par, c); return; }
    try { await par.pc.addIceCandidate(c); } catch { /* candidato obsoleto */ }
  }
  async function esvaziaFila(par) {
    const fila = par.fila; par.fila = [];
    for (const c of fila) {
      if (!atual(par)) return;
      if (compativel(par.pc, c)) await candidato(par, c);
    }
  }

  function receber(msg) {
    if (!msg || !ativa()) return Promise.resolve();
    const de = msg.from, d = msg.dados;
    if (!tokenValido(de) || de === eu() || !d || typeof d !== 'object' || Array.isArray(d)) return Promise.resolve();
    for (const campo of ['sessao', 'para', 'negociacao']) {
      if (d[campo] != null && !tokenValido(d[campo])) return Promise.resolve();
    }
    if (d.para && d.para !== sessao) return Promise.resolve();
    if (!['oi', 'tchau', 'oferta', 'resposta', 'candidato'].includes(d.tipo)) return Promise.resolve();
    if (['oferta', 'resposta'].includes(d.tipo) && (!d.sdp || typeof d.sdp.sdp !== 'string'
      || d.sdp.sdp.length > 64000 || d.sdp.type !== (d.tipo === 'oferta' ? 'offer' : 'answer'))) return Promise.resolve();
    if (d.tipo === 'candidato' && (!d.candidato || typeof d.candidato.candidate !== 'string'
      || d.candidato.candidate.length > 8192)) return Promise.resolve();
    let par = pares.get(de);
    const remota = typeof d.sessao === 'string' ? d.sessao : null;
    if (remota && encerradas.get(de)?.has(remota)) return Promise.resolve();
    if (d.tipo === 'tchau') {
      if (!par?.remota || !remota || par.remota === remota) {
        aposentar(de, remota || par?.remota); remover(de);
      }
      return Promise.resolve();
    }
    // So uma saudacao inicia nova sessao; pacotes atrasados nao ressuscitam
    // um microfone desligado nem encerram o par que ja foi substituido.
    if (par?.remota && remota && par.remota !== remota) {
      if (d.tipo !== 'oi') return Promise.resolve();
      aposentar(de, par.remota); remover(de); par = null;
    }
    if (!par && d.tipo === 'resposta') return Promise.resolve();
    try { par ||= novoPar(de, remota); } catch { return Promise.resolve(); }
    if (!par) return Promise.resolve();
    par.remota ||= remota;
    if (d.tipo === 'oi') {
      if (!d.eco && (remota || !par.ecoEnviado)) {
        par.ecoEnviado = true; sinal(de, { tipo: 'oi', eco: true });
      }
      if (lider(de)) {
        if (d.reconectar) return reiniciar(par);
        if (!par.pc.remoteDescription) return serial(par, () => oferta(par));
      }
      return par.trabalho;
    }
    return serial(par, async () => {
      const pc = par.pc;
      if (d.tipo === 'candidato' && d.candidato && typeof d.candidato.candidate === 'string') {
        if (!par.ignorarOferta) await candidato(par, d.candidato);
      } else if (d.tipo === 'oferta' && d.sdp?.type === 'offer' && typeof d.sdp.sdp === 'string') {
        const colisao = pc.signalingState !== 'stable';
        par.ignorarOferta = colisao && lider(de);
        if (par.ignorarOferta) return;
        if (colisao) {
          await pc.setLocalDescription({ type: 'rollback' });
          if (!atual(par)) return;
        }
        await pc.setRemoteDescription(d.sdp);
        if (!atual(par)) return;
        await esvaziaFila(par);
        if (!atual(par)) return;
        const resposta = await pc.createAnswer();
        if (!atual(par)) return;
        await pc.setLocalDescription(resposta);
        if (atual(par)) sinal(de, { tipo: 'resposta', sdp: pc.localDescription.toJSON?.() || pc.localDescription, negociacao: d.negociacao || null });
      } else if (d.tipo === 'resposta' && d.sdp?.type === 'answer'
        && typeof d.sdp.sdp === 'string' && pc.signalingState === 'have-local-offer') {
        if (d.negociacao && d.negociacao !== par.negociacao) return;
        await pc.setRemoteDescription(d.sdp);
        if (!atual(par)) return;
        par.ignorarOferta = false;
        await esvaziaFila(par);
      }
    });
  }

  function nivel(id) {
    if (!ativa()) return 0;
    return id === eu() ? (!mudo ? mede(medidorLocal) : 0) : mede(pares.get(id)?.medidor);
  }
  return {
    ligar, desligar, silenciar, receber, remover, nivel, reconectar, desbloquearAudio,
    falando: (id) => nivel(id) > LIMIAR_FALA,
    estadoDe: (id) => pares.get(id)?.pc.connectionState || pares.get(id)?.pc.iceConnectionState || null,
    ligado: ativa,
    get mudo() { return mudo; },
    get quantos() { return pares.size; },
    // Diagnostico sem SDP, candidatos IP, credenciais ou conteudo do audio.
    diagnostico: () => [...pares.values()].map((p) => ({ id: p.id,
      estado: p.pc.connectionState || p.pc.iceConnectionState,
      audioBloqueado: p.bloqueado, tentativas: p.tentativas, erro: p.erro })),
  };
}
criaVoz.ICE = ICE; criaVoz.carregaIce = carregaIce;
