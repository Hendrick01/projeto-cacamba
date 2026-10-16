// ============================================================================
// Puxadinho — o modo de tabuleiro da casa. Cada jogador é um mestre de obras
// num loteamento novo: produz material, troca, levanta casas e prédios, e
// ganha quem chega a 10 pontos na própria vez.
//
// Vive separado dos outros motores, como o Presidente e o Bazuca: um não
// importa nada do outro, e a página só baixa este arquivo quando alguém entra
// numa sala de Puxadinho. A geometria do tabuleiro (GEO) é exportada porque a
// mesa 2D desenha a partir dela — servidor e cliente numeram esquinas e lados
// do mesmo jeito.
//
// A proposta, os nomes e o porquê de cada troca estão em PROPOSTA-PUXADINHO.md
// (documento interno). Aprovado pelo dono do jogo em 15/10/2026, com as regras
// opcionais ainda por escolher — por isso tudo que é opcional começa DESLIGADO
// e mora em OPCOES, no topo.
//
// A regra, em uma tela:
//  - 19 terrenos em hexágono (3-4-5-4-3): 3 Pedreiras (pedra), 4 Areais
//    (areia), 4 Olarias (tijolo), 4 Cimenteiras (cimento), 3 Ferros-velhos
//    (ferro) e a Prefeitura, que não produz e é onde o fiscal começa.
//  - 18 plaquinhas de 2 a 12 (sem 7; um 2, um 12, duas de cada outra); 6 e 8
//    nunca vizinhos. 9 revendas na avenida: 4 gerais (3 por 1) e 5
//    especializadas (2 por 1 daquele material). Fornecedor: 4 por 1, sempre.
//  - Colocação em "cobra": casa + rua na ida, casa + rua na volta; a 2ª casa
//    rende 1 material de cada terreno em volta. Quem começou rola primeiro.
//  - Regra de distância: casa só em esquina livre com as 3 vizinhas livres.
//  - Na vez: rola os dados (todo terreno do número produz: casa 1, prédio 2,
//    menos o embargado), depois troca e constrói em qualquer ordem.
//  - 7 nos dados: ninguém produz; quem tem mais de 7 cartas devolve metade
//    (para baixo); quem rolou manda o fiscal para outro terreno e leva 1
//    material ao acaso de um vizinho dele.
//  - Custos: rua = pedra + areia; casa = pedra + areia + tijolo + cimento;
//    prédio (sobre uma casa) = 3 ferro + 2 cimento; carta de obra = ferro +
//    tijolo + cimento. Peças: 15 ruas, 5 casas, 4 prédios.
//  - 25 cartas de obra: 14 Mestre de Obras (move o fiscal e leva 1 material),
//    2 Mutirão (2 ruas de graça), 2 Achado na Caçamba (2 materiais quaisquer),
//    2 Arremate (todos entregam todo de um material), 5 Obras Públicas (1 ponto
//    escondido). Uma carta por vez, inclusive antes de rolar; nunca a comprada
//    na mesma vez.
//  - Avenida Principal (2 pts): 5+ ruas seguidas, perde para uma maior; casa
//    alheia corta a sequência. Maior Equipe (2 pts): 3+ Mestres jogados, perde
//    para quem jogar mais.
//  - Troca entre jogadores só com o jogador da vez; nada de igual por igual.
// ============================================================================

export const MODO = 'puxadinho';
export const MIN_JOGADORES = 3;
export const MAX_JOGADORES = 4;
export const NIVEIS_DE_ROBO = ['facil', 'normal'];

export const META = 10;
export const LIMITE_DA_MAO = 7;      // acima disso, o Dia de Fiscalização leva metade
export const ESTOQUE = 19;           // de cada material no fornecedor
export const PECAS = { rua: 15, casa: 5, predio: 4 };
export const AVENIDA_MINIMA = 5;
export const EQUIPE_MINIMA = 3;
// Teto de vezes: uma partida de robôs nunca passa de ~120, mas uma mesa
// esquecida não pode rodar para sempre. Estourou, ganha quem tem mais pontos.
export const TETO_DE_VEZES = 600;

// REGRAS OPCIONAIS (PROPOSTA-PUXADINHO.md, itens 8 a 11). Todas desligadas até
// o dono do jogo escolher; o motor já sabe jogar com cada uma ligada.
export const OPCOES = {
  fiscalCamarada: false,   // não embarga terreno de quem tem 2 pontos ou menos
  meta: META,              // 8 para partida curta
  baralhoDeDados: false,   // 36 cartas com todas as somas, em vez de dados
  cacamba: false,          // o material apreendido vai para a caçamba, e o Achado tira dela
};

export const RECURSOS = ['pedra', 'areia', 'tijolo', 'cimento', 'ferro'];
export const NOME_DO_RECURSO = { pedra: 'pedra', areia: 'areia', tijolo: 'tijolo', cimento: 'cimento', ferro: 'ferro' };

export const PRODUZ = { pedreira: 'pedra', areal: 'areia', olaria: 'tijolo', cimenteira: 'cimento', ferrovelho: 'ferro', prefeitura: null };
export const NOME_DO_TERRENO = {
  pedreira: 'Pedreira', areal: 'Areal', olaria: 'Olaria', cimenteira: 'Cimenteira', ferrovelho: 'Ferro-velho', prefeitura: 'Prefeitura',
};
const QTD_DE_TERRENOS = { pedreira: 3, areal: 4, olaria: 4, cimenteira: 4, ferrovelho: 3, prefeitura: 1 };
const NUMEROS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
// 4 revendas gerais e uma especializada de cada material
const REVENDAS = ['geral', 'geral', 'geral', 'geral', ...RECURSOS];

export const CUSTOS = {
  rua: { pedra: 1, areia: 1 },
  casa: { pedra: 1, areia: 1, tijolo: 1, cimento: 1 },
  predio: { ferro: 3, cimento: 2 },
  carta: { ferro: 1, tijolo: 1, cimento: 1 },
};

export const CARTAS = { mestre: 14, mutirao: 2, achado: 2, arremate: 2, obra: 5 };
export const OBRAS_PUBLICAS = ['Praça', 'Escola', 'Posto de Saúde', 'Quadra', 'Creche'];
export const NOME_DA_CARTA = {
  mestre: 'Mestre de Obras', mutirao: 'Mutirão', achado: 'Achado na Caçamba', arremate: 'Arremate', obra: 'Obra Pública',
};

// Em quantas das 36 combinações dos dois dados sai `n` (2 e 12: 1; 6 e 8: 5).
export const chances = (n) => (n ? 6 - Math.abs(7 - n) : 0);

// ============================================================================
// O tabuleiro. Hexágonos de ponta para cima, em coordenadas axiais (q, r) de
// raio 2: as 19 casas de 3-4-5-4-3. As esquinas (54) e os lados (72) saem das
// quinas dos hexágonos, juntando as que caem no mesmo ponto. A numeração é
// determinística — é ela que viaja na rede.
// ============================================================================

const R3 = Math.sqrt(3);

function montaGeometria() {
  const hexes = [];
  for (let r = -2; r <= 2; r++) {
    for (let q = -2; q <= 2; q++) {
      if (Math.abs(-q - r) > 2) continue;
      hexes.push({ q, r, x: R3 * (q + r / 2), y: 1.5 * r, vertices: [], arestas: [], vizinhos: [] });
    }
  }
  const chave = (x, y) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const vmap = new Map();
  const vertices = [];
  hexes.forEach((h, hi) => {
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI / 180) * (60 * i - 90);   // i = 0 é a ponta de cima
      const x = h.x + Math.cos(ang);
      const y = h.y + Math.sin(ang);
      const k = chave(x, y);
      let vi = vmap.get(k);
      if (vi === undefined) {
        vi = vertices.length;
        vmap.set(k, vi);
        vertices.push({ x, y, hexes: [], vizinhos: [], arestas: [] });
      }
      vertices[vi].hexes.push(hi);
      h.vertices.push(vi);
    }
  });
  const emap = new Map();
  const arestas = [];
  hexes.forEach((h, hi) => {
    for (let i = 0; i < 6; i++) {
      const a = h.vertices[i];
      const b = h.vertices[(i + 1) % 6];
      const k = a < b ? `${a}-${b}` : `${b}-${a}`;
      let ei = emap.get(k);
      if (ei === undefined) {
        ei = arestas.length;
        emap.set(k, ei);
        arestas.push({ v: [Math.min(a, b), Math.max(a, b)], hexes: [] });
        vertices[a].vizinhos.push(b); vertices[b].vizinhos.push(a);
        vertices[a].arestas.push(ei); vertices[b].arestas.push(ei);
      }
      arestas[ei].hexes.push(hi);
      h.arestas.push(ei);
    }
  });
  for (const a of arestas) {
    if (a.hexes.length === 2) {
      const [x, y] = a.hexes;
      hexes[x].vizinhos.push(y); hexes[y].vizinhos.push(x);
    }
  }
  // A beira: 30 lados de um hexágono só, em volta, no sentido do relógio a
  // partir de cima. As revendas ficam em 9 deles, espaçadas 3-4-3 (como nos
  // tabuleiros de praia de todo jogo de hexágono), e nunca dividem esquina.
  const meio = (e) => {
    const [a, b] = arestas[e].v;
    return { x: (vertices[a].x + vertices[b].x) / 2, y: (vertices[a].y + vertices[b].y) / 2 };
  };
  const beira = arestas.map((a, i) => i).filter((i) => arestas[i].hexes.length === 1)
    .sort((i, j) => {
      const angulo = (e) => { const m = meio(e); return (Math.atan2(m.x, -m.y) + 2 * Math.PI) % (2 * Math.PI); };
      return angulo(i) - angulo(j);
    });
  const vagas = [0, 3, 7, 10, 13, 17, 20, 23, 27].map((i) => beira[i]);
  return { hexes, vertices, arestas, beira, vagasDeRevenda: vagas };
}

export const GEO = montaGeometria();

// ============================================================================
// Estado
// ============================================================================

function fail(msg) {
  const err = new Error(msg);
  err.gameRule = true;
  throw err;
}

function embaralha(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const zerados = () => Object.fromEntries(RECURSOS.map((r) => [r, 0]));
const total = (rec) => RECURSOS.reduce((s, r) => s + (rec[r] || 0), 0);
const temTudo = (rec, custo) => RECURSOS.every((r) => (rec[r] || 0) >= (custo[r] || 0));
function tira(rec, custo) { for (const r of RECURSOS) rec[r] -= custo[r] || 0; }
function poe(rec, custo) { for (const r of RECURSOS) rec[r] += custo[r] || 0; }

// Um pacote de materiais vindo de fora (cliente): só chaves conhecidas, só
// inteiros de 0 a 19. Qualquer outra coisa vira zero.
function pacote(obj) {
  const out = zerados();
  if (!obj || typeof obj !== 'object') return out;
  for (const r of RECURSOS) {
    const n = obj[r];
    if (Number.isInteger(n) && n > 0 && n <= ESTOQUE) out[r] = n;
  }
  return out;
}

export function createGame(players, opts = {}) {
  return {
    modo: MODO,
    opts: { nivelRobos: 'normal', ...OPCOES, ...opts, rnd: undefined },
    players: players.map((p) => ({
      id: p.id, name: p.name, isBot: !!p.isBot,
      recursos: zerados(),
      cartas: [],          // [{ tipo, nome?, nova }]
      mestres: 0,          // Mestres de Obras já jogados
      pecas: { ...PECAS },
    })),
    round: -1,
    phase: 'lobby',
    turn: 0,               // quem precisa agir agora (é o que o servidor agenda)
    dono: 0,               // de quem é a vez
    turnNo: 0,
    deck: [],              // as cartas de obra (o retrato da sala confere que existe)
    banca: zerados(),
    tabuleiro: [],         // por hexágono: { t: terreno, n: número }
    revendas: [],          // { e: lado da beira, tipo: 'geral' | material }
    fiscal: 0,
    construcoes: {},       // esquina → { p: id, tipo: 'casa' | 'predio' }
    ruas: {},              // lado → id
    dados: null,
    baralhoDeDados: [],
    cacamba: zerados(),    // só com a opção `cacamba`
    colocacao: null,       // { ordem: [índices], passo, falta: 'casa' | 'rua', casa }
    descartes: [],         // [{ id, n }]
    depois: null,          // para onde volta a vez depois do fiscal ou do mutirão
    ruasGratis: 0,
    jogouCarta: false,
    oferta: null,
    trocasDoRobo: 0,
    avenida: null,         // { id, n } — id null: título guardado, ninguém tem
    equipe: null,          // { id, n }
    roubo: null,           // { seq, ladrao, vitima, res } — só os dois veem o material
    vencedor: null,
    lastRound: null,
    rnd: opts.rnd || Math.random,
  };
}

export function playerById(state, id) {
  return state.players.find((p) => p.id === id);
}
const idxDe = (state, id) => state.players.findIndex((p) => p.id === id);
const donoDaVez = (state) => state.players[state.dono];

// ---------------------------------------------------------------------------
// Montagem do tabuleiro
// ---------------------------------------------------------------------------

function sorteiaTabuleiro(rnd) {
  const terrenos = embaralha(Object.entries(QTD_DE_TERRENOS).flatMap(([t, n]) => Array(n).fill(t)), rnd);
  const tab = terrenos.map((t) => ({ t, n: 0 }));
  // 6 e 8 nunca vizinhos: sorteia de novo até sair (sai em poucas tentativas;
  // o teto é só para a regra nunca travar a partida).
  for (let tentativa = 0; tentativa < 500; tentativa++) {
    const nums = embaralha(NUMEROS.slice(), rnd);
    let k = 0;
    for (const h of tab) h.n = h.t === 'prefeitura' ? 0 : nums[k++];
    const quente = (h) => tab[h].n === 6 || tab[h].n === 8;
    const ok = GEO.hexes.every((hex, i) => !quente(i) || hex.vizinhos.every((j) => !quente(j)));
    if (ok) break;
  }
  return tab;
}

function baralhoDeObra(rnd) {
  const d = [];
  for (const [tipo, n] of Object.entries(CARTAS)) {
    for (let i = 0; i < n; i++) d.push(tipo === 'obra' ? { tipo, nome: OBRAS_PUBLICAS[i] } : { tipo });
  }
  return embaralha(d, rnd);
}

export function startRound(state) {
  const rnd = state.rnd || Math.random;
  state.round++;
  state.tabuleiro = sorteiaTabuleiro(rnd);
  const tipos = embaralha(REVENDAS.slice(), rnd);
  state.revendas = GEO.vagasDeRevenda.map((e, i) => ({ e, tipo: tipos[i] }));
  state.fiscal = state.tabuleiro.findIndex((h) => h.t === 'prefeitura');
  state.deck = baralhoDeObra(rnd);
  state.banca = Object.fromEntries(RECURSOS.map((r) => [r, ESTOQUE]));
  state.cacamba = zerados();
  state.construcoes = {};
  state.ruas = {};
  state.dados = null;
  state.baralhoDeDados = [];
  for (const p of state.players) {
    p.recursos = zerados(); p.cartas = []; p.mestres = 0; p.pecas = { ...PECAS };
  }
  state.avenida = null; state.equipe = null; state.oferta = null; state.roubo = null;
  state.descartes = []; state.depois = null; state.ruasGratis = 0; state.jogouCarta = false;
  state.vencedor = null; state.trocasDoRobo = 0;

  // Quem começa é sorteado; a ordem da colocação é a cobra: ida e volta.
  const n = state.players.length;
  const primeiro = Math.floor(rnd() * n);
  const ida = Array.from({ length: n }, (_, i) => (primeiro + i) % n);
  state.colocacao = { ordem: [...ida, ...ida.slice().reverse()], passo: 0, falta: 'casa', casa: null };
  state.phase = 'colocacao';
  state.dono = primeiro;
  state.turn = primeiro;
  state.turnNo = 0;
  return [{ e: 'roundStart', round: state.round }, { e: 'inicio', p: state.players[primeiro].id }];
}

export function actNextRound() {
  return [];   // o Puxadinho é uma partida só; "jogar de novo" recomeça
}

// ---------------------------------------------------------------------------
// Consultas (usadas pelo motor, pela visão e pelos robôs)
// ---------------------------------------------------------------------------

export function pontosVisiveis(state, id) {
  let pts = 0;
  for (const c of Object.values(state.construcoes)) if (c.p === id) pts += c.tipo === 'predio' ? 2 : 1;
  if (state.avenida?.id === id) pts += 2;
  if (state.equipe?.id === id) pts += 2;
  return pts;
}

export function pontos(state, id) {
  const p = playerById(state, id);
  return pontosVisiveis(state, id) + (p ? p.cartas.filter((c) => c.tipo === 'obra').length : 0);
}

// Taxas de troca com o fornecedor: 4 por 1, 3 com revenda geral, 2 com a
// especializada daquele material.
export function taxas(state, id) {
  const t = Object.fromEntries(RECURSOS.map((r) => [r, 4]));
  for (const rev of state.revendas) {
    const [a, b] = GEO.arestas[rev.e].v;
    if (state.construcoes[a]?.p !== id && state.construcoes[b]?.p !== id) continue;
    if (rev.tipo === 'geral') { for (const r of RECURSOS) t[r] = Math.min(t[r], 3); } else t[rev.tipo] = 2;
  }
  return t;
}

const temRuaMinhaEm = (state, id, v, menos = -1) => GEO.vertices[v].arestas.some((e) => e !== menos && state.ruas[e] === id);
// Esquina livre pela regra de distância: ela e as vizinhas sem construção.
const livreParaCasa = (state, v) => !state.construcoes[v] && GEO.vertices[v].vizinhos.every((w) => !state.construcoes[w]);

export function podeCasaEm(state, id, v, inicial = false) {
  if (!Number.isInteger(v) || v < 0 || v >= GEO.vertices.length) return false;
  if (!livreParaCasa(state, v)) return false;
  return inicial || temRuaMinhaEm(state, id, v);
}

// Rua encosta numa construção sua, ou numa rua sua por uma esquina que não
// tenha construção de outro jogador (a casa alheia corta o caminho).
export function podeRuaEm(state, id, e, casaInicial = null) {
  if (!Number.isInteger(e) || e < 0 || e >= GEO.arestas.length) return false;
  if (state.ruas[e] !== undefined) return false;
  const [a, b] = GEO.arestas[e].v;
  if (casaInicial !== null) return a === casaInicial || b === casaInicial;
  return [a, b].some((x) => {
    const c = state.construcoes[x];
    if (c) return c.p === id;
    return temRuaMinhaEm(state, id, x, e);
  });
}

// A maior sequência de ruas de um jogador: a trilha mais longa sem repetir
// rua, que não atravessa esquina com construção de outro.
export function maiorRua(state, id) {
  const minhas = Object.keys(state.ruas).map(Number).filter((e) => state.ruas[e] === id);
  if (!minhas.length) return 0;
  const usadas = new Set();
  const bloqueada = (v) => { const c = state.construcoes[v]; return !!c && c.p !== id; };
  let melhor = 0;
  const anda = (v, n) => {
    if (n > melhor) melhor = n;
    if (bloqueada(v)) return;
    for (const e of GEO.vertices[v].arestas) {
      if (state.ruas[e] !== id || usadas.has(e)) continue;
      usadas.add(e);
      const [a, b] = GEO.arestas[e].v;
      anda(a === v ? b : a, n + 1);
      usadas.delete(e);
    }
  };
  for (const e of minhas) {
    const [a, b] = GEO.arestas[e].v;
    usadas.add(e);
    anda(b, 1);
    anda(a, 1);
    usadas.delete(e);
  }
  return melhor;
}

// Onde o jogador poderia construir, pelas peças e pelo tabuleiro — sem olhar
// de quem é a vez (os robôs usam isto para pensar fora da vez).
function construiveis(state, id) {
  const out = { casa: [], rua: [], predio: [] };
  const p = playerById(state, id);
  if (!p) return out;
  if (p.pecas.rua > 0) for (let e = 0; e < GEO.arestas.length; e++) if (podeRuaEm(state, id, e)) out.rua.push(e);
  if (p.pecas.casa > 0) for (let v = 0; v < GEO.vertices.length; v++) if (podeCasaEm(state, id, v)) out.casa.push(v);
  if (p.pecas.predio > 0) {
    for (const [v, c] of Object.entries(state.construcoes)) if (c.p === id && c.tipo === 'casa') out.predio.push(Number(v));
  }
  return out;
}

// Onde dá para construir AGORA, para quem está agindo.
export function legais(state, id) {
  const out = { casa: [], rua: [], predio: [] };
  if (!playerById(state, id)) return out;
  if (state.phase === 'colocacao') {
    const c = state.colocacao;
    if (state.players[c.ordem[c.passo]]?.id !== id) return out;
    if (c.falta === 'casa') {
      for (let v = 0; v < GEO.vertices.length; v++) if (podeCasaEm(state, id, v, true)) out.casa.push(v);
    } else {
      for (let e = 0; e < GEO.arestas.length; e++) if (podeRuaEm(state, id, e, c.casa)) out.rua.push(e);
    }
    return out;
  }
  if (state.phase !== 'acoes' && state.phase !== 'mutirao') return out;
  if (donoDaVez(state)?.id !== id) return out;
  const c = construiveis(state, id);
  return state.phase === 'mutirao' ? { ...out, rua: c.rua } : c;
}

// Quem pode ser roubado num terreno: vizinhos dele que não são o dono da vez.
export function vitimasEm(state, h) {
  const ids = new Set();
  for (const v of GEO.hexes[h].vertices) {
    const c = state.construcoes[v];
    if (c && c.p !== donoDaVez(state).id) ids.add(c.p);
  }
  return [...ids];
}

// Terrenos para onde o fiscal pode ir agora.
export function destinosDoFiscal(state) {
  const out = [];
  for (let h = 0; h < GEO.hexes.length; h++) {
    if (h === state.fiscal) continue;
    if (state.opts?.fiscalCamarada) {
      // não embarga quem tem 2 pontos ou menos (só os pontos à vista contam)
      const protegido = vitimasEm(state, h).some((id) => pontosVisiveis(state, id) <= 2);
      if (protegido) continue;
    }
    out.push(h);
  }
  // nada sobrou (todo mundo protegido): vale qualquer terreno
  return out.length ? out : GEO.hexes.map((_, h) => h).filter((h) => h !== state.fiscal);
}

export function cartasJogaveis(state, id) {
  const p = playerById(state, id);
  if (!p || donoDaVez(state)?.id !== id || state.jogouCarta) return [];
  if (state.phase !== 'rolar' && state.phase !== 'acoes') return [];
  const tipos = new Set();
  for (const c of p.cartas) if (!c.nova && c.tipo !== 'obra') tipos.add(c.tipo);
  return [...tipos];
}

// ---------------------------------------------------------------------------
// Títulos
// ---------------------------------------------------------------------------

// Quem tem a Avenida Principal: o dono continua com ela enquanto ninguém fizer
// uma MAIOR. Se a dele foi cortada e a maior ficou empatada, o título fica
// guardado até alguém voltar a ter a maior sozinho.
function atualizaAvenida(state, events) {
  const tam = state.players.map((p) => ({ id: p.id, n: maiorRua(state, p.id) }));
  const max = Math.max(...tam.map((t) => t.n));
  const noTopo = tam.filter((t) => t.n === max);
  const atual = state.avenida;
  const antes = atual?.id ?? null;
  let novo;
  if (max < AVENIDA_MINIMA) novo = null;
  else if (atual?.id) {
    const meu = tam.find((t) => t.id === atual.id).n;
    if (meu >= atual.n && meu === max) novo = { id: atual.id, n: meu };          // não foi cortada e segue no topo
    else if (meu < atual.n) novo = noTopo.length === 1 ? { id: noTopo[0].id, n: max } : { id: null, n: max };
    else novo = noTopo.length === 1 ? { id: noTopo[0].id, n: max } : { id: atual.id, n: meu };
  } else {
    novo = noTopo.length === 1 ? { id: noTopo[0].id, n: max } : (atual ? { id: null, n: max } : null);
  }
  state.avenida = novo;
  const depois = novo?.id ?? null;
  if (depois !== antes) events.push({ e: 'avenida', p: depois, de: antes, n: novo?.n || max });
}

function atualizaEquipe(state, events, p) {
  const atual = state.equipe;
  if (p.mestres < EQUIPE_MINIMA) return;
  if (atual && atual.id !== p.id && p.mestres <= atual.n) return;
  const antes = atual?.id ?? null;
  state.equipe = { id: p.id, n: p.mestres };
  if (antes !== p.id) events.push({ e: 'equipe', p: p.id, de: antes, n: p.mestres });
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

function exigeDono(state, id, ...fases) {
  if (!fases.includes(state.phase)) fail(mensagemDeFase(state));
  const p = donoDaVez(state);
  if (!p || p.id !== id) fail('Não é a sua vez.');
  return p;
}

function mensagemDeFase(state) {
  switch (state.phase) {
    case 'colocacao': return 'Ainda é a colocação inicial: casa e rua.';
    case 'rolar': return 'Primeiro, role os dados.';
    case 'descarte': return 'Esperando quem tem material demais devolver a metade.';
    case 'fiscal': return 'Mande o fiscal para outro terreno.';
    case 'mutirao': return 'Termine o mutirão: as ruas de graça.';
    case 'gameEnd': return 'A partida acabou.';
    default: return 'Não dá para fazer isso agora.';
  }
}

function actColocar(state, id, tipo, alvo) {
  const c = state.colocacao;
  const p = state.players[c.ordem[c.passo]];
  if (p.id !== id) fail('Não é a sua vez de colocar.');
  if (tipo !== c.falta) fail(c.falta === 'casa' ? 'Primeiro a casa.' : 'Agora a rua, encostada na casa que você pôs.');
  const events = [];
  if (tipo === 'casa') {
    if (!podeCasaEm(state, id, alvo, true)) fail('Casa só em esquina livre, sem vizinha ocupada.');
    state.construcoes[alvo] = { p: id, tipo: 'casa' };
    p.pecas.casa--;
    events.push({ e: 'construiu', p: id, tipo: 'casa', v: alvo, inicial: true });
    // a 2ª casa rende um material de cada terreno em volta
    if (c.passo >= state.players.length) {
      const ganho = zerados();
      for (const h of GEO.vertices[alvo].hexes) {
        const r = PRODUZ[state.tabuleiro[h].t];
        if (r && state.banca[r] > 0) { ganho[r]++; state.banca[r]--; }
      }
      poe(p.recursos, ganho);
      if (total(ganho)) events.push({ e: 'recebeu', p: id, recursos: ganho });
    }
    c.falta = 'rua'; c.casa = alvo;
    return events;
  }
  if (!podeRuaEm(state, id, alvo, c.casa)) fail('A rua tem de sair da casa que você acabou de pôr.');
  state.ruas[alvo] = id;
  p.pecas.rua--;
  events.push({ e: 'construiu', p: id, tipo: 'rua', a: alvo, inicial: true });
  c.passo++; c.falta = 'casa'; c.casa = null;
  state.turnNo++;
  if (c.passo >= c.ordem.length) {
    // fim da colocação: quem pôs a última casa (o primeiro da ida) rola
    state.colocacao = null;
    state.phase = 'rolar';
    state.turn = state.dono;
    events.push({ e: 'vez', p: donoDaVez(state).id });
  } else {
    state.turn = c.ordem[c.passo];
  }
  return events;
}

function rolaDados(state) {
  const rnd = state.rnd || Math.random;
  if (state.opts?.baralhoDeDados) {
    // as 36 combinações, embaralhadas; refaz o monte com 5 cartas no fundo
    // sem usar, para a última rodada do monte não ser adivinhável
    if (state.baralhoDeDados.length <= 5) {
      const monte = [];
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) monte.push([a, b]);
      state.baralhoDeDados = embaralha(monte, rnd);
    }
    return state.baralhoDeDados.pop();
  }
  return [1 + Math.floor(rnd() * 6), 1 + Math.floor(rnd() * 6)];
}

function actRolar(state, id) {
  const p = exigeDono(state, id, 'rolar');
  const dados = rolaDados(state);
  state.dados = dados;
  const soma = dados[0] + dados[1];
  const events = [];
  if (soma === 7) {
    events.push({ e: 'rolou', p: p.id, dados, soma, ganhos: {}, faltou: [] });
    // Com a opção da caçamba: o caminhão recolhe a caçamba anterior antes da
    // nova fiscalização (o material volta ao fornecedor). Sem isso o que cai
    // nela sai de circulação e o fornecedor seca — a partida travava.
    if (state.opts?.cacamba && total(state.cacamba)) {
      events.push({ e: 'cacambaRecolhida', recursos: { ...state.cacamba } });
      poe(state.banca, state.cacamba);
      state.cacamba = zerados();
    }
    const n = state.players.length;
    state.descartes = [];
    for (let k = 0; k < n; k++) {
      const x = state.players[(state.dono + k) % n];
      const t = total(x.recursos);
      if (t > LIMITE_DA_MAO) state.descartes.push({ id: x.id, n: Math.floor(t / 2) });
    }
    state.depois = 'acoes';
    if (state.descartes.length) {
      state.phase = 'descarte';
      state.turn = idxDe(state, state.descartes[0].id);
      events.push({ e: 'fiscalizacao', quem: state.descartes.map((d) => ({ p: d.id, n: d.n })) });
    } else {
      state.phase = 'fiscal';
      state.turn = state.dono;
      events.push({ e: 'fiscalizacao', quem: [] });
    }
    return events;
  }
  const { ganhos, faltou } = produz(state, soma);
  events.push({ e: 'rolou', p: p.id, dados, soma, ganhos, faltou });
  state.phase = 'acoes';
  return events;
}

// Todo terreno do número produz para quem tem casa (1) ou prédio (2) em volta,
// menos o embargado. Se o fornecedor não tem para todo mundo de um material,
// ninguém recebe aquele — a não ser que só um jogador tenha direito a ele.
function produz(state, soma) {
  const quer = {};   // id → recursos
  for (let h = 0; h < GEO.hexes.length; h++) {
    const casa = state.tabuleiro[h];
    if (casa.n !== soma || h === state.fiscal) continue;
    const r = PRODUZ[casa.t];
    if (!r) continue;
    for (const v of GEO.hexes[h].vertices) {
      const c = state.construcoes[v];
      if (!c) continue;
      (quer[c.p] ||= zerados())[r] += c.tipo === 'predio' ? 2 : 1;
    }
  }
  const ganhos = {};
  const faltou = [];
  for (const r of RECURSOS) {
    const pedem = Object.entries(quer).filter(([, rec]) => rec[r] > 0);
    if (!pedem.length) continue;
    const somaPedida = pedem.reduce((s, [, rec]) => s + rec[r], 0);
    let paga = pedem;
    if (somaPedida > state.banca[r]) {
      if (pedem.length > 1) { faltou.push(r); continue; }
      pedem[0][1][r] = state.banca[r];
      if (!state.banca[r]) { faltou.push(r); continue; }
      paga = pedem;
    }
    for (const [pid, rec] of paga) {
      const qtd = rec[r];
      state.banca[r] -= qtd;
      playerById(state, pid).recursos[r] += qtd;
      (ganhos[pid] ||= zerados())[r] += qtd;
    }
  }
  return { ganhos, faltou };
}

function actDescartar(state, id, recursos) {
  if (state.phase !== 'descarte') fail('Não é hora de devolver material.');
  const d = state.descartes[0];
  if (!d || d.id !== id) fail('Não é a sua vez de devolver material.');
  const p = playerById(state, id);
  const rec = pacote(recursos);
  if (total(rec) !== d.n) fail(`Escolha exatamente ${d.n} cartas para devolver.`);
  if (!temTudo(p.recursos, rec)) fail('Você não tem esse material.');
  tira(p.recursos, rec);
  if (state.opts?.cacamba) poe(state.cacamba, rec); else poe(state.banca, rec);
  state.descartes.shift();
  const events = [{ e: 'descartou', p: id, recursos: rec, cacamba: !!state.opts?.cacamba }];
  if (state.descartes.length) {
    state.turn = idxDe(state, state.descartes[0].id);
  } else {
    state.phase = 'fiscal';
    state.turn = state.dono;
  }
  return events;
}

function actFiscal(state, id, h, de) {
  const p = exigeDono(state, id, 'fiscal');
  if (!Number.isInteger(h) || h < 0 || h >= GEO.hexes.length) fail('Escolha um terreno.');
  if (h === state.fiscal) fail('O fiscal tem de ir para outro terreno.');
  if (!destinosDoFiscal(state).includes(h)) fail('Fiscal camarada: esse terreno é de quem ainda tem 2 pontos ou menos.');
  const vitimas = vitimasEm(state, h);
  let vitima = null;
  if (vitimas.length === 1) vitima = vitimas[0];
  else if (vitimas.length > 1) {
    if (!vitimas.includes(de)) fail('Escolha de quem levar o material.');
    vitima = de;
  }
  state.fiscal = h;
  const events = [];
  let levou = false;
  if (vitima) {
    const v = playerById(state, vitima);
    const t = total(v.recursos);
    if (t > 0) {
      let k = Math.floor((state.rnd || Math.random)() * t);
      let res = RECURSOS[0];
      for (const r of RECURSOS) { if (k < v.recursos[r]) { res = r; break; } k -= v.recursos[r]; }
      v.recursos[res]--; p.recursos[res]++;
      state.roubo = { seq: (state.roubo?.seq || 0) + 1, ladrao: p.id, vitima, res };
      levou = true;
    }
  }
  events.push({ e: 'fiscal', p: p.id, h, de: vitima, levou });
  state.phase = state.depois || 'acoes';
  state.depois = null;
  state.turn = state.dono;
  return events;
}

function actConstruir(state, id, tipo, alvo) {
  if (state.phase === 'colocacao') return actColocar(state, id, tipo, alvo);
  if (tipo === 'rua' && state.phase === 'mutirao') return actRuaDoMutirao(state, id, alvo);
  const p = exigeDono(state, id, 'acoes');
  const custo = CUSTOS[tipo];
  if (p.pecas[tipo] <= 0) fail(`Acabaram as suas peças de ${tipo === 'predio' ? 'prédio' : tipo}.`);
  if (!temTudo(p.recursos, custo)) fail('Falta material para isso.');
  const events = [];
  if (tipo === 'rua') {
    if (!podeRuaEm(state, id, alvo)) fail('A rua tem de encostar numa rua ou construção sua.');
    state.ruas[alvo] = id;
    events.push({ e: 'construiu', p: id, tipo, a: alvo });
  } else if (tipo === 'casa') {
    if (!podeCasaEm(state, id, alvo)) fail('Casa só em esquina livre, sem vizinha ocupada, na ponta de uma rua sua.');
    state.construcoes[alvo] = { p: id, tipo: 'casa' };
    events.push({ e: 'construiu', p: id, tipo, v: alvo });
  } else {
    const c = state.construcoes[alvo];
    if (!c || c.p !== id || c.tipo !== 'casa') fail('O prédio sobe em cima de uma casa sua.');
    c.tipo = 'predio';
    p.pecas.casa++;   // a casa volta para o estoque
    events.push({ e: 'construiu', p: id, tipo, v: alvo });
  }
  tira(p.recursos, custo);
  poe(state.banca, custo);
  p.pecas[tipo]--;
  if (tipo !== 'predio') atualizaAvenida(state, events);
  return events;
}

function actRuaDoMutirao(state, id, e) {
  const p = exigeDono(state, id, 'mutirao');
  if (p.pecas.rua <= 0) fail('Acabaram as suas peças de rua.');
  if (!podeRuaEm(state, id, e)) fail('A rua tem de encostar numa rua ou construção sua.');
  state.ruas[e] = id;
  p.pecas.rua--;
  state.ruasGratis--;
  const events = [{ e: 'construiu', p: id, tipo: 'rua', a: e, gratis: true }];
  atualizaAvenida(state, events);
  if (state.ruasGratis <= 0 || p.pecas.rua <= 0 || !legais(state, id).rua.length) fimDoMutirao(state);
  return events;
}

function fimDoMutirao(state) {
  state.ruasGratis = 0;
  state.phase = state.depois || 'acoes';
  state.depois = null;
}

function actComprarCarta(state, id) {
  const p = exigeDono(state, id, 'acoes');
  if (!state.deck.length) fail('Acabaram as cartas de obra.');
  if (!temTudo(p.recursos, CUSTOS.carta)) fail('Falta material: ferro, tijolo e cimento.');
  tira(p.recursos, CUSTOS.carta);
  poe(state.banca, CUSTOS.carta);
  const carta = state.deck.pop();
  p.cartas.push({ ...carta, nova: true });
  return [{ e: 'comprouCarta', p: id, restam: state.deck.length }];
}

function actJogarCarta(state, id, action) {
  const p = exigeDono(state, id, 'rolar', 'acoes');
  const tipo = action.tipo;
  if (!NOME_DA_CARTA[tipo]) fail('Carta desconhecida.');
  if (tipo === 'obra') fail('Obra Pública não se joga: vale 1 ponto escondido até o fim.');
  if (state.jogouCarta) fail('Uma carta de obra por vez.');
  const i = p.cartas.findIndex((c) => c.tipo === tipo && !c.nova);
  if (i < 0) {
    if (p.cartas.some((c) => c.tipo === tipo)) fail('A carta comprada nesta vez só pode ser jogada na próxima.');
    fail('Você não tem essa carta.');
  }
  const events = [];
  if (tipo === 'achado') {
    // Com a opção da caçamba, o achado sai primeiro dela; o que faltar, do fornecedor.
    const rec = pacote(action.recursos);
    if (total(rec) !== 2) fail('Escolha 2 materiais.');
    const daCacamba = zerados();
    for (const r of RECURSOS) daCacamba[r] = state.opts?.cacamba ? Math.min(state.cacamba[r], rec[r]) : 0;
    if (RECURSOS.some((r) => state.banca[r] < rec[r] - daCacamba[r])) fail('Não tem esse material para pegar.');
    tira(state.cacamba, daCacamba);
    for (const r of RECURSOS) state.banca[r] -= rec[r] - daCacamba[r];
    poe(p.recursos, rec);
    events.push({ e: 'cartaJogada', p: id, tipo }, { e: 'achado', p: id, recursos: rec, daCacamba: total(daCacamba) });
  } else if (tipo === 'arremate') {
    const r = action.recurso;
    if (!RECURSOS.includes(r)) fail('Escolha o material do arremate.');
    const de = {};
    let soma = 0;
    for (const x of state.players) {
      if (x.id === id || !x.recursos[r]) continue;
      de[x.id] = x.recursos[r];
      soma += x.recursos[r];
      x.recursos[r] = 0;
    }
    p.recursos[r] += soma;
    events.push({ e: 'cartaJogada', p: id, tipo }, { e: 'arremate', p: id, recurso: r, total: soma, de });
  } else if (tipo === 'mutirao') {
    if (p.pecas.rua <= 0) fail('Você não tem mais peças de rua.');
    state.depois = state.phase;
    state.phase = 'mutirao';
    state.ruasGratis = Math.min(2, p.pecas.rua);
    events.push({ e: 'cartaJogada', p: id, tipo });
    if (!legais(state, id).rua.length) fimDoMutirao(state);
  } else if (tipo === 'mestre') {
    p.mestres++;
    state.depois = state.phase;
    state.phase = 'fiscal';
    state.turn = state.dono;
    events.push({ e: 'cartaJogada', p: id, tipo });
    atualizaEquipe(state, events, p);
  }
  p.cartas.splice(i, 1);
  state.jogouCarta = true;
  return events;
}

function actBanca(state, id, action) {
  const p = exigeDono(state, id, 'acoes');
  const { da, quer } = action;
  if (!RECURSOS.includes(da) || !RECURSOS.includes(quer)) fail('Escolha o que dar e o que receber.');
  if (da === quer) fail('Troque por um material diferente.');
  const n = Number.isInteger(action.n) && action.n >= 1 && action.n <= ESTOQUE ? action.n : 1;
  const taxa = taxas(state, id)[da];
  if (p.recursos[da] < taxa * n) fail(`Para essa troca você precisa de ${taxa * n} de ${NOME_DO_RECURSO[da]}.`);
  if (state.banca[quer] < n) fail('O fornecedor está sem esse material.');
  p.recursos[da] -= taxa * n; state.banca[da] += taxa * n;
  p.recursos[quer] += n; state.banca[quer] -= n;
  state.trocasDoRobo++;   // o robô troca no máximo 4 vezes por vez (ritmo, não regra)
  return [{ e: 'banca', p: id, da, quer, n, taxa }];
}

// TROCA ENTRE JOGADORES. O da vez propõe a todos; cada um aceita ou recusa
// (fora da vez — é a única ação de quem não é o dono); o da vez fecha com um
// dos que aceitaram. Os robôs respondem na hora.
function actOferta(state, id, action) {
  const p = exigeDono(state, id, 'acoes');
  const da = pacote(action.da);
  const quer = pacote(action.quer);
  if (!total(da) || !total(quer)) fail('A oferta precisa dar alguma coisa e pedir alguma coisa.');
  if (RECURSOS.some((r) => da[r] && quer[r])) fail('Não vale trocar um material por ele mesmo.');
  if (!temTudo(p.recursos, da)) fail('Você não tem o que está oferecendo.');
  const seq = (state.oferta?.seq || 0) + 1;
  state.oferta = { seq, de: id, da, quer, respostas: {} };
  const events = [{ e: 'oferta', p: id, da, quer }];
  for (const x of state.players) {
    if (x.id === id || !x.isBot) continue;
    const aceita = roboAceita(state, x, state.oferta);
    state.oferta.respostas[x.id] = aceita;
    events.push({ e: 'respondeu', p: x.id, aceita });
  }
  return events;
}

function actResponder(state, id, action) {
  const o = state.oferta;
  if (!o || state.phase !== 'acoes') fail('Não há oferta na mesa.');
  if (Number.isInteger(action.seq) && action.seq !== o.seq) fail('Essa oferta já mudou.');
  if (o.de === id) fail('A oferta é sua.');
  const p = playerById(state, id);
  if (!p) fail('Você não está na mesa.');
  const aceita = !!action.aceita;
  if (aceita && !temTudo(p.recursos, o.quer)) fail('Você não tem o que a oferta pede.');
  o.respostas[id] = aceita;
  return [{ e: 'respondeu', p: id, aceita }];
}

function actFecharTroca(state, id, action) {
  const p = exigeDono(state, id, 'acoes');
  const o = state.oferta;
  if (!o) fail('Não há oferta na mesa.');
  const outro = playerById(state, action.com);
  if (!outro || o.respostas[outro.id] !== true) fail('Essa pessoa não aceitou a oferta.');
  if (!temTudo(p.recursos, o.da)) fail('Você já não tem o que ofereceu.');
  if (!temTudo(outro.recursos, o.quer)) fail(`${outro.name} já não tem o que a oferta pede.`);
  tira(p.recursos, o.da); poe(outro.recursos, o.da);
  tira(outro.recursos, o.quer); poe(p.recursos, o.quer);
  state.oferta = null;
  return [{ e: 'trocou', p: id, com: outro.id, da: o.da, quer: o.quer }];
}

function actCancelarOferta(state, id) {
  exigeDono(state, id, 'acoes');
  if (!state.oferta) return [];
  state.oferta = null;
  return [{ e: 'ofertaCancelada', p: id }];
}

function actPassar(state, id) {
  if (state.phase === 'mutirao') {
    exigeDono(state, id, 'mutirao');
    fimDoMutirao(state);
    return [{ e: 'mutiraoFim', p: id }];
  }
  const p = exigeDono(state, id, 'acoes');
  for (const c of p.cartas) c.nova = false;
  state.jogouCarta = false;
  state.oferta = null;
  state.trocasDoRobo = 0;
  state.dono = (state.dono + 1) % state.players.length;
  state.turn = state.dono;
  state.phase = 'rolar';
  state.turnNo++;
  return [{ e: 'passou', p: id }, { e: 'vez', p: donoDaVez(state).id }];
}

function fimDaPartida(state, events, vencedor, motivo = 'meta') {
  state.phase = 'gameEnd';
  state.vencedor = vencedor;
  state.oferta = null;
  const placar = {};
  const obras = {};
  for (const x of state.players) {
    placar[x.id] = pontos(state, x.id);
    obras[x.id] = x.cartas.filter((c) => c.tipo === 'obra').map((c) => c.nome);
  }
  state.lastRound = { vencedor, motivo, pontos: placar, obras };
  events.push({ e: 'venceu', p: vencedor, pontos: placar[vencedor], motivo });
}

// Só se ganha na própria vez: depois de cada ação, olha o dono da vez.
function confereVitoria(state, events) {
  if (state.phase === 'gameEnd' || state.phase === 'colocacao' || state.phase === 'lobby') return;
  const meta = state.opts?.meta || META;
  const p = donoDaVez(state);
  if (pontos(state, p.id) >= meta) { fimDaPartida(state, events, p.id); return; }
  if (state.turnNo >= TETO_DE_VEZES) {
    const melhor = [...state.players].sort((a, b) => pontos(state, b.id) - pontos(state, a.id))[0];
    fimDaPartida(state, events, melhor.id, 'teto');
  }
}

export function applyAction(state, playerId, action) {
  if (!action || typeof action !== 'object') fail('Ação desconhecida.');
  if (state.phase === 'gameEnd') fail('A partida acabou.');
  let events;
  switch (action.a) {
    case 'rolar': events = actRolar(state, playerId); break;
    case 'casa': case 'rua': case 'predio': events = actConstruir(state, playerId, action.a, action.alvo); break;
    case 'descartar': events = actDescartar(state, playerId, action.recursos); break;
    case 'fiscal': events = actFiscal(state, playerId, action.h, action.de); break;
    case 'comprarCarta': events = actComprarCarta(state, playerId); break;
    case 'carta': events = actJogarCarta(state, playerId, action); break;
    case 'banca': events = actBanca(state, playerId, action); break;
    case 'oferta': events = actOferta(state, playerId, action); break;
    case 'responder': events = actResponder(state, playerId, action); break;
    case 'fecharTroca': events = actFecharTroca(state, playerId, action); break;
    case 'cancelarOferta': events = actCancelarOferta(state, playerId); break;
    case 'passar': events = actPassar(state, playerId); break;
    default: fail('Ação desconhecida.');
  }
  confereVitoria(state, events);
  return events;
}

// Fases em que alguém precisa agir (é onde o servidor agenda robô e cobrança).
export const FASES_DE_VEZ = ['colocacao', 'rolar', 'descarte', 'fiscal', 'acoes', 'mutirao'];

// O robô da vez espera menos entre uma construção e outra: uma vez dele tem
// várias ações, e com o ritmo das cartas a mesa ficava esperando à toa.
export function pausaDoRobo(state) {
  return state.phase === 'acoes' ? -700 : 0;
}

// ---------------------------------------------------------------------------
// Visão de cada jogador: material e cartas dos outros só em quantidade.
// ---------------------------------------------------------------------------

export function viewFor(state, playerId) {
  const me = playerById(state, playerId);
  const fim = state.phase === 'gameEnd';
  const agindo = state.players[state.turn];
  const roubo = state.roubo && me && (state.roubo.ladrao === me.id || state.roubo.vitima === me.id)
    ? { ...state.roubo } : (state.roubo ? { seq: state.roubo.seq, ladrao: state.roubo.ladrao, vitima: state.roubo.vitima } : null);
  return {
    modo: MODO,
    round: state.round,
    phase: state.phase,
    turnId: agindo ? agindo.id : null,
    donoId: donoDaVez(state)?.id || null,
    turnNo: state.turnNo,
    meta: state.opts?.meta || META,
    opcoes: {
      fiscalCamarada: !!state.opts?.fiscalCamarada, baralhoDeDados: !!state.opts?.baralhoDeDados, cacamba: !!state.opts?.cacamba,
    },
    tabuleiro: state.tabuleiro,
    revendas: state.revendas,
    fiscal: state.fiscal,
    construcoes: state.construcoes,
    ruas: state.ruas,
    dados: state.dados,
    banca: state.banca,
    cacamba: state.cacamba,
    cartasNoMonte: state.deck.length,
    colocacao: state.colocacao ? {
      passo: state.colocacao.passo, total: state.colocacao.ordem.length, falta: state.colocacao.falta, casa: state.colocacao.casa,
      volta: state.colocacao.passo >= state.players.length,
    } : null,
    descartes: state.descartes.map((d) => ({ id: d.id, n: d.n })),
    oferta: state.oferta,
    avenida: state.avenida,
    equipe: state.equipe,
    destinosDoFiscal: state.phase === 'fiscal' ? destinosDoFiscal(state) : [],
    roubo,
    vencedor: state.vencedor,
    lastRound: state.lastRound,
    // o que a mesa do Caçamba lê nos assentos, vazio aqui
    claims: [], contract: null,
    you: me ? {
      id: me.id,
      recursos: me.recursos,
      cartas: me.cartas.map((c) => ({ tipo: c.tipo, nome: c.nome, nova: c.nova })),
      pontos: pontos(state, me.id),
      taxas: taxas(state, me.id),
      legais: legais(state, me.id),
      jogaveis: cartasJogaveis(state, me.id),
      pecas: me.pecas,
    } : null,
    players: state.players.map((p) => ({
      id: p.id, name: p.name, isBot: p.isBot,
      handCount: total(p.recursos),
      cartasDeObra: p.cartas.length,
      mestres: p.mestres,
      pontos: fim ? pontos(state, p.id) : pontosVisiveis(state, p.id),
      score: fim ? pontos(state, p.id) : pontosVisiveis(state, p.id),
      maiorRua: maiorRua(state, p.id),
      pecas: p.pecas,
      ...(fim ? { recursos: p.recursos, obras: p.cartas.filter((c) => c.tipo === 'obra').map((c) => c.nome) } : {}),
      baixou: false, baixados: null, melds: [],
    })),
  };
}

// ============================================================================
// Robô
// ============================================================================

// O valor de uma esquina para quem vai construir: a chance somada dos
// terrenos em volta, um tanto por material novo e um tanto por revenda.
function valorDaEsquina(state, v, tenho = null) {
  let pts = 0;
  const vistos = new Set();
  for (const h of GEO.vertices[v].hexes) {
    const casa = state.tabuleiro[h];
    const r = PRODUZ[casa.t];
    if (!r) continue;
    const c = chances(casa.n) * (h === state.fiscal ? 0.4 : 1);
    pts += c;
    if (!vistos.has(r)) { vistos.add(r); if (tenho && !tenho.has(r)) pts += 1.5; }
    // ferro e cimento fazem prédio: pesam um pouco mais
    if (r === 'ferro' || r === 'cimento') pts += c * 0.15;
  }
  for (const rev of state.revendas) {
    if (GEO.arestas[rev.e].v.includes(v)) pts += rev.tipo === 'geral' ? 1 : 1.2;
  }
  return pts;
}

function materiaisQueProduzo(state, id) {
  const s = new Set();
  for (const [v, c] of Object.entries(state.construcoes)) {
    if (c.p !== id) continue;
    for (const h of GEO.vertices[v].hexes) { const r = PRODUZ[state.tabuleiro[h].t]; if (r) s.add(r); }
  }
  return s;
}

function escolhe(lista, valor, rnd, facil) {
  if (!lista.length) return null;
  const ord = lista.map((x) => ({ x, v: valor(x) })).sort((a, b) => b.v - a.v);
  if (facil) return ord[Math.floor(rnd() * Math.min(3, ord.length))].x;
  return ord[0].x;
}

// A rua que leva mais perto da melhor esquina ainda livre: busca em largura
// pelos lados vazios, a partir da rede do jogador.
function ruaRumoACasa(state, id) {
  const ok = construiveis(state, id).rua;
  if (!ok.length) return null;
  const okSet = new Set(ok);
  const tenho = materiaisQueProduzo(state, id);
  const dist = new Map();
  const primeira = new Map();
  const fila = [];
  for (let v = 0; v < GEO.vertices.length; v++) {
    const c = state.construcoes[v];
    const minha = (c && c.p === id) || (!c && temRuaMinhaEm(state, id, v));
    if (minha) { dist.set(v, 0); fila.push(v); }
  }
  let melhor = null;
  while (fila.length) {
    const v = fila.shift();
    const d = dist.get(v);
    if (d > 0 && livreParaCasa(state, v)) {
      const val = valorDaEsquina(state, v, tenho) / (d + 0.5);
      if (!melhor || val > melhor.val) melhor = { val, e: primeira.get(v) };
    }
    if (d >= 4) continue;
    const c = state.construcoes[v];
    if (c && c.p !== id) continue;
    for (const e of GEO.vertices[v].arestas) {
      if (state.ruas[e] !== undefined) continue;
      const [a, b] = GEO.arestas[e].v;
      const w = a === v ? b : a;
      if (dist.has(w)) continue;
      if (d === 0 && !okSet.has(e)) continue;
      dist.set(w, d + 1);
      primeira.set(w, d === 0 ? e : primeira.get(v));
      fila.push(w);
    }
  }
  if (melhor && okSet.has(melhor.e)) return melhor.e;
  return null;
}

// O que o robô está juntando material para fazer agora: das construções
// possíveis, a que está mais perto de pagar (casa e prédio na frente: dão
// ponto e produção; rua só quando não há esquina livre na rede).
function alvoDoRobo(state, p) {
  const l = construiveis(state, p.id);
  const opcoes = [];
  if (l.predio.length) opcoes.push(['predio', 0]);
  if (l.casa.length) opcoes.push(['casa', 0]);
  else if (p.pecas.casa > 0 && ruaRumoACasa(state, p.id) !== null) opcoes.push(['rua', 0.5]);
  if (state.deck.length) opcoes.push(['carta', 1.5]);
  if (!opcoes.length) return null;
  return opcoes.map(([t, peso]) => ({ t, s: falta(p.recursos, CUSTOS[t]) + peso })).sort((a, b) => a.s - b.s)[0].t;
}

const falta = (rec, custo) => RECURSOS.reduce((s, r) => s + Math.max(0, (custo[r] || 0) - (rec[r] || 0)), 0);

function utilidade(rec, custo) {
  // material que serve para o alvo vale muito; o resto vale um pouco
  return RECURSOS.reduce((s, r) => s + Math.min(rec[r], custo[r] || 0) * 4 + rec[r] * 0.5, 0);
}

function roboAceita(state, robo, oferta) {
  if (!temTudo(robo.recursos, oferta.quer)) return false;
  const quem = playerById(state, oferta.de);
  if (pontos(state, quem.id) >= (state.opts?.meta || META) - 2) return false;   // não ajuda quem está para ganhar
  const rnd = state.rnd || Math.random;
  if (state.opts?.nivelRobos === 'facil') return rnd() < 0.45;
  const alvo = alvoDoRobo(state, robo);
  const custo = CUSTOS[alvo] || CUSTOS.carta;
  const depois = { ...robo.recursos };
  tira(depois, oferta.quer); poe(depois, oferta.da);
  return utilidade(depois, custo) > utilidade(robo.recursos, custo) + 0.6;
}

function descarteDoRobo(state, p, n) {
  const alvo = alvoDoRobo(state, p);
  const custo = CUSTOS[alvo] || {};
  const rec = { ...p.recursos };
  const dar = zerados();
  for (let i = 0; i < n; i++) {
    // devolve primeiro o que sobra além do alvo, do material mais farto
    const r = [...RECURSOS].filter((x) => rec[x] > 0)
      .sort((a, b) => (rec[b] - (custo[b] || 0)) - (rec[a] - (custo[a] || 0)) || rec[b] - rec[a])[0];
    rec[r]--; dar[r]++;
  }
  return { a: 'descartar', recursos: dar };
}

function fiscalDoRobo(state, p) {
  const rnd = state.rnd || Math.random;
  const facil = state.opts?.nivelRobos === 'facil';
  const lider = Math.max(...state.players.filter((x) => x.id !== p.id).map((x) => pontosVisiveis(state, x.id)));
  const valor = (h) => {
    const casa = state.tabuleiro[h];
    let v = 0;
    for (const vert of GEO.hexes[h].vertices) {
      const c = state.construcoes[vert];
      if (!c) continue;
      const peso = c.tipo === 'predio' ? 2 : 1;
      if (c.p === p.id) v -= 12 * peso;
      else v += peso * chances(casa.n) * (pontosVisiveis(state, c.p) === lider ? 1.5 : 1);
    }
    return v + (vitimasEm(state, h).some((id) => total(playerById(state, id).recursos) > 0) ? 2 : 0);
  };
  const h = escolhe(destinosDoFiscal(state), valor, rnd, facil);
  const vitimas = vitimasEm(state, h);
  const de = vitimas.length > 1
    ? [...vitimas].sort((a, b) => (pontosVisiveis(state, b) - pontosVisiveis(state, a)) || (total(playerById(state, b).recursos) - total(playerById(state, a).recursos)))[0]
    : vitimas[0] || null;
  return { a: 'fiscal', h, de };
}

// A carta que vale jogar agora, se houver.
function cartaDoRobo(state, p) {
  const jog = cartasJogaveis(state, p.id);
  if (!jog.length) return null;
  const facil = state.opts?.nivelRobos === 'facil';
  const naMinha = GEO.hexes[state.fiscal].vertices.some((v) => state.construcoes[v]?.p === p.id) && state.tabuleiro[state.fiscal].n;
  if (jog.includes('mestre')) {
    const daEquipe = p.mestres + 1 >= EQUIPE_MINIMA && (!state.equipe || (state.equipe.id !== p.id && p.mestres + 1 > state.equipe.n));
    if (naMinha || (!facil && daEquipe)) return { a: 'carta', tipo: 'mestre' };
  }
  if (state.phase !== 'acoes' || facil) return null;
  const alvo = alvoDoRobo(state, p);
  const custo = CUSTOS[alvo];
  if (jog.includes('achado') && custo) {
    const f = falta(p.recursos, custo);
    if (f >= 1 && f <= 2) {
      const tem = (r) => state.banca[r] + (state.opts?.cacamba ? state.cacamba[r] : 0);
      const pega = zerados();
      let k = 2;
      for (const r of RECURSOS) {
        while (k > 0 && p.recursos[r] + pega[r] < (custo[r] || 0) && tem(r) > pega[r]) { pega[r]++; k--; }
      }
      for (const r of RECURSOS) while (k > 0 && tem(r) > pega[r]) { pega[r]++; k--; }
      if (k === 0) return { a: 'carta', tipo: 'achado', recursos: pega };
    }
  }
  if (jog.includes('mutirao') && p.pecas.rua > 0 && ruaRumoACasa(state, p.id) !== null && alvo !== 'casa') return { a: 'carta', tipo: 'mutirao' };
  if (jog.includes('arremate') && custo) {
    // pelo que está à vista: o material que mais falta para o alvo
    const r = [...RECURSOS].sort((a, b) => ((custo[b] || 0) - p.recursos[b]) - ((custo[a] || 0) - p.recursos[a]))[0];
    if ((custo[r] || 0) - p.recursos[r] >= 2) return { a: 'carta', tipo: 'arremate', recurso: r };
  }
  return null;
}

function trocaDoRobo(state, p) {
  if (state.trocasDoRobo >= 4) return null;
  const facil = state.opts?.nivelRobos === 'facil';
  const alvo = alvoDoRobo(state, p);
  if (!alvo) return null;
  const custo = CUSTOS[alvo];
  if (!falta(p.recursos, custo)) return null;
  const tx = taxas(state, p.id);
  const precisa = RECURSOS.filter((r) => p.recursos[r] < (custo[r] || 0) && state.banca[r] > 0);
  if (!precisa.length) return null;
  const sobra = RECURSOS.filter((r) => p.recursos[r] - (custo[r] || 0) >= (facil ? 4 : tx[r]))
    .sort((a, b) => (p.recursos[b] - (custo[b] || 0)) - (p.recursos[a] - (custo[a] || 0)));
  if (!sobra.length) return null;
  const da = sobra[0];
  if (p.recursos[da] < tx[da]) return null;
  return { a: 'banca', da, quer: precisa[0] };
}

export function botNextAction(state, playerId) {
  const agindo = state.players[state.turn];
  if (!agindo || agindo.id !== playerId) return null;
  const p = agindo;
  const rnd = state.rnd || Math.random;
  const facil = state.opts?.nivelRobos === 'facil';

  switch (state.phase) {
    case 'colocacao': {
      const c = state.colocacao;
      const l = legais(state, p.id);
      if (c.falta === 'casa') {
        const tenho = materiaisQueProduzo(state, p.id);
        return { a: 'casa', alvo: escolhe(l.casa, (v) => valorDaEsquina(state, v, tenho), rnd, facil) };
      }
      // a rua aponta para a melhor esquina a duas casas de distância
      const valor = (e) => {
        const [a, b] = GEO.arestas[e].v;
        const ponta = a === c.casa ? b : a;
        let m = 0;
        for (const w of GEO.vertices[ponta].vizinhos) if (w !== c.casa && livreParaCasa(state, w)) m = Math.max(m, valorDaEsquina(state, w));
        return m;
      };
      return { a: 'rua', alvo: escolhe(l.rua, valor, rnd, facil) };
    }
    case 'rolar':
      return cartaDoRobo(state, p) || { a: 'rolar' };
    case 'descarte':
      return descarteDoRobo(state, p, state.descartes[0].n);
    case 'fiscal':
      return fiscalDoRobo(state, p);
    case 'mutirao': {
      const e = ruaRumoACasa(state, p.id);
      const l = legais(state, p.id).rua;
      if (e !== null) return { a: 'rua', alvo: e };
      if (l.length) return { a: 'rua', alvo: l[Math.floor(rnd() * l.length)] };
      return { a: 'passar' };
    }
    case 'acoes': {
      if (state.oferta) return { a: 'cancelarOferta' };
      const carta = cartaDoRobo(state, p);
      if (carta) return carta;
      const l = legais(state, p.id);
      const tenho = materiaisQueProduzo(state, p.id);
      if (l.predio.length && temTudo(p.recursos, CUSTOS.predio)) {
        return { a: 'predio', alvo: escolhe(l.predio, (v) => valorDaEsquina(state, v), rnd, facil) };
      }
      if (l.casa.length && temTudo(p.recursos, CUSTOS.casa)) {
        return { a: 'casa', alvo: escolhe(l.casa, (v) => valorDaEsquina(state, v, tenho), rnd, facil) };
      }
      const alvo = alvoDoRobo(state, p);
      if (alvo === 'rua' && temTudo(p.recursos, CUSTOS.rua)) {
        const e = ruaRumoACasa(state, p.id);
        if (e !== null) return { a: 'rua', alvo: e };
      }
      if ((alvo === 'carta' || (!facil && total(p.recursos) > LIMITE_DA_MAO)) && state.deck.length && temTudo(p.recursos, CUSTOS.carta)) {
        return { a: 'comprarCarta' };
      }
      return trocaDoRobo(state, p) || { a: 'passar' };
    }
    default:
      return null;
  }
}
