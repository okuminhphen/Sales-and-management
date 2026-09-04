"use strict";

"use strict";

export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.changeColumn("Banner", "image", {
            type: Sequelize.JSON,
            allowNull: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn("Banner", "image", {
            type: Sequelize.STRING,
            allowNull: true,
        });
    },
};
