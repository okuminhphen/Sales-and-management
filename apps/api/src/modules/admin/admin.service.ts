import db from "../../models/index.js";
import bcrypt from "bcryptjs";
import { sendEmailTemplate } from "../../infrastructure/mail/email.service.js";

const salt = bcrypt.genSaltSync(10);

const checkPassword = (inputPassword, hashPassword) => {
    return bcrypt.compareSync(inputPassword, hashPassword);
};

// Lấy tất cả admin
const getAllAdmins = async () => {
    try {
        const admins = await db.Admin.findAll({
            include: [
                {
                    model: db.Role,
                    attributes: ["id", "name"],
                    as: "role",
                },
            ],
        });

        const formattedAdmins = admins.map((admin) => ({
            id: admin.id,
            username: admin.username,
            email: admin.email,
            phone: admin.phone,
            fullname: admin.fullname,
            status: admin.status,
            role: admin.role
                ? { id: admin.role.id, name: admin.role.name }
                : null,
            branchId: admin.branchId,
        }));

        return {
            EC: 0,
            EM: "Get all admins successfully",
            DT: formattedAdmins,
        };
    } catch (error) {
        console.log(error);
        return { EC: 1, EM: "Error from server", DT: null };
    }
};

// Lấy admin theo ID
const getAdminById = async (id) => {
    try {
        const admin = await db.Admin.findByPk(id, {
            include: [
                { model: db.Role, attributes: ["id", "name"], as: "role" },
            ],
        });

        if (!admin) return { EC: 1, EM: "Admin not found", DT: null };

        return { EC: 0, EM: "Get admin successfully", DT: admin };
    } catch (error) {
        console.log(error);
        return { EC: 1, EM: "Error from server", DT: null };
    }
};

// Tạo admin mới
const createNewAdmin = async (adminData) => {
    try {
        const existingAdmin = await db.Admin.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { username: adminData.username },
                    { email: adminData.email },
                ],
            },
        });

        if (existingAdmin) {
            return { EC: 1, EM: "Username hoặc email đã tồn tại", DT: null };
        }

        const hashedPassword = bcrypt.hashSync(adminData.password, salt);

        const newAdmin = await db.Admin.create({
            username: adminData.username,
            email: adminData.email,
            password: hashedPassword,
            phone: adminData.phone,
            fullname: adminData.fullname,
            status: adminData.status || "ACTIVE",
            roleId: adminData.roleId || null,
            branchId: adminData.branchId || null,
        });
        await sendEmailTemplate(
            newAdmin.email,
            "Tài khoản Admin mới",
            "newAdmin",
            {
                fullname: newAdmin.fullname,
                username: newAdmin.username,
                password: adminData.password,
            },
            "admin"
        );
        return {
            EC: 0,
            EM: "Create admin successfully",
            DT: {
                id: newAdmin.id,
                username: newAdmin.username,
                email: newAdmin.email,
                phone: newAdmin.phone,
                fullname: newAdmin.fullname,
                branchId: newAdmin.branchId,
            },
        };
    } catch (error) {
        console.log(error);
        return { EC: -1, EM: "Error creating admin", DT: null };
    }
};

// Cập nhật admin
const updateAdminById = async (id, adminData) => {
    try {
        const admin = await db.Admin.findByPk(id);
        if (!admin) return { EC: 1, EM: "Admin not found", DT: null };

        if (adminData.password) {
            adminData.password = bcrypt.hashSync(adminData.password, salt);
        }

        await admin.update(adminData);

        return { EC: 0, EM: "Update admin successfully", DT: admin };
    } catch (error) {
        console.log(error);
        return { EC: 1, EM: "Error updating admin", DT: null };
    }
};

// Xóa admin
const deleteAdmin = async (id) => {
    try {
        const admin = await db.Admin.findByPk(id);
        if (!admin) return { EC: 1, EM: "Admin not found", DT: null };

        await admin.destroy();

        return { EC: 0, EM: "Delete admin successfully", DT: null };
    } catch (error) {
        console.log(error);
        return { EC: 1, EM: "Error deleting admin", DT: null };
    }
};

export default {
    getAllAdmins,
    getAdminById,
    createNewAdmin,
    updateAdminById,
    deleteAdmin,
    checkPassword,
};
