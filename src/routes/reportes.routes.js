// Rutas de reportes protegidas por JWT.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { exportarCSV } from '../controllers/reportes.controller.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();
router.get('/asistencias.csv', authRequired, asyncHandler(exportarCSV));
export default router;
