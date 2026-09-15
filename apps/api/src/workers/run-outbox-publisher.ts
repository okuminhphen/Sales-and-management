import { sequelize } from "../models/index.js";
import { publishOutboxBatch } from "./outbox-publisher.js";

let stopping = false;
const stop = () => {
    stopping = true;
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const wait = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

const run = async (): Promise<void> => {
    while (!stopping) {
        const count = await publishOutboxBatch();
        console.info(JSON.stringify({ event: "outbox.batch.completed", count }));
        if (count === 0) await wait(1_000);
    }
};

run()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => sequelize.close());
