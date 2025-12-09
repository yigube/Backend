// Pruebas de sistema/extremo a extremo cubriendo flujo principal.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio, Curso, Estudiante, Periodo } from '../src/models/index.js';

let app;
let adminToken;
let teacherToken;
let school;

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
  school = await Colegio.create({ nombre: 'Colegio QA' });

  await Usuario.create({
    nombre: 'Admin QA',
    email: 'admin@qa.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: school.id
  });
  await Usuario.create({
    nombre: 'Docente QA',
    email: 'docente@qa.com',
    passwordHash: await bcrypt.hash('doc123', 10),
    rol: 'docente',
    schoolId: school.id
  });

  adminToken = await login('admin@qa.com', 'admin123');
  teacherToken = await login('docente@qa.com', 'doc123');
});

afterAll(async () => {
  await sequelize.close();
});

test('Flujo completo: admin crea curso/periodo, docente registra asistencias, genera resumen y CSV', async () => {
  // Admin crea curso
  const cursoRes = await request(app)
    .post('/cursos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombre: 'Ciencias' });
  expect(cursoRes.status).toBe(201);
  const cursoId = cursoRes.body.id;

  // Admin crea periodo
  const periodoRes = await request(app)
    .post('/periodos')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombre: 'P1', fechaInicio: '2025-02-01', fechaFin: '2025-02-28' });
  expect(periodoRes.status).toBe(201);
  const periodoId = periodoRes.body.id;

  // Admin crea estudiantes
  const estAna = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombres: 'Ana', apellidos: 'Lopez', qr: 'SYS-ANA-QR', cursoId });
  expect(estAna.status).toBe(201);

  const estLuis = await request(app)
    .post('/estudiantes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ nombres: 'Luis', apellidos: 'Perez', qr: 'SYS-LUIS-QR', cursoId });
  expect(estLuis.status).toBe(201);

  // Docente registra asistencias (2 clases)
  const fecha1 = '2025-02-10';
  const fecha2 = '2025-02-11';
  await request(app).post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ qr: 'SYS-ANA-QR', cursoId, fecha: fecha1, presente: true })
    .expect(201);
  await request(app).post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ qr: 'SYS-LUIS-QR', cursoId, fecha: fecha1, presente: false })
    .expect(201);
  await request(app).post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ qr: 'SYS-ANA-QR', cursoId, fecha: fecha2, presente: true })
    .expect(201);
  await request(app).post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ qr: 'SYS-LUIS-QR', cursoId, fecha: fecha2, presente: true })
    .expect(201);

  // Resumen de curso
  const resumenRes = await request(app)
    .get(`/asistencias/resumen?cursoId=${cursoId}&periodoId=${periodoId}&totalClases=2`)
    .set('Authorization', `Bearer ${teacherToken}`);
  expect(resumenRes.status).toBe(200);
  expect(resumenRes.body.totalClasesPeriodo).toBe(2);
  const ana = resumenRes.body.resumen.find(r => r.nombre.includes('Ana'));
  const luis = resumenRes.body.resumen.find(r => r.nombre.includes('Luis'));
  expect(ana.presentes).toBe(2);
  expect(ana.ausencias).toBe(0);
  expect(luis.presentes).toBe(1);
  expect(luis.alerta25).toBe(true);
  expect(resumenRes.body.alertas.some(a => a.nombre.includes('Luis'))).toBe(true);

  // CSV de asistencias
  const csvRes = await request(app)
    .get(`/reportes/asistencias.csv?cursoId=${cursoId}&periodoId=${periodoId}`)
    .set('Authorization', `Bearer ${teacherToken}`);
  expect(csvRes.status).toBe(200);
  expect(csvRes.headers['content-type']).toContain('text/csv');
  expect(csvRes.text).toContain('Ana Lopez');
  expect(csvRes.text).toContain('Luis Perez');
});
