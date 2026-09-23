import { UniqueConstraintError } from "sequelize";
import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    CustomerProfile,
    CustomerProfileUpdate,
    CustomerProfileV2Repository,
} from "../application/customer-profile-v2.service.js";
import type { AccountAttributes, CustomerAttributes } from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

const isUsernameUniqueConstraint = (error: unknown): boolean => {
    if (error instanceof UniqueConstraintError) return true;
    if (!error || typeof error !== "object") return false;
    const parent = "parent" in error ? error.parent : undefined;
    return Boolean(
        parent
        && typeof parent === "object"
        && "code" in parent
        && parent.code === "ER_DUP_ENTRY",
    );
};

const toProfile = (account: AccountAttributes, customer: CustomerAttributes): CustomerProfile => ({
    accountId: serializeEntityId(account.id),
    customerId: serializeEntityId(customer.id),
    email: account.email,
    username: account.username,
    fullName: customer.fullName,
    phone: customer.phone,
});

/** MySQL adapter for the account + customer profile aggregate. */
export class SequelizeCustomerProfileV2Repository implements CustomerProfileV2Repository {
    private readonly account: IdentityAccessModel<AccountAttributes>;
    private readonly customer: IdentityAccessModel<CustomerAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.account = getIdentityAccessModel<AccountAttributes>(persistence, "Account");
        this.customer = getIdentityAccessModel<CustomerAttributes>(persistence, "Customer");
    }

    async findByAccountAndCustomerId(accountId: string, customerId: string): Promise<CustomerProfile | null> {
        const [account, customer] = await Promise.all([
            this.account.findByPk(accountId),
            this.customer.findOne({ where: { id: customerId, accountId } }),
        ]);
        if (
            !account
            || !customer
            || account.dataValues.status !== "active"
            || customer.dataValues.status !== "active"
        ) return null;

        return toProfile(account.dataValues, customer.dataValues);
    }

    async updateOwnProfile(input: CustomerProfileUpdate): Promise<
        CustomerProfile | { kind: "username_already_exists" } | null
    > {
        try {
            return await this.persistence.inTransaction(async (transaction) => {
                const customer = await this.customer.findOne({
                    where: { id: input.customerId, accountId: input.accountId },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                const account = await this.account.findByPk(input.accountId, {
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (
                    !account
                    || !customer
                    || account.dataValues.status !== "active"
                    || customer.dataValues.status !== "active"
                ) return null;

                const now = new Date();
                if (input.username !== undefined) {
                    await account.update({ username: input.username, updatedAt: now }, { transaction });
                }
                if (input.fullName !== undefined || input.phone !== undefined) {
                    await customer.update({
                        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
                        ...(input.phone !== undefined ? { phone: input.phone } : {}),
                        updatedAt: now,
                    }, { transaction });
                }
                return toProfile(account.dataValues, customer.dataValues);
            });
        } catch (error) {
            if (error instanceof UniqueConstraintError && isUsernameUniqueConstraint(error)) {
                return { kind: "username_already_exists" };
            }
            throw error;
        }
    }
}
