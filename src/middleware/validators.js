// Reglas de validacion para rutas REST.
import { body, query, param } from 'express-validator';

export const loginRules = [
  body('email').isEmail().withMessage('Email invalido'),
  body('password').isString().isLength({ min: 4 }).withMessage('Password invalido')
];

export const qrRules = [
  body('qr').isString().notEmpty(),
  body('cursoId').isInt({ min: 1 }),
  body('fecha').isISO8601().toDate(),
  body('presente').optional().isBoolean()
];

export const crearCursoRules = [body('nombre').isString().notEmpty()];
export const actualizarCursoRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().notEmpty(),
  body('docenteIds').optional().isArray()
];
export const crearEstudianteRules = [
  body('nombres').isString().notEmpty(),
  body('apellidos').isString().notEmpty(),
  body('qr').isString().notEmpty().isLength({ max: 255 }),
  body('cursoId').isInt({ min: 1 })
];
export const crearPeriodoRules = [
  body('nombre').isString().notEmpty(),
  body('fechaInicio').isISO8601(),
  body('fechaFin').isISO8601()
];

export const actualizarPeriodoRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().notEmpty(),
  body('fechaInicio').optional().isISO8601(),
  body('fechaFin').optional().isISO8601()
];

export const resumenRules = [
  query('cursoId').isInt({ min: 1 }),
  query('periodoId').isInt({ min: 1 }),
  query('totalClases').optional().isInt({ min: 0 })
];
