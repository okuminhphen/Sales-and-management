"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("TransferHistory", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            transferReceiptId: {
                type: Sequelize.INTEGER,
                references: { model: "TransferReceipt", key: "id" },
                onDelete: "CASCADE",
            },
            action: { type: Sequelize.STRING, allowNull: false },
            performedBy: {
                type: Sequelize.INTEGER,
                references: { model: "Employee", key: "id" },
                onDelete: "SET NULL",
            },
            note: { type: Sequelize.STRING },
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
        await queryInterface.dropTable("TransferHistory");
    },
};

