import { Op, UniqueConstraintError } from 'sequelize';
import bcrypt from 'bcrypt';
import { sequelize } from '../config/database.js';
import { Colegio, Rector, Usuario } from '../models/index.js';
import { mapUniqueConstraintMessage, normalizeOptionalText } from './crud.helpers.js';

const DIRECTIVO_ROLES = ['rector', 'coordinador'];

const normalizeCodigoDane = (value) => {
  if (!value) return null;
  const nextValue = String(value).trim().toUpperCase();
  return nextValue || null;
};

const buildColegioPayload = (body) => ({
  nombre: normalizeOptionalText(body.nombre),
  codigoDane: normalizeCodigoDane(body.codigoDane)
});

const buildRectorPayload = async (body, { partial = false } = {}) => {
  const cargo = normalizeOptionalText(body.rectorCargo)?.toLowerCase();
  const payload = {};
  const addIfAllowed = (bodyKey, payloadKey, formatter = normalizeOptionalText) => {
    if (!partial || Object.prototype.hasOwnProperty.call(body, bodyKey)) {
      payload[payloadKey] = formatter(body[bodyKey]);
    }
  };
  addIfAllowed('rectorNombre', 'nombre');
  addIfAllowed('rectorApellido', 'apellido');
  addIfAllowed('rectorCorreo', 'correo', (value) => normalizeOptionalText(value)?.toLowerCase() || null);
  addIfAllowed('rectorTelefono', 'telefono');
  addIfAllowed('rectorCedula', 'cedula');
  if ((!partial || Object.prototype.hasOwnProperty.call(body, 'rectorCargo')) && (cargo === 'rector' || cargo === 'coordinador')) {
    payload.cargo = cargo;
  }
  const plainPassword = normalizeOptionalText(body.rectorPassword);
  if (plainPassword) {
    payload.passwordHash = await bcrypt.hash(plainPassword, 10);
    payload.mustChangePassword = true;
  }
  return payload;
};

const hasRectorProfileField = (body) => (
  Object.prototype.hasOwnProperty.call(body, 'rectorNombre')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCargo')
  || Object.prototype.hasOwnProperty.call(body, 'rectorApellido')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCorreo')
  || Object.prototype.hasOwnProperty.call(body, 'rectorTelefono')
  || Object.prototype.hasOwnProperty.call(body, 'rectorCedula')
);

const hasRectorCredentialField = (body) => Object.prototype.hasOwnProperty.call(body, 'rectorPassword');

const hasSomeRectorValue = (rectorPayload) => (
  Boolean(rectorPayload.cargo)
  || Boolean(rectorPayload.nombre)
  || Boolean(rectorPayload.apellido)
  || Boolean(rectorPayload.correo)
  || Boolean(rectorPayload.telefono)
  || Boolean(rectorPayload.cedula)
  || Boolean(rectorPayload.passwordHash)
);

const buildDirectivoUsuarioPayload = (rector, schoolId) => {
  const correo = normalizeOptionalText(rector?.correo)?.toLowerCase();
  if (!correo) return null;
  const nombre = [rector?.nombre, rector?.apellido].filter(Boolean).join(' ').trim() || correo;
  const payload = {
    nombre,
    email: correo,
    rol: rector?.cargo === 'coordinador' ? 'coordinador' : 'rector',
    schoolId,
    mustChangePassword: Boolean(rector?.mustChangePassword)
  };
  if (rector?.passwordHash) payload.passwordHash = rector.passwordHash;
  return payload;
};

const findDirectivoUsuario = async ({ email, schoolId, transaction }) => {
  const correo = normalizeOptionalText(email)?.toLowerCase();
  if (!correo) return null;
  return Usuario.findOne({
    where: {
      email: correo,
      schoolId,
      rol: { [Op.in]: DIRECTIVO_ROLES }
    },
    transaction
  });
};

const syncDirectivoUsuario = async ({ rector, previousCorreo = null, transaction }) => {
  const payload = buildDirectivoUsuarioPayload(rector, rector?.schoolId);
  if (!payload) return null;
  const previousUsuario = await findDirectivoUsuario({
    email: previousCorreo,
    schoolId: rector.schoolId,
    transaction
  });
  const currentUsuario = previousUsuario || await findDirectivoUsuario({
    email: payload.email,
    schoolId: rector.schoolId,
    transaction
  });
  if (currentUsuario) {
    await currentUsuario.update(payload, { transaction });
    return currentUsuario;
  }
  if (!payload.passwordHash) return null;
  return Usuario.create(payload, { transaction });
};

const removeDirectivoUsuario = async ({ rector, transaction }) => {
  const usuario = await findDirectivoUsuario({
    email: rector?.correo,
    schoolId: rector?.schoolId,
    transaction
  });
  if (usuario) await usuario.destroy({ transaction });
};

const serializeColegio = (colegio) => {
  const raw = colegio.toJSON ? colegio.toJSON() : colegio;
  const rector = raw.rector || null;
  const rectorPublic = rector ? {
    cargo: rector.cargo ?? null,
    nombre: rector.nombre ?? null,
    apellido: rector.apellido ?? null,
    correo: rector.correo ?? null,
    telefono: rector.telefono ?? null,
    cedula: rector.cedula ?? null
  } : null;
  return {
    ...raw,
    rector: rectorPublic,
    rectorTienePassword: Boolean(rector?.passwordHash),
    rectorCargo: rector?.cargo ?? 'rector',
    rectorNombre: rector?.nombre ?? null,
    rectorApellido: rector?.apellido ?? null,
    rectorCorreo: rector?.correo ?? null,
    rectorTelefono: rector?.telefono ?? null,
    rectorCedula: rector?.cedula ?? null
  };
};

export async function listarColegios(req, res) {
  const where = req.user?.rol === 'admin'
    ? {}
    : { id: req.user?.schoolId };
  const data = await Colegio.findAll({
    where,
    attributes: ['id', 'nombre', 'codigoDane'],
    include: [{
      model: Rector,
      as: 'rector',
      attributes: ['cargo', 'nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
      required: false
    }]
  });
  res.json(data.map(serializeColegio));
}

export async function crearColegio(req, res) {
  const colegioPayload = buildColegioPayload(req.body);
  const rectorPayload = await buildRectorPayload(req.body);
  const codigoDane = colegioPayload.codigoDane;
  if (codigoDane) {
    const exists = await Colegio.findOne({ where: { codigoDane } });
    if (exists) return res.status(409).json({ error: 'El codigo DANE ya existe' });
  }
  try {
    const colegio = await sequelize.transaction(async (transaction) => {
      const createdColegio = await Colegio.create(colegioPayload, { transaction });
      if (hasSomeRectorValue(rectorPayload)) {
        const rector = await Rector.create({ schoolId: createdColegio.id, ...rectorPayload }, { transaction });
        await syncDirectivoUsuario({ rector, transaction });
      }
      return createdColegio;
    });
    const created = await Colegio.findByPk(colegio.id, {
      attributes: ['id', 'nombre', 'codigoDane'],
      include: [{
        model: Rector,
        as: 'rector',
        attributes: ['cargo', 'nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
        required: false
      }]
    });
    return res.status(201).json(serializeColegio(created));
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(error) });
    }
    throw error;
  }
}

export async function actualizarColegio(req, res) {
  const colegio = await Colegio.findByPk(req.params.id, {
    include: [{ model: Rector, as: 'rector', required: false }]
  });
  if (!colegio) return res.status(404).json({ error: 'Colegio no encontrado' });
  const colegioPayload = buildColegioPayload(req.body);
  const rectorPayload = await buildRectorPayload(req.body, { partial: true });

  try {
    await sequelize.transaction(async (transaction) => {
      if (colegioPayload.nombre) colegio.nombre = colegioPayload.nombre;
      if (Object.prototype.hasOwnProperty.call(req.body, 'codigoDane')) {
        const codigoDane = colegioPayload.codigoDane;
        if (codigoDane) {
          const exists = await Colegio.findOne({ where: { codigoDane, id: { [Op.ne]: colegio.id } }, transaction });
          if (exists) {
            const error = new Error('El codigo DANE ya existe');
            error.statusCode = 409;
            throw error;
          }
        }
        colegio.codigoDane = codigoDane;
      }
      await colegio.save({ transaction });
      if (hasRectorProfileField(req.body) || hasRectorCredentialField(req.body)) {
        const hasValue = hasSomeRectorValue(rectorPayload);
        const canRemoveRector = hasRectorProfileField(req.body) && !hasRectorCredentialField(req.body);
        if (colegio.rector && !hasValue && canRemoveRector) {
          await removeDirectivoUsuario({ rector: colegio.rector, transaction });
          await colegio.rector.destroy({ transaction });
        } else if (colegio.rector && hasValue) {
          const previousCorreo = colegio.rector.correo;
          await colegio.rector.update(rectorPayload, { transaction });
          await syncDirectivoUsuario({ rector: colegio.rector, previousCorreo, transaction });
        } else if (!colegio.rector && hasValue) {
          const rector = await Rector.create({ schoolId: colegio.id, ...rectorPayload }, { transaction });
          await syncDirectivoUsuario({ rector, transaction });
        }
      }
    });
    const updated = await Colegio.findByPk(colegio.id, {
      attributes: ['id', 'nombre', 'codigoDane'],
      include: [{
        model: Rector,
        as: 'rector',
        attributes: ['cargo', 'nombre', 'apellido', 'correo', 'telefono', 'cedula', 'passwordHash'],
        required: false
      }]
    });
    return res.json(serializeColegio(updated));
  } catch (error) {
    if (error?.statusCode === 409) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof UniqueConstraintError) {
      return res.status(409).json({ error: mapUniqueConstraintMessage(error) });
    }
    throw error;
  }
}

export async function eliminarColegio(req, res) {
  const colegio = await Colegio.findByPk(req.params.id);
  if (!colegio) return res.status(404).json({ error: 'Colegio no encontrado' });
  await colegio.destroy();
  res.json({ ok: true });
}
