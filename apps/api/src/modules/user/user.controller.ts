import userService from "./user.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";

const readFunc = async (req, res) => {
    try {
        if (req.query.page && req.query.limit) {
            let page = req.query.page;
            let limit = req.query.limit;
            console.log(`page= ${page} and limit= ${limit}`);
            let data = await userService.getUsersWithPagination(
                +page,
                +limit
            );
            return res.status(200).json({
                EM: data.EM, // error message
                EC: data.EC, //error code
                DT: data.DT, // Date
            });
        } else {
            let data = await userService.getAllUsers();
            return res.status(200).json({
                EM: data.EM, // error message
                EC: data.EC, //error code
                DT: data.DT, // Data
            });
        }
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const createFunc = async (req, res) => {
    try {
        let user = req.body;
        let data = await userService.createNewUser(user);

        // Xóa cache liên quan đến users
        await clearCacheByPattern("user:*");

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Data
        });
    }
};
const updateFunc = async (req, res) => {
    try {
        let userId = req.params.userId;
        if (req.user?.userId !== Number(userId)) {
            return res.status(403).json({ EM: "User access denied", EC: 3, DT: null });
        }
        const { username, email, phone, fullname, address } = req.body;
        let userData = { username, email, phone, fullname, address };
        let data = await userService.updateUserById(userId, userData);

        // Xóa cache liên quan đến users
        await clearCacheByPattern("user:*");
        if (userId) {
            await clearCacheByPattern(`user:${userId}*`);
        }

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const updateUserByAdminFunc = async (req, res) => {
    try {
        let userId = req.params.userId;
        let userData = req.body;
        let data = await userService.updateUserByAdmin(userId, userData);

        // Xóa cache liên quan đến users
        await clearCacheByPattern("user:*");
        if (userId) {
            await clearCacheByPattern(`user:${userId}*`);
        }

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const deleteFunc = async (req, res) => {
    try {
        let userId = req.params.userId;

        let data = await userService.deleteUser(userId);

        // Xóa cache liên quan đến users
        await clearCacheByPattern("user:*");
        if (userId) {
            await clearCacheByPattern(`user:${userId}*`);
        }

        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const getUserFunc = async (req, res) => {
    try {
        let userId = req.params.id;
        const isAdmin = req.user?.adminId !== undefined;
        if (!isAdmin && req.user?.userId !== Number(userId)) {
            return res.status(403).json({ EM: "User access denied", EC: 3, DT: null });
        }
        let data = await userService.getUserById(userId);
        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const updatePasswordFunc = async (req, res) => {
    try {
        let userId = req.params.id;
        if (req.user?.userId !== Number(userId)) {
            return res.status(403).json({ EM: "User access denied", EC: 3, DT: null });
        }
        let passwordData = req.body;

        let data = await userService.updatePasswordById(
            userId,
            passwordData
        );
        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};
const getAllUsersFunc = async (req, res) => {
    try {
        let data = await userService.getAllUsers();
        return res.status(200).json({
            EM: data.EM, // error message
            EC: data.EC, //error code
            DT: data.DT, // Data
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "error", // error message
            EC: "-1", //error code
            DT: "", // Date
        });
    }
};

export default {
    readFunc,
    createFunc,
    updateFunc,
    deleteFunc,
    getUserFunc,
    updatePasswordFunc,
    getAllUsersFunc,
    updateUserByAdminFunc,
};
