// Pruebas de seguridad funcionales: headers de seguridad y rate limiting.
import request from 'supertest';
import bcrypt from 'bcrypt';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import { Usuario, Colegio } from '../src/models/index.js';

let app;
const prevRateLimit = process.env.RATE_LIMIT_MAX;
const prevCors = process.env.CORS_ORIGINS;

beforeAll(async () => {
  process.env.RATE_LIMIT_MAX = '3'; // bajar el limite para probar 429
  process.env.CORS_ORIGINS = 'http://localhost:3000';
  app = await init();
});

afterAll(async () => {
  if (prevRateLimit === undefined) delete process.env.RATE_LIMIT_MAX;
  else process.env.RATE_LIMIT_MAX = prevRateLimit;
  if (prevCors === undefined) delete process.env.CORS_ORIGINS;
  else process.env.CORS_ORIGINS = prevCors;
  await sequelize.close();
});

beforeEach(async () => {
  await sequelize.sync({ force: true });
  const school = await Colegio.create({ nombre: 'Security School' });
  await Usuario.create({
    nombre: 'Admin',
    email: 'admin@sec.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: school.id
  });
});

test('Headers de seguridad de Helmet presentes', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.headers).toMatchObject({
    'x-dns-prefetch-control': 'off',
    'x-frame-options': 'SAMEORIGIN',
    'x-content-type-options': 'nosniff'
  });
});

test('Rate limit devuelve 429 tras exceder maximo', async () => {
  let hit429 = false;
  for (let i = 0; i < 1200; i++) {
    const r = await request(app).get('/');
    if (r.status === 429) {
      hit429 = true;
      break;
    }
  }
  expect(hit429).toBe(true);
});
