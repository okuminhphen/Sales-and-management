"use strict";

export default {
    async up(queryInterface, Sequelize) {
        // 1️⃣ Thêm cột code
        await queryInterface.addColumn("orders", "code", {
            type: Sequelize.STRING,
            allowNull: true,
        });

        // 2️⃣ Thêm cột branchId
        await queryInterface.addColumn("orders", "branchId", {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
                model: "branch", // ⚠️ Kiểm tra lại đúng tên bảng trong DB (thường là số nhiều)
                key: "id",
            },
            onUpdate: "CASCADE",
            onDelete: "SET NULL",
        });

        // 3️⃣ Sinh code duy nhất cho từng đơn hàng hiện có
        const [orders] = await queryInterface.sequelize.query(
            `SELECT id FROM orders;`
        );

        for (const order of orders) {
            const code = `ORD-${String(order.id).padStart(6, "0")}`;
            await queryInterface.sequelize.query(`
        UPDATE orders SET code = '${code}' WHERE id = ${order.id};
      `);
        }

        // 4️⃣ Đổi lại cột code -> NOT NULL + UNIQUE
        await queryInterface.changeColumn("orders", "code", {
            type: Sequelize.STRING,
            allowNull: false,
            unique: true,
        });
    },

    async down(queryInterface, Sequelize) {
        await queryInterface.removeColumn("orders", "branchId");
        await queryInterface.removeColumn("orders", "code");
    },
};
