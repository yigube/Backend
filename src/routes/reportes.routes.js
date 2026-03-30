// Rutas de reportes protegidas por JWT.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/authz.js';
import { exportarCSV, obtenerDashboardReportes, obtenerReporteInasistenciaCurso } from '../controllers/reportes.controller.js';
import { exportarCsvRules, reporteCursoInasistenciasRules } from '../middleware/validators.js';
import { handleValidation } from '../middleware/validationResult.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();
router.get('/dashboard', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(obtenerDashboardReportes));
router.get('/curso-inasistencias', authRequired, requireRole('admin', 'rector', 'coordinador'), reporteCursoInasistenciasRules, handleValidation, asyncHandler(obtenerReporteInasistenciaCurso));
router.get('/asistencias.csv', authRequired, exportarCsvRules, handleValidation, asyncHandler(exportarCSV));
export default router;
