using System;
using System.Collections.Generic;
using System.Linq;
using Cacamba.Efeitos;
using Cacamba.Modelo;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Cacamba.Mesa
{
    /// <summary>
    /// Onde uma carta da SUA mão está na tela. A mão é da interface (2D, por cima
    /// da mesa); a mesa usa isto para a carta 3D sair exatamente de onde a carta
    /// da interface estava, ou chegar onde ela vai aparecer.
    /// </summary>
    public struct LugarNaTela
    {
        public Vector2 Centro;   // pixels da tela, com o y crescendo para CIMA (o do Unity)
        public float Altura;     // altura da carta, em pixels da tela
        public float Giro;       // graus, horário positivo (o `rotate` da interface)
    }

    /// <summary>O que a carta arrastada tem embaixo dela, na mesa.</summary>
    public struct AlvoDoArrasto
    {
        public enum Tipo { Nada, Descarte, Jogo, Feltro }
        public Tipo Qual;
        public int JogoId;
        public string DonoId;
    }

    /// <summary>
    /// O que a interface sabe do lance que acabou de chegar, e a mesa precisa
    /// para animar: os eventos do servidor e onde as cartas da sua mão estavam
    /// e estão.
    /// </summary>
    public sealed class Lance
    {
        public JArray Eventos = new JArray();
        /// <summary>Sem estado anterior (acabou de entrar, voltou de uma queda): nada voa.</summary>
        public bool Primeira;
        /// <summary>Onde cada carta da sua mão estava ANTES deste lance.</summary>
        public Dictionary<int, LugarNaTela> MaoAntes;
        /// <summary>Onde uma carta da sua mão está AGORA — lido a cada quadro, porque a mão se rearruma.</summary>
        public Func<int, LugarNaTela?> MaoAgora;
        /// <summary>Cartas novas na sua mão, na ordem em que aparecem; a interface as esconde até pousarem.</summary>
        public List<int> Chegaram;
        /// <summary>A carta pousou na sua mão: a interface pode mostrá-la.</summary>
        public Action<int> AoPousarNaMao;
    }

    /// <summary>
    /// A mesa 3D do Caçamba — a mesma geometria da mesa do site (public/mesa3d.js):
    /// tampo a 0,76 m, feltro de raio 1,15 m, cadeiras a 1,34 m do centro (a roda
    /// abre para 78 cm entre vizinhos quando a mesa enche), você na câmera e os
    /// adversários no arco do outro lado, de frente para você.
    ///
    /// Eixos: o centro da mesa é a origem; a câmera fica do lado −Z olhando para
    /// +Z, então +X é a direita da tela. Um personagem na roda está em
    /// (r·sen a, 0, r·cos a), virado para o centro.
    ///
    /// Tudo é montado por código: a cena do projeto só tem o objeto que liga o jogo.
    /// </summary>
    public sealed class Mesa3D : MonoBehaviour
    {
        public const float TopoMesa = 0.76f;
        public const float RaioFeltro = 1.15f;
        const float RaioAssentoMin = 1.34f;
        const float CartaL = 0.20f, CartaA = 0.281f;     // carta do monte e do descarte
        const float Inclinacao = 0.34f, AnelLonge = 0.78f;
        // Monte e descarte um palmo para trás do centro: abre a faixa da frente
        // para os SEUS jogos, logo acima da mão.
        const float ZDasPilhas = 0.12f;

        /// <summary>
        /// Quanto da tela (0–1, de baixo para cima) a sua mão ocupa. Quem sabe é a
        /// interface; a mesa usa para pôr os seus jogos logo acima dela.
        /// </summary>
        public float AlturaDaMao01 = 0.27f;

        public Camera Camera { get; private set; }

        public event Action AoTocarMonte;
        public event Action AoTocarDescarte;
        public event Action<string> AoTocarJogador;       // id de quem teve o lugar/jogos tocados

        /// <summary>Quem decide se o toque caiu na interface (e não na mesa).</summary>
        public Func<Vector2, bool> ToqueNaInterface;

        Transform raiz, jogosRaiz, descarteRaiz;
        Transform monte, monteTopo;
        GameObject descarteTopo, descarteDeBaixo, descartePilha, anelVez, realceDescarte;
        // o que o treinador do tutorial manda olhar
        GameObject acesoMonte, acesoMeio, acesoFeltro;
        int jogoAceso = -1;
        Material matMadeira, matEstofado, matVerso, matBordaCarta, matAnel, matSombra, matRealceFraco, matRealceForte;
        readonly Dictionary<string, Assento3D> assentos = new Dictionary<string, Assento3D>();
        readonly Dictionary<string, Vector3> centroDosJogos = new Dictionary<string, Vector3>();
        int topoDescarteId = int.MinValue;
        int descarteQuantas;

        // Cada carta dos jogos baixados, pelo id: é o que deixa uma carta que
        // muda de lugar DESLIZAR até o lugar novo em vez de piscar, e é de onde
        // sai a carta que alguém leva da mesa para a mão.
        readonly Dictionary<int, Transform> cartasNaMesa = new Dictionary<int, Transform>();
        readonly Dictionary<int, Renderer> realces = new Dictionary<int, Renderer>();   // id do jogo → brilho embaixo dele

        // Um ponto de onde vem ou para onde vai uma carta: posição, giro e tamanho.
        struct Pouso
        {
            public Vector3 Pos;
            public Quaternion Giro;
            public Vector3 Escala;

            public static Pouso De(Transform t) => new Pouso { Pos = t.position, Giro = t.rotation, Escala = t.localScale };

            public void Aplica(Transform t)
            {
                t.position = Pos;
                t.rotation = Giro;
                t.localScale = Escala;
            }
        }

        // Uma carta indo de um pouso a outro, com aceleração suave e um arco —
        // o `voa` de public/mesa3d.js. É o que anima puxar, descartar, baixar e
        // distribuir; sem isso a mesa trocava de estado num piscar.
        sealed class Voo
        {
            public Transform T;
            public Pouso De, Para;
            public Func<Pouso?> ParaVivo;   // destino que se mexe (a sua mão, presa à tela)
            public float Inicio, Dur, Arco;
            public bool Comecou, Destroi, SomAoPousar, Mudo;
            public Action AoFim;
        }
        readonly List<Voo> voos = new List<Voo>();

        Visao visao;
        string meuId;
        bool emPartida;
        float orbita;
        Vector3 alvoCamera, posCamera;
        float fovAlvo = 55f;
        int quantosOutros;

        // ------------------------------------------------------------- montagem

        public void Montar()
        {
            raiz = new GameObject("Boteco").transform;
            raiz.SetParent(transform, false);

            matMadeira = Texturas.Novo("Madeira", new Color(0.36f, 0.23f, 0.14f), Texturas.Madeira(), new Vector2(2, 1));
            matEstofado = Texturas.Novo("Madeira", new Color(0.45f, 0.16f, 0.12f));
            matVerso = Texturas.MaterialDaCarta("verso");
            matBordaCarta = Texturas.Novo("Madeira", new Color(0.93f, 0.9f, 0.82f));
            matAnel = Texturas.Novo("Brilho", new Color(0.95f, 0.75f, 0.3f, 0.85f), Texturas.Disco(true));
            matSombra = Texturas.Novo("Brilho", new Color(0, 0, 0, 0.6f), Texturas.Disco(false));
            // o brilho embaixo de um jogo onde a carta arrastada cabe (fraco) e do que está sob o dedo (forte)
            matRealceFraco = Texturas.Novo("Brilho", new Color(1f, 0.82f, 0.35f, 0.75f), Texturas.Disco(false));
            matRealceForte = Texturas.Novo("Brilho", new Color(0.62f, 1f, 0.75f, 1f), Texturas.Disco(false));

            MontaCamera();
            MontaLuz();
            MontaSala();
            MontaMesa();
            MontaMonteEDescarte();

            jogosRaiz = new GameObject("Jogos na mesa").transform;
            jogosRaiz.SetParent(raiz, false);

            anelVez = Plano("Anel da vez", matAnel, 0.62f, 0.62f);
            anelVez.transform.SetParent(raiz, false);
            anelVez.SetActive(false);

            // o anel que acende em volta do descarte quando a carta arrastada pode cair ali
            realceDescarte = Plano("Realce do descarte", Texturas.Novo("Brilho", new Color(0.62f, 1f, 0.75f, 0.95f), Texturas.Disco(true)), 0.5f, 0.5f);
            realceDescarte.transform.SetParent(raiz, false);
            realceDescarte.transform.position = new Vector3(0.2f, TopoMesa + 0.004f, ZDasPilhas);
            realceDescarte.SetActive(false);

            // o tutorial: anéis dourados que pulsam no monte e no meio, e um
            // brilho no feltro onde os seus jogos descem
            var matAceso = Texturas.Novo("Brilho", new Color(1f, 0.84f, 0.32f, 0.95f), Texturas.Disco(true));
            acesoMonte = Plano("Treinador: monte", matAceso, 0.56f, 0.56f);
            acesoMonte.transform.SetParent(raiz, false);
            acesoMonte.transform.position = new Vector3(-0.2f, TopoMesa + 0.005f, ZDasPilhas);
            acesoMonte.SetActive(false);
            acesoMeio = Plano("Treinador: meio", matAceso, 0.56f, 0.56f);
            acesoMeio.transform.SetParent(raiz, false);
            acesoMeio.transform.position = new Vector3(0.2f, TopoMesa + 0.005f, ZDasPilhas);
            acesoMeio.SetActive(false);
            acesoFeltro = Plano("Treinador: feltro", Texturas.Novo("Brilho", new Color(0.55f, 1f, 0.7f, 0.6f), Texturas.Disco(false)), 0.95f, 0.36f);
            acesoFeltro.transform.SetParent(raiz, false);
            acesoFeltro.SetActive(false);

            posCamera = Camera.transform.position;
        }

        void MontaCamera()
        {
            var go = new GameObject("Câmera");
            go.transform.SetParent(transform, false);
            Camera = go.AddComponent<Camera>();
            Camera.clearFlags = CameraClearFlags.SolidColor;
            Camera.backgroundColor = new Color(0.09f, 0.063f, 0.039f);
            Camera.nearClipPlane = 0.05f;
            Camera.farClipPlane = 40f;
            Camera.fieldOfView = 55f;
            go.tag = "MainCamera";
            go.AddComponent<AudioListener>();
            Camera.transform.position = new Vector3(0, 1.7f, -2.6f);
            Camera.transform.LookAt(new Vector3(0, TopoMesa, 0));
        }

        void MontaLuz()
        {
            // A lâmpada sobre a mesa manda: luz quente quase a pino, com sombra.
            var sol = new GameObject("Lâmpada (sombra)").AddComponent<Light>();
            sol.transform.SetParent(raiz, false);
            sol.type = LightType.Directional;
            sol.color = new Color(1f, 0.87f, 0.7f);
            sol.intensity = 1.15f;
            // Sombra em todas as plataformas. (O "Mismatch between texture format
            // and sampler type" do WebGL, que deixava a mesa preta, vinha do
            // renderizador Forward+ — ver Assets/Settings/Mobile_Renderer.asset.)
            sol.shadows = LightShadows.Soft;
            sol.shadowStrength = 0.75f;
            sol.transform.rotation = Quaternion.Euler(72f, 25f, 0f);

            var foco = new GameObject("Lâmpada (brilho)").AddComponent<Light>();
            foco.transform.SetParent(raiz, false);
            foco.type = LightType.Point;
            foco.color = new Color(1f, 0.78f, 0.5f);
            foco.intensity = 2.2f;
            foco.range = 4.5f;
            foco.shadows = LightShadows.None;
            foco.transform.position = new Vector3(0, 1.95f, 0);

            // A penumbra do salão é neblina: o que está longe some no escuro.
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.26f, 0.22f, 0.19f);
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.ExponentialSquared;
            RenderSettings.fogColor = new Color(0.12f, 0.1f, 0.08f);
            RenderSettings.fogDensity = 0.11f;
        }

        void MontaSala()
        {
            var chao = GameObject.CreatePrimitive(PrimitiveType.Plane);
            chao.name = "Chão";
            chao.transform.SetParent(raiz, false);
            chao.transform.localScale = new Vector3(1.4f, 1, 1.4f);
            chao.GetComponent<Renderer>().sharedMaterial = Texturas.Novo("Chao", Color.white, Texturas.Ladrilho(), new Vector2(7, 7));
            Destroy(chao.GetComponent<Collider>());

            var matParede = Texturas.Novo("Parede", new Color(0.55f, 0.36f, 0.24f));
            var matLambri = Texturas.Novo("Madeira", new Color(0.3f, 0.18f, 0.1f), Texturas.Madeira(), new Vector2(6, 1));
            const float meio = 5f, altura = 3.2f;
            for (int i = 0; i < 4; i++)
            {
                var lado = new GameObject("Parede " + i).transform;
                lado.SetParent(raiz, false);
                lado.rotation = Quaternion.Euler(0, i * 90f, 0);
                lado.position = lado.rotation * new Vector3(0, 0, meio);
                Caixa("Reboco", lado, new Vector3(0, altura / 2, 0), new Vector3(meio * 2, altura, 0.1f), matParede);
                Caixa("Lambri", lado, new Vector3(0, 0.55f, -0.06f), new Vector3(meio * 2, 1.1f, 0.04f), matLambri);
                Caixa("Friso", lado, new Vector3(0, 1.12f, -0.08f), new Vector3(meio * 2, 0.05f, 0.06f), matMadeira);
            }

            // O balcão e as prateleiras no fundo, de frente para quem está na câmera.
            var fundo = new GameObject("Balcão").transform;
            fundo.SetParent(raiz, false);
            fundo.position = new Vector3(0, 0, meio - 0.6f);
            Caixa("Balcão", fundo, new Vector3(0, 0.55f, 0), new Vector3(3.2f, 1.1f, 0.6f), matLambri);
            Caixa("Tampo do balcão", fundo, new Vector3(0, 1.12f, 0), new Vector3(3.3f, 0.05f, 0.7f), matMadeira);
            for (int i = 0; i < 3; i++)
                Caixa("Prateleira", fundo, new Vector3(0, 1.6f + i * 0.42f, 0.45f), new Vector3(2.6f, 0.04f, 0.28f), matMadeira);
            var cores = new[] { new Color(0.2f, 0.42f, 0.25f), new Color(0.55f, 0.3f, 0.1f), new Color(0.75f, 0.68f, 0.5f), new Color(0.35f, 0.12f, 0.12f) };
            var rnd = new System.Random(5);
            for (int p = 0; p < 3; p++)
                for (int i = 0; i < 9; i++)
                {
                    var mat = Texturas.Novo("Parede", cores[rnd.Next(cores.Length)]);
                    float h = 0.22f + (float)rnd.NextDouble() * 0.12f;
                    var garrafa = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    garrafa.name = "Garrafa";
                    garrafa.transform.SetParent(fundo, false);
                    garrafa.transform.localPosition = new Vector3(-1.15f + i * 0.29f, 1.62f + p * 0.42f + h / 2, 0.45f);
                    garrafa.transform.localScale = new Vector3(0.08f, h / 2, 0.08f);
                    garrafa.GetComponent<Renderer>().sharedMaterial = mat;
                    Destroy(garrafa.GetComponent<Collider>());
                }

            // A lâmpada pendurada: fio, cúpula e o bulbo aceso.
            var matMetal = Texturas.Novo("Parede", new Color(0.12f, 0.22f, 0.16f));
            var fio = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            fio.transform.SetParent(raiz, false);
            fio.transform.position = new Vector3(0, 2.75f, 0);
            fio.transform.localScale = new Vector3(0.012f, 0.45f, 0.012f);
            fio.GetComponent<Renderer>().sharedMaterial = matMetal;
            Destroy(fio.GetComponent<Collider>());
            var cupula = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            cupula.transform.SetParent(raiz, false);
            cupula.transform.position = new Vector3(0, 2.25f, 0);
            cupula.transform.localScale = new Vector3(0.55f, 0.2f, 0.55f);
            cupula.GetComponent<Renderer>().sharedMaterial = matMetal;
            cupula.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Destroy(cupula.GetComponent<Collider>());
            var bulbo = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            bulbo.transform.SetParent(raiz, false);
            bulbo.transform.position = new Vector3(0, 2.16f, 0);
            bulbo.transform.localScale = Vector3.one * 0.12f;
            bulbo.GetComponent<Renderer>().sharedMaterial = Texturas.Novo("Brilho", new Color(1f, 0.92f, 0.7f, 1f));
            bulbo.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Destroy(bulbo.GetComponent<Collider>());
        }

        void MontaMesa()
        {
            var mesa = new GameObject("Mesa").transform;
            mesa.SetParent(raiz, false);
            var feltro = Texturas.Novo("Feltro", new Color(0.09f, 0.33f, 0.24f), Texturas.Feltro(), new Vector2(6, 6));
            Cilindro("Feltro", mesa, new Vector3(0, TopoMesa - 0.01f, 0), RaioFeltro, 0.02f, feltro);
            Cilindro("Aro", mesa, new Vector3(0, TopoMesa - 0.025f, 0), RaioFeltro + 0.07f, 0.045f, matMadeira);
            Cilindro("Saia", mesa, new Vector3(0, TopoMesa - 0.09f, 0), RaioFeltro - 0.05f, 0.1f, matMadeira);
            Cilindro("Pé", mesa, new Vector3(0, (TopoMesa - 0.14f) / 2, 0), 0.11f, TopoMesa - 0.14f, matMadeira);
            Cilindro("Base", mesa, new Vector3(0, 0.025f, 0), 0.5f, 0.05f, matMadeira);

            // O copo e o pod da casa, nas laterais do seu lado da mesa: servem de
            // escala para as cartas sem ficar na frente de quem está sentado.
            Enfeite("copo", new Vector3(-0.93f, TopoMesa, -0.18f), 140f);
            Enfeite("pod", new Vector3(0.95f, TopoMesa, -0.12f), -30f);
        }

        void Enfeite(string nome, Vector3 pos, float giro)
        {
            var prefab = Resources.Load<GameObject>("Modelos/" + nome);
            if (prefab == null) return;
            var go = Instantiate(prefab, raiz);
            go.name = nome;
            Texturas.VesteModelo(go, nome);
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(0, giro, 0);
            foreach (var c in go.GetComponentsInChildren<Collider>()) Destroy(c);
        }

        void MontaMonteEDescarte()
        {
            monte = new GameObject("Monte").transform;
            monte.SetParent(raiz, false);
            monte.position = new Vector3(-0.2f, TopoMesa, ZDasPilhas);
            var lado = GameObject.CreatePrimitive(PrimitiveType.Cube);
            lado.name = "Pilha";
            lado.transform.SetParent(monte, false);
            lado.GetComponent<Renderer>().sharedMaterial = matBordaCarta;
            var colMonte = lado.GetComponent<BoxCollider>();
            colMonte.size = new Vector3(1.3f, 3f, 1.3f);
            lado.AddComponent<Alvo>().Tipo = Alvo.Qual.Monte;
            monteTopo = Plano("Verso", matVerso, CartaL, CartaA).transform;
            monteTopo.SetParent(monte, false);
            DefineAlturaDoMonte(40);

            descarteRaiz = new GameObject("Descarte").transform;
            descarteRaiz.SetParent(raiz, false);
            descarteRaiz.position = new Vector3(0.2f, TopoMesa, ZDasPilhas);
            var alvo = new GameObject("Alvo do descarte");
            alvo.transform.SetParent(descarteRaiz, false);
            var col = alvo.AddComponent<BoxCollider>();
            col.size = new Vector3(CartaL * 1.3f, 0.1f, CartaA * 1.3f);
            alvo.AddComponent<Alvo>().Tipo = Alvo.Qual.Descarte;
            descartePilha = GameObject.CreatePrimitive(PrimitiveType.Cube);
            descartePilha.name = "Pilha do descarte";
            Destroy(descartePilha.GetComponent<Collider>());
            descartePilha.transform.SetParent(descarteRaiz, false);
            descartePilha.GetComponent<Renderer>().sharedMaterial = matBordaCarta;

            var s1 = Plano("Sombra do monte", matSombra, 0.34f, 0.42f);
            s1.transform.SetParent(raiz, false);
            s1.transform.position = new Vector3(-0.2f, TopoMesa + 0.002f, ZDasPilhas);
            var s2 = Plano("Sombra do descarte", matSombra, 0.34f, 0.42f);
            s2.transform.SetParent(raiz, false);
            s2.transform.position = new Vector3(0.2f, TopoMesa + 0.002f, ZDasPilhas);
        }

        void DefineAlturaDoMonte(int cartas)
        {
            float h = Mathf.Clamp(0.004f + cartas * 0.0007f, 0.004f, 0.1f);
            var pilha = monte.Find("Pilha");
            pilha.localScale = new Vector3(CartaL * 0.98f, h, CartaA * 0.98f);
            pilha.localPosition = new Vector3(0, h / 2, 0);
            monteTopo.localPosition = new Vector3(0, h + 0.0015f, 0);
            monte.gameObject.SetActive(cartas > 0);
        }

        // ---------------------------------------------------------- primitivas

        static GameObject Plano(string nome, Material m, float largura, float profundidade)
        {
            // O retângulo mostra a face −Z; deitado (90° em X) ela olha para cima
            // e o "alto" da textura aponta para +Z, longe da câmera.
            var q = new GameObject(nome);
            q.transform.localRotation = Quaternion.Euler(90f, 0, 0);
            q.transform.localScale = new Vector3(largura, profundidade, 1);
            q.AddComponent<MeshFilter>().sharedMesh = MalhaDaCarta();
            var r = q.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return q;
        }

        static void Caixa(string nome, Transform pai, Vector3 pos, Vector3 tamanho, Material m)
        {
            var c = GameObject.CreatePrimitive(PrimitiveType.Cube);
            c.name = nome;
            c.transform.SetParent(pai, false);
            c.transform.localPosition = pos;
            c.transform.localScale = tamanho;
            c.GetComponent<Renderer>().sharedMaterial = m;
            Destroy(c.GetComponent<Collider>());
        }

        static void Cilindro(string nome, Transform pai, Vector3 pos, float raio, float altura, Material m)
        {
            var c = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            c.name = nome;
            c.transform.SetParent(pai, false);
            c.transform.localPosition = pos;
            c.transform.localScale = new Vector3(raio * 2, altura / 2, raio * 2);
            c.GetComponent<Renderer>().sharedMaterial = m;
            Destroy(c.GetComponent<Collider>());
        }

        static Mesh malhaDaCarta;

        /// <summary>
        /// O mesmo retângulo do Quad do Unity (1×1, face para −Z), feito à mão:
        /// sem colisor para apagar a cada carta criada, e são dezenas por lance.
        /// </summary>
        static Mesh MalhaDaCarta()
        {
            if (malhaDaCarta != null) return malhaDaCarta;
            malhaDaCarta = new Mesh { name = "carta" };
            malhaDaCarta.vertices = new[]
            {
                new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0),
                new Vector3(-0.5f, 0.5f, 0), new Vector3(0.5f, 0.5f, 0),
            };
            malhaDaCarta.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1) };
            malhaDaCarta.normals = new[] { Vector3.back, Vector3.back, Vector3.back, Vector3.back };
            malhaDaCarta.triangles = new[] { 0, 3, 1, 3, 0, 2 };
            malhaDaCarta.RecalculateBounds();
            return malhaDaCarta;
        }

        /// <summary>
        /// Uma carta com frente e verso. A frente se vê pelo lado −Z dela e o
        /// verso pelo +Z, então o mesmo objeto serve deitado no feltro, de pé na
        /// mão de alguém e virando no ar entre um e outro. Sem a carta (`c` nulo),
        /// os dois lados são verso: a carta que um adversário puxa do monte.
        /// </summary>
        GameObject CartaDuasFaces(Carta c, float largura, float altura)
        {
            var go = new GameObject(c != null ? Regras.NomeCurto(c) : "carta virada");
            Face(go.transform, "Frente", c != null ? Texturas.MaterialDaCarta(c) : matVerso, 0f);
            Face(go.transform, "Verso", matVerso, 180f);
            go.transform.localScale = new Vector3(largura, altura, 1);
            return go;
        }

        static void Face(Transform pai, string nome, Material m, float giroY)
        {
            var q = new GameObject(nome);
            q.transform.SetParent(pai, false);
            q.transform.localRotation = Quaternion.Euler(0, giroY, 0);
            q.AddComponent<MeshFilter>().sharedMesh = MalhaDaCarta();
            var r = q.AddComponent<MeshRenderer>();
            r.sharedMaterial = m;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        // ------------------------------------------------------------- pousos

        static readonly Quaternion DeitadaDeCostas = Quaternion.LookRotation(Vector3.up, Vector3.forward);

        /// <summary>Em cima do monte, de costas para cima.</summary>
        Pouso PousoDoMonte() => new Pouso
        {
            Pos = monteTopo.position + Vector3.up * 0.004f,
            Giro = DeitadaDeCostas,
            Escala = new Vector3(CartaL, CartaA, 1),
        };

        static float AlturaDoDescarte(int quantas) => Mathf.Clamp(quantas * 0.0011f, 0.001f, 0.06f);

        /// <summary>No topo do descarte, de frente para cima, com o torto de mão daquela carta.</summary>
        Pouso PousoDoDescarte(Carta topo, int quantas)
        {
            float torto = topo != null ? ((topo.Id * 37) % 13 - 6) * 1.1f : 0f;
            return new Pouso
            {
                Pos = descarteRaiz.position + Vector3.up * ((quantas > 1 ? AlturaDoDescarte(quantas) : 0f) + 0.002f),
                Giro = Quaternion.Euler(90f, torto, 0),
                Escala = new Vector3(CartaL, CartaA, 1),
            };
        }

        /// <summary>No leque de um adversário, do tamanho das cartas dele e de costas para a mesa.</summary>
        static Pouso PousoNoLeque(Assento3D a) => new Pouso
        {
            Pos = a.PontoDoLeque,
            Giro = a.GiroNoLeque,
            Escala = new Vector3(0.088f, 0.124f, 1),
        };

        /// <summary>Fora da mesa: para onde vai a carta queimada, que sai do jogo.</summary>
        static Pouso PousoFora() => new Pouso
        {
            Pos = new Vector3(1.55f, TopoMesa + 0.2f, 0.75f),
            Giro = DeitadaDeCostas * Quaternion.Euler(0, 0, 35f),
            Escala = new Vector3(CartaL * 0.5f, CartaA * 0.5f, 1),
        };

        /// <summary>
        /// O lugar de uma carta da SUA mão, no mundo: meio metro à frente da
        /// câmera, na direção em que a carta da interface aparece, do tamanho
        /// que faz as duas coincidirem na tela e de frente para você. (A mesma
        /// carta na distância do tampo ficaria embaixo do feltro: a parte de
        /// baixo da tela olha para dentro da mesa.)
        /// </summary>
        Pouso PousoNaMao(LugarNaTela l)
        {
            const float distancia = 0.5f;
            float alturaVista = 2f * distancia * Mathf.Tan(Camera.fieldOfView * 0.5f * Mathf.Deg2Rad);
            float altura = l.Altura / Mathf.Max(1f, Screen.height) * alturaVista;
            return new Pouso
            {
                Pos = Camera.ScreenToWorldPoint(new Vector3(l.Centro.x, l.Centro.y, distancia)),
                Giro = Camera.transform.rotation * Quaternion.Euler(0, 0, -l.Giro),
                Escala = new Vector3(altura * (CartaL / CartaA), altura, 1),
            };
        }

        static bool Mudou(Pouso a, Pouso b) =>
            (a.Pos - b.Pos).sqrMagnitude > 1e-6f || Quaternion.Angle(a.Giro, b.Giro) > 0.5f || (a.Escala - b.Escala).sqrMagnitude > 1e-6f;

        // -------------------------------------------------------------- estado

        /// <summary>Fora da partida (início e sala): a câmera passeia em volta da mesa.</summary>
        public void MostrarSala(Sala sala, string eu)
        {
            emPartida = false;
            meuId = eu;
            visao = null;
            var outros = new List<(string id, string avatar, int assento, int cartas)>();
            if (sala != null)
                for (int i = 0; i < sala.Jogadores.Count; i++)
                {
                    var p = sala.Jogadores[i];
                    if (p.Id == eu) continue;
                    outros.Add((p.Id, p.Avatar, i, 0));
                }
            SincronizaAssentos(outros);
            LimpaVoos();
            LimpaJogos();
            ApagaRealces();
            DefineAlturaDoMonte(40);
            AtualizaDescarte(null, 0, false, null, null);
            anelVez.SetActive(false);
        }

        /// <summary>
        /// A mesa passa a mostrar esta visão. Com o `lance` (os eventos e onde
        /// estavam as cartas da sua mão), o que mudou de lugar VOA até o lugar
        /// novo; sem ele, ou no primeiro estado, a mesa aparece já arrumada.
        /// </summary>
        public void MostrarPartida(Visao v, string eu, Lance lance = null)
        {
            var eventos = lance?.Eventos ?? new JArray();
            bool rodadaNova = eventos.Any(e => Json.Str(e, "e") == "roundStart");
            bool anima = lance != null && !lance.Primeira && Movimento.Ligado && emPartida && visao != null;

            // O retrato de antes: onde cada carta da mesa estava, e qual carta era.
            // Os ids RECOMEÇAM a cada rodada, então na rodada nova não há "antes".
            var posesAntes = new Dictionary<int, Pouso>();
            var cartasAntes = new Dictionary<int, Carta>();
            if (anima && !rodadaNova)
            {
                foreach (var kv in cartasNaMesa)
                    if (kv.Value != null) posesAntes[kv.Key] = Pouso.De(kv.Value);
                foreach (var p in visao.Jogadores)
                    foreach (var j in p.Jogos)
                        foreach (var c in j.Cartas) cartasAntes[c.Id] = c;
                if (visao.Voce != null)
                    foreach (var c in visao.Voce.Mao) cartasAntes[c.Id] = c;
            }
            var maoAntes = anima && !rodadaNova ? lance.MaoAntes : null;
            if (rodadaNova) { LimpaVoos(); AtualizaDescarte(null, 0, false, null, null); }

            emPartida = true;
            visao = v;
            meuId = eu;

            // A roda na ordem da vez: o próximo a jogar senta à sua esquerda, e a
            // vez dá a volta na mesa sem pular de uma ponta à outra.
            int n = v.Jogadores.Count;
            int meu = v.Jogadores.FindIndex(p => p.Id == eu);
            var outros = new List<(string id, string avatar, int assento, int cartas)>();
            for (int k = 1; k <= n; k++)
            {
                int i = (meu + k + n) % n;     // sem lugar (meu = −1): todos, a partir do 0
                var p = v.Jogadores[i];
                if (p.Id == eu) continue;
                outros.Add((p.Id, p.Avatar, i, p.CartasNaMao));
            }
            SincronizaAssentos(outros);

            foreach (var a in assentos.Values) a.EhVez = a.Id == v.VezId;

            // de onde a carta sai tem que ser medido ANTES de o monte mudar de altura
            Pouso monteAntes = PousoDoMonte();
            DefineAlturaDoMonte(v.Fase == "roundEnd" || v.Fase == "gameEnd" ? 0 : v.CartasNoMonte);

            fila.Clear();
            var pousadas = new HashSet<int>();    // cartas da sua mão que já têm voo marcado
            AtualizaDescarte(v.TopoDoDescarte, v.CartasNoDescarte, anima, lance, new Antes { Poses = posesAntes, Mao = maoAntes, Pousadas = pousadas });
            CalculaAlvoDaCamera(0f);   // os jogos se posicionam pela câmera já no lugar
            string ator = QuemMexeuNaMesa(eventos);
            DesenhaJogos(v, anima, maoAntes, posesAntes, ator);
            PosicionaAnelDaVez(v.VezId);

            if (anima) AnimaOResto(v, lance, rodadaNova, posesAntes, cartasAntes, maoAntes, ator, monteAntes, pousadas);

            // Toda carta nova da sua mão tem que aparecer: a que não ganhou voo aparece já.
            if (lance?.Chegaram != null)
                foreach (int id in lance.Chegaram)
                    if (!pousadas.Contains(id)) lance.AoPousarNaMao?.Invoke(id);
        }

        // O que o descarte e os jogos precisam saber do estado anterior.
        sealed class Antes
        {
            public Dictionary<int, Pouso> Poses;
            public Dictionary<int, LugarNaTela> Mao;
            public HashSet<int> Pousadas;
        }

        // Cartas que saem juntas do mesmo lugar saem em fila, uma atrás da outra.
        readonly Dictionary<string, int> fila = new Dictionary<string, int>();

        float Fila(string chave, float passo = 0.05f)
        {
            fila.TryGetValue(chave, out int n);
            fila[chave] = n + 1;
            return n * passo;
        }

        /// <summary>Quem mexeu nos jogos da mesa neste lance (é da mão dele que a carta nova sai).</summary>
        static string QuemMexeuNaMesa(JArray eventos)
        {
            string descartou = null;
            foreach (var ev in eventos)
            {
                string p = Json.Str(ev, "p");
                if (p == null) continue;
                switch (Json.Str(ev, "e"))
                {
                    case "baixou": case "layoff": case "pegouCoringa": case "swapJoker": case "trocouPorCoringa":
                    case "trocouNaTrinca": case "meldDiscard": case "tomouSobra":
                        return p;
                    case "discard":
                        descartou = p;
                        break;
                }
            }
            return descartou;
        }

        /// <summary>Quem levou a carta que estava no topo do meio (na vez ou pedindo fora dela).</summary>
        static string QuemLevouDoMeio(JArray eventos, int cartaId)
        {
            foreach (var ev in eventos)
            {
                string tipo = Json.Str(ev, "e");
                bool doMeio = tipo == "buy" || (tipo == "draw" && Json.Str(ev, "source") == "discard");
                if (doMeio && Json.Int(ev["card"], "id", int.MinValue) == cartaId) return Json.Str(ev, "p");
            }
            return null;
        }

        /// <summary>
        /// A carta voa para a sua mão e, ao pousar, a carta da interface aparece
        /// no lugar. O destino é lido a cada quadro: a mão se rearruma.
        /// </summary>
        bool VoaParaAMinhaMao(Transform t, int id, Lance lance, HashSet<int> pousadas, float atraso, float dur)
        {
            var lugar = lance.MaoAgora?.Invoke(id);
            if (!lugar.HasValue) return false;
            var agora = lance.MaoAgora;
            var pousar = lance.AoPousarNaMao;
            Voa(t, Pouso.De(t), PousoNaMao(lugar.Value), dur, atraso, 0.05f, () => pousar?.Invoke(id), true, false,
                () => { var l = agora(id); return l.HasValue ? PousoNaMao(l.Value) : (Pouso?)null; });
            pousadas.Add(id);
            return true;
        }

        /// <summary>Tudo o que voa sem ser carta de jogo nem o topo do descarte: o que vai para as mãos e o que sai do jogo.</summary>
        void AnimaOResto(Visao v, Lance lance, bool rodadaNova, Dictionary<int, Pouso> posesAntes, Dictionary<int, Carta> cartasAntes,
            Dictionary<int, LugarNaTela> maoAntes, string ator, Pouso monteAntes, HashSet<int> pousadas)
        {
            var mao = v.Voce?.Mao ?? new List<Carta>();
            var naMao = new HashSet<int>(mao.Select(c => c.Id));
            var chegaram = lance.Chegaram ?? new List<int>();

            // 1. Carta que estava num jogo e sumiu da mesa: foi para a mão de quem jogou.
            foreach (var kv in posesAntes)
            {
                int id = kv.Key;
                if (cartasNaMesa.ContainsKey(id) || id == topoDescarteId) continue;
                if (!cartasAntes.TryGetValue(id, out var carta)) continue;
                bool minha = chegaram.Contains(id);
                Assento3D a = null;
                if (!minha && (ator == null || ator == meuId || !assentos.TryGetValue(ator, out a))) continue;
                var go = CartaDuasFaces(carta, kv.Value.Escala.x, kv.Value.Escala.y);
                go.transform.SetParent(raiz, false);
                kv.Value.Aplica(go.transform);
                if (minha) { if (!VoaParaAMinhaMao(go.transform, id, lance, pousadas, 0f, 0.44f)) Destroy(go); }
                else Voa(go.transform, kv.Value, PousoNoLeque(a), 0.42f, 0f, 0.08f, null, true);
            }

            // 2. As cartas novas da sua mão que não vieram do meio nem de um jogo: do monte.
            var doMonte = chegaram.Where(id => !pousadas.Contains(id)).ToList();
            bool distribui = rodadaNova || doMonte.Count > 3;
            for (int k = 0; k < doMonte.Count; k++)
            {
                var carta = mao.Find(c => c.Id == doMonte[k]);
                if (carta == null) continue;
                var go = CartaDuasFaces(carta, CartaL, CartaA);
                go.transform.SetParent(raiz, false);
                monteAntes.Aplica(go.transform);
                if (!VoaParaAMinhaMao(go.transform, carta.Id, lance, pousadas, distribui ? k * 0.055f : 0f, distribui ? 0.38f : 0.44f))
                    Destroy(go);
            }

            // 3. Carta que saiu da sua mão e não está em lugar nenhum da mesa: foi queimada.
            if (maoAntes != null)
                foreach (var kv in maoAntes)
                {
                    int id = kv.Key;
                    if (naMao.Contains(id) || cartasNaMesa.ContainsKey(id) || id == topoDescarteId) continue;
                    if (!cartasAntes.TryGetValue(id, out var carta)) continue;
                    var go = CartaDuasFaces(carta, CartaL, CartaA);
                    go.transform.SetParent(raiz, false);
                    Voa(go.transform, PousoNaMao(kv.Value), PousoFora(), 0.55f, 0f, 0.12f, null, true);
                }

            // 4. O que os adversários puxam do monte e queimam: cartas de costas, que ninguém vê.
            foreach (var ev in lance.Eventos)
            {
                string tipo = Json.Str(ev, "e"), p = Json.Str(ev, "p");
                if (p == null || p == meuId || !assentos.TryGetValue(p, out var a)) continue;
                if (tipo == "draw" && Json.Str(ev, "source") != "discard")
                {
                    var go = CartaDuasFaces(null, CartaL, CartaA);
                    go.transform.SetParent(raiz, false);
                    Voa(go.transform, monteAntes, PousoNoLeque(a), 0.42f, Fila("compra:" + p, 0.12f), 0.07f, null, true);
                }
                else if (tipo == "queimou")
                {
                    var go = CartaDuasFaces(null, 0.088f, 0.124f);
                    go.transform.SetParent(raiz, false);
                    Voa(go.transform, PousoNoLeque(a), PousoFora(), 0.55f, 0f, 0.12f, null, true);
                }
            }

            // 5. Distribuir: três cartas de costas para cada adversário, escalonadas —
            // as de verdade não vão (com oito na mesa seriam quase cem), como no site.
            if (rodadaNova)
            {
                int k = 0;
                foreach (var a in assentos.Values)
                    for (int c = 0; c < 3; c++)
                    {
                        var go = CartaDuasFaces(null, CartaL, CartaA);
                        go.transform.SetParent(raiz, false);
                        Voa(go.transform, monteAntes, PousoNoLeque(a), 0.38f, k++ * 0.09f, 0.07f, null, true);
                    }
            }
        }

        void SincronizaAssentos(List<(string id, string avatar, int assento, int cartas)> outros)
        {
            var ids = new HashSet<string>(outros.Select(o => o.id));
            foreach (var id in assentos.Keys.Where(k => !ids.Contains(k)).ToList())
            {
                assentos[id].Destruir();
                assentos.Remove(id);
            }
            quantosOutros = outros.Count;
            for (int i = 0; i < outros.Count; i++)
            {
                var o = outros[i];
                if (!assentos.TryGetValue(o.id, out var a))
                {
                    a = new Assento3D(o.id, raiz, matMadeira, matEstofado);
                    a.Raiz.gameObject.AddComponent<Alvo>().Inicia(Alvo.Qual.Jogador, o.id);
                    assentos[o.id] = a;
                }
                string slug = !string.IsNullOrEmpty(o.avatar) && Elenco.De(o.avatar) != null ? o.avatar : Elenco.DoAssento(o.assento);
                a.DefinePersonagem(slug);
                a.DefineCartas(o.cartas, matVerso);
                var pos = PosicaoDoAssento(i, outros.Count);
                a.Raiz.position = pos.posicao;
                a.Raiz.rotation = Quaternion.Euler(0, pos.giro, 0);
            }
        }

        /// <summary>public/mesa3d.js → posicaoDoAssento, com os eixos desta cena.</summary>
        static (Vector3 posicao, float giro, float angulo) PosicaoDoAssento(int indice, int total)
        {
            float raio = RaioDosAssentos(total);
            float passo = 2f * Mathf.Asin(0.78f / (2f * raio));
            float ang = (indice - (total - 1) / 2f) * Mathf.Max(passo, total < 4 ? 0.6f : passo);
            var p = new Vector3(Mathf.Sin(ang) * raio, 0, Mathf.Cos(ang) * raio);
            return (p, ang * Mathf.Rad2Deg + 180f, ang);
        }

        static float RaioDosAssentos(int total) => Mathf.Max(RaioAssentoMin, (total - 1) * 0.30f);

        /// <summary>
        /// O meio da mesa: a pilha e a carta do topo. Quando alguém DESCARTA, a
        /// carta nova voa de onde saiu (a sua mão, a mão de quem jogou ou um
        /// jogo da mesa) e a de baixo fica à vista até ela pousar. Quando alguém
        /// LEVA o topo, é a própria carta do topo que voa para a mão dele, e a de
        /// baixo aparece.
        /// </summary>
        void AtualizaDescarte(Carta topo, int quantas, bool anima, Lance lance, Antes antes)
        {
            float h = AlturaDoDescarte(quantas);
            descartePilha.SetActive(quantas > 1);
            descartePilha.transform.localScale = new Vector3(CartaL * 0.96f, h, CartaA * 0.96f);
            descartePilha.transform.localPosition = new Vector3(0, h / 2, 0);

            int id = topo?.Id ?? int.MinValue;
            if (id == topoDescarteId)
            {
                // a mesma carta: só acompanha a altura da pilha (se não estiver no ar)
                if (descarteTopo != null && !EmVoo(descarteTopo.transform)) PousoDoDescarte(topo, quantas).Aplica(descarteTopo.transform);
                descarteQuantas = quantas;
                return;
            }

            var velho = descarteTopo;
            int velhoId = topoDescarteId;
            bool subiu = topo != null && quantas > descarteQuantas;
            descarteTopo = null;
            topoDescarteId = id;
            descarteQuantas = quantas;
            if (descarteDeBaixo != null) { Destroy(descarteDeBaixo); descarteDeBaixo = null; }

            if (topo != null)
            {
                descarteTopo = CartaDuasFaces(topo, CartaL, CartaA);
                descarteTopo.transform.SetParent(descarteRaiz, false);
                var destino = PousoDoDescarte(topo, quantas);
                Pouso? origem = null;
                if (anima && subiu)
                {
                    if (antes.Mao != null && antes.Mao.TryGetValue(topo.Id, out var lugar)) origem = PousoNaMao(lugar);
                    else if (antes.Poses != null && antes.Poses.TryGetValue(topo.Id, out var noJogo)) origem = noJogo;
                    else if (topo.DescartadaPor != null && topo.DescartadaPor != meuId && assentos.TryGetValue(topo.DescartadaPor, out var a)) origem = PousoNoLeque(a);
                }
                if (origem.HasValue)
                {
                    // a carta de baixo continua à vista até a nova pousar em cima dela
                    var deBaixo = velho;
                    descarteDeBaixo = velho;
                    velho = null;
                    Voa(descarteTopo.transform, origem.Value, destino, 0.44f, 0f, 0.09f, () =>
                    {
                        if (deBaixo != null) Destroy(deBaixo);
                        if (descarteDeBaixo == deBaixo) descarteDeBaixo = null;
                    }, false, true);
                }
                else destino.Aplica(descarteTopo.transform);
            }

            if (velho == null) return;
            // A carta que estava no topo saiu: foi para a mão de alguém.
            bool voou = false;
            if (anima && !subiu && velhoId != int.MinValue)
            {
                if (lance.Chegaram != null && lance.Chegaram.Contains(velhoId))
                    voou = VoaParaAMinhaMao(velho.transform, velhoId, lance, antes.Pousadas, 0f, 0.44f);
                else
                {
                    string quem = QuemLevouDoMeio(lance.Eventos, velhoId);
                    if (quem != null && quem != meuId && assentos.TryGetValue(quem, out var a))
                    {
                        Voa(velho.transform, Pouso.De(velho.transform), PousoNoLeque(a), 0.44f, 0f, 0.09f, null, true);
                        voou = true;
                    }
                }
            }
            if (!voou) Destroy(velho);
        }

        void LimpaJogos()
        {
            for (int i = jogosRaiz.childCount - 1; i >= 0; i--) Destroy(jogosRaiz.GetChild(i).gameObject);
            centroDosJogos.Clear();
            cartasNaMesa.Clear();
            realces.Clear();
        }

        /// <summary>
        /// Os jogos ficam num anel em volta das pilhas do centro, cada um na frente
        /// da própria cadeira; os seus, perto da câmera. As cartas se erguem para
        /// quem olha da câmera, como no site, para continuarem legíveis de longe.
        /// </summary>
        void DesenhaJogos(Visao v, bool anima, Dictionary<int, LugarNaTela> maoAntes, Dictionary<int, Pouso> posesAntes, string ator)
        {
            LimpaJogos();
            // A carta deita a 62° do pé: fica erguida 28° do feltro, virada
            // para a câmera, com a borda de baixo encostando no pano.
            const float giroX = 62f;
            foreach (var p in v.Jogadores)
            {
                if (p.Jogos.Count == 0) continue;

                // tamanho: cabe numa faixa de ~0,9 m; quem baixa muito encolhe
                float l = 0.13f, a2 = l * 1.406f;
                float sobrepoe = 0.42f;
                float largura = p.Jogos.Sum(j => l * (1 + sobrepoe * (j.Cartas.Count - 1))) + (p.Jogos.Count - 1) * l * 0.25f;
                float limite = p.Id == meuId ? 1.3f : 0.95f;
                float escala = largura > limite ? limite / largura : 1f;
                l *= escala; a2 *= escala; largura *= escala;
                float ergue = a2 * 0.5f * Mathf.Sin((90f - giroX) * Mathf.Deg2Rad);
                float pegada = a2 * Mathf.Cos((90f - giroX) * Mathf.Deg2Rad);   // fundura no feltro

                Vector3 centro;
                if (p.Id == meuId)
                {
                    // Os SEUS jogos: logo acima da linha onde a sua mão termina na
                    // tela (medida no feltro, pela câmera), sem encostar no monte.
                    float zLivre = PontoNoFeltro(AlturaDaMao01 + 0.015f).z;
                    float zMax = ZDasPilhas - CartaA * 0.5f - pegada * 0.5f - 0.03f;
                    float z = Mathf.Clamp(zLivre + pegada * 0.5f + 0.015f, -0.95f, zMax);
                    centro = new Vector3(0, TopoMesa + 0.004f, z);
                }
                else if (assentos.TryGetValue(p.Id, out var a))
                {
                    Vector3 dir = a.Raiz.position; dir.y = 0;
                    centro = dir.normalized * 0.68f + Vector3.up * (TopoMesa + 0.004f);
                }
                else continue;
                centroDosJogos[p.Id] = centro;

                var grupo = new GameObject("Jogos de " + p.Nome).transform;
                grupo.SetParent(jogosRaiz, false);
                grupo.position = centro;
                Vector3 longe = centro - posCamera; longe.y = 0;
                grupo.rotation = Quaternion.LookRotation(longe.sqrMagnitude > 0.001f ? longe.normalized : Vector3.forward, Vector3.up);
                float x = -largura / 2;
                float vao = l * 0.25f;
                int ordem = 0;
                foreach (var j in p.Jogos)
                {
                    float larguraDoJogo = l * (1 + sobrepoe * (j.Cartas.Count - 1));
                    for (int k = 0; k < j.Cartas.Count; k++)
                    {
                        var c = j.Cartas[k];
                        var carta = CartaDuasFaces(c, l, a2);
                        carta.transform.SetParent(grupo, false);
                        carta.transform.localRotation = Quaternion.Euler(giroX, 0, 0);
                        float cx = x + l / 2 + k * l * sobrepoe;
                        // cada carta um fio à frente da anterior, para não brigar no z-buffer
                        carta.transform.localPosition = new Vector3(cx, ergue + 0.002f + ordem * 0.0008f, -ordem * 0.0005f);
                        ordem++;
                        cartasNaMesa[c.Id] = carta.transform;
                        if (!anima) continue;

                        var destino = Pouso.De(carta.transform);
                        if (posesAntes.TryGetValue(c.Id, out var antes))
                        {
                            // já estava na mesa: desliza para o lugar novo (ou segue de onde o voo parou)
                            if (Mudou(antes, destino)) Voa(carta.transform, antes, destino, 0.28f, 0f, 0.012f, null, false, false, null, true);
                        }
                        else if (maoAntes != null && maoAntes.TryGetValue(c.Id, out var lugar))
                            Voa(carta.transform, PousoNaMao(lugar), destino, 0.46f, Fila("da-mao"), 0.06f, null, false, true);
                        else if (ator != null && ator != meuId && assentos.TryGetValue(ator, out var quem))
                            Voa(carta.transform, PousoNoLeque(quem), destino, 0.46f, Fila("do-leque:" + ator), 0.09f, null, false, true);
                    }

                    // Cada jogo é um alvo: tocar abre o visor do dono, soltar uma carta
                    // em cima encaixa NESTE jogo. A caixa cobre metade do vão de cada
                    // lado, para não sobrar faixa morta entre dois jogos.
                    var alvo = new GameObject("Jogo " + j.Id);
                    alvo.transform.SetParent(grupo, false);
                    alvo.transform.localPosition = new Vector3(x + larguraDoJogo / 2, ergue, 0);
                    var col = alvo.AddComponent<BoxCollider>();
                    col.size = new Vector3(larguraDoJogo + vao, ergue * 2 + 0.04f, a2 + 0.06f);
                    alvo.AddComponent<Alvo>().Inicia(Alvo.Qual.Jogador, p.Id, j.Id);

                    // o brilho que acende embaixo do jogo quando a carta arrastada cabe nele
                    var brilho = Plano("Realce", matRealceFraco, larguraDoJogo + 0.1f, pegada + 0.12f);
                    brilho.transform.SetParent(grupo, false);
                    brilho.transform.localPosition = new Vector3(x + larguraDoJogo / 2, 0.0005f, 0);
                    brilho.SetActive(false);
                    realces[j.Id] = brilho.GetComponent<Renderer>();

                    x += larguraDoJogo + vao;
                }
            }
            MostraJogoAceso();   // os brilhos são refeitos a cada estado: o do treinador volta
        }

        void PosicionaAnelDaVez(string vezId)
        {
            if (!emPartida || string.IsNullOrEmpty(vezId)) { anelVez.SetActive(false); return; }
            Vector3 pos;
            if (vezId == meuId) pos = new Vector3(0, TopoMesa + 0.003f, -0.95f);
            else if (assentos.TryGetValue(vezId, out var a))
            {
                Vector3 d = a.Raiz.position; d.y = 0;
                pos = d.normalized * 0.98f + Vector3.up * (TopoMesa + 0.003f);
            }
            else { anelVez.SetActive(false); return; }
            anelVez.SetActive(true);
            anelVez.transform.position = pos;
        }

        // --------------------------------------------------------- reações

        public void Reage(string id, string reacao)
        {
            if (id == null || !assentos.TryGetValue(id, out var a)) return;
            switch (reacao)
            {
                case "feliz": a.Feliz(); break;
                case "bravo": a.Bravo(); break;
                case "lance": a.Lance(); break;
                case "triste": a.Triste(); break;
                case "comemora": a.Comemora(); break;
            }
        }

        /// <summary>Todo mundo à mesa, menos um (quem bateu): a reação de quem perdeu a rodada.</summary>
        public void ReageTodos(string reacao, string menos = null)
        {
            foreach (var id in assentos.Keys.ToList())
                if (id != menos) Reage(id, reacao);
        }

        // ------------------------------------------------------------ voos

        void Voa(Transform t, Pouso de, Pouso para, float dur, float atraso = 0f, float arco = 0.08f,
            Action aoFim = null, bool destroi = false, bool somAoPousar = false, Func<Pouso?> paraVivo = null, bool mudo = false)
        {
            // um objeto só tem um voo: o novo toma o lugar do que estava em curso
            for (int i = voos.Count - 1; i >= 0; i--)
                if (voos[i].T == t) voos.RemoveAt(i);
            de.Aplica(t);
            if (atraso > 0f) t.gameObject.SetActive(false);   // espera a vez na fila sem aparecer parada
            voos.Add(new Voo
            {
                T = t, De = de, Para = para, ParaVivo = paraVivo,
                Inicio = Time.time + atraso, Dur = Mathf.Max(0.05f, dur), Arco = arco,
                AoFim = aoFim, Destroi = destroi, SomAoPousar = somAoPousar, Mudo = mudo,
            });
        }

        bool EmVoo(Transform t)
        {
            foreach (var v in voos) if (v.T == t) return true;
            return false;
        }

        void AtualizaVoos()
        {
            float agora = Time.time;
            for (int i = voos.Count - 1; i >= 0; i--)
            {
                var v = voos[i];
                if (v.T == null)
                {
                    // a mesa foi redesenhada com a carta no ar: o voo acaba, mas quem esperava por ele é avisado
                    voos.RemoveAt(i);
                    v.AoFim?.Invoke();
                    continue;
                }
                float k = (agora - v.Inicio) / v.Dur;
                if (k < 0f) continue;
                if (!v.Comecou)
                {
                    v.Comecou = true;
                    v.T.gameObject.SetActive(true);
                    if (!v.Mudo) Sons.Toca(Som.Carta, 0.42f, UnityEngine.Random.Range(0.9f, 1.12f));
                }
                if (v.ParaVivo != null)
                {
                    var vivo = v.ParaVivo();
                    if (vivo.HasValue) v.Para = vivo.Value;
                }
                float e = 1f - Mathf.Pow(1f - Mathf.Clamp01(k), 3f);
                v.T.position = Vector3.Lerp(v.De.Pos, v.Para.Pos, e) + Vector3.up * (Mathf.Sin(e * Mathf.PI) * v.Arco);
                v.T.rotation = Quaternion.Slerp(v.De.Giro, v.Para.Giro, e);
                v.T.localScale = Vector3.Lerp(v.De.Escala, v.Para.Escala, e);
                if (k < 1f) continue;

                voos.RemoveAt(i);
                v.Para.Aplica(v.T);
                if (v.SomAoPousar) Sons.Toca(Som.Pousa, 0.55f, UnityEngine.Random.Range(0.92f, 1.08f));
                if (v.Destroi) Destroy(v.T.gameObject);
                v.AoFim?.Invoke();
            }
        }

        /// <summary>Acaba com todo voo: o que era só passageiro some, o resto pousa na hora.</summary>
        void LimpaVoos()
        {
            var todos = voos.ToList();
            voos.Clear();
            foreach (var v in todos)
            {
                if (v.T != null)
                {
                    if (v.Destroi) Destroy(v.T.gameObject);
                    else { v.T.gameObject.SetActive(true); v.Para.Aplica(v.T); }
                }
                v.AoFim?.Invoke();
            }
        }

        // ------------------------------------------------- arrastar uma carta

        /// <summary>
        /// O que há na mesa embaixo deste ponto da tela (pixels, y para cima):
        /// o descarte, um jogo baixado, o feltro livre — ou nada.
        /// </summary>
        public AlvoDoArrasto AlvoEm(Vector2 tela)
        {
            var nada = new AlvoDoArrasto { Qual = AlvoDoArrasto.Tipo.Nada, JogoId = -1 };
            if (!emPartida) return nada;
            var raio = Camera.ScreenPointToRay(tela);
            if (raio.direction.y > -1e-4f) return nada;
            Vector3 noFeltro = raio.origin + raio.direction * ((TopoMesa - raio.origin.y) / raio.direction.y);

            // o descarte é alvo generoso: a carta larga cai nele mesmo passando um pouco do lado
            Vector3 atePilha = noFeltro - descarteRaiz.position;
            atePilha.y = 0;
            if (atePilha.magnitude < 0.21f) return new AlvoDoArrasto { Qual = AlvoDoArrasto.Tipo.Descarte, JogoId = -1 };

            if (Physics.Raycast(raio, out var hit, 20f))
            {
                var alvo = hit.collider.GetComponentInParent<Alvo>();
                if (alvo != null)
                {
                    if (alvo.Tipo == Alvo.Qual.Jogador && alvo.JogoId >= 0)
                        return new AlvoDoArrasto { Qual = AlvoDoArrasto.Tipo.Jogo, JogoId = alvo.JogoId, DonoId = alvo.JogadorId };
                    if (alvo.Tipo == Alvo.Qual.Descarte) return new AlvoDoArrasto { Qual = AlvoDoArrasto.Tipo.Descarte, JogoId = -1 };
                    return nada;   // o monte, ou alguém sentado
                }
            }
            noFeltro.y = 0;
            return noFeltro.magnitude < RaioFeltro ? new AlvoDoArrasto { Qual = AlvoDoArrasto.Tipo.Feltro, JogoId = -1 } : nada;
        }

        /// <summary>
        /// Acende a mesa para a carta que está sendo arrastada: um brilho fraco
        /// nos jogos onde ela cabe e um forte no alvo que está embaixo dela.
        /// </summary>
        public void Realca(AlvoDoArrasto sob, ICollection<int> jogosOndeCabe, bool descarteVale)
        {
            foreach (var kv in realces)
            {
                if (kv.Value == null) continue;
                bool forte = sob.Qual == AlvoDoArrasto.Tipo.Jogo && sob.JogoId == kv.Key;
                bool cabe = jogosOndeCabe != null && jogosOndeCabe.Contains(kv.Key);
                kv.Value.gameObject.SetActive(forte || cabe);
                kv.Value.sharedMaterial = forte ? matRealceForte : matRealceFraco;
            }
            realceDescarte.SetActive(descarteVale && sob.Qual == AlvoDoArrasto.Tipo.Descarte);
        }

        public void ApagaRealces()
        {
            foreach (var r in realces.Values)
                if (r != null) r.gameObject.SetActive(false);
            if (realceDescarte != null) realceDescarte.SetActive(false);
            MostraJogoAceso();   // o do treinador volta depois do arrasto
        }

        // ------------------------------------------------------ o tutorial

        public void AcendeMonte(bool sim) => acesoMonte.SetActive(sim);
        public void AcendeMeio(bool sim) => acesoMeio.SetActive(sim);

        /// <summary>O brilho no feltro, onde os seus jogos descem (logo acima da mão).</summary>
        public void AcendeFeltro(bool sim)
        {
            if (sim)
            {
                CalculaAlvoDaCamera(0f);
                float z = Mathf.Clamp(PontoNoFeltro(AlturaDaMao01 + 0.07f).z, -0.9f, ZDasPilhas - CartaA);
                acesoFeltro.transform.position = new Vector3(0, TopoMesa + 0.004f, z);
            }
            acesoFeltro.SetActive(sim);
        }

        /// <summary>Acende o jogo da mesa onde encaixar (−1 apaga).</summary>
        public void AcendeJogo(int id)
        {
            if (jogoAceso >= 0 && jogoAceso != id && realces.TryGetValue(jogoAceso, out var velho) && velho != null)
                velho.gameObject.SetActive(false);
            jogoAceso = id;
            MostraJogoAceso();
        }

        void MostraJogoAceso()
        {
            if (jogoAceso < 0 || !realces.TryGetValue(jogoAceso, out var r) || r == null) return;
            r.sharedMaterial = matRealceFraco;
            r.gameObject.SetActive(true);
        }

        /// <summary>Onde desenhar a placa de cada adversário (posição na tela, y para baixo).</summary>
        public IEnumerable<(string id, Vector2 tela, bool visivel)> PlacasNaTela()
        {
            foreach (var a in assentos.Values)
            {
                // logo acima do cabelo: o nó Cabeca é o centro da cabeça
                Vector3 p = a.PontoDaCabeca + Vector3.up * 0.15f;
                Vector3 s = Camera.WorldToScreenPoint(p);
                yield return (a.Id, new Vector2(s.x, Screen.height - s.y), s.z > 0);
            }
        }

        // ---------------------------------------------------------------- laço

        void Update()
        {
            float dt = Mathf.Min(Time.deltaTime, 0.1f);
            var vez = visao?.VezId;
            Vector3? olhar = null;
            if (emPartida && vez != null)
            {
                if (vez == meuId) olhar = Camera.transform.position;
                else if (assentos.TryGetValue(vez, out var av)) olhar = av.PontoDaCabeca;
            }
            foreach (var a in assentos.Values)
            {
                a.OlharPara = a.Id == vez ? (Vector3?)null : olhar;
                a.Atualizar(dt);
            }
            if (anelVez.activeSelf)
            {
                float pulso = 1f + Mathf.Sin(Time.time * 3.2f) * 0.06f;
                anelVez.transform.localScale = new Vector3(0.62f * pulso, 0.62f * pulso, 1);
            }
            {
                // o que o treinador acende pulsa mais forte que o anel da vez
                float p = 1f + Mathf.Sin(Time.time * 4.5f) * 0.09f;
                if (acesoMonte.activeSelf) acesoMonte.transform.localScale = new Vector3(0.56f * p, 0.56f * p, 1);
                if (acesoMeio.activeSelf) acesoMeio.transform.localScale = new Vector3(0.56f * p, 0.56f * p, 1);
                if (acesoFeltro.activeSelf) acesoFeltro.transform.localScale = new Vector3(0.95f * p, 0.36f * p, 1);
            }
            AtualizaCamera(dt);
            AtualizaVoos();     // depois da câmera: a sua mão é medida pela câmera deste quadro
            ProcessaToque();
        }

        void AtualizaCamera(float dt)
        {
            CalculaAlvoDaCamera(dt);
            float k = 1f - Mathf.Exp(-dt * (emPartida ? 4f : 1.5f));
            var t = Camera.transform;
            t.position = Vector3.Lerp(t.position, posCamera, k);
            var rot = Quaternion.LookRotation(alvoCamera - t.position, Vector3.up);
            t.rotation = Quaternion.Slerp(t.rotation, rot, k);
            Camera.fieldOfView = Mathf.Lerp(Camera.fieldOfView, fovAlvo, k);
        }

        /// <summary>
        /// Onde uma linha horizontal da tela (0 = embaixo, 1 = em cima) toca o
        /// feltro, vista da câmera já assentada (e não da que ainda desliza).
        /// </summary>
        Vector3 PontoNoFeltro(float telaY01)
        {
            var t = Camera.transform;
            var pos0 = t.position; var rot0 = t.rotation; float fov0 = Camera.fieldOfView;
            t.position = posCamera;
            t.rotation = Quaternion.LookRotation(alvoCamera - posCamera, Vector3.up);
            Camera.fieldOfView = fovAlvo;
            var raio = Camera.ViewportPointToRay(new Vector3(0.5f, telaY01, 0f));
            t.position = pos0; t.rotation = rot0; Camera.fieldOfView = fov0;
            if (raio.direction.y > -1e-4f) return new Vector3(0, TopoMesa, -0.5f);
            float d = (TopoMesa - raio.origin.y) / raio.direction.y;
            return raio.origin + raio.direction * d;
        }

        void CalculaAlvoDaCamera(float dt)
        {
            float aspecto = Screen.height > 0 ? (float)Screen.width / Screen.height : 1.6f;
            if (!emPartida)
            {
                // vitrine: a câmera dá a volta devagar
                orbita += dt * 0.12f;
                fovAlvo = aspecto < 1 ? 70f : 50f;
                posCamera = new Vector3(Mathf.Sin(orbita) * 2.9f, 1.85f, -Mathf.Cos(orbita) * 2.9f);
                alvoCamera = new Vector3(0, TopoMesa + 0.25f, 0);
            }
            else
            {
                bool emPe = aspecto < 1;
                fovAlvo = emPe ? 72f : 55f;
                float tanH = Mathf.Tan(fovAlvo * 0.5f * Mathf.Deg2Rad) * aspecto;
                float z = 1.35f + (emPe ? 0f : 0.15f);
                // recua só o necessário para caber quem senta (public/mesa3d.js →
                // ajustaCameraParaAssentos), até 1,95 m
                for (int i = 0; i < quantosOutros; i++)
                {
                    var p = PosicaoDoAssento(i, quantosOutros).posicao;
                    z = Mathf.Max(z, -p.z + (Mathf.Abs(p.x) + 0.22f) / tanH);
                }
                z = Mathf.Min(1.95f, z);
                float y = Mathf.Min(1.62f, TopoMesa + (z + AnelLonge) * Inclinacao);
                posCamera = new Vector3(0, y, -z);
                alvoCamera = new Vector3(0, TopoMesa + 0.12f, 0.35f);
            }
        }

        void ProcessaToque()
        {
            if (!emPartida) return;
            var ponteiro = Pointer.current;
            if (ponteiro == null || !ponteiro.press.wasReleasedThisFrame) return;
            Vector2 pos = ponteiro.position.ReadValue();
            // a interface tem preferência: y da tela do Input System cresce para cima
            if (ToqueNaInterface != null && ToqueNaInterface(new Vector2(pos.x, Screen.height - pos.y))) return;
            var raio = Camera.ScreenPointToRay(pos);
            if (!Physics.Raycast(raio, out var hit, 20f)) return;
            var alvo = hit.collider.GetComponentInParent<Alvo>();
            if (alvo == null) return;
            switch (alvo.Tipo)
            {
                case Alvo.Qual.Monte: AoTocarMonte?.Invoke(); break;
                case Alvo.Qual.Descarte: AoTocarDescarte?.Invoke(); break;
                case Alvo.Qual.Jogador: AoTocarJogador?.Invoke(alvo.JogadorId); break;
            }
        }
    }
}
