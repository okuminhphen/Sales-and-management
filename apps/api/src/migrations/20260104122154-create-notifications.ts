"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("notifications", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },

            user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },

            title: {
                type: Sequelize.STRING,
                allowNull: false,
            },

            content: {
                type: Sequelize.STRING,
                allowNull: false,
            },

            type: {
                type: Sequelize.ENUM(
                    "ORDER_NEW",
                    "LOW_STOCK",
                    "STOCK_REQUEST",
                    "TRANSFER_RECEIPT"
                ),
                allowNull: false,
            },

            is_read: {
                type: Sequelize.BOOLEAN,
                defaultValue: false,
            },

            created_at: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable("notifications");
    },
};
