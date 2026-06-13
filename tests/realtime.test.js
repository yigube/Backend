import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as createSocketClient } from 'socket.io-client';
import { init } from '../src/app.js';
import { sequelize } from '../src/config/database.js';
import {
  Usuario,
  Colegio,
  Curso,
  CursoDocente,
  DocenteCursoMateria,
  Estudiante,
  EstudianteMateria,
  Materia,
  Periodo
} from '../src/models/index.js';

let app;
let httpServer;
let io;
let baseUrl;
let school;
let adminToken;
let teacherToken;
let curso;
let periodo;

async function login(email, password) {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

function onceWithTimeout(socket, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, onEvent);
      reject(new Error(`Timeout esperando evento ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(payload);
    };

    socket.on(eventName, onEvent);
  });
}

beforeAll(async () => {
  app = await init();
  httpServer = createServer(app);
  io = new Server(httpServer, { cors: { origin: '*', credentials: false } });
  app.set('io', io);

  io.use((socket, next) => {
    const authHeader = socket.handshake.headers?.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = socket.handshake.auth?.token || bearer;
    if (!token) return next(new Error('Token requerido'));
    try {
      socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {
      return next(new Error('Token invalido'));
    }
  });

  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => {
      const { port } = httpServer.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

beforeEach(async () => {
  await sequelize.sync({ force: true });
  school = await Colegio.create({ nombre: 'Colegio Realtime' });

  await Usuario.create({
    nombre: 'Admin Realtime',
    email: 'admin@realtime.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: school.id
  });
  const docente = await Usuario.create({
    nombre: 'Docente Realtime',
    email: 'docente@realtime.com',
    passwordHash: await bcrypt.hash('doc123', 10),
    rol: 'docente',
    schoolId: school.id
  });

  curso = await Curso.create({ nombre: '6 02', schoolId: school.id });
  periodo = await Periodo.create({
    nombre: 'Periodo 1',
    fechaInicio: '2025-02-01',
    fechaFin: '2025-04-11',
    schoolId: school.id
  });
  const materia = await Materia.create({ nombre: 'General', schoolId: school.id });
  const estudiante = await Estudiante.create({
    nombres: 'Ana',
    apellidos: 'Lopez',
    qr: 'REALTIME-QR-ANA',
    cursoId: curso.id
  });

  await CursoDocente.create({ usuarioId: docente.id, cursoId: curso.id, schoolId: school.id });
  await DocenteCursoMateria.create({
    usuarioId: docente.id,
    cursoId: curso.id,
    materiaId: materia.id,
    schoolId: school.id
  });
  await EstudianteMateria.create({
    estudianteId: estudiante.id,
    cursoId: curso.id,
    materiaId: materia.id,
    schoolId: school.id
  });

  adminToken = await login('admin@realtime.com', 'admin123');
  teacherToken = await login('docente@realtime.com', 'doc123');
});

afterAll(async () => {
  if (io) {
    await new Promise((resolve) => io.close(() => resolve()));
  }
  if (httpServer?.listening) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
  await sequelize.close();
});

test('Socket rechaza conexiones sin token valido', async () => {
  const client = createSocketClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: 'token-invalido' }
  });

  const error = await new Promise((resolve) => {
    client.on('connect_error', resolve);
  });

  expect(error).toBeTruthy();
  expect(error.message).toBe('Token invalido');
  client.close();
});

test('Registrar asistencia por QR emite eventos realtime autenticados por JWT', async () => {
  const client = createSocketClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: teacherToken }
  });

  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });

  const asistenciaRegistradaPromise = onceWithTimeout(client, 'asistencia:registrada');
  const attendanceCreatedPromise = onceWithTimeout(client, 'attendance:created');

  const response = await request(app)
    .post('/asistencias/qr')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      qr: 'REALTIME-QR-ANA',
      cursoId: curso.id,
      fecha: '2025-02-10',
      presente: true
    });

  expect(response.status).toBe(201);
  expect(response.body.registro.periodoId).toBe(periodo.id);

  const [asistenciaRegistrada, attendanceCreated] = await Promise.all([
    asistenciaRegistradaPromise,
    attendanceCreatedPromise
  ]);

  expect(asistenciaRegistrada).toEqual({
    estudianteId: response.body.registro.estudianteId,
    cursoId: curso.id,
    materiaId: response.body.registro.materiaId,
    schoolId: school.id,
    fecha: '2025-02-10',
    presente: true,
    estado: 'presente',
    clientRequestId: null
  });
  expect(attendanceCreated).toEqual(asistenciaRegistrada);

  client.close();
});

test('Admin tambien puede consumir el canal realtime autenticado', async () => {
  const client = createSocketClient(baseUrl, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: adminToken }
  });

  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('connect_error', reject);
  });

  expect(client.connected).toBe(true);
  client.close();
});
