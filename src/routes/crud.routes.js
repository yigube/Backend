// Rutas CRUD basicas (cursos, estudiantes, periodos) con roles.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/authz.js';
import {
  crearCurso,
  listarCursos,
  crearEstudiante,
  listarEstudiantes,
  crearPeriodo,
  listarPeriodos,
  listarDocentes,
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
  eliminarDocente
} from '../controllers/crud.controller.js';
import { crearCursoRules, actualizarCursoRules, crearEstudianteRules, crearPeriodoRules, actualizarPeriodoRules, crearColegioRules, actualizarColegioRules, crearDocenteRules, actualizarDocenteRules } from '../middleware/validators.js';
import { handleValidation } from '../middleware/validationResult.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();
router.post('/cursos', authRequired, requireRole('admin', 'rector', 'coordinador'), crearCursoRules, handleValidation, asyncHandler(crearCurso));
router.get('/cursos', authRequired, asyncHandler(listarCursos));
router.put('/cursos/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), actualizarCursoRules, handleValidation, asyncHandler(actualizarCurso));
router.delete('/cursos/:id', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(eliminarCurso));

router.post('/estudiantes', authRequired, requireRole('admin'), crearEstudianteRules, handleValidation, asyncHandler(crearEstudiante));
router.get('/estudiantes', authRequired, asyncHandler(listarEstudiantes));
router.get('/docentes', authRequired, asyncHandler(listarDocentes));

router.post('/periodos', authRequired, requireRole('admin'), crearPeriodoRules, handleValidation, asyncHandler(crearPeriodo));
router.get('/periodos', authRequired, asyncHandler(listarPeriodos));
router.put('/periodos/:id', authRequired, requireRole('admin'), actualizarPeriodoRules, handleValidation, asyncHandler(actualizarPeriodo));
router.delete('/periodos/:id', authRequired, requireRole('admin'), asyncHandler(eliminarPeriodo));

router.post('/curso-docentes/seed', authRequired, requireRole('admin'), asyncHandler(seedCursoDocente));
router.get('/colegios', authRequired, requireRole('admin'), asyncHandler(listarColegios));
router.post('/colegios', authRequired, requireRole('admin'), crearColegioRules, handleValidation, asyncHandler(crearColegio));
router.put('/colegios/:id', authRequired, requireRole('admin'), actualizarColegioRules, handleValidation, asyncHandler(actualizarColegio));
router.delete('/colegios/:id', authRequired, requireRole('admin'), asyncHandler(eliminarColegio));
router.post('/docentes', authRequired, requireRole('admin'), crearDocenteRules, handleValidation, asyncHandler(crearDocente));
router.put('/docentes/:id', authRequired, requireRole('admin'), actualizarDocenteRules, handleValidation, asyncHandler(actualizarDocente));
router.delete('/docentes/:id', authRequired, requireRole('admin'), asyncHandler(eliminarDocente));

export default router;
