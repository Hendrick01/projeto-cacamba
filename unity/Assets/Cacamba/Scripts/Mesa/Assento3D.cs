using System.Collections.Generic;
using Cacamba.Efeitos;
using UnityEngine;

namespace Cacamba.Mesa
{
    /// <summary>
    /// Um lugar à mesa: a banqueta, o personagem sentado e o leque de cartas nas
    /// mãos dele. Os oito personagens são esculturas estáticas, já sentadas e
    /// segurando o leque (public/models/LEIA-ME.md, 07/09/2026) — sem esqueleto.
    /// Por isso a atuação é do corpo inteiro: respiro, chegar para a frente na
    /// vez, virar para quem está jogando, e os gestos de cada momento —
    ///   • o LANCE: o tronco vai à mesa e volta, na hora em que a carta sai da
    ///     mão dele ou chega nela (é o "puxou", o "jogou");
    ///   • FELIZ: dois pulinhos; COMEMORA: quatro, com o leque para o alto;
    ///   • BRAVO: dois balanços de raiva; TRISTE: murcha e baixa as cartas.
    ///
    /// O modelo traz nós com nome: Cabeca (onde vai a placa do nome), MaoEsq e
    /// MaoDir (onde o leque encosta) e Assento (onde a banqueta fica embaixo).
    /// </summary>
    public sealed class Assento3D
    {
        public readonly string Id;
        public readonly Transform Raiz;      // no chão, na roda de cadeiras, frente (+Z) para o centro
        public string Slug { get; private set; }

        // O quadril de quem está sentado: é em volta dele que o tronco se inclina.
        // (Girando pelo chão, 9° jogariam a cabeça 20 cm para a frente.)
        const float AlturaDoQuadril = 0.55f;

        readonly Transform corpo;            // o que balança e pula (pivô no chão)
        readonly Transform tronco;           // o que se inclina (pivô no quadril): modelo e leque moram aqui
        readonly Transform banqueta;
        Transform modelo, cabeca, maoEsq, maoDir, assento;
        Transform leque;
        Vector3 lequeBase;
        int cartasNoLeque = -1;
        readonly List<GameObject> cartas = new List<GameObject>();
        readonly float fase;

        float puloDesde = -10f, balancoDesde = -10f, lanceDesde = -10f, tristeDesde = -10f, festaDesde = -10f, pulsoDesde = -10f;
        float avanco, giro;                  // suavizados
        public bool EhVez;
        public Vector3? OlharPara;
        public float AlturaCabecaPadrao = 1.32f;

        public Assento3D(string id, Transform pai, Material madeira, Material estofado)
        {
            Id = id;
            Raiz = new GameObject("Assento " + id).transform;
            Raiz.SetParent(pai, false);
            corpo = new GameObject("Corpo").transform;
            corpo.SetParent(Raiz, false);
            tronco = new GameObject("Tronco").transform;
            tronco.SetParent(corpo, false);
            tronco.localPosition = new Vector3(0, AlturaDoQuadril, 0);
            banqueta = CriaBanqueta(madeira, estofado).transform;
            banqueta.SetParent(Raiz, false);
            fase = Random.value * 10f;

            // Toque no lugar abre o visor com os jogos desta pessoa.
            var col = Raiz.gameObject.AddComponent<CapsuleCollider>();
            col.center = new Vector3(0, 0.95f, 0);
            col.radius = 0.32f;
            col.height = 1.3f;
        }

        public Vector3 PontoDaCabeca
        {
            get
            {
                if (cabeca != null) return cabeca.position;
                return corpo.TransformPoint(new Vector3(0, AlturaCabecaPadrao, 0));
            }
        }

        /// <summary>O meio do leque, no mundo: de onde a carta dele sai e aonde a que ele puxa chega.</summary>
        public Vector3 PontoDoLeque =>
            leque != null ? leque.TransformPoint(new Vector3(0, 0.062f, 0)) : corpo.TransformPoint(new Vector3(0, 1.02f, 0.2f));

        /// <summary>
        /// Como uma carta de duas faces fica no leque: o VERSO para a mesa (as
        /// cartas dele a gente vê de costas), a face para o peito dele.
        /// </summary>
        public Quaternion GiroNoLeque =>
            (leque != null ? leque.rotation : Raiz.rotation * Quaternion.Euler(-12f, 180f, 0f)) * Quaternion.Euler(0f, 180f, 0f);

        public void DefinePersonagem(string slug)
        {
            if (slug == Slug && modelo != null) return;
            Slug = slug;
            if (modelo != null) Object.Destroy(modelo.gameObject);
            modelo = null; cabeca = maoEsq = maoDir = assento = null;
            tronco.localRotation = Quaternion.identity;   // as medidas abaixo são do corpo em repouso

            var prefab = Resources.Load<GameObject>("Modelos/" + slug);
            GameObject go;
            if (prefab != null)
            {
                go = Object.Instantiate(prefab);
                Texturas.VesteModelo(go, slug);
            }
            else
            {
                go = BonecoReserva();
            }
            go.name = "Modelo " + slug;
            modelo = go.transform;
            modelo.SetParent(tronco, false);
            modelo.localPosition = new Vector3(0, -AlturaDoQuadril, 0);   // os pés continuam no chão
            modelo.localRotation = Quaternion.identity;
            foreach (var c in go.GetComponentsInChildren<Collider>()) Object.Destroy(c);
            foreach (var r in go.GetComponentsInChildren<Renderer>())
            {
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                r.receiveShadows = true;
            }

            cabeca = Acha(modelo, "Cabeca");
            maoEsq = Acha(modelo, "MaoEsq");
            maoDir = Acha(modelo, "MaoDir");
            assento = Acha(modelo, "Assento");

            // A banqueta vai embaixo de quem senta: pelo nó Assento, que é o plano
            // em que o corpo encosta (sem ele, um palpite de banqueta comum).
            Vector3 a = assento != null ? Raiz.InverseTransformPoint(assento.position) : new Vector3(0, 0.52f, -0.06f);
            banqueta.localPosition = new Vector3(a.x, 0, a.z);
            banqueta.localScale = new Vector3(1, Mathf.Max(0.3f, a.y) / 0.52f, 1);

            cartasNoLeque = -1;   // refaz o leque nas mãos novas
        }

        static Transform Acha(Transform t, string nome)
        {
            if (t.name == nome) return t;
            for (int i = 0; i < t.childCount; i++)
            {
                var r = Acha(t.GetChild(i), nome);
                if (r != null) return r;
            }
            return null;
        }

        /// <summary>Sem o modelo (arte não copiada), uma figura simples no lugar.</summary>
        static GameObject BonecoReserva()
        {
            var raiz = new GameObject();
            var mat = Texturas.Novo("Personagem", new Color(0.75f, 0.62f, 0.5f));
            var tronco = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            tronco.transform.SetParent(raiz.transform, false);
            tronco.transform.localPosition = new Vector3(0, 0.88f, -0.02f);
            tronco.transform.localScale = new Vector3(0.38f, 0.36f, 0.26f);
            tronco.GetComponent<Renderer>().sharedMaterial = mat;
            var cab = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            cab.transform.SetParent(raiz.transform, false);
            cab.transform.localPosition = new Vector3(0, 1.32f, 0);
            cab.transform.localScale = Vector3.one * 0.26f;
            cab.GetComponent<Renderer>().sharedMaterial = mat;
            var c = new GameObject("Cabeca").transform;
            c.SetParent(raiz.transform, false);
            c.localPosition = new Vector3(0, 1.32f, 0);
            return raiz;
        }

        static GameObject CriaBanqueta(Material madeira, Material estofado)
        {
            var b = new GameObject("Banqueta");
            var tampo = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            tampo.name = "Tampo";
            tampo.transform.SetParent(b.transform, false);
            tampo.transform.localPosition = new Vector3(0, 0.50f, 0);
            tampo.transform.localScale = new Vector3(0.42f, 0.025f, 0.42f);
            tampo.GetComponent<Renderer>().sharedMaterial = estofado;
            Object.Destroy(tampo.GetComponent<Collider>());
            for (int i = 0; i < 4; i++)
            {
                float ang = (i * 90f + 45f) * Mathf.Deg2Rad;
                var perna = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                perna.name = "Perna";
                perna.transform.SetParent(b.transform, false);
                perna.transform.localPosition = new Vector3(Mathf.Cos(ang) * 0.15f, 0.24f, Mathf.Sin(ang) * 0.15f);
                perna.transform.localScale = new Vector3(0.035f, 0.24f, 0.035f);
                perna.GetComponent<Renderer>().sharedMaterial = madeira;
                Object.Destroy(perna.GetComponent<Collider>());
            }
            return b;
        }

        /// <summary>O leque de versos nas mãos, um por carta (até 13: mais que isso não se lê).</summary>
        public void DefineCartas(int n, Material verso)
        {
            n = Mathf.Clamp(n, 0, 13);
            if (n == cartasNoLeque) return;
            bool mudouDeTamanho = cartasNoLeque >= 0;
            cartasNoLeque = n;
            foreach (var c in cartas) Object.Destroy(c);
            cartas.Clear();
            if (leque == null)
            {
                leque = new GameObject("Leque").transform;
                leque.SetParent(tronco, false);
            }
            // as mãos são medidas com o tronco em repouso (o gesto do lance o inclina)
            var giroDoGesto = tronco.localRotation;
            tronco.localRotation = Quaternion.identity;
            Vector3 centro;
            if (maoEsq != null && maoDir != null)
                centro = tronco.InverseTransformPoint((maoEsq.position + maoDir.position) * 0.5f);
            else
                centro = new Vector3(0, 1.0f - AlturaDoQuadril, 0.14f);
            tronco.localRotation = giroDoGesto;
            lequeBase = centro + new Vector3(0, -0.02f, 0.03f);
            leque.localPosition = lequeBase;
            // O lado visível do Quad é o -Z dele: virado 180°, aponta para a mesa.
            leque.localRotation = Quaternion.Euler(-12f, 180f, 0f);

            const float l = 0.088f, a = 0.124f;
            float abertura = n <= 1 ? 0f : Mathf.Min(9f, 70f / n);
            for (int i = 0; i < n; i++)
            {
                var pivo = new GameObject("Carta " + i).transform;
                pivo.SetParent(leque, false);
                pivo.localRotation = Quaternion.Euler(0, 0, (i - (n - 1) / 2f) * -abertura);
                pivo.localPosition = new Vector3(0, 0, -i * 0.0012f);
                var q = GameObject.CreatePrimitive(PrimitiveType.Quad);
                Object.Destroy(q.GetComponent<Collider>());
                q.transform.SetParent(pivo, false);
                q.transform.localPosition = new Vector3(0, a * 0.5f, 0);
                q.transform.localScale = new Vector3(l, a, 1);
                var r = q.GetComponent<Renderer>();
                r.sharedMaterial = verso;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                cartas.Add(pivo.gameObject);
            }
            // o leque dá um pulso quando ganha ou perde carta: é o que o olho pega de longe
            if (mudouDeTamanho && Movimento.Ligado) pulsoDesde = Time.time;
        }

        public void Feliz() => puloDesde = Time.time;
        public void Bravo() => balancoDesde = Time.time;
        public void Triste() => tristeDesde = Time.time;
        public void Comemora() => festaDesde = Time.time;
        /// <summary>O gesto de pegar ou soltar uma carta: o tronco vai à mesa e volta.</summary>
        public void Lance() { if (Movimento.Ligado) lanceDesde = Time.time; }

        public void Atualizar(float dt)
        {
            float t = Time.time;
            // a vez é dele: chega 5,5 cm para a frente e ergue o leque 6 cm
            avanco = Mathf.Lerp(avanco, EhVez ? 1f : 0f, 1f - Mathf.Exp(-dt * 6f));

            // vira para quem está jogando (até 0,25 rad), suave
            float alvoGiro = 0f;
            if (OlharPara.HasValue)
            {
                Vector3 local = Raiz.InverseTransformPoint(OlharPara.Value);
                alvoGiro = Mathf.Clamp(Mathf.Atan2(local.x, Mathf.Max(0.05f, local.z)), -0.25f, 0.25f);
            }
            giro = Mathf.Lerp(giro, alvoGiro, 1f - Mathf.Exp(-dt * 3f));

            float pulo = 0f;
            float dp = t - puloDesde;
            if (dp >= 0f && dp < 0.7f) pulo = Mathf.Abs(Mathf.Sin(dp / 0.7f * Mathf.PI * 2f)) * 0.045f;

            float balanco = 0f;
            float db = t - balancoDesde;
            if (db >= 0f && db < 0.9f) balanco = Mathf.Sin(db / 0.9f * Mathf.PI * 4f) * 0.17f * (1f - db / 0.9f);

            // o lance: vai e volta em 0,42 s
            float lance = 0f;
            float dl = t - lanceDesde;
            if (dl >= 0f && dl < 0.42f) lance = Mathf.Sin(dl / 0.42f * Mathf.PI);

            // triste: murcha em meio segundo, fica, e se recompõe (2,6 s ao todo)
            float triste = 0f;
            float dtr = t - tristeDesde;
            if (dtr >= 0f && dtr < 2.6f) triste = Mathf.SmoothStep(0f, 1f, Mathf.Min(dtr / 0.5f, (2.6f - dtr) / 0.8f));

            // comemora: quatro pulinhos que vão diminuindo, o leque para o alto
            float festa = 0f, alto = 0f;
            float df = t - festaDesde;
            if (df >= 0f && df < 1.7f)
            {
                float k = df / 1.7f;
                festa = Mathf.Abs(Mathf.Sin(k * Mathf.PI * 4f)) * 0.06f * (1f - k * 0.45f);
                alto = Mathf.Sin(k * Mathf.PI);
            }

            float pulso = 0f;
            float dq = t - pulsoDesde;
            if (dq >= 0f && dq < 0.24f) pulso = Mathf.Sin(dq / 0.24f * Mathf.PI);

            float respiro = Mathf.Sin(t * 1.4f + fase) * 0.004f;
            corpo.localPosition = new Vector3(0, pulo + festa + respiro - triste * 0.025f, avanco * 0.055f - Mathf.Abs(balanco) * 0.08f);
            corpo.localRotation = Quaternion.Euler(0, giro * Mathf.Rad2Deg, balanco * Mathf.Rad2Deg);
            // inclinar para a frente (+X) leva a cabeça à mesa; para trás, na festa
            tronco.localRotation = Quaternion.Euler(lance * 9f + triste * 8f - alto * 5f, 0f, 0f);
            if (leque != null)
            {
                leque.localPosition = lequeBase + new Vector3(0, avanco * 0.06f + alto * 0.10f - triste * 0.05f, lance * 0.03f);
                float s = 1f + pulso * 0.12f;
                leque.localScale = new Vector3(s, s, s);
            }
        }

        public void Destruir()
        {
            if (Raiz != null) Object.Destroy(Raiz.gameObject);
        }
    }
}
