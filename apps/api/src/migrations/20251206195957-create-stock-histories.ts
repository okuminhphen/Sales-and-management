"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("stockHistories", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            stockRequestId: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            action: {
                type: Sequelize.STRING, // REQUESTED, APPROVED, REJECTED, TRANSFERRED, RECEIVED
                allowNull: false,
            },
            performedBy: {
                type: Sequelize.INTEGER, // admin/manager id
            },
            note: {
                type: Sequelize.STRING,
            },
            createdAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
            updatedAt: {
                allowNull: false,
                type: Sequelize.DATE,
            },
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.dropTable("stockHistories");
    },
};
