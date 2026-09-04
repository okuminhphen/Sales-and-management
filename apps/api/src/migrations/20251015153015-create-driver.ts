"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("Driver", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            code: { type: Sequelize.STRING, allowNull: false, unique: true },
            name: { type: Sequelize.STRING, allowNull: false },
            phone: { type: Sequelize.STRING },
            licenseNumber: { type: Sequelize.STRING },
            vehicleId: {
                type: Sequelize.INTEGER,
                references: { model: "Vehicle", key: "id" },
                onDelete: "SET NULL",
            },
            status: {
                type: Sequelize.ENUM("available", "on_trip", "inactive"),
                defaultValue: "available",
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
        await queryInterface.dropTable("Driver");
    },
};
