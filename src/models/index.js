// Modelos Sequelize y relaciones del dominio de asistencias multi-colegio.
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database.js';

export class Colegio extends Model {}
Colegio.init({
  nombre: { type: DataTypes.STRING, allowNull: false }
}, { sequelize, modelName: 'colegio' });

export class Usuario extends Model {}
Usuario.init({
  nombre: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  rol: { type: DataTypes.ENUM('docente', 'admin', 'rector', 'coordinador'), allowNull: false, defaultValue: 'docente' },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
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

export class Estudiante extends Model {}
Estudiante.init({
  nombres: { type: DataTypes.STRING, allowNull: false },
  apellidos: { type: DataTypes.STRING, allowNull: false },
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
  presente: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  schoolId: { type: DataTypes.INTEGER, allowNull: false }
}, { sequelize, modelName: 'asistencia', indexes: [{ unique: true, fields: ['fecha','estudiante_id','curso_id','school_id'] }] });

// Associations
Colegio.hasMany(Usuario, { foreignKey: { allowNull: false, name: 'schoolId' } });
Usuario.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

Colegio.hasMany(Curso, { foreignKey: { allowNull: false, name: 'schoolId' } });
Curso.belongsTo(Colegio, { foreignKey: { allowNull: false, name: 'schoolId' } });

Curso.belongsToMany(Usuario, { through: CursoDocente, as: 'docentes' });
Usuario.belongsToMany(Curso, { through: CursoDocente, as: 'cursos' });

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

export default { Colegio, Usuario, Curso, CursoDocente, Estudiante, Periodo, Asistencia, sequelize };
