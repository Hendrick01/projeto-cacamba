using System;
using Cacamba.Modelo;
using UnityEngine;
using UnityEngine.UIElements;

namespace Cacamba.Interface
{
    /// <summary>
    /// O lobby: código grande, QR (o mesmo que o servidor desenha para o site —
    /// quem aponta a câmera entra pelo navegador, na mesma sala), quem já chegou
    /// e, para quem criou a sala, robôs e o botão de começar.
    /// </summary>
    public sealed class TelaSala
    {
        public readonly VisualElement Raiz;
        public event Action AoAdicionarRobo, AoComecar, AoSair;
        public event Action<string> AoRemoverRobo, AoNivel;
        public event Action<int> AoRelogio;

        readonly Label codigo, link, espera, relogioInfo;
        readonly Image qr;
        readonly VisualElement lista, controles, linhaRelogio;
        readonly Button comecar, facil, normal;
        readonly System.Collections.Generic.Dictionary<int, Button> botoesRelogio = new System.Collections.Generic.Dictionary<int, Button>();
        string qrAtual;
        string linkAtual = "";

        public TelaSala()
        {
            Raiz = U.Div("camada", "tela-centro");
            var painel = U.Div("painel", "coluna");
            painel.style.maxWidth = 520;
            painel.style.width = Length.Percent(100);
            var rolagem = new ScrollView(ScrollViewMode.Vertical);
            rolagem.style.maxHeight = Length.Percent(100);
            rolagem.Add(painel);
            Raiz.Add(rolagem);

            painel.Add(U.Texto("Código da sala", "rotulo", "centro"));
            codigo = U.Titulo("····", "codigo-sala");
            painel.Add(codigo);
            qr = U.Imagem(null, "qr");
            painel.Add(qr);
            link = U.Texto("", "nota", "centro");
            painel.Add(link);
            var copiar = U.Botao("Copiar link de convite", () =>
            {
                GUIUtility.systemCopyBuffer = linkAtual;
            }, "botao-pequeno");
            copiar.style.alignSelf = Align.Center;
            painel.Add(copiar);

            painel.Add(U.Texto("Na mesa", "rotulo"));
            lista = U.Div("coluna");
            painel.Add(lista);

            controles = U.Div("coluna");
            var linhaRobos = U.Div("linha");
            linhaRobos.Add(U.Botao("+ Robô", () => AoAdicionarRobo?.Invoke(), "botao-pequeno"));
            linhaRobos.Add(U.Texto("Robôs:", "nota"));
            facil = U.Botao("Fácil", () => AoNivel?.Invoke("facil"), "botao-pequeno");
            normal = U.Botao("Normal", () => AoNivel?.Invoke("normal"), "botao-pequeno");
            linhaRobos.Add(facil);
            linhaRobos.Add(normal);
            controles.Add(linhaRobos);
            // O relógio da vez: sem ele a mesa espera quem pensa; com ele, quem
            // estoura o tempo tem a vez jogada no mínimo (puxa e descarta).
            linhaRelogio = U.Div("linha");
            linhaRelogio.style.flexWrap = Wrap.Wrap;
            linhaRelogio.Add(U.Texto("Relógio da vez:", "nota"));
            controles.Add(linhaRelogio);
            comecar = U.Botao("Começar partida", () => AoComecar?.Invoke(), "botao-principal");
            comecar.style.marginTop = 10;
            controles.Add(comecar);
            painel.Add(controles);

            espera = U.Texto("Esperando quem criou a sala começar…", "nota", "centro");
            espera.style.marginTop = 10;
            painel.Add(espera);
            relogioInfo = U.Texto("", "nota", "centro");
            painel.Add(relogioInfo);

            var sair = U.Botao("Sair da sala", () => AoSair?.Invoke(), "botao-pequeno");
            sair.style.alignSelf = Align.Center;
            sair.style.marginTop = 12;
            painel.Add(sair);
        }

        public void Atualiza(Sala sala, string eu)
        {
            codigo.text = sala.Codigo;
            linkAtual = sala.LinkConvite ?? "";
            link.text = string.IsNullOrEmpty(linkAtual) ? "" : $"Pelo navegador: {linkAtual}";
            if (sala.QrDataUrl != qrAtual)
            {
                qrAtual = sala.QrDataUrl;
                qr.image = U.ImagemDeDataUrl(qrAtual);
            }
            U.Mostra(qr, qr.image != null);

            bool souAnfitriao = sala.AnfitriaoId == eu;
            lista.Clear();
            for (int i = 0; i < sala.Jogadores.Count; i++)
            {
                var p = sala.Jogadores[i];
                var linha = U.Div("jogador-sala");
                string slug = Elenco.De(p.Avatar) != null ? p.Avatar : Elenco.DoAssento(i);
                linha.Add(U.Imagem(Resources.Load<Texture2D>($"Personagens/{slug}-avatar"), "avatar-pequeno"));
                var nome = U.Texto(p.Id == eu ? $"{p.Nome} (você)" : p.Nome);
                nome.style.flexGrow = 1;
                linha.Add(nome);
                if (p.Id == sala.AnfitriaoId) linha.Add(U.Texto("anfitrião", "etiqueta", "etiqueta-ouro"));
                if (p.Robo) linha.Add(U.Texto("robô", "etiqueta"));
                else if (!p.Conectado) linha.Add(U.Texto("fora", "etiqueta", "etiqueta-fora"));
                if (p.Robo && souAnfitriao)
                {
                    string id = p.Id;
                    linha.Add(U.Botao("Tirar", () => AoRemoverRobo?.Invoke(id), "botao-pequeno"));
                }
                lista.Add(linha);
            }

            U.Mostra(controles, souAnfitriao);
            U.Mostra(espera, !souAnfitriao);
            comecar.SetEnabled(sala.Jogadores.Count >= 2);
            comecar.text = sala.Jogadores.Count >= 2 ? "Começar partida" : "Chame alguém ou ponha um robô";
            facil.EnableInClassList("botao-ativo", sala.NivelRobos == "facil");
            normal.EnableInClassList("botao-ativo", sala.NivelRobos != "facil");

            // o relógio só existe se o servidor oferece (um servidor antigo não manda `relogios`)
            bool temRelogio = sala.Relogio >= 0 && sala.Relogios.Count > 0;
            U.Mostra(linhaRelogio, temRelogio);
            if (temRelogio)
            {
                foreach (int s in sala.Relogios)
                {
                    if (botoesRelogio.ContainsKey(s)) continue;
                    int segundos = s;
                    var b = U.Botao(s == 0 ? "Sem" : $"{s} s", () => AoRelogio?.Invoke(segundos), "botao-pequeno");
                    botoesRelogio[s] = b;
                    linhaRelogio.Add(b);
                }
                foreach (var kv in botoesRelogio) kv.Value.EnableInClassList("botao-ativo", kv.Key == sala.Relogio);
            }
            // quem não criou a sala só fica sabendo
            relogioInfo.text = !souAnfitriao && sala.Relogio > 0 ? $"Relógio da vez: {sala.Relogio} s. Estourou, o jogo puxa e descarta por você." : "";
            U.Mostra(relogioInfo, relogioInfo.text.Length > 0);
        }
    }
}
