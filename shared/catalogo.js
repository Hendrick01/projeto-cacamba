// ============================================================================
// A prateleira — o que existe para ter, e o que custa.
//
// Vive em shared/ pelo mesmo motivo do elenco: o cliente desenha a loja com
// isto, e o SERVIDOR decide com isto se alguém pode usar o que pediu. Se o
// catálogo morasse só no cliente, "tenho a skin" viraria opinião do navegador
// — e opinião de navegador se edita com o console aberto.
//
// O catálogo é CÓDIGO, não linha de banco. Preço muda por deploy, de propósito:
// é rastreável no git, revisável antes de subir, e não existe painel de admin
// para invadir. O banco guarda o que foi COBRADO (compras.centavos), congelado,
// então baixar um preço amanhã não reescreve o que alguém pagou hoje.
//
// Por que o VERSO é um tipo separado do baralho:
//
//   A frente da carta só você vê — é a sua mão. O verso, não: ele está no
//   monte, no descarte virado e no leque de todo mundo à mesa (veja o
//   comentário do materialVerso em mesa3d.js). É um desenho só, e ele aparece
//   para a mesa inteira a partida toda. Nenhuma outra skin do jogo tem essa
//   relação entre trabalho de arte e visibilidade.
// ============================================================================

// 'a-venda'  → aparece na loja com preço e botão.
// 'em-breve' → aparece apagada, sem botão. Serve para a prateleira não nascer
//              vazia e para medir interesse antes de pagar por arte.
// 'padrao'   → o que todo mundo já tem; não aparece como produto.
export const CATALOGO = [
  {
    sku: 'verso-muquifao',
    tipo: 'verso',
    nome: 'Verso do muquifão',
    descricao: 'O de sempre: madeira e trama âmbar.',
    arquivo: 'assets/baralho/verso.webp',
    centavos: 0,
    estado: 'padrao',
  },
  {
    sku: 'verso-neon',
    tipo: 'verso',
    nome: 'Verso neon',
    descricao: 'Fluorescente, para a mesa inteira ver de longe.',
    arquivo: 'assets/versos/neon.webp',
    centavos: 1490,
    estado: 'em-breve',
    // O id do produto na Kiwify. É este campo que liga o "fulano comprou o
    // produto X" do webhook ao que o jogo entende por skin. Sem ele, a compra
    // chega e não vira nada — de propósito: creditar por palpite é pior que
    // não creditar.
    //
    // Este veio da URL do produto no painel. Se o webhook trouxer outro id em
    // Product.product_id, o log grita "produto ... não está ligado a nenhum
    // sku" e o corpo cru fica em webhooks_recebidos — é de lá que sai o id
    // certo, sem ter perdido a venda.
    kiwify: '3106bec0-abd7-11f1-b0f0-69cd1b525b7e',
  },
  {
    sku: 'verso-tricolor',
    tipo: 'verso',
    nome: 'Verso tricolor',
    descricao: 'Listras do time, no monte e no leque de todo mundo.',
    arquivo: 'assets/versos/tricolor.webp',
    centavos: 1490,
    estado: 'em-breve',
  },
  {
    sku: 'cenario-casa',
    tipo: 'cenario',
    nome: 'Sala de jantar de casa',
    descricao: 'Onde este jogo é jogado de verdade.',
    centavos: 0,
    estado: 'padrao',
  },
  {
    // A arte deste JÁ EXISTE: o boteco foi o cenário do jogo até o commit
    // cc793b7 trocá-lo pela sala de casa, e o anterior (0e72816) guarda ele
    // inteiro — azulejo até meia parede, balcão, engradados, sinuca, hora azul
    // na porta. É o único item da prateleira que não espera desenhista: espera
    // alguém religar o que já foi feito. Por isso é o primeiro a valer a pena.
    sku: 'cenario-boteco',
    tipo: 'cenario',
    nome: 'Boteco da esquina',
    descricao: 'Balcão, engradados e a hora azul na porta. Quem abre a sala escolhe — e vale para a mesa toda.',
    centavos: 2490,
    estado: 'em-breve',
  },
];

const PORSKU = new Map(CATALOGO.map((i) => [i.sku, i]));

export function itemPorSku(sku) {
  return PORSKU.get(String(sku || '')) || null;
}

// O que aparece na prateleira: o padrão não é produto, ninguém "compra" o que
// já tem.
export function prateleira() {
  return CATALOGO.filter((i) => i.estado !== 'padrao');
}

export function padraoDo(tipo) {
  return CATALOGO.find((i) => i.tipo === tipo && i.estado === 'padrao') || null;
}

// A pergunta que o SERVIDOR faz antes de repassar uma escolha aos outros
// jogadores. `inventario` é a lista de skus que a conta possui — vinda do
// banco, nunca do cliente. Sem conta (jogo solto, como é hoje), só o padrão
// passa, e é isso que mantém o jogo inteiro funcionando sem loja nenhuma.
export function podeUsar(sku, inventario = []) {
  const item = itemPorSku(sku);
  if (!item) return false;
  if (item.estado === 'padrao') return true;
  if (item.estado !== 'a-venda') return false;   // "em breve" não se usa nem comprando
  return inventario.includes(item.sku);
}

// Preço em reais, para a tela. Centavos no código, vírgula só na hora de ler.
// Do id do produto na Kiwify para o sku daqui. Devolve null quando não há
// ligação — e quem chama trata isso como "não credita", nunca como "credita
// alguma coisa".
//
// KIWIFY_PRODUTOS é a saída de emergência: "id=sku,outro=sku2" no ambiente liga
// um produto sem esperar deploy. Serve para o dia em que o produto é criado lá
// e alguém já comprou antes do commit sair, e é o que deixa o webhook testável
// sem inventar id falso no catálogo de verdade.
function doAmbiente(id) {
  for (const par of String(process.env.KIWIFY_PRODUTOS || '').split(',')) {
    const [chave, sku] = par.split('=').map((x) => (x || '').trim());
    if (chave && chave === id && itemPorSku(sku)) return sku;
  }
  return null;
}

export function skuPorKiwify(produtoId) {
  const id = String(produtoId || '');
  if (!id) return null;
  return CATALOGO.find((i) => i.kiwify && i.kiwify === id)?.sku
    || doAmbiente(id)
    || null;
}

export function precoEmReais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
