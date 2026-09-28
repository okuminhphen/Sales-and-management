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
import { RoleManagementV2Service } from "../modules/identity-access/application/role-management-v2.service.js";
import { SequelizeRoleManagementV2Repository } from "../modules/identity-access/persistence/role-management-v2.repository.js";
import { createRoleV2Router } from "../modules/identity-access/interfaces/http/role-v2.routes.js";
import { BranchV2Service } from "../modules/identity-access/application/branch-v2.service.js";
import { SequelizeBranchV2Repository } from "../modules/identity-access/persistence/branch-v2.repository.js";
import { createBranchV2Router } from "../modules/identity-access/interfaces/http/branch-v2.routes.js";
import { EmployeeV2Service } from "../modules/identity-access/application/employee-v2.service.js";
import { SequelizeEmployeeV2Repository } from "../modules/identity-access/persistence/employee-v2.repository.js";
import { createEmployeeV2Router } from "../modules/identity-access/interfaces/http/employee-v2.routes.js";
import { EmployeeAssignmentV2Service } from "../modules/identity-access/application/employee-assignment-v2.service.js";
import { SequelizeEmployeeAssignmentV2Repository } from "../modules/identity-access/persistence/employee-assignment-v2.repository.js";
import { createRequireRecaptcha } from "../modules/auth/otp/recaptcha.guard.js";

export const createIdentityV2Router = (dependencies: {
    persistence: V2Persistence;
    verificationGateway?: VerificationTokenGateway;
    audit?: V2HttpAuditWriter;
    loginRateLimit?: RequestHandler;
}): Router => {
    const contexts = new SequelizeV2AccessContextRepository(dependencies.persistence);
    const auth = createV2AuthMiddleware({ accessContexts: contexts });
    const router = Router();
    router.use(createOtpRouter());
    router.use(createRoleV2Router({ auth, audit: dependencies.audit,
        service: new RoleManagementV2Service({
            repository: new SequelizeRoleManagementV2Repository(dependencies.persistence),
        }) }));
    router.use(createBranchV2Router({ auth, audit: dependencies.audit,
        service: new BranchV2Service({ repository: new SequelizeBranchV2Repository(dependencies.persistence) }) }));
    router.use(createEmployeeV2Router({ auth, audit: dependencies.audit,
        service: new EmployeeV2Service({ repository: new SequelizeEmployeeV2Repository(dependencies.persistence) }),
        assignments: new EmployeeAssignmentV2Service({
            repository: new SequelizeEmployeeAssignmentV2Repository(dependencies.persistence),
        }) }));
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
        auth,
        audit: dependencies.audit,
        loginRateLimit: dependencies.loginRateLimit,
        loginRecaptcha: createRequireRecaptcha("login"),
    }));
    return router;
};
