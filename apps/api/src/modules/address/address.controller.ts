import addressService from "./address.service.js";

const getProvinces = async (req, res) => {
    try {
        const data = await addressService.getProvinces();
        return res.status(200).json({
            EC: 0,
            EM: "Get provinces successfully",
            DT: data,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EC: -1,
            EM: "Error getting provinces",
            DT: "",
        });
    }
};

const getDistricts = async (req, res) => {
    try {
        const { provinceId } = req.query;

        if (!provinceId) {
            return res.status(400).json({
                EC: -1,
                EM: "provinceId is required",
                DT: "",
            });
        }

        const data = await addressService.getDistricts(provinceId);
        return res.status(200).json({
            EC: 0,
            EM: "Get districts successfully",
            DT: data,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EC: -1,
            EM: "Error getting districts",
            DT: "",
        });
    }
};

const getWards = async (req, res) => {
    try {
        const { districtId } = req.query;

        if (!districtId) {
            return res.status(400).json({
                EC: -1,
                EM: "districtId is required",
                DT: "",
            });
        }

        const data = await addressService.getWards(districtId);
        return res.status(200).json({
            EC: 0,
            EM: "Get wards successfully",
            DT: data,
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EC: -1,
            EM: "Error getting wards",
            DT: "",
        });
    }
};

export default {
    getProvinces,
    getDistricts,
    getWards,
};
