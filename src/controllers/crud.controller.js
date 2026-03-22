// CRUD basico para cursos, estudiantes y periodos con scope por colegio.
import { ForeignKeyConstraintError, Op, UniqueConstraintError } from 'sequelize';
import bcrypt from 'bcrypt';
import { Curso, Estudiante, Periodo, Usuario, CursoDocente, Colegio, Rector } from '../models/index.js';

const isDocente = (req) => req.user?.rol === 'docente';
const canManageAcrossSchools = (req) => req.user?.rol === 'admin';
const normalizedSchoolId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
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
  return 'Ya existe un registro con uno de los datos unicos';
};
const buildColegioPayload = (body) => ({
  nombre: normalizeOptionalText(body.nombre),
  codigoDane: normalizeCodigoDane(body.codigoDane)
});
const buildRectorPayload = async (body) => {
  const payload = {
    nombre: normalizeOptionalText(body.rectorNombre),
    apellido: normalizeOptionalText(body.rectorApellido),
    correo: normalizeOptionalText(body.rectorCorreo)?.toLowerCase() || null,
    telefono: normalizeOptionalText(body.rectorTelefono),
    cedula: normalizeOptionalText(body.rectorCedula)
  };
  const plainPassword = normalizeOptionalText(body.rectorPassword);
  if (plainPassword) {
    payload.passwordHash = await bcrypt.hash(plainPassword, 10);
  }
  return payload;
};
const hasRectorProfileField = (body) => (
  Object.prototype.hasOwnProperty.call(body, 'rectorNombre')
  || Object.prototype.hasOwnProperty.call(body, 'rectorApellido')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCorreo')
  || Object.prototype.hasOwnProperty.call(body, 'rectorTelefono')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCedula')
);
const hasRectorCredentialField = (body) => Object.prototype.hasOwnProperty.call(body, 'rectorPassword');
const hasSomeRectorValue = (rectorPayload) => Object.values(rectorPayload).some((v) => Boolean(v));
const serializeColegio = (colegio) => {
  const raw = colegio.toJSON ? colegio.toJSON() : colegio;
  const rector = raw.rector || null;
  const rectorPublic = rector ? {
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
  const schoolId = canManageAcrossSchools(req) && req.body.schoolId ? req.body.schoolId : req.user.schoolId;
  const curso = await Curso.create({ ...req.body, schoolId });

  if (isDocente(req)) {
    // Si crea un docente, se autoasigna el curso para limitar su visibilidad.
    await curso.addDocente(req.user.id, { through: { schoolId: req.user.schoolId } });
  } else if (Array.isArray(req.body.docenteIds) && req.body.docenteIds.length) {
    const docentes = await Usuario.findAll({
      where: { id: { [Op.in]: req.body.docenteIds }, schoolId: req.user.schoolId, rol: 'docente' }
    });
    await curso.addDocentes(docentes, { through: { schoolId: req.user.schoolId } });
  }

  res.status(201).json(curso);
}

/** Lista cursos del colegio actual. Docente ve solo los asignados. */
export async function listarCursos(req, res){
  const { q, schoolId: querySchool } = req.query;
  const querySchoolId = normalizedSchoolId(querySchool);
  const schoolId = !isDocente(req) && querySchoolId ? querySchoolId : req.user.schoolId;
  const where = { schoolId };
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
  const curso = await Curso.findOne({ where: { id: req.body.cursoId, schoolId: req.user.schoolId } });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  const obj = await Estudiante.create({ ...req.body });
  res.status(201).json(obj);
}

/** Lista estudiantes del colegio mediante join con cursos. */
export async function listarEstudiantes(req, res){
  // Join con cursos para acotar al colegio del usuario autenticado.
  const ests = await Estudiante.findAll({
    include: { model: Curso, where: { schoolId: req.user.schoolId }, attributes: [] }
  });
  res.json(ests);
}

/** Lista docentes de un colegio (admin puede filtrar por schoolId). */
export async function listarDocentes(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const schoolId = (!isDocente(req) && querySchoolId) ? querySchoolId : req.user.schoolId;
  const docentes = await Usuario.findAll({
    where: { schoolId, rol: 'docente' },
    attributes: ['id', 'nombre', 'email', 'schoolId'],
    include: [{
      model: Curso,
      as: 'cursos',
      attributes: ['id', 'nombre', 'schoolId'],
      through: { attributes: [] }
    }]
  });
  res.json(docentes);
}

/** Lista cursos disponibles para asignar a docentes por colegio (solo admin). */
export async function listarCursosDisponiblesDocente(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const schoolId = canManageAcrossSchools(req) && querySchoolId ? querySchoolId : req.user.schoolId;
  const cursos = await Curso.findAll({
    where: { schoolId },
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
  const schoolId = req.user.rol === 'admin' && req.body.schoolId ? req.body.schoolId : req.user.schoolId;
  const obj = await Periodo.create({ ...req.body, schoolId });
  res.status(201).json(obj);
}

/** Lista periodos del colegio actual. */
export async function listarPeriodos(req, res){
  const schoolId = (req.user.rol === 'admin' && req.query.schoolId) ? req.query.schoolId : req.user.schoolId;
  res.json(await Periodo.findAll({ where: { schoolId } }));
}

/** Actualiza datos de un periodo dentro del mismo colegio. */
export async function actualizarPeriodo(req, res){
  const periodo = await Periodo.findOne({ where: { id: req.params.id, schoolId: req.user.schoolId } });
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
  const periodo = await Periodo.findOne({ where: { id: req.params.id, schoolId: req.user.schoolId } });
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
  const schoolId = req.user.schoolId;
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
      attributes: ['nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
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
        attributes: ['nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
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
        attributes: ['nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
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
  const { nombre, email, password, cursoIds = [], schoolId: bodySchool } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const schoolId = canManageAcrossSchools(req) && bodySchool ? bodySchool : req.user.schoolId;
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

  const cursosDocente = await docente.getCursos({ attributes: ['id', 'nombre'] });
  res.status(201).json({ ...docente.toJSON(), cursos: cursosDocente });
}

/** Actualiza datos y asignaciones de un docente del mismo colegio (solo admin). */
export async function actualizarDocente(req, res) {
  const { nombre, email, password, cursoIds, schoolId: bodySchool } = req.body;
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
  res.json({ ...docente.toJSON(), cursos: cursosDocente });
}

/** Elimina un docente del mismo colegio (solo admin). */
export async function eliminarDocente(req, res) {
  const where = { id: req.params.id, rol: 'docente' };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const docente = await Usuario.findOne({ where });
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });
  await docente.destroy();
  res.json({ ok: true });
}
