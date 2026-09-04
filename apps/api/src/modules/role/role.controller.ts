import roleService from "./role.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";
const readRoleFunc = async (req, res) => {
    try {
        let data = await roleService.getAllRoles();
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const createRoleFunc = async (req, res) => {
    try {
        const roleData = req.body;

        let data = await roleService.createRole(roleData);

        // Xóa cache liên quan đến roles
        await clearCacheByPattern("role:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};
const updateRoleFunc = async (req, res) => {
    try {
        const roleId = req.params.roleId;
        const roleData = req.body;

        let data = await roleService.updateRole(roleId, roleData);

        // Xóa cache liên quan đến roles
        await clearCacheByPattern("role:*");
        if (roleId) {
            await clearCacheByPattern(`role:${roleId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};
const deleteRoleFunc = async (req, res) => {
    try {
        const roleId = req.params.roleId;

        let data = await roleService.deleteRole(roleId);

        // Xóa cache liên quan đến roles
        await clearCacheByPattern("role:*");
        if (roleId) {
            await clearCacheByPattern(`role:${roleId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: (data as any).DT ?? null,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const checkRoleFunc = (req, res) => {};

export default {
    readRoleFunc,
    createRoleFunc,
    updateRoleFunc,
    deleteRoleFunc,
    checkRoleFunc,
};
