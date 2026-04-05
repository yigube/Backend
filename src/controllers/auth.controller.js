// Controlador de autenticacion JWT.
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Usuario, Colegio, Rector } from "../models/index.js";

/** Login con email/password. Devuelve JWT con rol y schoolId. */
export async function login(req, res) {
  const { email, password } = req.body;
  const emailNorm = String(email || '').trim().toLowerCase();

  const [user, rector] = await Promise.all([
    Usuario.findOne({ where: { email: emailNorm } }),
    Rector.findOne({ where: { correo: emailNorm } })
  ]);

  const userPasswordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
  const rectorPasswordOk = rector?.passwordHash ? await bcrypt.compare(password, rector.passwordHash) : false;

  if (!userPasswordOk && !rectorPasswordOk) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }

  // Prioridad a usuarios cuando ambas credenciales coinciden.
  if (userPasswordOk) {
    const colegio = user.schoolId
      ? await Colegio.findOne({ where: { id: user.schoolId } })
      : null;
    const token = jwt.sign(
      { id: user.id, rol: user.rol, nombre: user.nombre, schoolId: user.schoolId ?? null, schoolName: colegio?.nombre ?? null },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    return res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        schoolId: user.schoolId ?? null,
        schoolName: colegio?.nombre || '',
        mustChangePassword: Boolean(user.mustChangePassword)
      }
    });
  }

  const colegio = await Colegio.findOne({ where: { id: rector.schoolId } });
  const nombreRector = [rector.nombre, rector.apellido].filter(Boolean).join(' ').trim() || 'Rector';
  const rolDirectivo = rector.cargo === 'coordinador' ? 'coordinador' : 'rector';
  const token = jwt.sign(
    { id: `rector-${rector.id}`, rol: rolDirectivo, nombre: nombreRector, schoolId: rector.schoolId, schoolName: colegio?.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  return res.json({
    token,
    user: {
      id: `rector-${rector.id}`,
      nombre: nombreRector,
      email: rector.correo,
      rol: rolDirectivo,
      schoolId: rector.schoolId,
      schoolName: colegio?.nombre || '',
      mustChangePassword: Boolean(rector.mustChangePassword)
    }
  });
}

/** Permite a usuario/directivo autenticado cambiar su clave. */
export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  const authId = req.user?.id;
  if (!authId) return res.status(401).json({ error: 'No autenticado' });

  const isRectorToken = String(authId).startsWith('rector-');
  if (isRectorToken) {
    const rectorId = Number(String(authId).replace('rector-', ''));
    if (!Number.isInteger(rectorId) || rectorId <= 0) {
      return res.status(400).json({ error: 'Token invalido' });
    }
    const rector = await Rector.findByPk(rectorId);
    if (!rector || !rector.passwordHash) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const ok = await bcrypt.compare(currentPassword, rector.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Clave actual invalida' });
    rector.passwordHash = await bcrypt.hash(newPassword, 10);
    rector.mustChangePassword = false;
    await rector.save();
    return res.json({ ok: true, mustChangePassword: false });
  }

  const userId = Number(authId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Token invalido' });
  }
  const usuario = await Usuario.findByPk(userId);
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });

  const ok = await bcrypt.compare(currentPassword, usuario.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Clave actual invalida' });
  usuario.passwordHash = await bcrypt.hash(newPassword, 10);
  usuario.mustChangePassword = false;
  await usuario.save();
  return res.json({ ok: true, mustChangePassword: false });
}
