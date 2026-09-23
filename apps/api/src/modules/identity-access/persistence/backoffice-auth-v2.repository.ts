import type { V2Persistence } from "../../../database/v2/persistence.js";
import { serializeEntityId } from "../../../shared/contracts/database-scalars.js";
import type {
    BackofficeAuthV2Repository,
    BackofficeCredential,
} from "../application/backoffice-auth-v2.service.js";
import type { AccountAttributes } from "./identity-access.models.js";
import { getIdentityAccessModel, type IdentityAccessModel } from "./identity-access.model-types.js";

/** Sequelize adapter for backoffice credentials. Authorization is read separately. */
export class SequelizeBackofficeAuthV2Repository implements BackofficeAuthV2Repository {
    private readonly account: IdentityAccessModel<AccountAttributes>;

    constructor(private readonly persistence: V2Persistence) {
        this.account = getIdentityAccessModel<AccountAttributes>(persistence, "Account");
    }

    async findCredentialByUsername(username: string): Promise<BackofficeCredential | null> {
        if (!username) return null;
        const account = await this.account.findOne({ where: { username } });
        if (!account) return null;

        return {
            accountId: serializeEntityId(account.dataValues.id),
            passwordHash: account.dataValues.passwordHash,
            accountStatus: account.dataValues.status,
        };
    }

    async recordSuccessfulLogin(accountId: string): Promise<void> {
        const now = new Date();
        await this.account.update({ lastLoginAt: now, updatedAt: now }, { where: { id: accountId } });
    }
}
