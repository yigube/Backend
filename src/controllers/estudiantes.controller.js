import { Op, UniqueConstraintError } from 'sequelize';
import { sequelize } from '../config/database.js';
import {
  Asistencia,
  Curso,
  DocenteCursoMateria,
  Estudiante,
  EstudianteMateria,
  Materia
} from '../models/index.js';
import { normalizeEstadoAsistencia } from '../utils/asistenciaAggregation.js';
import {
  canManageAcrossSchools,
  docentePuedeGestionarEstudiante,
  docenteTieneCursoAsignado,
  filterVisibleEstudiantesForDocente,
  getDocenteCursoIds,
  getUserSchoolId,
  isDocente,
  mapUniqueConstraintMessage,
  normalizeMateriaKey,
  normalizeOptionalText,
  normalizedIds,
  normalizedSchoolId
} from './crud.helpers.js';

const buildFaltasResumenByEstudiante = async ({ req, estudiantes = [], schoolId = getUserSchoolId(req), transaction } = {}) => {
  const estudianteIds = normalizedIds(estudiantes.map((item) => item?.id));
  const cursoIds = normalizedIds(estudiantes.map((item) => item?.cursoId));
  if (!estudianteIds.length || !cursoIds.length) return new Map();

  const registros = await Asistencia.findAll({
    where: {
      estudianteId: { [Op.in]: estudianteIds },
      cursoId: { [Op.in]: cursoIds },
      ...(schoolId ? { schoolId } : {})
    },
    attributes: ['estudianteId', 'cursoId', 'materiaId', 'estado', 'presente', 'tarde', 'afuera', 'ausente'],
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }],
    transaction
  });

  const resumenByEstudiante = new Map();
  registros.forEach((registro) => {
    const estado = normalizeEstadoAsistencia(registro);
    if (!['ausente', 'afuera'].includes(estado)) return;

    const estudianteId = Number(registro?.estudianteId);
    const cursoId = Number(registro?.cursoId);
    if (!Number.isInteger(estudianteId) || estudianteId <= 0) return;
    if (!Number.isInteger(cursoId) || cursoId <= 0) return;

    const materiaNombre = String(registro?.materia?.nombre || '').trim() || 'Sin materia';
    const current = resumenByEstudiante.get(estudianteId) || {
      total: 0,
      ausente: 0,
      afuera: 0,
      materiasMap: new Map()
    };

    current.total += 1;
    current.ausente += estado === 'ausente' ? 1 : 0;
    current.afuera += estado === 'afuera' ? 1 : 0;

    const currentMateria = current.materiasMap.get(materiaNombre) || {
      materia: materiaNombre,
      faltas: 0,
      ausente: 0,
      afuera: 0
    };
    currentMateria.faltas += 1;
    currentMateria.ausente += estado === 'ausente' ? 1 : 0;
    currentMateria.afuera += estado === 'afuera' ? 1 : 0;
    current.materiasMap.set(materiaNombre, currentMateria);

    resumenByEstudiante.set(estudianteId, current);
  });

  return new Map(
    Array.from(resumenByEstudiante.entries()).map(([estudianteId, value]) => [
      estudianteId,
      {
        total: value.total,
        ausente: value.ausente,
        afuera: value.afuera,
        materias: Array.from(value.materiasMap.values()).sort((left, right) => {
          const byFaltas = Number(right?.faltas || 0) - Number(left?.faltas || 0);
          if (byFaltas !== 0) return byFaltas;
          return String(left?.materia || '').localeCompare(String(right?.materia || ''), undefined, { sensitivity: 'base' });
        })
      }
    ])
  );
};

const normalizeMateriasLista = (value) => {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .forEach((nombre) => {
      const key = normalizeMateriaKey(nombre);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(nombre);
    });
  return result;
};

const mapMateriasToEstudiantes = (estudiantes = [], materiaLinks = [], faltasResumenMap = null) => {
  const materiasMap = new Map();
  materiaLinks.forEach((link) => {
    const estudianteId = Number(link?.estudianteId);
    const materiaNombre = String(link?.materia?.nombre || '').trim();
    if (!estudianteId || !materiaNombre) return;
    const current = materiasMap.get(estudianteId) || [];
    if (!current.includes(materiaNombre)) current.push(materiaNombre);
    materiasMap.set(estudianteId, current);
  });

  return estudiantes.map((estudiante) => {
    const raw = estudiante?.toJSON ? estudiante.toJSON() : estudiante;
    const includeFaltas = faltasResumenMap instanceof Map;
    return {
      ...raw,
      materias: materiasMap.get(Number(raw?.id)) || [],
      ...(includeFaltas
        ? {
            faltas: faltasResumenMap.get(Number(raw?.id)) || {
              total: 0,
              ausente: 0,
              afuera: 0,
              materias: []
            }
          }
        : {})
    };
  });
};

const resolveMateriasSeleccionadasCurso = async ({
  req,
  cursoId,
  schoolId,
  materias = [],
  transaction
} = {}) => {
  const materiasNormalizadas = normalizeMateriasLista(materias);
  if (!materiasNormalizadas.length) return [];

  const where = { cursoId, schoolId };
  if (isDocente(req)) where.usuarioId = req.user.id;

  const materiaLinks = await DocenteCursoMateria.findAll({
    where,
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }],
    transaction
  });
  const materiaByKey = new Map();
  materiaLinks.forEach((item) => {
    const materiaId = Number(item?.materia?.id);
    const materiaNombre = String(item?.materia?.nombre || '').trim();
    const key = normalizeMateriaKey(materiaNombre);
    if (!materiaId || !key || materiaByKey.has(key)) return;
    materiaByKey.set(key, { id: materiaId, nombre: materiaNombre });
  });

  const missingMaterias = materiasNormalizadas.filter((nombre) => !materiaByKey.has(normalizeMateriaKey(nombre)));
  if (missingMaterias.length) {
    throw new Error('Las materias seleccionadas no corresponden al curso');
  }

  return materiasNormalizadas
    .map((nombre) => materiaByKey.get(normalizeMateriaKey(nombre)))
    .filter(Boolean);
};

const syncMateriasEstudiante = async ({
  req,
  estudianteIds = [],
  cursoId,
  schoolId,
  materias = [],
  transaction
} = {}) => {
  const ids = normalizedIds(estudianteIds);
  if (!ids.length) return [];

  await EstudianteMateria.destroy({
    where: { estudianteId: { [Op.in]: ids } },
    transaction
  });

  const materiasSeleccionadas = await resolveMateriasSeleccionadasCurso({
    req,
    cursoId,
    schoolId,
    materias,
    transaction
  });
  if (!materiasSeleccionadas.length) return [];

  await EstudianteMateria.bulkCreate(
    ids.flatMap((estudianteId) => (
      materiasSeleccionadas.map((materia) => ({
        estudianteId,
        cursoId,
        materiaId: materia.id,
        schoolId
      }))
    )),
    { ignoreDuplicates: true, transaction }
  );

  return materiasSeleccionadas.map((materia) => materia.nombre);
};

export async function crearEstudiante(req, res) {
  const curso = await Curso.findOne({
    where: canManageAcrossSchools(req)
      ? { id: req.body.cursoId }
      : { id: req.body.cursoId, schoolId: getUserSchoolId(req) }
  });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

  if (isDocente(req)) {
    const assigned = await docenteTieneCursoAsignado({
      req,
      cursoId: curso.id,
      schoolId: Number(curso.schoolId)
    });
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const created = await sequelize.transaction(async (transaction) => {
      const obj = await Estudiante.create({
        nombres: normalizeOptionalText(req.body.nombres),
        apellidos: normalizeOptionalText(req.body.apellidos),
        qr: normalizeOptionalText(req.body.qr),
        codigoEstudiante: normalizeOptionalText(req.body.codigoEstudiante),
        cursoId: req.body.cursoId
      }, { transaction });
      await syncMateriasEstudiante({
        req,
        estudianteIds: [obj.id],
        cursoId: Number(curso.id),
        schoolId: Number(curso.schoolId),
        materias: req.body.materias,
        transaction
      });
      const materiaLinks = await EstudianteMateria.findAll({
        where: { estudianteId: obj.id },
        include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }],
        transaction
      });
      return mapMateriasToEstudiantes([obj], materiaLinks)[0];
    });
    return res.status(201).json(created);
  } catch (error) {
    if (error?.message === 'Las materias seleccionadas no corresponden al curso') {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(error) });
    }
    throw error;
  }
}

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

  if (isDocente(req)) {
    const assigned = await docenteTieneCursoAsignado({
      req,
      cursoId,
      schoolId: Number(curso.schoolId)
    });
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

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
    const createdRows = await sequelize.transaction(async (transaction) => {
      const created = await Estudiante.bulkCreate(payload.map(({ row, ...rest }) => rest), {
        validate: true,
        transaction
      });
      await syncMateriasEstudiante({
        req,
        estudianteIds: created.map((item) => item.id),
        cursoId,
        schoolId: Number(curso.schoolId),
        materias: req.body.materias,
        transaction
      });
      const materiaLinks = await EstudianteMateria.findAll({
        where: { estudianteId: { [Op.in]: created.map((item) => item.id) } },
        include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }],
        transaction
      });
      return mapMateriasToEstudiantes(created, materiaLinks).map((item) => ({
        id: item.id,
        nombres: item.nombres,
        apellidos: item.apellidos,
        qr: item.qr,
        codigoEstudiante: item.codigoEstudiante,
        materias: item.materias || []
      }));
    });
    return res.status(201).json({ created: createdRows.length, students: createdRows });
  } catch (error) {
    if (error?.message === 'Las materias seleccionadas no corresponden al curso') {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(error) });
    }
    throw error;
  }
}

export async function listarEstudiantes(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const schoolId = canManageAcrossSchools(req) ? (querySchoolId || getUserSchoolId(req)) : getUserSchoolId(req);
  const cursoId = normalizedSchoolId(req.query.cursoId);
  const cursoWhere = {
    ...(schoolId ? { schoolId } : {})
  };

  if (isDocente(req)) {
    const assignedCursoIds = await getDocenteCursoIds({ req, schoolId });
    if (!assignedCursoIds.length) return res.json([]);
    if (cursoId) {
      if (!assignedCursoIds.includes(cursoId)) {
        return res.status(403).json({ error: 'No autorizado' });
      }
      cursoWhere.id = cursoId;
    } else {
      cursoWhere.id = { [Op.in]: assignedCursoIds };
    }
  } else if (cursoId) {
    cursoWhere.id = cursoId;
  }

  const ests = await Estudiante.findAll({
    include: { model: Curso, where: cursoWhere, attributes: [] },
    order: [['apellidos', 'ASC'], ['nombres', 'ASC']]
  });

  if (isDocente(req)) {
    const visible = await filterVisibleEstudiantesForDocente({ req, schoolId, estudiantes: ests });
    const faltasResumen = await buildFaltasResumenByEstudiante({
      req,
      schoolId,
      estudiantes: visible.estudiantes
    });
    return res.json(mapMateriasToEstudiantes(visible.estudiantes, visible.materiaLinks, faltasResumen));
  }

  const materiaLinks = ests.length
    ? await EstudianteMateria.findAll({
        where: { estudianteId: { [Op.in]: ests.map((item) => item.id) } },
        include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
      })
    : [];
  const faltasResumen = await buildFaltasResumenByEstudiante({
    req,
    schoolId,
    estudiantes: ests
  });
  res.json(mapMateriasToEstudiantes(ests, materiaLinks, faltasResumen));
}

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

  if (isDocente(req)) {
    const assigned = await docentePuedeGestionarEstudiante({
      req,
      estudiante,
      schoolId: Number(estudiante?.curso?.schoolId || getUserSchoolId(req))
    });
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

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
    if (isDocente(req)) {
      const assigned = await docenteTieneCursoAsignado({
        req,
        cursoId: nuevoCursoId,
        schoolId: Number(cursoDestino.schoolId)
      });
      if (!assigned) return res.status(403).json({ error: 'No autorizado' });
    }
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
    const updated = await sequelize.transaction(async (transaction) => {
      await estudiante.save({ transaction });

      if (Object.prototype.hasOwnProperty.call(req.body, 'materias') || Object.prototype.hasOwnProperty.call(req.body, 'cursoId')) {
        const cursoActual = await Curso.findByPk(estudiante.cursoId, {
          attributes: ['id', 'schoolId'],
          transaction
        });
        if (!cursoActual) throw new Error('Curso no encontrado');
        await syncMateriasEstudiante({
          req,
          estudianteIds: [estudiante.id],
          cursoId: Number(cursoActual.id),
          schoolId: Number(cursoActual.schoolId),
          materias: Object.prototype.hasOwnProperty.call(req.body, 'materias') ? req.body.materias : [],
          transaction
        });
      }

      const materiaLinks = await EstudianteMateria.findAll({
        where: { estudianteId: estudiante.id },
        include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }],
        transaction
      });
      return mapMateriasToEstudiantes([estudiante], materiaLinks)[0];
    });
    return res.json(updated);
  } catch (error) {
    if (error?.message === 'Las materias seleccionadas no corresponden al curso' || error?.message === 'Curso no encontrado') {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(error) });
    }
    throw error;
  }
}

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

  if (isDocente(req)) {
    const assigned = await docentePuedeGestionarEstudiante({
      req,
      estudiante,
      schoolId: Number(estudiante?.curso?.schoolId || getUserSchoolId(req))
    });
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

  await EstudianteMateria.destroy({ where: { estudianteId: estudiante.id } });
  await estudiante.destroy();
  return res.json({ ok: true });
}
