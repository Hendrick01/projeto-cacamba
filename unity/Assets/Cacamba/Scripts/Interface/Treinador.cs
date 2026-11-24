using System;
using System.Collections.Generic;
using System.Linq;
using Cacamba.Efeitos;
using Cacamba.Modelo;
using UnityEngine;
using UnityEngine.UIElements;

namespace Cacamba.Interface
{
    /// <summary>
    /// O TREINADOR do tutorial: uma personagem do elenco que, a cada lance, diz
    /// o próximo passo e acende o que tocar — o monte, o meio, as cartas certas
    /// da mão, o feltro onde baixar ou o jogo onde encaixar.
    ///
    /// Ele NÃO segue um roteiro fixo: olha a mesa de agora e escolhe a lição
    /// (puxar, pegar do meio, baixar, encaixar, descartar, bater). A rodada do
    /// tutorial é arrumada no servidor (shared/tutorial.js) para essas lições
    /// aparecerem em duas vezes; se quem aprende fizer outra coisa, o treinador
    /// acompanha o jogo do jeito que ficou.
    /// </summary>
    public sealed class Treinador
    {
        const string Professora = "lyly";

        public readonly VisualElement Raiz;
        public bool Ativo { get; private set; }
        /// <summary>A rodada acabou e o cartão de despedida está na tela.</summary>
        public bool NoFim { get; private set; }

        public Action AoSair, AoRegras, AoContinuar;
        // o que acender: na mesa 3D e na mão
        public Action<bool> AcendeMonte, AcendeMeio, AcendeFeltro;
        public Action<int> AcendeJogo;                       // −1 apaga
        public Action<ICollection<int>> DestacaCartas;       // null apaga

        readonly Label titulo, texto;
        readonly VisualElement botoes;
        Visao visao;
        string eu;
        bool viuBoasVindas;
        string passoAtual;

        public Treinador()
        {
            Raiz = U.Div("treinador");
            // O título vai numa linha só dele, de ponta a ponta: ao lado do rosto,
            // quando quebrava em duas linhas a segunda passava por cima do texto.
            var topo = U.Div("linha");
            topo.Add(U.Imagem(Resources.Load<Texture2D>($"Personagens/{Professora}-avatar"), "treinador-rosto"));
            topo.Add(U.Texto("Lyly, da casa", "treinador-quem"));
            Raiz.Add(topo);
            titulo = U.Titulo("", "treinador-titulo");
            Raiz.Add(titulo);
            texto = U.Texto("", "treinador-texto");
            Raiz.Add(texto);
            botoes = U.Div("linha", "treinador-botoes");
            Raiz.Add(botoes);
            U.Mostra(Raiz, false);
            // deitado ou em pé, ele muda de canto (ver Posiciona)
            Raiz.RegisterCallback<AttachToPanelEvent>(_ => Posiciona());
        }

        bool seguePai;

        public void Liga()
        {
            Ativo = true;
            NoFim = false;
            viuBoasVindas = false;
            passoAtual = null;
            U.Mostra(Raiz, true);
            // girou a tela: o cartão troca de canto
            if (!seguePai && Raiz.parent != null)
            {
                seguePai = true;
                Raiz.parent.RegisterCallback<GeometryChangedEvent>(_ => { if (Ativo) Posiciona(); });
            }
        }

        public void Desliga()
        {
            Ativo = false;
            NoFim = false;
            U.Mostra(Raiz, false);
            Apaga();
        }

        void Apaga()
        {
            AcendeMonte?.Invoke(false);
            AcendeMeio?.Invoke(false);
            AcendeFeltro?.Invoke(false);
            AcendeJogo?.Invoke(-1);
            DestacaCartas?.Invoke(null);
        }

        /// <summary>Uma visão nova da mesa: escolhe a lição de agora.</summary>
        public void Atualiza(Visao v, string meuId)
        {
            if (!Ativo) return;
            visao = v;
            eu = meuId;
            Posiciona();
            Decide();
        }

        /// <summary>
        /// Deitado (computador, celular de lado), o cartão vai para o canto de
        /// baixo à esquerda, acima da mão — o meio é das pilhas e a direita é dos
        /// botões. Em pé, ele fica no alto, de lado a lado.
        /// </summary>
        void Posiciona()
        {
            var pai = Raiz.parent;
            float largura = pai != null ? pai.layout.width : Screen.width, altura = pai != null ? pai.layout.height : Screen.height;
            if (float.IsNaN(largura) || largura <= 0) { largura = Screen.width; altura = Screen.height; }
            bool deitada = largura > altura * 1.15f;
            float mao = Mathf.Clamp(altura * 0.23f, 96f, 190f) + 34f;
            if (deitada)
            {
                Raiz.style.left = 12;
                Raiz.style.right = StyleKeyword.Auto;
                Raiz.style.top = StyleKeyword.Auto;
                Raiz.style.bottom = mao + 14f;
                Raiz.style.width = Mathf.Min(360f, largura * 0.34f);
            }
            else
            {
                Raiz.style.left = 10;
                Raiz.style.right = 10;
                Raiz.style.top = 54;
                Raiz.style.bottom = StyleKeyword.Auto;
                Raiz.style.width = StyleKeyword.Auto;
            }
        }

        // -------------------------------------------------------------- lições

        void Decide()
        {
            Apaga();
            var v = visao;
            var you = v?.Voce;
            if (v == null || you == null) return;

            if (v.Fase == "roundEnd" || v.Fase == "gameEnd") { Fim(); return; }
            NoFim = false;

            if (!viuBoasVindas)
            {
                Mostra("boas-vindas", "Bem-vindo à mesa!",
                    "O Caçamba tem 7 rodadas, e cada uma pede um CONTRATO. Nesta, o contrato é 2 TRINCAS — trinca são 3 cartas do mesmo valor, de naipes diferentes. Quem fica sem nenhuma carta na mão BATE e ganha a rodada.",
                    ("Bora!", () => { viuBoasVindas = true; Decide(); }));
                return;
            }

            bool minha = v.VezId == eu;
            if (!minha)
            {
                Mostra("robo", "Vez do robô",
                    "Agora é ele: puxa uma carta, baixa o que tiver e descarta. Fique de olho no que ele larga no meio — pode ser justo o que falta para você.");
                return;
            }

            if (v.Fase == "draw")
            {
                var topo = v.TopoDoDescarte;
                if (topo != null && v.DescarteCompravel && FechaJogo(you, topo, out var par))
                {
                    Mostra("meio", "Olha o meio!",
                        $"Saiu um {Regras.Nome(topo)} no meio, e você tem {Lista(par)}: com ele fecha uma trinca. Toque na carta do MEIO para pegá-la — em vez de puxar do monte.");
                    AcendeMeio?.Invoke(true);
                    return;
                }
                Mostra("monte", "Sua vez: puxe uma carta",
                    "Toda vez começa puxando UMA carta. Toque no MONTE — a pilha virada, à esquerda." +
                    (topo != null ? $" A carta do meio ({Regras.Nome(topo)}) não te ajuda agora." : ""));
                AcendeMonte?.Invoke(true);
                return;
            }

            // fase de jogar: baixar, encaixar ou descartar
            if (you.FaltaT + you.FaltaS > 0)
            {
                var prontos = Regras.JogosProntos(you.Mao, you.FaltaT, you.FaltaS);
                if (prontos.Count > 0)
                {
                    var jogo = prontos[0];
                    bool fechaContrato = prontos.Count(j => !j.Sequencia) >= you.FaltaT && prontos.Count(j => j.Sequencia) >= you.FaltaS;
                    bool bate = fechaContrato && prontos.Sum(j => j.Cartas.Count) == you.Mao.Count;
                    if (bate)
                        Mostra("bater", "Hora de bater!",
                            $"{Lista(jogo.Cartas)} fecham o contrato — e são as últimas cartas da sua mão. Arraste uma delas para o FELTRO verde: o jogo desce, a mão fica vazia e você BATE.");
                    else
                        Mostra("baixar", "Você tem um jogo pronto!",
                            $"Viu a faixa colorida embaixo de {Lista(jogo.Cartas)}? Elas já formam {(jogo.Sequencia ? "uma sequência" : "uma trinca")}. Arraste uma delas para o FELTRO verde, na frente das pilhas, para BAIXAR. (O botão Baixar faz o mesmo.)");
                    DestacaCartas?.Invoke(jogo.Cartas.Select(c => c.Id).ToList());
                    AcendeFeltro?.Invoke(true);
                    return;
                }
            }

            if (you.Baixou || you.Mao.Count > 2)
            {
                foreach (var c in you.Mao)
                {
                    var alvo = OndeEncaixa(c, v);
                    if (alvo == null) continue;
                    bool meu = alvo.DonoId == eu;
                    Mostra("encaixar", "Encaixe!",
                        $"O {Regras.Nome(c)} cabe {(meu ? "no seu jogo" : "num jogo da mesa")}: " +
                        (alvo.EhSequencia ? "a sequência cresce pela ponta." : "na trinca, a carta a mais tem de ser de um naipe que já está nela.") +
                        " Arraste a carta para cima do jogo — ele brilha quando ela está em cima. Encaixar tira carta da mão sem esperar o contrato.");
                    DestacaCartas?.Invoke(new List<int> { c.Id });
                    AcendeJogo?.Invoke(alvo.Id);
                    return;
                }
            }

            var sugestao = SugereDescarte(you, v);
            if (sugestao == null) return;
            Mostra("descartar", "Descarte para passar a vez",
                $"Toda vez termina com um DESCARTE. Arraste a carta que menos serve — o {Regras.Nome(sugestao)} — até a pilha do MEIO. " +
                (you.Baixou ? "" : $"Guarde as cartas que podem formar jogo{(Pares(you).Count > 0 ? $", como {Lista(Pares(you))}" : "")}."));
            DestacaCartas?.Invoke(new List<int> { sugestao.Id });
            AcendeMeio?.Invoke(true);
        }

        void Fim()
        {
            NoFim = true;
            var r = visao.UltimaRodada;
            bool ganhei = r != null && r.Motivo == "bateu" && r.VencedorId == eu;
            if (ganhei)
            {
                PlayerPrefs.SetInt("cacamba-tutorial-feito", 1);
                PlayerPrefs.Save();
            }
            string comeco = ganhei
                ? "Você ficou sem cartas e ganhou a rodada. Quem não bateu soma os pontos do que sobrou na mão — e no fim das 7 rodadas ganha quem tiver MENOS pontos."
                : r != null && r.Motivo == "bateu"
                    ? "Desta vez o robô bateu primeiro. Quem não bate soma os pontos do que sobrou na mão — e no fim das 7 rodadas ganha quem tiver MENOS pontos."
                    : "O monte acabou sem ninguém bater: todo mundo soma o que sobrou na mão. No fim das 7 rodadas ganha quem tiver MENOS pontos.";
            Mostra("fim", ganhei ? "Você bateu!" : "A rodada acabou",
                comeco + " Daqui para a frente os contratos pedem SEQUÊNCIAS (4 cartas seguidas do mesmo naipe) e entra o CORINGA, que só vale em sequência. Tem mais regra da casa em Regras.",
                ("Continuar jogando", () => AoContinuar?.Invoke()),
                ("Ver as regras", () => AoRegras?.Invoke()),
                ("Sair", () => AoSair?.Invoke()));
        }

        // ------------------------------------------------------------- contas

        /// <summary>A carta do meio fecha um jogo do contrato com cartas da mão? (Devolve as da mão.)</summary>
        static bool FechaJogo(Voce you, Carta topo, out List<Carta> daMao)
        {
            daMao = new List<Carta>();
            if (you.FaltaT + you.FaltaS == 0) return false;
            var antes = Regras.JogosProntos(you.Mao, you.FaltaT, you.FaltaS);
            var com = Regras.JogosProntos(you.Mao.Concat(new[] { topo }).ToList(), you.FaltaT, you.FaltaS);
            if (com.Sum(j => j.Cartas.Count) <= antes.Sum(j => j.Cartas.Count)) return false;
            var jogo = com.FirstOrDefault(j => j.Cartas.Any(c => c.Id == topo.Id));
            if (jogo == null) return false;
            daMao = jogo.Cartas.Where(c => c.Id != topo.Id).ToList();
            return true;
        }

        /// <summary>O primeiro jogo da mesa onde a carta encaixa (os seus primeiro).</summary>
        JogoNaMesa OndeEncaixa(Carta c, Visao v)
        {
            foreach (var p in v.Jogadores.OrderBy(p => p.Id == eu ? 0 : 1))
                foreach (var j in p.Jogos)
                    if (Regras.PontasDoEncaixe(c, j).Count > 0) return j;
            return null;
        }

        /// <summary>Cartas que têm par de mesmo valor na mão (as que ainda podem virar trinca).</summary>
        static List<Carta> Pares(Voce you) =>
            you.Mao.Where(c => !c.Coringa && you.Mao.Count(x => x.Id != c.Id && !x.Coringa && x.Valor == c.Valor) > 0).ToList();

        /// <summary>
        /// A carta que menos serve, do jeito que se ensina: a que não está em jogo
        /// pronto, não tem par nem vizinho do mesmo naipe na mão e não encaixa na
        /// mesa — entre essas, a que vale mais ponto (se alguém bater, pesa menos).
        /// </summary>
        Carta SugereDescarte(Voce you, Visao v)
        {
            var mao = you.Mao;
            if (mao.Count == 0) return null;
            var prontas = new HashSet<int>(Regras.JogosProntos(mao, you.FaltaT, you.FaltaS).SelectMany(j => j.Cartas).Select(c => c.Id));
            bool Solta(Carta c) =>
                !c.Coringa && !prontas.Contains(c.Id)
                && !mao.Any(x => x.Id != c.Id && !x.Coringa && x.Valor == c.Valor)
                && !mao.Any(x => x.Id != c.Id && !x.Coringa && x.Naipe == c.Naipe && Math.Abs(x.Valor - c.Valor) <= 2)
                && OndeEncaixa(c, v) == null;
            var soltas = mao.Where(Solta).ToList();
            var candidatas = soltas.Count > 0 ? soltas : mao.Where(c => !prontas.Contains(c.Id) && !c.Coringa).ToList();
            if (candidatas.Count == 0) candidatas = mao;
            return candidatas.OrderByDescending(Regras.Pontos).First();
        }

        static string Lista(List<Carta> cartas)
        {
            var nomes = cartas.Select(Regras.Nome).ToList();
            if (nomes.Count == 0) return "";
            if (nomes.Count == 1) return "o " + nomes[0];
            return string.Join(", ", nomes.Take(nomes.Count - 1)) + " e " + nomes.Last();
        }

        // ------------------------------------------------------------- cartão

        void Mostra(string passo, string tituloDoPasso, string textoDoPasso, params (string rotulo, Action acao)[] acoes)
        {
            bool novo = passo != passoAtual;
            passoAtual = passo;
            titulo.text = tituloDoPasso;
            texto.text = textoDoPasso;
            botoes.Clear();
            foreach (var (rotulo, acao) in acoes)
            {
                var a = acao;
                botoes.Add(U.Botao(rotulo, () => a?.Invoke(), "botao-pequeno", botoes.childCount == 0 ? "botao-principal" : null));
            }
            if (passo != "fim") botoes.Add(U.Botao("Sair do tutorial", () => AoSair?.Invoke(), "botao-pequeno", "treinador-sair"));
            U.Mostra(Raiz, true);
            if (novo)
            {
                // um toque e um pulinho do cartão: o passo mudou, olhe para cá
                Sons.Toca(Som.Emote, 0.45f, 1.15f);
                Raiz.AddToClassList("treinador-novo");
                Raiz.schedule.Execute(() => Raiz.RemoveFromClassList("treinador-novo")).StartingIn(260);
            }
        }
    }
}
