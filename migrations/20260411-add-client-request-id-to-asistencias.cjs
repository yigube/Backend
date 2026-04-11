'use strict';

const CLIENT_REQUEST_ID_COLUMN = 'client_request_id';
const CLIENT_REQUEST_ID_INDEX = 'asistencias_client_request_id_unique';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('asistencias');

    if (!table[CLIENT_REQUEST_ID_COLUMN]) {
      await queryInterface.addColumn('asistencias', CLIENT_REQUEST_ID_COLUMN, {
        type: Sequelize.STRING(120),
        allowNull: true
      });
    }

    const indexes = await queryInterface.showIndex('asistencias');
    const hasUnique = indexes.some((index) => {
      const indexName = index.name || index.Key_name;
      const fields = Array.isArray(index?.fields)
        ? index.fields.map((field) => field.attribute || field.name || field)
        : [];
      return (
        indexName === CLIENT_REQUEST_ID_INDEX
        || (index.unique && fields.length === 1 && String(fields[0]) === CLIENT_REQUEST_ID_COLUMN)
      );
    });

    if (!hasUnique) {
      await queryInterface.addIndex('asistencias', [CLIENT_REQUEST_ID_COLUMN], {
        unique: true,
        name: CLIENT_REQUEST_ID_INDEX
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('asistencias');
    if (!table[CLIENT_REQUEST_ID_COLUMN]) return;

    const indexes = await queryInterface.showIndex('asistencias');
    const targetIndex = indexes.find((index) => {
      const indexName = index.name || index.Key_name;
      const fields = Array.isArray(index?.fields)
        ? index.fields.map((field) => field.attribute || field.name || field)
        : [];
      return (
        indexName === CLIENT_REQUEST_ID_INDEX
        || (index.unique && fields.length === 1 && String(fields[0]) === CLIENT_REQUEST_ID_COLUMN)
      );
    });

    if (targetIndex) {
      await queryInterface.removeIndex('asistencias', targetIndex.name || targetIndex.Key_name);
    }

    await queryInterface.removeColumn('asistencias', CLIENT_REQUEST_ID_COLUMN);
  }
};

