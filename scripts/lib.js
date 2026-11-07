const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const ENV = path.join(ROOT, '.env');
const EVIDENCE = path.join(ROOT, 'evidence');
const ROLES = ['doctor_a', 'doctor_b', 'receptionist', 'db_admin', 'auditor'];

process.loadEnvFile(ENV);
for (const k of ['SUPABASE_PROJECT_REF', 'DB_PASSWORD', 'SUPABASE_ACCESS_TOKEN']) {
  if (!process.env[k]) throw new Error(`Missing ${k} in .env`);
}
const REF = process.env.SUPABASE_PROJECT_REF;

// Generated once, kept in .env, so re-running setup does not invalidate anything.
function ensureSecret(name, make) {
  if (!process.env[name]) {
    process.env[name] = make();
    fs.appendFileSync(ENV, `\n${name}=${process.env[name]}`);
  }
  return process.env[name];
}
const key32 = () => crypto.randomBytes(32).toString('base64');
const encKey = () => ensureSecret('ENC_KEY', key32);
const hmacKey = () => ensureSecret('HMAC_KEY', key32);
const rolePassword = (r) => ensureSecret(`PW_${r.toUpperCase()}`, () => crypto.randomBytes(24).toString('hex'));

async function api(method, route, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${route}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, ok: res.ok, data };
}

let poolerHost;
async function getPoolerHost() {
  if (poolerHost) return poolerHost;
  const r = await api('GET', '/config/database/pooler');
  if (!r.ok) throw new Error(`Cannot read pooler config: HTTP ${r.status}`);
  const cfg = [r.data].flat().find((c) => c.database_type === 'PRIMARY') || [r.data].flat()[0];
  poolerHost = cfg.db_host;
  return poolerHost;
}

// Session-mode shared pooler: the direct host is IPv6 only on the Free plan.
async function connect(role = 'postgres', { ssl = { rejectUnauthorized: false } } = {}) {
  const client = new Client({
    host: await getPoolerHost(),
    port: 5432,
    database: 'postgres',
    user: `${role}.${REF}`,
    password: role === 'postgres' ? process.env.DB_PASSWORD : rolePassword(role),
    ssl,
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  return client;
}

// Evidence goes into the report, so scrub anything that identifies the project or a person.
function redact(text) {
  const secrets = [REF, process.env.DB_PASSWORD, process.env.SUPABASE_ACCESS_TOKEN, poolerHost].filter(Boolean);
  let out = String(text);
  for (const s of secrets) out = out.split(s).join('<redacted>');
  return out
    .replace(/\{\s*\d{1,3}(,\s*\d{1,3}){3}\s*\}/g, '<ip>') // the pooler prints IPs as {a, b, c, d}
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
    .replace(/\b[0-9a-f]{0,4}(:[0-9a-f]{0,4}){3,7}\b/gi, (m) => (m.includes('::') || m.split(':').length > 5 ? '<ip>' : m));
}

function saveEvidence(name, text) {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, name), redact(text) + '\n');
}

module.exports = { ROOT, ROLES, REF, api, connect, getPoolerHost, encKey, hmacKey, rolePassword, redact, saveEvidence };
