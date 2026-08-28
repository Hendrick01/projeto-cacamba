// ============================================================================
// Caçamba — a ordem das cartas na mão de quem está jogando.
//
// Vive em shared/ e não dentro do cliente por um motivo concreto: foi aqui que
// morou um bug que só aparecia depois de o jogador arrumar a mão e puxar uma
// carta, e que não dava para testar sem abrir o navegador e jogar. Agora dá.
//
// As duas funções são puras: recebem a mão e a ordem, devolvem ordem. Quem
// guarda o estado é o cliente.
// ============================================================================

// A mão como ela aparece na tela.
//
// `ordemManual` é a arrumação que o jogador fez arrastando as cartas. Quando
// existe, ela manda — e quem ela NÃO conhece (a carta que acabou de ser
// puxada) vai para o fim do leque, sem embaralhar o que já estava arrumado.
// É por isso que a carta nova sempre aparece num canto.
export function ordenaMao(hand, ordemManual = [], modo = 'suit') {
  const mao = [...(hand || [])];
  if (ordemManual.length) {
    const pos = new Map(ordemManual.map((id, i) => [id, i]));
    return mao.sort((a, b) => (pos.get(a.id) ?? 1e6) - (pos.get(b.id) ?? 1e6));
  }
  if (modo === 'suit') mao.sort((a, b) => a.suit - b.suit || a.rank - b.rank);
  else mao.sort((a, b) => a.rank - b.rank || a.suit - b.suit);
  return mao;
}

// Move uma carta para outra posição do leque, empurrando o resto. Devolve a
// ordem nova, ou `null` quando nada muda.
//
// `maoNaTela` tem de ser o que `ordenaMao` devolveu — a ordem que o jogador
// está VENDO. É a regra que o bug quebrava: a versão antiga trabalhava sobre a
// `ordemManual` guardada, que é só a última arrumação e não tem a carta
// recém-chegada. Aí `indexOf` devolvia -1, a função desistia, e a carta nova
// não saía do canto do leque por mais que se arrastasse — ela seguia o dedo e
// voltava para o lugar ao soltar.
//
// `destino` é o índice na ordem JÁ SEM a carta arrastada: é o que faz "soltar
// entre a 2ª e a 3ª" significar sempre a mesma coisa, indo para a direita ou
// para a esquerda.
export function reordena(maoNaTela, id, destino) {
  const ordem = maoNaTela.map((c) => c.id);
  const de = ordem.indexOf(id);
  if (de < 0) return null;
  ordem.splice(de, 1);
  const alvo = Math.max(0, Math.min(ordem.length, destino));
  // `alvo` e `de` são índices de listas diferentes (uma sem a carta, outra
  // com), mas coincidem exatamente quando a carta volta para o próprio lugar.
  if (alvo === de) return null;
  ordem.splice(alvo, 0, id);
  return ordem;
}
