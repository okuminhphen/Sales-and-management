import axios from "axios";

// External address-provider adapter owned by the address feature.

const GHN_BASE_URL = "https://dev-online-gateway.ghn.vn/shiip/public-api";
const GHN_TOKEN = process.env.GHN_TOKEN;

const ghnAxios = axios.create({
    baseURL: GHN_BASE_URL,
    headers: {
        Token: GHN_TOKEN,
        "Content-Type": "application/json",
    },
});

const getProvinces = async () => {
    const res = await ghnAxios.get("/master-data/province");
    return res.data.data;
};

const getDistricts = async (provinceId) => {
    if (!provinceId) throw new Error("provinceId is required");

    const res = await ghnAxios.get("/master-data/district", {
        params: { province_id: provinceId },
    });

    return res.data.data;
};

const getWards = async (districtId) => {
    if (!districtId) throw new Error("districtId is required");

    const res = await ghnAxios.get("/master-data/ward", {
        params: { district_id: districtId },
    });

    return res.data.data;
};

export default {
    getProvinces,
    getDistricts,
    getWards,
};
