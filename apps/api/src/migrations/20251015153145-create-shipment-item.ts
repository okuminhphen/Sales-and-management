"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("ShipmentItem", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            shipmentId: {
                type: Sequelize.INTEGER,
                references: { model: "Shipment", key: "id" },
                onDelete: "CASCADE",
            },
            transferReceiptId: {
                type: Sequelize.INTEGER,
                references: { model: "TransferReceipt", key: "id" },
                onDelete: "CASCADE",
            },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE },
        });
    },

    async down(queryInterface, Sequelize) {
        /**
         * Add reverting commands here.
         *
         * Example:
         * await queryInterface.dropTable('users');
         */
        await queryInterface.dropTable("ShipmentItem");
    },
};

