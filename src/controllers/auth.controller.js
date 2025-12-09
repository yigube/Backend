// Controlador de autenticacion JWT.
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Usuario, Colegio } from "../models/index.js";

/** Login con email/password. Devuelve JWT con rol y schoolId. */
export async function login(req, res) {
  const { email, password } = req.body;
  const user = await Usuario.findOne({ where: { email } });
  if (!user) return res.status(401).json({ error: 'Credenciales invalidas' });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Credenciales invalidas' });
  const colegio = await Colegio.findOne({ where: { id: user.schoolId } });
  const token = jwt.sign(
    { id: user.id, rol: user.rol, nombre: user.nombre, schoolId: user.schoolId, schoolName: colegio?.nombre },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      schoolId: user.schoolId,
      schoolName: colegio?.nombre || ''
    }
  });
}
