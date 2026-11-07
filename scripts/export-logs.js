// Free plan logs last 1 day, so export them right after running the experiments.
const { api, saveEvidence, redact } = require('./lib');

const QUERY = `
select toString(timestamp) as ts,
       log_attributes['parsed.user_name'] as db_user,
       log_attributes['parsed.error_severity'] as severity,
       log_attributes['parsed.sql_state_code'] as sql_state,
       log_attributes['parsed.query'] as query,
       event_message
from logs
where source = 'postgres_logs'
  and match(event_message, 'AUDIT:|permission denied')
order by timestamp asc
limit 1000`;

// Every unauthorised attempt from run-tests.js must be traceable to the role that made it.
const EXPECTED = [
  { user: 'receptionist', text: 'SELECT * FROM clinic.patients', kind: 'denied' },
  { user: 'doctor_a', text: 'DELETE FROM clinic.patients', kind: 'denied' },
  { user: 'db_admin', text: 'UPDATE clinic.patients', kind: 'denied' },
  { user: 'auditor', text: 'SELECT * FROM clinic.patients', kind: 'denied' },
  { user: 'doctor_a', text: "UPDATE clinic.patients SET diagnosis_enc = 'tampered'", kind: 'audit' },
  { user: 'receptionist', text: 'clinic.patients_masked', kind: 'audit' },
  { user: 'db_admin', text: 'national_id_enc', kind: 'audit' },
];

(async () => {
  const end = new Date();
  const start = new Date(end.getTime() - 23 * 3600 * 1000);
  const params = new URLSearchParams({ sql: QUERY, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString() });
  const r = await api('GET', `/analytics/endpoints/logs?${params}`);
  if (!r.ok || r.data.error) throw new Error(`Log query failed: HTTP ${r.status} ${JSON.stringify(r.data.error || r.data)}`);

  const rows = r.data.result || [];
  const isDenied = (x) => /permission denied/.test(x.event_message);
  const denied = rows.filter(isDenied);
  const audit = rows.filter((x) => /AUDIT:/.test(x.event_message));

  const trace = EXPECTED.map((e) => {
    const found = rows.some((x) => x.db_user === e.user
      && (e.kind === 'denied' ? isDenied(x) : !isDenied(x))
      && `${x.query} ${x.event_message}`.includes(e.text));
    return `${found ? 'FOUND  ' : 'MISSING'}  ${e.kind.padEnd(6)}  ${e.user.padEnd(12)}  ${e.text}`;
  });

  const body = rows.map((x) => `${x.ts}  user=${x.db_user}  ${x.severity}  ${x.sql_state}\n    ${x.event_message}\n    query: ${x.query}`).join('\n');
  saveEvidence('08_audit_log.txt', `${audit.length} pgaudit entries, ${denied.length} permission-denied entries\n\nTraceability\n${trace.join('\n')}\n\nEntries\n${body}`);
  console.log(redact(`${audit.length} pgaudit entries, ${denied.length} permission-denied entries\n${trace.join('\n')}`));
  process.exitCode = trace.some((t) => t.startsWith('MISSING')) ? 1 : 0;
})().catch((e) => { console.error(redact(e.message)); process.exit(1); });
