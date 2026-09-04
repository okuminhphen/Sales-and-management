"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("stockRequests", {
            id: {
                type: Sequelize.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            branchId: {
                type: Sequelize.INTEGER,
                allowNull: false,
            },
            status: {
                type: Sequelize.STRING, // pending, approved, rejected
                allowNull: false,
            },
            createdBy: {
                type: Sequelize.INTEGER,
            },
            approvedBy: {
                type: Sequelize.INTEGER,
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
        await queryInterface.dropTable("stockRequests");
    },
};
