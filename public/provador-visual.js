import './provador.js';
import { instalaVisual3d } from './visual3d.js';
// O provador recebe a mesma luz/material, sem micromovimentos de cabeca ou
// piscadas: o trabalho de dedos/rig precisa de uma pose de referencia estavel.
try { instalaVisual3d(window.provador, { modo: 'provador', animar: false }); }
catch (erro) { console.error('Acabamento visual indisponivel; provador base preservado.', erro); }
