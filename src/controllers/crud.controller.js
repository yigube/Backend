// CRUD basico para cursos, estudiantes y periodos con scope por colegio.
import { Op } from 'sequelize';
import { Curso, Estudiante, Periodo, Usuario, CursoDocente, Colegio } from '../models/index.js';

const isDocente = (req) => req.user?.rol === 'docente';

/** Crea un curso asociado al colegio del usuario. Si es docente, queda asignado a el mismo. */
export async function crearCurso(req, res){
  const curso = await Curso.create({ ...req.body, schoolId: req.user.schoolId });

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
  const { q } = req.query;
  const where = { schoolId: req.user.schoolId };
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
  const schoolId = req.query.schoolId || req.user.schoolId;
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
  const obj = await Periodo.create({ ...req.body, schoolId: req.user.schoolId });
  res.status(201).json(obj);
}

/** Lista periodos del colegio actual. */
export async function listarPeriodos(req, res){
  res.json(await Periodo.findAll({ where: { schoolId: req.user.schoolId } }));
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
