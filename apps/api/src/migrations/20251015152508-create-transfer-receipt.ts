"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("TransferReceipt", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            code: {
                type: Sequelize.STRING,
                allowNull: false,
                unique: true,
            },
            fromBranchId: {
                type: Sequelize.INTEGER,
                references: { model: "Branch", key: "id" },
                onDelete: "SET NULL",
                onUpdate: "CASCADE",
            },
            toBranchId: {
                type: Sequelize.INTEGER,
                references: { model: "Branch", key: "id" },
                onDelete: "SET NULL",
                onUpdate: "CASCADE",
            },
            createdBy: {
                type: Sequelize.INTEGER,
                references: { model: "Employee", key: "id" },
                onDelete: "SET NULL",
            },
            approvedBy: {
                type: Sequelize.INTEGER,
                references: { model: "Employee", key: "id" },
                onDelete: "SET NULL",
            },
            status: {
                type: Sequelize.ENUM(
                    "pending",
                    "approved",
                    "shipped",
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
        await queryInterface.dropTable("TransferReceipt");
    },
};

