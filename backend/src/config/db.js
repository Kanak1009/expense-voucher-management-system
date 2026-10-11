const { Pool, types } = require('pg');
const config = require('./index');

// Return NUMERIC as JS number and DATE as plain 'YYYY-MM-DD' string
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(1082, (v) => v);

const pool = new Pool({ connectionString: config.databaseUrl });

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  // Run fn(client) inside a transaction
  async withTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};
