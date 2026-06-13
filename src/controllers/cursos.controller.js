import { Op, UniqueConstraintError } from 'sequelize';
import { Curso, CursoDocente, Sede, Usuario } from '../models/index.js';
import {
  canManageAcrossSchools,
  ensureManagedSchoolId,
  getUserSchoolId,
  isDocente,
  mapUniqueConstraintMessage,
  NIVEL_VALUES,
  normalizeNivel,
  normalizeOptionalText,
  normalizeSedeId,
  normalizedSchoolId,
  resolveSedeForSchool
} from './crud.helpers.js';

const resolveNivelInput = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return normalizeNivel(value);
};

const resolveSedeInput = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return normalizeSedeId(value);
};

const ensureSedeFromPayload = async ({ schoolId, sedeId, transaction } = {}) => {
  if (sedeId === undefined) return undefined;
  if (sedeId === null) return null;
  const sede = await resolveSedeForSchool({ schoolId, sedeId, transaction });
  if (!sede) throw new Error('La sede no pertenece al colegio seleccionado');
  return Number(sede.id);
};

export async function crearCurso(req, res) {
  const schoolId = ensureManagedSchoolId(req, res, req.body.schoolId);
  if (!schoolId) return;

  const nivel = resolveNivelInput(req.body.nivel);
  if (nivel === null && req.body.nivel !== null && req.body.nivel !== '') {
    return res.status(400).json({ error: `nivel invalido. Valores permitidos: ${NIVEL_VALUES.join(', ')}` });
  }

  let sedeId = null;
  try {
    sedeId = await ensureSedeFromPayload({ schoolId, sedeId: resolveSedeInput(req.body.sedeId) });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const curso = await Curso.create({
    ...req.body,
    schoolId,
    sedeId: sedeId ?? null,
    nivel: nivel ?? null
  });

  if (isDocente(req)) {
    await curso.addDocente(req.user.id, { through: { schoolId: req.user.schoolId } });
  } else if (Array.isArray(req.body.docenteIds) && req.body.docenteIds.length) {
    const docentes = await Usuario.findAll({
      where: { id: { [Op.in]: req.body.docenteIds }, schoolId, rol: 'docente' }
    });
    await curso.addDocentes(docentes, { through: { schoolId } });
  }

  res.status(201).json(curso);
}

export async function listarCursos(req, res) {
  const { q, schoolId: querySchool, sedeId: querySedeId, nivel: queryNivel } = req.query;
  const querySchoolId = normalizedSchoolId(querySchool);
  const schoolId = canManageAcrossSchools(req)
    ? (querySchoolId || getUserSchoolId(req))
    : (!isDocente(req) && querySchoolId ? querySchoolId : getUserSchoolId(req));
  const where = {};
  if (schoolId) where.schoolId = schoolId;
  if (q) where.nombre = { [Op.like]: `%${q}%` };
  const sedeId = normalizeSedeId(querySedeId);
  if (sedeId) where.sedeId = sedeId;
  const nivel = normalizeNivel(queryNivel);
  if (nivel) where.nivel = nivel;

  if (isDocente(req)) {
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

export async function actualizarCurso(req, res) {
  const where = { id: req.params.id };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const curso = await Curso.findOne({ where });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

  if (isDocente(req)) {
    const assigned = await curso.hasDocente(req.user.id);
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

  if (req.body.nombre) curso.nombre = req.body.nombre;
  if (Object.prototype.hasOwnProperty.call(req.body, 'nivel')) {
    const nextNivel = resolveNivelInput(req.body.nivel);
    if (nextNivel === null && req.body.nivel !== null && req.body.nivel !== '') {
      return res.status(400).json({ error: `nivel invalido. Valores permitidos: ${NIVEL_VALUES.join(', ')}` });
    }
    curso.nivel = nextNivel ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'sedeId')) {
    try {
      const nextSedeId = await ensureSedeFromPayload({
        schoolId: Number(curso.schoolId),
        sedeId: resolveSedeInput(req.body.sedeId)
      });
      curso.sedeId = nextSedeId ?? null;
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  await curso.save();

  if (!isDocente(req) && Array.isArray(req.body.docenteIds)) {
    const docentes = await Usuario.findAll({
      where: { id: { [Op.in]: req.body.docenteIds }, schoolId: curso.schoolId, rol: 'docente' }
    });
    await curso.setDocentes(docentes, { through: { schoolId: curso.schoolId } });
  }

  res.json(curso);
}

export async function eliminarCurso(req, res) {
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

export async function listarCursosPorColegio(req, res) {
  const schoolId = normalizedSchoolId(req.params.schoolId);
  const querySedeId = normalizeSedeId(req.query.sedeId);
  const queryNivel = normalizeNivel(req.query.nivel);
  if (!schoolId) return res.status(400).json({ error: 'schoolId invalido' });

  if (!canManageAcrossSchools(req) && Number(req.user.schoolId) !== schoolId) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  const cursos = await Curso.findAll({
    where: {
      schoolId,
      ...(querySedeId ? { sedeId: querySedeId } : {}),
      ...(queryNivel ? { nivel: queryNivel } : {})
    },
    attributes: ['id', 'nombre', 'schoolId', 'sedeId', 'nivel'],
    include: [{
      model: Sede,
      as: 'sede',
      attributes: ['id', 'nombre'],
      required: false
    }],
    order: [['nombre', 'ASC']]
  });
  res.json(cursos);
}

export async function listarSedes(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const schoolId = canManageAcrossSchools(req)
    ? (querySchoolId || getUserSchoolId(req))
    : ((!isDocente(req) && querySchoolId) ? querySchoolId : getUserSchoolId(req));
  const where = schoolId ? { schoolId } : {};
  const query = normalizeOptionalText(req.query.q);
  if (query) where.nombre = { [Op.like]: `%${query}%` };

  const data = await Sede.findAll({
    where,
    attributes: ['id', 'nombre', 'schoolId'],
    order: [['nombre', 'ASC']]
  });
  res.json(data);
}

export async function crearSede(req, res) {
  const schoolId = ensureManagedSchoolId(req, res, req.body.schoolId);
  if (!schoolId) return;
  const nombre = normalizeOptionalText(req.body.nombre);
  if (!nombre) return res.status(400).json({ error: 'Nombre de sede invalido' });

  try {
    const created = await Sede.create({ nombre, schoolId });
    return res.status(201).json(created);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(error) });
    }
    throw error;
  }
}

export async function actualizarSede(req, res) {
  const where = { id: req.params.id };
  if (!canManageAcrossSchools(req)) where.schoolId = getUserSchoolId(req);
  const sede = await Sede.findOne({ where });
  if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });

  if (Object.prototype.hasOwnProperty.call(req.body, 'nombre')) {
    const nombre = normalizeOptionalText(req.body.nombre);
    if (!nombre) return res.status(400).json({ error: 'Nombre de sede invalido' });
    sede.nombre = nombre;
  }

  if (canManageAcrossSchools(req) && Object.prototype.hasOwnProperty.call(req.body, 'schoolId')) {
    const nextSchoolId = normalizedSchoolId(req.body.schoolId);
    if (!nextSchoolId) return res.status(400).json({ error: 'schoolId invalido' });
    sede.schoolId = nextSchoolId;
  }

  try {
    await sede.save();
    return res.json(sede);
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(error) });
    }
    throw error;
  }
}

export async function eliminarSede(req, res) {
  const where = { id: req.params.id };
  if (!canManageAcrossSchools(req)) where.schoolId = getUserSchoolId(req);
  const sede = await Sede.findOne({ where });
  if (!sede) return res.status(404).json({ error: 'Sede no encontrada' });

  const [cursosCount, docentesCount] = await Promise.all([
    Curso.count({ where: { sedeId: sede.id } }),
    Usuario.count({ where: { sedeId: sede.id, rol: 'docente' } })
  ]);
  if (cursosCount > 0 || docentesCount > 0) {
    return res.status(409).json({
      error: 'No se puede eliminar la sede porque tiene cursos o docentes asociados'
    });
  }

  await sede.destroy();
  res.json({ ok: true });
}

export async function seedCursoDocente(req, res) {
  const schoolId = ensureManagedSchoolId(req, res, req.body.schoolId || req.query.schoolId);
  if (!schoolId) return;

  const curso = await Curso.findOne({ where: { schoolId } });
  if (!curso) return res.status(404).json({ error: 'No hay cursos en este colegio' });

  const docente = await Usuario.findOne({ where: { schoolId, rol: 'docente' } });
  if (!docente) return res.status(404).json({ error: 'No hay docentes en este colegio' });

  const exists = await CursoDocente.findOne({
    where: { cursoId: curso.id, usuarioId: docente.id, schoolId }
  });
  if (exists) return res.json({ created: false, message: 'Ya existe asignacion', data: exists });

  const record = await CursoDocente.create({ cursoId: curso.id, usuarioId: docente.id, schoolId });
  res.status(201).json({ created: true, data: record });
}
