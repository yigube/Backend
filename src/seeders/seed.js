// Seeder de datos de ejemplo multi-colegio para desarrollo.
import bcrypt from 'bcrypt';
import { sequelize } from '../config/database.js';
import { Usuario, Curso, Estudiante, Periodo, Colegio } from '../models/index.js';

async function seed() {
  // Desactiva claves foraneas para poder recrear tablas en orden sin choques.
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  await sequelize.sync({ force: true });
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  const colegios = await Promise.all([
    Colegio.create({ nombre: 'Colegio Central' }),
    Colegio.create({ nombre: 'Colegio Norte' })
  ]);

  const [central, norte] = colegios;

  await Usuario.create({
    nombre: 'Admin Central',
    email: 'admin@central.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: central.id
  });

  await Usuario.create({
    nombre: 'Yigube',
    email: 'yigube@hotmail.com',
    passwordHash: await bcrypt.hash('12345', 10),
    rol: 'admin',
    schoolId: central.id
  });

  const docenteCentral = await Usuario.create({
    nombre: 'Docente Central',
    email: 'docente@central.com',
    passwordHash: await bcrypt.hash('docente123', 10),
    rol: 'docente',
    schoolId: central.id
  });
  const docenteCentral2 = await Usuario.create({
    nombre: 'Docente Central 2',
    email: 'docente2@central.com',
    passwordHash: await bcrypt.hash('docente123', 10),
    rol: 'docente',
    schoolId: central.id
  });

  await Usuario.create({
    nombre: 'Admin Norte',
    email: 'admin@norte.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    rol: 'admin',
    schoolId: norte.id
  });
  const docenteNorte = await Usuario.create({
    nombre: 'Docente Norte',
    email: 'docente@norte.com',
    passwordHash: await bcrypt.hash('docente123', 10),
    rol: 'docente',
    schoolId: norte.id
  });

  const cursoCentral = await Curso.create({ nombre: '9A', schoolId: central.id });
  const cursoNorte = await Curso.create({ nombre: '10B', schoolId: norte.id });

  await cursoCentral.addDocente(docenteCentral, { through: { schoolId: central.id } });
  await cursoCentral.addDocente(docenteCentral2, { through: { schoolId: central.id } });
  await cursoNorte.addDocente(docenteNorte, { through: { schoolId: norte.id } });

  await Promise.all([
    Estudiante.create({ nombres: 'Ana', apellidos: 'Perez', qr: 'QR-ANA-001', cursoId: cursoCentral.id }),
    Estudiante.create({ nombres: 'Luis', apellidos: 'Gomez', qr: 'QR-LUIS-002', cursoId: cursoCentral.id }),
    Estudiante.create({ nombres: 'Sara', apellidos: 'Lopez', qr: 'QR-SARA-003', cursoId: cursoCentral.id }),
    Estudiante.create({ nombres: 'Marta', apellidos: 'Quinonez', qr: 'QR-MARTA-004', cursoId: cursoNorte.id }),
  ]);

  // 4 periodos de 10 semanas aprox por colegio
  const periodosBase = [
    { nombre: 'P1', fechaInicio: '2025-02-03', fechaFin: '2025-04-11' },
    { nombre: 'P2', fechaInicio: '2025-04-28', fechaFin: '2025-07-04' },
    { nombre: 'P3', fechaInicio: '2025-07-21', fechaFin: '2025-09-26' },
    { nombre: 'P4', fechaInicio: '2025-10-06', fechaFin: '2025-12-12' },
  ];
  for (const colegio of colegios) {
    for (const p of periodosBase) {
      await Periodo.create({ ...p, schoolId: colegio.id });
    }
  }

  console.log('Seed listo. Admins: admin@central.com / admin@norte.com (pass: admin123)');
}

seed().then(()=> process.exit(0)).catch(e=> { console.error(e); process.exit(1); });
