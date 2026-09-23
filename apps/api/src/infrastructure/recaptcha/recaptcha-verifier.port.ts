export type RecaptchaFailureReason =
    | "INVALID_TOKEN"
    | "ACTION_MISMATCH"
    | "SCORE_TOO_LOW"
    | "HOSTNAME_MISMATCH"
    | "PROVIDER_RESPONSE_INVALID";

export type RecaptchaVerificationResult =
    | { valid: true }
    | { valid: false; reason: RecaptchaFailureReason };

export interface VerifyRecaptchaInput {
    token: string;
    expectedAction: string;
    remoteIp?: string;
}

export interface RecaptchaVerifier {
    verify(input: VerifyRecaptchaInput): Promise<RecaptchaVerificationResult>;
}
