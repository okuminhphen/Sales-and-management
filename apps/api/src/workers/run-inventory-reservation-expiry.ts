import { Sequelize } from "sequelize";
import { env } from "../config/env.js";
import { createSalesV2Persistence } from "../database/v2/models.js";
import { InventoryReservationExpiryV2Worker } from "../modules/inventory-transfer/application/inventory-reservation-expiry-v2.worker.js";
import { SequelizeInventoryReservationExpiryV2Repository } from "../modules/inventory-transfer/persistence/inventory-reservation-expiry-v2.repository.js";
import { logger } from "../observability/logger.js";

if (process.env.V2_INVENTORY_RESERVATION_EXPIRY_ENABLED !== "true") {
    throw new Error("Set V2_INVENTORY_RESERVATION_EXPIRY_ENABLED=true only after Database V2 cutover.");
}

const sequelize = new Sequelize(env.MYSQL_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
    host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql",
    dialectOptions: { supportBigNumbers: true, bigNumberStrings: true }, logging: false,
});
const wait = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

const run = async (): Promise<void> => {
    await sequelize.authenticate();
    const worker = new InventoryReservationExpiryV2Worker({
        repository: new SequelizeInventoryReservationExpiryV2Repository(createSalesV2Persistence(sequelize)),
    });
    while (!stopping) {
        try {
            const expired = await worker.runOnce();
            if (!expired) await wait(1_000);
        } catch (error) {
            logger.error("inventory_reservation.expiry_worker_failed", {
                errorName: error instanceof Error ? error.name : "UnknownError",
            });
            await wait(5_000);
        }
    }
};

run().catch((error) => {
    logger.error("inventory_reservation.expiry_worker_stopped", {
        errorName: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
}).finally(async () => sequelize.close());
