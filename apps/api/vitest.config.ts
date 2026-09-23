import { defineConfig } from "vitest/config";

const runsDatabaseV2Integration = process.env.RUN_DATABASE_V2_TESTS === "true";

export default defineConfig({
  test: {
    environment: "node",
    // V2 integration files intentionally share one guarded `_test` database and
    // some schema/seed tests mutate its reference rows to prove idempotency.
    // Keep ordinary unit/API feedback parallel, but serialize the suite whenever
    // real MySQL V2 tests are explicitly enabled.
    fileParallelism: !runsDatabaseV2Integration,
  }
});
