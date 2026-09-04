"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("Admins", "branchId", {
            type: Sequelize.INTEGER,
            allowNull: true, // SUPER_ADMIN có thể null
            references: {
                model: "Branch", // tên bảng Branches
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("Admins", "branchId");
    },
};
