import { Op } from 'sequelize';
import { CursoDocente, DocenteCursoMateria, EstudianteMateria, Materia, Sede } from '../models/index.js';

export const NIVEL_VALUES = ['primaria', 'secundaria'];

export const isDocente = (req) => req.user?.rol === 'docente';

export const normalizedSchoolId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const getUserSchoolId = (req) => normalizedSchoolId(req.user?.schoolId);

export const canManageAcrossSchools = (req) => req.user?.rol === 'admin' && !normalizedSchoolId(req.user?.schoolId);

export const resolveManagedSchoolId = (req, explicitValue = null) => {
  const explicitSchoolId = normalizedSchoolId(explicitValue);
  if (canManageAcrossSchools(req)) return explicitSchoolId || getUserSchoolId(req);
  return getUserSchoolId(req);
};

export const ensureManagedSchoolId = (req, res, explicitValue = null) => {
  const schoolId = resolveManagedSchoolId(req, explicitValue);
  if (schoolId) return schoolId;
  res.status(400).json({ error: 'schoolId requerido para administradores' });
  return null;
};

export const normalizedIds = (values) => {
  if (!Array.isArray(values)) return [];
  const set = new Set();
  values.forEach((value) => {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) set.add(n);
  });
  return Array.from(set);
};

export const normalizeMateriaKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const normalizeNivel = (value) => {
  const nivel = String(value || '').trim().toLowerCase();
  return NIVEL_VALUES.includes(nivel) ? nivel : null;
};

export const normalizeSedeId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const resolveSedeForSchool = async ({ schoolId, sedeId, transaction } = {}) => {
  const normalizedSchool = normalizedSchoolId(schoolId);
  const normalizedSede = normalizeSedeId(sedeId);
  if (!normalizedSchool || !normalizedSede) return null;
  return Sede.findOne({
    where: { id: normalizedSede, schoolId: normalizedSchool },
    transaction
  });
};

export const getDocenteCursoIds = async ({ req, schoolId = getUserSchoolId(req), transaction } = {}) => {
  if (!isDocente(req)) return [];
  const where = { usuarioId: req.user.id };
  if (schoolId) where.schoolId = schoolId;
  const rows = await CursoDocente.findAll({
    where,
    attributes: ['cursoId'],
    transaction,
    raw: true
  });
  return Array.from(new Set(
    rows
      .map((item) => Number(item?.cursoId))
      .filter((id) => Number.isInteger(id) && id > 0)
  ));
};

export const docenteTieneCursoAsignado = async ({ req, cursoId, schoolId = getUserSchoolId(req), transaction } = {}) => {
  if (!isDocente(req)) return true;
  const parsedCursoId = Number(cursoId);
  if (!Number.isInteger(parsedCursoId) || parsedCursoId <= 0) return false;
  const where = { usuarioId: req.user.id, cursoId: parsedCursoId };
  if (schoolId) where.schoolId = schoolId;
  const assigned = await CursoDocente.findOne({
    where,
    attributes: ['cursoId'],
    transaction
  });
  return Boolean(assigned);
};

export const getDocenteMateriaIdsByCurso = async ({ req, cursoIds = [], schoolId = getUserSchoolId(req), transaction } = {}) => {
  if (!isDocente(req)) return new Map();
  const normalizedCursoIds = normalizedIds(cursoIds);
  if (!normalizedCursoIds.length) return new Map();
  const where = {
    usuarioId: req.user.id,
    cursoId: { [Op.in]: normalizedCursoIds }
  };
  if (schoolId) where.schoolId = schoolId;
  const rows = await DocenteCursoMateria.findAll({
    where,
    attributes: ['cursoId', 'materiaId'],
    transaction,
    raw: true
  });
  const materiaIdsByCurso = new Map();
  rows.forEach((item) => {
    const cursoId = Number(item?.cursoId);
    const materiaId = Number(item?.materiaId);
    if (!Number.isInteger(cursoId) || cursoId <= 0 || !Number.isInteger(materiaId) || materiaId <= 0) return;
    if (!materiaIdsByCurso.has(cursoId)) materiaIdsByCurso.set(cursoId, new Set());
    materiaIdsByCurso.get(cursoId).add(materiaId);
  });
  return materiaIdsByCurso;
};

export const filterVisibleEstudiantesForDocente = async ({ req, schoolId = getUserSchoolId(req), estudiantes = [], transaction } = {}) => {
  if (!isDocente(req)) return { estudiantes, materiaLinks: [] };
  const cursoIds = normalizedIds(estudiantes.map((item) => item?.cursoId));
  if (!cursoIds.length) return { estudiantes: [], materiaLinks: [] };

  const materiaIdsByCurso = await getDocenteMateriaIdsByCurso({ req, cursoIds, schoolId, transaction });
  if (!materiaIdsByCurso.size) return { estudiantes: [], materiaLinks: [] };

  const estudianteIds = normalizedIds(estudiantes.map((item) => item?.id));
  if (!estudianteIds.length) return { estudiantes: [], materiaLinks: [] };

  const materiaLinks = await EstudianteMateria.findAll({
    where: {
      estudianteId: { [Op.in]: estudianteIds },
      cursoId: { [Op.in]: cursoIds },
      ...(schoolId ? { schoolId } : {})
    },
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }],
    transaction
  });

  const materiaLinksByEstudiante = new Map();
  materiaLinks.forEach((link) => {
    const estudianteId = Number(link?.estudianteId);
    if (!Number.isInteger(estudianteId) || estudianteId <= 0) return;
    const current = materiaLinksByEstudiante.get(estudianteId) || [];
    current.push(link);
    materiaLinksByEstudiante.set(estudianteId, current);
  });

  const estudianteIdsVisibles = new Set();
  const materiaLinksFiltrados = [];
  materiaLinksByEstudiante.forEach((rows, estudianteId) => {
    const hasRows = rows.length > 0;
    const docenteComparteAlgunaMateria = hasRows && rows.some((link) => {
      const cursoId = Number(link?.cursoId);
      const materiaId = Number(link?.materiaId);
      const materiaIds = materiaIdsByCurso.get(cursoId);
      return Boolean(materiaIds && materiaIds.has(materiaId));
    });
    if (!docenteComparteAlgunaMateria) return;
    estudianteIdsVisibles.add(estudianteId);
    materiaLinksFiltrados.push(...rows.filter((link) => {
      const cursoId = Number(link?.cursoId);
      const materiaId = Number(link?.materiaId);
      const materiaIds = materiaIdsByCurso.get(cursoId);
      return Boolean(materiaIds && materiaIds.has(materiaId));
    }));
  });

  return {
    estudiantes: estudiantes.filter((item) => estudianteIdsVisibles.has(Number(item?.id))),
    materiaLinks: materiaLinksFiltrados
  };
};

export const docentePuedeGestionarEstudiante = async ({ req, estudiante, schoolId = getUserSchoolId(req), transaction } = {}) => {
  if (!isDocente(req)) return true;
  if (!estudiante?.id || !estudiante?.cursoId) return false;
  const materiaIdsByCurso = await getDocenteMateriaIdsByCurso({
    req,
    cursoIds: [estudiante.cursoId],
    schoolId,
    transaction
  });
  const materiaIds = materiaIdsByCurso.get(Number(estudiante.cursoId));
  if (!materiaIds || !materiaIds.size) return false;

  const rows = await EstudianteMateria.findAll({
    where: {
      estudianteId: estudiante.id,
      cursoId: estudiante.cursoId,
      ...(schoolId ? { schoolId } : {})
    },
    attributes: ['materiaId'],
    transaction,
    raw: true
  });

  return rows.length > 0 && rows.every((item) => materiaIds.has(Number(item?.materiaId)));
};

export const generateTemporaryPassword = (length = 10) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let next = '';
  for (let i = 0; i < length; i += 1) {
    next += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return next;
};

export const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return null;
  const nextValue = String(value).trim();
  return nextValue || null;
};

export const mapUniqueConstraintMessage = (error) => {
  const paths = Array.isArray(error?.errors)
    ? error.errors.map((item) => String(item.path || '').toLowerCase())
    : [];
  if (paths.some((path) => path.includes('codigo') || path.includes('dane'))) return 'El codigo DANE ya existe';
  if (paths.some((path) => path.includes('correo') || path.includes('email'))) return 'El correo del rector ya existe';
  if (paths.some((path) => path.includes('cedula'))) return 'La cedula del rector ya existe';
  if (paths.some((path) => path.includes('telefono'))) return 'El telefono del rector ya existe';
  if (paths.some((path) => path.includes('qr'))) return 'El codigo QR ya existe';
  if (paths.some((path) => path.includes('codigo_estudiante') || path.includes('codigoestudiante'))) {
    return 'El codigo del estudiante ya existe';
  }
  return 'Ya existe un registro con uno de los datos unicos';
};
