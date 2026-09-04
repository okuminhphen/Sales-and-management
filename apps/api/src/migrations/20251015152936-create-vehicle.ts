"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("Vehicle", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            code: { type: Sequelize.STRING, allowNull: false, unique: true },
            licensePlate: { type: Sequelize.STRING, allowNull: false },
            type: { type: Sequelize.STRING },
            capacity: { type: Sequelize.INTEGER },
            status: {
                type: Sequelize.ENUM("available", "in_use", "maintenance"),
                defaultValue: "available",
            },
            branchId: {
                type: Sequelize.INTEGER,
                references: { model: "branch", key: "id" },
                onDelete: "SET NULL",
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
        await queryInterface.dropTable("Vehicle");
    },
};
