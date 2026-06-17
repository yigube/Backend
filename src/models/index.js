// Modelos Sequelize y relaciones del dominio de asistencias multi-colegio.
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Colegio extends Model {}
Colegio.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  codigoDane: { type: DataTypes.STRING, allowNull: true, unique: true }
}, { sequelize, modelName: 'colegio' });

export class Sede extends Model {}
Sede.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  sequelize,
  modelName: 'sede',
  tableName: 'sedes',
  indexes: [{ unique: true, fields: ['school_id', 'nombre'] }]
});

export class Rector extends Model {}
Rector.init({
  schoolId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  cargo: { type: DataTypes.ENUM('rector', 'coordinador'), allowNull: false, defaultValue: 'rector' },
  nombre: { type: DataTypes.STRING, allowNull: true },
  apellido: { type: DataTypes.STRING, allowNull: true },
  correo: { type: DataTypes.STRING, allowNull: true, unique: true },
  telefono: { type: DataTypes.STRING, allowNull: true, unique: true },
  cedula: { type: DataTypes.STRING, allowNull: true, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: true },
  mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, { sequelize, modelName: 'rector', tableName: 'rectores' });

export class Usuario extends Model {}
Usuario.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  rol: { type: DataTypes.ENUM('docente', 'admin', 'rector', 'coordinador'), allowNull: false, defaultValue: 'docente' },
  schoolId: { type: DataTypes.INTEGER, allowNull: true },
  sedeId: { type: DataTypes.INTEGER, allowNull: true },
  nivel: { type: DataTypes.ENUM('primaria', 'secundaria'), allowNull: true }
}, { sequelize, modelName: 'usuario' });

export class Curso extends Model {}
Curso.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false },
  sedeId: { type: DataTypes.INTEGER, allowNull: true },
  nivel: { type: DataTypes.ENUM('primaria', 'secundaria'), allowNull: true }
}, { sequelize, modelName: 'curso' });

export class CursoDocente extends Model {}
CursoDocente.init({
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, { sequelize, modelName: 'curso_docente' });

export class Materia extends Model {}
Materia.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  sequelize,
  modelName: 'materia',
  tableName: 'materias',
  indexes: [{ unique: true, fields: ['school_id', 'nombre'] }]
});

export class DocenteCursoMateria extends Model {}
DocenteCursoMateria.init({
  id: { type: DataTypes.INTEGER, allowNull: false, autoIncrement: true, primaryKey: true },
  usuarioId: { type: DataTypes.INTEGER, allowNull: false },
  cursoId: { type: DataTypes.INTEGER, allowNull: false },
  materiaId: { type: DataTypes.INTEGER, allowNull: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  sequelize,
  modelName: 'docente_curso_materia',
  tableName: 'docente_curso_materias',
  indexes: [{ unique: true, fields: ['usuario_id', 'curso_id', 'materia_id', 'school_id'] }]
});

export class Estudiante extends Model {}
Estudiante.init({
  nombres: { type: DataTypes.STRING, allowNull: false },
  apellidos: { type: DataTypes.STRING, allowNull: false },
  codigoEstudiante: { type: DataTypes.STRING, allowNull: true, unique: true },
  qr: { type: DataTypes.STRING, allowNull: false, unique: true }
}, { sequelize, modelName: 'estudiante' });

export class Acudiente extends Model {}
Acudiente.init({
  estudianteId: { type: DataTypes.INTEGER, allowNull: false },
  nombre: { type: DataTypes.STRING, allowNull: false },
  telefonoE164: { type: DataTypes.STRING(30), allowNull: false },
  whatsappOptIn: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  parentesco: { type: DataTypes.STRING(60), allowNull: true },
  activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  sequelize,
  modelName: 'acudiente',
  tableName: 'acudientes',
  indexes: [{ unique: true, fields: ['estudiante_id', 'telefono_e164'] }]
});

export class EstudianteMateria extends Model {}
EstudianteMateria.init({
  id: { type: DataTypes.INTEGER, allowNull: false, autoIncrement: true, primaryKey: true },
  estudianteId: { type: DataTypes.INTEGER, allowNull: false },
  cursoId: { type: DataTypes.INTEGER, allowNull: false },
  materiaId: { type: DataTypes.INTEGER, allowNull: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  sequelize,
  modelName: 'estudiante_materia',
  tableName: 'estudiante_materias',
  indexes: [{ unique: true, fields: ['estudiante_id', 'curso_id', 'materia_id', 'school_id'] }]
});

export class Periodo extends Model {}
Periodo.init({
  nombre: { type: DataTypes.STRING, allowNull: false }, // Ej. 'P1'
  fechaInicio: { type: DataTypes.DATE, allowNull: false },
  fechaFin: { type: DataTypes.DATE, allowNull: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, { sequelize, modelName: 'periodo' });

export class Asistencia extends Model {}
Asistencia.init({
  fecha: { type: DataTypes.DATEONLY, allowNull: false },
  horaRegistro: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  clientRequestId: { type: DataTypes.STRING(120), allowNull: true, unique: true },
  materiaId: { type: DataTypes.INTEGER, allowNull: true },
  estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'presente' },
  presente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  tarde: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  afuera: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  ausente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, { sequelize, modelName: 'asistencia', tableName: 'asistencias', indexes: [{ unique: true, fields: ['fecha','estudiante_id','curso_id','school_id','materia_id'] }] });

export class NotificacionWhatsApp extends Model {}
NotificacionWhatsApp.init({
  asistenciaId: { type: DataTypes.INTEGER, allowNull: false },
  acudienteId: { type: DataTypes.INTEGER, allowNull: false },
  template: { type: DataTypes.STRING(120), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'sent', 'failed'), allowNull: false, defaultValue: 'pending' },
  providerMessageId: { type: DataTypes.STRING(180), allowNull: true },
  error: { type: DataTypes.TEXT, allowNull: true },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sentAt: { type: DataTypes.DATE, allowNull: true }
}, {
  sequelize,
  modelName: 'notificacion_whatsapp',
  tableName: 'notificaciones_whatsapp',
  indexes: [{ unique: true, fields: ['asistencia_id', 'acudiente_id', 'template'] }]
});

// Associations
Colegio.hasMany(Usuario, { foreignKey: { allowNull: true, name: 'schoolId' } });
Usuario.belongsTo(Colegio, { foreignKey: { allowNull: true, name: 'schoolId' } });
Colegio.hasOne(Rector, { as: 'rector', foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });
Rector.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });

Colegio.hasMany(Sede, { as: 'sedes', foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });
Sede.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });

Colegio.hasMany(Curso, { foreignKey: { allowNull: false, name: 'schoolId' } });
Curso.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });
Sede.hasMany(Curso, { as: 'cursos', foreignKey: { allowNull: true, name: 'sedeId' }, onDelete: 'SET NULL' });
Curso.belongsTo(Sede, { as: 'sede', foreignKey: { allowNull: true, name: 'sedeId' }, onDelete: 'SET NULL' });

Curso.belongsToMany(Usuario, { through: CursoDocente, as: 'docentes' });
Usuario.belongsToMany(Curso, { through: CursoDocente, as: 'cursos' });
Sede.hasMany(Usuario, { as: 'docentes', foreignKey: { allowNull: true, name: 'sedeId' }, onDelete: 'SET NULL' });
Usuario.belongsTo(Sede, { as: 'sede', foreignKey: { allowNull: true, name: 'sedeId' }, onDelete: 'SET NULL' });

Colegio.hasMany(Materia, { foreignKey: { allowNull: false, name: 'schoolId' } });
Materia.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

Curso.hasMany(DocenteCursoMateria, { foreignKey: { allowNull: false, name: 'cursoId' } });
Usuario.hasMany(DocenteCursoMateria, { foreignKey: { allowNull: false, name: 'usuarioId' } });
Materia.hasMany(DocenteCursoMateria, { foreignKey: { allowNull: false, name: 'materiaId' } });
Colegio.hasMany(DocenteCursoMateria, { foreignKey: { allowNull: false, name: 'schoolId' } });
DocenteCursoMateria.belongsTo(Curso, { foreignKey: { allowNull: false, name: 'cursoId' } });
DocenteCursoMateria.belongsTo(Usuario, { foreignKey: { allowNull: false, name: 'usuarioId' } });
DocenteCursoMateria.belongsTo(Materia, { as: 'materia', foreignKey: { allowNull: false, name: 'materiaId' } });
DocenteCursoMateria.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

Colegio.hasMany(Periodo, { foreignKey: { allowNull: false, name: 'schoolId' } });
Periodo.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

Curso.hasMany(Estudiante, { foreignKey: { allowNull: false } });
Estudiante.belongsTo(Curso);

Estudiante.hasMany(Acudiente, { as: 'acudientes', foreignKey: { allowNull: false, name: 'estudianteId' }, onDelete: 'CASCADE' });
Acudiente.belongsTo(Estudiante, { foreignKey: { allowNull: false, name: 'estudianteId' }, onDelete: 'CASCADE' });

Curso.hasMany(EstudianteMateria, { foreignKey: { allowNull: false, name: 'cursoId' }, onDelete: 'CASCADE' });
Estudiante.hasMany(EstudianteMateria, { foreignKey: { allowNull: false, name: 'estudianteId' }, onDelete: 'CASCADE' });
Materia.hasMany(EstudianteMateria, { foreignKey: { allowNull: false, name: 'materiaId' }, onDelete: 'CASCADE' });
Colegio.hasMany(EstudianteMateria, { foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });
EstudianteMateria.belongsTo(Curso, { foreignKey: { allowNull: false, name: 'cursoId' }, onDelete: 'CASCADE' });
EstudianteMateria.belongsTo(Estudiante, { foreignKey: { allowNull: false, name: 'estudianteId' }, onDelete: 'CASCADE' });
EstudianteMateria.belongsTo(Materia, { as: 'materia', foreignKey: { allowNull: false, name: 'materiaId' }, onDelete: 'CASCADE' });
EstudianteMateria.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });

Curso.hasMany(Asistencia, { foreignKey: { allowNull: false } });
Asistencia.belongsTo(Curso);

Estudiante.hasMany(Asistencia, { foreignKey: { allowNull: false } });
Asistencia.belongsTo(Estudiante);

Periodo.hasMany(Asistencia, { foreignKey: { allowNull: false } });
Asistencia.belongsTo(Periodo);

Colegio.hasMany(Asistencia, { foreignKey: { allowNull: false, name: 'schoolId' } });
Asistencia.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

Materia.hasMany(Asistencia, { foreignKey: { allowNull: true, name: 'materiaId' } });
Asistencia.belongsTo(Materia, { as: 'materia', foreignKey: { allowNull: true, name: 'materiaId' } });

Asistencia.hasMany(NotificacionWhatsApp, { as: 'notificacionesWhatsApp', foreignKey: { allowNull: false, name: 'asistenciaId' }, onDelete: 'CASCADE' });
NotificacionWhatsApp.belongsTo(Asistencia, { foreignKey: { allowNull: false, name: 'asistenciaId' }, onDelete: 'CASCADE' });
Acudiente.hasMany(NotificacionWhatsApp, { as: 'notificacionesWhatsApp', foreignKey: { allowNull: false, name: 'acudienteId' }, onDelete: 'CASCADE' });
NotificacionWhatsApp.belongsTo(Acudiente, { as: 'acudiente', foreignKey: { allowNull: false, name: 'acudienteId' }, onDelete: 'CASCADE' });

export default {
  Colegio,
  Sede,
  Rector,
  Usuario,
  Curso,
  CursoDocente,
  Materia,
  DocenteCursoMateria,
  Estudiante,
  Acudiente,
  EstudianteMateria,
  Periodo,
  Asistencia,
  NotificacionWhatsApp,
  sequelize
};
