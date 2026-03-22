'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [asistenciaTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'asistencia'");
    if (!Array.isArray(asistenciaTables) || asistenciaTables.length === 0) return;

    const [asistenciasTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'asistencias'");
    const hasAsistencias = Array.isArray(asistenciasTables) && asistenciasTables.length > 0;

    if (!hasAsistencias) {
      await queryInterface.renameTable('asistencia', 'asistencias');
      return;
    }

    await queryInterface.sequelize.query(`
      INSERT INTO asistencias (
        id, fecha, presente, school_id, curso_id, estudiante_id, periodo_id, created_at, updated_at
      )
      SELECT
        a.id, a.fecha, a.presente, a.school_id, a.curso_id, a.estudiante_id, a.periodo_id, a.created_at, a.updated_at
      FROM asistencia a
      ON DUPLICATE KEY UPDATE
        presente = VALUES(presente),
        updated_at = VALUES(updated_at)
    `);

    await queryInterface.dropTable('asistencia');
  },

  async down(queryInterface, Sequelize) {
    const [asistenciaTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'asistencia'");
    if (Array.isArray(asistenciaTables) && asistenciaTables.length > 0) return;

    const [asistenciasTables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'asistencias'");
    if (!Array.isArray(asistenciasTables) || asistenciasTables.length === 0) return;

    await queryInterface.createTable('asistencia', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      fecha: { allowNull: false, type: Sequelize.DATEONLY },
      presente: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: true },
      school_id: { allowNull: false, type: Sequelize.INTEGER },
      curso_id: { allowNull: false, type: Sequelize.INTEGER },
      estudiante_id: { allowNull: false, type: Sequelize.INTEGER },
      periodo_id: { allowNull: false, type: Sequelize.INTEGER },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE }
    });

    await queryInterface.sequelize.query(`
      INSERT INTO asistencia (
        id, fecha, presente, school_id, curso_id, estudiante_id, periodo_id, created_at, updated_at
      )
      SELECT
        id, fecha, presente, school_id, curso_id, estudiante_id, periodo_id, created_at, updated_at
      FROM asistencias
    `);
  },
};
