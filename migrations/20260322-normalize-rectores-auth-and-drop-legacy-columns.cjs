'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('rectores');
    if (table.correo) {
      // Normaliza correo para evitar duplicados por mayusculas/espacios.
      await queryInterface.sequelize.query(`
        UPDATE rectores
        SET correo = LOWER(TRIM(correo))
        WHERE correo IS NOT NULL
      `);

      const [duplicates] = await queryInterface.sequelize.query(`
        SELECT correo, COUNT(*) AS total
        FROM rectores
        WHERE correo IS NOT NULL AND correo <> ''
        GROUP BY correo
        HAVING COUNT(*) > 1
      `);

      if (Array.isArray(duplicates) && duplicates.length > 0) {
        throw new Error(`No se puede aplicar unique en rectores.correo: hay correos duplicados (${duplicates.map((d) => d.correo).join(', ')})`);
      }

      await queryInterface.addConstraint('rectores', {
        fields: ['correo'],
        type: 'unique',
        name: 'rectores_correo_unique'
      });
    }

    const colegios = await queryInterface.describeTable('colegios');
    const legacyColumns = ['rector_nombre', 'rector_apellido', 'rector_correo', 'rector_telefono', 'rector_cedula'];
    for (const column of legacyColumns) {
      if (colegios[column]) {
        await queryInterface.removeColumn('colegios', column);
      }
    }
  },

  async down(queryInterface, Sequelize) {
    const colegios = await queryInterface.describeTable('colegios');
    if (!colegios.rector_nombre) {
      await queryInterface.addColumn('colegios', 'rector_nombre', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_apellido) {
      await queryInterface.addColumn('colegios', 'rector_apellido', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_correo) {
      await queryInterface.addColumn('colegios', 'rector_correo', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_telefono) {
      await queryInterface.addColumn('colegios', 'rector_telefono', { type: Sequelize.STRING, allowNull: true });
    }
    if (!colegios.rector_cedula) {
      await queryInterface.addColumn('colegios', 'rector_cedula', { type: Sequelize.STRING, allowNull: true });
    }

    const rectores = await queryInterface.describeTable('rectores');
    if (rectores.correo) {
      await queryInterface.removeConstraint('rectores', 'rectores_correo_unique');
    }
  },
};

