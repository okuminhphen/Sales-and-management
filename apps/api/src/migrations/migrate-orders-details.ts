"use strict";
export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("OrdersDetails", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            orderId: {
                type: Sequelize.INTEGER,
            },
            productId: {
                type: Sequelize.INTEGER,
            },
            productName: {
                type: Sequelize.STRING,
            },
            productImage: {
                type: Sequelize.JSON,
            },
            productSize: {
                type: Sequelize.STRING,
            },
            quantity: {
                type: Sequelize.INTEGER,
            },
            priceAtOrder: {
                type: Sequelize.FLOAT,
            },
            totalPrice: {
                type: Sequelize.FLOAT,
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
        await queryInterface.dropTable("OrdersDetails");
    },
};
