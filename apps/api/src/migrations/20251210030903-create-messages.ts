"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("messages", {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            conversationId: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            senderId: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            senderRole: {
                type: Sequelize.ENUM("user", "admin"),
                allowNull: false,
            },
            message: {
                type: Sequelize.TEXT,
                allowNull: false,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
            },
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("messages");
    },
};

