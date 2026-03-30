// Exporta CSV y genera reportes analiticos de asistencias con scope por colegio.
import { Op } from 'sequelize';
import { Asistencia, Estudiante, Curso, Periodo } from '../models/index.js';
import { toCSV } from '../utils/csv.js';

const ABSENCE_STATES = new Set(['ausente', 'afuera']);

const normalizedSchoolId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normalizedPeriodoId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const canManageAcrossSchools = (req) => req.user?.rol === 'admin' && !normalizedSchoolId(req.user?.schoolId);

const resolveReportSchoolId = (req) => {
  if (canManageAcrossSchools(req)) {
    return normalizedSchoolId(req.query.schoolId) || normalizedSchoolId(req.user?.schoolId);
  }
  return normalizedSchoolId(req.user?.schoolId);
};

const parseISODateUTC = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const safeValue = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed;
  const date = new Date(safeValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatISODateUTC = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const normalizeEstado = (registro) => {
  const estado = String(registro?.estado || '').trim().toLowerCase();
  if (estado) return estado;
  if (registro?.ausente === true) return 'ausente';
  if (registro?.afuera === true) return 'afuera';
  if (registro?.tarde === true) return 'tarde';
  return registro?.presente === false ? 'ausente' : 'presente';
};

const buildEmptyCounter = () => ({
  registros: 0,
  presentes: 0,
  tardes: 0,
  afuera: 0,
  ausentes: 0,
  inasistencias: 0
});

const addEstadoToCounter = (counter, estado) => {
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

const compareByDate = (left, right) => String(left).localeCompare(String(right));

const compareByMissingThenDate = (left, right) => {
  const byMissing = Number(right?.inasistencias || 0) - Number(left?.inasistencias || 0);
  if (byMissing !== 0) return byMissing;
  return compareByDate(left?.fecha || left?.startDate || left?.monthKey, right?.fecha || right?.startDate || right?.monthKey);
};

const getISOWeekData = (date) => {
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

const buildPeriodoScope = async ({ schoolId, periodoId }) => {
  if (periodoId) {
    const periodo = await Periodo.findOne({ where: { id: periodoId, schoolId } });
    return periodo || null;
  }
  return null;
};

const createDailyEntry = (fecha) => ({
  fecha,
  ...buildEmptyCounter()
});

const createWeeklyEntry = ({ weekKey, year, week, startDate, endDate }) => ({
  weekKey,
  year,
  week,
  startDate,
  endDate,
  ...buildEmptyCounter()
});

const createMonthlyEntry = ({ monthKey, year, month }) => ({
  monthKey,
  year,
  month,
  ...buildEmptyCounter()
});

const createCourseEntry = ({ cursoId, cursoNombre }) => ({
  cursoId,
  cursoNombre,
  ...buildEmptyCounter(),
  diasMap: new Map()
});

const buildMonthRange = (monthKey) => {
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

const buildStudentDayStatus = (student, estadoActual) => ({
  id: student.id,
  nombres: student.nombres,
  apellidos: student.apellidos,
  codigoEstudiante: student.codigoEstudiante || null,
  estadoActual: estadoActual || null
});

/** Genera CSV de asistencias para un curso y periodo del colegio del usuario. */
export async function exportarCSV(req, res) {
  const { cursoId, periodoId } = req.query;
  if (!cursoId || !periodoId) return res.status(400).json({ error: 'cursoId y periodoId son requeridos' });

  const curso = await Curso.findOne({
    where: canManageAcrossSchools(req)
      ? { id: cursoId }
      : { id: cursoId, schoolId: req.user.schoolId }
  });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  const schoolId = curso.schoolId;
  const periodo = await Periodo.findOne({ where: { id: periodoId, schoolId } });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

  const registros = await Asistencia.findAll({ where: { cursoId, periodoId, schoolId }, include: [Estudiante] });
  const rows = registros.map((r) => ({
    fecha: r.fecha,
    cursoId: r.cursoId,
    periodoId: r.periodoId,
    estudianteId: r.estudianteId,
    estudiante: r.estudiante ? `${r.estudiante.nombres} ${r.estudiante.apellidos}` : '',
    presente: r.presente ? 'SI' : 'NO'
  }));

  const csv = await toCSV(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="asistencias.csv"');
  res.send(csv);
}

/** Devuelve un tablero de reportes agrupado por dia, semana y mes para rector/coordinador/admin. */
export async function obtenerDashboardReportes(req, res) {
  const schoolId = resolveReportSchoolId(req);
  if (!schoolId) {
    return res.status(400).json({ error: 'schoolId requerido para administradores' });
  }

  const periodoId = normalizedPeriodoId(req.query.periodoId);
  const periodo = await buildPeriodoScope({ schoolId, periodoId });
  if (periodoId && !periodo) {
    return res.status(404).json({ error: 'Periodo no encontrado' });
  }

  const where = periodo ? { schoolId, periodoId: periodo.id } : { schoolId };
  const registros = await Asistencia.findAll({
    where,
    attributes: [
      'id',
      'fecha',
      'estado',
      'presente',
      'tarde',
      'afuera',
      'ausente',
      'cursoId',
      'periodoId',
      'estudianteId'
    ],
    include: [{
      model: Curso,
      attributes: ['id', 'nombre', 'schoolId']
    }],
    order: [['fecha', 'ASC'], ['cursoId', 'ASC'], ['id', 'ASC']]
  });

  const totals = buildEmptyCounter();
  const absentStudentIds = new Set();
  const courseIds = new Set();
  const daysWithMissing = new Set();
  const byDay = new Map();
  const byWeek = new Map();
  const byMonth = new Map();
  const courseMap = new Map();

  registros.forEach((registro) => {
    const estado = normalizeEstado(registro);
    const fecha = String(registro.fecha);
    const cursoId = Number(registro.cursoId);
    const cursoNombre = String(registro?.curso?.nombre || `Curso ${cursoId}`);
    const fechaDate = parseISODateUTC(fecha);

    addEstadoToCounter(totals, estado);
    courseIds.add(cursoId);

    if (!byDay.has(fecha)) {
      byDay.set(fecha, createDailyEntry(fecha));
    }
    addEstadoToCounter(byDay.get(fecha), estado);

    if (fechaDate) {
      const weekData = getISOWeekData(fechaDate);
      if (!byWeek.has(weekData.weekKey)) {
        byWeek.set(weekData.weekKey, createWeeklyEntry(weekData));
      }
      addEstadoToCounter(byWeek.get(weekData.weekKey), estado);

      const monthKey = `${fechaDate.getUTCFullYear()}-${String(fechaDate.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!byMonth.has(monthKey)) {
        byMonth.set(monthKey, createMonthlyEntry({
          monthKey,
          year: fechaDate.getUTCFullYear(),
          month: fechaDate.getUTCMonth() + 1
        }));
      }
      addEstadoToCounter(byMonth.get(monthKey), estado);
    }

    if (!courseMap.has(cursoId)) {
      courseMap.set(cursoId, createCourseEntry({ cursoId, cursoNombre }));
    }
    const courseEntry = courseMap.get(cursoId);
    addEstadoToCounter(courseEntry, estado);

    if (ABSENCE_STATES.has(estado)) {
      absentStudentIds.add(Number(registro.estudianteId));
      daysWithMissing.add(fecha);

      const currentDay = courseEntry.diasMap.get(fecha) || { fecha, inasistencias: 0 };
      currentDay.inasistencias += 1;
      courseEntry.diasMap.set(fecha, currentDay);
    }
  });

  const byDayList = Array.from(byDay.values()).sort((left, right) => compareByDate(left.fecha, right.fecha));
  const byWeekList = Array.from(byWeek.values()).sort((left, right) => compareByDate(left.startDate, right.startDate));
  const byMonthList = Array.from(byMonth.values()).sort((left, right) => compareByDate(left.monthKey, right.monthKey));

  const courseRanking = Array.from(courseMap.values())
    .map((item) => {
      const diasMasFaltas = Array.from(item.diasMap.values())
        .sort(compareByMissingThenDate)
        .slice(0, 5);
      return {
        cursoId: item.cursoId,
        cursoNombre: item.cursoNombre,
        registros: item.registros,
        presentes: item.presentes,
        tardes: item.tardes,
        afuera: item.afuera,
        ausentes: item.ausentes,
        inasistencias: item.inasistencias,
        diasConInasistencias: item.diasMap.size,
        diasMasFaltas
      };
    })
    .sort((left, right) => {
      const byMissing = Number(right.inasistencias || 0) - Number(left.inasistencias || 0);
      if (byMissing !== 0) return byMissing;
      return String(left.cursoNombre || '').localeCompare(String(right.cursoNombre || ''));
    });

  const worstDays = byDayList
    .filter((item) => Number(item.inasistencias) > 0)
    .sort(compareByMissingThenDate)
    .slice(0, 7);

  const highlights = {
    ultimoDiaRegistrado: byDayList.length ? byDayList[byDayList.length - 1] : null,
    semanaMasCritica: byWeekList.length ? [...byWeekList].sort(compareByMissingThenDate)[0] : null,
    mesMasCritico: byMonthList.length ? [...byMonthList].sort(compareByMissingThenDate)[0] : null
  };

  res.json({
    schoolId,
    periodo: periodo
      ? {
        id: periodo.id,
        nombre: periodo.nombre,
        fechaInicio: periodo.fechaInicio,
        fechaFin: periodo.fechaFin
      }
      : null,
    totals: {
      ...totals,
      cursosConRegistros: courseIds.size,
      estudiantesConInasistencias: absentStudentIds.size,
      diasConRegistros: byDayList.length,
      diasConInasistencias: daysWithMissing.size
    },
    highlights,
    byDay: byDayList,
    byWeek: byWeekList,
    byMonth: byMonthList,
    courseRanking,
    worstCourse: courseRanking[0] || null,
    worstDays
  });
}

/** Devuelve un reporte de inasistencia por curso con detalle de un dia y resumen del mes. */
export async function obtenerReporteInasistenciaCurso(req, res) {
  const cursoId = Number(req.query.cursoId);
  const fecha = String(req.query.fecha || '').trim();
  const monthKey = String(req.query.mes || '').trim();
  const monthRange = buildMonthRange(monthKey);

  if (!monthRange) {
    return res.status(400).json({ error: 'mes invalido' });
  }
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'fecha invalida' });
  }
  if (!fecha.startsWith(`${monthKey}-`)) {
    return res.status(400).json({ error: 'La fecha seleccionada debe pertenecer al mes indicado' });
  }

  const curso = await Curso.findOne({
    where: canManageAcrossSchools(req)
      ? { id: cursoId }
      : { id: cursoId, schoolId: req.user.schoolId }
  });
  if (!curso) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }

  const schoolId = curso.schoolId;
  const estudiantes = await Estudiante.findAll({
    where: { cursoId },
    attributes: ['id', 'nombres', 'apellidos', 'codigoEstudiante'],
    order: [['apellidos', 'ASC'], ['nombres', 'ASC']]
  });

  const asistenciasMes = await Asistencia.findAll({
    where: {
      cursoId,
      schoolId,
      fecha: {
        [Op.gte]: monthRange.startDate,
        [Op.lt]: monthRange.endExclusiveDate
      }
    },
    attributes: ['fecha', 'estado', 'presente', 'tarde', 'afuera', 'ausente', 'estudianteId'],
    order: [['fecha', 'ASC'], ['estudianteId', 'ASC']]
  });

  const resumenMes = buildEmptyCounter();
  const diasMap = new Map();
  const estudiantesMap = new Map();
  const diasConRegistro = new Set();

  asistenciasMes.forEach((registro) => {
    const estado = normalizeEstado(registro);
    const fechaRegistro = String(registro.fecha);
    diasConRegistro.add(fechaRegistro);
    addEstadoToCounter(resumenMes, estado);

    if (!ABSENCE_STATES.has(estado)) return;

    const dayEntry = diasMap.get(fechaRegistro) || { fecha: fechaRegistro, inasistencias: 0 };
    dayEntry.inasistencias += 1;
    diasMap.set(fechaRegistro, dayEntry);

    const estudianteId = Number(registro.estudianteId);
    const currentStudent = estudiantesMap.get(estudianteId) || {
      estudianteId,
      nombre: '',
      inasistencias: 0,
      ausente: 0,
      afuera: 0
    };
    currentStudent.inasistencias += 1;
    if (estado === 'ausente') currentStudent.ausente += 1;
    if (estado === 'afuera') currentStudent.afuera += 1;
    estudiantesMap.set(estudianteId, currentStudent);
  });

  const estadoPorEstudianteDia = new Map(
    asistenciasMes
      .filter((registro) => String(registro.fecha) === fecha)
      .map((registro) => [Number(registro.estudianteId), normalizeEstado(registro)])
  );

  const detalleDia = {
    fecha,
    totalInasistencias: 0,
    totalAusentes: 0,
    totalAfuera: 0,
    totalSinRegistro: 0,
    estudiantes: []
  };

  estudiantes.forEach((estudiante) => {
    const estadoActual = estadoPorEstudianteDia.get(Number(estudiante.id)) || null;
    const esInasistencia = !estadoActual || estadoActual === 'ausente' || estadoActual === 'afuera';
    if (!esInasistencia) return;

    detalleDia.totalInasistencias += 1;
    if (!estadoActual) detalleDia.totalSinRegistro += 1;
    else if (estadoActual === 'afuera') detalleDia.totalAfuera += 1;
    else detalleDia.totalAusentes += 1;
    detalleDia.estudiantes.push(buildStudentDayStatus(estudiante, estadoActual));
  });

  const estudiantesById = new Map(
    estudiantes.map((item) => [
      Number(item.id),
      `${item.nombres || ''} ${item.apellidos || ''}`.trim()
    ])
  );

  const estudiantesConMasFaltas = Array.from(estudiantesMap.values())
    .map((item) => ({
      ...item,
      nombre: estudiantesById.get(Number(item.estudianteId)) || `Estudiante ${item.estudianteId}`
    }))
    .sort((left, right) => {
      const byMissing = Number(right.inasistencias || 0) - Number(left.inasistencias || 0);
      if (byMissing !== 0) return byMissing;
      return String(left.nombre || '').localeCompare(String(right.nombre || ''));
    });

  const diasMasCriticosMes = Array.from(diasMap.values())
    .sort(compareByMissingThenDate)
    .slice(0, 7);

  res.json({
    curso: {
      id: curso.id,
      nombre: curso.nombre,
      schoolId
    },
    mes: monthKey,
    fecha,
    resumenMes: {
      ...resumenMes,
      diasConRegistro: diasConRegistro.size,
      diasConInasistencias: diasMap.size,
      estudiantesConFaltas: estudiantesConMasFaltas.length
    },
    detalleDia,
    diasMasCriticosMes,
    estudiantesConMasFaltas: estudiantesConMasFaltas.slice(0, 10)
  });
}
