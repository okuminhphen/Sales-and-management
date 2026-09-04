"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("Vouchers", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            code: {
                type: Sequelize.STRING(50),
                unique: true,
                allowNull: false,
            },
            description: {
                type: Sequelize.STRING,
            },
            discount_type: {
                type: Sequelize.ENUM("percent", "fixed"),
                allowNull: false,
            },
            discount_value: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: false,
            },
            min_order_value: {
                type: Sequelize.DECIMAL(10, 2),
                allowNull: true,
            },
            quantity: {
                type: Sequelize.INTEGER,
                defaultValue: 1,
            },
            expires_at: {
                type: Sequelize.DATE,
                allowNull: true,
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
        await queryInterface.dropTable("Vouchers");
    },
};
