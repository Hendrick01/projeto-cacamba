using System;
using UnityEngine;
using UnityEngine.UIElements;

namespace Cacamba.Interface
{
    /// <summary>Atalhos para montar a interface por código (UI Toolkit).</summary>
    public static class U
    {
        public static Font FonteTexto, FonteTitulo;

        public static void CarregaFontes()
        {
            FonteTexto = Resources.Load<Font>("Fontes/Nunito-ExtraBold");
            FonteTitulo = Resources.Load<Font>("Fontes/PaytoneOne");
        }

        public static VisualElement Div(params string[] classes)
        {
            var e = new VisualElement();
            foreach (var c in classes) if (!string.IsNullOrEmpty(c)) e.AddToClassList(c);
            return e;
        }

        public static Label Texto(string texto, params string[] classes)
        {
            var l = new Label(texto);
            foreach (var c in classes) if (!string.IsNullOrEmpty(c)) l.AddToClassList(c);
            return l;
        }

        /// <summary>Texto na fonte de título (Paytone One), como o letreiro do site.</summary>
        public static Label Titulo(string texto, params string[] classes)
        {
            var l = Texto(texto, classes);
            if (FonteTitulo != null) l.style.unityFontDefinition = FontDefinition.FromFont(FonteTitulo);
            return l;
        }

        public static Button Botao(string texto, Action acao, params string[] classes)
        {
            // todo botão do jogo responde com um clique baixinho antes de agir
            var b = new Button(() => { Efeitos.Sons.Toca(Efeitos.Som.Clique); acao?.Invoke(); }) { text = texto };
            b.AddToClassList("botao");
            foreach (var c in classes) if (!string.IsNullOrEmpty(c)) b.AddToClassList(c);
            return b;
        }

        public static Image Imagem(Texture tex, params string[] classes)
        {
            var i = new Image { image = tex, scaleMode = ScaleMode.ScaleToFit };
            foreach (var c in classes) if (!string.IsNullOrEmpty(c)) i.AddToClassList(c);
            return i;
        }

        /// <summary>
        /// Uma carta. A textura é importada em potência de 2 (256×512, para
        /// comprimir), então ela é esticada para ocupar o elemento — que já tem a
        /// proporção de carta. Com "ajustar" ela sairia espremida.
        /// </summary>
        public static Image Carta(Texture tex, params string[] classes)
        {
            var i = Imagem(tex, classes);
            i.scaleMode = ScaleMode.StretchToFill;
            return i;
        }

        /// <summary>Deixa o toque atravessar (para a mesa 3D) este elemento e os de dentro.</summary>
        public static T Transparente<T>(T e) where T : VisualElement
        {
            e.pickingMode = PickingMode.Ignore;
            foreach (var filho in e.Children()) Transparente(filho);
            return e;
        }

        public static void Mostra(VisualElement e, bool sim)
        {
            e.style.display = sim ? DisplayStyle.Flex : DisplayStyle.None;
        }

        public static Texture2D ImagemDeDataUrl(string dataUrl)
        {
            if (string.IsNullOrEmpty(dataUrl)) return null;
            int virgula = dataUrl.IndexOf(',');
            if (virgula < 0) return null;
            try
            {
                var bytes = Convert.FromBase64String(dataUrl.Substring(virgula + 1));
                var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point };
                return tex.LoadImage(bytes) ? tex : null;
            }
            catch (Exception) { return null; }
        }
    }
}
