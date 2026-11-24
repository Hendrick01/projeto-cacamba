using System;
using System.Linq;
using Cacamba.Efeitos;
using Cacamba.Interface;
using Cacamba.Mesa;
using Cacamba.Modelo;
using Cacamba.Rede;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace Cacamba
{
    /// <summary>
    /// O ponto de partida do app: monta a mesa 3D e a interface, conecta no
    /// servidor do Caçamba e troca de tela conforme o que ele manda.
    ///
    /// Servidor: por padrão o do site publicado. No WebGL é sempre o endereço da
    /// própria página (a build é servida pelo servidor do jogo, em /unity/).
    /// Pela linha de comando (Windows):
    ///   -servidor http://localhost:3000   liga em outro servidor
    ///   -autoteste                         cria sala com 3 robôs, começa e joga sozinho
    ///   -autoteste -sala ABCD              entra na sala ABCD (criada no site, por exemplo) e joga
    ///   -autoteste -so-sala                cria a sala com robôs e para no lobby
    ///   -autoteste -tutorial               abre o tutorial e joga sozinho (o treinador vai junto)
    ///   -limpa-sessao                      esquece a partida guardada e abre na tela inicial
    ///   -captura caminho.png -tempo 25     tira um print aos 25 s e fecha
    /// </summary>
    public sealed class Jogo : MonoBehaviour
    {
        public const string ServidorPadrao = "https://projeto-cacamba.onrender.com";

        Cliente cliente;
        Mesa3D mesa;
        UIDocument documento;
        VisualElement raizUi, telas, faixaConexao, avisosGerais;
        Label textoConexao;
        Button botaoRetomar;
        TelaInicio inicio;
        TelaSala telaSala;
        HudJogo hud;
        Treinador treinador;
        VisualElement telaRegras;

        Sala sala;
        Visao visao;
        string telaAtual;

        // autoteste
        bool autoteste, soSala;
        string salaAuto;
        string capturaEm;
        float tempoCaptura = 25f;
        bool capturou, autoCriou;
        float proximaJogadaAuto;
        int baixadasTentadas = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void LigaSeFaltar()
        {
            if (FindAnyObjectByType<Jogo>() == null) new GameObject("Caçamba").AddComponent<Jogo>();
        }

        void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            LeLinhaDeComando();

            mesa = new GameObject("Mesa 3D").AddComponent<Mesa3D>();
            mesa.transform.SetParent(transform, false);
            mesa.Montar();

            // o autoteste sempre começa numa sala nova, nunca retomando a da rodada anterior
            // (antes de criar o cliente: ele lê a sessão guardada ao nascer)
            if (autoteste || argumentos.Contains("-limpa-sessao"))
            {
                PlayerPrefs.DeleteKey("cacamba-sessao");
                PlayerPrefs.DeleteKey("cacamba-selo");
            }
            // O cliente nasce ANTES da interface: o HUD guarda a referência dele.
            // Na ordem inversa o HUD ficava com null e nenhum botão da partida
            // (puxar, pegar do meio, baixar, descartar…) funcionava.
            cliente = new Cliente();

            MontaInterface();

            // Link com código (…/unity/?sala=ABCD): o código já vem preenchido.
            if (!autoteste && !string.IsNullOrEmpty(salaAuto)) inicio.DefineCodigo(salaAuto);

            cliente.AoLobby += AoLobby;
            cliente.AoEstado += AoEstado;
            cliente.AoSairDaSala += AoSairDaSala;
            cliente.AoErro += m => Aviso(m, true);
            cliente.AoAviso += m => Aviso(m, false);
            cliente.AoEmote += AoEmote;
            cliente.AoMudarConexao += AoMudarConexao;

            mesa.ToqueNaInterface = ToqueNaInterface;
            mesa.AoTocarMonte += () => hud.TocouMonte();
            mesa.AoTocarDescarte += () => hud.TocouDescarte();
            mesa.AoTocarJogador += id => hud.AbreVisor(id);

            MostraTela("inicio");
            mesa.MostrarSala(null, null);
            cliente.Ligar(ServidorEscolhido());
        }

        string ServidorEscolhido()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            string pagina = WsWebGL.OrigemDaPagina();
            if (!string.IsNullOrEmpty(pagina)) return pagina;
#endif
            string arg = Argumento("-servidor");
            if (!string.IsNullOrEmpty(arg)) return arg;
            return PlayerPrefs.GetString("cacamba-servidor", ServidorPadrao);
        }

        string[] argumentos = Array.Empty<string>();

        void LeLinhaDeComando()
        {
            var lista = Environment.GetCommandLineArgs().ToList();
#if UNITY_WEBGL && !UNITY_EDITOR
            // no navegador não há linha de comando: os mesmos nomes vêm da URL
            // (…/unity/?autoteste&sala=ABCD vira -autoteste -sala ABCD)
            lista.AddRange(ArgumentosDaUrl(Application.absoluteURL));
#endif
            argumentos = lista.ToArray();
            autoteste = argumentos.Contains("-autoteste");
            soSala = argumentos.Contains("-so-sala");     // para no lobby, sem começar (para conferir a tela)
            salaAuto = Argumento("-sala");
            capturaEm = Argumento("-captura");
            if (float.TryParse(Argumento("-tempo"), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var t)) tempoCaptura = t;
        }

        string Argumento(string nome)
        {
            int i = Array.IndexOf(argumentos, nome);
            return i >= 0 && i + 1 < argumentos.Length && !argumentos[i + 1].StartsWith("-") ? argumentos[i + 1] : null;
        }

        /// <summary>"?autoteste&amp;sala=ABCD" → ["-autoteste", "-sala", "ABCD"].</summary>
        public static string[] ArgumentosDaUrl(string url)
        {
            var saida = new System.Collections.Generic.List<string>();
            int q = (url ?? "").IndexOf('?');
            if (q < 0) return saida.ToArray();
            string consulta = url.Substring(q + 1);
            int hash = consulta.IndexOf('#');
            if (hash >= 0) consulta = consulta.Substring(0, hash);
            foreach (var par in consulta.Split('&'))
            {
                if (par.Length == 0) continue;
                int igual = par.IndexOf('=');
                string chave = Uri.UnescapeDataString(igual < 0 ? par : par.Substring(0, igual));
                if (chave.Length == 0) continue;
                saida.Add("-" + chave);
                if (igual >= 0) saida.Add(Uri.UnescapeDataString(par.Substring(igual + 1).Replace('+', ' ')));
            }
            return saida.ToArray();
        }

        // ------------------------------------------------------------ interface

        void MontaInterface()
        {
            U.CarregaFontes();
            // o painel salvo pelo Editor/ConfiguraProjeto.cs já vem com o tema
            var painel = Resources.Load<PanelSettings>("UI/Painel");
            if (painel == null)
            {
                painel = ScriptableObject.CreateInstance<PanelSettings>();
                painel.name = "Painel do Caçamba";
                painel.themeStyleSheet = Resources.Load<ThemeStyleSheet>("UI/TemaPadrao");
                painel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
                painel.referenceResolution = new Vector2Int(1280, 720);
                painel.screenMatchMode = PanelScreenMatchMode.MatchWidthOrHeight;
                painel.match = 0.5f;
                painel.sortingOrder = 10;
            }

            var go = new GameObject("Interface");
            go.SetActive(false);
            go.transform.SetParent(transform, false);
            documento = go.AddComponent<UIDocument>();
            documento.panelSettings = painel;
            go.SetActive(true);

            raizUi = documento.rootVisualElement;
            var estilo = Resources.Load<StyleSheet>("UI/Cacamba");
            if (estilo != null) raizUi.styleSheets.Add(estilo);
            raizUi.AddToClassList("raiz");
            raizUi.pickingMode = PickingMode.Ignore;
            if (U.FonteTexto != null) raizUi.style.unityFontDefinition = FontDefinition.FromFont(U.FonteTexto);

            telas = U.Div("camada");
            telas.pickingMode = PickingMode.Ignore;
            raizUi.Add(telas);

            bool mostrarServidor = Application.platform != RuntimePlatform.WebGLPlayer;
            inicio = new TelaInicio(mostrarServidor, PlayerPrefs.GetString("cacamba-servidor", ServidorPadrao));
            inicio.AoCriar += (nome, avatar) => cliente.CriarSala(NomeOuPadrao(nome), avatar);
            inicio.AoEntrar += (codigo, nome, avatar) =>
            {
                if (string.IsNullOrWhiteSpace(codigo) || codigo.Trim().Length != 4) { Aviso("O código da sala tem 4 letras.", true); return; }
                cliente.EntrarNaSala(codigo, NomeOuPadrao(nome), avatar);
            };
            inicio.AoTrocarServidor += TrocaServidor;
            // o tutorial: o servidor já devolve a partida começada, com um robô
            inicio.AoTutorial += (nome, avatar) => cliente.CriarSala(NomeOuPadrao(nome), avatar, true);
            inicio.AoRegras += AbreRegras;

            telaSala = new TelaSala();
            telaSala.AoAdicionarRobo += () => cliente.AdicionarRobo();
            telaSala.AoRemoverRobo += id => cliente.RemoverRobo(id);
            telaSala.AoNivel += n => cliente.NivelDosRobos(n);
            telaSala.AoRelogio += s => cliente.Relogio(s);
            telaSala.AoComecar += () => cliente.Comecar();
            telaSala.AoSair += SairDaSala;

            hud = new HudJogo(cliente)
            {
                AoSair = SairDaSala,
                AoMudarAlturaDaMao = f => mesa.AlturaDaMao01 = f,
                // a carta arrastada pergunta à mesa o que tem embaixo, e a mesa acende o alvo
                AlvoNaMesa = mesa.AlvoEm,
                RealcaMesa = mesa.Realca,
                ApagaRealces = mesa.ApagaRealces,
                AoRegras = AbreRegras,
            };

            // o treinador do tutorial: acende a mesa e a mão, e mora acima delas
            treinador = new Treinador
            {
                AcendeMonte = mesa.AcendeMonte,
                AcendeMeio = mesa.AcendeMeio,
                AcendeFeltro = mesa.AcendeFeltro,
                AcendeJogo = mesa.AcendeJogo,
                DestacaCartas = hud.DestacaCartas,
                AoSair = SairDaSala,
                AoRegras = AbreRegras,
                AoContinuar = () => { treinador.Desliga(); hud.MostraPlacar(); },
            };
            hud.CamadaDoTreinador.Add(treinador.Raiz);

            telas.Add(inicio.Raiz);
            telas.Add(telaSala.Raiz);
            telas.Add(hud.Raiz);

            // avisos fora da partida (no início e na sala); na partida quem avisa é o HUD
            avisosGerais = U.Transparente(U.Div("avisos"));
            avisosGerais.style.top = 16;
            raizUi.Add(avisosGerais);

            faixaConexao = U.Div("conexao");
            textoConexao = U.Texto("", "nota");
            textoConexao.style.color = Color.white;
            botaoRetomar = U.Botao("Voltar para a partida", () => cliente.Retomar(), "botao-pequeno");
            faixaConexao.Add(textoConexao);
            faixaConexao.Add(botaoRetomar);
            raizUi.Add(faixaConexao);
            U.Mostra(faixaConexao, false);
        }

        static string NomeOuPadrao(string nome) => string.IsNullOrWhiteSpace(nome) ? "Jogador" : nome.Trim();

        void TrocaServidor(string novo)
        {
            string limpo = Cliente.NormalizaServidor(novo);
            if (string.IsNullOrEmpty(limpo) || limpo == cliente.UrlServidor) return;
            try { _ = new Uri(limpo); } catch (Exception) { Aviso("Endereço de servidor inválido.", true); return; }
            PlayerPrefs.SetString("cacamba-servidor", limpo);
            PlayerPrefs.Save();
            cliente.Ligar(limpo);
        }

        void MostraTela(string qual)
        {
            telaAtual = qual;
            U.Mostra(inicio.Raiz, qual == "inicio");
            U.Mostra(telaSala.Raiz, qual == "sala");
            U.Mostra(hud.Raiz, qual == "jogo");
        }

        /// <summary>As regras, por cima de tudo (da tela inicial, da partida ou do fim do tutorial).</summary>
        void AbreRegras()
        {
            FechaRegras();
            int rodada = telaAtual == "jogo" && visao != null ? visao.Rodada : -1;
            telaRegras = TelaRegras.Monta(rodada, sala != null && sala.Relogio > 0, FechaRegras);
            raizUi.Add(telaRegras);
        }

        void FechaRegras()
        {
            telaRegras?.RemoveFromHierarchy();
            telaRegras = null;
        }

        bool ToqueNaInterface(Vector2 telaYParaBaixo)
        {
            // soltar uma carta arrastada sobre a mesa é jogada, não toque na mesa
            if (telaAtual == "jogo" && hud.ArrastoEmCurso) return true;
            var painel = raizUi?.panel;
            if (painel == null) return false;
            var p = RuntimePanelUtils.ScreenToPanel(painel, telaYParaBaixo);
            var e = painel.Pick(p);
            return e != null && e != raizUi;
        }

        void Aviso(string texto, bool erro)
        {
            if (string.IsNullOrEmpty(texto)) return;
            if (erro) Debug.LogWarning("[caçamba] " + texto);
            if (telaAtual == "jogo") { hud.Aviso(texto, erro); return; }
            if (erro) Sons.Toca(Som.Erro);
            var l = U.Texto(texto, "aviso");
            if (erro) l.AddToClassList("aviso-erro");
            l.pickingMode = PickingMode.Ignore;
            avisosGerais.Add(l);
            while (avisosGerais.childCount > 3) avisosGerais.RemoveAt(0);
            l.schedule.Execute(() => l.RemoveFromHierarchy()).StartingIn(4000);
        }

        // --------------------------------------------------------- mensagens

        void AoMudarConexao(Cliente.Conexao estado, string detalhe)
        {
            bool online = estado == Cliente.Conexao.Online;
            string servidor = cliente.UrlServidor;
            inicio.DefineEstado(estado switch
            {
                Cliente.Conexao.Online => $"Conectado a {servidor}",
                Cliente.Conexao.Conectando => $"Conectando a {servidor}…",
                Cliente.Conexao.Pausado => detalhe,
                _ => $"Sem conexão com {servidor}. Tentando de novo…",
            }, online);

            bool emSala = telaAtual != "inicio";
            U.Mostra(faixaConexao, !online && (emSala || estado == Cliente.Conexao.Pausado));
            textoConexao.text = estado == Cliente.Conexao.Pausado ? detalhe : "Reconectando ao servidor…";
            U.Mostra(botaoRetomar, estado == Cliente.Conexao.Pausado);

            if (online && autoteste && !autoCriou && !cliente.TemSessaoGuardada)
            {
                autoCriou = true;
                // com -sala, entra na sala de outra pessoa (ex.: criada no site);
                // sem, cria a própria e põe robôs
                if (!string.IsNullOrEmpty(salaAuto)) cliente.EntrarNaSala(salaAuto, "App Unity", "lyly");
                else cliente.CriarSala("Teste Unity", "lyly", argumentos.Contains("-tutorial"));
            }
        }

        void AoLobby(Sala s)
        {
            bool primeira = sala == null || sala.Codigo != s.Codigo;
            sala = s;
            hud.AnfitriaoId = s.AnfitriaoId;
            if (s.Tutorial && primeira) treinador.Liga();
            if (!s.Comecou)
            {
                // o tutorial começa sozinho no servidor: a sala de espera nem aparece
                if (s.Tutorial) return;
                MostraTela("sala");
                telaSala.Atualiza(s, cliente.MeuId);
                mesa.MostrarSala(s, cliente.MeuId);
                if (autoteste && primeira && string.IsNullOrEmpty(salaAuto)) Invoke(nameof(AutoPreparaSala), 0.5f);
            }
        }

        void AutoPreparaSala()
        {
            for (int i = 0; i < 3; i++) cliente.AdicionarRobo();
            if (!soSala) Invoke(nameof(AutoComeca), 1.2f);
        }

        void AutoComeca() => cliente.Comecar();

        void AoEstado(Visao v, JArray eventos)
        {
            if (!v.EhCacamba)
            {
                Aviso($"Esta sala é de outro jogo ({v.Modo}). Por enquanto, o app tem só o Caçamba.", true);
                return;
            }
            // Sem estado anterior (acabou de entrar ou de voltar): a mesa aparece
            // arrumada, sem nada voando de lugar nenhum.
            bool primeira = visao == null || telaAtual != "jogo";
            bool rodadaNova = eventos.Any(e => Json.Str(e, "e") == "roundStart");
            if (telaAtual != "jogo")
            {
                hud.Limpa();
                MostraTela("jogo");
            }
            // A ordem importa: a foto da mão é de ANTES do lance (é de lá que a
            // carta que saiu voa); a interface se atualiza e diz quais cartas
            // chegaram; a mesa anima com as duas coisas.
            var maoAntes = hud.FotografaMao();
            visao = v;
            hud.Atualiza(v, cliente.MeuId, rodadaNova);
            mesa.MostrarPartida(v, cliente.MeuId, new Lance
            {
                Eventos = eventos,
                Primeira = primeira,
                MaoAntes = maoAntes,
                MaoAgora = hud.LugarNaMao,
                Chegaram = hud.Chegaram,
                AoPousarNaMao = hud.Revela,
            });

            foreach (var ev in eventos)
            {
                ReageAoLance(ev, v);
                var aviso = Textos.De(ev, NomeDe, cliente.MeuId);
                if (aviso == null) continue;
                if (!string.IsNullOrEmpty(aviso.Texto)) hud.Aviso(aviso.Texto);
                if (aviso.Quem != null && aviso.Quem != cliente.MeuId) hud.Verbo(aviso.Quem, aviso.Verbo);
                if (aviso.Reacao != null) mesa.Reage(aviso.Quem, aviso.Reacao);
            }

            // o tutorial: o treinador lê a mesa nova e diz o próximo passo; no fim
            // da rodada, o cartão de despedida vem antes do placar
            if (treinador.Ativo)
            {
                treinador.Atualiza(v, cliente.MeuId);
                if (treinador.NoFim) hud.EscondePlacar();
            }
        }

        /// <summary>
        /// O som e o corpo de cada lance. O deslizar das cartas sai dos voos da
        /// mesa; aqui ficam os momentos: embaralhar, pedir, baixar, bater — e o
        /// gesto de quem jogou, o pulo de quem ganhou, o desânimo de quem perdeu.
        /// </summary>
        void ReageAoLance(JToken ev, Visao v)
        {
            string eu = cliente.MeuId;
            string tipo = Json.Str(ev, "e"), p = Json.Str(ev, "p");
            bool meu = p != null && p == eu;
            switch (tipo)
            {
                case "roundStart":
                case "reshuffle":
                    Sons.Toca(Som.Embaralha);
                    break;
                case "claim":
                    if (!meu) Sons.Toca(Som.Pedido, 0.8f);
                    break;
                case "draw":
                case "buy":
                case "tomouSobra":
                    if (meu && (tipo != "draw" || Json.Str(ev, "source") == "discard")) Sons.Toca(Som.Bom, 0.7f);
                    if (!Movimento.Ligado) Sons.Toca(Som.Carta, 0.5f);
                    break;
                case "discard":
                case "meldDiscard":
                    if (!Movimento.Ligado) Sons.Toca(Som.Pousa, 0.6f);
                    break;
                case "baixou":
                    Sons.Toca(Som.Baixa, 0.8f);
                    if (meu && Json.Bool(ev, "completa")) { Sons.Toca(Som.Bom); Vibra.Pulso(40); }
                    break;
                case "swapJoker":
                case "pegouCoringa":
                    Sons.Toca(Som.Bom, meu ? 0.9f : 0.5f);
                    break;
                case "tempo":
                    if (meu) { Sons.Toca(Som.Erro); Vibra.Pulso(90); }
                    break;
                case "roundEnd":
                {
                    string venc = Json.Str(ev, "winnerId");
                    bool bateu = Json.Str(ev, "reason") == "bateu" && venc != null;
                    if (bateu && venc == eu) { Sons.Toca(Som.Bateu); Vibra.Pulso(120); }
                    else Sons.Toca(Som.Perdeu, 0.8f);
                    if (bateu) mesa.Reage(venc, "comemora");
                    mesa.ReageTodos("triste", bateu ? venc : null);
                    break;
                }
                case "gameEnd":
                {
                    var ranking = ev["ranking"] as JArray;
                    string primeiro = ranking != null && ranking.Count > 0 ? Json.Str(ranking[0], "id") : null;
                    if (primeiro != null && primeiro == eu) Sons.Toca(Som.Bateu);
                    if (primeiro != null) mesa.Reage(primeiro, "comemora");
                    break;
                }
            }
            // o corpo de quem fez o lance vai à mesa: pegar, soltar, baixar, encaixar
            switch (tipo)
            {
                case "draw": case "buy": case "discard": case "baixou": case "layoff": case "swapJoker":
                case "trocouPorCoringa": case "trocouNaTrinca": case "meldDiscard": case "tomouSobra": case "queimou":
                    if (!meu) mesa.Reage(p, "lance");
                    break;
            }
        }

        string NomeDe(string id)
        {
            if (id == null) return "???";
            if (id == cliente.MeuId) return "Você";
            var p = visao?.Jogador(id);
            if (p != null) return p.Nome;
            var ps = sala?.Jogadores.Find(x => x.Id == id);
            return ps != null ? ps.Nome : "???";
        }

        void AoEmote(string de, string chave)
        {
            var e = Emotes.De(chave);
            if (e == null) return;
            Sons.Toca(Som.Emote, 0.7f);
            if (telaAtual == "jogo")
            {
                hud.Balao(de, e.Texto);
                if (e.Humor != null) mesa.Reage(de, e.Humor);
            }
            else Aviso($"{NomeDe(de)}: {e.Texto}", false);
        }

        void AoSairDaSala()
        {
            sala = null;
            visao = null;
            treinador.Desliga();
            FechaRegras();
            hud.Limpa();
            MostraTela("inicio");
            mesa.MostrarSala(null, null);
        }

        void SairDaSala()
        {
            cliente.SairDaSala();
            AoSairDaSala();
        }

        // ---------------------------------------------------------------- laço

        void Update()
        {
            cliente.Atualizar(Time.unscaledDeltaTime);
            if (telaAtual == "jogo")
            {
                hud.PosicionaPlacas(mesa.PlacasNaTela(), raizUi.panel);
                hud.Tique();   // o relógio da vez e a carta solta esperando resposta
            }
            if (autoteste) JogaSozinho();
            if (!string.IsNullOrEmpty(capturaEm) && !capturou && Time.realtimeSinceStartup > tempoCaptura)
            {
                capturou = true;
                ScreenCapture.CaptureScreenshot(capturaEm);
                Debug.Log($"[caçamba] captura gravada em {capturaEm}");
                Invoke(nameof(Encerra), 1.5f);
            }
        }

        void Encerra() => Application.Quit();

        /// <summary>
        /// Autoteste: joga a própria vez com o mínimo — puxa do monte, tenta
        /// baixar uma vez e descarta a carta mais cara. Serve para exercitar o
        /// protocolo e a mesa sem ninguém no teclado.
        /// </summary>
        void JogaSozinho()
        {
            if (visao == null || visao.Voce == null || Time.time < proximaJogadaAuto) return;
            if (visao.VezId != cliente.MeuId) return;
            proximaJogadaAuto = Time.time + 1.1f;
            // puxa pelo mesmo caminho do toque no monte (o HUD), e não direto no
            // cliente: assim o autoteste também pega um HUD quebrado
            if (visao.Fase == "draw") { hud.TocouMonte(); return; }
            if (visao.Fase != "play") return;
            int marca = visao.Rodada * 1000 + visao.CartasNoMonte;
            if (baixadasTentadas != marca && !visao.Voce.Baixou)
            {
                baixadasTentadas = marca;
                cliente.Acao("baixar");
                return;
            }
            var mao = visao.Voce.Mao;
            if (mao.Count == 0) return;
            var descarte = mao.OrderByDescending(Regras.Pontos).First();
            cliente.Acao("discard", ("cardId", descarte.Id));
        }
    }
}
