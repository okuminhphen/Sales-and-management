import { Router, type RequestHandler } from "express";
import { createOtpRouter } from "../modules/auth/otp/otp.routes.js";
import { otpService } from "../modules/auth/otp/otp.service.js";
import type { V2Persistence } from "../database/v2/persistence.js";
import type { V2HttpAuditWriter } from "../observability/v2-http-audit.js";
import { CustomerAuthV2Service, bcryptPasswordHasher,
    type VerificationTokenGateway } from "../modules/identity-access/application/customer-auth-v2.service.js";
import { BackofficeAuthV2Service } from "../modules/identity-access/application/backoffice-auth-v2.service.js";
import { CustomerProfileV2Service } from "../modules/identity-access/application/customer-profile-v2.service.js";
import { SequelizeCustomerAuthV2Repository } from "../modules/identity-access/persistence/customer-auth-v2.repository.js";
import { SequelizeBackofficeAuthV2Repository } from "../modules/identity-access/persistence/backoffice-auth-v2.repository.js";
import { SequelizeCustomerProfileV2Repository } from "../modules/identity-access/persistence/customer-profile-v2.repository.js";
import { SequelizeV2AccessContextRepository } from "../modules/identity-access/persistence/v2-access-context.repository.js";
import { createV2AuthMiddleware } from "../modules/identity-access/interfaces/http/v2-auth.middleware.js";
import { createIdentityV2Routes } from "../modules/identity-access/interfaces/http/identity-v2.routes.js";

export const createIdentityV2Router = (dependencies: {
    persistence: V2Persistence;
    verificationGateway?: VerificationTokenGateway;
    audit?: V2HttpAuditWriter;
    loginRateLimit?: RequestHandler;
}): Router => {
    const contexts = new SequelizeV2AccessContextRepository(dependencies.persistence);
    const router = Router();
    router.use(createOtpRouter());
    router.use(createIdentityV2Routes({
        customerAuth: new CustomerAuthV2Service({
            repository: new SequelizeCustomerAuthV2Repository(dependencies.persistence),
            verificationGateway: dependencies.verificationGateway ?? {
                claim: (token, email) => otpService.claimVerificationToken(token, email),
                release: (token) => otpService.releaseVerificationToken(token),
                finalize: (token) => otpService.finalizeVerificationToken(token),
            },
            passwordHasher: bcryptPasswordHasher,
        }),
        backofficeAuth: new BackofficeAuthV2Service({
            repository: new SequelizeBackofficeAuthV2Repository(dependencies.persistence),
            accessContexts: contexts,
            passwordHasher: bcryptPasswordHasher,
        }),
        profiles: new CustomerProfileV2Service({
            repository: new SequelizeCustomerProfileV2Repository(dependencies.persistence),
        }),
        contexts,
        auth: createV2AuthMiddleware({ accessContexts: contexts }),
        audit: dependencies.audit,
        loginRateLimit: dependencies.loginRateLimit,
    }));
    return router;
};
