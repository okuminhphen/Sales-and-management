import db from "../../models/index.js";

const getAllBranches = async () => {
    try {
        let branches = await db.Branch.findAll();
        return {
            EM: "Lấy danh sách chi nhánh thành công",
            EC: 0,
            DT: branches,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Có lỗi xảy ra",
            EC: 1,
            DT: [],
        };
    }
};

const getBranchesWithPagination = async (page, limit) => {
    try {
        let offset = (page - 1) * limit;
        const { count, rows } = await db.Branch.findAndCountAll({
            offset,
            limit,
            order: [["id", "DESC"]],
        });

        let totalPages = Math.ceil(count / limit);
        return {
            EM: "Lấy danh sách chi nhánh (phân trang) thành công",
            EC: 0,
            DT: {
                totalRows: count,
                totalPages: totalPages,
                branches: rows,
            },
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Có lỗi xảy ra",
            EC: 1,
            DT: [],
        };
    }
};

const createNewBranch = async (branchData) => {
    const t = await db.sequelize.transaction();

    try {
        /* 1. TẠO CHI NHÁNH */
        const branch = await db.Branch.create(branchData, { transaction: t });

        /* 2. LẤY TOÀN BỘ PRODUCT SIZE */
        const productSizes = await db.ProductSize.findAll({
            attributes: ["id"],
            transaction: t,
        });

        /* 3. TẠO INVENTORY MẶC ĐỊNH (STOCK = 0) */
        const inventories = productSizes.map((ps) => ({
            branchId: branch.id,
            productSizeId: ps.id,
            stock: 0,
        }));

        if (inventories.length > 0) {
            await db.Inventory.bulkCreate(inventories, {
                transaction: t,
            });
        }

        await t.commit();

        return {
            EM: "Tạo chi nhánh mới thành công",
            EC: 0,
            DT: branch,
        };
    } catch (e) {
        console.error(e);
        await t.rollback();
        return {
            EM: "Không thể tạo chi nhánh",
            EC: 1,
            DT: "",
        };
    }
};

const updateBranchById = async (branchId, branchData) => {
    try {
        let branch = await db.Branch.findByPk(branchId);
        if (!branch) {
            return {
                EM: "Không tìm thấy chi nhánh",
                EC: 1,
                DT: "",
            };
        }

        await branch.update(branchData);
        return {
            EM: "Cập nhật chi nhánh thành công",
            EC: 0,
            DT: branch,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Không thể cập nhật chi nhánh",
            EC: 1,
            DT: "",
        };
    }
};

const deleteBranchById = async (branchId) => {
    try {
        let branch = await db.Branch.findByPk(branchId);
        if (!branch) {
            return {
                EM: "Không tìm thấy chi nhánh",
                EC: 1,
                DT: "",
            };
        }

        await branch.destroy();
        return {
            EM: "Xóa chi nhánh thành công",
            EC: 0,
            DT: "",
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Không thể xóa chi nhánh",
            EC: 1,
            DT: "",
        };
    }
};

const getBranchDetail = async (branchId) => {
    const branch = await db.Branch.findByPk(branchId, {
        include: [
            {
                model: db.Employee,
                as: "employees",
                attributes: [
                    "id",
                    "name",
                    "position",
                    "phone",
                    "email",
                    "status",
                ],
            },
            {
                model: db.Inventory,
                as: "inventory",
                include: [
                    {
                        model: db.ProductSize,
                        as: "productSize",
                        include: [
                            {
                                model: db.Product,
                                as: "product",
                                attributes: ["id", "name", "price"],
                            },
                            {
                                model: db.Size,
                                as: "size",
                                attributes: ["id", "name"],
                            },
                        ],
                    },
                ],
            },
            {
                model: db.Employee,
                as: "manager",
                attributes: ["id", "name", "email", "phone"],
            },
        ],
    });

    return branch;
};

export default {
    getAllBranches,
    getBranchesWithPagination,
    createNewBranch,
    updateBranchById,
    deleteBranchById,
    getBranchDetail,
};
