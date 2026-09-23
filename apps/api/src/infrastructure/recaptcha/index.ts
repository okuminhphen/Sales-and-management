import type { RecaptchaVerifier } from "./recaptcha-verifier.port.js";
import { GoogleRecaptchaAdapter } from "./google-recaptcha.adapter.js";

export type {
    RecaptchaFailureReason,
    RecaptchaVerificationResult,
    RecaptchaVerifier,
    VerifyRecaptchaInput,
} from "./recaptcha-verifier.port.js";
export { GoogleRecaptchaAdapter, RecaptchaProviderError } from "./google-recaptcha.adapter.js";

let verifier: RecaptchaVerifier | undefined;

export const getRecaptchaVerifier = (): RecaptchaVerifier => {
    if (!verifier) verifier = new GoogleRecaptchaAdapter();
    return verifier;
};

export const setRecaptchaVerifier = (value: RecaptchaVerifier | undefined): void => {
    verifier = value;
};
