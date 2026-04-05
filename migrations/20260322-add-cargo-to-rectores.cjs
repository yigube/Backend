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
    if (!(await tableExists(queryInterface, 'rectores'))) return;
    const table = await queryInterface.describeTable('rectores');
    if (!table.cargo) {
      await queryInterface.addColumn('rectores', 'cargo', {
        type: Sequelize.ENUM('rector', 'coordinador'),
        allowNull: false,
        defaultValue: 'rector'
      });
    }
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'rectores'))) return;
    const table = await queryInterface.describeTable('rectores');
    if (table.cargo) {
      await queryInterface.removeColumn('rectores', 'cargo');
    }
  },
};
