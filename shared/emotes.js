// EMOTES E FRASES PRONTAS — para quem está sem microfone ou sem áudio (pedido
// do dono do jogo em 17/09/2026, com a roda de emotes e o balão "TRUCO ACEITO!"
// do Capote como referência). Princípio, não arte: os desenhos de lá não vêm;
// aqui são emojis do sistema e frases da casa.
//
// O que viaja pela rede é só a CHAVE (`k`). Texto livre não existe: não há o
// que moderar, e uma chave que não está nesta lista é ignorada nas duas pontas.
export const EMOTES = [
  { k: 'joinha', emoji: '👍', humor: 'feliz' },
  { k: 'negativo', emoji: '👎', humor: 'bravo' },
  { k: 'sua-vez', emoji: '👉', texto: 'é você!' },
  { k: 'palmas', emoji: '👏', humor: 'feliz' },
  { k: 'pisca', emoji: '😉', humor: 'feliz' },
  { k: 'riso', emoji: '😂', humor: 'feliz' },
  { k: 'lingua', emoji: '😜', humor: 'feliz' },
  { k: 'sono', emoji: '😴' },
];
export const FRASES = [
  { k: 'bora', texto: 'Bora!' },
  { k: 'demora', texto: 'Demora demais…' },
  { k: 'boa', texto: 'Boa jogada!', humor: 'feliz' },
  { k: 'ai-nao', texto: 'Aí não…', humor: 'bravo' },
  { k: 'quase', texto: 'Tô quase batendo' },
  { k: 'calma', texto: 'Calma aí' },
  { k: 'valeu', texto: 'Valeu!', humor: 'feliz' },
  { k: 'kkk', texto: 'Kkkkk', humor: 'feliz' },
];
const POR_CHAVE = new Map([...EMOTES, ...FRASES].map((e) => [e.k, e]));
export function emoteDe(k) { return typeof k === 'string' ? POR_CHAVE.get(k) || null : null; }
export function textoDoEmote(e) { return e ? `${e.emoji || ''}${e.emoji && e.texto ? ' ' : ''}${e.texto || ''}` : ''; }
