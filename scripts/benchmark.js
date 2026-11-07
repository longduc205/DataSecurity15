// Compares plain columns with client-side encrypted columns on the same rows and the same connection.
const { connect, encKey, hmacKey, saveEvidence } = require('./lib');
const { keyFromB64, encrypt, decrypt, blindIndex } = require('./crypto');

const WARMUP = 10;
const RUNS = 100;
const ID = 500;
const NID = '999000000500';

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const stats = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return { median: pct(s, 0.5), p95: pct(s, 0.95) };
};

(async () => {
  const ek = keyFromB64(encKey());
  const hk = keyFromB64(hmacKey());
  const db = await connect();
  await db.query(`DROP SCHEMA IF EXISTS bench CASCADE; CREATE SCHEMA bench;
    CREATE TABLE bench.plain (id int PRIMARY KEY, national_id text, diagnosis text);
    CREATE TABLE bench.enc (id int PRIMARY KEY, national_id_enc text, national_id_hmac text, diagnosis_enc text);
    CREATE INDEX ON bench.plain (national_id);
    CREATE INDEX ON bench.enc (national_id_hmac);`);

  for (let id = 1; id <= 200; id++) {
    const nid = '999' + String(id).padStart(9, '0');
    await db.query('INSERT INTO bench.plain VALUES ($1,$2,$3)', [id, nid, 'Hypertension']);
    await db.query('INSERT INTO bench.enc VALUES ($1,$2,$3,$4)',
      [id, encrypt(nid, ek, `b:${id}:n`), blindIndex(nid, hk), encrypt('Hypertension', ek, `b:${id}:d`)]);
  }

  const ops = {
    'Lookup by national ID (plain)': async () => { await db.query('SELECT diagnosis FROM bench.plain WHERE national_id = $1', ['999000000100']); },
    'Lookup by national ID (encrypted)': async () => {
      const r = await db.query('SELECT id, diagnosis_enc FROM bench.enc WHERE national_id_hmac = $1', [blindIndex('999000000100', hk)]);
      decrypt(r.rows[0].diagnosis_enc, ek, `b:${r.rows[0].id}:d`);
    },
    'Read 200 rows (plain)': async () => { await db.query('SELECT * FROM bench.plain'); },
    'Read 200 rows (encrypted)': async () => {
      const r = await db.query('SELECT * FROM bench.enc');
      for (const x of r.rows) { decrypt(x.national_id_enc, ek, `b:${x.id}:n`); decrypt(x.diagnosis_enc, ek, `b:${x.id}:d`); }
    },
    'Insert 1 row (plain)': async () => {
      await db.query('INSERT INTO bench.plain VALUES ($1,$2,$3)', [ID, NID, 'Asthma']);
      await db.query('DELETE FROM bench.plain WHERE id = $1', [ID]);
    },
    'Insert 1 row (encrypted)': async () => {
      await db.query('INSERT INTO bench.enc VALUES ($1,$2,$3,$4)', [ID, encrypt(NID, ek, `b:${ID}:n`), blindIndex(NID, hk), encrypt('Asthma', ek, `b:${ID}:d`)]);
      await db.query('DELETE FROM bench.enc WHERE id = $1', [ID]);
    },
  };

  const names = Object.keys(ops);
  const times = Object.fromEntries(names.map((n) => [n, []]));
  // Interleaved so network drift affects both variants equally.
  for (let i = 0; i < WARMUP + RUNS; i++) {
    for (const n of names) {
      const t0 = process.hrtime.bigint();
      await ops[n]();
      if (i >= WARMUP) times[n].push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
  }

  const cryptoOnly = [];
  for (let i = 0; i < 10000; i++) {
    const t0 = process.hrtime.bigint();
    decrypt(encrypt('Hypertension', ek, 'x'), ek, 'x');
    cryptoOnly.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }

  const lines = [`Runs per operation: ${RUNS} after ${WARMUP} warm-up runs; 200 rows; client in Vietnam, database in ap-southeast-2.`, ''];
  lines.push('Operation | median ms | p95 ms');
  for (const n of names) {
    const s = stats(times[n]);
    lines.push(`${n} | ${s.median.toFixed(2)} | ${s.p95.toFixed(2)}`);
  }
  const c = stats(cryptoOnly);
  lines.push(`AES-256-GCM encrypt+decrypt, local only, 10000 runs | ${c.median.toFixed(4)} | ${c.p95.toFixed(4)}`);
  saveEvidence('09_benchmark.txt', lines.join('\n'));
  console.log(lines.join('\n'));

  await db.query('DROP SCHEMA bench CASCADE');
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
