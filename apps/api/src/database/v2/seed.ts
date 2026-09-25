import bcrypt from "bcryptjs";
import { resolve } from "node:path";
import { Sequelize, type Transaction } from "sequelize";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { runV2Migrations } from "./migrate.js";
import { retryV2Transaction } from "./transaction-retry.js";

type SeedRecord = {
    code: string;
    name: string;
    description: string;
};

export type V2SuperAdminCredentials = {
    email: string;
    password: string;
};

export const ROLE_SEEDS: readonly SeedRecord[] = [
    { code: "CUSTOMER", name: "Khách hàng", description: "Tài khoản khách hàng." },
    { code: "SALES_STAFF", name: "Nhân viên bán hàng", description: "Nhân viên bán hàng tại chi nhánh." },
    { code: "INVENTORY_STAFF", name: "Nhân viên kho", description: "Nhân viên vận hành kho tại chi nhánh." },
    { code: "CUSTOMER_SUPPORT", name: "Chăm sóc khách hàng", description: "Nhân viên hỗ trợ khách hàng." },
    { code: "BRANCH_MANAGER", name: "Quản lý chi nhánh", description: "Quản lý vận hành theo phạm vi chi nhánh." },
    { code: "SUPER_ADMIN", name: "Quản trị hệ thống", description: "Quản trị viên toàn hệ thống." },
];

export const PERMISSION_SEEDS: readonly Omit<SeedRecord, "name">[] = [
    { code: "account.read.global", description: "Xem tài khoản trên toàn hệ thống." },
    { code: "account.manage.global", description: "Quản lý tài khoản trên toàn hệ thống." },
    { code: "role.read.global", description: "Xem role và permission trên toàn hệ thống." },
    { code: "role.manage.global", description: "Quản lý role và permission trên toàn hệ thống." },
    { code: "branch.read", description: "Xem chi nhánh." },
    { code: "branch.manage.global", description: "Quản lý chi nhánh trên toàn hệ thống." },
    { code: "employee.read.branch", description: "Xem nhân viên trong chi nhánh được cấp quyền." },
    { code: "employee.manage.branch", description: "Quản lý nhân viên trong chi nhánh được cấp quyền." },
    { code: "employee.manage.global", description: "Quản lý nhân viên trên toàn hệ thống." },
    { code: "catalog.read", description: "Xem danh mục và sản phẩm." },
    { code: "catalog.manage.global", description: "Quản lý danh mục và sản phẩm trên toàn hệ thống." },
    { code: "inventory.read.branch", description: "Xem tồn kho trong chi nhánh được cấp quyền." },
    { code: "inventory.manage.branch", description: "Điều chỉnh tồn kho trong chi nhánh được cấp quyền." },
    { code: "stock_request.read.branch", description: "Xem yêu cầu nhập kho trong chi nhánh được cấp quyền." },
    { code: "stock_request.manage.branch", description: "Xử lý yêu cầu nhập kho trong chi nhánh được cấp quyền." },
    { code: "transfer.read.branch", description: "Xem phiếu chuyển kho tại chi nhánh được cấp quyền." },
    { code: "transfer.manage.branch", description: "Xử lý phiếu chuyển kho tại chi nhánh được cấp quyền." },
    { code: "voucher.read", description: "Xem voucher." },
    { code: "voucher.manage.global", description: "Quản lý voucher trên toàn hệ thống." },
    { code: "cart.manage.own", description: "Quản lý giỏ hàng của chính mình." },
    { code: "order.read.own", description: "Xem đơn hàng của chính mình." },
    { code: "order.read.branch", description: "Xem đơn hàng trong chi nhánh được cấp quyền." },
    { code: "order.read.global", description: "Xem đơn hàng trên toàn hệ thống." },
    { code: "order.manage.branch", description: "Xử lý đơn hàng trong chi nhánh được cấp quyền." },
    { code: "order.manage.global", description: "Xử lý đơn hàng trên toàn hệ thống." },
    { code: "payment.read.own", description: "Xem thanh toán của chính mình." },
    { code: "payment.read.branch", description: "Xem thanh toán trong chi nhánh được cấp quyền." },
    { code: "payment.read.global", description: "Xem thanh toán trên toàn hệ thống." },
    { code: "payment.manage.global", description: "Quản lý thanh toán trên toàn hệ thống." },
    { code: "shipment.manage.branch", description: "Xử lý giao hàng trong chi nhánh được cấp quyền." },
    { code: "return.manage.branch", description: "Xử lý trả hàng trong chi nhánh được cấp quyền." },
    { code: "refund.approve.global", description: "Phê duyệt hoàn tiền trên toàn hệ thống." },
    { code: "conversation.read.own", description: "Xem hội thoại của chính mình." },
    { code: "conversation.manage.branch", description: "Xử lý hội thoại trong chi nhánh được cấp quyền." },
    { code: "notification.read.own", description: "Xem thông báo của chính mình." },
    { code: "behavior.read.global", description: "Xem dữ liệu hành vi tổng hợp trên toàn hệ thống." },
    { code: "audit.read.global", description: "Xem dữ liệu audit và outbox trên toàn hệ thống." },
];

export const PAYMENT_METHOD_SEEDS: readonly SeedRecord[] = [
    { code: "CASH", name: "Tiền mặt tại quầy", description: "Thanh toán tiền mặt đã thu tại quầy POS." },
    { code: "COD", name: "COD", description: "Thanh toán tiền mặt khi nhận hàng." },
    { code: "VNPAY", name: "VNPAY", description: "Thanh toán trực tuyến qua VNPay." },
];

const normalizeCredentials = (
    credentials: V2SuperAdminCredentials,
): V2SuperAdminCredentials => {
    const email = credentials.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error("Database V2 seed requires a valid SUPER_ADMIN_EMAIL.");
    }
    if (credentials.password.length < 12) {
        throw new Error("Database V2 seed requires SUPER_ADMIN_PASSWORD with at least 12 characters.");
    }
    return { email, password: credentials.password };
};

const seedRoles = async (sequelize: Sequelize, transaction: Transaction): Promise<void> => {
    for (const role of ROLE_SEEDS) {
        await sequelize.query(
            "INSERT INTO roles (code, name, description, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE updated_at = IF(name <> ? OR NOT (description <=> ?), UTC_TIMESTAMP(3), updated_at), name = ?, description = ?",
            { replacements: [role.code, role.name, role.description, role.name, role.description, role.name, role.description], transaction },
        );
    }
};

const seedPermissions = async (sequelize: Sequelize, transaction: Transaction): Promise<void> => {
    for (const permission of PERMISSION_SEEDS) {
        await sequelize.query(
            "INSERT INTO permissions (code, description, created_at, updated_at) VALUES (?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE updated_at = IF(NOT (description <=> ?), UTC_TIMESTAMP(3), updated_at), description = ?",
            { replacements: [permission.code, permission.description, permission.description, permission.description], transaction },
        );
    }
};

const seedPaymentMethods = async (sequelize: Sequelize, transaction: Transaction): Promise<void> => {
    for (const paymentMethod of PAYMENT_METHOD_SEEDS) {
        await sequelize.query(
            "INSERT INTO payment_methods (code, name, description, is_active, created_at, updated_at) VALUES (?, ?, ?, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE updated_at = IF(name <> ? OR NOT (description <=> ?) OR is_active <> TRUE, UTC_TIMESTAMP(3), updated_at), name = ?, description = ?, is_active = TRUE",
            { replacements: [paymentMethod.code, paymentMethod.name, paymentMethod.description, paymentMethod.name, paymentMethod.description, paymentMethod.name, paymentMethod.description], transaction },
        );
    }
};

const seedSuperAdmin = async (
    sequelize: Sequelize,
    transaction: Transaction,
    email: string,
    passwordHash: string,
): Promise<void> => {
    await sequelize.query(
        "INSERT INTO accounts (email, username, password_hash, status, email_verified_at, created_at, updated_at) VALUES (?, NULL, ?, 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE email = email",
        { replacements: [email, passwordHash], transaction },
    );
    await sequelize.query(
        "INSERT IGNORE INTO account_roles (account_id, role_id, scope_type, scope_key, branch_id, assigned_by_account_id, assigned_at) SELECT a.id, r.id, 'global', 'GLOBAL', NULL, NULL, UTC_TIMESTAMP(3) FROM accounts a INNER JOIN roles r ON r.code = 'SUPER_ADMIN' WHERE a.email = ?",
        { replacements: [email], transaction },
    );
    await sequelize.query(
        "INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at) SELECT r.id, p.id, UTC_TIMESTAMP(3) FROM roles r CROSS JOIN permissions p WHERE r.code = 'SUPER_ADMIN'",
        { transaction },
    );
};

export const seedV2Database = async (
    sequelize: Sequelize,
    unvalidatedCredentials: V2SuperAdminCredentials,
): Promise<void> => {
    const credentials = normalizeCredentials(unvalidatedCredentials);
    const passwordHash = await bcrypt.hash(credentials.password, 12);

    await retryV2Transaction(async () => sequelize.transaction(async (transaction) => {
        await seedRoles(sequelize, transaction);
        await seedPermissions(sequelize, transaction);
        await seedPaymentMethods(sequelize, transaction);
        await seedSuperAdmin(sequelize, transaction, credentials.email, passwordHash);
    }));
};

export const runV2Seed = async (): Promise<void> => {
    const credentials = normalizeCredentials({
        email: env.SUPER_ADMIN_EMAIL ?? "",
        password: env.SUPER_ADMIN_PASSWORD ?? "",
    });
    await runV2Migrations("up");
    const targetDatabase = env.V2_MIGRATIONS_TARGET_DATABASE;
    if (!targetDatabase) {
        throw new Error("Database V2 seed requires V2_MIGRATIONS_TARGET_DATABASE.");
    }
    const sequelize = new Sequelize(targetDatabase, env.MYSQL_USER, env.MYSQL_PASSWORD, {
        host: env.MYSQL_HOST,
        port: env.MYSQL_PORT,
        dialect: "mysql",
        logging: false,
    });
    try {
        await sequelize.authenticate();
        await seedV2Database(sequelize, credentials);
    } finally {
        await sequelize.close();
    }
};

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && resolve(currentFile) === resolve(process.argv[1])) {
    runV2Seed().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
