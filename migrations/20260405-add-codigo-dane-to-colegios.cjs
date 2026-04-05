'use strict';

const INDEX_NAME = 'colegios_codigo_dane_unique';

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('colegios');
    if (!table.codigo_dane) {
      await queryInterface.addColumn('colegios', 'codigo_dane', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }

    const indexes = await queryInterface.showIndex('colegios');
    const hasIndex = indexes.some((idx) => idx?.name === INDEX_NAME);
    if (!hasIndex) {
      await queryInterface.addIndex('colegios', ['codigo_dane'], {
        name: INDEX_NAME,
        unique: true
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('colegios');
    const indexes = await queryInterface.showIndex('colegios');
    const hasIndex = indexes.some((idx) => idx?.name === INDEX_NAME);
    if (hasIndex) {
      await queryInterface.removeIndex('colegios', INDEX_NAME);
    }
    if (table.codigo_dane) {
      await queryInterface.removeColumn('colegios', 'codigo_dane');
    }
  }
};
