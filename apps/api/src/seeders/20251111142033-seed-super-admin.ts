"use strict";
import bcrypt from "bcryptjs";

export default {
    async up(queryInterface, Sequelize) {
        const email = process.env.SUPER_ADMIN_EMAIL;
        const password = process.env.SUPER_ADMIN_PASSWORD;
        if (!email || !password) {
            throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required");
        }
        // 1. Tạo role SUPER_ADMIN nếu chưa có
        const [role] = await queryInterface.sequelize.query(
            `SELECT id FROM Role WHERE name='SUPER_ADMIN' LIMIT 1;`
        );

        let roleId;
        if (role.length > 0) {
            roleId = role[0].id;
        } else {
            await queryInterface.bulkInsert("Role", [
                {
                    name: "SUPER_ADMIN",
                    description: "Admin tổng hệ thống",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ]);

            // Lấy lại id mới insert
            const [newRole] = await queryInterface.sequelize.query(
                `SELECT id FROM Role WHERE name='SUPER_ADMIN' LIMIT 1;`
            );
            roleId = newRole[0].id;
        }

        // 2. Seeder có thể chạy lặp lại an toàn trên cùng môi trường.
        const [existingAdmins] = await queryInterface.sequelize.query(
            `SELECT id FROM Admins WHERE email = :email LIMIT 1;`,
            { replacements: { email } }
        );
        if (existingAdmins.length > 0) return;

        const salt = bcrypt.genSaltSync(10);
        const hashPassword = bcrypt.hashSync(password, salt);

        // 3. Thêm admin mặc định
        await queryInterface.bulkInsert("Admins", [
            {
                fullname: "Admin Tổng",
                username: "admin",
                email,
                password: hashPassword,
                phone: "0962511569",
                roleId: roleId,
                status: "ACTIVE",
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        ]);
    },

    async down(queryInterface, Sequelize) {
        const email = process.env.SUPER_ADMIN_EMAIL;
        if (email) await queryInterface.bulkDelete("Admins", { email }, {});
        await queryInterface.bulkDelete("Role", { name: "SUPER_ADMIN" }, {});
    },
};
