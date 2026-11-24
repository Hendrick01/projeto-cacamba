using System.Collections.Generic;
using System.Linq;

namespace Cacamba.Modelo
{
    /// <summary>
    /// O pouco de regra que a tela precisa para não oferecer um gesto que o juiz
    /// recusaria. Quem DECIDE continua sendo o servidor (shared/engine.js): estas
    /// funções só acendem ou apagam botões. Cada uma diz de qual função do motor
    /// ela é o espelho, para as duas não divergirem.
    /// </summary>
    public static class Regras
    {
        static readonly string[] Valores = { "Ás", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Valete", "Dama", "Rei" };
        static readonly string[] ValoresCurtos = { "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" };
        public static readonly string[] Naipes = { "espadas", "copas", "ouros", "paus" };

        // A fonte do jogo (Nunito, só o subconjunto latino) não tem ♠♥♦♣, então
        // o texto diz o naipe por extenso; a figura da carta continua com o desenho.
        public static string Nome(Carta c)
        {
            if (c == null) return "";
            if (c.Coringa) return "coringa";
            return $"{Valores[c.Valor - 1]} de {Naipes[c.Naipe]}";
        }

        public static string NomeCurto(Carta c)
        {
            if (c == null) return "";
            if (c.Coringa) return "coringa";
            return $"{ValoresCurtos[c.Valor - 1]} {Naipes[c.Naipe]}";
        }

        /// <summary>Recurso da arte (Resources/Cartas). Espelho de public/baralho.js → arteDaCarta.</summary>
        public static string Arte(Carta c)
        {
            if (c == null) return "verso";
            if (c.Coringa) return $"coringa-{(c.Id % 2) + 1}";
            return $"{c.Naipe}-{c.Valor}";
        }

        /// <summary>engine.js → cardPoints: Ás 15, coringa 20, o resto pelo valor.</summary>
        public static int Pontos(Carta c) => c.Coringa ? 20 : c.Valor == 1 ? 15 : c.Valor;

        public static List<Carta> Ordena(List<Carta> mao, bool porNaipe)
        {
            int ValorOrdem(Carta c) => c.Valor == 1 ? 14 : c.Valor;
            var reais = mao.Where(c => !c.Coringa);
            var ordenadas = porNaipe
                ? reais.OrderBy(c => c.Naipe).ThenBy(ValorOrdem)
                : reais.OrderBy(ValorOrdem).ThenBy(c => c.Naipe);
            return ordenadas.Concat(mao.Where(c => c.Coringa)).ToList();
        }

        /// <summary>engine.js → removableCards: o que está SOBRANDO num jogo.</summary>
        public static List<Carta> Removiveis(JogoNaMesa j)
        {
            if (j.EhSequencia)
                return j.Cartas.Count <= 4 ? new List<Carta>() : new List<Carta> { j.Cartas[0], j.Cartas[j.Cartas.Count - 1] };
            if (j.Cartas.Count <= 3) return new List<Carta>();
            return j.Cartas.Where(c =>
            {
                var resto = j.Cartas.Where(x => x.Id != c.Id).ToList();
                return resto.Count >= 3 && resto.Select(x => x.Naipe).Distinct().Count() >= 3;
            }).ToList();
        }

        /// <summary>engine.js → cardCobreCoringa: a carta é exatamente a que o coringa representa?</summary>
        public static bool CobreCoringa(Carta c, JogoNaMesa j)
        {
            if (c == null || c.Coringa || !j.EhSequencia) return false;
            int idx = j.Cartas.FindIndex(x => x.Coringa);
            if (idx < 0 || idx >= j.Valores.Count) return false;
            if (c.Naipe != j.Naipe) return false;
            int valor = j.Valores[idx];
            return c.Valor == valor || (c.Valor == 1 && valor == 14);
        }

        /// <summary>engine.js → trocasNaTrinca: quais cartas da trinca podem sair no lugar desta.</summary>
        public static List<Carta> TrocasNaTrinca(Carta c, JogoNaMesa j)
        {
            var r = new List<Carta>();
            if (c == null || j.EhSequencia || c.Coringa || c.Valor != j.ValorDaTrinca) return r;
            foreach (var sai in j.Cartas)
            {
                if (sai.Coringa || sai.Id == c.Id) continue;
                var depois = j.Cartas.Select(x => x.Id == sai.Id ? c : x).ToList();
                if (depois.Count >= 3 && depois.Select(x => x.Naipe).Distinct().Count() >= 3) r.Add(sai);
            }
            return r;
        }

        public static bool TemCoringa(JogoNaMesa j) => j.Cartas.Any(c => c.Coringa);

        // ------------------------------------------------------------ dicas
        // Tudo daqui para baixo é só DICA: acende cartas na mão, agrupa os jogos
        // prontos e diz onde uma carta arrastada cabe. Se divergir do motor, o
        // pior que acontece é uma dica errada — a jogada continua indo ao
        // servidor, e é ele quem aceita ou recusa.

        /// <summary>Um jogo que a mão já forma: trinca (3) ou sequência (4).</summary>
        public sealed class JogoNaMao
        {
            public bool Sequencia;
            public List<Carta> Cartas = new List<Carta>();
        }

        /// <summary>engine.js → MAX_JOKERS_PER_SEQ.</summary>
        const int CoringasPorSequencia = 1;

        /// <summary>engine.js → cardValues: o Ás vale 1 ou 14; o coringa não casa com nada.</summary>
        static int[] ValoresDe(Carta c) => c.Coringa ? new int[0] : c.Valor == 1 ? new[] { 1, 14 } : new[] { c.Valor };

        /// <summary>
        /// engine.js → findContractMelds: a mão tem `precisaT` trincas e
        /// `precisaS` sequências que não dividem carta? Devolve os jogos ou null.
        /// Trinca = 3 do mesmo valor, de naipes diferentes, sem coringa; sequência
        /// = exatamente 4 seguidas do mesmo naipe, com até 1 coringa.
        /// </summary>
        public static List<JogoNaMao> AchaJogos(List<Carta> cartas, int precisaT, int precisaS)
        {
            var usadas = new HashSet<int>();
            var achados = new List<JogoNaMao>();

            List<(int valor, List<Carta> cartas)> Trincas(int valorMin)
            {
                var saida = new List<(int, List<Carta>)>();
                for (int r = valorMin; r <= 13; r++)
                {
                    var porNaipe = new Carta[4];
                    foreach (var c in cartas)
                        if (!c.Coringa && c.Valor == r && !usadas.Contains(c.Id) && porNaipe[c.Naipe] == null) porNaipe[c.Naipe] = c;
                    var tem = Enumerable.Range(0, 4).Where(s => porNaipe[s] != null).ToList();
                    if (tem.Count < 3) continue;
                    for (int i = 0; i < tem.Count; i++)
                        for (int j = i + 1; j < tem.Count; j++)
                            for (int k = j + 1; k < tem.Count; k++)
                                saida.Add((r, new List<Carta> { porNaipe[tem[i]], porNaipe[tem[j]], porNaipe[tem[k]] }));
                }
                return saida;
            }

            List<(int chave, List<Carta> cartas)> Sequencias(int chaveMin)
            {
                var puras = new List<(int, List<Carta>)>();
                var comCoringa = new List<(int, List<Carta>)>();
                var coringas = cartas.Where(c => c.Coringa && !usadas.Contains(c.Id)).ToList();
                int maxCoringas = System.Math.Min(coringas.Count, CoringasPorSequencia);
                var mascaras = new List<int> { 0 };
                for (int m = 1; m < 16; m++)
                {
                    int bits = 0;
                    for (int b = 0; b < 4; b++) if ((m & (1 << b)) != 0) bits++;
                    if (bits <= maxCoringas) mascaras.Add(m);
                }
                for (int s = 0; s < 4; s++)
                {
                    var porValor = new Dictionary<int, Carta>();
                    foreach (var c in cartas)
                    {
                        if (c.Coringa || c.Naipe != s || usadas.Contains(c.Id)) continue;
                        foreach (int v in ValoresDe(c)) if (!porValor.ContainsKey(v)) porValor[v] = c;
                    }
                    for (int inicio = 1; inicio <= 11; inicio++)
                    {
                        int chave = s * 16 + inicio;
                        if (chave < chaveMin) continue;
                        foreach (int mascara in mascaras)
                        {
                            var seq = new List<Carta>();
                            int gastos = 0;
                            bool ok = true;
                            for (int i = 0; i < 4; i++)
                            {
                                if ((mascara & (1 << i)) != 0) { seq.Add(coringas[gastos]); gastos++; continue; }
                                if (porValor.TryGetValue(inicio + i, out var carta)) seq.Add(carta);
                                else { ok = false; break; }
                            }
                            if (!ok) continue;
                            // o Ás não pode ser o 1 e o 14 da mesma sequência (não há sequência de 14 cartas, mas a carta é uma só)
                            if (seq.Select(c => c.Id).Distinct().Count() != 4) continue;
                            (gastos == 0 ? puras : comCoringa).Add((chave, seq));
                        }
                    }
                }
                puras.AddRange(comCoringa);   // primeiro as puras: só gasta coringa quando precisa
                return puras;
            }

            bool Resolve(int faltaT, int faltaS, int valorMin, int chaveMin)
            {
                if (faltaT == 0 && faltaS == 0) return true;
                if (faltaT > 0)
                {
                    foreach (var (valor, trinca) in Trincas(valorMin))
                    {
                        foreach (var c in trinca) usadas.Add(c.Id);
                        achados.Add(new JogoNaMao { Sequencia = false, Cartas = trinca });
                        if (Resolve(faltaT - 1, faltaS, valor, chaveMin)) return true;
                        achados.RemoveAt(achados.Count - 1);
                        foreach (var c in trinca) usadas.Remove(c.Id);
                    }
                    return false;
                }
                foreach (var (chave, seq) in Sequencias(chaveMin))
                {
                    foreach (var c in seq) usadas.Add(c.Id);
                    achados.Add(new JogoNaMao { Sequencia = true, Cartas = seq });
                    if (Resolve(0, faltaS - 1, 1, chave)) return true;
                    achados.RemoveAt(achados.Count - 1);
                    foreach (var c in seq) usadas.Remove(c.Id);
                }
                return false;
            }

            return Resolve(precisaT, precisaS, 1, 0) ? achados : null;
        }

        /// <summary>
        /// engine.js → melhorCobertura: o máximo do que FALTA do contrato que a
        /// mão já forma (lista vazia quando ainda não forma nada).
        /// </summary>
        public static List<JogoNaMao> JogosProntos(List<Carta> mao, int faltaT, int faltaS)
        {
            var combinacoes = new List<(int a, int b)>();
            for (int a = faltaT; a >= 0; a--)
                for (int b = faltaS; b >= 0; b--)
                    if (a + b > 0) combinacoes.Add((a, b));
            foreach (var (a, b) in combinacoes.OrderByDescending(x => x.a * 3 + x.b * 4))
            {
                var r = AchaJogos(mao, a, b);
                if (r != null) return r;
            }
            return new List<JogoNaMao>();
        }

        /// <summary>
        /// engine.js → melhorJogoExtra: com o contrato cumprido, o que ainda dá
        /// para baixar a mais — o maior conjunto de jogos que a mão forma.
        /// </summary>
        public static List<JogoNaMao> JogosExtras(List<Carta> mao)
        {
            var combinacoes = new List<(int a, int b)>();
            for (int a = mao.Count / 3; a >= 0; a--)
                for (int b = mao.Count / 4; b >= 0; b--)
                    if (a + b > 0 && a * 3 + b * 4 <= mao.Count) combinacoes.Add((a, b));
            foreach (var (a, b) in combinacoes.OrderByDescending(x => x.a * 3 + x.b * 4))
            {
                var r = AchaJogos(mao, a, b);
                if (r != null) return r;
            }
            return new List<JogoNaMao>();
        }

        /// <summary>
        /// engine.js → layoffOption/layoffEnds: por onde a carta encaixa neste
        /// jogo. Trinca: ["t"]. Sequência: "lo" e/ou "hi". Vazio: não encaixa.
        /// </summary>
        public static List<string> PontasDoEncaixe(Carta c, JogoNaMesa j)
        {
            var pontas = new List<string>();
            if (c == null || j == null || j.Cartas.Count == 0) return pontas;
            if (!j.EhSequencia)
            {
                // só carta real, do valor da trinca e de um naipe que JÁ está nela
                if (!c.Coringa && c.Valor == j.ValorDaTrinca && j.Cartas.Any(x => x.Naipe == c.Naipe)) pontas.Add("t");
                return pontas;
            }
            if (j.Valores.Count == 0) return pontas;
            int lo = j.Valores[0], hi = j.Valores[j.Valores.Count - 1];
            if (c.Coringa)
            {
                if (j.Cartas.Count(x => x.Coringa) >= CoringasPorSequencia) return pontas;
                if (lo - 1 >= 1) pontas.Add("lo");
                if (hi + 1 <= 14) pontas.Add("hi");
                return pontas;
            }
            if (c.Naipe != j.Naipe) return pontas;
            foreach (int v in ValoresDe(c))
            {
                if (v == lo - 1 && v >= 1 && !pontas.Contains("lo")) pontas.Add("lo");
                if (v == hi + 1 && v <= 14 && !pontas.Contains("hi")) pontas.Add("hi");
            }
            if (pontas.Count == 0)
            {
                // o coringa da ponta muda de ponta para a carta caber (regra da casa)
                var primeira = j.Cartas[0];
                var ultima = j.Cartas[j.Cartas.Count - 1];
                foreach (int v in ValoresDe(c))
                {
                    if (primeira.Coringa && v == hi + 2 && v <= 14 && !pontas.Contains("hi")) pontas.Add("hi");
                    if (ultima.Coringa && v == lo - 2 && v >= 1 && !pontas.Contains("lo")) pontas.Add("lo");
                }
            }
            return pontas;
        }

        /// <summary>A carta entra neste jogo de algum jeito — encaixando, ou no lugar do coringa?</summary>
        public static bool CabeNoJogo(Carta c, JogoNaMesa j) => PontasDoEncaixe(c, j).Count > 0 || CobreCoringa(c, j);

        public static string Contrato(int t, int s)
        {
            var partes = new List<string>();
            if (t > 0) partes.Add($"{t} {(t > 1 ? "trincas" : "trinca")}");
            if (s > 0) partes.Add($"{s} {(s > 1 ? "sequências" : "sequência")}");
            return partes.Count == 0 ? "nada" : string.Join(" + ", partes);
        }
    }
}
