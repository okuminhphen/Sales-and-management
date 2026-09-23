'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  MANIFEST_PATH,
  SCHEMA_PATH,
  SchemaValidationError,
  sha256,
  validateSchemaContent,
} = require('./validate-schema.cjs');

const source = fs.readFileSync(SCHEMA_PATH, 'utf8');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

test('accepts the approved Database V2 artifact and exports MySQL in memory', () => {
  const result = validateSchemaContent(source, manifest);

  assert.equal(result.status, 'PASS');
  assert.equal(result.revision, 4);
  assert.equal(result.checksum, manifest.sha256);
  assert.equal(result.tables, 49);
  assert.equal(result.references, 104);
  assert.equal(result.mysqlExport, 'PASS');
  assert.match(result.parser, /^@dbml\/core 10\.1\.1 \/ dbmlv2$/);
});

test('fails closed when schema content drifts from the approved checksum', () => {
  assert.throws(
    () => validateSchemaContent(`${source}\n`, manifest),
    (error) => error instanceof SchemaValidationError
      && error.code === 'SCHEMA_CHECKSUM_MISMATCH',
  );
});

test('fails closed when the manifest inventory differs from parsed tables', () => {
  const invalidManifest = {
    ...manifest,
    tableNames: manifest.tableNames.slice(1),
  };

  assert.throws(
    () => validateSchemaContent(source, invalidManifest),
    (error) => error instanceof SchemaValidationError
      && error.code === 'MANIFEST_TABLE_INVENTORY_INVALID',
  );
});

test('fails closed when declared revision and DBML revision differ', () => {
  const changedRevision = source.replace('DESIGN revision 4', 'DESIGN revision 5');
  const changedManifest = { ...manifest, sha256: sha256(changedRevision) };

  assert.throws(
    () => validateSchemaContent(changedRevision, changedManifest),
    (error) => error instanceof SchemaValidationError
      && error.code === 'SCHEMA_REVISION_MISMATCH',
  );
});

test('detects table inventory drift even when the new checksum is declared', () => {
  const renamedTable = source.replaceAll('accounts', 'accounts_drift');
  const changedManifest = { ...manifest, sha256: sha256(renamedTable) };

  assert.throws(
    () => validateSchemaContent(renamedTable, changedManifest),
    (error) => error instanceof SchemaValidationError
      && error.code === 'SCHEMA_TABLE_INVENTORY_MISMATCH',
  );
});

test('detects reference drift even when the new checksum is declared', () => {
  const removedReference = source.replace(
    /\nRef: customer_product_stats\.product_id > products\.id \[delete: restrict, update: restrict\]\n$/,
    '\n',
  );
  const changedManifest = { ...manifest, sha256: sha256(removedReference) };

  assert.throws(
    () => validateSchemaContent(removedReference, changedManifest),
    (error) => error instanceof SchemaValidationError
      && error.code === 'SCHEMA_REFERENCE_COUNT_MISMATCH',
  );
});

test('rejects malformed DBML even when its checksum is declared', () => {
  const malformed = source.replace('Table accounts {', 'Table accounts');
  const malformedManifest = { ...manifest, sha256: sha256(malformed) };

  assert.throws(
    () => validateSchemaContent(malformed, malformedManifest),
    (error) => error instanceof SchemaValidationError
      && error.code === 'DBML_PARSE_FAILED',
  );
});
