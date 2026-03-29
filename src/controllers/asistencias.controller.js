// Controlador de asistencias: registra desde QR y entrega resumen por curso/periodo.
import { Op } from 'sequelize';
import { Asistencia, Estudiante, Curso, Periodo } from '../models/index.js';
import { calcularPorcentajeInasistencia } from '../utils/calc.js';

const ESTADOS_ASISTENCIA = ['presente', 'tarde', 'afuera', 'ausente'];
const isAdmin = (req) => req.user?.rol === 'admin';
const estadoACampoPresente = (estado) => estado === 'presente' || estado === 'tarde';
const flagsDesdeEstado = (estado) => ({
  tarde: estado === 'tarde',
  afuera: estado === 'afuera',
  ausente: estado === 'ausente'
});
const resolverEstado = ({ estado, presente, tarde, afuera, ausente }) => {
  if (estado) return String(estado).toLowerCase();
  if (ausente === true) return 'ausente';
  if (afuera === true) return 'afuera';
  if (tarde === true) return 'tarde';
  if (presente === false) return 'ausente';
  return 'presente';
};
const normalizeFechaISODateOnly = (value) => {
  if (!value) return null;
  if (typeof value === 'string') {
    const v = value.trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    if (v.includes('T')) return v.split('T')[0];
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
};
const resolveCursoForRequest = async (req, cursoId) => {
  const where = isAdmin(req)
    ? { id: cursoId }
    : { id: cursoId, schoolId: req.user.schoolId };
  return Curso.findOne({ where });
};

/** Registra asistencia a partir de un QR validando pertenencia a curso y periodo activo. */
export async function registrarDesdeQR(req, res) {
  const { qr, cursoId, fecha, presente, estado, tarde, afuera, ausente } = req.body;
  if (!qr || !cursoId || !fecha) return res.status(400).json({ error: 'qr, cursoId y fecha son requeridos' });
  if (estado && !ESTADOS_ASISTENCIA.includes(String(estado).toLowerCase())) {
    return res.status(400).json({ error: 'estado invalido' });
  }

  let schoolId = req.user.schoolId;
  let curso = null;
  let estudiante = null;

  if (isAdmin(req)) {
    curso = await resolveCursoForRequest(req, cursoId);
    if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
    schoolId = curso.schoolId;
    estudiante = await Estudiante.findOne({ where: { qr } });
  } else {
    estudiante = await Estudiante.findOne({
      where: { qr },
      include: { model: Curso, where: { schoolId }, required: true }
    });
  }

  if (!estudiante) return res.status(404).json({ error: 'Estudiante no encontrado' });

  // Normaliza fecha a YYYY-MM-DD para comparar con periodos (almacenados por rango).
  const fechaISO = normalizeFechaISODateOnly(fecha);
  if (!fechaISO) return res.status(400).json({ error: 'fecha invalida' });
  const periodo = await Periodo.findOne({
    where: { fechaInicio: { [Op.lte]: fechaISO }, fechaFin: { [Op.gte]: fechaISO }, schoolId }
  });
  if (!periodo) return res.status(400).json({ error: 'No existe periodo activo para la fecha' });

  if (Number(estudiante.cursoId) !== Number(cursoId)) {
    return res.status(400).json({ error: 'El estudiante no pertenece al curso indicado' });
  }

  const estadoNormalizado = resolverEstado({ estado, presente, tarde, afuera, ausente });
  const flagsEstado = flagsDesdeEstado(estadoNormalizado);
  const existente = await Asistencia.findOne({
    where: { fecha: fechaISO, estudianteId: estudiante.id, cursoId, schoolId }
  });
  if (existente) {
    const hayActualizacionExplicita = Boolean(
      estado
      || tarde === true
      || afuera === true
      || ausente === true
      || presente === false
    );
    if (!hayActualizacionExplicita) {
      return res.status(409).json({ error: 'Ya existe registro para este estudiante/curso/fecha' });
    }
    existente.estado = estadoNormalizado;
    existente.presente = estadoACampoPresente(estadoNormalizado);
    existente.tarde = flagsEstado.tarde;
    existente.afuera = flagsEstado.afuera;
    existente.ausente = flagsEstado.ausente;
    await existente.save();
    try {
      const io = req.app.get('io');
      if (io) io.emit('asistencia:registrada', { estudianteId: existente.estudianteId, cursoId: existente.cursoId, fecha: existente.fecha, presente: existente.presente, estado: existente.estado, actualizado: true });
    } catch {}
    return res.status(200).json({ message: 'Asistencia actualizada', registro: existente });
  }

  try {
    const registro = await Asistencia.create({
      fecha: fechaISO,
      estado: estadoNormalizado,
      presente: estado ? estadoACampoPresente(estadoNormalizado) : (presente !== false),
      tarde: flagsEstado.tarde,
      afuera: flagsEstado.afuera,
      ausente: flagsEstado.ausente,
      estudianteId: estudiante.id,
      cursoId,
      periodoId: periodo.id,
      schoolId
    });
    try {
      const io = req.app.get('io');
      if (io) io.emit('asistencia:registrada', { estudianteId: registro.estudianteId, cursoId: registro.cursoId, fecha: registro.fecha, presente: registro.presente, estado: registro.estado });
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
  const { cursoId, periodoId, totalClases: totalClasesParam } = req.query;
  if (!cursoId || !periodoId) return res.status(400).json({ error: 'cursoId y periodoId son requeridos' });

  const curso = await resolveCursoForRequest(req, cursoId);
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  const schoolId = curso.schoolId;
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
    const presentes = asistEst.filter(a => a.estado === 'presente').length;
    const tardes = asistEst.filter(a => a.estado === 'tarde').length;
    const afuera = asistEst.filter(a => a.estado === 'afuera').length;
    const ausente = asistEst.filter(a => a.estado === 'ausente').length;
    const asistenciasValidas = presentes + tardes;
    const { porcentaje, ausencias, alerta25 } = calcularPorcentajeInasistencia(
      totalClasesPeriodo,
      asistenciasValidas,
      ausente + afuera
    );
    return {
      estudianteId: est.id,
      nombre: `${est.nombres} ${est.apellidos}`,
      presentes: asistenciasValidas,
      detalleEstado: { presente: presentes, tarde: tardes, afuera, ausente },
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

/** Lista estudiantes ausentes para una fecha dada (sin registro o con estado ausente). */
export async function listarAusentesCurso(req, res) {
  const cursoId = Number(req.query.cursoId);
  const fechaISO = normalizeFechaISODateOnly(req.query.fecha) || new Date().toISOString().slice(0, 10);

  if (!cursoId) {
    return res.status(400).json({ error: 'cursoId es requerido' });
  }
  if (!fechaISO) {
    return res.status(400).json({ error: 'fecha invalida' });
  }

  const curso = await resolveCursoForRequest(req, cursoId);
  if (!curso) {
    return res.status(404).json({ error: 'Curso no encontrado' });
  }
  const schoolId = curso.schoolId;

  const estudiantes = await Estudiante.findAll({
    where: { cursoId },
    order: [['apellidos', 'ASC'], ['nombres', 'ASC']]
  });

  const asistenciasDia = await Asistencia.findAll({
    where: { cursoId, schoolId, fecha: fechaISO },
    attributes: ['estudianteId', 'estado']
  });
  const asistenciaPorEstudiante = new Map(
    asistenciasDia.map((item) => [Number(item.estudianteId), item.estado || null])
  );

  const ausentes = estudiantes
    .filter((estudiante) => {
      const estado = asistenciaPorEstudiante.get(Number(estudiante.id));
      return !estado || estado === 'ausente';
    })
    .map((estudiante) => ({
      id: estudiante.id,
      nombres: estudiante.nombres,
      apellidos: estudiante.apellidos,
      qr: estudiante.qr,
      codigoEstudiante: estudiante.codigoEstudiante || null,
      estadoActual: asistenciaPorEstudiante.get(Number(estudiante.id)) || null
    }));

  res.json({
    cursoId,
    fecha: fechaISO,
    totalAusentes: ausentes.length,
    ausentes
  });
}
