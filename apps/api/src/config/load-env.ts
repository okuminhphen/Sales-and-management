import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// Resolve identically from src/config and dist/config; HTTP/worker imports share one load.
loadDotEnv({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)) });
