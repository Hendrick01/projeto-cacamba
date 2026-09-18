// ============================================================================
// O SELO DA SALA — a partida sobrevive ao reinício do servidor SEM banco.
//
// As salas vivem na memória. Todo deploy (e o plano gratuito, que hiberna)
// reinicia o processo e derrubava quem estivesse jogando. Em produção não há
// banco ligado (17/09/2026: /eu.json responde 503), e o disco do Render é
// descartado a cada subida — então quem guarda a sala são OS JOGADORES.
//
// A cada passagem de vez o servidor entrega a cada humano um RETRATO da sala
// inteira (mãos, monte, placar), comprimido, CIFRADO e AUTENTICADO com uma
// chave que só o servidor tem (AES-256-GCM). O cliente não consegue ler as
// cartas dos outros nem forjar um estado: só devolver, intacto, o que recebeu.
// Quando o servidor volta e não conhece a sala, o primeiro jogador que
// reconecta devolve o retrato e a sala renasce onde parou.
//
// A chave tem de ser a MESMA antes e depois do reinício:
//   SEGREDO_SALAS  → se você quiser fixar uma;
//   SEGREDO_SESSAO → a da loja, quando existir;
//   RENDER_SERVICE_ID → o Render define sozinho, é estável e não é público;
//   senão (na sua máquina) → um segredo sorteado e guardado na pasta
//   temporária do sistema, por projeto.
// ============================================================================
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROTULO = Buffer.from('cacamba-sala-v1');

export function chaveDasSalas(env = process.env, pasta = process.cwd()) {
  let base = env.SEGREDO_SALAS || env.SEGREDO_SESSAO || env.RENDER_SERVICE_ID || '';
  if (!base) {
    const arquivo = path.join(os.tmpdir(), `cacamba-segredo-salas-${crypto.createHash('sha1').update(pasta).digest('hex').slice(0, 12)}`);
    try { base = fs.readFileSync(arquivo, 'utf8').trim(); } catch { /* primeira vez */ }
    if (!base) {
      base = crypto.randomBytes(32).toString('hex');
      try { fs.writeFileSync(arquivo, base, { mode: 0o600 }); } catch { /* sem disco: vale só até reiniciar */ }
    }
  }
  return crypto.createHash('sha256').update('cacamba/selo-da-sala/').update(base).digest();
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (txt) => Buffer.from(txt.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function sela(objeto, chave) {
  const claro = zlib.gzipSync(Buffer.from(JSON.stringify(objeto)), { level: 9 });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
  c.setAAD(ROTULO);
  const cifrado = Buffer.concat([c.update(claro), c.final()]);
  return b64url(Buffer.concat([iv, c.getAuthTag(), cifrado]));
}

// Devolve o objeto, ou null para QUALQUER coisa errada — selo de outra chave,
// adulterado, truncado, lixo. Quem chama não precisa saber qual foi.
export function abre(selo, chave) {
  try {
    if (typeof selo !== 'string' || selo.length < 40 || selo.length > 20000) return null;
    const bruto = deB64url(selo);
    const d = crypto.createDecipheriv('aes-256-gcm', chave, bruto.subarray(0, 12));
    d.setAAD(ROTULO);
    d.setAuthTag(bruto.subarray(12, 28));
    const claro = Buffer.concat([d.update(bruto.subarray(28)), d.final()]);
    const json = zlib.gunzipSync(claro, { maxOutputLength: 2 * 1024 * 1024 });
    return JSON.parse(json.toString('utf8'));
  } catch { return null; }
}
