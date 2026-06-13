import { ForeignKeyConstraintError, Op } from 'sequelize';
import { Periodo } from '../models/index.js';
import {
  canManageAcrossSchools,
  ensureManagedSchoolId,
  getUserSchoolId,
  normalizedSchoolId
} from './crud.helpers.js';

const PERIOD_DURATION_DAYS = 70;
const MAX_PERIODS_PER_YEAR = 4;
const DAY_IN_MS = 1000 * 60 * 60 * 24;

const getPeriodoComparableValue = (value) => {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    const hour = String(value.getUTCHours()).padStart(2, '0');
    const minute = String(value.getUTCMinutes()).padStart(2, '0');
    const second = String(value.getUTCSeconds()).padStart(2, '0');
    return Number(`${year}${month}${day}${hour}${minute}${second}`);
  }

  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    return Number(`${year}${month}${day}${hour}${minute}${second}`);
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return Number.NaN;
  return getPeriodoComparableValue(parsed);
};

const getPeriodoDateParts = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, yearRaw, monthRaw, dayRaw] = match;
    return {
      year: Number(yearRaw),
      month: Number(monthRaw),
      day: Number(dayRaw)
    };
  }

  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return null;
  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate()
  };
};

const getPeriodoLocalDate = (value) => {
  const parts = getPeriodoDateParts(value);
  if (!parts) return null;
  const date = new Date(parts.year, parts.month - 1, parts.day);
  return Number.isFinite(date.getTime()) ? date : null;
};

const addPeriodoDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isSamePeriodoDay = (left, right) => (
  left?.getFullYear() === right?.getFullYear()
  && left?.getMonth() === right?.getMonth()
  && left?.getDate() === right?.getDate()
);

const getPeriodoDurationError = (fechaInicio, fechaFin) => {
  const startDate = getPeriodoLocalDate(fechaInicio);
  const endDate = getPeriodoLocalDate(fechaFin);
  if (!startDate || !endDate) return '';
  const durationDays = Math.round((endDate - startDate) / DAY_IN_MS) + 1;
  if (durationDays !== PERIOD_DURATION_DAYS) return 'Cada periodo debe durar exactamente 10 semanas';
  return '';
};

const getPeriodoDateRangeError = (fechaInicio, fechaFin) => {
  const startValue = getPeriodoComparableValue(fechaInicio);
  const endValue = getPeriodoComparableValue(fechaFin);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) return 'Las fechas del periodo no son validas';
  if (startValue >= endValue) return 'La fecha de inicio debe ser anterior a la fecha de fin';
  return '';
};

const getPeriodoSequenceError = async ({ schoolId, fechaInicio, fechaFin, excludePeriodoId = null, enforceAfterLast = false } = {}) => {
  const startValue = getPeriodoComparableValue(fechaInicio);
  const endValue = getPeriodoComparableValue(fechaFin);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue) || !schoolId) return '';
  const startDate = getPeriodoLocalDate(fechaInicio);
  if (!startDate) return '';

  const where = { schoolId };
  if (excludePeriodoId) where.id = { [Op.ne]: excludePeriodoId };

  const otherPeriodos = await Periodo.findAll({
    where,
    attributes: ['id', 'nombre', 'fechaInicio', 'fechaFin'],
    order: [['fechaInicio', 'ASC'], ['id', 'ASC']]
  });

  const startYear = startDate.getFullYear();
  const periodosInStartYear = otherPeriodos.filter((item) => {
    const itemStartDate = getPeriodoLocalDate(item.fechaInicio);
    return itemStartDate?.getFullYear() === startYear;
  });

  if (!excludePeriodoId && periodosInStartYear.length >= MAX_PERIODS_PER_YEAR) {
    return `Solo se permiten ${MAX_PERIODS_PER_YEAR} periodos por año`;
  }
  if (!otherPeriodos.length) return '';

  const overlapping = otherPeriodos.find((item) => {
    const itemStart = getPeriodoComparableValue(item.fechaInicio);
    const itemEnd = getPeriodoComparableValue(item.fechaFin);
    return startValue <= itemEnd && endValue >= itemStart;
  });
  if (overlapping) {
    return `Las fechas se cruzan con ${overlapping.nombre}. Un periodo posterior debe iniciar despues de que termine el anterior`;
  }

  if (enforceAfterLast) {
    const candidatePeriodos = periodosInStartYear.length ? periodosInStartYear : otherPeriodos;
    const latestPeriodo = candidatePeriodos.reduce((latest, current) => {
      const latestEnd = getPeriodoComparableValue(latest.fechaFin);
      const currentEnd = getPeriodoComparableValue(current.fechaFin);
      return currentEnd > latestEnd ? current : latest;
    }, candidatePeriodos[0]);
    const latestEndDate = getPeriodoLocalDate(latestPeriodo.fechaFin);
    const expectedStart = latestEndDate ? addPeriodoDays(latestEndDate, 1) : null;
    if (expectedStart && !isSamePeriodoDay(startDate, expectedStart)) {
      return `El nuevo periodo debe iniciar despues de que termine ${latestPeriodo.nombre || 'el ultimo periodo registrado'}`;
    }
  }

  return '';
};

export async function crearPeriodo(req, res) {
  const schoolId = ensureManagedSchoolId(req, res, req.body.schoolId);
  if (!schoolId) return;
  const rangeError = getPeriodoDateRangeError(req.body.fechaInicio, req.body.fechaFin);
  if (rangeError) return res.status(400).json({ error: rangeError });
  const durationError = getPeriodoDurationError(req.body.fechaInicio, req.body.fechaFin);
  if (durationError) return res.status(400).json({ error: durationError });
  const sequenceError = await getPeriodoSequenceError({
    schoolId,
    fechaInicio: req.body.fechaInicio,
    fechaFin: req.body.fechaFin,
    enforceAfterLast: true
  });
  if (sequenceError) return res.status(400).json({ error: sequenceError });
  const obj = await Periodo.create({ ...req.body, schoolId });
  res.status(201).json(obj);
}

export async function listarPeriodos(req, res) {
  const schoolId = canManageAcrossSchools(req)
    ? (normalizedSchoolId(req.query.schoolId) || getUserSchoolId(req))
    : getUserSchoolId(req);
  res.json(await Periodo.findAll({
    where: schoolId ? { schoolId } : {},
    order: [['fechaInicio', 'ASC'], ['id', 'ASC']]
  }));
}

export async function actualizarPeriodo(req, res) {
  const periodo = await Periodo.findOne({
    where: canManageAcrossSchools(req)
      ? { id: req.params.id }
      : { id: req.params.id, schoolId: getUserSchoolId(req) }
  });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

  const { nombre, fechaInicio, fechaFin } = req.body;
  const nextFechaInicio = fechaInicio || periodo.fechaInicio;
  const nextFechaFin = fechaFin || periodo.fechaFin;
  const rangeError = getPeriodoDateRangeError(nextFechaInicio, nextFechaFin);
  if (rangeError) return res.status(400).json({ error: rangeError });
  const durationError = getPeriodoDurationError(nextFechaInicio, nextFechaFin);
  if (durationError) return res.status(400).json({ error: durationError });
  const sequenceError = await getPeriodoSequenceError({
    schoolId: periodo.schoolId,
    fechaInicio: nextFechaInicio,
    fechaFin: nextFechaFin,
    excludePeriodoId: periodo.id
  });
  if (sequenceError) return res.status(400).json({ error: sequenceError });

  if (nombre) periodo.nombre = nombre;
  if (fechaInicio) periodo.fechaInicio = fechaInicio;
  if (fechaFin) periodo.fechaFin = fechaFin;

  await periodo.save();
  res.json(periodo);
}

export async function eliminarPeriodo(req, res) {
  const periodo = await Periodo.findOne({
    where: canManageAcrossSchools(req)
      ? { id: req.params.id }
      : { id: req.params.id, schoolId: getUserSchoolId(req) }
  });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

  try {
    await periodo.destroy();
    return res.json({ ok: true });
  } catch (error) {
    if (error instanceof ForeignKeyConstraintError) {
      return res.status(409).json({ error: 'No se puede eliminar el periodo porque tiene asistencias registradas' });
    }
    throw error;
  }
}
