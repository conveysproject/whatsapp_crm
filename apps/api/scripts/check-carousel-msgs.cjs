const path = require('path');
const pg = require(path.join(__dirname, '../../../node_modules/.pnpm/pg@8.20.0/node_modules/pg'));

const PUBLIC_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!PUBLIC_URL) throw new Error('Set DATABASE_PUBLIC_URL (run via: railway run --service Postgres <command>)');

async function run() {
  const client = new pg.Client({ connectionString: PUBLIC_URL });
  try {
    await client.connect();
    // Get recent template messages that look like carousels
    const res = await client.query(`
      SELECT id, body, status, created_at
      FROM messages
      WHERE content_type = 'template'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    for (const row of res.rows) {
      console.log('\n--- Message', row.id, row.created_at, '---');
      try {
        const parsed = JSON.parse(row.body);
        console.log('templateName:', parsed.templateName);
        console.log('carousel:', JSON.stringify(parsed.carousel, null, 2));
      } catch {
        console.log('raw body:', row.body?.substring(0, 200));
      }
    }
    await client.end();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
run();
