// Controlador de asistencias: registra desde QR y entrega resumen por curso/periodo.
import { Op } from 'sequelize';
import { Asistencia, Estudiante, Curso, Periodo } from '../models/index.js';
import { calcularPorcentajeInasistencia } from '../utils/calc.js';

/** Registra asistencia a partir de un QR validando pertenencia a curso y periodo activo. */
export async function registrarDesdeQR(req, res) {
  const schoolId = req.user.schoolId;
  const { qr, cursoId, fecha, presente } = req.body;
  if (!qr || !cursoId || !fecha) return res.status(400).json({ error: 'qr, cursoId y fecha son requeridos' });

  const estudiante = await Estudiante.findOne({
    where: { qr },
    include: { model: Curso, where: { schoolId }, required: true }
  });
  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' });

  // Normaliza fecha a YYYY-MM-DD para comparar con periodos (almacenados por rango).
  const fechaISO = fecha instanceof Date ? fecha.toISOString().slice(0, 10) : fecha;
  const periodo = await Periodo.findOne({
    where: { fechaInicio: { [Op.lte]: fechaISO }, fechaFin: { [Op.gte]: fechaISO }, schoolId }
  });
  if (!periodo) return res.status(400).json({ error: 'No existe periodo activo para la fecha' });

  if (Number(estudiante.cursoId) !== Number(cursoId)) {
    return res.status(400).json({ error: 'El estudiante no pertenece al curso indicado' });
  }

  try {
    const registro = await Asistencia.create({
      fecha: fechaISO,
      presente: presente !== false,
      estudianteId: estudiante.id,
      cursoId,
      periodoId: periodo.id,
      schoolId
    });
    try {
      const io = req.app.get('io');
      if (io) io.emit('asistencia:registrada', { estudianteId: registro.estudianteId, cursoId: registro.cursoId, fecha: registro.fecha, presente: registro.presente });
    } catch {}
    res.status(201).json({ message: 'Asistencia registrada', registro });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ error: 'Ya existe registro para este estudiante/curso/fecha' });
    }
    throw e;
  }
}

/** Devuelve resumen de asistencias por curso/periodo incluyendo alertas de inasistencia. */
export async function resumenCurso(req, res) {
  const schoolId = req.user.schoolId;
  const { cursoId, periodoId, totalClases: totalClasesParam } = req.query;
  if (!cursoId || !periodoId) return res.status(400).json({ error: 'cursoId y periodoId son requeridos' });

  const curso = await Curso.findOne({ where: { id: cursoId, schoolId } });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  const periodo = await Periodo.findOne({ where: { id: periodoId, schoolId } });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

  const estudiantes = await Estudiante.findAll({ where: { cursoId } });
  const asistencias = await Asistencia.findAll({ where: { cursoId, periodoId, schoolId } });
  const sesionesRegistradas = new Set(asistencias.map(a => a.fecha)).size;
  // Usa el mayor entre sesiones registradas y el total reportado por el cliente.
  const totalClasesPeriodo = Math.max(
    sesionesRegistradas,
    Number(totalClasesParam) || sesionesRegistradas || 0
  );

  const data = estudiantes.map(est => {
    const asistEst = asistencias.filter(a => a.estudianteId === est.id);
    const presentes = asistEst.filter(a => a.presente).length;
    const ausenciasRegistradas = asistEst.filter(a => !a.presente).length;
    const { porcentaje, ausencias, alerta25 } = calcularPorcentajeInasistencia(
      totalClasesPeriodo,
      presentes,
      ausenciasRegistradas
    );
    return {
      estudianteId: est.id,
      nombre: `${est.nombres} ${est.apellidos}`,
      presentes,
      ausencias,
      porcentajeInasistencia: porcentaje,
      alerta25
    };
  });

  const alertas = data.filter(d => d.alerta25).map(d => ({
    estudianteId: d.estudianteId, nombre: d.nombre, motivo: 'Inasistencia >= 25%'
  }));

  res.json({ cursoId: Number(cursoId), periodoId: Number(periodoId), totalClasesPeriodo, resumen: data, alertas });
}
