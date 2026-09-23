import {
    DataTypes,
    Model,
    type Optional,
    type Sequelize,
} from "sequelize";
import {
    v2ModelOptions,
    type V2PersistenceModule,
} from "../../../database/v2/persistence.js";

type Timestamps = { createdAt: Date; updatedAt: Date };
type BigIntId = string;

export type AccountAttributes = Timestamps & {
    id: BigIntId; email: string; username: string | null; passwordHash: string | null;
    status: "pending" | "active" | "locked" | "inactive";
    emailVerifiedAt: Date | null; lastLoginAt: Date | null;
};
export type RoleAttributes = Timestamps & { id: number; code: string; name: string; description: string | null };
export type PermissionAttributes = Timestamps & { id: number; code: string; description: string | null };
export type RolePermissionAttributes = { id: BigIntId; roleId: number; permissionId: number; createdAt: Date };
export type AccountRoleAttributes = {
    id: BigIntId; accountId: BigIntId; roleId: number; scopeType: "global" | "branch";
    scopeKey: string; branchId: BigIntId | null; assignedByAccountId: BigIntId | null; assignedAt: Date;
};
export type CustomerAttributes = Timestamps & {
    id: BigIntId; accountId: BigIntId | null; fullName: string | null; phone: string | null;
    status: "active" | "inactive" | "anonymized"; loyaltyPoints: number;
};
export type CustomerAddressAttributes = Timestamps & {
    id: BigIntId; customerId: BigIntId; recipientName: string; recipientPhone: string;
    addressLine: string; provinceId: number | null; districtId: number | null;
    wardCode: string | null; isDefault: boolean;
};
export type BranchAttributes = Timestamps & {
    id: BigIntId; code: string; name: string; address: string; phone: string | null;
    email: string | null; type: "central" | "branch"; managerEmployeeId: BigIntId | null;
};
export type EmployeeAttributes = Timestamps & {
    id: BigIntId; accountId: BigIntId | null; branchId: BigIntId; code: string;
    fullName: string; position: string | null; phone: string | null; email: string | null;
    salary: string | null; status: "active" | "inactive"; hiredAt: Date | null;
};

type New<Attributes extends { id: unknown }> = Optional<Attributes, "id">;

const bigintId = () => ({ type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true });
const integerId = () => ({ type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true });
const timestamps = {
    createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    updatedAt: { type: DataTypes.DATE, allowNull: false, field: "updated_at" },
};

export const createIdentityAccessPersistenceModule = (sequelize: Sequelize): V2PersistenceModule => {
    const Account = sequelize.define<Model<AccountAttributes, New<AccountAttributes>>>("Account", {
        id: bigintId(),
        email: { type: DataTypes.STRING(255), allowNull: false },
        username: { type: DataTypes.STRING(100), allowNull: true },
        passwordHash: { type: DataTypes.STRING(255), allowNull: true, field: "password_hash" },
        status: { type: DataTypes.ENUM("pending", "active", "locked", "inactive"), allowNull: false },
        emailVerifiedAt: { type: DataTypes.DATE, allowNull: true, field: "email_verified_at" },
        lastLoginAt: { type: DataTypes.DATE, allowNull: true, field: "last_login_at" },
        ...timestamps,
    }, v2ModelOptions("accounts"));

    const Role = sequelize.define<Model<RoleAttributes, New<RoleAttributes>>>("Role", {
        id: integerId(), code: { type: DataTypes.STRING(100), allowNull: false },
        name: { type: DataTypes.STRING(150), allowNull: false },
        description: { type: DataTypes.STRING(500), allowNull: true }, ...timestamps,
    }, v2ModelOptions("roles"));
    const Permission = sequelize.define<Model<PermissionAttributes, New<PermissionAttributes>>>("Permission", {
        id: integerId(), code: { type: DataTypes.STRING(150), allowNull: false },
        description: { type: DataTypes.STRING(500), allowNull: true }, ...timestamps,
    }, v2ModelOptions("permissions"));
    const RolePermission = sequelize.define<Model<RolePermissionAttributes, New<RolePermissionAttributes>>>("RolePermission", {
        id: bigintId(), roleId: { type: DataTypes.INTEGER, allowNull: false, field: "role_id" },
        permissionId: { type: DataTypes.INTEGER, allowNull: false, field: "permission_id" },
        createdAt: { type: DataTypes.DATE, allowNull: false, field: "created_at" },
    }, v2ModelOptions("role_permissions"));
    const AccountRole = sequelize.define<Model<AccountRoleAttributes, New<AccountRoleAttributes>>>("AccountRole", {
        id: bigintId(), accountId: { type: DataTypes.BIGINT, allowNull: false, field: "account_id" },
        roleId: { type: DataTypes.INTEGER, allowNull: false, field: "role_id" },
        scopeType: { type: DataTypes.ENUM("global", "branch"), allowNull: false, field: "scope_type" },
        scopeKey: { type: DataTypes.STRING(100), allowNull: false, field: "scope_key" },
        branchId: { type: DataTypes.BIGINT, allowNull: true, field: "branch_id" },
        assignedByAccountId: { type: DataTypes.BIGINT, allowNull: true, field: "assigned_by_account_id" },
        assignedAt: { type: DataTypes.DATE, allowNull: false, field: "assigned_at" },
    }, v2ModelOptions("account_roles"));
    const Customer = sequelize.define<Model<CustomerAttributes, New<CustomerAttributes>>>("Customer", {
        id: bigintId(), accountId: { type: DataTypes.BIGINT, allowNull: true, field: "account_id" },
        fullName: { type: DataTypes.STRING(255), allowNull: true, field: "full_name" },
        phone: { type: DataTypes.STRING(30), allowNull: true },
        status: { type: DataTypes.ENUM("active", "inactive", "anonymized"), allowNull: false },
        loyaltyPoints: { type: DataTypes.INTEGER, allowNull: false, field: "loyalty_points" }, ...timestamps,
    }, v2ModelOptions("customers"));
    const CustomerAddress = sequelize.define<Model<CustomerAddressAttributes, New<CustomerAddressAttributes>>>("CustomerAddress", {
        id: bigintId(), customerId: { type: DataTypes.BIGINT, allowNull: false, field: "customer_id" },
        recipientName: { type: DataTypes.STRING(255), allowNull: false, field: "recipient_name" },
        recipientPhone: { type: DataTypes.STRING(30), allowNull: false, field: "recipient_phone" },
        addressLine: { type: DataTypes.STRING(500), allowNull: false, field: "address_line" },
        provinceId: { type: DataTypes.INTEGER, allowNull: true, field: "province_id" },
        districtId: { type: DataTypes.INTEGER, allowNull: true, field: "district_id" },
        wardCode: { type: DataTypes.STRING(50), allowNull: true, field: "ward_code" },
        isDefault: { type: DataTypes.BOOLEAN, allowNull: false, field: "is_default" }, ...timestamps,
    }, v2ModelOptions("customer_addresses"));
    const Branch = sequelize.define<Model<BranchAttributes, New<BranchAttributes>>>("Branch", {
        id: bigintId(), code: { type: DataTypes.STRING(50), allowNull: false },
        name: { type: DataTypes.STRING(255), allowNull: false }, address: { type: DataTypes.STRING(500), allowNull: false },
        phone: { type: DataTypes.STRING(30), allowNull: true }, email: { type: DataTypes.STRING(255), allowNull: true },
        type: { type: DataTypes.ENUM("central", "branch"), allowNull: false },
        managerEmployeeId: { type: DataTypes.BIGINT, allowNull: true, field: "manager_employee_id" }, ...timestamps,
    }, v2ModelOptions("branches"));
    const Employee = sequelize.define<Model<EmployeeAttributes, New<EmployeeAttributes>>>("Employee", {
        id: bigintId(), accountId: { type: DataTypes.BIGINT, allowNull: true, field: "account_id" },
        branchId: { type: DataTypes.BIGINT, allowNull: false, field: "branch_id" }, code: { type: DataTypes.STRING(50), allowNull: false },
        fullName: { type: DataTypes.STRING(255), allowNull: false, field: "full_name" },
        position: { type: DataTypes.STRING(150), allowNull: true }, phone: { type: DataTypes.STRING(30), allowNull: true },
        email: { type: DataTypes.STRING(255), allowNull: true }, salary: { type: DataTypes.DECIMAL(19, 4), allowNull: true },
        status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false },
        hiredAt: { type: DataTypes.DATE, allowNull: true, field: "hired_at" }, ...timestamps,
    }, v2ModelOptions("employees"));

    return {
        name: "identity-access",
        models: [
            { name: "Account", model: Account }, { name: "Role", model: Role }, { name: "Permission", model: Permission },
            { name: "RolePermission", model: RolePermission }, { name: "AccountRole", model: AccountRole },
            { name: "Customer", model: Customer }, { name: "CustomerAddress", model: CustomerAddress },
            { name: "Branch", model: Branch }, { name: "Employee", model: Employee },
        ],
        associate: () => {
            Account.hasOne(Customer, { foreignKey: "accountId", as: "customer" });
            Account.hasOne(Employee, { foreignKey: "accountId", as: "employee" });
            Account.hasMany(AccountRole, { foreignKey: "accountId", as: "roleAssignments" });
            AccountRole.belongsTo(Account, { foreignKey: "accountId", as: "account" });
            AccountRole.belongsTo(Account, { foreignKey: "assignedByAccountId", as: "assignedBy" });
            Role.hasMany(AccountRole, { foreignKey: "roleId", as: "accountAssignments" });
            AccountRole.belongsTo(Role, { foreignKey: "roleId", as: "role" });
            Role.hasMany(RolePermission, { foreignKey: "roleId", as: "permissionAssignments" });
            RolePermission.belongsTo(Role, { foreignKey: "roleId", as: "role" });
            Permission.hasMany(RolePermission, { foreignKey: "permissionId", as: "roleAssignments" });
            RolePermission.belongsTo(Permission, { foreignKey: "permissionId", as: "permission" });
            Customer.belongsTo(Account, { foreignKey: "accountId", as: "account" });
            Customer.hasMany(CustomerAddress, { foreignKey: "customerId", as: "addresses" });
            CustomerAddress.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });
            Branch.hasMany(Employee, { foreignKey: "branchId", as: "employees" });
            Employee.belongsTo(Branch, { foreignKey: "branchId", as: "branch" });
            Branch.belongsTo(Employee, { foreignKey: "managerEmployeeId", as: "manager" });
            Employee.hasOne(Branch, { foreignKey: "managerEmployeeId", as: "managedBranch" });
        },
    };
};
