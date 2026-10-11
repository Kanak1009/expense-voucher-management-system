const bcrypt = require('bcryptjs');
const db = require('../config/db');

const PASSWORD = 'Password@123';
const USERS = [
  ['Divya Director', 'director@abc.com', 'DIRECTOR', null],
  ['Arjun Accounts', 'accounts@abc.com', 'ACCOUNTS', null],
  ['Esha Employee', 'employee1@abc.com', 'EMPLOYEE', 'EMP001'],
  ['Rohan Employee', 'employee2@abc.com', 'EMPLOYEE', 'EMP002'],
];

(async () => {
  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const [name, email, role, code] of USERS) {
      await db.query(
        `INSERT INTO users (name, email, password_hash, role, employee_code) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, employee_code = EXCLUDED.employee_code`,
        [name, email, hash, role, code]
      );
    }
    console.log('Seeded users (password for all: %s)', PASSWORD);
    USERS.forEach(([n, e, r]) => console.log(`  ${r.padEnd(9)} ${e}  (${n})`));
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
