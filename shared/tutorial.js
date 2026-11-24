// ============================================================================
// Caçamba — o TUTORIAL (23/11/2026)
//
// A primeira rodada de uma sala de tutorial não é sorteada: as cartas de quem
// aprende, as do robô, a virada e o topo do monte são escolhidos para que, em
// duas vezes, apareça tudo o que importa — puxar do monte, baixar uma trinca,
// encaixar, descartar, pegar do meio e bater. Quem decide continua sendo o
// motor (shared/engine.js): aqui só se ARRUMA o baralho depois que ele dá as
// cartas, e as regras são as de sempre.
//
// O roteiro, com o robô NORMAL (determinístico — o fácil às vezes descarta
// uma carta qualquer, e o roteiro precisa saber o que ele vai largar):
//   1ª vez sua   mão 7♥ 7♠ 7♦ K♣ K♦ 2♠ · meio 9♣ · puxa do monte: o outro 7♥
//                baixa os três 7; encaixa o 7♥ que sobrou; descarta o 2♠
//   vez do robô  mão K♠ 3♣ 4♦ 8♥ 9♦ 10♣ · não quer o 2♠, puxa o 2♣ do monte
//                e descarta o K♠ (sem par, sem vizinho e o mais caro)
//   2ª vez sua   pega o K♠ do meio · baixa os três reis — e bate
// São dois baralhos, porque a quarta carta de uma trinca tem de ser de um
// naipe que já está nela: com um baralho só não existe outro 7♥.
// A queima fica desligada nesta rodada: é regra para depois (está em Regras).
// ============================================================================

import { shuffle } from './engine.js';

// [valor, naipe] — naipe 0 espadas, 1 copas, 2 ouros, 3 paus
export const ROTEIRO = {
  humano: [[7, 1], [7, 0], [7, 2], [13, 3], [13, 2], [2, 0]],
  robo: [[13, 0], [3, 3], [4, 2], [8, 1], [9, 2], [10, 3]],
  virada: [9, 3],
  // na ordem em que saem do monte: o seu, depois o do robô
  monte: [[7, 1], [2, 3]],
};

// As opções da partida de tutorial: dois baralhos e o robô que não sorteia jogada.
export const OPCOES_DO_TUTORIAL = { decks: 2, nivelRobos: 'normal' };

/**
 * Arruma a primeira rodada (já distribuída pelo motor) conforme o roteiro.
 * Só vale para a rodada 1, mesa de dois (um humano e um robô) e com o humano
 * abrindo a rodada; em qualquer outra situação não mexe em nada e devolve false.
 */
export function montaRodadaDoTutorial(game) {
  if (!game || game.round !== 0 || game.phase !== 'draw' || game.players.length !== 2) return false;
  const humano = game.players.find((p) => !p.isBot);
  const robo = game.players.find((p) => p.isBot);
  if (!humano || !robo || game.players[game.turn] !== humano) return false;

  const todas = [...game.deck, ...game.discard, ...game.players.flatMap((p) => p.hand)];
  const tira = ([valor, naipe]) => {
    const i = todas.findIndex((c) => !c.joker && c.rank === valor && c.suit === naipe);
    if (i < 0) throw new Error(`tutorial: falta a carta ${valor}/${naipe} no baralho`);
    return todas.splice(i, 1)[0];
  };

  humano.hand = ROTEIRO.humano.map(tira);
  robo.hand = ROTEIRO.robo.map(tira);
  const virada = tira(ROTEIRO.virada);
  delete virada.by;
  game.discard = [virada];
  const doTopo = ROTEIRO.monte.map(tira);
  // o monte sai pelo FIM do array (deck.pop()): o resto embaralhado por baixo,
  // e as cartas do roteiro por cima, da última para a primeira
  game.deck = [...shuffle(todas, game.rnd), ...doTopo.reverse()];
  game.queimaDe = null;   // sem queima no tutorial
  game.tutorial = true;
  return true;
}
