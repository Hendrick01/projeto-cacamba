// ============================================================================
// O baralho — qual arquivo é qual carta.
//
// A arte vem pronta, desenhada fora daqui: 55 imagens em public/assets/baralho/,
// montadas pelo scripts/baralho_gatos.py a partir das folhas originais. Este
// módulo é só o mapa, e ele vive em public/ porque as DUAS mesas precisam do
// mesmo: a mesa normal põe a imagem dentro do `.card`, e a mesa 3D usa o mesmo
// arquivo como textura. Se cada uma montasse o próprio caminho, bastaria um
// renomear para as duas discordarem sobre o que é o 7 de paus.
//
// O nome sai do par naipe+valor do próprio motor (0 espadas, 1 copas, 2 ouros,
// 3 paus) — não existe tabela de-para para desatualizar.
// ============================================================================

export const PASTA = 'assets/baralho';

// O coringa é o único caso com escolha: o baralho tem QUATRO coringas e a arte
// traz DOIS desenhos (o gato na bola e o gato no monociclo). Eles se alternam
// pelo id da carta, que é estável dentro da rodada — assim os dois aparecem na
// mesa e nenhum coringa troca de figura na sua mão no meio do jogo.
export function arteDaCarta(card) {
  if (!card) return null;
  if (card.joker === true) return `${PASTA}/coringa-${(card.id % 2) + 1}.webp`;
  return `${PASTA}/${card.suit}-${card.rank}.webp`;
}

export const VERSO = `${PASTA}/verso.webp`;

// A chave de cache: duas cartas com a mesma arte compartilham textura. Importa
// para o coringa, que tem quatro cartas e dois desenhos.
export function chaveDaArte(card) {
  return card.joker === true ? `coringa-${card.id % 2}` : `${card.suit}-${card.rank}`;
}
