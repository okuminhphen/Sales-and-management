const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("PowerShell launch scripts parse without syntax errors", () => {
  for (const relativePath of [
    "scripts/local-dev/start-local.ps1",
    "scripts/local-dev/run-service.ps1",
    "scripts/local-dev/stop-local.ps1",
    "scripts/local-dev/stop-infrastructure.ps1",
  ]) {
    const fullPath = path.join(root, relativePath);
    assert.equal(fs.existsSync(fullPath), true, `${relativePath} must exist`);
    const command = [
      "$errors = $null",
      `[void][System.Management.Automation.Language.Parser]::ParseFile('${fullPath.replaceAll("'", "''")}', [ref]$null, [ref]$errors)`,
      "if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_ }; exit 1 }",
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
});

test("start launcher preserves independent runtime boundaries and performs preflight checks", () => {
  const source = read("scripts/local-dev/start-local.ps1");
  assert.match(source, /npm(?:\.cmd)? run infra:up/);
  assert.match(source, /\.env/);
  assert.match(source, /\.venv/);
  assert.match(source, /3000/);
  assert.match(source, /8000/);
  assert.match(source, /8080/);
  assert.match(source, /Start-Process/);

  const host = read("scripts/local-dev/run-service.ps1");
  assert.match(host, /npm(?:\.cmd)? run dev:web/);
  assert.match(host, /npm(?:\.cmd)? run dev:api/);
  assert.match(host, /uvicorn app\.main:app --reload --port 8000/);
});

test("stop scripts are state-scoped and never remove Docker volumes", () => {
  const stop = read("scripts/local-dev/stop-local.ps1");
  const infrastructure = read("scripts/local-dev/stop-infrastructure.ps1");
  assert.match(stop, /processes\.json/);
  assert.match(stop, /StartTime/);
  assert.doesNotMatch(stop, /Get-Process\s+-Name/);
  assert.doesNotMatch(`${stop}\n${infrastructure}`, /--volumes|-v\b|docker volume rm/i);
  assert.match(infrastructure, /npm(?:\.cmd)? run infra:down/);
});

test("clickable wrappers call only their matching PowerShell entrypoints", () => {
  assert.match(read("start-local.cmd"), /scripts\\local-dev\\start-local\.ps1/i);
  assert.match(read("stop-local.cmd"), /scripts\\local-dev\\stop-local\.ps1/i);
  assert.match(read("stop-infrastructure.cmd"), /scripts\\local-dev\\stop-infrastructure\.ps1/i);
});

test("managed workers expose readiness even when the inherited log level suppresses info", () => {
  const script = path.join(root, "scripts/local-dev/run-service.ps1").replaceAll("'", "''");
  for (const service of ["Outbox", "InventoryExpiry"]) {
    for (const level of ["warn", "error"]) {
      const command = `
        function global:npm.cmd { Write-Output "WORKER_LOG_LEVEL=$env:LOG_LEVEL"; $global:LASTEXITCODE = 0 }
        $env:LOG_LEVEL = '${level}'
        & '${script}' -Service '${service}' -Root '${root.replaceAll("'", "''")}'
      `;
      const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
        encoding: "utf8", timeout: 20_000, windowsHide: true,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.match(result.stdout, /WORKER_LOG_LEVEL=info/, `${service} must emit its readiness marker at inherited ${level}`);
    }
  }
});
