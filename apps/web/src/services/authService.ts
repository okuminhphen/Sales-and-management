import axios from "../middlewares/axiosConfig";
import type { AdminSession } from "../types/auth";
import type { ApiEnvelope } from "../types/http";

const loginWithGoogle = (credential: string) => {
  return axios.post("/auth/google", { credential });
};

const loginWithFacebook = (accessToken: string) => {
  return axios.post("/auth/facebook", { accessToken });
};

const verifyCaptcha = (recaptchaToken: string) => {
  return axios.post("/auth/verify-captcha", { recaptchaToken });
};

const sendOTP = (email: string) => {
  return axios.post("/auth/send-otp", { email });
};

const verifyOTP = (otp: string, email: string) => {
  return axios.post("/auth/verify-otp", { otp, email });
};

const loginAdmin = (username: string, password: string) => {
  return axios.post<ApiEnvelope<AdminSession>>("/admin/login", {
    username,
    password,
  });
};
export {
  loginWithGoogle,
  loginWithFacebook,
  verifyCaptcha,
  verifyOTP,
  sendOTP,
  loginAdmin,
};
