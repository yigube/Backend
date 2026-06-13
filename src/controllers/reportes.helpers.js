import { Op } from 'sequelize';
import { CursoDocente, DocenteCursoMateria, Materia, Periodo } from '../models/index.js';
import {
  canManageAcrossSchools,
  isDocente,
  normalizeMateriaKey,
  normalizedSchoolId
} from './crud.helpers.js';
import { normalizeEstadoAsistencia } from '../utils/asistenciaAggregation.js';

export const ABSENCE_STATES = new Set(['ausente', 'afuera']);

export const normalizedPeriodoId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export const resolveReportSchoolId = (req) => {
  if (canManageAcrossSchools(req)) {
    return normalizedSchoolId(req.query.schoolId) || normalizedSchoolId(req.user?.schoolId);
  }
  return normalizedSchoolId(req.user?.schoolId);
};

export const parseISODateUTC = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const safeValue = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed;
  const date = new Date(safeValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatISODateUTC = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

export const normalizeEstado = (registro) => normalizeEstadoAsistencia(registro);

export const buildEmptyCounter = () => ({
  registros: 0,
  presentes: 0,
  tardes: 0,
  afuera: 0,
  ausentes: 0,
  inasistencias: 0
});

export const addEstadoToCounter = (counter, estado) => {
  counter.registros += 1;
  if (estado === 'tarde') {
    counter.tardes += 1;
    return;
  }
  if (estado === 'afuera') {
    counter.afuera += 1;
    counter.inasistencias += 1;
    return;
  }
  if (estado === 'ausente') {
    counter.ausentes += 1;
    counter.inasistencias += 1;
    return;
  }
  counter.presentes += 1;
};

export const compareByDate = (left, right) => String(left).localeCompare(String(right));

export const compareByMissingThenDate = (left, right) => {
  const byMissing = Number(right?.inasistencias || 0) - Number(left?.inasistencias || 0);
  if (byMissing !== 0) return byMissing;
  return compareByDate(left?.fecha || left?.startDate || left?.monthKey, right?.fecha || right?.startDate || right?.monthKey);
};

export const getISOWeekData = (date) => {
  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);

  const isoYear = normalized.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const diffDays = Math.floor((normalized - yearStart) / 86400000);
  const week = Math.ceil((diffDays + 1) / 7);

  const startDate = new Date(normalized);
  startDate.setUTCDate(normalized.getUTCDate() - 3);
  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);

  return {
    week,
    year: isoYear,
    weekKey: `${isoYear}-W${String(week).padStart(2, '0')}`,
    startDate: formatISODateUTC(startDate),
    endDate: formatISODateUTC(endDate)
  };
};

export const buildPeriodoScope = async ({ schoolId, periodoId }) => {
  if (periodoId) {
    const periodo = await Periodo.findOne({ where: { id: periodoId, schoolId } });
    return periodo || null;
  }
  return null;
};

export const createDailyEntry = (fecha) => ({
  fecha,
  ...buildEmptyCounter()
});

export const createWeeklyEntry = ({ weekKey, year, week, startDate, endDate }) => ({
  weekKey,
  year,
  week,
  startDate,
  endDate,
  ...buildEmptyCounter()
});

export const createMonthlyEntry = ({ monthKey, year, month }) => ({
  monthKey,
  year,
  month,
  ...buildEmptyCounter()
});

export const createCourseEntry = ({ cursoId, cursoNombre }) => ({
  cursoId,
  cursoNombre,
  ...buildEmptyCounter(),
  diasMap: new Map()
});

export const buildMonthRange = (monthKey) => {
  const match = String(monthKey || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endExclusiveDate = new Date(Date.UTC(year, month, 1));
  return {
    year,
    month,
    startDate: formatISODateUTC(startDate),
    endExclusiveDate: formatISODateUTC(endExclusiveDate)
  };
};

export const buildStudentDayStatus = (student, estadoActual, materias = []) => ({
  id: student.id,
  nombres: student.nombres,
  apellidos: student.apellidos,
  codigoEstudiante: student.codigoEstudiante || null,
  estadoActual: estadoActual || null,
  materias: Array.isArray(materias) ? materias : []
});

export const getDocenteMateriaRowsForCurso = async (req, cursoId, schoolId) => {
  if (!isDocente(req)) return [];
  const assignedCourse = await CursoDocente.findOne({
    where: {
      usuarioId: req.user.id,
      cursoId: Number(cursoId),
      schoolId: Number(schoolId)
    },
    attributes: ['cursoId']
  });
  if (!assignedCourse) return null;
  const rows = await DocenteCursoMateria.findAll({
    where: {
      usuarioId: req.user.id,
      cursoId: Number(cursoId),
      schoolId: Number(schoolId)
    },
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
  });
  const seen = new Set();
  return rows.filter((item) => {
    const materiaId = Number(item?.materiaId || item?.materia?.id);
    if (!Number.isInteger(materiaId) || materiaId <= 0 || seen.has(materiaId)) return false;
    seen.add(materiaId);
    return true;
  });
};

export const resolveMateriaRowsForCurso = async ({ req, cursoId, schoolId } = {}) => {
  if (isDocente(req)) {
    return getDocenteMateriaRowsForCurso(req, cursoId, schoolId);
  }
  const rows = await DocenteCursoMateria.findAll({
    where: {
      cursoId: Number(cursoId),
      schoolId: Number(schoolId)
    },
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
  });
  const seen = new Set();
  return rows.filter((item) => {
    const materiaId = Number(item?.materiaId || item?.materia?.id);
    if (!Number.isInteger(materiaId) || materiaId <= 0 || seen.has(materiaId)) return false;
    seen.add(materiaId);
    return true;
  });
};

export const resolveRequestedMateriaForCurso = async ({ req, cursoId, schoolId, materiaNombre = '' } = {}) => {
  const rows = await resolveMateriaRowsForCurso({ req, cursoId, schoolId });
  if (rows === null) return { rows: null, materia: null, error: 'No autorizado' };
  const materiaValue = String(materiaNombre || '').trim();
  if (!materiaValue) return { rows, materia: null, error: '' };
  const key = normalizeMateriaKey(materiaValue);
  const match = rows.find((item) => normalizeMateriaKey(item?.materia?.nombre) === key);
  if (!match) return { rows, materia: null, error: 'Materia no valida para el curso' };
  return {
    rows,
    materia: {
      id: Number(match?.materiaId || match?.materia?.id),
      nombre: String(match?.materia?.nombre || '').trim()
    },
    error: ''
  };
};
