// Runs every security experiment against the live database and records the real output.
const { REF, api, connect, encKey, saveEvidence, redact } = require('./lib');
const { keyFromB64, decrypt } = require('./crypto');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let section = [];

function record(id, name, passed, detail) {
  results.push({ id, name, passed });
  const line = `[${passed ? 'PASS' : 'FAIL'}] ${id} ${name}\n    ${String(detail).split('\n').join('\n    ')}`;
  section.push(line);
  console.log(redact(line));
}
const flush = (file) => { saveEvidence(file, section.join('\n')); section = []; };

// Runs one statement as one role and checks whether it was allowed.
async function asRole(id, name, role, query, check) {
  const db = await connect(role);
  try {
    const r = await db.query(query);
    const shown = JSON.stringify(r.rows.slice(0, 3));
    record(id, name, check.allowed === true && (!check.verify || check.verify(r)),
      `role=${role}\nsql=${query}\nresult: allowed, ${r.rowCount} rows, sample=${shown}`);
    return r;
  } catch (e) {
    record(id, name, check.allowed === false && /permission denied/.test(e.message),
      `role=${role}\nsql=${query}\nresult: denied, ${e.code} ${e.message}`);
  } finally {
    await db.end();
  }
}

async function testTransport() {
  const db = await connect();
  const tls = db.connection.stream.getProtocol?.();
  record('T1.1', 'Client connection uses TLS 1.2 or newer', /^TLSv1\.[23]$/.test(tls), `negotiated protocol: ${tls}`);
  await db.end();

  try {
    const plain = await connect('postgres', { ssl: false });
    await plain.end();
    record('T1.2', 'Unencrypted connection is rejected', false, 'connection without TLS was ACCEPTED');
  } catch (e) {
    record('T1.2', 'Unencrypted connection is rejected', true, `rejected: ${e.message}`);
  }

  const ssl = await api('GET', '/ssl-enforcement');
  record('T1.3', 'SSL enforcement reported as active', ssl.data?.currentConfig?.database === true, `API: ${JSON.stringify(ssl.data)}`);
}

// Blocks everything except a documentation-only address range, then always restores the original list.
async function testNetworkRestrictions() {
  const before = await api('GET', '/network-restrictions');
  if (!before.ok) {
    record('T1.4', 'IP outside the allowlist is blocked', false, `feature unavailable: HTTP ${before.status} ${JSON.stringify(before.data)}`);
    return;
  }
  const original = before.data.config || { dbAllowedCidrs: ['0.0.0.0/0'], dbAllowedCidrsV6: ['::/0'] };
  try {
    const apply = await api('POST', '/network-restrictions/apply', { dbAllowedCidrs: ['203.0.113.0/24'], dbAllowedCidrsV6: [] });
    if (!apply.ok) {
      record('T1.4', 'IP outside the allowlist is blocked', false, `could not apply: HTTP ${apply.status} ${JSON.stringify(apply.data)}`);
      return;
    }
    let lastError = null;
    for (let i = 0; i < 12 && !lastError; i++) {
      await sleep(10000);
      try { const c = await connect(); await c.end(); } catch (e) { lastError = e; }
    }
    record('T1.4', 'IP outside the allowlist is blocked', !!lastError, lastError ? `blocked: ${lastError.message}` : 'still connected after 2 minutes');
  } finally {
    const restore = await api('POST', '/network-restrictions/apply', original);
    console.log(`Network restrictions restored: HTTP ${restore.status}`);
    for (let i = 0; i < 18; i++) {
      await sleep(10000);
      try { const c = await connect(); await c.end(); break; } catch { /* still propagating */ }
    }
  }
}

async function testDataApi() {
  const keys = await api('GET', '/api-keys');
  const anon = [keys.data].flat().find((k) => k.name === 'anon')?.api_key;
  if (!anon) { record('T2.1', 'Anon key read of clinic schema', false, 'anon key not found'); return; }
  const call = (table, profile) => fetch(`https://${REF}.supabase.co/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, ...(profile && { 'Accept-Profile': profile }) },
  });

  const blocked = await call('patients', 'clinic');
  const blockedBody = await blocked.text();
  record('T2.1', 'Anon key cannot read clinic.patients', blocked.status >= 400, `HTTP ${blocked.status} ${blockedBody}`);

  // Control: proves the API path works, so the block above comes from the configuration.
  const db = await connect();
  try {
    await db.query(`CREATE TABLE public.data_api_canary (note text);
      INSERT INTO public.data_api_canary VALUES ('synthetic canary row');
      GRANT SELECT ON public.data_api_canary TO anon;
      NOTIFY pgrst, 'reload schema';`);
    await sleep(5000);
    const open = await call('data_api_canary');
    const body = await open.text();
    record('T2.2', 'Control: a public table granted to anon without RLS is readable', open.status === 200 && body.includes('canary'), `HTTP ${open.status} ${body}`);
  } finally {
    await db.query(`DROP TABLE IF EXISTS public.data_api_canary; NOTIFY pgrst, 'reload schema';`);
    await db.end();
  }
}

async function testRbac() {
  await asRole('T3.1', 'Receptionist denied on base patient table', 'receptionist', 'SELECT * FROM clinic.patients', { allowed: false });
  await asRole('T3.2', 'Doctor cannot delete patients', 'doctor_a', 'DELETE FROM clinic.patients WHERE patient_id = 2', { allowed: false });
  await asRole('T3.3', 'DBA cannot modify clinical data', 'db_admin', `UPDATE clinic.patients SET phone = 'x'`, { allowed: false });
  await asRole('T3.4', 'Auditor denied on clinical data', 'auditor', 'SELECT * FROM clinic.patients', { allowed: false });
  await asRole('T3.5', 'Auditor can inspect privileges', 'auditor',
    `SELECT r AS role, has_table_privilege(r, 'clinic.patients', 'SELECT') AS can_read_patients FROM unnest(ARRAY['doctor_a','receptionist','db_admin','auditor']) AS r`,
    { allowed: true, verify: (r) => r.rows.find((x) => x.role === 'receptionist').can_read_patients === false });
}

async function testRls() {
  const q = 'SELECT count(*)::int AS visible, min(doctor_id) AS min_doc, max(doctor_id) AS max_doc FROM clinic.patients';
  const own = (id) => (r) => r.rows[0].visible === 100 && r.rows[0].min_doc === id && r.rows[0].max_doc === id;
  await asRole('T4.1', 'Doctor A sees only own 100 patients', 'doctor_a', q, { allowed: true, verify: own(1) });
  await asRole('T4.2', 'Doctor B sees only own 100 patients', 'doctor_b', q, { allowed: true, verify: own(2) });
  // patient 2 belongs to doctor 1 and patient 1 to doctor 2 (doctor_id = id % 2 + 1)
  await asRole('T4.3', 'Doctor A cannot read a patient of doctor B', 'doctor_a', 'SELECT patient_id FROM clinic.patients WHERE patient_id = 1',
    { allowed: true, verify: (r) => r.rowCount === 0 });
  await asRole('T4.4', 'Doctor A update on a patient of doctor B affects 0 rows', 'doctor_a', `UPDATE clinic.patients SET diagnosis_enc = 'tampered' WHERE patient_id = 1`,
    { allowed: true, verify: (r) => r.rowCount === 0 });
  await asRole('T4.5', 'DBA policy shows all 200 rows', 'db_admin', 'SELECT count(*)::int AS visible FROM clinic.patients',
    { allowed: true, verify: (r) => r.rows[0].visible === 200 });

  const db = await connect();
  const { rows } = await db.query(`SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'postgres'`);
  record('T4.6', 'Limitation: platform admin role bypass status recorded', true, `postgres role: ${JSON.stringify(rows[0])}`);
  await db.end();
}

async function testMasking() {
  await asRole('T5.1', 'Receptionist sees masked phone and email', 'receptionist', 'SELECT * FROM clinic.patients_masked ORDER BY patient_id LIMIT 3', {
    allowed: true,
    verify: (r) => r.rows.every((x) => /^\*{7}\d{3}$/.test(x.phone) && /^.\*\*\*@example\.com$/.test(x.email)),
  });
  await asRole('T5.2', 'Filtering on the masked column does not reveal the real value', 'receptionist',
    `SELECT patient_id FROM clinic.patients_masked WHERE phone LIKE '000%'`, { allowed: true, verify: (r) => r.rowCount === 0 });
  await asRole('T5.3', 'Doctor sees the real phone of an own patient', 'doctor_a', 'SELECT patient_id, phone FROM clinic.patients ORDER BY patient_id LIMIT 1', {
    allowed: true,
    verify: (r) => /^000\d{7}$/.test(r.rows[0].phone),
  });
}

async function testEncryption() {
  const ek = keyFromB64(encKey());
  const aad = (id, col) => `patient:${id}:${col}`;

  const dba = await asRole('T6.1', 'DBA reads only ciphertext of sensitive columns', 'db_admin',
    'SELECT patient_id, national_id_enc, diagnosis_enc FROM clinic.patients WHERE patient_id = 2', {
      allowed: true,
      verify: (r) => !/Hypertension|diabetes|Asthma|Migraine|Gastritis|Pneumonia|Anemia|Dermatitis/.test(r.rows[0].diagnosis_enc) && !/^999/.test(r.rows[0].national_id_enc),
    });

  const row = dba.rows[0];
  const diagnosis = decrypt(row.diagnosis_enc, ek, aad(2, 'diagnosis'));
  const id = decrypt(row.national_id_enc, ek, aad(2, 'national_id'));
  record('T6.2', 'Client holding the key recovers the plaintext', /^999\d{9}$/.test(id) && diagnosis.length > 0, `patient 2 diagnosis decrypted: ${diagnosis}; national id format valid: ${/^999\d{9}$/.test(id)}`);

  const buf = Buffer.from(row.diagnosis_enc, 'base64');
  buf[buf.length - 1] ^= 1;
  try {
    decrypt(buf.toString('base64'), ek, aad(2, 'diagnosis'));
    record('T6.3', 'Modified ciphertext is detected', false, 'decryption accepted modified data');
  } catch (e) {
    record('T6.3', 'Modified ciphertext is detected', true, `decryption refused: ${e.message}`);
  }

  try {
    decrypt(row.diagnosis_enc, ek, aad(4, 'diagnosis'));
    record('T6.4', 'Ciphertext copied to another row is detected', false, 'decryption accepted swapped data');
  } catch (e) {
    record('T6.4', 'Ciphertext copied to another row is detected', true, `decryption refused: ${e.message}`);
  }
}

(async () => {
  const stamp = new Date().toISOString();
  await testTransport();
  await testNetworkRestrictions();
  flush('01_transport_network.txt');
  await testDataApi();
  flush('02_data_api.txt');
  await testRbac();
  flush('03_rbac.txt');
  await testRls();
  flush('04_rls.txt');
  await testMasking();
  flush('05_masking.txt');
  await testEncryption();
  flush('06_encryption.txt');

  const failed = results.filter((r) => !r.passed);
  const summary = results.map((r) => `${r.passed ? 'PASS' : 'FAIL'}  ${r.id}  ${r.name}`).join('\n');
  saveEvidence('00_summary.txt', `Run at ${stamp}\n${summary}\n\n${results.length - failed.length}/${results.length} passed`);
  console.log(`\n${results.length - failed.length}/${results.length} passed. Run "npm run logs" now: logs are kept for 1 day only.`);
  process.exitCode = failed.length ? 1 : 0;
})().catch((e) => { console.error(redact(e.stack)); process.exit(1); });
