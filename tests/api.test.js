// Pruebas de API con datos reales en SQLite en memoria.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio, Curso, Estudiante, Periodo } from '../src/models/index.js';

let app;
let school;
let otherSchool;
let adminToken;
let teacherToken;
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

  curso = await Curso.create({ nombre: 'Matematicas', schoolId: school.id });
  otroCurso = await Curso.create({ nombre: 'Historia', schoolId: otherSchool.id });
  studentA = await Estudiante.create({ nombres: 'Ana', apellidos: 'Lopez', qr: 'QR-ANA-1', cursoId: curso.id });
  studentB = await Estudiante.create({ nombres: 'Luis', apellidos: 'Perez', qr: 'QR-LUIS-2', cursoId: curso.id });
  periodo = await Periodo.create({ nombre: 'P1', fechaInicio: '2025-01-01', fechaFin: '2025-01-31', schoolId: school.id });
  await Periodo.create({ nombre: 'P1-Other', fechaInicio: '2025-01-01', fechaFin: '2025-01-31', schoolId: otherSchool.id });

  adminToken = await login('admin@demo.com', 'admin123');
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

test('Admin no crea estudiante en curso de otro colegio', async () => {
  const res = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombres: 'Eva', apellidos: 'Cruz', qr: 'QR-EVA', cursoId: otroCurso.id });
  expect(res.status).toBe(404);
  expect(res.body).toEqual({ error: 'Curso no encontrado' });
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