// Fachada de compatibilidad para mantener rutas y contratos mientras se divide por dominios.

export {
  actualizarColegio,
  crearColegio,
  eliminarColegio,
  listarColegios
} from './colegios.controller.js';

export {
  actualizarCurso,
  crearCurso,
  crearSede,
  eliminarCurso,
  eliminarSede,
  listarCursos,
  listarCursosPorColegio,
  listarSedes,
  seedCursoDocente,
  actualizarSede
} from './cursos.controller.js';

export {
  actualizarDocente,
  crearDocente,
  eliminarDocente,
  listarCursosDisponiblesDocente,
  listarDocentes,
  resetearClaveDocente
} from './docentes.controller.js';

export {
  actualizarEstudiante,
  crearEstudiante,
  crearEstudiantesLote,
  eliminarEstudiante,
  listarEstudiantes
} from './estudiantes.controller.js';

export {
  actualizarPeriodo,
  crearPeriodo,
  eliminarPeriodo,
  listarPeriodos
} from './periodos.controller.js';
