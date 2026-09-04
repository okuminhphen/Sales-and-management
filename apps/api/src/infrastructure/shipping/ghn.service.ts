import axios from "axios";

// Adapter for the external GHN shipping API.

const BASE_URL = process.env.GHN_BASE_URL;
// https://dev-online-gateway.ghn.vn
const TOKEN = process.env.GHN_TOKEN;
const SHOP_ID = process.env.GHN_SHOP_ID;
const BRANCH_ID = process.env.GHN_BRANCH_ID;

/**
 * Tính phí vận chuyển GHN
 */
export const getShippingFee = async ({
    fromDistrict,
    toDistrict,
    toWardCode,
    weight,
}) => {
    try {
        const res = await axios.post(
            `${BASE_URL}/shiip/public-api/v2/shipping-order/fee`,
            {
                from_district_id: fromDistrict,
                to_district_id: toDistrict,
                to_ward_code: toWardCode,
                service_type_id: 2,
                weight,
            },
            {
                headers: {
                    Token: TOKEN,
                    ShopId: SHOP_ID,
                    "Content-Type": "application/json",
                },
            }
        );

        return res.data;
    } catch (err) {
        console.error("GHN getShippingFee error:", err.response?.data);
        throw err;
    }
};

/**
 * Tạo đơn hàng GHN
 */
export const createOrder = async (orderData) => {
    if (!orderData.items?.length) {
        throw new Error("GHN requires items");
    }

    if (!orderData.weight || orderData.weight <= 0) {
        throw new Error("Invalid weight");
    }

    try {
        const res = await axios.post(
            `${BASE_URL}/shiip/public-api/v2/shipping-order/create`,
            {
                ...orderData,
                payment_type_id: 2,
                service_type_id: 2,
                required_note: "KHONGCHOXEMHANG",
            },
            {
                headers: {
                    Token: TOKEN,
                    ShopId: SHOP_ID,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log(res.data);
        return res.data;
    } catch (err) {
        console.error("GHN createOrder error:", err.response?.data);
        throw err;
    }
};
