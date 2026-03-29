'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'mysql') return;

    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS cleanup_orphan_materias_after_docente_delete');
    await queryInterface.sequelize.query(`
      CREATE TRIGGER cleanup_orphan_materias_after_docente_delete
      AFTER DELETE ON usuarios
      FOR EACH ROW
      BEGIN
        IF OLD.rol = 'docente' THEN
          DELETE FROM materias
          WHERE school_id = OLD.school_id
            AND NOT EXISTS (
              SELECT 1
              FROM docente_curso_materias
              WHERE docente_curso_materias.materia_id = materias.id
              LIMIT 1
            );
        END IF;
      END
    `);
  },

  async down(queryInterface) {
    if (queryInterface.sequelize.getDialect() !== 'mysql') return;
    await queryInterface.sequelize.query('DROP TRIGGER IF EXISTS cleanup_orphan_materias_after_docente_delete');
  }
};
