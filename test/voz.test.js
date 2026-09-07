// Testes deterministas do modulo real, com DOM, microfone e WebRTC simulados.
// Nao substituem navegadores reais, audio fisico ou travessia de NAT/TURN.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const fonte = fs.readFileSync(new URL('../public/voz.js', import.meta.url), 'utf8');
const tick = async () => { for (let i = 0; i < 35; i++) await Promise.resolve(); };
const espera = () => { let resolve, reject; const p = new Promise((r, j) => { resolve = r; reject = j; }); return { p, resolve, reject }; };
const sdp = (type, uf = 'remote') => ({ type, sdp: `v=0\r\na=ice-ufrag:${uf}\r\n` });
const cand = (uf = 'remote') => ({ candidate: 'candidate:1 1 udp 1 192.0.2.1 1234 typ host', sdpMid: '0', usernameFragment: uf });
function ambiente(id = 'b', opts = {}) {
  let now = 100000, seq = 0, meuId = id, pedido = 0;
  const pcs = [], audios = [], contexts = [], nodes = [], streams = [], saida = [], timers = new Map();
  const eventos = () => {
    const listeners = new Map();
    return { listeners,
      addEventListener(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
      removeEventListener(k, fn) { listeners.get(k)?.delete(fn); },
      dispatch(k) { for (const fn of [...(listeners.get(k) || [])]) fn(); },
    };
  };
  function stream() {
    const track = { enabled: true, readyState: 'live', onended: null,
      stop() { this.readyState = 'ended'; }, };
    const s = { track, getTracks: () => [track], getAudioTracks: () => opts.empty ? [] : [track] };
    streams.push(s); return s;
  }
  const document = { ...eventos(), visibilityState: 'visible', body: { appendChild() {} },
    createElement(tag) {
      assert.equal(tag, 'audio');
      const a = { paused: true, tries: 0, removed: false, reject: true, srcObject: null,
        setAttribute() {}, pause() { this.paused = true; }, remove() { this.removed = true; },
        play() { this.tries++; if (this.reject) return Promise.reject(new Error('autoplay')); this.paused = false; return Promise.resolve(); },
      }; audios.push(a); return a;
    },
  };
  class AudioContext {
    constructor() { this.state = 'suspended'; contexts.push(this); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createMediaStreamSource() { if (opts.analyserFail) throw Error('optional'); const n = { connect() {}, disconnect() { this.closed = true; } }; nodes.push(n); return n; }
    createAnalyser() { const n = { disconnect() { this.closed = true; }, getByteTimeDomainData(a) { a.fill(132); } }; nodes.push(n); return n; }
  }
  class PC {
    constructor(config) {
      this.config = config; this.signalingState = 'stable'; this.connectionState = 'new';
      this.iceConnectionState = 'new'; this.remoteDescription = null; this.localDescription = null;
      this.candidates = []; this.offers = []; this.remoteCalls = []; this.rollbacks = 0;
      pcs.push(this);
    }
    addTrack() { if (opts.addTrackFail) throw new Error('addTrack failed'); }
    async createOffer(o) { this.offers.push(o); if (opts.offerGate) await opts.offerGate.p; return sdp('offer', `${id}-${++seq}`); }
    async createAnswer() { assert.equal(this.signalingState, 'have-remote-offer'); return sdp('answer', `${id}-${++seq}`); }
    async setLocalDescription(d) {
      if (d.type === 'rollback') { assert.equal(this.signalingState, 'have-local-offer'); this.rollbacks++; this.signalingState = 'stable'; this.localDescription = null; return; }
      assert.equal(this.signalingState, d.type === 'offer' ? 'stable' : 'have-remote-offer');
      this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
      this.localDescription = { ...d, toJSON() { return { type: this.type, sdp: this.sdp }; } };
      if (opts.earlyIce) this.onicecandidate?.({ candidate: cand(d.sdp.match(/ice-ufrag:([^\r\n]+)/)[1]) });
      await Promise.resolve();
    }
    async setRemoteDescription(d) {
      if (opts.remoteGate) await opts.remoteGate.p;
      assert.equal(this.signalingState, d.type === 'offer' ? 'stable' : 'have-local-offer');
      this.remoteCalls.push(d); this.remoteDescription = d;
      this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
    }
    async addIceCandidate(c) { assert.ok(this.remoteDescription, 'ICE antes do SDP'); this.candidates.push(c); }
    state(s) { this.connectionState = s; this.iceConnectionState = s; this.onconnectionstatechange?.(); }
    close() { this.signalingState = 'closed'; this.connectionState = 'closed'; }
  }
  const window = { ...eventos(), AudioContext };
  const schedule = (fn, delay, repeat = false) => { const n = ++seq; timers.set(n, { at: now + delay, fn, delay, repeat }); return n; };
  const context = vm.createContext({ console, document, window, RTCPeerConnection: PC,
    MediaStream: class { constructor(tracks) { this.getTracks = this.getAudioTracks = () => tracks; } },
    navigator: { mediaDevices: { getUserMedia() { pedido++; return opts.permission ? opts.permission.p : Promise.resolve(stream()); } } },
    crypto: { randomUUID: () => `${id}-nonce-${++seq}` }, Date: { now: () => now },
    setTimeout: (fn, d) => schedule(fn, d), clearTimeout: (n) => timers.delete(n),
    setInterval: (fn, d) => schedule(fn, d, true), clearInterval: (n) => timers.delete(n),
  });
  vm.runInContext(fonte.replace('export function criaVoz', 'function criaVoz') + '\nglobalThis.fabrica = criaVoz;', context);
  const voz = context.fabrica({ meuId: () => meuId, enviar: (to, dados) => { saida.push({ from: meuId, to, dados }); }, ...(opts.iceServers ? { iceServers: opts.iceServers } : {}) });
  return { voz, pcs, audios, contexts, nodes, streams, saida, timers, document, window, stream,
    get pedidos() { return pedido; }, setId(x) { meuId = x; },
    async avanca(ms) { const end = now + ms; let safety = 0;
      while (true) { const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break;
        assert.ok(++safety < 300, 'loop de timers'); const [n, t] = next; now = t.at;
        if (t.repeat) t.at += t.delay; else timers.delete(n); t.fn(); await tick();
      } now = end; await tick();
    },
    msg(tipo, campos = {}, from = 'a') { return voz.receber({ from, dados: { tipo, ...campos } }); },
  };
}
async function rede(...envs) {
  let count = 0;
  while (envs.some((e) => e.saida.length)) {
    assert.ok(++count < 300, 'eco infinito');
    for (const e of envs) for (const msg of e.saida.splice(0)) {
      for (const outro of envs) if (outro !== e && (msg.to === '*' || msg.to === outro.id)) await outro.voz.receber(msg);
    }
    await tick();
  }
}
const iniciar = async (t, id = 'b', opts) => { const e = ambiente(id, opts); t.after(() => e.voz.desligar()); await e.voz.ligar(); return e; };

test('toques simultaneos pedem apenas um microfone e criam contexto antes da permissao', async (t) => {
  const permission = espera(), e = ambiente('b', { permission }); t.after(() => e.voz.desligar());
  const p = e.voz.ligar(); assert.equal(e.voz.ligar(), p); assert.equal(e.pedidos, 1);
  assert.equal(e.contexts[0].state, 'running'); permission.resolve(e.stream()); await p; assert.ok(e.voz.ligado());
});
test('desligar durante a permissao impede captura tardia', async () => {
  const permission = espera(), e = ambiente('b', { permission }); const p = e.voz.ligar();
  e.voz.desligar(); const s = e.stream(); permission.resolve(s); await p;
  assert.equal(s.track.readyState, 'ended'); assert.equal(e.voz.ligado(), false); assert.equal(e.timers.size, 0);
});
test('permissao negada fecha contexto e informa erro compreensivel', async () => {
  const permission = espera(), e = ambiente('b', { permission }); const p = e.voz.ligar();
  permission.reject({ name: 'NotAllowedError' }); await assert.rejects(p, /Permita o microfone/);
  assert.equal(e.contexts[0].state, 'closed'); assert.equal(e.voz.ligado(), false);
});
test('mudanca de identidade cancela microfone e conexoes anteriores', async (t) => {
  const e = await iniciar(t); await e.msg('oi'); e.setId('outro'); assert.equal(e.voz.ligado(), false);
  assert.equal(e.streams[0].track.readyState, 'ended'); assert.equal(e.voz.quantos, 0);
});
test('mute nao recria a captura e desmute restaura a trilha', async (t) => {
  const e = await iniciar(t); e.voz.silenciar(true); assert.equal(e.streams[0].track.enabled, false);
  assert.equal(e.voz.nivel('b'), 0); e.voz.silenciar(false); assert.equal(e.streams[0].track.enabled, true); assert.equal(e.pedidos, 1);
});
test('ICE recebido antes da oferta e mantido ate o SDP', async (t) => {
  const e = await iniciar(t); await e.msg('candidato', { candidato: cand() }); assert.equal(e.pcs[0].candidates.length, 0);
  await e.msg('oferta', { sdp: sdp('offer') }); assert.equal(e.pcs[0].candidates.length, 1);
  assert.equal(e.saida.filter((m) => m.dados.tipo === 'resposta').length, 1);
});
test('SDP demorado e candidatos concorrentes sao serializados', async (t) => {
  const remoteGate = espera(), e = await iniciar(t, 'b', { remoteGate });
  const a = e.msg('oferta', { sdp: sdp('offer') }); const b = e.msg('candidato', { candidato: cand() });
  await tick(); assert.equal(e.pcs[0].candidates.length, 0); remoteGate.resolve(); await Promise.all([a, b]);
  assert.equal(e.pcs[0].candidates.length, 1); assert.equal(e.voz.diagnostico()[0].erro, null);
});
test('pares simulados negociam com candidatos emitidos antes de finalizar setLocalDescription', async (t) => {
  const a = await iniciar(t, 'a', { earlyIce: true }), b = await iniciar(t, 'b', { earlyIce: true }); a.id = 'a'; b.id = 'b';
  await rede(a, b); assert.equal(a.pcs[0].signalingState, 'stable'); assert.equal(b.pcs[0].signalingState, 'stable');
  assert.equal(a.pcs[0].candidates.length, 1); assert.equal(b.pcs[0].candidates.length, 1);
});
test('autoplay recusado tenta novamente no toque e limpa audio e medidores', async (t) => {
  const e = await iniciar(t); await e.msg('oi'); e.pcs[0].ontrack({ streams: [e.stream()] }); await tick();
  assert.equal(e.voz.diagnostico()[0].audioBloqueado, true); e.audios[0].reject = false;
  e.document.dispatch('pointerdown'); await tick(); assert.equal(e.audios[0].tries, 2);
  assert.equal(e.voz.diagnostico()[0].audioBloqueado, false); e.voz.desligar();
  assert.equal(e.audios[0].srcObject, null); assert.ok(e.audios[0].removed);
  assert.ok(e.nodes.every((n) => n.closed)); assert.equal(e.timers.size, 0);
  assert.ok([...e.document.listeners.values()].every((s) => s.size === 0));
});
test('falha ICE reinicia pelo lider com limite de tentativas', async (t) => {
  const e = await iniciar(t, 'a'); await e.msg('oi', {}, 'b'); e.pcs[0].state('failed');
  await e.avanca(90000); assert.equal(e.pcs[0].offers.filter((o) => o?.iceRestart).length, 3);
  assert.equal(e.voz.diagnostico()[0].tentativas, 3);
});
test('interrupcao breve recuperada nao reinicia ICE desnecessariamente', async (t) => {
  const e = await iniciar(t, 'a'); await e.msg('oi', {}, 'b'); const pc = e.pcs[0];
  pc.state('connected'); pc.state('disconnected'); await e.avanca(1000); pc.state('connected'); await e.avanca(10000);
  assert.equal(pc.offers.length, 1);
});
test('retorno a pagina recupera descoberta sem recapturar microfone', async (t) => {
  const e = await iniciar(t); e.saida.length = 0; e.document.dispatch('visibilitychange');
  assert.ok(e.saida.some((m) => m.dados.tipo === 'oi')); assert.equal(e.pedidos, 1);
});
test('pagehide desliga e trilha interrompida tambem limpa recursos', async (t) => {
  const e = await iniciar(t); e.window.dispatch('pagehide'); assert.equal(e.voz.ligado(), false);
  await e.voz.ligar(); e.streams.at(-1).track.onended(); assert.equal(e.voz.ligado(), false); assert.equal(e.timers.size, 0);
});
test('suporta configuracao ICE externa sem embutir credenciais', async (t) => {
  const iceServers = [{ urls: 'turn:example.invalid', username: 'test', credential: 'test-only' }];
  const e = await iniciar(t, 'b', { iceServers }); await e.msg('oi'); assert.equal(e.pcs[0].config.iceServers, iceServers);
  assert.ok(!JSON.stringify(e.voz.diagnostico()).includes('credential'));
});
test('mensagens invalidas nao criam pares', async (t) => {
  const e = await iniciar(t); await e.msg('oferta', { sdp: { type: 'answer', sdp: '' } }); await e.msg('candidato', {});
  await e.msg('unknown'); await e.voz.receber(null); assert.equal(e.voz.quantos, 0);
});
test('limita pares e candidatos pendentes', async (t) => {
  const e = await iniciar(t); for (let i = 0; i < 140; i++) await e.msg('candidato', { candidato: cand() });
  await e.msg('oferta', { sdp: sdp('offer') }); assert.equal(e.pcs[0].candidates.length, 128);
  for (let i = 0; i < 20; i++) await e.msg('oi', {}, `p${i}`); assert.equal(e.voz.quantos, 8);
});
test('desligar durante createOffer impede envio tardio', async (t) => {
  const offerGate = espera(), e = await iniciar(t, 'a', { offerGate }); const p = e.msg('oi', {}, 'b');
  await tick(); e.voz.desligar(); offerGate.resolve(); await p;
  assert.equal(e.saida.filter((m) => m.dados.tipo === 'oferta').length, 0);
});
test('falha no analisador nao impede voz', async (t) => {
  const e = await iniciar(t, 'b', { analyserFail: true }); await e.msg('oferta', { sdp: sdp('offer') });
  assert.ok(e.voz.ligado()); assert.equal(e.voz.nivel('b'), 0); assert.equal(e.pcs[0].signalingState, 'stable');
});
test('falha ao adicionar trilha nao deixa peer vazando', async (t) => {
  const e = await iniciar(t, 'b', { addTrackFail: true }); await e.msg('oi');
  assert.equal(e.voz.quantos, 0); assert.equal(e.pcs[0].connectionState, 'closed');
});
test('saudacao de sessao aposentada nao derruba sessao nova', async (t) => {
  const e = await iniciar(t); await e.msg('oi', { sessao: 'old' }); await e.msg('oi', { sessao: 'new' });
  const pc = e.pcs.at(-1); await e.msg('oi', { sessao: 'old' }); await e.msg('tchau', { sessao: 'old' });
  assert.equal(pc.connectionState, 'new'); assert.equal(e.voz.quantos, 1);
});
test('microfone sem trilha de audio nao e marcado como ligado', async () => {
  const e = ambiente('b', { empty: true }); await assert.rejects(e.voz.ligar()); assert.equal(e.voz.ligado(), false);
});
test('resposta atrasada de negociacao anterior nao encerra nova oferta', async (t) => {
  const e = await iniciar(t, 'a'); await e.msg('oi', { sessao: 'remote-session' }, 'b');
  const old = e.saida.find((m) => m.dados.tipo === 'oferta').dados.negociacao;
  await e.avanca(8000);
  const nova = e.saida.filter((m) => m.dados.tipo === 'oferta').at(-1).dados.negociacao;
  assert.notEqual(old, nova);
  await e.msg('resposta', { sessao: 'remote-session', negociacao: old, sdp: sdp('answer') }, 'b');
  assert.equal(e.pcs[0].remoteDescription, null);
  await e.msg('resposta', { sessao: 'remote-session', negociacao: nova, sdp: sdp('answer') }, 'b');
  assert.equal(e.pcs[0].signalingState, 'stable');
});
test('pacote destinado ao microfone anterior e descartado apos religar', async (t) => {
  const e = await iniciar(t); const old = e.saida[0].dados.sessao;
  e.voz.desligar(); await e.voz.ligar();
  await e.msg('oferta', { para: old, sdp: sdp('offer') }); assert.equal(e.voz.quantos, 0);
});
test('ICE de geracao anterior nao e aplicado ao SDP atual', async (t) => {
  const e = await iniciar(t); await e.msg('candidato', { candidato: cand('obsolete') });
  await e.msg('candidato', { candidato: cand('current') }); await e.msg('oferta', { sdp: sdp('offer', 'current') });
  assert.equal(e.pcs[0].candidates.length, 1); assert.equal(e.pcs[0].candidates[0].usernameFragment, 'current');
});
test('valida comprimento de identificadores, SDP e candidatos', async (t) => {
  const e = await iniciar(t); await e.msg('oi', { sessao: 'x'.repeat(129) });
  await e.msg('oi', {}, 'x'.repeat(129)); await e.msg('oferta', { sdp: { type: 'offer', sdp: 'x'.repeat(64001) } });
  await e.msg('candidato', { candidato: { candidate: 'x'.repeat(8193) } }); assert.equal(e.voz.quantos, 0);
});
test('descoberta periodica reconcilia perda inicial de sinalizacao', async (t) => {
  const a = await iniciar(t, 'a', { earlyIce: true }), b = await iniciar(t, 'b', { earlyIce: true }); a.id = 'a'; b.id = 'b';
  a.saida.length = 0; b.saida.length = 0;
  await a.avanca(15000); await b.avanca(15000); await rede(a, b);
  assert.equal(a.pcs[0].signalingState, 'stable'); assert.equal(b.pcs[0].signalingState, 'stable');
});
test('saudacao repetida nao duplica ofertas em andamento', async (t) => {
  const e = await iniciar(t, 'a'); await Promise.all(Array.from({ length: 10 }, () => e.msg('oi', { sessao: 'r' }, 'b')));
  assert.equal(e.pcs.length, 1); assert.equal(e.pcs[0].offers.length, 1);
});
