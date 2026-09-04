"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("orders", "toProvinceId", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });

        await queryInterface.addColumn("orders", "toDistrictId", {
            type: Sequelize.INTEGER,
            allowNull: true,
        });

        await queryInterface.addColumn("orders", "toWardCode", {
            type: Sequelize.STRING,
            allowNull: true,
        });

        await queryInterface.addColumn("orders", "ghnOrderId", {
            type: Sequelize.STRING,
            allowNull: true,
        });

        await queryInterface.addColumn("orders", "shippingFee", {
            type: Sequelize.FLOAT,
            defaultValue: 0,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("orders", "toProvinceId");
        await queryInterface.removeColumn("orders", "toDistrictId");
        await queryInterface.removeColumn("orders", "toWardCode");
        await queryInterface.removeColumn("orders", "ghnOrderId");
        await queryInterface.removeColumn("orders", "shippingFee");
    },
};
