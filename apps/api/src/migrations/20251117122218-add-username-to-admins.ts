"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn("Admins", "username", {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("Admins", "username");
    },
};
