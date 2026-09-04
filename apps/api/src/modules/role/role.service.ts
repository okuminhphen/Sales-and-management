import db from "../../models/index.js";

const getAllRoles = async () => {
    try {
        let roles = await db.Role.findAll();
        if (!roles) {
            return {
                EM: "failed to get all roles",
                EC: "1",
            };
        }
        return {
            EM: "get all roles success",
            EC: "0",
            DT: roles,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "error from role service",
            EC: "-1",
        };
    }
};

const createRole = async (roleData) => {
    try {
        let newRole = await db.Role.create(roleData); // ✅ Đổi thành Role
        return {
            EM: "create role success",
            EC: "0",
            DT: newRole,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "error when creating role",
            EC: "-1",
        };
    }
};

const updateRole = async (roleId, roleData) => {
    try {
        let role = await db.Role.findOne({ where: { id: roleId } }); // ✅
        if (!role) {
            return {
                EM: "role not found",
                EC: "1",
            };
        }

        await role.update(roleData);

        return {
            EM: "update role success",
            EC: "0",
            DT: role,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "error when updating role",
            EC: "-1",
        };
    }
};

const deleteRole = async (roleId) => {
    try {
        let role = await db.Role.findOne({ where: { id: roleId } }); // ✅
        if (!role) {
            return {
                EM: "role not found",
                EC: "1",
            };
        }

        await role.destroy();

        return {
            EM: "delete role success",
            EC: "0",
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "error when deleting role",
            EC: "-1",
        };
    }
};

export default {
    getAllRoles,
    createRole,
    updateRole,
    deleteRole,
};
