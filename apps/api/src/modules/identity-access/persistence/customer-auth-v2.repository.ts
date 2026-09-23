import {
    Op,
    UniqueConstraintError,
    type Model,
} from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    AccountAttributes,
    AccountRoleAttributes,
    CustomerAttributes,
    RoleAttributes,
} from "./identity-access.models.js";
import type {
    CustomerAuthV2Repository,
    CustomerCredential,
    RegisterVerifiedCustomerInput,
} from "../application/customer-auth-v2.service.js";
import {
    getIdentityAccessModel,
    type IdentityAccessModel,
    type NewEntity,
} from "./identity-access.model-types.js";

const customerRoleCode = "CUSTOMER" as const;

const isEmailUniqueConstraint = (error: UniqueConstraintError): boolean =>
    Object.prototype.hasOwnProperty.call(error.fields ?? {}, "email");

/**
 * MySQL adapter for the V2 customer credential flow. All Account, Customer and
 * AccountRole writes run in exactly one transaction; no legacy model is imported.
 */
export class SequelizeCustomerAuthV2Repository implements CustomerAuthV2Repository {
    private readonly account: IdentityAccessModel<AccountAttributes>;
    private readonly accountRole: IdentityAccessModel<AccountRoleAttributes>;
    private readonly customer: IdentityAccessModel<CustomerAttributes>;
    private readonly role: IdentityAccessModel<RoleAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.account = getIdentityAccessModel<AccountAttributes>(persistence, "Account");
        this.accountRole = getIdentityAccessModel<AccountRoleAttributes>(persistence, "AccountRole");
        this.customer = getIdentityAccessModel<CustomerAttributes>(persistence, "Customer");
        this.role = getIdentityAccessModel<RoleAttributes>(persistence, "Role");
    }

    async registerVerifiedCustomer(input: RegisterVerifiedCustomerInput): Promise<
        | { kind: "created"; accountId: string; customerId: string }
        | { kind: "email_already_exists" }
    > {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const existingAccount = await this.account.findOne({
                    where: { email: input.email },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (existingAccount) return { kind: "email_already_exists" } as const;

                const customerRole = await this.role.findOne({
                    where: { code: customerRoleCode },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (!customerRole) {
                    throw new Error("Database V2 is missing the required CUSTOMER role.");
                }

                const now = new Date();
                await this.account.create({
                    email: input.email,
                    username: input.username,
                    passwordHash: input.passwordHash,
                    status: "active",
                    emailVerifiedAt: now,
                    lastLoginAt: null,
                    createdAt: now,
                    updatedAt: now,
                }, { transaction });
                // mysql2 reports insertId as a JavaScript number. Re-read through the
                // BIGINT-string connection boundary rather than ever serializing that number.
                const persistedAccount = await this.account.findOne({
                    where: { email: input.email },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (!persistedAccount) {
                    throw new Error("Database V2 did not persist the newly created account.");
                }
                const accountId = serializeEntityId(persistedAccount.dataValues.id);
                await this.customer.create({
                    accountId,
                    fullName: input.username,
                    phone: input.phone,
                    status: "active",
                    loyaltyPoints: 0,
                    createdAt: now,
                    updatedAt: now,
                }, { transaction });
                const persistedCustomer = await this.customer.findOne({
                    where: { accountId },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (!persistedCustomer) {
                    throw new Error("Database V2 did not persist the newly created customer.");
                }
                const customerId = serializeEntityId(persistedCustomer.dataValues.id);

                await this.accountRole.create({
                    accountId,
                    roleId: customerRole.dataValues.id,
                    scopeType: "global",
                    scopeKey: "GLOBAL",
                    branchId: null,
                    assignedByAccountId: null,
                    assignedAt: now,
                }, { transaction });

                return { kind: "created", accountId, customerId } as const;
            });
        } catch (error) {
            if (error instanceof UniqueConstraintError && isEmailUniqueConstraint(error)) {
                return { kind: "email_already_exists" };
            }
            throw error;
        }
    }

    async findCredentialByEmailOrPhone(identifier: string): Promise<CustomerCredential | null> {
        const customer = await this.findCustomer(identifier);
        if (!customer?.dataValues.accountId) return null;

        const accountId = serializeEntityId(customer.dataValues.accountId);
        const [account, customerRole] = await Promise.all([
            this.account.findByPk(accountId),
            this.role.findOne({ where: { code: customerRoleCode } }),
        ]);
        if (!account || !customerRole) return null;

        const assignment = await this.accountRole.findOne({
            where: {
                accountId,
                roleId: customerRole.dataValues.id,
                scopeType: "global",
                scopeKey: "GLOBAL",
            },
        });
        if (!assignment) return null;

        return {
            accountId,
            customerId: serializeEntityId(customer.dataValues.id),
            email: account.dataValues.email,
            passwordHash: account.dataValues.passwordHash,
            accountStatus: account.dataValues.status,
            customerStatus: customer.dataValues.status,
            role: { code: customerRoleCode, name: customerRole.dataValues.name },
        };
    }

    async recordSuccessfulLogin(accountId: string): Promise<void> {
        const now = new Date();
        await this.account.update(
            { lastLoginAt: now, updatedAt: now },
            { where: { id: accountId } },
        );
    }

    private async findCustomer(identifier: string): Promise<Model<CustomerAttributes, NewEntity<CustomerAttributes>> | null> {
        if (identifier.includes("@")) {
            const account = await this.account.findOne({ where: { email: identifier } });
            if (!account) return null;
            return this.customer.findOne({ where: { accountId: serializeEntityId(account.dataValues.id) } });
        }

        const customers = await this.customer.findAll({
            where: {
                phone: identifier,
                accountId: { [Op.not]: null },
            },
            limit: 2,
        });
        return customers.length === 1 ? customers[0]! : null;
    }
}
