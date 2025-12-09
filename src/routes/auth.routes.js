// Rutas de autenticacion.
import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';
import { loginRules } from '../middleware/validators.js';
import { handleValidation } from '../middleware/validationResult.js';
import { asyncHandler } from '../middleware/errors.js';
import { rateLimitLogin } from '../middleware/rateLimit.js';

const router = Router();
router.post('/login', rateLimitLogin(), loginRules, handleValidation, asyncHandler(login));
export default router;
