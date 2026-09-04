import db from "../../models/index.js";

const getAllEmployees = async () => {
    try {
        let employees = await db.Employee.findAll({
            include: {
                model: db.Branch,
                as: "branch",
                attributes: ["id", "name"],
            },
        });

        return {
            EM: "Get employees successfully",
            EC: "0",
            DT: employees,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something went wrong while fetching employees",
            EC: "-1",
            DT: [],
        };
    }
};

const createEmployee = async (data) => {
    try {
        let employee = await db.Employee.create(data);

        return {
            EM: "Create employee successfully",
            EC: "0",
            DT: employee,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something went wrong while creating employee",
            EC: "-1",
            DT: null,
        };
    }
};

const updateEmployee = async (id, data) => {
    try {
        let employee = await db.Employee.findByPk(id);

        if (!employee) {
            return {
                EM: "Employee not found",
                EC: "1",
                DT: null,
            };
        }

        let updatedEmployee = await employee.update(data);

        return {
            EM: "Update employee successfully",
            EC: "0",
            DT: updatedEmployee,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something went wrong while updating employee",
            EC: "-1",
            DT: null,
        };
    }
};

const deleteEmployee = async (id) => {
    try {
        let employee = await db.Employee.findByPk(id);

        if (!employee) {
            return {
                EM: "Employee not found",
                EC: "1",
                DT: null,
            };
        }

        await employee.destroy();

        return {
            EM: "Employee deleted successfully",
            EC: "0",
            DT: null,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something went wrong while deleting employee",
            EC: "-1",
            DT: null,
        };
    }
};

const getEmployeesByBranchId = async (branchId) => {
    try {
        let employees = await db.Employee.findAll({
            where: { branchId }, // Lọc theo branch
            include: [
                {
                    model: db.Branch,
                    as: "branch",
                    attributes: ["id", "name"],
                },
                {
                    model: db.Admin,
                    as: "admin",
                    attributes: ["id", "username", "email", "fullname"],
                },
            ],
        });

        return {
            EM: "Get employees by branch successfully",
            EC: "0",
            DT: employees,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something went wrong",
            EC: "-1",
            DT: [],
        };
    }
};

export default {
    getAllEmployees,
    createEmployee,
    updateEmployee,
    deleteEmployee,
    getEmployeesByBranchId,
};
