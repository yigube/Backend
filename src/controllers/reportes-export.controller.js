import { Op } from 'sequelize';
import { Asistencia, Curso, Estudiante, Materia, Periodo } from '../models/index.js';
import { toCSV } from '../utils/csv.js';
import { canManageAcrossSchools, isDocente } from './crud.helpers.js';
import { normalizeEstado, resolveRequestedMateriaForCurso } from './reportes.helpers.js';

export async function exportarCSV(req, res) {
  const { cursoId, periodoId } = req.query;
  const materiaNombre = String(req.query?.materia || '').trim();
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

  const materiaScope = await resolveRequestedMateriaForCurso({
    req,
    cursoId,
    schoolId,
    materiaNombre
  });
  if (materiaScope.error) {
    return res.status(materiaScope.error === 'No autorizado' ? 403 : 400).json({ error: materiaScope.error });
  }

  const where = { cursoId, periodoId, schoolId };
  if (materiaScope.materia) {
    where.materiaId = materiaScope.materia.id;
  } else if (isDocente(req)) {
    const docenteMateriaIds = materiaScope.rows
      .map((item) => Number(item?.materiaId || item?.materia?.id))
      .filter((id) => Number.isInteger(id) && id > 0);
    where.materiaId = docenteMateriaIds.length > 0 ? { [Op.in]: docenteMateriaIds } : null;
  }

  const registros = await Asistencia.findAll({
    where,
    include: [
      Estudiante,
      { model: Materia, as: 'materia', attributes: ['id', 'nombre'], required: false }
    ],
    order: [['fecha', 'ASC'], ['horaRegistro', 'ASC'], ['estudianteId', 'ASC']]
  });

  const rows = registros.map((r) => ({
    fecha: r.fecha,
    horaRegistro: r.horaRegistro,
    cursoId: r.cursoId,
    periodoId: r.periodoId,
    estudianteId: r.estudianteId,
    estudiante: r.estudiante ? `${r.estudiante.nombres} ${r.estudiante.apellidos}` : '',
    materiaId: r.materiaId || null,
    materia: r.materia?.nombre || '',
    estado: normalizeEstado(r),
    presente: r.presente ? 'SI' : 'NO'
  }));

  const csv = await toCSV(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="asistencias.csv"');
  res.send(csv);
}
