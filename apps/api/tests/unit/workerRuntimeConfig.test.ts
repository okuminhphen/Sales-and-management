import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const productionWorkerEnv = (): NodeJS.ProcessEnv => ({
    NODE_ENV: "production",
    MYSQL_HOST: "worker-db.internal",
    MYSQL_PORT: "3306",
    MYSQL_DATABASE: "sales_worker_test",
    MYSQL_USER: "worker_user",
    MYSQL_PASSWORD: "fixture-database-password",
    RABBITMQ_URL: "amqp://fixture:fixture@broker.internal:5672/worker_test",
    V2_OUTBOX_PUBLISHER_ENABLED: "true",
    V2_INVENTORY_RESERVATION_EXPIRY_ENABLED: "true",
});

// A dynamic path preserves RED feedback before this module is implemented.
const loadParser = async () => {
    const modulePath = "../../src/config/worker-env.js";
    return await import(modulePath) as {
        parseWorkerEnv: (source: NodeJS.ProcessEnv, kind: "outbox" | "expiry") => Record<string, unknown>;
    };
};

describe("independently deployable worker environment", () => {
    it.each(["outbox", "expiry"] as const)("accepts minimal production %s config without HTTP secrets", async (kind) => {
        const { parseWorkerEnv } = await loadParser();
        const result = parseWorkerEnv(productionWorkerEnv(), kind);
        expect(result).toMatchObject({
            NODE_ENV: "production",
            LOG_LEVEL: "info",
            MYSQL_HOST: "worker-db.internal",
            MYSQL_PORT: 3306,
            MYSQL_DATABASE: "sales_worker_test",
            MYSQL_USER: "worker_user",
            MYSQL_PASSWORD: "fixture-database-password",
        });
    });

    it.each([
        ["outbox", "V2_OUTBOX_PUBLISHER_ENABLED"],
        ["expiry", "V2_INVENTORY_RESERVATION_EXPIRY_ENABLED"],
    ] as const)("fails closed unless the %s worker has its own explicit opt-in", async (kind, flag) => {
        const { parseWorkerEnv } = await loadParser();
        for (const value of [undefined, "false", "yes"]) {
            const source = { ...productionWorkerEnv(), [flag]: value };
            expect(() => parseWorkerEnv(source, kind)).toThrow();
        }
    });

    it.each(["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"])(
        "requires an explicitly supplied production %s rather than a development default", async (field) => {
            const { parseWorkerEnv } = await loadParser();
            const source = productionWorkerEnv();
            delete source[field];
            expect(() => parseWorkerEnv(source, "outbox")).toThrow();
        },
    );

    it("requires a production broker only for the outbox publisher", async () => {
        const { parseWorkerEnv } = await loadParser();
        const source = productionWorkerEnv();
        delete source.RABBITMQ_URL;
        expect(() => parseWorkerEnv(source, "outbox")).toThrow();
        expect(() => parseWorkerEnv(source, "expiry")).not.toThrow();
    });

    it("coerces and bounds the outbox batch size and DB port", async () => {
        const { parseWorkerEnv } = await loadParser();
        expect(parseWorkerEnv({ ...productionWorkerEnv(), OUTBOX_BATCH_SIZE: "20" }, "outbox").OUTBOX_BATCH_SIZE).toBe(20);
        for (const OUTBOX_BATCH_SIZE of ["0", "501", "no-number"]) {
            expect(() => parseWorkerEnv({ ...productionWorkerEnv(), OUTBOX_BATCH_SIZE }, "outbox")).toThrow();
        }
        for (const MYSQL_PORT of ["0", "65536", "no-number"]) {
            expect(() => parseWorkerEnv({ ...productionWorkerEnv(), MYSQL_PORT }, "expiry")).toThrow();
        }
    });

    it("imports worker database and logger dependencies without invoking HTTP production validation", () => {
        const apiRoot = fileURLToPath(new URL("../../", import.meta.url));
        const env = {
            ...process.env,
            ...productionWorkerEnv(),
            // Even dotenv must not supply HTTP credentials accidentally from the developer's .env.
            JWT_SECRET: "development-only-secret",
            RECAPTCHA_ENABLED: "false",
            RECAPTCHA_SECRET_KEY: "",
            EMAIL_VERIFICATION_ENABLED: "false",
            RESEND_API_KEY: "",
            OTP_HMAC_SECRET: "dev-otp-hmac-secret-min-16-bytes",
            VNP_TMN_CODE: "",
            VNP_HASH_SECRET: "",
            PAYMENT_WEBHOOK_SECRET: "",
        };
        const script = `
            await import('./src/database/v2/connection.ts');
            await import('./src/observability/logger.ts');
            const { parseWorkerEnv } = await import('./src/config/worker-env.ts');
            parseWorkerEnv(process.env, 'outbox');
            console.log('WORKER_IMPORT_BOUNDARY_OK');
        `;
        const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
            cwd: apiRoot,
            env,
            encoding: "utf8",
            timeout: 20_000,
        });
        expect(result.error?.message).toBeUndefined();
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("WORKER_IMPORT_BOUNDARY_OK");
    }, 30_000);
});
