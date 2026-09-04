"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("Shipment", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            code: { type: Sequelize.STRING, allowNull: false, unique: true },
            vehicleId: {
                type: Sequelize.INTEGER,
                references: { model: "Vehicle", key: "id" },
                onDelete: "SET NULL",
            },
            driverId: {
                type: Sequelize.INTEGER,
                references: { model: "Driver", key: "id" },
                onDelete: "SET NULL",
            },
            departureBranchId: {
                type: Sequelize.INTEGER,
                references: { model: "Branch", key: "id" },
                onDelete: "SET NULL",
            },
            arrivalBranchId: {
                type: Sequelize.INTEGER,
                references: { model: "Branch", key: "id" },
                onDelete: "SET NULL",
            },
            departureTime: { type: Sequelize.DATE },
            arrivalTime: { type: Sequelize.DATE },
            status: {
                type: Sequelize.ENUM(
                    "pending",
                    "in_transit",
                    "arrived",
                    "completed",
                    "cancelled"
                ),
                defaultValue: "pending",
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
        await queryInterface.dropTable("Shipment");
    },
};
