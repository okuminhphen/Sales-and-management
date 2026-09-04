"use strict";

export default {
    async up(queryInterface, Sequelize) {
        return queryInterface.addColumn("StockRequests", "code", {
            type: Sequelize.STRING,
            allowNull: true, // ban đầu allow null, sau này xử lý generate code rồi mới set NOT NULL
            unique: true,
        });
    },

    async down(queryInterface, Sequelize) {
        return queryInterface.removeColumn("StockRequests", "code");
    },
};

