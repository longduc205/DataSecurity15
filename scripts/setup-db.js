// Rebuilds the clinic schema from nothing. Only touches the clinic schema and the demo roles.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, ROLES, connect, encKey, hmacKey, rolePassword } = require('./lib');
const { keyFromB64, encrypt, blindIndex } = require('./crypto');

const sql = (f) => fs.readFileSync(path.join(ROOT, 'sql', f), 'utf8');

// Fixed seed so a rebuild produces the same people.
let state = 20261107;
const rand = (n) => { state = (state * 1664525 + 1013904223) >>> 0; return state % n; };
const pick = (a) => a[rand(a.length)];

const FAMILY = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ngo'];
const MIDDLE = ['Van', 'Thi', 'Minh', 'Duc', 'Thu', 'Quang', 'Ngoc', 'Hai'];
const GIVEN = ['An', 'Binh', 'Chi', 'Dung', 'Giang', 'Ha', 'Khanh', 'Lan', 'Mai', 'Nam', 'Phuong', 'Son', 'Trang', 'Yen'];
const DIAGNOSES = ['Hypertension', 'Type 2 diabetes', 'Asthma', 'Migraine', 'Gastritis', 'Pneumonia', 'Anemia', 'Dermatitis'];

// The 000/999 prefixes make these values obviously fake: they cannot be a real phone number or citizen ID.
const digits = (n) => Array.from({ length: n }, () => rand(10)).join('');

function makePatient(id, ek, hk) {
  const nationalId = '999' + digits(9);
  const diagnosis = pick(DIAGNOSES);
  return {
    id,
    name: `${pick(FAMILY)} ${pick(MIDDLE)} ${pick(GIVEN)}`,
    phone: '000' + digits(7),
    email: `patient${id}@example.com`,
    nationalIdEnc: encrypt(nationalId, ek, `patient:${id}:national_id`),
    nationalIdHmac: blindIndex(nationalId, hk),
    diagnosisEnc: encrypt(diagnosis, ek, `patient:${id}:diagnosis`),
    doctorId: (id % 2) + 1,
  };
}

(async () => {
  const ek = keyFromB64(encKey());
  const hk = keyFromB64(hmacKey());
  const db = await connect();

  await db.query('CREATE EXTENSION IF NOT EXISTS pgaudit');
  await db.query(sql('01_schema.sql'));

  for (const role of ROLES) {
    const exists = await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    const verb = exists.rowCount ? 'ALTER' : 'CREATE';
    await db.query(`${verb} ROLE ${role} LOGIN PASSWORD ${db.escapeLiteral(rolePassword(role))}`);
    await db.query(`ALTER ROLE ${role} SET pgaudit.log TO 'read, write, ddl, role'`);
  }

  await db.query(`INSERT INTO clinic.doctors VALUES (1, 'Dr. A (fictional)', 'doctor_a'), (2, 'Dr. B (fictional)', 'doctor_b')`);

  for (let id = 1; id <= 200; id++) {
    const p = makePatient(id, ek, hk);
    await db.query('INSERT INTO clinic.patients VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [p.id, p.name, p.phone, p.email, p.nationalIdEnc, p.nationalIdHmac, p.diagnosisEnc, p.doctorId]);
    await db.query('INSERT INTO clinic.appointments VALUES ($1,$2,$3,$4)',
      [id, id, p.doctorId, new Date(Date.UTC(2026, 10, 1 + (id % 28), 8 + (id % 9))).toISOString()]);
  }

  await db.query(sql('02_access_control.sql'));
  const { rows } = await db.query('SELECT count(*)::int AS patients FROM clinic.patients');
  console.log(`Clinic schema rebuilt: ${rows[0].patients} patients.`);
  await db.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
