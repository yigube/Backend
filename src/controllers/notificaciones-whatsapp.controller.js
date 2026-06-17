import {
  Acudiente,
  Asistencia,
  Curso,
  Estudiante,
  NotificacionWhatsApp
} from '../models/index.js';

const canManageAcrossSchools = (req) => req.user?.rol === 'admin' && !req.user?.schoolId;

export async function listarNotificacionesWhatsApp(req, res) {
  const status = String(req.query?.status || '').trim();
  const estudianteId = Number(req.query?.estudianteId || 0);
  const where = {};
  if (['pending', 'sent', 'failed'].includes(status)) where.status = status;

  const cursoWhere = canManageAcrossSchools(req)
    ? {}
    : { schoolId: req.user?.schoolId };
  const asistenciaWhere = estudianteId > 0 ? { estudianteId } : {};

  const rows = await NotificacionWhatsApp.findAll({
    where,
    include: [
      {
        model: Asistencia,
        where: asistenciaWhere,
        required: true,
        include: [
          { model: Estudiante, attributes: ['id', 'nombres', 'apellidos'] },
          { model: Curso, attributes: ['id', 'nombre', 'schoolId'], where: cursoWhere, required: true }
        ]
      },
      { model: Acudiente, as: 'acudiente', attributes: ['id', 'nombre', 'telefonoE164', 'parentesco'] }
    ],
    order: [['createdAt', 'DESC']],
    limit: Math.min(Number(req.query?.limit || 100) || 100, 200)
  });

  res.json(rows.map((item) => {
    const raw = item.toJSON();
    const asistencia = raw.asistencia || raw.asistencium || {};
    const estudiante = asistencia.estudiante || {};
    const curso = asistencia.curso || {};
    const acudiente = raw.acudiente || {};
    return {
      id: raw.id,
      asistenciaId: raw.asistenciaId,
      acudienteId: raw.acudienteId,
      template: raw.template,
      status: raw.status,
      providerMessageId: raw.providerMessageId || null,
      error: raw.error || null,
      attempts: raw.attempts || 0,
      sentAt: raw.sentAt || null,
      createdAt: raw.createdAt,
      estudiante: {
        id: estudiante.id,
        nombre: `${estudiante.nombres || ''} ${estudiante.apellidos || ''}`.trim()
      },
      curso: {
        id: curso.id,
        nombre: curso.nombre || ''
      },
      acudiente: {
        id: acudiente.id,
        nombre: acudiente.nombre || '',
        telefonoE164: acudiente.telefonoE164 || '',
        parentesco: acudiente.parentesco || ''
      }
    };
  }));
}
