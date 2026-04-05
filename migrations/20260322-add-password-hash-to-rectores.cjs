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
    if (table.password_hash) return;
    await queryInterface.addColumn('rectores', 'password_hash', {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface, 'rectores'))) return;
    const table = await queryInterface.describeTable('rectores');
    if (!table.password_hash) return;
    await queryInterface.removeColumn('rectores', 'password_hash');
  },
};
