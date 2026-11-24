// O que o navegador sabe do aparelho e o Unity não alcança sozinho.
// Chamado por Scripts/Efeitos/Vibra.cs.
mergeInto(LibraryManager.library, {
  // navigator.vibrate existe no Chrome do Android; o Safari do iPhone não tem.
  // O navegador só deixa vibrar depois de um toque na página — sem ele, a
  // chamada não faz nada, e é isso mesmo que se quer.
  CacambaVibrar: function (ms) {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* sem vibração neste navegador */ }
  },
});
