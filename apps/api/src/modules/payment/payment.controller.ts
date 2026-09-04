import paymentService from "./payment.service.js";
import dateFormat from "dateformat";
import crypto from "crypto";
import { getIO } from "../../socket.js";
import { env } from "../../config/env.js";

const readPaymentMethodsFunc = async (req, res) => {
    try {
        let data = await paymentService.getPaymentMethods();
        return res.status(200).json(data);
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

const createPaymentUrlFunc = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(403).json({ EM: "Customer identity required", EC: 3, DT: null });
        }

        const ipAddr = req.headers["x-forwarded-for"]
            ? req.headers["x-forwarded-for"].split(",")[0].trim()
            : req.socket?.remoteAddress;

        const tmnCode = env.VNP_TMN_CODE;
        const secretKey = env.VNP_HASH_SECRET;
        let vnpUrl = env.VNP_URL;
        const returnUrl = env.VNP_RETURN_URL;

        // Tạo thông tin đơn hàng
        const date = new Date();
        const createDate = dateFormat(date, "yyyymmddHHMMss"); // Định dạng chính xác

        const {
            orderId,
            bankCode,
            orderType,
            language,
        } = req.body;

        const order = await paymentService.getPayableOrder(orderId, userId);
        if (!order) {
            return res.status(404).json({ EM: "Payable order not found", EC: 1, DT: null });
        }
        const amount = Number(order.totalPrice);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ EM: "Invalid order amount", EC: 1, DT: null });
        }

        const locale = language || "vn";
        const currCode = "VND";

        let vnp_Params: Record<string, string> = {
            vnp_Version: "2.1.0",
            vnp_Command: "pay",
            vnp_TmnCode: tmnCode,
            vnp_Locale: locale,
            vnp_CurrCode: currCode,
            vnp_TxnRef: String(orderId),
            vnp_OrderInfo: `ORDER_${order.id}`,
            vnp_OrderType: String(orderType || "other"),
            vnp_Amount: String(amount * 100),
            vnp_ReturnUrl: returnUrl,
            vnp_IpAddr: String(ipAddr ?? ""),
            vnp_CreateDate: createDate,
        };

        if (bankCode) {
            vnp_Params.vnp_BankCode = bankCode;
        }

        // Sắp xếp object theo key để đảm bảo thứ tự
        vnp_Params = Object.keys(vnp_Params)
            .sort()
            .reduce((acc, key) => {
                acc[key] = vnp_Params[key];
                return acc;
            }, {});

        // Tạo chữ ký bảo mật
        const signData = new URLSearchParams(vnp_Params).toString();

        const hmac = crypto.createHmac("sha512", secretKey);
        const signed = hmac
            .update(Buffer.from(signData, "utf-8"))
            .digest("hex");
        vnp_Params.vnp_SecureHash = signed;

        // Tạo URL thanh toán
        vnpUrl += "?" + new URLSearchParams(vnp_Params).toString();

        res.json({ vnpUrl });
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const getPaymentReturnFunc = async (req, res) => {
    try {
        let vnp_Params: Record<string, string> = Object.fromEntries(
            Object.entries(req.query).map(([key, value]) => [key, String(value ?? "")])
        );

        let secureHash = vnp_Params["vnp_SecureHash"];

        delete vnp_Params["vnp_SecureHash"];
        delete vnp_Params["vnp_SecureHashType"];

        vnp_Params = Object.keys(vnp_Params)
            .sort() // Sắp xếp theo thứ tự ASCII
            .reduce((acc, key) => {
                acc[key] = vnp_Params[key];
                return acc;
            }, {});

        let secretKey = env.VNP_HASH_SECRET;

        let signData = new URLSearchParams(vnp_Params).toString();

        let hmac = crypto.createHmac("sha512", secretKey);
        let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

        if (secureHash === signed) {
            let orderId = vnp_Params["vnp_TxnRef"];
            let status =
                vnp_Params["vnp_ResponseCode"] === "00" ? "PAID" : "FAILED";
            let amount = Number(vnp_Params["vnp_Amount"]) / 100;
            let transactionNo = vnp_Params["vnp_TransactionNo"];
            let bankCode = vnp_Params["vnp_BankCode"];
            let responseCode = vnp_Params["vnp_ResponseCode"];
            let react_url = env.FRONTEND_URL;
            await paymentService.updatePaymentStatus(
                orderId,
                status,
                transactionNo
            );
            return res.redirect(
                `${react_url}/payment-status?orderId=${orderId}&status=${status}&amount=${amount}&transactionNo=${transactionNo}&bankCode=${bankCode}&responseCode=${responseCode}`
            );
        } else {
            return res.status(400).json({
                EC: "1",
                EM: "Chữ ký không hợp lệ!",
                DT: "",
            });
        }
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};
const webhookFunc = async (req, res) => {
    try {
        const providedSecret = req.get("x-webhook-secret") ?? "";
        const expectedSecret = env.PAYMENT_WEBHOOK_SECRET;
        const provided = Buffer.from(providedSecret);
        const expected = Buffer.from(expectedSecret);
        const validSecret =
            expected.length > 0 &&
            provided.length === expected.length &&
            crypto.timingSafeEqual(provided, expected);
        if (!validSecret) {
            return res.status(401).json({ EM: "Invalid webhook signature", EC: 3, DT: null });
        }

        const payload = req.body;
        console.log("📩 Webhook received:", payload);

        const description = payload?.data?.description || "";

        // ✅ Parse ORDER_ID từ description
        let orderId = null;
        const match = description.match(/ORDER[_ ]?(\d+)/);

        if (match) {
            orderId = Number(match[1]);
        }

        const transactionNo = payload?.data?.reference || null;

        if (!orderId) {
            return res.status(400).json({
                EM: "Cannot determine orderId from webhook payload",
                EC: 1,
                DT: null,
            });
        }

        const paymentResult = await paymentService.updatePaymentStatus(
            orderId,
            "COMPLETED",
            transactionNo
        );
        if (Number(paymentResult.EC) !== 0) {
            return res.status(404).json(paymentResult);
        }

        // 🔥 Emit socket cho đúng đơn
        const io = getIO();
        io.to(`order:${String(orderId)}`).emit("payment-success", {
            status: "success",
            orderId,
        });
        res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Webhook error:", error);
        res.status(500).json({
            EM: "Error from controller",
            EC: "-1",
            DT: "",
        });
    }
};

export default {
    readPaymentMethodsFunc,
    createPaymentUrlFunc,
    getPaymentReturnFunc,
    webhookFunc,
};
