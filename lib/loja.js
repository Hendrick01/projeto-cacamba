// ============================================================================
// A loja do lado do servidor — creditar e revogar.
//
// A REGRA: só se credita a partir de webhook com assinatura conferida. Nunca a
// partir de um "voltei da página de sucesso", que é só uma URL que qualquer um
// digita.
//
// A IDEMPOTÊNCIA MORA NO BANCO, não aqui. `ON CONFLICT (plataforma, evento_id)
// DO NOTHING` faz o segundo aviso do mesmo pagamento não virar segunda skin —
// e gateway reenvia por projeto, sempre que a resposta demora. Se a trava
// dependesse de um `if` neste arquivo, bastariam dois webhooks chegando no
// mesmo milissegundo para furá-la; com a restrição no banco, um dos dois perde.
//
// SOBRE O E-MAIL: quem compra na Kiwify usa o e-mail que quiser, e ele pode não
// ser o da conta no jogo. Então a compra CRIA a conta daquele e-mail se ela não
// existir, e a pessoa entra depois com ele e acha a skin lá. É por isso que a
// loja avisa, antes do checkout, para usar o mesmo e-mail.
// ============================================================================
import { sql, temBanco } from './banco.js';
import { normalizaEmail } from './contas.js';

export async function credita({ email, sku, centavos, plataforma, eventoId }) {
  if (!temBanco) return { ok: false, motivo: 'sem banco' };
  const limpo = normalizaEmail(email);
  if (!limpo || !sku || !eventoId) return { ok: false, motivo: 'evento incompleto' };

  const [conta] = await sql`
    INSERT INTO contas (email) VALUES (${limpo})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id`;

  const [compra] = await sql`
    INSERT INTO compras (conta_id, sku, centavos, plataforma, evento_id, status)
    VALUES (${conta.id}, ${sku}, ${centavos || 0}, ${plataforma}, ${String(eventoId)}, 'paga')
    ON CONFLICT (plataforma, evento_id) DO NOTHING
    RETURNING id`;

  // Sem linha devolvida, este evento já tinha sido processado. Não é erro: é a
  // trava funcionando, e a resposta ao gateway continua sendo 200 para ele
  // parar de reenviar.
  if (!compra) return { ok: true, repetido: true, contaId: conta.id };

  await sql`
    INSERT INTO inventario (conta_id, sku, origem, compra_id)
    VALUES (${conta.id}, ${sku}, 'compra', ${compra.id})
    ON CONFLICT (conta_id, sku) DO NOTHING`;

  return { ok: true, repetido: false, contaId: conta.id, sku };
}

// Estorno tira a posse e deixa a venda no histórico — a fiscal pede os cinco
// anos, e apagar venda estornada é o buraco que só aparece quando alguém pede
// extrato.
export async function revoga({ plataforma, eventoId }) {
  if (!temBanco) return { ok: false };
  const [compra] = await sql`
    UPDATE compras SET status = 'estornada', estornada_em = now()
    WHERE plataforma = ${plataforma} AND evento_id = ${String(eventoId)} AND status = 'paga'
    RETURNING id, conta_id, sku`;
  if (!compra) return { ok: true, repetido: true };

  await sql`DELETE FROM inventario WHERE conta_id = ${compra.conta_id} AND sku = ${compra.sku}`;
  return { ok: true, repetido: false, contaId: compra.conta_id, sku: compra.sku };
}

// Guarda o que chegou, cru, antes de qualquer interpretação — inclusive o que
// foi RECUSADO por assinatura. É a única forma de responder "por que fulano não
// recebeu" semanas depois, e é o que vai revelar o formato real do payload da
// Kiwify no primeiro evento de verdade.
export async function anota({ plataforma, eventoId, corpo, assinaturaOk, erro }) {
  if (!temBanco) return;
  try {
    await sql`
      INSERT INTO webhooks_recebidos (plataforma, evento_id, corpo, assinatura_ok, erro)
      VALUES (${plataforma}, ${eventoId ? String(eventoId) : null}, ${sql.json(corpo)}, ${!!assinaturaOk}, ${erro || null})`;
  } catch (e) {
    // O registro não pode derrubar o processamento: perder a anotação é ruim,
    // perder a compra é pior.
    console.error('não deu para anotar o webhook:', e?.message);
  }
}
