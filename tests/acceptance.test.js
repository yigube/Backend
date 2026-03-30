// Pruebas de aceptación: verifica criterios de negocio para multi-colegio y roles.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio, Curso, CursoDocente, DocenteCursoMateria, Estudiante, EstudianteMateria, Materia, Periodo } from '../src/models/index.js';

let app;
let tokenAdminA;
let tokenAdminB;
let tokenDocenteA;
let cursoA;
let periodoA;
let alumnoA;

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
  const colegioA = await Colegio.create({ nombre: 'Colegio A' });
  const colegioB = await Colegio.create({ nombre: 'Colegio B' });

  await Usuario.create({
    nombre: 'Admin A',
    email: 'admin@a.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: colegioA.id
  });
  await Usuario.create({
    nombre: 'Admin B',
    email: 'admin@b.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: colegioB.id
  });
  const docenteA = await Usuario.create({
    nombre: 'Docente A',
    email: 'docente@a.com',
    passwordHash: await bcrypt.hash('doc123', 10),
    rol: 'docente',
    schoolId: colegioA.id
  });

  cursoA = await Curso.create({ nombre: 'Historia', schoolId: colegioA.id });
  periodoA = await Periodo.create({ nombre: 'P1', fechaInicio: '2025-03-01', fechaFin: '2025-03-31', schoolId: colegioA.id });
  alumnoA = await Estudiante.create({ nombres: 'Ana', apellidos: 'Garcia', qr: 'ACC-ANA', cursoId: cursoA.id });
  const materiaA = await Materia.create({ nombre: 'General', schoolId: colegioA.id });
  await CursoDocente.create({ usuarioId: docenteA.id, cursoId: cursoA.id, schoolId: colegioA.id });
  await DocenteCursoMateria.create({ usuarioId: docenteA.id, cursoId: cursoA.id, materiaId: materiaA.id, schoolId: colegioA.id });
  await EstudianteMateria.create({ estudianteId: alumnoA.id, cursoId: cursoA.id, materiaId: materiaA.id, schoolId: colegioA.id });

  tokenAdminA = await login('admin@a.com', 'admin123');
  tokenAdminB = await login('admin@b.com', 'admin123');
  tokenDocenteA = await login('docente@a.com', 'doc123');
});

afterAll(async () => {
  await sequelize.close();
});

test('Aceptación: Admin B no puede ver cursos ni crear estudiantes en Colegio A', async () => {
  const list = await request(app).get('/cursos').set('Authorization', `Bearer ${tokenAdminB}`);
  expect(list.status).toBe(200);
  expect(list.body).toEqual([]); // no ve cursos de otro colegio

  const create = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${tokenAdminB}`)
    .send({ nombres: 'Luis', apellidos: 'Lopez', qr: 'ACC-LUIS', cursoId: cursoA.id });
  expect(create.status).toBe(404); // curso no encontrado porque es de otro colegio
});

test('Aceptación: Docente puede registrar asistencia pero no crear curso', async () => {
  const createCourse = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${tokenDocenteA}`)
    .send({ nombre: 'Geografia' });
  expect(createCourse.status).toBe(403);

  const asistencia = await request(app)
    .post('/asistencias/qr')
    .set('Authorization', `Bearer ${tokenDocenteA}`)
    .send({ qr: alumnoA.qr, cursoId: cursoA.id, fecha: '2025-03-10', presente: true });
  expect(asistencia.status).toBe(201);
});

test('Aceptación: Reporte CSV solo incluye datos del colegio del usuario', async () => {
  // Registra asistencia en colegio A
  await request(app)
    .post('/asistencias/qr')
    .set('Authorization', `Bearer ${tokenDocenteA}`)
    .send({ qr: alumnoA.qr, cursoId: cursoA.id, fecha: '2025-03-10', presente: true });

  // Admin B intenta descargar CSV de curso ajeno
  const csv = await request(app)
    .get(`/reportes/asistencias.csv?cursoId=${cursoA.id}&periodoId=${periodoA.id}`)
    .set('Authorization', `Bearer ${tokenAdminB}`);
  expect(csv.status).toBe(404);
});
