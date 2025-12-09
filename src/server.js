// Orquesta Express + Socket.IO, incluyendo autenticacion por JWT en sockets.
import { init } from './app.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

const basePort = Number(process.env.PORT) || 4000;
const socketCorsOrigins = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
const corsConfig = socketCorsOrigins.length ? { origin: socketCorsOrigins, credentials: true } : { origin: '*', credentials: true };

init().then(app => {
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: corsConfig });
  app.set('io', io);

  // Autentica sockets con el mismo JWT de la API REST.
  io.use((socket, next) => {
    const authHeader = socket.handshake.headers?.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const token = socket.handshake.auth?.token || bearer;
    if (!token) return next(new Error('Token requerido'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.data.user = payload;
      return next();
    } catch (err) {
      return next(new Error('Token invalido'));
    }
  });

  io.on('connection', (socket) => {
    console.log('Socket conectado', socket.id);
  });

  const listenWithRetry = (port, retries = 3) => {
    // Si el puerto esta en uso, prueba los siguientes hasta agotar retries.
    const onError = (err) => {
      if (err.code === 'EADDRINUSE' && retries > 0) {
        console.warn(`Puerto ${port} en uso, intentando puerto ${port + 1}...`);
        return listenWithRetry(port + 1, retries - 1);
      }
      console.error('Failed to bind server', err);
      process.exit(1);
    };

    httpServer.once('error', onError);
    httpServer.listen(port, '0.0.0.0', () => {
      httpServer.off('error', onError);
      console.log(`Server on http://localhost:${port}`);
    });
  };

  listenWithRetry(basePort);
}).catch(e => {
  console.error('Failed to start server', e);
  process.exit(1);
});
