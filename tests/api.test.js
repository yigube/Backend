// Pruebas de API con datos reales en SQLite en memoria.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio, Curso, CursoDocente, Estudiante, Periodo, Rector, Materia, DocenteCursoMateria } from '../src/models/index.js';
import { resetLoginRateLimitBuckets } from '../src/middleware/rateLimit.js';

let app;
let school;
let otherSchool;
let adminToken;
let globalAdminToken;
let teacherToken;
let coordinadorToken;
let curso;
let otroCurso;
let periodo;
let studentA;
let studentB;

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

beforeAll(async () => {
  app = await init();
});

beforeEach(async () => {
  resetLoginRateLimitBuckets();
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
  await Usuario.create({
    nombre: 'Docente',
    email: 'docente@demo.com',
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
  periodo = await Periodo.create({ nombre: 'P1', fechaInicio: '2025-01-01', fechaFin: '2025-01-31', schoolId: school.id });
  await Periodo.create({ nombre: 'P1-Other', fechaInicio: '2025-01-01', fechaFin: '2025-01-31', schoolId: otherSchool.id });

  adminToken = await login('admin@demo.com', 'admin123');
  globalAdminToken = await login('admin.global@demo.com', 'admin123');
  coordinadorToken = await login('coordinador@demo.com', 'coord123');
  teacherToken = await login('docente@demo.com', 'doc123');
});

afterAll(async () => {
  await sequelize.close();
});

test('Login OK', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'docente@demo.com', password: 'doc123' });
  expect(res.status).toBe(200);
  expect(res.body.token).toBeTruthy();
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
      password: 'doc1234',
      schoolId: otherSchool.id,
      cursoIds: [curso.id]
    });
  expect(createDocente.status).toBe(201);
  expect(createDocente.body.schoolId).toBe(school.id);
  expect(createDocente.body.cursos.map((c) => c.id)).toEqual([curso.id]);

  const createPeriodo = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${coordinadorToken}`)
    .send({ nombre: 'P2', fechaInicio: '2025-02-01', fechaFin: '2025-02-28', schoolId: otherSchool.id });
  expect(createPeriodo.status).toBe(201);
  expect(createPeriodo.body.schoolId).toBe(school.id);
});

test('Admin crea docente y asigna cursos del colegio seleccionado', async () => {
  const res = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Nuevo',
      email: 'docente.nuevo@demo.com',
      password: 'doc1234',
      schoolId: school.id,
      cursoIds: [curso.id]
    });

  expect(res.status).toBe(201);
  expect(res.body.schoolId).toBe(school.id);
  expect(Array.isArray(res.body.cursos)).toBe(true);
  expect(res.body.cursos.map((c) => c.id)).toEqual([curso.id]);
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
      password: 'doc1234',
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

  const materiasDb = await Materia.findAll({ where: { schoolId: school.id }, order: [['nombre', 'ASC']] });
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
      password: 'doc1234',
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

  const materiasDb = await Materia.findAll({ where: { schoolId: school.id }, order: [['nombre', 'ASC']] });
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

test('Admin actualiza docente y persiste todas las materias en multiples cursos', async () => {
  const cursoDos = await Curso.create({ nombre: '10', schoolId: school.id });
  const cursoTres = await Curso.create({ nombre: '11', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Actualizar',
      email: 'docente.actualizar@demo.com',
      password: 'doc1234',
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

test('Admin elimina docente y borra en cascada sus cursos y materias asignadas', async () => {
  const cursoDos = await Curso.create({ nombre: '8 01', schoolId: school.id });

  const createRes = await request(app)
    .post('/docentes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      nombre: 'Docente Eliminar',
      email: 'docente.eliminar@demo.com',
      password: 'doc1234',
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
  expect(await Materia.count({ where: { schoolId: school.id } })).toBe(0);

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
      password: 'doc1234',
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
    rectorPassword: 'rector1234'
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
      rectorPassword: 'rector1234'
    });

  expect(res.status).toBe(422);
  expect(res.body.errors).toBeTruthy();
  expect(res.body.errors[0].msg).toBe('Correo del rector invalido');
});

test('Docente no crea estudiante en curso de otro colegio', async () => {
  const res = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ nombres: 'Eva', apellidos: 'Cruz', qr: 'QR-EVA', cursoId: otroCurso.id });
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Curso no encontrado' });
});

test('Docente puede agregar estudiantes de su colegio', async () => {
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

test('Previene duplicados de asistencia en misma fecha', async () => {
  const payload = { qr: studentA.qr, cursoId: curso.id, fecha: '2025-01-10', presente: true };
  const first = await registrarAsistencia(teacherToken, payload);
  expect(first.status).toBe(201);
  const dup = await registrarAsistencia(teacherToken, payload);
  expect(dup.status).toBe(409);
  expect(dup.body).toEqual({ error: 'Ya existe registro para este estudiante/curso/fecha' });
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
  expect(res.text).toMatch(/fecha,cursoId,periodoId,estudianteId,estudiante,presente/);
  expect(res.text).toContain(studentA.id.toString());
});
