'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('colegios', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      nombre: { allowNull: false, type: Sequelize.STRING },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('usuarios', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      nombre: { allowNull: false, type: Sequelize.STRING },
      email: { allowNull: false, unique: true, type: Sequelize.STRING },
      password_hash: { allowNull: false, type: Sequelize.STRING },
      rol: { allowNull: false, type: Sequelize.ENUM('docente', 'admin'), defaultValue: 'docente' },
      school_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'colegios', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('cursos', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      nombre: { allowNull: false, type: Sequelize.STRING },
      school_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'colegios', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('estudiantes', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      nombres: { allowNull: false, type: Sequelize.STRING },
      apellidos: { allowNull: false, type: Sequelize.STRING },
      qr: { allowNull: false, unique: true, type: Sequelize.STRING },
      curso_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'cursos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('periodos', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      nombre: { allowNull: false, type: Sequelize.STRING },
      fecha_inicio: { allowNull: false, type: Sequelize.DATEONLY },
      fecha_fin: { allowNull: false, type: Sequelize.DATEONLY },
      school_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'colegios', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.createTable('asistencias', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      fecha: { allowNull: false, type: Sequelize.DATEONLY },
      presente: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: true },
      school_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'colegios', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      curso_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'cursos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      estudiante_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'estudiantes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      periodo_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'periodos', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });

    await queryInterface.addConstraint('asistencias', {
      type: 'unique',
      name: 'asistencias_fecha_estudiante_curso_school_unique',
      fields: ['fecha', 'estudiante_id', 'curso_id', 'school_id'],
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('asistencias', 'asistencias_fecha_estudiante_curso_school_unique');
    await queryInterface.dropTable('asistencias');
    await queryInterface.dropTable('periodos');
    await queryInterface.dropTable('estudiantes');
    await queryInterface.dropTable('cursos');
    await queryInterface.dropTable('usuarios');
    await queryInterface.dropTable('colegios');
  },
};
