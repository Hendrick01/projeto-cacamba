using UnityEngine;

namespace Cacamba.Efeitos
{
    /// <summary>
    /// "Animações" do menu: com ele desligado as cartas não voam e os
    /// personagens não fazem o gesto do lance — a mesa troca de estado direto,
    /// como era antes. Para quem enjoa com movimento ou joga num aparelho fraco.
    /// </summary>
    public static class Movimento
    {
        const string Chave = "cacamba-movimento";
        static bool? ligado;

        public static bool Ligado
        {
            get => ligado ??= PlayerPrefs.GetInt(Chave, 1) == 1;
            set
            {
                ligado = value;
                PlayerPrefs.SetInt(Chave, value ? 1 : 0);
                PlayerPrefs.Save();
            }
        }
    }
}
