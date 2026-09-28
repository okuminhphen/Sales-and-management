import type { PasswordHasher } from "./password-hasher.js";
import type { V2AccessContext } from "./access-context.js";

export interface AccountPasswordV2Repository {
    getActivePasswordHash: (accountId: string) => Promise<string | null>;
    replacePasswordHash: (input: { accountId: string; expectedHash: string; nextHash: string }) => Promise<boolean>;
}

export type ChangeOwnPasswordResult =
    | { kind: "password_changed" }
    | { kind: "invalid_current_password" | "password_change_conflict" | "password_change_unavailable" };

export class AccountPasswordV2Service {
    constructor(private readonly dependencies: {
        repository: AccountPasswordV2Repository;
        passwordHasher: PasswordHasher;
    }) {}

    async changeOwnPassword(context: V2AccessContext, currentPassword: string, newPassword: string): Promise<ChangeOwnPasswordResult> {
        try {
            const currentHash = await this.dependencies.repository.getActivePasswordHash(context.accountId);
            if (!currentHash || !await this.dependencies.passwordHasher.compare(currentPassword, currentHash)) {
                return { kind: "invalid_current_password" };
            }
            if (await this.dependencies.passwordHasher.compare(newPassword, currentHash)) {
                return { kind: "password_change_conflict" };
            }
            const nextHash = await this.dependencies.passwordHasher.hash(newPassword);
            return await this.dependencies.repository.replacePasswordHash({
                accountId: context.accountId, expectedHash: currentHash, nextHash,
            }) ? { kind: "password_changed" } : { kind: "password_change_conflict" };
        } catch {
            return { kind: "password_change_unavailable" };
        }
    }
}
