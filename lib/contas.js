// ============================================================================
// Contas — entrar sem senha, e quem pode comprar.
//
// NÃO EXISTE SENHA NESTE ARQUIVO, e isso é a decisão de segurança principal do
// projeto, não uma economia de trabalho. Senha guardada é senha que vaza; senha
// escolhida por gente é senha repetida do banco; senha esquecida é suporte às
// duas da manhã. O que existe é um link de uso único no e-mail: a prova de que
// a pessoa é dona da caixa de entrada, que é a mesma prova que o "esqueci minha
// senha" de qualquer site usa no fim das contas — só que sem o teatro no meio.
//
// O token viaja no e-mail e mora no banco apenas como hash. Um vazamento do
// banco entrega hashes de links que já expiraram, e nada mais.
//
// A metade de cima do arquivo é pura: idade e assinatura de cookie não tocam
// banco e se testam sozinhas, como o lib/security.js. A metade de baixo fala
// com o Postgres e devolve `null` quando não há banco — o jogo não depende
// disto para existir.
// ============================================================================
import crypto from 'node:crypto';
import { sql, temBanco } from './banco.js';

export const DURACAO_LINK_MIN = 15;
export const DURACAO_SESSAO_DIAS = 60;

// ---------------------------------------------------------------------------
// A parte pura
// ---------------------------------------------------------------------------

// Idade em anos completos. Feita na mão porque a conta certa é "o aniversário
// deste ano já passou?", e qualquer atalho com 365,25 erra em fevereiro.
export function idadeEm(nascimento, hoje = new Date()) {
  const n = nascimento instanceof Date ? nascimento : new Date(`${nascimento}T00:00:00Z`);
  if (Number.isNaN(n.getTime())) return null;
  let anos = hoje.getUTCFullYear() - n.getUTCFullYear();
  const mes = hoje.getUTCMonth() - n.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoje.getUTCDate() < n.getUTCDate())) anos--;
  return anos;
}

// A trava de idade, e o porquê de cada faixa:
//
//   < 16  — absolutamente incapaz (Código Civil, art. 3º). Compra feita aqui é
//           NULA, e o responsável desfaz quando quiser. Não é risco de imagem:
//           é dinheiro que volta com custo de estorno em cima.
//   16–17 — relativamente incapaz (art. 4º): o ato vale se assistido. Por isso
//           16 e 17 anos compram COM confirmação do responsável, e a
//           confirmação fica registrada com data e IP — é ela que se mostra
//           quando alguém contesta meses depois.
//   >= 18 — livre.
//
// Perguntar a data e não uma caixinha de "declaro ter 18 anos" é de propósito:
// a caixinha não protege ninguém e não vale nada numa contestação.
export function avaliaIdade(nascimento, hoje = new Date()) {
  const anos = idadeEm(nascimento, hoje);
  if (anos === null || anos < 0 || anos > 120) {
    return { ok: false, precisaResponsavel: false, motivo: 'Confira a data de nascimento.' };
  }
  if (anos < 16) {
    return {
      ok: false,
      precisaResponsavel: false,
      motivo: 'A loja é para maiores de 16 anos. O jogo continua inteiro e de graça para você.',
    };
  }
  if (anos < 18) {
    return {
      ok: false,
      precisaResponsavel: true,
      motivo: 'Até os 18, a compra precisa da confirmação de quem é responsável por você.',
    };
  }
  return { ok: true, precisaResponsavel: false, motivo: '' };
}

// E-mail normalizado para comparar. Não valida de verdade (só a entrega valida
// um e-mail), mas barra o que nunca chegaria e o que estouraria a coluna.
export function normalizaEmail(bruto) {
  const email = String(bruto || '').trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return '';
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return '';
  return email;
}

// O segredo que assina o cookie. Sem SEGREDO_SESSAO no ambiente, sorteia um na
// subida: as sessões morrem a cada reinício, o que é chato mas honesto — o
// contrário seria assinar com um segredo previsível e chamar isso de sessão.
const SEGREDO = process.env.SEGREDO_SESSAO || crypto.randomBytes(32).toString('hex');
export const segredoEfemero = !process.env.SEGREDO_SESSAO;

const hash = (texto) => crypto.createHash('sha256').update(String(texto)).digest('hex');

export function assinaCookie(sessaoId) {
  const marca = crypto.createHmac('sha256', SEGREDO).update(String(sessaoId)).digest('base64url');
  return `${sessaoId}.${marca}`;
}

// Confere a assinatura em tempo constante. O id sozinho não vale nada sem a
// marca, então quem adivinhar um uuid ainda não entra.
export function abreCookie(valor) {
  const bruto = String(valor || '');
  const corte = bruto.lastIndexOf('.');
  if (corte < 1) return null;
  const id = bruto.slice(0, corte);
  const esperado = crypto.createHmac('sha256', SEGREDO).update(id).digest('base64url');
  const veio = Buffer.from(bruto.slice(corte + 1));
  const deve = Buffer.from(esperado);
  if (veio.length !== deve.length || !crypto.timingSafeEqual(veio, deve)) return null;
  return id;
}

// ---------------------------------------------------------------------------
// A parte que fala com o banco. Tudo devolve null sem DATABASE_URL.
// ---------------------------------------------------------------------------

// Pede o link de entrada. Devolve o token EM CLARO uma única vez — quem chama
// põe no e-mail e esquece; o banco só conhece o hash dele.
export async function pedeEntrada(emailBruto, nascimento, ip) {
  if (!temBanco) return null;
  const email = normalizaEmail(emailBruto);
  if (!email) return { erro: 'E-mail inválido.' };

  const [conta] = await sql`
    INSERT INTO contas (email, nascimento)
    VALUES (${email}, ${nascimento || null})
    ON CONFLICT (email) DO UPDATE
      -- Só preenche o nascimento se ainda não havia: a data não se reescreve
      -- por um pedido de login, senão a trava de idade viraria enfeite.
      SET nascimento = COALESCE(contas.nascimento, EXCLUDED.nascimento)
    RETURNING id, email, nascimento, responsavel_em`;

  const token = crypto.randomBytes(32).toString('base64url');
  await sql`
    INSERT INTO links_magicos (token_hash, conta_id, expira_em, pedido_de)
    VALUES (${hash(token)}, ${conta.id}, now() + ${`${DURACAO_LINK_MIN} minutes`}::interval, ${ip || null})`;
  return { token, conta };
}

// Gasta o link e abre a sessão. O UPDATE ... WHERE usado_em IS NULL é o que
// torna o uso único de verdade: se dois cliques chegarem juntos, o banco deixa
// só um passar, e não a ordem em que o Node acordou.
export async function consomeLink(token) {
  if (!temBanco) return null;
  const [link] = await sql`
    UPDATE links_magicos SET usado_em = now()
    WHERE token_hash = ${hash(token)} AND usado_em IS NULL AND expira_em > now()
    RETURNING conta_id`;
  if (!link) return null;

  const [sessao] = await sql`
    INSERT INTO sessoes (conta_id, expira_em)
    VALUES (${link.conta_id}, now() + ${`${DURACAO_SESSAO_DIAS} days`}::interval)
    RETURNING id`;
  await sql`UPDATE contas SET ultimo_acesso = now() WHERE id = ${link.conta_id}`;
  return { sessaoId: sessao.id, contaId: link.conta_id };
}

// Quem é o dono deste cookie. Devolve a conta já com o inventário, porque é
// sempre isso que quem pergunta quer saber em seguida.
export async function contaDaSessao(cookie) {
  if (!temBanco) return null;
  const id = abreCookie(cookie);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;

  const [conta] = await sql`
    SELECT c.id, c.email, c.nascimento, c.responsavel_em, c.anonimizada_em
    FROM sessoes s JOIN contas c ON c.id = s.conta_id
    WHERE s.id = ${id} AND s.encerrada_em IS NULL AND s.expira_em > now()`;
  if (!conta || conta.anonimizada_em) return null;

  await sql`UPDATE sessoes SET ultimo_uso = now() WHERE id = ${id}`;
  const itens = await sql`SELECT sku FROM inventario WHERE conta_id = ${conta.id}`;
  return { ...conta, inventario: itens.map((i) => i.sku) };
}

export async function encerra(cookie) {
  if (!temBanco) return false;
  const id = abreCookie(cookie);
  if (!id) return false;
  await sql`UPDATE sessoes SET encerrada_em = now() WHERE id = ${id}`;
  return true;
}

// O direito de exclusão da LGPD, sem atropelar os cinco anos que a Receita
// pede. Apaga o que identifica; deixa as compras apontando para um id que não
// diz mais quem é.
export async function anonimiza(contaId) {
  if (!temBanco) return false;
  await sql`
    UPDATE contas
    SET email = ${`apagado-${crypto.randomUUID()}@invalido`},
        nascimento = NULL, responsavel_email = NULL, responsavel_ip = NULL,
        anonimizada_em = now()
    WHERE id = ${contaId}`;
  await sql`DELETE FROM sessoes WHERE conta_id = ${contaId}`;
  await sql`DELETE FROM links_magicos WHERE conta_id = ${contaId}`;
  return true;
}
