// ============================================================================
// O carteiro — só o link de entrada, e nada mais.
//
// Este arquivo manda UM tipo de mensagem: o link para entrar. Não manda
// novidade, não manda promoção, não manda "sentimos sua falta". Isso não é
// modéstia de produto — é o que mantém a base legal simples. E-mail para
// executar o contrato (entregar o que a pessoa pediu) dispensa consentimento;
// e-mail de marketing não, e traria consigo opt-in, descadastro e prova de
// consentimento. Um carteiro que só sabe uma carta nunca erra a carta.
//
// Sem RESEND_API_KEY, o link vai para o console. É o que faz o login funcionar
// na sua máquina sem contratar nada, e o que impede o servidor de fingir que
// enviou algo que não enviou.
// ============================================================================
const CHAVE = process.env.RESEND_API_KEY || '';
const REMETENTE = process.env.EMAIL_REMETENTE || 'Caçamba <onboarding@resend.dev>';

export const temCarteiro = !!CHAVE;

export async function mandaLink(email, url) {
  if (!CHAVE) {
    // Em desenvolvimento o "envio" é esta linha. Deliberadamente barulhenta:
    // um link de entrada que aparece no log de produção seria um vazamento, e
    // o aviso ao lado existe para ninguém subir assim sem perceber.
    console.log(`\n[e-mail NÃO configurado] link de entrada para ${email}:\n  ${url}\n`);
    return { enviado: false, motivo: 'sem RESEND_API_KEY' };
  }

  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMETENTE,
      to: [email],
      subject: 'Seu link de entrada no Caçamba',
      // Texto puro, sem HTML: chega em qualquer leitor, não cai em promoções
      // com a mesma facilidade, e não tem imagem para rastrear quem abriu —
      // que é dado que não quero coletar.
      text: [
        'Toque no link abaixo para entrar no Caçamba:',
        '',
        url,
        '',
        'Ele vale por 15 minutos e só funciona uma vez.',
        'Se não foi você que pediu, ignore esta mensagem — nada acontece.',
      ].join('\n'),
    }),
  });

  if (!resposta.ok) {
    const detalhe = await resposta.text().catch(() => '');
    return { enviado: false, motivo: `Resend respondeu ${resposta.status}: ${detalhe.slice(0, 200)}` };
  }
  return { enviado: true };
}
