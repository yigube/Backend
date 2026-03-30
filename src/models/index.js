// Modelos Sequelize y relaciones del dominio de asistencias multi-colegio.
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Colegio extends Model {}
Colegio.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  codigoDane: { type: DataTypes.STRING, allowNull: true, unique: true }
}, { sequelize, modelName: 'colegio' });

export class Rector extends Model {}
Rector.init({
  schoolId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  cargo: { type: DataTypes.ENUM('rector', 'coordinador'), allowNull: false, defaultValue: 'rector' },
  nombre: { type: DataTypes.STRING, allowNull: true },
  apellido: { type: DataTypes.STRING, allowNull: true },
  correo: { type: DataTypes.STRING, allowNull: true, unique: true },
  telefono: { type: DataTypes.STRING, allowNull: true, unique: true },
  cedula: { type: DataTypes.STRING, allowNull: true, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: true }
}, { sequelize, modelName: 'rector', tableName: 'rectores' });

export class Usuario extends Model {}
Usuario.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  rol: { type: DataTypes.ENUM('docente', 'admin', 'rector', 'coordinador'), allowNull: false, defaultValue: 'docente' },
  schoolId: { type: DataTypes.INTEGER, allowNull: true }
}, { sequelize, modelName: 'usuario' });

export class Curso extends Model {}
Curso.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
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
  estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'presente' },
  presente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  tarde: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  afuera: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  ausente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, { sequelize, modelName: 'asistencia', tableName: 'asistencias', indexes: [{ unique: true, fields: ['fecha','estudiante_id','curso_id','school_id'] }] });

// Associations
Colegio.hasMany(Usuario, { foreignKey: { allowNull: true, name: 'schoolId' } });
Usuario.belongsTo(Colegio, { foreignKey: { allowNull: true, name: 'schoolId' } });
Colegio.hasOne(Rector, { as: 'rector', foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });
Rector.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' }, onDelete: 'CASCADE' });

Colegio.hasMany(Curso, { foreignKey: { allowNull: false, name: 'schoolId' } });
Curso.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

Curso.belongsToMany(Usuario, { through: CursoDocente, as: 'docentes' });
Usuario.belongsToMany(Curso, { through: CursoDocente, as: 'cursos' });

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

Curso.hasMany(Asistencia, { foreignKey: { allowNull: false } });
Asistencia.belongsTo(Curso);

Estudiante.hasMany(Asistencia, { foreignKey: { allowNull: false } });
Asistencia.belongsTo(Estudiante);

Periodo.hasMany(Asistencia, { foreignKey: { allowNull: false } });
Asistencia.belongsTo(Periodo);

Colegio.hasMany(Asistencia, { foreignKey: { allowNull: false, name: 'schoolId' } });
Asistencia.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

export default {
  Colegio,
  Rector,
  Usuario,
  Curso,
  CursoDocente,
  Materia,
  DocenteCursoMateria,
  Estudiante,
  Periodo,
  Asistencia,
  sequelize
};
