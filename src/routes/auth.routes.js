// Rutas de autenticacion.
import { Router } from 'express';
import { login, changePassword, requestPasswordReset } from '../controllers/auth.controller.js';
import { changePasswordRules, loginRules, requestPasswordResetRules } from '../middleware/validators.js';
import { handleValidation } from '../middleware/validationResult.js';
import { asyncHandler } from '../middleware/errors.js';
import { rateLimitLogin, rateLimitPasswordReset } from '../middleware/rateLimit.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.post('/login', rateLimitLogin(), loginRules, handleValidation, asyncHandler(login));
router.post('/reset-password', rateLimitPasswordReset(), requestPasswordResetRules, handleValidation, asyncHandler(requestPasswordReset));
router.post('/change-password', authRequired, changePasswordRules, handleValidation, asyncHandler(changePassword));
export default router;
