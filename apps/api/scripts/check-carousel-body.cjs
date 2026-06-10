const path = require('path');
const pg = require(path.join(__dirname, '../../../node_modules/.pnpm/pg@8.20.0/node_modules/pg'));

const PUBLIC_URL = 'postgresql://postgres:REDACTED_DB_PASS@trolley.proxy.rlwy.net:28192/railway';

async function run() {
  const client = new pg.Client({ connectionString: PUBLIC_URL });
  try {
    await client.connect();
    const res = await client.query(`
      SELECT id, body, created_at
      FROM messages
      WHERE content_type = 'template'
        AND body LIKE '%jaspers_market_media_carousel%'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    if (res.rows.length === 0) {
      console.log('No carousel messages found');
    } else {
      const row = res.rows[0];
      console.log('Message ID:', row.id, '| Sent:', row.created_at);
      console.log('Full body:');
      console.log(JSON.stringify(JSON.parse(row.body), null, 2));
    }
    await client.end();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
run();
