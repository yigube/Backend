// Middleware para responder errores de validacion.
import { validationResult } from 'express-validator';
export function handleValidation(req, res, next){
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
}
