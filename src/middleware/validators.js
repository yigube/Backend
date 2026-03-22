// Reglas de validacion para rutas REST.
import { body, query, param } from 'express-validator';

export const loginRules = [
  body('email').isEmail().withMessage('Email invalido'),
  body('password').isString().isLength({ min: 4 }).withMessage('Password invalido')
];

export const qrRules = [
  body('qr').isString().notEmpty(),
  body('cursoId').isInt({ min: 1 }),
  body('fecha').isISO8601(),
  body('presente').optional().isBoolean(),
  body('tarde').optional().isBoolean(),
  body('afuera').optional().isBoolean(),
  body('ausente').optional().isBoolean(),
  body('estado').optional().isIn(['presente', 'tarde', 'afuera', 'ausente'])
];

export const crearCursoRules = [
  body('nombre').isString().notEmpty(),
  body('schoolId').optional().isInt({ min: 1 })
];
export const actualizarCursoRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().notEmpty(),
  body('docenteIds').optional().isArray()
];
export const crearEstudianteRules = [
  body('nombres').isString().notEmpty(),
  body('apellidos').isString().notEmpty(),
  body('qr').isString().notEmpty().isLength({ max: 255 }),
  body('codigoEstudiante').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('cursoId').isInt({ min: 1 })
];

export const crearEstudiantesLoteRules = [
  body('cursoId').isInt({ min: 1 }),
  body('estudiantes').isArray({ min: 1 }),
  body('estudiantes.*.nombres').isString().notEmpty(),
  body('estudiantes.*.apellidos').isString().notEmpty(),
  body('estudiantes.*.qr').isString().notEmpty().isLength({ max: 255 }),
  body('estudiantes.*.codigoEstudiante').optional({ values: 'falsy' }).isString().isLength({ max: 100 })
];
export const actualizarEstudianteRules = [
  param('id').isInt({ min: 1 }),
  body('nombres').optional().isString().notEmpty(),
  body('apellidos').optional().isString().notEmpty(),
  body('qr').optional().isString().notEmpty().isLength({ max: 255 }),
  body('codigoEstudiante').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('cursoId').optional().isInt({ min: 1 })
];
export const eliminarEstudianteRules = [
  param('id').isInt({ min: 1 })
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

export const crearColegioRules = [
  body('nombre').isString().notEmpty(),
  body('codigoDane').optional({ values: 'falsy' }).isString().isLength({ min: 3, max: 30 }),
  body('rectorNombre').optional({ values: 'falsy' }).isString().isLength({ min: 2, max: 120 }),
  body('rectorApellido').optional({ values: 'falsy' }).isString().isLength({ min: 2, max: 120 }),
  body('rectorCargo').optional({ values: 'falsy' }).isIn(['rector', 'coordinador']).withMessage('Cargo del rector invalido'),
  body('rectorCorreo').optional({ values: 'falsy' }).isEmail().withMessage('Correo del rector invalido'),
  body('rectorTelefono').optional({ values: 'falsy' }).isString().isLength({ min: 7, max: 30 }),
  body('rectorCedula').optional({ values: 'falsy' }).isString().isLength({ min: 5, max: 30 }),
  body('rectorPassword').optional({ values: 'falsy' }).isString().isLength({ min: 4, max: 120 }).withMessage('Password del rector invalido')
];

export const actualizarColegioRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().notEmpty(),
  body('codigoDane').optional({ values: 'falsy' }).isString().isLength({ min: 3, max: 30 }),
  body('rectorNombre').optional({ values: 'falsy' }).isString().isLength({ min: 2, max: 120 }),
  body('rectorApellido').optional({ values: 'falsy' }).isString().isLength({ min: 2, max: 120 }),
  body('rectorCargo').optional({ values: 'falsy' }).isIn(['rector', 'coordinador']).withMessage('Cargo del rector invalido'),
  body('rectorCorreo').optional({ values: 'falsy' }).isEmail().withMessage('Correo del rector invalido'),
  body('rectorTelefono').optional({ values: 'falsy' }).isString().isLength({ min: 7, max: 30 }),
  body('rectorCedula').optional({ values: 'falsy' }).isString().isLength({ min: 5, max: 30 }),
  body('rectorPassword').optional({ values: 'falsy' }).isString().isLength({ min: 4, max: 120 }).withMessage('Password del rector invalido')
];

export const listarCursosColegioRules = [
  param('schoolId').isInt({ min: 1 })
];

export const crearDocenteRules = [
  body('nombre').isString().notEmpty().withMessage('Nombre requerido'),
  body('email').isEmail().withMessage('Email invalido'),
  body('password').isString().isLength({ min: 4 }).withMessage('Password invalido'),
  body('cursoIds').optional().isArray(),
  body('cursoIds.*').optional().isInt({ min: 1 }).withMessage('cursoIds debe contener IDs validos'),
  body('schoolId').optional().isInt({ min: 1 }).withMessage('schoolId invalido')
];

export const actualizarDocenteRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().notEmpty().withMessage('Nombre invalido'),
  body('email').optional().isEmail().withMessage('Email invalido'),
  body('password').optional().isString().isLength({ min: 4 }).withMessage('Password invalido'),
  body('cursoIds').optional().isArray(),
  body('cursoIds.*').optional().isInt({ min: 1 }).withMessage('cursoIds debe contener IDs validos'),
  body('schoolId').optional().isInt({ min: 1 }).withMessage('schoolId invalido')
];
