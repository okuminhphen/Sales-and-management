const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function serviceBlock(source, name) {
  const start = new RegExp(`^  ${name}:\\s*$`, "m").exec(source);
  assert.ok(start, `${name} service must be configured`);
  const rest = source.slice(start.index + start[0].length);
  const boundary = /^  [a-zA-Z][\w-]*:|^\S/m.exec(rest);
  return boundary ? rest.slice(0, boundary.index) : rest;
}

function compiledCommand(block) {
  const match = /command:\s*\[([^\]]+)\]/.exec(block);
  assert.ok(match, "worker must declare its executable command");
  return Array.from(match[1].matchAll(/["']([^"']+)["']/g), (part) => part[1]);
}

for (const file of ["compose.yml", "compose.production.yml"]) {
  test(`${file} keeps the AI indexer separate from inventory expiry`, () => {
    const source = read(file);
    const indexer = serviceBlock(source, "ai-catalog-indexer");
    assert.match(indexer, /sales-ai-consume-catalog-events/);
    assert.doesNotMatch(serviceBlock(source, "inventory-reservation-expiry"), /AI_IMAGE|sales-ai-consume-catalog-events/);
  });

  test(`${file} starts compiled outbox with explicit opt-in`, () => {
    const outbox = serviceBlock(read(file), "outbox-publisher");
    assert.deepEqual(compiledCommand(outbox), ["node", "dist/workers/run-outbox-publisher-v2.js"]);
    assert.match(outbox, /V2_OUTBOX_PUBLISHER_ENABLED:\s*["']?true["']?\s*(?:\r?\n|$)/);
    assert.doesNotMatch(outbox, /127\.0\.0\.1:8080|localhost:8080/, "API liveness is not worker progress");
  });

  test(`${file} starts the inventory hold expiry worker by default`, () => {
    const expiry = serviceBlock(read(file), "inventory-reservation-expiry");
    assert.deepEqual(compiledCommand(expiry), ["node", "dist/workers/run-inventory-reservation-expiry.js"]);
    assert.match(expiry, /V2_INVENTORY_RESERVATION_EXPIRY_ENABLED:\s*["']?true["']?\s*(?:\r?\n|$)/);
    assert.doesNotMatch(expiry, /^\s*profiles:/m, "hold expiry cannot require an optional profile");
    assert.match(expiry, /MYSQL_HOST:/);
    assert.match(expiry, /MYSQL_PORT:/);
  });
}

test("host launcher tracks both hidden worker process trees with app ownership", () => {
  const start = read("scripts/local-dev/start-local.ps1");
  const run = read("scripts/local-dev/run-service.ps1");
  const stop = read("scripts/local-dev/stop-local.ps1");
  for (const name of ["Outbox", "InventoryExpiry"]) {
    assert.match(start, new RegExp(`["']${name}["']`), `${name} must be in launcher services`);
    assert.match(run, new RegExp(`["']${name}["']`), `${name} must be accepted by service host`);
  }
  assert.match(run, /outbox:publish:v2/);
  assert.match(run, /inventory-reservation:expire/);
  assert.match(run, /V2_OUTBOX_PUBLISHER_ENABLED\s*=\s*["']true["']/);
  assert.match(run, /V2_INVENTORY_RESERVATION_EXPIRY_ENABLED\s*=\s*["']true["']/);
  assert.match(start, /Start-Process[^\r\n]*-WindowStyle\s+Hidden/i);
  assert.match(start, /startedAtUtc/);
  assert.match(start, /processes\.json/);
  assert.match(stop, /StartTime/);
  assert.match(stop, /taskkill\.exe\s+\/PID\s+\$processId\s+\/T/);
});

test("host launcher refuses duplicate workers already running under Compose", () => {
  const source = read("scripts/local-dev/start-local.ps1");
  assert.match(source, /docker(?:\.exe)?[^\r\n]*\bcompose\b[^\r\n]*\bps\b/);
  assert.match(source, /outbox-publisher/);
  assert.match(source, /inventory-reservation-expiry/);
  assert.match(source, /--status\s+running|--filter\s+["']?status=running/);
  assert.match(source, /throw[^\r\n]*(?:worker|Compose)|(?:worker|Compose)[^\r\n]*throw/i);
});
