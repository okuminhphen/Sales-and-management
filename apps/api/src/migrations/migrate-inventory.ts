"use strict";
export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("Inventory", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            branchId: {
                type: Sequelize.INTEGER,
            },
            productSizeId: {
                type: Sequelize.INTEGER,
                references: {
                    model: "ProductSize",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "CASCADE",
            },
            quantity: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
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
        await queryInterface.dropTable("Inventory");
    },
};
