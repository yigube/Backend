// CRUD basico para cursos, estudiantes y periodos con scope por colegio.
import { ForeignKeyConstraintError, Op, UniqueConstraintError } from 'sequelize';
import bcrypt from 'bcrypt';
import { sequelize } from '../config/database.js';
import {
  Curso,
  Estudiante,
  Periodo,
  Usuario,
  CursoDocente,
  Colegio,
  Rector,
  Materia,
  DocenteCursoMateria
} from '../models/index.js';

const isDocente = (req) => req.user?.rol === 'docente';
const canManageAcrossSchools = (req) => req.user?.rol === 'admin' && !normalizedSchoolId(req.user?.schoolId);
const normalizedSchoolId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const getUserSchoolId = (req) => normalizedSchoolId(req.user?.schoolId);
const resolveManagedSchoolId = (req, explicitValue = null) => {
  const explicitSchoolId = normalizedSchoolId(explicitValue);
  if (canManageAcrossSchools(req)) return explicitSchoolId || getUserSchoolId(req);
  return getUserSchoolId(req);
};
const ensureManagedSchoolId = (req, res, explicitValue = null) => {
  const schoolId = resolveManagedSchoolId(req, explicitValue);
  if (schoolId) return schoolId;
  res.status(400).json({ error: 'schoolId requerido para administradores' });
  return null;
};
const normalizedIds = (values) => {
  if (!Array.isArray(values)) return [];
  const set = new Set();
  values.forEach((value) => {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) set.add(n);
  });
  return Array.from(set);
};
const normalizeMateriasPorCurso = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result = {};

  Object.entries(value).forEach(([cursoIdRaw, materiasRaw]) => {
    const cursoId = Number(cursoIdRaw);
    if (!Number.isInteger(cursoId) || cursoId <= 0) return;

    let materiasList = [];
    if (Array.isArray(materiasRaw)) {
      materiasList = materiasRaw;
    } else if (typeof materiasRaw === 'string') {
      materiasList = materiasRaw.split(',');
    } else {
      return;
    }

    const uniqueMaterias = Array.from(
      new Set(
        materiasList
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    );

    if (uniqueMaterias.length > 0) {
      result[cursoId] = uniqueMaterias;
    }
  });

  return result;
};
const mapMateriasToDocentesCursos = (docentes = [], materiaLinks = []) => {
  const materiasMap = new Map();
  materiaLinks.forEach((link) => {
    const docenteId = Number(link?.usuarioId);
    const cursoId = Number(link?.cursoId);
    const materiaNombre = String(link?.materia?.nombre || '').trim();
    if (!docenteId || !cursoId || !materiaNombre) return;
    const key = `${docenteId}:${cursoId}`;
    const current = materiasMap.get(key) || [];
    if (!current.includes(materiaNombre)) current.push(materiaNombre);
    materiasMap.set(key, current);
  });

  return docentes.map((docente) => {
    const raw = docente.toJSON ? docente.toJSON() : docente;
    const cursos = Array.isArray(raw.cursos) ? raw.cursos : [];
    return {
      ...raw,
      cursos: cursos.map((curso) => {
        const rawCurso = curso?.toJSON ? curso.toJSON() : curso;
        return {
          ...rawCurso,
          materias: materiasMap.get(`${Number(raw.id)}:${Number(rawCurso?.id)}`) || []
        };
      })
    };
  });
};
const syncMateriasDocente = async ({ docenteId, schoolId, cursoIds = [], materiasPorCurso = {} }) => {
  const hasLegacyMateriumId = Object.prototype.hasOwnProperty.call(DocenteCursoMateria.rawAttributes || {}, 'materiumId');
  const cursoIdsValidos = normalizedIds(cursoIds);
  const materiasNormalizadas = normalizeMateriasPorCurso(materiasPorCurso);

  if (cursoIdsValidos.length === 0) {
    await DocenteCursoMateria.destroy({ where: { usuarioId: docenteId, schoolId } });
    return;
  }

  await DocenteCursoMateria.destroy({
    where: {
      usuarioId: docenteId,
      schoolId,
      cursoId: { [Op.notIn]: cursoIdsValidos }
    }
  });

  const desiredPairs = [];
  cursoIdsValidos.forEach((cursoId) => {
    const materias = materiasNormalizadas[cursoId] || [];
    materias.forEach((nombre) => {
      desiredPairs.push({ cursoId, nombre });
    });
  });

  await DocenteCursoMateria.destroy({
    where: {
      usuarioId: docenteId,
      schoolId,
      cursoId: { [Op.in]: cursoIdsValidos }
    }
  });

  if (!desiredPairs.length) return;

  const uniqueNames = Array.from(new Set(desiredPairs.map((item) => item.nombre)));
  const existingMaterias = await Materia.findAll({
    where: { schoolId, nombre: { [Op.in]: uniqueNames } },
    attributes: ['id', 'nombre']
  });
  const existingNames = new Set(existingMaterias.map((item) => item.nombre));
  const missingNames = uniqueNames.filter((name) => !existingNames.has(name));

  if (missingNames.length) {
    await Materia.bulkCreate(
      missingNames.map((nombre) => ({ nombre, schoolId })),
      { ignoreDuplicates: true }
    );
  }

  const materias = await Materia.findAll({
    where: { schoolId, nombre: { [Op.in]: uniqueNames } },
    attributes: ['id', 'nombre']
  });
  const materiaIdByName = new Map(materias.map((item) => [item.nombre, Number(item.id)]));

  const links = desiredPairs
    .map((pair) => {
      const materiaId = materiaIdByName.get(pair.nombre);
      const link = {
        usuarioId: docenteId,
        cursoId: pair.cursoId,
        materiaId,
        schoolId
      };
      // Compatibilidad con esquemas viejos donde Sequelize genero `materiumId`.
      if (hasLegacyMateriumId) link.materiumId = materiaId;
      return link;
    })
    .filter((item) => Number.isInteger(item.materiaId) && item.materiaId > 0);

  if (links.length) {
    await DocenteCursoMateria.bulkCreate(links, { ignoreDuplicates: true });
  }
};
const cleanupUnusedMaterias = async ({ schoolIds = [], transaction } = {}) => {
  const schoolIdsNormalizados = normalizedIds(schoolIds);
  if (!schoolIdsNormalizados.length) return;

  const activeLinks = await DocenteCursoMateria.findAll({
    where: { schoolId: { [Op.in]: schoolIdsNormalizados } },
    attributes: ['materiaId'],
    group: ['materiaId'],
    raw: true,
    transaction
  });
  const materiaIdsActivos = activeLinks
    .map((item) => Number(item?.materiaId))
    .filter((id) => id > 0);

  const where = { schoolId: { [Op.in]: schoolIdsNormalizados } };
  if (materiaIdsActivos.length) {
    where.id = { [Op.notIn]: materiaIdsActivos };
  }

  await Materia.destroy({ where, transaction });
};
const normalizeCodigoDane = (value) => {
  if (!value) return null;
  const v = String(value).trim().toUpperCase();
  return v || null;
};
const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v || null;
};
const mapUniqueConstraintMessage = (e) => {
  const paths = Array.isArray(e?.errors) ? e.errors.map((err) => String(err.path || '').toLowerCase()) : [];
  if (paths.some((p) => p.includes('codigo') || p.includes('dane'))) return 'El codigo DANE ya existe';
  if (paths.some((p) => p.includes('correo'))) return 'El correo del rector ya existe';
  if (paths.some((p) => p.includes('cedula'))) return 'La cedula del rector ya existe';
  if (paths.some((p) => p.includes('telefono'))) return 'El telefono del rector ya existe';
  if (paths.some((p) => p.includes('qr'))) return 'El codigo QR ya existe';
  if (paths.some((p) => p.includes('codigo_estudiante') || p.includes('codigoestudiante'))) return 'El codigo del estudiante ya existe';
  return 'Ya existe un registro con uno de los datos unicos';
};
const buildColegioPayload = (body) => ({
  nombre: normalizeOptionalText(body.nombre),
  codigoDane: normalizeCodigoDane(body.codigoDane)
});
const buildRectorPayload = async (body) => {
  const cargo = normalizeOptionalText(body.rectorCargo)?.toLowerCase();
  const payload = {
    nombre: normalizeOptionalText(body.rectorNombre),
    apellido: normalizeOptionalText(body.rectorApellido),
    correo: normalizeOptionalText(body.rectorCorreo)?.toLowerCase() || null,
    telefono: normalizeOptionalText(body.rectorTelefono),
    cedula: normalizeOptionalText(body.rectorCedula)
  };
  if (cargo === 'rector' || cargo === 'coordinador') {
    payload.cargo = cargo;
  }
  const plainPassword = normalizeOptionalText(body.rectorPassword);
  if (plainPassword) {
    payload.passwordHash = await bcrypt.hash(plainPassword, 10);
  }
  return payload;
};
const hasRectorProfileField = (body) => (
  Object.prototype.hasOwnProperty.call(body, 'rectorNombre')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCargo')
  || Object.prototype.hasOwnProperty.call(body, 'rectorApellido')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCorreo')
  || Object.prototype.hasOwnProperty.call(body, 'rectorTelefono')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCedula')
);
const hasRectorCredentialField = (body) => Object.prototype.hasOwnProperty.call(body, 'rectorPassword');
const hasSomeRectorValue = (rectorPayload) => (
  Boolean(rectorPayload.cargo)
  || Boolean(rectorPayload.nombre)
  || Boolean(rectorPayload.apellido)
  || Boolean(rectorPayload.correo)
  || Boolean(rectorPayload.telefono)
  || Boolean(rectorPayload.cedula)
  || Boolean(rectorPayload.passwordHash)
);
const serializeColegio = (colegio) => {
  const raw = colegio.toJSON ? colegio.toJSON() : colegio;
  const rector = raw.rector || null;
  const rectorPublic = rector ? {
    cargo: rector.cargo ?? null,
    nombre: rector.nombre ?? null,
    apellido: rector.apellido ?? null,
    correo: rector.correo ?? null,
    telefono: rector.telefono ?? null,
    cedula: rector.cedula ?? null
  } : null;
  return {
    ...raw,
    rector: rectorPublic,
    rectorTienePassword: Boolean(rector?.passwordHash),
    rectorCargo: rector?.cargo ?? 'rector',
    rectorNombre: rector?.nombre ?? null,
    rectorApellido: rector?.apellido ?? null,
    rectorCorreo: rector?.correo ?? null,
    rectorTelefono: rector?.telefono ?? null,
    rectorCedula: rector?.cedula ?? null
  };
};

/** Crea un curso asociado al colegio del usuario. Si es docente, queda asignado a el mismo. */
export async function crearCurso(req, res){
  // Admin puede crear en otro colegio; docentes/otros quedan en su propio colegio.
  const schoolId = ensureManagedSchoolId(req, res, req.body.schoolId);
  if (!schoolId) return;
  const curso = await Curso.create({ ...req.body, schoolId });

  if (isDocente(req)) {
    // Si crea un docente, se autoasigna el curso para limitar su visibilidad.
    await curso.addDocente(req.user.id, { through: { schoolId: req.user.schoolId } });
  } else if (Array.isArray(req.body.docenteIds) && req.body.docenteIds.length) {
    const docentes = await Usuario.findAll({
      where: { id: { [Op.in]: req.body.docenteIds }, schoolId, rol: 'docente' }
    });
    await curso.addDocentes(docentes, { through: { schoolId } });
  }

  res.status(201).json(curso);
}

/** Lista cursos del colegio actual. Docente ve solo los asignados. */
export async function listarCursos(req, res){
  const { q, schoolId: querySchool } = req.query;
  const querySchoolId = normalizedSchoolId(querySchool);
  const schoolId = canManageAcrossSchools(req)
    ? (querySchoolId || getUserSchoolId(req))
    : (!isDocente(req) && querySchoolId ? querySchoolId : getUserSchoolId(req));
  const where = {};
  if (schoolId) where.schoolId = schoolId;
  if (q) where.nombre = { [Op.like]: `%${q}%` };

  if (isDocente(req)) {
    // Se filtra por join para asegurar que solo vea cursos asignados.
    const cursos = await Curso.findAll({
      where,
      include: [{
        model: Usuario,
        as: 'docentes',
        attributes: [],
        where: { id: req.user.id },
        through: { attributes: [] }
      }]
    });
    return res.json(cursos);
  }

  res.json(await Curso.findAll({ where }));
}

/** Actualiza nombre (o docenteIds) respetando alcance por escuela y asignacion. */
export async function actualizarCurso(req, res){
  const where = { id: req.params.id };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const curso = await Curso.findOne({ where });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

  if (isDocente(req)) {
    const assigned = await curso.hasDocente(req.user.id);
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

  if (req.body.nombre) curso.nombre = req.body.nombre;
  await curso.save();

  if (!isDocente(req) && Array.isArray(req.body.docenteIds)) {
    // Solo admins pueden reasignar docentes a un curso.
    const docentes = await Usuario.findAll({
      where: { id: { [Op.in]: req.body.docenteIds }, schoolId: curso.schoolId, rol: 'docente' }
    });
    await curso.setDocentes(docentes, { through: { schoolId: curso.schoolId } });
  }

  res.json(curso);
}

/** Elimina curso. Docente solo si esta asignado. */
export async function eliminarCurso(req, res){
  const where = { id: req.params.id };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const curso = await Curso.findOne({ where });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

  if (isDocente(req)) {
    const assigned = await curso.hasDocente(req.user.id);
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

  await curso.destroy();
  res.json({ ok: true });
}

/** Crea un estudiante validando que el curso pertenezca al mismo colegio. */
export async function crearEstudiante(req, res){
  // Garantiza que el curso pertenece al mismo colegio del usuario.
  const curso = await Curso.findOne({
    where: canManageAcrossSchools(req)
      ? { id: req.body.cursoId }
      : { id: req.body.cursoId, schoolId: getUserSchoolId(req) }
  });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  try {
    const obj = await Estudiante.create({
      nombres: normalizeOptionalText(req.body.nombres),
      apellidos: normalizeOptionalText(req.body.apellidos),
      qr: normalizeOptionalText(req.body.qr),
      codigoEstudiante: normalizeOptionalText(req.body.codigoEstudiante),
      cursoId: req.body.cursoId
    });
    return res.status(201).json(obj);
  } catch (e) {
    if (e instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(e) });
    }
    throw e;
  }
}

/** Crea estudiantes en lote dentro del mismo curso/colegio. */
export async function crearEstudiantesLote(req, res) {
  const cursoId = Number(req.body.cursoId);
  const rows = Array.isArray(req.body.estudiantes) ? req.body.estudiantes : [];
  if (!Number.isInteger(cursoId) || cursoId <= 0) {
    return res.status(400).json({ error: 'cursoId invalido' });
  }
  if (rows.length === 0) {
    return res.status(400).json({ error: 'Debes enviar al menos un estudiante' });
  }
  const curso = await Curso.findOne({
    where: canManageAcrossSchools(req)
      ? { id: cursoId }
      : { id: cursoId, schoolId: getUserSchoolId(req) }
  });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

  const payload = rows.map((item, idx) => ({
    row: idx + 1,
    nombres: normalizeOptionalText(item?.nombres),
    apellidos: normalizeOptionalText(item?.apellidos),
    qr: normalizeOptionalText(item?.qr),
    codigoEstudiante: normalizeOptionalText(item?.codigoEstudiante),
    cursoId
  }));

  const invalid = payload.find((item) => !item.nombres || !item.apellidos || !item.qr);
  if (invalid) {
    return res.status(400).json({ error: `Fila ${invalid.row}: nombres, apellidos y qr son requeridos` });
  }

  try {
    const created = await Estudiante.bulkCreate(payload.map(({ row, ...rest }) => rest), { validate: true });
    const createdRows = created.map((item) => ({
      id: item.id,
      nombres: item.nombres,
      apellidos: item.apellidos,
      qr: item.qr,
      codigoEstudiante: item.codigoEstudiante
    }));
    return res.status(201).json({ created: created.length, students: createdRows });
  } catch (e) {
    if (e instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(e) });
    }
    throw e;
  }
}

/** Lista estudiantes del colegio mediante join con cursos. */
export async function listarEstudiantes(req, res){
  // Join con cursos para acotar al colegio del usuario autenticado.
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const schoolId = canManageAcrossSchools(req) ? (querySchoolId || getUserSchoolId(req)) : getUserSchoolId(req);
  const ests = await Estudiante.findAll({
    include: { model: Curso, where: schoolId ? { schoolId } : {}, attributes: [] }
  });
  res.json(ests);
}

/** Actualiza datos de un estudiante del colegio del usuario. */
export async function actualizarEstudiante(req, res) {
  const estudiante = await Estudiante.findOne({
    where: { id: req.params.id },
    include: [{
      model: Curso,
      where: canManageAcrossSchools(req) ? {} : { schoolId: getUserSchoolId(req) },
      attributes: ['id', 'schoolId']
    }]
  });
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' });

  if (Object.prototype.hasOwnProperty.call(req.body, 'cursoId')) {
    const nuevoCursoId = Number(req.body.cursoId);
    if (!Number.isInteger(nuevoCursoId) || nuevoCursoId <= 0) {
      return res.status(400).json({ error: 'cursoId invalido' });
    }
    const cursoDestino = await Curso.findOne({
      where: canManageAcrossSchools(req)
        ? { id: nuevoCursoId }
        : { id: nuevoCursoId, schoolId: getUserSchoolId(req) }
    });
    if (!cursoDestino) return res.status(404).json({ error: 'Curso no encontrado' });
    estudiante.cursoId = nuevoCursoId;
  }

  if (Object.prototype.hasOwnProperty.call(req.body, 'nombres')) {
    estudiante.nombres = normalizeOptionalText(req.body.nombres);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'apellidos')) {
    estudiante.apellidos = normalizeOptionalText(req.body.apellidos);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'qr')) {
    estudiante.qr = normalizeOptionalText(req.body.qr);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'codigoEstudiante')) {
    estudiante.codigoEstudiante = normalizeOptionalText(req.body.codigoEstudiante);
  }

  try {
    await estudiante.save();
    return res.json(estudiante);
  } catch (e) {
    if (e instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(e) });
    }
    throw e;
  }
}

/** Elimina un estudiante del colegio del usuario. */
export async function eliminarEstudiante(req, res) {
  const estudiante = await Estudiante.findOne({
    where: { id: req.params.id },
    include: [{
      model: Curso,
      where: canManageAcrossSchools(req) ? {} : { schoolId: getUserSchoolId(req) },
      attributes: ['id']
    }]
  });
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' });

  await estudiante.destroy();
  return res.json({ ok: true });
}

/** Lista docentes de un colegio (admin puede filtrar por schoolId). */
export async function listarDocentes(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const schoolId = canManageAcrossSchools(req)
    ? (querySchoolId || getUserSchoolId(req))
    : ((!isDocente(req) && querySchoolId) ? querySchoolId : getUserSchoolId(req));
  const docentes = await Usuario.findAll({
    where: schoolId ? { schoolId, rol: 'docente' } : { rol: 'docente' },
    attributes: ['id', 'nombre', 'email', 'schoolId'],
    include: [{
      model: Curso,
      as: 'cursos',
      attributes: ['id', 'nombre', 'schoolId'],
      through: { attributes: [] }
    }]
  });

  const docenteIds = docentes.map((docente) => Number(docente.id)).filter((id) => id > 0);
  const materiaLinks = docenteIds.length
    ? await DocenteCursoMateria.findAll({
      where: schoolId
        ? { schoolId, usuarioId: { [Op.in]: docenteIds } }
        : { usuarioId: { [Op.in]: docenteIds } },
      attributes: ['usuarioId', 'cursoId'],
      include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
    })
    : [];

  res.json(mapMateriasToDocentesCursos(docentes, materiaLinks));
}

/** Lista cursos disponibles para asignar a docentes por colegio (solo admin). */
export async function listarCursosDisponiblesDocente(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const schoolId = canManageAcrossSchools(req)
    ? (querySchoolId || getUserSchoolId(req))
    : getUserSchoolId(req);
  const cursos = await Curso.findAll({
    where: schoolId ? { schoolId } : {},
    attributes: ['id', 'nombre', 'schoolId'],
    order: [['nombre', 'ASC']]
  });
  res.json(cursos);
}

/** Lista todos los cursos de un colegio especifico para interfaces de asignacion. */
export async function listarCursosPorColegio(req, res) {
  const schoolId = normalizedSchoolId(req.params.schoolId);
  if (!schoolId) return res.status(400).json({ error: 'schoolId invalido' });

  if (!canManageAcrossSchools(req) && Number(req.user.schoolId) !== schoolId) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const cursos = await Curso.findAll({
    where: { schoolId },
    attributes: ['id', 'nombre', 'schoolId'],
    order: [['nombre', 'ASC']]
  });
  res.json(cursos);
}

/** Crea un periodo academico en el colegio actual. */
export async function crearPeriodo(req, res){
  const schoolId = ensureManagedSchoolId(req, res, req.body.schoolId);
  if (!schoolId) return;
  const obj = await Periodo.create({ ...req.body, schoolId });
  res.status(201).json(obj);
}

/** Lista periodos del colegio actual. */
export async function listarPeriodos(req, res){
  const schoolId = canManageAcrossSchools(req)
    ? (normalizedSchoolId(req.query.schoolId) || getUserSchoolId(req))
    : getUserSchoolId(req);
  res.json(await Periodo.findAll({ where: schoolId ? { schoolId } : {} }));
}

/** Actualiza datos de un periodo dentro del mismo colegio. */
export async function actualizarPeriodo(req, res){
  const periodo = await Periodo.findOne({
    where: canManageAcrossSchools(req)
      ? { id: req.params.id }
      : { id: req.params.id, schoolId: getUserSchoolId(req) }
  });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

  const { nombre, fechaInicio, fechaFin } = req.body;
  if (nombre) periodo.nombre = nombre;
  if (fechaInicio) periodo.fechaInicio = fechaInicio;
  if (fechaFin) periodo.fechaFin = fechaFin;

  await periodo.save();
  res.json(periodo);
}

/** Elimina un periodo dentro del mismo colegio. */
export async function eliminarPeriodo(req, res){
  const periodo = await Periodo.findOne({
    where: canManageAcrossSchools(req)
      ? { id: req.params.id }
      : { id: req.params.id, schoolId: getUserSchoolId(req) }
  });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });
  try {
    await periodo.destroy();
    return res.json({ ok: true });
  } catch (e) {
    if (e instanceof ForeignKeyConstraintError) {
      return res.status(409).json({ error: 'No se puede eliminar el periodo porque tiene asistencias registradas' });
    }
    throw e;
  }
}

/** Crea un registro de curso_docente de ejemplo dentro del colegio del usuario (admin). */
export async function seedCursoDocente(req, res){
  const schoolId = ensureManagedSchoolId(req, res, req.body.schoolId || req.query.schoolId);
  if (!schoolId) return;
  const curso = await Curso.findOne({ where: { schoolId } });
  if (!curso) return res.status(404).json({ error: 'No hay cursos en este colegio' });

  const docente = await Usuario.findOne({ where: { schoolId, rol: 'docente' } });
  if (!docente) return res.status(404).json({ error: 'No hay docentes en este colegio' });

  const exists = await CursoDocente.findOne({ where: { cursoId: curso.id, usuarioId: docente.id, schoolId } });
  if (exists) return res.json({ created: false, message: 'Ya existe asignacion', data: exists });

  const record = await CursoDocente.create({ cursoId: curso.id, usuarioId: docente.id, schoolId });
  res.status(201).json({ created: true, data: record });
}

/** Lista todos los colegios (solo admin). */
export async function listarColegios(req, res) {
  const where = req.user?.rol === 'admin'
    ? {}
    : { id: req.user?.schoolId };
  const data = await Colegio.findAll({
    where,
    attributes: ['id', 'nombre', 'codigoDane'],
    include: [{
      model: Rector,
      as: 'rector',
      attributes: ['cargo', 'nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
      required: false
    }]
  });
  res.json(data.map(serializeColegio));
}

/** Crea un colegio (solo admin). */
export async function crearColegio(req, res) {
  const colegioPayload = buildColegioPayload(req.body);
  const rectorPayload = await buildRectorPayload(req.body);
  const codigoDane = colegioPayload.codigoDane;
  if (codigoDane) {
    const exists = await Colegio.findOne({ where: { codigoDane } });
    if (exists) return res.status(409).json({ error: 'El codigo DANE ya existe' });
  }
  try {
    const colegio = await Colegio.create(colegioPayload);
    if (hasSomeRectorValue(rectorPayload)) {
      await Rector.create({ schoolId: colegio.id, ...rectorPayload });
    }
    const created = await Colegio.findByPk(colegio.id, {
      attributes: ['id', 'nombre', 'codigoDane'],
      include: [{
        model: Rector,
        as: 'rector',
        attributes: ['cargo', 'nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
        required: false
      }]
    });
    return res.status(201).json(serializeColegio(created));
  } catch (e) {
    if (e instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(e) });
    }
    throw e;
  }
}

/** Actualiza nombre de un colegio (solo admin). */
export async function actualizarColegio(req, res) {
  const colegio = await Colegio.findByPk(req.params.id, {
    include: [{ model: Rector, as: 'rector', required: false }]
  });
  if (!colegio) return res.status(404).json({ error: 'Colegio no encontrado' });
  const colegioPayload = buildColegioPayload(req.body);
  const rectorPayload = await buildRectorPayload(req.body);
  if (colegioPayload.nombre) colegio.nombre = colegioPayload.nombre;
  if (Object.prototype.hasOwnProperty.call(req.body, 'codigoDane')) {
    const codigoDane = colegioPayload.codigoDane;
    if (codigoDane) {
      const exists = await Colegio.findOne({ where: { codigoDane, id: { [Op.ne]: colegio.id } } });
      if (exists) return res.status(409).json({ error: 'El codigo DANE ya existe' });
    }
    colegio.codigoDane = codigoDane;
  }
  try {
    await colegio.save();
    if (hasRectorProfileField(req.body) || hasRectorCredentialField(req.body)) {
      const hasValue = hasSomeRectorValue(rectorPayload);
      const canRemoveRector = hasRectorProfileField(req.body) && !hasRectorCredentialField(req.body);
      if (colegio.rector && !hasValue && canRemoveRector) {
        await colegio.rector.destroy();
      } else if (colegio.rector && hasValue) {
        await colegio.rector.update(rectorPayload);
      } else if (!colegio.rector && hasValue) {
        await Rector.create({ schoolId: colegio.id, ...rectorPayload });
      }
    }
    const updated = await Colegio.findByPk(colegio.id, {
      attributes: ['id', 'nombre', 'codigoDane'],
      include: [{
        model: Rector,
        as: 'rector',
        attributes: ['cargo', 'nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
        required: false
      }]
    });
    return res.json(serializeColegio(updated));
  } catch (e) {
    if (e instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(e) });
    }
    throw e;
  }
}

/** Elimina un colegio (solo admin). */
export async function eliminarColegio(req, res) {
  const colegio = await Colegio.findByPk(req.params.id);
  if (!colegio) return res.status(404).json({ error: 'Colegio no encontrado' });
  await colegio.destroy();
  res.json({ ok: true });
}

/** Crea un docente y lo asigna a cursos del mismo colegio (solo admin). */
export async function crearDocente(req, res) {
  const { nombre, email, password, cursoIds = [], materiasPorCurso = {}, schoolId: bodySchool } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const schoolId = ensureManagedSchoolId(req, res, bodySchool);
  if (!schoolId) return;
  const cursoIdsNormalizados = normalizedIds(cursoIds);
  let cursos = [];

  if (cursoIdsNormalizados.length) {
    // Valida cursos antes de crear el docente para evitar registros huerfanos.
    cursos = await Curso.findAll({ where: { id: { [Op.in]: cursoIdsNormalizados }, schoolId } });
    if (cursos.length !== cursoIdsNormalizados.length) {
      return res.status(400).json({ error: 'Uno o mas cursos no pertenecen al colegio seleccionado' });
    }
  }

  const docente = await Usuario.create({ nombre, email, passwordHash, rol: 'docente', schoolId });

  if (cursos.length) {
    // Vincula cursos existentes del mismo colegio.
    await docente.setCursos(cursos, { through: { schoolId } });
  }

  await syncMateriasDocente({
    docenteId: docente.id,
    schoolId,
    cursoIds: cursoIdsNormalizados,
    materiasPorCurso
  });

  const cursosDocente = await docente.getCursos({ attributes: ['id', 'nombre'] });
  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { schoolId, usuarioId: docente.id },
    attributes: ['usuarioId', 'cursoId'],
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
  });
  const [docenteConMaterias] = mapMateriasToDocentesCursos([
    { ...docente.toJSON(), cursos: cursosDocente }
  ], materiaLinks);
  res.status(201).json(docenteConMaterias);
}

/** Actualiza datos y asignaciones de un docente del mismo colegio (solo admin). */
export async function actualizarDocente(req, res) {
  const { nombre, email, password, cursoIds, materiasPorCurso = {}, schoolId: bodySchool } = req.body;
  const where = { id: req.params.id, rol: 'docente' };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const docente = await Usuario.findOne({ where });
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });

  // Roles de gestion pueden mover al docente de colegio.
  const targetSchoolId = canManageAcrossSchools(req) && bodySchool ? bodySchool : docente.schoolId;

  if (nombre) docente.nombre = nombre;
  if (email) docente.email = email;
  if (password) docente.passwordHash = await bcrypt.hash(password, 10);
  docente.schoolId = targetSchoolId;
  await docente.save();

  if (Array.isArray(cursoIds)) {
    const cursoIdsNormalizados = normalizedIds(cursoIds);
    const cursos = await Curso.findAll({ where: { id: { [Op.in]: cursoIdsNormalizados }, schoolId: targetSchoolId } });
    if (cursos.length !== cursoIdsNormalizados.length) {
      return res.status(400).json({ error: 'Uno o mas cursos no pertenecen al colegio seleccionado' });
    }
    await docente.setCursos(cursos, { through: { schoolId: targetSchoolId } });
  }

  const cursosDocente = await docente.getCursos({ attributes: ['id', 'nombre'] });
  const hasMateriasPayload = req.body.materiasPorCurso && typeof req.body.materiasPorCurso === 'object';
  if (Array.isArray(cursoIds) || hasMateriasPayload) {
    await syncMateriasDocente({
      docenteId: docente.id,
      schoolId: targetSchoolId,
      cursoIds: cursosDocente.map((curso) => Number(curso.id)),
      materiasPorCurso
    });
  }

  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { schoolId: targetSchoolId, usuarioId: docente.id },
    attributes: ['usuarioId', 'cursoId'],
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
  });
  const [docenteConMaterias] = mapMateriasToDocentesCursos([
    { ...docente.toJSON(), cursos: cursosDocente }
  ], materiaLinks);
  res.json(docenteConMaterias);
}

/** Elimina un docente del mismo colegio (solo admin). */
export async function eliminarDocente(req, res) {
  const where = { id: req.params.id, rol: 'docente' };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const docente = await Usuario.findOne({ where });
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });
  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { usuarioId: docente.id },
    attributes: ['schoolId'],
    raw: true
  });
  const schoolIdsToCleanup = normalizedIds([
    docente.schoolId,
    ...materiaLinks.map((item) => item?.schoolId)
  ]);

  await sequelize.transaction(async (transaction) => {
    await DocenteCursoMateria.destroy({
      where: { usuarioId: docente.id },
      transaction
    });
    await CursoDocente.destroy({
      where: { usuarioId: docente.id },
      transaction
    });
    await cleanupUnusedMaterias({ schoolIds: schoolIdsToCleanup, transaction });
    await docente.destroy({ transaction });
  });
  res.json({ ok: true });
}
