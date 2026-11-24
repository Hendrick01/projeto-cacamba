using System.Collections.Generic;

namespace Cacamba.Modelo
{
    /// <summary>
    /// O elenco — espelho de shared/elenco.js. O servidor recusa qualquer slug
    /// fora da lista dele, então acrescentar alguém aqui sem acrescentar lá não
    /// funciona (e vice-versa: personagem novo no site precisa da arte e do
    /// modelo copiados com scripts/unity_assets.py).
    /// </summary>
    public static class Elenco
    {
        public sealed class Personagem
        {
            public string Slug, Nome, Traco;
        }

        public static readonly List<Personagem> Todos = new List<Personagem>
        {
            new Personagem { Slug = "gabizinsky", Nome = "Gabizinsky", Traco = "Cabelo cereja, body azul e corrente de prata na cintura." },
            new Personagem { Slug = "dri", Nome = "Dri", Traco = "Preto sobre preto, jaqueta de couro e duas mechas de mel." },
            new Personagem { Slug = "esterex", Nome = "EstereX", Traco = "Cropped vermelho, jeans branca e óculos dourados. A mais alta." },
            new Personagem { Slug = "matheus", Nome = "Matheus", Traco = "Camisa tricolor listrada, colar de ouro e tênis preto." },
            new Personagem { Slug = "mafra-kitty", Nome = "Mafra Kitty", Traco = "Camisa branca de gatinho, jeans e tênis branco. Uma argola só." },
            new Personagem { Slug = "junior", Nome = "Junior", Traco = "Preto de cima a baixo, laterais raspadas e um cristal no cordão." },
            new Personagem { Slug = "lyly", Nome = "Lyly", Traco = "Cabelo rosa, vestido longo de florzinhas e piercing no canto da boca." },
            new Personagem { Slug = "mufasa", Nome = "Mufasa", Traco = "Cachos na testa, óculos de prata e bermuda bege sobre legging preta." },
        };

        public static Personagem De(string slug) => Todos.Find(p => p.Slug == slug);

        /// <summary>Sem escolha, o rosto sai do assento (elenco.js → personagemDoAssento).</summary>
        public static string DoAssento(int assento) => Todos[((assento % Todos.Count) + Todos.Count) % Todos.Count].Slug;
    }

    /// <summary>Emotes e frases prontas — espelho de shared/emotes.js (só a chave viaja).</summary>
    public static class Emotes
    {
        public sealed class Emote
        {
            public string Chave, Texto, Humor;
        }

        // Os emojis do site não existem na fonte do jogo; aqui cada um vira a
        // palavra que ele quer dizer.
        public static readonly List<Emote> Todos = new List<Emote>
        {
            new Emote { Chave = "joinha", Texto = "Joinha!", Humor = "feliz" },
            new Emote { Chave = "negativo", Texto = "Negativo.", Humor = "bravo" },
            new Emote { Chave = "sua-vez", Texto = "É você!" },
            new Emote { Chave = "palmas", Texto = "Palmas!", Humor = "feliz" },
            new Emote { Chave = "pisca", Texto = "Piscadinha", Humor = "feliz" },
            new Emote { Chave = "riso", Texto = "Hahaha", Humor = "feliz" },
            new Emote { Chave = "lingua", Texto = "Linguinha", Humor = "feliz" },
            new Emote { Chave = "sono", Texto = "Zzz…" },
            new Emote { Chave = "bora", Texto = "Bora!" },
            new Emote { Chave = "demora", Texto = "Demora demais…" },
            new Emote { Chave = "quer-tudo", Texto = "Quer tudo também" },
            new Emote { Chave = "faz-certo", Texto = "Faz as coisa certo…", Humor = "bravo" },
            new Emote { Chave = "muito-bem", Texto = "Muito que bem mesmo", Humor = "feliz" },
            new Emote { Chave = "perdao", Texto = "Perdão?", Humor = "bravo" },
            new Emote { Chave = "nojo", Texto = "Nojo!", Humor = "feliz" },
            new Emote { Chave = "kkk", Texto = "Kkkkk", Humor = "feliz" },
        };

        public static Emote De(string chave) => Todos.Find(e => e.Chave == chave);
    }
}
