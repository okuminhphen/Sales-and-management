const assert = require('node:assert/strict');
const test = require('node:test');
const { checkDatabaseConnection, loadDatabaseConfig } = require('./check-database.cjs');

test('host preflight uses configured port and inherited environment overrides', () => {
  const config = loadDatabaseConfig({ MYSQL_PORT: '4306' }, 'MYSQL_HOST=localhost\nMYSQL_PORT=3306\nMYSQL_DATABASE=sales_test\nMYSQL_USER=app\nMYSQL_PASSWORD=private-password');
  assert.equal(config.port, 4306);
  assert.equal(config.database, 'sales_test');
});

test('preflight authenticates the configured database, closes connection and exposes no credentials', async () => {
  let ended = false;
  const config = { host: '127.0.0.1', port: 4306, database: 'sales_test', user: 'private-user', password: 'private-password' };
  const result = await checkDatabaseConnection(config, async (options) => {
    assert.equal(options.port, 4306);
    return {
      query: async () => [[{ database: 'sales_test', version: '8.4.11' }]],
      end: async () => { ended = true; },
    };
  });
  assert.equal(ended, true);
  assert.deepEqual(result, { host: '127.0.0.1', port: 4306, database: 'sales_test', version: '8.4.11' });
  assert.doesNotMatch(JSON.stringify(result), /private-user|private-password/);
});

test('failed host connection names endpoint and port guidance without leaking driver messages', async () => {
  const config = { host: 'localhost', port: 3306, database: 'sales_test', user: 'private-user', password: 'private-password' };
  await assert.rejects(checkDatabaseConnection(config, async () => {
    throw Object.assign(new Error('private-password'), { code: 'ECONNREFUSED' });
  }), (error) => {
    assert.match(error.message, /localhost:3306\/sales_test/);
    assert.match(error.message, /MYSQL_PORT/);
    assert.match(error.message, /ECONNREFUSED/);
    assert.doesNotMatch(error.message, /private-user|private-password/);
    return true;
  });
});
