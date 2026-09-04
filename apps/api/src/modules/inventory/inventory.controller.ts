import inventoryService from "./inventory.service.js";

const getInventoryByBranchController = async (req, res) => {
    try {
        const branchId = req.params.branchId;

        let data = await inventoryService.getInventoryByBranch(branchId);

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "Error fetching inventory",
            EC: -1,
            DT: [],
        });
    }
};
export default { getInventoryByBranchController };
