// Limites compartilhados pelo servidor e pelos testes, sem estado do jogo.
import net from 'node:net';
export function consume(bucket, capacity, perSecond, now = Date.now()) {
  bucket.tokens = Math.min(capacity, (bucket.tokens ?? capacity) + Math.max(0, now - (bucket.at ?? now)) * perSecond / 1000);
  bucket.at = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens--;
  return true;
}
export function clientIp(req, trustProxy = false) {
  // O proxy mais próximo acrescenta o IP observado à DIREITA. O primeiro
  // valor pode ter sido enviado pelo próprio cliente; nunca serve de limite.
  const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',').at(-1)?.trim() : '';
  return net.isIP(forwarded) ? forwarded : req.socket?.remoteAddress || '?';
}
export function validOrigin(req, publicUrl = '') {
  const origin = req.headers.origin;
  if (!origin) return !publicUrl; // apenas ferramentas locais; produção exige Origin
  try {
    const actual = new URL(origin);
    if (!['http:', 'https:'].includes(actual.protocol) || actual.origin !== origin) return false;
    if (publicUrl) return actual.origin === new URL(publicUrl).origin;
    return actual.host === req.headers.host;
  } catch { return false; }
}
export function validMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return false;
  if (msg.t === 'action') return !!msg.action && typeof msg.action === 'object' && !Array.isArray(msg.action) && typeof msg.action.a === 'string';
  // presença: só dois inteiros pequenos (ou nada). Índice da carta escolhida na
  // mão de quem manda, e índice da cadeira para onde ele olha. Nada de texto.
  if (msg.t === 'presenca') {
    const ok = (v, max) => v == null || (Number.isInteger(v) && v >= 0 && v <= max);
    return ok(msg.sel, 40) && ok(msg.olha, 15);
  }
  // restaura: o retrato cifrado da sala, devolvido pelo cliente depois de um
  // reinício. Só base64url, e do tamanho que o servidor entrega.
  if (msg.t === 'restaura') {
    return typeof msg.selo === 'string' && msg.selo.length >= 40 && msg.selo.length <= 15000 && /^[A-Za-z0-9_-]+$/.test(msg.selo)
      && typeof msg.playerId === 'string' && msg.playerId.length <= 64 && typeof msg.token === 'string' && msg.token.length <= 64;
  }
  // emote: só a CHAVE de um catálogo fechado (shared/emotes.js). Texto livre
  // não passa daqui — é o que dispensa moderação.
  if (msg.t === 'emote') return typeof msg.k === 'string' && /^[a-z0-9-]{1,24}$/.test(msg.k);
  return true;
}
