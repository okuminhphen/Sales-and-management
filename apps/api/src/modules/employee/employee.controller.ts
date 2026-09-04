import employeeService from "./employee.service.js";
import { clearCacheByPattern } from "../../utils/cacheHelper.js";

const readFunc = async (req, res) => {
    try {
        let data = await employeeService.getAllEmployees();

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

const createFunc = async (req, res) => {
    try {
        let employeeData = req.body;
        let data = await employeeService.createEmployee(employeeData);

        // Xóa cache liên quan đến employees
        await clearCacheByPattern("employee:*");

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

const updateFunc = async (req, res) => {
    try {
        let employeeId = req.params.employeeId;
        let employeeData = req.body;
        let data = await employeeService.updateEmployee(
            employeeId,
            employeeData
        );

        // Xóa cache liên quan đến employees
        await clearCacheByPattern("employee:*");
        if (employeeId) {
            await clearCacheByPattern(`employee:${employeeId}*`);
        }
        if (employeeData.branchId) {
            await clearCacheByPattern(
                `employee:branch:${employeeData.branchId}*`
            );
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

const deleteFunc = async (req, res) => {
    try {
        let employeeId = req.params.employeeId;
        let data = await employeeService.deleteEmployee(employeeId);

        // Xóa cache liên quan đến employees
        await clearCacheByPattern("employee:*");
        if (employeeId) {
            await clearCacheByPattern(`employee:${employeeId}*`);
        }

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

const getEmployeesByBranchIdFunc = async (req, res) => {
    try {
        let branchId = req.params.branchId;
        let data = await employeeService.getEmployeesByBranchId(branchId);
        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

export default {
    readFunc,
    createFunc,
    updateFunc,
    deleteFunc,
    getEmployeesByBranchIdFunc,
};
