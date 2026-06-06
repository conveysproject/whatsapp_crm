import pg from "pg";
const { Client } = pg;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const total     = await client.query(`SELECT COUNT(*) FROM login_logs`);
const last24h   = await client.query(`SELECT COUNT(*) FROM login_logs WHERE created_at > NOW() - INTERVAL '24 hours'`);
const last1h    = await client.query(`SELECT COUNT(*) FROM login_logs WHERE created_at > NOW() - INTERVAL '1 hour'`);
const last10min = await client.query(`SELECT COUNT(*) FROM login_logs WHERE created_at > NOW() - INTERVAL '10 minutes'`);

// Per-user top 5
const perUser = await client.query(`
  SELECT user_id, COUNT(*) as cnt
  FROM login_logs
  GROUP BY user_id
  ORDER BY cnt DESC
  LIMIT 5
`);

// Time gaps between consecutive rows for top user
const topUserId = perUser.rows[0]?.user_id;
let gapResult = { rows: [] };
if (topUserId) {
  gapResult = await client.query(`
    SELECT
      created_at,
      EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at))) * 1000 AS gap_ms
    FROM (
      SELECT created_at FROM login_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    ) t
    ORDER BY created_at
  `, [topUserId]);
}

console.log("=== LoginLog Audit (production) ===");
console.log("Total rows:   ", total.rows[0].count);
console.log("Last 24h:     ", last24h.rows[0].count);
console.log("Last 1h:      ", last1h.rows[0].count);
console.log("Last 10 min:  ", last10min.rows[0].count);
console.log("\nTop 5 users by row count:");
perUser.rows.forEach(r => console.log(`  ${r.user_id}: ${r.cnt} rows`));

if (gapResult.rows.length > 1) {
  const gaps = gapResult.rows
    .map(r => parseFloat(r.gap_ms))
    .filter(g => !isNaN(g) && g > 0);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const min = Math.min(...gaps);
  const max = Math.max(...gaps);
  console.log(`\nTop user gap analysis (${gaps.length} intervals):`);
  console.log(`  Avg gap: ${Math.round(avg)}ms  (${(avg / 1000).toFixed(1)}s)`);
  console.log(`  Min gap: ${Math.round(min)}ms`);
  console.log(`  Max gap: ${Math.round(max)}ms`);
  if (avg < 30000) {
    console.log(`  Verdict: CONFIRMED — every-request logging (avg gap < 30s)`);
  } else if (avg < 600000) {
    console.log(`  Verdict: SUSPICIOUS — too frequent for login-only (avg < 10min)`);
  } else {
    console.log(`  Verdict: OK — consistent with login-only logging`);
  }

  console.log("\n  Recent timestamps (top user):");
  gapResult.rows.slice(-10).forEach(r =>
    console.log(`    ${new Date(r.created_at).toISOString()}  gap=${r.gap_ms ? Math.round(r.gap_ms) + 'ms' : 'first'}`)
  );
}

await client.end();
