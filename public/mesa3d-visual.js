import './mesa3d.js';
import { instalaVisual3d } from './visual3d.js';
// O modulo principal terminou a inicializacao antes desta integracao.
try { instalaVisual3d(window.mesa3d); }
catch (erro) { console.error('Acabamento visual indisponivel; mesa base preservada.', erro); }
