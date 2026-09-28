import { Router, type RequestHandler } from "express";
import { validateRequest } from "../../../../middlewares/validateRequest.js";
import { rateLimit } from "../../../../middlewares/rateLimit.js";
import { createV2HttpAudit, type V2HttpAuditWriter } from "../../../../observability/v2-http-audit.js";
import { signV2AccessToken } from "../../../../security/v2-access-token.js";
import type { V2AccessContext, V2AccessContextReader } from "../../application/access-context.js";
import type { CustomerAuthV2Service } from "../../application/customer-auth-v2.service.js";
import type { BackofficeAuthV2Service } from "../../application/backoffice-auth-v2.service.js";
import type { CustomerProfileV2Service } from "../../application/customer-profile-v2.service.js";
import type { AccountPasswordV2Service } from "../../application/account-password-v2.service.js";
import type { V2AuthenticatedRequest } from "./v2-auth.middleware.js";
import { backofficeLoginV2Body, customerLoginV2Body, ownCustomerParamsV2,
    ownCustomerPatchV2, ownCustomerUpdateParamsV2, ownPasswordChangeV2, registerV2Body } from "./identity-v2.dto.js";

const envelope = (EM: string, EC: number, DT: unknown) => ({ EM, EC, DT });
const tokenFor = (context: V2AccessContext): string => signV2AccessToken({
    version: 2, accountId: context.accountId, customerId: context.customerId,
    employeeId: context.employeeId,
    roleGrants: context.grants.map(({ roleCode, scope }) => ({ roleCode, scope })),
});
const setCookie = (response: Parameters<RequestHandler>[1], token: string): void => {
    response.cookie("token", token, { httpOnly: true, secure: process.env.NODE_ENV === "production",
        sameSite: "lax", maxAge: 15 * 60 * 1000 });
};

/** Standalone V2 routes. The legacy app is switched only at the final cutover. */
export const createIdentityV2Routes = (dependencies: {
    customerAuth: CustomerAuthV2Service;
    backofficeAuth: BackofficeAuthV2Service;
    profiles: CustomerProfileV2Service;
    passwords: AccountPasswordV2Service;
    contexts: V2AccessContextReader;
    auth: RequestHandler;
    audit?: V2HttpAuditWriter;
    loginRateLimit?: RequestHandler;
    loginRecaptcha?: RequestHandler;
}): Router => {
    const router = Router();
    const loginLimit = dependencies.loginRateLimit ?? rateLimit({ keyPrefix: "rate-limit:v2-auth:ip",
        maxRequests: 10, windowSeconds: 60, failClosed: true });

    router.post("/register", createV2HttpAudit("auth.register", dependencies.audit), loginLimit,
        validateRequest({ body: registerV2Body }), async (request, response) => {
            const result = await dependencies.customerAuth.register(request.body);
            switch (result.kind) {
                case "registered":
                    response.locals.auditResourceId = result.accountId;
                    response.status(200).json(envelope("Register successfully", 0,
                        { accountId: result.accountId, customerId: result.customerId })); return;
                case "email_already_exists":
                    response.status(409).json(envelope("Email already exists", 1, null)); return;
                case "username_already_exists":
                    response.status(409).json(envelope("Username already exists", 1, null)); return;
                case "verification_email_mismatch":
                case "verification_already_claimed":
                case "verification_invalid":
                    response.status(400).json(envelope("Email verification invalid", 1, null)); return;
                case "registration_unavailable":
                    response.status(503).json(envelope("Registration unavailable", -1, null)); return;
            }
        });
    router.post("/login", loginLimit, ...(dependencies.loginRecaptcha ? [dependencies.loginRecaptcha] : []),
        validateRequest({ body: customerLoginV2Body }),
        async (request, response) => {
            const result = await dependencies.customerAuth.login(request.body);
            if (result.kind === "invalid_credentials") {
                response.status(401).json(envelope("Invalid credentials", 1, null)); return;
            }
            if (result.kind === "authentication_unavailable") {
                response.status(503).json(envelope("Authentication unavailable", -1, null)); return;
            }
            try {
                const context = await dependencies.contexts.findActiveByAccountId(result.accountId);
                if (!context || context.customerId !== result.customerId) {
                    response.status(401).json(envelope("Invalid credentials", 1, null)); return;
                }
                const token = tokenFor(context);
                setCookie(response, token);
                response.status(200).json(envelope("Login successfully", 0, { token,
                    accountId: result.accountId, customerId: result.customerId, userId: result.customerId,
                    email: result.email, userRole: { name: result.role.code } }));
            } catch {
                response.status(503).json(envelope("Authentication unavailable", -1, null));
            }
        });
    router.post("/admin/login", loginLimit, validateRequest({ body: backofficeLoginV2Body }),
        async (request, response) => {
            const result = await dependencies.backofficeAuth.login(request.body);
            if (result.kind === "invalid_credentials") {
                response.status(401).json(envelope("Invalid credentials", 1, null)); return;
            }
            if (result.kind === "authentication_unavailable") {
                response.status(503).json(envelope("Authentication unavailable", -1, null)); return;
            }
            const context = result.context;
            const internal = context.grants.find((grant) => grant.roleCode !== "CUSTOMER");
            if (!internal) { response.status(401).json(envelope("Invalid credentials", 1, null)); return; }
            try {
                const token = tokenFor(context);
                setCookie(response, token);
                response.status(200).json(envelope("Login successfully", 0, { token,
                    accountId: context.accountId, adminId: context.accountId,
                    employeeId: context.employeeId, role: internal.roleCode,
                    roleGrants: context.grants.map(({ roleCode, scope }) => ({ roleCode, scope })) }));
            } catch {
                response.status(503).json(envelope("Authentication unavailable", -1, null));
            }
        });

    router.post("/logout", (_request, response) => {
        response.clearCookie("token", { httpOnly: true, secure: process.env.NODE_ENV === "production",
            sameSite: "lax" });
        response.status(200).json(envelope("Logout successfully", 0, null));
    });

    const profile = (request: V2AuthenticatedRequest) => request.v2AccessContext;
    router.get("/profile", dependencies.auth, (request, response) => {
        const context = profile(request);
        if (!context) { response.status(401).json(envelope("Authentication required", 3, null)); return; }
        response.status(200).json(envelope("Get profile successfully", 0, {
            accountId: context.accountId, customerId: context.customerId, employeeId: context.employeeId,
            roles: context.grants.map(({ roleCode, scope }) => ({ roleCode, scope })),
        }));
    });
    router.get("/user/:id", dependencies.auth, validateRequest({ params: ownCustomerParamsV2 }),
        async (request, response) => {
            const context = profile(request);
            if (!context) { response.status(401).json(envelope("Authentication required", 3, null)); return; }
            if (context.customerId !== request.params.id) {
                response.status(403).json(envelope("User access denied", 3, null)); return;
            }
            const result = await dependencies.profiles.getOwnProfile(context);
            if (result.kind === "profile_unavailable") {
                response.status(503).json(envelope("Profile unavailable", -1, null)); return;
            }
            if (result.kind !== "found") {
                response.status(404).json(envelope("Customer not found", 1, null)); return;
            }
            response.status(200).json(envelope("Get user successfully", 0, {
                userId: result.profile.customerId, accountId: result.profile.accountId,
                email: result.profile.email, username: result.profile.username,
                fullname: result.profile.fullName, phone: result.profile.phone,
            }));
        });
    router.put("/user/update/:userId", createV2HttpAudit("customer.profile.update", dependencies.audit),
        dependencies.auth, validateRequest({ params: ownCustomerUpdateParamsV2, body: ownCustomerPatchV2 }),
        async (request, response) => {
            const context = profile(request);
            if (!context) { response.status(401).json(envelope("Authentication required", 3, null)); return; }
            if (context.customerId !== request.params.userId) {
                response.status(403).json(envelope("User access denied", 3, null)); return;
            }
            const result = await dependencies.profiles.updateOwnProfile(context, {
                username: request.body.username, fullName: request.body.fullname, phone: request.body.phone,
            });
            switch (result.kind) {
                case "updated":
                    response.locals.auditResourceId = result.profile.customerId;
                    response.status(200).json(envelope("Update user successfully", 0, {
                        userId: result.profile.customerId, accountId: result.profile.accountId,
                        email: result.profile.email, username: result.profile.username,
                        fullname: result.profile.fullName, phone: result.profile.phone,
                    })); return;
                case "username_already_exists":
                    response.status(409).json(envelope("Username already exists", 1, null)); return;
                case "customer_profile_required":
                    response.status(404).json(envelope("Customer not found", 1, null)); return;
                case "invalid_profile_update":
                    response.status(400).json(envelope("Invalid profile update", 1, null)); return;
                case "profile_unavailable":
                    response.status(503).json(envelope("Profile unavailable", -1, null)); return;
                case "found":
                    response.status(503).json(envelope("Profile unavailable", -1, null)); return;
            }
        });
    router.put("/user/update-password/:userId", createV2HttpAudit("account.password.update", dependencies.audit),
        dependencies.auth, validateRequest({ params: ownCustomerUpdateParamsV2, body: ownPasswordChangeV2 }),
        async (request, response) => {
            const context = profile(request);
            if (!context) { response.status(401).json(envelope("Authentication required", 3, null)); return; }
            if (context.customerId !== request.params.userId) {
                response.status(403).json(envelope("User access denied", 3, null)); return;
            }
            const result = await dependencies.passwords.changeOwnPassword(
                context, request.body.currentPassword, request.body.newPassword,
            );
            switch (result.kind) {
                case "password_changed":
                    response.locals.auditResourceId = context.accountId;
                    response.status(200).json(envelope("Update password successfully", 0, null)); return;
                case "invalid_current_password":
                    response.status(400).json(envelope("Current password is incorrect", 1, null)); return;
                case "password_change_conflict":
                    response.status(409).json(envelope("Password changed concurrently or is unchanged", 1, null)); return;
                case "password_change_unavailable":
                    response.status(503).json(envelope("Password service unavailable", -1, null)); return;
            }
        });
    return router;
};
