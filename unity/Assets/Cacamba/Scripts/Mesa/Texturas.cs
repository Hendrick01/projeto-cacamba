using System.Collections.Generic;
using Cacamba.Modelo;
using UnityEngine;

namespace Cacamba.Mesa
{
    /// <summary>
    /// Texturas e materiais da mesa. As cartas vêm de Resources/Cartas (a mesma
    /// arte do site, convertida por scripts/unity_assets.py). Feltro, madeira e
    /// ladrilho são gerados aqui, como no site: nada de textura baixada.
    ///
    /// Os materiais-base ficam em Resources/Materiais e são criados pelo
    /// Editor/ConfiguraProjeto.cs. Partir de um material salvo (e não de
    /// Shader.Find) é o que garante que o shader e as variantes certas entrem
    /// na build de celular e de WebGL.
    /// </summary>
    public static class Texturas
    {
        static readonly Dictionary<string, Texture2D> cartas = new Dictionary<string, Texture2D>();
        static readonly Dictionary<string, Material> materiaisCarta = new Dictionary<string, Material>();
        static readonly Dictionary<string, Material> materiais = new Dictionary<string, Material>();

        public static Texture2D Carta(string arte)
        {
            if (cartas.TryGetValue(arte, out var t) && t != null) return t;
            t = Resources.Load<Texture2D>("Cartas/" + arte);
            cartas[arte] = t;
            return t;
        }

        public static Texture2D Carta(Carta c) => Carta(Regras.Arte(c));

        public static Texture2D Verso => Carta("verso");

        public static Material Base(string nome)
        {
            if (materiais.TryGetValue(nome, out var m) && m != null) return m;
            m = Resources.Load<Material>("Materiais/" + nome);
            if (m == null)
            {
                // Sem o material salvo (projeto ainda não configurado): serve no
                // editor, mas numa build o shader pode ter sido removido.
                var shader = Shader.Find("Universal Render Pipeline/Simple Lit") ?? Shader.Find("Universal Render Pipeline/Lit");
                m = new Material(shader) { name = nome };
            }
            materiais[nome] = m;
            return m;
        }

        public static Material Novo(string baseNome, Color cor, Texture tex = null, Vector2? repete = null)
        {
            var m = new Material(Base(baseNome));
            DefineCor(m, cor);
            if (tex != null) DefineTextura(m, tex, repete ?? Vector2.one);
            return m;
        }

        public static void DefineCor(Material m, Color cor)
        {
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", cor);
            if (m.HasProperty("_Color")) m.SetColor("_Color", cor);
        }

        public static void DefineTextura(Material m, Texture tex, Vector2 repete)
        {
            if (m.HasProperty("_BaseMap")) { m.SetTexture("_BaseMap", tex); m.SetTextureScale("_BaseMap", repete); }
            if (m.HasProperty("_MainTex")) { m.SetTexture("_MainTex", tex); m.SetTextureScale("_MainTex", repete); }
        }

        /// <summary>Material da face de uma carta (um por arte, compartilhado).</summary>
        public static Material MaterialDaCarta(string arte)
        {
            if (materiaisCarta.TryGetValue(arte, out var m) && m != null) return m;
            m = new Material(Base("Carta")) { name = "Carta " + arte };
            var tex = Carta(arte);
            if (tex != null) DefineTextura(m, tex, Vector2.one);
            materiaisCarta[arte] = m;
            return m;
        }

        public static Material MaterialDaCarta(Carta c) => MaterialDaCarta(Regras.Arte(c));

        static readonly Dictionary<string, Material> materiaisDeModelo = new Dictionary<string, Material>();

        /// <summary>
        /// O material de um modelo 3D (personagem, copo, pod). Os .glb do app vêm
        /// sem imagem embutida (scripts/unity_assets.py): a textura de cor fica em
        /// Resources/TexturasModelos/&lt;nome&gt;, comprimida pelo Unity para cada
        /// plataforma. O material é o fosco do elenco, iluminado pela mesma luz
        /// das cartas — sem o "metal = 1" que o glTF assume quando não diz nada.
        /// </summary>
        public static Material MaterialDoModelo(string nome)
        {
            if (materiaisDeModelo.TryGetValue(nome, out var m) && m != null) return m;
            m = new Material(Base("Personagem")) { name = "Modelo " + nome };
            var tex = Resources.Load<Texture2D>("TexturasModelos/" + nome);
            if (tex != null) DefineTextura(m, tex, Vector2.one);
            materiaisDeModelo[nome] = m;
            return m;
        }

        /// <summary>Troca todos os materiais do objeto pelo material do modelo.</summary>
        public static void VesteModelo(GameObject go, string nome)
        {
            var m = MaterialDoModelo(nome);
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                var arr = new Material[r.sharedMaterials.Length];
                for (int i = 0; i < arr.Length; i++) arr[i] = m;
                r.sharedMaterials = arr;
            }
        }

        // ------------------------------------------------------------ geradas

        static uint semente = 7;
        static float Ruido() { semente = semente * 1664525u + 1013904223u; return semente / 4294967296f; }

        /// <summary>O grão do feltro: um chuvisco fino de claro e escuro.</summary>
        public static Texture2D Feltro()
        {
            const int n = 256;
            var t = new Texture2D(n, n, TextureFormat.RGBA32, true) { name = "feltro", wrapMode = TextureWrapMode.Repeat };
            var px = new Color32[n * n];
            for (int i = 0; i < px.Length; i++)
            {
                byte v = (byte)(200 + (Ruido() - 0.5f) * 70f);
                px[i] = new Color32(v, v, v, 255);
            }
            t.SetPixels32(px);
            t.Apply(true);
            return t;
        }

        /// <summary>Veio de madeira: faixas que ondulam e mudam de tom.</summary>
        public static Texture2D Madeira()
        {
            const int w = 256, h = 256;
            var t = new Texture2D(w, h, TextureFormat.RGBA32, true) { name = "madeira", wrapMode = TextureWrapMode.Repeat };
            var px = new Color32[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float onda = Mathf.Sin((x * 0.045f) + Mathf.Sin(y * 0.031f) * 2.2f) * 0.5f + 0.5f;
                    float fio = Mathf.PerlinNoise(x * 0.02f, y * 0.35f);
                    float v = 0.62f + onda * 0.22f + fio * 0.16f + (Ruido() - 0.5f) * 0.05f;
                    byte b = (byte)Mathf.Clamp(v * 255f, 0, 255);
                    px[y * w + x] = new Color32(b, b, b, 255);
                }
            t.SetPixels32(px);
            t.Apply(true);
            return t;
        }

        /// <summary>Ladrilho do chão do boteco: xadrez em dois tons quentes, com rejunte.</summary>
        public static Texture2D Ladrilho()
        {
            const int n = 256, casas = 4;
            int lado = n / casas;
            var a = new Color(0.55f, 0.42f, 0.31f);
            var b = new Color(0.86f, 0.79f, 0.66f);
            var rejunte = new Color(0.25f, 0.2f, 0.16f);
            var t = new Texture2D(n, n, TextureFormat.RGBA32, true) { name = "ladrilho", wrapMode = TextureWrapMode.Repeat };
            var px = new Color[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    int cx = x / lado, cy = y / lado;
                    bool borda = x % lado < 2 || y % lado < 2;
                    var c = borda ? rejunte : ((cx + cy) % 2 == 0 ? a : b);
                    float g = 1f + (Ruido() - 0.5f) * 0.06f;
                    px[y * n + x] = new Color(c.r * g, c.g * g, c.b * g, 1f);
                }
            t.SetPixels(px);
            t.Apply(true);
            return t;
        }

        /// <summary>Disco suave para sombra de contato e para o anel da vez.</summary>
        public static Texture2D Disco(bool anel)
        {
            const int n = 128;
            var t = new Texture2D(n, n, TextureFormat.RGBA32, false) { name = anel ? "anel" : "sombra", wrapMode = TextureWrapMode.Clamp };
            var px = new Color[n * n];
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float d = new Vector2(x - n / 2f + 0.5f, y - n / 2f + 0.5f).magnitude / (n / 2f);
                    float alfa;
                    if (anel) alfa = Mathf.Clamp01(1f - Mathf.Abs(d - 0.78f) / 0.16f);
                    else alfa = Mathf.Clamp01(1f - d) * Mathf.Clamp01(1f - d) * 0.55f;
                    px[y * n + x] = new Color(1f, 1f, 1f, alfa);
                }
            t.SetPixels(px);
            t.Apply(false);
            return t;
        }
    }
}
