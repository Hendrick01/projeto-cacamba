using System;
using UnityEngine.UIElements;

namespace Cacamba.Interface
{
    /// <summary>
    /// As regras à mão — o mesmo texto do "Como se joga" do site
    /// (public/client.js → showRules), com os naipes por extenso (a fonte do
    /// app não tem ♠♥♦♣) e os gestos do app. Abre por cima de tudo, da tela
    /// inicial ou da partida; na partida, o contrato da rodada vem marcado.
    /// </summary>
    public static class TelaRegras
    {
        static readonly (string rodada, string contrato)[] Contratos =
        {
            ("1ª · 6 cartas", "2 trincas"),
            ("2ª · 7 cartas", "1 trinca + 1 sequência"),
            ("3ª · 8 cartas", "2 sequências"),
            ("4ª · 9 cartas", "3 trincas"),
            ("5ª · 10 cartas", "2 trincas + 1 sequência"),
            ("6ª · 11 cartas", "2 sequências + 1 trinca"),
            ("7ª · 12 cartas", "3 sequências"),
        };

        /// <summary>
        /// Monta a tela. `rodadaAtual` (0–6) marca o contrato da rodada em
        /// andamento; −1 fora da partida. `fechar` tira a tela de onde ela foi posta.
        /// </summary>
        public static VisualElement Monta(int rodadaAtual, bool salaComRelogio, Action fechar)
        {
            var fundo = U.Div("camada", "fundo-modal");
            // opaca: texto longo por cima da tela inicial ficava difícil de ler
            var caixa = U.Div("painel", "modal", "coluna", "painel-opaco");
            fundo.Add(caixa);
            caixa.Add(U.Titulo("Como se joga", "modal-titulo"));
            var rol = new ScrollView(ScrollViewMode.Vertical);
            rol.style.flexShrink = 1;
            caixa.Add(rol);

            void Secao(string titulo) => rol.Add(U.Texto(titulo, "regras-secao"));
            void Paragrafo(string texto) => rol.Add(U.Texto(texto, "regras-texto"));
            void Item(string texto) => rol.Add(U.Texto("•  " + texto, "regras-texto", "regras-item"));

            Paragrafo("São 7 rodadas. Em cada uma você precisa montar o CONTRATO da rodada para poder baixar o jogo. Quem fica sem cartas na mão BATE e vence a rodada; os outros somam os pontos das cartas que sobraram. No fim, ganha quem tiver MENOS pontos.");

            Secao("Os contratos");
            for (int i = 0; i < Contratos.Length; i++)
            {
                var linha = U.Div("regras-contrato");
                if (i == rodadaAtual) linha.AddToClassList("regras-contrato-atual");
                linha.Add(U.Texto(Contratos[i].rodada, "regras-contrato-rodada"));
                linha.Add(U.Texto(Contratos[i].contrato + (i == rodadaAtual ? "   (agora)" : ""), "regras-contrato-nome"));
                rol.Add(linha);
            }

            Secao("Trinca e sequência");
            Item("TRINCA: 3 cartas do mesmo valor, de naipes diferentes.");
            Item("SEQUÊNCIA: 4 cartas seguidas do mesmo naipe. O Ás vale 1 (Ás-2-3-4) ou 14 (Valete-Dama-Rei-Ás), mas não \"vira a esquina\" (Rei-Ás-2 não vale).");
            Item("Quarta carta na trinca: só de um naipe que JÁ está nela. Numa trinca de espadas, copas e paus entra outra de espadas, copas ou paus — nunca a de ouros.");
            Item("Troca na trinca: uma carta da mão do mesmo valor pode entrar NO LUGAR de uma carta da trinca (de qualquer jogador), que vem para a sua mão. A trinca tem de continuar com 3 naipes diferentes. No app: escolha a carta na mão, abra Jogos e toque na carta da trinca.");

            Secao("Coringa");
            Item("Vale SÓ em sequência (nunca em trinca), no máximo 1 por sequência.");
            Item("Nas rodadas só de trincas (1ª e 4ª) ele fica fora do baralho.");
            Item("Quem tem a carta EXATA que o coringa representa pode trocá-lo em qualquer sequência da mesa: a carta entra no lugar e o coringa vem para a sua mão.");
            Item("O coringa da mão também pode entrar no lugar de qualquer carta de uma sequência já baixada: a carta sai para a sua mão e a sequência não muda.");
            Item("Coringa na ponta muda de ponta: em coringa-8-9-10 ele vale 7, mas se você tem a Dama ele passa para o outro lado (8-9-10-coringa) e a Dama encaixa. Só quando a carta não cabe de outro jeito.");
            Item("Coringa descartado TRANCA o meio: ninguém compra do descarte até alguém descartar por cima.");
            Item("Na mão ao fim da rodada, custa 20 pontos.");

            Secao("Na sua vez");
            Item("1. PUXE uma carta (obrigatório): do monte ou do meio.");
            Item("2. BAIXE seus jogos — pode ser um de cada vez: qualquer trinca ou sequência completa que o contrato ainda peça já pode descer.");
            Item("3. ENCAIXE cartas nos jogos da mesa (seus e dos outros) quando quiser. Só nunca baixe ou encaixe a ponto de ficar com menos de duas cartas sem completar o contrato: só bate quem já o cumpriu.");
            Item("4. Carta que SOBRA na mesa — sequência com mais de 4 cartas (só as pontas) ou trinca com mais de 3 (qualquer uma, desde que sobrem 3 naipes): sai de qualquer jogo para baixar um jogo seu com ela na hora, para a sua mão ou direto para o descarte.");
            Item("5. DESCARTE uma carta (obrigatório): da mão, ou a que sobra num jogo da mesa.");

            Secao("Com o dedo, no app");
            Item("Tocar numa carta escolhe; tocar de novo desfaz.");
            Item("Arrastar dentro da mão muda a ordem. O botão Ordem alterna naipe, valor e jogos prontos na frente.");
            Item("Arrastar para a mesa joga: no descarte, descarta; num jogo baixado, encaixa (os jogos onde a carta cabe brilham); no feltro livre, baixa o jogo de que a carta faz parte, ou as cartas escolhidas.");
            Item("A FAIXA COLORIDA embaixo das cartas marca as que já formam um jogo, uma cor por jogo. As pílulas acima dos botões contam o contrato: verde na mesa, âmbar pronto na mão, apagada falta.");
            Item("Jogos abre o visor com os jogos de todo mundo, para trocar coringa, trocar na trinca e mexer nas sobras.");

            Secao("Compra fora da vez");
            Paragrafo("Quando alguém descarta, os outros podem PEDIR a carta (toque no meio, ou no botão Pedir): leva quem pedir primeiro, e fica só com a carta pedida (não puxa nem descarta). Mas quem está na vez tem preferência: se ele pegar a carta do meio, ela é dele.");
            Paragrafo("Quem descartou não pede de volta: a carta que saiu da sua mão não volta para ela. Numa mesa de dois a compra fora da vez não acontece — o único que não está na vez é justamente quem acabou de descartar.");

            Secao("Queima");
            Paragrafo("Quem ABRE a rodada pode recusar a primeira carta que puxa do monte: ela sai do jogo e ele puxa outra. Uma vez só, na primeira jogada da rodada.");

            if (salaComRelogio)
            {
                Secao("Relógio da vez");
                Paragrafo("Esta sala tem relógio: quem estoura o prazo tem a vez jogada no mínimo — o jogo puxa do monte e descarta, sem baixar nem encaixar nada. Na vez seguinte o relógio volta inteiro.");
            }

            Secao("Pontos");
            Paragrafo("As cartas que sobram na mão contam pelo valor de face: o 5 vale 5, o 10 vale 10. Valete 11, Dama 12, Rei 13, Ás 15 (mesmo tendo jogado como 1) e coringa 20. Se o monte esgotar 3 vezes na mesma rodada, ela acaba sem vencedor e todos contam a mão.");

            Secao("Se a conexão cair");
            Paragrafo("O jogo guarda o seu lugar: abra de novo e você volta para a mesma mão. Fora por mais de 45 segundos na sua vez, o jogo joga por você até você voltar.");

            caixa.Add(U.Botao("Fechar", () => fechar?.Invoke(), "botao-principal"));
            return fundo;
        }
    }
}
