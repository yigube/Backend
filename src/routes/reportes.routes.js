// Rutas de reportes protegidas por JWT.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/authz.js';
import { exportarCSV, obtenerDashboardReportes } from '../controllers/reportes.controller.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();
router.get('/dashboard', authRequired, requireRole('admin', 'rector', 'coordinador'), asyncHandler(obtenerDashboardReportes));
router.get('/asistencias.csv', authRequired, asyncHandler(exportarCSV));
export default router;
