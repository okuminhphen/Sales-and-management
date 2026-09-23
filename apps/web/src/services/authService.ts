import axios from "../middlewares/axiosConfig";
import type { AdminSession, GoogleAccessTokenCredential } from "../types/auth";
import type { ApiEnvelope } from "../types/http";

const loginWithGoogle = (credential: GoogleAccessTokenCredential) => {
  return axios.post("/auth/google", { credential });
};

const verifyCaptcha = (recaptchaToken: string) => {
  return axios.post("/auth/verify-captcha", { recaptchaToken });
};

export interface ChallengeResponseData {
  challengeId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface VerifyResponseData {
  verificationToken?: string;
  expiresInSeconds?: number;
  attemptsRemaining?: number;
}

const createEmailVerificationChallenge = (email: string, recaptchaToken?: string) => {
  return axios.post<ApiEnvelope<ChallengeResponseData>>(
    "/auth/email-verification/challenges",
    recaptchaToken ? { email, recaptchaToken } : { email }
  );
};

const verifyEmailChallenge = (challengeId: string, otp: string) => {
  return axios.post<ApiEnvelope<VerifyResponseData>>(
    `/auth/email-verification/challenges/${challengeId}/verify`,
    { otp }
  );
};

const sendOTP = (email: string) => {
  return createEmailVerificationChallenge(email);
};

const verifyOTP = (otp: string, challengeId: string) => {
  return verifyEmailChallenge(challengeId, otp);
};

const loginAdmin = (username: string, password: string) => {
  return axios.post<ApiEnvelope<AdminSession>>("/admin/login", {
    username,
    password,
  });
};
export {
  loginWithGoogle,
  verifyCaptcha,
  verifyOTP,
  sendOTP,
  loginAdmin,
  createEmailVerificationChallenge,
  verifyEmailChallenge,
};
