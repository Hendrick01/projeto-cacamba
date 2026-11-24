using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace Cacamba.Modelo
{
    /// <summary>
    /// O que a mesa diz em voz alta a cada lance — adaptado do announce() de
    /// public/client.js. Recebe um evento do motor (o "e" de cada item de
    /// events) e devolve o aviso, ou null quando o lance não merece aviso.
    /// </summary>
    public static class Textos
    {
        public sealed class Aviso
        {
            public string Texto;
            public string Quem;     // id de quem fez o lance (para a placa sobre a cabeça)
            public string Verbo;    // COMPROU, DESCARTOU, BAIXOU…
            public string Reacao;   // "feliz" | "bravo" | null
        }

        public static Aviso De(JToken ev, Func<string, string> nome, string eu)
        {
            string tipo = Json.Str(ev, "e");
            string p = Json.Str(ev, "p");
            Carta carta = Carta.De(ev["card"]);
            string Dono(string deQuem, string meu, string proprio, string deOutro) =>
                deQuem == eu ? meu : deQuem == p ? proprio : $"{deOutro} {nome(deQuem)}";

            switch (tipo)
            {
                case "roundStart":
                    return new Aviso { Texto = $"Rodada {Json.Int(ev, "round") + 1}. Quem começa: {nome(Json.Str(ev, "first"))}." };
                case "draw":
                    if (Json.Str(ev, "source") == "discard")
                        return new Aviso { Texto = $"{nome(p)} pegou {Regras.Nome(carta)} do meio.", Quem = p, Verbo = "PEGOU DO MEIO", Reacao = "feliz" };
                    return new Aviso { Quem = p, Verbo = "COMPROU" };
                case "claim":
                    return new Aviso { Texto = p == eu ? null : $"{nome(p)} quer a carta do meio.", Quem = p, Verbo = "PEDIU" };
                case "unclaim":
                    return null;
                case "claimVoid":
                {
                    var perdedores = Lista(ev["losers"]);
                    string by = Json.Str(ev, "by");
                    return new Aviso
                    {
                        Texto = perdedores.Contains(eu) ? $"{nome(by)} estava na vez e ficou com {Regras.Nome(carta)}." : null,
                        Quem = perdedores.Count > 0 ? perdedores[0] : null,
                        Reacao = "bravo",
                    };
                }
                case "buy":
                    return new Aviso { Texto = $"{nome(p)} pediu primeiro e levou {Regras.Nome(carta)}.", Quem = p, Verbo = "LEVOU", Reacao = "feliz" };
                case "discard":
                    return new Aviso { Texto = p == eu ? null : $"{nome(p)} descartou {Regras.Nome(carta)}.", Quem = p, Verbo = "DESCARTOU" };
                case "baixou":
                {
                    int t = Json.Int(ev, "t"), s = Json.Int(ev, "s"), et = Json.Int(ev, "extraT"), es = Json.Int(ev, "extraS");
                    var partes = new List<string>();
                    if (t + s > 0) partes.Add(Regras.Contrato(t, s));
                    if (et + es > 0) partes.Add($"jogo extra ({Regras.Contrato(et, es)})");
                    string fim = Json.Bool(ev, "completa") ? " e cumpriu o contrato!" : ".";
                    return new Aviso { Texto = $"{nome(p)} baixou {string.Join(" e ", partes)}{fim}", Quem = p, Verbo = "BAIXOU", Reacao = "feliz" };
                }
                case "layoff":
                {
                    bool mudou = Json.Bool(ev, "coringaMudouDePonta");
                    string texto = p != eu
                        ? $"{nome(p)} encaixou {Regras.Nome(carta)}{(mudou ? " — e o coringa mudou de ponta" : "")}."
                        : mudou ? "O coringa mudou de ponta para a sua carta caber." : null;
                    return new Aviso { Texto = texto, Quem = p, Verbo = "ENCAIXOU" };
                }
                case "pegouCoringa":
                    return new Aviso { Texto = $"{nome(p)} esticou a sequência e levou o coringa que sobrou.", Quem = p, Verbo = "PEGOU O CORINGA", Reacao = "feliz" };
                case "swapJoker":
                    return new Aviso { Texto = $"{nome(p)} pôs {Regras.Nome(carta)} no lugar do coringa.", Quem = p, Verbo = "TROCOU O CORINGA", Reacao = "feliz" };
                case "trocouPorCoringa":
                {
                    string deQuem = Json.Str(ev, "deQuem");
                    return new Aviso { Texto = $"{nome(p)} pôs um coringa no lugar de {Regras.Nome(carta)} {Dono(deQuem, "num jogo SEU", "no próprio jogo", "num jogo de")} e levou a carta.", Quem = p, Verbo = "TROCOU" };
                }
                case "trocouNaTrinca":
                {
                    string deQuem = Json.Str(ev, "deQuem");
                    var entra = Carta.De(ev["entra"]);
                    var sai = Carta.De(ev["sai"]);
                    return new Aviso { Texto = $"{nome(p)} pôs {Regras.Nome(entra)} no lugar de {Regras.Nome(sai)} {Dono(deQuem, "numa trinca SUA", "na própria trinca", "numa trinca de")}.", Quem = p, Verbo = "TROCOU" };
                }
                case "meldDiscard":
                {
                    string deQuem = Json.Str(ev, "deQuem");
                    return new Aviso { Texto = $"{nome(p)} descartou {Regras.Nome(carta)} {Dono(deQuem, "de um jogo SEU", "de um jogo próprio", "de um jogo de")}.", Quem = p, Verbo = "DESCARTOU" };
                }
                case "tomouSobra":
                {
                    string deQuem = Json.Str(ev, "deQuem");
                    return new Aviso { Texto = $"{nome(p)} levou {Regras.Nome(carta)} {Dono(deQuem, "de um jogo SEU", "de um jogo próprio", "de um jogo de")} para a mão.", Quem = p, Verbo = "LEVOU" };
                }
                case "queimou":
                    return new Aviso { Texto = $"{nome(p)} queimou a primeira carta e comprou outra.", Quem = p, Verbo = "QUEIMOU" };
                case "reshuffle":
                    return new Aviso { Texto = "O monte acabou — o meio foi embaralhado de volta." };
                case "desistiu":
                    return new Aviso { Texto = $"{nome(p)} saiu da partida — o robô assume o lugar.", Quem = p };
                case "tempo":
                    return new Aviso { Texto = p == eu ? "Seu tempo acabou: o jogo puxou e descartou por você." : $"O tempo de {nome(p)} acabou: o jogo jogou a vez.", Quem = p, Verbo = "TEMPO ESGOTADO" };
                case "away":
                    return new Aviso { Texto = p == eu ? "Você caiu — o jogo joga por você até voltar." : $"{nome(p)} caiu — o jogo joga no lugar até a pessoa voltar." };
                case "roundEnd":
                {
                    string venc = Json.Str(ev, "winnerId");
                    return Json.Str(ev, "reason") == "bateu"
                        ? new Aviso { Texto = $"{nome(venc)} bateu!", Quem = venc, Verbo = "BATEU", Reacao = "feliz" }
                        : new Aviso { Texto = "O monte esgotou — a rodada terminou sem vencedor." };
                }
                case "gameEnd":
                    return new Aviso { Texto = "Fim de jogo!" };
                default:
                    return null;
            }
        }

        static List<string> Lista(JToken t)
        {
            var l = new List<string>();
            if (t is JArray a) foreach (var x in a) l.Add(x.ToString());
            return l;
        }
    }
}
