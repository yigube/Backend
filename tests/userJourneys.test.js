// Pruebas de usuario (flujo de negocio) automatizadas con Supertest.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio, Curso, Estudiante, Periodo } from '../src/models/index.js';

let app;
let adminToken;
let teacherToken;
let cursoBase;
let periodo;
let student;

async function login(email, password) {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

beforeAll(async () => {
  app = await init();
});

beforeEach(async () => {
  await sequelize.sync({ force: true });
  const school = await Colegio.create({ nombre: 'User Journey School' });

  await Usuario.create({
    nombre: 'Admin',
    email: 'admin@uj.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: school.id
  });
  await Usuario.create({
    nombre: 'Docente',
    email: 'docente@uj.com',
    passwordHash: await bcrypt.hash('doc123', 10),
    rol: 'docente',
    schoolId: school.id
  });

  cursoBase = await Curso.create({ nombre: 'Matematicas', schoolId: school.id });
  periodo = await Periodo.create({ nombre: 'P1', fechaInicio: '2025-01-01', fechaFin: '2025-01-31', schoolId: school.id });
  student = await Estudiante.create({ nombres: 'Ana', apellidos: 'Tester', qr: 'UJ-ANA', cursoId: cursoBase.id });

  adminToken = await login('admin@uj.com', 'admin123');
  teacherToken = await login('docente@uj.com', 'doc123');
});

afterAll(async () => {
  await sequelize.close();
});

test('Admin gestiona catalogos y ve los cursos creados', async () => {
  const createCourse = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombre: 'Biologia' });
  expect(createCourse.status).toBe(201);

  const createPeriodo = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombre: 'P2', fechaInicio: '2025-02-01', fechaFin: '2025-02-28' });
  expect(createPeriodo.status).toBe(201);

  const listCourses = await request(app)
    .get('/cursos')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(listCourses.status).toBe(200);
  const names = listCourses.body.map(c => c.nombre);
  expect(names).toEqual(expect.arrayContaining(['Matematicas', 'Biologia']));
});

test('Docente registra asistencia valida y recibe error con QR inexistente', async () => {
  const badQR = await request(app)
    .post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ qr: 'NO-EXISTE', cursoId: cursoBase.id, fecha: '2025-01-10', presente: true });
  expect(badQR.status).toBe(404);

  const okQR = await request(app)
    .post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ qr: student.qr, cursoId: cursoBase.id, fecha: '2025-01-10', presente: true });
  expect(okQR.status).toBe(201);
  expect(okQR.body.registro.estudianteId).toBe(student.id);
  expect(okQR.body.registro.periodoId).toBe(periodo.id);
});
