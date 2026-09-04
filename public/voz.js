// ============================================================================
// Caçamba — chat de voz entre os humanos da sala.
//
// O áudio vai DIRETO de um navegador ao outro (WebRTC, malha: cada um fala com
// cada um). O servidor só repassa a sinalização — oferta, resposta e
// candidatos ICE — pela mesma conexão WebSocket do jogo, na mensagem `voz`.
// Sem servidor de mídia, sem gravação, nada de áudio passa pelo Render.
//
// Quem descobre o caminho entre os dois navegadores é o STUN público do
// Google. NÃO há TURN: dois jogadores atrás de NAT restritivo (algumas
// operadoras de celular, redes de empresa) não vão se ouvir — a conexão
// fica em "failed" e o resto da mesa segue normal. Corrigir isso é um
// servidor TURN, que o plano free não tem.
//
// A mesma fábrica serve a mesa 2D e a 3D: cada uma decide como mostrar quem
// está falando (`nivel`/`falando`), o módulo só mede.
// ============================================================================

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const LIMIAR_FALA = 0.08;

export function criaVoz({ meuId, enviar }) {
  const eu = () => (typeof meuId === 'function' ? meuId() : meuId);
  let local = null;          // MediaStream do microfone
  let ctx = null;            // AudioContext — nasce num toque, senão o iOS não deixa
  let mudo = false;
  const pares = new Map();   // playerId -> { pc, audio, an, dados, fila, nivel }
  let meuAn = null; let meusDados = null;

  function analisador(stream) {
    const fonte = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 256; an.smoothingTimeConstant = 0.5;
    fonte.connect(an);
    return { an, dados: new Uint8Array(an.frequencyBinCount) };
  }
  // RMS da forma de onda, esticado para 0..1 — voz normal fica por volta de 0.2.
  function mede(an, dados) {
    an.getByteTimeDomainData(dados);
    let soma = 0;
    for (let i = 0; i < dados.length; i++) { const v = (dados[i] - 128) / 128; soma += v * v; }
    return Math.min(1, Math.sqrt(soma / dados.length) * 4);
  }

  async function ligar() {
    if (local) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não dá acesso ao microfone.');
    try {
      local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      // O navegador fala em inglês e por código; a mesa fala em português.
      const nome = e && e.name;
      if (nome === 'NotAllowedError' || nome === 'SecurityError') throw new Error('O navegador negou o microfone. Permita o microfone para este site e tente de novo.');
      if (nome === 'NotFoundError' || nome === 'OverconstrainedError') throw new Error('Nenhum microfone encontrado neste aparelho.');
      if (nome === 'NotReadableError') throw new Error('O microfone está em uso por outro aplicativo.');
      throw new Error('Não deu para ligar o microfone.');
    }
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    ({ an: meuAn, dados: meusDados } = analisador(local));
    // "oi" para a mesa: quem já está com a voz ligada responde, e a regra de
    // quem oferece (id menor) evita os dois oferecerem ao mesmo tempo.
    enviar('*', { tipo: 'oi' });
  }

  function desligar() {
    if (!local) return;
    enviar('*', { tipo: 'tchau' });
    for (const id of [...pares.keys()]) remover(id);
    local.getTracks().forEach((t) => t.stop());
    local = null; mudo = false; meuAn = null; meusDados = null;
  }

  function silenciar(sim) {
    mudo = !!sim;
    if (local) local.getAudioTracks().forEach((t) => { t.enabled = !mudo; });
  }

  function novoPar(id) {
    const pc = new RTCPeerConnection({ iceServers: STUN });
    const par = { pc, audio: null, an: null, dados: null, fila: [], nivel: 0 };
    pares.set(id, par);
    for (const t of local.getTracks()) pc.addTrack(t, local);
    pc.onicecandidate = (e) => { if (e.candidate) enviar(id, { tipo: 'candidato', candidato: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const stream = e.streams[0] || new MediaStream([e.track]);
      if (!par.audio) {
        par.audio = document.createElement('audio');
        par.audio.autoplay = true;
        par.audio.setAttribute('playsinline', '');
        par.audio.hidden = true;
        document.body.appendChild(par.audio);
      }
      par.audio.srcObject = stream;
      par.audio.play().catch(() => { /* toca no próximo toque */ });
      const a = analisador(stream);
      par.an = a.an; par.dados = a.dados;
    };
    return par;
  }

  async function oferecer(id) {
    const par = pares.get(id) || novoPar(id);
    const oferta = await par.pc.createOffer();
    await par.pc.setLocalDescription(oferta);
    enviar(id, { tipo: 'oferta', sdp: par.pc.localDescription.toJSON() });
  }

  function remover(id) {
    const par = pares.get(id);
    if (!par) return;
    try { par.pc.close(); } catch { /* já fechou */ }
    if (par.audio) { par.audio.srcObject = null; par.audio.remove(); }
    pares.delete(id);
  }

  // Candidatos podem chegar antes da descrição remota: guardam-se na fila e
  // entram depois — sem isso, os primeiros se perdiam e a ligação não fechava.
  async function candidato(par, c) {
    if (!par.pc.remoteDescription) { par.fila.push(c); return; }
    try { await par.pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* candidato velho */ }
  }
  async function esvaziaFila(par) {
    const fila = par.fila; par.fila = [];
    for (const c of fila) await candidato(par, c);
  }

  async function receber(msg) {
    const de = msg.from; const d = msg.dados || {};
    if (!de || de === eu()) return;
    if (d.tipo === 'tchau') { remover(de); return; }
    if (!local) return;   // sem microfone ligado, não entra na roda
    if (d.tipo === 'oi') {
      if (pares.has(de)) return;
      if (String(eu()) < String(de)) await oferecer(de);
      else enviar(de, { tipo: 'oi' });
      return;
    }
    if (d.tipo === 'oferta' && d.sdp) {
      remover(de);   // oferta nova recomeça do zero
      const par = novoPar(de);
      await par.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      await esvaziaFila(par);
      const resposta = await par.pc.createAnswer();
      await par.pc.setLocalDescription(resposta);
      enviar(de, { tipo: 'resposta', sdp: par.pc.localDescription.toJSON() });
      return;
    }
    const par = pares.get(de);
    if (!par) return;
    if (d.tipo === 'resposta' && d.sdp) {
      await par.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
      await esvaziaFila(par);
      return;
    }
    if (d.tipo === 'candidato' && d.candidato) await candidato(par, d.candidato);
  }

  function nivel(id) {
    if (id === eu()) return (meuAn && !mudo) ? mede(meuAn, meusDados) : 0;
    const par = pares.get(id);
    if (!par || !par.an) return 0;
    par.nivel = mede(par.an, par.dados);
    return par.nivel;
  }
  const falando = (id) => nivel(id) > LIMIAR_FALA;
  const estadoDe = (id) => pares.get(id)?.pc.connectionState || null;

  return {
    ligar, desligar, silenciar, receber, remover, nivel, falando, estadoDe,
    ligado: () => !!local,
    get mudo() { return mudo; },
    get quantos() { return pares.size; },
  };
}
