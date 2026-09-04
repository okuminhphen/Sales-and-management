"use strict";

export default {
    async up(queryInterface, Sequelize) {
        /**
         * Add altering commands here.
         *
         * Example:
         * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
         */
        await queryInterface.createTable("TransferReceiptItem", {
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
            productSizeId: {
                type: Sequelize.INTEGER,
                references: { model: "ProductSize", key: "id" },
                onDelete: "SET NULL",
            },
            quantity: { type: Sequelize.INTEGER, allowNull: false },
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
        await queryInterface.dropTable("TransferReceiptItem");
    },
};

