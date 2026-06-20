// Reglas de validacion para rutas REST.
import { body, query, param } from 'express-validator';
const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
const NIVEL_VALUES = ['primaria', 'secundaria'];
const e164Regex = /^\+[1-9]\d{7,14}$/;

const materiasPorCursoValidator = (value) => {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('materiasPorCurso debe ser un objeto');
  }

  for (const [cursoId, materias] of Object.entries(value)) {
    const cursoIdNum = Number(cursoId);
    if (!Number.isInteger(cursoIdNum) || cursoIdNum <= 0) {
      throw new Error('materiasPorCurso contiene un cursoId invalido');
    }
    const isString = typeof materias === 'string';
    const isArray = Array.isArray(materias);
    if (!isString && !isArray) {
      throw new Error('Cada valor de materiasPorCurso debe ser texto o arreglo de textos');
    }
    if (isArray && materias.some((item) => typeof item !== 'string')) {
      throw new Error('El arreglo de materias debe contener solo textos');
    }
  }
  return true;
};

export const loginRules = [
  body('email').isEmail().withMessage('Email invalido'),
  body('password').isString().isLength({ min: 4 }).withMessage('Password invalido')
];

export const changePasswordRules = [
  body('currentPassword').isString().isLength({ min: 4 }).withMessage('Clave actual invalida'),
  body('newPassword')
    .isString().withMessage('Nueva clave invalida')
    .matches(strongPasswordRegex).withMessage('La nueva clave debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial')
];

export const requestPasswordResetRules = [
  body('email').isEmail().withMessage('Email invalido')
];

export const qrRules = [
  body('qr').isString().notEmpty(),
  body('cursoId').isInt({ min: 1 }),
  body('fecha').isISO8601(),
  body('clientRequestId').optional({ values: 'falsy' }).isString().trim().notEmpty().isLength({ max: 120 }),
  body('presente').optional().isBoolean(),
  body('tarde').optional().isBoolean(),
  body('afuera').optional().isBoolean(),
  body('ausente').optional().isBoolean(),
  body('estado').optional().isIn(['presente', 'tarde', 'afuera', 'ausente']),
  body('materia').optional({ values: 'falsy' }).isString().notEmpty().isLength({ max: 255 })
];

export const crearCursoRules = [
  body('nombre').isString().notEmpty(),
  body('schoolId').optional().isInt({ min: 1 }),
  body('sedeId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('sedeId invalido'),
  body('nivel').optional({ values: 'falsy' }).isIn(NIVEL_VALUES).withMessage('nivel invalido')
];
export const actualizarCursoRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().notEmpty(),
  body('docenteIds').optional().isArray(),
  body('sedeId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('sedeId invalido'),
  body('nivel').optional({ values: 'falsy' }).isIn(NIVEL_VALUES).withMessage('nivel invalido')
];
export const crearEstudianteRules = [
  body('nombres').isString().notEmpty(),
  body('apellidos').isString().notEmpty(),
  body('qr').isString().notEmpty().isLength({ max: 255 }),
  body('codigoEstudiante').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('cursoId').isInt({ min: 1 }),
  body('materias').optional().isArray(),
  body('materias.*').optional().isString().notEmpty().isLength({ max: 255 }),
  body('acudiente').optional().isObject().withMessage('acudiente invalido'),
  body('acudiente.nombre').optional({ values: 'falsy' }).isString().trim().isLength({ min: 2, max: 120 }).withMessage('Nombre del acudiente invalido'),
  body('acudiente.telefonoE164').optional({ values: 'falsy' }).isString().trim().matches(e164Regex).withMessage('Telefono WhatsApp invalido. Usa formato E.164, por ejemplo +573001112233'),
  body('acudiente.parentesco').optional({ values: 'falsy' }).isString().trim().isLength({ max: 60 }).withMessage('Parentesco invalido'),
  body('acudiente.whatsappOptIn').optional().isBoolean().withMessage('Consentimiento WhatsApp invalido'),
  body('acudiente.activo').optional().isBoolean().withMessage('Estado del acudiente invalido')
];

export const crearEstudiantesLoteRules = [
  body('cursoId').isInt({ min: 1 }),
  body('estudiantes').isArray({ min: 1 }),
  body('estudiantes.*.nombres').isString().notEmpty(),
  body('estudiantes.*.apellidos').isString().notEmpty(),
  body('estudiantes.*.qr').isString().notEmpty().isLength({ max: 255 }),
  body('estudiantes.*.codigoEstudiante').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('estudiantes.*.acudiente').optional().isObject().withMessage('acudiente invalido'),
  body('estudiantes.*.acudiente.nombre').optional({ values: 'falsy' }).isString().trim().isLength({ min: 2, max: 120 }).withMessage('Nombre del acudiente invalido'),
  body('estudiantes.*.acudiente.telefonoE164').optional({ values: 'falsy' }).isString().trim().matches(e164Regex).withMessage('Telefono WhatsApp invalido. Usa formato E.164, por ejemplo +573001112233'),
  body('estudiantes.*.acudiente.parentesco').optional({ values: 'falsy' }).isString().trim().isLength({ max: 60 }).withMessage('Parentesco invalido'),
  body('estudiantes.*.acudiente.whatsappOptIn').optional().isBoolean().withMessage('Consentimiento WhatsApp invalido'),
  body('estudiantes.*.acudiente.activo').optional().isBoolean().withMessage('Estado del acudiente invalido'),
  body('materias').optional().isArray(),
  body('materias.*').optional().isString().notEmpty().isLength({ max: 255 })
];
export const actualizarEstudianteRules = [
  param('id').isInt({ min: 1 }),
  body('nombres').optional().isString().notEmpty(),
  body('apellidos').optional().isString().notEmpty(),
  body('qr').optional().isString().notEmpty().isLength({ max: 255 }),
  body('codigoEstudiante').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('cursoId').optional().isInt({ min: 1 }),
  body('materias').optional().isArray(),
  body('materias.*').optional().isString().notEmpty().isLength({ max: 255 }),
  body('acudiente').optional().isObject().withMessage('acudiente invalido'),
  body('acudiente.nombre').optional({ values: 'falsy' }).isString().trim().isLength({ min: 2, max: 120 }).withMessage('Nombre del acudiente invalido'),
  body('acudiente.telefonoE164').optional({ values: 'falsy' }).isString().trim().matches(e164Regex).withMessage('Telefono WhatsApp invalido. Usa formato E.164, por ejemplo +573001112233'),
  body('acudiente.parentesco').optional({ values: 'falsy' }).isString().trim().isLength({ max: 60 }).withMessage('Parentesco invalido'),
  body('acudiente.whatsappOptIn').optional().isBoolean().withMessage('Consentimiento WhatsApp invalido'),
  body('acudiente.activo').optional().isBoolean().withMessage('Estado del acudiente invalido')
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

export const ausentesRules = [
  query('cursoId').isInt({ min: 1 }),
  query('fecha').optional().isISO8601(),
  query('materia').optional({ values: 'falsy' }).isString().notEmpty().isLength({ max: 255 })
];

export const reporteCursoInasistenciasRules = [
  query('cursoId').isInt({ min: 1 }),
  query('mes').matches(/^\d{4}-\d{2}$/).withMessage('mes invalido'),
  query('fecha').isISO8601().withMessage('fecha invalida')
];

export const exportarCsvRules = [
  query('cursoId').isInt({ min: 1 }),
  query('periodoId').isInt({ min: 1 }),
  query('materia').optional({ values: 'falsy' }).isString().notEmpty().isLength({ max: 255 })
];

const codigoDaneRule = body('codigoDane')
  .optional({ values: 'falsy' })
  .isString().withMessage('Codigo DANE invalido')
  .isLength({ min: 3, max: 30 }).withMessage('Codigo DANE invalido');

const rectorNombreRule = body('rectorNombre')
  .optional({ values: 'falsy' })
  .isString().withMessage('Nombre del rector invalido')
  .isLength({ min: 2, max: 120 }).withMessage('Nombre del rector invalido');

const rectorApellidoRule = body('rectorApellido')
  .optional({ values: 'falsy' })
  .isString().withMessage('Apellido del rector invalido')
  .isLength({ min: 2, max: 120 }).withMessage('Apellido del rector invalido');

const rectorCargoRule = body('rectorCargo')
  .optional({ values: 'falsy' })
  .isIn(['rector', 'coordinador']).withMessage('Cargo del rector invalido');

const rectorCorreoRule = body('rectorCorreo')
  .optional({ values: 'falsy' })
  .isEmail().withMessage('Correo del rector invalido');

const rectorTelefonoRule = body('rectorTelefono')
  .optional({ values: 'falsy' })
  .isString().withMessage('Telefono del rector invalido')
  .isLength({ min: 7, max: 30 }).withMessage('Telefono del rector invalido');

const rectorCedulaRule = body('rectorCedula')
  .optional({ values: 'falsy' })
  .isString().withMessage('Cedula del rector invalida')
  .isLength({ min: 5, max: 30 }).withMessage('Cedula del rector invalida');

const rectorPasswordRule = body('rectorPassword')
  .optional({ values: 'falsy' })
  .isString().withMessage('Password del rector invalido')
  .matches(strongPasswordRegex).withMessage('La clave debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial');
const docenteNombreRegex = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*$/;

export const crearColegioRules = [
  body('nombre').isString().withMessage('Nombre del colegio invalido').notEmpty().withMessage('Nombre del colegio invalido'),
  body('codigoDane')
    .isString().withMessage('Codigo DANE invalido')
    .trim()
    .notEmpty().withMessage('Codigo DANE requerido')
    .isLength({ min: 3, max: 30 }).withMessage('Codigo DANE invalido'),
  body('rectorNombre')
    .isString().withMessage('Nombre del rector invalido')
    .trim()
    .notEmpty().withMessage('Nombre del rector requerido')
    .isLength({ min: 2, max: 120 }).withMessage('Nombre del rector invalido'),
  body('rectorApellido')
    .isString().withMessage('Apellido del rector invalido')
    .trim()
    .notEmpty().withMessage('Apellido del rector requerido')
    .isLength({ min: 2, max: 120 }).withMessage('Apellido del rector invalido'),
  body('rectorCargo')
    .optional({ values: 'falsy' })
    .isIn(['rector', 'coordinador']).withMessage('Cargo del rector invalido'),
  body('rectorCorreo')
    .isEmail().withMessage('Correo del rector invalido'),
  body('rectorTelefono')
    .optional({ values: 'falsy' })
    .isString().withMessage('Telefono del rector invalido')
    .trim()
    .isLength({ min: 7, max: 30 }).withMessage('Telefono del rector invalido'),
  body('rectorCedula')
    .optional({ values: 'falsy' })
    .isString().withMessage('Cedula del rector invalida')
    .trim()
    .isLength({ min: 5, max: 30 }).withMessage('Cedula del rector invalida'),
  body('rectorPassword')
    .isString().withMessage('Password del rector invalido')
    .matches(strongPasswordRegex).withMessage('La clave debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial')
];

export const actualizarColegioRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().withMessage('Nombre del colegio invalido').notEmpty().withMessage('Nombre del colegio invalido'),
  codigoDaneRule,
  rectorNombreRule,
  rectorApellidoRule,
  rectorCargoRule,
  rectorCorreoRule,
  rectorTelefonoRule,
  rectorCedulaRule,
  rectorPasswordRule
];

export const listarCursosColegioRules = [
  param('schoolId').isInt({ min: 1 })
];

export const crearSedeRules = [
  body('nombre').isString().trim().notEmpty().withMessage('Nombre de sede invalido'),
  body('schoolId').optional().isInt({ min: 1 }).withMessage('schoolId invalido')
];

export const actualizarSedeRules = [
  param('id').isInt({ min: 1 }),
  body('nombre').optional().isString().trim().notEmpty().withMessage('Nombre de sede invalido'),
  body('schoolId').optional().isInt({ min: 1 }).withMessage('schoolId invalido')
];

export const crearDocenteRules = [
  body('nombre')
    .isString().withMessage('Nombre requerido')
    .trim()
    .notEmpty().withMessage('Nombre requerido')
    .matches(docenteNombreRegex).withMessage('El nombre solo puede contener letras y espacios'),
  body('email').isEmail().withMessage('Email invalido'),
  body('password').isString().isLength({ min: 4 }).withMessage('Password invalido'),
  body('password')
    .matches(strongPasswordRegex)
    .withMessage('La clave debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial'),
  body('cursoIds').optional().isArray(),
  body('cursoIds.*').optional().isInt({ min: 1 }).withMessage('cursoIds debe contener IDs validos'),
  body('materiasPorCurso').optional().custom(materiasPorCursoValidator),
  body('schoolId').optional().isInt({ min: 1 }).withMessage('schoolId invalido'),
  body('sedeId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('sedeId invalido'),
  body('nivel').optional({ values: 'falsy' }).isIn(NIVEL_VALUES).withMessage('nivel invalido')
];

export const actualizarDocenteRules = [
  param('id').isInt({ min: 1 }),
  body('nombre')
    .optional()
    .isString().withMessage('Nombre invalido')
    .trim()
    .notEmpty().withMessage('Nombre invalido')
    .matches(docenteNombreRegex).withMessage('El nombre solo puede contener letras y espacios'),
  body('email').optional().isEmail().withMessage('Email invalido'),
  body('password')
    .optional()
    .isString()
    .matches(strongPasswordRegex)
    .withMessage('La clave debe tener minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial'),
  body('cursoIds').optional().isArray(),
  body('cursoIds.*').optional().isInt({ min: 1 }).withMessage('cursoIds debe contener IDs validos'),
  body('materiasPorCurso').optional().custom(materiasPorCursoValidator),
  body('schoolId').optional().isInt({ min: 1 }).withMessage('schoolId invalido'),
  body('sedeId').optional({ values: 'falsy' }).isInt({ min: 1 }).withMessage('sedeId invalido'),
  body('nivel').optional({ values: 'falsy' }).isIn(NIVEL_VALUES).withMessage('nivel invalido')
];

export const resetDocentePasswordRules = [
  param('id').isInt({ min: 1 }).withMessage('id invalido')
];
