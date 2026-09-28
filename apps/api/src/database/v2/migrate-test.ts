import path from "node:path";
import { fileURLToPath } from "node:url";
import { runV2Migrations } from "./migrate.js";

const currentFile = fileURLToPath(import.meta.url);

const runFromCli = async (): Promise<void> => {
    const command = process.argv[2] ?? "status";
    if (command !== "status" && command !== "up") {
        throw new Error("Database V2 test migration command must be either status or up.");
    }

    await runV2Migrations(command);
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
    runFromCli().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
