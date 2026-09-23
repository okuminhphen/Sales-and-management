import type { V2AccessContext } from "./access-context.js";

export type CustomerProfile = {
    accountId: string;
    customerId: string;
    email: string;
    username: string | null;
    fullName: string | null;
    phone: string | null;
};

export type CustomerProfilePatch = {
    username?: string;
    fullName?: string;
    phone?: string;
};

export type CustomerProfileUpdate = CustomerProfilePatch & {
    accountId: string;
    customerId: string;
};

export interface CustomerProfileV2Repository {
    findByAccountAndCustomerId: (accountId: string, customerId: string) => Promise<CustomerProfile | null>;
    updateOwnProfile: (input: CustomerProfileUpdate) => Promise<
        CustomerProfile | { kind: "username_already_exists" } | null
    >;
}

export type CustomerProfileResult =
    | { kind: "found"; profile: CustomerProfile }
    | { kind: "updated"; profile: CustomerProfile }
    | { kind: "customer_profile_required" }
    | { kind: "username_already_exists" }
    | { kind: "invalid_profile_update" }
    | { kind: "profile_unavailable" };

const normalizePatch = (patch: CustomerProfilePatch): CustomerProfilePatch | null => {
    const normalized = Object.fromEntries(
        Object.entries(patch)
            .filter(([, value]) => value !== undefined)
            .map(([key, value]) => [key, value!.trim()]),
    ) as CustomerProfilePatch;

    if (Object.keys(normalized).length === 0 || Object.values(normalized).some((value) => !value)) {
        return null;
    }
    return normalized;
};

/** Own-profile use-case. Email changes deliberately require a separate OTP flow. */
export class CustomerProfileV2Service {
    constructor(private readonly dependencies: { repository: CustomerProfileV2Repository }) {}

    async getOwnProfile(context: V2AccessContext): Promise<CustomerProfileResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        try {
            const profile = await this.dependencies.repository.findByAccountAndCustomerId(
                context.accountId,
                context.customerId,
            );
            return profile ? { kind: "found", profile } : { kind: "customer_profile_required" };
        } catch {
            return { kind: "profile_unavailable" };
        }
    }

    async updateOwnProfile(
        context: V2AccessContext,
        rawPatch: CustomerProfilePatch,
    ): Promise<CustomerProfileResult> {
        if (!context.customerId) return { kind: "customer_profile_required" };
        const patch = normalizePatch(rawPatch);
        if (!patch) return { kind: "invalid_profile_update" };

        try {
            const result = await this.dependencies.repository.updateOwnProfile({
                accountId: context.accountId,
                customerId: context.customerId,
                ...patch,
            });
            if (!result) return { kind: "customer_profile_required" };
            if ("kind" in result) return result;
            return { kind: "updated", profile: result };
        } catch {
            return { kind: "profile_unavailable" };
        }
    }
}
