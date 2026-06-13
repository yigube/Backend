// Pruebas de API con datos reales en SQLite en memoria.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio, Curso, CursoDocente, Estudiante, EstudianteMateria, Periodo, Rector, Materia, DocenteCursoMateria, Asistencia } from '../src/models/index.js';
import { resetLoginRateLimitBuckets } from '../src/middleware/rateLimit.js';
import { resetMetrics } from '../src/utils/observability.js';

let app;
let school;
let otherSchool;
let adminToken;
let globalAdminToken;
let teacherToken;
let secondTeacherToken;
let coordinadorToken;
let curso;
let otroCurso;
let periodo;
let studentA;
let studentB;
let defaultMateria;

async function getSchoolMateriasWithoutDefault(schoolId = school?.id) {
  const rows = await Materia.findAll({ where: { schoolId }, order: [['nombre', 'ASC']] });
  return rows.filter((item) => Number(item.id) !== Number(defaultMateria?.id));
}

async function countSchoolMateriasWithoutDefault(schoolId = school?.id) {
  const rows = await getSchoolMateriasWithoutDefault(schoolId);
  return rows.length;
}

async function login(email, password) {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

async function registrarAsistencia(token, payload) {
  return request(app)
    .post('/asistencias/qr')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
}

async function asignarCursoADocente(cursoId, schoolId = school.id, email = 'docente@demo.com') {
  const docente = await Usuario.findOne({ where: { email } });
  await CursoDocente.findOrCreate({
    where: { usuarioId: docente.id, cursoId, schoolId },
    defaults: { usuarioId: docente.id, cursoId, schoolId }
  });
  return docente;
}

beforeAll(async () => {
  app = await init();
});

beforeEach(async () => {
  resetLoginRateLimitBuckets();
  resetMetrics();
  await sequelize.sync({ force: true });
  school = await Colegio.create({ nombre: 'Colegio Test' });
  otherSchool = await Colegio.create({ nombre: 'Colegio Dos' });

  await Usuario.create({
    nombre: 'Admin',
    email: 'admin@demo.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: school.id
  });
  await Usuario.create({
    nombre: 'Admin Global',
    email: 'admin.global@demo.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: null
  });
  await Usuario.create({
    nombre: 'Coordinador',
    email: 'coordinador@demo.com',
    passwordHash: await bcrypt.hash('coord123', 10),
    rol: 'coordinador',
    schoolId: school.id
  });
  const teacherUser = await Usuario.create({
    nombre: 'Docente',
    email: 'docente@demo.com',
    passwordHash: await bcrypt.hash('doc123', 10),
    rol: 'docente',
    schoolId: school.id
  });
  await Usuario.create({
    nombre: 'Docente Dos',
    email: 'docente2@demo.com',
    passwordHash: await bcrypt.hash('doc123', 10),
    rol: 'docente',
    schoolId: school.id
  });
  await Usuario.create({
    nombre: 'Admin Otro',
    email: 'admin@otro.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: otherSchool.id
  });
  await Rector.create({
    schoolId: school.id,
    nombre: 'Rector',
    apellido: 'Demo',
    correo: 'rector@demo.com',
    passwordHash: await bcrypt.hash('rector123', 10)
  });

  curso = await Curso.create({ nombre: 'Matematicas', schoolId: school.id });
  otroCurso = await Curso.create({ nombre: 'Historia', schoolId: otherSchool.id });
  studentA = await Estudiante.create({ nombres: 'Ana', apellidos: 'Lopez', qr: 'QR-ANA-1', cursoId: curso.id });
  studentB = await Estudiante.create({ nombres: 'Luis', apellidos: 'Perez', qr: 'QR-LUIS-2', cursoId: curso.id });
  defaultMateria = await Materia.create({ nombre: 'General', schoolId: school.id });
  await CursoDocente.create({ usuarioId: teacherUser.id, cursoId: curso.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: teacherUser.id, cursoId: curso.id, materiaId: defaultMateria.id, schoolId: school.id });
  await EstudianteMateria.create({ estudianteId: studentA.id, cursoId: curso.id, materiaId: defaultMateria.id, schoolId: school.id });
  await EstudianteMateria.create({ estudianteId: studentB.id, cursoId: curso.id, materiaId: defaultMateria.id, schoolId: school.id });
  periodo = await Periodo.create({ nombre: 'P1', fechaInicio: '2025-01-01', fechaFin: '2025-03-11', schoolId: school.id });
  await Periodo.create({ nombre: 'P1-Other', fechaInicio: '2025-01-01', fechaFin: '2025-03-11', schoolId: otherSchool.id });

  adminToken = await login('admin@demo.com', 'admin123');
  globalAdminToken = await login('admin.global@demo.com', 'admin123');
  coordinadorToken = await login('coordinador@demo.com', 'coord123');
  teacherToken = await login('docente@demo.com', 'doc123');
  secondTeacherToken = await login('docente2@demo.com', 'doc123');
});

afterAll(async () => {
  await sequelize.close();
});

test('Login OK', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'docente@demo.com', password: 'doc123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
});

test('Observabilidad expone salud y metricas operativas', async () => {
  const health = await request(app).get('/health');
  expect(health.status).toBe(200);
  expect(health.body).toMatchObject({
    status: 'ok',
    service: 'asistencia-backend',
    database: { status: 'ok' }
  });
  expect(health.body.metrics).toHaveProperty('httpRequestsTotal');

  const fecha = '2025-02-01';
  const first = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha,
    materia: defaultMateria.nombre
  });
  expect(first.status).toBe(201);

  const duplicate = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha,
    materia: defaultMateria.nombre
  });
  expect(duplicate.status).toBe(409);

  const idempotent = await registrarAsistencia(teacherToken, {
    qr: studentB.qr,
    cursoId: curso.id,
    fecha,
    materia: defaultMateria.nombre,
    clientRequestId: 'offline-sync-1'
  });
  expect(idempotent.status).toBe(201);

  const replay = await registrarAsistencia(teacherToken, {
    qr: studentB.qr,
    cursoId: curso.id,
    fecha,
    materia: defaultMateria.nombre,
    clientRequestId: 'offline-sync-1'
  });
  expect(replay.status).toBe(200);
  expect(replay.body.idempotent).toBe(true);

  const metrics = await request(app).get('/metrics');
  expect(metrics.status).toBe(200);
  expect(metrics.body.counters).toMatchObject({
    asistenciaRegistradaTotal: 2,
    asistenciaDuplicadaTotal: 1,
    asistenciaIdempotentReplayTotal: 1
  });
  expect(metrics.body.counters.httpRequestsTotal).toBeGreaterThanOrEqual(6);
});

test('Login admin global sin colegio asignado', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'admin.global@demo.com', password: 'admin123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
  expect(res.body.user.rol).toBe('admin');
  expect(res.body.user.schoolId).toBeNull();
});

test('Login rector OK desde tabla rectores', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'rector@demo.com', password: 'rector123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
  expect(res.body.user.rol).toBe('rector');
  expect(res.body.user.schoolId).toBe(school.id);
});

test('Login rector funciona aunque exista usuario con mismo correo y password distinto', async () => {
  await Usuario.create({
    nombre: 'Usuario Homonimo',
    email: 'rector@demo.com',
    passwordHash: await bcrypt.hash('otra-clave', 10),
    rol: 'coordinador',
    schoolId: school.id
  });
  const res = await request(app).post('/auth/login').send({ email: 'rector@demo.com', password: 'rector123' });
  expect(res.status).toBe(200);
  expect(res.body.user.rol).toBe('rector');
  expect(res.body.user.schoolId).toBe(school.id);
});

test('Login directivo con cargo coordinador retorna rol coordinador', async () => {
  await Rector.create({
    schoolId: otherSchool.id,
    cargo: 'coordinador',
    nombre: 'Coordinador',
    apellido: 'Demo',
    correo: 'coordinador.rector@demo.com',
    passwordHash: await bcrypt.hash('coord1234', 10)
  });
  const res = await request(app).post('/auth/login').send({ email: 'coordinador.rector@demo.com', password: 'coord1234' });
  expect(res.status).toBe(200);
  expect(res.body.user.rol).toBe('coordinador');
  expect(res.body.user.schoolId).toBe(otherSchool.id);
});

test('Login falla con password incorrecto', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'docente@demo.com', password: 'mala' });
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: 'Credenciales invalidas' });
});

test('Login valida payload', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'no-es-email', password: '123' });
  expect(res.status).toBe(422);
  expect(res.body.errors).toBeTruthy();
});

test('Reset password valida email', async () => {
  const res = await request(app)
    .post('/auth/reset-password')
    .send({ email: 'correo-invalido' });

  expect(res.status).toBe(422);
  expect(Array.isArray(res.body.errors)).toBe(true);
});

test('Reset password informa cuando el correo no existe', async () => {
  const res = await request(app)
    .post('/auth/reset-password')
    .send({ email: 'noexiste@demo.com' });

  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'El correo no se encuentra registrado' });
});

test('Requiere token para rutas protegidas', async () => {
  const res = await request(app).get('/cursos');
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: 'Token requerido' });
});

test('Docente no puede crear curso (rol)', async () => {
  const res = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ nombre: 'Fisica' });
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'No autorizado' });
});

test('Admin crea curso y solo lista los de su colegio', async () => {
  const resCreate = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombre: 'Fisica' });
  expect(resCreate.status).toBe(201);
  expect(resCreate.body.schoolId).toBe(school.id);

  const resList = await request(app)
    .get('/cursos')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(resList.status).toBe(200);
  const names = resList.body.map(c => c.nombre);
  expect(names).toEqual(expect.arrayContaining(['Matematicas', 'Fisica']));
  expect(resList.body.every(c => c.schoolId === school.id)).toBe(true);
});

test('Docente solo ve los cursos que tiene asignados', async () => {
  const docente = await asignarCursoADocente(curso.id);
  const cursoDos = await Curso.create({ nombre: '6 02', schoolId: school.id });
  const cursoTres = await Curso.create({ nombre: '11', schoolId: school.id });

  await CursoDocente.create({ usuarioId: docente.id, cursoId: cursoDos.id, schoolId: school.id });

  const res = await request(app)
    .get('/cursos')
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(res.status).toBe(200);
  expect(res.body.map((item) => item.id).sort((a, b) => a - b)).toEqual([curso.id, cursoDos.id].sort((a, b) => a - b));
  expect(res.body.some((item) => item.id === cursoTres.id)).toBe(false);
  expect(res.body.some((item) => item.id === otroCurso.id)).toBe(false);
});

test('Admin crea, actualiza y elimina curso en otro colegio', async () => {
  const createOther = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${globalAdminToken}`)
    .send({ nombre: 'Biologia', schoolId: otherSchool.id });
  expect(createOther.status).toBe(201);
  expect(createOther.body.schoolId).toBe(otherSchool.id);

  const listOther = await request(app)
    .get(`/cursos?schoolId=${otherSchool.id}`)
    .set('Authorization', `Bearer ${globalAdminToken}`);
  expect(listOther.status).toBe(200);
  expect(listOther.body.some((c) => c.id === createOther.body.id)).toBe(true);

  const updateOther = await request(app)
    .put(`/cursos/${createOther.body.id}`)
    .set('Authorization', `Bearer ${globalAdminToken}`)
    .send({ nombre: 'Biologia Avanzada' });
  expect(updateOther.status).toBe(200);
  expect(updateOther.body.nombre).toBe('Biologia Avanzada');

  const deleteOther = await request(app)
    .delete(`/cursos/${createOther.body.id}`)
    .set('Authorization', `Bearer ${globalAdminToken}`);
  expect(deleteOther.status).toBe(200);
  expect(deleteOther.body).toEqual({ ok: true });
});

test('Admin global usa schoolId explicito y no depende de un colegio propio', async () => {
  const escuelas = await request(app)
    .get('/colegios')
    .set('Authorization', `Bearer ${globalAdminToken}`);
  expect(escuelas.status).toBe(200);
  expect(escuelas.body.length).toBe(2);

  const cursosGlobales = await request(app)
    .get('/cursos')
    .set('Authorization', `Bearer ${globalAdminToken}`);
  expect(cursosGlobales.status).toBe(200);
  expect(cursosGlobales.body.map((c) => c.id)).toEqual(expect.arrayContaining([curso.id, otroCurso.id]));

  const sinSchoolId = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${globalAdminToken}`)
    .send({ nombre: 'Quimica Global' });
  expect(sinSchoolId.status).toBe(400);
  expect(sinSchoolId.body).toEqual({ error: 'schoolId requerido para administradores' });

  const conSchoolId = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${globalAdminToken}`)
    .send({ nombre: 'Quimica Global', schoolId: otherSchool.id });
  expect(conSchoolId.status).toBe(201);
  expect(conSchoolId.body.schoolId).toBe(otherSchool.id);
});

test('Admin lista cursos disponibles para asignar docentes por colegio', async () => {
  const sameSchool = await request(app)
    .get('/docentes/cursos-disponibles')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(sameSchool.status).toBe(200);
  expect(sameSchool.body.length).toBe(1);
  expect(sameSchool.body[0].id).toBe(curso.id);
  expect(sameSchool.body[0].schoolId).toBe(school.id);

  const other = await request(app)
    .get(`/docentes/cursos-disponibles?schoolId=${otherSchool.id}`)
    .set('Authorization', `Bearer ${globalAdminToken}`);
  expect(other.status).toBe(200);
  expect(other.body.length).toBe(1);
  expect(other.body[0].id).toBe(otroCurso.id);
  expect(other.body[0].schoolId).toBe(otherSchool.id);
});

test('Coordinador solo gestiona su colegio y puede activar periodos propios', async () => {
  const listSchools = await request(app)
    .get('/colegios')
    .set('Authorization', `Bearer ${coordinadorToken}`);
  expect(listSchools.status).toBe(200);
  expect(listSchools.body.length).toBe(1);
  expect(listSchools.body[0].id).toBe(school.id);

  const cursosOwn = await request(app)
    .get('/docentes/cursos-disponibles')
    .set('Authorization', `Bearer ${coordinadorToken}`);
  expect(cursosOwn.status).toBe(200);
  expect(cursosOwn.body.map((c) => c.id)).toEqual([curso.id]);

  const cursosOther = await request(app)
    .get(`/docentes/cursos-disponibles?schoolId=${otherSchool.id}`)
    .set('Authorization', `Bearer ${coordinadorToken}`);
  expect(cursosOther.status).toBe(200);
  expect(cursosOther.body.map((c) => c.id)).toEqual([curso.id]);

  const cursosPorColegio = await request(app)
    .get(`/colegios/${otherSchool.id}/cursos`)
    .set('Authorization', `Bearer ${coordinadorToken}`);
  expect(cursosPorColegio.status).toBe(403);
  expect(cursosPorColegio.body).toEqual({ error: 'No autorizado' });

  const createDocente = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${coordinadorToken}`)
    .send({
      nombre: 'Docente Coord',
      email: 'docente.coord@demo.com',
      password: 'Docente1!',
      schoolId: otherSchool.id,
      cursoIds: [curso.id]
    });
  expect(createDocente.status).toBe(201);
  expect(createDocente.body.schoolId).toBe(school.id);
  expect(createDocente.body.cursos.map((c) => c.id)).toEqual([curso.id]);

  const createPeriodo = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${coordinadorToken}`)
    .send({ nombre: 'P2', fechaInicio: '2025-03-12', fechaFin: '2025-05-20', schoolId: otherSchool.id });
  expect(createPeriodo.status).toBe(201);
  expect(createPeriodo.body.schoolId).toBe(school.id);
});

test('No permite crear un periodo con fecha de inicio igual o posterior a la fecha de fin', async () => {
  const res = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Periodo Invalido',
      fechaInicio: '2025-03-10T00:00:00',
      fechaFin: '2025-03-10T00:00:00',
      schoolId: school.id
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'La fecha de inicio debe ser anterior a la fecha de fin' });
});

test('No permite crear un nuevo periodo con fechas anteriores al ultimo periodo registrado', async () => {
  const res = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Periodo 2',
      fechaInicio: '2024-10-01T00:00:00',
      fechaFin: '2024-12-09T23:59:00',
      schoolId: school.id
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'El nuevo periodo debe iniciar despues de que termine P1' });
});

test('No permite crear un periodo que se cruce con otro ya registrado', async () => {
  const res = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Periodo 2',
      fechaInicio: '2025-01-15T00:00:00',
      fechaFin: '2025-03-25T23:59:00',
      schoolId: school.id
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Las fechas se cruzan con P1. Un periodo posterior debe iniciar despues de que termine el anterior' });
});

test('No permite crear un periodo con duracion diferente a 10 semanas', async () => {
  const res = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Periodo corto',
      fechaInicio: '2025-03-12T00:00:00',
      fechaFin: '2025-04-12T23:59:00',
      schoolId: school.id
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Cada periodo debe durar exactamente 10 semanas' });
});

test('No permite crear un periodo si no inicia al dia siguiente del ultimo', async () => {
  const res = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Periodo con salto',
      fechaInicio: '2025-03-13T00:00:00',
      fechaFin: '2025-05-21T23:59:00',
      schoolId: school.id
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'El nuevo periodo debe iniciar despues de que termine P1' });
});

test('No permite crear mas de 4 periodos por año en el mismo colegio', async () => {
  await Periodo.bulkCreate([
    { nombre: 'P2', fechaInicio: '2025-03-12T00:00:00', fechaFin: '2025-05-20T23:59:00', schoolId: school.id },
    { nombre: 'P3', fechaInicio: '2025-05-21T00:00:00', fechaFin: '2025-07-29T23:59:00', schoolId: school.id },
    { nombre: 'P4', fechaInicio: '2025-07-30T00:00:00', fechaFin: '2025-10-07T23:59:00', schoolId: school.id }
  ]);

  const res = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Periodo 5',
      fechaInicio: '2025-10-08T00:00:00',
      fechaFin: '2025-12-16T23:59:00',
      schoolId: school.id
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Solo se permiten 4 periodos por año' });
});

test('No permite actualizar un periodo si la fecha de inicio queda posterior a la fecha de fin', async () => {
  const res = await request(app)
    .put(`/periodos/${periodo.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fechaInicio: '2025-04-01T00:00:00'
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'La fecha de inicio debe ser anterior a la fecha de fin' });

  await periodo.reload();
  expect(new Date(periodo.fechaInicio).toISOString().slice(0, 10)).toBe('2025-01-01');
});

test('No permite actualizar un periodo para cruzarse con otro periodo del mismo colegio', async () => {
  const segundoPeriodo = await Periodo.create({
    nombre: 'P2',
    fechaInicio: '2025-03-12T00:00:00',
    fechaFin: '2025-05-20T23:59:00',
    schoolId: school.id
  });

  const res = await request(app)
    .put(`/periodos/${segundoPeriodo.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      fechaInicio: '2025-01-20T00:00:00',
      fechaFin: '2025-03-30T23:59:00'
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Las fechas se cruzan con P1. Un periodo posterior debe iniciar despues de que termine el anterior' });

  await segundoPeriodo.reload();
  expect(new Date(segundoPeriodo.fechaInicio).toISOString().slice(0, 10)).toBe('2025-03-12');
});

test('Admin crea docente y asigna cursos del colegio seleccionado', async () => {
  const res = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Nuevo',
      email: 'docente.nuevo@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id]
    });

  expect(res.status).toBe(201);
  expect(res.body.schoolId).toBe(school.id);
  expect(Array.isArray(res.body.cursos)).toBe(true);
  expect(res.body.cursos.map((c) => c.id)).toEqual([curso.id]);
});

test('Admin no puede crear docente con nombre que no sea solo texto', async () => {
  const res = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente 123',
      email: 'docente.texto@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id]
    });

  expect(res.status).toBe(422);
  expect(Array.isArray(res.body.errors)).toBe(true);
  expect(res.body.errors.some((item) => item.msg === 'El nombre solo puede contener letras y espacios')).toBe(true);
});

test('Admin no puede crear docente con correo invalido', async () => {
  const res = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Valido',
      email: 'correo-invalido',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id]
    });

  expect(res.status).toBe(422);
  expect(Array.isArray(res.body.errors)).toBe(true);
  expect(res.body.errors.some((item) => item.msg === 'Email invalido')).toBe(true);
});

test('Admin crea docente con materias en multiples cursos y las lista completas', async () => {
  const cursoDos = await Curso.create({ nombre: '10 01', schoolId: school.id });
  const cursoTres = await Curso.create({ nombre: '11 01', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Materias',
      email: 'docente.materias@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id, cursoTres.id],
      materiasPorCurso: {
        [curso.id]: ['Etica'],
        [cursoDos.id]: ['Fisica'],
        [cursoTres.id]: ['Sociales']
      }
    });

  expect(createRes.status).toBe(201);
  expect(createRes.body.cursos).toHaveLength(3);

  const createdByCurso = new Map(createRes.body.cursos.map((item) => [item.id, item.materias || []]));
  expect(createdByCurso.get(curso.id)).toEqual(['Etica']);
  expect(createdByCurso.get(cursoDos.id)).toEqual(['Fisica']);
  expect(createdByCurso.get(cursoTres.id)).toEqual(['Sociales']);

  const listRes = await request(app)
    .get(`/docentes?schoolId=${school.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(listRes.status).toBe(200);
  const docente = listRes.body.find((item) => item.email === 'docente.materias@demo.com');
  expect(docente).toBeTruthy();

  const listedByCurso = new Map((docente.cursos || []).map((item) => [item.id, item.materias || []]));
  expect(listedByCurso.get(curso.id)).toEqual(['Etica']);
  expect(listedByCurso.get(cursoDos.id)).toEqual(['Fisica']);
  expect(listedByCurso.get(cursoTres.id)).toEqual(['Sociales']);

  const docenteDb = await Usuario.findOne({ where: { email: 'docente.materias@demo.com' } });
  expect(docenteDb).toBeTruthy();
  expect(docenteDb.rol).toBe('docente');
  expect(docenteDb.schoolId).toBe(school.id);

  const cursoDocenteRows = await CursoDocente.findAll({ where: { usuarioId: docenteDb.id, schoolId: school.id } });
  expect(cursoDocenteRows).toHaveLength(3);
  expect(cursoDocenteRows.map((row) => row.cursoId).sort((a, b) => a - b)).toEqual([curso.id, cursoDos.id, cursoTres.id].sort((a, b) => a - b));

  const materiasDb = await getSchoolMateriasWithoutDefault();
  expect(materiasDb.map((item) => item.nombre)).toEqual(['Etica', 'Fisica', 'Sociales']);

  const materiaByName = new Map(materiasDb.map((item) => [item.nombre, item.id]));
  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { usuarioId: docenteDb.id, schoolId: school.id },
    order: [['cursoId', 'ASC'], ['materiaId', 'ASC']]
  });
  expect(materiaLinks).toHaveLength(3);
  expect(materiaLinks.map((row) => ({
    cursoId: row.cursoId,
    materiaId: row.materiaId
  }))).toEqual([
    { cursoId: curso.id, materiaId: materiaByName.get('Etica') },
    { cursoId: cursoDos.id, materiaId: materiaByName.get('Fisica') },
    { cursoId: cursoTres.id, materiaId: materiaByName.get('Sociales') }
  ]);
});

test('Admin crea docente con 4 materias en un curso y se insertan completas en base de datos', async () => {
  const materiasEsperadas = ['Biologia', 'Fisica', 'Quimica', 'Sociales'];

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Cuatro Materias',
      email: 'docente.4materias@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: materiasEsperadas
      }
    });

  expect(createRes.status).toBe(201);
  expect(createRes.body.cursos).toHaveLength(1);
  expect(createRes.body.cursos[0].id).toBe(curso.id);
  expect((createRes.body.cursos[0].materias || []).sort()).toEqual([...materiasEsperadas].sort());

  const docenteDb = await Usuario.findOne({ where: { email: 'docente.4materias@demo.com' } });
  expect(docenteDb).toBeTruthy();
  expect(docenteDb.rol).toBe('docente');
  expect(docenteDb.schoolId).toBe(school.id);

  const cursoDocenteRows = await CursoDocente.findAll({ where: { usuarioId: docenteDb.id, schoolId: school.id } });
  expect(cursoDocenteRows).toHaveLength(1);
  expect(cursoDocenteRows[0].cursoId).toBe(curso.id);

  const materiasDb = await getSchoolMateriasWithoutDefault();
  expect(materiasDb.map((item) => item.nombre)).toEqual([...materiasEsperadas].sort());

  const materiaByName = new Map(materiasDb.map((item) => [item.nombre, item.id]));
  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { usuarioId: docenteDb.id, schoolId: school.id, cursoId: curso.id },
    order: [['materiaId', 'ASC']]
  });
  expect(materiaLinks).toHaveLength(4);
  expect(materiaLinks.map((row) => row.materiaId).sort((a, b) => a - b)).toEqual(
    materiasEsperadas.map((nombre) => materiaByName.get(nombre)).sort((a, b) => a - b)
  );

  const listRes = await request(app)
    .get(`/docentes?schoolId=${school.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(listRes.status).toBe(200);
  const docente = listRes.body.find((item) => item.email === 'docente.4materias@demo.com');
  expect(docente).toBeTruthy();
  expect(docente.cursos).toHaveLength(1);
  expect((docente.cursos[0].materias || []).sort()).toEqual([...materiasEsperadas].sort());
});

test('Admin puede asignar la misma materia al mismo docente en cursos distintos', async () => {
  const cursoDos = await Curso.create({ nombre: '10 01', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Misma Materia',
      email: 'docente.misma.materia@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id],
      materiasPorCurso: {
        [curso.id]: ['Matematicas'],
        [cursoDos.id]: ['Matematicas']
      }
    });

  expect(createRes.status).toBe(201);
  expect(createRes.body.cursos).toHaveLength(2);

  const byCurso = new Map((createRes.body.cursos || []).map((item) => [item.id, item.materias || []]));
  expect(byCurso.get(curso.id)).toEqual(['Matematicas']);
  expect(byCurso.get(cursoDos.id)).toEqual(['Matematicas']);

  const docenteDb = await Usuario.findOne({ where: { email: 'docente.misma.materia@demo.com' } });
  expect(docenteDb).toBeTruthy();

  const materiasDb = await getSchoolMateriasWithoutDefault();
  expect(materiasDb.map((item) => item.nombre)).toEqual(['Matematicas']);

  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { usuarioId: docenteDb.id, schoolId: school.id },
    include: [{ model: Materia, as: 'materia', attributes: ['nombre'] }],
    order: [['cursoId', 'ASC']]
  });
  expect(materiaLinks).toHaveLength(2);
  expect(materiaLinks.map((row) => ({
    cursoId: row.cursoId,
    nombre: row.materia?.nombre
  }))).toEqual([
    { cursoId: curso.id, nombre: 'Matematicas' },
    { cursoId: cursoDos.id, nombre: 'Matematicas' }
  ]);
});

test('Admin actualiza docente y persiste todas las materias en multiples cursos', async () => {
  const cursoDos = await Curso.create({ nombre: '10', schoolId: school.id });
  const cursoTres = await Curso.create({ nombre: '11', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Actualizar',
      email: 'docente.actualizar@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id]
    });

  expect(createRes.status).toBe(201);
  const docenteId = createRes.body.id;

  const updateRes = await request(app)
    .put(`/docentes/${docenteId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Actualizado',
      email: 'docente.actualizado@demo.com',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id, cursoTres.id],
      materiasPorCurso: {
        [curso.id]: ['A'],
        [cursoDos.id]: ['B'],
        [cursoTres.id]: ['C']
      }
    });

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.nombre).toBe('Docente Actualizado');
  expect(updateRes.body.email).toBe('docente.actualizado@demo.com');
  expect(updateRes.body.cursos).toHaveLength(3);

  const updatedByCurso = new Map((updateRes.body.cursos || []).map((item) => [item.id, item.materias || []]));
  expect(updatedByCurso.get(curso.id)).toEqual(['A']);
  expect(updatedByCurso.get(cursoDos.id)).toEqual(['B']);
  expect(updatedByCurso.get(cursoTres.id)).toEqual(['C']);

  const docenteDb = await Usuario.findByPk(docenteId);
  expect(docenteDb).toBeTruthy();
  expect(docenteDb.nombre).toBe('Docente Actualizado');
  expect(docenteDb.email).toBe('docente.actualizado@demo.com');

  const cursoDocenteRows = await CursoDocente.findAll({
    where: { usuarioId: docenteId, schoolId: school.id },
    order: [['cursoId', 'ASC']]
  });
  expect(cursoDocenteRows).toHaveLength(3);
  expect(cursoDocenteRows.map((row) => row.cursoId)).toEqual([curso.id, cursoDos.id, cursoTres.id]);

  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { usuarioId: docenteId, schoolId: school.id },
    include: [{ model: Materia, as: 'materia', attributes: ['nombre'] }],
    order: [['cursoId', 'ASC']]
  });
  expect(materiaLinks).toHaveLength(3);
  expect(materiaLinks.map((row) => ({
    cursoId: row.cursoId,
    nombre: row.materia?.nombre
  }))).toEqual([
    { cursoId: curso.id, nombre: 'A' },
    { cursoId: cursoDos.id, nombre: 'B' },
    { cursoId: cursoTres.id, nombre: 'C' }
  ]);

  const listRes = await request(app)
    .get(`/docentes?schoolId=${school.id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(listRes.status).toBe(200);

  const docente = listRes.body.find((item) => item.id === docenteId);
  expect(docente).toBeTruthy();
  const listedByCurso = new Map((docente.cursos || []).map((item) => [item.id, item.materias || []]));
  expect(listedByCurso.get(curso.id)).toEqual(['A']);
  expect(listedByCurso.get(cursoDos.id)).toEqual(['B']);
  expect(listedByCurso.get(cursoTres.id)).toEqual(['C']);
});

test('Admin actualiza materias de un docente y elimina materias huerfanas del catalogo', async () => {
  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Reemplazo Materia',
      email: 'docente.reemplazo@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['A']
      }
    });

  expect(createRes.status).toBe(201);
  const docenteId = createRes.body.id;

  const updateRes = await request(app)
    .put(`/docentes/${docenteId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Reemplazo Materia',
      email: 'docente.reemplazo@demo.com',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['Ac']
      }
    });

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.cursos).toHaveLength(1);
  expect(updateRes.body.cursos[0].materias).toEqual(['Ac']);

  const materiasDb = await getSchoolMateriasWithoutDefault();
  expect(materiasDb.map((item) => item.nombre)).toEqual(['Ac']);

  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { usuarioId: docenteId, schoolId: school.id },
    include: [{ model: Materia, as: 'materia', attributes: ['nombre'] }]
  });
  expect(materiaLinks).toHaveLength(1);
  expect(materiaLinks[0].materia?.nombre).toBe('Ac');
});

test('Admin actualiza materias y conserva las materias compartidas por otros docentes', async () => {
  const createUno = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Compartido Uno',
      email: 'docente.compartido1@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['A']
      }
    });
  const createDos = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Compartido Dos',
      email: 'docente.compartido2@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['A']
      }
    });

  expect(createUno.status).toBe(201);
  expect(createDos.status).toBe(201);

  const updateRes = await request(app)
    .put(`/docentes/${createUno.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Compartido Uno',
      email: 'docente.compartido1@demo.com',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['Ac']
      }
    });

  expect(updateRes.status).toBe(200);

  const materiasDb = await getSchoolMateriasWithoutDefault();
  expect(materiasDb.map((item) => item.nombre)).toEqual(['A', 'Ac']);

  const linksDocenteUno = await DocenteCursoMateria.findAll({
    where: { usuarioId: createUno.body.id, schoolId: school.id },
    include: [{ model: Materia, as: 'materia', attributes: ['nombre'] }]
  });
  const linksDocenteDos = await DocenteCursoMateria.findAll({
    where: { usuarioId: createDos.body.id, schoolId: school.id },
    include: [{ model: Materia, as: 'materia', attributes: ['nombre'] }]
  });
  expect(linksDocenteUno).toHaveLength(1);
  expect(linksDocenteDos).toHaveLength(1);
  expect(linksDocenteUno[0].materia?.nombre).toBe('Ac');
  expect(linksDocenteDos[0].materia?.nombre).toBe('A');
});

test('Admin actualiza docente sin enviar una materia y conserva la materia existente de ese curso', async () => {
  const cursoDos = await Curso.create({ nombre: '10 01', schoolId: school.id });
  const cursoTres = await Curso.create({ nombre: '11 01', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Conserva Materia',
      email: 'docente.conserva@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id, cursoTres.id],
      materiasPorCurso: {
        [curso.id]: ['Etica'],
        [cursoDos.id]: ['Fisica'],
        [cursoTres.id]: ['Quimica']
      }
    });

  expect(createRes.status).toBe(201);
  const docenteId = createRes.body.id;

  const updateRes = await request(app)
    .put(`/docentes/${docenteId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Conserva Materia',
      email: 'docente.conserva@demo.com',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id, cursoTres.id],
      materiasPorCurso: {
        [curso.id]: ['Etica'],
        [cursoDos.id]: ['Fisica']
      }
    });

  expect(updateRes.status).toBe(200);
  const updatedByCurso = new Map((updateRes.body.cursos || []).map((item) => [item.id, item.materias || []]));
  expect(updatedByCurso.get(curso.id)).toEqual(['Etica']);
  expect(updatedByCurso.get(cursoDos.id)).toEqual(['Fisica']);
  expect(updatedByCurso.get(cursoTres.id)).toEqual(['Quimica']);
});

test('Admin actualiza cursos de un docente sin materiasPorCurso y preserva sus materias actuales', async () => {
  const cursoDos = await Curso.create({ nombre: '10 01', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Sin Payload Materias',
      email: 'docente.sinpayload@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id],
      materiasPorCurso: {
        [curso.id]: ['Etica'],
        [cursoDos.id]: ['Fisica']
      }
    });

  expect(createRes.status).toBe(201);
  const docenteId = createRes.body.id;

  const updateRes = await request(app)
    .put(`/docentes/${docenteId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Sin Payload Materias',
      email: 'docente.sinpayload@demo.com',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id]
    });

  expect(updateRes.status).toBe(200);
  const updatedByCurso = new Map((updateRes.body.cursos || []).map((item) => [item.id, item.materias || []]));
  expect(updatedByCurso.get(curso.id)).toEqual(['Etica']);
  expect(updatedByCurso.get(cursoDos.id)).toEqual(['Fisica']);
});

test('Admin puede vaciar una materia enviando arreglo vacio para ese curso', async () => {
  const cursoDos = await Curso.create({ nombre: '10 01', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Vacia Materia',
      email: 'docente.vacia@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id],
      materiasPorCurso: {
        [curso.id]: ['Etica'],
        [cursoDos.id]: ['Fisica']
      }
    });

  expect(createRes.status).toBe(201);
  const docenteId = createRes.body.id;

  const updateRes = await request(app)
    .put(`/docentes/${docenteId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Vacia Materia',
      email: 'docente.vacia@demo.com',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id],
      materiasPorCurso: {
        [curso.id]: ['Etica'],
        [cursoDos.id]: []
      }
    });

  expect(updateRes.status).toBe(200);
  const updatedByCurso = new Map((updateRes.body.cursos || []).map((item) => [item.id, item.materias || []]));
  expect(updatedByCurso.get(curso.id)).toEqual(['Etica']);
  expect(updatedByCurso.get(cursoDos.id)).toEqual([]);
});

test('Admin actualiza una materia sin tilde y conserva el vinculo con una materia existente con tilde', async () => {
  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Tildes',
      email: 'docente.tildes@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['Filosofía']
      }
    });

  expect(createRes.status).toBe(201);
  const docenteId = createRes.body.id;

  const updateRes = await request(app)
    .put(`/docentes/${docenteId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Tildes',
      email: 'docente.tildes@demo.com',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['Filosofia']
      }
    });

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.cursos).toHaveLength(1);
  expect(updateRes.body.cursos[0].materias).toEqual(['Filosofía']);

  const materiasDb = await getSchoolMateriasWithoutDefault();
  expect(materiasDb.map((item) => item.nombre)).toEqual(['Filosofía']);

  const materiaLinks = await DocenteCursoMateria.findAll({
    where: { usuarioId: docenteId, schoolId: school.id },
    include: [{ model: Materia, as: 'materia', attributes: ['nombre'] }]
  });
  expect(materiaLinks).toHaveLength(1);
  expect(materiaLinks[0].materia?.nombre).toBe('Filosofía');
});

test('Admin crea un docente usando una materia sin tilde y reutiliza la materia existente con tilde', async () => {
  const existingRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Base Tildes',
      email: 'docente.base.tildes@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['Filosofía']
      }
    });

  expect(existingRes.status).toBe(201);

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Reutiliza Tildes',
      email: 'docente.reutiliza.tildes@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id],
      materiasPorCurso: {
        [curso.id]: ['Filosofia']
      }
    });

  expect(createRes.status).toBe(201);
  expect(createRes.body.cursos).toHaveLength(1);
  expect(createRes.body.cursos[0].materias).toEqual(['Filosofía']);

  const materiasDb = await getSchoolMateriasWithoutDefault();
  expect(materiasDb.map((item) => item.nombre)).toEqual(['Filosofía']);
});

test('Admin elimina docente y borra en cascada sus cursos y materias asignadas', async () => {
  const cursoDos = await Curso.create({ nombre: '8 01', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Eliminar',
      email: 'docente.eliminar@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [curso.id, cursoDos.id],
      materiasPorCurso: {
        [curso.id]: ['Matematicas'],
        [cursoDos.id]: ['Fisica', 'Quimica']
      }
    });

  expect(createRes.status).toBe(201);
  const docenteId = createRes.body.id;

  expect(await Usuario.findByPk(docenteId)).toBeTruthy();
  expect(await CursoDocente.count({ where: { usuarioId: docenteId } })).toBe(2);
  expect(await DocenteCursoMateria.count({ where: { usuarioId: docenteId } })).toBe(3);

  const deleteRes = await request(app)
    .delete(`/docentes/${docenteId}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body).toEqual({ ok: true });

  expect(await Usuario.findByPk(docenteId)).toBeNull();
  expect(await CursoDocente.count({ where: { usuarioId: docenteId } })).toBe(0);
  expect(await DocenteCursoMateria.count({ where: { usuarioId: docenteId } })).toBe(0);
  expect(await countSchoolMateriasWithoutDefault()).toBe(0);

  const listRes = await request(app)
    .get(`/docentes?schoolId=${school.id}`)
    .set('Authorization', `Bearer ${adminToken}`);

  expect(listRes.status).toBe(200);
  expect(listRes.body.find((item) => item.id === docenteId)).toBeUndefined();
});

test('Admin no puede crear docente con cursos de otro colegio', async () => {
  const res = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Invalido',
      email: 'docente.invalido@demo.com',
      password: 'Docente1!',
      schoolId: school.id,
      cursoIds: [otroCurso.id]
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Uno o mas cursos no pertenecen al colegio seleccionado' });

  const notCreated = await Usuario.findOne({ where: { email: 'docente.invalido@demo.com' } });
  expect(notCreated).toBeNull();
});

test('Admin valida unicidad de correo, cedula y telefono del rector', async () => {
  const base = {
    rectorNombre: 'Rector',
    rectorApellido: 'Uno',
    rectorPassword: 'Rector1!'
  };

  const createFirst = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Unico 1',
      codigoDane: 'DANE-UNICO-1',
      rectorCorreo: 'rector.unico@demo.com',
      rectorCedula: '123456789',
      rectorTelefono: '3001112233',
      ...base
    });
  expect(createFirst.status).toBe(201);

  const dupCorreo = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Unico 2',
      codigoDane: 'DANE-UNICO-2',
      rectorCorreo: 'rector.unico@demo.com',
      rectorCedula: '987654321',
      rectorTelefono: '3004445566',
      ...base
    });
  expect(dupCorreo.status).toBe(409);
  expect(dupCorreo.body.error).toContain('correo');

  const dupCedula = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Unico 3',
      codigoDane: 'DANE-UNICO-3',
      rectorCorreo: 'rector.unico.3@demo.com',
      rectorCedula: '123456789',
      rectorTelefono: '3007778899',
      ...base
    });
  expect(dupCedula.status).toBe(409);
  expect(dupCedula.body.error).toContain('cedula');

  const dupTelefono = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Unico 4',
      codigoDane: 'DANE-UNICO-4',
      rectorCorreo: 'rector.unico.4@demo.com',
      rectorCedula: '456123789',
      rectorTelefono: '3001112233',
      ...base
    });
  expect(dupTelefono.status).toBe(409);
  expect(dupTelefono.body.error).toContain('telefono');
});

test('Admin crea colegio con cuenta usuario sincronizada para el directivo', async () => {
  const res = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Directivo Usuario',
      codigoDane: 'DANE-DIR-USR-1',
      rectorCargo: 'rector',
      rectorNombre: 'Rector',
      rectorApellido: 'Sincronizado',
      rectorCorreo: 'rector.sincronizado@demo.com',
      rectorCedula: '555111222',
      rectorTelefono: '3005551111',
      rectorPassword: 'Rector1!'
    });

  expect(res.status).toBe(201);
  const usuario = await Usuario.findOne({ where: { email: 'rector.sincronizado@demo.com' } });
  expect(usuario).toBeTruthy();
  expect(usuario.rol).toBe('rector');
  expect(usuario.schoolId).toBe(res.body.id);
  expect(usuario.mustChangePassword).toBe(true);
  expect(await bcrypt.compare('Rector1!', usuario.passwordHash)).toBe(true);

  resetLoginRateLimitBuckets();
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ email: 'rector.sincronizado@demo.com', password: 'Rector1!' });
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.user.id).toBe(usuario.id);
  expect(loginRes.body.user.rol).toBe('rector');
});

test('Admin actualiza directivo y sincroniza la cuenta usuario asociada', async () => {
  const createRes = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Directivo Actualiza',
      codigoDane: 'DANE-DIR-USR-2',
      rectorCargo: 'rector',
      rectorNombre: 'Rector',
      rectorApellido: 'Antes',
      rectorCorreo: 'rector.antes@demo.com',
      rectorCedula: '555111333',
      rectorTelefono: '3005552222',
      rectorPassword: 'Rector1!'
    });
  expect(createRes.status).toBe(201);

  const updateRes = await request(app)
    .put(`/colegios/${createRes.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      rectorCargo: 'coordinador',
      rectorNombre: 'Coordinador',
      rectorApellido: 'Despues',
      rectorCorreo: 'coordinador.despues@demo.com',
      rectorCedula: '555111333',
      rectorTelefono: '3005552222'
    });

  expect(updateRes.status).toBe(200);
  expect(await Usuario.findOne({ where: { email: 'rector.antes@demo.com' } })).toBeNull();
  const usuario = await Usuario.findOne({ where: { email: 'coordinador.despues@demo.com' } });
  expect(usuario).toBeTruthy();
  expect(usuario.nombre).toBe('Coordinador Despues');
  expect(usuario.rol).toBe('coordinador');
  expect(usuario.schoolId).toBe(createRes.body.id);

  resetLoginRateLimitBuckets();
  const loginRes = await request(app)
    .post('/auth/login')
    .send({ email: 'coordinador.despues@demo.com', password: 'Rector1!' });
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.user.rol).toBe('coordinador');
});

test('Admin elimina perfil directivo y remueve la cuenta usuario sincronizada', async () => {
  const createRes = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Directivo Elimina',
      codigoDane: 'DANE-DIR-USR-3',
      rectorCargo: 'rector',
      rectorNombre: 'Rector',
      rectorApellido: 'Eliminar',
      rectorCorreo: 'rector.eliminar@demo.com',
      rectorCedula: '555111444',
      rectorTelefono: '3005553333',
      rectorPassword: 'Rector1!'
    });
  expect(createRes.status).toBe(201);

  const updateRes = await request(app)
    .put(`/colegios/${createRes.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      rectorCargo: '',
      rectorNombre: '',
      rectorApellido: '',
      rectorCorreo: '',
      rectorCedula: '',
      rectorTelefono: ''
    });

  expect(updateRes.status).toBe(200);
  expect(updateRes.body.rector).toBeNull();
  expect(await Usuario.findOne({ where: { email: 'rector.eliminar@demo.com' } })).toBeNull();
});

test('Admin recibe mensaje claro cuando el correo del rector es invalido', async () => {
  const res = await request(app)
    .post('/colegios')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Colegio Error Rector',
      codigoDane: 'DANE-ERR-1',
      rectorNombre: 'Rector',
      rectorApellido: 'Demo',
      rectorCorreo: 'correo-invalido',
      rectorPassword: 'Rector1!'
    });

  expect(res.status).toBe(422);
  expect(res.body.errors).toBeTruthy();
  expect(res.body.errors[0].msg).toBe('Correo del rector invalido');
});

test('Docente no crea estudiante en curso de otro colegio', async () => {
  await asignarCursoADocente(curso.id);
  const res = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ nombres: 'Eva', apellidos: 'Cruz', qr: 'QR-EVA', cursoId: otroCurso.id });
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Curso no encontrado' });
});

test('Docente puede agregar estudiantes de su colegio', async () => {
  await asignarCursoADocente(curso.id);
  const res = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Nuevo',
      apellidos: 'Estudiante',
      qr: `QR-NUEVO-${Date.now()}`,
      cursoId: curso.id
    });
  expect(res.status).toBe(201);
  expect(res.body.cursoId).toBe(curso.id);
});

test('Docente no puede crear estudiante en curso de otro profesor aunque sea del mismo colegio', async () => {
  await asignarCursoADocente(curso.id);
  const cursoDos = await Curso.create({ nombre: '7 01', schoolId: school.id });

  const res = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Nora',
      apellidos: 'Salas',
      qr: `QR-NORA-${Date.now()}`,
      cursoId: cursoDos.id
    });

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'No autorizado' });
});

test('Docente crea estudiante con materias del curso y se listan en la respuesta', async () => {
  const docente = await asignarCursoADocente(curso.id);
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaFilosofia = await Materia.create({ nombre: 'Filosofia', schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docente.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docente.id, cursoId: curso.id, materiaId: materiaFilosofia.id, schoolId: school.id });

  const res = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Mia',
      apellidos: 'Cardona',
      qr: `QR-MIA-${Date.now()}`,
      cursoId: curso.id,
      materias: ['Etica', 'Filosofia']
    });

  expect(res.status).toBe(201);
  expect((res.body.materias || []).sort()).toEqual(['Etica', 'Filosofia']);

  const rows = await EstudianteMateria.findAll({
    where: { estudianteId: res.body.id },
    order: [['materiaId', 'ASC']]
  });
  expect(rows).toHaveLength(2);

  const listRes = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(listRes.status).toBe(200);
  const estudianteCreado = listRes.body.find((item) => item.id === res.body.id);
  expect((estudianteCreado?.materias || []).sort()).toEqual(['Etica', 'Filosofia']);
});

test('Docente no puede asignar al estudiante una materia que no corresponde a su curso', async () => {
  const docente = await asignarCursoADocente(curso.id);
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const cursoDos = await Curso.create({ nombre: '6 02', schoolId: school.id });
  await asignarCursoADocente(cursoDos.id);
  await DocenteCursoMateria.create({ usuarioId: docente.id, cursoId: cursoDos.id, materiaId: materiaEtica.id, schoolId: school.id });

  const res = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Leo',
      apellidos: 'Castro',
      qr: `QR-LEO-${Date.now()}`,
      cursoId: curso.id,
      materias: ['Etica']
    });

  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'Las materias seleccionadas no corresponden al curso' });
});

test('Listar estudiantes por curso filtra correctamente y no mezcla otros cursos', async () => {
  const cursoDos = await Curso.create({ nombre: '6 02', schoolId: school.id });
  const studentC = await Estudiante.create({ nombres: 'Mario', apellidos: 'Gomez', qr: 'QR-MARIO-3', cursoId: cursoDos.id });
  const docente = await asignarCursoADocente(curso.id);
  await asignarCursoADocente(cursoDos.id);
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docente.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docente.id, cursoId: cursoDos.id, materiaId: materiaEtica.id, schoolId: school.id });
  await EstudianteMateria.create({ estudianteId: studentA.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await EstudianteMateria.create({ estudianteId: studentB.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await EstudianteMateria.create({ estudianteId: studentC.id, cursoId: cursoDos.id, materiaId: materiaEtica.id, schoolId: school.id });

  const resCursoUno = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(resCursoUno.status).toBe(200);
  expect(resCursoUno.body.map((item) => item.id).sort((a, b) => a - b)).toEqual([studentA.id, studentB.id]);

  const resCursoDos = await request(app)
    .get(`/estudiantes?cursoId=${cursoDos.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(resCursoDos.status).toBe(200);
  expect(resCursoDos.body.map((item) => item.id)).toEqual([studentC.id]);
});

test('Docente no puede listar estudiantes de un curso no asignado aunque sea del mismo colegio', async () => {
  await asignarCursoADocente(curso.id);
  const cursoDos = await Curso.create({ nombre: '8 01', schoolId: school.id });
  await Estudiante.create({ nombres: 'Sara', apellidos: 'Mendez', qr: `QR-SARA-${Date.now()}`, cursoId: cursoDos.id });

  const res = await request(app)
    .get(`/estudiantes?cursoId=${cursoDos.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'No autorizado' });
});

test('Docentes del mismo curso solo ven estudiantes de sus materias', async () => {
  const docenteUno = await asignarCursoADocente(curso.id, school.id, 'docente@demo.com');
  const docenteDos = await asignarCursoADocente(curso.id, school.id, 'docente2@demo.com');
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaFilosofia = await Materia.create({ nombre: 'Filosofia', schoolId: school.id });

  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteDos.id, cursoId: curso.id, materiaId: materiaFilosofia.id, schoolId: school.id });

  const createRes = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Laura',
      apellidos: 'Quintero',
      qr: `QR-LAURA-${Date.now()}`,
      cursoId: curso.id,
      materias: ['Etica']
    });

  expect(createRes.status).toBe(201);

  const listOwner = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(listOwner.status).toBe(200);
  expect(listOwner.body.some((item) => item.id === createRes.body.id)).toBe(true);
  const estudianteVisible = listOwner.body.find((item) => item.id === createRes.body.id);
  expect(estudianteVisible?.materias).toEqual(['Etica']);

  const listOtherTeacher = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${secondTeacherToken}`);

  expect(listOtherTeacher.status).toBe(200);
  expect(listOtherTeacher.body.some((item) => item.id === createRes.body.id)).toBe(false);
});

test('Docente puede listar estudiantes si comparte una parte de las materias del curso', async () => {
  const docenteUno = await asignarCursoADocente(curso.id, school.id, 'docente@demo.com');
  const docenteDos = await asignarCursoADocente(curso.id, school.id, 'docente2@demo.com');
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaSociales = await Materia.create({ nombre: 'Sociales', schoolId: school.id });

  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaSociales.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteDos.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });

  const createRes = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Camila',
      apellidos: 'Ortega',
      qr: `QR-CAMILA-${Date.now()}`,
      cursoId: curso.id,
      materias: ['Etica', 'Sociales']
    });

  expect(createRes.status).toBe(201);

  const listOwner = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(listOwner.status).toBe(200);
  expect(listOwner.body.some((item) => item.id === createRes.body.id)).toBe(true);

  const listOtherTeacher = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${secondTeacherToken}`);

  expect(listOtherTeacher.status).toBe(200);
  expect(listOtherTeacher.body.some((item) => item.id === createRes.body.id)).toBe(true);
  const estudianteVisible = listOtherTeacher.body.find((item) => item.id === createRes.body.id);
  expect(estudianteVisible?.materias).toEqual(['Etica']);
});

test('Docente ve en el listado de estudiantes las fallas acumuladas por materia visible', async () => {
  const docenteUno = await asignarCursoADocente(curso.id, school.id, 'docente@demo.com');
  const docenteDos = await asignarCursoADocente(curso.id, school.id, 'docente2@demo.com');
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaSociales = await Materia.create({ nombre: 'Sociales', schoolId: school.id });

  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaSociales.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteDos.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });

  const estudiante = await Estudiante.create({
    nombres: 'Luisa',
    apellidos: 'Parra',
    qr: `QR-LUISA-${Date.now()}`,
    cursoId: curso.id
  });

  await EstudianteMateria.bulkCreate([
    { estudianteId: estudiante.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id },
    { estudianteId: estudiante.id, cursoId: curso.id, materiaId: materiaSociales.id, schoolId: school.id }
  ]);

  await Asistencia.bulkCreate([
    {
      fecha: '2025-01-10',
      estado: 'ausente',
      ausente: true,
      presente: false,
      estudianteId: estudiante.id,
      cursoId: curso.id,
      periodoId: periodo.id,
      schoolId: school.id,
      materiaId: materiaEtica.id
    },
    {
      fecha: '2025-01-11',
      estado: 'afuera',
      afuera: true,
      presente: false,
      estudianteId: estudiante.id,
      cursoId: curso.id,
      periodoId: periodo.id,
      schoolId: school.id,
      materiaId: materiaSociales.id
    },
    {
      fecha: '2025-01-12',
      estado: 'presente',
      presente: true,
      estudianteId: estudiante.id,
      cursoId: curso.id,
      periodoId: periodo.id,
      schoolId: school.id,
      materiaId: materiaEtica.id
    }
  ]);

  const ownerList = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(ownerList.status).toBe(200);
  const ownerStudent = ownerList.body.find((item) => item.id === estudiante.id);
  expect(ownerStudent?.faltas).toEqual({
    total: 2,
    ausente: 1,
    afuera: 1,
    materias: [
      { materia: 'Etica', faltas: 1, ausente: 1, afuera: 0 },
      { materia: 'Sociales', faltas: 1, ausente: 0, afuera: 1 }
    ]
  });

  const secondTeacherList = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${secondTeacherToken}`);

  expect(secondTeacherList.status).toBe(200);
  const secondTeacherStudent = secondTeacherList.body.find((item) => item.id === estudiante.id);
  expect(secondTeacherStudent?.faltas).toEqual({
    total: 2,
    ausente: 1,
    afuera: 1,
    materias: [
      { materia: 'Etica', faltas: 1, ausente: 1, afuera: 0 },
      { materia: 'Sociales', faltas: 1, ausente: 0, afuera: 1 }
    ]
  });
});

test('Listado de estudiantes cuenta fallas aunque el estado heredado venga como presente', async () => {
  const docente = await asignarCursoADocente(curso.id, school.id, 'docente@demo.com');
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });

  await DocenteCursoMateria.create({ usuarioId: docente.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });

  const estudiante = await Estudiante.create({
    nombres: 'Nora',
    apellidos: 'Campos',
    qr: `QR-NORA-${Date.now()}`,
    cursoId: curso.id
  });

  await EstudianteMateria.create({
    estudianteId: estudiante.id,
    cursoId: curso.id,
    materiaId: materiaEtica.id,
    schoolId: school.id
  });

  await Asistencia.create({
    fecha: '2025-01-15',
    estado: 'presente',
    presente: false,
    ausente: true,
    estudianteId: estudiante.id,
    cursoId: curso.id,
    periodoId: periodo.id,
    schoolId: school.id,
    materiaId: materiaEtica.id
  });

  const res = await request(app)
    .get(`/estudiantes?cursoId=${curso.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(res.status).toBe(200);
  const estudianteListado = res.body.find((item) => item.id === estudiante.id);
  expect(estudianteListado?.faltas).toEqual({
    total: 1,
    ausente: 1,
    afuera: 0,
    materias: [
      { materia: 'Etica', faltas: 1, ausente: 1, afuera: 0 }
    ]
  });
});

test('Docente no puede actualizar ni eliminar estudiantes de otra materia en el mismo curso', async () => {
  const docenteUno = await asignarCursoADocente(curso.id, school.id, 'docente@demo.com');
  const docenteDos = await asignarCursoADocente(curso.id, school.id, 'docente2@demo.com');
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaFilosofia = await Materia.create({ nombre: 'Filosofia', schoolId: school.id });

  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteDos.id, cursoId: curso.id, materiaId: materiaFilosofia.id, schoolId: school.id });

  const createRes = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Mario',
      apellidos: 'Suarez',
      qr: `QR-MARIO-SHARED-${Date.now()}`,
      cursoId: curso.id,
      materias: ['Etica']
    });

  expect(createRes.status).toBe(201);

  const updateRes = await request(app)
    .put(`/estudiantes/${createRes.body.id}`)
    .set('Authorization', `Bearer ${secondTeacherToken}`)
    .send({ nombres: 'Mario', apellidos: 'Suarez', qr: createRes.body.qr, materias: ['Filosofia'] });

  expect(updateRes.status).toBe(403);
  expect(updateRes.body).toEqual({ error: 'No autorizado' });

  const deleteRes = await request(app)
    .delete(`/estudiantes/${createRes.body.id}`)
    .set('Authorization', `Bearer ${secondTeacherToken}`);

  expect(deleteRes.status).toBe(403);
  expect(deleteRes.body).toEqual({ error: 'No autorizado' });
});

test('Docente no puede actualizar ni eliminar un estudiante si solo comparte una parte de sus materias', async () => {
  const docenteUno = await asignarCursoADocente(curso.id, school.id, 'docente@demo.com');
  const docenteDos = await asignarCursoADocente(curso.id, school.id, 'docente2@demo.com');
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaSociales = await Materia.create({ nombre: 'Sociales', schoolId: school.id });

  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteUno.id, cursoId: curso.id, materiaId: materiaSociales.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docenteDos.id, cursoId: curso.id, materiaId: materiaEtica.id, schoolId: school.id });

  const createRes = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      nombres: 'Valeria',
      apellidos: 'Mora',
      qr: `QR-VALERIA-${Date.now()}`,
      cursoId: curso.id,
      materias: ['Etica', 'Sociales']
    });

  expect(createRes.status).toBe(201);

  const updateRes = await request(app)
    .put(`/estudiantes/${createRes.body.id}`)
    .set('Authorization', `Bearer ${secondTeacherToken}`)
    .send({ nombres: 'Valeria', apellidos: 'Mora', qr: createRes.body.qr, materias: ['Etica'] });

  expect(updateRes.status).toBe(403);
  expect(updateRes.body).toEqual({ error: 'No autorizado' });

  const deleteRes = await request(app)
    .delete(`/estudiantes/${createRes.body.id}`)
    .set('Authorization', `Bearer ${secondTeacherToken}`);

  expect(deleteRes.status).toBe(403);
  expect(deleteRes.body).toEqual({ error: 'No autorizado' });
});

test('Docente no puede actualizar ni eliminar estudiantes de cursos no asignados', async () => {
  await asignarCursoADocente(curso.id);
  const cursoDos = await Curso.create({ nombre: '9 01', schoolId: school.id });
  const studentC = await Estudiante.create({ nombres: 'Diana', apellidos: 'Rojas', qr: `QR-DIANA-${Date.now()}`, cursoId: cursoDos.id });

  const updateRes = await request(app)
    .put(`/estudiantes/${studentC.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ nombres: 'Diana', apellidos: 'Rojas', qr: studentC.qr });

  expect(updateRes.status).toBe(403);
  expect(updateRes.body).toEqual({ error: 'No autorizado' });

  const deleteRes = await request(app)
    .delete(`/estudiantes/${studentC.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(deleteRes.status).toBe(403);
  expect(deleteRes.body).toEqual({ error: 'No autorizado' });
});

test('Registra asistencia por QR dentro de periodo activo', async () => {
  const res = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    presente: true
  });
  expect(res.status).toBe(201);
  expect(res.body.registro.estudianteId).toBe(studentA.id);
  expect(res.body.registro.schoolId).toBe(school.id);
  expect(res.body.registro.horaRegistro || res.body.registro.hora_registro).toBeTruthy();

  const registroDb = await Asistencia.findByPk(res.body.registro.id);
  expect(registroDb?.horaRegistro).toBeTruthy();
});

test('Rechaza un segundo registro de asistencia para la misma clase', async () => {
  const createRes = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    presente: true
  });

  expect(createRes.status).toBe(201);
  const createdHora = new Date(createRes.body.registro.horaRegistro || createRes.body.registro.hora_registro).getTime();
  expect(Number.isFinite(createdHora)).toBe(true);

  const duplicateRes = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'ausente'
  });

  expect(duplicateRes.status).toBe(409);
  expect(duplicateRes.body).toEqual({ error: 'La asistencia ya fue registrada para esta clase' });

  const registroDb = await Asistencia.findByPk(createRes.body.registro.id);
  expect(new Date(registroDb?.horaRegistro).getTime()).toBe(createdHora);
  expect(registroDb?.estado).toBe('presente');
});

test('Reintento con clientRequestId retorna el mismo registro sin duplicar', async () => {
  const payload = {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'presente',
    clientRequestId: 'offline-retry-001'
  };

  const first = await registrarAsistencia(teacherToken, payload);
  expect(first.status).toBe(201);

  const retry = await registrarAsistencia(teacherToken, payload);
  expect(retry.status).toBe(200);
  expect(retry.body.idempotent).toBe(true);
  expect(retry.body.registro.id).toBe(first.body.registro.id);

  const totalRows = await Asistencia.count({ where: { clientRequestId: payload.clientRequestId } });
  expect(totalRows).toBe(1);
});

test('Rechaza asistencia si curso no corresponde al estudiante', async () => {
  const res = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: otroCurso.id,
    fecha: '2025-01-10',
    presente: true
  });
  expect(res.status).toBe(400);
  expect(res.body).toEqual({ error: 'El estudiante no pertenece al curso indicado' });
});

test('Escanear ausentes permite filtrar por materia del curso', async () => {
  const docente = await Usuario.findOne({ where: { email: 'docente@demo.com' } });
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  await DocenteCursoMateria.create({
    usuarioId: docente.id,
    cursoId: curso.id,
    materiaId: materiaEtica.id,
    schoolId: school.id
  });
  await EstudianteMateria.create({
    estudianteId: studentA.id,
    cursoId: curso.id,
    materiaId: materiaEtica.id,
    schoolId: school.id
  });

  const ausentesRes = await request(app)
    .get(`/asistencias/ausentes?cursoId=${curso.id}&fecha=2025-01-10&materia=Etica`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(ausentesRes.status).toBe(200);
  expect(ausentesRes.body.materia).toBe('Etica');
  expect(ausentesRes.body.ausentes.map((item) => item.id)).toEqual([studentA.id]);

  const invalidScanRes = await registrarAsistencia(teacherToken, {
    qr: studentB.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'ausente',
    materia: 'Etica'
  });

  expect(invalidScanRes.status).toBe(400);
  expect(invalidScanRes.body).toEqual({ error: 'El estudiante no pertenece a la materia seleccionada' });

  const validScanRes = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'ausente',
    materia: 'Etica'
  });

  expect(validScanRes.status).toBe(201);
  expect(validScanRes.body.registro.estudianteId).toBe(studentA.id);
  expect(validScanRes.body.registro.materiaId).toBe(materiaEtica.id);
});

test('Permite registrar asistencias del mismo estudiante en la misma fecha si son materias distintas', async () => {
  const docente = await Usuario.findOne({ where: { email: 'docente@demo.com' } });
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaSociales = await Materia.create({ nombre: 'Sociales', schoolId: school.id });

  await DocenteCursoMateria.create({
    usuarioId: docente.id,
    cursoId: curso.id,
    materiaId: materiaEtica.id,
    schoolId: school.id
  });
  await DocenteCursoMateria.create({
    usuarioId: docente.id,
    cursoId: curso.id,
    materiaId: materiaSociales.id,
    schoolId: school.id
  });
  await EstudianteMateria.create({
    estudianteId: studentA.id,
    cursoId: curso.id,
    materiaId: materiaEtica.id,
    schoolId: school.id
  });
  await EstudianteMateria.create({
    estudianteId: studentA.id,
    cursoId: curso.id,
    materiaId: materiaSociales.id,
    schoolId: school.id
  });

  const first = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'ausente',
    materia: 'Etica'
  });
  const second = await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'afuera',
    materia: 'Sociales'
  });

  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(first.body.registro.id).not.toBe(second.body.registro.id);

  const registrosDb = await Asistencia.findAll({
    where: { estudianteId: studentA.id, cursoId: curso.id, fecha: '2025-01-10', schoolId: school.id },
    order: [['materiaId', 'ASC']]
  });
  expect(registrosDb).toHaveLength(2);
  expect(registrosDb.map((item) => item.materiaId).sort((a, b) => a - b)).toEqual([materiaEtica.id, materiaSociales.id].sort((a, b) => a - b));
});

test('Previene duplicados de asistencia en misma fecha', async () => {
  const payload = { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-10', presente: true };
  const first = await registrarAsistencia(teacherToken, payload);
  expect(first.status).toBe(201);
  const dup = await registrarAsistencia(teacherToken, payload);
  expect(dup.status).toBe(409);
  expect(dup.body).toEqual({ error: 'La asistencia ya fue registrada para esta clase' });
});

test('Resumen calcula porcentajes y alertas de inasistencia', async () => {
  await registrarAsistencia(teacherToken, { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-10', presente: true });
  await registrarAsistencia(teacherToken, { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-11', presente: true });
  await registrarAsistencia(teacherToken, { qr: studentB.qr, cursoId: curso.id, fecha: '2025-01-10', presente: false });

  const res = await request(app)
    .get(`/asistencias/resumen?cursoId=${curso.id}&periodoId=${periodo.id}&totalClases=2`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(res.status).toBe(200);
  expect(res.body.totalClasesPeriodo).toBe(2);

  const ana = res.body.resumen.find(r => r.estudianteId === studentA.id);
  const luis = res.body.resumen.find(r => r.estudianteId === studentB.id);
  expect(ana.porcentajeInasistencia).toBe(0);
  expect(ana.alerta25).toBe(false);
  expect(luis.alerta25).toBe(true);
  expect(res.body.alertas.some(a => a.estudianteId === studentB.id)).toBe(true);
});

test('Exporta CSV de asistencias', async () => {
  await registrarAsistencia(teacherToken, { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-10', presente: true });

  const res = await request(app)
    .get(`/reportes/asistencias.csv?cursoId=${curso.id}&periodoId=${periodo.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('text/csv');
  expect(res.text).toMatch(/fecha,horaRegistro,cursoId,periodoId,estudianteId,estudiante,materiaId,materia,estado,presente/);
  expect(res.text).toContain(studentA.id.toString());
});

test('Dashboard de reportes agrupa inasistencias por dia, semana y mes y detecta el curso mas critico', async () => {
  const cursoDos = await Curso.create({ nombre: '10 01', schoolId: school.id });
  const studentC = await Estudiante.create({ nombres: 'Mia', apellidos: 'Rios', qr: 'QR-MIA-3', cursoId: cursoDos.id });
  const studentD = await Estudiante.create({ nombres: 'Teo', apellidos: 'Ruiz', qr: 'QR-TEO-4', cursoId: cursoDos.id });
  const docente = await Usuario.findOne({ where: { email: 'docente@demo.com' } });
  await CursoDocente.create({ usuarioId: docente.id, cursoId: cursoDos.id, schoolId: school.id });
  await DocenteCursoMateria.create({ usuarioId: docente.id, cursoId: cursoDos.id, materiaId: defaultMateria.id, schoolId: school.id });
  await EstudianteMateria.create({ estudianteId: studentC.id, cursoId: cursoDos.id, materiaId: defaultMateria.id, schoolId: school.id });
  await EstudianteMateria.create({ estudianteId: studentD.id, cursoId: cursoDos.id, materiaId: defaultMateria.id, schoolId: school.id });

  await registrarAsistencia(teacherToken, { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-06', presente: true });
  await registrarAsistencia(teacherToken, { qr: studentB.qr, cursoId: curso.id, fecha: '2025-01-06', presente: false });
  await registrarAsistencia(teacherToken, { qr: studentC.qr, cursoId: cursoDos.id, fecha: '2025-01-13', presente: false });
  await registrarAsistencia(teacherToken, {
    qr: studentD.qr,
    cursoId: cursoDos.id,
    fecha: '2025-01-13',
    estado: 'afuera'
  });

  const res = await request(app)
    .get(`/reportes/dashboard?periodoId=${periodo.id}`)
    .set('Authorization', `Bearer ${coordinadorToken}`);

  expect(res.status).toBe(200);
  expect(res.body.schoolId).toBe(school.id);
  expect(res.body.periodo.id).toBe(periodo.id);
  expect(res.body.totals.inasistencias).toBe(3);
  expect(res.body.totals.cursosConRegistros).toBe(2);
  expect(res.body.totals.estudiantesConInasistencias).toBe(3);
  expect(res.body.byDay).toEqual([
    expect.objectContaining({ fecha: '2025-01-06', inasistencias: 1 }),
    expect.objectContaining({ fecha: '2025-01-13', inasistencias: 2 })
  ]);
  expect(res.body.byWeek).toEqual([
    expect.objectContaining({ startDate: '2025-01-06', endDate: '2025-01-12', inasistencias: 1 }),
    expect.objectContaining({ startDate: '2025-01-13', endDate: '2025-01-19', inasistencias: 2 })
  ]);
  expect(res.body.byMonth).toEqual([
    expect.objectContaining({ monthKey: '2025-01', inasistencias: 3 })
  ]);
  expect(res.body.worstCourse).toEqual(expect.objectContaining({
    cursoId: cursoDos.id,
    cursoNombre: '10 01',
    inasistencias: 2
  }));
  expect(res.body.worstCourse.diasMasFaltas).toEqual([
    expect.objectContaining({ fecha: '2025-01-13', inasistencias: 2 })
  ]);
  expect(res.body.worstDays[0]).toEqual(expect.objectContaining({ fecha: '2025-01-13', inasistencias: 2 }));
  expect(res.body.highlights.semanaMasCritica).toEqual(expect.objectContaining({
    startDate: '2025-01-13',
    endDate: '2025-01-19',
    inasistencias: 2
  }));
  expect(res.body.highlights.mesMasCritico).toEqual(expect.objectContaining({
    monthKey: '2025-01',
    inasistencias: 3
  }));
});

test('Reporte de inasistencia por curso devuelve detalle del dia y resumen del mes', async () => {
  await registrarAsistencia(teacherToken, { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-10', presente: true });
  await registrarAsistencia(teacherToken, { qr: studentB.qr, cursoId: curso.id, fecha: '2025-01-10', presente: false });
  await registrarAsistencia(teacherToken, { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-17', estado: 'afuera' });

  const res = await request(app)
    .get(`/reportes/curso-inasistencias?cursoId=${curso.id}&mes=2025-01&fecha=2025-01-10`)
    .set('Authorization', `Bearer ${coordinadorToken}`);

  expect(res.status).toBe(200);
  expect(res.body.curso).toEqual(expect.objectContaining({ id: curso.id, nombre: 'Matematicas' }));
  expect(res.body.mes).toBe('2025-01');
  expect(res.body.fecha).toBe('2025-01-10');
  expect(res.body.resumenMes).toEqual(expect.objectContaining({
    registros: 3,
    ausentes: 1,
    afuera: 1,
    inasistencias: 2,
    diasConRegistro: 2,
    diasConInasistencias: 2,
    estudiantesConFaltas: 2
  }));
  expect(res.body.detalleDia).toEqual(expect.objectContaining({
    fecha: '2025-01-10',
    totalInasistencias: 1,
    totalAusentes: 1,
    totalAfuera: 0,
    totalSinRegistro: 0
  }));
  expect(res.body.detalleDia.estudiantes).toEqual([
    expect.objectContaining({ id: studentB.id, estadoActual: 'ausente' })
  ]);
  expect(res.body.diasMasCriticosMes[0]).toEqual(expect.objectContaining({
    fecha: '2025-01-10',
    inasistencias: 1
  }));
  expect(res.body.estudiantesConMasFaltas).toEqual(expect.arrayContaining([
    expect.objectContaining({ estudianteId: studentA.id, afuera: 1, inasistencias: 1 }),
    expect.objectContaining({ estudianteId: studentB.id, ausente: 1, inasistencias: 1 })
  ]));
});

test('Reporte de inasistencia por curso agrupa por estudiante y dia aunque tenga varias materias', async () => {
  const docente = await Usuario.findOne({ where: { email: 'docente@demo.com' } });
  const materiaEtica = await Materia.create({ nombre: 'Etica', schoolId: school.id });
  const materiaSociales = await Materia.create({ nombre: 'Sociales', schoolId: school.id });

  await DocenteCursoMateria.create({
    usuarioId: docente.id,
    cursoId: curso.id,
    materiaId: materiaEtica.id,
    schoolId: school.id
  });
  await DocenteCursoMateria.create({
    usuarioId: docente.id,
    cursoId: curso.id,
    materiaId: materiaSociales.id,
    schoolId: school.id
  });
  await EstudianteMateria.create({
    estudianteId: studentA.id,
    cursoId: curso.id,
    materiaId: materiaEtica.id,
    schoolId: school.id
  });
  await EstudianteMateria.create({
    estudianteId: studentA.id,
    cursoId: curso.id,
    materiaId: materiaSociales.id,
    schoolId: school.id
  });

  await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'ausente',
    materia: 'Etica'
  });
  await registrarAsistencia(teacherToken, {
    qr: studentA.qr,
    cursoId: curso.id,
    fecha: '2025-01-10',
    estado: 'afuera',
    materia: 'Sociales'
  });

  const res = await request(app)
    .get(`/reportes/curso-inasistencias?cursoId=${curso.id}&mes=2025-01&fecha=2025-01-10`)
    .set('Authorization', `Bearer ${coordinadorToken}`);

  expect(res.status).toBe(200);
  expect(res.body.detalleDia.totalInasistencias).toBe(2);
  expect(res.body.detalleDia.totalAfuera).toBe(0);
  expect(res.body.detalleDia.totalAusentes).toBe(1);
  expect(res.body.detalleDia.estudiantes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: studentA.id,
      estadoActual: 'ausente',
      materias: expect.arrayContaining([
        expect.objectContaining({ materia: 'Etica', estadoActual: 'ausente' }),
        expect.objectContaining({ materia: 'Sociales', estadoActual: 'afuera' })
      ])
    }),
    expect.objectContaining({ id: studentB.id, estadoActual: null })
  ]));
  expect(res.body.resumenMes.inasistencias).toBe(1);
  expect(res.body.estudiantesConMasFaltas).toEqual(expect.arrayContaining([
    expect.objectContaining({ estudianteId: studentA.id, inasistencias: 1, ausente: 1, afuera: 0 })
  ]));
});

test('Docente no puede acceder al dashboard de reportes', async () => {
  const res = await request(app)
    .get(`/reportes/dashboard?periodoId=${periodo.id}`)
    .set('Authorization', `Bearer ${teacherToken}`);

  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: 'No autorizado' });
});


