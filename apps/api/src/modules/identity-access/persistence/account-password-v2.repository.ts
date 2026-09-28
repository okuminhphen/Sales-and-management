import type { V2Persistence } from "../../../database/v2/persistence.js";
import type { AccountPasswordV2Repository } from "../application/account-password-v2.service.js";
import type { AccountAttributes } from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

export class SequelizeAccountPasswordV2Repository implements AccountPasswordV2Repository {
    private readonly account: IdentityAccessModel<AccountAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.account = getIdentityAccessModel<AccountAttributes>(persistence, "Account");
    }

    async getActivePasswordHash(accountId: string): Promise<string | null> {
        const account = await this.account.findOne({ where: { id: accountId, status: "active" } });
        return account?.dataValues.passwordHash ?? null;
    }

    async replacePasswordHash(input: { accountId: string; expectedHash: string; nextHash: string }): Promise<boolean> {
        return this.persistence.inTransaction(async (transaction) => {
            const account = await this.account.findByPk(input.accountId, {
                transaction, lock: transaction.LOCK.UPDATE,
            });
            if (!account || account.dataValues.status !== "active"
                || account.dataValues.passwordHash !== input.expectedHash) return false;
            await account.update({ passwordHash: input.nextHash, updatedAt: new Date() }, { transaction });
            return true;
        });
    }
}
