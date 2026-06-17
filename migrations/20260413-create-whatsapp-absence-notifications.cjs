'use strict';

const TABLE_ACUDIENTES = 'acudientes';
const TABLE_NOTIFICACIONES = 'notificaciones_whatsapp';

const normalizeTables = (tables = []) => tables.map((item) => (
  typeof item === 'string' ? item : item.tableName || item.table_name || item.name
));

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = normalizeTables(await queryInterface.showAllTables());

    if (!tables.includes(TABLE_ACUDIENTES)) {
      await queryInterface.createTable(TABLE_ACUDIENTES, {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        estudiante_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: 'estudiantes', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        nombre: { allowNull: false, type: Sequelize.STRING(120) },
        telefono_e164: { allowNull: false, type: Sequelize.STRING(30) },
        whatsapp_opt_in: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: false },
        parentesco: { allowNull: true, type: Sequelize.STRING(60) },
        activo: { allowNull: false, type: Sequelize.BOOLEAN, defaultValue: true },
        created_at: { allowNull: false, type: Sequelize.DATE },
        updated_at: { allowNull: false, type: Sequelize.DATE }
      });
    }

    const acudienteIndexes = await queryInterface.showIndex(TABLE_ACUDIENTES);
    if (!acudienteIndexes.some((item) => (item.name || item.Key_name) === 'acudientes_estudiante_telefono_unique')) {
      await queryInterface.addConstraint(TABLE_ACUDIENTES, {
        type: 'unique',
        name: 'acudientes_estudiante_telefono_unique',
        fields: ['estudiante_id', 'telefono_e164']
      });
    }

    const refreshedTables = normalizeTables(await queryInterface.showAllTables());
    if (!refreshedTables.includes(TABLE_NOTIFICACIONES)) {
      await queryInterface.createTable(TABLE_NOTIFICACIONES, {
        id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
        asistencia_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: 'asistencias', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        acudiente_id: {
          allowNull: false,
          type: Sequelize.INTEGER,
          references: { model: TABLE_ACUDIENTES, key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        template: { allowNull: false, type: Sequelize.STRING(120) },
        payload: { allowNull: false, type: Sequelize.JSON },
        status: { allowNull: false, type: Sequelize.ENUM('pending', 'sent', 'failed'), defaultValue: 'pending' },
        provider_message_id: { allowNull: true, type: Sequelize.STRING(180) },
        error: { allowNull: true, type: Sequelize.TEXT },
        attempts: { allowNull: false, type: Sequelize.INTEGER, defaultValue: 0 },
        sent_at: { allowNull: true, type: Sequelize.DATE },
        created_at: { allowNull: false, type: Sequelize.DATE },
        updated_at: { allowNull: false, type: Sequelize.DATE }
      });
    }

    const notificacionIndexes = await queryInterface.showIndex(TABLE_NOTIFICACIONES);
    if (!notificacionIndexes.some((item) => (item.name || item.Key_name) === 'notificaciones_whatsapp_idempotency_unique')) {
      await queryInterface.addConstraint(TABLE_NOTIFICACIONES, {
        type: 'unique',
        name: 'notificaciones_whatsapp_idempotency_unique',
        fields: ['asistencia_id', 'acudiente_id', 'template']
      });
    }
  },

  async down(queryInterface) {
    const tables = normalizeTables(await queryInterface.showAllTables());

    if (tables.includes(TABLE_NOTIFICACIONES)) {
      await queryInterface.dropTable(TABLE_NOTIFICACIONES);
    }

    if (tables.includes(TABLE_ACUDIENTES)) {
      await queryInterface.dropTable(TABLE_ACUDIENTES);
    }
  }
};
