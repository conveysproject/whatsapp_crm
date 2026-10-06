const path = require('path');
const pg = require(path.join(__dirname, '../../../node_modules/.pnpm/pg@8.20.0/node_modules/pg'));
const PUBLIC_URL = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL;
if (!PUBLIC_URL) throw new Error('Set DATABASE_PUBLIC_URL (run via: railway run --service Postgres <command>)');

async function run() {
  const client = new pg.Client({ connectionString: PUBLIC_URL });
  try {
    await client.connect();
    // Find the [media] message — outbound, no body or no mediaUrl, recent
    const res = await client.query(`
      SELECT m.id, m.content_type, m.body, m.media_url, m.status, m.sent_at,
             c.whatsapp_contact_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.direction = 'outbound'
        AND m.sent_at > NOW() - INTERVAL '2 hours'
      ORDER BY m.sent_at DESC
      LIMIT 10
    `);
    for (const row of res.rows) {
      console.log({
        id: row.id,
        contentType: row.content_type,
        body: row.body ? row.body.substring(0, 80) : null,
        mediaUrl: row.media_url,
        status: row.status,
        sentAt: row.sent_at,
      });
    }
    await client.end();
  } catch(e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
}
run();
