import { Asistencia, Curso } from '../models/index.js';
import { aggregateAttendanceRowsByStudentDate } from '../utils/asistenciaAggregation.js';
import {
  ABSENCE_STATES,
  addEstadoToCounter,
  buildEmptyCounter,
  buildPeriodoScope,
  compareByDate,
  compareByMissingThenDate,
  createCourseEntry,
  createDailyEntry,
  createMonthlyEntry,
  createWeeklyEntry,
  getISOWeekData,
  normalizeEstado,
  normalizedPeriodoId,
  parseISODateUTC,
  resolveReportSchoolId
} from './reportes.helpers.js';

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
      'materiaId',
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

  const registrosAgrupados = aggregateAttendanceRowsByStudentDate(registros);
  const courseNameById = new Map(
    registros.map((registro) => [Number(registro?.cursoId), String(registro?.curso?.nombre || `Curso ${registro?.cursoId}`)])
  );

  const totals = buildEmptyCounter();
  const absentStudentIds = new Set();
  const courseIds = new Set();
  const daysWithMissing = new Set();
  const byDay = new Map();
  const byWeek = new Map();
  const byMonth = new Map();
  const courseMap = new Map();

  registrosAgrupados.forEach((registro) => {
    const estado = normalizeEstado(registro);
    const fecha = String(registro.fecha);
    const cursoId = Number(registro.cursoId);
    const cursoNombre = courseNameById.get(cursoId) || `Curso ${cursoId}`;
    const fechaDate = parseISODateUTC(fecha);

    addEstadoToCounter(totals, estado);
    courseIds.add(cursoId);

    if (!byDay.has(fecha)) byDay.set(fecha, createDailyEntry(fecha));
    addEstadoToCounter(byDay.get(fecha), estado);

    if (fechaDate) {
      const weekData = getISOWeekData(fechaDate);
      if (!byWeek.has(weekData.weekKey)) byWeek.set(weekData.weekKey, createWeeklyEntry(weekData));
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

    if (!courseMap.has(cursoId)) courseMap.set(cursoId, createCourseEntry({ cursoId, cursoNombre }));
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
