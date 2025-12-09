// Prueba de rendimiento ligera (smoke): asegura que el flujo basico responde bajo un umbral.
import { jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio, Curso, Estudiante, Periodo } from '../src/models/index.js';

let app;
const prevRateLimit = process.env.RATE_LIMIT_MAX;
jest.setTimeout(20000);

async function login(email, password) {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

beforeAll(async () => {
  process.env.RATE_LIMIT_MAX = '1000'; // evitar frenos del rate limit global
  app = await init();
});

afterAll(async () => {
  if (prevRateLimit === undefined) delete process.env.RATE_LIMIT_MAX;
  else process.env.RATE_LIMIT_MAX = prevRateLimit;
  await sequelize.close();
});

beforeEach(async () => {
  await sequelize.sync({ force: true });
  const school = await Colegio.create({ nombre: 'Perf School' });
  await Usuario.create({
    nombre: 'Admin',
    email: 'admin@perf.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: school.id
  });
  await Usuario.create({
    nombre: 'Docente',
    email: 'docente@perf.com',
    passwordHash: await bcrypt.hash('doc123', 10),
    rol: 'docente',
    schoolId: school.id
  });
});

test('Flujo de 20 logins y 10 resumenes bajo 5s', async () => {
  const start = Date.now();
  const adminToken = await login('admin@perf.com', 'admin123');
  const teacherToken = await login('docente@perf.com', 'doc123');

  // preparar datos para resumen
  const curso = await Curso.create({ nombre: 'Mat', schoolId: 1 });
  const periodo = await Periodo.create({ nombre: 'P1', fechaInicio: '2025-01-01', fechaFin: '2025-01-31', schoolId: 1 });
  const student = await Estudiante.create({ nombres: 'Ana', apellidos: 'Perf', qr: 'PERF-QR', cursoId: curso.id });
  await request(app).post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ qr: student.qr, cursoId: curso.id, fecha: '2025-01-02', presente: true });

  // 20 logins
  for (let i = 0; i < 20; i++) {
    await request(app).post('/auth/login').send({ email: 'docente@perf.com', password: 'doc123' }).expect(200);
  }

  // 10 consultas de resumen
  for (let i = 0; i < 10; i++) {
    await request(app)
      .get(`/asistencias/resumen?cursoId=${curso.id}&periodoId=${periodo.id}&totalClases=1`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
  }

  const elapsed = Date.now() - start;
  expect(elapsed).toBeLessThan(5000);
});
