// Controlador de asistencias: registra desde QR y entrega resumen por curso/periodo.
import { Op } from 'sequelize';
import { Asistencia, Estudiante, Curso, Periodo, CursoDocente, DocenteCursoMateria, EstudianteMateria, Materia } from '../models/index.js';
import { calcularPorcentajeInasistencia } from '../utils/calc.js';
import { aggregateAttendanceRowsByStudentDate, normalizeEstadoAsistencia } from '../utils/asistenciaAggregation.js';

const ESTADOS_ASISTENCIA = ['presente', 'tarde', 'afuera', 'ausente'];
const isAdmin = (req) => req.user?.rol === 'admin';
const isDocente = (req) => req.user?.rol === 'docente';
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
const normalizeMateriaKey = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');
const resolveCursoForRequest = async (req, cursoId) => {
  const where = isAdmin(req)
    ? { id: cursoId }
    : { id: cursoId, schoolId: req.user.schoolId };
  const curso = await Curso.findOne({ where });
  if (!curso) return null;
  if (!isDocente(req)) return curso;

  const assigned = await CursoDocente.findOne({
    where: {
      usuarioId: req.user.id,
      cursoId: curso.id,
      schoolId: curso.schoolId
    },
    attributes: ['cursoId']
  });
  return assigned ? curso : null;
};
const resolveMateriaSeleccionadaCurso = async (req, cursoId, schoolId, materiaNombre) => {
  const materiaKey = normalizeMateriaKey(materiaNombre);
  if (!materiaKey) return null;
  const where = {
    cursoId: Number(cursoId),
    schoolId: Number(schoolId)
  };
  if (isDocente(req)) where.usuarioId = req.user.id;
  const rows = await DocenteCursoMateria.findAll({
    where,
    include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'] }]
  });
  const match = rows.find((item) => normalizeMateriaKey(item?.materia?.nombre) === materiaKey);
  if (!match) return null;
  return {
    id: Number(match?.materiaId || match?.materia?.id),
    nombre: String(match?.materia?.nombre || '').trim()
  };
};
const estudianteTieneMateriaEnCurso = async (estudianteId, cursoId, schoolId, materiaId) => {
  if (!estudianteId || !cursoId || !schoolId || !materiaId) return false;
  const row = await EstudianteMateria.findOne({
    where: {
      estudianteId: Number(estudianteId),
      cursoId: Number(cursoId),
      schoolId: Number(schoolId),
      materiaId: Number(materiaId)
    },
    attributes: ['id']
  });
  return Boolean(row);
};
const getDocenteMateriaRowsForCurso = async (req, cursoId, schoolId) => {
  if (!isDocente(req)) return [];
  const rows = await DocenteCursoMateria.findAll({
    where: {
      usuarioId: req.user.id,
      cursoId,
      schoolId
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
const getDocenteMateriaIdsForCurso = async (req, cursoId, schoolId) => {
  if (!isDocente(req)) return new Set();
  const rows = await getDocenteMateriaRowsForCurso(req, cursoId, schoolId);
  return new Set(
    rows
      .map((item) => Number(item?.materiaId || item?.materia?.id))
      .filter((id) => Number.isInteger(id) && id > 0)
  );
};
const resolveMateriaContextoParaCurso = async ({ req, cursoId, schoolId, materiaNombre = '', requiredMessage = 'Selecciona una materia para continuar' } = {}) => {
  const materiaNormalizada = String(materiaNombre || '').trim();
  if (materiaNormalizada) {
    const materia = await resolveMateriaSeleccionadaCurso(req, cursoId, schoolId, materiaNormalizada);
    return materia ? { materia, error: '' } : { materia: null, error: 'Materia no valida para el curso' };
  }
  if (!isDocente(req)) return { materia: null, error: '' };

  const materiasDocente = await getDocenteMateriaRowsForCurso(req, Number(cursoId), Number(schoolId));
  if (materiasDocente.length === 1) {
    const unica = materiasDocente[0];
    return {
      materia: {
        id: Number(unica?.materiaId || unica?.materia?.id),
        nombre: String(unica?.materia?.nombre || '').trim()
      },
      error: ''
    };
  }
  if (materiasDocente.length > 1) {
    return { materia: null, error: requiredMessage };
  }
  return { materia: null, error: '' };
};
const docentePuedeVerEstudiante = async (req, estudiante, cursoId, schoolId, { materiaId = null } = {}) => {
  if (!estudiante?.id) return false;
  const selectedMateriaId = Number(materiaId);
  if (!isDocente(req)) {
    if (!selectedMateriaId) return true;
    return estudianteTieneMateriaEnCurso(estudiante.id, cursoId, schoolId, selectedMateriaId);
  }

  const materiaIdsDocente = await getDocenteMateriaIdsForCurso(req, Number(cursoId), Number(schoolId));
  if (!materiaIdsDocente.size) return false;
  if (selectedMateriaId && !materiaIdsDocente.has(selectedMateriaId)) return false;

  const rows = await EstudianteMateria.findAll({
    where: {
      estudianteId: estudiante.id,
      cursoId: Number(cursoId),
      schoolId: Number(schoolId)
    },
    attributes: ['materiaId'],
    raw: true
  });
  return rows.some((item) => {
    const currentMateriaId = Number(item?.materiaId);
    if (!materiaIdsDocente.has(currentMateriaId)) return false;
    return !selectedMateriaId || currentMateriaId === selectedMateriaId;
  });
};
const filtrarEstudiantesVisiblesDocente = async (req, estudiantes, cursoId, schoolId, { materiaId = null } = {}) => {
  const selectedMateriaId = Number(materiaId);
  const estudianteIds = estudiantes
    .map((item) => Number(item?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!estudianteIds.length) return [];

  let materiaIdsDocente = null;
  if (isDocente(req)) {
    materiaIdsDocente = await getDocenteMateriaIdsForCurso(req, Number(cursoId), Number(schoolId));
    if (!materiaIdsDocente.size) return [];
    if (selectedMateriaId && !materiaIdsDocente.has(selectedMateriaId)) return [];
  }

  const rows = await EstudianteMateria.findAll({
    where: {
      estudianteId: { [Op.in]: estudianteIds },
      cursoId: Number(cursoId),
      schoolId: Number(schoolId)
    },
    attributes: ['estudianteId', 'materiaId'],
    raw: true
  });
  const estudianteIdsVisibles = new Set();
  rows.forEach((item) => {
    const estudianteId = Number(item?.estudianteId);
    const currentMateriaId = Number(item?.materiaId);
    if (!Number.isInteger(estudianteId) || estudianteId <= 0) return;
    if (selectedMateriaId && currentMateriaId !== selectedMateriaId) return;
    if (isDocente(req) && !materiaIdsDocente.has(currentMateriaId)) return;
    estudianteIdsVisibles.add(estudianteId);
  });
  return estudiantes.filter((item) => estudianteIdsVisibles.has(Number(item?.id)));
};

/** Registra asistencia a partir de un QR validando pertenencia a curso y periodo activo. */
export async function registrarDesdeQR(req, res) {
  const { qr, cursoId, fecha, presente, estado, tarde, afuera, ausente } = req.body;
  const materiaSeleccionada = String(req.body?.materia || '').trim();
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
  const materiaContext = await resolveMateriaContextoParaCurso({
    req,
    cursoId,
    schoolId,
    materiaNombre: materiaSeleccionada,
    requiredMessage: 'Selecciona una materia para registrar asistencia en este curso'
  });
  if (materiaContext.error) {
    return res.status(400).json({ error: materiaContext.error });
  }
  const materia = materiaContext.materia;
  if (materia && !(await estudianteTieneMateriaEnCurso(estudiante.id, cursoId, schoolId, materia.id))) {
    return res.status(400).json({ error: 'El estudiante no pertenece a la materia seleccionada' });
  }
  if (isDocente(req)) {
    const visible = await docentePuedeVerEstudiante(req, estudiante, cursoId, schoolId, { materiaId: materia?.id });
    if (!visible) return res.status(403).json({ error: 'No autorizado' });
  }

  const estadoNormalizado = resolverEstado({ estado, presente, tarde, afuera, ausente });
  const flagsEstado = flagsDesdeEstado(estadoNormalizado);
  const horaRegistro = new Date();
  const asistenciaWhere = {
    fecha: fechaISO,
    estudianteId: estudiante.id,
    cursoId,
    schoolId,
    materiaId: materia?.id || null
  };
  const existente = await Asistencia.findOne({
    where: asistenciaWhere
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
      return res.status(409).json({
        error: materia ? 'Ya existe registro para este estudiante/curso/materia/fecha' : 'Ya existe registro para este estudiante/curso/fecha'
      });
    }
    existente.estado = estadoNormalizado;
    existente.presente = estadoACampoPresente(estadoNormalizado);
    existente.tarde = flagsEstado.tarde;
    existente.afuera = flagsEstado.afuera;
    existente.ausente = flagsEstado.ausente;
    existente.horaRegistro = horaRegistro;
    existente.materiaId = materia?.id || null;
    await existente.save();
    await existente.reload({
      include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'], required: false }]
    });
    try {
      const io = req.app.get('io');
      if (io) io.emit('asistencia:registrada', {
        estudianteId: existente.estudianteId,
        cursoId: existente.cursoId,
        materiaId: existente.materiaId || null,
        fecha: existente.fecha,
        presente: existente.presente,
        estado: existente.estado,
        actualizado: true
      });
    } catch {}
    return res.status(200).json({ message: 'Asistencia actualizada', registro: existente });
  }

  try {
    const registro = await Asistencia.create({
      fecha: fechaISO,
      horaRegistro,
      estado: estadoNormalizado,
      presente: estado ? estadoACampoPresente(estadoNormalizado) : (presente !== false),
      tarde: flagsEstado.tarde,
      afuera: flagsEstado.afuera,
      ausente: flagsEstado.ausente,
      estudianteId: estudiante.id,
      cursoId,
      materiaId: materia?.id || null,
      periodoId: periodo.id,
      schoolId
    });
    await registro.reload({
      include: [{ model: Materia, as: 'materia', attributes: ['id', 'nombre'], required: false }]
    });
    try {
      const io = req.app.get('io');
      if (io) io.emit('asistencia:registrada', {
        estudianteId: registro.estudianteId,
        cursoId: registro.cursoId,
        materiaId: registro.materiaId || null,
        fecha: registro.fecha,
        presente: registro.presente,
        estado: registro.estado
      });
    } catch {}
    res.status(201).json({ message: 'Asistencia registrada', registro });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        error: materia ? 'Ya existe registro para este estudiante/curso/materia/fecha' : 'Ya existe registro para este estudiante/curso/fecha'
      });
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

  const estudiantesBase = await Estudiante.findAll({ where: { cursoId } });
  const estudiantes = await filtrarEstudiantesVisiblesDocente(req, estudiantesBase, cursoId, schoolId);
  const estudianteIds = estudiantes.map((item) => item.id);
  const docenteMateriaIds = await getDocenteMateriaIdsForCurso(req, Number(cursoId), Number(schoolId));
  const asistenciasWhere = { cursoId, periodoId, schoolId };
  if (isDocente(req) && docenteMateriaIds.size) {
    asistenciasWhere.materiaId = { [Op.in]: Array.from(docenteMateriaIds) };
  }
  const asistencias = await Asistencia.findAll({ where: asistenciasWhere });
  const asistenciasAgrupadas = aggregateAttendanceRowsByStudentDate(asistencias);
  const asistenciasVisibles = isDocente(req)
    ? asistenciasAgrupadas.filter((item) => estudianteIds.includes(item.estudianteId))
    : asistenciasAgrupadas;
  const sesionesRegistradas = new Set(asistenciasVisibles.map(a => a.fecha)).size;
  // Usa el mayor entre sesiones registradas y el total reportado por el cliente.
  const totalClasesPeriodo = Math.max(
    sesionesRegistradas,
    Number(totalClasesParam) || sesionesRegistradas || 0
  );

  const data = estudiantes.map(est => {
    const asistEst = asistenciasVisibles.filter(a => a.estudianteId === est.id);
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
  const materiaSeleccionada = String(req.query?.materia || '').trim();

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
  const materiaContext = await resolveMateriaContextoParaCurso({
    req,
    cursoId,
    schoolId,
    materiaNombre: materiaSeleccionada,
    requiredMessage: 'Selecciona una materia para consultar ausentes en este curso'
  });
  if (materiaContext.error) {
    return res.status(400).json({ error: materiaContext.error });
  }
  const materia = materiaContext.materia;

  const estudiantesBase = await Estudiante.findAll({
    where: { cursoId },
    order: [['apellidos', 'ASC'], ['nombres', 'ASC']]
  });
  const estudiantes = await filtrarEstudiantesVisiblesDocente(req, estudiantesBase, cursoId, schoolId, {
    materiaId: materia?.id
  });
  const estudianteIds = estudiantes.map((item) => item.id);

  const asistenciasWhere = {
    cursoId,
    schoolId,
    fecha: fechaISO,
    ...(materia ? { materiaId: materia.id } : {})
  };
  const asistenciasDia = await Asistencia.findAll({
    where: asistenciasWhere,
    attributes: ['estudianteId', 'cursoId', 'fecha', 'estado', 'presente', 'tarde', 'afuera', 'ausente']
  });
  const asistenciasAgrupadas = aggregateAttendanceRowsByStudentDate(asistenciasDia);
  const asistenciasVisibles = isDocente(req)
    ? asistenciasAgrupadas.filter((item) => estudianteIds.includes(item.estudianteId))
    : asistenciasAgrupadas;
  const asistenciaPorEstudiante = new Map(
    asistenciasVisibles.map((item) => [Number(item.estudianteId), item.estado || null])
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
    materia: materia?.nombre || null,
    totalAusentes: ausentes.length,
    ausentes
  });
}
