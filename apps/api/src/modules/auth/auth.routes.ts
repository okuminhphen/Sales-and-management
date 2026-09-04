import { Router } from "express";
import { validateRequest } from "../../middlewares/validateRequest.js";
import authController from "./admin-auth.controller.js";
import loginController from "./customer-auth.controller.js";
import {
    adminLoginBody,
    captchaBody,
    emailBody,
    googleLoginBody,
    loginBody,
    registerBody,
    verifyOtpBody,
} from "./auth.dto.js";

export const createAuthRouter = (): Router => {
    const router = Router();
    router.get("/test-api", loginController.testApi);
    router.post("/register", validateRequest({ body: registerBody }), loginController.handleRegister);
    router.post("/login", validateRequest({ body: loginBody }), loginController.handleLogin);
    router.post("/logout", loginController.handleLogout);
    router.post("/auth/google", validateRequest({ body: googleLoginBody }), loginController.handleGoogleLogin);
    router.post("/auth/verify-captcha", validateRequest({ body: captchaBody }), loginController.handleVerifyCaptcha);
    router.post("/auth/send-otp", validateRequest({ body: emailBody }), authController.handleSendOTP);
    router.post("/auth/verify-otp", validateRequest({ body: verifyOtpBody }), authController.handleVerifyOTPFunc);
    router.post("/admin/login", validateRequest({ body: adminLoginBody }), authController.handleAdminLoginController);
    return router;
};
