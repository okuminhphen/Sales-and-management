"use strict";
export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("Payment", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            orderId: {
                type: Sequelize.INTEGER,
            },
            paymentMethodId: {
                type: Sequelize.INTEGER,
            },
            amount: {
                type: Sequelize.FLOAT,
            },
            transactionId: {
                type: Sequelize.STRING,
            },
            status: {
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
        await queryInterface.dropTable("Payment");
    },
};
