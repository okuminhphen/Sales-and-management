"use strict";
export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("Orders", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            userId: {
                type: Sequelize.INTEGER,
            },
            orderDate: {
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
            status: {
                type: Sequelize.STRING,
            },
            totalPrice: {
                type: Sequelize.FLOAT,
            },
            customerName: {
                type: Sequelize.STRING,
            },
            customerEmail: {
                type: Sequelize.STRING,
            },
            customerPhone: {
                type: Sequelize.STRING,
            },
            shippingAddress: {
                type: Sequelize.STRING,
            },
            message: {
                type: Sequelize.STRING,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
                defaultValue: Sequelize.NOW,
            },
        });
    },
    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("Orders");
    },
};
