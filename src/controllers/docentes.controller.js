import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import { sequelize } from '../config/database.js';
import {
  Curso,
  CursoDocente,
  DocenteCursoMateria,
  EstudianteMateria,
  Materia,
  Sede,
  Usuario
} from '../models/index.js';
import { sendTemporaryPasswordEmail } from '../utils/email.js';
import {
  canManageAcrossSchools,
  ensureManagedSchoolId,
  generateTemporaryPassword,
  getUserSchoolId,
  NIVEL_VALUES,
  normalizeOptionalText,
  normalizedIds,
  normalizeMateriaKey,
  normalizeNivel,
  normalizeSedeId,
  normalizedSchoolId,
  resolveSedeForSchool
} from './crud.helpers.js';

const normalizeMateriasPorCurso = (value, { includeEmpty = false } = {}) => {
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
    } else if (materiasRaw != null) {
      materiasList = [materiasRaw];
    }

    const seen = new Set();
    const uniqueMaterias = materiasList
      .map((materia) => normalizeOptionalText(materia))
      .filter(Boolean)
      .filter((materia) => {
        const key = normalizeMateriaKey(materia);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (includeEmpty || uniqueMaterias.length > 0) result[cursoId] = uniqueMaterias;
  });

  return result;
};

const mapMateriasToDocentesCursos = (docentes = [], materiaLinks = []) => {
  const materiasByCursoDocente = new Map();
  materiaLinks.forEach((link) => {
    const docenteId = Number(link?.usuarioId);
    const cursoId = Number(link?.cursoId);
    const materiaNombre = String(link?.materia?.nombre || '').trim();
    if (!docenteId || !cursoId || !materiaNombre) return;
    const key = `${docenteId}:${cursoId}`;
    const current = materiasByCursoDocente.get(key) || [];
    current.push(materiaNombre);
    materiasByCursoDocente.set(key, current);
  });

  return docentes.map((docente) => {
    const raw = docente.toJSON ? docente.toJSON() : docente;
    const cursos = Array.isArray(raw.cursos) ? raw.cursos : [];
    return {
      ...raw,
      cursos: cursos.map((curso) => {
        const rawCurso = curso?.toJSON ? curso.toJSON() : curso;
        const key = `${raw.id}:${rawCurso.id}`;
        const materias = Array.from(new Set(materiasByCursoDocente.get(key) || []))
          .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
        return { ...rawCurso, materias };
      })
    };
  });
};

const syncMateriasDocente = async ({
  docenteId,
  schoolId,
  cursoIds = [],
  materiasPorCurso = {},
  preserveUnspecifiedCourses = false,
  transaction
} = {}) => {
  const cursoIdsValidos = normalizedIds(cursoIds);
  const hasLegacyMateriumId = Object.prototype.hasOwnProperty.call(DocenteCursoMateria.rawAttributes || {}, 'materiumId');
  const materiasNormalizadas = normalizeMateriasPorCurso(materiasPorCurso, {
    includeEmpty: preserveUnspecifiedCourses
  });
  const cursosProvistos = preserveUnspecifiedCourses
    ? normalizedIds(Object.keys(materiasPorCurso || {}))
        .filter((cursoId) => cursoIdsValidos.includes(cursoId))
    : cursoIdsValidos;

  if (cursoIdsValidos.length === 0) {
    await DocenteCursoMateria.destroy({ where: { usuarioId: docenteId, schoolId }, transaction });
    return;
  }

  await DocenteCursoMateria.destroy({
    where: {
      usuarioId: docenteId,
      schoolId,
      cursoId: { [Op.notIn]: cursoIdsValidos }
    },
    transaction
  });

  if (!cursosProvistos.length) return;

  const desiredPairs = [];
  cursosProvistos.forEach((cursoId) => {
    const materias = materiasNormalizadas[cursoId] || [];
    materias.forEach((nombre) => {
      desiredPairs.push({ cursoId, nombre });
    });
  });

  await DocenteCursoMateria.destroy({
    where: {
      usuarioId: docenteId,
      schoolId,
      cursoId: { [Op.in]: cursosProvistos }
    },
    transaction
  });

  if (!desiredPairs.length) return;

  const uniqueNames = Array.from(new Set(desiredPairs.map((item) => item.nombre)));
  const targetKeys = new Set(uniqueNames.map((name) => normalizeMateriaKey(name)));
  const existingMaterias = await Materia.findAll({
    where: { schoolId },
    attributes: ['id', 'nombre'],
    transaction
  });
  const existingKeys = new Set(existingMaterias.map((item) => normalizeMateriaKey(item.nombre)));
  const missingNames = uniqueNames.filter((name) => !existingKeys.has(normalizeMateriaKey(name)));

  if (missingNames.length) {
    await Materia.bulkCreate(
      missingNames.map((nombre) => ({ nombre, schoolId })),
      { ignoreDuplicates: true, transaction }
    );
  }

  const materias = (await Materia.findAll({
    where: { schoolId },
    attributes: ['id', 'nombre'],
    transaction
  })).filter((item) => targetKeys.has(normalizeMateriaKey(item.nombre)));
  const materiaIdByName = new Map();
  materias.forEach((item) => {
    const key = normalizeMateriaKey(item.nombre);
    if (!materiaIdByName.has(key)) materiaIdByName.set(key, Number(item.id));
  });

  const links = desiredPairs
    .map((pair) => {
      const materiaId = materiaIdByName.get(normalizeMateriaKey(pair.nombre));
      const link = {
        usuarioId: docenteId,
        cursoId: pair.cursoId,
        materiaId,
        schoolId
      };
      if (hasLegacyMateriumId) link.materiumId = materiaId;
      return link;
    })
    .filter((item) => Number.isInteger(item.materiaId) && item.materiaId > 0);

  if (links.length) {
    await DocenteCursoMateria.bulkCreate(links, { ignoreDuplicates: true, transaction });
  }
};

const cleanupUnusedMaterias = async ({ schoolIds = [], transaction } = {}) => {
  const ids = normalizedIds(schoolIds);
  if (!ids.length) return;

  const [docenteLinks, estudianteLinks] = await Promise.all([
    DocenteCursoMateria.findAll({
      where: { schoolId: { [Op.in]: ids } },
      attributes: ['materiaId'],
      raw: true,
      transaction
    }),
    EstudianteMateria.findAll({
      where: { schoolId: { [Op.in]: ids } },
      attributes: ['materiaId'],
      raw: true,
      transaction
    })
  ]);

  const usedMateriaIds = normalizedIds([
    ...docenteLinks.map((item) => item?.materiaId),
    ...estudianteLinks.map((item) => item?.materiaId)
  ]);

  const where = { schoolId: { [Op.in]: ids } };
  if (usedMateriaIds.length) where.id = { [Op.notIn]: usedMateriaIds };
  await Materia.destroy({ where, transaction });
};

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

const ensureCursosConsistentWithDocenteScope = ({ cursos = [], docenteNivel, docenteSedeId } = {}) => {
  if (!Array.isArray(cursos) || cursos.length === 0) return;
  if (docenteNivel) {
    const mismatchNivel = cursos.some((curso) => normalizeNivel(curso?.nivel) && normalizeNivel(curso?.nivel) !== docenteNivel);
    if (mismatchNivel) throw new Error('Uno o mas cursos no coinciden con el nivel del docente');
  }
  if (docenteSedeId) {
    const mismatchSede = cursos.some((curso) => {
      const cursoSedeId = normalizeSedeId(curso?.sedeId);
      return cursoSedeId && cursoSedeId !== docenteSedeId;
    });
    if (mismatchSede) throw new Error('Uno o mas cursos no coinciden con la sede del docente');
  }
};

export async function listarDocentes(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const querySedeId = normalizeSedeId(req.query.sedeId);
  const queryNivel = normalizeNivel(req.query.nivel);
  const schoolId = canManageAcrossSchools(req)
    ? (querySchoolId || getUserSchoolId(req))
    : (querySchoolId || getUserSchoolId(req));
  const docenteWhere = schoolId ? { schoolId, rol: 'docente' } : { rol: 'docente' };
  if (querySedeId) docenteWhere.sedeId = querySedeId;
  if (queryNivel) docenteWhere.nivel = queryNivel;

  const docentes = await Usuario.findAll({
    where: docenteWhere,
    attributes: ['id', 'nombre', 'email', 'schoolId', 'sedeId', 'nivel'],
    include: [{
      model: Sede,
      as: 'sede',
      attributes: ['id', 'nombre'],
      required: false
    }, {
      model: Curso,
      as: 'cursos',
      attributes: ['id', 'nombre', 'schoolId', 'sedeId', 'nivel'],
      through: { attributes: [] }
    }]
  });

  const docentesFiltrados = querySedeId || queryNivel
    ? docentes.filter((docente) => {
      if (querySedeId && Number(docente?.sedeId) !== Number(querySedeId)) return false;
      if (queryNivel && normalizeNivel(docente?.nivel) !== queryNivel) return false;
      return true;
    })
    : docentes;

  const docenteIds = docentesFiltrados.map((docente) => Number(docente.id)).filter((id) => id > 0);
  const materiaLinks = docenteIds.length
    ? await DocenteCursoMateria.findAll({
      where: schoolId
        ? { schoolId, usuarioId: { [Op.in]: docenteIds } }
        : { usuarioId: { [Op.in]: docenteIds } },
      attributes: ['usuarioId', 'cursoId'],
      include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
    })
    : [];

  res.json(mapMateriasToDocentesCursos(docentesFiltrados, materiaLinks));
}

export async function listarCursosDisponiblesDocente(req, res) {
  const querySchoolId = normalizedSchoolId(req.query.schoolId);
  const querySedeId = normalizeSedeId(req.query.sedeId);
  const queryNivel = normalizeNivel(req.query.nivel);
  const schoolId = canManageAcrossSchools(req)
    ? (querySchoolId || getUserSchoolId(req))
    : getUserSchoolId(req);
  const where = schoolId ? { schoolId } : {};
  if (querySedeId) where.sedeId = querySedeId;
  if (queryNivel) where.nivel = queryNivel;

  const cursos = await Curso.findAll({
    where,
    attributes: ['id', 'nombre', 'schoolId', 'sedeId', 'nivel'],
    include: [{
      model: Sede,
      as: 'sede',
      attributes: ['id', 'nombre'],
      required: false
    }]
  });
  cursos.sort((a, b) => String(a?.nombre || '').localeCompare(String(b?.nombre || ''), undefined, { sensitivity: 'base' }));
  res.json(cursos);
}

export async function crearDocente(req, res) {
  const { nombre, email, password, cursoIds = [], materiasPorCurso = {}, schoolId: bodySchool } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const schoolId = ensureManagedSchoolId(req, res, bodySchool);
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

  const cursoIdsNormalizados = normalizedIds(cursoIds);
  let cursos = [];
  if (cursoIdsNormalizados.length) {
    cursos = await Curso.findAll({
      where: { id: { [Op.in]: cursoIdsNormalizados }, schoolId },
      attributes: ['id', 'nombre', 'sedeId', 'nivel']
    });
    if (cursos.length !== cursoIdsNormalizados.length) {
      return res.status(400).json({ error: 'Uno o mas cursos no pertenecen al colegio seleccionado' });
    }
    try {
      ensureCursosConsistentWithDocenteScope({
        cursos,
        docenteNivel: nivel ?? null,
        docenteSedeId: sedeId ?? null
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  const docente = await Usuario.create({
    nombre,
    email,
    passwordHash,
    rol: 'docente',
    schoolId,
    sedeId: sedeId ?? null,
    nivel: nivel ?? null,
    mustChangePassword: false
  });

  if (cursos.length) {
    await docente.setCursos(cursos, { through: { schoolId } });
  }

  await syncMateriasDocente({
    docenteId: docente.id,
    schoolId,
    cursoIds: cursoIdsNormalizados,
    materiasPorCurso,
    preserveUnspecifiedCourses: false
  });

  const cursosDocente = await docente.getCursos({ attributes: ['id', 'nombre', 'sedeId', 'nivel'] });
  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { schoolId, usuarioId: docente.id },
    attributes: ['usuarioId', 'cursoId'],
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
  });
  const [docenteConMaterias] = mapMateriasToDocentesCursos([{ ...docente.toJSON(), cursos: cursosDocente }], materiaLinks);
  res.status(201).json(docenteConMaterias);
}

export async function actualizarDocente(req, res) {
  const { nombre, email, password, cursoIds, materiasPorCurso = {}, schoolId: bodySchool } = req.body;
  const where = { id: req.params.id, rol: 'docente' };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const docente = await Usuario.findOne({ where });
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });

  const previousSchoolId = normalizedSchoolId(docente.schoolId);
  const targetSchoolId = canManageAcrossSchools(req) && bodySchool
    ? (normalizedSchoolId(bodySchool) || docente.schoolId)
    : docente.schoolId;
  const hasMateriasPayload = req.body.materiasPorCurso && typeof req.body.materiasPorCurso === 'object';
  const hasNivelField = Object.prototype.hasOwnProperty.call(req.body, 'nivel');
  const hasSedeField = Object.prototype.hasOwnProperty.call(req.body, 'sedeId');
  const parsedNivel = hasNivelField ? resolveNivelInput(req.body.nivel) : undefined;
  if (hasNivelField && parsedNivel === null && req.body.nivel !== null && req.body.nivel !== '') {
    return res.status(400).json({ error: `nivel invalido. Valores permitidos: ${NIVEL_VALUES.join(', ')}` });
  }
  const schoolIdsToCleanup = normalizedIds([previousSchoolId, targetSchoolId]);
  let cursosDocente = [];

  try {
    await sequelize.transaction(async (transaction) => {
      if (nombre) docente.nombre = nombre;
      if (email) docente.email = email;
      if (password) {
        docente.passwordHash = await bcrypt.hash(password, 10);
        docente.mustChangePassword = true;
      }
      docente.schoolId = targetSchoolId;
      if (hasNivelField) docente.nivel = parsedNivel ?? null;

      if (hasSedeField) {
        docente.sedeId = await ensureSedeFromPayload({
          schoolId: targetSchoolId,
          sedeId: resolveSedeInput(req.body.sedeId),
          transaction
        }) ?? null;
      } else if (previousSchoolId && previousSchoolId !== targetSchoolId) {
        docente.sedeId = null;
      }

      await docente.save({ transaction });
      const docenteNivel = normalizeNivel(docente.nivel);
      const docenteSedeId = normalizeSedeId(docente.sedeId);

      if (Array.isArray(cursoIds)) {
        const cursoIdsNormalizados = normalizedIds(cursoIds);
        const cursos = await Curso.findAll({
          where: { id: { [Op.in]: cursoIdsNormalizados }, schoolId: targetSchoolId },
          attributes: ['id', 'nombre', 'sedeId', 'nivel'],
          transaction
        });
        if (cursos.length !== cursoIdsNormalizados.length) {
          throw new Error('Uno o mas cursos no pertenecen al colegio seleccionado');
        }
        ensureCursosConsistentWithDocenteScope({ cursos, docenteNivel, docenteSedeId });
        await docente.setCursos(cursos, { through: { schoolId: targetSchoolId }, transaction });
      } else if (previousSchoolId && previousSchoolId !== targetSchoolId) {
        await docente.setCursos([], { transaction });
      } else if (hasNivelField || hasSedeField) {
        const currentCursos = await docente.getCursos({
          attributes: ['id', 'nombre', 'sedeId', 'nivel'],
          transaction
        });
        ensureCursosConsistentWithDocenteScope({ cursos: currentCursos, docenteNivel, docenteSedeId });
      }

      if (previousSchoolId && previousSchoolId !== targetSchoolId) {
        await DocenteCursoMateria.destroy({
          where: { usuarioId: docente.id, schoolId: previousSchoolId },
          transaction
        });
      }

      cursosDocente = await docente.getCursos({
        attributes: ['id', 'nombre', 'sedeId', 'nivel'],
        transaction
      });
      if (Array.isArray(cursoIds) || hasMateriasPayload || previousSchoolId !== targetSchoolId || hasNivelField || hasSedeField) {
        await syncMateriasDocente({
          docenteId: docente.id,
          schoolId: targetSchoolId,
          cursoIds: cursosDocente.map((curso) => Number(curso.id)),
          materiasPorCurso,
          preserveUnspecifiedCourses: true,
          transaction
        });
        await cleanupUnusedMaterias({ schoolIds: schoolIdsToCleanup, transaction });
      }
    });
  } catch (error) {
    if (
      error?.message === 'Uno o mas cursos no pertenecen al colegio seleccionado'
      || error?.message === 'La sede no pertenece al colegio seleccionado'
      || error?.message === 'Uno o mas cursos no coinciden con el nivel del docente'
      || error?.message === 'Uno o mas cursos no coinciden con la sede del docente'
    ) {
      return res.status(400).json({ error: error.message });
    }
    throw error;
  }

  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { schoolId: targetSchoolId, usuarioId: docente.id },
    attributes: ['usuarioId', 'cursoId'],
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
  });
  const [docenteConMaterias] = mapMateriasToDocentesCursos([{ ...docente.toJSON(), cursos: cursosDocente }], materiaLinks);
  res.json(docenteConMaterias);
}

export async function resetearClaveDocente(req, res) {
  const where = { id: req.params.id, rol: 'docente' };
  if (!canManageAcrossSchools(req)) where.schoolId = req.user.schoolId;
  const docente = await Usuario.findOne({ where });
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });

  try {
    const temporaryPassword = generateTemporaryPassword(10);
    await sequelize.transaction(async (transaction) => {
      docente.passwordHash = await bcrypt.hash(temporaryPassword, 10);
      docente.mustChangePassword = true;
      await docente.save({ transaction });
      await sendTemporaryPasswordEmail({
        to: docente.email,
        nombre: docente.nombre || docente.email,
        temporaryPassword
      });
    });
  } catch (error) {
    if (error?.code === 'SMTP_CONFIG_MISSING') {
      return res.status(503).json({ error: 'Servicio de correo no configurado para restablecer claves' });
    }
    throw error;
  }

  return res.json({
    ok: true,
    mustChangePassword: true,
    message: 'Se envio una clave temporal al correo del docente.',
    user: {
      id: docente.id,
      nombre: docente.nombre,
      email: docente.email
    }
  });
}

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
