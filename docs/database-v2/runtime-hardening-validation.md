# Database runtime hardening — 2026-10-15

## Outcome and scope

Implemented the fixes approved after [the read-only audit](audit-2026-10-15.md).
The approved revision 4 schema, migration sources/checksums, existing records,
REST paths and permissions are unchanged. No seed, migration or integration
fixture was run against `sale_and_managements_db`.

### Changes and rationale

- `apps/api/src/database/v2/connection.ts` centralizes Sequelize options with
  session timezone `+00:00`. API, three workers, migrations, seed and the cutover
  target reuse it; the cutover server connection also uses UTC. Mixing a `+07:00`
  session with `UTC_TIMESTAMP()` writes into `TIMESTAMP` caused a seven-hour
  error. A shared factory prevents the runtimes from diverging again.
- `runtime.ts` validates the approved manifests and requires the exact executed
  migration inventory and checksums, not just a count. Missing, extra, duplicate,
  unknown or tampered records fail closed. The existing exact-table gate remains.
  Startup does not run migrations or repair the database.
- The ignored local `.env` now uses the actual published host port `4306`.
  Docker-network services still use `mysql:3306`. `npm run db:check` performs a
  read-only connection preflight, closes the connection and redacts driver
  messages/credentials. The local launcher checks readiness before starting apps.
- Web stock request types and status rendering now cover `cancelled` and
  `fulfilled`, in addition to the existing three states. Mutation actions remain
  pending-only; a persisted cancelled request no longer crashes the list.
- Full-schema integration tests now compare all 104 FK sources, targets and
  referential actions with DBML, including one-to-one direction. They also check
  all 65 CHECK constraints are enforced and all 42 named design rules exist.

## Verification

All MySQL mutation tests used the explicit guarded
`sale_and_managements_db_test` database. UTC regression fixtures additionally
use rollback-only transactions and verify the selected database before writing.

| Check | Observed result |
|---|---|
| Schema artifact validator | PASS: revision 4, 49 tables, 104 references, migration checksums |
| Validator regression tests | 7/7 PASS |
| API full suite, MySQL enabled, two workers | 159 files; 619 passed, 4 Redis opt-in tests skipped; exit 0 |
| Focused full-schema/persistence/runtime UTC/Redis concurrency rerun | 4 files, 19/19 PASS, including the 4 previously skipped Redis tests and 2 new schema checks; exit 0 |
| Runtime + migration-integrity unit regressions | 15/15 PASS |
| Stock request cancel/reload and fulfilled regressions | 2/2 PASS |
| Launcher and DB preflight tests | 7/7 PASS |
| API typecheck (including strict config) and build | PASS |
| Web typecheck and production build | PASS; existing >500 kB chunk warning remains |
| Compiled API read-only main-DB smoke | PASS: runtime gate accepted, timezone `+00:00`, SQL drift 0 seconds |
| AI MySQL catalog read-only smoke | PASS: localhost:4306, main database, 6 products; no model/provider call |
| Repeat main-DB read-only audit after integration tests | 49 tables, 487 columns, 104 FKs, 65 CHECKs, 49 models, 6 migrations; zero structural issues/orphans; row counts unchanged |
| Web complete suite, one fork worker | 67 files, 175/175 PASS; exit 0; 145.37 seconds |
| Git whitespace/conflict-marker check | PASS |

The API full-suite result and the focused rerun are separate executions, not a
claim that one full run executed every test without skips.

The final Web run finished successfully after resuming at 19:01 (Asia/Saigon).
Its machine-readable report is the ignored local artifact
`.local-runtime/database-hardening-web-tests.json`.

### Latest environment state

The main-DB smoke and all MySQL/Redis integration results above were obtained
earlier on 2026-10-15 while Docker was running. At the evening resumption,
`npm run db:check` returned `ECONNREFUSED` on localhost:4306 and `docker ps -a`
reported the Docker Desktop Linux Engine pipe was missing. There was no listener
on port 4306. Docker Engine is currently unavailable; this is not a new schema or
contract failure. No database was recreated and Docker Desktop was not started
automatically. Open Docker Desktop, run `npm run infra:up`, then `npm run db:check`
before testing the backend interactively.

### Regression evidence

Before implementation, runtime unit regressions had 4 failures and UTC MySQL
regressions had 2 failures; the corresponding suites passed after the fix.
Both new stock lifecycle tests reproduced the missing-status crash before the
status contract change and passed afterward.

### Reproduce database tests

Use a separate terminal and an already prepared disposable `_test` database.
Set the published port for the actual environment; `4306` is this local setup.

```powershell
npm run db:check
npm run db:v2:validate
npm run test:db:v2
$env:RUN_DATABASE_V2_TESTS='true'
$env:V2_MIGRATIONS_ENABLED='true'
$env:V2_MIGRATIONS_TARGET_DATABASE='sale_and_managements_db_test'
$env:MYSQL_DATABASE='sale_and_managements_db_test'
$env:MYSQL_PORT='4306'
npm run test --workspace @sales/api -- --maxWorkers=2
$env:RUN_INFRASTRUCTURE_TESTS='true'
npm run test --workspace @sales/api -- --run tests/integration/databaseV2FullSchema.test.ts tests/integration/databaseV2FullPersistence.test.ts tests/integration/databaseV2RuntimeUtc.test.ts tests/integration/otpConcurrency.test.ts
```

Close that terminal before starting the main application so test overrides do
not leak into application processes. No external payment, email, shipping or AI
provider was called by these checks.

## Runner notes and remaining limits

- Two earlier full Web runs reported all 67 files / 175 assertions passing but
  exited 1 because of an unhandled Vitest `onTaskUpdate` worker timeout. They are
  not counted as successful test gates. A separate fork-pool Tooltip run passed
  2/2 with exit 0. Hung processes created by this task were stopped; no tests were
  removed, no failures suppressed and no timeout settings changed. The final
  complete one-worker run passed 175/175 with exit 0. This provides a successful
  test gate but does not prove the multi-worker timeout cannot recur.
- Existing React Router future-flag warnings and the production chunk-size
  warning remain; neither caused the successful final run/build to fail.
- Main transactional tables are mostly empty. Schema conformity and the tested
  transaction/idempotency workflows do not certify every production scenario.
  In particular, full return/refund eligibility and cumulative budget workflows,
  actual provider callbacks and browser end-to-end checkout require separate
  populated-environment acceptance testing.
- Historical timestamps were not backfilled. If old transactional records exist
  elsewhere, determine their writer/session convention before correcting them;
  a blanket seven-hour update would be unsafe.
- Startup verifies migration records and table inventory, not every live FK,
  CHECK expression or index definition. Keep schema/persistence checks in the
  pre-deployment workflow; checksums alone cannot detect manual DDL changes.
- No application servers were left running by this validation. No dependency,
  schema revision, commit, push or PR was introduced in this hardening task.
