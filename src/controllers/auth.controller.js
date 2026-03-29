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
        schoolName: colegio?.nombre || ''
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
      schoolName: colegio?.nombre || ''
    }
  });
}
