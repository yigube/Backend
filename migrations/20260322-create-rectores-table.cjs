'use strict';

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  const normalized = tables.map((item) => (
    typeof item === 'string' ? item : item.tableName || item.table_name || item.name
  ));
  return normalized.includes(tableName);
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'rectores'))) {
      await queryInterface.createTable('rectores', {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        school_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          unique: true,
          references: { model: 'colegios', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        nombre: { allowNull: true, type: Sequelize.STRING },
        apellido: { allowNull: true, type: Sequelize.STRING },
        correo: { allowNull: true, type: Sequelize.STRING },
        telefono: { allowNull: true, type: Sequelize.STRING },
        cedula: { allowNull: true, type: Sequelize.STRING },
        created_at: { allowNull: false, type: Sequelize.DATE },
        updated_at: { allowNull: false, type: Sequelize.DATE },
      });
    }

    const colegios = await queryInterface.describeTable('colegios');
    const legacyColumns = ['rector_nombre', 'rector_apellido', 'rector_correo', 'rector_telefono', 'rector_cedula'];
    const hasLegacyDataColumns = legacyColumns.some((column) => colegios[column]);
    if (!hasLegacyDataColumns) return;

    // Migra datos existentes almacenados en columnas de colegios hacia la nueva relacion 1:1.
    await queryInterface.sequelize.query(`
      INSERT INTO rectores (school_id, nombre, apellido, correo, telefono, cedula, created_at, updated_at)
      SELECT c.id, c.rector_nombre, c.rector_apellido, c.rector_correo, c.rector_telefono, c.rector_cedula, NOW(), NOW()
      FROM colegios c
      WHERE c.rector_nombre IS NOT NULL
         OR c.rector_apellido IS NOT NULL
         OR c.rector_correo IS NOT NULL
         OR c.rector_telefono IS NOT NULL
         OR c.rector_cedula IS NOT NULL
      ON DUPLICATE KEY UPDATE
        nombre = VALUES(nombre),
        apellido = VALUES(apellido),
        correo = VALUES(correo),
        telefono = VALUES(telefono),
        cedula = VALUES(cedula),
        updated_at = NOW()
    `);
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'rectores'))) return;
    await queryInterface.dropTable('rectores');
  },
};
