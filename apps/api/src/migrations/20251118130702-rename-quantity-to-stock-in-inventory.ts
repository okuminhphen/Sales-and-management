"use strict";

export default {
    async up(queryInterface, Sequelize) {
        // Đổi tên cột quantity -> stock
        return queryInterface.renameColumn("Inventory", "quantity", "stock");
    },

    async down(queryInterface, Sequelize) {
        // Nếu rollback thì đổi ngược lại
        return queryInterface.renameColumn("Inventory", "stock", "quantity");
    },
};
