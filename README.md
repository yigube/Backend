# Asistencia Backend (Node + Express + Sequelize + MySQL)

Endpoints clave:
- `POST /auth/login`
- `POST /asistencias/qr`
- `GET /asistencias/resumen?cursoId=1&periodoId=1`
- `GET /reportes/asistencias.csv?cursoId=1&periodoId=1`
- Todos los endpoints salvo `POST /auth/login` requieren cabecera `Authorization: Bearer <token>` obtenida tras el login.
- Multi-colegio: cada usuario está asociado a un colegio y sólo puede operar sobre cursos, periodos y estudiantes de su colegio (aislamiento para escalar a decenas o cientos de colegios en la misma instancia).

## Configurar
1) Copia `.env.example` a `.env` y ajusta variables.
2) `npm install`
3) Levanta MySQL con Docker o tu propio servidor.
4) `npm run db:seed`
5) `npm run dev`

Ver detalles en instrucciones del chat.

## Novedades v2
- Validaciones con express-validator
- Roles (admin/docente) con `requireRole`
- Socket.IO: evento `asistencia:registrada`
