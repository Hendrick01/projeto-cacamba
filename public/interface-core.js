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
  const larguraCard = Math.min(100, Math.max(62, largura * 0.16));
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
  const alturaMao = Math.min(altura * 0.42, fileiras * (alturaCard + 15) + 26);
  // Extreme hands compact vertically; all cards retain unique selectable positions.
  const entreFilas = fileiras > 1 ? Math.min(alturaCard + 15, (alturaMao - alturaCard - 20) / (fileiras - 1)) : 0;
  const posicoes = Array.from({ length: n }, (_, i) => {
    const fila = Math.floor(i / porFila), col = i % porFila;
    const nestaFila = Math.min(porFila, n - fila * porFila), meio = (nestaFila - 1) / 2;
    const dx = col - meio;
    const giro = fileiras === 1 && nestaFila > 1 ? -dx / meio * 0.045 : 0;
    return { x: dx * passoPx * unidade, y: (-altura / 2 + 18 + alturaCard / 2 + (fileiras - fila - 1) * entreFilas - Math.abs(dx) * 0.4) * unidade,
      z: -dist, giro, fila, escala: larguraCard * unidade / cartaL };
  });
  return { dist, alturaVisivel, larguraVisivel, unidade, posicoes, passo: passoPx * unidade,
    escala: larguraCard * unidade / cartaL, baseY: posicoes.at(-1)?.y || -alturaVisivel * 0.4,
    alturaMao, fileiras, porFila, larguraLeque: ((porFila - 1) * passoPx + larguraCard) * unidade };
}
export function indiceInsercao3D(cartas, x, y) {
  if (!cartas.length) return 0;
  const linhas = [...new Set(cartas.map(c => c.fila))];
  const fila = linhas.reduce((a, b) => Math.abs(cartas.find(c => c.fila === a).y - y) <= Math.abs(cartas.find(c => c.fila === b).y - y) ? a : b);
  return cartas.filter(c => c.fila < fila).length + cartas.filter(c => c.fila === fila && c.x < x).length;
}
