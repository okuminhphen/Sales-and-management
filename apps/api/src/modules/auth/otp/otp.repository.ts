import type { RedisClientType } from "@redis/client";
import { getRedisClient } from "../../../config/redis.js";
import type {
    AtomicVerifyResult,
    ClaimTokenResult,
    OtpChallengeData,
    VerificationTokenData,
} from "./otp.types.js";

export interface IOtpStorage {
    saveChallenge(challenge: OtpChallengeData, ttlSeconds: number): Promise<void>;
    getChallenge(challengeId: string): Promise<OtpChallengeData | null>;
    deleteChallenge(challengeId: string, emailHash?: string): Promise<void>;
    claimCooldown(emailHash: string, ttlSeconds: number): Promise<{ acquired: boolean; remainingTtl: number }>;
    releaseCooldown(emailHash: string): Promise<void>;
    getCooldownTtl(emailHash: string): Promise<number>;
    getActiveChallengeId(emailHash: string): Promise<string | null>;
    setActiveChallengeId(emailHash: string, challengeId: string, ttlSeconds: number): Promise<void>;

    // Atomic OTP verification (Critical 1)
    atomicVerifyChallenge(
        challengeId: string,
        codeHash: string,
        tokenData: VerificationTokenData,
        tokenTtlSeconds: number
    ): Promise<AtomicVerifyResult>;

    // Verification token lifecycle (Required 3)
    saveVerificationToken(tokenData: VerificationTokenData, ttlSeconds: number): Promise<void>;
    getVerificationToken(token: string): Promise<VerificationTokenData | null>;
    claimVerificationToken(
        token: string,
        normalizedEmail: string,
        claimTimeoutMs?: number
    ): Promise<ClaimTokenResult>;
    releaseVerificationToken(token: string): Promise<boolean>;
    finalizeVerificationToken(token: string): Promise<boolean>;
}

export class RedisOtpStorage implements IOtpStorage {
    constructor(private readonly getClient: () => RedisClientType = getRedisClient) {}

    private challengeKey(challengeId: string): string {
        return `otp:challenge:${challengeId}`;
    }

    private cooldownKey(emailHash: string): string {
        return `otp:cooldown:${emailHash}`;
    }

    private activeKey(emailHash: string): string {
        return `otp:active:${emailHash}`;
    }

    private verifyKey(token: string): string {
        return `otp:verify:${token}`;
    }

    async saveChallenge(challenge: OtpChallengeData, ttlSeconds: number): Promise<void> {
        const client = this.getClient();
        await client.set(this.challengeKey(challenge.challengeId), JSON.stringify(challenge), {
            EX: ttlSeconds,
        });
    }

    async getChallenge(challengeId: string): Promise<OtpChallengeData | null> {
        const client = this.getClient();
        const data = await client.get(this.challengeKey(challengeId));
        if (typeof data !== "string" || !data) return null;
        try {
            return JSON.parse(data) as OtpChallengeData;
        } catch {
            return null;
        }
    }

    async deleteChallenge(challengeId: string, emailHash?: string): Promise<void> {
        const client = this.getClient();
        const keys = [this.challengeKey(challengeId)];
        if (emailHash) {
            keys.push(this.activeKey(emailHash));
        }
        await client.del(keys);
    }

    async claimCooldown(
        emailHash: string,
        ttlSeconds: number
    ): Promise<{ acquired: boolean; remainingTtl: number }> {
        const client = this.getClient();
        const key = this.cooldownKey(emailHash);
        const result = await client.set(key, "1", { EX: ttlSeconds, NX: true });
        if (result === "OK") {
            return { acquired: true, remainingTtl: ttlSeconds };
        }
        const ttl = await client.ttl(key);
        return { acquired: false, remainingTtl: ttl > 0 ? ttl : ttlSeconds };
    }

    async releaseCooldown(emailHash: string): Promise<void> {
        const client = this.getClient();
        await client.del(this.cooldownKey(emailHash));
    }

    async getCooldownTtl(emailHash: string): Promise<number> {
        const client = this.getClient();
        const ttl = await client.ttl(this.cooldownKey(emailHash));
        return ttl > 0 ? ttl : 0;
    }

    async getActiveChallengeId(emailHash: string): Promise<string | null> {
        const client = this.getClient();
        const data = await client.get(this.activeKey(emailHash));
        return typeof data === "string" ? data : null;
    }

    async setActiveChallengeId(emailHash: string, challengeId: string, ttlSeconds: number): Promise<void> {
        const client = this.getClient();
        await client.set(this.activeKey(emailHash), challengeId, { EX: ttlSeconds });
    }

    async atomicVerifyChallenge(
        challengeId: string,
        codeHash: string,
        tokenData: VerificationTokenData,
        tokenTtlSeconds: number
    ): Promise<AtomicVerifyResult> {
        const client = this.getClient();
        const script = `
            local challengeRaw = redis.call('GET', KEYS[1])
            if not challengeRaw then
                return cjson.encode({ status = "NOT_FOUND" })
            end

            local challenge = cjson.decode(challengeRaw)
            local remaining = tonumber(challenge.attemptsRemaining)

            if remaining <= 0 then
                redis.call('DEL', KEYS[1])
                if challenge.emailHash then
                    redis.call('DEL', 'otp:active:' .. challenge.emailHash)
                end
                return cjson.encode({ status = "TOO_MANY_ATTEMPTS", attemptsRemaining = 0 })
            end

            if challenge.codeHash == ARGV[1] then
                redis.call('DEL', KEYS[1])
                if challenge.emailHash then
                    redis.call('DEL', 'otp:active:' .. challenge.emailHash)
                end
                redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[3]))
                return cjson.encode({ status = "SUCCESS" })
            else
                remaining = remaining - 1
                challenge.attemptsRemaining = remaining
                if remaining <= 0 then
                    redis.call('DEL', KEYS[1])
                    if challenge.emailHash then
                        redis.call('DEL', 'otp:active:' .. challenge.emailHash)
                    end
                    return cjson.encode({ status = "TOO_MANY_ATTEMPTS", attemptsRemaining = 0 })
                else
                    local ttl = redis.call('TTL', KEYS[1])
                    if ttl > 0 then
                        redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
                    else
                        redis.call('DEL', KEYS[1])
                        return cjson.encode({ status = "NOT_FOUND" })
                    end
                    return cjson.encode({ status = "INVALID_CODE", attemptsRemaining = remaining })
                end
            end
        `;

        const challengeKey = this.challengeKey(challengeId);
        const tokenKey = this.verifyKey(tokenData.token);
        const result = await client.eval(script, {
            keys: [challengeKey, tokenKey],
            arguments: [codeHash, JSON.stringify(tokenData), tokenTtlSeconds.toString()],
        });

        if (typeof result !== "string") {
            return { status: "NOT_FOUND" };
        }
        return JSON.parse(result) as AtomicVerifyResult;
    }

    async saveVerificationToken(tokenData: VerificationTokenData, ttlSeconds: number): Promise<void> {
        const client = this.getClient();
        await client.set(this.verifyKey(tokenData.token), JSON.stringify(tokenData), {
            EX: ttlSeconds,
        });
    }

    async getVerificationToken(token: string): Promise<VerificationTokenData | null> {
        const client = this.getClient();
        const data = await client.get(this.verifyKey(token));
        if (typeof data !== "string" || !data) return null;
        try {
            return JSON.parse(data) as VerificationTokenData;
        } catch {
            return null;
        }
    }

    async claimVerificationToken(
        token: string,
        normalizedEmail: string,
        claimTimeoutMs = 60000
    ): Promise<ClaimTokenResult> {
        const client = this.getClient();
        const script = `
            local tokenRaw = redis.call('GET', KEYS[1])
            if not tokenRaw then
                return cjson.encode({ success = false, error = "NOT_FOUND" })
            end

            local tokenData = cjson.decode(tokenRaw)

            if tokenData.email ~= ARGV[1] then
                return cjson.encode({ success = false, error = "EMAIL_MISMATCH" })
            end

            local now = tonumber(ARGV[3])
            local claimDuration = tonumber(ARGV[2])
            if tokenData.status == "CLAIMED" then
                local claimedAt = tonumber(tokenData.claimedAt or 0)
                if (now - claimedAt) < claimDuration then
                    return cjson.encode({ success = false, error = "ALREADY_CLAIMED" })
                end
            end

            tokenData.status = "CLAIMED"
            tokenData.claimedAt = now

            local ttl = redis.call('TTL', KEYS[1])
            if ttl > 0 then
                redis.call('SET', KEYS[1], cjson.encode(tokenData), 'EX', ttl)
                return cjson.encode({ success = true })
            else
                redis.call('DEL', KEYS[1])
                return cjson.encode({ success = false, error = "EXPIRED" })
            end
        `;

        const tokenKey = this.verifyKey(token);
        const result = await client.eval(script, {
            keys: [tokenKey],
            arguments: [normalizedEmail, claimTimeoutMs.toString(), Date.now().toString()],
        });

        if (typeof result !== "string") {
            return { success: false, error: "NOT_FOUND" };
        }
        return JSON.parse(result) as ClaimTokenResult;
    }

    async releaseVerificationToken(token: string): Promise<boolean> {
        const client = this.getClient();
        const script = `
            local tokenRaw = redis.call('GET', KEYS[1])
            if not tokenRaw then
                return 0
            end

            local tokenData = cjson.decode(tokenRaw)
            if tokenData.status == "CLAIMED" then
                tokenData.status = "READY"
                tokenData.claimedAt = nil
                local ttl = redis.call('TTL', KEYS[1])
                if ttl > 0 then
                    redis.call('SET', KEYS[1], cjson.encode(tokenData), 'EX', ttl)
                    return 1
                end
            end
            return 0
        `;

        const tokenKey = this.verifyKey(token);
        const result = await client.eval(script, {
            keys: [tokenKey],
            arguments: [],
        });
        return result === 1;
    }

    async finalizeVerificationToken(token: string): Promise<boolean> {
        const client = this.getClient();
        const tokenKey = this.verifyKey(token);
        const deleted = await client.del(tokenKey);
        return deleted > 0;
    }
}

export class MemoryOtpStorage implements IOtpStorage {
    private challenges = new Map<string, { data: OtpChallengeData; expiresAtMs: number }>();
    private cooldowns = new Map<string, number>();
    private activeChallenges = new Map<string, string>();
    private verificationTokens = new Map<string, { data: VerificationTokenData; expiresAtMs: number }>();

    async saveChallenge(challenge: OtpChallengeData, ttlSeconds: number): Promise<void> {
        this.challenges.set(challenge.challengeId, {
            data: { ...challenge },
            expiresAtMs: Date.now() + ttlSeconds * 1000,
        });
    }

    async getChallenge(challengeId: string): Promise<OtpChallengeData | null> {
        const entry = this.challenges.get(challengeId);
        if (!entry) return null;
        if (Date.now() > entry.expiresAtMs) {
            this.challenges.delete(challengeId);
            return null;
        }
        return { ...entry.data };
    }

    async deleteChallenge(challengeId: string, emailHash?: string): Promise<void> {
        this.challenges.delete(challengeId);
        if (emailHash) {
            this.activeChallenges.delete(emailHash);
        }
    }

    async claimCooldown(
        emailHash: string,
        ttlSeconds: number
    ): Promise<{ acquired: boolean; remainingTtl: number }> {
        const now = Date.now();
        const existingExpires = this.cooldowns.get(emailHash);
        if (existingExpires && existingExpires > now) {
            return {
                acquired: false,
                remainingTtl: Math.ceil((existingExpires - now) / 1000),
            };
        }
        this.cooldowns.set(emailHash, now + ttlSeconds * 1000);
        return { acquired: true, remainingTtl: ttlSeconds };
    }

    async releaseCooldown(emailHash: string): Promise<void> {
        this.cooldowns.delete(emailHash);
    }

    async getCooldownTtl(emailHash: string): Promise<number> {
        const expiresAt = this.cooldowns.get(emailHash);
        if (!expiresAt) return 0;
        const remainingMs = expiresAt - Date.now();
        if (remainingMs <= 0) {
            this.cooldowns.delete(emailHash);
            return 0;
        }
        return Math.ceil(remainingMs / 1000);
    }

    async getActiveChallengeId(emailHash: string): Promise<string | null> {
        return this.activeChallenges.get(emailHash) ?? null;
    }

    async setActiveChallengeId(emailHash: string, challengeId: string, _ttlSeconds: number): Promise<void> {
        this.activeChallenges.set(emailHash, challengeId);
    }

    async atomicVerifyChallenge(
        challengeId: string,
        codeHash: string,
        tokenData: VerificationTokenData,
        tokenTtlSeconds: number
    ): Promise<AtomicVerifyResult> {
        const entry = this.challenges.get(challengeId);
        if (!entry || Date.now() > entry.expiresAtMs) {
            if (entry) this.challenges.delete(challengeId);
            return { status: "NOT_FOUND" };
        }

        const challenge = entry.data;
        if (challenge.attemptsRemaining <= 0) {
            this.challenges.delete(challengeId);
            if (challenge.emailHash) this.activeChallenges.delete(challenge.emailHash);
            return { status: "TOO_MANY_ATTEMPTS", attemptsRemaining: 0 };
        }

        if (challenge.codeHash === codeHash) {
            this.challenges.delete(challengeId);
            if (challenge.emailHash) this.activeChallenges.delete(challenge.emailHash);
            this.verificationTokens.set(tokenData.token, {
                data: { ...tokenData, status: "READY" },
                expiresAtMs: Date.now() + tokenTtlSeconds * 1000,
            });
            return { status: "SUCCESS" };
        }

        challenge.attemptsRemaining -= 1;
        if (challenge.attemptsRemaining <= 0) {
            this.challenges.delete(challengeId);
            if (challenge.emailHash) this.activeChallenges.delete(challenge.emailHash);
            return { status: "TOO_MANY_ATTEMPTS", attemptsRemaining: 0 };
        }

        return { status: "INVALID_CODE", attemptsRemaining: challenge.attemptsRemaining };
    }

    async saveVerificationToken(tokenData: VerificationTokenData, ttlSeconds: number): Promise<void> {
        this.verificationTokens.set(tokenData.token, {
            data: { ...tokenData },
            expiresAtMs: Date.now() + ttlSeconds * 1000,
        });
    }

    async getVerificationToken(token: string): Promise<VerificationTokenData | null> {
        const entry = this.verificationTokens.get(token);
        if (!entry) return null;
        if (Date.now() > entry.expiresAtMs) {
            this.verificationTokens.delete(token);
            return null;
        }
        return { ...entry.data };
    }

    async claimVerificationToken(
        token: string,
        normalizedEmail: string,
        claimTimeoutMs = 60000
    ): Promise<ClaimTokenResult> {
        const entry = this.verificationTokens.get(token);
        if (!entry || Date.now() > entry.expiresAtMs) {
            if (entry) this.verificationTokens.delete(token);
            return { success: false, error: "NOT_FOUND" };
        }

        const tokenData = entry.data;
        if (tokenData.email !== normalizedEmail) {
            return { success: false, error: "EMAIL_MISMATCH" };
        }

        const now = Date.now();
        if (tokenData.status === "CLAIMED") {
            const claimedAt = tokenData.claimedAt ?? 0;
            if (now - claimedAt < claimTimeoutMs) {
                return { success: false, error: "ALREADY_CLAIMED" };
            }
        }

        tokenData.status = "CLAIMED";
        tokenData.claimedAt = now;
        return { success: true };
    }

    async releaseVerificationToken(token: string): Promise<boolean> {
        const entry = this.verificationTokens.get(token);
        if (!entry) return false;
        if (entry.data.status === "CLAIMED") {
            entry.data.status = "READY";
            delete entry.data.claimedAt;
            return true;
        }
        return false;
    }

    async finalizeVerificationToken(token: string): Promise<boolean> {
        return this.verificationTokens.delete(token);
    }

    clear(): void {
        this.challenges.clear();
        this.cooldowns.clear();
        this.activeChallenges.clear();
        this.verificationTokens.clear();
    }
}

let defaultOtpStorage: IOtpStorage | undefined;

export const getOtpStorage = (): IOtpStorage => {
    if (!defaultOtpStorage) {
        defaultOtpStorage = new RedisOtpStorage();
    }
    return defaultOtpStorage;
};

export const setOtpStorage = (storage: IOtpStorage | undefined): void => {
    defaultOtpStorage = storage;
};
