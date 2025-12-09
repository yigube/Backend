// Exporta reportes CSV de asistencias con scope por colegio.
import { Asistencia, Estudiante, Curso, Periodo } from '../models/index.js';
import { toCSV } from '../utils/csv.js';

/** Genera CSV de asistencias para un curso y periodo del colegio del usuario. */
export async function exportarCSV(req, res) {
  const schoolId = req.user.schoolId;
  const { cursoId, periodoId } = req.query;
  if (!cursoId || !periodoId) return res.status(400).json({ error: 'cursoId y periodoId son requeridos' });

  const curso = await Curso.findOne({ where: { id: cursoId, schoolId } });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  const periodo = await Periodo.findOne({ where: { id: periodoId, schoolId } });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

  const registros = await Asistencia.findAll({ where: { cursoId, periodoId, schoolId }, include: [Estudiante] });
  const rows = registros.map(r => ({
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
