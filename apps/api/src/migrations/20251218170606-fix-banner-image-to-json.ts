"use strict";

export default {
    async up(queryInterface, Sequelize) {
        // ⚠️ ĐÚNG TÊN BẢNG TRONG DB
        await queryInterface.changeColumn("Banner", "image", {
            type: Sequelize.JSON,
            allowNull: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn("Banner", "image", {
            type: Sequelize.TEXT("long"),
            allowNull: true,
        });
    },
};

