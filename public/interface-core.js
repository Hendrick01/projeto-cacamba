// Interface shared math. Values are CSS pixels until the final 3D conversion.
export const VERSAO_INTERFACE = 'UI 07.09 / R1';
const finite = (v, fallback) => Number.isFinite(v) ? v : fallback;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function layoutMao2D(quantidade, largura = 375) {
  const n = clamp(Math.floor(finite(quantidade, 0)), 0, 200);
  const util = Math.max(140, finite(largura, 375) - 36);
  const carta = 60, altura = 84, minimo = 26;
  const porFileira = Math.max(2, Math.min(13, Math.floor((util - carta) / minimo) + 1));
  const fileiras = Math.max(1, Math.ceil(n / porFileira));
  const itensPorFila = Math.max(1, Math.ceil(n / fileiras));
  const passo = itensPorFila > 1 ? Math.min(44, (util - carta) / (itensPorFila - 1)) : 0;
  return { fileiras, itensPorFila, passo: Math.max(0, passo), carta, altura };
}
export function layoutMao3D({ quantidade, largura = 375, altura = 812, fov = 72, cartaL = 0.42, cartaA = 0.59 }) {
  largura = Math.max(240, finite(largura, 375)); altura = Math.max(240, finite(altura, 812));
  const n = clamp(Math.floor(finite(quantidade, 0)), 0, 200);
  const dist = 1.3;
  const alturaVisivel = 2 * dist * Math.tan(clamp(finite(fov, 72), 20, 100) * Math.PI / 360);
  const unidade = alturaVisivel / altura, larguraVisivel = largura * unidade;
  // A carta da mão é medida pela largura da tela, mas com teto na ALTURA. Numa
  // janela deitada a carta ia ao limite de 100 px e saía com 140 px de pé: com
  // a inclinação do leque isso comia mais de um quarto do quadro, bem na faixa
  // onde ficam os jogos baixados da sua beirada (queixa do usuário,
  // 08/09/2026). Com o teto de 0,11 da altura o leque para em ~24% da tela e
  // deixa a mesa aparecer. Em pé nada muda: lá quem manda é a largura.
  const larguraCard = Math.min(100, Math.max(52, Math.min(largura * 0.16, altura * 0.11)));
  const alturaCard = larguraCard * cartaA / cartaL;
  // Quantas cabem numa fileira antes de virar a próxima. Numa tela em pé sobra
  // altura: é melhor abrir uma segunda fileira do que espremer tudo numa só, e
  // o passo mínimo é quase a carta inteira. Deitada (paisagem) a altura é o que
  // falta — ali a fileira única continua, com as cartas mais juntas.
  const passoMin = altura >= largura ? larguraCard * 0.8 : 28;
  const maxFila = Math.max(2, Math.min(40, Math.floor((largura - 36 - larguraCard) / passoMin) + 1));
  const fileiras = Math.max(1, Math.ceil(n / maxFila));
  const porFila = Math.max(1, Math.ceil(n / fileiras));
  // Passo quase da largura da carta: sobrando espaço elas ficam lado a lado, com
  // uma unha de sobreposição só para o leque não virar uma fileira solta. Com o
  // passo de 0,64 que havia antes, uma mão de 6 cartas já escondia a face das vizinhas.
  const passoPx = porFila > 1 ? Math.min(larguraCard * 0.9, (largura - 36 - larguraCard) / (porFila - 1)) : 0;
  const alturaMao = Math.min(altura * 0.34, fileiras * (alturaCard + 15) + 26);
  // Extreme hands compact vertically; all cards retain unique selectable positions.
  const entreFilas = fileiras > 1 ? Math.min(alturaCard + 15, (alturaMao - alturaCard - 20) / (fileiras - 1)) : 0;
  // Numa janela DEITADA a mão desce até sair um sexto de cada carta pela
  // borda de baixo — é a mão segurada no colo. O índice da carta mora no alto,
  // então ela continua inteira de ler, e o que se ganha é a faixa de feltro
  // onde ficam os SEUS jogos baixados: em pé sobra altura e a mão fica inteira.
  // Abaixo do leque fica a SUA MÃO, que entra pela borda de baixo e sobe com os
  // dedos por dentro das cartas. Ela precisa de meia carta de folga: sem isso o
  // punho ficava fora do quadro e só sobrava a ponta dos dedos. Em paisagem o
  // leque continua afundado de propósito (é a mão no colo), mas menos.
  const folgaDaMao = alturaCard * 0.55;
  const margem = (altura >= largura ? 18 : -alturaCard * 0.17) + folgaDaMao;
  // LEQUE DE VERDADE, e não uma fileira reta: as cartas giram em torno de um
  // pivô ABAIXO da tela, os pés convergindo para o punho e os topos abrindo.
  // É o que faz a mão parecer que segura em vez de ladear — com a fileira reta,
  // a mão só alcançava as pontas. O raio é ~2,6 alturas de carta: menos que
  // isso e as cartas de baixo se escondem umas nas outras; mais, e volta a ser
  // uma tira. O passo angular fecha quando a mão cresce, para o leque não
  // varrer a tela inteira.
  const emArco = fileiras === 1 && n > 1;
  const raio = alturaCard * 2.6;
  const passoAng = emArco ? Math.min(0.15, (passoPx * 0.85) / raio) : 0;
  const posicoes = Array.from({ length: n }, (_, i) => {
    const fila = Math.floor(i / porFila), col = i % porFila;
    const nestaFila = Math.min(porFila, n - fila * porFila), meio = (nestaFila - 1) / 2;
    const dx = col - meio;
    const yReta = -altura / 2 + margem + alturaCard / 2 + (fileiras - fila - 1) * entreFilas - Math.abs(dx) * 0.4;
    if (!emArco) {
      return { x: dx * passoPx * unidade, y: yReta * unidade, z: -dist, giro: 0, fila, escala: larguraCard * unidade / cartaL };
    }
    // O arco afunda as cartas das pontas (é o que um leque faz). Sem
    // compensar, em paisagem — onde a mão já começa baixa — elas saíam pela
    // borda de baixo. Sobe o arco inteiro pelo afundamento da ponta: a ponta
    // fica na altura de antes e quem sobe é o meio.
    const ang = dx * passoAng, sobe = raio * (1 - Math.cos(meio * passoAng));
    return { x: Math.sin(ang) * raio * unidade,
      y: (yReta + Math.abs(dx) * 0.4 + sobe - raio + Math.cos(ang) * raio) * unidade,
      z: -dist, giro: -ang, fila, escala: larguraCard * unidade / cartaL };
  });
  // a largura do leque sai das posições de verdade (no arco a corda é menor que
  // a soma dos passos), e é por ela que a mesa põe as mãos nas pontas
  const extremos = posicoes.length ? [Math.min(...posicoes.map((p) => p.x)), Math.max(...posicoes.map((p) => p.x))] : [0, 0];
  return { dist, alturaVisivel, larguraVisivel, unidade, posicoes, passo: passoPx * unidade,
    escala: larguraCard * unidade / cartaL, baseY: posicoes.at(-1)?.y || -alturaVisivel * 0.4,
    alturaMao, fileiras, porFila, larguraLeque: extremos[1] - extremos[0] + larguraCard * unidade };
}
export function indiceInsercao3D(cartas, x, y) {
  if (!cartas.length) return 0;
  const linhas = [...new Set(cartas.map(c => c.fila))];
  const fila = linhas.reduce((a, b) => Math.abs(cartas.find(c => c.fila === a).y - y) <= Math.abs(cartas.find(c => c.fila === b).y - y) ? a : b);
  return cartas.filter(c => c.fila < fila).length + cartas.filter(c => c.fila === fila && c.x < x).length;
}
