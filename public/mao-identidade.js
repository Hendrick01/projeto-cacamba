// ============================================================================
// A identidade da mão — de quem é a mão que segura as suas cartas.
//
// A mão de primeira pessoa é a única parte do SEU personagem que você vê a
// partida inteira. Hoje ela recebe uma coisa só, a cor da pele (`peleDe`), e
// com isso SEIS dos oito ficam com a mão idêntica: `#F4CFAA` é a pele de todo
// mundo menos a EstereX (mais dourada) e a Lyly (mais clara). Ou seja, escolher
// personagem quase não muda a única coisa que você vê de si mesmo.
//
// Este módulo responde "que mão é esta?" olhando para a arte que JÁ EXISTE.
// Nada aqui foi inventado: cada campo saiu dos geradores do elenco em
// `public/assets/personagens/_geradores/` (gen.py … gen8.py) e dos closes de
// punho que o elenco já desenhou — `matheus-pulso.svg` e `gabizinsky-anel.svg`
// são, literalmente, uma mão do elenco em tamanho grande, com a manga, a
// pulseira e o anel no lugar. Onde a arte não diz nada, aqui também não diz.
//
// É função PURA e sem three.js de propósito. Quem vira isto em malha, textura
// ou material é a mesa (`mesa3d.js`); assim o mesmo dado serve à mão 3D, à mão
// em SVG da mesa 2D (`#maos` no index.html, que já lê `--pele`) e ao teste, que
// roda no `node --test` sem WebGL nenhum.
// ============================================================================

// `../shared/` e não `/shared/` como o resto de `public/`: o caminho relativo é
// o único que resolve DOS DOIS LADOS. O navegador normaliza `/mao-identidade.js`
// + `../shared/elenco.js` para `/shared/elenco.js` (o `..` a mais na raiz é
// descartado, e o servidor já serve `/shared/*.js`), e o `node --test` acha o
// arquivo no disco. Com `/shared/elenco.js` o teste não carregaria.
//
// A pele vem de lá e não é copiada para cá de propósito: o README do elenco
// manda o campo `pele` de `shared/elenco.js` ser a fonte única — "as mãos que
// seguram as cartas são desenhadas na hora, com o tom de quem está jogando".
// Dois lugares com o mesmo hex é o começo de dois lugares com hex diferente.
import { peleDe, personagemValido, SLUGS } from '../shared/elenco.js';

// A tinta do elenco. Contorno e fundo do jogo são a MESMA cor (README, §1) —
// por isso tudo que é escuro precisa do halo para não sumir no feltro.
export const TINTA = '#2A1B12';

// A luz de borda quente. Só faz falta em peça escura sobre fundo escuro: no
// elenco, o único braço que a leva é o do Mufasa, o único de manga preta.
export const HALO = '#8C6A45';

// Quando o slug não é do elenco (robô sem escolha, cliente adulterado, sessão
// velha), a mão cai na primeira do elenco — a mesma reserva que `peleDe` já usa.
// Vale repetir a escolha e não inventar outra: duas reservas diferentes fariam
// a mesma pessoa ter pele de um e manga de outro.
const RESERVA = SLUGS[0];

// Até onde a manga desce, do ombro para a ponta do dedo. Interessa porque a
// primeira pessoa enquadra mão e um pedaço de antebraço, e mais nada: manga que
// para no braço NÃO ENTRA NO QUADRO, por mais bonita que seja. Medido no quadro
// de 400×800 do corpo inteiro, onde a mão ocupa y 418–483.
export const ALCANCE_MANGA = Object.freeze(['ombro', 'braco', 'antebraco', 'punho']);

// A manga aparece na primeira pessoa? Só as duas últimas. É a pergunta que a
// mesa faz antes de gastar geometria com um aro de tecido que ninguém veria.
export function mangaNoQuadro(manga) {
  return !!manga && (manga.ate === 'punho' || manga.ate === 'antebraco');
}

// ---------------------------------------------------------------------------
// O que cada mão do elenco tem. Um por personagem, na ordem de `shared/elenco.js`.
//
// LADO: `direita` e `esquerda` são do PERSONAGEM, não de quem olha. No corpo
// inteiro a figura está de frente, então a mão direita dela é desenhada à
// esquerda do quadro — é a mesma convenção do README do elenco para brinco e
// piercing, e é a que vale em primeira pessoa sem tradução: a mão direita do
// personagem é a mão direita do jogador.
//
// `peleSombra` é o tom do tendão e da dobra, o `SKIN_SH` dos geradores. Ele
// acompanha a pele: quem tem pele própria tem sombra própria.
// ---------------------------------------------------------------------------
const MAO_DO_ELENCO = {
  // gen.py — manga curta do body azul (termina em y≈285, longe do punho) e o
  // anel de prata com coração no anelar da direita, que tem close próprio.
  gabizinsky: {
    peleSombra: '#E0B189',
    manga: { cor: '#93BCD1', sombra: '#7099B1', ate: 'braco' },
    adornos: [
      { tipo: 'anel', mao: 'direita', onde: 'anelar', metal: 'prata',
        cor: '#C9CDD2', sombra: '#8D949B', pedra: '#C6362F' },
    ],
  },

  // gen2.py — a jaqueta de couro tem PUNHO DOBRADO no meio do antebraço
  // (y 336–347), então ela entra no quadro da primeira pessoa mesmo sem chegar
  // à mão. É a única manga do elenco nessa altura, e o realce de borda dura é o
  // que separa couro de tecido — no elenco isso é acabamento, não cor.
  dri: {
    peleSombra: '#E0B189',
    manga: { cor: '#35323C', sombra: '#292630', realce: '#5C5766', ate: 'antebraco' },
    adornos: [],
  },

  // gen3.py — a única de ouro integral. Bracelete de serpente no antebraço
  // DIREITO e pulseira de corrente no outro punho (README, §4), mais o anel de
  // ouro no anelar da direita.
  esterex: {
    peleSombra: '#E0B189',
    manga: { cor: '#C24A3B', sombra: '#A03A2F', ate: 'braco' },
    adornos: [
      { tipo: 'anel', mao: 'direita', onde: 'anelar', metal: 'ouro',
        cor: '#C9A24E', realce: '#E4C378', sombra: '#9A7A34', pedra: null },
      { tipo: 'bracelete', mao: 'direita', onde: 'antebraco', metal: 'ouro',
        cor: '#C9A24E', realce: '#E4C378' },
      { tipo: 'corrente', mao: 'esquerda', onde: 'punho', metal: 'ouro',
        cor: '#C9A24E', realce: '#E4C378' },
    ],
  },

  // gen4.py — o único que mistura os dois metais, e o que tem mais coisa no
  // punho: pérolas FOSCAS (um ponto de luz seco, nunca degradê) e corrente de
  // prata na direita, corrente na esquerda, aliança de ouro no anelar da
  // direita. É a mão mais cheia do elenco, e a que tem close: matheus-pulso.svg.
  matheus: {
    peleSombra: '#E0B189',
    manga: { cor: '#2E6094', sombra: '#234B75', ate: 'braco' },
    adornos: [
      { tipo: 'anel', mao: 'direita', onde: 'anelar', metal: 'ouro',
        cor: '#C8A24E', realce: '#E4C378', sombra: '#9A7A34', pedra: null },
      { tipo: 'pulseira', mao: 'direita', onde: 'punho', metal: 'perola',
        cor: '#EDE6D6', realce: '#F5F1E6', sombra: '#CBC0A8' },
      { tipo: 'corrente', mao: 'direita', onde: 'punho', metal: 'prata',
        cor: '#C9CDD2', realce: '#EDEFF2', sombra: '#8D949B' },
      { tipo: 'corrente', mao: 'esquerda', onde: 'punho', metal: 'prata',
        cor: '#C9CDD2', realce: '#EDEFF2', sombra: '#8D949B' },
    ],
  },

  // gen5.py — o contrapeso do Matheus na tabela de metais: nada abaixo do
  // pescoço. A lista vazia aqui é DECISÃO, não falta de arte — está escrita no
  // gerador ("Sem alianca e sem pulseira").
  'mafra-kitty': {
    peleSombra: '#E0B189',
    manga: { cor: '#EBE4D5', sombra: '#D3CAB6', ate: 'braco' },
    adornos: [],
  },

  // gen8.py — o único do elenco SEM MÃO DESENHADA: as duas estão nos bolsos, de
  // propósito. Em primeira pessoa ele obviamente tem mãos (elas seguram o
  // leque), então a pele e a manga valem; o que não existe é close de punho
  // dele para consultar. A lista vazia aqui é coerente com a tabela de metais —
  // o metal dele é todo no pescoço e nas orelhas —, mas é a única do elenco que
  // não tem desenho de mão confirmando. `semArteDeMao` marca isso.
  junior: {
    peleSombra: '#E0B189',
    manga: { cor: '#403630', sombra: '#332B26', ate: 'braco' },
    adornos: [],
    semArteDeMao: true,
  },

  // gen6.py — a manga bufante é de OMBRO: sobe em bola e desce reto, e o
  // antebraço fica nu. Não entra no quadro da primeira pessoa. O metal dela é
  // uma peça só, e fica no pescoço ("Sem anel, sem pulseira", no gerador).
  lyly: {
    peleSombra: '#E7BCA4',
    manga: { cor: '#4A3547', sombra: '#382839', realce: '#5E4459', ate: 'ombro' },
    adornos: [],
  },

  // gen7.py — a ÚNICA manga do elenco que chega ao punho: a segunda pele de
  // manga comprida, com o punho num degrau mais escuro. Ela não é enfeite —
  // segundo o README é ela que impede o bege da bermuda de ler como pele, e é
  // por isso que o braço dele é o único que leva halo. Em primeira pessoa é a
  // mão mais distinta do elenco sem precisar de joia nenhuma.
  mufasa: {
    peleSombra: '#E0B189',
    manga: { cor: '#26252D', sombra: '#222129', realce: '#4E4D59', ate: 'punho', halo: HALO },
    adornos: [],
  },
};

// Aceita o que o resto do jogo já tem na mão, sem obrigar quem chama a
// desembrulhar: o slug cru, uma entrada do ELENCO (`.slug`) ou um jogador do
// `view.players` (`.avatar`, que é como o personagem viaja no protocolo).
function slugDe(personagem) {
  if (typeof personagem === 'string') return personagem;
  if (personagem && typeof personagem === 'object') {
    if (typeof personagem.slug === 'string') return personagem.slug;
    if (typeof personagem.avatar === 'string') return personagem.avatar;
  }
  return '';
}

/**
 * A descrição visual da mão de um personagem. Sem three.js: só o que desenhar.
 *
 * Devolve congelado porque é tabela, não estado — se a mesa precisar mexer em
 * alguma coisa, ela copia. Mão compartilhada que alguém pinta por engano vira
 * o elenco inteiro com a manga do Mufasa.
 */
export function identidadeDaMao(personagem) {
  const pedido = slugDe(personagem);
  const conhecido = personagemValido(pedido);
  const slug = conhecido ? pedido : RESERVA;
  const espec = MAO_DO_ELENCO[slug] || MAO_DO_ELENCO[RESERVA];

  return Object.freeze({
    slug,
    // Falso quando o personagem não é do elenco e a mão caiu na reserva. Quem
    // chama pode ignorar; existe para o dia em que alguém for investigar por
    // que a mesa inteira está com a mão da Gabizinsky.
    conhecido,
    pele: peleDe(slug),
    peleSombra: espec.peleSombra,
    contorno: TINTA,
    manga: espec.manga ? Object.freeze({ ...espec.manga }) : null,
    adornos: Object.freeze(espec.adornos.map((a) => Object.freeze({ ...a }))),
    // NINGUÉM do elenco tem unha pintada, tatuagem ou relógio. Procurei nos oito
    // geradores e nos SVGs: as únicas ocorrências de "relogio" no repositório de
    // arte são duas NEGAÇÕES, ambas do Mufasa ("Sem anel e sem relogio"). O
    // campo fica aqui, sempre nulo, para dizer isso em código em vez de em
    // comentário — e para ser o encaixe pronto se um dia virar skin.
    unha: null,
    // Só o Junior. Ver o comentário na tabela.
    semArteDeMao: espec.semArteDeMao === true,
  });
}

/**
 * A mesma coisa, mas de UMA mão só — que é como a primeira pessoa desenha:
 * esquerda segurando o leque, direita pinçando a carta. Filtra os adornos do
 * lado pedido para a mesa não ter de saber a convenção de lado do elenco.
 *
 * `lado` aceita 'direita'/'esquerda' e também 'Right'/'Left', que é o nome que
 * os ossos usam em `primeira-pessoa-maos.js` — assim quem já tem o lado na mão
 * não precisa traduzir na hora de chamar.
 */
export function maoDoLado(personagem, lado) {
  const id = identidadeDaMao(personagem);
  const qual = normalizaLado(lado);
  return Object.freeze({
    ...id,
    lado: qual,
    adornos: Object.freeze(id.adornos.filter((a) => a.mao === qual)),
  });
}

function normalizaLado(lado) {
  const t = String(lado || '').toLowerCase();
  // 'left' e 'esquerda' começam com 'e'/'l'; qualquer outra coisa é a direita,
  // que é a mão que mais tem o que mostrar no elenco (é nela que moram os três
  // anéis e as pérolas) — se for para errar a reserva, que erre para o lado
  // onde há o que ver.
  return (t === 'esquerda' || t === 'left') ? 'esquerda' : 'direita';
}
