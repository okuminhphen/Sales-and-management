'use strict';

const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

function loadDatabaseConfig(inherited = process.env, source) {
  const file = source ?? fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf8');
  const env = { ...dotenv.parse(file), ...inherited };
  const port = Number(env.MYSQL_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('MYSQL_PORT must be a valid TCP port.');
  return {
    host: env.MYSQL_HOST || 'localhost', port,
    database: env.MYSQL_DATABASE || 'sale_and_managements_db',
    user: env.MYSQL_USER || 'root', password: env.MYSQL_PASSWORD || '',
  };
}

async function checkDatabaseConnection(config, connect = mysql.createConnection) {
  let connection;
  try {
    connection = await connect({ ...config, connectTimeout: 5000 });
    const [rows] = await connection.query('SELECT DATABASE() AS `database`, VERSION() AS version');
    if (rows[0]?.database !== config.database) throw new Error('Unexpected database.');
    return { host: config.host, port: config.port, database: config.database, version: rows[0].version };
  } catch (error) {
    const code = typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'CONNECTION_FAILED';
    throw new Error(`Database connection failed (${code}) at ${config.host}:${config.port}/${config.database}. Check MYSQL_HOST/MYSQL_PORT against the Docker published host port; containers use mysql:3306.`);
  } finally {
    if (connection) await connection.end();
  }
}

if (require.main === module) {
  Promise.resolve().then(() => checkDatabaseConnection(loadDatabaseConfig()))
    .then((result) => console.log(`Database preflight PASS: ${result.host}:${result.port}/${result.database} (MySQL ${result.version})`))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { loadDatabaseConfig, checkDatabaseConnection };
