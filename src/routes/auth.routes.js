// Rutas de autenticacion.
import { Router } from 'express';
import { login, changePassword } from '../controllers/auth.controller.js';
import { changePasswordRules, loginRules } from '../middleware/validators.js';
import { handleValidation } from '../middleware/validationResult.js';
import { asyncHandler } from '../middleware/errors.js';
import { rateLimitLogin } from '../middleware/rateLimit.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.post('/login', rateLimitLogin(), loginRules, handleValidation, asyncHandler(login));
router.post('/change-password', authRequired, changePasswordRules, handleValidation, asyncHandler(changePassword));
export default router;
