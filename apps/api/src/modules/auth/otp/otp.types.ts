export interface OtpChallengeData {
    challengeId: string;
    email: string;
    emailHash: string;
    codeHash: string;
    attemptsRemaining: number;
    createdAt: number;
    expiresAt: number;
}

export type TokenStatus = "READY" | "CLAIMED";

export interface VerificationTokenData {
    token: string;
    email: string;
    status: TokenStatus;
    claimedAt?: number;
    createdAt: number;
    expiresAt: number;
}

export type ClaimTokenResult =
    | { success: true; error?: never }
    | { success: false; error: "NOT_FOUND" | "EXPIRED" | "EMAIL_MISMATCH" | "ALREADY_CLAIMED" };

export interface AtomicVerifyResult {
    status: "SUCCESS" | "INVALID_CODE" | "TOO_MANY_ATTEMPTS" | "NOT_FOUND" | "EXPIRED";
    attemptsRemaining?: number;
}

export interface CreateChallengeResult {
    challengeId: string;
    expiresInSeconds: number;
    resendAfterSeconds: number;
}

export type CreateChallengeOutcome =
    | {
          success: true;
          data: CreateChallengeResult;
          error?: never;
          retryAfterSeconds?: never;
          message?: never;
      }
    | {
          success: false;
          error: "COOLDOWN_ACTIVE";
          retryAfterSeconds: number;
          data?: never;
          message?: never;
      }
    | {
          success: false;
          error: "PROVIDER_ERROR";
          message: string;
          data?: never;
          retryAfterSeconds?: never;
      };

export interface VerifyOtpResult {
    success: boolean;
    verificationToken?: string;
    expiresInSeconds?: number;
    error?: "NOT_FOUND" | "EXPIRED" | "INVALID_CODE" | "TOO_MANY_ATTEMPTS";
    attemptsRemaining?: number;
}
