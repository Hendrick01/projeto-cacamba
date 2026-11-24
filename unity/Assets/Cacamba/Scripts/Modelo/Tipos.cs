using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace Cacamba.Modelo
{
    // Espelho, em C#, do que o servidor manda (shared/engine.js → viewFor, e
    // server.js → lobbyView). A leitura é feita à mão a partir do JObject, sem
    // reflexão: é o que funciona igual no editor, no IL2CPP do celular e no
    // WebGL, onde o "stripping" apagaria construtores usados só por reflexão.

    static class Json
    {
        public static bool Nulo(JToken t) => t == null || t.Type == JTokenType.Null || t.Type == JTokenType.Undefined;
        // Indexar um JValue (null, número) lança exceção; só objeto tem campo.
        static JToken Campo(JToken t, string k) => t is JObject o ? o[k] : null;
        public static int Int(JToken t, string k, int padrao = 0)
        {
            var v = Campo(t, k);
            if (Nulo(v)) return padrao;
            return v.Type == JTokenType.Integer || v.Type == JTokenType.Float ? v.Value<int>() : padrao;
        }
        public static string Str(JToken t, string k, string padrao = null) { var v = Campo(t, k); return Nulo(v) ? padrao : v.ToString(); }
        public static bool Bool(JToken t, string k) { var v = Campo(t, k); return !Nulo(v) && v.Type == JTokenType.Boolean && v.Value<bool>(); }
    }

    public sealed class Carta
    {
        public int Id;
        public int Valor;      // 1 = Ás … 13 = Rei; 0 no coringa
        public int Naipe;      // 0 espadas, 1 copas, 2 ouros, 3 paus; -1 no coringa
        public bool Coringa;
        public string DescartadaPor;

        public static Carta De(JToken t)
        {
            if (Json.Nulo(t)) return null;
            return new Carta
            {
                Id = Json.Int(t, "id"),
                Valor = Json.Int(t, "rank"),
                Naipe = Json.Int(t, "suit", -1),
                Coringa = Json.Bool(t, "joker"),
                DescartadaPor = Json.Str(t, "by"),
            };
        }

        public static List<Carta> Lista(JToken arr)
        {
            var l = new List<Carta>();
            if (arr is JArray a) foreach (var t in a) { var c = De(t); if (c != null) l.Add(c); }
            return l;
        }
    }

    /// <summary>Um jogo baixado na mesa: trinca ("t") ou sequência ("s").</summary>
    public sealed class JogoNaMesa
    {
        public int Id;
        public string Tipo;
        public int ValorDaTrinca;
        public int Naipe = -1;
        public string DonoId;
        public List<Carta> Cartas = new List<Carta>();
        public List<int> Valores = new List<int>();

        public bool EhSequencia => Tipo == "s";

        public static JogoNaMesa De(JToken t)
        {
            var j = new JogoNaMesa
            {
                Id = Json.Int(t, "id"),
                Tipo = Json.Str(t, "type", "t"),
                ValorDaTrinca = Json.Int(t, "rank"),
                Naipe = Json.Int(t, "suit", -1),
                DonoId = Json.Str(t, "ownerId"),
                Cartas = Carta.Lista(t["cards"]),
            };
            if (t["values"] is JArray vs) foreach (var v in vs) j.Valores.Add(v.Value<int>());
            return j;
        }
    }

    public sealed class JogadorNaMesa
    {
        public string Id, Nome, Avatar;
        public bool Robo, Baixou, Conectado, Desistiu;
        public int CartasNaMao, Pontos, BaixadosT, BaixadosS;
        public List<JogoNaMesa> Jogos = new List<JogoNaMesa>();

        public static JogadorNaMesa De(JToken t)
        {
            var p = new JogadorNaMesa
            {
                Id = Json.Str(t, "id"),
                Nome = Json.Str(t, "name", "Jogador"),
                Avatar = Json.Str(t, "avatar"),
                Robo = Json.Bool(t, "isBot"),
                Baixou = Json.Bool(t, "baixou"),
                Conectado = Json.Nulo(t["connected"]) || Json.Bool(t, "connected"),
                Desistiu = Json.Bool(t, "desistiu"),
                CartasNaMao = Json.Int(t, "handCount"),
                Pontos = Json.Int(t, "score"),
                BaixadosT = Json.Int(t["baixados"], "t"),
                BaixadosS = Json.Int(t["baixados"], "s"),
            };
            if (t["melds"] is JArray ms) foreach (var m in ms) p.Jogos.Add(JogoNaMesa.De(m));
            return p;
        }
    }

    public sealed class Voce
    {
        public string Id;
        public List<Carta> Mao = new List<Carta>();
        public bool Baixou, PodeTrocarCoringa, PodeQueimar;
        public int BaixadosT, BaixadosS, FaltaT, FaltaS;

        public static Voce De(JToken t)
        {
            if (Json.Nulo(t)) return null;
            return new Voce
            {
                Id = Json.Str(t, "id"),
                Mao = Carta.Lista(t["hand"]),
                Baixou = Json.Bool(t, "baixou"),
                PodeTrocarCoringa = Json.Bool(t, "podeTrocarCoringa"),
                PodeQueimar = Json.Bool(t, "podeQueimar"),
                BaixadosT = Json.Int(t["baixados"], "t"),
                BaixadosS = Json.Int(t["baixados"], "s"),
                FaltaT = Json.Int(t["remaining"], "t"),
                FaltaS = Json.Int(t["remaining"], "s"),
            };
        }
    }

    public sealed class ResultadoRodada
    {
        public string VencedorId;   // null quando o monte esgotou
        public string Motivo;       // "bateu" | "esgotado"
        public Dictionary<string, int> Pontos = new Dictionary<string, int>();

        public static ResultadoRodada De(JToken t)
        {
            if (Json.Nulo(t)) return null;
            var r = new ResultadoRodada { VencedorId = Json.Str(t, "winnerId"), Motivo = Json.Str(t, "reason") };
            if (t["scores"] is JObject s) foreach (var kv in s) r.Pontos[kv.Key] = kv.Value.Value<int>();
            return r;
        }
    }

    public sealed class Classificacao
    {
        public string Id, Nome;
        public int Pontos;
    }

    /// <summary>A visão da partida que o servidor manda a ESTE jogador (viewFor).</summary>
    public sealed class Visao
    {
        public string Modo;
        public int Rodada, TotalRodadas = 7, ContratoT, ContratoS;
        public string ContratoTexto, Fase, VezId;
        public int CartasNoMonte, CartasNoDescarte;
        public Carta TopoDoDescarte;
        public bool DescarteFresco, DescarteCompravel, DescarteTravado;
        public List<string> Pedidos = new List<string>();
        public ResultadoRodada UltimaRodada;
        public List<Classificacao> Ranking;
        public Voce Voce;
        public List<JogadorNaMesa> Jogadores = new List<JogadorNaMesa>();

        /// <summary>
        /// O relógio da vez, quando a sala tem (server.js → relogioNaVisao): o
        /// prazo inteiro e o que faltava quando o servidor mandou. −1 = sem relógio.
        /// </summary>
        public int VezMs = -1, RestaMs = -1;
        /// <summary>Quando esta visão chegou (Time.realtimeSinceStartup), para descontar do que faltava.</summary>
        public float ChegouEm;

        public bool TemRelogio => VezMs > 0 && RestaMs >= 0;

        /// <summary>Segundos que ainda faltam agora, contando o tempo desde a chegada.</summary>
        public float RestaSegundos(float agora) => TemRelogio ? System.Math.Max(0f, RestaMs / 1000f - (agora - ChegouEm)) : -1f;

        public bool EhCacamba => string.IsNullOrEmpty(Modo) || Modo == "cacamba";

        public JogadorNaMesa Jogador(string id) => Jogadores.Find(p => p.Id == id);

        public static Visao De(JToken t)
        {
            var v = new Visao
            {
                Modo = Json.Str(t, "modo"),
                Rodada = Json.Int(t, "round"),
                TotalRodadas = Json.Int(t, "totalRounds", 7),
                Fase = Json.Str(t, "phase", "lobby"),
                VezId = Json.Str(t, "turnId"),
                CartasNoMonte = Json.Int(t, "deckCount"),
                CartasNoDescarte = Json.Int(t, "discardCount"),
                TopoDoDescarte = Carta.De(t["discardTop"]),
                DescarteFresco = Json.Bool(t, "discardFresh"),
                DescarteCompravel = Json.Bool(t, "discardBuyable"),
                DescarteTravado = Json.Bool(t, "discardLocked"),
                UltimaRodada = ResultadoRodada.De(t["lastRound"]),
                Voce = Voce.De(t["you"]),
                VezMs = Json.Int(t, "vezMs", -1),
                RestaMs = Json.Int(t, "restaMs", -1),
            };
            var ct = t["contract"];
            if (!Json.Nulo(ct))
            {
                v.ContratoT = Json.Int(ct, "t");
                v.ContratoS = Json.Int(ct, "s");
                v.ContratoTexto = Json.Str(ct, "label", "");
            }
            if (t["claims"] is JArray cl) foreach (var c in cl) v.Pedidos.Add(c.Value<string>());
            if (t["ranking"] is JArray rk)
            {
                v.Ranking = new List<Classificacao>();
                foreach (var r in rk) v.Ranking.Add(new Classificacao { Id = Json.Str(r, "id"), Nome = Json.Str(r, "name"), Pontos = Json.Int(r, "score") });
            }
            if (t["players"] is JArray ps) foreach (var p in ps) v.Jogadores.Add(JogadorNaMesa.De(p));
            return v;
        }
    }

    public sealed class JogadorNaSala
    {
        public string Id, Nome, Avatar;
        public bool Robo, Conectado, Desistiu;
    }

    /// <summary>O lobby da sala (lobbyView no server.js).</summary>
    public sealed class Sala
    {
        public string Codigo, AnfitriaoId, LinkConvite, QrDataUrl, Modo, NivelRobos;
        public bool Comecou;
        /// <summary>Sala de tutorial: um robô, a primeira rodada roteirizada e ninguém de fora.</summary>
        public bool Tutorial;
        public List<JogadorNaSala> Jogadores = new List<JogadorNaSala>();
        /// <summary>O relógio da vez, em segundos (0 = sem relógio). −1: o servidor é antigo e não tem relógio.</summary>
        public int Relogio = -1;
        /// <summary>Os prazos que o servidor oferece (0 incluído).</summary>
        public List<int> Relogios = new List<int>();

        public static Sala De(JToken t)
        {
            var s = new Sala
            {
                Codigo = Json.Str(t, "code", ""),
                AnfitriaoId = Json.Str(t, "hostId"),
                LinkConvite = Json.Str(t, "joinUrl", ""),
                QrDataUrl = Json.Str(t, "qr"),
                Modo = Json.Str(t, "modo", "cacamba"),
                NivelRobos = Json.Str(t, "nivelRobos", "normal"),
                Comecou = Json.Bool(t, "started"),
                Tutorial = Json.Bool(t, "tutorial"),
                Relogio = Json.Int(t, "relogio", -1),
            };
            if (t["relogios"] is JArray rs)
                foreach (var r in rs)
                    if (r.Type == JTokenType.Integer) s.Relogios.Add(r.Value<int>());
            if (t["players"] is JArray ps)
                foreach (var p in ps)
                    s.Jogadores.Add(new JogadorNaSala
                    {
                        Id = Json.Str(p, "id"),
                        Nome = Json.Str(p, "name", "Jogador"),
                        Avatar = Json.Str(p, "avatar"),
                        Robo = Json.Bool(p, "isBot"),
                        Conectado = Json.Bool(p, "connected"),
                        Desistiu = Json.Bool(p, "desistiu"),
                    });
            return s;
        }
    }
}
