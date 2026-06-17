import { Op, UniqueConstraintError } from 'sequelize';
import {
  Acudiente,
  Asistencia,
  Colegio,
  Curso,
  Estudiante,
  Materia,
  NotificacionWhatsApp
} from '../models/index.js';

export const ABSENCE_TEMPLATE = 'student_absence_v1';

const normalizePhone = (value = '') => String(value || '').trim().replace(/\s+/g, '');

const isValidE164 = (value = '') => /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));

const getWhatsAppProviderMode = () => String(process.env.WHATSAPP_PROVIDER || 'disabled').trim().toLowerCase();

const maskPhone = (value = '') => {
  const phone = normalizePhone(value);
  if (phone.length <= 5) return phone;
  return `${phone.slice(0, 3)}***${phone.slice(-2)}`;
};

const buildAbsencePayload = ({ asistencia, acudiente }) => {
  const estudiante = asistencia?.estudiante;
  const curso = asistencia?.curso;
  const materia = asistencia?.materia;
  const colegio = asistencia?.colegio;
  return {
    to: normalizePhone(acudiente?.telefonoE164),
    toMasked: maskPhone(acudiente?.telefonoE164),
    acudienteNombre: String(acudiente?.nombre || '').trim(),
    estudianteNombre: `${estudiante?.nombres || ''} ${estudiante?.apellidos || ''}`.trim(),
    cursoNombre: String(curso?.nombre || '').trim(),
    colegioNombre: String(colegio?.nombre || '').trim(),
    materiaNombre: String(materia?.nombre || '').trim() || null,
    fecha: asistencia?.fecha,
    estado: asistencia?.estado
  };
};

const sendWithConfiguredProvider = async ({ payload, template }) => {
  const provider = getWhatsAppProviderMode();

  if (provider === 'disabled' || provider === 'none') {
    const error = new Error('WHATSAPP_PROVIDER_DISABLED');
    error.code = 'WHATSAPP_PROVIDER_DISABLED';
    throw error;
  }

  if (provider === 'mock') {
    return {
      providerMessageId: `mock-${template}-${Date.now()}`,
      status: 'sent'
    };
  }

  const error = new Error(`Proveedor WhatsApp no soportado: ${provider}`);
  error.code = 'WHATSAPP_PROVIDER_UNSUPPORTED';
  throw error;
};

const createOrGetNotification = async ({ asistenciaId, acudienteId, payload }) => {
  try {
    const [notification] = await NotificacionWhatsApp.findOrCreate({
      where: {
        asistenciaId,
        acudienteId,
        template: ABSENCE_TEMPLATE
      },
      defaults: {
        asistenciaId,
        acudienteId,
        template: ABSENCE_TEMPLATE,
        payload,
        status: 'pending',
        attempts: 0
      }
    });
    return notification;
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    return NotificacionWhatsApp.findOne({
      where: {
        asistenciaId,
        acudienteId,
        template: ABSENCE_TEMPLATE
      }
    });
  }
};

export async function processWhatsAppAbsenceNotification({ asistenciaId } = {}) {
  const id = Number(asistenciaId);
  if (!Number.isInteger(id) || id <= 0) return { queued: 0, sent: 0, failed: 0, skipped: 1 };

  const asistencia = await Asistencia.findByPk(id, {
    include: [
      { model: Estudiante, attributes: ['id', 'nombres', 'apellidos'] },
      { model: Curso, attributes: ['id', 'nombre'] },
      { model: Colegio, attributes: ['id', 'nombre'] },
      { model: Materia, as: 'materia', attributes: ['id', 'nombre'], required: false }
    ]
  });

  if (!asistencia || asistencia.estado !== 'ausente') {
    return { queued: 0, sent: 0, failed: 0, skipped: 1 };
  }

  const acudientes = await Acudiente.findAll({
    where: {
      estudianteId: asistencia.estudianteId,
      activo: true,
      whatsappOptIn: true,
      telefonoE164: { [Op.ne]: '' }
    },
    order: [['id', 'ASC']]
  });

  const validAcudientes = acudientes.filter((item) => isValidE164(item.telefonoE164));
  if (!validAcudientes.length) {
    return { queued: 0, sent: 0, failed: 0, skipped: 1 };
  }

  const result = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const acudiente of validAcudientes) {
    const payload = buildAbsencePayload({ asistencia, acudiente });
    // eslint-disable-next-line no-await-in-loop
    const notification = await createOrGetNotification({
      asistenciaId: asistencia.id,
      acudienteId: acudiente.id,
      payload
    });

    if (!notification || notification.status === 'sent') {
      result.skipped += 1;
      continue;
    }

    notification.payload = payload;
    notification.status = 'pending';
    result.queued += 1;
    try {
      // eslint-disable-next-line no-await-in-loop
      const providerResult = await sendWithConfiguredProvider({ payload, template: ABSENCE_TEMPLATE });
      notification.status = 'sent';
      notification.providerMessageId = providerResult?.providerMessageId || null;
      notification.error = null;
      notification.sentAt = new Date();
      result.sent += 1;
    } catch (error) {
      notification.status = 'failed';
      notification.error = error?.code || error?.message || 'WHATSAPP_SEND_FAILED';
      result.failed += 1;
    }
    notification.attempts = Number(notification.attempts || 0) + 1;
    // eslint-disable-next-line no-await-in-loop
    await notification.save();
  }

  return result;
}

export function scheduleWhatsAppAbsenceNotification({ asistenciaId } = {}) {
  setTimeout(() => {
    processWhatsAppAbsenceNotification({ asistenciaId }).catch((error) => {
      if (process.env.NODE_ENV !== 'test') {
        console.warn('No se pudo procesar notificacion WhatsApp de ausencia', error?.message || error);
      }
    });
  }, 0);
}
