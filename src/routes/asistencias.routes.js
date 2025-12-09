// Rutas de asistencias protegidas por JWT.
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { registrarDesdeQR, resumenCurso } from '../controllers/asistencias.controller.js';
import { qrRules, resumenRules } from '../middleware/validators.js';
import { handleValidation } from '../middleware/validationResult.js';
import { asyncHandler } from '../middleware/errors.js';

const router = Router();
router.post('/qr', authRequired, qrRules, handleValidation, asyncHandler(registrarDesdeQR));
router.get('/resumen', authRequired, resumenRules, handleValidation, asyncHandler(resumenCurso));

export default router;
