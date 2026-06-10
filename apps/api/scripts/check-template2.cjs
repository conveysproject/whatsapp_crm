const path = require('path');
const pg = require(path.join(__dirname, '../../../node_modules/.pnpm/pg@8.20.0/node_modules/pg'));

const PUBLIC_URL = 'postgresql://postgres:REDACTED_DB_PASS@trolley.proxy.rlwy.net:28192/railway';

async function run() {
  const client = new pg.Client({ connectionString: PUBLIC_URL });
  try {
    await client.connect();
    const res = await client.query(
      "SELECT id, name, status, category, language, meta_template_id, components, created_at FROM templates WHERE name LIKE '%jaspers%'"
    );
    console.log('rows:', res.rows.length);
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
run();
