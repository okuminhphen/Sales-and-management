import db from "../../models/index.js";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";

const checkPassword = (inputPassword, hashPassword) => {
    return bcrypt.compareSync(inputPassword, hashPassword); // true or false
};

const handleAdminLoginService = async (rawAdminData) => {
    try {
        // Tìm admin theo username
        let admin = await db.Admin.findOne({
            where: { username: rawAdminData.username },
            include: [
                {
                    model: db.Role,
                    as: "role",
                    attributes: ["id", "name"],
                },
            ],
        });

        if (!admin) {
            return {
                EM: "Username or password is incorrect",
                EC: 1,
                DT: "",
            };
        }

        // Kiểm tra mật khẩu
        if (!checkPassword(rawAdminData.password, admin.password)) {
            return {
                EM: "Username or password is incorrect",
                EC: 1,
                DT: "",
            };
        }

        return {
            EM: "Login success",
            EC: 0,
            DT: {
                adminId: admin.id,
                fullname: admin.fullname,
                role: admin.role,
                branchId: admin.branchId,
            },
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something went wrong in service",
            EC: -2,
        };
    }
};

export default {
    handleAdminLoginService,
};
