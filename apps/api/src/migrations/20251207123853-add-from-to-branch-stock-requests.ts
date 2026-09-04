"use strict";

export default {
    async up(queryInterface, Sequelize) {
        // thêm fromBranchId
        await queryInterface.addColumn("StockRequests", "fromBranchId", {
            type: Sequelize.INTEGER,
            allowNull: false,
        });

        // thêm toBranchId
        await queryInterface.addColumn("StockRequests", "toBranchId", {
            type: Sequelize.INTEGER,
            allowNull: false,
        });

        // xoá branchId
        await queryInterface.removeColumn("StockRequests", "branchId");
    },

    async down(queryInterface, Sequelize) {
        // rollback — thêm lại branchId
        await queryInterface.addColumn("StockRequests", "branchId", {
            type: Sequelize.INTEGER,
            allowNull: false,
        });

        // rollback — xoá 2 cột mới
        await queryInterface.removeColumn("StockRequests", "fromBranchId");
        await queryInterface.removeColumn("StockRequests", "toBranchId");
    },
};

