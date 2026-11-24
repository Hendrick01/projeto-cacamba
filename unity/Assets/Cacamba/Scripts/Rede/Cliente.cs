using System;
using Cacamba.Modelo;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Cacamba.Rede
{
    /// <summary>
    /// A conversa com o servidor do Caçamba — o mesmo protocolo do site
    /// (public/client.js), para que quem joga no app e quem joga no navegador
    /// sentem na MESMA sala. O servidor é o juiz: este lado só pede jogadas e
    /// desenha o que volta.
    ///
    /// Mensagens que o cliente manda: create, join, resume, restaura, leave,
    /// addBot, removeBot, nivelRobos, start, action, nextRound, playAgain, emote.
    /// Mensagens que chegam: versao, welcome, lobby, state, selo, gone, error,
    /// emote, presenca, reinicio (voz e inventario são ignoradas aqui).
    /// </summary>
    public sealed class Cliente
    {
        public enum Conexao { Desligado, Conectando, Online, Pausado }

        [Serializable]
        public sealed class Sessao
        {
            public string code, playerId, token;
        }

        [Serializable]
        sealed class Selo
        {
            public string code, selo;
            public int seq;
        }

        const string ChaveSessao = "cacamba-sessao";
        const string ChaveSelo = "cacamba-selo";

        public event Action<Sala> AoLobby;
        public event Action<Visao, JArray> AoEstado;
        public event Action AoBemVindo;
        public event Action AoSairDaSala;          // gone: a sala acabou para este jogador
        public event Action<string> AoErro;         // mensagem do juiz, já em português
        public event Action<string> AoAviso;        // avisos do servidor (reinício)
        public event Action<string, string> AoEmote; // quem, chave
        public event Action<Conexao, string> AoMudarConexao;

        public Conexao Estado { get; private set; } = Conexao.Desligado;
        public Sessao SessaoAtual { get; private set; }
        public string MeuId => SessaoAtual?.playerId;
        public string UrlServidor { get; private set; } = "";

        ITransporteWs ws;
        float esperaReconexao = 0.5f;
        float reconectarEm = -1f;
        bool tentouRestaurar;
        Selo seloDaSala;

        public Cliente()
        {
            SessaoAtual = Carrega<Sessao>(ChaveSessao);
            seloDaSala = Carrega<Selo>(ChaveSelo);
        }

        public bool TemSessaoGuardada => SessaoAtual != null;

        // ---------------------------------------------------------------- conexão

        /// <summary>
        /// Liga no servidor. Aceita "https://host", "http://192.168.0.10:3000" ou
        /// só "host:porta". O WebSocket vai para o caminho "/" do mesmo endereço,
        /// que é o único que o servidor aceita.
        /// </summary>
        public void Ligar(string servidor)
        {
            UrlServidor = NormalizaServidor(servidor);
            ws?.Fechar();
            ws = FabricaWs.Criar();
            ws.AoAbrir += AoAbrir;
            ws.AoReceber += AoReceber;
            ws.AoFechar += AoFechar;
            Conectar();
        }

        public static string NormalizaServidor(string s)
        {
            s = (s ?? "").Trim().TrimEnd('/');
            if (s.Length == 0) return s;
            if (!s.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && !s.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                bool local = s.StartsWith("localhost") || s.StartsWith("127.") || s.StartsWith("192.168.") || s.StartsWith("10.");
                s = (local ? "http://" : "https://") + s;
            }
            return s;
        }

        void Conectar()
        {
            if (string.IsNullOrEmpty(UrlServidor)) return;
            var uri = new Uri(UrlServidor);
            string esquema = uri.Scheme == "https" ? "wss" : "ws";
            string origem = uri.GetLeftPart(UriPartial.Authority);   // https://host[:porta]
            MudaEstado(Conexao.Conectando, "");
            ws.Conectar($"{esquema}://{uri.Authority}/", origem);
        }

        public void Atualizar(float dt)
        {
            ws?.Atualizar();
            if (reconectarEm >= 0f)
            {
                reconectarEm -= dt;
                if (reconectarEm < 0f) { reconectarEm = -1f; Conectar(); }
            }
        }

        public void Desligar()
        {
            reconectarEm = -1f;
            ws?.Fechar();
            MudaEstado(Conexao.Desligado, "");
        }

        void AoAbrir()
        {
            esperaReconexao = 0.5f;
            MudaEstado(Conexao.Online, "");
            if (SessaoAtual != null)
                Envia(new JObject { ["t"] = "resume", ["code"] = SessaoAtual.code, ["playerId"] = SessaoAtual.playerId, ["token"] = SessaoAtual.token });
        }

        void AoFechar(int codigo, string motivo)
        {
            // 4001: a sessão foi retomada em outra janela/aparelho. 1008: o
            // servidor cortou por excesso de mensagens. Nos dois casos reconectar
            // sozinho seria brigar pela mesma cadeira; quem decide é o jogador.
            if (codigo == 4001 || codigo == 1008)
            {
                MudaEstado(Conexao.Pausado, codigo == 4001
                    ? "A partida foi aberta em outro aparelho ou janela."
                    : "Conexão pausada por excesso de mensagens.");
                return;
            }
            MudaEstado(Conexao.Desligado, motivo);
            reconectarEm = esperaReconexao;
            esperaReconexao = Mathf.Min(esperaReconexao * 1.6f, 6f);
        }

        /// <summary>Depois de uma pausa (4001/1008), volta a conectar quando o jogador pedir.</summary>
        public void Retomar()
        {
            if (Estado == Conexao.Online) return;
            esperaReconexao = 0.5f;
            Conectar();
        }

        void MudaEstado(Conexao novo, string detalhe)
        {
            Estado = novo;
            AoMudarConexao?.Invoke(novo, detalhe);
        }

        // --------------------------------------------------------------- recepção

        void AoReceber(string texto)
        {
            JObject msg;
            try { msg = JObject.Parse(texto); }
            catch (Exception) { return; }
            string t = Json.Str(msg, "t");
            switch (t)
            {
                case "welcome":
                    tentouRestaurar = false;
                    GuardaSessao(new Sessao { code = Json.Str(msg, "code"), playerId = Json.Str(msg, "playerId"), token = Json.Str(msg, "token") });
                    AoBemVindo?.Invoke();
                    break;
                case "lobby":
                    AoLobby?.Invoke(Sala.De(msg));
                    break;
                case "state":
                    if (msg["view"] is JObject v)
                    {
                        var visao = Visao.De(v);
                        visao.ChegouEm = Time.realtimeSinceStartup;   // o relógio da vez desconta a partir daqui
                        AoEstado?.Invoke(visao, msg["events"] as JArray ?? new JArray());
                    }
                    break;
                case "selo":
                    if (SessaoAtual != null && Json.Str(msg, "code") == SessaoAtual.code)
                    {
                        seloDaSala = new Selo { code = Json.Str(msg, "code"), seq = Json.Int(msg, "seq"), selo = Json.Str(msg, "selo") };
                        Guarda(ChaveSelo, seloDaSala);
                    }
                    break;
                case "reinicio":
                    AoAviso?.Invoke("O servidor está reiniciando. A partida volta em instantes.");
                    break;
                case "error":
                    AoErro?.Invoke(Json.Str(msg, "msg", "Algo deu errado."));
                    break;
                case "emote":
                    AoEmote?.Invoke(Json.Str(msg, "from"), Json.Str(msg, "k"));
                    break;
                case "gone":
                    // O servidor reiniciou e não conhece a sala: devolve o retrato
                    // cifrado que ele mesmo entregou, uma vez só.
                    if (Json.Bool(msg, "semSala") && SessaoAtual != null && seloDaSala != null
                        && seloDaSala.code == SessaoAtual.code && !tentouRestaurar)
                    {
                        tentouRestaurar = true;
                        Envia(new JObject { ["t"] = "restaura", ["selo"] = seloDaSala.selo, ["playerId"] = SessaoAtual.playerId, ["token"] = SessaoAtual.token });
                        break;
                    }
                    GuardaSessao(null);
                    AoSairDaSala?.Invoke();
                    break;
                // versao, voz, presenca, inventario: o app não usa
            }
        }

        // ---------------------------------------------------------------- envio

        void Envia(JObject msg)
        {
            if (ws == null || !ws.Aberto) { AoErro?.Invoke("Sem conexão com o servidor. Tentando de novo…"); return; }
            ws.Enviar(msg.ToString(Formatting.None));
        }

        /// <summary>
        /// Cria uma sala. Com `tutorial`, o servidor já põe um robô, começa a
        /// partida e arruma a primeira rodada pelo roteiro (shared/tutorial.js).
        /// </summary>
        public void CriarSala(string nome, string avatar, bool tutorial = false)
        {
            var msg = new JObject { ["t"] = "create", ["name"] = nome, ["avatar"] = avatar, ["modo"] = "cacamba" };
            if (tutorial) msg["tutorial"] = true;
            Envia(msg);
        }

        public void EntrarNaSala(string codigo, string nome, string avatar) =>
            Envia(new JObject { ["t"] = "join", ["code"] = (codigo ?? "").Trim().ToUpperInvariant(), ["name"] = nome, ["avatar"] = avatar });

        public void SairDaSala()
        {
            Envia(new JObject { ["t"] = "leave" });
            GuardaSessao(null);
        }

        public void AdicionarRobo() => Envia(new JObject { ["t"] = "addBot" });
        public void RemoverRobo(string id) => Envia(new JObject { ["t"] = "removeBot", ["botId"] = id });
        public void NivelDosRobos(string nivel) => Envia(new JObject { ["t"] = "nivelRobos", ["nivel"] = nivel });
        /// <summary>O relógio da vez, em segundos (0 desliga). Só o anfitrião, antes de começar.</summary>
        public void Relogio(int segundos) => Envia(new JObject { ["t"] = "relogio", ["s"] = segundos });
        public void Comecar() => Envia(new JObject { ["t"] = "start" });
        public void ProximaRodada() => Envia(new JObject { ["t"] = "nextRound" });
        public void JogarDeNovo() => Envia(new JObject { ["t"] = "playAgain" });
        public void Emote(string chave) => Envia(new JObject { ["t"] = "emote", ["k"] = chave });

        /// <summary>Uma jogada. Ex.: Acao("draw", ("source", "deck")).</summary>
        public void Acao(string a, params (string chave, JToken valor)[] campos)
        {
            var acao = new JObject { ["a"] = a };
            foreach (var (chave, valor) in campos) if (valor != null) acao[chave] = valor;
            Envia(new JObject { ["t"] = "action", ["action"] = acao });
        }

        // ------------------------------------------------------------ guardados

        void GuardaSessao(Sessao s)
        {
            SessaoAtual = s;
            if (s != null) Guarda(ChaveSessao, s);
            else
            {
                PlayerPrefs.DeleteKey(ChaveSessao);
                PlayerPrefs.DeleteKey(ChaveSelo);
                seloDaSala = null;
                PlayerPrefs.Save();
            }
        }

        static void Guarda<T>(string chave, T valor)
        {
            PlayerPrefs.SetString(chave, JsonUtility.ToJson(valor));
            PlayerPrefs.Save();
        }

        static T Carrega<T>(string chave) where T : class
        {
            try
            {
                string s = PlayerPrefs.GetString(chave, "");
                return string.IsNullOrEmpty(s) ? null : JsonUtility.FromJson<T>(s);
            }
            catch (Exception) { return null; }
        }
    }
}
