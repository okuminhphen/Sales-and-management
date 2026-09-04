"use strict";
export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("Employee", {
            id: {
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
                type: Sequelize.INTEGER,
            },
            userId: {
                type: Sequelize.INTEGER,
                references: {
                    model: "User",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            branchId: {
                type: Sequelize.INTEGER,
                references: {
                    model: "Branch",
                    key: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            },
            name: {
                type: Sequelize.STRING,
                allowNull: false,
            },
            position: {
                type: Sequelize.STRING, // ví dụ: nhân viên bán hàng, quản lý
            },
            phone: {
                type: Sequelize.STRING,
            },
            email: {
                type: Sequelize.STRING,
            },
            salary: {
                type: Sequelize.DECIMAL(10, 2),
            },
            status: {
                type: Sequelize.ENUM("active", "inactive"),
                defaultValue: "active",
            },
            hiredAt: {
                type: Sequelize.DATE,
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
        await queryInterface.dropTable("Employee");
    },
};
