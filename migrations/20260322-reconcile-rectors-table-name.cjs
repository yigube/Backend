'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'rectors'");
    if (!tables || tables.length === 0) return;

    await queryInterface.sequelize.query(`
      INSERT INTO rectores (school_id, nombre, apellido, correo, telefono, cedula, created_at, updated_at)
      SELECT r.school_id, r.nombre, r.apellido, r.correo, r.telefono, r.cedula, NOW(), NOW()
      FROM rectors r
      ON DUPLICATE KEY UPDATE
        nombre = VALUES(nombre),
        apellido = VALUES(apellido),
        correo = VALUES(correo),
        telefono = VALUES(telefono),
        cedula = VALUES(cedula),
        updated_at = NOW()
    `);

    await queryInterface.dropTable('rectors');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.createTable('rectors', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      school_id: { allowNull: false, type: Sequelize.INTEGER, unique: true },
      nombre: { allowNull: true, type: Sequelize.STRING },
      apellido: { allowNull: true, type: Sequelize.STRING },
      correo: { allowNull: true, type: Sequelize.STRING },
      telefono: { allowNull: true, type: Sequelize.STRING },
      cedula: { allowNull: true, type: Sequelize.STRING },
      created_at: { allowNull: false, type: Sequelize.DATE },
      updated_at: { allowNull: false, type: Sequelize.DATE },
    });
  },
};
