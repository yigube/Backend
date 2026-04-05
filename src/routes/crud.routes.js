// Rutas CRUD basicas (cursos, estudiantes, periodos) con roles.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/authz.js';
import {
  crearCurso,
  listarCursos,
  crearEstudiante,
  crearEstudiantesLote,
  listarEstudiantes,
  actualizarEstudiante,
  eliminarEstudiante,
  crearPeriodo,
  listarPeriodos,
  listarDocentes,
  listarCursosDisponiblesDocente,
  listarCursosPorColegio,
  actualizarCurso,
  eliminarCurso,
  actualizarPeriodo,
  eliminarPeriodo,
  seedCursoDocente,
  listarColegios,
  crearColegio,
  actualizarColegio,
  eliminarColegio,
  crearDocente,
  actualizarDocente,
  eliminarDocente,
  resetearClaveDocente
} from '../controllers/crud.controller.js';
import { crearCursoRules, actualizarCursoRules, crearEstudianteRules, crearEstudiantesLoteRules, actualizarEstudianteRules, eliminarEstudianteRules, crearPeriodoRules, actualizarPeriodoRules, crearColegioRules, actualizarColegioRules, listarCursosColegioRules, crearDocenteRules, actualizarDocenteRules, resetDocentePasswordRules } from '../middleware/validators.js';
import { handleValidation } from '../middleware/validationResult.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();
router.post('/cursos', authRequired, requireRole('admin', 'rector', 'coordinador'), crearCursoRules, handleValidation, asyncHandler(crearCurso));
router.get('/cursos', authRequired, asyncHandler(listarCursos));
router.put('/cursos/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), actualizarCursoRules, handleValidation, asyncHandler(actualizarCurso));
router.delete('/cursos/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(eliminarCurso));

router.post('/estudiantes', authRequired, requireRole('admin', 'docente'), crearEstudianteRules, handleValidation, asyncHandler(crearEstudiante));
router.post('/estudiantes/lote', authRequired, requireRole('admin', 'docente'), crearEstudiantesLoteRules, handleValidation, asyncHandler(crearEstudiantesLote));
router.get('/estudiantes', authRequired, asyncHandler(listarEstudiantes));
router.put('/estudiantes/:id', authRequired, requireRole('admin', 'docente'), actualizarEstudianteRules, handleValidation, asyncHandler(actualizarEstudiante));
router.delete('/estudiantes/:id', authRequired, requireRole('admin', 'docente'), eliminarEstudianteRules, handleValidation, asyncHandler(eliminarEstudiante));
router.get('/docentes', authRequired, asyncHandler(listarDocentes));
router.get('/docentes/cursos-disponibles', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(listarCursosDisponiblesDocente));

router.post('/periodos', authRequired, requireRole('admin', 'rector', 'coordinador'), crearPeriodoRules, handleValidation, asyncHandler(crearPeriodo));
router.get('/periodos', authRequired, asyncHandler(listarPeriodos));
router.put('/periodos/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), actualizarPeriodoRules, handleValidation, asyncHandler(actualizarPeriodo));
router.delete('/periodos/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(eliminarPeriodo));

router.post('/curso-docentes/seed', authRequired, requireRole('admin'), asyncHandler(seedCursoDocente));
router.get('/colegios', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(listarColegios));
router.get('/colegios/:schoolId/cursos', authRequired, requireRole('admin', 'rector', 'coordinador'), listarCursosColegioRules, handleValidation, asyncHandler(listarCursosPorColegio));
router.post('/colegios', authRequired, requireRole('admin'), crearColegioRules, handleValidation, asyncHandler(crearColegio));
router.put('/colegios/:id', authRequired, requireRole('admin'), actualizarColegioRules, handleValidation, asyncHandler(actualizarColegio));
router.delete('/colegios/:id', authRequired, requireRole('admin'), asyncHandler(eliminarColegio));
router.post('/docentes', authRequired, requireRole('admin', 'rector', 'coordinador'), crearDocenteRules, handleValidation, asyncHandler(crearDocente));
router.put('/docentes/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), actualizarDocenteRules, handleValidation, asyncHandler(actualizarDocente));
router.delete('/docentes/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(eliminarDocente));
router.post('/docentes/:id/reset-password', authRequired, requireRole('admin'), resetDocentePasswordRules, handleValidation, asyncHandler(resetearClaveDocente));

export default router;
