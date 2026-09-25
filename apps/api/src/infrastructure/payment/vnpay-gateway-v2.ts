import crypto from "node:crypto";
import { isIP } from "node:net";
import { serializeEntityId, serializeMoney, type Money } from "../../shared/contracts/database-scalars.js";
import type { VnPayCallback, VnPayGatewayPort, VnPayPaymentUrl, VnPayPaymentUrlInput } from "../../modules/payment/application/vnpay-gateway.port.js";

const VNPAY_TIME_ZONE = "Asia/Ho_Chi_Minh";
const PAYMENT_URL_TTL_MS = 15 * 60 * 1000;
const MAX_VNPAY_AMOUNT_DIGITS = 12;
const hashPattern = /^[a-f0-9]{128}$/i;
const transactionReferencePattern = /^V2([1-9]\d{0,18})$/;

type VnPayParameters = Readonly<Record<string, string>>;

export type VnPayGatewayConfig = {
    tmnCode: string;
    hashSecret: string;
    paymentUrl: string;
    returnUrl: string;
};

const formatVnPayDate = (date: Date): string => {
    if (!Number.isFinite(date.getTime())) throw new TypeError("VNPay payment timestamp is invalid.");
    const values = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
        timeZone: VNPAY_TIME_ZONE,
        calendar: "gregory",
        numberingSystem: "latn",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`;
};

const toVnPayAmount = (amount: Money): string => {
    const normalized = serializeMoney(amount);
    const [integer, fraction] = normalized.split(".");
    if (fraction !== "0000") throw new TypeError("VNPay only accepts whole-VND payment amounts.");
    const vnpAmount = (BigInt(integer) * 100n).toString();
    if (vnpAmount.length > MAX_VNPAY_AMOUNT_DIGITS) throw new RangeError("VNPay payment amount exceeds provider limits.");
    return vnpAmount;
};

const fromVnPayAmount = (amount: string): Money | null => {
    if (!/^\d{1,12}$/.test(amount)) return null;
    const parsed = BigInt(amount);
    if (parsed <= 0n || parsed % 100n !== 0n) return null;
    try { return serializeMoney((parsed / 100n).toString()); }
    catch { return null; }
};

const canonicalize = (parameters: VnPayParameters): string =>
    new URLSearchParams(Object.fromEntries(Object.entries(parameters)
        .sort(([left], [right]) => left.localeCompare(right)))).toString();

const secureCompare = (provided: string, expected: string): boolean => {
    const providedBuffer = Buffer.from(provided, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return providedBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const validUrl = (value: string, field: string): URL => {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.hash) {
        throw new TypeError(`${field} must be a plain HTTP(S) URL.`);
    }
    return url;
};

/**
 * VNPay transport adapter. It signs locally and validates inbound data; it never calls VNPay
 * or receives an amount/reference chosen by a browser.
 */
export class VnPayGatewayV2 implements VnPayGatewayPort {
    private readonly paymentUrl: URL;
    private readonly returnUrl: URL;

    constructor(private readonly config: VnPayGatewayConfig) {
        if (!/^[A-Za-z0-9]{1,20}$/.test(config.tmnCode) || !config.hashSecret.trim()) {
            throw new TypeError("VNPay credentials are not configured.");
        }
        this.paymentUrl = validUrl(config.paymentUrl, "VNPay payment URL");
        if (this.paymentUrl.protocol !== "https:") throw new TypeError("VNPay payment URL must use HTTPS.");
        this.returnUrl = validUrl(config.returnUrl, "VNPay return URL");
    }

    createPaymentUrl(input: VnPayPaymentUrlInput): VnPayPaymentUrl {
        if (isIP(input.clientIp) === 0) throw new TypeError("VNPay client IP is invalid.");
        if (input.locale !== undefined && input.locale !== "vn" && input.locale !== "en") {
            throw new TypeError("VNPay locale is invalid.");
        }
        if (input.bankCode !== undefined && !/^[A-Za-z0-9]{3,20}$/.test(input.bankCode)) {
            throw new TypeError("VNPay bank code is invalid.");
        }
        const paymentId = serializeEntityId(input.paymentId);
        const transactionReference = `V2${paymentId}`;
        const expiresAt = new Date(input.createdAt.getTime() + PAYMENT_URL_TTL_MS);
        const parameters: Record<string, string> = {
            vnp_Version: "2.1.0",
            vnp_Command: "pay",
            vnp_TmnCode: this.config.tmnCode,
            vnp_Locale: input.locale ?? "vn",
            vnp_CurrCode: "VND",
            vnp_TxnRef: transactionReference,
            vnp_OrderInfo: `Thanh toan don hang ${transactionReference}`,
            vnp_OrderType: "other",
            vnp_Amount: toVnPayAmount(input.amount),
            vnp_ReturnUrl: this.returnUrl.toString(),
            vnp_IpAddr: input.clientIp,
            vnp_CreateDate: formatVnPayDate(input.createdAt),
            vnp_ExpireDate: formatVnPayDate(expiresAt),
        };
        if (input.bankCode) parameters.vnp_BankCode = input.bankCode;
        const secureHash = this.sign(parameters);
        const url = new URL(this.paymentUrl.toString());
        url.search = new URLSearchParams({ ...Object.fromEntries(Object.entries(parameters)
            .sort(([left], [right]) => left.localeCompare(right))), vnp_SecureHash: secureHash }).toString();
        return { url: url.toString(), transactionReference, expiresAt: expiresAt.toISOString() };
    }

    verifyCallback(input: VnPayParameters): VnPayCallback {
        const receivedHash = input.vnp_SecureHash;
        if (!hashPattern.test(receivedHash ?? "") || Object.entries(input).some(([key, value]) =>
            !key.startsWith("vnp_") || typeof value !== "string" || value.length > 512)) {
            return { kind: "invalid", reason: "invalid_payload" };
        }
        const signedParameters = Object.fromEntries(Object.entries(input)
            .filter(([key]) => key !== "vnp_SecureHash" && key !== "vnp_SecureHashType"));
        if (!secureCompare(receivedHash, this.sign(signedParameters))) {
            return { kind: "invalid", reason: "invalid_signature" };
        }
        const referenceMatch = transactionReferencePattern.exec(input.vnp_TxnRef ?? "");
        const amount = fromVnPayAmount(input.vnp_Amount ?? "");
        const responseCode = input.vnp_ResponseCode ?? "";
        const transactionStatus = input.vnp_TransactionStatus ?? "";
        const transactionNo = input.vnp_TransactionNo ?? "";
        if (input.vnp_TmnCode !== this.config.tmnCode || !referenceMatch || !amount
            || !/^\d{2}$/.test(responseCode) || !/^\d{2}$/.test(transactionStatus)
            || (transactionNo !== "" && !/^\d{1,15}$/.test(transactionNo))) {
            return { kind: "invalid", reason: "invalid_payload" };
        }
        const outcome = responseCode === "00" && transactionStatus === "00" ? "completed" : "failed";
        if (outcome === "completed" && !transactionNo) return { kind: "invalid", reason: "invalid_payload" };
        const transactionReference = input.vnp_TxnRef;
        const payloadFingerprint = crypto.createHash("sha256").update(canonicalize(signedParameters)).digest("hex").slice(0, 32);
        return {
            kind: "verified",
            paymentId: serializeEntityId(referenceMatch[1]),
            transactionReference,
            amount,
            providerTransactionId: transactionNo || null,
            outcome,
            responseCode,
            transactionStatus,
            eventKey: `vnpay:${transactionReference}:${transactionNo || payloadFingerprint}`,
        };
    }

    private sign(parameters: VnPayParameters): string {
        return crypto.createHmac("sha512", this.config.hashSecret).update(canonicalize(parameters), "utf8").digest("hex");
    }
}
