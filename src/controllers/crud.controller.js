// CRUD basico para cursos, estudiantes y periodos con scope por colegio.
import { Op } from 'sequelize';
import bcrypt from 'bcrypt';
import { Curso, Estudiante, Periodo, Usuario, CursoDocente, Colegio } from '../models/index.js';

const isDocente = (req) => req.user?.rol === 'docente';

/** Crea un curso asociado al colegio del usuario. Si es docente, queda asignado a el mismo. */
export async function crearCurso(req, res){
  const schoolId = req.user.rol === 'admin' && req.body.schoolId ? req.body.schoolId : req.user.schoolId;
  const curso = await Curso.create({ ...req.body, schoolId });

  if (isDocente(req)) {
    await curso.addDocente(req.user.id, { through: { schoolId: req.user.schoolId } });
  } else if (Array.isArray(req.body.docenteIds) && req.body.docenteIds.length) {
    const docentes = await Usuario.findAll({
      where: { id: { [Op.in]: req.body.docenteIds }, schoolId: req.user.schoolId, rol: 'docente' }
    });
    await curso.addDocentes(docentes, { through: { schoolId: req.user.schoolId } });
  }

  res.status(201).json(curso);
}

/** Lista cursos del colegio actual. Docente ve solo los asignados. */
export async function listarCursos(req, res){
  const { q, schoolId: querySchool } = req.query;
  const schoolId = req.user.rol === 'admin' && querySchool ? querySchool : req.user.schoolId;
  const where = { schoolId };
  if (q) where.nombre = { [Op.like]: `%${q}%` };

  if (isDocente(req)) {
    const cursos = await Curso.findAll({
      where,
      include: [{
        model: Usuario,
        as: 'docentes',
        attributes: [],
        where: { id: req.user.id },
        through: { attributes: [] }
      }]
    });
    return res.json(cursos);
  }

  res.json(await Curso.findAll({ where }));
}

/** Actualiza nombre (o docenteIds) respetando alcance por escuela y asignacion. */
export async function actualizarCurso(req, res){
  const curso = await Curso.findOne({ where: { id: req.params.id, schoolId: req.user.schoolId } });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

  if (isDocente(req)) {
    const assigned = await curso.hasDocente(req.user.id);
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

  if (req.body.nombre) curso.nombre = req.body.nombre;
  await curso.save();

  if (!isDocente(req) && Array.isArray(req.body.docenteIds)) {
    const docentes = await Usuario.findAll({
      where: { id: { [Op.in]: req.body.docenteIds }, schoolId: req.user.schoolId, rol: 'docente' }
    });
    await curso.setDocentes(docentes, { through: { schoolId: req.user.schoolId } });
  }

  res.json(curso);
}

/** Elimina curso. Docente solo si esta asignado. */
export async function eliminarCurso(req, res){
  const curso = await Curso.findOne({ where: { id: req.params.id, schoolId: req.user.schoolId } });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });

  if (isDocente(req)) {
    const assigned = await curso.hasDocente(req.user.id);
    if (!assigned) return res.status(403).json({ error: 'No autorizado' });
  }

  await curso.destroy();
  res.json({ ok: true });
}

/** Crea un estudiante validando que el curso pertenezca al mismo colegio. */
export async function crearEstudiante(req, res){
  const curso = await Curso.findOne({ where: { id: req.body.cursoId, schoolId: req.user.schoolId } });
  if (!curso) return res.status(404).json({ error: 'Curso no encontrado' });
  const obj = await Estudiante.create({ ...req.body });
  res.status(201).json(obj);
}

/** Lista estudiantes del colegio mediante join con cursos. */
export async function listarEstudiantes(req, res){
  const ests = await Estudiante.findAll({
    include: { model: Curso, where: { schoolId: req.user.schoolId }, attributes: [] }
  });
  res.json(ests);
}

/** Lista docentes de un colegio (admin puede filtrar por schoolId). */
export async function listarDocentes(req, res) {
  const schoolId = (req.user.rol === 'admin' && req.query.schoolId) ? req.query.schoolId : req.user.schoolId;
  const docentes = await Usuario.findAll({
    where: { schoolId, rol: 'docente' },
    attributes: ['id', 'nombre', 'email', 'schoolId'],
    include: [{
      model: Curso,
      as: 'cursos',
      attributes: ['id', 'nombre', 'schoolId'],
      through: { attributes: [] }
    }]
  });
  res.json(docentes);
}

/** Crea un periodo academico en el colegio actual. */
export async function crearPeriodo(req, res){
  const schoolId = req.user.rol === 'admin' && req.body.schoolId ? req.body.schoolId : req.user.schoolId;
  const obj = await Periodo.create({ ...req.body, schoolId });
  res.status(201).json(obj);
}

/** Lista periodos del colegio actual. */
export async function listarPeriodos(req, res){
  const schoolId = (req.user.rol === 'admin' && req.query.schoolId) ? req.query.schoolId : req.user.schoolId;
  res.json(await Periodo.findAll({ where: { schoolId } }));
}

/** Actualiza datos de un periodo dentro del mismo colegio. */
export async function actualizarPeriodo(req, res){
  const periodo = await Periodo.findOne({ where: { id: req.params.id, schoolId: req.user.schoolId } });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });

  const { nombre, fechaInicio, fechaFin } = req.body;
  if (nombre) periodo.nombre = nombre;
  if (fechaInicio) periodo.fechaInicio = fechaInicio;
  if (fechaFin) periodo.fechaFin = fechaFin;

  await periodo.save();
  res.json(periodo);
}

/** Elimina un periodo dentro del mismo colegio. */
export async function eliminarPeriodo(req, res){
  const periodo = await Periodo.findOne({ where: { id: req.params.id, schoolId: req.user.schoolId } });
  if (!periodo) return res.status(404).json({ error: 'Periodo no encontrado' });
  await periodo.destroy();
  res.json({ ok: true });
}

/** Crea un registro de curso_docente de ejemplo dentro del colegio del usuario (admin). */
export async function seedCursoDocente(req, res){
  const schoolId = req.user.schoolId;
  const curso = await Curso.findOne({ where: { schoolId } });
  if (!curso) return res.status(404).json({ error: 'No hay cursos en este colegio' });

  const docente = await Usuario.findOne({ where: { schoolId, rol: 'docente' } });
  if (!docente) return res.status(404).json({ error: 'No hay docentes en este colegio' });

  const exists = await CursoDocente.findOne({ where: { cursoId: curso.id, usuarioId: docente.id, schoolId } });
  if (exists) return res.json({ created: false, message: 'Ya existe asignacion', data: exists });

  const record = await CursoDocente.create({ cursoId: curso.id, usuarioId: docente.id, schoolId });
  res.status(201).json({ created: true, data: record });
}

/** Lista todos los colegios (solo admin). */
export async function listarColegios(req, res) {
  const data = await Colegio.findAll({ attributes: ['id', 'nombre'] });
  res.json(data);
}

/** Crea un colegio (solo admin). */
export async function crearColegio(req, res) {
  const colegio = await Colegio.create({ nombre: req.body.nombre });
  res.status(201).json(colegio);
}

/** Actualiza nombre de un colegio (solo admin). */
export async function actualizarColegio(req, res) {
  const colegio = await Colegio.findByPk(req.params.id);
  if (!colegio) return res.status(404).json({ error: 'Colegio no encontrado' });
  if (req.body.nombre) colegio.nombre = req.body.nombre;
  await colegio.save();
  res.json(colegio);
}

/** Elimina un colegio (solo admin). */
export async function eliminarColegio(req, res) {
  const colegio = await Colegio.findByPk(req.params.id);
  if (!colegio) return res.status(404).json({ error: 'Colegio no encontrado' });
  await colegio.destroy();
  res.json({ ok: true });
}

/** Crea un docente y lo asigna a cursos del mismo colegio (solo admin). */
export async function crearDocente(req, res) {
  const { nombre, email, password, cursoIds = [], schoolId: bodySchool } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const schoolId = req.user.rol === 'admin' && bodySchool ? bodySchool : req.user.schoolId;

  const docente = await Usuario.create({ nombre, email, passwordHash, rol: 'docente', schoolId });

  if (Array.isArray(cursoIds) && cursoIds.length) {
    const cursos = await Curso.findAll({ where: { id: { [Op.in]: cursoIds }, schoolId } });
    await docente.setCursos(cursos, { through: { schoolId } });
  }

  const cursosDocente = await docente.getCursos({ attributes: ['id', 'nombre'] });
  res.status(201).json({ ...docente.toJSON(), cursos: cursosDocente });
}

/** Actualiza datos y asignaciones de un docente del mismo colegio (solo admin). */
export async function actualizarDocente(req, res) {
  const { nombre, email, password, cursoIds, schoolId: bodySchool } = req.body;
  const where = { id: req.params.id, rol: 'docente' };
  if (req.user.rol !== 'admin') where.schoolId = req.user.schoolId;
  const docente = await Usuario.findOne({ where });
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });

  const targetSchoolId = req.user.rol === 'admin' && bodySchool ? bodySchool : docente.schoolId;

  if (nombre) docente.nombre = nombre;
  if (email) docente.email = email;
  if (password) docente.passwordHash = await bcrypt.hash(password, 10);
  docente.schoolId = targetSchoolId;
  await docente.save();

  if (Array.isArray(cursoIds)) {
    const cursos = await Curso.findAll({ where: { id: { [Op.in]: cursoIds }, schoolId: targetSchoolId } });
    await docente.setCursos(cursos, { through: { schoolId: targetSchoolId } });
  }

  const cursosDocente = await docente.getCursos({ attributes: ['id', 'nombre'] });
  res.json({ ...docente.toJSON(), cursos: cursosDocente });
}

/** Elimina un docente del mismo colegio (solo admin). */
export async function eliminarDocente(req, res) {
  const where = { id: req.params.id, rol: 'docente' };
  if (req.user.rol !== 'admin') where.schoolId = req.user.schoolId;
  const docente = await Usuario.findOne({ where });
  if (!docente) return res.status(404).json({ error: 'Docente no encontrado' });
  await docente.destroy();
  res.json({ ok: true });
}
