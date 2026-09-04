import db from "../../models/index.js";
import moment from "moment-timezone";
import { sendEmailTemplate } from "../../infrastructure/mail/email.service.js";
import { createOrder as createOrderGHN, getShippingFee } from "../../infrastructure/shipping/ghn.service.js";
import { env } from "../../config/env.js";
import type { AccessTokenClaims } from "../../security/access-token.js";

const GHN_BRANCH_DISTRICT_ID = parseInt(process.env.GHN_BRANCH_DISTRICT_ID);

const createOrder = async (orderData) => {
    const t = await db.sequelize.transaction();
    try {
        const {
            userId,
            cartItems,
            customerInfo,
            totalPrice,
            paymentMethodId,
            branchId,
        } = orderData;

        if (
            !customerInfo ||
            !totalPrice ||
            !paymentMethodId ||
            !cartItems ||
            !userId
        ) {
            await t.rollback();
            return {
                EM: "Missing required fields",
                EC: "-1",
                DT: "",
            };
        }

        const fulfillmentBranchId =
            branchId || env.DEFAULT_FULFILLMENT_BRANCH_ID;

        let newOrder = await db.Orders.create(
            {
                userId,
                branchId: fulfillmentBranchId,
                orderDate: moment().tz("Asia/Ho_Chi_Minh").toDate(),
                totalPrice,
                status: "PENDING",

                customerName: customerInfo.name,
                customerPhone: customerInfo.phone,
                customerEmail: customerInfo.email,
                shippingAddress: customerInfo.address,
                toProvinceId: parseInt(customerInfo.provinceId),
                toDistrictId: parseInt(customerInfo.districtId),
                toWardCode: customerInfo.wardId,
                message: customerInfo.message,
            },
            { transaction: t }
        );

        const code = `ORD-${String(newOrder.id).padStart(6, "0")}`;
        await newOrder.update({ code }, { transaction: t });
        // console.log(
        //     "Chuyển về Việt Nam:",
        //     moment(order.orderDate)
        //         .tz("Asia/Ho_Chi_Minh")
        //         .format("YYYY-MM-DD HH:mm:ss")
        // );

        const orderDetailsData = [];
        let calculatedTotal = 0;

        for (const item of cartItems) {
            const quantity = Number(item.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new Error("Invalid order item quantity");
            }
            const productId = item.productId || item.id;

            // 🔹 2.1 TÌM sizeId TỪ size name (VD: "L")
            const size = await db.Size.findOne({
                where: { name: item.size },
                transaction: t,
            });

            if (!size) {
                throw new Error(`Size ${item.size} không tồn tại`);
            }

            // 🔹 2.2 TÌM productSize
            const productSize = await db.ProductSize.findOne({
                where: {
                    productId,
                    sizeId: size.id,
                },
                transaction: t,
            });

            if (!productSize) {
                throw new Error(
                    `Không tìm thấy ProductSize cho sản phẩm ${productId}`
                );
            }

            const product = await db.Product.findByPk(productId, {
                attributes: ["id", "name", "price", "images"],
                transaction: t,
            });
            if (!product) throw new Error(`Sản phẩm ${productId} không tồn tại`);
            const unitPrice = Number(product.price);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                throw new Error(`Giá sản phẩm ${productId} không hợp lệ`);
            }

            // 🔹 2.3 LẤY INVENTORY + LOCK
            const inventory = await db.Inventory.findOne({
                where: {
                    productSizeId: productSize.id,
                    branchId: fulfillmentBranchId,
                },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!inventory || inventory.stock < quantity) {
                throw new Error(`Không đủ tồn kho cho size ${item.size}`);
            }

            // 🔹 2.4 TRỪ TỒN KHO
            await inventory.update(
                {
                    stock: inventory.stock - quantity,
                },
                { transaction: t }
            );

            // 🔹 2.5 PREPARE ORDER DETAIL
            orderDetailsData.push({
                orderId: newOrder.id,
                productId,
                productName: product.name,
                productImage: JSON.stringify(product.images),
                productSize: item.size, // vẫn lưu "L" cho dễ đọc
                quantity,
                priceAtOrder: unitPrice,
                totalPrice: unitPrice * quantity,
            });
            calculatedTotal += unitPrice * quantity;
        }

        if (
            !Number.isFinite(Number(totalPrice)) ||
            Math.abs(Number(totalPrice) - calculatedTotal) > 0.01
        ) {
            throw new Error("Order total does not match catalog pricing");
        }
        await newOrder.update({ totalPrice: calculatedTotal }, { transaction: t });

        // ======================
        // 3️⃣ CREATE ORDER DETAILS
        // ======================
        await db.OrdersDetails.bulkCreate(orderDetailsData, {
            transaction: t,
        });

        // ======================
        // 4️⃣ CREATE PAYMENT
        // ======================
        await db.Payment.create(
            {
                orderId: newOrder.id,
                paymentMethodId,
                amount: calculatedTotal,
                transactionId: "",
                status: "PENDING",
            },
            { transaction: t }
        );

        // ======================
        // 5️⃣ CLEAR CART
        // ======================
        await db.Cart.destroy({
            where: { userId },
            transaction: t,
        });

        // ======================
        // 6️⃣ COMMIT
        // ======================
        await t.commit();

        return {
            EM: "Create order successfully",
            EC: "0",
            DT: {
                orderId: newOrder.id,
                code,
            },
        };
    } catch (error) {
        console.log(error);
        await t.rollback();
        return {
            EM: "Error from creat order service",
            EC: "-1",
            DT: "",
        };
    }
};
const getAllOrders = async () => {
    try {
        let orders = await db.Orders.findAll({
            include: [
                {
                    model: db.OrdersDetails,
                    as: "ordersDetails",
                    attributes: [
                        "id",
                        "orderId",
                        "productId",
                        "productName",
                        "productImage",
                        "productSize",
                        "quantity",
                        "priceAtOrder",
                        "totalPrice",
                    ],
                },
                {
                    model: db.Payment,
                    as: "payment",
                },
            ],
        });
        return {
            EM: "Get all orders successfully",
            EC: "0",
            DT: orders,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};
const getOrdersByUserId = async (userId) => {
    try {
        let orders = await db.Orders.findAll({
            where: {
                userId: userId,
            },
            attributes: [
                "id",
                "userId",
                "code",
                "orderDate",
                "totalPrice",
                "status",
                "customerName",
                "customerPhone",
                "customerEmail",
                "shippingAddress",
                "message",
            ],
            include: [
                {
                    model: db.OrdersDetails, // Bảng chi tiết đơn hàng
                    attributes: [
                        "id",
                        "orderId",
                        "productId",
                        "productName",
                        "productImage",
                        "productSize",
                        "quantity",
                        "priceAtOrder",
                        "totalPrice",
                    ],
                    as: "ordersDetails",
                },
                {
                    model: db.Payment,
                    attributes: [
                        "id",
                        "orderId",
                        "paymentMethodId",
                        "amount",
                        "transactionId",
                        "status",
                    ],
                    as: "payment",
                    include: [
                        {
                            model: db.PaymentMethods, // Thêm bảng PaymentMethods
                            attributes: ["id", "name", "description"], // Lấy tên phương thức thanh toán
                            as: "paymentMethod",
                        },
                    ],
                },
            ],
        });

        return {
            EM: "Get orders by user id successfully",
            EC: "0",
            DT: orders,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};

const updateOrderStatus = async (
    orderId,
    newStatus,
    actor?: AccessTokenClaims
) => {
    try {
        const order = await db.Orders.findByPk(orderId, {
            include: [
                {
                    model: db.OrdersDetails,
                    as: "ordersDetails",
                },
            ],
        });

        if (!order) {
            return { EM: "Order not found", EC: -1, DT: "" };
        }

        if (actor?.userId !== undefined) {
            if (Number(order.userId) !== actor.userId) {
                return { EM: "Order access denied", EC: 3, DT: "" };
            }
            if (newStatus !== "CANCELLED" || order.status !== "PENDING") {
                return { EM: "Only pending orders can be cancelled", EC: 3, DT: "" };
            }
        }

        if (order.status === "PENDING" && newStatus === "CONFIRMED") {
            order.status = "CONFIRMED";
            await order.save();

            // 1️⃣ Map items từ OrdersDetails
            const items = order.ordersDetails.map((item) => ({
                name: item.productName,
                quantity: item.quantity,
                price: item.price || 0,
                weight: item.weight || 300,
            }));

            const totalWeight = items.reduce(
                (sum, i) => sum + i.weight * i.quantity,
                0
            );

            // 2️⃣ Tính phí GHN
            const feeRes = await getShippingFee({
                fromDistrict: GHN_BRANCH_DISTRICT_ID,
                toDistrict: order.toDistrictId,
                toWardCode: order.toWardCode,
                weight: totalWeight,
            });

            const shippingFee = feeRes?.data?.total_fee || 0;

            // 3️⃣ Tạo đơn GHN
            const ghnRes = await createOrderGHN({
                to_name: order.customerName,
                to_phone: order.customerPhone,
                to_address: order.shippingAddress,

                to_district_id: order.toDistrictId,
                to_ward_code: order.toWardCode,

                cod_amount: order.totalPrice,
                weight: totalWeight,
                service_type_id: 2,
                required_note: "KHONGCHOXEMHANG",
                items,
            });

            // 4️⃣ Lưu GHN info
            order.ghnOrderId = ghnRes.data.order_code;

            order.shippingFee = shippingFee;
            order.status = "SHIPPING";
            await order.save();

            // 5️⃣ Gửi email
            await sendEmailTemplate(
                order.customerEmail,
                "Đơn hàng của bạn đã được duyệt",
                "newCus",
                {
                    fullname: order.customerName,
                    orderCode: order.code,
                    ghnOrderCode: order.ghnOrderId,
                    shippingFee,
                },
                "user"
            );

            return {
                EM: "Order approved & GHN created",
                EC: 0,
                DT: order,
            };
        }

        await order.update({ status: newStatus });

        return { EM: "Update order status successfully", EC: 0, DT: order };
    } catch (error) {
        console.error(error);
        return { EM: "Error from update order status", EC: -1, DT: "" };
    }
};

const deleteOrder = async (orderId) => {
    try {
        let result = await db.Orders.destroy({ where: { id: orderId } });
        return {
            EM: "Delete order successfully",
            EC: "0",
            DT: result,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};
const updateOrder = async (orderId, orderData) => {
    try {
        let result = await db.Orders.update(orderData, {
            where: { id: orderId },
        });
        return {
            EM: "Update order successfully",
            EC: "0",
            DT: result,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};

const getOrdersByBranchId = async (branchId) => {
    try {
        if (!branchId) {
            return {
                EM: "Missing branchId",
                EC: "-1",
                DT: "",
            };
        }

        let orders = await db.Orders.findAll({
            where: { branchId },
            include: [
                {
                    model: db.OrdersDetails,
                    as: "ordersDetails",
                    attributes: [
                        "id",
                        "orderId",
                        "productId",
                        "productName",
                        "productImage",
                        "productSize",
                        "quantity",
                        "priceAtOrder",
                        "totalPrice",
                    ],
                },
                {
                    model: db.Payment,
                    as: "payment",
                    include: [
                        {
                            model: db.PaymentMethods,
                            as: "paymentMethod",
                            attributes: ["id", "name", "description"],
                        },
                    ],
                },
            ],
        });

        return {
            EM: "Get orders by branch successfully",
            EC: "0",
            DT: orders,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};

const createOrderAtBranch = async (orderData) => {
    const t = await db.sequelize.transaction();
    try {
        const {
            cartItems,
            customerInfo,
            totalPrice,
            paymentMethodId,
            branchId,
        } = orderData;

        if (
            !Array.isArray(cartItems) ||
            cartItems.length === 0 ||
            !totalPrice ||
            !paymentMethodId ||
            !branchId
        ) {
            await t.rollback();
            return {
                EM: "Missing required fields",
                EC: "-1",
                DT: "",
            };
        }

        // Tạo đơn hàng không có userId
        let newOrder = await db.Orders.create(
            {
                userId: null,
                branchId: branchId,
                orderDate: moment().tz("Asia/Ho_Chi_Minh").toDate(),
                totalPrice,
                status: "COMPLETED",
                customerName: customerInfo?.name || "Khách lẻ",
                customerPhone: customerInfo?.phone || "",
                customerEmail: customerInfo?.email || "",
                shippingAddress: customerInfo?.address || "",
                message: customerInfo?.message || "",
            },
            { transaction: t }
        );

        const orderId = newOrder.id;
        const code = `ORD-${String(orderId).padStart(6, "0")}`;
        await newOrder.update({ code }, { transaction: t });

        const ordersDetailsData = [];
        let calculatedTotal = 0;
        for (const item of cartItems) {
            const quantity = Number(item.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) {
                throw new Error("Invalid order item quantity");
            }

            const size = await db.Size.findOne({
                where: { name: item.size },
                transaction: t,
            });
            if (!size) throw new Error(`Size ${item.size} không tồn tại`);

            const productId = item.productId || item.id;
            const productSize = await db.ProductSize.findOne({
                where: { productId, sizeId: size.id },
                transaction: t,
            });
            if (!productSize) {
                throw new Error(`Không tìm thấy ProductSize cho sản phẩm ${productId}`);
            }

            const product = await db.Product.findByPk(productId, {
                attributes: ["id", "name", "price", "images"],
                transaction: t,
            });
            if (!product) throw new Error(`Sản phẩm ${productId} không tồn tại`);
            const unitPrice = Number(product.price);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                throw new Error(`Giá sản phẩm ${productId} không hợp lệ`);
            }

            const inventory = await db.Inventory.findOne({
                where: { productSizeId: productSize.id, branchId },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!inventory || inventory.stock < quantity) {
                throw new Error(`Không đủ tồn kho cho size ${item.size}`);
            }
            await inventory.update(
                { stock: inventory.stock - quantity },
                { transaction: t }
            );

            ordersDetailsData.push({
                orderId,
                productId,
                productName: product.name,
                productImage: JSON.stringify(product.images),
                productSize: item.size,
                quantity,
                priceAtOrder: unitPrice,
                totalPrice: unitPrice * quantity,
            });
            calculatedTotal += unitPrice * quantity;
        }
        if (
            !Number.isFinite(Number(totalPrice)) ||
            Math.abs(Number(totalPrice) - calculatedTotal) > 0.01
        ) {
            throw new Error("Order total does not match catalog pricing");
        }
        await newOrder.update({ totalPrice: calculatedTotal }, { transaction: t });
        await db.OrdersDetails.bulkCreate(ordersDetailsData, { transaction: t });

        // Tạo thanh toán
        await db.Payment.create(
            {
                orderId,
                paymentMethodId,
                amount: calculatedTotal,
                transactionId: "",
                status: "COMPLETED",
            },
            { transaction: t }
        );

        await t.commit();

        return {
            EM: "Create in-store order successfully",
            EC: "0",
            DT: newOrder,
        };
    } catch (error) {
        console.log(error);
        await t.rollback();
        return {
            EM: "Error from service",
            EC: "-1",
            DT: "",
        };
    }
};

export default {
    createOrder,
    getAllOrders,
    getOrdersByUserId,
    updateOrderStatus,
    deleteOrder,
    updateOrder,
    getOrdersByBranchId,
    createOrderAtBranch,
};
