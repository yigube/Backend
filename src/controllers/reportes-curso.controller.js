import { Op } from 'sequelize';
import { Asistencia, Curso, Estudiante, Materia } from '../models/index.js';
import { aggregateAttendanceRowsByStudentDate } from '../utils/asistenciaAggregation.js';
import { canManageAcrossSchools } from './crud.helpers.js';
import {
  ABSENCE_STATES,
  addEstadoToCounter,
  buildEmptyCounter,
  buildMonthRange,
  buildStudentDayStatus,
  compareByMissingThenDate,
  normalizeEstado
} from './reportes.helpers.js';

export async function obtenerReporteInasistenciaCurso(req, res) {
  const cursoId = Number(req.query.cursoId);
  const fecha = String(req.query.fecha || '').trim();
  const monthKey = String(req.query.mes || '').trim();
  const monthRange = buildMonthRange(monthKey);

  if (!monthRange) return res.status(400).json({ error: 'mes invalido' });
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'fecha invalida' });
  if (!fecha.startsWith(`${monthKey}-`)) {
    return res.status(400).json({ error: 'La fecha seleccionada debe pertenecer al mes indicado' });
  }

  const curso = await Curso.findOne({
    where: canManageAcrossSchools(req)
      ? { id: cursoId }
      : { id: cursoId, schoolId: req.user.schoolId }
  });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

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
    attributes: ['fecha', 'estado', 'presente', 'tarde', 'afuera', 'ausente', 'estudianteId', 'cursoId', 'materiaId'],
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'], required: false }],
    order: [['fecha', 'ASC'], ['estudianteId', 'ASC']]
  });

  const asistenciasAgrupadas = aggregateAttendanceRowsByStudentDate(asistenciasMes, { includeMateriaDetails: true });

  const resumenMes = buildEmptyCounter();
  const diasMap = new Map();
  const estudiantesMap = new Map();
  const diasConRegistro = new Set();

  asistenciasAgrupadas.forEach((registro) => {
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

  const detallePorEstudianteDia = new Map(
    asistenciasAgrupadas
      .filter((registro) => String(registro.fecha) === fecha)
      .map((registro) => [Number(registro.estudianteId), registro])
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
    const detalleEstudiante = detallePorEstudianteDia.get(Number(estudiante.id)) || null;
    const estadoActual = detalleEstudiante?.estado || null;
    const esInasistencia = !estadoActual || estadoActual === 'ausente' || estadoActual === 'afuera';
    if (!esInasistencia) return;

    detalleDia.totalInasistencias += 1;
    if (!estadoActual) detalleDia.totalSinRegistro += 1;
    else if (estadoActual === 'afuera') detalleDia.totalAfuera += 1;
    else detalleDia.totalAusentes += 1;
    detalleDia.estudiantes.push(buildStudentDayStatus(
      estudiante,
      estadoActual,
      detalleEstudiante?.materias || []
    ));
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
