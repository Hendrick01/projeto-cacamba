using UnityEngine;

namespace Cacamba.Mesa
{
    /// <summary>
    /// Marca um objeto da mesa 3D como tocável: o monte, o descarte, o lugar de
    /// alguém ou um jogo baixado. O toque num jogo abre o visor do dono dele
    /// (como o toque no lugar); soltar uma carta arrastada em cima usa o
    /// <see cref="JogoId"/> para encaixar naquele jogo.
    /// </summary>
    public sealed class Alvo : MonoBehaviour
    {
        public enum Qual { Monte, Descarte, Jogador }

        public Qual Tipo;
        public string JogadorId;
        /// <summary>O id do jogo (meld) quando o alvo é um jogo da mesa; −1 nos outros.</summary>
        public int JogoId = -1;

        public void Inicia(Qual tipo, string jogador, int jogo = -1)
        {
            Tipo = tipo;
            JogadorId = jogador;
            JogoId = jogo;
        }
    }
}
