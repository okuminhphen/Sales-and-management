"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("ShipmentTracking", {
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
            latitude: { type: Sequelize.DECIMAL(10, 7) },
            longitude: { type: Sequelize.DECIMAL(10, 7) },
            status: {
                type: Sequelize.ENUM(
                    "departed",
                    "on_route",
                    "delayed",
                    "arrived"
                ),
                defaultValue: "on_route",
            },
            recordedAt: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
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
        await queryInterface.dropTable("ShipmentTracking");
    },
};

