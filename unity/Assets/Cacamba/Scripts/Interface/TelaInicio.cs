using System;
using System.Collections.Generic;
using Cacamba.Modelo;
using UnityEngine;
using UnityEngine.UIElements;

namespace Cacamba.Interface
{
    /// <summary>
    /// A porta de entrada: nome, personagem, servidor, e criar ou entrar numa
    /// sala pelo código de 4 letras — o mesmo código que o site mostra, então dá
    /// para entrar pelo app numa sala criada no navegador (e vice-versa).
    /// </summary>
    public sealed class TelaInicio
    {
        public readonly VisualElement Raiz;
        public event Action<string, string> AoCriar;            // nome, personagem
        public event Action<string, string> AoTutorial;         // nome, personagem
        public event Action AoRegras;
        public event Action<string, string, string> AoEntrar;   // código, nome, personagem
        public event Action<string> AoTrocarServidor;

        readonly TextField nome, codigo, servidor;
        readonly Label tracoDoPersonagem, estado;
        readonly Dictionary<string, Image> avatares = new Dictionary<string, Image>();
        readonly Button criar, entrar, aprender;
        string escolhido;

        public string Nome => (nome.value ?? "").Trim();
        public string Personagem => escolhido;

        public TelaInicio(bool mostrarServidor, string servidorAtual)
        {
            Raiz = U.Div("camada", "tela-centro");
            var painel = U.Div("painel", "coluna");
            painel.style.maxWidth = 480;
            painel.style.width = Length.Percent(100);
            // em tela baixa (celular deitado) o painel rola em vez de espremer
            var rolagem = new ScrollView(ScrollViewMode.Vertical);
            rolagem.style.maxHeight = Length.Percent(100);
            rolagem.style.width = Length.Percent(100);
            rolagem.style.maxWidth = 480;
            rolagem.Add(painel);
            Raiz.Add(rolagem);

            painel.Add(U.Titulo("Caçamba", "titulo"));
            painel.Add(U.Texto("tradicional do muquifão", "subtitulo"));
            painel.Add(U.Texto("2 a 8 jogadores  ·  7 rodadas  ·  menos pontos ganha", "fatos"));

            painel.Add(U.Texto("Seu nome", "rotulo"));
            nome = new TextField { maxLength = 16, value = PlayerPrefs.GetString("cacamba-nome", "") };
            nome.AddToClassList("campo");
            painel.Add(nome);

            painel.Add(U.Texto("Seu personagem", "rotulo"));
            var elenco = U.Div("elenco");
            foreach (var p in Elenco.Todos)
            {
                var img = U.Imagem(Resources.Load<Texture2D>($"Personagens/{p.Slug}-avatar"), "avatar");
                string slug = p.Slug;
                img.RegisterCallback<ClickEvent>(_ => Escolhe(slug));
                img.tooltip = p.Nome;
                avatares[p.Slug] = img;
                elenco.Add(img);
            }
            painel.Add(elenco);
            tracoDoPersonagem = U.Texto("", "nota", "centro");
            painel.Add(tracoDoPersonagem);

            if (mostrarServidor)
            {
                painel.Add(U.Texto("Servidor", "rotulo"));
                servidor = new TextField { value = servidorAtual };
                servidor.AddToClassList("campo");
                servidor.RegisterCallback<FocusOutEvent>(_ => AoTrocarServidor?.Invoke(servidor.value));
                painel.Add(servidor);
            }

            criar = U.Botao("Criar sala", () => { Guarda(); AoCriar?.Invoke(Nome, escolhido); }, "botao-principal");
            criar.style.marginTop = 16;
            painel.Add(criar);

            // Primeira vez: uma rodada guiada contra um robô, e as regras à mão.
            var aprendizado = U.Div("linha");
            aprender = U.Botao("Aprender a jogar", () => { Guarda(); AoTutorial?.Invoke(Nome, escolhido); }, "botao-tutorial");
            aprender.style.flexGrow = 1;
            aprendizado.Add(aprender);
            var regras = U.Botao("Regras", () => AoRegras?.Invoke());
            aprendizado.Add(regras);
            painel.Add(aprendizado);
            if (PlayerPrefs.GetInt("cacamba-tutorial-feito", 0) == 0)
                painel.Add(U.Texto("Primeira vez? O tutorial é uma rodada curta contra um robô, com dica a cada passo.", "nota", "centro"));

            var linha = U.Div("linha");
            codigo = new TextField { maxLength = 4 };
            codigo.AddToClassList("campo");
            codigo.AddToClassList("campo-codigo");
            codigo.style.flexGrow = 1;
            codigo.RegisterValueChangedCallback(e =>
            {
                string limpo = (e.newValue ?? "").ToUpperInvariant();
                if (limpo != e.newValue) codigo.SetValueWithoutNotify(limpo);
            });
            linha.Add(codigo);
            entrar = U.Botao("Entrar", () => { Guarda(); AoEntrar?.Invoke(codigo.value, Nome, escolhido); });
            linha.Add(entrar);
            painel.Add(U.Texto("Tem um código? Entre na sala:", "rotulo"));
            painel.Add(linha);

            estado = U.Texto("", "nota", "centro");
            estado.style.marginTop = 10;
            painel.Add(estado);

            string guardado = PlayerPrefs.GetString("cacamba-personagem", "");
            Escolhe(Elenco.De(guardado) != null ? guardado : Elenco.Todos[UnityEngine.Random.Range(0, Elenco.Todos.Count)].Slug);
        }

        void Escolhe(string slug)
        {
            escolhido = slug;
            foreach (var kv in avatares) kv.Value.EnableInClassList("avatar-escolhido", kv.Key == slug);
            var p = Elenco.De(slug);
            tracoDoPersonagem.text = p != null ? $"{p.Nome} — {p.Traco}" : "";
        }

        void Guarda()
        {
            PlayerPrefs.SetString("cacamba-nome", Nome);
            PlayerPrefs.SetString("cacamba-personagem", escolhido ?? "");
            PlayerPrefs.Save();
            if (servidor != null) AoTrocarServidor?.Invoke(servidor.value);
        }

        public void DefineCodigo(string c)
        {
            if (!string.IsNullOrEmpty(c)) codigo.value = c.ToUpperInvariant();
        }

        public void DefineEstado(string texto, bool online)
        {
            estado.text = texto;
            criar.SetEnabled(online);
            entrar.SetEnabled(online);
            aprender.SetEnabled(online);
        }
    }
}
