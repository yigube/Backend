import nodemailer from 'nodemailer';

const toBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

const getMailerConfig = () => ({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 587),
  secure: toBool(process.env.SMTP_SECURE, false),
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
});

let cachedTransporter = null;
let cachedKey = '';

const getTransporter = () => {
  const config = getMailerConfig();
  const missing = [];
  if (!config.host) missing.push('SMTP_HOST');
  if (!config.port || Number.isNaN(config.port)) missing.push('SMTP_PORT');
  if (!config.user) missing.push('SMTP_USER');
  if (!config.pass) missing.push('SMTP_PASS');
  if (!config.from) missing.push('SMTP_FROM');
  if (missing.length) {
    const error = new Error(`Configuracion SMTP incompleta: ${missing.join(', ')}`);
    error.code = 'SMTP_CONFIG_MISSING';
    throw error;
  }

  const key = `${config.host}:${config.port}:${config.secure}:${config.user}:${config.from}`;
  if (cachedTransporter && cachedKey === key) return { transporter: cachedTransporter, from: config.from };

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass }
  });
  cachedKey = key;
  return { transporter: cachedTransporter, from: config.from };
};

export async function sendTemporaryPasswordEmail({ to, nombre, temporaryPassword }) {
  const { transporter, from } = getTransporter();
  const safeName = String(nombre || '').trim() || 'usuario';
  const safePassword = String(temporaryPassword || '').trim();
  const subject = 'Clave temporal de acceso - Control de asistencia';
  const text = [
    `Hola ${safeName},`,
    '',
    'Se genero una clave temporal para tu cuenta.',
    `Clave temporal: ${safePassword}`,
    '',
    'Ingresa a la aplicacion y cambiala de inmediato por seguridad.'
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.45;color:#0f172a">
      <h2 style="margin:0 0 12px;color:#0f172a">Clave temporal de acceso</h2>
      <p>Hola <strong>${safeName}</strong>,</p>
      <p>Se genero una clave temporal para tu cuenta.</p>
      <p style="font-size:16px;margin:10px 0"><strong>Clave temporal:</strong> <code style="font-size:18px;background:#e2e8f0;padding:3px 8px;border-radius:6px">${safePassword}</code></p>
      <p>Ingresa a la aplicacion y cambiala de inmediato por seguridad.</p>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html
  });
}
