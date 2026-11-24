using System;
using System.Collections.Generic;
using System.Linq;
using Cacamba.Efeitos;
using Cacamba.Mesa;
using Cacamba.Modelo;
using Cacamba.Rede;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace Cacamba.Interface
{
    /// <summary>
    /// A interface por cima da mesa 3D durante a partida: rodada e contrato, a
    /// placa de cada adversário, a sua mão em leque, os botões da fase, o visor
    /// dos jogos baixados, o placar e o menu. Toda jogada sai como
    /// <see cref="Cliente.Acao"/> e o servidor confere — os botões só não oferecem
    /// o que ele recusaria com certeza.
    ///
    /// A MÃO é para pegar com o dedo: tocar escolhe a carta; arrastar dentro da
    /// mão muda a ordem; arrastar para a mesa JOGA — no descarte descarta, num
    /// jogo baixado encaixa, no feltro baixa o jogo de que a carta faz parte (ou
    /// as cartas escolhidas). As cartas que já formam jogo ganham uma marca da
    /// mesma cor, e o contrato da rodada aparece em pílulas: na mesa, na mão,
    /// falta.
    /// </summary>
    public sealed class HudJogo
    {
        sealed class Placa
        {
            public VisualElement Raiz;
            public Label Nome, Detalhe, Verbo, Balao;
            public string DetalheBase = "";
            public float VerboAte, BalaoAte;
        }

        /// <summary>Como a mão se arruma. "Sua" é a ordem que você fez arrastando.</summary>
        enum Ordem { Naipe = 0, Valor = 1, Jogos = 2, Sua = 3 }

        // onde uma carta está dentro da faixa da mão (canto de cima à esquerda, em pixels do painel)
        struct LugarLocal
        {
            public float X, Y, Giro, Sobe;
        }

        public readonly VisualElement Raiz;
        public string AnfitriaoId;
        public Action AoSair;
        /// <summary>Quanto da tela (0–1, de baixo) a mão e o rodapé cobrem — a mesa põe os seus jogos acima disso.</summary>
        public Action<float> AoMudarAlturaDaMao;
        /// <summary>O que a mesa 3D tem embaixo de um ponto da tela (pixels, y para cima).</summary>
        public Func<Vector2, AlvoDoArrasto> AlvoNaMesa;
        /// <summary>Acende na mesa o alvo sob a carta arrastada e os jogos onde ela cabe.</summary>
        public Action<AlvoDoArrasto, ICollection<int>, bool> RealcaMesa;
        public Action ApagaRealces;
        /// <summary>O botão Regras da barra de cima.</summary>
        public Action AoRegras;
        /// <summary>Onde o treinador do tutorial mora: acima da mesa e da mão, abaixo dos modais.</summary>
        public readonly VisualElement CamadaDoTreinador;

        // cartas que o treinador mandou olhar: piscam e sobem um pouco
        readonly HashSet<int> destacadas = new HashSet<int>();
        bool piscaDestaque;

        readonly Cliente cliente;
        readonly Label infoRodada, infoContrato, infoMonte, faixaVez, minhaInfo, relogioTexto;
        readonly VisualElement faixa, avisos, placas, rodape, acoes, mao, modais, contratoUi, relogio, relogioCheio, linhaInfo;
        readonly Button botaoOrdem;
        readonly Dictionary<string, Placa> placaPorId = new Dictionary<string, Placa>();

        // a mão
        readonly Dictionary<int, Image> cartasUi = new Dictionary<int, Image>();
        readonly Dictionary<int, LugarLocal> lugares = new Dictionary<int, LugarLocal>();
        readonly HashSet<int> selecionadas = new HashSet<int>();
        readonly HashSet<int> novas = new HashSet<int>();
        readonly HashSet<int> chegando = new HashSet<int>();   // escondidas até a carta 3D pousar
        HashSet<int> maoAnterior;
        List<int> ordemSua = new List<int>();
        Ordem ordem, ordemDeBase;
        float cartaL, cartaA;                                    // tamanho da carta na última arrumação

        // as dicas: os jogos que a mão já forma
        List<Regras.JogoNaMao> prontos = new List<Regras.JogoNaMao>();
        readonly Dictionary<int, int> grupoDaCarta = new Dictionary<int, int>();
        bool prontosSaoDoContrato;

        // o arrasto
        int arrastando = -1, ponteiro = -1;
        bool arrastou, soltando;
        Vector2 apertoEm;
        List<int> ordemNoArrasto;
        HashSet<int> juntas;                 // cartas que descem junto com a arrastada: sobem um pouco
        int pendente = -1;                   // carta solta na mesa, esperando o servidor responder
        float pendenteAte;
        int quadroDoFimDoArrasto = -1;

        Visao visao;
        string eu;
        string faseDoPlacar;
        bool placarFechado;
        bool visorAberto;
        string visorFoco;
        int segundoDoRelogio = -1;

        public HudJogo(Cliente cliente)
        {
            // sem cliente, toda jogada daria NullReferenceException só no clique:
            // melhor quebrar já na abertura, onde o erro aparece na hora
            this.cliente = cliente ?? throw new ArgumentNullException(nameof(cliente));
            Raiz = U.Div("camada");
            Raiz.pickingMode = PickingMode.Ignore;

            ordemDeBase = (Ordem)Mathf.Clamp(PlayerPrefs.GetInt("cacamba-ordem", PlayerPrefs.GetInt("cacamba-ordem-naipe", 1) == 1 ? 0 : 1), 0, 2);
            ordem = ordemDeBase;

            // barra de cima
            var barra = U.Div("barra-topo");
            infoRodada = U.Texto("", "info-rodada");
            infoContrato = U.Texto("", "info-contrato");
            infoMonte = U.Texto("", "nota");
            infoMonte.style.marginLeft = 10;
            var espaco = U.Div("cresce");
            barra.Add(infoRodada);
            // nunca mais estreito que isto: espremido, o texto virava uma coluna de letras
            infoContrato.style.minWidth = 76;
            barra.Add(infoContrato);
            barra.Add(espaco);
            barra.Add(infoMonte);
            // A barra só leva o que cabe num celular em pé. A ordem da mão mora
            // junto da mão (no rodapé) e as regras moram no Menu.
            botaoOrdem = U.Botao("", ProximaOrdem, "botao-pequeno");
            barra.Add(U.Botao("Jogos", () => AbreVisor(null), "botao-pequeno"));
            barra.Add(U.Botao("Menu", AbreMenu, "botao-pequeno"));
            Raiz.Add(barra);
            AtualizaBotaoDaOrdem();

            placas = U.Transparente(U.Div("camada"));
            Raiz.Add(placas);

            avisos = U.Transparente(U.Div("avisos"));
            Raiz.Add(avisos);

            // o rodapé, logo acima da mão: de quem é a vez, o relógio, a sua conta, o contrato e os botões
            rodape = U.Div("rodape");
            rodape.pickingMode = PickingMode.Ignore;
            faixa = U.Div("faixa-vez");
            faixaVez = U.Texto("", "faixa-vez-texto");
            faixa.Add(faixaVez);
            rodape.Add(U.Transparente(faixa));

            relogio = U.Div("relogio");
            var trilho = U.Div("relogio-trilho");
            relogioCheio = U.Div("relogio-cheio");
            trilho.Add(relogioCheio);
            relogioTexto = U.Texto("", "relogio-texto");
            relogio.Add(trilho);
            relogio.Add(relogioTexto);
            rodape.Add(U.Transparente(relogio));
            U.Mostra(relogio, false);

            minhaInfo = U.Texto("", "minha-info");
            minhaInfo.pickingMode = PickingMode.Ignore;
            linhaInfo = U.Div("linha");
            linhaInfo.pickingMode = PickingMode.Ignore;
            linhaInfo.Add(minhaInfo);
            linhaInfo.Add(botaoOrdem);
            rodape.Add(linhaInfo);
            contratoUi = U.Div("contrato");
            contratoUi.pickingMode = PickingMode.Ignore;
            rodape.Add(contratoUi);
            acoes = U.Div("acoes");
            acoes.pickingMode = PickingMode.Ignore;
            rodape.Add(acoes);
            Raiz.Add(rodape);
            rodape.RegisterCallback<GeometryChangedEvent>(_ => InformaAlturaDaMao());

            mao = U.Div("mao");
            mao.pickingMode = PickingMode.Ignore;
            Raiz.Add(mao);
            Raiz.RegisterCallback<GeometryChangedEvent>(_ => ArrumaMao());

            CamadaDoTreinador = U.Div("camada");
            CamadaDoTreinador.pickingMode = PickingMode.Ignore;
            Raiz.Add(CamadaDoTreinador);

            modais = U.Div("camada");
            modais.pickingMode = PickingMode.Ignore;
            Raiz.Add(modais);
        }

        /// <summary>O treinador manda olhar para estas cartas da mão (null apaga).</summary>
        public void DestacaCartas(ICollection<int> ids)
        {
            bool igual = ids == null ? destacadas.Count == 0 : destacadas.SetEquals(ids);
            if (igual) return;
            destacadas.Clear();
            if (ids != null) foreach (int id in ids) destacadas.Add(id);
            ArrumaMao();
        }

        /// <summary>Fecha o placar sem esquecer dele (o cartão final do tutorial vem antes).</summary>
        public void EscondePlacar()
        {
            if (visao == null || (visao.Fase != "roundEnd" && visao.Fase != "gameEnd")) return;
            placarFechado = true;
            FechaModais();
        }

        /// <summary>Abre de novo o placar da rodada que acabou.</summary>
        public void MostraPlacar()
        {
            if (visao == null || (visao.Fase != "roundEnd" && visao.Fase != "gameEnd")) return;
            placarFechado = false;
            AbrePlacar();
        }

        string Nome(string id)
        {
            if (id == null) return "???";
            if (id == eu) return "Você";
            var p = visao?.Jogador(id);
            return p != null ? p.Nome : "???";
        }

        bool EmJogo => visao != null && (visao.Fase == "draw" || visao.Fase == "play");
        bool MinhaVez => visao != null && visao.VezId == eu && EmJogo;

        // ------------------------------------------------------------ estado

        /// <summary>
        /// Cartas novas na sua mão neste lance, na ordem em que aparecem. Ficam
        /// invisíveis até a mesa avisar (<see cref="Revela"/>) que a carta 3D pousou.
        /// </summary>
        public List<int> Chegaram { get; private set; } = new List<int>();

        public void Atualiza(Visao v, string meuId, bool rodadaNova = false)
        {
            bool eraMinha = MinhaVez;
            visao = v;
            eu = meuId;
            var you = v.Voce;
            var maoDeAgora = you?.Mao ?? new List<Carta>();
            var agora = new HashSet<int>(maoDeAgora.Select(c => c.Id));

            // os ids das cartas recomeçam a cada rodada: nada do que é guardado por id vale mais
            if (rodadaNova)
            {
                selecionadas.Clear();
                novas.Clear();
                ordemSua.Clear();
                if (ordem == Ordem.Sua) { ordem = ordemDeBase; AtualizaBotaoDaOrdem(); }
                CancelaArrasto();
                foreach (var el in cartasUi.Values) el.RemoveFromHierarchy();
                cartasUi.Clear();
                lugares.Clear();
            }

            // o que chegou: até três cartas são um lance (ganham a borda de carta nova);
            // mais que isso é a mão inteira sendo dada
            var chegaram = new List<int>();
            if (rodadaNova) chegaram.AddRange(agora);
            else if (maoAnterior != null) chegaram.AddRange(agora.Where(id => !maoAnterior.Contains(id)));
            if (chegaram.Count > 0)
            {
                novas.Clear();
                if (!rodadaNova && chegaram.Count <= 3) foreach (int id in chegaram) novas.Add(id);
            }
            maoAnterior = agora;
            selecionadas.RemoveWhere(id => !agora.Contains(id));
            novas.RemoveWhere(id => !agora.Contains(id));
            chegando.RemoveWhere(id => !agora.Contains(id));
            ordemSua.RemoveAll(id => !agora.Contains(id));
            foreach (var c in maoDeAgora) if (!ordemSua.Contains(c.Id)) ordemSua.Add(c.Id);
            if (ordemNoArrasto != null)
            {
                ordemNoArrasto.RemoveAll(id => !agora.Contains(id));
                foreach (var c in maoDeAgora) if (!ordemNoArrasto.Contains(c.Id)) ordemNoArrasto.Add(c.Id);
            }
            // a carta solta na mesa: se o servidor a manteve na mão, ela volta para o lugar
            if (pendente >= 0) pendente = -1;
            if (arrastando >= 0 && !agora.Contains(arrastando)) CancelaArrasto();

            CalculaDicas();

            // as que chegaram ficam escondidas até a carta da mesa pousar (com uma
            // rede de segurança: nenhuma carta pode ficar invisível para sempre)
            if (Movimento.Ligado && chegaram.Count > 0)
            {
                foreach (int id in chegaram) chegando.Add(id);
                var lote = chegaram.ToArray();
                Raiz.schedule.Execute(() => { foreach (int id in lote) Revela(id); }).StartingIn(1800);
            }

            infoRodada.text = v.Fase == "gameEnd" ? "Fim de jogo" : $"Rodada {v.Rodada + 1}/{v.TotalRodadas}";
            infoContrato.text = v.ContratoTexto ?? "";
            infoMonte.text = $"Monte {v.CartasNoMonte}" + (v.DescarteTravado ? "  ·  meio travado (coringa)" : "");

            AtualizaFaixa();
            AtualizaPlacas();
            AtualizaMinhaInfo();
            DesenhaAcoes();
            ArrumaMao();
            ConfereModalDeFase();
            // o visor aberto acompanha a mesa: refaz com os jogos de agora
            if (visorAberto) AbreVisor(visorFoco);

            var ordemNaTela = MaoOrdenada().Select(c => c.Id).ToList();
            Chegaram = ordemNaTela.Where(id => chegaram.Contains(id) && chegando.Contains(id)).ToList();

            // a vez chegou em você: um toque de sino e um pulso no aparelho
            if (MinhaVez && !eraMinha && v.Fase == "draw")
            {
                Sons.Toca(Som.SuaVez);
                Vibra.Pulso(45);
            }
            segundoDoRelogio = -1;
            Tique();
        }

        /// <summary>A carta 3D pousou na mão: a da interface aparece.</summary>
        public void Revela(int id)
        {
            if (!chegando.Remove(id)) return;
            if (cartasUi.TryGetValue(id, out var el)) el.style.opacity = 1f;
        }

        void CalculaDicas()
        {
            prontos = new List<Regras.JogoNaMao>();
            grupoDaCarta.Clear();
            prontosSaoDoContrato = false;
            var you = visao?.Voce;
            if (you == null || !EmJogo) return;
            if (you.FaltaT + you.FaltaS > 0)
            {
                prontos = Regras.JogosProntos(you.Mao, you.FaltaT, you.FaltaS);
                prontosSaoDoContrato = true;
            }
            else prontos = Regras.JogosExtras(you.Mao);
            for (int g = 0; g < prontos.Count; g++)
                foreach (var c in prontos[g].Cartas) grupoDaCarta[c.Id] = g;
        }

        int ProntasT => prontosSaoDoContrato ? prontos.Count(j => !j.Sequencia) : 0;
        int ProntasS => prontosSaoDoContrato ? prontos.Count(j => j.Sequencia) : 0;

        /// <summary>O que falta do contrato já está inteiro na mão?</summary>
        bool ContratoNaMao
        {
            get
            {
                var you = visao?.Voce;
                return you != null && prontosSaoDoContrato && you.FaltaT + you.FaltaS > 0 && ProntasT >= you.FaltaT && ProntasS >= you.FaltaS;
            }
        }

        void AtualizaFaixa()
        {
            string texto;
            bool minha = visao.VezId == eu;
            if (visao.Fase == "roundEnd") texto = "Rodada encerrada";
            else if (visao.Fase == "gameEnd") texto = "Partida encerrada";
            else if (minha && visao.Fase == "draw") texto = visao.DescarteCompravel ? "Sua vez: puxe do monte ou pegue do meio" : "Sua vez: puxe uma carta do monte";
            else if (minha && ContratoNaMao) texto = "O contrato está na sua mão: baixe!";
            else if (minha && prontos.Count > 0 && prontosSaoDoContrato) texto = "Você tem jogo pronto: baixe, ou descarte uma carta";
            else if (minha) texto = "Baixe, encaixe e descarte uma carta";
            else
            {
                texto = $"Vez de {Nome(visao.VezId)}";
                if (visao.Fase == "draw" && visao.DescarteFresco && visao.DescarteCompravel && visao.TopoDoDescarte != null)
                    texto += $" — dá para pedir o {Regras.NomeCurto(visao.TopoDoDescarte)}";
            }
            faixaVez.text = texto;
            faixaVez.EnableInClassList("faixa-vez-minha", minha && EmJogo);
        }

        /// <summary>
        /// A sua conta e o contrato em pílulas, uma por jogo que ele pede: verde
        /// = já está na mesa; âmbar = está pronto na sua mão; apagada = falta.
        /// </summary>
        void AtualizaMinhaInfo()
        {
            var me = visao.Jogador(eu);
            var you = visao.Voce;
            contratoUi.Clear();
            if (me == null || you == null) { minhaInfo.text = ""; return; }
            minhaInfo.text = $"Você · {me.Pontos} pts" + (you.Baixou ? " · contrato na mesa!" : "");
            if (!EmJogo) return;

            void Pilulas(string nome, int pede, int naMesa, int naMao)
            {
                for (int i = 0; i < pede; i++)
                {
                    string estado = i < naMesa ? "mesa" : i < naMesa + naMao ? "mão" : "falta";
                    var p = U.Texto($"{nome}: {estado}", "pilula", estado == "mesa" ? "pilula-mesa" : estado == "mão" ? "pilula-mao" : "pilula-falta");
                    p.pickingMode = PickingMode.Ignore;
                    contratoUi.Add(p);
                }
            }
            Pilulas("Trinca", visao.ContratoT, visao.ContratoT - you.FaltaT, ProntasT);
            Pilulas("Sequência", visao.ContratoS, visao.ContratoS - you.FaltaS, ProntasS);
        }

        void AtualizaPlacas()
        {
            var ids = new HashSet<string>();
            int n = visao.Jogadores.Count;
            int vez = visao.Jogadores.FindIndex(p => p.Id == visao.VezId);
            string proximo = vez >= 0 && n > 0 ? visao.Jogadores[(vez + 1) % n].Id : null;
            foreach (var p in visao.Jogadores)
            {
                if (p.Id == eu) continue;
                ids.Add(p.Id);
                if (!placaPorId.TryGetValue(p.Id, out var pl))
                {
                    pl = new Placa { Raiz = U.Div("placa") };
                    pl.Balao = U.Texto("", "placa-balao");
                    pl.Verbo = U.Texto("", "placa-verbo");
                    pl.Nome = U.Texto("", "placa-nome");
                    pl.Detalhe = U.Texto("", "placa-detalhe");
                    pl.Raiz.Add(pl.Balao);
                    pl.Raiz.Add(pl.Verbo);
                    pl.Raiz.Add(pl.Nome);
                    pl.Raiz.Add(pl.Detalhe);
                    U.Transparente(pl.Raiz);
                    U.Mostra(pl.Balao, false);
                    U.Mostra(pl.Verbo, false);
                    placas.Add(pl.Raiz);
                    placaPorId[p.Id] = pl;
                }
                bool ehVez = p.Id == visao.VezId && EmJogo;
                pl.Raiz.EnableInClassList("placa-vez", ehVez);
                pl.Nome.text = p.Nome + (p.Robo ? " (robô)" : "");
                var partes = new List<string> { $"{p.CartasNaMao} cartas", $"{p.Pontos} pts" };
                if (p.Baixou) partes.Add("baixou");
                if (p.Desistiu) partes.Add("saiu");
                else if (!p.Conectado) partes.Add("fora");
                if (ehVez) partes.Insert(0, "JOGANDO");
                else if (p.Id == proximo && EmJogo) partes.Insert(0, "PRÓXIMO");
                pl.DetalheBase = string.Join(" · ", partes);
                pl.Detalhe.text = pl.DetalheBase;
            }
            foreach (var id in placaPorId.Keys.Where(k => !ids.Contains(k)).ToList())
            {
                placaPorId[id].Raiz.RemoveFromHierarchy();
                placaPorId.Remove(id);
            }
        }

        public void PosicionaPlacas(IEnumerable<(string id, Vector2 tela, bool visivel)> pontos, IPanel painel)
        {
            if (painel == null) return;
            float agora = Time.time;
            foreach (var (id, tela, visivel) in pontos)
            {
                if (!placaPorId.TryGetValue(id, out var pl)) continue;
                var pos = RuntimePanelUtils.ScreenToPanel(painel, tela);
                pl.Raiz.style.left = pos.x;
                pl.Raiz.style.top = pos.y;
                pl.Raiz.visible = visivel;
                if (pl.VerboAte > 0 && agora > pl.VerboAte) { pl.VerboAte = 0; U.Mostra(pl.Verbo, false); }
                if (pl.BalaoAte > 0 && agora > pl.BalaoAte) { pl.BalaoAte = 0; U.Mostra(pl.Balao, false); }
            }
        }

        /// <summary>A placa sobre a cabeça diz o verbo do lance por 1,8 s.</summary>
        public void Verbo(string id, string verbo)
        {
            if (string.IsNullOrEmpty(verbo) || id == null || !placaPorId.TryGetValue(id, out var pl)) return;
            pl.Verbo.text = verbo;
            U.Mostra(pl.Verbo, true);
            pl.VerboAte = Time.time + 1.8f;
        }

        public void Balao(string id, string texto)
        {
            if (id == null || !placaPorId.TryGetValue(id, out var pl)) { Aviso($"{Nome(id)}: {texto}"); return; }
            pl.Balao.text = texto;
            U.Mostra(pl.Balao, true);
            pl.BalaoAte = Time.time + 3f;
        }

        public void Aviso(string texto, bool erro = false)
        {
            if (string.IsNullOrEmpty(texto)) return;
            var l = U.Texto(texto, "aviso");
            if (erro)
            {
                l.AddToClassList("aviso-erro");
                // o juiz recusou: a carta que estava solta na mesa volta para a mão
                Sons.Toca(Som.Erro);
                Vibra.Pulso(30);
                if (pendente >= 0) { pendente = -1; ArrumaMao(); }
            }
            l.pickingMode = PickingMode.Ignore;
            avisos.Add(l);
            while (avisos.childCount > 3) avisos.RemoveAt(0);
            l.schedule.Execute(() => l.style.opacity = 0f).StartingIn(3200);
            l.schedule.Execute(() => l.RemoveFromHierarchy()).StartingIn(3700);
        }

        // ------------------------------------------------------------ relógio

        /// <summary>
        /// Uma vez por quadro: o relógio da vez (quando a sala tem) e a carta
        /// solta na mesa que o servidor não respondeu.
        /// </summary>
        public void Tique()
        {
            if (pendente >= 0 && Time.time > pendenteAte) { pendente = -1; ArrumaMao(); }
            // as cartas que o treinador mandou olhar piscam (duas vezes por segundo)
            if (destacadas.Count > 0)
            {
                bool fase = Time.unscaledTime * 2f % 2f < 1f;
                if (fase != piscaDestaque)
                {
                    piscaDestaque = fase;
                    foreach (int id in destacadas)
                        if (cartasUi.TryGetValue(id, out var el) && !selecionadas.Contains(id)) el.EnableInClassList("carta-destaque-b", fase);
                }
            }
            if (visao == null) return;

            bool tem = visao.TemRelogio && EmJogo;
            U.Mostra(relogio, tem);
            if (!tem)
            {
                if (segundoDoRelogio != -1) { segundoDoRelogio = -1; foreach (var pl in placaPorId.Values) pl.Detalhe.text = pl.DetalheBase; }
                return;
            }
            float resta = visao.RestaSegundos(Time.realtimeSinceStartup);
            float total = Mathf.Max(1f, visao.VezMs / 1000f);
            relogioCheio.style.width = Length.Percent(Mathf.Clamp01(resta / total) * 100f);
            int s = Mathf.CeilToInt(resta);
            if (s == segundoDoRelogio) return;
            segundoDoRelogio = s;

            bool minha = visao.VezId == eu;
            bool pouco = s <= 10;
            relogioCheio.EnableInClassList("relogio-pouco", pouco);
            relogioTexto.EnableInClassList("relogio-texto-pouco", pouco && minha);
            relogioTexto.text = minha ? $"Seu tempo: {s} s" : $"Tempo de {Nome(visao.VezId)}: {s} s";
            foreach (var kv in placaPorId)
                kv.Value.Detalhe.text = kv.Key == visao.VezId ? $"{kv.Value.DetalheBase} · {s} s" : kv.Value.DetalheBase;
            // os últimos segundos da SUA vez fazem tique; aos cinco, o aparelho avisa
            if (minha && s > 0 && s <= 5)
            {
                Sons.Toca(Som.Tique);
                if (s == 5) Vibra.Pulso(70);
            }
        }

        // ------------------------------------------------------------ a mão

        static List<Carta> PelaLista(List<Carta> cartas, List<int> lista)
        {
            var pos = new Dictionary<int, int>();
            for (int i = 0; i < lista.Count; i++) pos[lista[i]] = i;
            return cartas.OrderBy(c => pos.TryGetValue(c.Id, out int p) ? p : int.MaxValue).ToList();
        }

        /// <summary>Os jogos prontos primeiro, cada um junto; o resto pelo que o contrato ainda pede.</summary>
        List<Carta> PorJogos(List<Carta> cartas)
        {
            var usadas = new HashSet<int>();
            var saida = new List<Carta>();
            foreach (var j in prontos)
                foreach (var c in j.Cartas)
                    if (usadas.Add(c.Id)) saida.Add(c);
            var you = visao.Voce;
            // quem ainda precisa de sequência quer ver o naipe junto; quem só precisa de trinca, o valor
            bool porNaipe = you.FaltaS - ProntasS > 0 || you.FaltaT - ProntasT <= 0;
            saida.AddRange(Regras.Ordena(cartas.Where(c => !usadas.Contains(c.Id)).ToList(), porNaipe));
            return saida;
        }

        List<Carta> MaoOrdenada()
        {
            var cartas = visao?.Voce?.Mao;
            if (cartas == null) return new List<Carta>();
            if (ordemNoArrasto != null) return PelaLista(cartas, ordemNoArrasto);
            switch (ordem)
            {
                case Ordem.Valor: return Regras.Ordena(cartas, false);
                case Ordem.Jogos: return PorJogos(cartas);
                case Ordem.Sua: return PelaLista(cartas, ordemSua);
                default: return Regras.Ordena(cartas, true);
            }
        }

        Carta CartaDaMao(int id) => visao?.Voce?.Mao.Find(c => c.Id == id);

        List<Carta> Selecionadas() => MaoOrdenada().Where(c => selecionadas.Contains(c.Id)).ToList();

        void AtualizaBotaoDaOrdem()
        {
            botaoOrdem.text = ordem == Ordem.Naipe ? "Ordem: naipe" : ordem == Ordem.Valor ? "Ordem: valor" : ordem == Ordem.Jogos ? "Ordem: jogos" : "Ordem: sua";
        }

        void ProximaOrdem()
        {
            ordem = ordem == Ordem.Naipe ? Ordem.Valor : ordem == Ordem.Valor ? Ordem.Jogos : Ordem.Naipe;
            ordemDeBase = ordem;
            PlayerPrefs.SetInt("cacamba-ordem", (int)ordem);
            PlayerPrefs.Save();
            AtualizaBotaoDaOrdem();
            ArrumaMao();
            Aviso(ordem == Ordem.Naipe ? "Mão por naipe." : ordem == Ordem.Valor ? "Mão por valor." : "Jogos prontos juntos, na frente.");
        }

        Image CriaCarta(Carta c)
        {
            var img = U.Carta(Texturas.Carta(c), "carta-mao");
            img.style.transformOrigin = new TransformOrigin(Length.Percent(50), Length.Percent(100), 0f);
            // a marca do jogo pronto: uma faixa colorida no alto da carta
            var marca = U.Div("carta-marca");
            marca.pickingMode = PickingMode.Ignore;
            img.Add(marca);
            int id = c.Id;
            img.RegisterCallback<PointerDownEvent>(e => Aperta(e, id));
            img.RegisterCallback<PointerMoveEvent>(e => Move(e, id));
            img.RegisterCallback<PointerUpEvent>(e => Solta(e, id));
            img.RegisterCallback<PointerCaptureOutEvent>(_ => { if (!soltando && arrastando == id) { CancelaArrasto(); ArrumaMao(); } });
            mao.Add(img);
            return img;
        }

        /// <summary>
        /// Põe cada carta no lugar dela no leque. As cartas são elementos que
        /// PERMANECEM de um lance para o outro (uma por id), então quando a mão
        /// muda elas deslizam até o lugar novo em vez de piscar.
        /// </summary>
        void ArrumaMao()
        {
            float largura = Raiz.layout.width, altura = Raiz.layout.height;
            if (visao == null || visao.Voce == null)
            {
                foreach (var el in cartasUi.Values) el.RemoveFromHierarchy();
                cartasUi.Clear();
                lugares.Clear();
                return;
            }
            if (float.IsNaN(largura) || largura <= 0) return;

            var cartas = MaoOrdenada();
            var ids = new HashSet<int>(cartas.Select(c => c.Id));
            foreach (int id in cartasUi.Keys.Where(k => !ids.Contains(k)).ToList())
            {
                cartasUi[id].RemoveFromHierarchy();
                cartasUi.Remove(id);
                lugares.Remove(id);
            }

            int n = cartas.Count;
            float ch = Mathf.Clamp(altura * 0.23f, 96f, 190f);
            float cw = ch * 0.711f;
            cartaL = cw; cartaA = ch;
            float util = largura - 20f;
            float passo = n <= 1 ? 0 : Mathf.Min(cw * 0.66f, (util - cw) / (n - 1));
            float total = cw + passo * Mathf.Max(0, n - 1);
            float x0 = (largura - total) / 2f;
            float meio = (n - 1) / 2f;
            float giro = n <= 1 ? 0 : Mathf.Min(3.2f, 26f / n);
            mao.style.height = ch + 34f;

            for (int i = 0; i < n; i++)
            {
                var c = cartas[i];
                if (!cartasUi.TryGetValue(c.Id, out var img)) { img = CriaCarta(c); cartasUi[c.Id] = img; }
                img.style.width = cw;
                img.style.height = ch;
                float d = i - meio;
                bool escolhida = selecionadas.Contains(c.Id);
                bool junta = juntas != null && juntas.Contains(c.Id);
                bool destaque = destacadas.Contains(c.Id);
                var lugar = new LugarLocal
                {
                    X = x0 + i * passo,
                    Y = 14f + Mathf.Abs(d) * Mathf.Abs(d) * 0.9f,
                    Giro = d * giro,
                    Sobe = escolhida ? 26f : junta ? 16f : destaque ? 12f : 0f,
                };
                // a carta no dedo, ou solta na mesa esperando o servidor, não volta para o leque
                bool fora = (c.Id == arrastando && arrastou) || c.Id == pendente;
                if (!fora)
                {
                    img.style.left = lugar.X;
                    img.style.top = lugar.Y;
                    img.style.rotate = new Rotate(new Angle(lugar.Giro, AngleUnit.Degree));
                    img.style.translate = new Translate(0, -lugar.Sobe);
                    lugares[c.Id] = lugar;
                    img.BringToFront();
                }
                img.EnableInClassList("carta-escolhida", escolhida);
                img.EnableInClassList("carta-nova", !escolhida && !destaque && novas.Contains(c.Id));
                img.EnableInClassList("carta-destaque", !escolhida && destaque);
                img.EnableInClassList("carta-destaque-b", !escolhida && destaque && piscaDestaque);
                img.style.opacity = chegando.Contains(c.Id) ? 0f : 1f;

                var marca = img.ElementAt(0);
                bool pronta = grupoDaCarta.TryGetValue(c.Id, out int grupo);
                U.Mostra(marca, pronta);
                for (int g = 0; g < 4; g++) marca.EnableInClassList("carta-marca-" + g, pronta && grupo % 4 == g);
            }
            // a que está no dedo fica por cima de todas
            if (arrastando >= 0 && arrastou && cartasUi.TryGetValue(arrastando, out var noDedo)) noDedo.BringToFront();

            // Deitada, o meio da tela é do monte e do descarte: a vez e os botões
            // vão para uma coluna à direita e os avisos para o canto esquerdo.
            // Em pé sobra altura, e o rodapé fica centrado acima da mão.
            bool deitada = largura > altura * 1.15f;
            rodape.style.bottom = ch + 24f;
            if (deitada)
            {
                rodape.style.left = StyleKeyword.Auto;
                rodape.style.right = 14f;
                rodape.style.alignItems = Align.FlexEnd;
                rodape.style.maxWidth = Mathf.Min(330f, largura * 0.3f);
                acoes.style.flexDirection = FlexDirection.Column;
                acoes.style.flexWrap = Wrap.NoWrap;   // uma coluna só: com quebra, a tela baixa dividia os botões em duas
                acoes.style.alignItems = Align.Stretch;
                contratoUi.style.justifyContent = Justify.FlexEnd;
                linhaInfo.style.justifyContent = Justify.FlexEnd;
                faixa.style.alignItems = Align.FlexEnd;
                avisos.style.alignItems = Align.FlexStart;
            }
            else
            {
                rodape.style.left = 0f;
                rodape.style.right = 0f;
                rodape.style.alignItems = Align.Center;
                rodape.style.maxWidth = StyleKeyword.None;
                acoes.style.flexDirection = FlexDirection.Row;
                acoes.style.flexWrap = Wrap.Wrap;
                acoes.style.alignItems = Align.Center;
                contratoUi.style.justifyContent = Justify.Center;
                linhaInfo.style.justifyContent = Justify.Center;
                faixa.style.alignItems = Align.Center;
                avisos.style.alignItems = Align.Center;
            }
            InformaAlturaDaMao();
        }

        /// <summary>Diz à mesa quanto da tela a mão cobre, para ela pôr os seus jogos logo acima.</summary>
        void InformaAlturaDaMao()
        {
            float largura = Raiz.layout.width, altura = Raiz.layout.height;
            if (float.IsNaN(largura) || largura <= 0 || altura <= 0 || cartaA <= 0) return;
            bool deitada = largura > altura * 1.15f;
            // deitada, o rodapé fica de lado; em pé, ele empilha acima da mão
            float doRodape = rodape.layout.height;
            if (float.IsNaN(doRodape) || doRodape <= 0) doRodape = 96f;
            float cobre = deitada ? cartaA + 22f : cartaA + 24f + Mathf.Max(96f, doRodape);
            AoMudarAlturaDaMao?.Invoke(Mathf.Clamp01(cobre / altura));
        }

        // -------------------------------------------- onde as cartas estão na tela

        /// <summary>Do painel da interface para pixels da tela, com o y para cima.</summary>
        Vector2 ParaTela(Vector2 painel)
        {
            float k = Screen.width / Mathf.Max(1f, Raiz.layout.width);
            return new Vector2(painel.x * k, Screen.height - painel.y * k);
        }

        LugarNaTela NaTela(LugarLocal l)
        {
            // o leque gira cada carta em volta do meio da borda de baixo
            float topoDaMao = Raiz.layout.height - (cartaA + 34f);
            float rad = l.Giro * Mathf.Deg2Rad;
            var pe = new Vector2(l.X + cartaL / 2f, topoDaMao + l.Y + cartaA - l.Sobe);
            var centro = pe + new Vector2(Mathf.Sin(rad), -Mathf.Cos(rad)) * (cartaA / 2f);
            float k = Screen.width / Mathf.Max(1f, Raiz.layout.width);
            return new LugarNaTela { Centro = ParaTela(centro), Altura = cartaA * k, Giro = l.Giro };
        }

        /// <summary>Onde esta carta da mão está agora na tela (null se a mão ainda não foi desenhada).</summary>
        public LugarNaTela? LugarNaMao(int id)
        {
            if (float.IsNaN(Raiz.layout.width) || Raiz.layout.width <= 0 || cartaA <= 0) return null;
            if (!lugares.TryGetValue(id, out var l)) return null;
            return NaTela(l);
        }

        /// <summary>
        /// O retrato da mão ANTES de um lance: onde cada carta estava. A carta
        /// que você soltou na mesa conta de onde foi solta — é de lá que ela voa.
        /// </summary>
        public Dictionary<int, LugarNaTela> FotografaMao()
        {
            var foto = new Dictionary<int, LugarNaTela>();
            if (float.IsNaN(Raiz.layout.width) || Raiz.layout.width <= 0 || cartaA <= 0) return foto;
            foreach (var kv in lugares) foto[kv.Key] = NaTela(kv.Value);
            return foto;
        }

        // ------------------------------------------------------------ o arrasto

        /// <summary>
        /// Há uma carta no dedo — ou acabou de ser solta NESTE quadro? A mesa usa
        /// para não tratar o soltar da carta como um toque nela.
        /// </summary>
        public bool ArrastoEmCurso => (arrastando >= 0 && arrastou) || quadroDoFimDoArrasto == Time.frameCount;

        void Aperta(PointerDownEvent e, int id)
        {
            if (e.button != 0 || arrastando >= 0 || !cartasUi.TryGetValue(id, out var el)) return;
            arrastando = id;
            arrastou = false;
            ponteiro = e.pointerId;
            apertoEm = e.position;
            el.CapturePointer(e.pointerId);
            e.StopPropagation();
        }

        void Move(PointerMoveEvent e, int id)
        {
            if (arrastando != id || e.pointerId != ponteiro || !cartasUi.TryGetValue(id, out var el) || !el.HasPointerCapture(e.pointerId)) return;
            Vector2 pos = e.position;
            if (!arrastou)
            {
                if ((pos - apertoEm).sqrMagnitude < 12f * 12f) return;   // ainda é um toque
                arrastou = true;
                ordemNoArrasto = MaoOrdenada().Select(c => c.Id).ToList();
                el.AddToClassList("carta-arrastando");
                el.BringToFront();
                Sons.Toca(Som.Carta, 0.3f, 1.25f);
            }
            // a carta vai com o dedo, reta, um pouco acima dele para dar para ver
            Vector2 local = pos - mao.worldBound.position;
            el.style.left = local.x - cartaL / 2f;
            el.style.top = local.y - cartaA * 0.62f;
            el.style.rotate = new Rotate(new Angle(0f, AngleUnit.Degree));
            el.style.translate = new Translate(0, 0);
            lugares[id] = new LugarLocal { X = local.x - cartaL / 2f, Y = local.y - cartaA * 0.62f };
            AvaliaArrasto(id, pos);
            e.StopPropagation();
        }

        void Solta(PointerUpEvent e, int id)
        {
            if (arrastando != id || e.pointerId != ponteiro) return;
            bool foiArrasto = arrastou;
            Vector2 pos = e.position;
            if (cartasUi.TryGetValue(id, out var el) && el.HasPointerCapture(e.pointerId))
            {
                soltando = true;
                el.ReleasePointer(e.pointerId);
                soltando = false;
            }
            e.StopPropagation();
            if (!foiArrasto)
            {
                arrastando = -1;
                ponteiro = -1;
                AlternaSelecao(id);
                return;
            }
            quadroDoFimDoArrasto = Time.frameCount;
            SoltaCarta(id, pos);
        }

        /// <summary>O arrasto acaba sem jogada (perdeu o ponteiro, a carta saiu da mão, rodada nova).</summary>
        void CancelaArrasto()
        {
            if (arrastando >= 0 && cartasUi.TryGetValue(arrastando, out var el))
            {
                el.RemoveFromClassList("carta-arrastando");
                if (ponteiro >= 0 && el.HasPointerCapture(ponteiro)) { soltando = true; el.ReleasePointer(ponteiro); soltando = false; }
            }
            if (arrastou) quadroDoFimDoArrasto = Time.frameCount;
            arrastando = -1;
            ponteiro = -1;
            arrastou = false;
            ordemNoArrasto = null;
            juntas = null;
            ApagaRealces?.Invoke();
        }

        /// <summary>
        /// O dedo está sobre a MÃO (soltar ali muda a ordem) ou sobre a mesa
        /// (soltar ali joga)? Conta só a faixa onde as cartas estão: a tira da
        /// mão vai de ponta a ponta da tela, e os cantos dela, sem carta
        /// nenhuma, são feltro — soltar ali tem de baixar o jogo.
        /// </summary>
        bool SobreAMao(Vector2 pos, int noDedo)
        {
            var caixa = mao.worldBound;
            if (pos.y < caixa.yMin + 8f) return false;
            float min = float.MaxValue, max = float.MinValue;
            foreach (var kv in lugares)
            {
                if (kv.Key == noDedo) continue;   // a que está no dedo não conta: o lugar dela é onde o dedo está
                min = Mathf.Min(min, kv.Value.X);
                max = Mathf.Max(max, kv.Value.X + cartaL);
            }
            if (min > max) return true;   // só ela na mão
            float x = pos.x - caixa.x;
            return x >= min - 40f && x <= max + 40f;
        }

        /// <summary>As cartas que descem para a mesa junto com esta, se ela for solta no feltro.</summary>
        List<int> JuntasParaBaixar(int id)
        {
            if (selecionadas.Contains(id) && selecionadas.Count >= 3) return Selecionadas().Select(c => c.Id).ToList();
            if (grupoDaCarta.TryGetValue(id, out int g) && g < prontos.Count) return prontos[g].Cartas.Select(c => c.Id).ToList();
            return null;
        }

        /// <summary>
        /// engine.js → actLayoff: encaixar vale a qualquer momento da sua vez —
        /// só que, antes de cumprir o contrato, sem deixar a mão com menos de duas
        /// cartas (o descarte obrigatório te faria bater sem ele).
        /// </summary>
        static bool PodeEncaixar(Voce you) => you != null && (you.Baixou || you.Mao.Count > 2);

        /// <summary>Os jogos da mesa em que esta carta entra agora (encaixando, ou no lugar do coringa).</summary>
        List<int> JogosOndeCabe(Carta c)
        {
            var ids = new List<int>();
            var you = visao?.Voce;
            if (c == null || you == null || !MinhaVez || visao.Fase != "play") return ids;
            foreach (var p in visao.Jogadores)
                foreach (var j in p.Jogos)
                    if ((PodeEncaixar(you) && Regras.PontasDoEncaixe(c, j).Count > 0) || (you.PodeTrocarCoringa && Regras.CobreCoringa(c, j)))
                        ids.Add(j.Id);
            return ids;
        }

        void AvaliaArrasto(int id, Vector2 pos)
        {
            var nada = new AlvoDoArrasto { Qual = AlvoDoArrasto.Tipo.Nada, JogoId = -1 };
            if (SobreAMao(pos, id))
            {
                // dentro da mão: a carta abre o lugar dela onde o dedo está
                int n = ordemNoArrasto.Count;
                float largura = Raiz.layout.width;
                float passo = n <= 1 ? 0 : Mathf.Min(cartaL * 0.66f, (largura - 20f - cartaL) / (n - 1));
                float x0 = (largura - (cartaL + passo * Mathf.Max(0, n - 1))) / 2f;
                float x = pos.x - mao.worldBound.x;
                int novo = passo <= 0 ? 0 : Mathf.Clamp(Mathf.RoundToInt((x - x0 - cartaL / 2f) / passo), 0, n - 1);
                int atual = ordemNoArrasto.IndexOf(id);
                bool mudou = atual >= 0 && novo != atual;
                if (mudou)
                {
                    ordemNoArrasto.RemoveAt(atual);
                    ordemNoArrasto.Insert(novo, id);
                }
                if (mudou || juntas != null) { juntas = null; ArrumaMao(); }
                RealcaMesa?.Invoke(nada, null, false);
                return;
            }

            var alvo = AlvoNaMesa != null ? AlvoNaMesa(ParaTela(pos)) : nada;
            bool jogando = MinhaVez && visao.Fase == "play";
            RealcaMesa?.Invoke(alvo, JogosOndeCabe(CartaDaMao(id)), jogando);
            // sobre o feltro, as cartas que descem junto sobem um pouco: dá para ver o que vai baixar
            var descem = alvo.Qual == AlvoDoArrasto.Tipo.Feltro && jogando ? JuntasParaBaixar(id) : null;
            bool mudouJuntas = (descem == null) != (juntas == null) || (descem != null && !juntas.SetEquals(descem));
            if (mudouJuntas)
            {
                juntas = descem != null ? new HashSet<int>(descem) : null;
                ArrumaMao();
            }
        }

        /// <summary>A carta foi solta: dentro da mão muda a ordem; na mesa, joga.</summary>
        void SoltaCarta(int id, Vector2 pos)
        {
            var el = cartasUi.TryGetValue(id, out var e) ? e : null;
            el?.RemoveFromClassList("carta-arrastando");
            var ordemFinal = ordemNoArrasto;
            arrastando = -1;
            ponteiro = -1;
            arrastou = false;
            ordemNoArrasto = null;
            juntas = null;
            ApagaRealces?.Invoke();

            if (SobreAMao(pos, id))
            {
                if (ordemFinal != null)
                {
                    ordemSua = ordemFinal;
                    if (ordem != Ordem.Sua) { ordem = Ordem.Sua; AtualizaBotaoDaOrdem(); }
                }
                Sons.Toca(Som.Carta, 0.3f, 0.95f);
                ArrumaMao();
                return;
            }

            var alvo = AlvoNaMesa != null ? AlvoNaMesa(ParaTela(pos)) : new AlvoDoArrasto { Qual = AlvoDoArrasto.Tipo.Nada, JogoId = -1 };
            bool jogou = false;
            switch (alvo.Qual)
            {
                case AlvoDoArrasto.Tipo.Descarte:
                    if (PodeJogar("descartar"))
                    {
                        cliente.Acao("discard", ("cardId", id));
                        selecionadas.Clear();
                        jogou = true;
                    }
                    break;
                case AlvoDoArrasto.Tipo.Jogo:
                    if (PodeJogar("encaixar")) jogou = SoltaNoJogo(id, alvo.JogoId);
                    break;
                case AlvoDoArrasto.Tipo.Feltro:
                    var descem = JuntasParaBaixar(id);
                    if (descem == null) Aviso("Para baixar, arraste uma carta de um jogo pronto (as marcadas) ou escolha as cartas antes.");
                    else if (PodeJogar("baixar"))
                    {
                        cliente.Acao("baixar", ("cardIds", new JArray(descem)));
                        selecionadas.Clear();
                        jogou = true;
                    }
                    break;
            }
            if (jogou)
            {
                // fica onde foi solta até o servidor responder: é de lá que ela voa
                pendente = id;
                pendenteAte = Time.time + 0.9f;
            }
            ArrumaMao();
            DesenhaAcoes();
        }

        bool PodeJogar(string oQue)
        {
            if (visao == null || visao.VezId != eu || !EmJogo) { Aviso($"Espere a sua vez para {oQue}."); return false; }
            if (visao.Fase == "draw") { Aviso($"Puxe uma carta antes de {oQue}."); return false; }
            return true;
        }

        JogoNaMesa JogoDaMesa(int jogoId)
        {
            foreach (var p in visao.Jogadores)
                foreach (var j in p.Jogos)
                    if (j.Id == jogoId) return j;
            return null;
        }

        /// <summary>
        /// A carta caiu num jogo da mesa. Se só há um jeito de entrar, entra; se há
        /// mais de um (as duas pontas, ou ponta e lugar do coringa), pergunta.
        /// </summary>
        bool SoltaNoJogo(int id, int jogoId)
        {
            var c = CartaDaMao(id);
            var j = JogoDaMesa(jogoId);
            var you = visao.Voce;
            if (c == null || j == null || you == null) return false;
            var pontas = PodeEncaixar(you) ? Regras.PontasDoEncaixe(c, j) : new List<string>();
            bool cobre = you.PodeTrocarCoringa && Regras.CobreCoringa(c, j);

            if (cobre && pontas.Count == 0)
            {
                cliente.Acao("swapJoker", ("meldId", jogoId), ("cardId", id));
                selecionadas.Clear();
                return true;
            }
            if (!cobre && pontas.Count == 1)
            {
                if (pontas[0] == "t") cliente.Acao("layoff", ("cardId", id), ("meldId", jogoId));
                else cliente.Acao("layoff", ("cardId", id), ("meldId", jogoId), ("end", pontas[0]));
                selecionadas.Clear();
                return true;
            }
            if (cobre || pontas.Count > 1)
            {
                var (_, caixa) = Modal($"{Regras.Nome(c)}: onde?");
                var lista = U.Div("opcoes");
                void Opcao(string texto, Action acao) =>
                    lista.Add(U.Botao(texto, () => { acao(); selecionadas.Clear(); FechaModais(); ArrumaMao(); DesenhaAcoes(); }));
                if (pontas.Contains("lo")) Opcao("Encaixar pela ponta de baixo", () => cliente.Acao("layoff", ("cardId", id), ("meldId", jogoId), ("end", "lo")));
                if (pontas.Contains("hi")) Opcao("Encaixar pela ponta de cima", () => cliente.Acao("layoff", ("cardId", id), ("meldId", jogoId), ("end", "hi")));
                if (cobre) Opcao("Pôr no lugar do coringa (ele vem para a sua mão)", () => cliente.Acao("swapJoker", ("meldId", jogoId), ("cardId", id)));
                caixa.Add(lista);
                caixa.Add(U.Botao("Cancelar", FechaModais, "botao-pequeno"));
                return false;
            }
            // Trocar uma carta da trinca pela sua precisa dizer qual sai: isso é no visor.
            if (!j.EhSequencia && Regras.TrocasNaTrinca(c, j).Count > 0)
            {
                selecionadas.Clear();
                selecionadas.Add(id);
                AbreVisor(j.DonoId);
                Aviso("Toque na carta da trinca que vai sair.");
                return false;
            }
            // Não cabe pelas contas daqui: quem explica o porquê é o juiz.
            cliente.Acao("layoff", ("cardId", id), ("meldId", jogoId));
            return true;
        }

        void AlternaSelecao(int id)
        {
            if (!selecionadas.Remove(id)) selecionadas.Add(id);
            novas.Remove(id);
            Sons.Toca(Som.Carta, 0.22f, 1.35f);
            ArrumaMao();
            DesenhaAcoes();
        }

        // ------------------------------------------------------------ ações

        void DesenhaAcoes()
        {
            acoes.Clear();
            if (visao == null || visao.Voce == null) return;
            if (!EmJogo) return;
            bool minha = visao.VezId == eu;
            if (minha && visao.Fase == "draw")
            {
                acoes.Add(U.Botao("Puxar do monte", () => cliente.Acao("draw", ("source", "deck")), "botao-principal"));
                var meio = U.Botao("Pegar do meio", () => cliente.Acao("draw", ("source", "discard")));
                meio.SetEnabled(visao.DescarteCompravel && visao.TopoDoDescarte != null);
                acoes.Add(meio);
            }
            else if (minha && visao.Fase == "play")
            {
                int n = selecionadas.Count;
                // com jogo do contrato pronto na mão, o botão que chama é o de baixar
                bool chamaBaixar = n == 0 && prontosSaoDoContrato && prontos.Count > 0;
                acoes.Add(U.Botao(n > 0 ? $"Baixar ({n})" : ContratoNaMao ? "Baixar o contrato" : "Baixar", Baixar, chamaBaixar ? "botao-principal" : null));
                var desc = U.Botao("Descartar", Descartar, chamaBaixar ? null : "botao-principal");
                desc.SetEnabled(n == 1);
                acoes.Add(desc);
                if (visao.Voce.PodeQueimar) acoes.Add(U.Botao("Queimar", () => cliente.Acao("queimar")));
                acoes.Add(U.Botao("Mexer na mesa", () => AbreVisor(null)));
            }
            else if (!minha && visao.Fase == "draw" && visao.DescarteFresco && visao.DescarteCompravel && visao.TopoDoDescarte != null)
            {
                bool pedi = visao.Pedidos.Contains(eu);
                acoes.Add(pedi
                    ? U.Botao("Desistir do pedido", () => cliente.Acao("unclaim"))
                    : U.Botao($"Pedir o {Regras.NomeCurto(visao.TopoDoDescarte)}", () => cliente.Acao("claim"), "botao-principal"));
            }
            if (minha && visao.Fase == "play" && selecionadas.Count > 0)
                acoes.Add(U.Botao("Limpar", () => { selecionadas.Clear(); ArrumaMao(); DesenhaAcoes(); }, "botao-pequeno"));
        }

        void Baixar()
        {
            var sel = Selecionadas();
            if (sel.Count > 0) cliente.Acao("baixar", ("cardIds", new JArray(sel.Select(c => c.Id))));
            else cliente.Acao("baixar");
            selecionadas.Clear();
        }

        void Descartar()
        {
            var sel = Selecionadas();
            if (sel.Count != 1) { Aviso("Toque numa carta da mão para escolher o descarte."); return; }
            cliente.Acao("discard", ("cardId", sel[0].Id));
            selecionadas.Clear();
        }

        /// <summary>Toque no monte da mesa 3D.</summary>
        public void TocouMonte()
        {
            if (visao == null) return;
            if (visao.VezId == eu && visao.Fase == "draw") cliente.Acao("draw", ("source", "deck"));
            else Aviso($"O monte tem {visao.CartasNoMonte} cartas.");
        }

        /// <summary>Toque no descarte: comprar na vez, ou pedir fora dela.</summary>
        public void TocouDescarte()
        {
            if (visao == null) return;
            var topo = visao.TopoDoDescarte;
            if (visao.VezId == eu && visao.Fase == "draw")
            {
                if (visao.DescarteCompravel) cliente.Acao("draw", ("source", "discard"));
                else Aviso(visao.DescarteTravado ? "Tem coringa no meio: o descarte está travado." : "Essa carta foi você que descartou.");
                return;
            }
            if (visao.Fase == "draw" && visao.DescarteFresco && visao.DescarteCompravel && topo != null)
            {
                cliente.Acao(visao.Pedidos.Contains(eu) ? "unclaim" : "claim");
                return;
            }
            if (topo != null) Aviso($"No meio: {Regras.Nome(topo)}.");
        }

        // ------------------------------------------------------------ modais

        (VisualElement fundo, VisualElement caixa) Modal(string titulo)
        {
            FechaModais();
            var fundo = U.Div("camada", "fundo-modal");
            var caixa = U.Div("painel", "modal", "coluna");
            fundo.Add(caixa);
            if (!string.IsNullOrEmpty(titulo)) caixa.Add(U.Titulo(titulo, "modal-titulo"));
            modais.Add(fundo);
            return (fundo, caixa);
        }

        void FechaModais()
        {
            modais.Clear();
            visorAberto = false;
        }

        /// <summary>O visor: os jogos de todo mundo, grandes, para tocar numa carta.</summary>
        public void AbreVisor(string foco)
        {
            if (visao == null) return;
            var (_, caixa) = Modal("Jogos na mesa");
            var rol = new ScrollView(ScrollViewMode.Vertical);
            rol.style.flexShrink = 1;
            caixa.Add(rol);

            bool minhaVez = visao.VezId == eu && visao.Fase == "play";
            caixa.Insert(1, U.Texto(minhaVez
                ? (selecionadas.Count == 1 ? "Toque no jogo onde a carta escolhida entra." : "Escolha uma carta da mão e toque num jogo — ou toque numa carta que está sobrando.")
                : "Na sua vez, depois de puxar, dá para encaixar, trocar coringa e pegar sobra.", "nota", "centro"));

            var ordemDosDonos = visao.Jogadores.OrderBy(p => p.Id == eu ? 0 : 1).ToList();
            VisualElement focado = null;
            bool algum = false;
            foreach (var p in ordemDosDonos)
            {
                if (p.Jogos.Count == 0) continue;
                algum = true;
                var bloco = U.Div("visor-jogador");
                bloco.Add(U.Texto(p.Id == eu ? "Seus jogos" : p.Nome, "visor-nome"));
                var linha = U.Div("visor-jogos");
                foreach (var j in p.Jogos)
                {
                    var jogo = U.Div("visor-jogo");
                    var sobram = new HashSet<int>(Regras.Removiveis(j).Select(c => c.Id));
                    for (int k = 0; k < j.Cartas.Count; k++)
                    {
                        var c = j.Cartas[k];
                        var img = U.Carta(Texturas.Carta(c), "visor-carta");
                        if (k == j.Cartas.Count - 1) img.style.marginRight = 0;
                        if (sobram.Contains(c.Id)) img.AddToClassList("visor-carta-sobra");
                        var jj = j; var cc = c;
                        img.RegisterCallback<ClickEvent>(_ => OpcoesDaCarta(jj, cc));
                        jogo.Add(img);
                    }
                    linha.Add(jogo);
                }
                bloco.Add(linha);
                rol.Add(bloco);
                if (p.Id == foco) focado = bloco;
            }
            if (!algum) rol.Add(U.Texto("Ninguém baixou nada ainda.", "nota", "centro"));
            if (focado != null) rol.schedule.Execute(() => rol.ScrollTo(focado)).StartingIn(50);
            caixa.Add(U.Botao("Fechar", FechaModais));
            visorAberto = true;
            visorFoco = foco;
        }

        void OpcoesDaCarta(JogoNaMesa j, Carta alvo)
        {
            if (visao == null) return;
            if (visao.VezId != eu || visao.Fase != "play")
            {
                Aviso(visao.VezId == eu ? "Puxe uma carta antes de mexer na mesa." : "Espere a sua vez para mexer na mesa.");
                return;
            }
            var sel = Selecionadas();
            var opcoes = new List<(string texto, Action acao)>();
            int meld = j.Id;
            if (sel.Count == 1)
            {
                var c = sel[0];
                if (Regras.CobreCoringa(c, j))
                    opcoes.Add(($"Pôr {Regras.Nome(c)} no lugar do coringa", () => cliente.Acao("swapJoker", ("meldId", meld), ("cardId", c.Id))));
                if (!j.EhSequencia && Regras.TrocasNaTrinca(c, j).Any(x => x.Id == alvo.Id))
                    opcoes.Add(($"Trocar {Regras.Nome(alvo)} por {Regras.Nome(c)}", () => cliente.Acao("trocarNaTrinca", ("meldId", meld), ("cardId", c.Id), ("saiId", alvo.Id))));
                if (c.Coringa && j.EhSequencia && !Regras.TemCoringa(j) && !alvo.Coringa)
                    opcoes.Add(($"Pôr o coringa no lugar de {Regras.Nome(alvo)}", () => cliente.Acao("trocarPorCoringa", ("meldId", meld), ("cardId", alvo.Id), ("coringaId", c.Id))));
                opcoes.Add(($"Encaixar {Regras.Nome(c)} neste jogo", () => cliente.Acao("layoff", ("cardId", c.Id), ("meldId", meld))));
                if (j.EhSequencia && (c.Coringa || c.Valor == 1))
                {
                    opcoes.Add(("… pela ponta de baixo", () => cliente.Acao("layoff", ("cardId", c.Id), ("meldId", meld), ("end", "lo"))));
                    opcoes.Add(("… pela ponta de cima", () => cliente.Acao("layoff", ("cardId", c.Id), ("meldId", meld), ("end", "hi"))));
                }
                if (j.EhSequencia && j.DonoId != eu && Regras.TemCoringa(j) && !c.Coringa)
                    opcoes.Add(("Encaixar e levar o coringa que sobrar", () => cliente.Acao("layoff", ("cardId", c.Id), ("meldId", meld), ("pegarCoringa", true))));
            }
            if (Regras.Removiveis(j).Any(x => x.Id == alvo.Id))
            {
                if (sel.Count > 0)
                {
                    var ids = new JArray(sel.Select(x => x.Id));
                    opcoes.Add(($"Baixar com o {Regras.Nome(alvo)} daqui", () => cliente.Acao("baixar", ("cardIds", ids), ("sobra", new JObject { ["meldId"] = meld, ["cardId"] = alvo.Id }))));
                }
                opcoes.Add(($"Levar o {Regras.Nome(alvo)} para a mão", () => cliente.Acao("tomarSobra", ("meldId", meld), ("cardId", alvo.Id))));
                opcoes.Add(($"Descartar o {Regras.Nome(alvo)} (passa a vez)", () => cliente.Acao("meldDiscard", ("meldId", meld), ("cardId", alvo.Id))));
            }
            if (opcoes.Count == 0)
            {
                Aviso(sel.Count > 1 ? "Para encaixar, escolha uma carta só." : "Escolha uma carta da sua mão primeiro (toque nela).");
                return;
            }
            var (_, caixa) = Modal(Regras.Nome(alvo));
            var lista = U.Div("opcoes");
            foreach (var (texto, acao) in opcoes)
            {
                var a = acao;
                lista.Add(U.Botao(texto, () => { a(); selecionadas.Clear(); FechaModais(); ArrumaMao(); DesenhaAcoes(); }));
            }
            caixa.Add(lista);
            caixa.Add(U.Botao("Voltar", () => AbreVisor(j.DonoId), "botao-pequeno"));
        }

        void ConfereModalDeFase()
        {
            bool fim = visao.Fase == "roundEnd" || visao.Fase == "gameEnd";
            if (!fim)
            {
                if (faseDoPlacar != null) { faseDoPlacar = null; placarFechado = false; FechaModais(); }
                return;
            }
            string marca = visao.Fase + visao.Rodada;
            if (faseDoPlacar != marca) { faseDoPlacar = marca; placarFechado = false; }
            if (!placarFechado) AbrePlacar();
        }

        void AbrePlacar()
        {
            bool fimDeJogo = visao.Fase == "gameEnd";
            var (_, caixa) = Modal(fimDeJogo ? "Fim de jogo" : $"Fim da rodada {visao.Rodada + 1}");
            var r = visao.UltimaRodada;
            if (fimDeJogo && visao.Ranking != null && visao.Ranking.Count > 0)
                caixa.Add(U.Texto($"{(visao.Ranking[0].Id == eu ? "Você ganhou" : visao.Ranking[0].Nome + " ganhou")} com {visao.Ranking[0].Pontos} pontos!", "subtitulo"));
            else if (r != null)
                caixa.Add(U.Texto(r.Motivo == "bateu" ? $"{Nome(r.VencedorId)} bateu!" : "O monte esgotou — rodada sem vencedor.", "subtitulo"));

            var cab = U.Div("placar-linha");
            cab.Add(U.Texto("Jogador", "placar-nome", "rotulo"));
            if (r != null) cab.Add(U.Texto("rodada", "placar-num", "rotulo"));
            cab.Add(U.Texto("total", "placar-num", "rotulo"));
            caixa.Add(cab);
            int pos = 1;
            foreach (var p in visao.Jogadores.OrderBy(p => p.Pontos))
            {
                var linha = U.Div("placar-linha");
                var nome = U.Texto($"{pos}º  {(p.Id == eu ? "Você" : p.Nome)}", "placar-nome");
                if (pos == 1) nome.AddToClassList("placar-destaque");
                linha.Add(nome);
                if (r != null) linha.Add(U.Texto(r.Pontos.TryGetValue(p.Id, out var pr) ? $"+{pr}" : "", "placar-num"));
                linha.Add(U.Texto(p.Pontos.ToString(), "placar-num"));
                caixa.Add(linha);
                pos++;
            }

            var botoes = U.Div("linha");
            botoes.style.justifyContent = Justify.Center;
            botoes.style.marginTop = 12;
            bool anfitriao = AnfitriaoId == eu;
            if (anfitriao)
                botoes.Add(fimDeJogo
                    ? U.Botao("Jogar de novo", () => cliente.JogarDeNovo(), "botao-principal")
                    : U.Botao("Próxima rodada", () => cliente.ProximaRodada(), "botao-principal"));
            botoes.Add(U.Botao("Ver a mesa", () => { placarFechado = true; FechaModais(); }));
            if (fimDeJogo) botoes.Add(U.Botao("Sair", () => AoSair?.Invoke(), "botao-perigo"));
            caixa.Add(botoes);
            if (!anfitriao) caixa.Add(U.Texto("Quem criou a sala segue para a próxima.", "nota", "centro"));
        }

        void AbreMenu()
        {
            var (_, caixa) = Modal("Menu");
            caixa.Add(U.Botao("Regras do jogo", () => { FechaModais(); AoRegras?.Invoke(); }));
            if (visao != null && (visao.Fase == "roundEnd" || visao.Fase == "gameEnd"))
                caixa.Add(U.Botao("Ver o placar", () => { placarFechado = false; AbrePlacar(); }));

            // som, vibração e movimento: cada um liga e desliga sozinho, e fica guardado no aparelho
            var ajustes = U.Div("emotes");
            ajustes.Add(U.Botao(Sons.Ligado ? "Som: ligado" : "Som: desligado", () =>
            {
                Sons.Ligado = !Sons.Ligado;
                Sons.Toca(Som.Bom);
                AbreMenu();
            }, "botao-pequeno", Sons.Ligado ? "botao-ativo" : null));
            if (Vibra.Disponivel)
                ajustes.Add(U.Botao(Vibra.Ligada ? "Vibração: ligada" : "Vibração: desligada", () =>
                {
                    Vibra.Ligada = !Vibra.Ligada;
                    Vibra.Pulso(60);
                    AbreMenu();
                }, "botao-pequeno", Vibra.Ligada ? "botao-ativo" : null));
            ajustes.Add(U.Botao(Movimento.Ligado ? "Animações: ligadas" : "Animações: desligadas", () =>
            {
                Movimento.Ligado = !Movimento.Ligado;
                AbreMenu();
            }, "botao-pequeno", Movimento.Ligado ? "botao-ativo" : null));
            caixa.Add(ajustes);

            caixa.Add(U.Texto("Mandar para a mesa", "rotulo"));
            var emotes = U.Div("emotes");
            foreach (var e in Emotes.Todos)
            {
                string chave = e.Chave;
                emotes.Add(U.Botao(e.Texto, () => { cliente.Emote(chave); FechaModais(); }, "botao-pequeno"));
            }
            caixa.Add(emotes);
            caixa.Add(U.Botao("Sair da partida", ConfirmaSaida, "botao-perigo"));
            caixa.Add(U.Botao("Fechar", FechaModais, "botao-pequeno"));
        }

        void ConfirmaSaida()
        {
            var (_, caixa) = Modal("Sair da partida?");
            caixa.Add(U.Texto("Um robô assume o seu lugar até o fim, e você não volta para esta partida.", "nota", "centro"));
            var linha = U.Div("linha");
            linha.style.justifyContent = Justify.Center;
            linha.Add(U.Botao("Sair", () => { FechaModais(); AoSair?.Invoke(); }, "botao-perigo"));
            linha.Add(U.Botao("Continuar jogando", FechaModais));
            caixa.Add(linha);
        }

        public void Limpa()
        {
            FechaModais();
            CancelaArrasto();
            visao = null;
            maoAnterior = null;
            selecionadas.Clear();
            novas.Clear();
            chegando.Clear();
            ordemSua.Clear();
            if (ordem == Ordem.Sua) { ordem = ordemDeBase; AtualizaBotaoDaOrdem(); }
            pendente = -1;
            prontos = new List<Regras.JogoNaMao>();
            grupoDaCarta.Clear();
            destacadas.Clear();
            faseDoPlacar = null;
            foreach (var el in cartasUi.Values) el.RemoveFromHierarchy();
            cartasUi.Clear();
            lugares.Clear();
            Chegaram = new List<int>();
            mao.Clear();
            acoes.Clear();
            contratoUi.Clear();
            U.Mostra(relogio, false);
            foreach (var p in placaPorId.Values) p.Raiz.RemoveFromHierarchy();
            placaPorId.Clear();
        }
    }
}
