'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const core = require('@dbml/core');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'docs/database-v2/schema-manifest.json');
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'docs/database-v2/target-schema.dbml');
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024;
const TABLE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

class SchemaValidationError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'SchemaValidationError';
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new SchemaValidationError(code, message, options);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('MANIFEST_INVALID', 'Schema manifest must be a JSON object.');
  }

  if (!Number.isInteger(manifest.schemaRevision) || manifest.schemaRevision < 1) {
    fail('MANIFEST_REVISION_INVALID', 'schemaRevision must be a positive integer.');
  }
  if (manifest.schemaFile !== 'docs/database-v2/target-schema.dbml') {
    fail('MANIFEST_SCHEMA_PATH_INVALID', 'schemaFile must point to the tracked Database V2 artifact.');
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.sha256 ?? '')) {
    fail('MANIFEST_CHECKSUM_INVALID', 'sha256 must be a lowercase SHA-256 digest.');
  }
  if (manifest.databaseType !== 'MySQL') {
    fail('MANIFEST_DATABASE_TYPE_INVALID', 'databaseType must be MySQL.');
  }
  if (!Number.isInteger(manifest.tableCount) || manifest.tableCount < 1) {
    fail('MANIFEST_TABLE_COUNT_INVALID', 'tableCount must be a positive integer.');
  }
  if (!Number.isInteger(manifest.referenceCount) || manifest.referenceCount < 0) {
    fail('MANIFEST_REFERENCE_COUNT_INVALID', 'referenceCount must be a non-negative integer.');
  }
  if (!Array.isArray(manifest.tableNames)
    || manifest.tableNames.length !== manifest.tableCount
    || new Set(manifest.tableNames).size !== manifest.tableNames.length
    || manifest.tableNames.some((name) => !TABLE_NAME_PATTERN.test(name))) {
    fail('MANIFEST_TABLE_INVENTORY_INVALID', 'tableNames must be unique and match tableCount.');
  }

  const parser = manifest.parser;
  if (!parser || parser.package !== '@dbml/core' || parser.version !== '10.1.1' || parser.mode !== 'dbmlv2') {
    fail('MANIFEST_PARSER_INVALID', 'Parser contract must be @dbml/core 10.1.1 in dbmlv2 mode.');
  }
}

function validateSchemaContent(source, manifest) {
  assertManifest(manifest);

  if (core.VERSION !== manifest.parser.version) {
    fail('PARSER_VERSION_MISMATCH', 'Installed @dbml/core version differs from the approved manifest.');
  }

  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_SCHEMA_BYTES) {
    fail('SCHEMA_SIZE_INVALID', `Schema must be UTF-8 text no larger than ${MAX_SCHEMA_BYTES} bytes.`);
  }

  const checksum = sha256(source);
  if (checksum !== manifest.sha256) {
    fail('SCHEMA_CHECKSUM_MISMATCH', 'Schema checksum differs from the approved manifest.');
  }

  const revisionMatch = source.match(/DESIGN revision (\d+)\b/);
  if (!revisionMatch || Number(revisionMatch[1]) !== manifest.schemaRevision) {
    fail('SCHEMA_REVISION_MISMATCH', 'Schema revision differs from the approved manifest.');
  }

  let database;
  try {
    database = core.Parser.parse(source, manifest.parser.mode);
  } catch (error) {
    fail('DBML_PARSE_FAILED', 'DBML parser rejected the target schema.', { cause: error });
  }

  let sql;
  try {
    sql = core.exporter.export(source, 'mysql');
  } catch (error) {
    fail('MYSQL_EXPORT_FAILED', 'DBML could not be exported as MySQL.', { cause: error });
  }

  const schemas = database.schemas ?? [];
  const tableNames = schemas.flatMap((schema) => schema.tables ?? []).map((table) => table.name);
  const referenceCount = schemas.flatMap((schema) => schema.refs ?? []).length;
  const expectedNames = [...manifest.tableNames].sort();
  const actualNames = [...tableNames].sort();

  if (tableNames.length !== manifest.tableCount
    || actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])) {
    fail('SCHEMA_TABLE_INVENTORY_MISMATCH', 'Parsed table inventory differs from the approved manifest.');
  }
  if (referenceCount !== manifest.referenceCount) {
    fail('SCHEMA_REFERENCE_COUNT_MISMATCH', 'Parsed reference count differs from the approved manifest.');
  }
  if (typeof sql !== 'string' || !sql.includes('CREATE TABLE')) {
    fail('MYSQL_EXPORT_EMPTY', 'MySQL export did not contain executable table DDL.');
  }

  return {
    status: 'PASS',
    revision: manifest.schemaRevision,
    checksum,
    tables: tableNames.length,
    references: referenceCount,
    parser: `@dbml/core ${core.VERSION} / ${manifest.parser.mode}`,
    mysqlExport: 'PASS',
  };
}

function readManifest() {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (error) {
    fail('MANIFEST_READ_FAILED', 'Unable to read the Database V2 manifest.', { cause: error });
  }
}

function readSchema() {
  let stats;
  try {
    stats = fs.statSync(SCHEMA_PATH);
  } catch (error) {
    fail('SCHEMA_READ_FAILED', 'Unable to read the Database V2 schema.', { cause: error });
  }
  if (!stats.isFile() || stats.size > MAX_SCHEMA_BYTES) {
    fail('SCHEMA_SIZE_INVALID', `Schema must be a file no larger than ${MAX_SCHEMA_BYTES} bytes.`);
  }
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

function runCli() {
  try {
    const result = validateSchemaContent(readSchema(), readManifest());
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof SchemaValidationError ? error.code : 'SCHEMA_VALIDATION_FAILED';
    const message = error instanceof Error ? error.message : 'Unknown schema validation failure.';
    process.stderr.write(`${JSON.stringify({ status: 'FAIL', code, message })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  MANIFEST_PATH,
  MAX_SCHEMA_BYTES,
  SCHEMA_PATH,
  SchemaValidationError,
  sha256,
  validateSchemaContent,
};
