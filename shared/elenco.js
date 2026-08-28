// ============================================================================
// O elenco do Caçamba — quem pode sentar à mesa.
//
// Vive em shared/ porque os dois lados precisam da lista: o cliente para
// desenhar a escolha, e o SERVIDOR para validá-la antes de repassar aos outros
// jogadores. Sem a validação, um cliente adulterado mandaria qualquer texto
// como `avatar` e ele viraria caminho de arquivo na tela de todo mundo.
//
// A arte fica em public/assets/personagens/<slug>-avatar.svg (busto) e
// <slug>-corpo-inteiro.svg (figura). Para acrescentar alguém: gere a arte,
// documente no README de lá, e ponha o slug aqui.
// ============================================================================

export const ELENCO = [
  {
    slug: 'gabizinsky',
    nome: 'Gabizinsky',
    pele: '#F4CFAA',
    traco: 'Cabelo cereja, body azul e corrente de prata na cintura.',
  },
  {
    slug: 'dri',
    nome: 'Dri',
    pele: '#F4CFAA',
    traco: 'Preto sobre preto, jaqueta de couro e duas mechas de mel.',
  },
  {
    slug: 'esterex',
    nome: 'EstereX',
    pele: '#F0C89A',
    traco: 'Cropped vermelho, jeans branca e óculos dourados. A mais alta.',
  },
  {
    slug: 'matheus',
    nome: 'Matheus',
    pele: '#F4CFAA',
    traco: 'Camisa tricolor listrada, colar de ouro e tênis preto.',
  },
  {
    slug: 'mafra-kitty',
    nome: 'Mafra Kitty',
    pele: '#F4CFAA',
    traco: 'Camisa branca de gatinho, jeans e tênis branco. Uma argola só.',
  },
  {
    slug: 'junior',
    nome: 'Junior',
    pele: '#F4CFAA',
    traco: 'Preto de cima a baixo, laterais raspadas e um cristal no cordão.',
  },
  {
    slug: 'lyly',
    nome: 'Lyly',
    pele: '#F9D8C4',
    traco: 'Cabelo rosa, vestido longo de florzinhas e piercing no canto da boca.',
  },
  {
    slug: 'mufasa',
    nome: 'Mufasa',
    pele: '#F4CFAA',
    traco: 'Cachos na testa, óculos de prata e bermuda bege sobre legging preta.',
  },
];

export const SLUGS = ELENCO.map((p) => p.slug);

// A pele de cada um. Duas destoam, cada uma para um lado: a EstereX é mais
// dourada e a Lyly, mais clara e rosada; o resto do elenco compartilha o
// mesmo tom. Serve para desenhar as suas próprias mãos
// segurando as cartas, que não são arquivo — são desenhadas na hora, com a cor
// de quem está jogando.
export function peleDe(slug) {
  const p = ELENCO.find((x) => x.slug === slug);
  return p ? p.pele : ELENCO[0].pele;
}

// Expressões extras de cada personagem. A arte sai dos geradores em
// public/assets/personagens/_geradores/ — `<slug>-corpo-inteiro-<expr>.svg` —,
// e o que muda de uma para a outra é só a BOCA: a geometria dela vive em
// `_geradores/expressoes.py`, uma vez para o elenco inteiro, porque a expressão
// é do jogo (o mesmo gesto no rosto de todo mundo) e não de cada personagem. A
// tinta continua sendo de cada um: quem tem batom leva o batom para a boca.
//
// São estas duas porque são estas duas que o cliente pede (REACOES, em
// client.js): quem baixa, bate, pega a carta ou troca o coringa fica `feliz`;
// quem pede a carta ou perde o pedido fica `bravo`. Acrescentar uma terceira é
// desenhar a boca em expressoes.py, rodar os oito geradores e listar aqui.
const TODAS = ['feliz', 'bravo'];
export const EXPRESSOES = Object.fromEntries(
  ['gabizinsky', 'dri', 'esterex', 'matheus', 'mafra-kitty', 'junior', 'lyly', 'mufasa']
    .map((slug) => [slug, TODAS]),
);

export function temExpressao(slug, expressao) {
  return (EXPRESSOES[slug] || []).includes(expressao);
}

export function personagemValido(slug) {
  return typeof slug === 'string' && SLUGS.includes(slug);
}

// Quando ninguém escolheu, o rosto sai do assento: é determinístico, então
// todo mundo vê o mesmo rosto para a mesma pessoa. Enquanto esta lista for
// menor que a mesa de oito, o rosto repete nos últimos lugares — quem
// distingue é a cor do assento.
export function personagemDoAssento(assento) {
  return SLUGS[assento % SLUGS.length];
}
